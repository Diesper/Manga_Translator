'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildDerived,
  parseAuditRegistry,
} = require('../../../scripts/validation/bible-coordination');
const core = require('./audit-core');
const {
  parseLegacyAuditRegistry,
  readStates,
} = require('./audit-protocol');

const repoRoot = path.resolve(__dirname, '../../..');
const bibleRoot = path.join(repoRoot, 'docs', 'biblia');
const auditPath = path.join(bibleRoot, 'AUDITORIA.md');
const statusPath = path.join(bibleRoot, 'STATUS.md');
const checklistPath = path.join(bibleRoot, 'CHECKLIST.md');
const stateRoot = path.join(bibleRoot, '.state');

const BEGIN = '<!-- DISTRIBUTED_AUDIT_PROJECTION:BEGIN -->';
const END = '<!-- DISTRIBUTED_AUDIT_PROJECTION:END -->';

function decisionTimestamp(pipeline) {
  for (const record of [pipeline?.reaudit, pipeline?.adversarial, pipeline?.primary]) {
    if (record?.completed_at_utc) return record.completed_at_utc;
  }
  return null;
}

function projectState(state, pipeline) {
  if (!pipeline || !['APPROVED', 'CHANGES_REQUIRED'].includes(pipeline.decision)) {
    return { changed: false, state };
  }
  const label = '#' + String(state.index).padStart(3, '0');
  if (state.status === 'IN_PROGRESS') {
    return {
      changed: false,
      state,
      blocker: label + ': decisão final não pode sobrescrever edição IN_PROGRESS',
    };
  }
  if (state.status === 'BLOCKED') {
    return {
      changed: false,
      state,
      blocker: label + ': decisão final não pode sobrescrever lifecycle BLOCKED',
    };
  }
  if (state.coordination_status === 'REPAIR_REQUIRED') {
    return {
      changed: false,
      state,
      blocker: label + ': decisão final não pode mascarar coordination_status REPAIR_REQUIRED',
    };
  }
  const openRequests = (state.audit_requests || []).filter((request) => request?.status === 'OPEN');
  if (pipeline.decision === 'APPROVED' && openRequests.length) {
    return {
      changed: false,
      state,
      blocker: label + ': APPROVED não pode materializar COMPLETED com audit_request OPEN=' + openRequests.length,
    };
  }

  const targetStatus = pipeline.decision === 'APPROVED' ? 'COMPLETED' : 'CHANGES_REQUIRED';
  const at = decisionTimestamp(pipeline) || state.updated_at_utc || state.completed_at_utc;
  const next = JSON.parse(JSON.stringify(state));
  const previous = next.status;
  next.status = targetStatus;
  next.agent = null;
  next.coordination_status = 'OK';
  next.updated_at_utc = at || next.updated_at_utc || null;
  next.completed_at_utc = targetStatus === 'COMPLETED' ? (at || next.completed_at_utc || null) : null;

  const signature = {
    type: 'DISTRIBUTED_AUDIT_DECISION',
    source_sha: state.source_sha,
    bible_sha: pipeline.bible_sha || null,
    decision: pipeline.decision,
  };
  next.history = Array.isArray(next.history) ? next.history : [];
  const alreadyRecorded = next.history.some((entry) => (
    entry?.type === signature.type
    && entry?.source_sha === signature.source_sha
    && (entry?.bible_sha || null) === signature.bible_sha
    && entry?.decision === signature.decision
  ));
  if (!alreadyRecorded) {
    next.history.push({
      at_utc: at,
      type: signature.type,
      from_status: previous,
      to_status: targetStatus,
      source_sha: signature.source_sha,
      bible_sha: signature.bible_sha,
      decision: signature.decision,
      primary: pipeline.primary?.verdict || null,
      adversarial: pipeline.adversarial?.verdict || null,
      reaudit: pipeline.reaudit?.verdict || null,
      reason: targetStatus === 'COMPLETED'
        ? 'PRIMARY + ADVERSARIAL (e REAUDIT quando necessária) produziram decisão final APPROVED para source+bible atuais.'
        : 'Pipeline distribuído produziu decisão final CHANGES_REQUIRED para source+bible atuais; exige correção editorial e nova auditoria da revisão corrigida.',
    });
  }

  next.progress_note = targetStatus === 'COMPLETED'
    ? 'Decisão distribuída final APPROVED vinculada a source_sha + bible_sha atuais.'
    : 'Decisão distribuída final CHANGES_REQUIRED; corrigir Bíblia sob reserva editorial e reaudar a nova revisão.';

  const changed = JSON.stringify(next) !== JSON.stringify(state);
  return { changed, state: next };
}

function renderProjectionSection(pipelines) {
  const rows = pipelines
    .filter((pipeline) => pipeline?.hasDistributed)
    .sort((a, b) => a.index - b.index)
    .map((pipeline) => [
      '| ' + String(pipeline.index).padStart(3, '0'),
      pipeline.source_sha || '-',
      pipeline.bible_sha || '-',
      pipeline.decision,
      pipeline.primary?.verdict || '-',
      pipeline.adversarial?.verdict || '-',
      pipeline.reaudit?.verdict || '-',
      '|',
    ].join(' | '));

  return [
    BEGIN,
    '## Projeção do protocolo distribuído',
    '',
    '> View de compatibilidade. A fonte canônica são os resultados append-only em docs/biblia/.coordination/audit-results/; esta seção pode ser regenerada idempotentemente.',
    '',
    '| # | source SHA | Bible SHA | decisão | PRIMARY | ADVERSARIAL | REAUDIT |',
    '|---:|---|---|---|---|---|---|',
    ...rows,
    END,
  ].join('\n');
}

function replaceProjectionSection(source, section) {
  const start = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (start >= 0 && end >= start) {
    return source.slice(0, start).replace(/\s*$/, '\n\n')
      + section
      + source.slice(end + END.length).replace(/^\s*/, '\n');
  }
  return source.replace(/\s*$/, '') + '\n\n' + section + '\n';
}

function buildReconciliation() {
  const states = readStates();
  const baseline = core.loadBibleBaseline(repoRoot);
  const legacySource = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8') : '# Auditoria\n';
  const legacyAudits = parseLegacyAuditRegistry(legacySource);
  const loaded = core.loadAuditResults(repoRoot, states);
  const evaluation = core.evaluateAuditPipelines(states, loaded.records, legacyAudits, {
    root: repoRoot,
    baseline,
  });

  const blockers = [...loaded.problems, ...evaluation.problems];
  const projectedStates = [];
  for (const state of states) {
    const projection = projectState(state, evaluation.byIndex.get(state.index));
    if (projection.blocker) blockers.push(projection.blocker);
    projectedStates.push(projection.state);
  }

  const section = renderProjectionSection([...evaluation.byIndex.values()]);
  const auditoria = replaceProjectionSection(legacySource, section);

  const auditsForProjection = parseAuditRegistry(auditoria);
  const derived = buildDerived(projectedStates, auditsForProjection, 'distributed-reconciliation', evaluation.byIndex);

  return {
    blockers: [...new Set(blockers)],
    states,
    projectedStates,
    pipelines: [...evaluation.byIndex.values()],
    auditoria,
    status: derived.status,
    checklist: derived.checklist,
  };
}

function normalized(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function statePath(index) {
  return path.join(stateRoot, String(index).padStart(3, '0') + '.json');
}

function diffSummary(plan) {
  const changedStates = [];
  for (let i = 0; i < plan.states.length; i += 1) {
    if (JSON.stringify(plan.states[i]) !== JSON.stringify(plan.projectedStates[i])) {
      changedStates.push(plan.states[i].index);
    }
  }
  const stale = [];
  const auditCurrent = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8') : '';
  const statusCurrent = fs.existsSync(statusPath) ? fs.readFileSync(statusPath, 'utf8') : '';
  const checklistCurrent = fs.existsSync(checklistPath) ? fs.readFileSync(checklistPath, 'utf8') : '';
  if (normalized(auditCurrent) !== normalized(plan.auditoria)) stale.push('AUDITORIA.md');
  if (normalized(statusCurrent) !== normalized(plan.status)) stale.push('STATUS.md');
  if (normalized(checklistCurrent) !== normalized(plan.checklist)) stale.push('CHECKLIST.md');
  return { changedStates, stale };
}

function writePlan(plan) {
  for (let i = 0; i < plan.states.length; i += 1) {
    if (JSON.stringify(plan.states[i]) === JSON.stringify(plan.projectedStates[i])) continue;
    fs.writeFileSync(statePath(plan.states[i].index), JSON.stringify(plan.projectedStates[i], null, 2) + '\n');
  }
  fs.writeFileSync(auditPath, plan.auditoria);
  fs.writeFileSync(statusPath, plan.status);
  fs.writeFileSync(checklistPath, plan.checklist);
}

function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  const check = argv.includes('--check') || !write;
  const plan = buildReconciliation();
  const summary = diffSummary(plan);

  if (plan.blockers.length) {
    console.error('Bible distributed reconciliation: INVALID INPUT');
    for (const blocker of plan.blockers) console.error('- ' + blocker);
    process.exit(1);
  }

  console.log('Bible distributed reconciliation: states=' + summary.changedStates.length
    + ' projections=' + summary.stale.join(','));

  if (write) {
    writePlan(plan);
    const after = diffSummary(buildReconciliation());
    if (after.changedStates.length || after.stale.length) {
      console.error('Reconciliation write is not idempotent: ' + JSON.stringify(after));
      process.exit(1);
    }
    console.log('Bible distributed reconciliation: WRITE SUCCESS');
    return;
  }

  if (check && (summary.changedStates.length || summary.stale.length)) {
    console.error('Bible distributed reconciliation: STALE');
    if (summary.changedStates.length) console.error('- states: ' + summary.changedStates.map((i) => String(i).padStart(3, '0')).join(', '));
    if (summary.stale.length) console.error('- projections: ' + summary.stale.join(', '));
    process.exit(1);
  }

  console.log('Bible distributed reconciliation: CLEAN');
}

if (require.main === module) main();

module.exports = {
  decisionTimestamp,
  projectState,
  renderProjectionSection,
  replaceProjectionSection,
  buildReconciliation,
  diffSummary,
  writePlan,
};

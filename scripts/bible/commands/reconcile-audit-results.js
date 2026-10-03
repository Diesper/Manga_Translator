'use strict';
const completion = require('../core/completion');

const fs = require('fs');
const storage = require('../storage/files');
const completedAccess = require('../core/completed-access');
const humanGate = require('../core/human-gate');
const path = require('path');
const {
  buildDerived,
  parseAuditRegistry,
} = require('../../validation/bible-coordination');
const core = require('../core/audit-core');
const lifecycleCore = require('../core/lifecycle-core');
const unitTransition = require('./unit-transition');
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

function projectState(state, pipeline, approvals = []) {
  const atUtc = decisionTimestamp(pipeline) || state.updated_at_utc;
  const completedOrder = completedAccess.orderFor(state, approvals, atUtc);
  if (state.completion?.human_order_required_since_utc && !completedOrder) return { changed: false, state };
  if (!pipeline || !['APPROVED', 'CHANGES_REQUIRED'].includes(pipeline.decision)) {
    return { changed: false, state };
  }
  const label = '#' + String(state.index).padStart(3, '0');
  const lifecycle = lifecycleCore.lifecycleSnapshot(state);
  if (lifecycle.human_locked) {
    return {
      changed: false,
      state,
      blocker: label + ': HUMAN_LOCKED não aceita reconcile automático',
    };
  }
  if (Array.isArray(pipeline.problems) && pipeline.problems.length) {
    return {
      changed: false,
      state,
      blocker: label + ': decisão distribuída inválida não pode ser projetada: ' + pipeline.problems.join('; '),
    };
  }
  if (completion.reviewStatus(state) === 'IN_PROGRESS') {
    return {
      changed: false,
      state,
      blocker: label + ': decisão final não pode sobrescrever edição IN_PROGRESS',
    };
  }
  if (completion.reviewStatus(state) === 'BLOCKED') {
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

  const at = decisionTimestamp(pipeline) || state.updated_at_utc || state.completed_at_utc;
  try {
    return unitTransition.projectAuditDecision(state, pipeline, { at_utc: at, completedOrder });
  } catch (error) {
    return {
      changed: false,
      state,
      blocker: label + ': transition authority rejeitou reconcile: ' + error.message,
    };
  }
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
  const approvals = humanGate.loadHumanApprovals(repoRoot);
  blockers.push(...approvals.problems);
  const projectedStates = [];
  for (const state of states) {
    const projection = projectState(state, evaluation.byIndex.get(state.index), approvals.approvals);
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
    const before = plan.states[i];
    const file = statePath(before.index);
    storage.withUnitLock(repoRoot, before.index, () => {
      const raw = fs.readFileSync(file, 'utf8');
      if (JSON.stringify(JSON.parse(raw)) !== JSON.stringify(before)) throw new Error('STATE_CAS_CONFLICT');
      storage.transaction(repoRoot, before.index, { action: 'RECONCILE' }, () =>
        storage.atomicWrite(file, JSON.stringify(plan.projectedStates[i], null, 2) + '\n', { expected: raw }));
    });
  }
  storage.atomicWrite(auditPath, plan.auditoria);
  storage.atomicWrite(statusPath, plan.status);
  storage.atomicWrite(checklistPath, plan.checklist);
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

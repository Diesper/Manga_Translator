'use strict';

const fs = require('fs');
const path = require('path');
const life = require('./lifecycle-core');

function humanReviewDiagnostics(state, cycles) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const requests = Array.isArray(state?.audit_requests) ? state.audit_requests : [];

  const decisions = history
    .filter((entry) => entry?.type === 'DISTRIBUTED_AUDIT_DECISION')
    .map((entry) => ({
      at_utc: entry.at_utc || null,
      decision: entry.decision || null,
      primary: entry.primary || null,
      adversarial: entry.adversarial || null,
      reaudit: entry.reaudit || null,
      revision_id: entry.revision_id || null,
      audit_epoch: entry.audit_epoch ?? null,
      handoff_id: entry.handoff_id || null,
    }));

  const failures = history
    .filter((entry) => (
      entry?.type === life.SAFE_ABORT_EVENT
      || /(?:FAIL|ABORT|REJECT)/i.test(String(entry?.type || ''))
      || entry?.to_status === 'BLOCKED'
      || (entry?.type === 'DISTRIBUTED_AUDIT_DECISION' && entry?.decision === 'CHANGES_REQUIRED')
    ))
    .map((entry) => ({
      at_utc: entry.at_utc || null,
      type: entry.type || null,
      decision: entry.decision || null,
      reason: entry.reason || null,
    }));

  const regressions = requests.filter((request) => {
    const haystack = [
      request?.id,
      request?.type,
      request?.title,
      request?.finding,
      request?.evidence,
      request?.reason,
    ].filter(Boolean).join(' ');
    return /regress/i.test(haystack);
  });

  const rootCauses = [];
  for (const entry of history) {
    const review = entry?.root_cause_review;
    if (!review || typeof review !== 'object') continue;
    rootCauses.push({
      at_utc: entry.at_utc || null,
      actor: entry.agent || entry.actor || null,
      categories: Array.isArray(review.categories) ? review.categories : [],
      related_cycles: Array.isArray(review.related_cycles) ? review.related_cycles : [],
      evidence: review.evidence || '',
      why_previous_failed: review.why_previous_failed || '',
      strategy: review.strategy || '',
    });
  }

  const changed = new Map();
  function add(file) {
    if (!file) return;
    changed.set(file, (changed.get(file) || 0) + 1);
  }
  let previous = null;
  for (const cycle of cycles || []) {
    if (previous) {
      if ((cycle.source_sha || null) !== (previous.source_sha || null)) add(state.file);
      if ((cycle.bible_sha || null) !== (previous.bible_sha || null)) add(state.bible);
      if ((cycle.production_sha || null) !== (previous.production_sha || null)) {
        const production = Array.isArray(state.production_files) && state.production_files.length
          ? state.production_files
          : ['<production bundle>'];
        for (const file of production) add(file);
      }
    }
    previous = cycle;
  }
  const filesMostChanged = [...changed.entries()]
    .map(([file, changes]) => ({ file, changes }))
    .sort((a, b) => b.changes - a.changes || a.file.localeCompare(b.file));

  const agents = new Set();
  for (const cycle of cycles || []) if (cycle.corrector) agents.add(cycle.corrector);
  return {
    decisions,
    failures,
    regressions,
    possible_root_causes: rootCauses,
    files_most_changed: filesMostChanged,
    agents_involved: [...agents].sort(),
  };
}
function buildHumanReviewPackage(state, snapshot, options = {}) {
  if (!snapshot?.human_locked) throw new Error('HUMAN_REVIEW_REQUIRES_HUMAN_LOCK');
  const history = Array.isArray(state?.history) ? state.history : [];
  const handoffs = life.handoffEvents(state);
  const cycles = handoffs.map((handoff, offset) => {
    let start = null;
    const previousPosition = offset > 0 ? handoffs[offset - 1].position : -1;
    for (let i = handoff.position - 1; i > previousPosition; i -= 1) {
      if (history[i]?.to_status === 'IN_PROGRESS') {
        start = history[i];
        break;
      }
    }
    return {
      cycle: offset + 1,
      corrector: start?.agent || handoff.entry?.agent || null,
      started_at_utc: start?.at_utc || null,
      handoff_at_utc: handoff.entry?.at_utc || null,
      source_sha: handoff.entry?.source_sha || null,
      bible_sha: handoff.entry?.bible_sha || null,
      production_sha: handoff.entry?.production_sha || null,
      reason: start?.reason || handoff.entry?.reason || null,
    };
  });
  const requestList = Array.isArray(state?.audit_requests) ? state.audit_requests : [];
  const typeCounts = new Map();
  for (const request of requestList) {
    const key = request?.type || 'UNKNOWN';
    typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
  }
  const repeatedPatterns = [...typeCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a,b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  const diagnostics = humanReviewDiagnostics(state, cycles);

  return {
    schema_version: 1,
    index: state.index,
    status: 'HUMAN_LOCKED',
    generated_at_utc: options.generated_at_utc || null,
    correction_cycle: snapshot.correction_cycle,
    lifetime_correction_cycles: snapshot.lifetime_correction_cycles,
    first_cycle_started_at: cycles[0]?.started_at_utc || null,
    human_lock_at: handoffs[handoffs.length - 1]?.entry?.at_utc || null,
    current_revision: {
      production_sha: snapshot.production_sha,
      test_sha: snapshot.test_sha,
      bible_sha: snapshot.bible_sha,
      revision_id: snapshot.revision_id,
      audit_epoch: snapshot.audit_epoch,
      handoff_id: snapshot.handoff_id,
    },
    cycles,
    repeated_patterns: repeatedPatterns,
    open_findings: requestList.filter((item) => item?.status === 'OPEN'),
    superseded_findings: requestList.filter((item) => item?.status === 'SUPERSEDED'),
    unverified_findings: (options.unverified_findings || []).filter((item) => Number(item.index) === Number(state.index)),
    recent_correctors: snapshot.recent_correctors,
    decisions: diagnostics.decisions,
    failures: diagnostics.failures,
    regressions: diagnostics.regressions,
    possible_root_causes: diagnostics.possible_root_causes,
    files_most_changed: diagnostics.files_most_changed,
    agents_involved: diagnostics.agents_involved,
    reason_for_human_escalation: '7 or more correction cycles reached; automatic mutation is quarantined.',
  };
}

function renderHumanSummary(pkg) {
  return [
    '# HUMAN REVIEW — unidade #' + String(pkg.index).padStart(3, '0'),
    '',
    '- status: ' + pkg.status,
    '- correction cycles: ' + pkg.correction_cycle,
    '- lifetime cycles: ' + pkg.lifetime_correction_cycles,
    '- audit epoch: ' + pkg.current_revision.audit_epoch,
    '- handoff: ' + (pkg.current_revision.handoff_id || '-'),
    '- revision: ' + pkg.current_revision.revision_id,
    '- production SHA: ' + (pkg.current_revision.production_sha || '-'),
    '- test SHA: ' + (pkg.current_revision.test_sha || '-'),
    '- Bible SHA: ' + (pkg.current_revision.bible_sha || '-'),
    '',
    '## Ciclos',
    ...pkg.cycles.map((cycle) => (
      '- cycle ' + cycle.cycle
      + ': corrector=' + (cycle.corrector || '-')
      + ' start=' + (cycle.started_at_utc || '-')
      + ' handoff=' + (cycle.handoff_at_utc || '-')
    )),
    '',
    '## Padrões recorrentes',
    ...(pkg.repeated_patterns.length
      ? pkg.repeated_patterns.map((item) => '- ' + item.type + ': ' + item.count)
      : ['- nenhum padrão repetido derivável dos audit_requests']),
    '',
    '## Decisões',
    ...(pkg.decisions.length
      ? pkg.decisions.map((item) => '- ' + (item.at_utc || '-') + ': ' + (item.decision || '-')
        + ' [P=' + (item.primary || '-') + ', A=' + (item.adversarial || '-') + ', R=' + (item.reaudit || '-') + ']')
      : ['- nenhuma decisão distribuída registrada']),
    '',
    '## Falhas / aborts',
    ...(pkg.failures.length
      ? pkg.failures.map((item) => '- ' + (item.at_utc || '-') + ': ' + (item.type || '-') + ' ' + (item.decision || ''))
      : ['- nenhuma falha/abort derivável do histórico']),
    '',
    '## Regressões',
    ...(pkg.regressions.length
      ? pkg.regressions.map((item) => '- ' + (item.id || item.type || 'regressão'))
      : ['- nenhuma regressão explicitamente registrada']),
    '',
    '## Arquivos mais alterados',
    ...(pkg.files_most_changed.length
      ? pkg.files_most_changed.map((item) => '- ' + item.file + ': ' + item.changes + ' mudança(s) entre ciclos')
      : ['- sem mudança de SHA entre handoffs suficiente para ordenar arquivos']),
    '',
    '## Possíveis causas-raiz',
    ...(pkg.possible_root_causes.length
      ? pkg.possible_root_causes.map((item) => '- ' + (item.categories.join(', ') || 'OTHER')
        + ' cycles=' + (item.related_cycles?.join(',') || '-')
        + ': ' + (item.evidence || '-')
        + ' | por que antes falhou=' + (item.why_previous_failed || '-')
        + ' | estratégia=' + (item.strategy || '-'))
      : ['- nenhuma ROOT_CAUSE_REVIEW registrada']),
    '',
    '## Pendências',
    '- open findings: ' + pkg.open_findings.length,
    '- unverified findings: ' + pkg.unverified_findings.length,
    '- superseded findings: ' + pkg.superseded_findings.length,
    '',
    '> Nenhum agente automático pode modificar esta unidade sem aprovação humana válida.',
    '',
  ].join('\n');
}

function writeHumanReview(root, state, snapshot, options = {}) {
  const pkg = buildHumanReviewPackage(state, snapshot, options);
  const dir = path.join(root, 'docs', 'biblia', '.coordination', 'human-review');
  fs.mkdirSync(dir, { recursive: true });
  const base = String(state.index).padStart(3, '0');
  const jsonPath = path.join(dir, base + '.json');
  const mdPath = path.join(dir, base + '.md');
  fs.writeFileSync(jsonPath, JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(mdPath, renderHumanSummary(pkg));
  return { jsonPath, mdPath, package: pkg };
}

module.exports = {
  humanReviewDiagnostics,
  buildHumanReviewPackage,
  renderHumanSummary,
  writeHumanReview,
};

'use strict';

const {
  resolveAuditPipeline,
  evaluateAuditPipelines,
  pipelineMergeBlockers,
} = require('./bible-audit-pipeline');

function state(index = 1) {
  return {
    index,
    file: 'fixture/file-' + String(index).padStart(3, '0') + '.js',
    bible: 'docs/biblia/fixture/file-' + String(index).padStart(3, '0') + '.js/Bíblia.md',
    source_sha: String(index).padStart(40, '0'),
    status: 'COMPLETED',
  };
}

function result(s, phase, verdict, auditor, at) {
  return {
    index: s.index,
    phase,
    auditor,
    file: s.file,
    bible: s.bible,
    source_sha: s.source_sha,
    verdict,
    findings: [],
    completed_at_utc: at,
    completed_at_ms: Date.parse(at),
    path: 'fixture/' + phase + '/' + auditor + '.json',
    legacy: false,
  };
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) throw new Error(name + ': expected ' + expected + ', got ' + actual);
  process.stdout.write('PASS ' + name + ' -> ' + actual + '\n');
}

const s = state(1);

let p = resolveAuditPipeline(s, [
  result(s, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:00:00Z'),
]);
assertEqual('PRIMARY sozinho aguarda adversarial', p.decision, 'WAITING_ADVERSARIAL');

p = resolveAuditPipeline(s, [
  result(s, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:00:00Z'),
  result(s, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-2', '2026-10-01T12:10:00Z'),
]);
assertEqual('PRIMARY + ADVERSARIAL concordantes aprovam', p.decision, 'APPROVED');

p = resolveAuditPipeline(s, [
  result(s, 'PRIMARY', 'CHANGES_REQUIRED', 'AUDITOR-1', '2026-10-01T12:00:00Z'),
  result(s, 'ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', '2026-10-01T12:10:00Z'),
]);
assertEqual('duas auditorias concordantes em erro exigem correção', p.decision, 'CHANGES_REQUIRED');

p = resolveAuditPipeline(s, [
  result(s, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:00:00Z'),
  result(s, 'ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', '2026-10-01T12:10:00Z'),
]);
assertEqual('divergência exige reauditoria', p.decision, 'REAUDIT_REQUIRED');

p = resolveAuditPipeline(s, [
  result(s, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:00:00Z'),
  result(s, 'ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', '2026-10-01T12:10:00Z'),
  result(s, 'REAUDIT', 'APPROVED', 'AUDITOR-3', '2026-10-01T12:20:00Z'),
]);
assertEqual('reauditoria resolve divergência', p.decision, 'APPROVED');

p = resolveAuditPipeline(s, [
  result(s, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:00:00Z'),
  result(s, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:10:00Z'),
]);
if (!p.problems.some((item) => item.includes('auditores diferentes'))) {
  throw new Error('mesmo auditor em PRIMARY/ADVERSARIAL deveria falhar');
}
process.stdout.write('PASS independência PRIMARY/ADVERSARIAL\n');

const legacy = new Map([[1, {
  index: 1,
  file: s.file,
  sourceSha: s.source_sha,
  result: 'APPROVED',
}]]);
p = resolveAuditPipeline(s, [], legacy);
assertEqual('aprovação legada conta apenas como PRIMARY', p.decision, 'WAITING_ADVERSARIAL');

const evaluation = evaluateAuditPipelines([s], [], legacy);
const blockers = pipelineMergeBlockers([s], evaluation);
if (!blockers.some((item) => item.includes('adversarial obrigatória pendente=1'))) {
  throw new Error('merge readiness deveria bloquear sem auditoria adversarial: ' + JSON.stringify(blockers));
}
process.stdout.write('PASS adversarial obrigatória no merge readiness\n');

process.stdout.write('Bible audit pipeline self-test: SUCCESS\n');

'use strict';

const {
  resolveAuditPipeline,
  evaluateAuditPipelines,
  pipelineMergeBlockers,
  postHandoffCorrectionProblems,
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
    bible_sha: s.bible_sha || null,
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

p = resolveAuditPipeline(s, [
  result(s, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:00:00Z'),
  result(s, 'ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', '2026-10-01T12:10:00Z'),
  result(s, 'REAUDIT', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:20:00Z'),
]);
if (!p.problems.some((item) => item.includes('REAUDIT deve ser independente'))) {
  throw new Error('re-auditor igual ao PRIMARY deveria falhar');
}
process.stdout.write('PASS independência do REAUDIT\n');

const versioned = { ...s, bible_sha: 'b'.repeat(40) };
const baseline = {
  schema_version: 1,
  bibles: {
    '001': { bible: versioned.bible, bible_sha: versioned.bible_sha },
  },
};
const legacyV1Primary = { ...result(versioned, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-01T12:00:00Z'), bible_sha: null };
const legacyV1Adversarial = { ...result(versioned, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-2', '2026-10-01T12:10:00Z'), bible_sha: null };
p = resolveAuditPipeline(versioned, [legacyV1Primary, legacyV1Adversarial], new Map(), { baseline });
assertEqual('schema v1 continua válido na Bible baseline', p.decision, 'APPROVED');

const changedBible = { ...versioned, bible_sha: 'c'.repeat(40) };
p = resolveAuditPipeline(changedBible, [legacyV1Primary, legacyV1Adversarial], new Map(), { baseline });
assertEqual('editar apenas a Bíblia invalida auditorias v1 antigas', p.decision, 'WAITING_PRIMARY');

const currentPrimary = { ...result(changedBible, 'PRIMARY', 'APPROVED', 'AUDITOR-3', '2026-10-01T13:00:00Z'), bible_sha: changedBible.bible_sha };
const currentAdversarial = { ...result(changedBible, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-4', '2026-10-01T13:10:00Z'), bible_sha: changedBible.bible_sha };
p = resolveAuditPipeline(changedBible, [legacyV1Primary, legacyV1Adversarial, currentPrimary, currentAdversarial], new Map(), { baseline });
assertEqual('schema v2 revalida a nova revisão da Bíblia', p.decision, 'APPROVED');

const protectedRevision = {
  ...state(2),
  bible_sha: 'd'.repeat(40),
  status: 'IN_PROGRESS',
  history: [
    {
      at_utc: '2026-10-02T06:00:00Z',
      type: 'CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT',
      source_sha: String(2).padStart(40, '0'),
      bible_sha: 'd'.repeat(40),
    },
    {
      at_utc: '2026-10-02T06:05:00Z',
      type: 'CORRECTION_STARTED',
      from_status: 'READY_FOR_AUDIT',
      to_status: 'IN_PROGRESS',
      source_sha: String(2).padStart(40, '0'),
      bible_sha: 'd'.repeat(40),
    },
  ],
};

let handoffProblems = postHandoffCorrectionProblems([protectedRevision], []);
if (!handoffProblems.some((item) => item.includes('handoff protegido reaberto'))) {
  throw new Error('handoff protegido deveria rejeitar reabertura sem auditoria: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS handoff bloqueia correção espontânea\n');

const onlyPrimary = [
  result(protectedRevision, 'PRIMARY', 'CHANGES_REQUIRED', 'AUDITOR-1', '2026-10-02T06:02:00Z'),
];
handoffProblems = postHandoffCorrectionProblems([protectedRevision], onlyPrimary);
if (!handoffProblems.some((item) => item.includes('decision=WAITING_ADVERSARIAL'))) {
  throw new Error('PRIMARY isolada não deveria liberar correção: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS PRIMARY isolada não libera correção pós-handoff\n');

const finalChangesRequired = [
  result(protectedRevision, 'PRIMARY', 'CHANGES_REQUIRED', 'AUDITOR-1', '2026-10-02T06:02:00Z'),
  result(protectedRevision, 'ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', '2026-10-02T06:03:00Z'),
];
handoffProblems = postHandoffCorrectionProblems([protectedRevision], finalChangesRequired);
if (handoffProblems.length !== 0) {
  throw new Error('decisão final CHANGES_REQUIRED deveria liberar correção: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS decisão final CHANGES_REQUIRED libera correção pós-handoff\n');

const finalApproved = [
  result(protectedRevision, 'PRIMARY', 'APPROVED', 'AUDITOR-1', '2026-10-02T06:02:00Z'),
  result(protectedRevision, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-2', '2026-10-02T06:03:00Z'),
];
handoffProblems = postHandoffCorrectionProblems([protectedRevision], finalApproved);
if (!handoffProblems.some((item) => item.includes('decision=APPROVED'))) {
  throw new Error('aprovação final não deveria permitir reabertura editorial: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS aprovação final não permite reabrir após handoff\n');

process.stdout.write('Bible audit pipeline self-test: SUCCESS\n');

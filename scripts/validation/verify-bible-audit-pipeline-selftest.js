'use strict';

const lifecycleCore = require('../bible/core/lifecycle-core');

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

const fencedState = {
  ...state(6),
  bible_sha: '6'.repeat(40),
  status: 'READY_FOR_AUDIT',
  history: [{
    at_utc: '2026-10-02T06:00:00Z',
    type: 'CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT',
    source_sha: String(6).padStart(40, '0'),
    bible_sha: '6'.repeat(40),
  }],
};
const stalePrimaryAfterHandoff = result(fencedState, 'PRIMARY', 'APPROVED', 'AUDITOR-OLD-1', '2026-10-02T05:50:00Z');
const staleAdversarialAfterHandoff = result(fencedState, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-OLD-2', '2026-10-02T05:55:00Z');
p = resolveAuditPipeline(fencedState, [stalePrimaryAfterHandoff, staleAdversarialAfterHandoff], new Map());
assertEqual('handoff ignora resultados anteriores mesmo no mesmo binding', p.decision, 'WAITING_PRIMARY');
if (p.handoff_after_utc !== '2026-10-02T06:00:00Z') {
  throw new Error('pipeline deveria expor fence do handoff: ' + JSON.stringify(p));
}
process.stdout.write('PASS pipeline expõe fence temporal do handoff\n');

const freshPrimaryAfterHandoff = result(fencedState, 'PRIMARY', 'APPROVED', 'AUDITOR-NEW-1', '2026-10-02T06:01:00Z');
p = resolveAuditPipeline(fencedState, [
  stalePrimaryAfterHandoff,
  staleAdversarialAfterHandoff,
  freshPrimaryAfterHandoff,
], new Map());
assertEqual('PRIMARY nova após handoff ainda exige ADVERSARIAL nova', p.decision, 'WAITING_ADVERSARIAL');

const freshAdversarialAfterHandoff = result(fencedState, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-NEW-2', '2026-10-02T06:02:00Z');
p = resolveAuditPipeline(fencedState, [
  stalePrimaryAfterHandoff,
  staleAdversarialAfterHandoff,
  freshPrimaryAfterHandoff,
  freshAdversarialAfterHandoff,
], new Map());
assertEqual('novo par após handoff pode aprovar', p.decision, 'APPROVED');

const fencedLegacy = new Map([[6, {
  index: 6,
  file: fencedState.file,
  sourceSha: fencedState.source_sha,
  result: 'APPROVED',
}]]);
p = resolveAuditPipeline(fencedState, [], fencedLegacy);
assertEqual('handoff também invalida PRIMARY legado pré-handoff', p.decision, 'WAITING_PRIMARY');

const lifecycleV3State = {
  ...state(7),
  bible_sha: '7'.repeat(40),
  status: 'READY_FOR_AUDIT',
  history: [{
    at_utc: '2026-10-02T07:00:00Z',
    type: lifecycleCore.HANDOFF_EVENT,
    source_sha: String(7).padStart(40, '0'),
    bible_sha: '7'.repeat(40),
    production_sha: 'c'.repeat(40),
    agent: 'CORRETOR-V3',
  }],
};
const lifecycleV3Snapshot = lifecycleCore.lifecycleSnapshot(lifecycleV3State);
const v2AfterLifecycleHandoff = result(
  lifecycleV3State,
  'PRIMARY',
  'APPROVED',
  'AUDITOR-V2',
  '2026-10-02T07:01:00Z'
);
p = resolveAuditPipeline(lifecycleV3State, [v2AfterLifecycleHandoff], new Map());
assertEqual('handoff novo não aceita auditoria v2', p.decision, 'WAITING_PRIMARY');
if (!p.audit_schema_v3_required) throw new Error('handoff pós-policy deveria exigir schema v3');

function resultV3(s, phase, verdict, auditor, at) {
  const snapshot = lifecycleCore.lifecycleSnapshot(s);
  return {
    ...result(s, phase, verdict, auditor, at),
    schema_version: 3,
    production_sha: snapshot.production_sha,
    test_sha: snapshot.test_sha,
    bible_sha: snapshot.bible_sha,
    audit_epoch: snapshot.audit_epoch,
    handoff_id: snapshot.handoff_id,
    revision_id: snapshot.revision_id,
  };
}

const refreshedAuditState = {
  ...state(8),
  source_sha: '8'.repeat(40),
  bible_sha: 'a'.repeat(40),
  test_sha: '8'.repeat(40),
  production_sha: null,
  status: 'READY_FOR_AUDIT',
  history: [{
    at_utc: '2026-10-02T07:30:00Z',
    type: lifecycleCore.REVISION_REFRESH_EVENT,
    from_status: 'COMPLETED',
    to_status: 'READY_FOR_AUDIT',
    source_sha: '8'.repeat(40),
    test_sha: '8'.repeat(40),
    bible_sha: 'a'.repeat(40),
    production_sha: null,
    actor: 'MAINTAINER',
  }],
};
const staleV2BeforeRefresh = result(
  refreshedAuditState,
  'PRIMARY',
  'APPROVED',
  'AUDITOR-PRE-REFRESH',
  '2026-10-02T07:29:00Z'
);
p = resolveAuditPipeline(refreshedAuditState, [staleV2BeforeRefresh], new Map());
assertEqual('revision refresh creates a new lifecycle audit fence', p.decision, 'WAITING_PRIMARY');
if (lifecycleCore.lifecycleSnapshot(refreshedAuditState).correction_cycle !== 0) {
  throw new Error('revision refresh must not count as correction cycle');
}
process.stdout.write('PASS revision refresh does not escalate correction cycle\n');

const v3Primary = resultV3(
  lifecycleV3State,
  'PRIMARY',
  'APPROVED',
  'AUDITOR-V3-1',
  '2026-10-02T07:02:00Z'
);
p = resolveAuditPipeline(lifecycleV3State, [v3Primary], new Map());
assertEqual('schema v3 PRIMARY atual aguarda adversarial', p.decision, 'WAITING_ADVERSARIAL');

const wrongHandoff = {
  ...resultV3(lifecycleV3State, 'ADVERSARIAL', 'APPROVED', 'AUDITOR-V3-WRONG', '2026-10-02T07:03:00Z'),
  handoff_id: lifecycleV3Snapshot.handoff_id + '-stale',
};
p = resolveAuditPipeline(lifecycleV3State, [v3Primary, wrongHandoff], new Map());
assertEqual('schema v3 de outro handoff é ignorado', p.decision, 'WAITING_ADVERSARIAL');

const v3Adversarial = resultV3(
  lifecycleV3State,
  'ADVERSARIAL',
  'APPROVED',
  'AUDITOR-V3-2',
  '2026-10-02T07:04:00Z'
);
p = resolveAuditPipeline(lifecycleV3State, [v3Primary, v3Adversarial], new Map());
assertEqual('schema v3 vincula auditoria a epoch + handoff + revision', p.decision, 'APPROVED');
if (p.audit_epoch !== lifecycleV3Snapshot.audit_epoch
  || p.handoff_id !== lifecycleV3Snapshot.handoff_id
  || p.revision_id !== lifecycleV3Snapshot.revision_id) {
  throw new Error('pipeline não expôs identidade lifecycle atual: ' + JSON.stringify(p));
}
process.stdout.write('PASS schema v3 impede reutilização entre handoffs/revisões\n');

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

const divergentBinding = {
  ...protectedRevision,
  history: protectedRevision.history.map((entry, index) => (
    index === 1 ? { ...entry, bible_sha: 'e'.repeat(40) } : entry
  )),
};
handoffProblems = postHandoffCorrectionProblems([divergentBinding], []);
if (!handoffProblems.some((item) => item.includes('binding ausente/divergente'))) {
  throw new Error('reabertura com binding divergente deveria falhar: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS handoff exige binding exato na reabertura\n');

const missingHandoffBinding = {
  ...protectedRevision,
  history: protectedRevision.history.map((entry, index) => (
    index === 0 ? { ...entry, bible_sha: null } : entry
  )),
};
handoffProblems = postHandoffCorrectionProblems([missingHandoffBinding], []);
if (!handoffProblems.some((item) => item.includes('handoff protegido sem SOURCE_SHA+BIBLE_SHA válidos'))) {
  throw new Error('handoff protegido sem binding completo deveria falhar: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS handoff protegido exige SOURCE_SHA+BIBLE_SHA\n');

const missingTransition = {
  ...protectedRevision,
  history: [protectedRevision.history[0]],
};
handoffProblems = postHandoffCorrectionProblems([missingTransition], []);
if (!handoffProblems.some((item) => item.includes('state IN_PROGRESS sem transição de correção registrada'))) {
  throw new Error('state IN_PROGRESS sem evento de correção deveria falhar: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS state/lock não burlam handoff sem history de correção\n');

const safelyAborted = {
  ...protectedRevision,
  status: 'READY_FOR_AUDIT',
  history: [
    ...protectedRevision.history,
    {
      at_utc: '2026-10-02T06:06:00Z',
      type: 'PROTECTED_HANDOFF_UNAUTHORIZED_CORRECTION_ABORTED',
      from_status: 'IN_PROGRESS',
      to_status: 'READY_FOR_AUDIT',
      source_sha: String(2).padStart(40, '0'),
      bible_sha: 'd'.repeat(40),
      reopen_at_utc: '2026-10-02T06:05:00Z',
    },
  ],
};
handoffProblems = postHandoffCorrectionProblems([safelyAborted], []);
if (handoffProblems.length !== 0) {
  throw new Error('abort seguro deveria restaurar o handoff protegido: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS abort seguro restaura handoff sem apagar histórico\n');

const silentlyChangedRevision = {
  ...missingTransition,
  status: 'READY_FOR_AUDIT',
  source_sha: '9'.repeat(40),
};
handoffProblems = postHandoffCorrectionProblems([silentlyChangedRevision], []);
if (!handoffProblems.some((item) => item.includes('revisão alterada sem correção autorizada'))) {
  throw new Error('mudança silenciosa de revisão deveria falhar: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS revisão não pode mudar silenciosamente após handoff\n');
const refreshedAfterHandoff = {
  ...missingTransition,
  source_sha: '8'.repeat(40),
  bible_sha: 'e'.repeat(40),
  status: 'READY_FOR_AUDIT',
  history: [
    ...missingTransition.history,
    {
      at_utc: '2026-10-02T06:10:00Z',
      type: lifecycleCore.REVISION_REFRESH_EVENT,
      from_status: 'COMPLETED',
      to_status: 'READY_FOR_AUDIT',
      source_sha: '8'.repeat(40),
      test_sha: '8'.repeat(40),
      bible_sha: 'e'.repeat(40),
      production_sha: null,
      actor: 'MAINTAINER',
    },
  ],
};
handoffProblems = postHandoffCorrectionProblems([refreshedAfterHandoff], []);
if (handoffProblems.length !== 0) {
  throw new Error('revision refresh should close prior correction handoff scope: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS revision refresh closes prior correction handoff scope\n');


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

const projectedChangesRequired = {
  ...protectedRevision,
  history: [
    protectedRevision.history[0],
    {
      ...protectedRevision.history[1],
      from_status: 'CHANGES_REQUIRED',
      type: 'EDITOR_CORRECTION_STARTED',
    },
  ],
};
handoffProblems = postHandoffCorrectionProblems([projectedChangesRequired], finalChangesRequired);
if (handoffProblems.length !== 0) {
  throw new Error('CHANGES_REQUIRED -> IN_PROGRESS deveria ser aceito após decisão final: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS CHANGES_REQUIRED projetado pode iniciar correção autorizada\n');

const endedWithoutRehandoff = {
  ...projectedChangesRequired,
  status: 'READY_FOR_AUDIT',
};
handoffProblems = postHandoffCorrectionProblems([endedWithoutRehandoff], finalChangesRequired);
if (!handoffProblems.some((item) => item.includes('terminou sem novo CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT'))) {
  throw new Error('correção concluída deveria exigir novo handoff: ' + JSON.stringify(handoffProblems));
}
process.stdout.write('PASS correção autorizada exige novo handoff ao voltar READY_FOR_AUDIT\n');

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

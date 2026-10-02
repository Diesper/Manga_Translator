'use strict';

const assert = require('assert');
const life = require('./lifecycle-core');
const gate = require('./human-gate');

const state = {
  index: 7,
  status: 'HUMAN_LOCKED',
  file: 'fixture.js',
  bible: 'docs/biblia/fixture/Bíblia.md',
  source_sha: 'a'.repeat(40),
  bible_sha: 'b'.repeat(40),
  history: [],
};
for (let i=1;i<=7;i+=1) {
  state.history.push({
    at_utc: '2026-10-01T0' + i + ':00:00Z',
    type: 'CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT',
    source_sha: state.source_sha,
    bible_sha: state.bible_sha,
  });
}
const snapshot = life.lifecycleSnapshot(state);
const approval = {
  schema_version: 1,
  approval_id: '007-human-001',
  index: 7,
  locked_cycle: 7,
  decision: 'ALLOW_ONE_CORRECTION',
  permission: 'ONE_CORRECTION_CYCLE',
  approved_by: 'human-reviewer',
  approved_at_utc: '2026-10-02T07:00:00Z',
  approval_source: 'workflow_dispatch',
  approval_environment: 'human-approval',
  production_sha: snapshot.production_sha,
  test_sha: snapshot.test_sha,
  bible_sha: snapshot.bible_sha,
  revision_id: snapshot.revision_id,
  reason: 'uma rodada adicional',
};
assert.deepStrictEqual(gate.validateApproval(approval), []);
assert.strictEqual(gate.approvalMatches(state, snapshot, approval, 'ALLOW_ONE_CORRECTION'), true);
console.log('PASS approval humana vinculada à revisão/ciclo');

const wrongRevision = { ...approval, revision_id: 'f'.repeat(64) };
assert.strictEqual(gate.approvalMatches(state, snapshot, wrongRevision), false);
console.log('PASS approval stale não libera revisão diferente');

const wrongCycle={...approval,approval_id:'007-human-wrong-cycle',locked_cycle:8};
const wrongTestSha={...approval,approval_id:'007-human-wrong-test',test_sha:'c'.repeat(40)};
const wrongBibleSha={...approval,approval_id:'007-human-wrong-bible',bible_sha:'d'.repeat(40)};
const wrongProductionSha={...approval,approval_id:'007-human-wrong-production',production_sha:'e'.repeat(40)};
assert.strictEqual(gate.approvalMatches(state,snapshot,wrongCycle,'ALLOW_ONE_CORRECTION'),false);
assert.strictEqual(gate.approvalMatches(state,snapshot,wrongTestSha,'ALLOW_ONE_CORRECTION'),false);
assert.strictEqual(gate.approvalMatches(state,snapshot,wrongBibleSha,'ALLOW_ONE_CORRECTION'),false);
assert.strictEqual(gate.approvalMatches(state,snapshot,wrongProductionSha,'ALLOW_ONE_CORRECTION'),false);
console.log('PASS approval wrong cycle/SHA bindings are rejected');

state.history.push({
  at_utc: '2026-10-02T07:01:00Z',
  type: 'HUMAN_APPROVAL_CONSUMED',
  approval_id: approval.approval_id,
});
assert.strictEqual(gate.approvalConsumed(state, approval.approval_id), true);
assert.strictEqual(gate.approvalMatches(state, snapshot, approval), false);
console.log('PASS approval é single-use sem reescrever artefato append-only');

const consumptionState={
  ...state,
  history:state.history.slice(0,7),
};
consumptionState.history.push({
  at_utc:'2026-10-02T07:01:00Z',
  type:'HUMAN_APPROVAL_CONSUMED',
  approval_id:approval.approval_id,
  correction_token_id:'corr-human-selftest',
  source_sha:approval.test_sha,
  bible_sha:approval.bible_sha,
});
consumptionState.history.push({
  at_utc:'2026-10-02T07:01:01Z',
  type:'HUMAN_AUTHORIZED_CORRECTION_STARTED',
  approval_id:approval.approval_id,
  correction_token_id:'corr-human-selftest',
});
assert.deepStrictEqual(gate.humanApprovalConsumptionProblems([consumptionState],[approval]),[]);
const duplicatedConsumption=JSON.parse(JSON.stringify(consumptionState));
duplicatedConsumption.history.push({
  at_utc:'2026-10-02T07:02:00Z',
  type:'HUMAN_APPROVAL_CONSUMED',
  approval_id:approval.approval_id,
  correction_token_id:'corr-human-selftest-duplicate',
  source_sha:approval.test_sha,
  bible_sha:approval.bible_sha,
});
duplicatedConsumption.history.push({
  at_utc:'2026-10-02T07:02:01Z',
  type:'HUMAN_AUTHORIZED_CORRECTION_STARTED',
  approval_id:approval.approval_id,
  correction_token_id:'corr-human-selftest-duplicate',
});
assert.ok(gate.humanApprovalConsumptionProblems([duplicatedConsumption],[approval])
  .some((x)=>x.includes('mais de uma vez')));
const orphanConsumption=JSON.parse(JSON.stringify(consumptionState));
orphanConsumption.history.push({
  at_utc:'2026-10-02T07:03:00Z',
  type:'HUMAN_APPROVAL_CONSUMED',
  approval_id:'missing-approval',
});
assert.ok(gate.humanApprovalConsumptionProblems([orphanConsumption],[approval])
  .some((x)=>x.includes('approval inexistente')));
console.log('PASS duplicate/orphan HUMAN approval consumption is rejected structurally');

const auditorConflictPipeline = new Map([[7, {
  index:7,
  primary:{auditor:'AUDITOR-PRIMARY'},
  adversarial:{auditor:'AUDITOR-ADVERSARIAL'},
  reaudit:{auditor:'AUDITOR-REAUDIT'},
}]]);
assert.ok(gate.humanApprovalAuditorProblems([
  {...approval, approval_id:'007-human-conflict', approved_by:'AUDITOR-PRIMARY'},
], auditorConflictPipeline).some((x)=>x.includes('independente dos auditores')));
assert.deepStrictEqual(gate.humanApprovalAuditorProblems([
  {...approval, approval_id:'007-human-independent', approved_by:'HUMAN-REVIEWER'},
], auditorConflictPipeline),[]);
console.log('PASS same auditor cannot satisfy HUMAN approval; independent reviewer can');

const forged = { ...approval, approval_source: 'agent_commit' };
assert.ok(gate.validateApproval(forged).some((x) => x.includes('workflow_dispatch')));
console.log('PASS approval fora do workflow humano é inválida');

const botApproval = { ...approval, approved_by: 'github-actions[bot]' };
assert.ok(gate.validateApproval(botApproval).some((x)=>x.includes('identidade humana')));
console.log('PASS bot identity cannot satisfy human approval');

const approvalV2 = {
  ...approval,
  schema_version:2,
  approval_id:'007-human-v2',
  workflow_run_id:'123456789',
  workflow_run_attempt:1,
  workflow_name:'Bible Human Approval',
  repository:'Diesper/Manga_Translator',
  target_branch:'docs/project-bible',
  branch_head_sha:'a'.repeat(40),
};
assert.deepStrictEqual(gate.validateApproval(approvalV2),[]);
const forgedV2={...approvalV2,workflow_name:'Forged Workflow'};
assert.ok(gate.validateApproval(forgedV2).some((x)=>x.includes('workflow_name')));
console.log('PASS schema v2 provenance rejects forged workflow metadata');

const auditRecord = {
  index:7,
  source_sha:state.source_sha,
  bible_sha:state.bible_sha,
  phase:'PRIMARY',
  completed_at_utc:'2026-10-02T07:10:00Z',
  completed_at_ms:Date.parse('2026-10-02T07:10:00Z'),
  path:'audit/primary.json',
};
let auditProblems = gate.humanAuditResultProblems(
  [state],
  new Map([[7,snapshot]]),
  [],
  [auditRecord]
);
assert.ok(auditProblems.some((x)=>x.includes('ALLOW_AUDIT_ONLY')));
console.log('PASS audit-result HUMAN exige ALLOW_AUDIT_ONLY');

const auditApproval = {
  ...approval,
  approval_id:'007-human-audit',
  decision:'ALLOW_AUDIT_ONLY',
  permission:null,
  approved_at_utc:'2026-10-02T07:05:00Z',
};
auditProblems = gate.humanAuditResultProblems(
  [state],
  new Map([[7,snapshot]]),
  [auditApproval],
  [{ ...auditRecord, human_approval_id: auditApproval.approval_id }]
);
assert.deepStrictEqual(auditProblems,[]);
console.log('PASS audit-result HUMAN posterior à aprovação é aceito');

const laterAuditApproval = {
  ...auditApproval,
  approval_id:'007-human-audit-later',
  approved_at_utc:'2026-10-02T07:20:00Z',
};
auditProblems = gate.humanAuditResultProblems(
  [state],
  new Map([[7,snapshot]]),
  [auditApproval,laterAuditApproval],
  [{ ...auditRecord, human_approval_id: auditApproval.approval_id }]
);
assert.deepStrictEqual(auditProblems,[]);
console.log('PASS approval posterior não invalida retroativamente resultado HUMAN anterior');

auditProblems = gate.humanAuditResultProblems(
  [state],
  new Map([[7,snapshot]]),
  [auditApproval],
  [{ ...auditRecord, human_approval_id: 'forged-approval-id' }]
);
assert.ok(auditProblems.some((x)=>x.includes('ALLOW_AUDIT_ONLY')));
console.log('PASS audit-result HUMAN com approval id fabricada é rejeitado');

const baseHumanHistory=state.history.slice(0,7);
const forgedCloseState={...state,status:'COMPLETED',history:[
  ...baseHumanHistory,
  {
    at_utc:'2026-10-02T07:30:00Z',
    type:'HUMAN_PERMANENTLY_CLOSED',
    approval_id:'forged-close',
  },
]};
assert.ok(
  gate.humanApprovalConsumptionProblems([forgedCloseState],[])
    .some((x)=>x.includes('ação HUMAN sem consumo de approval')),
);
const forgedResetState={...state,status:'READY_FOR_AUDIT',history:[
  ...baseHumanHistory,
  {
    at_utc:'2026-10-02T07:31:00Z',
    type:life.HUMAN_RESET_EVENT,
    approval_id:'forged-reset',
  },
]};
assert.ok(
  gate.humanApprovalConsumptionProblems([forgedResetState],[])
    .some((x)=>x.includes('ação HUMAN sem consumo de approval')),
);
console.log('PASS forged HUMAN close/reset without approval consumption are rejected');

const closeApproval={
  ...approval,
  approval_id:'007-human-close',
  decision:'PERMANENTLY_CLOSE',
  permission:null,
  approved_at_utc:'2026-10-02T07:32:00Z',
};
const closeState={...state,status:'COMPLETED',history:[
  ...baseHumanHistory,
  {
    at_utc:'2026-10-02T07:33:00Z',
    type:'HUMAN_APPROVAL_CONSUMED',
    approval_id:closeApproval.approval_id,
    source_sha:closeApproval.test_sha,
    bible_sha:closeApproval.bible_sha,
  },
  {
    at_utc:'2026-10-02T07:33:01Z',
    type:'HUMAN_PERMANENTLY_CLOSED',
    approval_id:closeApproval.approval_id,
  },
]};
assert.deepStrictEqual(
  gate.humanApprovalConsumptionProblems([closeState],[closeApproval]),
  [],
);
const approvedClosePipeline=new Map([[7,{index:7,decision:'APPROVED',problems:[]}]]);
assert.deepStrictEqual(
  gate.humanPermanentClosePipelineProblems([closeState],[closeApproval],approvedClosePipeline),
  [],
);
const rejectedClosePipeline=new Map([[7,{index:7,decision:'CHANGES_REQUIRED',problems:[]}]]);
assert.ok(
  gate.humanPermanentClosePipelineProblems([closeState],[closeApproval],rejectedClosePipeline)
    .some((x)=>x.includes('pipeline distribuído final APPROVED')),
);
console.log('PASS HUMAN permanent close requires both approval provenance and final APPROVED pipeline');

console.log('Human gate self-test: SUCCESS');

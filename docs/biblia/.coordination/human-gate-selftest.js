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

state.history.push({
  at_utc: '2026-10-02T07:01:00Z',
  type: 'HUMAN_APPROVAL_CONSUMED',
  approval_id: approval.approval_id,
});
assert.strictEqual(gate.approvalConsumed(state, approval.approval_id), true);
assert.strictEqual(gate.approvalMatches(state, snapshot, approval), false);
console.log('PASS approval é single-use sem reescrever artefato append-only');

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


console.log('Human gate self-test: SUCCESS');

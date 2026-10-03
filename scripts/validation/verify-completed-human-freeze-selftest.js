'use strict';
const assert=require('assert');
const access=require('../bible/core/completed-access');
const life=require('../bible/core/lifecycle-core');
const completion=require('../bible/core/completion');
const transition=require('../bible/commands/unit-transition');
const reconcile=require('../bible/commands/reconcile-audit-results');
const {orderFor}=require('../../tests/infra/bible/completed-order-fixture');
const {planAuditWork}=require('./bible-audit-work-plan');
const {planCorrections}=require('../bible/commands/bible-correction-work-plan');
const {buildAuditResult}=require('../bible/commands/audit-result');
const {problemsForHumanDiff}=require('./verify-human-protected-diff');
const at='2026-10-03T01:00:00Z';
const state={index:1,file:'fixture.js',bible:'fixture/Bíblia.md',status:'COMPLETED',review_status:'READY_FOR_AUDIT',
  source_sha:'a'.repeat(40),test_sha:'a'.repeat(40),bible_sha:'b'.repeat(40),production_sha:null,
  completed_at_utc:'2026-10-01T00:00:00Z',updated_at_utc:at,audit_requests:[],history:[],
  completion:{achieved:true,first_completed_at_utc:'2026-10-01T00:00:00Z',human_order_required_since_utc:at}};
const order=orderFor(state,at),snapshot=life.lifecycleSnapshot(state);
const request={action:'REFRESH_REVISION_FOR_AUDIT',actor:'auditor',at_utc:at,
  expected_status:'COMPLETED',expected_state_sha:'c'.repeat(40),expected_revision_id:snapshot.revision_id,expected_cycle:0,
  test_sha:'d'.repeat(40),bible_sha:'e'.repeat(40),production_sha:null};
assert.throws(()=>transition.planTransition({state,request,currentStateSha:request.expected_state_sha}),/DIRECT_HUMAN_ORDER/);
const refreshed=transition.planTransition({state,request,currentStateSha:request.expected_state_sha,completedOrder:order}).state;
assert.strictEqual(refreshed.status,'COMPLETED');assert.strictEqual(refreshed.completed_at_utc,state.completed_at_utc);
assert.ok(access.orderFor(refreshed,[order],at));
const secondRequest={...request,expected_revision_id:life.lifecycleSnapshot(refreshed).revision_id,
  test_sha:'f'.repeat(40),bible_sha:'9'.repeat(40)};
assert.throws(()=>transition.planTransition({state:refreshed,request:secondRequest,currentStateSha:request.expected_state_sha,completedOrder:order}),/DIRECT_HUMAN_ORDER/);
for(const mutation of [
  {...order,index:2}, {...order,approved_by:'github-actions[bot]'}, {...order,workflow_run_id:null},
  {...order,revision_id:'0'.repeat(64)}, {...order,expires_at_utc:at}, {...order,reason:''}
])assert.strictEqual(access.orderFor(state,[mutation],at),null);
const pipeline={index:1,decision:'WAITING_PRIMARY',next_phase:'PRIMARY',problems:[]};
const open={...state,index:2,status:'READY_FOR_AUDIT',review_status:null,completion:null,completed_at_utc:null};
const pipelines=new Map([[1,pipeline],[2,{...pipeline,index:2}]]);
let plan=planAuditWork({states:[state,open],pipelines,auditorOrdinal:1,atUtc:at});
assert.deepStrictEqual(plan.candidates.map(c=>c.index),[2]);
plan=planAuditWork({states:[state,open],pipelines,auditorOrdinal:1,humanApprovals:[order],atUtc:at});
assert.deepStrictEqual(plan.candidates.map(c=>c.index),[2,1]);
const changes={...pipeline,decision:'CHANGES_REQUIRED',primary:{verdict:'CHANGES_REQUIRED'},adversarial:{verdict:'CHANGES_REQUIRED',completed_at_utc:at}};
assert.deepStrictEqual(reconcile.projectState(state,changes),{changed:false,state});
const changed=reconcile.projectState(state,changes,[order]);assert.strictEqual(changed.state.status,'COMPLETED');
assert.strictEqual(changed.state.review_status,'CHANGES_REQUIRED');
assert.strictEqual(access.orderFor(changed.state,[order],at),null);
const correctionModel={states:[state,open],pipelines:[changes,{...changes,index:2}],human_approvals:[]};
assert.deepStrictEqual(planCorrections(correctionModel,1,80,at).candidates.map(c=>c.index),[2]);
assert.throws(()=>buildAuditResult(state,pipeline,{phase:'PRIMARY',verdict:'APPROVED',auditor:'agent',completed_at_utc:at}),/DIRECT_HUMAN_ORDER/);
assert.strictEqual(buildAuditResult(state,pipeline,{phase:'PRIMARY',verdict:'APPROVED',auditor:'agent',completed_at_utc:at},[order]).completed_order_id,order.approval_id);
assert.throws(()=>buildAuditResult(state,pipeline,{phase:'PRIMARY',verdict:'APPROVED',auditor:order.approved_by,completed_at_utc:at},[order]),/SELF_AUDIT/);
for(const file of [state.file,state.bible,'docs/biblia/.state/001.json','docs/biblia/.coordination/audit-results/001/primary/new.json'])
  assert.ok(problemsForHumanDiff(state,state,[file],[],{atUtc:at}).length);
assert.deepStrictEqual(problemsForHumanDiff(state,state,[state.file],[order],{atUtc:at}),[]);
assert.deepStrictEqual(completion.completionProblems(refreshed),[]);
console.log('Completed human freeze: SUCCESS — no automatic work; exact human order; one epoch; open files first; protected diffs');

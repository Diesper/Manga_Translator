'use strict';
const assert=require('assert');
const life=require('../../../scripts/bible/core/lifecycle-core');
const {buildHumanReviewPackage,renderHumanSummary}=require('../../../scripts/bible/storage/human-review');
const state={
  index:9,
  status:'HUMAN_LOCKED',
  file:'f.js',
  bible:'Bíblia.md',
  production_files:['prod-a.js','prod-b.js'],
  source_sha:'a'.repeat(40),
  bible_sha:'b'.repeat(40),
  history:[],
  audit_requests:[
    {id:'009-R1',type:'REGRESSION',status:'OPEN',title:'regression after retry'},
    {id:'009-X1',type:'OTHER',status:'SUPERSEDED'},
  ],
};
for(let i=1;i<=7;i+=1){
 state.history.push({
   at_utc:'2026-10-01T0'+i+':00:00Z',
   type:'EDITOR_CORRECTION_STARTED',
   to_status:'IN_PROGRESS',
   agent:'A'+i,
   reason:'r'+i,
   root_cause_review:i===6?{categories:['CONCURRENCY'],evidence:'race',strategy:'serialize'}:null,
 });
 state.history.push({
   at_utc:'2026-10-01T0'+i+':10:00Z',
   type:life.HANDOFF_EVENT,
   source_sha:(i<7?'a':'c').repeat(40),
   bible_sha:(i<6?'b':'d').repeat(40),
   production_sha:(i<5?'e':'f').repeat(40),
   agent:'A'+i,
 });
}
state.history.push({
  at_utc:'2026-10-01T08:00:00Z',
  type:'DISTRIBUTED_AUDIT_DECISION',
  decision:'CHANGES_REQUIRED',
  primary:'CHANGES_REQUIRED',
  adversarial:'CHANGES_REQUIRED',
  reaudit:null,
  revision_id:'1'.repeat(64),
  audit_epoch:7,
  handoff_id:'009-e7-fixture',
});
state.history.push({
  at_utc:'2026-10-01T08:05:00Z',
  type:life.SAFE_ABORT_EVENT,
  reason:'fixture abort',
});
const snap=life.lifecycleSnapshot(state);
const pkg=buildHumanReviewPackage(state,snap,{
  generated_at_utc:'2026-10-02T07:00:00Z',
  unverified_findings:[{id:'009-UF-1',index:9,status:'UNVERIFIED'}],
});
assert.strictEqual(pkg.cycles.length,7);
assert.strictEqual(pkg.status,'HUMAN_LOCKED');
assert.ok(pkg.decisions.some((item)=>item.decision==='CHANGES_REQUIRED'));
assert.ok(pkg.failures.length>=2);
assert.ok(pkg.regressions.some((item)=>item.id==='009-R1'));
assert.ok(pkg.possible_root_causes.some((item)=>item.categories.includes('CONCURRENCY')));
assert.ok(pkg.files_most_changed.some((item)=>item.file==='f.js'));
assert.ok(pkg.files_most_changed.some((item)=>item.file==='Bíblia.md'));
assert.ok(pkg.files_most_changed.some((item)=>item.file==='prod-a.js'));
assert.ok(pkg.agents_involved.includes('A7'));
const summary=renderHumanSummary(pkg);
assert.ok(summary.includes('## Decisões'));
assert.ok(summary.includes('## Falhas / aborts'));
assert.ok(summary.includes('## Possíveis causas-raiz'));
assert.ok(summary.includes('Nenhum agente automático'));
console.log('Human review self-test: SUCCESS');

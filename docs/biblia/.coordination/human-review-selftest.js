'use strict';
const assert=require('assert');
const life=require('./lifecycle-core');
const {buildHumanReviewPackage,renderHumanSummary}=require('./human-review');
const state={index:9,status:'HUMAN_LOCKED',file:'f.js',bible:'Bíblia.md',source_sha:'a'.repeat(40),bible_sha:'b'.repeat(40),history:[],audit_requests:[]};
for(let i=1;i<=7;i+=1){
 state.history.push({at_utc:'2026-10-01T0'+i+':00:00Z',type:'EDITOR_CORRECTION_STARTED',to_status:'IN_PROGRESS',agent:'A'+i,reason:'r'+i});
 state.history.push({at_utc:'2026-10-01T0'+i+':10:00Z',type:life.HANDOFF_EVENT,source_sha:state.source_sha,bible_sha:state.bible_sha,agent:'A'+i});
}
const snap=life.lifecycleSnapshot(state);
const pkg=buildHumanReviewPackage(state,snap,{generated_at_utc:'2026-10-02T07:00:00Z'});
assert.strictEqual(pkg.cycles.length,7);
assert.strictEqual(pkg.status,'HUMAN_LOCKED');
assert.ok(renderHumanSummary(pkg).includes('Nenhum agente automático'));
console.log('Human review self-test: SUCCESS');

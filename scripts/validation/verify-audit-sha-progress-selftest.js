'use strict';
const assert=require('assert');
const core=require('../bible/core/audit-core');
const state={index:1,file:'fixture.js',status:'READY_FOR_AUDIT',source_sha:'a'.repeat(40),bible_sha:'b'.repeat(40),history:[]};
const record=(phase,verdict,auditor,source=state.source_sha,bible=state.bible_sha)=>({index:1,phase,verdict,auditor,
  source_sha:source,bible_sha:bible,completed_at_ms:1,completed_at_utc:'2026-10-01T00:00:00Z',path:phase+'.json'});
const primary=record('PRIMARY','APPROVED','primary'), adversarial=record('ADVERSARIAL','CHANGES_REQUIRED','adversarial');
for(const [name,changes] of [['source',{source_sha:'c'.repeat(40)}],['Bible',{bible_sha:'d'.repeat(40)}],['both',{source_sha:'c'.repeat(40),bible_sha:'d'.repeat(40)}]]) {
  let pipeline=core.resolveAuditPipeline({...state,...changes},[primary]);
  assert.strictEqual(pipeline.decision,'WAITING_PRIMARY');assert.strictEqual(core.displayAuditStatus(pipeline),'WAITING_ADVERSARIAL');
  assert.strictEqual(pipeline.next_phase,'PRIMARY');assert.strictEqual(pipeline.revision_revalidation_required,true);
  pipeline=core.resolveAuditPipeline({...state,...changes},[primary,adversarial]);
  assert.strictEqual(pipeline.decision,'WAITING_PRIMARY');assert.strictEqual(core.displayAuditStatus(pipeline),'REAUDIT_REQUIRED');
  assert.strictEqual(pipeline.primary,null);assert.strictEqual(pipeline.adversarial,null);
  const freshState={...state,...changes};
  pipeline=core.resolveAuditPipeline(freshState,[primary,adversarial,record('PRIMARY','APPROVED','fresh-p',freshState.source_sha,freshState.bible_sha)]);
  assert.strictEqual(pipeline.decision,'WAITING_ADVERSARIAL');assert.strictEqual(pipeline.audit_status,'REAUDIT_REQUIRED');
  pipeline=core.resolveAuditPipeline(freshState,[primary,adversarial,record('PRIMARY','APPROVED','fresh-p',freshState.source_sha,freshState.bible_sha),record('ADVERSARIAL','APPROVED','fresh-a',freshState.source_sha,freshState.bible_sha)]);
  assert.strictEqual(pipeline.decision,'APPROVED');assert.strictEqual(pipeline.audit_status,'APPROVED');
  console.log('PASS '+name+' SHA drift retains audit stage without granting obsolete evidence');
}
const invalid=core.resolveAuditPipeline({...state,source_sha:'c'.repeat(40)},[primary,{...adversarial,auditor:primary.auditor}]);
assert.notStrictEqual(invalid.audit_status,'REAUDIT_REQUIRED');
const fs=require('fs'),os=require('os'),path=require('path');
const temporaryParent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(temporaryParent,'bible-sha-repair-'));
try {
  fs.mkdirSync(path.join(root,'docs/biblia/.state'),{recursive:true});
  fs.mkdirSync(path.join(root,'fixture'),{recursive:true});
  fs.writeFileSync(path.join(root,'fixture.js'),'current source\n');
  fs.writeFileSync(path.join(root,'fixture/Bíblia.md'),'current Bible\n');
  const filename=path.join(root,'docs/biblia/.state/001.json');
  fs.writeFileSync(filename,JSON.stringify({...state,bible:'fixture/Bíblia.md',test_sha:state.source_sha,audit_requests:[]}));
  const repair=require('../bible/commands/repair-sha').repair;
  const repaired=repair(root,1).state;
  assert.strictEqual(repaired.status,'READY_FOR_AUDIT');
  assert.strictEqual(core.resolveAuditPipeline(repaired,[primary]).audit_status,'WAITING_ADVERSARIAL');
  assert.strictEqual(core.resolveAuditPipeline(repaired,[primary,adversarial]).audit_status,'REAUDIT_REQUIRED');
  assert.strictEqual(repair(root,1).changed,false);
  fs.writeFileSync(filename,JSON.stringify({...repaired,status:'COMPLETED',completed_at_utc:'2026-10-01T00:00:00Z'}));
  assert.throws(()=>repair(root,1),/DIRECT_HUMAN_ORDER/);
  console.log('PASS actual SHA repair writer preserves audit stage, is idempotent and refuses completed files');
} finally {
  const resolved=fs.realpathSync(root);if(path.dirname(resolved)!==temporaryParent||!path.basename(resolved).startsWith('bible-sha-repair-'))throw Error('Unsafe cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
}
console.log('Audit SHA progress: SUCCESS');

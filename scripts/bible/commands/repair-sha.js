'use strict';
const fs=require('fs');
const path=require('path');
const life=require('../core/lifecycle-core');
const access=require('../core/completed-access');
const human=require('../core/human-gate');
const git=require('../storage/git');
const storage=require('../storage/files');
const transition=require('./unit-transition');
function repair(root,index,atUtc=new Date().toISOString()) {
  return storage.withUnitLock(root,index,()=>{
    git.clearGitSnapshotCache(root);
    const file=path.join(root,'docs/biblia/.state',String(index).padStart(3,'0')+'.json');
    const raw=fs.readFileSync(file,'utf8'),state=JSON.parse(raw),snapshot=life.lifecycleSnapshot(state);
    const indexName=String(index).padStart(3,'0')+'.lock.md';
    const busy=[transition.correctionReservationRelativePath(state),'docs/biblia/.coordination/audit-claims/'+indexName,
      ...['primary','adversarial','reaudit'].map(phase=>'docs/biblia/.coordination/audit-leases/'+phase+'/'+indexName)];
    if(busy.some(relative=>fs.existsSync(path.join(root,relative))))throw Error('REPAIR_SHA_REQUIRES_RELEASE_OF_ACTIVE_RESERVATION_OR_LEASE');
    const approvals=human.loadHumanApprovals(root);
    if(approvals.problems.length)throw Error(approvals.problems.join(';'));
    const completedOrder=access.requireOrder(state,approvals.approvals,atUtc);
    access.requireOrder(state,approvals.approvals);
    const request={action:'REFRESH_REVISION_FOR_AUDIT', actor:'authorized-sha-repair',at_utc:atUtc,
      expected_status:state.status,expected_state_sha:git.gitBlobShaBuffer(Buffer.from(raw)),
      expected_revision_id:snapshot.revision_id,expected_cycle:snapshot.current_escalation_cycle,
      reason:'Corrigir vínculo de SHA observado; preservar conclusão e etapa de auditoria, sem reutilizar aprovação antiga.',
      ...transition.workingRevision(root,state)};
    if(request.test_sha===snapshot.test_sha && request.bible_sha===snapshot.bible_sha && request.production_sha===snapshot.production_sha)return {changed:false,state};
    const result=transition.planTransition({state,request,completedOrder,currentStateSha:request.expected_state_sha});
    storage.transaction(root,index,{action:'REPAIR_SHA',expected_state_sha:request.expected_state_sha},()=>storage.atomicWrite(file,JSON.stringify(result.state,null,2)+'\n',{expected:raw}));
    return {changed:true,state:result.state};
  });
}
function main(argv=process.argv.slice(2)) {
  const index=Number(argv[argv.indexOf('--index')+1]);
  if(!argv.includes('--index') || !Number.isInteger(index))throw Error('--index obrigatório');
  const result=repair(path.resolve(__dirname,'../../..'),index);
  console.log(JSON.stringify({index,changed:result.changed,status:result.state.status,review_status:result.state.review_status||result.state.status}));
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={repair};

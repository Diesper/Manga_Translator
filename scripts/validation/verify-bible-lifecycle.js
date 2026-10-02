'use strict';

const fs=require('fs');
const path=require('path');
const life=require('../../docs/biblia/.coordination/lifecycle-core');
const findings=require('../../docs/biblia/.coordination/unverified-findings');
const human=require('../../docs/biblia/.coordination/human-gate');
const transition=require('../../docs/biblia/.coordination/unit-transition');

const root=path.resolve(__dirname,'../..');
const stateRoot=path.join(root,'docs','biblia','.state');
const states=fs.readdirSync(stateRoot)
  .filter((name)=>/^\d{3}\.json$/.test(name))
  .sort()
  .map((name)=>JSON.parse(fs.readFileSync(path.join(stateRoot,name),'utf8')));

const evaluation=life.evaluateLifecycleStates(states);
const findingLoad=findings.loadUnverifiedFindings(root);
const approvalLoad=human.loadHumanApprovals(root);
const tokenLoad=transition.loadCorrectionTokens(root,states,{
  humanApprovals:approvalLoad.approvals,
});
const problems=[
  ...evaluation.problems,
  ...findingLoad.problems,
  ...approvalLoad.problems,
  ...human.humanGateProblems(states,evaluation.byIndex,approvalLoad.approvals),
  ...tokenLoad.problems,
];

for(const finding of findingLoad.findings){
  if (!['UNVERIFIED','CONFIRMED_BY_PRIMARY'].includes(finding.status)) continue;
  const snapshot=evaluation.byIndex.get(Number(finding.index));
  if (snapshot && finding.revision_observed?.revision_id !== snapshot.revision_id) {
    problems.push(finding.path+': finding pendente pertence a revisão stale; marcar STALE/SUPERSEDED');
  }
}

for(const item of evaluation.humanLocked){
  const state=states.find((s)=>s.index===item.index);
  if (state?.status !== 'HUMAN_LOCKED') continue;
  const reviewPath=path.join(root,'docs','biblia','.coordination','human-review',String(item.index).padStart(3,'0')+'.json');
  if (!fs.existsSync(reviewPath)) {
    problems.push('#'+String(item.index).padStart(3,'0')+': HUMAN_LOCKED sem human-review package');
  } else {
    try{
      const review=JSON.parse(fs.readFileSync(reviewPath,'utf8'));
      const snapshot=evaluation.byIndex.get(item.index);
      if (review?.current_revision?.revision_id !== snapshot?.revision_id) {
        problems.push('#'+String(item.index).padStart(3,'0')+': human-review package stale');
      }
    }catch(error){
      problems.push('#'+String(item.index).padStart(3,'0')+': human-review JSON inválido: '+error.message);
    }
  }
}

if(problems.length){
  console.error('Bible lifecycle anti-loop: BLOCKED');
  for(const problem of [...new Set(problems)]) console.error('- '+problem);
  process.exit(1);
}
console.log(
  'Bible lifecycle anti-loop: PASS — states='+states.length
  +' human_locked='+evaluation.humanLocked.length
  +' findings='+findingLoad.findings.length
  +' approvals='+approvalLoad.approvals.length
  +' tokens='+tokenLoad.tokens.length
);

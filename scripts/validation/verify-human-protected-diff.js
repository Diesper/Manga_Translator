'use strict';

const childProcess=require('child_process');
const fs=require('fs');
const path=require('path');
const life=require('../../docs/biblia/.coordination/lifecycle-core');

const root=path.resolve(__dirname,'../..');

function git(args){
  return childProcess.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
}
function baseArg(argv){
  const i=argv.indexOf('--base');
  return i>=0 ? argv[i+1] : null;
}
function baseState(base,index){
  const rel='docs/biblia/.state/'+String(index).padStart(3,'0')+'.json';
  try{return JSON.parse(git(['show',base+':'+rel]));}catch(_){return null;}
}
function currentStates(){
  const dir=path.join(root,'docs','biblia','.state');
  return fs.readdirSync(dir).filter((n)=>/^\d{3}\.json$/.test(n)).map((n)=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8')));
}
function protectedPaths(state){
  const index=String(state.index).padStart(3,'0');
  const paths=new Set([
    state.file,
    state.bible,
    'docs/biblia/.state/'+index+'.json',
  ]);
  for(const file of state.production_files || []) paths.add(file);
  for(const request of state.audit_requests || []){
    if(typeof request?.target_file==='string' && request.target_file) paths.add(request.target_file);
  }
  return paths;
}

const base=baseArg(process.argv.slice(2));
if(!base || /^0+$/.test(base)){
  console.log('Human protected diff: SKIP — base SHA indisponível');
  process.exit(0);
}
let changed=[];
try{changed=git(['diff','--name-only',base+'..HEAD']).split(/\r?\n/).filter(Boolean).map((x)=>x.replace(/\\/g,'/'));}
catch(error){console.error('Human protected diff: ERROR — base inválida');process.exit(1);}

const problems=[];
for(const current of currentStates()){
  const before=baseState(base,current.index);
  if(!before) continue;
  const beforeLife=life.lifecycleSnapshot(before);
  if(!beforeLife.human_locked) continue;
  const touched=changed.filter((p)=>protectedPaths(before).has(p));
  if(!touched.length) continue;
  const oldLen=Array.isArray(before.history)?before.history.length:0;
  const added=(Array.isArray(current.history)?current.history:[]).slice(oldLen);
  const approved=added.some((e)=>e?.type==='HUMAN_APPROVAL_CONSUMED')
    && added.some((e)=>e?.type==='HUMAN_AUTHORIZED_CORRECTION_STARTED');
  if(!approved){
    problems.push('#'+String(current.index).padStart(3,'0')+': HUMAN protegido alterado sem approval consumida: '+touched.join(', '));
  }
}
if(problems.length){
  console.error('Human protected diff: BLOCKED');
  for(const problem of problems) console.error('- '+problem);
  process.exit(1);
}
console.log('Human protected diff: PASS');

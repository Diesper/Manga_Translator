'use strict';

const fs = require('fs');
const path = require('path');
const life = require('./lifecycle-core');
const human = require('./human-gate');

const repoRoot = path.resolve(__dirname, '../../..');

function parseArgs(argv) {
  const args = {};
  for (let i=0;i<argv.length;i+=1) {
    const arg=argv[i];
    if (arg === '--index') args.index=Number(argv[++i]);
    else if (arg === '--decision') args.decision=String(argv[++i] || '').toUpperCase();
    else if (arg === '--approved-by') args.approved_by=String(argv[++i] || '');
    else if (arg === '--at') args.approved_at_utc=String(argv[++i] || '');
    else if (arg === '--reason') args.reason=String(argv[++i] || '');
    else if (arg === '--workflow-run-id') args.workflow_run_id=String(argv[++i] || '');
    else if (arg === '--workflow-run-attempt') args.workflow_run_attempt=Number(argv[++i]);
    else if (arg === '--workflow-name') args.workflow_name=String(argv[++i] || '');
    else if (arg === '--repository') args.repository=String(argv[++i] || '');
    else if (arg === '--target-branch') args.target_branch=String(argv[++i] || '');
    else if (arg === '--branch-head-sha') args.branch_head_sha=String(argv[++i] || '');
    else throw new Error('argumento desconhecido: ' + arg);
  }
  return args;
}

function buildApproval(state, snapshot, args) {
  if (!snapshot.human_locked) throw new Error('UNIT_NOT_HUMAN_LOCKED');
  if (!human.HUMAN_DECISIONS.has(args.decision)) throw new Error('HUMAN_DECISION_INVALID');
  if (!args.approved_by) throw new Error('APPROVED_BY_REQUIRED');
  if (!Number.isFinite(Date.parse(args.approved_at_utc || ''))) throw new Error('APPROVED_AT_REQUIRED');
  const seed = JSON.stringify({
    index: state.index,
    cycle: snapshot.current_escalation_cycle,
    revision_id: snapshot.revision_id,
    decision: args.decision,
    approved_by: args.approved_by,
    approved_at_utc: args.approved_at_utc,
  });
  const approval = {
    schema_version: 2,
    approval_id: String(state.index).padStart(3, '0') + '-human-' + life.sha256(seed).slice(0, 16),
    index: state.index,
    locked_cycle: snapshot.current_escalation_cycle,
    decision: args.decision,
    permission: args.decision === 'ALLOW_ONE_CORRECTION' ? 'ONE_CORRECTION_CYCLE' : null,
    approved_by: args.approved_by,
    approved_at_utc: args.approved_at_utc,
    approval_source: 'workflow_dispatch',
    approval_environment: 'human-approval',
    workflow_run_id: args.workflow_run_id || null,
    workflow_run_attempt: Number(args.workflow_run_attempt) || null,
    workflow_name: args.workflow_name || null,
    repository: args.repository || null,
    target_branch: args.target_branch || null,
    branch_head_sha: args.branch_head_sha || null,
    production_sha: snapshot.production_sha,
    test_sha: snapshot.test_sha,
    bible_sha: snapshot.bible_sha,
    revision_id: snapshot.revision_id,
    reason: args.reason || '',
  };
  const problems = human.validateApproval(approval);
  if (problems.length) throw new Error(problems.join('; '));
  return approval;
}

function main(argv=process.argv.slice(2)) {
  const args=parseArgs(argv);
  if (!Number.isInteger(args.index)) throw new Error('--index obrigatório');
  const statePath=path.join(repoRoot,'docs','biblia','.state',String(args.index).padStart(3,'0')+'.json');
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  const snapshot=life.lifecycleSnapshot(state);
  const approval=buildApproval(state,snapshot,args);
  const dir=path.join(repoRoot,'docs','biblia','.coordination','human-approvals',String(args.index).padStart(3,'0'));
  fs.mkdirSync(dir,{recursive:true});
  const out=path.join(dir,approval.approval_id+'.json');
  if (fs.existsSync(out)) throw new Error('APPROVAL_ALREADY_EXISTS');
  fs.writeFileSync(out,JSON.stringify(approval,null,2)+'\n');
  console.log(path.relative(repoRoot,out).replace(/\\/g,'/'));
}

if (require.main===module) {
  try { main(); }
  catch (error) { console.error('Human approval: ERROR — '+error.message); process.exit(1); }
}

module.exports={buildApproval};

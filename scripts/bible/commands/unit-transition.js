'use strict';
const fs=require('fs');
const path=require('path');
const completion=require('../core/completion');
const life=require('../core/lifecycle-core');
const auditCore=require('../core/audit-core');
const completedAccess=require('../core/completed-access');
const humanReview=require('../storage/human-review');
const storage=require('../storage/files');
const engine=require('../core/unit-transition');
const units=require('../storage/units');
const {finalDecisionRecord,decisionIdForPipeline,tokenConsumed,tokenConsumptionCount,tokenHistoryProblems,expectedCorrectionTokenId,issueCorrectionToken,validateCorrectionToken,assertCas,requireCasPreconditions,persistSnapshot,deterministicProductionSha,workingRevision,revisionBindingProblems,currentWorkingIdentity,projectAuditDecision,planTransition,loadCorrectionTokens,tokenPath,loadToken,correctionReservationRelativePath,reservationField,activeCorrectionReservations,assertCorrectionReservation,createCorrectionReservation,releaseCorrectionReservation,ownershipIndex}={...engine,...units};

function parseCli(argv) {
  const command = argv[0] || 'status';
  const args = { command };
  for (let i=1;i<argv.length;i+=1) {
    const arg=argv[i];
    if (arg === '--index') args.index=Number(argv[++i]);
    else if (arg === '--at') args.at_utc=String(argv[++i] || '');
    else if (arg === '--approval-id') args.approval_id=String(argv[++i] || '');
    else if (arg === '--actor') args.actor=String(argv[++i] || '');
    else if (arg === '--expected-status') args.expected_status=String(argv[++i] || '');
    else if (arg === '--expected-state-sha') args.expected_state_sha=String(argv[++i] || '');
    else if (arg === '--expected-revision-id') args.expected_revision_id=String(argv[++i] || '');
    else if (arg === '--expected-cycle') args.expected_cycle=Number(argv[++i]);
    else if (arg === '--request') args.request=String(argv[++i] || '');
    else throw new Error('argumento desconhecido: ' + arg);
  }
  return args;
}

function statePathFor(root, index) {
  return path.join(root, 'docs', 'biblia', '.state', String(index).padStart(3, '0') + '.json');
}

function main(argv=process.argv.slice(2), locked=false) {
  const args=parseCli(argv);
  const root=path.resolve(__dirname,'../../..');
  if (!Number.isInteger(args.index) && args.command !== 'apply') throw new Error('--index obrigatório');
  if (!locked && ['apply', 'issue-token'].includes(args.command)) {
    const index = args.command === 'apply'
      ? Number(JSON.parse(fs.readFileSync(path.resolve(args.request), 'utf8')).index) : args.index;
    return storage.withUnitLock(root, index, () => main(argv, true));
  }

  if (args.command === 'status') {
    const state=JSON.parse(fs.readFileSync(statePathFor(root,args.index),'utf8'));
    console.log(JSON.stringify(life.lifecycleSnapshot(state),null,2));
    return;
  }

  const protocol=require('./audit-protocol');
  const model=protocol.loadModel();

  if (args.command === 'issue-token') {
    requireCasPreconditions(args);
    const state=model.states.find((item)=>item.index===args.index);
    const pipeline=model.pipelines.find((item)=>item.index===args.index);
    if (!state || !pipeline) throw new Error('INDEX_NOT_FOUND');
    completedAccess.requireOrder(state, model.human_approvals || [], args.at_utc);
    completedAccess.requireOrder(state, model.human_approvals || []);
    const stateRaw=fs.readFileSync(statePathFor(root,args.index),'utf8');
    const snapshot=life.lifecycleSnapshot(state);
    assertCas(state,snapshot,args,auditCore.gitBlobShaBuffer(Buffer.from(stateRaw)));
    const working=currentWorkingIdentity(root,state);
    const drift=revisionBindingProblems(snapshot,working);
    if (drift.length) throw new Error('TOKEN_REJECTS_WORKING_REVISION_DRIFT:'+drift.join(','));
    const approval=args.approval_id
      ? (model.human_approvals || []).find((item)=>item.approval_id===args.approval_id)
      : null;
    const reservationRel=correctionReservationRelativePath(state);
    if ((model.reservations || []).includes(reservationRel)) {
      throw new Error('UNIT_HIGH_PRIORITY_BUT_ALREADY_RESERVED');
    }
    if ((model.active_claims_and_leases || []).some((rel)=>ownershipIndex(rel)===state.index)) {
      throw new Error('CORRECTION_BLOCKED_BY_ACTIVE_AUDIT_LEASE');
    }
    const activeToken=(model.correction_tokens || []).find((item)=>(
      Number(item.index)===Number(state.index) && !tokenConsumed(state,item.token_id)
    ));
    if (activeToken) throw new Error('ACTIVE_CORRECTION_TOKEN_EXISTS:' + activeToken.token_id);
    const token=issueCorrectionToken(state,pipeline,{issued_at_utc:args.at_utc,humanApproval:approval,actor:args.actor});
    const out=tokenPath(root,state.index,token.token_id);
    fs.mkdirSync(path.dirname(out),{recursive:true});
    storage.atomicWrite(out,JSON.stringify(token,null,2)+'\n', { createOnly: true });
    console.log(path.relative(root,out).replace(/\\/g,'/'));
    return;
  }

  if (args.command === 'apply') {
    if (!args.request) throw new Error('--request obrigatório');
    const request=JSON.parse(fs.readFileSync(path.resolve(args.request),'utf8'));
    if (!Number.isInteger(Number(request.index))) throw new Error('request.index inválido');
    requireCasPreconditions(request);
    const sp=statePathFor(root,Number(request.index));
    const raw=fs.readFileSync(sp,'utf8');
    const state=JSON.parse(raw);
    const completedOrder = completedAccess.requireOrder(state, model.human_approvals || [], request.at_utc);
    completedAccess.requireOrder(state, model.human_approvals || []);
    const pipeline=model.pipelines.find((item)=>item.index===state.index) || null;
    const token=request.token_id ? loadToken(root,state.index,request.token_id) : null;
    const approval=request.approval_id
      ? (model.human_approvals || []).find((item)=>item.approval_id===request.approval_id)
      : null;
    const action=String(request.action || '').toUpperCase();
    let reservationCreated=null;
    if (action === 'START_CORRECTION') {
      request.reservation_path=correctionReservationRelativePath(state);
      if ((model.active_claims_and_leases || []).some((rel)=>ownershipIndex(rel)===state.index)) {
        throw new Error('CORRECTION_BLOCKED_BY_ACTIVE_AUDIT_LEASE');
      }
      const working=currentWorkingIdentity(root,state);
      const drift=revisionBindingProblems(token || {},working);
      if (drift.length) throw new Error('TOKEN_WORKING_REVISION_STALE:'+drift.join(','));
    } else if (action === 'REFRESH_REVISION_FOR_AUDIT') {
      if ((model.active_claims_and_leases || []).some((rel)=>ownershipIndex(rel)===state.index)) {
        throw new Error('REVISION_REFRESH_BLOCKED_BY_ACTIVE_AUDIT_LEASE');
      }
      Object.assign(request, workingRevision(root, state));
    } else if (action === 'HANDOFF_FOR_AUDIT') {
      request.reservation_path=assertCorrectionReservation(root,state,request.actor);
      Object.assign(request, workingRevision(root, state));
    } else if (action === 'SAFE_ABORT') {
      const rel=correctionReservationRelativePath(state);
      if (fs.existsSync(path.join(root,rel))) request.reservation_path=assertCorrectionReservation(root,state,request.actor);
    }

    const result=planTransition({
      state,
      pipeline,
      request,
      token,
      humanApproval:approval,
      completedOrder,
      currentStateSha:auditCore.gitBlobShaBuffer(Buffer.from(raw)),
    });

    storage.transaction(root, state.index, { action, expected_state_sha: request.expected_state_sha }, () => {
    if (action === 'START_CORRECTION') {
      reservationCreated=createCorrectionReservation(root,state,request.actor,request.at_utc,token);
    }
    try {
      storage.atomicWrite(sp,JSON.stringify(result.state,null,2)+'\n', { expected: raw });
    } catch (error) {
      if (reservationCreated) {
        try { fs.unlinkSync(path.join(root,reservationCreated)); } catch (_) {}
      }
      throw error;
    }
    if (action === 'HANDOFF_FOR_AUDIT') {
      releaseCorrectionReservation(root,state,request.actor);
    } else if (action === 'SAFE_ABORT' && request.reservation_path) {
      releaseCorrectionReservation(root,state,request.actor,{optional:true});
    }

    const snapshot=life.lifecycleSnapshot(result.state);
    if (snapshot.human_locked && completion.reviewStatus(result.state) === 'HUMAN_LOCKED') {
      humanReview.writeHumanReview(root,result.state,snapshot,{
        generated_at_utc:request.at_utc,
        unverified_findings:model.unverified_findings || [],
      });
    }
    });
    const snapshot=life.lifecycleSnapshot(result.state);
    console.log(JSON.stringify({
      index:result.state.index,
      status:result.state.status,
      review_status:completion.reviewStatus(result.state),
      correction_cycle:snapshot.correction_cycle,
      escalation:snapshot.escalation_level,
      revision_id:snapshot.revision_id,
    },null,2));
    return;
  }

  throw new Error('comando desconhecido: ' + args.command);
}

// Publish before main loads audit-protocol through the dependency cycle.
module.exports={...engine,...units};
if(require.main===module){try{main();}catch(error){console.error('Unit transition: ERROR — '+error.message);process.exit(1);}}

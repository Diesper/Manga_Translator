'use strict';

const lifecycleCore = require('./lifecycle-core');

const {
  correctionRecord,
  planCorrections,
} = require('./bible-correction-work-plan');

function assert(name, condition) {
  if (!condition) throw new Error(name);
  console.log('PASS ' + name);
}

function state(index, status = 'READY_FOR_AUDIT') {
  return {
    index,
    status,
    file: 'fixture/' + index + '.js',
    bible: 'docs/biblia/fixture/' + index + '.js/Bíblia.md',
    source_sha: String(index).padStart(40, '0'),
  };
}

function pipeline(index, decision, options = {}) {
  return {
    index,
    decision,
    bible_sha: String(index).padStart(40, 'f'),
    primary: options.primary || null,
    adversarial: options.adversarial || null,
    reaudit: options.reaudit || null,
    problems: options.problems || [],
  };
}

const changeRecord = {
  phase: 'ADVERSARIAL',
  verdict: 'CHANGES_REQUIRED',
  auditor: 'AUDITOR-2',
  findings: ['erro'],
};
assert(
  'registro final prefere REAUDIT quando existe',
  correctionRecord(pipeline(1, 'CHANGES_REQUIRED', {
    primary: { phase: 'PRIMARY', verdict: 'APPROVED' },
    adversarial: changeRecord,
    reaudit: { phase: 'REAUDIT', verdict: 'CHANGES_REQUIRED', auditor: 'AUDITOR-3', findings: ['final'] },
  })).phase === 'REAUDIT'
);

const model = {
  states: [
    state(1),
    state(2),
    state(3),
    state(4, 'IN_PROGRESS'),
    state(5),
    state(6),
    state(10),
  ],
  pipelines: [
    pipeline(1, 'CHANGES_REQUIRED', { adversarial: changeRecord }),
    pipeline(2, 'WAITING_ADVERSARIAL', { primary: { verdict: 'CHANGES_REQUIRED' } }),
    pipeline(3, 'CHANGES_REQUIRED', { adversarial: changeRecord }),
    pipeline(4, 'CHANGES_REQUIRED', { adversarial: changeRecord }),
    pipeline(5, 'APPROVED', { adversarial: { verdict: 'APPROVED' } }),
    pipeline(6, 'CHANGES_REQUIRED', { adversarial: changeRecord, problems: ['pipeline inválido'] }),
    pipeline(10, 'CHANGES_REQUIRED', { adversarial: changeRecord }),
  ],
  reservations: [
    'docs/biblia/.reservas/fixture/10.js.lock.md',
  ],
  active_claims_and_leases: [
    'docs/biblia/.coordination/audit-leases/reaudit/003.lock.md',
  ],
};

const plan = planCorrections(model, 1, 4);
assert('decisão final CHANGES_REQUIRED entra na fila', plan.candidates.some((x) => x.index === 1));
assert('PRIMARY CHANGES_REQUIRED sozinho não abre correção', !plan.candidates.some((x) => x.index === 2));
assert('índice com ownership de auditoria ativo fica fora', !plan.candidates.some((x) => x.index === 3));
assert('IN_PROGRESS editorial fica fora', !plan.candidates.some((x) => x.index === 4));
assert('APPROVED fica fora', !plan.candidates.some((x) => x.index === 5));
assert('pipeline com problemas não vira correção', !plan.candidates.some((x) => x.index === 6));
assert('reserva editorial ativa fica fora da fila', !plan.candidates.some((x) => x.index === 10));
assert('candidato expõe source_sha + bible_sha', plan.candidates[0].source_sha && plan.candidates[0].bible_sha);

const humanState = state(7, 'HUMAN_LOCKED');
humanState.bible_sha = '7'.repeat(40);
humanState.history = [];
for (let i=1;i<=7;i+=1) {
  humanState.history.push({
    at_utc: '2026-10-01T0' + i + ':10:00Z',
    type: lifecycleCore.HANDOFF_EVENT,
    source_sha: humanState.source_sha,
    bible_sha: humanState.bible_sha,
  });
}
const humanModel = {
  states:[humanState],
  pipelines:[pipeline(7,'CHANGES_REQUIRED',{adversarial:changeRecord})],
  active_claims_and_leases:[],
};
assert('HUMAN nunca entra na fila de correção', planCorrections(humanModel,1,4).candidates.length === 0);

const highState = state(8);
highState.bible_sha = '8'.repeat(40);
highState.history = [];
for (let i=1;i<=4;i+=1) {
  highState.history.push({
    at_utc: '2026-10-01T0' + i + ':10:00Z',
    type: lifecycleCore.HANDOFF_EVENT,
    source_sha: highState.source_sha,
    bible_sha: highState.bible_sha,
  });
}
const normalState = state(9);
normalState.bible_sha = '9'.repeat(40);
const priorityPlan = planCorrections({
  states:[normalState,highState],
  pipelines:[
    pipeline(9,'CHANGES_REQUIRED',{adversarial:changeRecord}),
    pipeline(8,'CHANGES_REQUIRED',{adversarial:changeRecord}),
  ],
  active_claims_and_leases:[],
},1,4);
assert('HIGH precede NORMAL dentro da fila de correção', priorityPlan.candidates[0].index === 8);
assert('candidato expõe escalation e exige token', priorityPlan.candidates[0].escalation_level === 'HIGH' && priorityPlan.candidates[0].correction_token_required === true);

function escalatedState(index, cycles) {
  const item=state(index);
  item.bible_sha=String(index).padStart(40,'e');
  item.history=[];
  for(let i=1;i<=cycles;i+=1){
    item.history.push({
      at_utc:'2026-10-01T'+String(i).padStart(2,'0')+':10:00Z',
      type:lifecycleCore.HANDOFF_EVENT,
      source_sha:item.source_sha,
      bible_sha:item.bible_sha,
    });
  }
  return item;
}
const elevated=escalatedState(11,3);
const high=escalatedState(12,4);
const critical=escalatedState(13,5);
const emergency=escalatedState(14,6);
const escalationPlan=planCorrections({
  states:[elevated,high,critical,emergency],
  pipelines:[
    pipeline(11,'CHANGES_REQUIRED',{adversarial:changeRecord}),
    pipeline(12,'CHANGES_REQUIRED',{adversarial:changeRecord}),
    pipeline(13,'CHANGES_REQUIRED',{adversarial:changeRecord}),
    pipeline(14,'CHANGES_REQUIRED',{adversarial:changeRecord}),
  ],
  reservations:[],
  active_claims_and_leases:[],
},1,4);
assert(
  'EMERGENCY > CRITICAL > HIGH > ELEVATED',
  JSON.stringify(escalationPlan.candidates.map((x)=>x.escalation_level))
    === JSON.stringify(['EMERGENCY','CRITICAL','HIGH','ELEVATED'])
);
assert(
  'priority scores strictly descend from cycle 6 to 3',
  escalationPlan.candidates.every((item,i,list)=>i===0 || list[i-1].priority_score>item.priority_score)
);
assert(
  'EMERGENCY candidate requires root-cause review',
  escalationPlan.candidates[0].root_cause_review_required === true
);
assert(
  'cycle 3 and cycle 6 expose periodic strategy review',
  escalationPlan.candidates.find((item)=>item.index===11).strategy_review_required === true
    && escalationPlan.candidates.find((item)=>item.index===14).strategy_review_required === true
);
console.log('PASS full escalation priority ordering');

console.log('Bible correction work plan self-test: SUCCESS');

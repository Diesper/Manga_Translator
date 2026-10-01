'use strict';

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
  ],
  pipelines: [
    pipeline(1, 'CHANGES_REQUIRED', { adversarial: changeRecord }),
    pipeline(2, 'WAITING_ADVERSARIAL', { primary: { verdict: 'CHANGES_REQUIRED' } }),
    pipeline(3, 'CHANGES_REQUIRED', { adversarial: changeRecord }),
    pipeline(4, 'CHANGES_REQUIRED', { adversarial: changeRecord }),
    pipeline(5, 'APPROVED', { adversarial: { verdict: 'APPROVED' } }),
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
assert('candidato expõe source_sha + bible_sha', plan.candidates[0].source_sha && plan.candidates[0].bible_sha);

console.log('Bible correction work plan self-test: SUCCESS');

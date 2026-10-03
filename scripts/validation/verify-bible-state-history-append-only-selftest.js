'use strict';

const assert = require('assert');
const guard = require('./verify-bible-state-history-append-only');

function state(history) {
  return { index: 191, history };
}

const base = state([
  { at_utc:'2026-10-02T01:00:00Z', type:'A', value:1 },
  { at_utc:'2026-10-02T02:00:00Z', type:'B', value:2 },
]);

assert.deepStrictEqual(
  guard.historyAppendOnlyProblems(base, state([
    ...base.history,
    { at_utc:'2026-10-02T03:00:00Z', type:'C', value:3 },
  ])),
  []
);
console.log('PASS appending lifecycle event is allowed');

let problems = guard.historyAppendOnlyProblems(base, state([
  base.history[1],
]));
assert.ok(problems.some((x)=>x.includes('history truncado')));
console.log('PASS deleting an old event is rejected');

problems = guard.historyAppendOnlyProblems(base, state([
  { at_utc:'2026-10-02T01:00:00Z', type:'A', value:999 },
  base.history[1],
]));
assert.ok(problems.some((x)=>x.includes('append-only na posição 0')));
console.log('PASS mutating an old event is rejected');

problems = guard.historyAppendOnlyProblems(base, state([
  base.history[0],
  { at_utc:'2026-10-02T01:30:00Z', type:'INSERTED' },
  base.history[1],
]));
assert.ok(problems.some((x)=>x.includes('append-only na posição 1')));
console.log('PASS inserting an event in the middle is rejected');

const reorderedObjectKeys = state([
  { value:1, type:'A', at_utc:'2026-10-02T01:00:00Z' },
  { value:2, at_utc:'2026-10-02T02:00:00Z', type:'B' },
]);
assert.deepStrictEqual(guard.historyAppendOnlyProblems(base, reorderedObjectKeys),[]);
console.log('PASS JSON key order does not create false positive');

const invalidHashEvent = {
  at_utc:'2026-10-02T03:00:00Z',
  type:'HASHED',
  value:3,
  previous_event_hash:'a'.repeat(64),
  event_hash:'b'.repeat(64),
};
const repairedHashEvent = {
  ...invalidHashEvent,
  event_hash: guard.canonicalEventHash(invalidHashEvent),
};
assert.deepStrictEqual(
  guard.historyAppendOnlyProblems(
    state([invalidHashEvent]),
    state([repairedHashEvent])
  ),
  []
);
console.log('PASS canonical hash-only repair is allowed');

problems = guard.historyAppendOnlyProblems(
  state([invalidHashEvent]),
  state([{ ...repairedHashEvent, value:999 }])
);
assert.ok(problems.some((x)=>x.includes('append-only na posição 0')));
console.log('PASS hash repair cannot smuggle semantic payload changes');

const validHashEvent = repairedHashEvent;
problems = guard.historyAppendOnlyProblems(
  state([validHashEvent]),
  state([{ ...validHashEvent, event_hash:'c'.repeat(64) }])
);
assert.ok(problems.some((x)=>x.includes('append-only na posição 0')));
console.log('PASS already-valid lifecycle hash cannot be rewritten');

const rawLine=':100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40)
  + ' M\tdocs/biblia/.state/191.json';
const parsed=guard.parseRawHistory(rawLine);
assert.strictEqual(parsed.length,1);
assert.strictEqual(parsed[0].status,'M');
assert.strictEqual(parsed[0].file,'docs/biblia/.state/191.json');
console.log('PASS historical raw Git state change parser');

console.log('State history append-only self-test: SUCCESS');

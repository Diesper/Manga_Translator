'use strict';

const {
  parseNameStatusLog,
  appendOnlyViolations,
} = require('./verify-audit-results-append-only');

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(name + (detail ? ': ' + detail : ''));
  console.log('PASS ' + name);
}

const addedOnly = parseNameStatusLog([
  '@@COMMIT aaa111',
  'A\tdocs/biblia/.coordination/audit-results/001/primary/a.json',
  '@@COMMIT bbb222',
  'A\tdocs/biblia/.coordination/audit-results/001/adversarial/b.json',
].join('\n'));
assert('append-only aceita somente A', appendOnlyViolations(addedOnly).length === 0);

const modified = parseNameStatusLog([
  '@@COMMIT aaa111',
  'A\tdocs/biblia/.coordination/audit-results/001/primary/a.json',
  '@@COMMIT bbb222',
  'M\tdocs/biblia/.coordination/audit-results/001/primary/a.json',
].join('\n'));
assert(
  'append-only rejeita M',
  appendOnlyViolations(modified).some((v) => v.status === 'M')
);

const deleted = parseNameStatusLog([
  '@@COMMIT ccc333',
  'D\tdocs/biblia/.coordination/audit-results/002/adversarial/c.json',
].join('\n'));
assert(
  'append-only rejeita D',
  appendOnlyViolations(deleted).some((v) => v.status === 'D')
);

const renamed = parseNameStatusLog([
  '@@COMMIT ddd444',
  'R100\tdocs/biblia/.coordination/audit-results/003/primary/old.json\tdocs/biblia/.coordination/audit-results/003/primary/new.json',
].join('\n'));
const renameViolations = appendOnlyViolations(renamed);
assert('append-only rejeita rename', renameViolations.length === 1 && renameViolations[0].status === 'R100');

const unrelated = parseNameStatusLog([
  '@@COMMIT eee555',
  'M\tdocs/biblia/README.md',
].join('\n'));
assert('mudança fora de audit-results é ignorada', appendOnlyViolations(unrelated).length === 0);

console.log('Audit results append-only self-test: SUCCESS');

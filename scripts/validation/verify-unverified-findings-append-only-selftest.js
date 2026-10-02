'use strict';

const assert = require('assert');
const guard = require('./verify-unverified-findings-append-only');

assert.strictEqual(
  guard.artifactKind('docs/biblia/.coordination/unverified-findings/191/191-UF-001.json'),
  'FINDING'
);
assert.strictEqual(
  guard.artifactKind('docs/biblia/.coordination/unverified-finding-events/191/191-UF-001/191-UF-001-EV-abcd.json'),
  'EVENT'
);
console.log('PASS finding/event artifact scope');

let problems = guard.addedArtifactProblems(
  'docs/biblia/.coordination/unverified-findings/191/191-UF-001.json',
  {
    schema_version:1,
    id:'191-UF-001',
    index:191,
    status:'UNVERIFIED',
    may_change_lifecycle:false,
  }
);
assert.deepStrictEqual(problems,[]);
console.log('PASS new finding must be born UNVERIFIED');

problems = guard.addedArtifactProblems(
  'docs/biblia/.coordination/unverified-findings/191/191-UF-001.json',
  {
    schema_version:1,
    id:'191-UF-001',
    index:191,
    status:'CONFIRMED',
    may_change_lifecycle:false,
  }
);
assert.ok(problems.some((x)=>x.includes('deve nascer UNVERIFIED')));
console.log('PASS pre-confirmed finding addition is rejected');

problems = guard.addedArtifactProblems(
  'docs/biblia/.coordination/unverified-finding-events/191/191-UF-001/191-UF-001-EV-1234.json',
  {
    schema_version:1,
    event_id:'191-UF-001-EV-1234',
    finding_id:'WRONG',
    index:191,
  }
);
assert.ok(problems.some((x)=>x.includes('finding_id diverge')));
console.log('PASS event path identity is enforced');

const rawLine=':100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40)
  + ' M\tdocs/biblia/.coordination/unverified-findings/191/191-UF-001.json';
const parsed=guard.parseRawHistory(rawLine);
assert.strictEqual(parsed.length,1);
assert.strictEqual(parsed[0].status,'M');
assert.strictEqual(parsed[0].file,'docs/biblia/.coordination/unverified-findings/191/191-UF-001.json');
console.log('PASS historical raw finding change parser');

let baselineProblems = guard.addedArtifactProblems(
  'docs/biblia/.coordination/unverified-findings-legacy-baseline.json',
  {
    schema_version:1,
    effective_at_utc:'2026-10-02T07:28:18Z',
    legacy_findings:{
      'docs/biblia/.coordination/unverified-findings/191/191-UF-001.json':{
        blob_sha:'a'.repeat(40),
        status:'CONFIRMED_BY_PRIMARY',
      },
    },
  }
);
assert.deepStrictEqual(baselineProblems,[]);
console.log('PASS baseline legado válido é aceito');

baselineProblems = guard.addedArtifactProblems(
  'docs/biblia/.coordination/unverified-findings-legacy-baseline.json',
  {
    schema_version:1,
    legacy_findings:{
      'not-a-finding':{blob_sha:'bad',status:'UNVERIFIED'},
    },
  }
);
assert.ok(baselineProblems.length >= 2);
console.log('PASS baseline legado malformado é rejeitado');

console.log('Unverified findings append-only self-test: SUCCESS');

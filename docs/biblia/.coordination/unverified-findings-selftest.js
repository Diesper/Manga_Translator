'use strict';

const assert = require('assert');
const { lifecycleSnapshot } = require('./lifecycle-core');
const { validateFinding, buildFinding } = require('./unverified-findings');

const state = {
  index: 5,
  status: 'READY_FOR_AUDIT',
  file: 'fixture.js',
  bible: 'docs/biblia/fixture/Bíblia.md',
  source_sha: 'a'.repeat(40),
  bible_sha: 'b'.repeat(40),
  history: [],
};
const snapshot = lifecycleSnapshot(state);
const finding = buildFinding(state, snapshot, {
  id: '005-UF-001',
  reported_by: 'CORRETOR-1',
  reported_at_utc: '2026-10-02T06:30:00Z',
  title: 'possível race',
  finding: 'há uma janela de race',
  evidence: 'inspeção do caminho real',
  suggested_test: 'forçar callbacks fora de ordem',
});
assert.strictEqual(finding.status, 'UNVERIFIED');
assert.strictEqual(finding.may_change_lifecycle, false);
assert.deepStrictEqual(validateFinding(finding), []);
console.log('PASS UNVERIFIED não possui autoridade de lifecycle');

const autoPrimary = { ...finding, status: 'CONFIRMED_BY_PRIMARY', confirmed_by_primary: 'CORRETOR-1' };
assert.ok(validateFinding(autoPrimary).some((x) => x.includes('auto-confirmar')));
console.log('PASS reporter não pode auto-confirmar PRIMARY');

const confirmed = {
  ...finding,
  status: 'CONFIRMED',
  confirmed_by_primary: 'AUDITOR-1',
  confirmed_by_adversarial: 'AUDITOR-2',
};
assert.deepStrictEqual(validateFinding(confirmed), []);
console.log('PASS auditores independentes podem confirmar finding');

const bad = { ...finding, may_change_lifecycle: true };
assert.ok(validateFinding(bad).some((x) => x.includes('may_change_lifecycle')));
console.log('PASS finding não pode adquirir autoridade por edição');

console.log('Unverified findings self-test: SUCCESS');

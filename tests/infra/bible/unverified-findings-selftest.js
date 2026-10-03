'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lifecycleSnapshot } = require('../../../scripts/bible/core/lifecycle-core');
const { validateFinding, buildFinding, loadUnverifiedFindings, gitBlobShaBuffer, LEGACY_BASELINE_RELATIVE } = require('../../../scripts/bible/storage/unverified-findings');

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
const stateBeforeFinding=JSON.stringify(state);
const cycleBeforeFinding=snapshot.correction_cycle;
const revisionBeforeFinding=snapshot.revision_id;
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
assert.strictEqual(JSON.stringify(state),stateBeforeFinding);
assert.strictEqual(lifecycleSnapshot(state).correction_cycle,cycleBeforeFinding);
assert.strictEqual(lifecycleSnapshot(state).revision_id,revisionBeforeFinding);
assert.strictEqual(Object.prototype.hasOwnProperty.call(finding,'correction_token'),false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(finding,'authorization'),false);
console.log('PASS UNVERIFIED não possui autoridade de lifecycle');
console.log('PASS finding creation preserves status/cycle/revision and cannot mint token');

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unverified-baseline-'));
const findingDir = path.join(tmp, 'docs', 'biblia', '.coordination', 'unverified-findings', '005');
fs.mkdirSync(findingDir, { recursive: true });
const legacy = {
  ...finding,
  status:'CONFIRMED_BY_PRIMARY',
  reported_by:'CORRETOR-1',
  confirmed_by_primary:'AUDITOR-1',
};
const legacyRaw = JSON.stringify(legacy, null, 2) + '\n';
const legacyRel = 'docs/biblia/.coordination/unverified-findings/005/005-UF-001.json';
fs.writeFileSync(path.join(tmp, legacyRel), legacyRaw);
const baselinePath = path.join(tmp, LEGACY_BASELINE_RELATIVE);
fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
fs.writeFileSync(baselinePath, JSON.stringify({
  schema_version:1,
  legacy_findings:{
    [legacyRel]:{
      blob_sha:gitBlobShaBuffer(Buffer.from(legacyRaw)),
      status:'CONFIRMED_BY_PRIMARY',
    },
  },
}, null, 2) + '\n');

let loaded = loadUnverifiedFindings(tmp);
assert.deepStrictEqual(loaded.problems,[]);
assert.strictEqual(loaded.findings[0].status,'CONFIRMED_BY_PRIMARY');
console.log('PASS exact legacy promoted finding is accepted only through immutable baseline');

fs.writeFileSync(path.join(tmp, legacyRel), JSON.stringify({...legacy,evidence:'tampered'}, null, 2) + '\n');
loaded = loadUnverifiedFindings(tmp);
assert.ok(loaded.problems.some((x)=>x.includes('baseline legada imutável')));
console.log('PASS mutated legacy promoted finding is rejected by blob baseline');

const newPromotedRel='docs/biblia/.coordination/unverified-findings/005/005-UF-002.json';
fs.writeFileSync(path.join(tmp,newPromotedRel),JSON.stringify({
  ...legacy,
  id:'005-UF-002',
  evidence:'new pre-promoted artifact',
},null,2)+'\n');
loaded=loadUnverifiedFindings(tmp);
assert.ok(loaded.problems.some((x)=>x.includes('005-UF-002') && x.includes('baseline legada imutável')));
console.log('PASS new base finding cannot bypass queue by starting promoted');

fs.rmSync(tmp,{recursive:true,force:true});

console.log('Unverified findings self-test: SUCCESS');

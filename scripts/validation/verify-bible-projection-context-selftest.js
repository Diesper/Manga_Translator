'use strict';

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../../docs/biblia/.coordination/audit-core');

const repoRoot = path.resolve(__dirname, '../..');
const tempParent = fs.realpathSync(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(tempParent, 'pr66-projection-context-'));
function write(relative, content) {
  const absolute = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

try {
  // Execute the actual generator and actual decision engine in a fixture root.
  // No production function is reimplemented or replaced with a mock.
  for (const relative of [
    'scripts/validation/generate-bible-projections.js',
    'scripts/validation/bible-coordination.js',
    'scripts/validation/bible-audit-pipeline.js',
    'docs/biblia/.coordination/audit-core.js',
    'docs/biblia/.coordination/lifecycle-core.js',
  ]) write(relative, fs.readFileSync(path.join(repoRoot, relative)));

  const source = 'fixture/source.js';
  const bible = 'docs/biblia/fixture/source.js/Bíblia.md';
  const sourceSha = core.gitBlobShaBuffer(Buffer.from('source\n'));
  const oldBibleSha = core.gitBlobShaBuffer(Buffer.from('old Bible\n'));
  const newBibleSha = core.gitBlobShaBuffer(Buffer.from('new Bible\n'));
  write(source, 'source\n');
  write(bible, 'new Bible\n');
  const state = { schema_version: 2, index: 1, file: source, bible,
    source_sha: sourceSha, status: 'READY_FOR_AUDIT', history: [], audit_requests: [] };
  write('docs/biblia/.state/001.json', JSON.stringify(state));
  write('docs/biblia/AUDITORIA.md', '# Auditoria\n');
  write(core.BASELINE_RELATIVE, JSON.stringify({ schema_version: 1,
    bibles: { '001': { bible, bible_sha: newBibleSha } } }));

  const results = [
    ['PRIMARY', 'APPROVED', 'primary-auditor'],
    ['ADVERSARIAL', 'APPROVED', 'adversarial-auditor'],
    ['REAUDIT', 'APPROVED', 'reauditor'],
  ];
  for (const [phase, verdict, auditor] of results) {
    const record = { schema_version: 2, index: 1, phase, verdict, auditor,
      file: source, bible, source_sha: sourceSha, bible_sha: oldBibleSha,
      findings: [], completed_at_utc: '2026-10-01T12:00:00Z' };
    write('docs/biblia/.coordination/audit-results/001/' + phase.toLowerCase() + '/old.json', JSON.stringify(record));
  }

  const loaded = core.loadAuditResults(fixture, [state]);
  assert.deepStrictEqual(loaded.problems, []);
  const canonical = core.evaluateAuditPipelines([state], loaded.records, new Map(), {
    root: fixture, baseline: loaded.baseline,
  });
  assert.deepStrictEqual(canonical.problems, []);
  assert.strictEqual(canonical.byIndex.get(1).decision, 'WAITING_PRIMARY');

  const generator = path.join(fixture, 'scripts/validation/generate-bible-projections.js');
  const run = cp.spawnSync(process.execPath, [generator, '--write'], { cwd: fixture, encoding: 'utf8' });
  assert.strictEqual(run.status, 0, 'generator must ignore audits for an older Bible revision:\n' + run.stderr);
  assert.match(fs.readFileSync(path.join(fixture, 'docs/biblia/STATUS.md'), 'utf8'), /READY_FOR_AUDIT/);
  assert.strictEqual(fs.readFileSync(path.join(fixture, bible), 'utf8'), 'new Bible\n');
  console.log('PASS projection generator agrees with canonical decision when Bible-only edit supersedes old audits');

  // The same records become current when the Bible bytes actually match.
  // The invalid REAUDIT must now block instead of being silently discarded.
  write(bible, 'old Bible\n');
  const invalid = cp.spawnSync(process.execPath, [generator, '--write'], { cwd: fixture, encoding: 'utf8' });
  assert.strictEqual(invalid.status, 1);
  assert.match(invalid.stderr, /REAUDIT só é válido/);
  console.log('PASS current-revision invalid REAUDIT still blocks projection writes');
  console.log('Bible projection revision context self-test: SUCCESS');
} finally {
  core.clearGitSnapshotCache(fixture);
  const resolved = fs.realpathSync(fixture);
  if (path.dirname(resolved) !== tempParent || !path.basename(resolved).startsWith('pr66-projection-context-')) {
    throw new Error('Unexpected projection fixture cleanup target');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

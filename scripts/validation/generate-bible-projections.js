'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseAuditRegistry,
  buildDerived,
  validateBibleCoordination,
  evaluateMergeReadiness,
} = require('./bible-coordination');

const root = path.resolve(__dirname, '../..');
const bibleRoot = path.join(root, 'docs', 'biblia');
const stateRoot = path.join(bibleRoot, '.state');
const writeMode = process.argv.includes('--write');
const mergeReadyMode = process.argv.includes('--merge-ready');
if (writeMode && mergeReadyMode) {
  console.error('Use --write ou --merge-ready, não ambos.');
  process.exit(2);
}
const mode = writeMode ? 'write' : (mergeReadyMode ? 'merge-ready' : 'check');

function readStates() {
  const names = fs.readdirSync(stateRoot)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .sort();
  return names.map((name) => JSON.parse(fs.readFileSync(path.join(stateRoot, name), 'utf8')))
    .sort((a, b) => a.index - b.index);
}
function normalized(s) {
  return s.replace(/\r\n/g, '\n').trimEnd() + '\n';
}

const states = readStates();
const auditSource = fs.readFileSync(path.join(bibleRoot, 'AUDITORIA.md'), 'utf8');
const audits = parseAuditRegistry(auditSource);
const generated = buildDerived(states, audits, 'states-v2');

const outputs = [
  ['STATUS.md', generated.status],
  ['CHECKLIST.md', generated.checklist],
];

if (mode === 'write') {
  for (const [name, content] of outputs) {
    fs.writeFileSync(path.join(bibleRoot, name), normalized(content));
    process.stdout.write('wrote docs/biblia/' + name + '\n');
  }
  process.stdout.write('Bible projections regenerated: SUCCESS\n');
  process.exit(0);
}

const stale = [];
for (const [name, content] of outputs) {
  const current = normalized(fs.readFileSync(path.join(bibleRoot, name), 'utf8'));
  if (current !== normalized(content)) stale.push(name);
}
if (stale.length) {
  console.error('Bible projections stale: ' + stale.join(', '));
  console.error('Run: node scripts/validation/generate-bible-projections.js --write');
  console.error('--- EXPECTED STATUS.md ---');
  console.error(normalized(generated.status));
  console.error('--- EXPECTED CHECKLIST.md ---');
  console.error(normalized(generated.checklist));
  console.error('--- END EXPECTED PROJECTIONS ---');
  process.exit(1);
}
process.stdout.write('Bible projections check: SUCCESS\n');

if (mode === 'merge-ready') {
  const validation = validateBibleCoordination(root, {
    checkDerived: true,
    headLabel: 'states-v2',
  });
  const progressLockActive = fs.existsSync(path.join(bibleRoot, '.coordination', 'PROGRESS.lock.md'));
  const readiness = evaluateMergeReadiness(validation, { progressLockActive });

  process.stdout.write(
    'Merge readiness local: states=' + readiness.counts.states
    + ', completed=' + readiness.counts.completed
    + ', nonCompleted=' + readiness.counts.nonCompleted
    + ', reservations=' + readiness.counts.reservations
    + ', auditClaims=' + readiness.counts.auditClaims
    + ', requests.OPEN=' + readiness.counts.requests.OPEN
    + '\n'
  );

  if (!readiness.ready) {
    console.error('Repository-local merge readiness: NOT_READY');
    for (const blocker of readiness.blockers) console.error('- ' + blocker);
    console.error('External requirement remains: GitHub Actions must pass for the exact final SHA.');
    process.exit(1);
  }

  process.stdout.write('Repository-local merge readiness: READY\n');
  process.stdout.write('External requirement: GitHub Actions must pass for the exact final SHA.\n');
}

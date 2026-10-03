'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseAuditRegistry,
  buildDerived,
} = require('./bible-coordination');
const {
  loadAuditResults,
  evaluateAuditPipelines,
} = require('./bible-audit-pipeline');

const root = path.resolve(__dirname, '../..');
const bibleRoot = path.join(root, 'docs', 'biblia');
const stateRoot = path.join(bibleRoot, '.state');
const mode = process.argv.includes('--write') ? 'write' : 'check';

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
const distributed = loadAuditResults(root, states);
if (distributed.problems.length) {
  console.error('Bible audit result store invalid:');
  for (const problem of distributed.problems) console.error('- ' + problem);
  process.exit(1);
}
const pipelines = evaluateAuditPipelines(states, distributed.records, audits, {
  root,
  baseline: distributed.baseline,
});
if (pipelines.problems.length) {
  console.error('Bible audit pipeline invalid:');
  for (const problem of pipelines.problems) console.error('- ' + problem);
  process.exit(1);
}
// Audit results distributed are validated above, but intentionally do not mutate
// global projections on every append-only result. STATUS/CHECKLIST are legacy
// compatibility views reconciled in batches.
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

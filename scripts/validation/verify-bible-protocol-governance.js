'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED = {
  protocol: [
    'os: [ubuntu-latest, windows-latest]',
    'node docs/biblia/.coordination/anti-loop-integration-selftest.js',
    'node docs/biblia/.coordination/anti-loop-adversarial-selftest.js',
    'node scripts/validation/bible-anti-loop-adversarial-selftest.js',
    'npm run bible:lifecycle:verify',
    'npm run bible:lifecycle:metrics',
    'verify-human-protected-diff.js --base',
    'verify-bible-state-history-append-only.js --base',
    'verify-unverified-findings-append-only.js --base',
  ],
  handoff: [
    'branches:',
    '- docs/project-bible',
    'node docs/biblia/.coordination/anti-loop-integration-selftest.js',
    'node docs/biblia/.coordination/anti-loop-adversarial-selftest.js',
    'verify-human-protected-diff.js --base',
    'verify-bible-state-history-append-only.js --base',
    'verify-unverified-findings-append-only.js --base',
  ],
  human: [
    'workflow_dispatch:',
    'environment: human-approval',
    'github-actions[bot]',
    'human-approval.js',
  ],
  transition: [
    'workflow_dispatch:',
    'bible-unit-transition-${{ inputs.index }}',
    'node scripts/validation/verify-bible-lifecycle.js',
    'git add -A docs/biblia/.state/ docs/biblia/.reservas/',
  ],
  ci: [
    'name: CI Gate',
    'name: Bible Final Readiness',
    'npm run bible:final-readiness',
    'node scripts/validation/verify-bible-protocol-governance.js',
  ],
};

function loadSources(root) {
  function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  }
  return {
    protocol: read('.github/workflows/bible-protocol-infra.yml'),
    handoff: read('.github/workflows/bible-handoff-guard.yml'),
    human: read('.github/workflows/bible-human-approval.yml'),
    transition: read('.github/workflows/bible-unit-transition.yml'),
    ci: read('.github/workflows/ci.yml'),
  };
}

function validateSources(sources) {
  const problems = [];
  for (const [key, fragments] of Object.entries(REQUIRED)) {
    const source = String(sources?.[key] || '');
    if (!source) {
      problems.push(key + ': workflow source ausente');
      continue;
    }
    for (const fragment of fragments) {
      if (!source.includes(fragment)) {
        problems.push(key + ': controle obrigatório ausente: ' + fragment);
      }
    }
  }

  const handoff = String(sources?.handoff || '');
  const onBlock = handoff.split(/\n(?=permissions:|concurrency:)/)[0] || handoff;
  if (/^\s+paths(?:-ignore)?:/m.test(onBlock)) {
    problems.push('handoff: workflow de todo push não pode ser limitado por paths');
  }

  return [...new Set(problems)];
}

function main() {
  const root = path.resolve(__dirname, '../..');
  const problems = validateSources(loadSources(root));
  if (problems.length) {
    console.error('Bible protocol governance: BLOCKED');
    for (const problem of problems) console.error('- ' + problem);
    process.exit(1);
  }
  console.log('Bible protocol governance: PASS');
}

if (require.main === module) main();

module.exports = {
  REQUIRED,
  loadSources,
  validateSources,
};

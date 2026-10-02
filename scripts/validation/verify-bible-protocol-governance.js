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

function stepBlockForFragment(source, fragment) {
  const lines = String(source || '').split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(fragment));
  if (index < 0) return '';
  let start = index;
  while (start > 0 && !/^\s*- name:\s*/.test(lines[start])) start -= 1;
  if (!/^\s*- name:\s*/.test(lines[start])) start = index;
  let end = index + 1;
  while (end < lines.length && !/^\s*- name:\s*/.test(lines[end])) end += 1;
  return lines.slice(start, end).join('\n');
}

function disabledControlProblems(key, source, fragments) {
  const problems = [];
  const criticalWholeWorkflow = new Set(['protocol', 'handoff', 'human', 'transition']);
  if (criticalWholeWorkflow.has(key)) {
    const forbidden = [
      { re:/^\s*continue-on-error:\s*true\s*$/mi, label:'continue-on-error: true' },
      { re:/^\s*if:\s*(?:\$\{\{\s*)?false(?:\s*\}\})?\s*$/mi, label:'if: false' },
    ];
    for (const item of forbidden) {
      if (item.re.test(source)) {
        problems.push(key + ': workflow crítico contém bypass proibido: ' + item.label);
      }
    }
  }

  for (const fragment of fragments || []) {
    const block = stepBlockForFragment(source, fragment);
    if (!block) continue;
    if (/^\s*continue-on-error:\s*true\s*$/mi.test(block)) {
      problems.push(key + ': controle obrigatório tolera falha: ' + fragment);
    }
    if (/^\s*if:\s*(?:\$\{\{\s*)?false(?:\s*\}\})?\s*$/mi.test(block)) {
      problems.push(key + ': controle obrigatório desativado por if=false: ' + fragment);
    }
    const runLine = block.split(/\r?\n/).find((line) => line.includes(fragment)) || '';
    if (/\|\|\s*true(?:\s|$)/.test(runLine) || /;\s*true\s*$/.test(runLine)) {
      problems.push(key + ': controle obrigatório mascarado por shell bypass: ' + fragment);
    }
  }
  return problems;
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
    problems.push(...disabledControlProblems(key, source, fragments));
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
  stepBlockForFragment,
  disabledControlProblems,
  validateSources,
};

'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED = {
  protocol: [
    'os: [ubuntu-latest, windows-latest]',
    'group: bible-protocol-infra-${{ github.ref }}',
    'cancel-in-progress: false',
    'node tests/infra/bible/anti-loop-integration-selftest.js',
    'node tests/infra/bible/anti-loop-adversarial-selftest.js',
    'node scripts/validation/bible-anti-loop-adversarial-selftest.js',
    'npm run test:bible-completion:infra',
    'npm run bible:lifecycle:verify',
    'npm run bible:lifecycle:metrics',
    'npm run bible:lifecycle:metrics:check',
    'verify-human-protected-diff.js --base',
    'verify-lifecycle-artifacts-append-only.js --base',
    'verify-bible-state-history-append-only.js --base',
    'verify-unverified-findings-append-only.js --base',
    'npm run bible:audit:append-only',
    'node scripts/bible/commands/audit-protocol.js status > audit-protocol-status.txt',
    'node scripts/bible/commands/audit-lease-gc.js',
    'node scripts/bible/commands/audit-summary.js',
  ],
  handoff: [
    'branches:',
    '- docs/project-bible',
    'group: bible-handoff-guard-${{ github.ref }}',
    'cancel-in-progress: false',
    'node tests/infra/bible/anti-loop-integration-selftest.js',
    'node tests/infra/bible/anti-loop-adversarial-selftest.js',
    'node scripts/validation/bible-lifecycle-metrics-selftest.js',
    'node scripts/validation/bible-anti-loop-adversarial-selftest.js',
    'verify-human-protected-diff.js --base',
    'verify-bible-state-history-append-only.js --base',
    'verify-unverified-findings-append-only.js --base',
  ],
  human: [
    'workflow_dispatch:',
    'environment: human-approval',
    'ALLOW_COMPLETED_WORK',
    "context.eventName !== 'workflow_dispatch' || user.data.type !== 'User'",
    'github-actions[bot]',
    'human-approval.js',
  ],
  transition: [
    'workflow_dispatch:',
    "description: 'Correction token id for START_CORRECTION; leave blank to auto-issue canonically'",
    'if [ "$OPERATION" = "START_CORRECTION" ] && [ -z "$TOKEN_ID" ]; then',
    'AUTO_TOKEN_PATH="$(node scripts/bible/commands/unit-transition.js issue-token',
    'export TOKEN_ID',
    'REFRESH_REVISION_FOR_AUDIT',
    'bible-unit-transition-${{ inputs.index }}',
    'node scripts/validation/verify-bible-lifecycle.js',
    'git add -A docs/biblia/.state/ docs/biblia/.reservas/',
  ],
  ci: [
    'name: CI Gate',
    'group: ci-${{ github.workflow }}-${{ github.ref }}',
    'cancel-in-progress: false',
    'name: Bible Final Readiness',
    'npm run bible:final-readiness',
    'node scripts/validation/verify-bible-protocol-governance.js',
  ],
  package: [
    '"bible:lifecycle:metrics:check": "node scripts/validation/bible-lifecycle-metrics.js --check"',
    'npm run bible:lifecycle:metrics:check',
  ],
};

const PROTOCOL_POST_LIFECYCLE_CONTROLS = [
  { command: 'npm run bible:lifecycle:metrics', pushOnly: false },
  { command: 'npm run bible:lifecycle:metrics:check', pushOnly: false },
  { command: 'verify-human-protected-diff.js --base', pushOnly: true },
  { command: 'verify-lifecycle-artifacts-append-only.js --base', pushOnly: true },
  { command: 'verify-bible-state-history-append-only.js --base', pushOnly: true },
  { command: 'verify-unverified-findings-append-only.js --base', pushOnly: true },
  { command: 'npm run bible:audit:append-only', pushOnly: false },
  { command: 'node scripts/bible/commands/audit-protocol.js status > audit-protocol-status.txt', pushOnly: false },
  { command: 'node scripts/bible/commands/audit-lease-gc.js', pushOnly: false },
  { command: 'node scripts/bible/commands/audit-summary.js', pushOnly: false },
];

function loadSources(root) {
  function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
  }
  return {
    protocol: read('.github/workflows/bible-protocol-infra.yml'),
    handoff: read('.github/workflows/bible-handoff-guard.yml'),
    human: read('.github/workflows/bible-human-approval.yml'),
    transition: read('.github/workflows/bible-unit-transition.yml'),
    ci: read('.github/workflows/ci.yml'),
    reconcile: read('.github/workflows/bible-reconcile-checkpoint.yml'),
    package: read('package.json'),
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
  const criticalWholeWorkflow = new Set(['protocol', 'handoff', 'human', 'transition', 'reconcile']);
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

function protocolContinuationProblems(source) {
  const problems = [];
  for (const control of PROTOCOL_POST_LIFECYCLE_CONTROLS) {
    const block = stepBlockForFragment(source, control.command);
    if (!block) continue;
    const expected = control.pushOnly
      ? /^\s*if:\s*\$\{\{\s*always\(\)\s*&&\s*github\.event_name\s*==\s*['"]push['"]\s*\}\}\s*$/mi
      : /^\s*if:\s*\$\{\{\s*always\(\)\s*\}\}\s*$/mi;
    if (!expected.test(block)) {
      problems.push('protocol: controle pós-lifecycle não continua após bloqueio anterior: ' + control.command);
    }
  }
  return problems;
}

function reconcileRefreshProblems(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const observedIds = [...normalized.matchAll(/^\s*id:\s*observed\s*$/gm)];
  if (observedIds.length !== 1) {
    return ['reconcile: exige exatamente um step id: observed'];
  }
  const observed = stepBlockForFragment(normalized, 'id: observed');
  const observedStart = normalized.indexOf(observed);
  const validation = 'npm run test:bible-protocol:infra';
  const mutation = 'npm run bible:reconcile:write';
  const problems = [];
  const validationPosition = normalized.indexOf(validation);
  const mutationPosition = normalized.indexOf(mutation);
  if (validationPosition < 0 || validationPosition >= observedStart) {
    problems.push('reconcile: validação do protocolo deve preceder o step observed');
  }
  if (mutationPosition < 0 || mutationPosition <= observedStart + observed.length) {
    problems.push('reconcile: mutação deve suceder o step observed completo');
  }
  // The earlier validated capture belongs to another step. Only this step
  // establishes the exact branch revision on which reconciliation may write.
  const ordered = [
    'git fetch origin docs/project-bible',
    'git reset --hard "$REMOTE_SHA"',
    'echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"',
  ];
  let previous = -1;
  for (const fragment of ordered) {
    const position = observed.indexOf(fragment);
    if (position < 0) {
      problems.push('reconcile: controle obrigatório ausente no step observed: ' + fragment);
      continue;
    }
    if (position <= previous) problems.push('reconcile: refresh/observed-head ordering inválido antes da mutação: ' + fragment);
    previous = position;
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

  problems.push(...protocolContinuationProblems(String(sources?.protocol || '')));
  problems.push(...reconcileRefreshProblems(String(sources?.reconcile || '')));

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
  PROTOCOL_POST_LIFECYCLE_CONTROLS,
  loadSources,
  stepBlockForFragment,
  disabledControlProblems,
  protocolContinuationProblems,
  reconcileRefreshProblems,
  validateSources,
};

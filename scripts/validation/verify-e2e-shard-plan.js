'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const plan = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts', 'ci', 'data', 'e2e-shard-plan.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts', 'ci', 'data', 'test-baseline.json'), 'utf8'));
const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');

function fail(message) {
  console.error('[E2E/PLAN] ' + message);
  process.exit(1);
}

function runList(extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      'test',
      '--config',
      path.join(repoRoot, 'playwright.config.js'),
      '--list',
      '--reporter=json',
      ...extraArgs,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CI: '1',
        MANGA_E2E_SHARD: '0',
        MANGA_E2E_WORKERS: '1',
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    fail('playwright --list terminou com código ' + result.status);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(result.stdout || '');
    fail('não foi possível interpretar o JSON do playwright --list: ' + error.message);
  }
}

function collectSpecs(report) {
  const keys = [];

  function visitSuite(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const project = test.projectName || '<sem-projeto>';
        keys.push([
          spec.file || '',
          spec.line || 0,
          spec.column || 0,
          spec.title || '',
          project,
        ].join('::'));
      }
    }
    for (const child of suite.suites || []) visitSuite(child);
  }

  for (const suite of report.suites || []) visitSuite(suite);
  return keys;
}

if (!Array.isArray(plan.groups) || plan.groups.length < 5) {
  fail('o plano precisa conter no mínimo 5 grupos');
}

const ids = new Set();
const tags = new Set();
for (const group of plan.groups) {
  if (!group.id || !group.tag || !Number.isInteger(group.expectedTests) || group.expectedTests <= 0) {
    fail('grupo inválido no plano: ' + JSON.stringify(group));
  }
  if (!Number.isInteger(group.workers) || group.workers <= 0) {
    fail('workers inválido no plano para ' + group.id + ': ' + group.workers);
  }
  if (!String(group.tag).startsWith('@')) fail('tag precisa começar com @: ' + group.tag);
  if (ids.has(group.id)) fail('grupo duplicado: ' + group.id);
  if (tags.has(group.tag)) fail('tag duplicada: ' + group.tag);
  ids.add(group.id);
  tags.add(group.tag);
}

if (!plan.groups.some(group => group.kind === 'fast')) {
  fail('o plano precisa manter um grupo dedicado aos testes rápidos');
}

const full = collectSpecs(runList());
const fullSet = new Set(full);
if (full.length !== fullSet.size) {
  fail('inventário completo contém chaves de teste duplicadas');
}
if (full.length < baseline.e2e.minTests) {
  fail('inventário completo caiu para ' + full.length + '; mínimo protegido=' + baseline.e2e.minTests);
}

const union = new Map();
let sum = 0;

for (const group of plan.groups) {
  const keys = collectSpecs(runList(['--grep', group.tag]));
  if (keys.length !== group.expectedTests) {
    fail(
      'grupo ' + group.id + ' coletou ' + keys.length +
      ' teste(s); esperado=' + group.expectedTests
    );
  }

  console.log(
    '[E2E/PLAN] ' + group.id +
    ': ' + keys.length + ' teste(s), workers=' + group.workers +
    ', ~' + group.estimatedSeconds + 's'
  );

  sum += keys.length;
  for (const key of keys) {
    if (!fullSet.has(key)) fail('grupo ' + group.id + ' contém teste fora do inventário: ' + key);
    if (union.has(key)) {
      fail('teste duplicado entre grupos ' + union.get(key) + ' e ' + group.id + ': ' + key);
    }
    union.set(key, group.id);
  }
}

const missing = full.filter(key => !union.has(key));
if (missing.length) {
  console.error('[E2E/PLAN] Testes sem grupo:');
  for (const key of missing) console.error('- ' + key);
  fail(missing.length + ' teste(s) do inventário não pertencem a nenhum grupo');
}

if (sum !== full.length || union.size !== full.length) {
  fail('união dos grupos=' + union.size + ', soma=' + sum + ', inventário=' + full.length);
}

console.log(
  '[E2E/PLAN] Plano válido: ' + plan.groups.length +
  ' grupos, ' + full.length +
  ' testes, cobertura exata sem omissões ou duplicatas.'
);

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const playwright = fs.readFileSync(path.join(root, 'tests', 'playwright.config.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'package.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'ci', 'test-baseline.json'), 'utf8'));

const problems = [];
const requiredJobs = [
  'version-integrity',
  'syntax-check',
  'manifest-validation',
  'ci-contract',
  'smoke',
  'visual',
  'unit-and-integration',
  'coverage',
  'e2e',
  'ci-gate',
];

function jobBlock(id) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === '  ' + id + ':');
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

for (const job of requiredJobs) {
  if (!jobBlock(job)) problems.push('job obrigatório ausente: ' + job);
}

for (const job of ['smoke', 'visual', 'unit-and-integration', 'coverage', 'e2e']) {
  const block = jobBlock(job);
  if (/^    continue-on-error:\s*true\s*$/m.test(block)) {
    problems.push(job + ': job funcional não pode usar continue-on-error: true');
  }
}

const e2e = jobBlock('e2e');
if (/^    needs:/m.test(e2e)) {
  problems.push('e2e: precisa executar independentemente e não depender do sucesso de outro job funcional');
}

if (/npm run test:[^\n]*\|\|\s*true/.test(workflow)) {
  problems.push('workflow mascara comando de testes com "|| true"');
}

const coverage = jobBlock('coverage');
if (!/run:\s+npm run test:coverage:ci/.test(coverage)) {
  problems.push('coverage: deve executar test:coverage:ci de forma bloqueante');
}

const gate = jobBlock('ci-gate');
if (!/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(gate)) {
  problems.push('ci-gate: precisa usar if: always() para avaliar failure/skipped/cancelled');
}
for (const dependency of requiredJobs.filter((job) => job !== 'ci-gate')) {
  if (!gate.includes('- ' + dependency)) {
    problems.push('ci-gate: dependência obrigatória ausente: ' + dependency);
  }
}

if (!playwright.includes('forbidOnly: !!process.env.CI')) {
  problems.push('Playwright precisa proibir test.only em CI');
}
if (!playwright.includes('./ci/playwright-gate-reporter.js')) {
  problems.push('Playwright precisa carregar o reporter de gate em CI');
}
if (pkg.scripts['test:ci'] !== 'node ci/run-jest-ci.js') {
  problems.push('tests/package.json#test:ci precisa usar o runner auditável');
}
if (pkg.scripts['test:coverage:ci'] !== 'node ci/run-jest-ci.js --coverage') {
  problems.push('tests/package.json#test:coverage:ci precisa usar o runner auditável com cobertura');
}

for (const [name, value] of [
  ['jest.minSuites', baseline.jest && baseline.jest.minSuites],
  ['jest.minTests', baseline.jest && baseline.jest.minTests],
  ['visual.minTests', baseline.visual && baseline.visual.minTests],
  ['e2e.minTests', baseline.e2e && baseline.e2e.minTests],
  ['smoke.minFiles', baseline.smoke && baseline.smoke.minFiles],
]) {
  if (!Number.isInteger(value) || value <= 0) problems.push('baseline inválido: ' + name);
}

if (problems.length) {
  console.error('Contrato da CI inválido:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log('Contrato da CI validado: jobs independentes, gates obrigatórios e inventários protegidos.');

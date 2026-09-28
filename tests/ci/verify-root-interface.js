'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const rootPackagePath = path.join(root, 'package.json');
const testsPackagePath = path.join(root, 'tests', 'package.json');
const testsLockPath = path.join(root, 'tests', 'package-lock.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const problems = [];
const requiredFiles = [
  'package.json',
  'tests/package.json',
  'tests/package-lock.json',
  'tests/jest.config.js',
  'tests/jest.coverage.config.js',
  'tests/playwright.config.js',
  'tests/run-all-tests.js',
  'tests/run-e2e.js',
  'tests/smoke/run-smoke.js',
  'extension/manifest.json',
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) {
    problems.push('arquivo obrigatório ausente: ' + relative);
  }
}

let rootPackage;
let testsPackage;
let testsLock;

try {
  rootPackage = readJson(rootPackagePath);
} catch (error) {
  problems.push('package.json raiz inválido: ' + error.message);
}

try {
  testsPackage = readJson(testsPackagePath);
} catch (error) {
  problems.push('tests/package.json inválido: ' + error.message);
}

try {
  testsLock = readJson(testsLockPath);
} catch (error) {
  problems.push('tests/package-lock.json inválido: ' + error.message);
}

if (rootPackage && testsPackage && testsLock) {
  const expectedRootScripts = {
    'setup:deps': 'npm --prefix tests ci',
    'setup:e2e': 'npm --prefix tests run test:e2e:setup',
    'test': 'npm --prefix tests run test:all',
    'test:fast': 'npm --prefix tests run test:all',
    'test:ci': 'npm --prefix tests run test:ci',
    'test:unit': 'npm --prefix tests run test:unit',
    'test:integration': 'npm --prefix tests run test:integration',
    'test:smoke': 'npm --prefix tests run test:smoke',
    'test:visual': 'npm --prefix tests run test:visual-v3',
    'test:e2e': 'npm --prefix tests run test:e2e',
    'test:coverage:generate': 'npm --prefix tests run test:coverage',
    'test:coverage:verify': 'npm --prefix tests run test:coverage:verify',
  };

  for (const [name, command] of Object.entries(expectedRootScripts)) {
    if (rootPackage.scripts?.[name] !== command) {
      problems.push(
        'package.json#scripts.' + name + ' deve delegar exatamente para a implementação oficial: ' + command
      );
    }
  }

  const setup = rootPackage.scripts?.setup || '';
  for (const requiredPart of [
    'npm --prefix tests ci',
    'npm --prefix tests run test:e2e:setup',
  ]) {
    if (!setup.includes(requiredPart)) {
      problems.push('package.json#scripts.setup não contém: ' + requiredPart);
    }
  }

  const coverage = rootPackage.scripts?.['test:coverage'] || '';
  for (const requiredPart of [
    'npm --prefix tests run test:coverage',
    'npm --prefix tests run test:coverage:verify',
  ]) {
    if (!coverage.includes(requiredPart)) {
      problems.push('package.json#scripts.test:coverage não contém: ' + requiredPart);
    }
  }

  const all = rootPackage.scripts?.['test:all'] || '';
  for (const requiredPart of [
    'npm run test:smoke',
    'npm run test:ci',
    'npm run test:visual',
    'npm run test:coverage',
    'npm run test:e2e',
  ]) {
    if (!all.includes(requiredPart)) {
      problems.push('package.json#scripts.test:all não contém: ' + requiredPart);
    }
  }

  for (const [name, command] of Object.entries(rootPackage.scripts || {})) {
    if (/\|\|\s*true/.test(command)) {
      problems.push('script raiz mascara falha com "|| true": ' + name);
    }
  }

  if (testsPackage.scripts?.['test:e2e:setup'] !== 'playwright install chromium') {
    problems.push(
      'tests/package.json#scripts.test:e2e:setup deve manter a instalação do Chromium como fonte única'
    );
  }

  if (rootPackage.engines?.node !== '>=18.0.0') {
    problems.push('package.json raiz deve declarar engines.node >=18.0.0, alinhado ao pacote de testes');
  }

  if (testsPackage.engines?.node !== '>=18.0.0') {
    problems.push('tests/package.json deve continuar declarando engines.node >=18.0.0');
  }

  if (rootPackage.version !== testsPackage.version) {
    problems.push(
      'versões divergentes entre package.json raiz (' + rootPackage.version +
      ') e tests/package.json (' + testsPackage.version + ')'
    );
  }

  if (testsLock.version !== testsPackage.version ||
      testsLock.packages?.['']?.version !== testsPackage.version) {
    problems.push('tests/package-lock.json não está sincronizado com tests/package.json');
  }
}

if (problems.length) {
  console.error('Contrato da interface raiz inválido:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log(
  'Contrato da interface raiz validado: setup e wrappers npm delegam ao pacote tests sem duplicar runners.'
);

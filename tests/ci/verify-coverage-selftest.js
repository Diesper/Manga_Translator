'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { verifyCoverage } = require('./verify-coverage');

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function coverageEntry(file, pct) {
  return {
    lines: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
    statements: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
    functions: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
    branches: { total: 10, covered: Math.round(10 * pct / 100), skipped: 0, pct },
  };
}

function createFixture({
  emptyLcov = false,
  zero = false,
  omitCritical = false,
  threshold = 10,
  actual = 75,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-coverage-selftest-'));
  const extension = path.join(root, 'extension');
  const coverage = path.join(root, 'tests', 'coverage');
  const baseline = path.join(root, 'tests', 'ci', 'test-baseline.json');
  const critical = 'extension/background.js';
  const other = 'extension/content_manga.js';

  writeFile(path.join(root, critical), 'module.exports = 1;\n');
  writeFile(path.join(root, other), 'module.exports = 2;\n');

  const pct = zero ? 0 : actual;
  const summary = {
    total: coverageEntry('total', pct),
  };
  if (!omitCritical) summary[path.join(root, critical)] = coverageEntry(critical, pct);
  summary[path.join(root, other)] = coverageEntry(other, pct);

  writeFile(path.join(coverage, 'coverage-summary.json'), JSON.stringify(summary, null, 2));
  const lcovFiles = omitCritical ? [other] : [critical, other];
  writeFile(
    path.join(coverage, 'lcov.info'),
    emptyLcov ? '' : lcovFiles.map((file) => 'TN:\nSF:' + path.join(root, file) +
      '\nFNF:1\nFNH:1\nLF:1\nLH:1\nBRF:1\nBRH:1\nend_of_record\n').join('')
  );
  writeFile(baseline, JSON.stringify({
    coverage: {
      minInstrumentedFiles: 2,
      minimum: {
        statements: threshold,
        branches: threshold,
        functions: threshold,
        lines: threshold,
      },
    },
  }, null, 2));

  return { root, coverage, baseline, critical };
}

function expectCase(name, fixtureOptions, expectedOk) {
  const fx = createFixture(fixtureOptions);
  try {
    const result = verifyCoverage({
      repoRoot: fx.root,
      coverageDir: fx.coverage,
      baselinePath: fx.baseline,
      criticalFiles: [fx.critical],
      quiet: true,
    });
    if (result.ok !== expectedOk) {
      throw new Error(name + ': esperado ok=' + expectedOk + ', recebido ok=' + result.ok +
        '\n' + result.problems.join('\n'));
    }
    console.log('✓ ' + name);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
}

expectCase('coverage normal', {}, true);
expectCase('lcov vazio', { emptyLcov: true }, false);
expectCase('coverage 0%', { zero: true }, false);
expectCase('arquivo crítico ausente', { omitCritical: true }, false);
expectCase('threshold abaixo do mínimo', { threshold: 80, actual: 75 }, false);

console.log('✅ Self-test da infraestrutura de coverage aprovado.');

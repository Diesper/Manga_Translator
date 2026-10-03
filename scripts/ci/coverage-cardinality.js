'use strict';

const path = require('path');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { normalizeRelative, REPO_ROOT } = require('./coverage-shard-plan');

function summarizeCardinality(coverageJson, repoRoot = REPO_ROOT) {
  const map = createCoverageMap(coverageJson);
  const result = {};
  for (const file of map.files()) {
    const relative = normalizeRelative(path.relative(repoRoot, file));
    const summary = map.fileCoverageFor(file).toSummary();
    result[relative] = {
      statements: Number(summary.statements.total),
      branches: Number(summary.branches.total),
      functions: Number(summary.functions.total),
      lines: Number(summary.lines.total),
    };
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function validateCoverageCardinality(coverageJson, baseline, { repoRoot = REPO_ROOT } = {}) {
  const problems = [];
  let actual;
  try { actual = summarizeCardinality(coverageJson, repoRoot); }
  catch (error) {
    return { ok: false, problems: ['mapa de cobertura inválido: ' + error.message], actual: {} };
  }
  const expectedFiles = Object.keys(baseline?.files || {}).sort();
  const actualFiles = Object.keys(actual).sort();
  for (const file of expectedFiles) {
    if (!Object.prototype.hasOwnProperty.call(actual, file)) {
      problems.push('arquivo ausente do mapa de cardinalidade: ' + file);
      continue;
    }
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      const expected = Number(baseline.files[file]?.[metric]);
      const count = Number(actual[file]?.[metric]);
      if (!Number.isInteger(expected) || expected < 0) {
        problems.push('baseline cardinalidade inválido: ' + file + ' ' + metric);
      } else if (!Number.isInteger(count) || count < expected) {
        problems.push(file + ' ' + metric + ' cardinality=' + count +
          '; mínimo protegido=' + expected + '.');
      }
    }
  }
  for (const file of actualFiles) {
    if (!Object.prototype.hasOwnProperty.call(baseline.files || {}, file)) {
      problems.push('arquivo instrumentado sem baseline de cardinalidade: ' + file);
    }
  }
  return { ok: problems.length === 0, problems, actual };
}

module.exports = { summarizeCardinality, validateCoverageCardinality };

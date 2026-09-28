'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CRITICAL_FILES = [
  'extension/background.js',
  'extension/content_manga.js',
  'extension/content_gemini.js',
  'extension/shared-ui.js',
  'extension/gemini/job-runner.js',
];

function walkJs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkJs(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function relativeToRepo(repoRoot, file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(repoRoot, file);
  return normalizeSlashes(path.relative(repoRoot, absolute));
}

function parseLcovFiles(lcovText, repoRoot) {
  const files = [];
  const testsRoot = path.join(repoRoot, 'tests');
  for (const line of String(lcovText || '').split(/\r?\n/)) {
    if (!line.startsWith('SF:')) continue;
    const raw = line.slice(3).trim();
    if (path.isAbsolute(raw)) {
      files.push(relativeToRepo(repoRoot, raw));
      continue;
    }

    // O LCOV do Jest é emitido relativamente ao diretório de execução (tests/),
    // por isso SF:../extension/foo.js precisa resolver para <repo>/extension/foo.js.
    const fromTests = path.resolve(testsRoot, raw);
    const fromRepo = path.resolve(repoRoot, raw);
    const resolved = fs.existsSync(fromTests) ? fromTests : fromRepo;
    files.push(relativeToRepo(repoRoot, resolved));
  }
  return [...new Set(files)].sort();
}

function metricPct(summary, metric) {
  const value = Number(summary?.total?.[metric]?.pct);
  return Number.isFinite(value) ? value : NaN;
}

function verifyCoverage({
  repoRoot = path.resolve(__dirname, '../..'),
  coverageDir = path.resolve(__dirname, '../coverage'),
  baselinePath = path.resolve(__dirname, 'test-baseline.json'),
  criticalFiles = DEFAULT_CRITICAL_FILES,
  quiet = false,
} = {}) {
  const problems = [];
  const summaryPath = path.join(coverageDir, 'coverage-summary.json');
  const lcovPath = path.join(coverageDir, 'lcov.info');

  if (!fs.existsSync(summaryPath) || fs.statSync(summaryPath).size === 0) {
    problems.push('coverage-summary.json ausente ou vazio');
  }
  if (!fs.existsSync(lcovPath) || fs.statSync(lcovPath).size === 0) {
    problems.push('lcov.info ausente ou vazio');
  }

  if (problems.length) {
    return { ok: false, problems, metrics: null, instrumentedFiles: [], sourceFiles: [] };
  }

  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      problems: ['coverage-summary.json inválido: ' + error.message],
      metrics: null,
      instrumentedFiles: [],
      sourceFiles: [],
    };
  }

  const lcovText = fs.readFileSync(lcovPath, 'utf8');
  const lcovFiles = parseLcovFiles(lcovText, repoRoot);
  if (lcovFiles.length === 0) {
    problems.push('lcov.info não contém nenhuma entrada SF:');
  }

  const sourceRoot = path.join(repoRoot, 'extension');
  const sourceFiles = walkJs(sourceRoot).map((file) => relativeToRepo(repoRoot, file)).sort();
  if (sourceFiles.length === 0) {
    problems.push('nenhum arquivo JavaScript foi encontrado em extension/');
  }

  const summaryFiles = Object.keys(summary)
    .filter((key) => key !== 'total')
    .map((file) => relativeToRepo(repoRoot, file))
    .sort();

  const summarySet = new Set(summaryFiles);
  const lcovSet = new Set(lcovFiles);
  const missingFromSummary = sourceFiles.filter((file) => !summarySet.has(file));
  const missingFromLcov = sourceFiles.filter((file) => !lcovSet.has(file));

  if (missingFromSummary.length) {
    problems.push(
      'arquivos da extensão ausentes do coverage-summary.json:\n' +
      missingFromSummary.map((file) => '  - ' + file).join('\n')
    );
  }
  if (missingFromLcov.length) {
    problems.push(
      'arquivos da extensão ausentes do lcov.info:\n' +
      missingFromLcov.map((file) => '  - ' + file).join('\n')
    );
  }

  for (const critical of criticalFiles) {
    if (!summarySet.has(critical)) problems.push('arquivo crítico ausente do summary: ' + critical);
    if (!lcovSet.has(critical)) problems.push('arquivo crítico ausente do LCOV: ' + critical);
  }

  const metrics = {
    statements: metricPct(summary, 'statements'),
    branches: metricPct(summary, 'branches'),
    functions: metricPct(summary, 'functions'),
    lines: metricPct(summary, 'lines'),
  };

  for (const [metric, pct] of Object.entries(metrics)) {
    if (!Number.isFinite(pct)) problems.push('percentual inválido para ' + metric);
    else if (pct <= 0) problems.push(metric + ' está em ' + pct + '%; coverage zero não é aceito');
  }

  let baseline = {};
  if (fs.existsSync(baselinePath)) {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  }
  const minimum = baseline.coverage?.minimum || {};
  for (const [metric, threshold] of Object.entries(minimum)) {
    if (!Number.isFinite(Number(threshold))) continue;
    if (Number.isFinite(metrics[metric]) && metrics[metric] < Number(threshold)) {
      problems.push(
        metric + '=' + metrics[metric] + '% abaixo do baseline mínimo de ' + Number(threshold) + '%'
      );
    }
  }

  const criticalMinimum = baseline.coverage?.criticalMinimum || {};
  for (const [criticalFile, thresholds] of Object.entries(criticalMinimum)) {
    const summaryKey = Object.keys(summary).find(
      (key) => key !== 'total' && relativeToRepo(repoRoot, key) === criticalFile
    );
    if (!summaryKey) {
      problems.push('não foi possível aplicar threshold ao arquivo crítico ausente: ' + criticalFile);
      continue;
    }
    for (const [metric, threshold] of Object.entries(thresholds || {})) {
      const pct = Number(summary[summaryKey]?.[metric]?.pct);
      if (!Number.isFinite(pct)) {
        problems.push(criticalFile + ': percentual inválido para ' + metric);
      } else if (pct < Number(threshold)) {
        problems.push(
          criticalFile + ': ' + metric + '=' + pct +
          '% abaixo do baseline crítico de ' + Number(threshold) + '%'
        );
      }
    }
  }

  const expectedMinFiles = Number(baseline.coverage?.minInstrumentedFiles || 0);
  if (expectedMinFiles > 0 && summaryFiles.length < expectedMinFiles) {
    problems.push(
      'apenas ' + summaryFiles.length + ' arquivos instrumentados; mínimo protegido: ' + expectedMinFiles
    );
  }

  if (!quiet) {
    console.log('[Coverage Integrity] sourceFiles=' + sourceFiles.length +
      ', summaryFiles=' + summaryFiles.length + ', lcovFiles=' + lcovFiles.length);
    console.log('[Coverage Integrity] Statements=' + metrics.statements + '%' +
      ' Branches=' + metrics.branches + '%' +
      ' Functions=' + metrics.functions + '%' +
      ' Lines=' + metrics.lines + '%');
    console.log('[Coverage Integrity] Arquivos instrumentados:');
    summaryFiles.forEach((file) => console.log('  ✓ ' + file));
  }

  return {
    ok: problems.length === 0,
    problems,
    metrics,
    instrumentedFiles: summaryFiles,
    lcovFiles,
    sourceFiles,
  };
}

if (require.main === module) {
  const result = verifyCoverage();
  if (!result.ok) {
    console.error('\n❌ Coverage Integrity falhou:');
    result.problems.forEach((problem) => console.error('- ' + problem));
    process.exit(1);
  }
  console.log('✅ Coverage Integrity aprovado.');
}

module.exports = {
  DEFAULT_CRITICAL_FILES,
  parseLcovFiles,
  verifyCoverage,
};

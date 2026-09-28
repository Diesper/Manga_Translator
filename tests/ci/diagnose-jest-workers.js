'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { FORCED_WORKER_EXIT, hasForcedWorkerExit } = require('./jest-worker-warning');

const testsRoot = path.resolve(__dirname, '..');
const jestBin = path.join(testsRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const outDir = path.join(testsRoot, '.ci-results', 'jest-worker-diagnostic');
const summaryFile = path.join(testsRoot, '.ci-results', 'jest-worker-diagnostic.json');

fs.mkdirSync(outDir, { recursive: true });

const baseArgs = [jestBin, '--config', 'jest.config.js', '--ci'];

const cases = [
  { name: 'full-default', args: [] },
  { name: 'full-w1', args: ['--maxWorkers=1'] },
  { name: 'full-w2', args: ['--maxWorkers=2'] },
  { name: 'full-w3', args: ['--maxWorkers=3'] },
  { name: 'full-w4', args: ['--maxWorkers=4'] },

  { name: 'project-background', args: ['--selectProjects', 'background'] },
  { name: 'project-gtc', args: ['--selectProjects', 'gtc'] },
  { name: 'project-content-scripts', args: ['--selectProjects', 'content-scripts'] },
  { name: 'project-popup', args: ['--selectProjects', 'popup'] },
  { name: 'project-reader', args: ['--selectProjects', 'reader'] },
  { name: 'project-manifest', args: ['--selectProjects', 'manifest'] },
  { name: 'project-shared-ui', args: ['--selectProjects', 'shared-ui'] },
  { name: 'project-integration', args: ['--selectProjects', 'integration'] },

  {
    name: 'combo-content-integration',
    args: ['--selectProjects', 'content-scripts', 'integration'],
  },
  {
    name: 'combo-jsdom-projects',
    args: ['--selectProjects', 'content-scripts', 'popup', 'reader', 'shared-ui', 'integration'],
  },
  {
    name: 'combo-background-content',
    args: ['--selectProjects', 'background', 'content-scripts'],
  },
  {
    name: 'combo-background-integration',
    args: ['--selectProjects', 'background', 'integration'],
  },
  {
    name: 'combo-background-jsdom',
    args: ['--selectProjects', 'background', 'content-scripts', 'popup', 'reader', 'shared-ui', 'integration'],
  },
];

function pickLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) =>
      line.includes(FORCED_WORKER_EXIT) ||
      /Test Suites:|Tests:|Time:|Ran all test suites|No tests found|FAIL |PASS /.test(line)
    )
    .slice(-80);
}

function runCase(spec) {
  const startedAt = Date.now();
  const proc = spawnSync(process.execPath, [...baseArgs, ...spec.args], {
    cwd: testsRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      MT_JEST_DIAG_CASE: spec.name,
    },
  });

  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';
  const combined = stdout + '\n' + stderr;
  const forcedWorkerExit = hasForcedWorkerExit(combined);
  const logFile = path.join(outDir, spec.name + '.log');

  fs.writeFileSync(
    logFile,
    [
      '# case=' + spec.name,
      '# node=' + process.version,
      '# pid=' + process.pid,
      '# args=' + JSON.stringify(spec.args),
      '# status=' + String(proc.status),
      '# signal=' + String(proc.signal || ''),
      '# forcedWorkerExit=' + String(forcedWorkerExit),
      '# durationMs=' + String(Date.now() - startedAt),
      '',
      '===== STDOUT =====',
      stdout,
      '',
      '===== STDERR =====',
      stderr,
      '',
    ].join('\n')
  );

  const result = {
    name: spec.name,
    args: spec.args,
    node: process.version,
    status: proc.status,
    signal: proc.signal || null,
    forcedWorkerExit,
    durationMs: Date.now() - startedAt,
    error: proc.error ? proc.error.message : null,
    interestingLines: pickLines(combined),
    logFile: path.relative(testsRoot, logFile).replace(/\\/g, '/'),
  };

  const marker = forcedWorkerExit ? 'LEAK' : (proc.status === 0 ? 'CLEAN' : 'FAIL');
  console.log(
    '[jest-worker-diagnostic] ' + marker +
    ' case=' + spec.name +
    ' status=' + String(proc.status) +
    ' durationMs=' + String(result.durationMs)
  );
  for (const line of result.interestingLines.slice(-12)) {
    console.log('  ' + line);
  }

  return result;
}

const results = cases.map(runCase);
const summary = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpuCount: require('os').cpus().length,
  cases: results,
};

fs.mkdirSync(path.dirname(summaryFile), { recursive: true });
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');

console.log('\n[jest-worker-diagnostic] resumo');
for (const result of results) {
  console.log(
    '- ' + result.name +
    ': status=' + String(result.status) +
    ', forcedWorkerExit=' + String(result.forcedWorkerExit) +
    ', durationMs=' + String(result.durationMs)
  );
}

const leaks = results.filter((result) => result.forcedWorkerExit);
const commandFailures = results.filter((result) => result.status !== 0 && !result.forcedWorkerExit);

if (leaks.length) {
  console.error(
    '\n[jest-worker-diagnostic] warning reproduzido em: ' +
    leaks.map((item) => item.name).join(', ')
  );
}
if (commandFailures.length) {
  console.error(
    '[jest-worker-diagnostic] comandos com falha própria: ' +
    commandFailures.map((item) => item.name).join(', ')
  );
}

// O diagnóstico precisa executar todos os casos antes de sinalizar o resultado.
// O workflow chama esta ferramenta em uma etapa continue-on-error e sempre
// publica os logs/JSON como artifact.
if (leaks.length || commandFailures.length) {
  process.exitCode = 2;
}

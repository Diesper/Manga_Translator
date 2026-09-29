'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { FORCED_WORKER_EXIT, hasForcedWorkerExit } = require('../ci/jest-worker-warning');

const repoRoot = path.resolve(__dirname, '../..');
const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const outDir = path.join(repoRoot, '.ci-results', 'jest-worker-diagnostic');

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

function parseCaseFilter() {
  const cliArg = process.argv.find(arg => arg.startsWith('--case='));
  const requested = cliArg ? cliArg.slice('--case='.length) : process.env.MT_JEST_DIAG_CASE;
  if (!requested) return null;
  if (!cases.some(spec => spec.name === requested)) {
    console.error(
      'Caso de diagnóstico desconhecido: ' + requested + '\nCasos válidos: ' +
      cases.map(spec => spec.name).join(', ')
    );
    process.exit(64);
  }
  return requested;
}

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
  const proc = spawnSync(process.execPath, [
    jestBin,
    '--config',
    'jest.config.js',
    '--ci',
    ...spec.args,
  ], {
    cwd: repoRoot,
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
  const durationMs = Date.now() - startedAt;

  fs.mkdirSync(outDir, { recursive: true });
  const logFile = path.join(outDir, spec.name + '.log');
  fs.writeFileSync(
    logFile,
    [
      '# case=' + spec.name,
      '# node=' + process.version,
      '# pid=' + process.pid,
      '# cpuCount=' + os.cpus().length,
      '# args=' + JSON.stringify(spec.args),
      '# status=' + String(proc.status),
      '# signal=' + String(proc.signal || ''),
      '# forcedWorkerExit=' + String(forcedWorkerExit),
      '# durationMs=' + String(durationMs),
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
    platform: process.platform,
    arch: process.arch,
    cpuCount: os.cpus().length,
    status: proc.status,
    signal: proc.signal || null,
    forcedWorkerExit,
    durationMs,
    error: proc.error ? proc.error.message : null,
    interestingLines: pickLines(combined),
    logFile: path.relative(repoRoot, logFile).replace(/\\/g, '/'),
  };

  const summaryFile = path.join(outDir, spec.name + '.json');
  fs.writeFileSync(summaryFile, JSON.stringify(result, null, 2) + '\n');

  const marker = forcedWorkerExit ? 'LEAK' : (proc.status === 0 ? 'CLEAN' : 'FAIL');
  console.log(
    '[jest-worker-diagnostic] ' + marker +
    ' case=' + spec.name +
    ' status=' + String(proc.status) +
    ' forcedWorkerExit=' + String(forcedWorkerExit) +
    ' durationMs=' + String(durationMs)
  );
  for (const line of result.interestingLines.slice(-20)) {
    console.log('  ' + line);
  }

  return result;
}

const filter = parseCaseFilter();
const selectedCases = filter ? cases.filter(spec => spec.name === filter) : cases;
const results = selectedCases.map(runCase);

const aggregate = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpuCount: os.cpus().length,
  caseFilter: filter,
  cases: results,
};

fs.mkdirSync(path.join(repoRoot, '.ci-results'), { recursive: true });
const aggregateName = filter
  ? 'jest-worker-diagnostic-' + filter + '.json'
  : 'jest-worker-diagnostic.json';
fs.writeFileSync(
  path.join(repoRoot, '.ci-results', aggregateName),
  JSON.stringify(aggregate, null, 2) + '\n'
);

const leaks = results.filter(result => result.forcedWorkerExit);
const commandFailures = results.filter(result => result.status !== 0 && !result.forcedWorkerExit);

if (leaks.length) {
  console.error(
    '[jest-worker-diagnostic] warning reproduzido em: ' +
    leaks.map(item => item.name).join(', ')
  );
}
if (commandFailures.length) {
  console.error(
    '[jest-worker-diagnostic] comandos com falha própria: ' +
    commandFailures.map(item => item.name).join(', ')
  );
}

// O caller decide se isto bloqueia a pipeline. Nos jobs de diagnóstico da CI,
// uma reprodução/falha é bloqueante; os artefatos são publicados com always().
if (leaks.length || commandFailures.length) {
  process.exitCode = 2;
}

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { hasForcedWorkerExit } = require('./jest-worker-warning');

const testsRoot = path.resolve(__dirname, '..');
const backgroundRoot = path.join(testsRoot, 'unit', 'background');
const jestBin = path.join(testsRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const resultRoot = path.join(testsRoot, '.ci-results');
const logDir = path.join(resultRoot, 'background-leak-diagnostic');
const summaryFile = path.join(resultRoot, 'background-leak-diagnostic.json');

fs.mkdirSync(logDir, { recursive: true });

function listTests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listTests(full) : [full];
    })
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => path.relative(testsRoot, file).replace(/\\/g, '/'))
    .sort();
}

const allFiles = listTests(backgroundRoot);
const records = [];
let sequence = 0;

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
}

function compactOutput(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) =>
      line.includes('A worker process has failed to exit gracefully') ||
      /Test Suites:|Tests:|Time:|Ran all test suites|FAIL |No tests found/.test(line)
    )
    .slice(-40);
}

function runOnce({ label, files, workers }) {
  sequence += 1;
  const args = [
    jestBin,
    '--config', 'jest.config.js',
    '--ci',
    '--selectProjects', 'background',
    '--runTestsByPath',
    ...files,
  ];
  if (workers !== null) args.push('--maxWorkers=' + String(workers));

  const startedAt = Date.now();
  const proc = spawnSync(process.execPath, args, {
    cwd: testsRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      MT_JEST_BACKGROUND_DIAG: label,
    },
  });

  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';
  const combined = stdout + '\n' + stderr;
  const forcedWorkerExit = hasForcedWorkerExit(combined);
  const durationMs = Date.now() - startedAt;
  const logName = String(sequence).padStart(3, '0') + '-' + safeName(label) + '.log';
  const logPath = path.join(logDir, logName);

  fs.writeFileSync(logPath, [
    '# label=' + label,
    '# workers=' + (workers === null ? 'default' : String(workers)),
    '# fileCount=' + String(files.length),
    '# status=' + String(proc.status),
    '# signal=' + String(proc.signal || ''),
    '# forcedWorkerExit=' + String(forcedWorkerExit),
    '# durationMs=' + String(durationMs),
    '# files=' + JSON.stringify(files),
    '',
    '===== STDOUT =====',
    stdout,
    '',
    '===== STDERR =====',
    stderr,
    '',
  ].join('\n'));

  const record = {
    sequence,
    label,
    workers: workers === null ? 'default' : workers,
    fileCount: files.length,
    files,
    status: proc.status,
    signal: proc.signal || null,
    forcedWorkerExit,
    durationMs,
    error: proc.error ? proc.error.message : null,
    interestingLines: compactOutput(combined),
    logFile: path.relative(testsRoot, logPath).replace(/\\/g, '/'),
  };
  records.push(record);

  const marker = forcedWorkerExit ? 'LEAK' : (proc.status === 0 ? 'CLEAN' : 'FAIL');
  console.log(
    '[background-leak] ' + marker +
    ' #' + String(sequence) +
    ' label=' + label +
    ' workers=' + String(record.workers) +
    ' files=' + String(files.length) +
    ' ms=' + String(durationMs)
  );

  return record;
}

function probe({ label, files, workers, repeats = 1 }) {
  const attempts = [];
  for (let i = 0; i < repeats; i += 1) {
    attempts.push(runOnce({
      label: label + '-r' + String(i + 1),
      files,
      workers,
    }));
  }
  return {
    leak: attempts.some((attempt) => attempt.forcedWorkerExit),
    failures: attempts.filter((attempt) => attempt.status !== 0 && !attempt.forcedWorkerExit),
    attempts,
  };
}

function partition(items, count) {
  const result = [];
  const size = Math.ceil(items.length / count);
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function complement(items, chunk) {
  const excluded = new Set(chunk);
  return items.filter((item) => !excluded.has(item));
}

console.log('[background-leak] node=' + process.version +
  ' platform=' + process.platform +
  ' cpuCount=' + String(os.cpus().length) +
  ' backgroundFiles=' + String(allFiles.length));

if (!allFiles.length) {
  console.error('[background-leak] nenhum teste de background encontrado.');
  process.exit(1);
}

// 1) Escolher o nível de paralelismo.
// A CI pode fornecer MT_BACKGROUND_LEAK_WORKERS quando uma rodada anterior já
// isolou um valor reproduzível (no PR #47, w2 ficou limpo e w3 reproduziu).
// Sem override, preservamos o sweep completo para uso independente/local.
const requestedWorkersRaw = String(process.env.MT_BACKGROUND_LEAK_WORKERS || '').trim();
const requestedWorkers = requestedWorkersRaw === ''
  ? undefined
  : (requestedWorkersRaw === 'default' ? null : Number(requestedWorkersRaw));

if (
  requestedWorkers !== undefined &&
  requestedWorkers !== null &&
  (!Number.isInteger(requestedWorkers) || requestedWorkers < 1)
) {
  console.error('[background-leak] MT_BACKGROUND_LEAK_WORKERS inválido: ' + requestedWorkersRaw);
  process.exit(64);
}

let leakingModes = [];
let selectedWorkers;

if (requestedWorkers !== undefined) {
  const baseline = probe({
    label: 'baseline-' + (requestedWorkers === null ? 'default' : 'w' + String(requestedWorkers)),
    files: allFiles,
    workers: requestedWorkers,
    repeats: 2,
  });
  const leakCount = baseline.attempts.filter((attempt) => attempt.forcedWorkerExit).length;
  if (leakCount === 0) {
    const summary = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      cpuCount: os.cpus().length,
      backgroundFiles: allFiles,
      selectedWorkers: requestedWorkers === null ? 'default' : requestedWorkers,
      requestedWorkersDidNotReproduce: true,
      records,
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
    console.log('[background-leak] override não reproduziu o warning em 2 tentativas.');
    process.exit(0);
  }
  leakingModes = [{ workers: requestedWorkers, leakCount }];
  selectedWorkers = requestedWorkers;
} else {
  // Duas execuções por modo reduzem a chance de escolher um falso negativo de race.
  const modes = [1, 2, 3, 4, null];
  const sweep = modes.map((workers) => ({
    workers,
    result: probe({
      label: 'sweep-' + (workers === null ? 'default' : 'w' + String(workers)),
      files: allFiles,
      workers,
      repeats: 2,
    }),
  }));

  leakingModes = sweep
    .map((entry) => ({
      workers: entry.workers,
      leakCount: entry.result.attempts.filter((attempt) => attempt.forcedWorkerExit).length,
    }))
    .filter((entry) => entry.leakCount > 0)
    .sort((a, b) => {
      if (b.leakCount !== a.leakCount) return b.leakCount - a.leakCount;
      if (a.workers === null) return 1;
      if (b.workers === null) return -1;
      return Number(a.workers) - Number(b.workers);
    });

  if (!leakingModes.length) {
    const summary = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      cpuCount: os.cpus().length,
      backgroundFiles: allFiles,
      selectedWorkers: null,
      historicalLeakNotReproduced: true,
      records,
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
    console.log('[background-leak] warning não reproduziu no sweep desta rodada.');
    process.exit(0);
  }

  selectedWorkers = leakingModes[0].workers;
}

console.log('[background-leak] workers selecionados para bisection=' +
  (selectedWorkers === null ? 'default' : String(selectedWorkers)));

// 2) Delta debugging (ddmin): reduz o conjunto preservando a reprodução.
let candidate = [...allFiles];
let granularity = 2;
let iteration = 0;
const maxProbes = 90;
const probeStartSequence = sequence;

while (candidate.length > 1 && (sequence - probeStartSequence) < maxProbes) {
  iteration += 1;
  const chunks = partition(candidate, Math.min(granularity, candidate.length));
  let reduced = false;

  // Primeiro: alguma parte isolada ainda reproduz?
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const result = probe({
      label: 'ddmin-i' + String(iteration) + '-part' + String(i + 1),
      files: chunk,
      workers: selectedWorkers,
      repeats: 2,
    });
    if (result.leak) {
      candidate = chunk;
      granularity = 2;
      reduced = true;
      console.log('[background-leak] reduzido por parte para ' + String(candidate.length) + ' arquivo(s).');
      break;
    }
  }
  if (reduced) continue;

  // Depois: se nenhuma parte sozinha reproduz, tente os complementos.
  for (let i = 0; i < chunks.length; i += 1) {
    const rest = complement(candidate, chunks[i]);
    if (!rest.length) continue;
    const result = probe({
      label: 'ddmin-i' + String(iteration) + '-complement' + String(i + 1),
      files: rest,
      workers: selectedWorkers,
      repeats: 2,
    });
    if (result.leak) {
      candidate = rest;
      granularity = Math.max(2, granularity - 1);
      reduced = true;
      console.log('[background-leak] reduzido por complemento para ' + String(candidate.length) + ' arquivo(s).');
      break;
    }
  }
  if (reduced) continue;

  if (granularity >= candidate.length) break;
  granularity = Math.min(candidate.length, granularity * 2);
  console.log('[background-leak] aumentando granularidade para ' + String(granularity));
}

// 3) Confirmação final para distinguir conjunto mínimo real de race esporádica.
const confirmation = probe({
  label: 'final-candidate',
  files: candidate,
  workers: selectedWorkers,
  repeats: 4,
});
const confirmationLeakCount = confirmation.attempts
  .filter((attempt) => attempt.forcedWorkerExit).length;

const summary = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpuCount: os.cpus().length,
  initialFileCount: allFiles.length,
  selectedWorkers: selectedWorkers === null ? 'default' : selectedWorkers,
  leakingModes: leakingModes.map((entry) => ({
    workers: entry.workers === null ? 'default' : entry.workers,
    leakCount: entry.leakCount,
  })),
  candidateFileCount: candidate.length,
  candidateFiles: candidate,
  confirmationLeakCount,
  confirmationAttempts: confirmation.attempts.length,
  records,
};

fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');

console.log('\n[background-leak] RESULTADO');
console.log('[background-leak] candidateFileCount=' + String(candidate.length));
for (const file of candidate) console.log('[background-leak] candidate=' + file);
console.log('[background-leak] confirmation=' +
  String(confirmationLeakCount) + '/' + String(confirmation.attempts.length));
console.log('[background-leak] summary=' +
  path.relative(testsRoot, summaryFile).replace(/\\/g, '/'));

if (confirmationLeakCount > 0) {
  process.exitCode = 2;
}

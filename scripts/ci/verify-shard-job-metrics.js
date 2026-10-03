'use strict';

const fs = require('fs');
const path = require('path');
const coverageManifest = require('./data/coverage-shard-plan.json');
const e2ePlan = require('./data/e2e-shard-plan.json');
const workflowShardMetrics = require('./data/workflow-shard-metrics.json');

const MAX_JOB_MS = 120000;
const ACTIONS_TIMESTAMP_RESOLUTION_MS = 1000;
const MAX_OBSERVED_JOB_MS = MAX_JOB_MS - ACTIONS_TIMESTAMP_RESOLUTION_MS;
const MAX_SPREAD_RATIO = 1.3;

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const equals = arg.indexOf('=');
    const key = arg.slice(2, equals >= 0 ? equals : undefined);
    result[key] = equals >= 0 ? arg.slice(equals + 1) : args[++index];
  }
  return result;
}

function timestampMs(value) {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return NaN;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysByMonth[month - 1] ||
      Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59 ||
      (offsetSign && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59))) return NaN;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : NaN;
}

function jobDurationMs(job) {
  return timestampMs(job.completedAt) - timestampMs(job.startedAt);
}

function validateRunIdentity(timings, env = {}) {
  const problems = [];
  if (!timings || timings.schemaVersion !== 1 || !Array.isArray(timings.jobs)) {
    return ['arquivo de tempos de jobs tem schema inválido.'];
  }
  for (const [field, envField] of [['runId', 'GITHUB_RUN_ID'], ['runAttempt', 'GITHUB_RUN_ATTEMPT']]) {
    if (env[envField] && Number(timings[field]) !== Number(env[envField])) {
      problems.push('identidade do workflow diverge em ' + field + '.');
    }
  }
  const expectedHeadSha = env.GITHUB_HEAD_SHA || env.GITHUB_SHA;
  if (expectedHeadSha && String(timings.sha).toLowerCase() !== String(expectedHeadSha).toLowerCase()) {
    problems.push('identidade do workflow diverge em HEAD SHA.');
  }
  if (!/^[0-9a-f]{40}$/i.test(String(timings.workflowSha || ''))) {
    problems.push('identidade do workflow sem SHA efetivamente executado.');
  } else if (env.GITHUB_SHA && String(timings.workflowSha).toLowerCase() !== String(env.GITHUB_SHA).toLowerCase()) {
    problems.push('identidade do workflow diverge em SHA executado.');
  }
  return problems;
}

function matchJobs(timings, kind, runnerOs, expectedIds, jobPrefix = 'Coverage shard') {
  const problems = [];
  const expected = new Set(expectedIds.map(String));
  const matched = new Map();
  const coverageJobPrefixes = new Set(['Coverage shard', 'Structure coverage shard']);
  if (kind === 'coverage' && !coverageJobPrefixes.has(jobPrefix)) {
    problems.push('prefixo de job coverage inválido: ' + jobPrefix + '.');
  }
  const prefix = kind === 'coverage' ? jobPrefix + ' (' + runnerOs + ' / ' : 'E2E Shard (';
  for (const job of timings.jobs) {
    if (!String(job.name).startsWith(prefix)) continue;
    let id;
    if (kind === 'coverage') {
      const escapedPrefix = jobPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp('^' + escapedPrefix + ' \\((ubuntu-latest|windows-latest) / (\\d+)\\)$')
        .exec(job.name);
      if (!match || match[1] !== runnerOs) continue;
      id = match[2];
    } else {
      const match = /^E2E Shard \(([^)]+)\)$/.exec(job.name);
      if (!match) {
        problems.push('nome de job E2E inválido: ' + job.name);
        continue;
      }
      id = match[1];
    }
    if (!expected.has(id)) {
      problems.push('job extra de shard ' + kind + ': ' + job.name);
      continue;
    }
    if (matched.has(id)) problems.push('job duplicado para shard ' + id + '.');
    else matched.set(id, job);
  }
  for (const id of expected) if (!matched.has(id)) problems.push('job obrigatório ausente: ' + id + '.');
  return { problems, matched };
}

function validateWallTimes(rows, maxMs = MAX_JOB_MS, maxSpreadRatio = MAX_SPREAD_RATIO) {
  const problems = [];
  // Actions job timestamps are reported to whole seconds. Keep a one-second
  // margin so a reported duration at the threshold cannot hide a real job
  // that crossed the two-minute ceiling due to timestamp truncation.
  const observedLimitMs = Math.max(0, maxMs - ACTIONS_TIMESTAMP_RESOLUTION_MS);
  const measured = rows.map((row) => ({ ...row, jobWallMs: jobDurationMs(row.job) }));
  for (const row of measured) {
    if (row.job.conclusion !== 'success') problems.push(row.id + ': job terminou como ' + row.job.conclusion + '.');
    if (!Number.isFinite(row.jobWallMs) || row.jobWallMs <= 0) {
      problems.push(row.id + ': timestamps de início/fim ausentes ou inválidos.');
    } else if (row.jobWallMs > observedLimitMs) {
      problems.push(row.id + ': job durou ' + Math.round(row.jobWallMs) + 'ms; limite observado=' +
        observedLimitMs + 'ms (teto real=' + maxMs + 'ms; margem de precisão Actions=' +
        ACTIONS_TIMESTAMP_RESOLUTION_MS + 'ms).');
    }
  }
  const valid = measured.map((row) => row.jobWallMs).filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === measured.length && valid.length > 1) {
    const ratio = Math.max(...valid) / Math.min(...valid);
    if (ratio > maxSpreadRatio) problems.push('spread wall-clock real=' + ratio.toFixed(3) +
      '; limite=' + maxSpreadRatio.toFixed(3) + '.');
  }
  return { problems, rows: measured };
}

function validateWorkflowShardMetrics({ profileName, timings, manifest = workflowShardMetrics, env = {} }) {
  const problems = validateRunIdentity(timings, env);
  const profile = manifest?.profiles?.[profileName];
  if (!profile || !Array.isArray(profile.ids) || profile.ids.length !== profile.shardsPerOs ||
      new Set(profile.ids).size !== profile.ids.length || profile.ids.length < 10 ||
      profile.maxJobMs <= 0 || profile.maxJobMs > MAX_JOB_MS ||
      profile.maxSpreadRatio <= 1 || profile.maxSpreadRatio > MAX_SPREAD_RATIO ||
      !profile.jobPrefix || !profile.workStep) {
    problems.push('perfil de workflow shard inválido ou abaixo dos limites protegidos.');
  }
  if (!profile) {
    return { ok: false, problems, summary: { schemaVersion: 1, kind: 'workflow', profileName,
      jobs: [], problems } };
  }

  const rows = [];
  const expectedNames = new Set();
  const matchedNames = new Set();
  const byOs = {};
  for (const runnerOs of ['ubuntu-latest', 'windows-latest']) {
    byOs[runnerOs] = [];
    for (const id of profile.ids) {
      const name = profile.jobPrefix + ' (' + runnerOs + ' / ' + id + ')';
      expectedNames.add(name);
      const matches = timings.jobs.filter((job) => job.name === name);
      if (matches.length === 0) {
        problems.push('job obrigatório ausente: ' + name + '.');
        continue;
      }
      if (matches.length > 1) {
        problems.push('job duplicado para shard: ' + name + '.');
        continue;
      }
      const job = matches[0];
      matchedNames.add(name);
      if (Number(job.runId) !== Number(timings.runId) ||
          Number(job.runAttempt) !== Number(timings.runAttempt) ||
          String(job.headSha).toLowerCase() !== String(timings.sha).toLowerCase()) {
        problems.push(name + ': identidade do job diverge do workflow.');
      }
      const stepMatches = (job.steps || []).filter((step) => step.name === profile.workStep);
      if (stepMatches.length !== 1) {
        problems.push(name + ': esperado exatamente um step de trabalho útil "' + profile.workStep + '".');
        continue;
      }
      const step = stepMatches[0];
      const usefulWorkMs = timestampMs(step.completedAt) - timestampMs(step.startedAt);
      // GitHub's Actions API timestamps have second-level precision. A valid
      // successful step shorter than one second can therefore be reported as
      // 0ms; preserve that observation as zero efficiency instead of treating
      // the step as missing or failed.
      if (step.conclusion !== 'success' || !Number.isFinite(usefulWorkMs) || usefulWorkMs < 0) {
        problems.push(name + ': step de trabalho útil falhou ou tem timestamps inválidos.');
      }
      const jobStartMs = timestampMs(job.startedAt);
      const jobEndMs = timestampMs(job.completedAt);
      const stepStartMs = timestampMs(step.startedAt);
      const stepEndMs = timestampMs(step.completedAt);
      if ([jobStartMs, jobEndMs, stepStartMs, stepEndMs].every(Number.isFinite) &&
          (stepStartMs < jobStartMs - ACTIONS_TIMESTAMP_RESOLUTION_MS ||
           stepEndMs > jobEndMs + ACTIONS_TIMESTAMP_RESOLUTION_MS)) {
        problems.push(name + ': intervalo do step de trabalho útil está fora do job.');
      }
      const row = { id: runnerOs + ' / ' + id, job, usefulWorkMs, workers: 1, testCount: null };
      rows.push(row);
      byOs[runnerOs].push(row);
    }
  }

  for (const job of timings.jobs) {
    if (String(job.name).startsWith(profile.jobPrefix + ' (') && !expectedNames.has(job.name)) {
      problems.push('job extra de shard ' + profileName + ': ' + job.name + '.');
    }
  }

  const measuredRows = [];
  const spreadByOs = {};
  for (const [runnerOs, osRows] of Object.entries(byOs)) {
    const wall = validateWallTimes(osRows, profile.maxJobMs, profile.maxSpreadRatio);
    problems.push(...wall.problems);
    for (const row of wall.rows) {
      if (Number.isFinite(row.usefulWorkMs) && Number.isFinite(row.jobWallMs) &&
          row.usefulWorkMs > row.jobWallMs) {
        problems.push(row.id + ': duração útil do step excede o wall-clock do job.');
      }
    }
    measuredRows.push(...wall.rows);
    const times = wall.rows.map((row) => row.jobWallMs).filter((value) => Number.isFinite(value) && value > 0);
    spreadByOs[runnerOs] = times.length === profile.ids.length
      ? Math.max(...times) / Math.min(...times) : null;
    if (times.length === profile.ids.length && spreadByOs[runnerOs] > profile.maxSpreadRatio) {
      problems.push(runnerOs + ': spread wall-clock real=' + spreadByOs[runnerOs].toFixed(3) +
        '; limite=' + profile.maxSpreadRatio.toFixed(3) + '.');
    }
  }
  const totalUsefulWorkMs = measuredRows.reduce((sum, row) => sum + (Number(row.usefulWorkMs) || 0), 0);
  const totalJobCapacityMs = measuredRows.reduce((sum, row) => sum + row.jobWallMs, 0);
  const efficiency = totalJobCapacityMs > 0 ? totalUsefulWorkMs / totalJobCapacityMs : 0;
  const runtimes = measuredRows.map((row) => row.jobWallMs).filter((value) => Number.isFinite(value) && value > 0);
  const validSpreads = Object.values(spreadByOs).filter(Number.isFinite);
  const summary = {
    schemaVersion: 1,
    kind: 'workflow',
    title: profile.title,
    profileName,
    jobPrefix: profile.jobPrefix,
    runId: timings.runId,
    runAttempt: timings.runAttempt,
    sha: timings.sha,
    shardCountPerOs: profile.ids.length,
    maxJobMs: runtimes.length ? Math.max(...runtimes) : null,
    timingPrecisionMs: ACTIONS_TIMESTAMP_RESOLUTION_MS,
    maxObservedJobMs: MAX_OBSERVED_JOB_MS,
    minJobMs: runtimes.length ? Math.min(...runtimes) : null,
    spreadRatio: validSpreads.length ? Math.max(...validSpreads) : null,
    spreadByOs,
    totalUsefulWorkMs,
    totalJobCapacityMs,
    usefulWorkEfficiency: efficiency,
    targetEfficiency: 0.8,
    belowEfficiencyTarget: efficiency < 0.8,
    usefulWorkSource: 'Actions API step duration: ' + profile.workStep,
    jobs: measuredRows.map((row) => ({
      id: row.id,
      name: row.job.name,
      jobWallMs: Math.round(row.jobWallMs),
      usefulWorkMs: Math.round(row.usefulWorkMs),
      workers: 1,
      usefulWorkEfficiency: row.jobWallMs > 0 ? row.usefulWorkMs / row.jobWallMs : 0,
    })),
    problems,
  };
  return { ok: problems.length === 0, problems, summary };
}

function readCoverageWork(inputDir, id, expectedCount, identity) {
  const file = path.join(inputDir, 'shard-' + id, 'shard-result.json');
  if (!fs.existsSync(file)) throw new Error('metadata de coverage ausente: ' + file);
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (metadata.status !== 'passed' || metadata.shardIndex !== Number(id) ||
      metadata.shardCount !== expectedCount) throw new Error('metadata de coverage diverge para shard ' + id + '.');
  if (Number(metadata.githubRunId) !== Number(identity.runId) ||
      Number(metadata.githubRunAttempt) !== Number(identity.runAttempt) ||
      String(metadata.githubSha).toLowerCase() !== String(identity.workflowSha).toLowerCase()) {
    throw new Error('metadata de coverage pertence a outro run/attempt/SHA no shard ' + id + '.');
  }
  const usefulWorkMs = Number(metadata.usefulWorkMs);
  if (!Number.isFinite(usefulWorkMs) || usefulWorkMs <= 0) {
    throw new Error('trabalho útil ausente ou zero no shard ' + id + '.');
  }
  return { usefulWorkMs, workers: 1, testCount: Number(metadata.passedCases) };
}

function validateShardJobMetrics({ kind, runnerOs, jobPrefix = 'Coverage shard', timings, plan, inputDir, workFile, env = {} }) {
  const problems = validateRunIdentity(timings, env);
  const ids = kind === 'coverage'
    ? Array.from({ length: Number(plan.shardCount) }, (_, index) => String(index + 1))
    : (plan.groups || []).map((group) => String(group.id));
  if (ids.length < (kind === 'coverage' ? 10 : 5) || new Set(ids).size !== ids.length) {
    problems.push('plano de shards inválido ou abaixo do piso esperado.');
  }
  const matched = matchJobs(timings, kind, runnerOs, ids, jobPrefix);
  problems.push(...matched.problems);

  let workById = new Map();
  if (kind === 'coverage') {
    for (const id of ids) {
      try { workById.set(id, readCoverageWork(inputDir, id, ids.length, timings)); }
      catch (error) { problems.push(error.message); }
    }
  } else if (kind === 'e2e') {
    if (!workFile || !fs.existsSync(workFile)) {
      problems.push('telemetria de trabalho útil E2E ausente.');
    } else {
      let work;
      try { work = JSON.parse(fs.readFileSync(workFile, 'utf8')); }
      catch (error) { problems.push('telemetria E2E inválida: ' + error.message); }
      if (!work || typeof work !== 'object' || Array.isArray(work)) {
        problems.push('telemetria E2E precisa ser um objeto válido.');
      } else {
        if (work.gatePassed !== true || work.runStatus !== 'passed' || work.skipped !== 0 || work.flaky !== 0 || work.failed !== 0) {
          problems.push('telemetria E2E deve registrar passed e zero skipped/flaky/failed.');
        }
        if (work.schemaVersion !== 1 || Number(work.runId) !== Number(timings.runId) ||
            Number(work.runAttempt) !== Number(timings.runAttempt) ||
            String(work.sha).toLowerCase() !== String(timings.workflowSha).toLowerCase() ||
            String(work.headSha).toLowerCase() !== String(timings.sha).toLowerCase()) {
          problems.push('telemetria E2E pertence a outro run/attempt/SHA.');
        }
        if (!Array.isArray(work.groups) || work.groups.length !== ids.length || ids.length !== 5) {
          problems.push('telemetria E2E precisa conter exatamente os cinco grupos planejados.');
        }
        for (const group of Array.isArray(work.groups) ? work.groups : []) {
          if (!group || typeof group !== 'object' || Array.isArray(group)) {
            problems.push('telemetria de grupo E2E inválida.');
            continue;
          }
          const id = String(group.id);
          if (!ids.includes(id) || workById.has(id)) {
            problems.push('telemetria de grupo E2E inesperada ou duplicada: ' + id + '.');
            continue;
          }
          const planned = plan.groups.find((entry) => entry.id === id);
          if (Number(group.expectedTests) !== planned.expectedTests ||
              Number(group.observedTests) !== planned.expectedTests ||
              Number(group.workers) !== planned.workers) {
            problems.push('inventário/workers E2E divergem do plano em ' + id + '.');
          }
          const usefulWorkMs = Number(group.usefulWorkMs);
          if (!Number.isFinite(usefulWorkMs) || usefulWorkMs <= 0) {
            problems.push('trabalho útil E2E ausente ou zero em ' + id + '.');
          }
          workById.set(id, { usefulWorkMs, workers: planned.workers, testCount: group.observedTests });
        }
        for (const id of ids) if (!workById.has(id)) problems.push('telemetria E2E ausente para ' + id + '.');
      }
    }
  } else {
    problems.push('kind de métricas deve ser coverage ou e2e.');
  }

  const rows = ids.filter((id) => matched.matched.has(id) && workById.has(id)).map((id) => ({
    id,
    job: matched.matched.get(id),
    ...workById.get(id),
  }));
  const wall = validateWallTimes(rows);
  problems.push(...wall.problems);
  for (const row of wall.rows) {
    if (Number.isFinite(row.usefulWorkMs) && Number.isFinite(row.jobWallMs) &&
        row.usefulWorkMs > row.jobWallMs) {
      problems.push(row.id + ': trabalho útil wall-clock excede a duração total do job.');
    }
  }
  const totalUsefulWorkMs = wall.rows.reduce((sum, row) => sum + (Number(row.usefulWorkMs) || 0), 0);
  const totalCapacityMs = wall.rows.reduce((sum, row) => sum + row.jobWallMs, 0);
  const efficiency = totalCapacityMs > 0 ? totalUsefulWorkMs / totalCapacityMs : 0;
  const runtimes = wall.rows.map((row) => row.jobWallMs).filter((value) => Number.isFinite(value) && value > 0);
  const summary = {
    schemaVersion: 1,
    kind,
    runnerOs: runnerOs || null,
    jobPrefix: kind === 'coverage' ? jobPrefix : null,
    runId: timings.runId,
    runAttempt: timings.runAttempt,
    sha: timings.sha,
    shardCount: ids.length,
    maxJobMs: runtimes.length ? Math.max(...runtimes) : null,
    timingPrecisionMs: ACTIONS_TIMESTAMP_RESOLUTION_MS,
    maxObservedJobMs: MAX_OBSERVED_JOB_MS,
    minJobMs: runtimes.length ? Math.min(...runtimes) : null,
    spreadRatio: runtimes.length ? Math.max(...runtimes) / Math.min(...runtimes) : null,
    totalUsefulWorkMs,
    totalJobCapacityMs: totalCapacityMs,
    usefulWorkEfficiency: efficiency,
    targetEfficiency: 0.8,
    belowEfficiencyTarget: efficiency < 0.8,
    usefulWorkSource: kind === 'coverage'
      ? 'sum of observed Jest suite/file runtimes from shard metadata'
      : 'union of active Playwright test intervals grouped by plan selector',
    jobs: wall.rows.map((row) => ({
      id: row.id,
      name: row.job.name,
      jobWallMs: Math.round(row.jobWallMs),
      usefulWorkMs: Math.round(row.usefulWorkMs),
      workers: row.workers,
      usefulWorkEfficiency: row.jobWallMs > 0
        ? row.usefulWorkMs / row.jobWallMs : 0,
      testCount: row.testCount,
    })),
    problems,
  };
  return { ok: problems.length === 0, problems, summary };
}

function markdownSummary(summary) {
  const title = summary.title || (summary.kind === 'coverage' ? 'Coverage shard wall-clock' : 'E2E shard wall-clock');
  const rows = summary.jobs.map((job) => '| ' + job.id + ' | ' + (job.jobWallMs / 1000).toFixed(1) +
    's | ' + (job.usefulWorkMs / 1000).toFixed(1) + 's | ' + job.workers + ' | ' +
    (job.usefulWorkEfficiency * 100).toFixed(1) + '% |');
  const maxJob = Number.isFinite(summary.maxJobMs) ? (summary.maxJobMs / 1000).toFixed(1) + 's' : 'indisponível';
  const spread = Number.isFinite(summary.spreadRatio) ? Number(summary.spreadRatio).toFixed(3) : 'indisponível';
  const lines = [
    '### ' + title + (summary.runnerOs ? ' — ' + summary.runnerOs : ''),
    '',
    '| Shard | Job wall | Trabalho útil | Workers | Eficiência útil/job |',
    '|---|---:|---:|---:|---:|',
    ...rows,
    '',
    'Máximo=' + maxJob + '; spread max/min=' + spread + '; eficiência agregada=' +
      (summary.usefulWorkEfficiency * 100).toFixed(1) + '% (meta ideal ≥80%; inclui setup no denominador).',
    'Resolução dos timestamps Actions=' + (summary.timingPrecisionMs || ACTIONS_TIMESTAMP_RESOLUTION_MS) +
      'ms; limite observado=' + ((summary.maxObservedJobMs || MAX_OBSERVED_JOB_MS) / 1000).toFixed(1) +
      's para respeitar o teto real de 120s.',
    'Fonte do trabalho útil: ' + summary.usefulWorkSource + '.',
  ];
  if (summary.belowEfficiencyTarget) lines.push('',
    'Nota: eficiência abaixo da meta ideal de 80%. Revisar overhead de checkout, instalação e upload; é uma meta de otimização, não um gate funcional.');
  if (summary.problems.length) lines.push('', '**Falhas:**', ...summary.problems.map((problem) => '- ' + problem));
  if (summary.spreadByOs) {
    lines.push('', 'Spread por sistema: ' + Object.entries(summary.spreadByOs)
      .map(([os, ratio]) => os + '=' + (ratio == null ? 'indisponível' : ratio.toFixed(3)))
      .join('; ') + '.');
  }
  return lines.join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const kind = args.kind;
  const timingsPath = path.resolve(args.timings || path.join('.ci-results', 'github-job-timings.json'));
  const timings = JSON.parse(fs.readFileSync(timingsPath, 'utf8'));
  const plan = kind === 'coverage' ? coverageManifest : e2ePlan;
  const result = kind === 'workflow'
    ? validateWorkflowShardMetrics({ profileName: args.profile, timings, env: process.env })
    : validateShardJobMetrics({
      kind,
      runnerOs: args.os,
      jobPrefix: args['job-prefix'] || 'Coverage shard',
      timings,
      plan,
      inputDir: path.resolve(args.input || 'coverage-shards'),
      workFile: args.work ? path.resolve(args.work) : null,
      env: process.env,
    });
  const markdown = markdownSummary(result.summary);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8');
  }
  const outputPath = path.resolve(args.output || path.join('.ci-results', kind + '-job-metrics' +
    (args.os ? '-' + args.os : '') + '.json'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result.summary, null, 2) + '\n');
  if (!result.ok) {
    console.error('Falha no contrato de wall-clock dos shards:\n- ' + result.problems.join('\n- '));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('Falha ao calcular métricas de shards: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  MAX_JOB_MS,
  ACTIONS_TIMESTAMP_RESOLUTION_MS,
  MAX_OBSERVED_JOB_MS,
  MAX_SPREAD_RATIO,
  jobDurationMs,
  markdownSummary,
  matchJobs,
  parseArgs,
  validateRunIdentity,
  validateWorkflowShardMetrics,
  validateShardJobMetrics,
  validateWallTimes,
};

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const coveragePlan = require('../ci/data/coverage-shard-plan.json');
const e2ePlan = require('../ci/data/e2e-shard-plan.json');
const workflowProfiles = require('../ci/data/workflow-shard-metrics.json');
const { validateShardJobMetrics } = require('../ci/verify-shard-job-metrics');
const { validateWorkflowShardMetrics } = require('../ci/verify-shard-job-metrics');
const { fetchJobTimings } = require('../ci/fetch-github-job-timings');

const sha = 'a'.repeat(40);
const workflowSha = 'b'.repeat(40);
const identity = { schemaVersion: 1, repository: 'Diesper/Manga_Translator', runId: 1234,
  runAttempt: 2, sha, workflowSha, jobs: [] };

function timedJob(name, wallMs, conclusion = 'success') {
  const start = Date.parse('2026-10-03T12:00:00.000Z');
  return {
    name,
    status: 'completed',
    conclusion,
    startedAt: new Date(start).toISOString(),
    completedAt: new Date(start + wallMs).toISOString(),
  };
}

function testCoverageWallClockAndInventory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-ci-coverage-job-metrics-'));
  try {
    const inputDir = path.join(root, 'coverage-shards');
    const jobs = [];
    for (let index = 1; index <= coveragePlan.shardCount; index += 1) {
      const dir = path.join(inputDir, 'shard-' + index);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shard-result.json'), JSON.stringify({
        status: 'passed',
        shardIndex: index,
        shardCount: coveragePlan.shardCount,
        githubRunId: identity.runId,
        githubRunAttempt: identity.runAttempt,
        githubSha: workflowSha,
        usefulWorkMs: 10000 + index,
        passedCases: 1,
      }));
      jobs.push(timedJob('Coverage shard (ubuntu-latest / ' + index + ')', 50000 + index * 1000));
    }
    const timings = { ...identity, jobs };
    const env = { GITHUB_RUN_ID: String(identity.runId), GITHUB_RUN_ATTEMPT: String(identity.runAttempt),
      GITHUB_SHA: workflowSha, GITHUB_HEAD_SHA: sha };
    const result = validateShardJobMetrics({ kind: 'coverage', runnerOs: 'ubuntu-latest', timings,
      plan: coveragePlan, inputDir, env });
    assert(result.ok, result.problems.join('; '));
    assert.strictEqual(result.summary.shardCount, coveragePlan.shardCount);
    assert(result.summary.belowEfficiencyTarget, 'setup overhead baixo deve ser relatado, não ocultado.');
    assert.strictEqual(result.summary.timingPrecisionMs, 1000);
    assert.strictEqual(result.summary.maxObservedJobMs, 119000,
      'resolução em segundos deve reduzir o máximo observado para 119s frente ao teto real de 120s.');

    const structureTimings = { ...timings, jobs: jobs.map((job) => ({
      ...job,
      name: job.name.replace('Coverage shard', 'Structure coverage shard'),
    })) };
    const structureResult = validateShardJobMetrics({ kind: 'coverage', jobPrefix: 'Structure coverage shard',
      runnerOs: 'ubuntu-latest', timings: structureTimings, plan: coveragePlan, inputDir, env });
    assert(structureResult.ok, structureResult.problems.join('; '));

    const missing = validateShardJobMetrics({ kind: 'coverage', runnerOs: 'ubuntu-latest',
      timings: { ...timings, jobs: jobs.slice(1) }, plan: coveragePlan, inputDir, env });
    assert(!missing.ok && missing.problems.some((problem) => problem.includes('job obrigatório ausente')),
      'job coverage ausente deve falhar fechado.');

    const tooSlowJobs = jobs.slice();
    tooSlowJobs[0] = timedJob(tooSlowJobs[0].name, 120000);
    const tooSlow = validateShardJobMetrics({ kind: 'coverage', runnerOs: 'ubuntu-latest',
      timings: { ...timings, jobs: tooSlowJobs }, plan: coveragePlan, inputDir, env });
    assert(!tooSlow.ok && tooSlow.problems.some((problem) => problem.includes('limite observado=119000ms')),
      'timestamp arredondado no teto real deve falhar com margem conservadora de precisão.');

    const unbalancedJobs = jobs.slice();
    unbalancedJobs[0] = timedJob(unbalancedJobs[0].name, 30000);
    const unbalanced = validateShardJobMetrics({ kind: 'coverage', runnerOs: 'ubuntu-latest',
      timings: { ...timings, jobs: unbalancedJobs }, plan: coveragePlan, inputDir, env });
    assert(!unbalanced.ok && unbalanced.problems.some((problem) => problem.includes('spread wall-clock real')),
      'skew wall-clock acima de 30% deve falhar.');

    const staleSha = validateShardJobMetrics({ kind: 'coverage', runnerOs: 'ubuntu-latest',
      timings: { ...timings, sha: 'b'.repeat(40) }, plan: coveragePlan, inputDir, env });
    assert(!staleSha.ok && staleSha.problems.some((problem) => problem.includes('diverge em HEAD SHA')),
      'telemetria vinculada a outro HEAD deve falhar.');
    const staleWorkflowSha = validateShardJobMetrics({ kind: 'coverage', runnerOs: 'ubuntu-latest',
      timings: { ...timings, workflowSha: 'c'.repeat(40) }, plan: coveragePlan, inputDir, env });
    assert(!staleWorkflowSha.ok && staleWorkflowSha.problems.some((problem) => problem.includes('SHA executado')),
      'telemetria vinculada a outro merge/checkout deve falhar.');
    console.log('✓ coverage reporta eficiência útil/job e barra jobs longos, desbalanceados, ausentes ou stale.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testE2eWorkAndExactMatrix() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-ci-e2e-job-metrics-'));
  try {
    const workFile = path.join(root, 'e2e-work.json');
    const jobs = e2ePlan.groups.map((group) => timedJob('E2E Shard (' + group.id + ')',
      Math.round(group.estimatedJobSeconds * 1000)));
    fs.writeFileSync(workFile, JSON.stringify({
      schemaVersion: 1,
      runStatus: 'passed',
      gatePassed: true,
      skipped: 0,
      flaky: 0,
      failed: 0,
      sha: workflowSha,
      headSha: sha,
      runId: identity.runId,
      runAttempt: identity.runAttempt,
      groups: e2ePlan.groups.map((group) => ({
        id: group.id,
        workers: group.workers,
        expectedTests: group.expectedTests,
        observedTests: group.expectedTests,
        usefulWorkMs: Math.round(group.estimatedSeconds * 1000),
      })),
    }));
    const result = validateShardJobMetrics({ kind: 'e2e', timings: { ...identity, jobs },
      plan: e2ePlan, workFile, env: { GITHUB_RUN_ID: String(identity.runId),
        GITHUB_RUN_ATTEMPT: String(identity.runAttempt), GITHUB_SHA: workflowSha, GITHUB_HEAD_SHA: sha } });
    assert(result.ok, result.problems.join('; '));
    assert.strictEqual(result.summary.shardCount, 5);
    assert(result.summary.spreadRatio <= 1.3, 'grupos E2E balanceados devem estar abaixo de 30%.');
    const expectedEfficiency = result.summary.jobs.reduce((sum, job) => sum + job.usefulWorkMs, 0) /
      result.summary.jobs.reduce((sum, job) => sum + job.jobWallMs, 0);
    assert.strictEqual(result.summary.usefulWorkEfficiency, expectedEfficiency,
      'eficiência agregada deve usar a fórmula tempo útil dividido por tempo total dos jobs.');
    assert(result.summary.jobs.every((job) => job.usefulWorkEfficiency === job.usefulWorkMs / job.jobWallMs),
      'eficiência por shard deve incluir todo o wall-clock do job no denominador.');

    const validWork = JSON.parse(fs.readFileSync(workFile, 'utf8'));
    for (const badWork of [null, false, 0, '', { ...validWork, runStatus: 'failed' },
      { ...validWork, gatePassed: false }, { ...validWork, gatePassed: undefined },
      ...['skipped', 'flaky', 'failed'].map((field) => ({ ...validWork, [field]: 1 })),
      { ...validWork, groups: validWork.groups.slice(1) },
      { ...validWork, groups: [...validWork.groups, validWork.groups[0]] },
      { ...validWork, groups: [null, ...validWork.groups.slice(1)] }]) {
      fs.writeFileSync(workFile, JSON.stringify(badWork));
      assert(!validateShardJobMetrics({ kind: 'e2e', timings: { ...identity, jobs },
        plan: e2ePlan, workFile }).ok, 'telemetria terminal/inventário inválido deve falhar fechado.');
    }
    fs.writeFileSync(workFile, JSON.stringify(validWork));

    const invalidWork = JSON.parse(fs.readFileSync(workFile, 'utf8'));
    invalidWork.groups[0].observedTests -= 1;
    fs.writeFileSync(workFile, JSON.stringify(invalidWork));
    const incomplete = validateShardJobMetrics({ kind: 'e2e', timings: { ...identity, jobs },
      plan: e2ePlan, workFile, env: { GITHUB_RUN_ID: String(identity.runId),
        GITHUB_RUN_ATTEMPT: String(identity.runAttempt), GITHUB_SHA: workflowSha, GITHUB_HEAD_SHA: sha } });
    assert(!incomplete.ok && incomplete.problems.some((problem) => problem.includes('inventário/workers E2E')),
      'telemetria E2E com casos omitidos deve falhar.');
    console.log('✓ E2E vincula duração útil real, workers e inventário à matriz executada.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function makeWorkflowTimings(profileName, durationFor = () => 30000) {
  const profile = workflowProfiles.profiles[profileName];
  const jobs = [];
  let index = 0;
  for (const osName of ['ubuntu-latest', 'windows-latest']) {
    for (const id of profile.ids) {
      const duration = durationFor(osName, id, index++);
      const start = Date.parse('2026-10-03T12:00:00.000Z');
      jobs.push({
        ...timedJob(profile.jobPrefix + ' (' + osName + ' / ' + id + ')', duration),
        runId: identity.runId,
        runAttempt: identity.runAttempt,
        headSha: identity.sha,
        steps: [{
          name: profile.workStep,
          status: 'completed',
          conclusion: 'success',
          startedAt: new Date(start + 2000).toISOString(),
          completedAt: new Date(start + duration - 2000).toISOString(),
        }],
      });
    }
  }
  return { ...identity, jobs };
}

function testWorkflowMatrixWallClockAndEfficiency() {
  const env = { GITHUB_RUN_ID: String(identity.runId), GITHUB_RUN_ATTEMPT: String(identity.runAttempt),
    GITHUB_SHA: workflowSha, GITHUB_HEAD_SHA: sha };
  for (const profileName of ['protocol', 'structure']) {
    const profile = workflowProfiles.profiles[profileName];
    const timings = makeWorkflowTimings(profileName, (_osName, _id, index) => 30000 + (index % 5) * 500);
    const result = validateWorkflowShardMetrics({ profileName, timings, env });
    assert(result.ok, profileName + ': ' + result.problems.join('; '));
    assert.strictEqual(result.summary.shardCountPerOs, profile.shardsPerOs);
    assert.strictEqual(result.summary.jobs.length, profile.shardsPerOs * 2);
    assert.strictEqual(result.summary.maxObservedJobMs, 119000);
    assert(Object.values(result.summary.spreadByOs).every((ratio) => ratio <= profile.maxSpreadRatio));

    const osSpecificTimings = makeWorkflowTimings(profileName, (osName, _id, index) =>
      (osName === 'windows-latest' ? 60000 : 30000) + (index % profile.ids.length % 4) * 500);
    const osSpecificResult = validateWorkflowShardMetrics({ profileName, timings: osSpecificTimings, env });
    assert(osSpecificResult.ok, profileName + ': cada OS é balanceado independentemente: ' +
      osSpecificResult.problems.join('; '));

    const subsecondStepTimings = makeWorkflowTimings(profileName);
    const shortStep = subsecondStepTimings.jobs[0].steps[0];
    shortStep.completedAt = shortStep.startedAt;
    const subsecondStepResult = validateWorkflowShardMetrics({ profileName, timings: subsecondStepTimings, env });
    assert(subsecondStepResult.ok, profileName + ': step válido arredondado pela API para 0ms deve ser medido com eficiência zero: ' +
      subsecondStepResult.problems.join('; '));
    assert.strictEqual(subsecondStepResult.summary.jobs[0].usefulWorkMs, 0);

    for (const invalidDate of ['2026-02-30T12:00:02Z', '2025-02-29T12:00:02Z']) {
      const invalidTimings = makeWorkflowTimings(profileName);
      invalidTimings.jobs[0].steps[0].startedAt = invalidDate;
      assert(!validateWorkflowShardMetrics({ profileName, timings: invalidTimings, env }).ok,
        profileName + ': data impossível deve ser rejeitada sem normalização.');
    }
    const outsideTimings = makeWorkflowTimings(profileName);
    outsideTimings.jobs[0].steps[0].startedAt = '2026-10-02T12:00:02Z';
    outsideTimings.jobs[0].steps[0].completedAt = '2026-10-02T12:00:28Z';
    const outsideResult = validateWorkflowShardMetrics({ profileName, timings: outsideTimings, env });
    assert(!outsideResult.ok && outsideResult.problems.some((problem) => problem.includes('fora do job')),
      profileName + ': step fora do intervalo do job deve falhar.');
    const offsetTimings = makeWorkflowTimings(profileName);
    offsetTimings.jobs[0].steps[0].startedAt = '2026-10-03T09:00:02-03:00';
    offsetTimings.jobs[0].steps[0].completedAt = '2026-10-03T14:00:28+02:00';
    assert(validateWorkflowShardMetrics({ profileName, timings: offsetTimings, env }).ok,
      profileName + ': offsets RFC3339 válidos devem representar o mesmo intervalo UTC.');
    const toleranceTimings = makeWorkflowTimings(profileName);
    toleranceTimings.jobs[0].steps[0].startedAt = '2026-10-03T11:59:59Z';
    toleranceTimings.jobs[0].steps[0].completedAt = '2026-10-03T12:00:20Z';
    assert(validateWorkflowShardMetrics({ profileName, timings: toleranceTimings, env }).ok,
      profileName + ': contenção tolera exatamente um segundo de resolução Actions.');
    toleranceTimings.jobs[0].steps[0].startedAt = '2026-10-03T11:59:58Z';
    assert(!validateWorkflowShardMetrics({ profileName, timings: toleranceTimings, env }).ok,
      profileName + ': contenção rejeita diferença maior que um segundo.');

    const missingJob = validateWorkflowShardMetrics({ profileName,
      timings: { ...timings, jobs: timings.jobs.slice(1) }, env });
    assert(!missingJob.ok && missingJob.problems.some((problem) => problem.includes('job obrigatório ausente')),
      profileName + ': shard ausente deve falhar fechado.');

    const tooSlow = validateWorkflowShardMetrics({ profileName,
      timings: makeWorkflowTimings(profileName, (_osName, _id, index) => index === 0 ? 120000 : 30000), env });
    assert(!tooSlow.ok && tooSlow.problems.some((problem) => problem.includes('limite observado=119000ms')),
      profileName + ': shard sem margem para teto de dois minutos deve falhar.');

    const unbalanced = validateWorkflowShardMetrics({ profileName,
      timings: makeWorkflowTimings(profileName, (_osName, _id, index) => index === 0 ? 10000 : 30000), env });
    assert(!unbalanced.ok && unbalanced.problems.some((problem) => problem.includes('spread wall-clock real')),
      profileName + ': skew real acima de 30% deve falhar.');
  }
  console.log('✓ protocol e structure validam inventário, limite de 120s, spread por OS, eficiência real e resolução de timestamps.');
}

async function testPullRequestHeadAndMergeIdentity() {
  const originalFetch = global.fetch;
  const headSha = 'a'.repeat(40);
  const mergeSha = 'b'.repeat(40);
  const apiCalls = [];
  global.fetch = async (url) => {
    apiCalls.push(String(url));
    const payload = String(url).includes('/actions/runs/1234/jobs?')
      ? { jobs: [{ id: 9, name: 'E2E Shard (fifo)', run_id: 1234, run_attempt: 2,
        head_sha: headSha, status: 'completed', conclusion: 'success',
        started_at: '2026-10-03T12:00:00Z', completed_at: '2026-10-03T12:00:40Z' }] }
      : { id: 1234, run_attempt: 2, head_sha: headSha };
    return { ok: true, json: async () => payload };
  };
  try {
    const timings = await fetchJobTimings({ GITHUB_REPOSITORY: 'Diesper/Manga_Translator',
      GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: mergeSha,
      GITHUB_HEAD_SHA: headSha, GITHUB_TOKEN: 'test-token', GITHUB_API_URL: 'https://api.github.com' });
    assert.strictEqual(timings.sha, headSha, 'Actions head_sha representa o HEAD do PR.');
    assert.strictEqual(timings.workflowSha, mergeSha, 'GITHUB_SHA preserva o merge commit executado.');
    assert.strictEqual(timings.jobs.length, 1);
    await assert.rejects(() => fetchJobTimings({ GITHUB_REPOSITORY: 'Diesper/Manga_Translator',
      GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: mergeSha,
      GITHUB_HEAD_SHA: 'c'.repeat(40), GITHUB_TOKEN: 'test-token', GITHUB_API_URL: 'https://api.github.com' }),
    /HEAD_SHA/);
    console.log('✓ collector separa o HEAD do PR do merge SHA efetivamente testado.');
  } finally {
    global.fetch = originalFetch;
  }
  assert.strictEqual(apiCalls.length, 3, 'consulta run/jobs no PR válido e run no HEAD incorreto.');
}

testCoverageWallClockAndInventory();
testE2eWorkAndExactMatrix();
testWorkflowMatrixWallClockAndEfficiency();
testPullRequestHeadAndMergeIdentity().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

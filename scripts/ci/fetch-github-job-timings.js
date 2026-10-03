'use strict';

const fs = require('fs');
const path = require('path');

function parseOutputPath(args) {
  const inline = args.find((arg) => arg.startsWith('--output='));
  if (inline) return inline.slice('--output='.length);
  const index = args.indexOf('--output');
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return path.join('.ci-results', 'github-job-timings.json');
}

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error('GitHub Actions API retornou ' + response.status + ' em ' + url);
  }
  return response.json();
}

async function fetchJobTimings(env = process.env) {
  const { GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: runIdRaw,
    GITHUB_RUN_ATTEMPT: attemptRaw, GITHUB_SHA: workflowSha,
    GITHUB_HEAD_SHA: expectedHeadShaRaw, GITHUB_TOKEN: token } = env;
  const expectedHeadSha = expectedHeadShaRaw || workflowSha;
  if (!repository || !/^[1-9]\d*$/.test(String(runIdRaw || '')) ||
      !/^[1-9]\d*$/.test(String(attemptRaw || '')) ||
      !/^[0-9a-f]{40}$/i.test(String(workflowSha || '')) ||
      !/^[0-9a-f]{40}$/i.test(String(expectedHeadSha || '')) || !token) {
    throw new Error('GITHUB_REPOSITORY, RUN_ID, RUN_ATTEMPT, HEAD_SHA, SHA e GITHUB_TOKEN são obrigatórios.');
  }
  const apiBase = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const runId = Number(runIdRaw);
  const runAttempt = Number(attemptRaw);
  const encodedRepo = repository.split('/').map(encodeURIComponent).join('/');
  const run = await getJson(apiBase + '/repos/' + encodedRepo + '/actions/runs/' + runId, token);
  if (Number(run.id) !== runId || Number(run.run_attempt) !== runAttempt ||
      String(run.head_sha).toLowerCase() !== String(expectedHeadSha).toLowerCase()) {
    throw new Error('Identidade do workflow run diverge de GITHUB_RUN_ID/ATTEMPT/HEAD_SHA.');
  }

  const jobs = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await getJson(apiBase + '/repos/' + encodedRepo + '/actions/runs/' + runId +
      '/jobs?filter=latest&per_page=100&page=' + page, token);
    if (!Array.isArray(result.jobs)) throw new Error('Resposta de jobs da Actions API inválida.');
    for (const job of result.jobs) {
      if (!/^Coverage shard \(/.test(job.name || '') &&
          !/^Structure coverage shard \(/.test(job.name || '') &&
          !/^Distributed Bible Protocol Infra \(/.test(job.name || '') &&
          !/^Structure Governance \(/.test(job.name || '') &&
          !/^E2E Shard \(/.test(job.name || '')) continue;
      if (job.run_id != null && Number(job.run_id) !== runId) {
        throw new Error('Job ' + job.name + ' pertence a outro workflow run.');
      }
      if (job.run_attempt != null && Number(job.run_attempt) !== runAttempt) continue;
      if (job.head_sha && String(job.head_sha).toLowerCase() !== String(expectedHeadSha).toLowerCase()) {
        throw new Error('Job ' + job.name + ' pertence a outro HEAD.');
      }
      jobs.push({
        id: Number(job.id),
        name: String(job.name || ''),
        status: String(job.status || ''),
        conclusion: job.conclusion || null,
        startedAt: job.started_at || null,
        completedAt: job.completed_at || null,
        runId,
        runAttempt,
        headSha: String(run.head_sha),
        steps: Array.isArray(job.steps) ? job.steps.map((step) => ({
          name: String(step.name || ''),
          status: String(step.status || ''),
          conclusion: step.conclusion || null,
          startedAt: step.started_at || null,
          completedAt: step.completed_at || null,
        })) : [],
      });
    }
    if (result.jobs.length < 100) break;
  }

  return {
    schemaVersion: 1,
    repository,
    runId,
    runAttempt,
    sha: String(run.head_sha),
    workflowSha: String(workflowSha),
    fetchedAt: new Date().toISOString(),
    jobs,
  };
}

async function main() {
  const result = await fetchJobTimings();
  const outputPath = path.resolve(parseOutputPath(process.argv.slice(2)));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  console.log('[CI job timing] capturados ' + result.jobs.length + ' jobs do run ' + result.runId +
    ', attempt=' + result.runAttempt + ', sha=' + result.sha + '.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Falha ao coletar tempos dos jobs GitHub Actions: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { fetchJobTimings, parseOutputPath };

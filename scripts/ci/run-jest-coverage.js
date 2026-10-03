'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadShardPlan, REPO_ROOT } = require('./coverage-shard-plan');

const OUTPUT_ROOT = path.join(REPO_ROOT, '.ci-results', 'coverage-shards');

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (result.error) throw new Error('Falha ao iniciar ' + script + ': ' + result.error.message);
  if (result.status !== 0) throw new Error(script + ' terminou com código ' + String(result.status) + '.');
}

function runFullCoverage() {
  const { plan } = loadShardPlan();
  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  for (let shard = 1; shard <= plan.shardCount; shard += 1) {
    console.log('\n[Coverage] Executando shard ' + shard + '/' + plan.shardCount + '.');
    runNode(path.join(__dirname, 'run-jest-coverage-shard.js'), ['--shard=' + shard]);
  }
  runNode(path.join(__dirname, 'merge-jest-coverage-shards.js'), ['--input=' + OUTPUT_ROOT]);
}

if (require.main === module) {
  try { runFullCoverage(); }
  catch (error) {
    console.error('Cobertura integral sharded falhou: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { runFullCoverage };

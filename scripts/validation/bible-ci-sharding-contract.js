'use strict';

// A deliberately restricted YAML reader for these two generated CI contracts.
// Unsupported YAML (anchors, tags, flow maps, folding) fails closed. This keeps
// governance runnable before npm ci, including Handoff and Final Readiness.
function parseWorkflow(source) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  let cursor = 0;
  const blank = line => !line.trim() || line.trim().startsWith('#');
  const indent = line => line.match(/^ */)[0].length;
  function skip() { while (cursor < lines.length && blank(lines[cursor])) cursor++; }
  function scalar(text) {
    text = text.trim();
    if (text.startsWith('"')) return JSON.parse(text);
    if (text.startsWith("'")) {
      if (!text.endsWith("'")) throw Error('unterminated quote');
      return text.slice(1, -1).replace(/''/g, "'");
    }
    if (text.startsWith('[')) {
      if (!text.endsWith(']')) throw Error('invalid list');
      const inner = text.slice(1, -1).trim();
      return inner ? inner.split(',').map(scalar) : [];
    }
    if (/^[&*!{]|\t/.test(text)) throw Error('unsupported YAML scalar');
    text = text.replace(/\s+#.*$/, '');
    if (text === 'false') return false;
    if (text === 'true') return true;
    if (text === 'null' || text === '~') return null;
    if (/^\d+$/.test(text)) return Number(text);
    return text;
  }
  function value(text, parentIndent) {
    if (text === '|') {
      const start = cursor;
      let blockIndent;
      for (let i = cursor; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        if (indent(lines[i]) <= parentIndent) break;
        blockIndent = indent(lines[i]); break;
      }
      const result = [];
      while (cursor < lines.length && (!lines[cursor].trim() || indent(lines[cursor]) > parentIndent)) {
        if (lines[cursor].trim() && indent(lines[cursor]) < blockIndent) throw Error('invalid block indentation');
        result.push(lines[cursor++].slice(blockIndent || parentIndent + 2));
      }
      if (cursor === start) throw Error('empty block');
      return result.join('\n').replace(/\n*$/, '\n');
    }
    if (text) return scalar(text);
    skip();
    return cursor < lines.length && indent(lines[cursor]) > parentIndent ? block(indent(lines[cursor])) : null;
  }
  function entry(object, content, level) {
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(content);
    if (!match) throw Error('unsupported YAML mapping: ' + content);
    const key = match[1];
    if (Object.hasOwn(object, key)) throw Error('duplicate YAML key: ' + key);
    object[key] = value(match[2] || '', level);
  }
  function block(level) {
    skip();
    const list = lines[cursor].slice(level).startsWith('- ');
    const result = list ? [] : Object.create(null);
    while (cursor < lines.length) {
      skip();
      if (cursor >= lines.length || indent(lines[cursor]) < level) break;
      if (indent(lines[cursor]) !== level) throw Error('unexpected YAML indentation');
      const content = lines[cursor++].slice(level);
      if (list) {
        if (!content.startsWith('- ')) throw Error('mixed mapping and sequence');
        const item = content.slice(2);
        if (/^[A-Za-z0-9_-]+:/.test(item)) {
          const object = Object.create(null);
          entry(object, item, level + 2);
          skip();
          while (cursor < lines.length && indent(lines[cursor]) > level) {
            if (indent(lines[cursor]) !== level + 2) throw Error('invalid sequence mapping indentation');
            entry(object, lines[cursor++].slice(level + 2), level + 2);
            skip();
          }
          result.push(object);
        } else result.push(value(item, level));
      } else entry(result, content, level);
    }
    return result;
  }
  skip();
  if (cursor >= lines.length) throw Error('empty workflow');
  const result = block(0);
  skip();
  if (cursor !== lines.length) throw Error('unparsed YAML');
  return result;
}

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const baseline = require('../ci/data/bible-ci-sharding-baseline.json');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = value => String(value || '').replace(/\s+/g, ' ').trim();
const runLines = job => (job?.steps || []).flatMap(step => String(step.run || '').split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).map(line => line.trim()));

function testInventory(workflow, scripts) {
  const inventory = [];
  for (const job of Object.values(workflow.jobs || {})) {
    const shards = job.strategy?.matrix?.shard;
    const commands = Array.isArray(shards) && shards.every(s => s && typeof s === 'object' && typeof s.command === 'string')
      ? shards.map(s => s.command)
      : runLines(job);
    for (let command of commands) {
      if (command.startsWith('npm run test:coverage:shard -- --shard=')) {
        inventory.push('JEST_INTEGRAL');
        continue;
      }
      if (command.startsWith('npm run test:coverage:merge -- --input=')) continue;
      if (command === 'npm run test:performance:${{ matrix.target }}') command = 'npm run test:performance:core && npm run test:performance:gtc-indexeddb';
      for (const leaf of expand(command, scripts)) {
        if (leaf.startsWith('node scripts/validation/verify-bible-coordination-selftest.js --shard=')) {
          inventory.push('node scripts/validation/verify-bible-coordination-selftest.js');
          continue;
        }
        // The new sharding self-test validates the execution mechanism itself;
        // historical inventory already represents the coverage work as one
        // logical Jest entry and should not count this infrastructure check.
        if (leaf === 'node scripts/validation/verify-coverage-sharding-selftest.js') continue;
        if (/^node (?!\-\-check ).*selftest\.js$/.test(leaf)) inventory.push(leaf);
        else if (leaf === 'node scripts/ci/run-jest-ci.js --coverage') inventory.push('JEST_INTEGRAL');
        else if (leaf === 'node scripts/validation/verify-production-test-mutation.js') inventory.push(leaf);
        else if (leaf.startsWith('jest ') && leaf.includes('performance.test.js')) inventory.push('JEST:tests/integration/performance.test.js');
        // The historical performance expression selects both targets.
        if (leaf.startsWith('jest ') && leaf.includes('gtc-indexeddb-deep.test.js')) inventory.push('JEST:tests/integration/ipc/gtc-indexeddb-deep.test.js');
      }
    }
  }
  return inventory.sort();
}

function expand(command, scripts, trail = []) {
  return String(command).split(/\s*&&\s*/).flatMap(part => {
    const match = /^npm run ([\w:-]+)$/.exec(part);
    if (!match) return [part.trim()];
    if (trail.includes(match[1]) || !scripts[match[1]]) throw Error('unknown/cyclic alias: ' + match[1]);
    return expand(scripts[match[1]], scripts, [...trail, match[1]]);
  });
}

const postControls = [
  ['npm run bible:lifecycle:verify', false, false],
  ['npm run bible:lifecycle:metrics', true, false],
  ['npm run bible:lifecycle:metrics:check', true, false],
  ['node scripts/validation/verify-human-protected-diff.js --base "${{ github.event.before }}"', true, true],
  ['node scripts/validation/verify-lifecycle-artifacts-append-only.js --base "${{ github.event.before }}"', true, true],
  ['node scripts/validation/verify-bible-state-history-append-only.js --base "${{ github.event.before }}"', true, true],
  ['node scripts/validation/verify-unverified-findings-append-only.js --base "${{ github.event.before }}"', true, true],
  ['npm run bible:audit:append-only', true, false],
  ['node scripts/bible/commands/audit-protocol.js status > audit-protocol-status.txt', true, false],
  ['node scripts/bible/commands/audit-lease-gc.js', true, false],
  ['node scripts/bible/commands/audit-summary.js', true, false],
];

function validateSharding(sources) {
  const errors = [];
  let protocol, structure, pkg;
  try { protocol = parseWorkflow(sources.protocol); } catch (e) { errors.push('protocol: YAML invalid: ' + e.message); }
  try { structure = parseWorkflow(sources.structure); } catch (e) { errors.push('structure: YAML invalid: ' + e.message); }
  try { pkg = JSON.parse(sources.package); } catch (e) { errors.push('package: JSON invalid: ' + e.message); }
  if (!protocol || !structure || !pkg) return errors;
  const scripts = pkg.scripts || {};
  let coveragePlan = null;
  try { coveragePlan = JSON.parse(sources.coverageShardPlan || 'null'); }
  catch (e) { errors.push('coverage: coverage-shard-plan.json inválido: ' + e.message); }
  const coverageShardCount = Number(coveragePlan?.shardCount || 0);
  if (!Number.isInteger(coverageShardCount) || coverageShardCount < 12) errors.push('coverage: plano precisa conter pelo menos doze shards.');
  if (!Number.isFinite(coveragePlan?.maxEstimatedImbalanceRatio) || coveragePlan.maxEstimatedImbalanceRatio > 1.3) {
    errors.push('coverage: spread planejado entre shards deve ser no máximo 30%.');
  }
  if (!Number.isFinite(coveragePlan?.maxEstimatedShardMs) || coveragePlan.maxEstimatedShardMs > 120000) {
    errors.push('coverage: teto absoluto planejado por shard não pode exceder 120000ms.');
  }
  for (const [key, markers] of Object.entries({
    coverageShardPlanner: ['function buildShardPlan', 'imbalanceRatio', 'maxEstimatedShardMs', 'durationMs', 'fullName'],
    coverageShardRunner: ['HARD_MAX_SHARD_RUNTIME_MS = 120000', 'assertionResults', 'testNamePattern', 'shard-result.json', 'usefulWorkMs'],
    coverageShardMerger: ['githubRunId', 'githubRunAttempt', 'githubSha', 'gitHead', 'planSha256', 'diretório de shard ausente', 'diretório de shard inesperado'],
  })) {
    const source = String(sources[key] || '');
    for (const marker of markers) if (!source.includes(marker)) errors.push('coverage: controle de shard ausente em ' + key + ': ' + marker);
  }
  for (const [name, command] of Object.entries(baseline.preservedScripts || {})) {
    // Keep the historical snapshot immutable. The current validate command
    // extends its exact sequence with the two new infrastructure proofs.
    const expectedCommand = name === 'validate'
      ? command.replace(' && node scripts/validation/playwright-gate-reporter-selftest.js',
        ' && npm run test:shard-job-metrics:infra && npm run test:ci-gate:infra && node scripts/validation/playwright-gate-reporter-selftest.js')
      : command;
    if (scripts[name] !== expectedCommand) errors.push('package: historical public command changed: ' + name);
  }
  const crypto = require('crypto');
  for (const [key, digest] of Object.entries(baseline.protectedSourceHashes || {})) {
    const actual = crypto.createHash('sha256').update(String(sources[key] || '').replace(/\r\n/g,'\n')).digest('hex');
    if (actual !== digest) errors.push('coverage: protected source changed: ' + key);
  }
  for (const [key, workflow] of [['protocol',protocol],['structure',structure]]) {
    try {
      const before = [...new Set(baseline.workflowInventories?.[key] || [])].sort();
      const after = [...new Set(testInventory(workflow, scripts))].sort();
      if (!same(before, after)) errors.push(key + ': historical test inventory lost/changed');
    } catch (e) { errors.push(key + ': inventory: ' + e.message); }
  }
  for (const [name, command] of Object.entries(baseline.aliases)) {
    if (scripts[name] !== command) errors.push('package: granular alias changed: ' + name);
    if (scripts['pre' + name] || scripts['post' + name]) errors.push('package: implicit alias hook: ' + name);
  }
  for (const [name, commands] of Object.entries(baseline.aggregates)) {
    try { if (!same(expand(scripts[name], scripts), commands)) errors.push('package: historical inventory changed: ' + name); }
    catch (e) { errors.push('package: ' + e.message); }
  }
  for (const [name, expected] of Object.entries({
    'test:coverage': 'node scripts/ci/run-jest-ci.js --coverage',
    'test:coverage:verify': 'node scripts/validation/verify-coverage.js',
    'test:production:mutation': 'node scripts/validation/verify-production-test-mutation.js',
    'test:performance:isolated': 'npm run test:performance:core && npm run test:performance:gtc-indexeddb',
    'ci:capture-job-timings': 'node scripts/ci/fetch-github-job-timings.js',
    'ci:verify-shard-job-metrics': 'node scripts/ci/verify-shard-job-metrics.js',
    'test:shard-job-metrics:infra': 'node scripts/validation/verify-shard-job-metrics-selftest.js',
    'test:ci-gate:infra': 'node scripts/validation/verify-required-job-results-selftest.js',
  })) if (scripts[name] !== expected) errors.push('package: protected command changed: ' + name);

  function crossOS(label, job) {
    if (!same(job?.strategy?.matrix?.os, ['ubuntu-latest','windows-latest'])) errors.push(label + ': Linux/Windows matrix changed');
    if (job?.strategy?.['fail-fast'] !== false) errors.push(label + ': fail-fast must be false');
    if (job?.['runs-on'] !== '${{ matrix.os }}') errors.push(label + ': runner must use matrix.os');
    if (job?.strategy?.matrix?.include || job?.strategy?.matrix?.exclude) errors.push(label + ': cannot exclude required OS evidence');
    const expectedKeys = label === 'protocol' || label === 'structure' || label === 'structure-coverage-shard' ? ['os','shard'] : ['os'];
    if (!same(Object.keys(job?.strategy?.matrix || {}).sort(), expectedKeys)) errors.push(label + ': unexpected matrix axes');
  }
  function mandatory(label, job) {
    if (!job || job.if !== undefined || job['continue-on-error'] !== undefined || job.needs !== undefined) errors.push(label + ': mandatory job disabled or conditional');
    for (const step of job?.steps || []) {
      if (step.if !== undefined || step['continue-on-error'] !== undefined) errors.push(label + ': mandatory step disabled or conditional');
    }
  }
  function checkout(label, job) {
    const steps = job?.steps || [];
    const checks = steps.filter(s => s.uses === 'actions/checkout@v4');
    const nodes = steps.filter(s => s.uses === 'actions/setup-node@v4');
    if (checks.length !== 1 || checks[0]?.with?.ref !== '${{ github.event.pull_request.head.sha || github.sha }}' || checks[0]?.if !== undefined || checks[0]?.['continue-on-error'] !== undefined) errors.push(label + ': checkout must test exact current SHA');
    const actions = steps.filter(s => s.uses).map(s => s.uses);
    const expectedActions = label.endsWith('workflow-lint') ? ['actions/checkout@v4']
      : label.endsWith('coverage-shard') ? ['actions/checkout@v4','actions/setup-node@v4','actions/upload-artifact@v4']
      : label.endsWith('coverage') ? ['actions/checkout@v4','actions/setup-node@v4','actions/download-artifact@v4']
      : ['actions/checkout@v4','actions/setup-node@v4'];
    if (!same(actions, expectedActions)) errors.push(label + ': unexpected setup action can replace tested source');
    if (!label.endsWith('workflow-lint') && (nodes.length !== 1 || nodes[0]?.with?.['node-version'] !== '20.x' || nodes[0]?.if !== undefined)) errors.push(label + ': Node setup changed');
    if (job?.env || job?.container || job?.services || job?.['runs-on'] === undefined) errors.push(label + ': job execution environment changed');
  }
  function matrix(label, job, expected) {
    crossOS(label, job); mandatory(label, job);
    if (job?.['timeout-minutes'] !== 2) errors.push(label + ': cada job shard deve limitar o wall-clock total a dois minutos');
    if (!same(job?.defaults, {run:{shell:'bash'}})) errors.push(label + ': shards require fail-closed bash on both OSs');
    const shards = job?.strategy?.matrix?.shard || [];
    if (!Array.isArray(shards) || shards.length !== Object.keys(expected).length) errors.push(label + ': shard count changed');
    if (job?.strategy?.matrix?.include || job?.strategy?.matrix?.exclude) errors.push(label + ': matrix include/exclude can suppress required evidence');
    const ids = new Set();
    for (const shard of Array.isArray(shards) ? shards : []) {
      if (ids.has(shard.id)) errors.push(label + ': duplicate shard: ' + shard.id);
      ids.add(shard.id);
      if (!expected[shard.id] || shard.command !== expected[shard.id]) errors.push(label + ': shard command changed: ' + shard.id);
    }
    for (const id of Object.keys(expected)) if (!ids.has(id)) errors.push(label + ': missing shard: ' + id);
    const lines = runLines(job);
    if (!same(lines, ['${{ matrix.shard.command }}'])) errors.push(label + ': shard dispatcher changed');
  }
  const protocolExpected = { ...baseline.protocol };
  delete protocolExpected['correction-coordination'];
  protocolExpected['correction-plan'] = 'npm run test:bible-protocol:correction-plan';
  for (const [id, index] of [
    ['coordination-readiness',1],
    ['coordination-state-ownership',2],
    ['coordination-leases',3],
    ['coordination-source-coverage',4],
    ['coordination-derived-readiness',5],
  ]) protocolExpected[id] = 'node scripts/validation/verify-bible-coordination-selftest.js --shard=' + index + '/5';
  matrix('protocol', protocol.jobs?.['protocol-infra'], protocolExpected);
  // Execute only the script's no-fixture inventory listing so the checked
  // protocol/structure commands prove a disjoint, gap-free partition of all
  // coordination cases, rather than merely containing five shard names.
  try {
    const coordinationScript = path.join(__dirname, 'verify-bible-coordination-selftest.js');
    const list = args => execFileSync(process.execPath, [coordinationScript, ...args, '--list-cases'], { encoding: 'utf8' })
      .split(/\r?\n/).filter(line => /^\d{3}:[A-Z]+:/.test(line));
    const all = list([]);
    const slices = Array.from({ length: 5 }, (_, index) => list(['--shard=' + (index + 1) + '/5']));
    const joined = slices.flat();
    if (all.length !== 56 || joined.length !== 56 || new Set(joined).size !== 56 || !same([...joined].sort(), [...all].sort())) {
      errors.push('coordination: os cinco shards devem cobrir os 56 casos exatamente uma vez, sem lacunas/duplicatas');
    }
  } catch (e) { errors.push('coordination: não foi possível provar a partição integral dos casos: ' + e.message); }
  const structureExpected = { ...baseline.structure };
  delete structureExpected['12-coordination'];
  for (const [id, index] of [
    ['12-coordination-readiness',1],
    ['12-coordination-state-ownership',2],
    ['12-coordination-leases',3],
    ['12-coordination-source-coverage',4],
    ['12-coordination-derived-readiness',5],
  ]) structureExpected[id] = 'node scripts/validation/verify-bible-coordination-selftest.js --shard=' + index + '/5';
  matrix('structure', structure.jobs?.governance, structureExpected);
  try {
    const metrics = JSON.parse(sources.workflowShardMetrics);
    for (const [label, workflow, matrixId, prefix] of [
      ['protocol',protocol,'protocol-infra','Distributed Bible Protocol Infra'],
      ['structure',structure,'governance','Structure Governance'],
    ]) {
      const profile = metrics?.profiles?.[label];
      const ids = workflow.jobs?.[matrixId]?.strategy?.matrix?.shard?.map(shard => shard.id);
      if (metrics.schemaVersion !== 1 || !same(profile?.ids, ids) || profile?.shardsPerOs !== ids?.length ||
          profile?.maxJobMs !== 120000 || profile?.maxSpreadRatio !== 1.3 ||
          profile?.jobPrefix !== prefix || profile?.workStep !== 'Run mandatory shard') errors.push(label + ': workflow metric profile changed');
    }
  } catch (e) { errors.push('workflow metric profiles invalid: ' + e.message); }
  const post = protocol.jobs?.['protocol-post-gates'];
  crossOS('protocol-post', post);
  if (!same(post?.needs, ['protocol-infra']) || canonical(post?.if) !== '${{ always() && !cancelled() }}') errors.push('protocol: post-gates must continue after failed shards');
  for (const [command, always, push] of postControls) {
    const matches = (post?.steps || []).filter(s => runLines({ steps: [s] }).includes(command));
    if (matches.length !== 1) { errors.push('protocol: post-gate command absent/duplicate: ' + command); continue; }
    const step = matches[0];
    const condition = push ? "${{ always() && github.event_name == 'push' }}" : '${{ always() }}';
    if (step['continue-on-error'] !== undefined || (always && canonical(step.if) !== condition) || (!always && step.if !== undefined)) errors.push('protocol: post-gate continuation changed: ' + command);
    if (step.run !== command || step.shell || step.env || post?.defaults) errors.push('protocol: post-gate command/shell masked: ' + command);
  }
  function gate(label, workflow, id, needs) {
    const job = workflow.jobs?.[id];
    if (!same(job?.needs, needs) || canonical(job?.if) !== '${{ always() && !cancelled() }}') errors.push(label + ': aggregate dependencies/condition changed');
    const capture = 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json';
    const metrics = 'npm run ci:verify-shard-job-metrics -- --kind=workflow --profile=' + label + ' --timings=.ci-results/github-job-timings.json';
    const expected = 'node scripts/ci/verify-required-job-results.js';
    const headEnv = { GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}' };
    if (!same(runLines(job), [capture, metrics, expected]) || job?.['continue-on-error'] !== undefined ||
        job?.steps?.length !== 5 || !same(job?.permissions, {actions:'read',contents:'read'})) errors.push(label + ': aggregate masks failed/cancelled/skipped dependency');
    if (job?.steps?.[0]?.uses !== 'actions/checkout@v4' || job?.steps?.[1]?.uses !== 'actions/setup-node@v4' ||
        !same(job?.steps?.[0]?.with, {ref:'${{ github.event.pull_request.head.sha || github.sha }}'}) ||
        !same(job?.steps?.[1]?.with, {'node-version':'20.x'}) || job?.steps?.[0]?.env !== undefined ||
        job?.steps?.[1]?.env !== undefined || job?.steps?.[2]?.run !== capture ||
        job?.steps?.[3]?.run !== metrics || job?.steps?.[4]?.run !== expected) errors.push(label + ': aggregate setup/order changed');
    if (job?.defaults || job?.env || job?.container || job?.services || job?.['runs-on'] !== 'ubuntu-latest') errors.push(label + ': aggregate shell/runner changed');
    const runSteps = (job?.steps || []).filter(step => step.run !== undefined);
    if (!same(runSteps.map(step => step.env), [{GITHUB_TOKEN:'${{ github.token }}',...headEnv}, headEnv, {NEEDS_JSON:'${{ toJSON(needs) }}'}])) errors.push(label + ': aggregate environment/steps changed');
    for (const step of job?.steps || []) {
      if (step.if !== undefined || step['continue-on-error'] !== undefined || step.shell !== undefined ||
          step['working-directory'] !== undefined || step['timeout-minutes'] !== undefined) errors.push(label + ': aggregate execution override');
    }
    checkout(label + '-' + id, job);
  }
  gate('protocol', protocol, 'protocol-infra-gate', ['protocol-infra','protocol-post-gates']);
  gate('structure', structure, 'structure-review-gate', ['governance','coverage-shard','coverage','mutation','performance','workflow-lint']);
  const coverageShards = structure.jobs?.['coverage-shard'];
  crossOS('structure-coverage-shard', coverageShards); mandatory('structure-coverage-shard', coverageShards);
  const expectedCoverageShardIds = Array.from({length: coverageShardCount}, (_, index) => index + 1);
  if (!same(coverageShards?.strategy?.matrix?.shard, expectedCoverageShardIds) ||
      !same(coverageShards?.defaults, {run:{shell:'bash'}}) ||
      coverageShards?.['timeout-minutes'] !== 2 ||
      !same(runLines(coverageShards), ['npm ci --no-audit --no-fund','npm run test:coverage:shard -- --shard=${{ matrix.shard }}'])) {
    errors.push('structure: planned blocking coverage shards and two-minute timeout required on Linux and Windows');
  }
  const coverageShardRun = (coverageShards?.steps || []).find(step => step.run === 'npm run test:coverage:shard -- --shard=${{ matrix.shard }}');
  if (coverageShardRun?.['timeout-minutes'] !== 2) errors.push('structure: cada execução Jest de coverage precisa de timeout de dois minutos');
  const shardUpload = (coverageShards?.steps || []).find(s => s.uses === 'actions/upload-artifact@v4');
  if (!shardUpload || shardUpload.with?.name !== 'structure-coverage-${{ matrix.os }}-${{ matrix.shard }}-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}' ||
      shardUpload.with?.path !== '.ci-results/coverage-shards/' || shardUpload.with?.['if-no-files-found'] !== 'error' ||
      shardUpload.if !== undefined || shardUpload['continue-on-error'] !== undefined) {
    errors.push('structure: coverage shard artifacts must preserve unique shard-N directories per OS/attempt');
  }
  const coverage = structure.jobs?.coverage;
  crossOS('structure-coverage', coverage);
  if (!same(coverage?.needs, ['coverage-shard']) || coverage?.if !== undefined || coverage?.['continue-on-error'] !== undefined ||
      !same(coverage?.defaults, {run:{shell:'bash'}}) ||
      !same(coverage?.permissions, {actions:'read',contents:'read'}) ||
      !same(runLines(coverage), ['npm ci --no-audit --no-fund','npm run test:coverage:sharding:infra',
        'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json',
        'npm run test:coverage:merge -- --input=coverage-shards',
        'npm run ci:verify-shard-job-metrics -- --kind=coverage --job-prefix="Structure coverage shard" --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards',
        'npm run test:coverage:verify'])) {
    errors.push('structure: per-OS coverage merge and full verifier must be blocking after all shards');
  }
  const coverageDownload = (coverage?.steps || []).find(s => s.uses === 'actions/download-artifact@v4');
  if (!coverageDownload || coverageDownload.with?.path !== 'coverage-shards' ||
      coverageDownload.with?.pattern !== 'structure-coverage-${{ matrix.os }}-*-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}' ||
      coverageDownload.with?.['merge-multiple'] !== true || coverageDownload.if !== undefined ||
      coverageDownload['continue-on-error'] !== undefined) {
    errors.push('structure: download must join only unique same-OS shard-N artifact folders');
  }
  if (scripts['test:coverage:sharding:infra'] !== 'node scripts/validation/verify-coverage-sharding-selftest.js') {
    errors.push('package: coverage sharding/merge self-test alias changed or missing');
  }
  for (const step of coverage?.steps || []) {
    if (step.if !== undefined || step['continue-on-error'] !== undefined) errors.push('structure: coverage merge/verifier cannot be conditional or continue on error');
    const expectedEnv = step.run === 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json'
      ? {GITHUB_TOKEN:'${{ github.token }}', GITHUB_HEAD_SHA:'${{ github.event.pull_request.head.sha || github.sha }}'}
      : String(step.run || '').startsWith('npm run ci:verify-shard-job-metrics')
        ? {GITHUB_HEAD_SHA:'${{ github.event.pull_request.head.sha || github.sha }}'} : undefined;
    if (!same(step.env, expectedEnv) || step.shell !== undefined) errors.push('structure: coverage step environment/shell changed');
  }
  for (const [id, commands] of Object.entries({mutation:['npm ci --no-audit --no-fund','npm run test:production:mutation']})) {
    const job = structure.jobs?.[id];
    crossOS('structure-' + id, job); mandatory('structure-' + id, job);
    if (!same(runLines(job), commands) || job?.defaults?.run?.shell !== 'bash') errors.push('structure: integral blocking ' + id + ' changed');
  }
  const perf = structure.jobs?.performance;
  mandatory('structure-performance', perf);
  if (!same(perf?.strategy?.matrix?.target, ['core','gtc-indexeddb']) || perf?.strategy?.['fail-fast'] !== false || perf?.['runs-on'] !== 'ubuntu-latest' || !same(runLines(perf), ['npm ci --no-audit --no-fund','npm run test:performance:${{ matrix.target }}'])) errors.push('structure: both isolated performance targets required');
  if (!same(Object.keys(perf?.strategy?.matrix || {}), ['target']) || !same(perf?.defaults, {run:{shell:'bash'}})) errors.push('structure: performance cannot exclude targets/change shell');
  const lint = structure.jobs?.['workflow-lint'];
  mandatory('structure-lint', lint);
  const lintText = runLines(lint).join('\n');
  const expectedLintCommands = [...baseline.lintCommands,
    '"$RUNNER_TEMP/pr66-actionlint/actionlint" -shellcheck= -pyflakes=',
    '.github/workflows/ci.yml'];
  if (!same(runLines(lint), expectedLintCommands)) errors.push('structure: actionlint executable contract changed');
  for (const file of ['bible-protocol-infra','pr66-structure-review','bible-reconcile-checkpoint','bible-human-approval','ci']) {
    if (!runLines(lint).some(line => line === '.github/workflows/' + file + '.yml' || line === '.github/workflows/' + file + '.yml \\')) errors.push('structure: actionlint target missing: ' + file);
  }
  for (const pin of ['v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz','8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8','sha256sum --check --strict']) if (!lintText.includes(pin)) errors.push('structure: actionlint pin/checksum changed: ' + pin);
  for (const [label, workflow] of [['protocol',protocol],['structure',structure]]) {
    const expectedTriggers = JSON.parse(JSON.stringify(baseline.workflowTriggers?.[label]));
    if (label === 'structure' && !expectedTriggers.pull_request.paths.includes('.github/workflows/ci.yml')) {
      expectedTriggers.pull_request.paths.splice(2, 0, '.github/workflows/ci.yml');
    }
    if (!same(workflow.on, expectedTriggers)) errors.push(label + ': required workflow triggers/path filters changed');
    if (workflow.env || workflow.defaults) errors.push(label + ': inherited environment/shell prohibited');
    if (workflow.concurrency?.['cancel-in-progress'] !== false) errors.push(label + ': concurrency cancels required evidence');
    for (const [id, job] of Object.entries(workflow.jobs || {})) {
      if (!id.endsWith('-gate')) checkout(label + '-' + id, job);
      if (job['continue-on-error'] !== undefined) errors.push(label + ': forbidden continue-on-error: ' + id);
      if (job.env || job.container || job.services || (job.defaults && !same(job.defaults,{run:{shell:'bash'}}))) errors.push(label + ': job environment/working directory changed: ' + id);
      for (const step of job.steps || []) {
        if (step['continue-on-error'] !== undefined || step.if === false || /\|\|\s*true|;\s*true(?:\s|$)/.test(String(step.run || ''))) errors.push(label + ': forbidden failure bypass: ' + id);
        const coverageMetricStep = label === 'structure' && id === 'coverage' &&
          (step.run === 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json' ||
           String(step.run || '').startsWith('npm run ci:verify-shard-job-metrics'));
        if (!id.endsWith('-gate') && ((!coverageMetricStep && step.env) || (step.shell && step.shell !== 'bash'))) errors.push(label + ': test environment/shell changed: ' + id);
        const coverageRunTimeout = id === 'coverage-shard' && step.run === 'npm run test:coverage:shard -- --shard=${{ matrix.shard }}' && step['timeout-minutes'] === 2;
        if (step['working-directory'] || step.timeout || (step['timeout-minutes'] && !coverageRunTimeout)) errors.push(label + ': mandatory step execution changed: ' + id);
      }
    }
  }
  const paths = structure.on?.pull_request?.paths || [];
  for (const file of ['.github/workflows/bible-protocol-infra.yml','.github/workflows/ci.yml','package.json','scripts/validation/**','scripts/ci/**']) if (!paths.includes(file)) errors.push('structure: critical path filter missing: ' + file);
  return errors;
}

module.exports = { parseWorkflow, expand, testInventory, validateSharding, baseline, postControls, runLines };

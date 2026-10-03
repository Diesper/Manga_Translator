'use strict';

const assert = require('assert');
const path = require('path');
const governance = require('./verify-bible-protocol-governance');

const root = path.resolve(__dirname, '../..');
// stepBlockForFragment returns LF-separated blocks. Normalize fixtures so the
// replacement attacks also modify CRLF checkouts on Windows.
const sources = Object.fromEntries(Object.entries(governance.loadSources(root))
  .map(([key, source]) => [key, source.replace(/\r\n/g, '\n')]));
const coveragePlan = JSON.parse(sources.coverageShardPlan);
const coverageMatrixText = 'shard: [' + Array.from({ length: coveragePlan.shardCount }, (_, index) => index + 1).join(', ') + ']';

assert.deepStrictEqual(governance.validateSources(sources), []);
console.log('PASS canonical workflow governance is intact');

for (const [key, fragments] of Object.entries(governance.REQUIRED)) {
  for (const fragment of fragments) {
    const tampered = {
      ...sources,
      [key]: sources[key].split(fragment).join('REMOVED-CONTROL'),
    };
    assert.ok(
      governance.validateSources(tampered).some((problem) => (
        problem.startsWith(key + ':') && problem.includes(fragment)
      )),
      'expected governance failure for ' + key + ' fragment=' + fragment
    );
  }
  console.log('PASS removing any required control is rejected: ' + key + ' (' + fragments.length + ' fragments)');
}

for (const control of governance.PROTOCOL_POST_LIFECYCLE_CONTROLS) {
  const block = governance.stepBlockForFragment(sources.protocol, control.command);
  assert.ok(block, 'expected canonical block for ' + control.command);
  const weakenedBlock = block.replace(
    /^\s*if:.*$/m,
    '        if: ${{ success() }}'
  );
  const tampered = {
    ...sources,
    protocol: sources.protocol.replace(block, weakenedBlock),
  };
  assert.notStrictEqual(tampered.protocol, sources.protocol,
    'continuation attack must change the fixture for ' + control.command);
  assert.ok(
    governance.validateSources(tampered).some((problem) => (
      problem.includes('não continua após bloqueio anterior') && problem.includes(control.command)
    )),
    'expected post-lifecycle continuation governance failure for ' + control.command
  );
}
console.log(
  'PASS every post-lifecycle diagnostic remains runnable after an earlier lifecycle block ('+
  governance.PROTOCOL_POST_LIFECYCLE_CONTROLS.length+' controls)'
);

const pathFiltered = {
  ...sources,
  handoff: sources.handoff.replace(
    'branches:\n      - docs/project-bible',
    'branches:\n      - docs/project-bible\n    paths:\n      - docs/**'
  ),
};
assert.ok(
  governance.validateSources(pathFiltered).some((problem) => problem.includes('não pode ser limitado por paths'))
);
console.log('PASS path-filtering the all-push Handoff Guard is rejected');

const disabledProtocol={
  ...sources,
  protocol:sources.protocol.replace(
    '      - name: Validate anti-loop lifecycle\n        run: npm run bible:lifecycle:verify',
    '      - name: Validate anti-loop lifecycle\n        if: false\n        run: npm run bible:lifecycle:verify'
  ),
};
assert.ok(
  governance.validateSources(disabledProtocol).some((problem)=>problem.includes('if=false'))
);
console.log('PASS required protocol step cannot be disabled with if:false');

const broadenedAutoToken={
  ...sources,
  transition:sources.transition.replace(
    'if [ "$OPERATION" = "START_CORRECTION" ] && [ -z "$TOKEN_ID" ]; then',
    'if [ -z "$TOKEN_ID" ]; then'
  ),
};
assert.ok(
  governance.validateSources(broadenedAutoToken).some((problem)=>(
    problem.startsWith('transition:') && problem.includes('START_CORRECTION')
  ))
);
console.log('PASS automatic correction-token issuance cannot be broadened beyond START_CORRECTION');

const tolerantHandoff={
  ...sources,
  handoff:sources.handoff.replace(
    '      - name: Validate current protected handoffs\n        run: node scripts/bible/commands/handoff-guard.js',
    '      - name: Validate current protected handoffs\n        continue-on-error: true\n        run: node scripts/bible/commands/handoff-guard.js'
  ),
};
assert.ok(
  governance.validateSources(tolerantHandoff).some((problem)=>problem.includes('continue-on-error'))
);
console.log('PASS critical handoff workflow cannot tolerate failures');

const shellBypass={
  ...sources,
  protocol:sources.protocol.replace(
    'run: npm run bible:lifecycle:verify',
    'run: npm run bible:lifecycle:verify || true'
  ),
};
assert.ok(
  governance.validateSources(shellBypass).some((problem)=>problem.includes('shell bypass') || problem.includes('|| true'))
);
console.log('PASS required command cannot be masked by shell success');

const tolerantCi={
  ...sources,
  ci:sources.ci.replace(
    '      - name: Validar governança do protocolo anti-loop da Bíblia\n        run: node scripts/validation/verify-bible-protocol-governance.js',
    '      - name: Validar governança do protocolo anti-loop da Bíblia\n        continue-on-error: true\n        run: node scripts/validation/verify-bible-protocol-governance.js'
  ),
};
assert.ok(
  governance.validateSources(tolerantCi).some((problem)=>problem.includes('controle obrigatório tolera falha'))
);
console.log('PASS CI anti-loop governance step cannot be continue-on-error');

console.log('Bible protocol governance self-test: SUCCESS');

require('./verify-reconcile-refresh-selftest');

const sharding = require('./bible-ci-sharding-contract');
function rejectShardMutation(name, key, transform) {
  const modified = transform(sources[key]);
  assert.notStrictEqual(modified, sources[key], 'mutation must change fixture: ' + name);
  const problems = governance.validateSources({ ...sources, [key]: modified });
  assert.ok(problems.length, 'governance accepted shard weakening: ' + name);
  console.log('PASS shard mutation rejected: ' + name);
}
function replaceJob(source, id, transform) {
  const start = source.indexOf('\n  ' + id + ':\n');
  assert.ok(start >= 0, 'job fixture missing: ' + id);
  const next = source.slice(start + 1).search(/\n  [A-Za-z0-9_-]+:\n/);
  const end = next < 0 ? source.length : start + 1 + next;
  return source.slice(0,start) + transform(source.slice(start,end)) + source.slice(end);
}
rejectShardMutation('remove entire live post-gates job','protocol',s => replaceJob(s,'protocol-post-gates',()=>''));
for (const [key, id] of [['protocol','protocol-infra-gate'],['structure','structure-review-gate']]) {
  for (const [name, before, after] of [
    ['metrics omitted', 'run: npm run ci:verify-shard-job-metrics', 'run: echo npm run ci:verify-shard-job-metrics'],
    ['token missing', '          GITHUB_TOKEN: ${{ github.token }}\n', ''],
    ['HEAD missing', '          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}\n', ''],
    ['require omitted', 'run: node scripts/ci/verify-required-job-results.js', 'run: true'],
    ['require skipped', '      - name: Require every dependency to succeed\n', '      - name: Require every dependency to succeed\n        if: false\n'],
    ['shell inherited', '    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    defaults:\n      run:\n        shell: bash -c "exit 0" {0}\n'],
    ['job tolerates failure', '    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    continue-on-error: true\n'],
  ]) rejectShardMutation(key + ' aggregate ' + name, key, source => replaceJob(source, id, block => block.replace(before, after)));
}
for (const [name, before, after] of [
  ['capture missing', 'run: npm run ci:capture-job-timings', 'run: echo npm run ci:capture-job-timings'],
  ['HEAD missing', '          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}\n', ''],
  ['metrics skipped', '      - name: Verify actual shard wall-clock, balance and efficiency\n', '      - name: Verify actual shard wall-clock, balance and efficiency\n        if: false\n'],
]) rejectShardMutation('structure coverage ' + name, 'structure', source => replaceJob(source, 'coverage', block => block.replace(before, after)));
rejectShardMutation('validate preserves historical sequence', 'package', source => {
  const pkg = JSON.parse(source); pkg.scripts.validate = pkg.scripts.validate.replace('npm run lint && ', '');
  return JSON.stringify(pkg);
});
rejectShardMutation('validate requires new metric proofs', 'package', source => {
  const pkg = JSON.parse(source); pkg.scripts.validate = sharding.baseline.preservedScripts.validate;
  return JSON.stringify(pkg);
});
rejectShardMutation('workflow metric profile cannot omit a shard', 'workflowShardMetrics', source => {
  const metrics = JSON.parse(source); metrics.profiles.protocol.ids.pop(); return JSON.stringify(metrics);
});
rejectShardMutation('workflow metric profile cannot weaken timing ceiling', 'workflowShardMetrics', source => {
  const metrics = JSON.parse(source); metrics.profiles.structure.maxJobMs = 180000; return JSON.stringify(metrics);
});
for (const [workflowKey, jobId] of [['protocol','protocol-infra'],['structure','governance']]) {
  rejectShardMutation(workflowKey + ' shard timeout removed', workflowKey,
    s => replaceJob(s, jobId, block => block.replace('    timeout-minutes: 2\n', '')));
  rejectShardMutation(workflowKey + ' shard timeout raised', workflowKey,
    s => replaceJob(s, jobId, block => block.replace('    timeout-minutes: 2\n', '    timeout-minutes: 3\n')));
}
for (let index = 1; index <= 5; index += 1) {
  const id = [
    'coordination-readiness',
    'coordination-state-ownership',
    'coordination-leases',
    'coordination-source-coverage',
    'coordination-derived-readiness',
  ][index - 1];
  const row = `          - id: ${id}\n            command: "node scripts/validation/verify-bible-coordination-selftest.js --shard=${index}/5"\n`;
  rejectShardMutation('protocol remove ' + id,'protocol',s => s.replace(row, ''));
  rejectShardMutation('protocol duplicate ' + id,'protocol',s => s.replace(row, row + row));
}
rejectShardMutation('protocol correction-plan removed','protocol',s => s.replace(
  '          - id: correction-plan\n            command: "npm run test:bible-protocol:correction-plan"\n', ''));
rejectShardMutation('protocol correction-plan duplicated','protocol',s => s.replace(
  '          - id: correction-plan\n            command: "npm run test:bible-protocol:correction-plan"\n',
  '          - id: correction-plan\n            command: "npm run test:bible-protocol:correction-plan"\n          - id: correction-plan-copy\n            command: "npm run test:bible-protocol:correction-plan"\n'));
for (const os of ['ubuntu-latest','windows-latest']) {
  rejectShardMutation('coverage removes '+os,'structure',s => replaceJob(s,'coverage',block => block.replace('os: [ubuntu-latest, windows-latest]', 'os: ['+(os==='ubuntu-latest'?'windows-latest':'ubuntu-latest')+']')));
}
rejectShardMutation('coverage shard excludes Windows','structure',s => replaceJob(s,'coverage-shard',block => block.replace('os: [ubuntu-latest, windows-latest]', 'os: [ubuntu-latest]')));
rejectShardMutation('coverage shard matrix exclusion','structure',s => replaceJob(s,'coverage-shard',block => block.replace(coverageMatrixText, coverageMatrixText + '\n        exclude:\n          - os: windows-latest')));
rejectShardMutation('coverage shard conditional execution','structure',s => replaceJob(s,'coverage-shard',block => block.replace('      - name: Run mandatory coverage shard\n        timeout-minutes: 2\n        run:', '      - name: Run mandatory coverage shard\n        timeout-minutes: 2\n        if: false\n        run:')));
rejectShardMutation('coverage missing final planned shard','structure',s => replaceJob(s,'coverage-shard',block => block.replace(coverageMatrixText, 'shard: [' + Array.from({ length: coveragePlan.shardCount - 1 }, (_, index) => index + 1).join(', ') + ']')));
rejectShardMutation('coverage plan count diverges from matrix','coverageShardPlan',s => {
  const plan = JSON.parse(s); plan.shardCount += 1; return JSON.stringify(plan);
});
rejectShardMutation('coverage Jest timeout removed','structure',s => replaceJob(s,'coverage-shard',block => block.replace(
  '        timeout-minutes: 2\n        run: npm run test:coverage:shard',
  '        run: npm run test:coverage:shard')));
rejectShardMutation('coverage merge dependency removed','structure',s => replaceJob(s,'coverage',block => block.replace('needs: [coverage-shard]', 'needs: []')));
rejectShardMutation('coverage merge command echo','structure',s => replaceJob(s,'coverage',block => block.replace('npm run test:coverage:merge -- --input=coverage-shards', 'echo npm run test:coverage:merge -- --input=coverage-shards')));
rejectShardMutation('coverage verifier removed','structure',s => replaceJob(s,'coverage',block => block.replace('        run: npm run test:coverage:verify', '        # run: npm run test:coverage:verify')));
for (let index = 1; index <= 5; index += 1) {
  const id = [
    '12-coordination-readiness',
    '12-coordination-state-ownership',
    '12-coordination-leases',
    '12-coordination-source-coverage',
    '12-coordination-derived-readiness',
  ][index - 1];
  const row = `          - id: ${id}\n            command: "node scripts/validation/verify-bible-coordination-selftest.js --shard=${index}/5"\n`;
  rejectShardMutation('remove ' + id,'structure',s => s.replace(row, ''));
  rejectShardMutation('duplicate ' + id,'structure',s => s.replace(row, row + row));
}
for (let index = 1; index <= 5; index += 1) {
  const id = [
    'coordination-readiness',
    'coordination-state-ownership',
    'coordination-leases',
    'coordination-source-coverage',
    'coordination-derived-readiness',
  ][index - 1];
  const row = `          - id: ${id}\n            command: "node scripts/validation/verify-bible-coordination-selftest.js --shard=${index}/5"\n`;
  rejectShardMutation('protocol remove ' + id,'protocol',s => s.replace(row, ''));
  rejectShardMutation('protocol duplicate ' + id,'protocol',s => s.replace(row, row + row));
}
rejectShardMutation('protocol correction-plan removed','protocol',s => s.replace(
  '          - id: correction-plan\n            command: "npm run test:bible-protocol:correction-plan"\n', ''));
rejectShardMutation('protocol correction-plan duplicated','protocol',s => s.replace(
  '          - id: correction-plan\n            command: "npm run test:bible-protocol:correction-plan"\n',
  '          - id: correction-plan\n            command: "npm run test:bible-protocol:correction-plan"\n          - id: correction-plan-copy\n            command: "npm run test:bible-protocol:correction-plan"\n'));
rejectShardMutation('remove entire blocking mutation job','structure',s => replaceJob(s,'mutation',()=>''));
for (const key of ['protocol','structure']) {
  const rows = [...sources[key].matchAll(/^          - id: [^\n]+\n            command: [^\n]+\n/gm)].map(m => m[0]);
  for (const [position, row] of [['first',rows[0]],['middle',rows[Math.floor(rows.length/2)]],['last',rows.at(-1)]]) {
    rejectShardMutation(key + ' remove ' + position, key, s => s.replace(row, ''));
  }
  rejectShardMutation(key + ' duplicate shard', key, s => s.replace(rows[0], rows[0] + rows[0]));
  rejectShardMutation(key + ' fewer than ten shards', key, s => rows.slice(9).reduce((text, row) => text.replace(row, ''), s));
  for (const [name, before, after] of [
    ['remove Ubuntu','os: [ubuntu-latest, windows-latest]','os: [windows-latest]'],
    ['remove Windows','os: [ubuntu-latest, windows-latest]','os: [ubuntu-latest]'],
    ['fail-fast true','fail-fast: false','fail-fast: true'],
    ['if false','      - name: Run mandatory shard','      - name: Run mandatory shard\n        if: false'],
    ['if expression false','      - name: Run mandatory shard','      - name: Run mandatory shard\n        if: ${{ false }}'],
    ['continue-on-error','      - name: Run mandatory shard','      - name: Run mandatory shard\n        continue-on-error: true'],
    ['shell masking','run: ${{ matrix.shard.command }}','run: ${{ matrix.shard.command }} || true'],
    ['dispatcher echo','run: ${{ matrix.shard.command }}','run: echo ${{ matrix.shard.command }}'],
    ['YAML commented command','        run: ${{ matrix.shard.command }}','        # run: ${{ matrix.shard.command }}'],
    ['shell commented command','        run: ${{ matrix.shard.command }}','        run: |\n          # ${{ matrix.shard.command }}'],
    ['gate uses success','if: ${{ always() && !cancelled() }}','if: ${{ success() }}'],
    ['gate masks results','run: node scripts/ci/verify-required-job-results.js','run: true'],
    ['gate echo','run: node scripts/ci/verify-required-job-results.js','run: echo node scripts/ci/verify-required-job-results.js'],
  ]) rejectShardMutation(key + ' ' + name, key, s => s.replace(before, after));
  rejectShardMutation(key + ' required leaf echoed', key, s => s.replace(rows[0], rows[0].replace('command: "', 'command: "echo ')));
}
for (const [name, before, after] of [
  ['post dependency removed','needs: [protocol-infra]','needs: []'],
  ['aggregate drops post-gates','needs: [protocol-infra, protocol-post-gates]','needs: [protocol-infra]'],
  ['push condition lost',"always() && github.event_name == 'push'",'always()'],
  ['post job disabled','name: Protocol live post-gates','if: false\n    name: Protocol live post-gates'],
]) rejectShardMutation(name,'protocol',s => s.replace(before, after));
for (const [name, before, after] of [
  ['coverage shard dropped from aggregate','needs: [governance, coverage-shard, coverage, mutation, performance, workflow-lint]','needs: [governance, coverage, mutation, performance, workflow-lint]'],
  ['mutation optional','name: Run mandatory mutation','name: Run mandatory mutation\n        if: false'],
  ['coverage artifact path collapsed','path: .ci-results/coverage-shards/','path: .ci-results/coverage-shards/shard-1/'],
  ['performance core missing','target: [core, gtc-indexeddb]','target: [gtc-indexeddb]'],
  ['performance GTC missing','target: [core, gtc-indexeddb]','target: [core]'],
  ['protocol lint removed','            .github/workflows/bible-protocol-infra.yml \\\n',''],
  ['human lint removed','            .github/workflows/bible-human-approval.yml','            # .github/workflows/bible-human-approval.yml'],
  ['stale checkout ref','ref: ${{ github.event.pull_request.head.sha || github.sha }}','ref: main'],
  ['lint executable echo','"$RUNNER_TEMP/pr66-actionlint/actionlint" -shellcheck=', 'echo "$RUNNER_TEMP/pr66-actionlint/actionlint" -shellcheck='],
  ['coverage Windows excluded','        os: [ubuntu-latest, windows-latest]\n    steps:', '        os: [ubuntu-latest, windows-latest]\n        exclude:\n          - os: windows-latest\n    steps:'],
  ['performance core excluded','target: [core, gtc-indexeddb]','target: [core, gtc-indexeddb]\n        exclude:\n          - target: core'],
  ['stale working directory','      - name: Run mandatory shard','      - name: Run mandatory shard\n        working-directory: ../stale-checkout'],
  ['aggregate preload','          NEEDS_JSON: ${{ toJSON(needs) }}','          NEEDS_JSON: ${{ toJSON(needs) }}\n          NODE_OPTIONS: --require ./bypass.js'],
  ['PR branch trigger removed','branches: [main, docs/project-bible, codex/pr66-structure-review-base-20261002]','branches: [nonexistent-branch]'],
  ['negative path hides contract',"      - 'scripts/validation/**'","      - 'scripts/validation/**'\n      - '!scripts/validation/**'"],
  ['custom setup action replaces sources','      - name: Run mandatory shard','      - uses: malicious/bypass@v1\n      - name: Run mandatory shard'],
]) rejectShardMutation(name,'structure',s => s.replace(before,after));
for (const key of ['protocol','structure']) {
  rejectShardMutation('workflow inherited shell ' + key,key,s => s.replace('jobs:\n','defaults:\n  run:\n    shell: bash -c "exit 0" {0}\njobs:\n'));
  rejectShardMutation('workflow inherited env ' + key,key,s => s.replace('jobs:\n','env:\n  NODE_OPTIONS: --require ./bypass.js\njobs:\n'));
  rejectShardMutation('aggregate job preload ' + key,key,s => s.replace('    name: ' + (key === 'protocol' ? 'protocol-infra-gate' : 'structure-review-gate'),'    env:\n      NODE_OPTIONS: --require ./bypass.js\n    name: ' + (key === 'protocol' ? 'protocol-infra-gate' : 'structure-review-gate')));
}
rejectShardMutation('post-gate exit zero masks failure','protocol',s => s.replace('run: npm run bible:lifecycle:verify','run: |\n          npm run bible:lifecycle:verify\n          exit 0'));
for (const key of ['coverageConfig','coverageBaseline','coverageVerifier']) {
  rejectShardMutation('coverage protected source ' + key,key,s => s + '\n// coverage mutation\n');
}
for (const [name, command] of Object.entries(sharding.baseline.aliases)) {
  rejectShardMutation('alias removed ' + name,'package',s => {
    const pkg = JSON.parse(s); delete pkg.scripts[name]; return JSON.stringify(pkg);
  });
  rejectShardMutation('alias echo ' + name,'package',s => {
    const pkg = JSON.parse(s); pkg.scripts[name] = 'echo ' + command; return JSON.stringify(pkg);
  });
}
for (const name of Object.keys(sharding.baseline.aggregates)) {
  rejectShardMutation('aggregate inventory ' + name,'package',s => {
    const pkg = JSON.parse(s); pkg.scripts[name] = pkg.scripts[name].split(' && ').slice(0,-1).join(' && '); return JSON.stringify(pkg);
  });
  rejectShardMutation('duplicate alias and omit sibling '+name,'package',s => {
    const pkg=JSON.parse(s),parts=pkg.scripts[name].split(' && ');
    parts[1]=parts[0];pkg.scripts[name]=parts.join(' && ');return JSON.stringify(pkg);
  });
}
for (const metric of ['statements','branches','functions','lines']) {
  rejectShardMutation('reduce global coverage threshold '+metric,'coverageBaseline',s=>{
    const value=JSON.parse(s);value.coverage.minimum[metric]-=1;return JSON.stringify(value);
  });
  rejectShardMutation('reduce critical coverage threshold '+metric,'coverageBaseline',s=>{
    const value=JSON.parse(s);value.coverage.criticalMinimum['extension/background.js'][metric]-=1;return JSON.stringify(value);
  });
}
rejectShardMutation('reduce instrumented file minimum','coverageBaseline',s=>{
  const value=JSON.parse(s);value.coverage.minInstrumentedFiles-=1;return JSON.stringify(value);
});
rejectShardMutation('exclude extension from coverage','coverageConfig',s=>s.replace("collectCoverageFrom: ['<rootDir>/extension/**/*.js']",'collectCoverageFrom: []'));
// Exercise aggregate behavior with every terminal dependency result. The exact
// executable expression is validated above; these assertions check its truth table.
const { spawnSync } = require('child_process');
const gate = sharding.parseWorkflow(sources.structure).jobs['structure-review-gate'];
const gateCommand = gate.steps.find(step => step.run === 'node scripts/ci/verify-required-job-results.js').run;
const gateScript = path.join(root, gateCommand.slice('node '.length));
for (const result of ['success','failure','cancelled','skipped']) {
  const proc = spawnSync(process.execPath, [gateScript], {
    env: { ...process.env, NEEDS_JSON: JSON.stringify({a:{result:'success'},b:{result}}) }, encoding:'utf8',
  });
  assert.strictEqual(proc.status, result === 'success' ? 0 : 1, 'aggregate result=' + result);
}
assert.deepStrictEqual(governance.validateSources(Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,v.replace(/\n/g,'\r\n')]))), []);
console.log('PASS aggregate terminal-state truth table and CRLF sharded contracts');

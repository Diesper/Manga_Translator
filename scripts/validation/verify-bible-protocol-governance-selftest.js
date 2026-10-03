'use strict';

const assert = require('assert');
const path = require('path');
const governance = require('./verify-bible-protocol-governance');

const root = path.resolve(__dirname, '../..');
// stepBlockForFragment returns LF-separated blocks. Normalize fixtures so the
// replacement attacks also modify CRLF checkouts on Windows.
const sources = Object.fromEntries(Object.entries(governance.loadSources(root))
  .map(([key, source]) => [key, source.replace(/\r\n/g, '\n')]));

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
for (const os of ['ubuntu-latest','windows-latest']) {
  rejectShardMutation('coverage removes '+os,'structure',s => replaceJob(s,'coverage',block => block.replace('os: [ubuntu-latest, windows-latest]', 'os: ['+(os==='ubuntu-latest'?'windows-latest':'ubuntu-latest')+']')));
}
rejectShardMutation('remove integral coverage verifier','structure',s => replaceJob(s,'coverage',block=>block.replace(' && npm run test:coverage:verify','')));
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
    ['gate masks results','job.result!=="success"','job.result==="success"'],
    ['gate echo','run: node -e','run: echo node -e'],
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
  ['coverage dropped from aggregate','needs: [governance, coverage, mutation, performance, workflow-lint]','needs: [governance, mutation, performance, workflow-lint]'],
  ['mutation optional','name: Run mandatory mutation','name: Run mandatory mutation\n        if: false'],
  ['coverage verify echo','npm run test:coverage && npm run test:coverage:verify','npm run test:coverage && echo npm run test:coverage:verify'],
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
const expression = gate.steps[0].run.slice("node -e '".length, -1);
for (const result of ['success','failure','cancelled','skipped']) {
  const proc = spawnSync(process.execPath, ['-e', expression], {
    env: { ...process.env, NEEDS_JSON: JSON.stringify({a:{result:'success'},b:{result}}) }, encoding:'utf8',
  });
  assert.strictEqual(proc.status, result === 'success' ? 0 : 1, 'aggregate result=' + result);
}
assert.deepStrictEqual(governance.validateSources(Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,v.replace(/\n/g,'\r\n')]))), []);
console.log('PASS aggregate terminal-state truth table and CRLF sharded contracts');

'use strict';

const assert = require('assert');
const path = require('path');
const governance = require('./verify-bible-protocol-governance');

const root = path.resolve(__dirname, '../..');
const sources = governance.loadSources(root);

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
    '      - name: Validate current protected handoffs\n        run: node docs/biblia/.coordination/handoff-guard.js',
    '      - name: Validate current protected handoffs\n        continue-on-error: true\n        run: node docs/biblia/.coordination/handoff-guard.js'
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

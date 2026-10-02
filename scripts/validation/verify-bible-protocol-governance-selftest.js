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
    const tampered = { ...sources, [key]: sources[key].replace(fragment, 'REMOVED-CONTROL') };
    assert.ok(
      governance.validateSources(tampered).some((problem) => (
        problem.startsWith(key + ':') && problem.includes(fragment)
      )),
      'expected governance failure for ' + key + ' fragment=' + fragment
    );
  }
  console.log('PASS removing any required control is rejected: ' + key + ' (' + fragments.length + ' fragments)');
}

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

console.log('Bible protocol governance self-test: SUCCESS');

'use strict';

const assert = require('assert');
const { reconcileRefreshProblems } = require('./verify-bible-protocol-governance');

// Two SHA captures have different purposes: the first identifies the tested
// protocol; the second identifies the live branch on which mutation is based.
const capture = 'echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"';
const fixture = [
  '    steps:',
  '      - name: Remember protocol-validated head',
  '        id: validated',
  '        run: ' + capture,
  '      - name: Validate protocol',
  '        run: npm run test:bible-protocol:infra',
  '      - name: Refresh dynamic branch head',
  '        id: observed',
  '        run: |',
  '          git fetch origin docs/project-bible',
  '          git reset --hard "$REMOTE_SHA"',
  '          ' + capture,
  '      - name: Reconcile',
  '        run: npm run bible:reconcile:write',
].join('\n');

assert.deepStrictEqual(reconcileRefreshProblems(fixture), []);
assert.deepStrictEqual(reconcileRefreshProblems(fixture.replace(/\n/g, '\r\n')), []);
console.log('PASS early validated SHA and refreshed observed SHA are distinct (LF + CRLF)');

const mutants = {
  'missing protocol validation': fixture.replace('npm run test:bible-protocol:infra', 'echo removed'),
  'missing fetch': fixture.replace('git fetch origin docs/project-bible', 'echo removed'),
  'missing reset': fixture.replace('git reset --hard "$REMOTE_SHA"', 'echo removed'),
  'missing observed capture': fixture.replace('          ' + capture, '          echo removed'),
  'missing observed step identity': fixture.replace('id: observed', 'id: other'),
  'duplicate observed identity': fixture + '\n      - name: Duplicate\n        id: observed\n        run: echo duplicate',
  'reset before fetch': fixture.replace('git fetch origin docs/project-bible\n          git reset --hard "$REMOTE_SHA"', 'git reset --hard "$REMOTE_SHA"\n          git fetch origin docs/project-bible'),
  'mutation before observed SHA': fixture.replace('          ' + capture, '          npm run bible:reconcile:write\n          ' + capture),
  'capture before refresh': fixture.replace('          git fetch origin docs/project-bible', '          ' + capture + '\n          git fetch origin docs/project-bible').replace('          git reset --hard "$REMOTE_SHA"\n          ' + capture, '          git reset --hard "$REMOTE_SHA"'),
};
for (const [name, source] of Object.entries(mutants)) {
  assert.ok(reconcileRefreshProblems(source).length > 0, 'must reject ' + name);
  console.log('PASS rejects ' + name);
}
console.log('Reconciliation refresh regression self-test: SUCCESS');

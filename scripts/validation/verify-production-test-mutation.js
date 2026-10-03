'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const assert = require('assert');
const root = path.resolve(__dirname, '../..');
const parent = fs.realpathSync(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(parent, 'production-test-mutation-'));
function write(relative, content) {
  const file=path.join(fixture,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);
}
try {
  const production='extension/content/cm-chapter.js';
  for (const file of ['tests/helpers/repo-root.js','tests/unit/content-manga/canonical-title-full.test.js',production,'extension/manifest.json']) write(file,fs.readFileSync(path.join(root,file)));
  const config={rootDir:fixture,testEnvironment:path.join(root,'node_modules/jest-environment-jsdom'),testMatch:['**/canonical-title-full.test.js']};
  function run() { return cp.spawnSync(process.execPath,[path.join(root,'node_modules/jest/bin/jest.js'),'--config',JSON.stringify(config),'--runInBand'],{cwd:fixture,encoding:'utf8'}); }
  const baseline=run();assert.strictEqual(baseline.status,0,baseline.stderr);
  const source=fs.readFileSync(path.join(fixture,production),'utf8');
  const mutated=source.replace('(?:[A-Za-z]+\\.?\\s+)?','');assert.notStrictEqual(source,mutated);
  write(production,mutated);
  const mutant=run();assert.strictEqual(mutant.status,1);assert.match(mutant.stderr,/Cap 5:/);
  console.log('Production mutation: SUCCESS — existing title tests pass production and reject its removed prefix rule');
} finally {
  const resolved=fs.realpathSync(fixture);if(path.dirname(resolved)!==parent || !path.basename(resolved).startsWith('production-test-mutation-'))throw Error('Unsafe cleanup');
  fs.rmSync(resolved,{recursive:true,force:true});
}

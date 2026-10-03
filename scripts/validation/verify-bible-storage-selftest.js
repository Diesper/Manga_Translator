'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const storage = require('../bible/storage/files');
const parent = fs.realpathSync(os.tmpdir());
const root = fs.mkdtempSync(path.join(parent, 'bible-atomic-'));
const stateFile = path.join(root, 'state.json');
async function main() {
  try {
    const original = '{"version":0}\n';
    storage.atomicWrite(stateFile, original, { createOnly: true });
    assert.throws(() => storage.atomicWrite(stateFile, 'bad', { createOnly: true }), /EEXIST/);
    assert.throws(() => storage.atomicWrite(stateFile, 'bad', { expected: 'stale' }), /CAS_CONFLICT/);
    assert.throws(() => storage.atomicWrite(stateFile, 'bad', { beforeCommit() { throw new Error('injected crash'); } }), /injected crash/);
    assert.strictEqual(fs.readFileSync(stateFile, 'utf8'), original);
    storage.withUnitLock(root, 1, () => assert.throws(() => storage.withUnitLock(root, 1, () => {}), /UNIT_WRITE_LOCKED/));
    const modulePath = path.resolve(__dirname, '../bible/storage/files');
    const child = `const fs=require('fs'),s=require(${JSON.stringify(modulePath)});process.on('message',()=>{try{s.withUnitLock(${JSON.stringify(root)},1,()=>{const before=fs.readFileSync(${JSON.stringify(stateFile)},'utf8');if(JSON.parse(before).version!==0)throw Error('STALE');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);s.atomicWrite(${JSON.stringify(stateFile)},'{"version":1}\\n',{expected:before});});process.send('won');}catch(e){process.send('rejected');}process.disconnect();});process.send('ready');`;
    const writer = path.join(root, 'writer.cjs'); fs.writeFileSync(writer, child);
    const children = [cp.fork(writer, [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }), cp.fork(writer, [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })];
    await Promise.all(children.map(proc => new Promise(resolve => proc.once('message', value => { assert.strictEqual(value, 'ready'); resolve(); }))));
    const results = children.map(proc => new Promise((resolve,reject) => { proc.once('message', resolve); proc.once('error',reject); }));
    children.forEach(proc => proc.send('start'));
    assert.deepStrictEqual((await Promise.all(results)).sort(), ['rejected', 'won']);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(stateFile,'utf8')), { version: 1 });
    storage.transaction(root, 1, { action: 'SUCCESS' }, () => {});
    assert.deepStrictEqual(storage.pendingTransactions(root), []);
    assert.throws(() => storage.transaction(root, 1, { action: 'FAILURE' }, () => { throw Error('interrupted side effect'); }));
    assert.strictEqual(storage.pendingTransactions(root).length, 1);
    console.log('Atomic storage: SUCCESS — two processes, one winner; crash preserves JSON; unresolved journal retained');
  } finally {
    const resolved=fs.realpathSync(root);
    if (path.dirname(resolved)!==parent || !path.basename(resolved).startsWith('bible-atomic-')) throw Error('Unsafe cleanup');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });

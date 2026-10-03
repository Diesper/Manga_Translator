'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../..');
const MODULE_PATH = path.join(ROOT, 'extension/background/jobs-dom-ack.js');
const SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

function loadFactory(chrome) {
  const sandbox = { console, Promise, Date, setTimeout, clearTimeout, chrome };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: MODULE_PATH });
  assert(sandbox.MangaTranslatorJobsDomAck, 'API jobs-dom-ack ausente');
  return sandbox.MangaTranslatorJobsDomAck.createDomAckDelivery;
}

function makeChrome(sendMessage) {
  return {
    runtime: { lastError: null },
    tabs: { sendMessage },
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // ACK moderno explícito: apenas dom_applied/resultPersisted é persistido.
  {
    const updates = [];
    const finalizeCalls = [];
    const chrome = makeChrome((_tabId, _message, callback) => {
      callback({ ok: true, persisted: true, domApplied: true });
    });
    const create = loadFactory(chrome);
    const api = create({
      updateJobState: async (...args) => { updates.push(args); },
      finalizeJob: async (...args) => { finalizeCalls.push(args); },
      log: () => {},
      timeoutMs: 50,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: false,
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), {
      ok: true, reason: 'ack', persisted: true, domApplied: true,
    });
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0][0], 321);
    assert.strictEqual(updates[0][1].state, 'dom_applied');
    assert.strictEqual(updates[0][1].resultPersisted, true);
    assert.strictEqual(finalizeCalls.length, 0);
  }

  // Callback sem resposta não é ACK implícito.
  {
    const updates = [];
    const chrome = makeChrome((_tabId, _message, callback) => callback(undefined));
    const api = loadFactory(chrome)({
      updateJobState: async (...args) => { updates.push(args); },
      finalizeJob: async () => {},
      log: () => {},
      timeoutMs: 50,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: false,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'ack_missing');
    assert.strictEqual(result.persisted, false);
    assert.strictEqual(updates.length, 0);
  }

  // persisted:false nunca marca o job como persistido.
  {
    const updates = [];
    const chrome = makeChrome((_tabId, _message, callback) => {
      callback({ ok: true, persisted: false, domApplied: true });
    });
    const api = loadFactory(chrome)({
      updateJobState: async (...args) => { updates.push(args); },
      finalizeJob: async () => {},
      log: () => {},
      timeoutMs: 50,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: false,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'persistence_not_confirmed');
    assert.strictEqual(result.persisted, false);
    assert.strictEqual(updates.length, 0);
  }

  // Falha ao registrar dom_applied transforma staging em falha.
  {
    const logs = [];
    const chrome = makeChrome((_tabId, _message, callback) => {
      callback({ ok: true, persisted: true, domApplied: true });
    });
    const api = loadFactory(chrome)({
      updateJobState: async () => { throw new TypeError('state-boom'); },
      finalizeJob: async () => { throw new Error('finalize-should-not-run'); },
      log: (...args) => logs.push(args),
      timeoutMs: 50,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: false,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'state_update_failed');
    assert.strictEqual(result.persisted, false);
    assert(logs.some(args => args[2] === 'DOM_ACK_STATE_UPDATE_FAILED'));
  }

  // Compatibilidade legado: channel closed pode finalizar, mas não inventa persisted.
  {
    const finalizeCalls = [];
    const chrome = makeChrome((_tabId, _message, callback) => {
      chrome.runtime.lastError = {
        message: 'The message channel closed before a response was received.',
      };
      callback(undefined);
      chrome.runtime.lastError = null;
    });
    const api = loadFactory(chrome)({
      updateJobState: async () => {},
      finalizeJob: async (...args) => { finalizeCalls.push(args); },
      log: () => {},
      timeoutMs: 50,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: true,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.reason, 'legacy_no_ack');
    assert.strictEqual(result.persisted, false);
    assert.strictEqual(result.domApplied, false);
    assert.deepStrictEqual(finalizeCalls, [[321, 77, false]]);
  }

  // Falha de finalize deixa de ser sucesso silencioso.
  {
    const chrome = makeChrome((_tabId, _message, callback) => {
      callback({ ok: true, persisted: true, domApplied: true });
    });
    const api = loadFactory(chrome)({
      updateJobState: async () => {},
      finalizeJob: async () => { throw new Error('finalize-boom'); },
      log: () => {},
      timeoutMs: 50,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: true,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'finalize_failed');
    assert.strictEqual(result.persisted, true);
  }

  // Timeout reivindica settlement antes de callback tardio.
  {
    let callback;
    const updates = [];
    const chrome = makeChrome((_tabId, _message, cb) => { callback = cb; });
    const api = loadFactory(chrome)({
      updateJobState: async (...args) => { updates.push(args); },
      finalizeJob: async () => {},
      log: () => {},
      timeoutMs: 15,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: false,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'ack_timeout');
    callback({ ok: true, persisted: true, domApplied: true });
    await wait(10);
    assert.strictEqual(updates.length, 0, 'callback tardio não pode gravar dom_applied');
  }

  // Exceção síncrona de sendMessage e logger que lança não quebram a resolução.
  {
    const chrome = makeChrome(() => { throw new Error('send-boom'); });
    const api = loadFactory(chrome)({
      updateJobState: async () => {},
      finalizeJob: async () => {},
      log: () => { throw new Error('log-boom'); },
      timeoutMs: 50,
    });
    const result = await api.deliver({
      mangaTabId: 77, index: 4, src: 'data:image/png;base64,AA',
      jobId: 'job-4', batchId: 'batch-1', geminiTabId: 321, finalizeOnAck: false,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'send-boom');
  }

  process.stdout.write(
    'jobs-dom-ack selftest: PASS — strict persisted ACK, monotonic state, late-callback settlement, legacy compatibility and internal failures validated.\n'
  );
}

main().catch((error) => {
  console.error('jobs-dom-ack selftest: FAIL —', error);
  process.exit(1);
});

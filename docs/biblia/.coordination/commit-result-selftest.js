'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../..');
const ACTION_PATH = path.join(ROOT, 'extension/background/actions/commit-result.js');
const SOURCE = fs.readFileSync(ACTION_PATH, 'utf8');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAction({ exposeSelf = true } = {}) {
  let action = null;
  const sandbox = {
    console,
    Promise,
    Date,
    MangaTranslatorRouter: {
      registerAction(definition) {
        action = definition;
      },
    },
  };
  sandbox.globalThis = sandbox;
  if (exposeSelf) sandbox.self = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: ACTION_PATH });
  assert(action, 'commit-result não foi registrada');
  return action;
}

async function expectReject(promise, pattern) {
  let error = null;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert(error, 'esperava rejeição');
  assert.match(String(error.message || error), pattern);
  return error;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function ownershipCallback({ owns = true, tabId = 321, job = null } = {}) {
  return (_sender, _jobId, callback) => callback(owns, tabId, job);
}

function makeLiveJob(patch = {}) {
  return {
    jobId: 'job-1',
    batchId: 'batch-1',
    mangaTabId: 77,
    geminiTabId: 321,
    state: 'dom_applied',
    resultPersisted: true,
    ...patch,
  };
}

function makeContext({
  sender = { tab: { id: 321 } },
  job = makeLiveJob(),
  owns = true,
  ownershipTabId = 321,
  assertJobOwnership = null,
  ensureInitialized = async () => {},
  storage = null,
  updateJobState = async () => {},
  finalizeJob = async () => {},
  log = () => {},
} = {}) {
  return {
    sender,
    ensureInitialized,
    assertJobOwnership: assertJobOwnership || ownershipCallback({ owns, tabId: ownershipTabId, job }),
    storage,
    updateJobState,
    finalizeJob,
    log,
  };
}

async function main() {
  const action = loadAction({ exposeSelf: true });
  const globalFallback = loadAction({ exposeSelf: false });
  assert.strictEqual(action.name, 'commit-result');
  assert.strictEqual(globalFallback.name, 'commit-result');
  assert.deepStrictEqual(plain(action.meta), { allowedSources: ['any'] });

  for (const invalid of [undefined, null, 3, '', '   ']) {
    const validation = action.validate({ jobId: invalid });
    assert.deepStrictEqual(plain(validation), {
      code: 'INVALID_PAYLOAD',
      message: 'jobId é obrigatório',
    });
  }
  assert.strictEqual(action.validate({ jobId: 'job-1' }), null);

  // A matriz real é OR-semântica: qualquer um dos dois sinais positivos autoriza.
  for (const patch of [
    { resultPersisted: true, state: 'result_received' },
    { resultPersisted: false, state: 'dom_applied' },
    { resultPersisted: undefined, state: 'dom_applied' },
  ]) {
    const events = [];
    const job = makeLiveJob(patch);
    const result = await action.execute({ jobId: 'job-1', batchId: 'batch-1' }, makeContext({
      job,
      updateJobState: async () => { events.push('update'); },
      finalizeJob: async () => { events.push('finalize'); },
    }));
    assert.deepStrictEqual(plain(result), { committed: true });
    assert.deepStrictEqual(events, ['update', 'finalize']);
  }

  for (const patch of [
    { resultPersisted: false, state: 'result_received' },
    { resultPersisted: undefined, state: 'opening' },
  ]) {
    let updateCalls = 0;
    let finalizeCalls = 0;
    const result = await action.execute({ jobId: 'job-1', batchId: 'batch-1' }, makeContext({
      job: makeLiveJob(patch),
      updateJobState: async () => { updateCalls += 1; },
      finalizeJob: async () => { finalizeCalls += 1; },
    }));
    assert.deepStrictEqual(plain(result), { ok: false, reason: 'result_not_persisted' });
    assert.strictEqual(updateCalls, 0);
    assert.strictEqual(finalizeCalls, 0);
  }

  // Ordering/await causal: finalize não inicia antes de update resolver e a resposta
  // não resolve antes de finalize resolver.
  {
    const updateGate = deferred();
    const finalizeGate = deferred();
    const events = [];
    let settled = false;
    const pending = action.execute({ jobId: 'job-1', batchId: 'batch-1' }, makeContext({
      updateJobState: async () => {
        events.push('update:start');
        await updateGate.promise;
        events.push('update:end');
      },
      finalizeJob: async () => {
        events.push('finalize:start');
        await finalizeGate.promise;
        events.push('finalize:end');
      },
    }));
    pending.then(() => { settled = true; });

    await Promise.resolve();
    assert.deepStrictEqual(events, ['update:start']);
    assert.strictEqual(settled, false);

    updateGate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(events, ['update:start', 'update:end', 'finalize:start']);
    assert.strictEqual(settled, false);

    finalizeGate.resolve();
    const result = await pending;
    assert.deepStrictEqual(events, ['update:start', 'update:end', 'finalize:start', 'finalize:end']);
    assert.deepStrictEqual(plain(result), { committed: true });
    assert.strictEqual(settled, true);
  }

  // ensureInitialized rejeitando impede ownership.
  {
    let ownershipCalls = 0;
    await expectReject(action.execute({ jobId: 'job-1' }, makeContext({
      ensureInitialized: async () => { throw new Error('init-failed'); },
      assertJobOwnership: () => { ownershipCalls += 1; },
    })), /init-failed/);
    assert.strictEqual(ownershipCalls, 0);
  }

  // update falhando impede finalize.
  {
    let finalizeCalls = 0;
    await expectReject(action.execute({ jobId: 'job-1' }, makeContext({
      updateJobState: async () => { throw new Error('update-failed'); },
      finalizeJob: async () => { finalizeCalls += 1; },
    })), /update-failed/);
    assert.strictEqual(finalizeCalls, 0);
  }

  // finalize falhando acontece depois do update e propaga; não há falso committed.
  {
    const events = [];
    await expectReject(action.execute({ jobId: 'job-1' }, makeContext({
      updateJobState: async () => { events.push('update'); },
      finalizeJob: async () => {
        events.push('finalize');
        throw new Error('finalize-failed');
      },
    })), /finalize-failed/);
    assert.deepStrictEqual(events, ['update', 'finalize']);
  }

  // Journal durável válido reconhece retry e não executa update/finalize.
  {
    let updateCalls = 0;
    let finalizeCalls = 0;
    const now = Date.now();
    const result = await action.execute({ jobId: 'job-1', batchId: 'batch-1' }, makeContext({
      owns: false,
      job: null,
      storage: {
        async get() {
          return {
            gemini_finalized_321: {
              jobId: 'job-1',
              fromError: false,
              expiresAt: now + 60_000,
            },
          };
        },
      },
      updateJobState: async () => { updateCalls += 1; },
      finalizeJob: async () => { finalizeCalls += 1; },
    }));
    assert.deepStrictEqual(plain(result), { committed: true, alreadyCommitted: true });
    assert.strictEqual(updateCalls, 0);
    assert.strictEqual(finalizeCalls, 0);
  }

  // Marker expirado/fromError/jobId divergente nunca autoriza retry.
  {
    const now = Date.now();
    const markers = [
      { jobId: 'job-1', fromError: false, expiresAt: now - 1 },
      { jobId: 'job-1', fromError: true, expiresAt: now + 60_000 },
      { jobId: 'other-job', fromError: false, expiresAt: now + 60_000 },
    ];
    for (const marker of markers) {
      const result = await action.execute({ jobId: 'job-1' }, makeContext({
        owns: false,
        job: null,
        storage: { async get() { return { gemini_finalized_321: marker }; } },
      }));
      assert.deepStrictEqual(plain(result), { ok: false, reason: 'job_not_live' });
    }
  }

  // Falha de lookup do journal é fail-closed e observável.
  {
    const logs = [];
    const result = await action.execute({ jobId: 'job-1' }, makeContext({
      owns: false,
      job: null,
      storage: { async get() { throw new TypeError('storage-failed'); } },
      log: (...args) => logs.push(args),
    }));
    assert.deepStrictEqual(plain(result), { ok: false, reason: 'job_not_live' });
    assert(logs.some(args =>
      args[0] === 'warn' &&
      args[2] === 'RESULT_COMMIT_JOURNAL_LOOKUP_FAILED' &&
      args[4] &&
      args[4].errorName === 'TypeError'
    ));
  }

  // Sem storage no retry, comportamento permanece fail-closed.
  {
    const result = await action.execute({ jobId: 'job-1' }, makeContext({
      owns: false,
      job: null,
      storage: null,
    }));
    assert.deepStrictEqual(plain(result), { ok: false, reason: 'job_not_live' });
  }

  // Fallbacks de geminiTabId: ownership -> sender -> job.
  {
    let observed = null;
    await action.execute({ jobId: 'job-1' }, makeContext({
      ownershipTabId: null,
      sender: { tab: { id: 222 } },
      updateJobState: async (tabId) => { observed = tabId; },
    }));
    assert.strictEqual(observed, 222);
  }
  {
    let observed = null;
    await action.execute({ jobId: 'job-1' }, makeContext({
      ownershipTabId: null,
      sender: {},
      job: makeLiveJob({ geminiTabId: 333 }),
      updateJobState: async (tabId) => { observed = tabId; },
    }));
    assert.strictEqual(observed, 333);
  }

  // mangaTabId persistido vence; request é fallback apenas quando persistido é nullish.
  {
    let finalizeArgs = null;
    await action.execute({ jobId: 'job-1', mangaTabId: 999 }, makeContext({
      job: makeLiveJob({ mangaTabId: 77 }),
      finalizeJob: async (...args) => { finalizeArgs = args; },
    }));
    assert.deepStrictEqual(finalizeArgs, [321, 77, false]);
  }
  {
    let finalizeArgs = null;
    await action.execute({ jobId: 'job-1', mangaTabId: 999 }, makeContext({
      job: makeLiveJob({ mangaTabId: null }),
      finalizeJob: async (...args) => { finalizeArgs = args; },
    }));
    assert.deepStrictEqual(finalizeArgs, [321, 999, false]);
  }

  // Batch omitido não cria mismatch artificial.
  {
    const result = await action.execute({ jobId: 'job-1' }, makeContext({
      job: makeLiveJob({ batchId: 'persisted-batch' }),
    }));
    assert.deepStrictEqual(plain(result), { committed: true });
  }

  process.stdout.write(
    'commit-result selftest: PASS — persistence matrix, journal negatives, dependency failures, ID fallbacks and update→finalize→response ordering validated.\n'
  );
}

main().catch((error) => {
  console.error('commit-result selftest: FAIL —', error);
  process.exit(1);
});

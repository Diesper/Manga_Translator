'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../..');
const ACTION_PATH = path.join(ROOT, 'extension/background/actions/claim-gemini-job.js');
const SOURCE = fs.readFileSync(ACTION_PATH, 'utf8');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAction({ exposeSelf = true } = {}) {
  let action = null;
  const sandbox = {
    console,
    Promise,
    MangaTranslatorRouter: {
      registerAction(definition) {
        action = definition;
      },
    },
  };
  sandbox.globalThis = sandbox;
  if (exposeSelf) sandbox.self = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: ACTION_PATH });
  assert(action, 'claim-gemini-job não foi registrada');
  return action;
}

function makeStorage(getImpl) {
  const calls = [];
  return {
    calls,
    async get(keys) {
      const normalized = Array.isArray(keys) ? [...keys] : [keys];
      calls.push(normalized);
      return getImpl ? getImpl(normalized, calls.length) : {};
    },
  };
}

function makeContext({
  sender = { tab: { id: 200 } },
  state = { jobIndex: [] },
  storage = makeStorage(),
  tabIdentity = null,
  ensureInitialized = async () => {},
  log = () => {},
} = {}) {
  return { sender, state, storage, tabIdentity, ensureInitialized, log };
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

async function main() {
  const action = loadAction({ exposeSelf: true });
  const globalFallbackAction = loadAction({ exposeSelf: false });
  assert.strictEqual(action.name, 'claim-gemini-job');
  assert.strictEqual(globalFallbackAction.name, 'claim-gemini-job');
  assert.deepStrictEqual(plain(action.meta), { allowedSources: ['gemini'] });

  // Prova causal de canonicalização do sender: sem 100 -> 200 a chave direta não existiria.
  {
    const resolveCalls = [];
    const storage = makeStorage((keys) => {
      assert.deepStrictEqual(keys, ['gemini_job_200']);
      return {
        gemini_job_200: {
          jobId: 'job-sender',
          batchId: 'batch-1',
          mangaTabId: 7,
          index: 4,
          prompt: 'translate',
          executionMode: 'temp_chat',
          signedUrl: 'secret',
          internalOnly: true,
        },
      };
    });
    const result = await action.execute({ jobId: 'job-sender' }, makeContext({
      sender: { tab: { id: 100 } },
      storage,
      tabIdentity: {
        async resolveCanonicalTabId(tabId) {
          resolveCalls.push(tabId);
          return tabId === 100 ? 200 : tabId;
        },
      },
    }));
    assert.deepStrictEqual(resolveCalls, [100]);
    assert.deepStrictEqual(plain(result), {
      job: {
        jobId: 'job-sender',
        batchId: 'batch-1',
        mangaTabId: 7,
        index: 4,
        prompt: 'translate',
        executionMode: 'temp_chat',
        geminiTabId: 200,
      },
    });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.job, 'signedUrl'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.job, 'internalOnly'), false);
  }

  // jobId divergente no caminho direto nunca expõe o job.
  {
    const storage = makeStorage(() => ({
      gemini_job_200: { jobId: 'other-job', prompt: 'must-not-leak' },
    }));
    const result = await action.execute({ jobId: 'expected-job' }, makeContext({ storage }));
    assert.deepStrictEqual(plain(result), { job: null });
  }

  // Sender inválido retorna null antes de tocar storage.
  for (const sender of [{}, { tab: {} }, { tab: { id: null } }, { tab: { id: '200' } }, { tab: { id: NaN } }]) {
    const storage = makeStorage(() => { throw new Error('storage-should-not-run'); });
    const result = await action.execute({ jobId: 'x' }, makeContext({ sender, storage }));
    assert.deepStrictEqual(plain(result), { job: null });
    assert.strictEqual(storage.calls.length, 0);
  }

  // ensureInitialized é causalmente aguardado e sua rejeição bloqueia qualquer leitura.
  {
    let resolveInit;
    let storageRead = false;
    const init = new Promise(resolve => { resolveInit = resolve; });
    const storage = makeStorage(() => {
      storageRead = true;
      return { gemini_job_200: { jobId: 'after-init' } };
    });
    const pending = action.execute({ jobId: 'after-init' }, makeContext({
      storage,
      ensureInitialized: () => init,
    }));
    await Promise.resolve();
    assert.strictEqual(storageRead, false);
    resolveInit();
    const result = await pending;
    assert.strictEqual(storageRead, true);
    assert.strictEqual(result.job.jobId, 'after-init');
  }
  {
    const storage = makeStorage(() => { throw new Error('storage-should-not-run'); });
    await expectReject(action.execute({ jobId: 'x' }, makeContext({
      storage,
      ensureInitialized: async () => { throw new Error('init-failed'); },
    })), /init-failed/);
    assert.strictEqual(storage.calls.length, 0);
  }

  // Sem TabIdentity, sender inteiro continua ancorando a chave direta.
  {
    const storage = makeStorage((keys) => ({
      [keys[0]]: { jobId: 'job-no-identity', mangaTabId: 9, index: 1 },
    }));
    const result = await action.execute({ jobId: 'job-no-identity' }, makeContext({
      sender: { tab: { id: 55 } },
      storage,
      tabIdentity: null,
    }));
    assert.strictEqual(result.job.jobId, 'job-no-identity');
    assert.strictEqual(result.job.geminiTabId, 55);
  }

  // Miss direto + state/jobIndex ausentes ou sem entry não escaneia storage.
  for (const state of [null, {}, { jobIndex: null }, { jobIndex: [] }, { jobIndex: [{ jobId: 'other', geminiTabId: 200 }] }]) {
    const storage = makeStorage(() => ({}));
    const result = await action.execute({ jobId: 'expected' }, makeContext({ state, storage }));
    assert.deepStrictEqual(plain(result), { job: null });
    assert.strictEqual(storage.calls.length, 1);
  }

  // Ownership canônico divergente: jobId conhecido não basta.
  {
    const resolveCalls = [];
    let migrateCalls = 0;
    const storage = makeStorage(() => ({}));
    const tabIdentity = {
      async resolveCanonicalTabId(tabId) {
        resolveCalls.push(tabId);
        return tabId === 100 ? 300 : tabId;
      },
      async migrateTabIdentity() {
        migrateCalls += 1;
      },
    };
    const result = await action.execute({ jobId: 'job-owned-elsewhere' }, makeContext({
      storage,
      state: { jobIndex: [{ jobId: 'job-owned-elsewhere', geminiTabId: 100 }] },
      tabIdentity,
    }));
    assert.deepStrictEqual(resolveCalls, [200, 100]);
    assert.strictEqual(migrateCalls, 0);
    assert.deepStrictEqual(plain(result), { job: null });
  }

  // Migração é awaited e o read-after-write acontece somente depois dela.
  {
    const events = [];
    let getCount = 0;
    const storage = makeStorage((keys) => {
      getCount += 1;
      events.push('get:' + keys[0]);
      if (getCount === 1) return {};
      return {
        gemini_job_200: {
          jobId: 'job-alias',
          batchId: 'b',
          mangaTabId: 7,
          index: 4,
          prompt: 'translate',
        },
      };
    });
    const tabIdentity = {
      async resolveCanonicalTabId(tabId) {
        events.push('resolve:' + tabId);
        return tabId === 100 ? 200 : tabId;
      },
      async migrateTabIdentity(oldTabId, newTabId, options) {
        events.push('migrate:' + oldTabId + '->' + newTabId + ':' + options.jobId);
        return newTabId;
      },
    };
    const result = await action.execute({ jobId: 'job-alias' }, makeContext({
      storage,
      state: { jobIndex: [{ jobId: 'job-alias', geminiTabId: 100 }] },
      tabIdentity,
    }));
    assert.deepStrictEqual(events, [
      'resolve:200',
      'get:gemini_job_200',
      'resolve:100',
      'migrate:100->200:job-alias',
      'get:gemini_job_200',
    ]);
    assert.strictEqual(result.job.jobId, 'job-alias');
    assert.strictEqual(result.job.geminiTabId, 200);
  }

  // Falha da migração propaga e impede read-after-write/sucesso.
  {
    let getCount = 0;
    const storage = makeStorage(() => {
      getCount += 1;
      return {};
    });
    const tabIdentity = {
      async resolveCanonicalTabId(tabId) {
        return tabId === 100 ? 200 : tabId;
      },
      async migrateTabIdentity() {
        throw new Error('migration-failed');
      },
    };
    await expectReject(action.execute({ jobId: 'job-alias' }, makeContext({
      storage,
      state: { jobIndex: [{ jobId: 'job-alias', geminiTabId: 100 }] },
      tabIdentity,
    })), /migration-failed/);
    assert.strictEqual(getCount, 1);
  }

  // Pós-migração sem chave ou com jobId divergente nunca libera claim.
  for (const migratedRecord of [null, { jobId: 'wrong-job', prompt: 'must-not-leak' }]) {
    let getCount = 0;
    const storage = makeStorage(() => {
      getCount += 1;
      if (getCount === 1) return {};
      return migratedRecord ? { gemini_job_200: migratedRecord } : {};
    });
    const tabIdentity = {
      async resolveCanonicalTabId(tabId) {
        return tabId === 100 ? 200 : tabId;
      },
      async migrateTabIdentity() {
        return 200;
      },
    };
    const result = await action.execute({ jobId: 'job-alias' }, makeContext({
      storage,
      state: { jobIndex: [{ jobId: 'job-alias', geminiTabId: 100 }] },
      tabIdentity,
    }));
    assert.deepStrictEqual(plain(result), { job: null });
    assert.strictEqual(getCount, 2);
  }

  // Storage failure permanece erro causal; a action não converte falha em job:null.
  {
    const storage = makeStorage(() => { throw new Error('storage-failed'); });
    await expectReject(action.execute({ jobId: 'job-x' }, makeContext({ storage })), /storage-failed/);
  }

  process.stdout.write(
    'claim-gemini-job selftest: PASS — sender canonicalization, ownership mismatch, migration/read-after-write ordering, defensive branches and failures validated.\n'
  );
}

main().catch((error) => {
  console.error('claim-gemini-job selftest: FAIL —', error);
  process.exit(1);
});

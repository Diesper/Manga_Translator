'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../..');
const ACTION_PATH = path.join(ROOT, 'extension/background/actions/check-extraction-tab.js');
const SOURCE = fs.readFileSync(ACTION_PATH, 'utf8');

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadAction({ exposeSelf = true, exposeRouter = true } = {}) {
  let action = null;
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
  };
  sandbox.globalThis = sandbox;
  if (exposeRouter) {
    sandbox.MangaTranslatorRouter = {
      registerAction(definition) {
        action = definition;
      },
    };
  }
  if (exposeSelf) sandbox.self = sandbox;

  vm.runInNewContext(SOURCE, sandbox, { filename: ACTION_PATH });
  return { action, sandbox };
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
  assert.throws(
    () => loadAction({ exposeSelf: false, exposeRouter: false }),
    /MangaTranslatorRouter indisponível/
  );

  const viaSelf = loadAction({ exposeSelf: true, exposeRouter: true });
  assert(viaSelf.action, 'action não registrada via self');
  assert.strictEqual(viaSelf.action.name, 'check-extraction-tab');
  assert.deepStrictEqual(normalize(viaSelf.action.meta), { allowedSources: ['any'] });

  const viaGlobalThis = loadAction({ exposeSelf: false, exposeRouter: true });
  assert(viaGlobalThis.action, 'action não registrada via globalThis fallback');

  const action = viaSelf.action;

  let initCalls = 0;
  const nominal = await action.execute({}, {
    ensureInitialized: async () => { initCalls += 1; },
    sender: { tab: { id: 61 } },
    state: {
      extractionTabs: {
        61: { mangaTabId: 7, index: 4, geminiTabId: 32, jobId: 'job-1' },
      },
    },
  });
  assert.strictEqual(initCalls, 1);
  assert.deepStrictEqual(normalize(nominal), {
    mangaTabId: 7,
    index: 4,
    geminiTabId: 32,
    jobId: 'job-1',
    isExtractionTab: true,
  });

  const conflicting = await action.execute({}, {
    ensureInitialized: async () => {},
    sender: { tab: { id: 61 } },
    state: {
      extractionTabs: {
        61: { isExtractionTab: false, jobId: 'corrupt-but-existing' },
      },
    },
  });
  assert.deepStrictEqual(normalize(conflicting), {
    isExtractionTab: true,
    jobId: 'corrupt-but-existing',
  });

  for (const malformed of [true, 'abc', 123, [], null]) {
    const result = await action.execute({}, {
      ensureInitialized: async () => {},
      sender: { tab: { id: 61 } },
      state: { extractionTabs: { 61: malformed } },
    });
    assert.deepStrictEqual(normalize(result), { isExtractionTab: false });
  }

  const arrayState = [];
  arrayState[61] = { jobId: 'array-entry' };
  assert.deepStrictEqual(normalize(await action.execute({}, {
    ensureInitialized: async () => {},
    sender: { tab: { id: 61 } },
    state: { extractionTabs: arrayState },
  })), { isExtractionTab: false });

  const inherited = Object.create({ 61: { jobId: 'inherited-entry' } });
  assert.deepStrictEqual(normalize(await action.execute({}, {
    ensureInitialized: async () => {},
    sender: { tab: { id: 61 } },
    state: { extractionTabs: inherited },
  })), { isExtractionTab: false });

  const missingSender = await action.execute({}, {
    ensureInitialized: async () => {},
    sender: {},
    state: {},
  });
  assert.deepStrictEqual(normalize(missingSender), { isExtractionTab: false });

  const nullState = await action.execute({}, {
    ensureInitialized: async () => {},
    sender: { tab: { id: 61 } },
    state: null,
  });
  assert.deepStrictEqual(normalize(nullState), { isExtractionTab: false });

  let resolveInit;
  let stateRead = false;
  const initPromise = new Promise(resolve => { resolveInit = resolve; });
  const delayed = action.execute({}, {
    ensureInitialized: () => initPromise,
    sender: { tab: { id: 61 } },
    state: {
      get extractionTabs() {
        stateRead = true;
        return { 61: { jobId: 'after-init' } };
      },
    },
  });
  await Promise.resolve();
  assert.strictEqual(stateRead, false, 'estado foi lido antes de ensureInitialized resolver');
  resolveInit();
  const delayedResult = await delayed;
  assert.strictEqual(stateRead, true);
  assert.deepStrictEqual(normalize(delayedResult), {
    jobId: 'after-init',
    isExtractionTab: true,
  });

  let rejectedStateRead = false;
  const initError = new Error('init-failed');
  await expectReject(action.execute({}, {
    ensureInitialized: async () => { throw initError; },
    sender: { tab: { id: 61 } },
    state: {
      get extractionTabs() {
        rejectedStateRead = true;
        return {};
      },
    },
  }), /init-failed/);
  assert.strictEqual(rejectedStateRead, false, 'estado foi lido apesar da falha de inicialização');

  process.stdout.write('check-extraction-tab selftest: PASS — bootstrap, scope fallback, invariant discriminator, malformed state, await ordering and rejection validated.\n');
}

main().catch((error) => {
  console.error('check-extraction-tab selftest: FAIL —', error);
  process.exit(1);
});

'use strict';

const path = require('path');

const WATCHDOG_PATH = path.resolve(
  __dirname,
  '../../../extension/background/jobs-watchdog.js'
);

function loadWatchdog() {
  global.self = global;
  delete global.MangaTranslatorJobsWatchdog;
  jest.isolateModules(() => require(WATCHDOG_PATH));
  return global.MangaTranslatorJobsWatchdog;
}

describe('background/jobs-watchdog ordering', () => {
  afterEach(() => {
    delete global.MangaTranslatorJobsWatchdog;
    delete global.chrome;
    jest.restoreAllMocks();
  });

  test('WATCHDOG-ORDER-01: aguarda finalizeJob antes de fechar abas auxiliares', async () => {
    let releaseFinalization;
    const finalizationGate = new Promise(resolve => { releaseFinalization = resolve; });
    const finalizeJob = jest.fn(() => finalizationGate);
    const remove = jest.fn((_tabId, callback) => callback?.());
    const extractionTabs = {
      900: { geminiTabId: 321 },
      901: { geminiTabId: 999 },
    };

    global.chrome = {
      runtime: { lastError: null },
      storage: {
        local: {
          get: jest.fn((_keys, callback) => callback({
            wd_data_321: {
              mangaTabId: 77,
              index: 4,
              geminiTabId: 321,
              jobId: 'job-1',
            },
          })),
          remove: jest.fn(),
        },
      },
      tabs: {
        sendMessage: jest.fn((_tabId, _message, callback) => callback?.()),
        remove,
      },
    };

    const watchdog = loadWatchdog().createWatchdog({
      getJobIndex: () => [{
        mangaTabId: 77,
        index: 4,
        geminiTabId: 321,
        jobId: 'job-1',
      }],
      getExtractionTabs: () => extractionTabs,
      finalizeJob,
      log: jest.fn(),
      timeoutMinutes: 5,
    });

    expect(watchdog.handleAlarm({ name: 'watchdog_job-1' })).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(finalizeJob).toHaveBeenCalledWith(321, 77, true);
    expect(remove).not.toHaveBeenCalled();
    expect(extractionTabs[900]).toBeDefined();

    releaseFinalization();
    await finalizationGate;
    await Promise.resolve();
    await Promise.resolve();

    expect(remove).toHaveBeenCalledWith(900, expect.any(Function));
    expect(remove).not.toHaveBeenCalledWith(901, expect.any(Function));
    expect(extractionTabs[900]).toBeUndefined();
    expect(extractionTabs[901]).toBeDefined();
  });
});

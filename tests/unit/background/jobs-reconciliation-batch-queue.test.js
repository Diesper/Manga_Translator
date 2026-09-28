'use strict';

const path = require('path');

const MODULE_PATH = path.resolve(
    __dirname,
    '../../../extension/background/jobs-reconciliation.js'
);

function loadModule() {
    global.self = global;
    delete global.MangaTranslatorJobsReconciliation;
    jest.isolateModules(() => require(MODULE_PATH));
    return global.MangaTranslatorJobsReconciliation;
}

describe('background/jobs-reconciliation.js - isolamento entre lotes FIFO', () => {
    afterEach(() => {
        delete global.MangaTranslatorJobsReconciliation;
        delete global.chrome;
        jest.restoreAllMocks();
    });

    test('RECON-FIFO-01: job tardio de A é removido sem ocupar slot do lote B', async () => {
        const removedKeys = [];
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                remove: jest.fn((_tabId, callback) => callback?.()),
            },
            alarms: {
                clear: jest.fn((_name, callback) => callback?.(true)),
            },
            storage: {
                local: {
                    remove: jest.fn(async keys => {
                        removedKeys.push(...(Array.isArray(keys) ? keys : [keys]));
                    }),
                },
            },
        };

        const state = {
            currentBatchId: 'batch-b',
            activeMangaTabId: 20,
            activeJobsCount: 2,
            jobIndex: [
                {
                    geminiTabId: 111,
                    jobId: 'job-a-late',
                    batchId: 'batch-a',
                    mangaTabId: 10,
                    index: 0,
                },
                {
                    geminiTabId: 222,
                    jobId: 'job-b-live',
                    batchId: 'batch-b',
                    mangaTabId: 20,
                    index: 1,
                },
            ],
        };
        const log = jest.fn();

        const reconciler = loadModule().createReconciler({
            state,
            tabExists: jest.fn(async () => true),
            log,
            syncState: jest.fn().mockResolvedValue(),
            processNextJob: jest.fn(),
            recoverPendingFinalization: jest.fn(async () => false),
            recoverPersistedResult: jest.fn(async () => false),
        });

        await expect(reconciler.reconcile()).resolves.toEqual({
            alive: 1,
            dropped: 1,
            recovered: 0,
            foreign: 1,
        });

        expect(state.jobIndex).toEqual([
            expect.objectContaining({
                geminiTabId: 222,
                batchId: 'batch-b',
            }),
        ]);
        expect(state.activeJobsCount).toBe(1);
        expect(global.chrome.tabs.remove).toHaveBeenCalledWith(111, expect.any(Function));
        expect(removedKeys).toEqual(expect.arrayContaining([
            'gemini_job_111',
            'wd_data_111',
        ]));
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'JOB_RECONCILE_FOREIGN_BATCH_DROP',
            expect.stringContaining('lotes anteriores'),
            expect.objectContaining({ currentBatchId: 'batch-b' })
        );
    });

    test('RECON-FIFO-02: sem lote corrente, reconciliação não inventa foreign batch', async () => {
        global.chrome = {
            runtime: { lastError: null },
            tabs: { remove: jest.fn() },
            alarms: { clear: jest.fn() },
            storage: { local: { remove: jest.fn(async () => {}) } },
        };
        const state = {
            currentBatchId: null,
            activeMangaTabId: null,
            activeJobsCount: 0,
            jobIndex: [
                { geminiTabId: 333, jobId: 'job-restored', batchId: 'batch-restored', mangaTabId: 30 },
            ],
        };

        const reconciler = loadModule().createReconciler({
            state,
            tabExists: jest.fn(async () => true),
            log: jest.fn(),
            syncState: jest.fn().mockResolvedValue(),
            processNextJob: jest.fn(),
            recoverPendingFinalization: jest.fn(async () => false),
            recoverPersistedResult: jest.fn(async () => false),
        });

        const result = await reconciler.reconcile();
        expect(result).toEqual({ alive: 1, dropped: 0, recovered: 0, foreign: 0 });
        expect(state.activeJobsCount).toBe(1);
        expect(state.jobIndex).toHaveLength(1);
        expect(global.chrome.tabs.remove).not.toHaveBeenCalled();
    });
});

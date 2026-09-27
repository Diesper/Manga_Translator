const path = require('path');

const LIFECYCLE_PATH = path.resolve(
    __dirname,
    '../../../extension/background/jobs-lifecycle.js'
);

function loadLifecycle() {
    global.self = global;
    delete global.MangaTranslatorJobsLifecycle;
    jest.isolateModules(() => require(LIFECYCLE_PATH));
    return global.MangaTranslatorJobsLifecycle;
}

describe('background/jobs-lifecycle batch status', () => {
    afterEach(() => {
        delete global.MangaTranslatorJobsLifecycle;
        delete global.chrome;
        jest.restoreAllMocks();
    });

    test('BATCH-STATUS-01: lote incompleto informa hasErrors sem depender de contador paralelo', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
        };

        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 77,
            currentBatchId: 'batch-1',
            completedJobs: 2,
            totalJobs: 3,
            isProcessing: true,
        };
        const log = jest.fn();
        const syncState = jest.fn().mockResolvedValue();

        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState,
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        expect(sendMessage).toHaveBeenCalledWith(
            77,
            expect.objectContaining({
                action: 'BATCH_COMPLETE',
                batchId: 'batch-1',
                hasErrors: true,
            }),
            expect.any(Function)
        );
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'BATCH_DONE',
            expect.stringContaining('falha'),
            expect.objectContaining({ completed: 2, total: 3, hasErrors: true })
        );
        expect(state.isProcessing).toBe(false);
    });

    test('BATCH-STATUS-02: finalizeJob(fromError=true) deixa completedJobs inalterado', async () => {
        const store = {
            gemini_job_321: {
                jobId: 'job-1',
                batchId: 'batch-1',
                mangaTabId: 77,
                geminiTabId: 321,
                executionMode: 'temp_chat',
            },
            debugMode: true,
            geminiExecutionMode: 'temp_chat',
        };

        global.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: jest.fn(async keys => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        for (const key of list) {
                            if (Object.prototype.hasOwnProperty.call(store, key)) {
                                result[key] = store[key];
                            }
                        }
                        return result;
                    }),
                    set: jest.fn(async values => Object.assign(store, values)),
                    remove: jest.fn(async keys => {
                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
                    }),
                },
            },
            alarms: {
                create: jest.fn(),
            },
            tabs: {
                remove: jest.fn(),
                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),
            },
        };

        const entry = {
            geminiTabId: 321,
            jobId: 'job-1',
            batchId: 'batch-1',
        };
        let indexed = true;
        const state = {
            jobQueue: [],
            activeJobsCount: 1,
            completedJobs: 0,
            totalJobs: 1,
            stopRequested: true,
            isProcessing: true,
        };

        const api = loadLifecycle().createLifecycle({
            state,
            log: jest.fn(),
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(() => { indexed = false; }),
            indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await expect(api.finalizeJob(321, 77, true)).resolves.toBe(true);

        expect(state.completedJobs).toBe(0);
        expect(state.activeJobsCount).toBe(0);
    });

    test('BATCH-STATUS-03: lote integral informa hasErrors=false', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
        };

        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 77,
            currentBatchId: 'batch-ok',
            completedJobs: 3,
            totalJobs: 3,
            isProcessing: true,
        };
        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        expect(sendMessage).toHaveBeenCalledWith(
            77,
            expect.objectContaining({
                action: 'BATCH_COMPLETE',
                batchId: 'batch-ok',
                hasErrors: false,
            }),
            expect.any(Function)
        );
        expect(log).toHaveBeenCalledWith(
            'success',
            'bg',
            'BATCH_DONE',
            expect.stringContaining('sucesso'),
            expect.objectContaining({ completed: 3, total: 3, hasErrors: false })
        );
    });

    test('BATCH-STATUS-04: duas finalizações concorrentes emitem BATCH_COMPLETE/BATCH_DONE uma única vez', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 77,
            currentBatchId: 'batch-race',
            completionClaimedBatchId: null,
            completedJobs: 2,
            totalJobs: 2,
            isProcessing: true,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await Promise.all([
            api.processNextJob(),
            api.processNextJob(),
            api.processNextJob(),
        ]);

        const completionMessages = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE');
        const completionLogs = log.mock.calls
            .filter(([, , action]) => action === 'BATCH_DONE');

        expect(completionMessages).toHaveLength(1);
        expect(completionMessages[0]).toEqual(expect.objectContaining({
            batchId: 'batch-race',
            hasErrors: false,
        }));
        expect(completionLogs).toHaveLength(1);
        expect(state.completionClaimedBatchId).toBe('batch-race');
        expect(state.isProcessing).toBe(false);
    });


    test('BATCH-STATUS-05: recovery de worker finaliza resultado já persistido sem regenerar', async () => {
        const store = {
            gemini_job_777: {
                jobId: 'job-persisted',
                batchId: 'batch-persisted',
                mangaTabId: 77,
                geminiTabId: 777,
                executionMode: 'temp_chat',
                state: 'dom_applied',
                resultPersisted: true,
            },
            debugMode: true,
            geminiExecutionMode: 'temp_chat',
        };

        global.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: jest.fn(async keys => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        for (const key of list) {
                            if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
                        }
                        return result;
                    }),
                    set: jest.fn(async values => Object.assign(store, values)),
                    remove: jest.fn(async keys => {
                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
                    }),
                },
            },
            alarms: { create: jest.fn() },
            tabs: {
                remove: jest.fn(),
                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),
            },
        };

        const entry = {
            geminiTabId: 777,
            jobId: 'job-persisted',
            batchId: 'batch-persisted',
            mangaTabId: 77,
            index: 2,
        };
        let indexed = true;
        const state = {
            jobQueue: [],
            activeJobsCount: 1,
            completedJobs: 0,
            totalJobs: 1,
            currentBatchId: 'batch-persisted',
            stopRequested: false,
            isProcessing: true,
        };
        const log = jest.fn();

        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(() => { indexed = false; }),
            indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await expect(api.recoverPersistedResult(entry)).resolves.toBe(true);

        expect(state.completedJobs).toBe(1);
        expect(state.activeJobsCount).toBe(0);
        expect(store.gemini_job_777).toBeUndefined();
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'JOB_RECONCILE_PERSISTED_RESULT',
            expect.stringContaining('persistido'),
            expect.objectContaining({ jobId: 'job-pers' })
        );
    });

});

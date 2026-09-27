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
            currentBatchId: 'batch-1',
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


    test('BATCH-STATUS-06: A conclui e B/C/D são promovidos em FIFO sem pular posições', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        const storageGet = jest.fn(async keys => {
            if (keys === 'maxConcurrentJobs') return { maxConcurrentJobs: 1 };
            return {};
        });
        global.chrome = {
            runtime: { lastError: null },
            storage: { local: { get: storageGet } },
            tabs: { sendMessage },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 10,
            currentBatchId: 'batch-a',
            completionClaimedBatchId: null,
            completedJobs: 1,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: [
                { batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [] },
                { batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [] },
                { batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [] },
            ],
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
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

        await api.processNextJob();

        const completedBatchIds = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);
        expect(completedBatchIds).toEqual(['batch-a', 'batch-b', 'batch-c', 'batch-d']);

        const promotedBatchIds = log.mock.calls
            .filter(([, , action]) => action === 'BATCH_PROMOTED')
            .map(([, , , , extra]) => extra.batchId);
        expect(promotedBatchIds).toEqual(['batch-b', 'batch-c', 'batch-d']);

        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-d');
        expect(state.isProcessing).toBe(false);
        expect(state.completionClaimedBatchId).toBe('batch-d');
    });

    test('BATCH-STATUS-07: finalização tardia de A não altera contadores de B', async () => {
        const store = {
            gemini_job_321: {
                jobId: 'job-a-late',
                batchId: 'batch-a',
                mangaTabId: 10,
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

        let mutationChain = Promise.resolve();
        const state = {
            jobQueue: [{ batchId: 'batch-b', mangaTabId: 20, index: 2, prompt: 'B' }],
            jobIndex: [
                { geminiTabId: 321, jobId: 'job-a-late', batchId: 'batch-a', mangaTabId: 10, index: 1 },
            ],
            pendingBatches: [],
            activeJobsCount: 2,
            completedJobs: 1,
            totalJobs: 4,
            currentBatchId: 'batch-b',
            activeMangaTabId: 20,
            stopRequested: true,
            isProcessing: true,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: [...state.pendingBatches],
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
            indexJobsOfBatch: jest.fn(() => state.jobIndex),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await expect(api.finalizeJob(321, 10, false)).resolves.toBe(true);

        expect(state.completedJobs).toBe(1);
        expect(state.activeJobsCount).toBe(2);
        expect(state.jobIndex).toEqual([]);
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
            expect.stringContaining('não alterou os contadores'),
            expect.objectContaining({
                jobBatchId: 'batch-a',
                currentBatchId: 'batch-b',
            })
        );
    });


    test('BATCH-STATUS-06: A→B→C→D→E→F→G é promovido em FIFO e cada lote conclui uma única vez', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
            storage: {
                local: {
                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),
                },
            },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 101,
            currentBatchId: 'batch-a',
            completionClaimedBatchId: null,
            completedJobs: 1,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: ['b', 'c', 'd', 'e', 'f', 'g'].map((letter, index) => ({
                batchId: `batch-${letter}`,
                mangaTabId: 102 + index,
                prompt: letter.toUpperCase(),
                images: [],
            })),
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
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

        await api.processNextJob();

        const completedBatchIds = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);

        expect(completedBatchIds).toEqual([
            'batch-a',
            'batch-b',
            'batch-c',
            'batch-d',
            'batch-e',
            'batch-f',
            'batch-g',
        ]);

        const doneLogBatchIds = log.mock.calls
            .filter(([, , action]) => action === 'BATCH_DONE')
            .map(([, , , , extra]) => extra.batchId);
        expect(doneLogBatchIds).toEqual([
            'batch-a',
            'batch-b',
            'batch-c',
            'batch-d',
            'batch-e',
            'batch-f',
            'batch-g',
        ]);

        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-g');
        expect(state.completionClaimedBatchId).toBe('batch-g');
        expect(state.activeJobsCount).toBe(0);
        expect(state.isProcessing).toBe(false);
    });

    test('BATCH-STATUS-07: fila longa de 64 lotes não perde, duplica ou reordena batches', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
            storage: {
                local: {
                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),
                },
            },
        };

        const pendingIds = Array.from({ length: 63 }, (_unused, index) =>
            `batch-${String(index + 2).padStart(2, '0')}`
        );
        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 1,
            currentBatchId: 'batch-01',
            completionClaimedBatchId: null,
            completedJobs: 1,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: pendingIds.map((batchId, index) => ({
                batchId,
                mangaTabId: index + 2,
                prompt: batchId,
                images: [],
            })),
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const api = loadLifecycle().createLifecycle({
            state,
            log: jest.fn(),
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

        const completed = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);
        const expected = ['batch-01', ...pendingIds];

        expect(completed).toEqual(expected);
        expect(new Set(completed).size).toBe(64);
        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-64');
        expect(state.isProcessing).toBe(false);
    });


    test('BATCH-STATUS-08: restart com current já concluído e isProcessing stale promove o próximo lote sem repetir A', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
            storage: {
                local: {
                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),
                },
            },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: null,
            currentBatchId: 'batch-a',
            completionClaimedBatchId: 'batch-a',
            completedJobs: 1,
            totalJobs: 1,
            // Flag residual típico de um snapshot interrompido no MV3.
            isProcessing: true,
            pendingBatches: [
                {
                    batchId: 'batch-b',
                    mangaTabId: 202,
                    prompt: 'B',
                    images: [],
                },
            ],
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
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

        await api.processNextJob();

        const completedIds = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);

        expect(completedIds).toEqual(['batch-b']);
        expect(log.mock.calls.filter(([, , action]) => action === 'BATCH_DONE'))
            .toHaveLength(1);
        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-b');
        expect(state.completionClaimedBatchId).toBe('batch-b');
        expect(state.isProcessing).toBe(false);
    });

});

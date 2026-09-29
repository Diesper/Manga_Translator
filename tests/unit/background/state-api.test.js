const path = require('path');
const fs = require('fs');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);
const STATE_PATH = path.join(ROOT, 'extension/background/state.js');
const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

describe('background/state.js - API de estado serializada', () => {
    let storage;
    let state;

    beforeEach(async () => {
        jest.resetModules();
        delete global.MangaTranslatorState;
        storage = getStorageMock();
        await storage.clear();
        require(STATE_PATH);
        state = global.MangaTranslatorState;
    });

    afterEach(() => {
        delete global.MangaTranslatorState;
    });

    test('patch e sync preservam o snapshot serializado e os espelhos legados', async () => {
        const snapshot = state.patch({
            jobQueue: [{ mangaTabId: 9, index: 2 }],
            isProcessing: true,
            currentBatchId: 'batch-9',
            extractionTabs: { 44: { mangaTabId: 9, index: 2 } },
            totalJobs: 3,
            completedJobs: 1,
            activeJobsCount: 1,
            pendingBatches: [
                { batchId: 'batch-next', mangaTabId: 10, prompt: 'next', images: [{ index: 0 }] },
            ],
            jobIndex: [{ geminiTabId: 44, jobId: 'job-44' }],
        });

        await state.syncState();
        const stored = await storage.get(['mt_state']);

        expect(snapshot).toEqual(stored.mt_state);
        expect(state.currentBatchId).toBe('batch-9');
        expect(state.extractionTabs[44]).toEqual({ mangaTabId: 9, index: 2 });
        expect(state.jobIndex).toEqual([{ geminiTabId: 44, jobId: 'job-44' }]);
        expect(state.pendingBatches).toEqual([
            { batchId: 'batch-next', mangaTabId: 10, prompt: 'next', images: [{ index: 0 }] },
        ]);
    });

    test('restore normaliza o estado persistido e mantém a API compatível', async () => {
        await storage.set({
            mt_state: {
                jobQueue: [{ mangaTabId: 3, index: 1 }],
                isProcessing: true,
                stopRequested: false,
                activeMangaTabId: 3,
                currentBatchId: 'batch-restored',
                extractionTabs: { 18: { mangaTabId: 3 } },
                totalJobs: 2,
                completedJobs: 1,
                activeJobsCount: 1,
                pendingBatches: [
                    { batchId: 'batch-b', mangaTabId: 4, prompt: 'B', images: [{ index: 0 }] },
                    { batchId: 'batch-c', mangaTabId: 5, prompt: 'C', images: [{ index: 1 }] },
                ],
                jobIndex: [{ geminiTabId: 18, jobId: 'job-18' }],
            },
        });

        const restored = await state.restoreState();

        expect(restored).toEqual(expect.objectContaining({
            currentBatchId: 'batch-restored',
            activeMangaTabId: 3,
            totalJobs: 2,
        }));
        expect(state.jobQueue).toEqual([{ mangaTabId: 3, index: 1 }]);
        expect(state.pendingBatches.map(batch => batch.batchId)).toEqual(['batch-b', 'batch-c']);
        expect(state.get()).toEqual(restored);
    });

    test('restore sem mt_state preserva os espelhos já definidos', async () => {
        state.patch({ currentBatchId: 'batch-em-memoria', activeJobsCount: 1 });

        await expect(state.restoreState()).resolves.toBeNull();
        expect(state.get()).toEqual(expect.objectContaining({
            currentBatchId: 'batch-em-memoria',
            activeJobsCount: 1,
        }));
    });

    test('pendingBatches é clonado no snapshot e não pode ser mutado por referência externa', () => {
        const source = [
            { batchId: 'batch-x', mangaTabId: 7, prompt: 'X', images: [{ index: 1 }] },
        ];
        state.patch({ pendingBatches: source });

        const snapshot = state.get();
        snapshot.pendingBatches[0].images[0].index = 99;
        snapshot.pendingBatches.push({ batchId: 'batch-y', images: [] });

        expect(state.pendingBatches).toEqual([
            { batchId: 'batch-x', mangaTabId: 7, prompt: 'X', images: [{ index: 1 }] },
        ]);
    });

});

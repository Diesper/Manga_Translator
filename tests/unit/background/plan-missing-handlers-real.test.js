const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getDownloadsMock,
    getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const {
    BACKGROUND_PATH,
    flush,
    dispatchToBackground,
    waitFor,
} = require('../../helpers/background-test-utils.js');

describe('REG-09/IPC-07/IPC-08: background.js - handlers faltantes do plano v3.1', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let downloadsMock;
    let alarmsMock;
    let backgroundModule;
    let originalFetch;
    let originalFileReader;

    class MockFileReader {
        readAsDataURL(blob) {
            this.result = `data:${blob.type || 'application/octet-stream'};base64,UkVBRA==`;
            setTimeout(() => {
                if (typeof this.onloadend === 'function') this.onloadend();
            }, 0);
        }
    }

    beforeEach(async () => {
        jest.resetModules();
        jest.useRealTimers();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        downloadsMock = getDownloadsMock();
        alarmsMock = getAlarmsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock._installedListeners = [];
        runtimeMock._startupListeners = [];
        runtimeMock.lastError = null;

        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        alarmsMock.clearAll();
        await storageMock.clear();

        originalFetch = global.fetch;
        originalFileReader = global.FileReader;
        global.FileReader = MockFileReader;

        global.chrome = {
            storage: { local: storageMock },
            tabs: tabsMock,
            alarms: alarmsMock,
            runtime: runtimeMock,
            downloads: downloadsMock,
            scripting: global.chrome?.scripting,
        };

        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);
    });

    afterEach(async () => {
        global.fetch = originalFetch;
        global.FileReader = originalFileReader;
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        await storageMock.clear();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('BG-43: LOG_ENTRY responde ok e persiste a entrada no translatorLog', async () => {
        const result = await dispatchToBackground(runtimeMock, {
            action: 'LOG_ENTRY',
            level: 'warn',
            source: 'popup',
            action_name: 'PLAN_LOG',
            detail: 'entrada do plano',
            extra: { id: 43 },
        });

        expect(result.keepAlive).toBe(false);
        expect(result.response).toEqual({ ok: true });

        const logs = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            return (data.translatorLog || []).find(entry => entry.action === 'PLAN_LOG');
        });

        expect(logs).toEqual(expect.objectContaining({
            level: 'warn',
            source: 'popup',
            action: 'PLAN_LOG',
            detail: 'entrada do plano',
            extra: { id: 43 },
        }));
    });

    test('BG-44: START_BATCH enfileira B/C/D/E/F sem sobrescrever A e preserva FIFO/idempotência', async () => {
        await storageMock.set({ maxConcurrentJobs: 3 });

        const liveA = await tabsMock.create({ url: 'https://gemini.google.com/app/a', active: false });
        const liveB = await tabsMock.create({ url: 'https://gemini.google.com/app/b', active: false });

        backgroundModule.__setState({
            isProcessing: true,
            currentBatchId: 'batch-a',
            completedJobs: 1,
            totalJobs: 4,
            activeJobsCount: 2,
            activeMangaTabId: 999,
            pendingBatches: [],
            jobQueue: [
                { mangaTabId: 999, index: 3, prompt: 'A', batchId: 'batch-a' },
            ],
            jobIndex: [
                { geminiTabId: liveA.id, jobId: 'job-a1', batchId: 'batch-a', mangaTabId: 999, index: 1 },
                { geminiTabId: liveB.id, jobId: 'job-a2', batchId: 'batch-a', mangaTabId: 999, index: 2 },
            ],
        });

        const before = backgroundModule.__getState();
        const batchIds = ['batch-b', 'batch-c', 'batch-d', 'batch-e', 'batch-f'];
        const responses = [];

        for (let index = 0; index < batchIds.length; index++) {
            // eslint-disable-next-line no-await-in-loop
            const result = await dispatchToBackground(runtimeMock, {
                action: 'START_BATCH',
                batchId: batchIds[index],
                images: [{ index: 0 }, { index: 1 }],
                prompt: `prompt-${batchIds[index]}`,
            }, { tab: { id: 120 + index } });
            responses.push(result.response);
        }

        responses.forEach((response, index) => {
            expect(response).toEqual(expect.objectContaining({
                ok: true,
                queued: true,
                batchId: batchIds[index],
                activeBatchId: 'batch-a',
                queuePosition: index + 1,
            }));
        });

        const after = backgroundModule.__getState();
        expect(after).toEqual(expect.objectContaining({
            isProcessing: before.isProcessing,
            currentBatchId: 'batch-a',
            completedJobs: before.completedJobs,
            totalJobs: before.totalJobs,
            activeJobsCount: before.activeJobsCount,
            activeMangaTabId: before.activeMangaTabId,
        }));
        expect(after.jobQueue).toEqual(before.jobQueue);
        expect(after.jobIndex).toEqual(before.jobIndex);
        expect(after.pendingBatches.map(batch => batch.batchId)).toEqual(batchIds);
        expect(tabsMock._tabs.size).toBe(2);

        const retryD = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            batchId: 'batch-d',
            images: [{ index: 0 }, { index: 1 }],
            prompt: 'retry não deve duplicar',
        }, { tab: { id: 122 } });

        expect(retryD.response).toEqual(expect.objectContaining({
            ok: true,
            queued: true,
            alreadyQueued: true,
            batchId: 'batch-d',
            queuePosition: 3,
            activeBatchId: 'batch-a',
        }));
        expect(backgroundModule.__getState().pendingBatches.map(batch => batch.batchId))
            .toEqual(batchIds);

        const logs = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            const entries = data.translatorLog || [];
            const queuedCount = entries.filter(entry => entry.action === 'BATCH_QUEUED').length;
            const hasDuplicate = entries.some(entry => entry.action === 'BATCH_QUEUE_DUPLICATE_IGNORED');
            return queuedCount === 5 && hasDuplicate ? entries : null;
        });
        expect(logs.filter(entry => entry.action === 'BATCH_QUEUED')).toHaveLength(5);
        expect(logs.some(entry => entry.action === 'BATCH_QUEUE_DUPLICATE_IGNORED')).toBe(true);
        expect(logs.some(entry => entry.action === 'BATCH_OVERLAP_BLOCKED')).toBe(false);
    });

    test('BG-44b: STOP_BATCH remove somente um lote pendente e mantém a ordem dos demais', async () => {
        const liveA = await tabsMock.create({ url: 'https://gemini.google.com/app/a-live', active: false });
        backgroundModule.__setState({
            isProcessing: true,
            currentBatchId: 'batch-a',
            completedJobs: 0,
            totalJobs: 1,
            activeJobsCount: 1,
            activeMangaTabId: 10,
            jobQueue: [],
            jobIndex: [
                { geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a', mangaTabId: 10, index: 0 },
            ],
            pendingBatches: [
                { batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [{ index: 0 }] },
                { batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [{ index: 0 }] },
                { batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [{ index: 0 }] },
            ],
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'STOP_BATCH',
            batchId: 'batch-c',
        });

        expect(result.response).toEqual({ ok: true });
        const state = backgroundModule.__getState();
        expect(state.currentBatchId).toBe('batch-a');
        expect(state.jobQueue).toEqual([]);
        expect(state.jobIndex).toEqual([
            expect.objectContaining({ geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a' }),
        ]);
        expect(tabsMock._tabs.has(liveA.id)).toBe(true);
        expect(state.pendingBatches.map(batch => batch.batchId))
            .toEqual(['batch-b', 'batch-d']);
        expect(state.isProcessing).toBe(true);

        const logs = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            const entries = data.translatorLog || [];
            return entries.some(entry =>
                entry.action === 'BATCH_QUEUE_CANCELLED' &&
                entry.extra?.batchId === 'batch-c'
            ) ? entries : null;
        });
        expect(logs.some(entry =>
            entry.action === 'BATCH_QUEUE_CANCELLED' &&
            entry.extra?.batchId === 'batch-c'
        )).toBe(true);
    });

    test('BG-45: START_BATCH idempotente não duplica jobs e lote ocioso respeita maxConcurrentJobs', async () => {
        // Fase 1 isola idempotência: com limite 1, o retry não pode ser
        // confundido com o scheduler abrindo legitimamente o segundo job.
        await storageMock.set({ maxConcurrentJobs: 1 });

        const existingTab = await tabsMock.create({ url: 'https://gemini.google.com/app/existing', active: false });

        backgroundModule.__setState({
            isProcessing: true,
            currentBatchId: 'batch-idempotente',
            completedJobs: 0,
            totalJobs: 2,
            activeJobsCount: 1,
            activeMangaTabId: 123,
            jobQueue: [
                { mangaTabId: 123, index: 1, prompt: 'mesmo', batchId: 'batch-idempotente' },
            ],
            jobIndex: [
                { geminiTabId: existingTab.id, jobId: 'job-existing', batchId: 'batch-idempotente', mangaTabId: 123, index: 0 },
            ],
        });

        const retry = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            batchId: 'batch-idempotente',
            images: [{ index: 0 }, { index: 1 }],
            prompt: 'mesmo',
        }, { tab: { id: 123 } });

        expect(retry.response).toEqual(expect.objectContaining({
            ok: true,
            batchId: 'batch-idempotente',
            alreadyStarted: true,
        }));
        expect(backgroundModule.__getState().jobQueue).toHaveLength(1);
        expect(backgroundModule.__getState().jobIndex).toHaveLength(1);
        expect(tabsMock._tabs.size).toBe(1);
        await new Promise(resolve => tabsMock.remove(existingTab.id, resolve));

        // Fase 2 testa separadamente o preenchimento do limite de concorrência.
        await storageMock.set({ maxConcurrentJobs: 3 });
        backgroundModule.__setState({
            isProcessing: false,
            currentBatchId: null,
            completedJobs: 0,
            totalJobs: 0,
            activeJobsCount: 0,
            activeMangaTabId: null,
            jobQueue: [],
            jobIndex: [],
            completionClaimedBatchId: null,
        });

        const start = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            batchId: 'batch-novo',
            images: Array.from({ length: 5 }, (_unused, index) => ({ index })),
            prompt: 'prompt novo',
        }, { tab: { id: 123 } });

        expect(start.response).toEqual(expect.objectContaining({
            ok: true,
            batchId: 'batch-novo',
        }));

        await waitFor(() => tabsMock._tabs.size === 3);
        const state = backgroundModule.__getState();
        expect(state.currentBatchId).toBe('batch-novo');
        expect(state.activeMangaTabId).toBe(123);
        expect(state.totalJobs).toBe(5);
        expect(state.completedJobs).toBe(0);
        expect(state.activeJobsCount).toBe(3);
        expect(state.jobQueue).toEqual([
            { mangaTabId: 123, index: 3, prompt: 'prompt novo', batchId: 'batch-novo' },
            { mangaTabId: 123, index: 4, prompt: 'prompt novo', batchId: 'batch-novo' },
        ]);

        // Não deixe jobs assíncronos deste teste vazarem para o próximo caso.
        const stop = await dispatchToBackground(runtimeMock, {
            action: 'STOP_BATCH',
            batchId: 'batch-novo',
        });
        expect(stop.response).toEqual({ ok: true });
        await flush(8);
        expect(backgroundModule.__getState().jobIndex).toEqual([]);
    });

    test('BG-46: STOP_BATCH remove abas Gemini, watchdogs, jobs e extractionTabs', async () => {
        const geminiA = await tabsMock.create({ url: 'https://gemini.google.com/app/a', active: false });
        const geminiB = await tabsMock.create({ url: 'https://gemini.google.com/app/b', active: false });
        const extractionTab = await tabsMock.create({ url: 'https://cdn.test/result.png', active: false });

        await storageMock.set({
            [`gemini_job_${geminiA.id}`]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },
            [`gemini_job_${geminiB.id}`]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },
            [`wd_data_${geminiA.id}`]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a' },
            [`wd_data_${geminiB.id}`]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b' },
        });
        alarmsMock.create('watchdog_job-a', { delayInMinutes: 4 });
        alarmsMock.create('watchdog_job-b', { delayInMinutes: 4 });
        backgroundModule.__setState({
            isProcessing: true,
            activeJobsCount: 2,
            activeMangaTabId: 10,
            extractionTabs: {
                [extractionTab.id]: { mangaTabId: 10, index: 9, geminiTabId: geminiA.id, batchId: 'batch-stop' },
            },
        });
        global.MangaTranslatorState.patch({
            currentBatchId: 'batch-stop',
            jobIndex: [
                { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },
                { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },
            ],
        });

        const result = await dispatchToBackground(runtimeMock, { action: 'STOP_BATCH', batchId: 'batch-stop' });
        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });

        const storage = await storageMock.get(null);
        const state = backgroundModule.__getState();

        expect(tabsMock._tabs.has(geminiA.id)).toBe(false);
        expect(tabsMock._tabs.has(geminiB.id)).toBe(false);
        expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);
        expect(Object.keys(storage).some(key => key.startsWith('gemini_job_'))).toBe(false);
        expect(Object.keys(storage).some(key => key.startsWith('wd_data_'))).toBe(false);
        expect((await alarmsMock.getAll())).toHaveLength(0);
        expect(state.extractionTabs).toEqual({});
        expect(state.activeJobsCount).toBe(0);
        expect(state.isProcessing).toBe(false);
    });

    test('BG-51/BG-53/BG-54: GEMINI_RESULT_URL registra extraction tab e CHECK_IF_EXTRACTION_TAB distingue hit/miss', async () => {
        const geminiTab = await tabsMock.create({ url: 'https://gemini.google.com/app/chat', active: false });

        await storageMock.set({
            [`gemini_job_${geminiTab.id}`]: {
                geminiTabId: geminiTab.id,
                mangaTabId: 22,
                index: 4,
                jobId: 'job-result-url',
            },
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 22,
            index: 4,
            url: 'https://lh3.googleusercontent.com/generated.png',
            jobId: 'job-result-url',
        }, { tab: { id: geminiTab.id, url: 'https://gemini.google.com/app/chat' } });

        expect(result.response).toEqual({ ok: true, extractionRegistered: true });

        const extractionTab = await waitFor(() =>
            Array.from(tabsMock._tabs.values()).find(tab =>
                tab.url === 'https://lh3.googleusercontent.com/generated.png#manga-translator-extraction'
                && backgroundModule.__getState().extractionTabs[tab.id]
            )
        );

        const hit = await dispatchToBackground(runtimeMock, {
            action: 'CHECK_IF_EXTRACTION_TAB',
        }, { tab: { id: extractionTab.id } });

        const miss = await dispatchToBackground(runtimeMock, {
            action: 'CHECK_IF_EXTRACTION_TAB',
        }, { tab: { id: 987654 } });

        expect(hit.response).toEqual(expect.objectContaining({
            isExtractionTab: true,
            mangaTabId: 22,
            index: 4,
            geminiTabId: geminiTab.id,
            jobId: 'job-result-url',
        }));
        expect(miss.response).toEqual({ isExtractionTab: false });
        expect(backgroundModule.__getState().extractionTabs[extractionTab.id]).toEqual(expect.objectContaining({
            mangaTabId: 22,
            index: 4,
            geminiTabId: geminiTab.id,
            jobId: 'job-result-url',
        }));
    });

    test('BG-57/BG-58: FETCH_IMAGE_AS_BASE64 converte blob em dataURL e responde erro em falha de fetch', async () => {
        global.fetch = jest.fn();
        global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'image/png' },
            blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
        });
        runtimeMock._messageListeners = [];
        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flush(4);

        const contentSender = { tab: { id: 222, url: 'https://manga.test/chapter' } };
        const success = await dispatchToBackground(runtimeMock, {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.test/page.png',
        }, contentSender);

        expect(success.keepAlive).toBe(true);
        expect(success.response).toEqual({
            dataUrl: 'data:image/png;base64,UkVBRA==',
        });
        expect(global.fetch).toHaveBeenCalledWith('https://cdn.test/page.png', expect.objectContaining({
            credentials: 'omit',
            cache: 'no-store',
            signal: expect.any(Object),
        }));

        global.fetch.mockRejectedValueOnce(new Error('HTTP 404'));
        const failure = await dispatchToBackground(runtimeMock, {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.test/missing.png',
        }, contentSender);

        expect(failure.keepAlive).toBe(true);
        expect(failure.response).toEqual({ error: 'HTTP 404' });
    });

    test('BG-37/BG-62: SHOW_EXISTING_FOLDER com anchorId valido chama downloads.show sem novo download', async () => {
        downloadsMock._downloads.set(707, {
            id: 707,
            url: 'data:image/png;base64,ANCHOR',
            filename: 'C:/Downloads/MangaTranslator/Capitulo/_anchor.png',
            state: 'complete',
            exists: true,
        });

        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();
        const downloadSpy = jest.spyOn(downloadsMock, 'download');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'C:/Downloads/MangaTranslator/Capitulo',
            safeTitle: 'Capitulo',
            anchorId: 707,
        });

        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });
        expect(showSpy).toHaveBeenCalledWith(707);
        expect(downloadSpy).not.toHaveBeenCalled();
    });

    test('BG-65: EXPORT_ALL_AND_SHOW com lista vazia responde imediatamente sem downloads', async () => {
        const downloadSpy = jest.spyOn(downloadsMock, 'download');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'EXPORT_ALL_AND_SHOW',
            allDownloads: [],
        });

        expect(result.response).toEqual({ ok: true });
        expect(downloadSpy).not.toHaveBeenCalled();
    });

    test('BG-66/BG-67: SET_DEBUG_MODE salva storage e envia DEBUG_MODE_CHANGED para todas as abas', async () => {
        const tabA = await tabsMock.create({ url: 'https://manga.test/a', active: true });
        const tabB = await tabsMock.create({ url: 'https://manga.test/b', active: false });
        const messagesA = [];
        const messagesB = [];

        tabsMock._registerMessageHandler(tabA.id, (message, _sender, sendResponse) => {
            messagesA.push(message);
            sendResponse({ ok: true });
        });
        tabsMock._registerMessageHandler(tabB.id, (message, _sender, sendResponse) => {
            messagesB.push(message);
            sendResponse({ ok: true });
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'SET_DEBUG_MODE',
            debugOn: true,
        });

        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });

        const data = await storageMock.get(['debugMode']);
        expect(data.debugMode).toBe(true);
        expect(messagesA).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
        expect(messagesB).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
    });
});

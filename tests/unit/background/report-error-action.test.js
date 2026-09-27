const path = require('path');
const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/report-error.js');

function loadRouter() {
    global.self = global;
    global.chrome = {
        runtime: { id: 'test-extension-id', lastError: null },
        tabs: { sendMessage: jest.fn((_id, _message, callback) => callback?.()) },
    };
    delete global.MangaTranslatorRouter;
    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });
    return global.MangaTranslatorRouter;
}

function dispatch(listener, request, sender) {
    return new Promise(resolve => {
        let keepAlive;
        keepAlive = listener(request, sender, response => resolve({ keepAlive, response }));
    });
}

describe('background/actions/report-error.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('encaminha e finaliza erro do job persistido mesmo se currentBatchId mudou', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn().mockResolvedValue(true);
        const job = {
            jobId: 'job-4',
            batchId: 'batch-1',
            mangaTabId: 31,
            index: 4,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: { currentBatchId: 'batch-novo' },
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    finalizeJob,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                    storage: { get: jest.fn().mockResolvedValue({ debugMode: true }) },
                }),
            }),
            {
                action: 'GEMINI_ERROR',
                mangaTabId: 31,
                index: 4,
                error: 'Falhou',
                jobId: 'job-4',
                batchId: 'batch-1',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
            31,
            expect.objectContaining({
                action: 'SHOW_ERROR_INTEGRATED',
                isDebug: true,
                jobId: 'job-4',
                batchId: 'batch-1',
            }),
            expect.any(Function)
        );
        expect(finalizeJob).toHaveBeenCalledWith(17, 31, true);
        expect(result.response).toEqual({ ok: true });
    });

    test('rejeita erro cuja identidade diverge do job persistido', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();
        const job = {
            jobId: 'job-4',
            batchId: 'batch-real',
            mangaTabId: 31,
            index: 4,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    finalizeJob,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                    storage: { get: jest.fn() },
                }),
            }),
            {
                action: 'GEMINI_ERROR',
                mangaTabId: 31,
                index: 4,
                error: 'Falhou',
                jobId: 'job-4',
                batchId: 'batch-forjado',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('não notifica nem finaliza quando ownership falha', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    finalizeJob,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 18, null),
                    storage: { get: jest.fn() },
                }),
            }),
            {
                action: 'GEMINI_ERROR',
                mangaTabId: 31,
                index: 4,
                error: 'Falhou',
                jobId: 'job-4',
            },
            { tab: { id: 18, url: 'https://gemini.google.com/app' } }
        );

        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });
    });

    test.each([
        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: 'Falhou' }, 'jobId é obrigatório'],
        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: '   ', jobId: 'job-4' }, 'erro inválido'],
        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: 'x'.repeat(4097), jobId: 'job-4' }, 'erro inválido'],
    ])('rejeita payload inválido antes de reidratar ou finalizar', async (request, message) => {
        const router = loadRouter();
        const ensureInitialized = jest.fn();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized,
                    finalizeJob,
                    assertJobOwnership: jest.fn(),
                    storage: { get: jest.fn() },
                }),
            }),
            request,
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(ensureInitialized).not.toHaveBeenCalled();
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
        expect(result.response).toEqual({
            ok: false,
            error: { code: 'INVALID_PAYLOAD', message },
        });
    });
});

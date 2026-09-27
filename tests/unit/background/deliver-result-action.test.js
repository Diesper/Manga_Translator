const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/deliver-result.js');

function loadRouter() {
    global.self = global;
    global.chrome = { runtime: { id: 'test-extension-id' } };
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

describe('background/actions/deliver-result.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('faz staging somente depois de validar ownership e identidade persistida', async () => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn().mockResolvedValue({
            ok: true,
            persisted: true,
            domApplied: true,
        });
        const ensureInitialized = jest.fn().mockResolvedValue();

        const job = {
            jobId: 'job-4',
            batchId: 'batch-1',
            mangaTabId: 31,
            index: 4,
            geminiTabId: 17,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: { currentBatchId: 'outro-batch' },
                    ensureInitialized,
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 4,
                src: 'data:image/png;base64,AA',
                jobId: 'job-4',
                batchId: 'batch-1',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(ensureInitialized).toHaveBeenCalledTimes(1);
        expect(deliverResultToManga).toHaveBeenCalledWith(expect.objectContaining({
            mangaTabId: 31,
            index: 4,
            geminiTabId: 17,
            jobId: 'job-4',
            batchId: 'batch-1',
            finalizeOnAck: false,
        }));
        expect(result).toEqual({
            keepAlive: true,
            response: { ok: true, staged: true, persisted: true },
        });
    });

    test('currentBatchId diferente não invalida job real ainda persistido', async () => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn().mockResolvedValue({ ok: true, persisted: true });
        const job = {
            jobId: 'job-antigo',
            batchId: 'batch-antigo',
            mangaTabId: 31,
            index: 9,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: { currentBatchId: 'batch-novo' },
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 9,
                src: 'data:image/png;base64,AA',
                jobId: 'job-antigo',
                batchId: 'batch-antigo',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: true, staged: true, persisted: true });
        expect(deliverResultToManga).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['batch', { batchId: 'batch-forjado' }],
        ['index', { index: 999 }],
        ['mangaTabId', { mangaTabId: 999 }],
    ])('rejeita identidade forjada no campo %s', async (_field, patch) => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn();
        const log = jest.fn();
        const job = {
            jobId: 'job-4',
            batchId: 'batch-real',
            mangaTabId: 31,
            index: 4,
        };

        const request = {
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: 31,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-real',
            ...patch,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log,
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            request,
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });
        expect(deliverResultToManga).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            'error',
            'bg',
            'RESULT_JOB_IDENTITY_MISMATCH',
            expect.any(String),
            expect.any(Object)
        );
    });

    test.each([
        { ok: false, reason: 'persist_failed' },
        { ok: true, persisted: false, reason: 'persist_failed' },
        null,
    ])('não marca staging quando ACK/persistência falha (%p)', async staged => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn().mockResolvedValue(staged);
        const job = {
            jobId: 'job-4',
            batchId: 'batch-1',
            mangaTabId: 31,
            index: 4,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 4,
                src: 'data:image/png;base64,AA',
                jobId: 'job-4',
                batchId: 'batch-1',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response.ok).toBe(false);
    });

    test('não entrega job de outro remetente', async () => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 17, null),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 4,
                src: 'data:image/png;base64,AA',
                jobId: 'job-de-outra-aba',
                batchId: 'batch-antigo',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });
        expect(deliverResultToManga).not.toHaveBeenCalled();
    });

    test.each([
        [{ action: 'GEMINI_IMAGE_EXTRACTED', mangaTabId: 31, jobId: 'job-4' }, 'src da imagem é obrigatório'],
        [{ action: 'GEMINI_IMAGE_EXTRACTED', mangaTabId: 31, src: 'data:image/png;base64,AA' }, 'jobId é obrigatório'],
    ])('rejeita payload inválido antes de executar efeitos', async (request, message) => {
        const router = loadRouter();
        const result = await dispatch(
            router.createMessageRouter({}),
            request,
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result).toEqual({
            keepAlive: undefined,
            response: { ok: false, error: { code: 'INVALID_PAYLOAD', message } },
        });
    });
});

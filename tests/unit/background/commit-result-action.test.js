const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/commit-result.js');

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

describe('background/actions/commit-result.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('finaliza somente job com persistência já confirmada', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn().mockResolvedValue(true);
        const updateJobState = jest.fn().mockResolvedValue({});
        const job = {
            jobId: 'job-1',
            batchId: 'batch-1',
            mangaTabId: 77,
            index: 2,
            state: 'dom_applied',
            resultPersisted: true,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 321, job),
                    updateJobState,
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                mangaTabId: 77,
                index: 2,
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 321, url: 'https://gemini.google.com/app/chat' } }
        );

        expect(updateJobState).toHaveBeenCalledWith(321, expect.objectContaining({
            state: 'result_committed',
        }));
        expect(finalizeJob).toHaveBeenCalledWith(321, 77, false);
        expect(result.response).toEqual({ ok: true, committed: true });
    });

    test.each([
        [{ resultPersisted: false, state: 'result_received' }, 'result_not_persisted'],
        [{ resultPersisted: undefined, state: 'opening' }, 'result_not_persisted'],
    ])('recusa commit prematuro %#', async (jobPatch, expectedReason) => {
        const router = loadRouter();
        const finalizeJob = jest.fn();
        const updateJobState = jest.fn();
        const job = {
            jobId: 'job-1',
            batchId: 'batch-1',
            mangaTabId: 77,
            index: 2,
            ...jobPatch,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 321, job),
                    updateJobState,
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({ ok: false, reason: expectedReason });
        expect(updateJobState).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('recusa batch forjado mesmo com jobId correto', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();
        const job = {
            jobId: 'job-1',
            batchId: 'batch-real',
            mangaTabId: 77,
            resultPersisted: true,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 321, job),
                    updateJobState: jest.fn(),
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-forjado',
            },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('recusa commit de remetente que não possui o job', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 999, null),
                    updateJobState: jest.fn(),
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 999 } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_not_live' });
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('validação exige jobId', async () => {
        const router = loadRouter();
        const result = await dispatch(
            router.createMessageRouter({}),
            { action: 'GEMINI_RESULT_COMMIT' },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({
            ok: false,
            error: { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' },
        });
    });

    test('retry após commit já finalizado é reconhecido pelo journal durável', async () => {
        const router = loadRouter();
        const now = Date.now();
        const log = jest.fn();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 321, null),
                    updateJobState: jest.fn(),
                    finalizeJob,
                    log,
                    storage: {
                        get: jest.fn().mockResolvedValue({
                            gemini_finalized_321: {
                                jobId: 'job-1',
                                fromError: false,
                                expiresAt: now + 60_000,
                            },
                        }),
                    },
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({
            ok: true,
            committed: true,
            alreadyCommitted: true,
        });
        expect(finalizeJob).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            'info',
            'bg',
            'RESULT_COMMIT_ALREADY_FINALIZED',
            expect.any(String),
            expect.any(Object)
        );
    });

});

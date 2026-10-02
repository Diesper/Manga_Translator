'use strict';

const {
    createGtcRuntimeHandler,
    createInMemoryRepository,
} = require('../../../extension/shared/gtc-indexeddb.js');
const {
    getRuntimeMock,
    getStorageMock,
} = require('../../mocks/chrome-api.mock.js');

function invoke(handler, request) {
    return new Promise((resolve) => {
        const keepAlive = handler(request, {}, resolve);
        if (keepAlive !== true) resolve(undefined);
    });
}

describe('GTC legacy fallback coordination', () => {
    let runtime;
    let storage;
    let logger;

    beforeEach(async () => {
        runtime = getRuntimeMock();
        storage = getStorageMock();
        runtime.lastError = null;
        await storage.clear();
        logger = jest.fn();
    });

    test('merges legacy hits per hash and lets only a newer marked fallback override a modern hit', async () => {
        let timestamp = 100;
        const repository = createInMemoryRepository(() => timestamp);
        await repository.put({ hash: 'modern', translatedDataUrl: 'modern-stale' });
        await storage.set({
            gtc_modern: 'fallback-new',
            gtc_meta_modern: { schemaVersion: 1, updatedAt: 200 },
            gtc_miss: 'legacy-history',
        });
        const handler = createGtcRuntimeHandler({ repository, logger });

        const response = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['modern', 'miss'] });

        expect(response).toEqual(expect.objectContaining({
            ok: true,
            entriesByHash: { modern: 'fallback-new', miss: 'legacy-history' },
        }));
        expect(await storage.get('gtc_modern')).toEqual({ gtc_modern: 'fallback-new' });
        timestamp = 300;
    });

    test('keeps modern hit over an old marked fallback and historical unmarked value', async () => {
        const repository = createInMemoryRepository(() => 300);
        await repository.put({ hash: 'modern', translatedDataUrl: 'modern-current' });
        await storage.set({
            gtc_modern: 'fallback-old',
            gtc_meta_modern: { schemaVersion: 1, updatedAt: 200 },
            gtc_raw: 'legacy-raw',
        });
        const handler = createGtcRuntimeHandler({ repository, logger });

        const response = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['modern', 'raw'] });

        expect(response.entriesByHash).toEqual({ modern: 'modern-current', raw: 'legacy-raw' });
    });

    test('normalizes lookup keys but preserves the caller hash in the response', async () => {
        const repository = createInMemoryRepository();
        await repository.put({ hash: 'abc123', translatedDataUrl: 'modern' });
        const handler = createGtcRuntimeHandler({ repository, logger });

        const response = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['ABC123'] });

        expect(response.entriesByHash).toEqual({ ABC123: 'modern' });
    });

    test('serializes independent save callers so an older failed save cannot revive after a newer success', async () => {
        const repository = createInMemoryRepository();
        const put = repository.put.bind(repository);
        let releaseOld;
        const oldPutStarted = new Promise(resolve => { releaseOld = resolve; });
        repository.put = async entry => {
            if (entry.translatedDataUrl === 'old-payload') {
                await oldPutStarted;
                throw new Error('old save failed late');
            }
            return put(entry);
        };
        const handler = createGtcRuntimeHandler({ repository, logger });

        const older = invoke(handler, { action: 'GTC_SAVE', hash: 'race', translatedDataUrl: 'old-payload' });
        await Promise.resolve();
        const newer = invoke(handler, { action: 'GTC_SAVE', hash: 'race', translatedDataUrl: 'new-payload' });
        releaseOld();
        const [oldResponse, newResponse] = await Promise.all([older, newer]);

        expect(oldResponse).toEqual(expect.objectContaining({ ok: false }));
        expect(newResponse).toEqual(expect.objectContaining({ ok: true }));
        expect(await storage.get(['gtc_race', 'gtc_meta_race'])).toEqual({ gtc_race: undefined, gtc_meta_race: undefined });
        const finalQuery = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['race'] });
        expect(finalQuery.entriesByHash).toEqual({ race: 'new-payload' });
    });

    test('rejects an older save message that reaches the background after a newer modern commit', async () => {
        const repository = createInMemoryRepository(() => 200);
        await repository.put({ hash: 'race-late', translatedDataUrl: 'new-payload', updatedAt: 200 });
        const put = jest.spyOn(repository, 'put');
        const handler = createGtcRuntimeHandler({ repository, logger });

        const delayedOldResponse = await invoke(handler, {
            action: 'GTC_SAVE',
            hash: 'race-late',
            translatedDataUrl: 'old-payload',
            operationAt: 100,
        });
        const finalQuery = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['race-late'] });

        expect(delayedOldResponse).toEqual(expect.objectContaining({ ok: true, superseded: true }));
        expect(put).not.toHaveBeenCalled();
        expect(finalQuery.entriesByHash).toEqual({ 'race-late': 'new-payload' });
        expect(await storage.get(['gtc_race-late', 'gtc_meta_race-late'])).toEqual({
            'gtc_race-late': undefined,
            'gtc_meta_race-late': undefined,
        });
    });

    test('rejects malformed saves without creating an empty legacy key', async () => {
        const repository = createInMemoryRepository();
        const handler = createGtcRuntimeHandler({ repository, logger });

        const response = await invoke(handler, { action: 'GTC_SAVE', hash: '  ', translatedDataUrl: '' });

        expect(response).toEqual(expect.objectContaining({ ok: true, saved: false }));
        expect(await storage.get(null)).toEqual({});
        expect(await repository.getManyEntries([''])).toEqual({});
    });

    test('reports cleanup lastError and does not let an unmarked stale fallback beat modern data', async () => {
        const repository = createInMemoryRepository(() => 400);
        const originalRemove = storage.remove.bind(storage);
        storage.remove = (_keys, callback) => {
            runtime.lastError = { message: 'quota cleanup failure' };
            callback();
            runtime.lastError = null;
        };
        await storage.set({ gtc_hash: 'stale-legacy' });
        const handler = createGtcRuntimeHandler({ repository, logger });

        const saved = await invoke(handler, { action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'modern' });
        storage.remove = originalRemove;
        const queried = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });

        expect(saved).toEqual(expect.objectContaining({ ok: true, legacyCleanupError: 'quota cleanup failure' }));
        expect(logger).toHaveBeenCalledWith('warn', 'GTC_LEGACY_CLEANUP_FAILED', expect.any(String), expect.any(Object));
        expect(queried.entriesByHash).toEqual({ hash: 'modern' });
    });

    test('keeps modern results usable and reports lastError from legacy reads', async () => {
        const repository = createInMemoryRepository();
        await repository.put({ hash: 'present', translatedDataUrl: 'modern' });
        const originalGet = storage.get.bind(storage);
        storage.get = (_keys, callback) => {
            runtime.lastError = { message: 'storage read failed' };
            callback({});
            runtime.lastError = null;
        };
        const handler = createGtcRuntimeHandler({ repository, logger });

        const response = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['present'] });
        storage.get = originalGet;

        expect(response).toEqual(expect.objectContaining({ ok: true, fallbackReadError: true, entriesByHash: { present: 'modern' } }));
        expect(logger).toHaveBeenCalledWith('warn', 'GTC_LEGACY_READ_FAILED', expect.any(String), expect.any(Object));
    });
});

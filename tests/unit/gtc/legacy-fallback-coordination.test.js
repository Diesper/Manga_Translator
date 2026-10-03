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

    test.each([
        { schemaVersion: 2, translatedDataUrl: 'unsupported', updatedAt: 200 },
        { schemaVersion: 1, translatedDataUrl: 123, updatedAt: 200 },
        { schemaVersion: 1, translatedDataUrl: '', updatedAt: 200 },
    ])('malformed structured fallback %# cannot hide a modern hit or create an empty hit', async (payload) => {
        const repository = createInMemoryRepository(() => 50);
        await repository.put({ hash: 'present', translatedDataUrl: 'modern' });
        await storage.set({ gtc_present: payload, gtc_missing: payload });
        const handler = createGtcRuntimeHandler({ repository, logger });
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['present', 'missing'] });

        expect(query.entriesByHash).toEqual({ present: 'modern' });
    });

    test('valid structured legacy payload remains recoverable and outranks older modern data', async () => {
        const repository = createInMemoryRepository(() => 50);
        await repository.put({ hash: 'present', translatedDataUrl: 'modern-stale' });
        const payload = { schemaVersion: 1, translatedDataUrl: 'legacy-current', updatedAt: 200 };
        await storage.set({ gtc_present: payload, gtc_missing: payload });
        const handler = createGtcRuntimeHandler({ repository, logger });
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['present', 'missing'] });

        expect(query.entriesByHash).toEqual({ present: 'legacy-current', missing: 'legacy-current' });
    });

    test('repository saved:false is observable and the current payload is retained as legacy fallback', async () => {
        const repository = createInMemoryRepository();
        repository.put = jest.fn().mockResolvedValue({ saved: false });
        const handler = createGtcRuntimeHandler({ repository, logger });
        const saved = await invoke(handler, {
            action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'fallback', operationAt: 100,
        });
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });

        expect(saved).toEqual(expect.objectContaining({ ok: false, error: 'GTC repository rejected the save' }));
        expect(query.entriesByHash).toEqual({ hash: 'fallback' });
        expect(logger).toHaveBeenCalledWith('warn', 'GTC_SAVE_FALLBACK_USED', expect.any(String), expect.any(Object));
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

    test('serializes bulk saves with single saves so an older pending write cannot overwrite the batch', async () => {
        const repository = createInMemoryRepository();
        const put = repository.put.bind(repository);
        let releaseOld;
        const oldPutStarted = new Promise(resolve => { releaseOld = resolve; });
        repository.put = async entry => {
            if (entry.translatedDataUrl === 'old-single-payload') {
                await oldPutStarted;
            }
            return put(entry);
        };
        const handler = createGtcRuntimeHandler({ repository, logger });

        const oldSingleSave = invoke(handler, {
            action: 'GTC_SAVE',
            hash: 'bulk-race',
            translatedDataUrl: 'old-single-payload',
            operationAt: 100,
        });
        await Promise.resolve();
        const newerBulkSave = invoke(handler, {
            action: 'GTC_SAVE_MANY',
            entries: [{ hash: 'bulk-race', translatedDataUrl: 'new-bulk-payload' }],
        });

        releaseOld();
        await Promise.all([oldSingleSave, newerBulkSave]);
        const finalQuery = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['bulk-race'] });

        expect(finalQuery.entriesByHash).toEqual({ 'bulk-race': 'new-bulk-payload' });
    });

    test('bulk save clears marked fallback for every successfully persisted hash', async () => {
        const repository = createInMemoryRepository(() => 100);
        await storage.set({
            gtc_bulk: 'stale-fallback',
            gtc_meta_bulk: { schemaVersion: 1, updatedAt: 500 },
        });
        const handler = createGtcRuntimeHandler({ repository, logger });

        const saved = await invoke(handler, {
            action: 'GTC_SAVE_MANY',
            entries: [{ hash: 'bulk', translatedDataUrl: 'new-bulk-payload' }],
        });
        const queried = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['bulk'] });

        expect(saved).toEqual(expect.objectContaining({ ok: true }));
        expect(queried.entriesByHash).toEqual({ bulk: 'new-bulk-payload' });
        expect(await storage.get(['gtc_bulk', 'gtc_meta_bulk'])).toEqual({
            gtc_bulk: undefined,
            gtc_meta_bulk: undefined,
        });
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

    test('does not let an older delayed save replace a newer legacy fallback after modern persistence fails', async () => {
        const repository = createInMemoryRepository();
        const put = repository.put.bind(repository);
        repository.put = async entry => {
            if (entry.translatedDataUrl === 'newer-fallback') throw new Error('modern persistence unavailable');
            return put(entry);
        };
        const handler = createGtcRuntimeHandler({ repository, logger });

        const newer = await invoke(handler, {
            action: 'GTC_SAVE',
            hash: 'fallback-race',
            translatedDataUrl: 'newer-fallback',
            operationAt: 200,
        });
        const older = await invoke(handler, {
            action: 'GTC_SAVE',
            hash: 'fallback-race',
            translatedDataUrl: 'older-delayed-save',
            operationAt: 100,
        });

        expect(newer).toEqual(expect.objectContaining({ ok: false }));
        expect(older).toEqual(expect.objectContaining({ ok: true, superseded: true }));
        expect(await storage.get(['gtc_fallback-race', 'gtc_meta_fallback-race'])).toEqual({
            'gtc_fallback-race': 'newer-fallback',
            'gtc_meta_fallback-race': expect.objectContaining({ schemaVersion: 1, updatedAt: 200 }),
        });
        const finalQuery = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['fallback-race'] });
        expect(finalQuery.entriesByHash).toEqual({ 'fallback-race': 'newer-fallback' });
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

        const response = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['PRESENT'] });
        storage.get = originalGet;

        expect(response).toEqual(expect.objectContaining({ ok: true, fallbackReadError: true, entriesByHash: { PRESENT: 'modern' } }));
        expect(logger).toHaveBeenCalledWith('warn', 'GTC_LEGACY_READ_FAILED', expect.any(String), expect.any(Object));
    });

    test('failed precedence read cannot replace a newer fallback with an older successful modern save', async () => {
        const repository = createInMemoryRepository(() => 50);
        await repository.put({ hash: 'hash', translatedDataUrl: 'modern-stale' });
        await storage.set({
            gtc_hash: 'newer-fallback',
            gtc_meta_hash: { schemaVersion: 1, updatedAt: 200 },
        });
        const put = jest.spyOn(repository, 'put');
        const originalGet = storage.get;
        storage.get = (_keys, callback) => {
            runtime.lastError = { message: 'precedence read failed' };
            callback({});
            runtime.lastError = null;
        };
        const handler = createGtcRuntimeHandler({ repository, logger });
        const saved = await invoke(handler, {
            action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'older-delayed', operationAt: 100,
        });
        storage.get = originalGet;
        const finalQuery = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });

        expect(saved).toEqual(expect.objectContaining({ ok: false, error: 'precedence read failed' }));
        expect(put).not.toHaveBeenCalled();
        expect(finalQuery.entriesByHash).toEqual({ hash: 'newer-fallback' });
        expect(await repository.getManyEntries(['hash']))
            .toEqual({ hash: expect.objectContaining({ translatedDataUrl: 'modern-stale' }) });
    });

    test.each([
        ['missing get API', undefined, 'storage.local.get unavailable'],
        ['unavailable callback data', (_keys, callback) => callback(undefined), 'storage.local.get returned unavailable data'],
    ])('%s reports read failure and preserves cache state during a save', async (_label, get, error) => {
        const repository = createInMemoryRepository(() => 50);
        await repository.put({ hash: 'hash', translatedDataUrl: 'modern' });
        await storage.set({ gtc_hash: 'newer', gtc_meta_hash: { schemaVersion: 1, updatedAt: 200 } });
        const put = jest.spyOn(repository, 'put');
        const originalGet = storage.get;
        storage.get = get;
        const handler = createGtcRuntimeHandler({ repository, logger });
        const saved = await invoke(handler, {
            action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'older', operationAt: 100,
        });
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['HASH'] });
        storage.get = originalGet;

        expect(saved).toEqual(expect.objectContaining({ ok: false, error }));
        expect(put).not.toHaveBeenCalled();
        expect(query).toEqual(expect.objectContaining({
            ok: true, fallbackReadError: true, entriesByHash: { HASH: 'modern' },
        }));
        expect((await storage.get('gtc_hash')).gtc_hash).toBe('newer');
    });

    test('reports simultaneous modern and legacy read failure without poisoning the operation queue', async () => {
        const repository = createInMemoryRepository();
        const getModern = jest.spyOn(repository, 'getManyEntries').mockRejectedValue(new Error('modern read failed'));
        const originalGet = storage.get;
        storage.get = (_keys, callback) => {
            runtime.lastError = { message: 'legacy read failed' };
            callback({});
            runtime.lastError = null;
        };
        const handler = createGtcRuntimeHandler({ repository, logger });
        const failed = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });
        storage.get = originalGet;
        getModern.mockRestore();
        const retry = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });

        expect(failed).toEqual(expect.objectContaining({ ok: false, error: 'modern read failed' }));
        expect(logger).toHaveBeenCalledWith('warn', 'GTC_LEGACY_READ_FAILED', expect.any(String),
            expect.objectContaining({ error: 'legacy read failed' }));
        expect(retry).toEqual(expect.objectContaining({ ok: true, entriesByHash: {} }));
    });

    test('reports modern save and legacy write failures without losing the existing fallback', async () => {
        const repository = createInMemoryRepository();
        repository.put = jest.fn().mockRejectedValue(new Error('modern save failed'));
        await storage.set({ gtc_hash: 'existing' });
        const originalSet = storage.set;
        storage.set = (_values, callback) => {
            runtime.lastError = { message: 'legacy write failed' };
            callback();
            runtime.lastError = null;
        };
        const handler = createGtcRuntimeHandler({ repository, logger });
        const saved = await invoke(handler, {
            action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'unsaved', operationAt: 100,
        });
        storage.set = originalSet;
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });

        expect(saved).toEqual(expect.objectContaining({
            ok: false, error: 'modern save failed; fallback: legacy write failed',
        }));
        expect(logger).toHaveBeenCalledWith('error', 'GTC_SAVE_FALLBACK_FAILED', expect.any(String),
            expect.objectContaining({ error: 'legacy write failed' }));
        expect(query.entriesByHash).toEqual({ hash: 'existing' });
    });

    test('failed cleanup durably invalidates stale fallback before a later modern read failure', async () => {
        const repository = createInMemoryRepository(() => 400);
        await storage.set({ gtc_hash: 'stale-legacy' });
        const originalRemove = storage.remove.bind(storage);
        storage.remove = (_keys, callback) => {
            runtime.lastError = { message: 'cleanup failed' };
            callback();
            runtime.lastError = null;
        };
        const handler = createGtcRuntimeHandler({ repository, logger });
        const saved = await invoke(handler, {
            action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'current', operationAt: 400,
        });
        storage.remove = originalRemove;
        repository.getManyEntries = jest.fn().mockRejectedValue(new Error('modern unavailable'));
        const restarted = createGtcRuntimeHandler({ repository, logger });
        const query = await invoke(restarted, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });

        expect(saved).toEqual(expect.objectContaining({ ok: true, legacyCleanupError: 'cleanup failed' }));
        expect(query).toEqual(expect.objectContaining({ ok: false, error: 'modern unavailable' }));
        expect(query.entriesByHash).toBeUndefined();
        const oldSave = await invoke(restarted, {
            action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'older', operationAt: 100,
        });
        expect(oldSave).toEqual(expect.objectContaining({ ok: true, superseded: true }));
        expect((await storage.get('gtc_hash')).gtc_hash).toBe('stale-legacy');
    });

    test('clears legacy fallback payloads and metadata together with the modern cache', async () => {
        await storage.set({
            gtc_legacy: 'legacy-value',
            gtc_meta_legacy: { schemaVersion: 1, updatedAt: 100 },
            unrelated_setting: 'preserved',
        });
        const repository = createInMemoryRepository();
        await repository.put({ hash: 'modern', translatedDataUrl: 'modern-value' });
        const handler = createGtcRuntimeHandler({ repository, logger });

        const cleared = await invoke(handler, { action: 'GTC_CLEAR_ALL' });
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['legacy', 'modern'] });

        expect(cleared).toEqual(expect.objectContaining({ ok: true, cleared: true }));
        expect(query.entriesByHash).toEqual({});
        expect(await storage.get(null)).toEqual({ unrelated_setting: 'preserved' });
    });

    test('missing remove API invalidates legacy payload before a later modern outage', async () => {
        const repository = createInMemoryRepository(() => 400);
        await storage.set({ gtc_hash: 'stale-legacy' });
        const originalRemove = storage.remove;
        storage.remove = undefined;
        const handler = createGtcRuntimeHandler({ repository, logger });
        const saved = await invoke(handler, {
            action: 'GTC_SAVE', hash: 'hash', translatedDataUrl: 'current', operationAt: 400,
        });
        storage.remove = originalRemove;
        repository.getManyEntries = jest.fn().mockRejectedValue(new Error('modern unavailable'));
        const restarted = createGtcRuntimeHandler({ repository, logger });
        const query = await invoke(restarted, { action: 'GTC_QUERY_MANY', hashes: ['hash'] });

        expect(saved).toEqual(expect.objectContaining({
            ok: true, legacyCleanupError: 'storage.local.remove unavailable',
        }));
        expect(query).toEqual(expect.objectContaining({ ok: false, error: 'modern unavailable' }));
        expect(query.entriesByHash).toBeUndefined();
        expect((await storage.get('gtc_meta_hash')).gtc_meta_hash)
            .toEqual(expect.objectContaining({ invalidated: true }));
    });

    test('deletes a marked legacy fallback by its clean URL when the modern save had failed', async () => {
        const repository = createInMemoryRepository();
        repository.put = async () => { throw new Error('IndexedDB unavailable'); };
        const handler = createGtcRuntimeHandler({ repository, logger });
        const cleanUrl = 'https://reader.test/page-1.png';

        const fallbackSave = await invoke(handler, {
            action: 'GTC_SAVE',
            hash: 'url-delete',
            translatedDataUrl: 'legacy-value',
            cleanUrl,
            operationAt: 500,
        });
        const deleted = await invoke(handler, { action: 'GTC_DELETE_BY_CLEAN_URL', cleanUrl });
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['url-delete'] });

        expect(fallbackSave).toEqual(expect.objectContaining({ ok: false }));
        expect(deleted).toEqual(expect.objectContaining({ ok: true, legacyDeleted: 1 }));
        expect(query.entriesByHash).toEqual({});
    });

    test('reports a failed legacy clear and lets a retry finish without swallowing the storage error', async () => {
        await storage.set({ gtc_legacy: 'legacy-value', unrelated_setting: 'preserved' });
        const handler = createGtcRuntimeHandler({ repository: createInMemoryRepository(), logger });
        const originalRemove = storage.remove.bind(storage);
        storage.remove = (_keys, callback) => {
            runtime.lastError = { message: 'quota cleanup failure' };
            callback();
            runtime.lastError = null;
        };

        const failedClear = await invoke(handler, { action: 'GTC_CLEAR_ALL' });
        storage.remove = originalRemove;
        const retry = await invoke(handler, { action: 'GTC_CLEAR_ALL' });
        const query = await invoke(handler, { action: 'GTC_QUERY_MANY', hashes: ['legacy'] });

        expect(failedClear).toEqual(expect.objectContaining({ ok: false, error: 'quota cleanup failure' }));
        expect(retry).toEqual(expect.objectContaining({ ok: true, cleared: true }));
        expect(query.entriesByHash).toEqual({});
        expect(await storage.get(null)).toEqual({ unrelated_setting: 'preserved' });
    });
});

/**
 * gtc-cache-flow.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real do GTC moderno:
 * content_manga.js -> chrome.runtime -> createGtcRuntimeHandler -> IndexedDB.
 *
 * A suíte não reimplementa a decisão hit/miss. Fixtures apenas pré-populam o
 * repository real ou forçam explicitamente o fallback legado.
 */

const crypto = require('crypto');
const { TextEncoder } = require('util');
const { IDBFactory } = require('fake-indexeddb');

const { loadContentScript } = require('../../helpers/load-content-script.js');
const {
    getRuntimeMock,
    getStorageMock,
} = require('../../mocks/chrome-api.mock.js');
const {
    createGtcRuntimeHandler,
    createIndexedDbRepository,
} = require('../../../extension/shared/gtc-indexeddb.js');

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;
if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));
}

describe('Global Translation Cache (GTC) — integração moderna real', () => {
    const TRANSLATED_0 = 'data:image/png;base64,Q0FDSEVfMA==';
    const TRANSLATED_1 = 'data:image/png;base64,Q0FDSEVfMQ==';

    let runtimeMock;
    let storageMock;
    let repository;
    let runtimeMessages;
    let startBatches;
    let queryManyMode;

    function uniqueDbName() {
        return `gtc-cache-flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    async function waitFor(assertion, { timeout = 3000, interval = 10 } = {}) {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
            const result = await assertion();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        throw new Error('Timeout aguardando integração GTC');
    }

    function installRealGtcBridge() {
        const realHandler = createGtcRuntimeHandler({ repository });

        runtimeMock.onMessage.addListener((request, sender, sendResponse) => {
            if (!request || !request.action || !request.action.startsWith('GTC_')) return false;
            runtimeMessages.push(request);

            if (request.action === 'GTC_QUERY_MANY' && queryManyMode) {
                if (queryManyMode.kind === 'seed') {
                    Promise.resolve()
                        .then(async () => {
                            const selected = queryManyMode.select(request.hashes || []);
                            await repository.putMany(
                                selected.map(({ hash, translatedDataUrl }) => ({
                                    hash,
                                    translatedDataUrl,
                                    cleanUrl: `fixture://${hash}`,
                                }))
                            );
                            realHandler(request, sender, sendResponse);
                        })
                        .catch(error => sendResponse({ ok: false, error: error.message }));
                    return true;
                }

                if (queryManyMode.kind === 'legacy-fallback') {
                    Promise.resolve()
                        .then(async () => {
                            const legacyEntries = Object.fromEntries(
                                (request.hashes || []).map((hash, index) => [
                                    `gtc_${hash}`,
                                    queryManyMode.values[index] || TRANSLATED_0,
                                ])
                            );
                            await storageMock.set(legacyEntries);
                            sendResponse({ ok: false, error: 'forced modern GTC failure' });
                        })
                        .catch(error => sendResponse({ ok: false, error: error.message }));
                    return true;
                }
            }

            return realHandler(request, sender, sendResponse);
        });

        runtimeMock.onMessage.addListener((request, _sender, sendResponse) => {
            if (!request || !request.action) return false;

            if (request.action === 'START_BATCH') {
                startBatches.push(request);
                sendResponse({
                    ok: true,
                    batchId: request.batchId,
                    queued: false,
                    queuePosition: null,
                });
                return false;
            }

            if (request.action === 'CALCULATE_VISUAL_FINGERPRINT') {
                sendResponse({ ok: false, error: 'fingerprint visual não necessário no cenário SHA' });
                return false;
            }

            if (
                request.action === 'LOG_ENTRY'
                || request.action === 'SM_SAVE_PAGE'
                || request.action === 'SM_STATS'
            ) {
                sendResponse({ ok: true });
                return false;
            }

            return false;
        });
    }

    async function loadPages(count = 2) {
        return loadContentScript({
            hostname: 'localhost',
            domImages: Array.from({ length: count }, (_, index) => ({
                src: `http://localhost/page-${index}.png`,
                width: 800 + index,
                height: 1200 + index,
            })),
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        runtimeMessages = [];
        startBatches = [];
        queryManyMode = null;

        await storageMock.clear();
        repository = createIndexedDbRepository({
            indexedDbFactory: new IDBFactory(),
            dbName: uniqueDbName(),
        });
        installRealGtcBridge();

        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await repository.clear();
        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('100% SHA hits passam pelo runtime/IndexedDB real e evitam START_BATCH', async () => {
        queryManyMode = {
            kind: 'seed',
            select(hashes) {
                return (hashes || []).map((hash, index) => ({
                    hash,
                    translatedDataUrl: index === 0 ? TRANSLATED_0 : TRANSLATED_1,
                }));
            },
        };

        await loadPages(2);
        document.getElementById('manga-main-content').click();

        await waitFor(() =>
            Array.from(document.querySelectorAll('img')).every(img => img.dataset.translated === 'true')
        );

        const images = Array.from(document.querySelectorAll('img'));
        expect(images[0].getAttribute('src')).toBe(TRANSLATED_0);
        expect(images[1].getAttribute('src')).toBe(TRANSLATED_1);
        expect(startBatches).toHaveLength(0);

        const shaQueries = runtimeMessages.filter(message => message.action === 'GTC_QUERY_MANY');
        expect(shaQueries).toHaveLength(1);
        expect(shaQueries[0].hashes).toHaveLength(2);
    });

    test('hit parcial aplica cache e encaminha somente o miss para START_BATCH', async () => {
        queryManyMode = {
            kind: 'seed',
            select(hashes) {
                return hashes && hashes[0]
                    ? [{ hash: hashes[0], translatedDataUrl: TRANSLATED_0 }]
                    : [];
            },
        };

        await loadPages(2);
        document.getElementById('manga-main-content').click();

        const batch = await waitFor(() => startBatches[0]);
        expect(batch.images).toEqual([{ index: 1 }]);

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe(TRANSLATED_0);
        expect(document.querySelector('[data-testid="img-1"]').dataset.translated).not.toBe('true');

        const shaQueries = runtimeMessages.filter(message => message.action === 'GTC_QUERY_MANY');
        expect(shaQueries).toHaveLength(1);
        expect(shaQueries[0].hashes).toHaveLength(2);
    });

    test('falha do caminho moderno ativa fallback legado gtc_<hash> na implementação real', async () => {
        queryManyMode = {
            kind: 'legacy-fallback',
            values: [TRANSLATED_0, TRANSLATED_1],
        };

        await loadPages(2);
        document.getElementById('manga-main-content').click();

        await waitFor(() =>
            Array.from(document.querySelectorAll('img')).every(img => img.dataset.translated === 'true')
        );

        const images = Array.from(document.querySelectorAll('img'));
        expect(images[0].getAttribute('src')).toBe(TRANSLATED_0);
        expect(images[1].getAttribute('src')).toBe(TRANSLATED_1);
        expect(startBatches).toHaveLength(0);

        const shaQueries = runtimeMessages.filter(message => message.action === 'GTC_QUERY_MANY');
        expect(shaQueries).toHaveLength(1);

        const legacyState = await storageMock.get(
            shaQueries[0].hashes.map(hash => `gtc_${hash}`)
        );
        expect(Object.keys(legacyState)).toHaveLength(2);
    });

    test('UPDATE_IMAGE real persiste tradução via GTC_SAVE no repository IndexedDB real', async () => {
        const context = await loadPages(1);
        const original = document.querySelector('[data-testid="img-0"]');
        original.dataset.mangaIndex = '0';
        original.dataset.origHash = 'abc123hash';

        await context.sendMessage('UPDATE_IMAGE', {
            index: 0,
            newSrc: TRANSLATED_0,
        });

        await waitFor(async () => {
            const result = await repository.getMany(['abc123hash']);
            return result.abc123hash === TRANSLATED_0;
        });

        const stored = await repository.getMany(['abc123hash']);
        expect(stored).toEqual({ abc123hash: TRANSLATED_0 });
        expect(runtimeMessages).toContainEqual(expect.objectContaining({
            action: 'GTC_SAVE',
            hash: 'abc123hash',
            translatedDataUrl: TRANSLATED_0,
            cleanUrl: 'http://localhost/page-0.png',
        }));
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe(TRANSLATED_0);
    });
});

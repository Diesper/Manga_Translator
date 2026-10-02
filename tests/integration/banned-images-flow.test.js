/**
 * banned-images-flow.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real do contrato de banimento:
 * popup real -> chrome.storage -> content script real.
 *
 * Protege BUG #9 + INCONS #2 sem reimplementar as regras de produção.
 */

const crypto = require('crypto');
const { TextEncoder } = require('util');

const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const { loadContentScript } = require('../helpers/load-content-script.js');
const {
    getStorageMock,
    getTabsMock,
    getRuntimeMock,
} = require('../mocks/chrome-api.mock.js');

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

describe('Fluxo real de banimento — popup -> storage -> content script', () => {
    const HOSTNAME = 'reader.test';
    const BAN_KEY = `bannedImages_${HOSTNAME}`;

    const BANNED_IMAGE = {
        index: 0,
        src: `https://${HOSTNAME}/page-0.png`,
        width: 800,
        height: 1200,
    };

    const DOM_IMAGES = [
        { src: BANNED_IMAGE.src, width: 800, height: 1200 },
        { src: `https://${HOSTNAME}/page-1.png`, width: 810, height: 1210 },
        { src: `https://${HOSTNAME}/page-2.png`, width: 820, height: 1220 },
        { src: `https://${HOSTNAME}/banner.png`, width: 960, height: 480 },
    ];

    let storageMock;
    let tabsMock;
    let runtimeMock;
    let sentMessages;

    async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
            const result = await assertion();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        throw new Error('Timeout aguardando condição da integração de banimento');
    }

    async function createActiveTab(url) {
        const tab = await tabsMock.create({ url, active: true });
        tabsMock._tabs.get(tab.id).title = 'Reader Test';
        return tab;
    }

    function registerPopupTabHandler(tabId, images) {
        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({ images, total: images.length });
                return;
            }
            if (
                message.action === 'SET_SELECTED_IMAGES'
                || message.action === 'ENABLE_PAGE'
                || message.action === 'HIGHLIGHT_IMAGE'
            ) {
                sendResponse({ success: true });
            }
        });
    }

    function installRuntimeResponder() {
        sentMessages = [];
        jest.spyOn(runtimeMock, 'sendMessage').mockImplementation((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByHash: {} }), 0);
                return;
            }
            if (message.action === 'GTC_QUERY_BY_DHASH') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByDHash: {} }), 0);
                return;
            }
            if (message.action === 'GTC_QUERY_PERCEPTUAL_V2') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByQueryId: {} }), 0);
                return;
            }
            if (message.action === 'CALCULATE_VISUAL_FINGERPRINT') {
                if (callback) setTimeout(() => callback({ ok: false, error: 'sem fingerprint no teste focal' }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    async function banWithRealPopup() {
        const tab = await createActiveTab(`https://${HOSTNAME}/chapter-1`);
        registerPopupTabHandler(tab.id, [BANNED_IMAGE]);

        await storageMock.set({ enabledDomains: [HOSTNAME] });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(1);
        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(1);

        document.getElementById('btn-ban-selected').click();
        await flushAsyncTasks(12);

        const data = await storageMock.get([BAN_KEY]);
        expect(data[BAN_KEY]).toEqual([BANNED_IMAGE.src]);
        return data[BAN_KEY];
    }

    async function loadRealContentUsingPopupState() {
        const bannedFromPopup = await banWithRealPopup();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        installRuntimeResponder();

        return loadContentScript({
            hostname: HOSTNAME,
            bannedImages: bannedFromPopup,
            domImages: DOM_IMAGES,
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        runtimeMock = getRuntimeMock();

        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    test('popup real grava a chave consumida por GET_PAGE_IMAGES real e preserva índices DOM', async () => {
        const context = await loadRealContentUsingPopupState();

        const response = await context.sendMessage('GET_PAGE_IMAGES');

        expect(response).toEqual({
            images: [
                {
                    index: 1,
                    src: DOM_IMAGES[1].src,
                    width: DOM_IMAGES[1].width,
                    height: DOM_IMAGES[1].height,
                },
                {
                    index: 2,
                    src: DOM_IMAGES[2].src,
                    width: DOM_IMAGES[2].width,
                    height: DOM_IMAGES[2].height,
                },
                {
                    index: 3,
                    src: DOM_IMAGES[3].src,
                    width: DOM_IMAGES[3].width,
                    height: DOM_IMAGES[3].height,
                },
            ],
            total: 3,
        });

        const persisted = await storageMock.get([BAN_KEY]);
        expect(persisted[BAN_KEY]).toEqual([BANNED_IMAGE.src]);
    });

    test('botão flutuante real envia START_BATCH sem a URL banida pelo popup', async () => {
        await loadRealContentUsingPopupState();

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(
            () => sentMessages.find(message => message.action === 'START_BATCH')
        );

        expect(startBatch.images).toEqual([
            { index: 1 },
            { index: 2 },
            { index: 3 },
        ]);
        expect(startBatch.images).not.toContainEqual({ index: 0 });
    });

    test('ban produzido no host A não afeta o content script real do host B', async () => {
        await banWithRealPopup();

        const otherHost = 'outromanga.test';
        const otherKey = `bannedImages_${otherHost}`;
        const otherState = await storageMock.get([otherKey]);
        expect(otherState[otherKey]).toBeUndefined();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        const context = await loadContentScript({
            hostname: otherHost,
            bannedImages: [],
            domImages: [
                { src: BANNED_IMAGE.src, width: 800, height: 1200 },
            ],
        });

        expect(await context.sendMessage('GET_PAGE_IMAGES')).toEqual({
            images: [
                {
                    index: 0,
                    src: BANNED_IMAGE.src,
                    width: 800,
                    height: 1200,
                },
            ],
            total: 1,
        });

        const hostAState = await storageMock.get([BAN_KEY]);
        expect(hostAState[BAN_KEY]).toEqual([BANNED_IMAGE.src]);
    });
});

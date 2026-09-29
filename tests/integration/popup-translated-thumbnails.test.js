const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const {
    getStorageMock,
    getTabsMock,
} = require('../mocks/chrome-api.mock.js');

function dataUrl(label) {
    return 'data:image/png;base64,' + Buffer.from(label).toString('base64');
}

describe('popup Traduzidas — miniaturas por capítulo/site com lazy loading', () => {
    let storageMock;
    let tabsMock;
    let sendSpy;
    let pageIndexCalls;
    let originalIntersectionObserver;

    async function createActiveTab(url, title = 'Manga Page') {
        const tab = await tabsMock.create({ url, active: true });
        tabsMock._tabs.get(tab.id).title = title;
        return tab;
    }

    function registerPopupTabHandler(tabId) {
        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') sendResponse({ images: [] });
            else if (message.action === 'SET_SELECTED_IMAGES') sendResponse({ success: true });
            else sendResponse({ success: true });
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
        pageIndexCalls = new Map();
        originalIntersectionObserver = global.IntersectionObserver;

        sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                const stats = {};
                (message.chapterIds || []).forEach(id => {
                    stats[id] = {
                        pageCount: id === 'chap_a' ? 2 : id === 'chap_b' ? 1 : 0,
                        indices: id === 'chap_a' ? [0, 1] : id === 'chap_b' ? [0] : [],
                    };
                });
                if (callback) setTimeout(() => callback({ ok: true, stats }), 0);
                return;
            }

            if (message.action === 'SM_PAGE_INDEX') {
                const count = (pageIndexCalls.get(message.chapterId) || 0) + 1;
                pageIndexCalls.set(message.chapterId, count);
                const pages = message.chapterId === 'chap_a'
                    ? [
                        { pageIndex: 0, assetId: 'asset-a0', width: 800, height: 1200 },
                        { pageIndex: 1, assetId: 'asset-a1', width: 820, height: 1180 },
                    ]
                    : message.chapterId === 'chap_b'
                        ? [{ pageIndex: 0, assetId: 'asset-b0', width: 900, height: 1300 }]
                        : [];
                if (callback) setTimeout(() => callback({ ok: true, pages }), 0);
                return;
            }

            if (message.action === 'SM_GET_ASSET') {
                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl(message.assetId) }), 0);
                return;
            }

            if (message.action === 'SM_MIGRATE_CHAPTER') {
                if (callback) setTimeout(() => callback({ ok: true }), 0);
                return;
            }

            if (message.action === 'SM_GET_PAGE') {
                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl(`page-${message.pageIndex}`) }), 0);
                return;
            }

            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        global.IntersectionObserver = originalIntersectionObserver;
        window.IntersectionObserver = originalIntersectionObserver;
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    async function loadPopupWithTwoSites() {
        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test', 'reader-b.test'],
            chapterList: [
                {
                    id: 'chap_a',
                    title: 'Capítulo A',
                    url: 'https://reader-a.test/chapter-a',
                    timestamp: 200,
                },
                {
                    id: 'chap_b',
                    title: 'Capítulo B',
                    url: 'https://reader-b.test/chapter-b',
                    timestamp: 100,
                },
            ],
            'siteMeta_reader-a.test': { title: 'Reader A' },
            'siteMeta_reader-b.test': { title: 'Reader B' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(16);
    }

    test('renderiza miniaturas dentro do capítulo e site corretos sem alterar a hierarquia atual', async () => {
        // Este caso valida o fallback sem IntersectionObserver; o teste seguinte
        // cobre explicitamente o caminho lazy real.
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        await loadPopupWithTwoSites();

        const folders = [...document.querySelectorAll('#chapter-list .site-folder')];
        expect(folders).toHaveLength(2);

        const folderA = folders.find(folder => folder.textContent.includes('Reader A'));
        const folderB = folders.find(folder => folder.textContent.includes('Reader B'));
        expect(folderA).toBeTruthy();
        expect(folderB).toBeTruthy();

        const chapterA = folderA.querySelector('.chapter-item');
        const chapterB = folderB.querySelector('.chapter-item');

        expect(chapterA.querySelectorAll('.chapter-thumb-card')).toHaveLength(2);
        expect(chapterB.querySelectorAll('.chapter-thumb-card')).toHaveLength(1);
        expect(chapterA.querySelectorAll('.chapter-item-btns')).toHaveLength(1);
        expect(chapterB.querySelectorAll('.chapter-item-btns')).toHaveLength(1);

        await flushAsyncTasks(12);

        expect(chapterA.querySelector('.chapter-thumb-card[data-page-index="0"] img').src).toContain(Buffer.from('asset-a0').toString('base64'));
        expect(chapterA.querySelector('.chapter-thumb-card[data-page-index="1"] img').src).toContain(Buffer.from('asset-a1').toString('base64'));
        expect(chapterB.querySelector('.chapter-thumb-card[data-page-index="0"] img').src).toContain(Buffer.from('asset-b0').toString('base64'));
    });

    test('com IntersectionObserver o blob só é solicitado quando a miniatura entra na área visível', async () => {
        class FakeIntersectionObserver {
            static instances = [];
            constructor(callback) {
                this.callback = callback;
                this.target = null;
                FakeIntersectionObserver.instances.push(this);
            }
            observe(target) { this.target = target; }
            disconnect() {}
            trigger() {
                this.callback([{ target: this.target, isIntersecting: true }], this);
            }
        }
        global.IntersectionObserver = FakeIntersectionObserver;
        window.IntersectionObserver = FakeIntersectionObserver;

        await loadPopupWithTwoSites();

        const assetCallsBefore = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');
        expect(assetCallsBefore).toHaveLength(0);
        expect(FakeIntersectionObserver.instances.length).toBe(3);

        FakeIntersectionObserver.instances[0].trigger();
        await flushAsyncTasks(8);

        const assetCallsAfter = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');
        expect(assetCallsAfter).toHaveLength(1);
    });

    test('falha ao buscar asset mantém a caixa e marca somente a miniatura afetada', async () => {
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        sendSpy.mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                if (callback) setTimeout(() => callback({ ok: true, stats: { chap_a: { pageCount: 1, indices: [0] } } }), 0);
                return;
            }
            if (message.action === 'SM_PAGE_INDEX') {
                if (callback) setTimeout(() => callback({ ok: true, pages: [{ pageIndex: 0, assetId: 'broken' }] }), 0);
                return;
            }
            if (message.action === 'SM_GET_ASSET' || message.action === 'SM_GET_PAGE') {
                if (callback) setTimeout(() => callback({ ok: false }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test'],
            chapterList: [{
                id: 'chap_a',
                title: 'Capítulo A',
                url: 'https://reader-a.test/a',
                timestamp: 1,
            }],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(18);

        const card = document.querySelector('.chapter-thumb-card');
        expect(card).not.toBeNull();
        expect(card.classList.contains('failed')).toBe(true);
        expect(card.textContent).toContain('Falha');
        expect(document.querySelector('.chapter-item')).not.toBeNull();
    });

    test('capítulo sem índice tenta migração antes do fallback legado', async () => {
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        let indexAttempt = 0;
        sendSpy.mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                if (callback) setTimeout(() => callback({ ok: true, stats: { chap_a: { pageCount: 1, indices: [0] } } }), 0);
                return;
            }
            if (message.action === 'SM_PAGE_INDEX') {
                indexAttempt++;
                const pages = indexAttempt === 1 ? [] : [{ pageIndex: 0, assetId: 'migrated-asset' }];
                if (callback) setTimeout(() => callback({ ok: true, pages }), 0);
                return;
            }
            if (message.action === 'SM_MIGRATE_CHAPTER') {
                if (callback) setTimeout(() => callback({ ok: true }), 0);
                return;
            }
            if (message.action === 'SM_GET_ASSET') {
                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl('migrated') }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test'],
            chapterList: [{
                id: 'chap_a',
                title: 'Capítulo A',
                url: 'https://reader-a.test/a',
                timestamp: 1,
            }],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(18);

        expect(sendSpy.mock.calls.some(([message]) => message.action === 'SM_MIGRATE_CHAPTER' && message.chapterId === 'chap_a')).toBe(true);
        expect(indexAttempt).toBeGreaterThanOrEqual(2);
        expect(document.querySelectorAll('.chapter-thumb-card')).toHaveLength(1);
        expect(document.querySelector('.chapter-thumb-card img').src).toContain(Buffer.from('migrated').toString('base64'));
    });

    test('fallback legado preserva miniatura quando a migração não produz índice novo', async () => {
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        sendSpy.mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                if (callback) setTimeout(() => callback({ ok: true, stats: {} }), 0);
                return;
            }
            if (message.action === 'SM_PAGE_INDEX') {
                if (callback) setTimeout(() => callback({ ok: true, pages: [] }), 0);
                return;
            }
            if (message.action === 'SM_MIGRATE_CHAPTER') {
                if (callback) setTimeout(() => callback({ ok: false }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test'],
            chapterList: [{
                id: 'chap_a',
                title: 'Capítulo A',
                url: 'https://reader-a.test/a',
                timestamp: 1,
            }],
            chap_a_images: {
                4: dataUrl('legacy-four'),
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(18);

        const card = document.querySelector('.chapter-thumb-card[data-page-index="4"]');
        expect(card).not.toBeNull();
        expect(card.querySelector('img').src).toContain(Buffer.from('legacy-four').toString('base64'));
    });
});

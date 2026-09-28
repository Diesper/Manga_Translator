const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getAlarmsMock,
    getDownloadsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { BACKGROUND_PATH, flush, waitFor } = require('../../helpers/background-test-utils.js');

function createContextMenusMock() {
    const items = new Map();
    const clickListeners = [];
    return {
        items,
        clickListeners,
        create: jest.fn((props, callback) => {
            items.set(props.id, { ...props });
            if (callback) callback();
            return props.id;
        }),
        remove: jest.fn((id, callback) => {
            items.delete(id);
            if (callback) callback();
            return Promise.resolve();
        }),
        onClicked: {
            addListener: jest.fn(fn => clickListeners.push(fn)),
            removeListener: jest.fn(fn => {
                const index = clickListeners.indexOf(fn);
                if (index >= 0) clickListeners.splice(index, 1);
            }),
        },
    };
}

describe('background.js - menu nativo para tradução de uma imagem', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let alarmsMock;
    let downloadsMock;
    let contextMenus;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        alarmsMock = getAlarmsMock();
        downloadsMock = getDownloadsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock._installedListeners = [];
        runtimeMock._startupListeners = [];
        runtimeMock.lastError = null;
        tabsMock._tabs.clear();
        storageMock._listeners = [];
        await storageMock.clear();

        contextMenus = createContextMenusMock();
        global.chrome = {
            storage: {
                local: storageMock,
                onChanged: storageMock.onChanged,
            },
            tabs: tabsMock,
            alarms: alarmsMock,
            runtime: runtimeMock,
            downloads: downloadsMock,
            scripting: global.chrome?.scripting,
            contextMenus,
        };
    });

    afterEach(async () => {
        tabsMock._tabs.clear();
        alarmsMock.clearAll();
        await storageMock.clear();
        jest.restoreAllMocks();
    });

    test('cria somente para imagens e somente nos domínios habilitados quando a opção está ligada', async () => {
        await storageMock.set({
            clickToTranslateEnabled: true,
            enabledDomains: ['reader.test', 'second-reader.test'],
        });

        loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);

        const item = contextMenus.items.get('manga-translator-translate-single-image');
        expect(item).toEqual(expect.objectContaining({
            id: 'manga-translator-translate-single-image',
            title: 'Traduzir esta imagem',
            contexts: ['image'],
        }));
        expect(item.documentUrlPatterns).toEqual([
            '*://reader.test/*',
            '*://second-reader.test/*',
        ]);
    });

    test('clique no item encaminha a imagem exata para o content script', async () => {
        await storageMock.set({
            clickToTranslateEnabled: true,
            enabledDomains: ['reader.test'],
        });

        loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);

        const tab = await tabsMock.create({ url: 'https://reader.test/chapter-1', active: true });
        const forwarded = [];
        tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {
            forwarded.push(message);
            sendResponse({ ok: true, index: 4 });
        });

        expect(contextMenus.clickListeners).toHaveLength(1);
        contextMenus.clickListeners[0]({
            menuItemId: 'manga-translator-translate-single-image',
            pageUrl: tab.url,
            srcUrl: 'https://reader.test/page-4.png',
            mediaType: 'image',
        }, tab);

        await waitFor(() => forwarded.length === 1);
        expect(forwarded[0]).toEqual({
            action: 'TRANSLATE_CONTEXT_IMAGE',
            srcUrl: 'https://reader.test/page-4.png',
        });
    });

    test('desligar a opção remove o item e não encaminha ações antigas', async () => {
        await storageMock.set({
            clickToTranslateEnabled: true,
            enabledDomains: ['reader.test'],
        });

        loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);
        expect(contextMenus.items.has('manga-translator-translate-single-image')).toBe(true);

        await storageMock.set({ clickToTranslateEnabled: false });
        await flush(8);
        expect(contextMenus.items.has('manga-translator-translate-single-image')).toBe(false);

        const tab = await tabsMock.create({ url: 'https://reader.test/chapter-2', active: true });
        const forwarded = [];
        tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {
            forwarded.push(message);
            sendResponse({ ok: true });
        });

        contextMenus.clickListeners[0]({
            menuItemId: 'manga-translator-translate-single-image',
            pageUrl: tab.url,
            srcUrl: 'https://reader.test/page-2.png',
            mediaType: 'image',
        }, tab);

        await flush(4);
        expect(forwarded).toHaveLength(0);
    });
});

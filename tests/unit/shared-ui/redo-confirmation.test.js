const path = require('path');
const fs = require('fs');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock, getRuntimeMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));
const SHARED_UI = path.join(ROOT, 'extension/shared/shared-ui.js');

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 1500, interval = 10 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const value = await assertion();
        if (value) return value;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condição');
}

describe('shared-ui — Refazer sem dependência de window.confirm', () => {
    let storageMock;
    let runtimeMock;
    let sendSpy;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        runtimeMock = getRuntimeMock();
        runtimeMock._messageListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();
        document.documentElement.innerHTML = '<head></head><body></body>';

        sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {
            if (message.action === 'SM_DELETE_CLEAN_URL') {
                if (callback) setTimeout(() => callback({ ok: true, deleted: 1 }), 0);
                return;
            }
            if (message.action === 'GTC_DELETE_BY_CLEAN_URL') {
                if (callback) setTimeout(() => callback({ ok: true, deleted: 1 }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        jest.isolateModules(() => require(SHARED_UI));
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        document.documentElement.innerHTML = '<head></head><body></body>';
        delete global.requestRedoConfirmation;
        delete global.deleteSavedTranslationForEntry;
    });

    test('abre modal próprio e Cancelar não apaga nada', async () => {
        const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
            throw new Error('window.confirm não deveria ser usado');
        });

        const promise = global.deleteSavedTranslationForEntry({
            chapterId: 'chap_1',
            cleanUrl: 'https://reader.test/p1.png',
            index: 0,
        });

        const dialog = await waitFor(() => document.getElementById('mt-redo-confirm-dialog'));
        expect(dialog).not.toBeNull();
        expect(nativeConfirm).not.toHaveBeenCalled();

        document.getElementById('mt-redo-confirm-cancel').click();
        await expect(promise).resolves.toBe(false);

        expect(sendSpy.mock.calls.some(([message]) => message.action === 'SM_DELETE_CLEAN_URL')).toBe(false);
        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
    });

    test('Escape cancela o modal e clique fora também é tratado como cancelamento', async () => {
        const first = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/escape.png',
            index: 0,
        });
        await waitFor(() => document.getElementById('mt-redo-confirm-overlay'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(first).resolves.toBe(false);

        const second = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/outside.png',
            index: 1,
        });
        const overlay = await waitFor(() => document.getElementById('mt-redo-confirm-overlay'));
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await expect(second).resolves.toBe(false);
    });

    test('confirmar apaga storage novo, legado, bloqueio e cache global', async () => {
        const cleanUrl = 'https://reader.test/wrong.png';
        const keepUrl = 'https://reader.test/keep.png';
        await storageMock.set({
            chapterList: [{ id: 'chap_redo', title: 'Cap', url: 'https://reader.test/cap' }],
            chap_redo_images: {
                0: 'data:image/png;base64,WRONG',
                1: 'data:image/png;base64,KEEP',
            },
            chap_redo_paths: {
                0: 'C:/wrong.png',
                1: 'C:/keep.png',
            },
            chap_redo_restoreMap: {
                [cleanUrl]: 'data:image/png;base64,WRONG',
                [keepUrl]: 'data:image/png;base64,KEEP',
            },
            chap_redo_restoreMeta: {
                [cleanUrl]: { index: 0 },
                [keepUrl]: { index: 1 },
            },
            autoRestoreBlockedImages: {
                [cleanUrl]: { cleanUrl },
            },
        });

        const refresh = jest.fn();
        const showStatus = jest.fn();
        const promise = global.deleteSavedTranslationForEntry({
            chapterId: 'chap_redo',
            cleanUrl,
            index: 0,
        }, { refresh, showStatus });

        await waitFor(() => document.getElementById('mt-redo-confirm-accept'));
        document.getElementById('mt-redo-confirm-accept').click();
        await expect(promise).resolves.toBe(true);

        const data = await storageMock.get([
            'chap_redo_images',
            'chap_redo_paths',
            'chap_redo_restoreMap',
            'chap_redo_restoreMeta',
            'autoRestoreBlockedImages',
        ]);

        expect(data.chap_redo_images[0]).toBeUndefined();
        expect(data.chap_redo_images[1]).toContain('KEEP');
        expect(data.chap_redo_paths[0]).toBeUndefined();
        expect(data.chap_redo_restoreMap[cleanUrl]).toBeUndefined();
        expect(data.chap_redo_restoreMap[keepUrl]).toContain('KEEP');
        expect(data.chap_redo_restoreMeta[cleanUrl]).toBeUndefined();
        expect(data.autoRestoreBlockedImages[cleanUrl]).toBeUndefined();

        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'SM_DELETE_CLEAN_URL', cleanUrl }),
            expect.any(Function)
        );
        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'GTC_DELETE_BY_CLEAN_URL', cleanUrl }),
            expect.any(Function)
        );
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('Tradução apagada'), '#4CAF50');
    });

    test('"Não perguntar novamente" persiste preferência e próximo Refazer ignora qualquer bloqueio de diálogo', async () => {
        const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
            throw new Error('diálogo nativo bloqueado');
        });

        const first = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/first.png',
            index: 0,
        });
        await waitFor(() => document.getElementById('mt-redo-confirm-accept'));

        document.getElementById('mt-redo-confirm-never-ask').checked = true;
        document.getElementById('mt-redo-confirm-accept').click();
        await expect(first).resolves.toBe(true);

        const pref = await storageMock.get(['redoConfirmEnabled']);
        expect(pref.redoConfirmEnabled).toBe(false);
        expect(nativeConfirm).not.toHaveBeenCalled();

        const second = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/second.png',
            index: 1,
        });
        await expect(second).resolves.toBe(true);

        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
        expect(nativeConfirm).not.toHaveBeenCalled();
        expect(sendSpy.mock.calls.filter(([message]) => message.action === 'SM_DELETE_CLEAN_URL')).toHaveLength(2);
    });

    test('preferência redoConfirmEnabled=false executa Refazer mesmo se confirm nativo estiver indisponível', async () => {
        await storageMock.set({ redoConfirmEnabled: false });
        const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
            throw new Error('confirm bloqueado');
        });

        const result = await global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/no-dialog.png',
            index: 3,
        });

        expect(result).toBe(true);
        expect(nativeConfirm).not.toHaveBeenCalled();
        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
        expect(sendSpy.mock.calls.some(([message]) =>
            message.action === 'SM_DELETE_CLEAN_URL' && message.cleanUrl.includes('no-dialog')
        )).toBe(true);
    });

    test('duplo clique no mesmo Refazer não dispara duas purgas simultâneas', async () => {
        const entry = {
            cleanUrl: 'https://reader.test/double.png',
            index: 0,
        };

        const first = global.deleteSavedTranslationForEntry(entry);
        const second = global.deleteSavedTranslationForEntry(entry);

        await waitFor(() => document.getElementById('mt-redo-confirm-accept'));
        document.getElementById('mt-redo-confirm-accept').click();

        await expect(first).resolves.toBe(true);
        await expect(second).resolves.toBe(false);

        expect(sendSpy.mock.calls.filter(([message]) =>
            message.action === 'SM_DELETE_CLEAN_URL' && message.cleanUrl === entry.cleanUrl
        )).toHaveLength(1);
    });

    test('entrada inválida retorna false sem abrir modal nem tocar no storage', async () => {
        await expect(global.deleteSavedTranslationForEntry(null)).resolves.toBe(false);
        await expect(global.deleteSavedTranslationForEntry({})).resolves.toBe(false);
        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
        expect(sendSpy.mock.calls.some(([message]) => message.action === 'SM_DELETE_CLEAN_URL')).toBe(false);
    });
});

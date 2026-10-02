/**
 * regex-escape.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Carrega o background real e executa fallbackSearch da ação modular
 * extension/background/actions/open-existing-folder.js (BUG #14 Fix).
 * Verifica escape literal de metacaracteres em downloads.search({ filenameRegex }).
 */

const path = require('path');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');
const { getDownloadsMock, getRuntimeMock } = require('../../mocks/chrome-api.mock.js');

function getBackgroundListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    return listeners[listeners.length - 1];
}

function dispatchToBackground(runtimeMock, request, sender = { tab: null }) {
    return new Promise((resolve) => {
        const sendResponse = (response) => {
            resolve(response);
        };
        const keepAlive = getBackgroundListener(runtimeMock)(request, sender, sendResponse);
        if (!keepAlive) {
            resolve(undefined);
        }
    });
}

describe('SHOW_EXISTING_FOLDER - Escape de Metacaracteres para Regex no background.js (BUG #14)', () => {
    let downloadsMock;
    let runtimeMock;
    let cancelBackgroundDelayTimers;

    beforeEach(() => {
        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();
        downloadsMock = getDownloadsMock();
        downloadsMock._downloads.clear();
        downloadsMock._downloads.set(1, {
            id: 1,
            filename: '/home/user/Downloads/MangaTranslator/One.Piece/p1.png',
            state: 'complete',
            exists: true,
        });
        runtimeMock = getRuntimeMock();
        runtimeMock._messageListeners = [];
        const bgPath = path.resolve(__dirname, '../../../extension/background.js');
        loadBackgroundModule(bgPath);
    });

    afterEach(() => {
        // Os casos sem pasta existente caem em handleMarkerAndShow(), que cria
        // _anchor.png e agenda removeFile/erase para 4 s depois. Esse timer
        // pertence ao caso atual e não pode sobreviver ao worker Jest.
        cancelBackgroundDelayTimers();
        jest.restoreAllMocks();
    });

    test('escapa ponto "." evitando tratar como qualquer caractere', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/One.Piece',
            safeTitle: 'One.Piece',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/One\\.Piece');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('/home/user/Downloads/MangaTranslator/One.Piece')).toBe(true);
        expect(regex.test('/home/user/Downloads/MangaTranslator/OneXPiece')).toBe(false);
    });

    test('escapa parênteses "(" e ")"', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/One Piece (Fan Sub)',
            safeTitle: 'One Piece (Fan Sub)',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/One Piece \\(Fan Sub\\)');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('MangaTranslator/One Piece (Fan Sub)')).toBe(true);
        expect(regex.test('MangaTranslator/One Piece xFan Subx')).toBe(false);
    });

    test('escapa sinal de mais "+"', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/Dragon+Ball',
            safeTitle: 'Dragon+Ball',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/Dragon\\+Ball');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('MangaTranslator/Dragon+Ball')).toBe(true);
        expect(regex.test('MangaTranslator/DragonBall')).toBe(false);
    });

    test('escapa asterisco "*" e ponto de interrogação "?"', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'MangaTranslator/Title*Name?',
            safeTitle: 'Title*Name?',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('MangaTranslator/Title\\*Name\\?');

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test('MangaTranslator/Title*Name?')).toBe(true);
        expect(regex.test('MangaTranslator/TitleName')).toBe(false);
    });

    test('path complexo do mundo real não lança SyntaxError e faz match exato', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        const complexPath = 'MangaTranslator/Test (Arc) v2.0+/page_001.png';
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: complexPath,
            safeTitle: 'Test',
        });

        expect(searchSpy).toHaveBeenCalled();
        const query = searchSpy.mock.calls[0][0];
        expect(() => new RegExp(query.filenameRegex)).not.toThrow();

        const regex = new RegExp(query.filenameRegex);
        expect(regex.test(complexPath)).toBe(true);
    });

    test.each(['^', '$', '{', '}', '[', ']', '|', '\\'])(
        'escapa o metacaractere restante %s como literal', async (symbol) => {
            const searchSpy = jest.spyOn(downloadsMock, 'search');
            const folderPath = `MangaTranslator/Before${symbol}After`;
            await dispatchToBackground(runtimeMock, {
                action: 'SHOW_EXISTING_FOLDER', folderPath, safeTitle: 'Literal',
            });

            expect(searchSpy).toHaveBeenCalled();
            const query = searchSpy.mock.calls[0][0];
            expect(query.filenameRegex).toBe(`MangaTranslator/Before\\${symbol}After`);
            expect(() => new RegExp(query.filenameRegex)).not.toThrow();
            const regex = new RegExp(query.filenameRegex);
            expect(regex.test(folderPath)).toBe(true);
            expect(regex.test('MangaTranslator/BeforeXAfter')).toBe(false);
            expect(regex.test('MangaTranslator/BeforeAfter')).toBe(false);
        }
    );

    test('escapa separadores e metacaracteres de um caminho Windows', async () => {
        const searchSpy = jest.spyOn(downloadsMock, 'search');
        const folderPath = 'C:\\Users\\Reader\\MangaTranslator\\Arc[2]\\One.Piece';
        await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER', folderPath, safeTitle: 'One.Piece',
        });

        const query = searchSpy.mock.calls[0][0];
        expect(query.filenameRegex).toBe('C:\\\\Users\\\\Reader\\\\MangaTranslator\\\\Arc\\[2\\]\\\\One\\.Piece');
        const regex = new RegExp(query.filenameRegex);
        expect(regex.test(folderPath)).toBe(true);
        expect(regex.test(folderPath.replace('Arc[2]', 'Arc2'))).toBe(false);
        expect(regex.test(folderPath.replace('One.Piece', 'OneXPiece'))).toBe(false);
        expect(regex.test(folderPath.replace(/\\/g, '/'))).toBe(false);
    });
});

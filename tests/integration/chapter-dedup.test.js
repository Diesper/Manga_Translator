/**
 * chapter-dedup.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real da identidade/persistência de capítulos.
 *
 * A suíte carrega extension/content/cm-chapter.js e observa chapterList +
 * mensagens SM_SAVE_PAGE. Nenhuma regra de canonicalTitle/getOrCreate é copiada
 * para o teste.
 */

const { getStorageMock } = require('../mocks/chrome-api.mock.js');

describe('Deduplicação de capítulos — cm-chapter real', () => {
    let storageMock;
    let chapterApi;
    let idSequence;
    let originalPath;

    function setPage(pathname, title) {
        window.history.replaceState({}, '', pathname);
        document.title = title;
    }

    function createManager({
        hostname = window.location.hostname,
        sendRuntimeMessageAsync = async () => ({ ok: true, assetId: 'asset_default' }),
        onRestoreEntry = null,
    } = {}) {
        return chapterApi.createChapterManager({
            hostname,
            generateId: prefix => `${prefix}${++idSequence}`,
            sendRuntimeMessageAsync,
            onRestoreEntry,
        });
    }

    async function chapterList() {
        const data = await storageMock.get(['chapterList']);
        return data.chapterList || [];
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        await storageMock.clear();
        chrome.runtime.lastError = null;
        idSequence = 0;
        originalPath = window.location.pathname + window.location.search + window.location.hash;

        delete window.MangaTranslatorChapter;
        delete globalThis.MangaTranslatorChapter;
        require('../../extension/content/cm-chapter.js');
        chapterApi = window.MangaTranslatorChapter || globalThis.MangaTranslatorChapter;
        expect(chapterApi).toBeTruthy();
    });

    afterEach(async () => {
        await storageMock.clear();
        chrome.runtime.lastError = null;
        window.history.replaceState({}, '', originalPath || '/');
        document.title = '';
        delete window.MangaTranslatorChapter;
        delete globalThis.MangaTranslatorChapter;
    });

    test('primeira visita cria capítulo usando canonicalTitle da produção', async () => {
        setPage('/one-piece/1050', 'One Piece [Cap 1050]');

        const manager = createManager();
        const id = await manager.getOrCreateChapterId();

        expect(id).toBe('chap_1');
        expect(await chapterList()).toEqual([
            expect.objectContaining({
                id,
                url: window.location.href,
                title: chapterApi.canonicalTitle(document.title),
                timestamp: expect.any(Number),
            }),
        ]);
    });

    test('URL exata tem prioridade e reutiliza ID mesmo se o título mudou', async () => {
        setPage('/exact/chapter', 'Título inicial');
        const first = createManager();
        const id1 = await first.getOrCreateChapterId();

        document.title = 'Título completamente diferente';
        const second = createManager();
        const id2 = await second.getOrCreateChapterId();

        expect(id2).toBe(id1);
        expect(await chapterList()).toHaveLength(1);
    });

    test('URLs diferentes do mesmo host deduplicam quando canonicalTitle real é equivalente', async () => {
        setPage('/one-piece/1050', 'One Piece [Cap 1050]');
        const first = createManager();
        const id1 = await first.getOrCreateChapterId();

        setPage('/one-piece/1050?page=2', 'One Piece (Cap 1050)');
        const second = createManager();
        const id2 = await second.getOrCreateChapterId();

        expect(chapterApi.canonicalTitle('One Piece [Cap 1050]'))
            .toBe(chapterApi.canonicalTitle('One Piece (Cap 1050)'));
        expect(id2).toBe(id1);

        const list = await chapterList();
        expect(list).toHaveLength(1);
        expect(list[0]).toEqual(expect.objectContaining({
            id: id1,
            url: window.location.href,
            title: chapterApi.canonicalTitle(document.title),
        }));
    });

    test('não inventa equivalência de sufixos textuais que canonicalTitle real preserva', async () => {
        expect(chapterApi.canonicalTitle('One Piece Cap 1050 | Ler'))
            .not.toBe(chapterApi.canonicalTitle('One Piece Cap 1050 - Mangás'));

        setPage('/legacy-mirror/1050', 'One Piece Cap 1050 | Ler');
        const id1 = await createManager().getOrCreateChapterId();

        setPage('/legacy-mirror/1050?page=2', 'One Piece Cap 1050 - Mangás');
        const id2 = await createManager().getOrCreateChapterId();

        expect(id2).not.toBe(id1);
        expect(await chapterList()).toHaveLength(2);
    });

    test('capítulos diferentes do mesmo host não são agrupados', async () => {
        setPage('/one-piece/1050', 'One Piece Cap 1050');
        const id1050 = await createManager().getOrCreateChapterId();

        setPage('/one-piece/1051', 'One Piece Cap 1051');
        const id1051 = await createManager().getOrCreateChapterId();

        expect(id1051).not.toBe(id1050);
        expect(await chapterList()).toHaveLength(2);
    });

    test('mesmo título não deduplica quando o hostname contratado é diferente', async () => {
        setPage('/site-a/chapter/1', 'Mesmo Título');
        const idA = await createManager({ hostname: window.location.hostname })
            .getOrCreateChapterId();

        setPage('/site-b/chapter/1', 'Mesmo Título');
        const idB = await createManager({ hostname: 'different.example' })
            .getOrCreateChapterId();

        expect(idB).not.toBe(idA);
        expect(await chapterList()).toHaveLength(2);
    });

    test('persistTranslatedPage de duas sessões envia páginas ao SM_SAVE_PAGE sob o mesmo chapterId', async () => {
        const saveRequests = [];
        const restoreSpy = jest.fn();
        const storageService = async request => {
            expect(request.action).toBe('SM_SAVE_PAGE');
            saveRequests.push(request);
            return { ok: true, assetId: `asset_${saveRequests.length}` };
        };

        setPage('/manga/chapter-7', 'Manga [Chapter 7]');
        const session1 = createManager({
            sendRuntimeMessageAsync: storageService,
            onRestoreEntry: restoreSpy,
        });
        const saved1 = await session1.persistTranslatedPage(
            0,
            'data:image/png;base64,UEFHRTA=',
            {
                sourceUrl: 'https://cdn.example/page-0.png?token=a',
                cleanUrl: 'https://cdn.example/page-0.png',
                width: 800,
                height: 1200,
            }
        );

        setPage('/manga/chapter-7?page=2', 'Manga (Chapter 7)');
        const session2 = createManager({
            sendRuntimeMessageAsync: storageService,
            onRestoreEntry: restoreSpy,
        });
        const saved2 = await session2.persistTranslatedPage(
            1,
            'data:image/png;base64,UEFHRTE=',
            {
                sourceUrl: 'https://cdn.example/page-1.png?token=b',
                cleanUrl: 'https://cdn.example/page-1.png',
                width: 801,
                height: 1201,
            }
        );

        expect(saved2.chapterId).toBe(saved1.chapterId);
        expect(saveRequests).toHaveLength(2);
        expect(saveRequests.map(request => ({
            action: request.action,
            chapterId: request.chapterId,
            pageIndex: request.pageIndex,
        }))).toEqual([
            { action: 'SM_SAVE_PAGE', chapterId: saved1.chapterId, pageIndex: 0 },
            { action: 'SM_SAVE_PAGE', chapterId: saved1.chapterId, pageIndex: 1 },
        ]);
        expect(saveRequests[0]).toEqual(expect.objectContaining({
            dataUrl: 'data:image/png;base64,UEFHRTA=',
            originalUrl: 'https://cdn.example/page-0.png?token=a',
            cleanUrl: 'https://cdn.example/page-0.png',
            meta: expect.objectContaining({
                host: window.location.hostname,
                width: 800,
                height: 1200,
            }),
        }));
        expect(saveRequests[1]).toEqual(expect.objectContaining({
            dataUrl: 'data:image/png;base64,UEFHRTE=',
            cleanUrl: 'https://cdn.example/page-1.png',
            meta: expect.objectContaining({ width: 801, height: 1201 }),
        }));
        expect(restoreSpy).toHaveBeenNthCalledWith(1, 'https://cdn.example/page-0.png', {
            assetId: 'asset_1',
            index: 0,
        });
        expect(restoreSpy).toHaveBeenNthCalledWith(2, 'https://cdn.example/page-1.png', {
            assetId: 'asset_2',
            index: 1,
        });

        const local = await storageMock.get(null);
        expect(local.chapterList).toHaveLength(1);
        expect(Object.keys(local).some(key => key.endsWith('_images'))).toBe(false);
        expect(Object.keys(local).some(key => key.endsWith('_restoreMap'))).toBe(false);
    });
});

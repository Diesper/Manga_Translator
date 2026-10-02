const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findRepoRoot } = require('../helpers/repo-root');

function getBrowserModeConfig() {
    const rawMode = String(process.env.MANGA_E2E_BROWSER_MODE || 'stealth').trim().toLowerCase();
    const showBrowser = ['show', 'visible', 'headed', 'ui'].includes(rawMode);

    return {
        mode: showBrowser ? 'show' : 'stealth',
        showBrowser,
        slowMo: showBrowser ? 350 : 0,
    };
}

function getExtensionPath(startDir) {
    return path.join(findRepoRoot(startDir), 'extension');
}

async function getBackgroundWorker(context) {
    const existingWorker = context.serviceWorkers()[0];
    if (existingWorker) return existingWorker;
    return context.waitForEvent('serviceworker', { timeout: 15000 });
}

async function resetExtensionState(backgroundWorker, { forceIndexedDbFailure = false } = {}) {
    await backgroundWorker.evaluate(async () => {
        await new Promise((resolve, reject) => {
            chrome.storage.local.clear(() => {
                const clearError = chrome.runtime.lastError;
                if (clearError) {
                    reject(new Error(clearError.message || 'chrome.storage.local.clear falhou'));
                    return;
                }

                chrome.storage.local.set({
                    enabledDomains: ['localhost', '127.0.0.1'],
                    debugMode: false,
                    maxConcurrentJobs: 1,
                    geminiBaseUrl: 'http://127.0.0.1:3999/gemini/',
                    defaultPrompt: 'Teste E2E controlado do fluxo MV3.',
                    translatorLog: [],
                    deleting_urls: [],
                    chapterList: [],
                    mt_state: {
                        jobQueue: [],
                        isProcessing: false,
                        stopRequested: false,
                        activeMangaTabId: null,
                        extractionTabs: {},
                        totalJobs: 0,
                        completedJobs: 0,
                        activeJobsCount: 0,
                    },
                }, () => {
                    const setError = chrome.runtime.lastError;
                    if (setError) reject(new Error(setError.message || 'chrome.storage.local.set falhou'));
                    else resolve();
                });
            });
        });
    });

    await backgroundWorker.evaluate(async shouldForceFailure => {
        const sm = self.MangaTranslatorStorageManager;
        if (!sm || typeof sm.openStorageDb !== 'function') {
            throw new Error('StorageManager indisponível durante reset E2E');
        }

        const db = await sm.openStorageDb();
        const storeNames = ['chapters', 'chapterPages', 'restoreEntries', 'assets'];
        const missingStores = storeNames.filter(name => !db.objectStoreNames.contains(name));
        if (missingStores.length > 0) {
            throw new Error(`Stores IndexedDB ausentes no reset E2E: ${missingStores.join(', ')}`);
        }

        if (shouldForceFailure) {
            throw new Error('E2E_INJECTED_IDB_RESET_FAILURE');
        }

        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeNames, 'readwrite');
            let settled = false;
            const fail = reason => {
                if (settled) return;
                settled = true;
                reject(reason instanceof Error ? reason : new Error(String(reason || 'IndexedDB reset falhou')));
            };

            storeNames.forEach(name => tx.objectStore(name).clear());
            tx.oncomplete = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            tx.onerror = () => fail(tx.error || new Error('IndexedDB reset transaction error'));
            tx.onabort = () => fail(tx.error || new Error('IndexedDB reset transaction aborted'));
        });

        const counts = {};
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeNames, 'readonly');
            let settled = false;
            const fail = reason => {
                if (settled) return;
                settled = true;
                reject(reason instanceof Error ? reason : new Error(String(reason || 'IndexedDB post-condition falhou')));
            };

            storeNames.forEach(name => {
                const request = tx.objectStore(name).count();
                request.onsuccess = () => { counts[name] = request.result; };
                request.onerror = () => fail(request.error || new Error(`Falha contando store ${name}`));
            });

            tx.oncomplete = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            tx.onerror = () => fail(tx.error || new Error('IndexedDB post-condition transaction error'));
            tx.onabort = () => fail(tx.error || new Error('IndexedDB post-condition transaction aborted'));
        });

        const dirtyStores = Object.entries(counts).filter(([, count]) => count !== 0);
        if (dirtyStores.length > 0) {
            throw new Error(`IndexedDB reset incompleto: ${JSON.stringify(Object.fromEntries(dirtyStores))}`);
        }

        return counts;
    }, forceIndexedDbFailure);
}


function makeSvgDataUrl(label) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
            <rect width="800" height="1200" fill="#101010" />
            <text x="50%" y="50%" fill="#ffffff" font-size="72" text-anchor="middle">${label}</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const DEFAULT_READER_INDICES = [0, 2, 5, 8, 10, 11, 14, 20, 33, 50, 51, 77, 88, 99, 200];

async function seedReaderChapter(backgroundWorker, {
    chapterId = 'chap_reader_e2e',
    title = 'Capitulo E2E do Reader',
    indices = DEFAULT_READER_INDICES,
} = {}) {
    const images = {};
    indices.forEach(index => {
        images[index] = makeSvgDataUrl(`idx-${index}`);
    });

    await backgroundWorker.evaluate(async ({ chapterId, title, images }) => {
        await new Promise(resolve => {
            chrome.storage.local.set({
                chapterList: [{
                    id: chapterId,
                    title,
                    url: 'http://localhost:3999/manga-page.html',
                    timestamp: Date.now(),
                }],
                [`${chapterId}_images`]: images,
            }, resolve);
        });
    }, { chapterId, title, images });

    return chapterId;
}

async function getReaderUrl(backgroundWorker, chapterId) {
    return backgroundWorker.evaluate(async requestedChapterId => {
        return `${chrome.runtime.getURL('reader/reader.html')}?id=${encodeURIComponent(requestedChapterId)}`;
    }, chapterId);
}

async function readReaderMigrationState(backgroundWorker, chapterId) {
    return backgroundWorker.evaluate(async requestedChapterId => {
        const sm = self.MangaTranslatorStorageManager;
        if (!sm) throw new Error('StorageManager indisponível ao verificar migração');

        const pageIndex = await sm.getChapterPageIndex(requestedChapterId);
        const pageCount = await sm.getChapterPageCount(requestedChapterId);
        const firstPage = await sm.getPageDataUrl(requestedChapterId, 0);
        const lastPage = await sm.getPageDataUrl(requestedChapterId, 200);
        const legacyKey = `${requestedChapterId}_images`;
        const flagKey = `_sm_migrated_${requestedChapterId}`;

        const storage = await new Promise((resolve, reject) => {
            chrome.storage.local.get([legacyKey, flagKey], value => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message || 'chrome.storage.local.get falhou'));
                else resolve(value);
            });
        });

        return {
            indices: pageIndex.map(entry => entry.pageIndex),
            pageCount,
            firstPagePresent: typeof firstPage === 'string' && firstPage.startsWith('data:image/'),
            lastPagePresent: typeof lastPage === 'string' && lastPage.startsWith('data:image/'),
            legacyImagesPresent: Object.prototype.hasOwnProperty.call(storage, legacyKey),
            migrationFlag: storage[flagKey],
        };
    }, chapterId);
}

let browserContext;
let backgroundWorker;
let userDataDir;

test.describe('E2E-19/E2E-20/E2E-21/E2E-22: E2E - reader offline real', () => {
    // O reader compartilha persistent context/storage entre casos deste arquivo.
    test.describe.configure({ mode: 'serial' });
    test.beforeAll(async () => {
        const pathToExtension = getExtensionPath(__dirname);
        userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-manga-reader-'));
        const browserMode = getBrowserModeConfig();
        const launchArgs = [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ];

        if (!browserMode.showBrowser) launchArgs.unshift('--headless=new');

        browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            slowMo: browserMode.slowMo,
            args: launchArgs,
            viewport: { width: 1280, height: 720 },
        });

        backgroundWorker = await getBackgroundWorker(browserContext);
    });

    test.afterAll(async () => {
        let closeError = null;
        try {
            if (browserContext) await browserContext.close();
        } catch (error) {
            closeError = error;
        }

        let cleanupError = null;
        try {
            if (userDataDir) {
                fs.rmSync(userDataDir, {
                    recursive: true,
                    force: true,
                    maxRetries: 3,
                    retryDelay: 100,
                });
                if (fs.existsSync(userDataDir)) {
                    throw new Error(`Persistent profile não removido: ${userDataDir}`);
                }
            }
        } catch (error) {
            cleanupError = error;
        }

        if (closeError) {
            if (cleanupError && Object.isExtensible(closeError)) closeError.cleanupError = cleanupError;
            throw closeError;
        }
        if (cleanupError) throw cleanupError;
    });

    test.beforeEach(async () => {
        backgroundWorker = await getBackgroundWorker(browserContext);
        await resetExtensionState(backgroundWorker);
    });

    test('reset de IndexedDB falha fechado quando a limpeza não pode ser confirmada', { tag: '@e2e-fast' }, async () => {
        await expect(resetExtensionState(backgroundWorker, {
            forceIndexedDbFailure: true,
        })).rejects.toThrow('E2E_INJECTED_IDB_RESET_FAILURE');

        await expect(resetExtensionState(backgroundWorker)).resolves.toBeUndefined();
    });

    test('renderiza paginas salvas em ordem numerica correta e contador inicial consistente', { tag: '@e2e-fast' }, async () => {
        const chapterId = await seedReaderChapter(backgroundWorker, {});
        const readerPage = await browserContext.newPage();
        const readerUrl = await getReaderUrl(backgroundWorker, chapterId);

        await readerPage.goto(readerUrl);
        await expect(readerPage.locator('.reader-page-wrap')).toHaveCount(15, { timeout: 10000 });

        const decodeSrc = src => {
            if (!src) return '';
            if (src.includes(';base64,')) {
                return Buffer.from(src.split(';base64,')[1], 'base64').toString('utf8');
            }
            return decodeURIComponent(src);
        };

        const firstImg = readerPage.locator('.reader-page-wrap img').first();
        await expect(firstImg).toHaveAttribute('src', /.+/, { timeout: 10000 });
        const firstSrc = await firstImg.getAttribute('src');
        expect(decodeSrc(firstSrc)).toContain('idx-0');

        await expect(readerPage.locator('#chapter-title')).toHaveText('Capitulo E2E do Reader');
        await expect(readerPage.locator('#page-counter')).toHaveText('1 / 15');
        await expect(readerPage.locator('.page-label').first()).toHaveText('Página 1');
        await expect(readerPage.locator('.page-label').last()).toHaveText('Página 15');

        // O reader utiliza IntersectionObserver (lazy loading), portanto a última página (idx-200)
        // é carregada sob demanda ao rolar até ela
        const lastWrap = readerPage.locator('.reader-page-wrap').last();
        await lastWrap.scrollIntoViewIfNeeded();
        const lastImg = lastWrap.locator('img');
        await expect(lastImg).toHaveAttribute('src', /.+/, { timeout: 10000 });
        const lastSrc = await lastImg.getAttribute('src');
        expect(decodeSrc(lastSrc)).toContain('idx-200');

        const migration = await readReaderMigrationState(backgroundWorker, chapterId);
        expect(migration).toEqual({
            indices: DEFAULT_READER_INDICES,
            pageCount: DEFAULT_READER_INDICES.length,
            firstPagePresent: true,
            lastPagePresent: true,
            legacyImagesPresent: false,
            migrationFlag: true,
        });

        await readerPage.close();
    });

    test('slider de largura persiste no localStorage ao reabrir o reader', { tag: '@e2e-fast' }, async () => {
        const chapterId = await seedReaderChapter(backgroundWorker, {
            chapterId: 'chap_reader_width',
            indices: [0, 1, 2],
        });
        const readerUrl = await getReaderUrl(backgroundWorker, chapterId);

        const firstPage = await browserContext.newPage();
        await firstPage.goto(readerUrl);
        await expect(firstPage.locator('.reader-page-wrap')).toHaveCount(3, { timeout: 10000 });

        await firstPage.locator('#width-slider').evaluate((node, value) => {
            node.value = String(value);
            node.dispatchEvent(new Event('input', { bubbles: true }));
        }, 1000);

        await expect(firstPage.locator('#width-val')).toHaveText('1000px');
        await expect(firstPage.locator('#reader-container')).toHaveCSS('max-width', '1000px');
        await firstPage.close();

        const reopenedPage = await browserContext.newPage();
        await reopenedPage.goto(readerUrl);
        await expect(reopenedPage.locator('.reader-page-wrap')).toHaveCount(3, { timeout: 10000 });

        await expect(reopenedPage.locator('#width-slider')).toHaveValue('1000');
        await expect(reopenedPage.locator('#width-val')).toHaveText('1000px');
        await expect(reopenedPage.locator('#reader-container')).toHaveCSS('max-width', '1000px');

        await reopenedPage.close();
    });

    test('navegacao por teclado avanca paginas e atualiza contador/progresso', { tag: '@e2e-fast' }, async () => {
        const chapterId = await seedReaderChapter(backgroundWorker, {
            chapterId: 'chap_reader_keyboard',
        });
        const readerPage = await browserContext.newPage();
        const readerUrl = await getReaderUrl(backgroundWorker, chapterId);

        await readerPage.goto(readerUrl);
        await expect(readerPage.locator('.reader-page-wrap')).toHaveCount(15, { timeout: 10000 });

        await readerPage.locator('#width-slider').evaluate(node => {
            node.value = '400';
            node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect(readerPage.locator('#reader-container')).toHaveCSS('max-width', '400px');

        for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await readerPage.keyboard.press('ArrowRight');
            // eslint-disable-next-line no-await-in-loop
            await readerPage.waitForTimeout(450);
        }

        await expect(readerPage.locator('#page-counter')).toHaveText('4 / 15', { timeout: 5000 });

        const targetPage = readerPage.locator('.reader-page-wrap').nth(9);
        await targetPage.evaluate(el => el.scrollIntoView({ block: 'center' }));

        // A virtualização carrega a imagem apenas quando a página entra na
        // janela de preload. Espere a altura real estabilizar antes de
        // centralizar novamente; caso contrário o placeholder de 400px pode
        // crescer após o scroll e deslocar o viewport para a página anterior.
        await expect.poll(async () => targetPage.locator('img').evaluate(img => (
            img.complete
            && img.naturalHeight > 0
            && !img.dataset.pendingSrc
        )), { timeout: 10000 }).toBe(true);

        await targetPage.evaluate(el => new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                el.scrollIntoView({ block: 'center' });
                resolve();
            }));
        }));

        await expect(readerPage.locator('#page-counter')).toHaveText('10 / 15', { timeout: 5000 });
        await expect.poll(async () => {
            return readerPage.locator('#read-progress-fill').evaluate(node => node.style.width);
        }, { timeout: 5000 }).toBe('67%');

        await readerPage.close();
    });
});

/**
 * translation-flow.spec.js
 *
 * E2E real do fluxo MV3:
 * - content_manga.js seleciona imagens validas e dispara START_BATCH
 * - background.js orquestra a fila e abre abas do Gemini
 * - content_gemini.js roda na aba mockada do Gemini e devolve a imagem traduzida
 * - content_manga.js substitui o DOM com data:image/... e conclui o lote
 *
 * Observacao importante:
 * A assercao final verifica `data:image/...` no mangá, nao `translated_result.png`.
 * Isso reflete o comportamento real da extensao: o background converte a imagem
 * gerada em base64 antes de enviar `UPDATE_IMAGE` para a aba do mangá.
 */

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
    let dir = startDir;

    while (dir !== path.parse(dir).root) {
        const candidate = path.join(dir, 'extension');
        if (fs.existsSync(path.join(candidate, 'manifest.json'))) return candidate;
        dir = path.dirname(dir);
    }

    return path.join(process.cwd(), 'extension');
}

async function getBackgroundWorker(context) {
    const existingWorker = context.serviceWorkers()[0];
    if (existingWorker) return existingWorker;
    return context.waitForEvent('serviceworker', { timeout: 15000 });
}

async function resetExtensionState(backgroundWorker, overrides = {}) {
    await backgroundWorker.evaluate((stateOverrides) => {
        return new Promise(resolve => {
            chrome.storage.local.clear(() => {
                chrome.storage.local.set({
                    enabledDomains: ['localhost'],
                    debugMode: false,
                    maxConcurrentJobs: 1,
                    geminiBaseUrl: 'http://127.0.0.1:3999/gemini/',
                    geminiExecutionMode: 'temp_chat',
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
                    ...(stateOverrides || {}),
                }, resolve);
            });
        });
    }, overrides);
}

async function readStorage(backgroundWorker, keys) {
    return backgroundWorker.evaluate(async requestedKeys => {
        return new Promise(resolve => chrome.storage.local.get(requestedKeys, resolve));
    }, keys);
}

async function areBothOriginalPagesVisible(page) {
    return page.evaluate(() => {
        const targets = [
            document.querySelector('[data-testid="manga-image-0"]'),
            document.querySelector('[data-testid="manga-image-1"]'),
        ];

        return targets.every(img => {
            if (!img) return false;
            const rect = img.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= window.innerHeight;
        });
    });
}

let browserContext;
let backgroundWorker;

test.describe('E2E-01/E2E-02/E2E-03/E2E-04/E2E-05/E2E-06/E2E-07/E2E-08/E2E-09/E2E-10/E2E-11/E2E-12/E2E-13/E2E-14/E2E-15/E2E-15b/E2E-16/E2E-16b/E2E-17/E2E-18: Automacao UI: Fluxo de Traducao em Massa (E2E)', () => {
    test.beforeEach(async () => {
        const pathToExtension = getExtensionPath(__dirname);
        const userDataDir = path.join(
            os.tmpdir(),
            `pw-manga-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        const browserMode = getBrowserModeConfig();
        const launchArgs = [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ];

        if (!browserMode.showBrowser) launchArgs.unshift('--headless=new');

        console.log(`[E2E] Browser mode: ${browserMode.mode}`);

        browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            slowMo: browserMode.slowMo,
            args: launchArgs,
        });

        backgroundWorker = await getBackgroundWorker(browserContext);
        await resetExtensionState(backgroundWorker);
    });

    test.afterEach(async () => {
        if (browserContext) {
            await browserContext.close();
            browserContext = null;
            backgroundWorker = null;
        }
    });

    test('Deve traduzir as paginas validas de ponta a ponta e encerrar o lote corretamente', async () => {
        const page = await browserContext.newPage();

        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.waitForFunction(() => {
            const pageImages = Array.from(document.querySelectorAll('img')).filter(img =>
                img.src && img.src.includes('page_')
            );

            return pageImages.length >= 2 &&
                pageImages.every(img => img.naturalWidth >= 300 && img.naturalHeight >= 400);
        }, { timeout: 15000 });

        const triggerBtn = page.locator('#manga-translator-trigger');
        const mainContent = page.locator('#manga-main-content');
        const pageOne = page.getByTestId('manga-image-0');
        const pageTwo = page.getByTestId('manga-image-1');
        const avatar = page.getByTestId('small-image');
        const banner = page.getByTestId('banner-image');

        await expect(triggerBtn).toBeVisible({ timeout: 10000 });
        await expect(mainContent).toContainText('TRADUZIR P', { timeout: 10000 });
        await expect.poll(async () => areBothOriginalPagesVisible(page), {
            timeout: 10000,
            message: 'Esperava ver as duas paginas originais ao mesmo tempo no viewport',
        }).toBe(true);

        const pageOneSrcBefore = await pageOne.getAttribute('src');
        const pageTwoSrcBefore = await pageTwo.getAttribute('src');

        await mainContent.click();

        await expect.poll(async () => {
            return page.evaluate(() => {
                return Array.from(document.querySelectorAll('img[data-translated="true"]')).length;
            });
        }, {
            timeout: 45000,
            message: 'Esperava 2 imagens traduzidas no DOM do mangá',
        }).toBe(2);

        await expect(pageOne).toHaveAttribute('data-translated', 'true');
        await expect(pageTwo).toHaveAttribute('data-translated', 'true');
        await expect(pageOne).toHaveAttribute('src', /^data:image\/png;base64,/);
        await expect(pageTwo).toHaveAttribute('src', /^data:image\/png;base64,/);

        const pageOneSrcAfter = await pageOne.getAttribute('src');
        const pageTwoSrcAfter = await pageTwo.getAttribute('src');

        expect(pageOneSrcAfter).not.toBe(pageOneSrcBefore);
        expect(pageTwoSrcAfter).not.toBe(pageTwoSrcBefore);
        expect(pageOneSrcAfter).not.toBe(pageTwoSrcAfter);
        expect(await avatar.getAttribute('src')).toContain('/manga-images/avatar.png');
        expect(await banner.getAttribute('src')).toContain('/manga-images/banner.png');
        expect(await avatar.getAttribute('data-translated')).toBeNull();
        expect(await banner.getAttribute('data-translated')).toBeNull();

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};

            return {
                completedJobs: state.completedJobs || 0,
                activeJobsCount: state.activeJobsCount || 0,
                isProcessing: !!state.isProcessing,
                stopRequested: !!state.stopRequested,
                queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,
            };
        }, {
            timeout: 30000,
            message: 'Esperava fila vazia e lote finalizado no service worker',
        }).toEqual({
            completedJobs: 2,
            activeJobsCount: 0,
            isProcessing: false,
            stopRequested: false,
            queueLength: 0,
        });

        await expect(mainContent).toContainText('TRADUZIR 2', { timeout: 10000 });

        await page.close();
    });

    test('E2E FIFO N-lotes: A→B→C→D→E→F→G preserva resultados e ordem sem stale', async () => {
        test.setTimeout(180000);
        await resetExtensionState(backgroundWorker, {
            maxConcurrentJobs: 1,
            geminiExecutionMode: 'temp_chat',
            // Mantém A ativo tempo suficiente para B-G entrarem na fila por
            // seus content scripts reais, sem depender de corrida de milissegundos.
            geminiBaseUrl: 'http://127.0.0.1:3999/gemini/?attachmentDelayMs=2500',
        });

        const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const pages = [];

        for (const label of labels) {
            // eslint-disable-next-line no-await-in-loop
            const page = await browserContext.newPage();
            // eslint-disable-next-line no-await-in-loop
            await page.goto(`http://localhost:3999/manga-page.html?fifo=${label}`);
            // eslint-disable-next-line no-await-in-loop
            await page.waitForLoadState('networkidle');
            // eslint-disable-next-line no-await-in-loop
            await page.waitForFunction(() => {
                const image = document.querySelector('[data-testid="manga-image-0"]');
                return image && image.naturalWidth >= 300 && image.naturalHeight >= 400;
            }, { timeout: 15000 });
            // Cada aba representa um lote de uma única página.
            // eslint-disable-next-line no-await-in-loop
            await page.evaluate(() => {
                document.querySelector('[data-testid="manga-image-1"]')?.remove();
            });
            pages.push(page);
        }

        const tabIds = await backgroundWorker.evaluate(async labelsToFind => {
            return new Promise(resolve => {
                chrome.tabs.query({}, tabs => {
                    const result = {};
                    labelsToFind.forEach(label => {
                        const match = (tabs || []).find(tab =>
                            String(tab.url || '').includes(`manga-page.html?fifo=${label}`)
                        );
                        result[label] = match ? match.id : null;
                    });
                    resolve(result);
                });
            });
        }, labels);
        labels.forEach(label => expect(tabIds[label]).not.toBeNull());

        const startReaderBatch = async label => {
            return backgroundWorker.evaluate(async tabId => {
                return new Promise(resolve => {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'START_TRANSLATION_FROM_POPUP',
                        indices: [0],
                    }, response => {
                        const error = chrome.runtime.lastError;
                        resolve(error ? { ok: false, error: error.message } : (response || null));
                    });
                });
            }, tabIds[label]);
        };

        expect(await startReaderBatch('A')).toEqual(expect.objectContaining({ ok: true }));

        await expect.poll(async () => {
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return Boolean(
                state.currentBatchId &&
                state.activeMangaTabId === tabIds.A &&
                state.isProcessing
            );
        }, {
            timeout: 15000,
            message: 'Lote A deveria assumir o scheduler antes da fila B-G',
        }).toBe(true);

        let stateData = await readStorage(backgroundWorker, ['mt_state']);
        const batchIds = [stateData.mt_state.currentBatchId];

        for (let index = 1; index < labels.length; index++) {
            const label = labels[index];
            // eslint-disable-next-line no-await-in-loop
            expect(await startReaderBatch(label)).toEqual(expect.objectContaining({ ok: true }));

            // Aguarda este content script terminar hashing/seleção e efetivamente
            // registrar seu START_BATCH no fim da fila.
            // eslint-disable-next-line no-await-in-loop
            await expect.poll(async () => {
                const storage = await readStorage(backgroundWorker, ['mt_state']);
                const pending = storage.mt_state?.pendingBatches || [];
                return pending.length >= index &&
                    pending[index - 1]?.mangaTabId === tabIds[label];
            }, {
                timeout: 15000,
                message: `Lote ${label} deveria ocupar a posição FIFO ${index}`,
            }).toBe(true);

            // eslint-disable-next-line no-await-in-loop
            stateData = await readStorage(backgroundWorker, ['mt_state']);
            batchIds.push(stateData.mt_state.pendingBatches[index - 1].batchId);
        }

        stateData = await readStorage(backgroundWorker, ['mt_state']);
        expect(stateData.mt_state.currentBatchId).toBe(batchIds[0]);
        expect(stateData.mt_state.pendingBatches.map(batch => batch.batchId))
            .toEqual(batchIds.slice(1));
        expect(stateData.mt_state.pendingBatches.map(batch => batch.mangaTabId))
            .toEqual(labels.slice(1).map(label => tabIds[label]));

        for (let index = 0; index < pages.length; index++) {
            // eslint-disable-next-line no-await-in-loop
            await expect.poll(async () => pages[index].evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            ), {
                timeout: 150000,
                message: `Lote ${labels[index]} deveria receber seu resultado sem ser invalidado pelos lotes seguintes`,
            }).toBe(1);
        }

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return {
                currentBatchId: state.currentBatchId || null,
                completedJobs: state.completedJobs || 0,
                totalJobs: state.totalJobs || 0,
                activeJobsCount: state.activeJobsCount || 0,
                isProcessing: !!state.isProcessing,
                queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,
                pendingIds: Array.isArray(state.pendingBatches)
                    ? state.pendingBatches.map(batch => batch.batchId)
                    : null,
                jobIndexLength: Array.isArray(state.jobIndex) ? state.jobIndex.length : -1,
            };
        }, {
            timeout: 150000,
            message: 'Todos os sete lotes deveriam drenar a fila FIFO completamente',
        }).toEqual({
            currentBatchId: batchIds[batchIds.length - 1],
            completedJobs: 1,
            totalJobs: 1,
            activeJobsCount: 0,
            isProcessing: false,
            queueLength: 0,
            pendingIds: [],
            jobIndexLength: 0,
        });

        const storage = await readStorage(backgroundWorker, ['translatorLog']);
        const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
        const schedulerLogs = logs.filter(entry => entry?.source === 'bg');
        const queuedLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_QUEUED');
        const promotedLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_PROMOTED');
        const doneLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_DONE');

        expect(queuedLogs.map(entry => entry.extra?.queuePosition)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(promotedLogs.map(entry => entry.extra?.batchId)).toEqual(
            batchIds.slice(1).map(id => id.slice(0, 8))
        );
        expect(doneLogs.map(entry => entry.extra?.batchId)).toEqual(
            batchIds.map(id => id.slice(0, 8))
        );
        expect(logs.some(entry => entry && [
            'RESULT_JOB_IDENTITY_MISMATCH',
            'RESULT_COMMIT_REJECTED',
            'STALE_UPDATE',
            'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
        ].includes(entry.action))).toBe(false);

        for (const page of pages) {
            // eslint-disable-next-line no-await-in-loop
            await page.close();
        }
    });

    for (const scenario of [
        {
            mode: 'minimized_window',
            baseUrl: 'http://127.0.0.1:3999/gemini/',
            label: 'janela minimizada',
        },
        {
            mode: 'background_delete',
            baseUrl: 'http://127.0.0.1:3999/app/mock-chat',
            label: 'background com exclusão segura',
        },
    ]) {
        test(`Executa o lote em ${scenario.label} sem depender de ghost mousemove`, async () => {
            await resetExtensionState(backgroundWorker, {
                geminiExecutionMode: scenario.mode,
                geminiBaseUrl: scenario.baseUrl,
            });

            const page = await browserContext.newPage();
            await page.goto('http://localhost:3999/manga-page.html');
            await page.waitForLoadState('networkidle');

            // Estes cenários validam o modo de execução/anti-throttling, não
            // concorrência. Deixamos uma única página elegível para reduzir
            // ruído de cleanup entre janelas e tornar o gate determinístico.
            await page.evaluate(() => {
                const second = document.querySelector('[data-testid="manga-image-1"]');
                if (second) second.remove();
            });

            const mainContent = page.locator('#manga-main-content');
            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
            await mainContent.click();

            await expect.poll(async () => {
                return page.evaluate(() =>
                    document.querySelectorAll('img[data-translated="true"]').length
                );
            }, {
                timeout: 60000,
                message: `Esperava tradução completa no modo ${scenario.mode}`,
            }).toBe(1);

            await expect.poll(async () => {
                backgroundWorker = await getBackgroundWorker(browserContext);
                const storage = await readStorage(backgroundWorker, [
                    'mt_state',
                    'translatorLog',
                ]);
                const state = storage.mt_state || {};
                const logs = Array.isArray(storage.translatorLog)
                    ? storage.translatorLog
                    : [];

                return {
                    activeJobsCount: state.activeJobsCount || 0,
                    isProcessing: !!state.isProcessing,
                    queueLength: Array.isArray(state.jobQueue)
                        ? state.jobQueue.length
                        : -1,
                    batchDone: logs.some(entry =>
                        entry && entry.action === 'BATCH_DONE'
                    ),
                };
            }, {
                timeout: 45000,
                message: `Esperava lote finalizado no modo ${scenario.mode}`,
            }).toEqual({
                activeJobsCount: 0,
                isProcessing: false,
                queueLength: 0,
                batchDone: true,
            });

            if (scenario.mode === 'background_delete') {
                await expect.poll(async () => {
                    const storage = await readStorage(backgroundWorker, ['translatorLog']);
                    const logs = Array.isArray(storage.translatorLog)
                        ? storage.translatorLog
                        : [];
                    return logs.some(entry =>
                        entry && entry.action === 'DELETE_OK'
                    );
                }, {
                    timeout: 15000,
                    message: 'Esperava exclusão segura confirmada no log',
                }).toBe(true);
            }

            await page.close();
        });
    }


    test('E2E resposta rápida: resultado no mesmo instante lógico do submit não é perdido', async () => {
        await resetExtensionState(backgroundWorker, {
            geminiExecutionMode: 'temp_chat',
            geminiBaseUrl: 'http://127.0.0.1:3999/gemini/?fastResult=1',
        });

        const page = await browserContext.newPage();
        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.evaluate(() => {
            const second = document.querySelector('[data-testid="manga-image-1"]');
            if (second) second.remove();
        });

        const mainContent = page.locator('#manga-main-content');
        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
        await mainContent.click();

        await expect.poll(async () => {
            return page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            );
        }, {
            timeout: 30000,
            message: 'Observer V3 deveria capturar resultado instantâneo',
        }).toBe(1);

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return {
                completedJobs: state.completedJobs || 0,
                activeJobsCount: state.activeJobsCount || 0,
                jobIndex: Array.isArray(state.jobIndex) ? state.jobIndex : [],
            };
        }, {
            timeout: 30000,
            message: 'Esperava finalização completa após resposta instantânea',
        }).toEqual({
            completedJobs: 1,
            activeJobsCount: 0,
            jobIndex: [],
        });

        await page.close();
    });

    test('E2E resultado atual do Gemini: shadow DOM + wrapper assistant é detectado sem intervenção manual', async () => {
        await resetExtensionState(backgroundWorker, {
            geminiExecutionMode: 'temp_chat',
            geminiBaseUrl:
                'http://127.0.0.1:3999/gemini/?shadowResult=1&relaxedResultContainer=1',
        });

        const page = await browserContext.newPage();
        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.evaluate(() => {
            document.querySelector('[data-testid="manga-image-1"]')?.remove();
        });

        const mainContent = page.locator('#manga-main-content');
        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
        await mainContent.click();

        await expect.poll(async () => page.evaluate(() =>
            document.querySelectorAll('img[data-translated="true"]').length
        ), {
            timeout: 45000,
            message: 'Resultado em shadow DOM deveria ser detectado automaticamente',
        }).toBe(1);

        const storage = await readStorage(backgroundWorker, ['translatorLog']);
        const logs = Array.isArray(storage.translatorLog)
            ? storage.translatorLog
            : [];

        expect(logs.some(entry =>
            entry && entry.action === 'GEMINI_RESULT_ACCEPTED' &&
            entry.extra?.reason === 'new_model_turn'
        )).toBe(true);
        expect(logs.some(entry =>
            entry && entry.action === 'GEMINI_MANUAL_INTERVENTION_REQUIRED'
        )).toBe(false);

        await page.close();
    });


    test('E2E submit ignorado: falha cedo sem entrar em espera de geração de 4 minutos', async () => {
        await resetExtensionState(backgroundWorker, {
            geminiExecutionMode: 'temp_chat',
            geminiBaseUrl: 'http://127.0.0.1:3999/gemini/?ignoreSubmit=1',
        });

        const page = await browserContext.newPage();
        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.evaluate(() => {
            const second = document.querySelector('[data-testid="manga-image-1"]');
            if (second) second.remove();
        });

        const mainContent = page.locator('#manga-main-content');
        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });

        const startedAt = Date.now();
        await mainContent.click();

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['translatorLog']);
            const logs = Array.isArray(storage.translatorLog)
                ? storage.translatorLog
                : [];
            return logs.some(entry =>
                entry && entry.action === 'GEMINI_SUBMISSION_NOT_CONFIRMED'
            );
        }, {
            timeout: 35000,
            message: 'Esperava GEMINI_SUBMISSION_NOT_CONFIRMED em timeout curto',
        }).toBe(true);

        expect(Date.now() - startedAt).toBeLessThan(35000);

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return {
                activeJobsCount: state.activeJobsCount || 0,
                isProcessing: !!state.isProcessing,
                queueLength: Array.isArray(state.jobQueue)
                    ? state.jobQueue.length
                    : -1,
            };
        }, {
            timeout: 15000,
            message: 'Job com submit não confirmado deveria liberar o lote cedo',
        }).toEqual({
            activeJobsCount: 0,
            isProcessing: false,
            queueLength: 0,
        });

        expect(
            await page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            )
        ).toBe(0);

        await page.close();
    });


    for (const scenario of [
        {
            mode: 'temp_chat',
            basePath: '/gemini/',
            label: 'conversa temporária',
        },
        {
            mode: 'minimized_window',
            basePath: '/gemini/',
            label: 'janela minimizada',
        },
        {
            mode: 'background_delete',
            basePath: '/app/mock-chat',
            label: 'background com exclusão segura',
        },
    ]) {
        test(`REG attachment gate: ${scenario.label} nunca envia texto quando a imagem não confirma`, async () => {
            test.setTimeout(90000);

            const joiner = scenario.basePath.includes('?') ? '&' : '?';
            await resetExtensionState(backgroundWorker, {
                geminiExecutionMode: scenario.mode,
                geminiBaseUrl:
                    `http://127.0.0.1:3999${scenario.basePath}${joiner}attachmentFails=1`,
            });

            const page = await browserContext.newPage();
            await page.goto('http://localhost:3999/manga-page.html');
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => {
                document.querySelector('[data-testid="manga-image-1"]')?.remove();
            });

            const mainContent = page.locator('#manga-main-content');
            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
            await mainContent.click();

            await expect.poll(async () => {
                backgroundWorker = await getBackgroundWorker(browserContext);
                const storage = await readStorage(backgroundWorker, ['translatorLog']);
                const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
                return logs.some(entry =>
                    entry && entry.action === 'GEMINI_ATTACHMENT_NOT_CONFIRMED'
                );
            }, {
                timeout: 70000,
                message: `Esperava gate de attachment no modo ${scenario.mode}`,
            }).toBe(true);

            if (scenario.mode === 'minimized_window') {
                expect(
                    page.isClosed(),
                    'O fallback minimizado não pode fechar a janela que contém o mangá'
                ).toBe(false);
                await expect(page).toHaveURL('http://localhost:3999/manga-page.html');
                await expect(mainContent).toBeVisible();
            }

            const storage = await readStorage(backgroundWorker, ['translatorLog']);
            const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
            expect(logs.some(entry => entry && entry.action === 'GEMINI_SUBMIT_ATTEMPT')).toBe(false);
            expect(logs.some(entry => entry && entry.action === 'PROMPT_INJECTED')).toBe(false);
            expect(await page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            )).toBe(0);

            await page.close();
        });

        test(`REG result ownership: ${scenario.label} ignora clone do input e IMG órfã`, async () => {
            const joiner = scenario.basePath.includes('?') ? '&' : '?';
            await resetExtensionState(backgroundWorker, {
                geminiExecutionMode: scenario.mode,
                geminiBaseUrl:
                    `http://127.0.0.1:3999${scenario.basePath}${joiner}cloneInputIntoUserTurn=1&orphanImageBeforeResult=1`,
            });

            const page = await browserContext.newPage();
            await page.goto('http://localhost:3999/manga-page.html');
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => {
                document.querySelector('[data-testid="manga-image-1"]')?.remove();
            });

            const mainContent = page.locator('#manga-main-content');
            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
            await mainContent.click();

            await expect.poll(async () => page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            ), {
                timeout: 60000,
                message: `Esperava resultado real do model turn em ${scenario.mode}`,
            }).toBe(1);

            const storage = await readStorage(backgroundWorker, ['translatorLog']);
            const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
            expect(logs.some(entry =>
                entry && entry.action === 'GEMINI_RESULT_REJECTED' &&
                entry.extra?.reason === 'user_turn'
            )).toBe(true);
            expect(logs.some(entry =>
                entry && entry.action === 'GEMINI_RESULT_REJECTED' &&
                entry.extra?.reason === 'missing_model_owner'
            )).toBe(true);
            expect(logs.some(entry =>
                entry && entry.action === 'GEMINI_RESULT_ACCEPTED' &&
                entry.extra?.reason === 'new_model_turn'
            )).toBe(true);

            await page.close();
        });
    }

    test('E2E aba Gemini manual: zero automação, zero keepalive e DOM intacto', async () => {
        await backgroundWorker.evaluate(() => {
            chrome.storage.local.set({ __e2e_keepalive_count: 0 });
            chrome.runtime.onConnect.addListener(port => {
                if (!port || port.name !== 'gemini-keep-alive') return;
                chrome.storage.local.get(['__e2e_keepalive_count'], data => {
                    const count = Number(data.__e2e_keepalive_count) || 0;
                    chrome.storage.local.set({
                        __e2e_keepalive_count: count + 1,
                    });
                });
            });
        });

        const manual = await browserContext.newPage();
        await manual.goto('http://127.0.0.1:3999/gemini/?manual=1');
        await manual.waitForLoadState('networkidle');
        await manual.waitForTimeout(1500);

        await expect(manual.locator('#mock-status')).toHaveText('Aguardando entrada');
        await expect(manual.locator('#attachment-label')).toHaveText('Nenhuma imagem anexada');
        await expect(manual.locator('.prompt-box')).toHaveText('');
        await expect(manual.locator('#result-zone')).toBeEmpty();

        backgroundWorker = await getBackgroundWorker(browserContext);
        const storage = await readStorage(backgroundWorker, [
            '__e2e_keepalive_count',
            'translatorLog',
        ]);
        expect(storage.__e2e_keepalive_count || 0).toBe(0);

        const logs = Array.isArray(storage.translatorLog)
            ? storage.translatorLog
            : [];
        expect(logs.some(entry =>
            entry && entry.action === 'JOB_NOT_FOUND'
        )).toBe(true);

        await manual.close();
    });

});

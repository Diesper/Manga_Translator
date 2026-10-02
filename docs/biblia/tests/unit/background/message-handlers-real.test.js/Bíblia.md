# Bíblia técnica — tests/unit/background/message-handlers-real.test.js

> **Estado documental:** reparo corretivo local concluído; decisão distribuída final pendente  
> **SHA auditado:** `1495cd64a92afb7139407eaf7e6055adcbfc1ef3`  
> **Tipo:** integração unitária do listener/router real de `background.js` com mocks Chrome stateful  
> **Linhas textuais:** **493**  
> **Posições documentais:** **494**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte carrega o background real via `loadBackgroundModule(BACKGROUND_PATH)` e despacha mensagens pelo runtime mock real do harness. Ela não copia handlers de produção: valida o listener/router real, seus relays e os efeitos observáveis sobre tabs, storage, downloads e estado interno.

## 2. Setup e isolamento

`beforeEach` reinicializa módulos, timers e mocks, limpa listeners do runtime/storage e carrega o background. `afterEach` cancela timers atrasados, limpa alarmes/tabs/downloads/storage, restaura timers reais e mocks.

Esse isolamento é relevante porque vários handlers usam callbacks e timers; a suíte não deve herdar callbacks de um caso anterior.

## 3. Relays reais

O primeiro cenário valida `GET_TAB_ID`, `GEMINI_PROGRESS` explícito e por fallback, e `REQUEST_IMAGE_DATA`, incluindo erro de conexão para tab inexistente e os payloads efetivamente enviados à tab do mangá.

## 4. Handshake de resultado e persistência

O cenário BG-52/BG-55/BG-56 configura jobs reais no state/storage e exercita `GEMINI_IMAGE_EXTRACTED`, `GEMINI_RESULT_COMMIT`, `IMAGE_READY_FROM_NEW_TAB` e `GEMINI_ERROR`.

O mock da página agora responde `UPDATE_IMAGE` com `{ok:true,persisted:true,domApplied:true}`. Isso está alinhado ao contrato atual de `jobs-dom-ack.js`, que rejeita ACK sem `persisted:true` como `persistence_not_confirmed`; `{ok:true}` sozinho não é prova de persistência.

A suíte exige que `UPDATE_IMAGE` preserve `index`, `newSrc` e `expectAck:true`, mantém o job ativo durante staging e confirma commit/finalização nos pontos apropriados.

## 5. Fingerprint visual

O caso positivo instala `fetch`, `createImageBitmap`, `OffscreenCanvas` e a API real esperada de fingerprint para provar a resposta de hashes e o fechamento do bitmap.

O caso negativo é parametrizado para **dois protocolos literais**:

- `data:image/png;base64,...`;
- `blob:https://reader.test/...`.

Para ambos, a implementação real deve responder `{ok:false,error:'URL inválida para fingerprint visual'}` e `fetch` não pode ser chamado. Isso fecha 156-001 sem depender apenas do nome do teste.

## 6. Downloads e pastas

A suíte cobre `DOWNLOAD_IMAGE`, `SHOW_EXISTING_FOLDER`, `EXPORT_ALL_AND_SHOW` e `OPEN_CHAPTER_FOLDER`, verificando prefixos, quantidade de downloads, reutilização de anchor e ausência de redownload quando o marcador existe.

## 7. Audit request 156-001

**RESOLVIDA localmente.** O antigo título alegava `data/blob`, mas só executava `data:`. A revisão atual usa `test.each` com `data:` e `blob:` literais e exige explicitamente zero `fetch` em ambos.

## 8. Evidência executável

- Workflow focal/background utilizado para a revisão atual: `Claim Gemini Job Selftest` run `36947199617`, job `110651904268`.
- O self-test focal do claim passou e, no mesmo checkout contendo este SHA, o projeto Jest `background` foi executado com `--runInBand --detectOpenHandles`.
- Resultado background: **45/45 suites**, **228/228 testes**, **0 snapshots**, sucesso.
- A revisão também removeu um falso contrato do teste: o mock de `UPDATE_IMAGE` passou a confirmar persistência explicitamente, compatível com o self-test canônico de DOM ACK.

## 9. Limites honestos

- O browser real não é instanciado; APIs Chrome são mocks stateful.
- O teste de fingerprint usa implementações controladas de canvas/bitmap, portanto prova o protocolo do handler e o encadeamento, não performance/qualidade visual de um navegador real.
- Esta Bíblia não afirma que toda a CI/E2E foi executada por esta unidade; a evidência citada é a suíte background relacionada e os contratos diretamente exercitados.

## 10. Fonte integral exata

```js
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getDownloadsMock,
    getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');
const {
    BACKGROUND_PATH,
    flush,
    dispatchToBackground,
    waitFor,
} = require('../../helpers/background-test-utils.js');

describe('background.js - handlers onMessage reais', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let downloadsMock;
    let alarmsMock;
    let backgroundModule;
    let cancelBackgroundDelayTimers;

    async function flushFakeTimerRounds(rounds = 6, stepMs = 1) {
        for (let index = 0; index < rounds; index++) {
            // eslint-disable-next-line no-await-in-loop
            await jest.advanceTimersByTimeAsync(stepMs);
        }
    }

    beforeEach(async () => {
        jest.resetModules();
        jest.useRealTimers();
        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        downloadsMock = getDownloadsMock();
        alarmsMock = getAlarmsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock._installedListeners = [];
        runtimeMock._startupListeners = [];
        runtimeMock.lastError = null;

        await storageMock.clear();
        global.chrome = {
            storage: { local: storageMock },
            tabs: tabsMock,
            alarms: alarmsMock,
            runtime: runtimeMock,
            downloads: downloadsMock,
            scripting: global.chrome?.scripting,
        };

        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);
    });

    afterEach(async () => {
        cancelBackgroundDelayTimers();
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        await storageMock.clear();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('BG-47/BG-48/BG-49/BG-50: GET_TAB_ID, GEMINI_PROGRESS e REQUEST_IMAGE_DATA funcionam com relay correto', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-3', active: true });
        const forwardedMessages = [];

        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            forwardedMessages.push(message);
            if (message.action === 'REQUEST_IMAGE_DATA') {
                sendResponse({ base64: 'data:image/png;base64,IMG_3' });
                return;
            }
            sendResponse({ ok: true });
        });

        const tabIdResult = await dispatchToBackground(runtimeMock, {
            action: 'GET_TAB_ID',
        }, { tab: { id: mangaTab.id } });

        expect(tabIdResult.response).toEqual({ tabId: mangaTab.id });

        const explicitProgress = await dispatchToBackground(runtimeMock, {
            action: 'GEMINI_PROGRESS',
            mangaTabId: mangaTab.id,
            text: 'explicito',
        });
        expect(explicitProgress.response).toEqual({ ok: true });

        backgroundModule.__setState({ activeMangaTabId: mangaTab.id });
        const fallbackProgress = await dispatchToBackground(runtimeMock, {
            action: 'GEMINI_PROGRESS',
            text: 'fallback',
        });
        expect(fallbackProgress.response).toEqual({ ok: true });

        const requestImageData = await dispatchToBackground(runtimeMock, {
            action: 'REQUEST_IMAGE_DATA',
            mangaTabId: mangaTab.id,
            index: 3,
        });
        expect(requestImageData.response).toEqual({ base64: 'data:image/png;base64,IMG_3' });

        const requestImageDataError = await dispatchToBackground(runtimeMock, {
            action: 'REQUEST_IMAGE_DATA',
            mangaTabId: 99999,
            index: 4,
        });
        expect(requestImageDataError.response).toEqual(expect.objectContaining({
            error: expect.stringContaining('Could not establish connection'),
        }));

        expect(forwardedMessages).toContainEqual({ action: 'PROGRESS', text: 'explicito' });
        expect(forwardedMessages).toContainEqual({ action: 'PROGRESS', text: 'fallback' });
        expect(forwardedMessages).toContainEqual({ action: 'REQUEST_IMAGE_DATA', index: 3 });
    });

    test('BG-52/BG-55/BG-56: handlers de imagem e erro atualizam manga tab e disparam finalize', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-4', active: true });
        const forwardedMessages = [];

        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            forwardedMessages.push(message);
            if (message.action === 'UPDATE_IMAGE') {
                sendResponse({ ok: true, persisted: true, domApplied: true });
                return;
            }
            sendResponse({ ok: true });
        });

        jest.useFakeTimers();

        tabsMock._tabs.set(3333, {
            id: 3333, url: 'https://gemini.google.com/app/job-direct',
            active: false, status: 'complete', title: '',
        });
        backgroundModule.__setState({
            activeJobsCount: 1,
            completedJobs: 0,
            currentBatchId: 'batch-direct',
            isProcessing: true,
            activeMangaTabId: mangaTab.id,
            totalJobs: 1,
            jobIndex: [{
                geminiTabId: 3333, jobId: 'job-direct', batchId: 'batch-direct',
                mangaTabId: mangaTab.id, index: 7,
            }],
        });
        storageMock._setStore({
            ...storageMock._getStore(),
            gemini_job_3333: {
                geminiTabId: 3333, jobId: 'job-direct', batchId: 'batch-direct',
                mangaTabId: mangaTab.id, index: 7, executionMode: 'temp_chat',
            },
        });
        const extractedResultPromise = dispatchToBackground(runtimeMock, {
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: mangaTab.id,
            index: 7,
            src: 'data:image/png;base64,FROM_GEMINI',
            jobId: 'job-direct',
        }, { tab: { id: 3333 } });
        await flushFakeTimerRounds(20);
        const extractedResult = await extractedResultPromise;

        expect(extractedResult.response).toEqual({
            ok: true,
            staged: true,
            persisted: true,
        });
        expect(forwardedMessages).toContainEqual(expect.objectContaining({
            action: 'UPDATE_IMAGE',
            index: 7,
            newSrc: 'data:image/png;base64,FROM_GEMINI',
            expectAck: true,
        }));
        expect(backgroundModule.__getState().activeJobsCount).toBe(1);

        const directCommitPromise = dispatchToBackground(runtimeMock, {
            action: 'GEMINI_RESULT_COMMIT',
            mangaTabId: mangaTab.id,
            index: 7,
            jobId: 'job-direct',
        }, { tab: { id: 3333 } });
        await flushFakeTimerRounds(24);
        const directCommit = await directCommitPromise;

        expect(directCommit.response).toEqual({
            ok: true,
            committed: true,
        });
        await jest.advanceTimersByTimeAsync(601);
        await flushFakeTimerRounds(4);
        expect(backgroundModule.__getState().activeJobsCount).toBe(0);

        const extractionTab = await tabsMock.create({ url: 'https://cdn.reader.test/result.png', active: false });
        tabsMock._tabs.set(4444, {
            id: 4444, url: 'https://gemini.google.com/app/job-extraction',
            active: false, status: 'complete', title: '',
        });
        backgroundModule.__setState({
            extractionTabs: {
                [extractionTab.id]: {
                    mangaTabId: mangaTab.id, index: 8, geminiTabId: 4444,
                    jobId: 'job-extraction', batchId: 'batch-extraction',
                },
            },
            activeJobsCount: 1,
            completedJobs: 0,
            currentBatchId: 'batch-extraction',
            isProcessing: true,
            activeMangaTabId: mangaTab.id,
            totalJobs: 1,
            jobIndex: [{
                geminiTabId: 4444, jobId: 'job-extraction', batchId: 'batch-extraction',
                mangaTabId: mangaTab.id, index: 8,
            }],
        });
        storageMock._setStore({
            ...storageMock._getStore(),
            gemini_job_4444: {
                geminiTabId: 4444, jobId: 'job-extraction', batchId: 'batch-extraction',
                mangaTabId: mangaTab.id, index: 8, executionMode: 'temp_chat',
            },
        });

        const readyFromTabPromise = dispatchToBackground(runtimeMock, {
            action: 'IMAGE_READY_FROM_NEW_TAB',
            mangaTabId: mangaTab.id,
            index: 8,
            src: 'data:image/png;base64,FROM_EXTRACTION_TAB',
            geminiTabId: 4444,
            jobId: 'job-extraction',
        }, { tab: { id: extractionTab.id } });
        await flushFakeTimerRounds(28);
        const readyFromTab = await readyFromTabPromise;

        expect(readyFromTab.response).toEqual({
            ok: true,
            staged: true,
            persisted: true,
            committed: true,
        });
        expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);
        expect(forwardedMessages).toContainEqual(expect.objectContaining({
            action: 'UPDATE_IMAGE',
            index: 8,
            newSrc: 'data:image/png;base64,FROM_EXTRACTION_TAB',
            expectAck: true,
        }));

        await jest.advanceTimersByTimeAsync(601);
        await flushFakeTimerRounds(4);
        expect(backgroundModule.__getState().activeJobsCount).toBe(0);

        storageMock._setStore({
            ...storageMock._getStore(),
            debugMode: true,
        });
        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });
        storageMock._setStore({
            ...storageMock._getStore(),
            gemini_job_5555: { geminiTabId: 5555, jobId: 'job-error' },
        });
        const geminiErrorPromise = dispatchToBackground(runtimeMock, {
            action: 'GEMINI_ERROR',
            mangaTabId: mangaTab.id,
            index: 9,
            error: 'Falhou bonito',
            jobId: 'job-error',
        }, { tab: { id: 5555 } });

        await flushFakeTimerRounds(24);
        const geminiError = await geminiErrorPromise;
        expect(geminiError.response).toEqual({ ok: true });

        expect(forwardedMessages).toContainEqual(expect.objectContaining({
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'Falhou bonito',
            imgIndex: 9,
            isDebug: true,
        }));
        expect(backgroundModule.__getState().activeJobsCount).toBe(0);
    });

    test('BG-59: CALCULATE_VISUAL_FINGERPRINT calcula hashes visuais via fetch do service worker', async () => {
        const originalFetch = global.fetch;
        const originalSelf = global.self;
        const originalCreateImageBitmap = global.createImageBitmap;
        const originalOffscreenCanvas = global.OffscreenCanvas;

        const closeBitmap = jest.fn();
        const makePixels = (length) => Uint8ClampedArray.from({ length }, (_value, index) => index % 256);
        const fpApi = {
            calculateDHash: jest.fn(() => 'dhash-16-hex'),
            calculateWHash: jest.fn(() => 'w'.repeat(64)),
            calculatePHash: jest.fn(() => 'p'.repeat(64)),
            calculateRegionalHashes: jest.fn(() => ({
                topLeft: 'tl',
                topRight: 'tr',
                bottomLeft: 'bl',
                bottomRight: 'br',
            })),
        };

        class MockOffscreenCanvas {
            constructor(width, height) {
                this.width = width;
                this.height = height;
            }

            getContext() {
                return {
                    drawImage: jest.fn(),
                    getImageData: jest.fn(() => ({
                        data: makePixels(this.width * this.height * 4),
                    })),
                };
            }
        }

        try {
            runtimeMock._messageListeners = [];
            global.self = global;
            global.MangaTranslatorGtcFingerprint = fpApi;
            global.fetch = jest.fn(async () => ({
                ok: true,
                blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
            }));
            global.createImageBitmap = jest.fn(async () => ({ close: closeBitmap }));
            global.OffscreenCanvas = MockOffscreenCanvas;

            backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
            await flush(8);

            const result = await dispatchToBackground(runtimeMock, {
                action: 'CALCULATE_VISUAL_FINGERPRINT',
                url: 'https://cdn.reader.test/page-001.png',
            });

            expect(result.keepAlive).toBe(true);
            expect(result.response).toEqual(expect.objectContaining({
                ok: true,
                pixelSample: expect.stringMatching(/^[0-9a-f]+$/),
                dHash: 'dhash-16-hex',
                wHash: 'w'.repeat(64),
                pHash: 'p'.repeat(64),
                regionalHashes: {
                    topLeft: 'tl',
                    topRight: 'tr',
                    bottomLeft: 'bl',
                    bottomRight: 'br',
                },
            }));
            expect(result.response.pixelSample).toHaveLength(512);
            expect(global.fetch).toHaveBeenCalledWith('https://cdn.reader.test/page-001.png', {
                credentials: 'omit',
                cache: 'no-store',
            });
            expect(global.createImageBitmap).toHaveBeenCalled();
            expect(fpApi.calculateDHash).toHaveBeenCalled();
            expect(fpApi.calculateWHash).toHaveBeenCalled();
            expect(fpApi.calculatePHash).toHaveBeenCalled();
            expect(fpApi.calculateRegionalHashes).toHaveBeenCalled();
            expect(closeBitmap).toHaveBeenCalled();
        } finally {
            global.fetch = originalFetch;
            global.self = originalSelf;
            delete global.MangaTranslatorGtcFingerprint;
            global.createImageBitmap = originalCreateImageBitmap;
            global.OffscreenCanvas = originalOffscreenCanvas;
        }
    });

    test.each([
        ['data:image/png;base64,AAA', 'data:'],
        ['blob:https://reader.test/1234-5678', 'blob:'],
    ])('BG-59: CALCULATE_VISUAL_FINGERPRINT rejeita %s sem tentar fetch (%s)', async (url) => {
        const fetchSpy = jest.spyOn(global, 'fetch');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'CALCULATE_VISUAL_FINGERPRINT',
            url,
        });

        expect(result.response).toEqual({
            ok: false,
            error: 'URL inválida para fingerprint visual',
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('BG-60/BG-61/BG-63/BG-64: DOWNLOAD_IMAGE, SHOW_EXISTING_FOLDER e EXPORT_ALL_AND_SHOW respeitam prefixos e completude', async () => {
        const downloadSpy = jest.spyOn(downloadsMock, 'download');
        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();

        const downloadImage = await dispatchToBackground(runtimeMock, {
            action: 'DOWNLOAD_IMAGE',
            url: 'data:image/png;base64,AAA',
            filename: 'chap/pagina_001.png',
        });

        expect(downloadImage.response).toEqual(expect.objectContaining({
            filePath: expect.stringContaining('MangaTranslator/chap/pagina_001.png'),
            downloadId: expect.any(Number),
        }));
        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({
            filename: 'MangaTranslator/chap/pagina_001.png',
        }), expect.any(Function));

        const downloadAlreadyPrefixed = await dispatchToBackground(runtimeMock, {
            action: 'DOWNLOAD_IMAGE',
            url: 'data:image/png;base64,BBB',
            filename: 'MangaTranslator/chap/pagina_002.png',
        });

        expect(downloadAlreadyPrefixed.response).toEqual(expect.objectContaining({
            filePath: expect.stringContaining('MangaTranslator/chap/pagina_002.png'),
        }));
        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({
            filename: 'MangaTranslator/chap/pagina_002.png',
        }), expect.any(Function));

        downloadsMock._downloads.set(999, {
            id: 999,
            url: 'data:image/png;base64,MARKER',
            filename: 'C:/Users/TestUser/Downloads/MangaTranslator/Chapter_10/pagina_001.png',
            state: 'complete',
            exists: true,
        });

        const existingFolder = await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'C:/Users/TestUser/Downloads/MangaTranslator/Chapter_10',
            safeTitle: 'Chapter_10',
        });

        expect(existingFolder.response).toEqual({ ok: true });
        expect(showSpy).toHaveBeenCalledWith(999);

        showSpy.mockClear();
        downloadSpy.mockClear();
        const exportAll = await dispatchToBackground(runtimeMock, {
            action: 'EXPORT_ALL_AND_SHOW',
            allDownloads: [
                { url: 'data:image/png;base64,1', filename: 'alpha/pagina_001.png' },
                { url: 'data:image/png;base64,2', filename: 'alpha/pagina_002.png' },
                { url: 'data:image/png;base64,3', filename: 'alpha/pagina_003.png' },
            ],
        });

        expect(exportAll.response).toEqual({ ok: true });
        expect(downloadSpy).toHaveBeenCalledTimes(3);
        expect(showSpy).toHaveBeenCalledTimes(1);
    });

    test('OPEN_CHAPTER_FOLDER reutiliza anchorId existente sem redownload', async () => {
        downloadsMock._downloads.set(444, {
            id: 444,
            url: 'data:image/png;base64,ANCHOR',
            filename: '/home/user/Downloads/MangaTranslator/Capitulo_X/_anchor.png',
            state: 'complete',
            exists: true,
        });

        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();
        const downloadSpy = jest.spyOn(downloadsMock, 'download');

        const openFolder = await dispatchToBackground(runtimeMock, {
            action: 'OPEN_CHAPTER_FOLDER',
            anchorId: 444,
            chapId: 'chap_x',
            safeTitle: 'Capitulo_X',
            images: {
                0: 'data:image/png;base64,PAGE_0',
            },
        });

        expect(openFolder.response).toEqual({ ok: true });
        expect(showSpy).toHaveBeenCalledWith(444);
        expect(downloadSpy).not.toHaveBeenCalled();
    });
});
```

## 11. Cobertura integral por posições

- **1–18:** imports, helpers compartilhados e abertura da suíte.
- **19–35:** variáveis de harness e helper de avanço de fake timers.
- **36–73:** `beforeEach`/`afterEach`, reset de runtime/storage/tabs/downloads e carga do background.
- **74–127:** relays `GET_TAB_ID`, `GEMINI_PROGRESS` e `REQUEST_IMAGE_DATA`.
- **128–295:** staging/commit de imagem, nova tab de extração e `GEMINI_ERROR`, incluindo ACK persistente.
- **296–384:** fingerprint visual positivo via fetch/bitmap/canvas.
- **385–402:** rejeição explícita de `data:` e `blob:` sem `fetch`.
- **403–466:** downloads, exportação e reutilização de pasta existente.
- **467–493:** `OPEN_CHAPTER_FOLDER` com anchor existente.
- **494:** posição vazia correspondente ao LF final.

**Cobertura:** 494/494 posições, contíguas, sem gap ou overlap.

## 12. Autoauditoria

- Source SHA reconfirmado: `1495cd64a92afb7139407eaf7e6055adcbfc1ef3`.
- Fonte integral inserida diretamente do blob atual.
- Nenhum `.skip`, `.only`, `xit`, `xdescribe`, TODO ou FIXME usado para esconder pendência foi encontrado na unidade.
- 156-001 possui estímulo literal `blob:` e `data:`.
- Suíte background relacionada ficou totalmente verde com detecção de handles aberta.
- Unidade deve retornar a `READY_FOR_AUDIT`; aprovação distribuída final permanece responsabilidade das fases independentes.

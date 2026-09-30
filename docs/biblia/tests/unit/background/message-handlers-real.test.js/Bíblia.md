# Bíblia técnica — tests/unit/background/message-handlers-real.test.js

> **Estado documental:** ✅ AUTOAUDITORIA APROVADA PELO AGENTE 4  
> **SHA auditado:** `1c2815cd1f2fecba58a07c568f24d69af0367af3`  
> **Agente:** AGENTE 4  
> **Tipo:** suíte Jest de integração unitária do composition root real do background  
> **Linhas textuais:** **486**  
> **Posições documentais:** **487**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte testa `extension/background.js` pelo seu **listener real de `chrome.runtime.onMessage`**, não por uma cópia local dos handlers. O helper `loadBackgroundModule` lê os bytes reais de `background.js`, acrescenta somente pontos de inspeção de estado para teste e executa o composition root contra mocks stateful de Chrome.

A força principal desta suíte é provar **wiring integrado** entre:

- `background.js`;
- `background/router.js` e o `ACTION_MAP`;
- ações registradas reais;
- state/storage usados por ownership e lifecycle;
- mocks stateful de `chrome.tabs`, `chrome.downloads`, `chrome.runtime`, `chrome.alarms`;
- callbacks assíncronos, timers de finalização e respostas IPC.

Ela complementa suites focais das ações. Quando uma suite focal já possui assertion mais específica, esta Bíblia não promove uma assertion mais fraca deste arquivo a “prova superior”.

## 2. Harness e dependências reais

| Dependência | Papel neste arquivo | Evidência |
|---|---|---|
| `tests/mocks/chrome-api.mock.js` | fornece storage/tabs/downloads/runtime/alarms stateful e `lastError` contextual | 🟨 EXECUTADO INDIRETAMENTE |
| `tests/helpers/load-background-module.js` | executa o `background.js` real e injeta `__getState/__setState` apenas para observação | 🟨 EXECUTADO INDIRETAMENTE |
| `tests/helpers/track-background-delay-timers.js` | captura delays conhecidos de 600 ms/4 s/18 s para teardown | 🟨 EXECUTADO INDIRETAMENTE |
| `tests/helpers/background-test-utils.js` | localiza o único listener, despacha mensagens e drena bootstrap | 🟨 EXECUTADO INDIRETAMENTE |
| `extension/background/router.js` | resolve ações legadas e mantém o canal assíncrono | 🟨 EXECUTADO INDIRETAMENTE |
| ações `get-tab-id`, `relay-progress`, `request-image-data`, `deliver-result`, `commit-result`, `deliver-result-from-tab`, `report-error`, `calculate-visual-fingerprint`, `download-image`, `open-existing-folder`, `export-all`, `download-chapter` | comportamento de produção atravessado pelos casos | ✅ PROVADO DIRETAMENTE para as propriedades explicitamente assertadas abaixo |

## 3. Casos e o que realmente provam

### 3.1 GET_TAB_ID, GEMINI_PROGRESS e REQUEST_IMAGE_DATA

O primeiro caso cria uma aba de mangá real no mock e um receiver. As assertions provam diretamente:

- `GET_TAB_ID` devolve o id da aba remetente;
- `GEMINI_PROGRESS` com `mangaTabId` explícito encaminha `{action:'PROGRESS', text:'explicito'}`;
- o fallback por `state.activeMangaTabId` também encaminha PROGRESS;
- `REQUEST_IMAGE_DATA` encaminha índice 3 e devolve o base64 do content script;
- aba inexistente produz erro contendo “Could not establish connection”.

A persistência `state:'running'` quando GEMINI_PROGRESS vem de uma aba Gemini **não é provada por este caso**, mas existe assertion focal em `actions-low-risk.test.js`.

### 3.2 GEMINI_IMAGE_EXTRACTED → GEMINI_RESULT_COMMIT

O cenário semeia `jobIndex` e `gemini_job_3333`, despacha o staging pelo remetente correto e prova:

- resposta `{ok:true, staged:true, persisted:true}`;
- IPC `UPDATE_IMAGE` com índice 7, Data URL e `expectAck:true`;
- `activeJobsCount` permanece 1 após staging;
- commit posterior responde `{ok:true, committed:true}`;
- depois do delay de finalização, `activeJobsCount` chega a 0.

Isso prova a separação operacional entre **persistir/aplicar** e **finalizar/contabilizar**.

### 3.3 IMAGE_READY_FROM_NEW_TAB

O teste cria uma aba auxiliar mapeada em `extractionTabs` e um job Gemini persistido. Prova diretamente:

- resposta `staged/persisted/committed`;
- remoção da aba auxiliar;
- envio de `UPDATE_IMAGE` com índice 8 e Data URL correta;
- decremento de `activeJobsCount` após finalização.

### 3.4 GEMINI_ERROR

Com `debugMode:true` e job persistido, prova:

- resposta legada `{ok:true}`;
- envio de `SHOW_ERROR_INTEGRATED` contendo mensagem “Falhou bonito”, índice 9 e `isDebug:true`;
- finalização reduz `activeJobsCount` a 0.

Campos adicionais `jobId/batchId` do payload são provados de forma mais específica em `report-error-action.test.js`.

### 3.5 CALCULATE_VISUAL_FINGERPRINT

No caminho HTTP, a suíte instala somente primitives ausentes do ambiente Jest e mantém a ação real. Prova:

- canal assíncrono aberto (`keepAlive:true`);
- retorno de pixelSample hexadecimal de 512 chars;
- propagação de dHash/wHash/pHash/regionalHashes dos algoritmos injetados;
- `fetch` com `credentials:'omit'` e `cache:'no-store'`;
- uso de createImageBitmap e dos quatro algoritmos observados;
- fechamento do bitmap.

O caso negativo prova que uma URL `data:` é recusada com mensagem específica e **não chama fetch**.

**Limite importante:** o nome do teste diz “data/blob URL”, mas o corpo envia somente `data:`. A suite focal `calculate-visual-fingerprint-action.test.js` cobre `data:` e `chrome-extension:`, não um `blob:` literal. Isso gera a solicitação 156-001.

### 3.6 Downloads e pastas

O bloco prova:

- `DOWNLOAD_IMAGE` prefixa `MangaTranslator/` quando ausente;
- filename já prefixado não recebe prefixo duplicado;
- `SHOW_EXISTING_FOLDER` encontra download por path e chama `show(999)`;
- `EXPORT_ALL_AND_SHOW` dispara exatamente três downloads e uma abertura;
- `OPEN_CHAPTER_FOLDER` com `anchorId` existente chama `show(444)` e não baixa novamente.

A suite focal `export-all-action.test.js` fixa também **qual** id final é aberto; aqui há apenas assertion de cardinalidade para o show do export.

## 4. Matriz de evidência

| Propriedade | Classificação |
|---|---|
| background.js real é carregado e registra um listener onMessage | ✅ PROVADO DIRETAMENTE pelo harness + dispatch bem-sucedido |
| GET_TAB_ID retorna sender.tab.id | ✅ PROVADO DIRETAMENTE |
| progress explícito chega à aba alvo | ✅ PROVADO DIRETAMENTE |
| fallback de progress usa activeMangaTabId | ✅ PROVADO DIRETAMENTE |
| relay-progress persiste job como running quando há sender Gemini | ✅ PROVADO DIRETAMENTE em `actions-low-risk.test.js`; não por este caso |
| REQUEST_IMAGE_DATA sucesso | ✅ PROVADO DIRETAMENTE |
| REQUEST_IMAGE_DATA lastError por aba sem receiver | ✅ PROVADO DIRETAMENTE |
| staging não finaliza job antes do commit | ✅ PROVADO DIRETAMENTE |
| commit finaliza/decrementa job | ✅ PROVADO DIRETAMENTE |
| resultado via aba auxiliar remove a aba e finaliza | ✅ PROVADO DIRETAMENTE |
| GEMINI_ERROR encaminha mensagem/índice/debug e finaliza | ✅ PROVADO DIRETAMENTE |
| fingerprint HTTP usa opções de fetch e fecha bitmap | ✅ PROVADO DIRETAMENTE |
| pixelSample tem 512 hex chars | ✅ PROVADO DIRETAMENTE |
| dHash/wHash/pHash/regionalHashes são chamados | ✅ PROVADO DIRETAMENTE |
| center-crop hashes | ✅ PROVADO DIRETAMENTE na suite focal `calculate-visual-fingerprint-action.test.js`; não neste caso |
| data: é rejeitado antes de fetch | ✅ PROVADO DIRETAMENTE |
| blob: é rejeitado antes de fetch | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| prefixo de DOWNLOAD_IMAGE sem duplicação | ✅ PROVADO DIRETAMENTE |
| SHOW_EXISTING_FOLDER abre id encontrado | ✅ PROVADO DIRETAMENTE |
| EXPORT_ALL baixa três itens e abre uma vez | ✅ PROVADO DIRETAMENTE |
| EXPORT_ALL abre especificamente o último id concluído | ✅ PROVADO DIRETAMENTE em `export-all-action.test.js`; neste arquivo, apenas cardinalidade |
| OPEN_CHAPTER_FOLDER reutiliza anchor sem redownload | ✅ PROVADO DIRETAMENTE |
| inclusão do arquivo no projeto Jest background | 🟦 GATE ESTÁTICO ESPECÍFICO — `jest.config.js` usa `tests/unit/background/**/*.test.js` |

## 5. Invariantes e riscos

1. Cada caso deve começar com exatamente um listener onMessage recém-carregado.
2. Storage/jobIndex precisam representar o mesmo job que o sender afirma possuir; caso contrário as ações de produção rejeitam ownership.
3. Staging durável e commit/finalização são fases diferentes; o contador não deve cair no staging.
4. Aba auxiliar só pode ser removida depois de staging persistido.
5. Timers de 600 ms/4 s/18 s pertencem ao caso que os criou e não podem sobreviver ao teardown.
6. `chrome.runtime.lastError` precisa ser observado durante callback, não depois.
7. O teste de fingerprint altera globals e deve restaurá-los em `finally`.
8. Os spies de downloads precisam preservar a implementação stateful quando a sequência depende dos ids/estado do mock.
9. Contagens de chamadas precisam ser limpas entre subcenários para não misturar DOWNLOAD_IMAGE e EXPORT_ALL.
10. Título de teste não é evidência: “data/blob” não transforma o caso `data:` em prova de `blob:`.

## 6. Lacunas e complementaridade

- `waitFor` é importado do helper, mas não é usado neste arquivo; isso é dívida de limpeza, não lacuna funcional.
- GET_TAB_ID sem `sender.tab` não é exercitado aqui.
- Relay de progress com persistência do job remetente é coberto por `actions-low-risk.test.js`.
- Guards negativos de ownership/identidade/validação para deliver/commit/from-tab/error são cobertos por suites focais correspondentes.
- Falhas internas específicas de download/export/marker não são exaustivas aqui; suites focais complementam alguns ramos.
- Este arquivo não prova um `blob:` literal no gate de protocolo do fingerprint.

## 7. Solicitação ao auditor

### 156-001 — TEST_REQUIRED — OPEN

**Encontrado:** o caso chamado “CALCULATE_VISUAL_FINGERPRINT rejeita data/blob URL sem tentar fetch” envia somente `data:image/png...`.

**Evidência atual:** este arquivo prova `data:`; `calculate-visual-fingerprint-action.test.js` também prova `data:` e um protocolo `chrome-extension:`. A implementação rejeita genericamente protocolos fora de HTTP(S), mas não foi localizada assertion com `blob:` literal.

**Evidência ausente:** dispatch real com `url:'blob:...'`, resposta de URL inválida e `fetch` não chamado.

**Ação esperada:** adicionar caso focal `blob:` usando a implementação real **ou** corrigir o título deste teste para não afirmar cobertura específica de blob, conforme o contrato desejado.

**Risco:** revisores podem interpretar o nome do teste como prova de um protocolo que não é efetivamente exercitado.

## 8. Fonte integral exata

~~~javascript
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

    test('BG-59: CALCULATE_VISUAL_FINGERPRINT rejeita data/blob URL sem tentar fetch', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'CALCULATE_VISUAL_FINGERPRINT',
            url: 'data:image/png;base64,AAA',
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
~~~

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** <code>const {</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: const {.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 2

**Fonte:** <code>    getRuntimeMock,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: getRuntimeMock,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 3

**Fonte:** <code>    getStorageMock,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: getStorageMock,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 4

**Fonte:** <code>    getTabsMock,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: getTabsMock,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 5

**Fonte:** <code>    getDownloadsMock,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: getDownloadsMock,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 6

**Fonte:** <code>    getAlarmsMock,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: getAlarmsMock,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 7

**Fonte:** <code>} = require('../../mocks/chrome-api.mock.js');</code>

**O que faz:** Importa dependência usada pelo harness: } = require('../../mocks/chrome-api.mock.js');.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Trocar por uma cópia local do comportamento reduziria a força do teste; trocar o caminho pode deixar de carregar o módulo real pretendido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 8

**Fonte:** <code>const { loadBackgroundModule } = require('../../helpers/load-background-module.js');</code>

**O que faz:** Importa dependência usada pelo harness: const { loadBackgroundModule } = require('../../helpers/load-background-module.js');.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Trocar por uma cópia local do comportamento reduziria a força do teste; trocar o caminho pode deixar de carregar o módulo real pretendido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 9

**Fonte:** <code>const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');</code>

**O que faz:** Importa dependência usada pelo harness: const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Trocar por uma cópia local do comportamento reduziria a força do teste; trocar o caminho pode deixar de carregar o módulo real pretendido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 10

**Fonte:** <code>const {</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: const {.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 11

**Fonte:** <code>    BACKGROUND_PATH,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: BACKGROUND_PATH,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 12

**Fonte:** <code>    flush,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: flush,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 13

**Fonte:** <code>    dispatchToBackground,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: dispatchToBackground,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 14

**Fonte:** <code>    waitFor,</code>

**O que faz:** Compõe o bloco “imports e harness” com a instrução: waitFor,.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 15

**Fonte:** <code>} = require('../../helpers/background-test-utils.js');</code>

**O que faz:** Importa dependência usada pelo harness: } = require('../../helpers/background-test-utils.js');.

**Como e por que:** Carrega os mocks Chrome stateful, o loader que executa os bytes reais de background.js, o rastreador de timers atrasados e utilitários de dispatch/flush.

**Por que uma alternativa ingênua seria pior:** Trocar por uma cópia local do comportamento reduziria a força do teste; trocar o caminho pode deixar de carregar o módulo real pretendido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 16

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “imports e harness”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 17

**Fonte:** <code>describe('background.js - handlers onMessage reais', () =&gt; {</code>

**O que faz:** Abre a suíte Jest que declara explicitamente testar handlers onMessage reais do background.

**Como e por que:** O escopo agrupa os seis cenários e compartilha setup/teardown, mas cada caso reconstrói o background e o estado Chrome.

**Por que uma alternativa ingênua seria pior:** Compartilhar estado sem reset entre casos criaria falsos positivos, listeners duplicados e flakiness.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 18

**Fonte:** <code>    let runtimeMock;</code>

**O que faz:** Declara referência mutável de fixture/harness: let runtimeMock.

**Como e por que:** A referência é preenchida no beforeEach para cada caso, evitando depender de instâncias/estado deixados pelo caso anterior.

**Por que uma alternativa ingênua seria pior:** Reusar valores antigos sem reset pode contaminar assertions sobre tabs, storage, alarms ou downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 19

**Fonte:** <code>    let storageMock;</code>

**O que faz:** Declara referência mutável de fixture/harness: let storageMock.

**Como e por que:** A referência é preenchida no beforeEach para cada caso, evitando depender de instâncias/estado deixados pelo caso anterior.

**Por que uma alternativa ingênua seria pior:** Reusar valores antigos sem reset pode contaminar assertions sobre tabs, storage, alarms ou downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 20

**Fonte:** <code>    let tabsMock;</code>

**O que faz:** Declara referência mutável de fixture/harness: let tabsMock.

**Como e por que:** A referência é preenchida no beforeEach para cada caso, evitando depender de instâncias/estado deixados pelo caso anterior.

**Por que uma alternativa ingênua seria pior:** Reusar valores antigos sem reset pode contaminar assertions sobre tabs, storage, alarms ou downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 21

**Fonte:** <code>    let downloadsMock;</code>

**O que faz:** Declara referência mutável de fixture/harness: let downloadsMock.

**Como e por que:** A referência é preenchida no beforeEach para cada caso, evitando depender de instâncias/estado deixados pelo caso anterior.

**Por que uma alternativa ingênua seria pior:** Reusar valores antigos sem reset pode contaminar assertions sobre tabs, storage, alarms ou downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 22

**Fonte:** <code>    let alarmsMock;</code>

**O que faz:** Declara referência mutável de fixture/harness: let alarmsMock.

**Como e por que:** A referência é preenchida no beforeEach para cada caso, evitando depender de instâncias/estado deixados pelo caso anterior.

**Por que uma alternativa ingênua seria pior:** Reusar valores antigos sem reset pode contaminar assertions sobre tabs, storage, alarms ou downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 23

**Fonte:** <code>    let backgroundModule;</code>

**O que faz:** Declara referência mutável de fixture/harness: let backgroundModule.

**Como e por que:** A referência é preenchida no beforeEach para cada caso, evitando depender de instâncias/estado deixados pelo caso anterior.

**Por que uma alternativa ingênua seria pior:** Reusar valores antigos sem reset pode contaminar assertions sobre tabs, storage, alarms ou downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 24

**Fonte:** <code>    let cancelBackgroundDelayTimers;</code>

**O que faz:** Declara referência mutável de fixture/harness: let cancelBackgroundDelayTimers.

**Como e por que:** A referência é preenchida no beforeEach para cada caso, evitando depender de instâncias/estado deixados pelo caso anterior.

**Por que uma alternativa ingênua seria pior:** Reusar valores antigos sem reset pode contaminar assertions sobre tabs, storage, alarms ou downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 25

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “escopo da suíte e helper de fake timers”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 26

**Fonte:** <code>    async function flushFakeTimerRounds(rounds = 6, stepMs = 1) {</code>

**O que faz:** Define helper assíncrono para avançar fake timers em pequenas rodadas.

**Como e por que:** Alguns fluxos do background encadeiam Promises/callbacks/timers; rodadas curtas permitem que cada camada progrida sem saltar diretamente todos os timers longos.

**Por que uma alternativa ingênua seria pior:** Avançar todo o relógio de uma vez poderia disparar cleanup/finalizações que o teste pretende observar em etapas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 27

**Fonte:** <code>        for (let index = 0; index &lt; rounds; index++) {</code>

**O que faz:** Itera a quantidade pedida de rodadas de drenagem dos fake timers.

**Como e por que:** Cada iteração avança stepMs e cede ao scheduler assíncrono do Jest.

**Por que uma alternativa ingênua seria pior:** Um único avanço pode não liberar callbacks criados pela rodada anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 28

**Fonte:** <code>            // eslint-disable-next-line no-await-in-loop</code>

**O que faz:** Documenta localmente uma exceção/regra do teste.

**Como e por que:** O comentário pertence a “escopo da suíte e helper de fake timers” e explica por que a instrução adjacente foge de uma regra geral (por exemplo, await em loop).

**Por que uma alternativa ingênua seria pior:** Sem a justificativa, um cleanup automático ou lint-fix poderia alterar uma decisão deliberada sem contexto.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 29

**Fonte:** <code>            await jest.advanceTimersByTimeAsync(stepMs);</code>

**O que faz:** Avança o relógio falso do Jest (await jest.advanceTimersByTimeAsync(stepMs);).

**Como e por que:** O avanço assíncrono deixa callbacks/promises associados ao timer executarem antes da próxima assertion.

**Por que uma alternativa ingênua seria pior:** Usar avanço síncrono em fluxo com Promises pode observar estado intermediário e tornar o teste intermitente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 30

**Fonte:** <code>        }</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “escopo da suíte e helper de fake timers”.

**Como e por que:** Define o estado compartilhado por caso e um helper que avança timers falsos em rodadas curtas para drenar cadeias assíncronas do background.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 31

**Fonte:** <code>    }</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “escopo da suíte e helper de fake timers”.

**Como e por que:** Define o estado compartilhado por caso e um helper que avança timers falsos em rodadas curtas para drenar cadeias assíncronas do background.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 32

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “beforeEach e inicialização real do background”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 33

**Fonte:** <code>    beforeEach(async () =&gt; {</code>

**O que faz:** Inicia o setup isolado de cada caso.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Sem setup por caso, listeners e estado persistente poderiam acumular.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 34

**Fonte:** <code>        jest.resetModules();</code>

**O que faz:** Limpa o cache de módulos Jest antes de carregar novamente o background real.

**Como e por que:** Garante nova execução do composition root e novo registro do listener com o global.chrome recomposto.

**Por que uma alternativa ingênua seria pior:** Sem reset, o teste poderia usar closures/estado de uma carga anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 35

**Fonte:** <code>        jest.useRealTimers();</code>

**O que faz:** Força timers reais no início/fim do caso.

**Como e por que:** Evita herdar fake timers de um cenário anterior; os casos que precisam de fake timers os ativam explicitamente.

**Por que uma alternativa ingênua seria pior:** Timer mode herdado é fonte clássica de hangs e callbacks que nunca disparam.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 36

**Fonte:** <code>        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();</code>

**O que faz:** Instala rastreamento dos delays reais conhecidos do background.

**Como e por que:** O helper intercepta apenas 600 ms, 4 s e 18 s e devolve função de cancelamento para teardown.

**Por que uma alternativa ingênua seria pior:** Sem ownership explícito desses timers, o último teste do worker pode deixá-lo aberto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 37

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “beforeEach e inicialização real do background”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 38

**Fonte:** <code>        runtimeMock = getRuntimeMock();</code>

**O que faz:** Obtém a instância stateful do mock Chrome usada pelo caso: runtimeMock = getRuntimeMock();.

**Como e por que:** As instâncias são fornecidas pelo módulo de mocks e representam as APIs que o background real recebe.

**Por que uma alternativa ingênua seria pior:** Criar mocks incompatíveis ad hoc por caso poderia divergir da semântica compartilhada das outras suítes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 39

**Fonte:** <code>        storageMock = getStorageMock();</code>

**O que faz:** Obtém a instância stateful do mock Chrome usada pelo caso: storageMock = getStorageMock();.

**Como e por que:** As instâncias são fornecidas pelo módulo de mocks e representam as APIs que o background real recebe.

**Por que uma alternativa ingênua seria pior:** Criar mocks incompatíveis ad hoc por caso poderia divergir da semântica compartilhada das outras suítes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 40

**Fonte:** <code>        tabsMock = getTabsMock();</code>

**O que faz:** Obtém a instância stateful do mock Chrome usada pelo caso: tabsMock = getTabsMock();.

**Como e por que:** As instâncias são fornecidas pelo módulo de mocks e representam as APIs que o background real recebe.

**Por que uma alternativa ingênua seria pior:** Criar mocks incompatíveis ad hoc por caso poderia divergir da semântica compartilhada das outras suítes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 41

**Fonte:** <code>        downloadsMock = getDownloadsMock();</code>

**O que faz:** Obtém a instância stateful do mock Chrome usada pelo caso: downloadsMock = getDownloadsMock();.

**Como e por que:** As instâncias são fornecidas pelo módulo de mocks e representam as APIs que o background real recebe.

**Por que uma alternativa ingênua seria pior:** Criar mocks incompatíveis ad hoc por caso poderia divergir da semântica compartilhada das outras suítes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 42

**Fonte:** <code>        alarmsMock = getAlarmsMock();</code>

**O que faz:** Obtém a instância stateful do mock Chrome usada pelo caso: alarmsMock = getAlarmsMock();.

**Como e por que:** As instâncias são fornecidas pelo módulo de mocks e representam as APIs que o background real recebe.

**Por que uma alternativa ingênua seria pior:** Criar mocks incompatíveis ad hoc por caso poderia divergir da semântica compartilhada das outras suítes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 43

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “beforeEach e inicialização real do background”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 44

**Fonte:** <code>        runtimeMock._messageListeners = [];</code>

**O que faz:** Zera listeners de runtime antes de recarregar o background: runtimeMock._messageListeners = [];.

**Como e por que:** O loader executará novamente o composition root, portanto a lista precisa começar limpa para getBackgroundListener encontrar exatamente um handler.

**Por que uma alternativa ingênua seria pior:** Listener duplicado faria uma mesma mensagem executar mais de uma vez ou invalidaria o helper de dispatch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 45

**Fonte:** <code>        runtimeMock._connectListeners = [];</code>

**O que faz:** Zera listeners de runtime antes de recarregar o background: runtimeMock._connectListeners = [];.

**Como e por que:** O loader executará novamente o composition root, portanto a lista precisa começar limpa para getBackgroundListener encontrar exatamente um handler.

**Por que uma alternativa ingênua seria pior:** Listener duplicado faria uma mesma mensagem executar mais de uma vez ou invalidaria o helper de dispatch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 46

**Fonte:** <code>        runtimeMock._installedListeners = [];</code>

**O que faz:** Zera listeners de runtime antes de recarregar o background: runtimeMock._installedListeners = [];.

**Como e por que:** O loader executará novamente o composition root, portanto a lista precisa começar limpa para getBackgroundListener encontrar exatamente um handler.

**Por que uma alternativa ingênua seria pior:** Listener duplicado faria uma mesma mensagem executar mais de uma vez ou invalidaria o helper de dispatch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 47

**Fonte:** <code>        runtimeMock._startupListeners = [];</code>

**O que faz:** Zera listeners de runtime antes de recarregar o background: runtimeMock._startupListeners = [];.

**Como e por que:** O loader executará novamente o composition root, portanto a lista precisa começar limpa para getBackgroundListener encontrar exatamente um handler.

**Por que uma alternativa ingênua seria pior:** Listener duplicado faria uma mesma mensagem executar mais de uma vez ou invalidaria o helper de dispatch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 48

**Fonte:** <code>        runtimeMock.lastError = null;</code>

**O que faz:** Limpa chrome.runtime.lastError residual.

**Como e por que:** A API Chrome expõe lastError de forma contextual ao callback; o teste precisa começar sem erro anterior.

**Por que uma alternativa ingênua seria pior:** Um lastError stale pode converter caminho de sucesso em falha artificial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 49

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “beforeEach e inicialização real do background”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 50

**Fonte:** <code>        await storageMock.clear();</code>

**O que faz:** Limpa storage.local simulado.

**Como e por que:** Jobs, debugMode e journal são persistidos nesse mock; cada teste deve semear apenas os registros relevantes.

**Por que uma alternativa ingênua seria pior:** Registro persistido de outro caso pode fazer ownership/commit passar indevidamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 51

**Fonte:** <code>        global.chrome = {</code>

**O que faz:** Recompõe o objeto global chrome entregue ao background real.

**Como e por que:** Storage, tabs, alarms, runtime e downloads apontam para os mocks stateful; scripting é preservado do mock global quando disponível.

**Por que uma alternativa ingênua seria pior:** Omitir uma API usada no bootstrap pode falhar antes de atingir o comportamento testado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 52

**Fonte:** <code>            storage: { local: storageMock },</code>

**O que faz:** Compõe o bloco “beforeEach e inicialização real do background” com a instrução: storage: { local: storageMock },.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 53

**Fonte:** <code>            tabs: tabsMock,</code>

**O que faz:** Compõe o bloco “beforeEach e inicialização real do background” com a instrução: tabs: tabsMock,.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 54

**Fonte:** <code>            alarms: alarmsMock,</code>

**O que faz:** Compõe o bloco “beforeEach e inicialização real do background” com a instrução: alarms: alarmsMock,.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 55

**Fonte:** <code>            runtime: runtimeMock,</code>

**O que faz:** Compõe o bloco “beforeEach e inicialização real do background” com a instrução: runtime: runtimeMock,.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 56

**Fonte:** <code>            downloads: downloadsMock,</code>

**O que faz:** Compõe o bloco “beforeEach e inicialização real do background” com a instrução: downloads: downloadsMock,.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 57

**Fonte:** <code>            scripting: global.chrome?.scripting,</code>

**O que faz:** Compõe o bloco “beforeEach e inicialização real do background” com a instrução: scripting: global.chrome?.scripting,.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 58

**Fonte:** <code>        };</code>

**O que faz:** Compõe o bloco “beforeEach e inicialização real do background” com a instrução: };.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 59

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “beforeEach e inicialização real do background”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 60

**Fonte:** <code>        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);</code>

**O que faz:** Carrega e executa os bytes reais de extension/background.js com instrumentação de teste.

**Como e por que:** O loader acrescenta somente getters/setters/exports de inspeção e executa o fonte com chrome/fetch/FileReader reais do ambiente de teste.

**Por que uma alternativa ingênua seria pior:** Mockar o background inteiro eliminaria justamente o wiring onMessage que esta suíte pretende validar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 61

**Fonte:** <code>        await flush(8);</code>

**O que faz:** Drena tarefas assíncronas do bootstrap do background antes de iniciar assertions.

**Como e por que:** flush usa sucessivos setTimeout(0), permitindo concluir callbacks de storage/registro inicial.

**Por que uma alternativa ingênua seria pior:** Despachar mensagens cedo demais pode observar estado ainda não restaurado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 62

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “beforeEach e inicialização real do background”.

**Como e por que:** Reseta módulos/listeners e storage, recompõe global.chrome com os mocks correntes, carrega o background.js real instrumentado e drena sua inicialização assíncrona.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 63

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “beforeEach e inicialização real do background”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 64

**Fonte:** <code>    afterEach(async () =&gt; {</code>

**O que faz:** Inicia o teardown obrigatório de cada caso.

**Como e por que:** Cancela timers atrasados pertencentes ao caso, limpa alarms/tabs/downloads/storage e restaura timers/mocks para impedir vazamento entre testes.

**Por que uma alternativa ingênua seria pior:** Timers longos do background podem manter worker vivo e interferir no caso seguinte se não forem cancelados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 65

**Fonte:** <code>        cancelBackgroundDelayTimers();</code>

**O que faz:** Cancela delays de background ainda pertencentes ao caso corrente.

**Como e por que:** O helper remove timers conhecidos sem alterar o código de produção.

**Por que uma alternativa ingênua seria pior:** Deixar 4 s/18 s pendentes pode causar open handles e mutações tardias.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 66

**Fonte:** <code>        alarmsMock.clearAll();</code>

**O que faz:** Remove estado transitório do mock durante teardown: alarmsMock.clearAll();.

**Como e por que:** Cancela timers atrasados pertencentes ao caso, limpa alarms/tabs/downloads/storage e restaura timers/mocks para impedir vazamento entre testes.

**Por que uma alternativa ingênua seria pior:** Estado transitório acumulado altera buscas, contagens e callbacks dos testes seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 67

**Fonte:** <code>        tabsMock._tabs.clear();</code>

**O que faz:** Remove estado transitório do mock durante teardown: tabsMock._tabs.clear();.

**Como e por que:** Cancela timers atrasados pertencentes ao caso, limpa alarms/tabs/downloads/storage e restaura timers/mocks para impedir vazamento entre testes.

**Por que uma alternativa ingênua seria pior:** Estado transitório acumulado altera buscas, contagens e callbacks dos testes seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 68

**Fonte:** <code>        downloadsMock._downloads.clear();</code>

**O que faz:** Remove estado transitório do mock durante teardown: downloadsMock._downloads.clear();.

**Como e por que:** Cancela timers atrasados pertencentes ao caso, limpa alarms/tabs/downloads/storage e restaura timers/mocks para impedir vazamento entre testes.

**Por que uma alternativa ingênua seria pior:** Estado transitório acumulado altera buscas, contagens e callbacks dos testes seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 69

**Fonte:** <code>        await storageMock.clear();</code>

**O que faz:** Limpa storage.local simulado.

**Como e por que:** Jobs, debugMode e journal são persistidos nesse mock; cada teste deve semear apenas os registros relevantes.

**Por que uma alternativa ingênua seria pior:** Registro persistido de outro caso pode fazer ownership/commit passar indevidamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 70

**Fonte:** <code>        jest.useRealTimers();</code>

**O que faz:** Força timers reais no início/fim do caso.

**Como e por que:** Evita herdar fake timers de um cenário anterior; os casos que precisam de fake timers os ativam explicitamente.

**Por que uma alternativa ingênua seria pior:** Timer mode herdado é fonte clássica de hangs e callbacks que nunca disparam.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 71

**Fonte:** <code>        jest.restoreAllMocks();</code>

**O que faz:** Restaura spies/mocks substituídos por jest.spyOn.

**Como e por que:** Particularmente importante para downloads.show/download e fetch usados em cenários posteriores.

**Por que uma alternativa ingênua seria pior:** Spy persistente pode mascarar chamadas reais do mock no próximo caso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 72

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “afterEach e isolamento”.

**Como e por que:** Cancela timers atrasados pertencentes ao caso, limpa alarms/tabs/downloads/storage e restaura timers/mocks para impedir vazamento entre testes.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 73

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “afterEach e isolamento”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 74

**Fonte:** <code>    test('BG-47/BG-48/BG-49/BG-50: GET_TAB_ID, GEMINI_PROGRESS e REQUEST_IMAGE_DATA funcionam com relay correto', async () =&gt; {</code>

**O que faz:** Declara um caso Jest: test('BG-47/BG-48/BG-49/BG-50: GET_TAB_ID, GEMINI_PROGRESS e REQUEST_IMAGE_DATA funcionam com relay correto', async () => {

**Como e por que:** O caso pertence ao bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” e usa dispatchToBackground para atravessar o listener real em vez de chamar uma função copiada.

**Por que uma alternativa ingênua seria pior:** Testar somente helpers/mocks sem passar pelo listener e roteador poderia deixar regressões de wiring invisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 75

**Fonte:** <code>        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-3', active: true });</code>

**O que faz:** Cria uma aba stateful no mock de tabs com URL/estado definidos pelo cenário.

**Como e por que:** A aba recebe id real do mock e passa a ser alvo de mensagens do background.

**Por que uma alternativa ingênua seria pior:** Usar id inventado sem registrar a aba impediria testar search/remove/show/roteamento de forma coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 76

**Fonte:** <code>        const forwardedMessages = [];</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: const forwardedMessages = [];.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 77

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 78

**Fonte:** <code>        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) =&gt; {</code>

**O que faz:** Registra um receiver de content script na aba de mangá simulada.

**Como e por que:** chrome.tabs.sendMessage do background passa por esse handler e o teste captura payloads encaminhados.

**Por que uma alternativa ingênua seria pior:** Mockar sendMessage diretamente perderia a prova de integração com o mock stateful e sua lastError.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 79

**Fonte:** <code>            forwardedMessages.push(message);</code>

**O que faz:** Captura cada mensagem realmente enviada à aba de mangá.

**Como e por que:** A lista é usada por assertions posteriores para provar PROGRESS, REQUEST_IMAGE_DATA, UPDATE_IMAGE e SHOW_ERROR_INTEGRATED.

**Por que uma alternativa ingênua seria pior:** Afirmar apenas a resposta do handler não provaria o payload encaminhado ao content script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 80

**Fonte:** <code>            if (message.action === 'REQUEST_IMAGE_DATA') {</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: if (message.action === 'REQUEST_IMAGE_DATA') {.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 81

**Fonte:** <code>                sendResponse({ base64: 'data:image/png;base64,IMG_3' });</code>

**O que faz:** Emula a resposta do content script à mensagem recebida: sendResponse({ base64: 'data:image/png;base64,IMG_3' });.

**Como e por que:** O callback percorre o mock chrome.tabs.sendMessage e retorna à ação real do background.

**Por que uma alternativa ingênua seria pior:** Não responder em fluxos que esperam ACK deixaria a Promise pendente ou acionaria timeout.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 82

**Fonte:** <code>                return;</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: return;.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 83

**Fonte:** <code>            }</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 84

**Fonte:** <code>            sendResponse({ ok: true });</code>

**O que faz:** Emula a resposta do content script à mensagem recebida: sendResponse({ ok: true });.

**Como e por que:** O callback percorre o mock chrome.tabs.sendMessage e retorna à ação real do background.

**Por que uma alternativa ingênua seria pior:** Não responder em fluxos que esperam ACK deixaria a Promise pendente ou acionaria timeout.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 85

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 86

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 87

**Fonte:** <code>        const tabIdResult = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 88

**Fonte:** <code>            action: 'GET_TAB_ID',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'GET_TAB_ID',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 89

**Fonte:** <code>        }, { tab: { id: mangaTab.id } });</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: }, { tab: { id: mangaTab.id } });.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 90

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 91

**Fonte:** <code>        expect(tabIdResult.response).toEqual({ tabId: mangaTab.id });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(tabIdResult.response).toEqual({ tabId: mangaTab.id });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 92

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 93

**Fonte:** <code>        const explicitProgress = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 94

**Fonte:** <code>            action: 'GEMINI_PROGRESS',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'GEMINI_PROGRESS',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 95

**Fonte:** <code>            mangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: mangaTabId: mangaTab.id,.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 96

**Fonte:** <code>            text: 'explicito',</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: text: 'explicito',.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 97

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 98

**Fonte:** <code>        expect(explicitProgress.response).toEqual({ ok: true });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(explicitProgress.response).toEqual({ ok: true });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 99

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 100

**Fonte:** <code>        backgroundModule.__setState({ activeMangaTabId: mangaTab.id });</code>

**O que faz:** Injeta estado interno necessário no background real instrumentado.

**Como e por que:** O setter anexado pelo loader escreve no mesmo state() usado pelos handlers, permitindo montar activeMangaTabId, jobIndex, contadores e extractionTabs.

**Por que uma alternativa ingênua seria pior:** Substituir o módulo por objeto fake não provaria integração com o state real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 101

**Fonte:** <code>        const fallbackProgress = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 102

**Fonte:** <code>            action: 'GEMINI_PROGRESS',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'GEMINI_PROGRESS',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 103

**Fonte:** <code>            text: 'fallback',</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: text: 'fallback',.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 104

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 105

**Fonte:** <code>        expect(fallbackProgress.response).toEqual({ ok: true });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(fallbackProgress.response).toEqual({ ok: true });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 106

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 107

**Fonte:** <code>        const requestImageData = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 108

**Fonte:** <code>            action: 'REQUEST_IMAGE_DATA',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'REQUEST_IMAGE_DATA',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 109

**Fonte:** <code>            mangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: mangaTabId: mangaTab.id,.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 110

**Fonte:** <code>            index: 3,</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: index: 3,.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 111

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 112

**Fonte:** <code>        expect(requestImageData.response).toEqual({ base64: 'data:image/png;base64,IMG_3' });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(requestImageData.response).toEqual({ base64: 'data:image/png;base64,IMG_3' });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 113

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 114

**Fonte:** <code>        const requestImageDataError = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 115

**Fonte:** <code>            action: 'REQUEST_IMAGE_DATA',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'REQUEST_IMAGE_DATA',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 116

**Fonte:** <code>            mangaTabId: 99999,</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: mangaTabId: 99999,.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 117

**Fonte:** <code>            index: 4,</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: index: 4,.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 118

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 119

**Fonte:** <code>        expect(requestImageDataError.response).toEqual(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(requestImageDataError.response).toEqual(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 120

**Fonte:** <code>            error: expect.stringContaining('Could not establish connection'),</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: error: expect.stringContaining('Could not establish connection'),.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 121

**Fonte:** <code>        }));</code>

**O que faz:** Compõe o bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA” com a instrução: }));.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 122

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 123

**Fonte:** <code>        expect(forwardedMessages).toContainEqual({ action: 'PROGRESS', text: 'explicito' });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(forwardedMessages).toContainEqual({ action: 'PROGRESS', text: 'explicito' });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 124

**Fonte:** <code>        expect(forwardedMessages).toContainEqual({ action: 'PROGRESS', text: 'fallback' });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(forwardedMessages).toContainEqual({ action: 'PROGRESS', text: 'fallback' });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 125

**Fonte:** <code>        expect(forwardedMessages).toContainEqual({ action: 'REQUEST_IMAGE_DATA', index: 3 });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(forwardedMessages).toContainEqual({ action: 'REQUEST_IMAGE_DATA', index: 3 });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 126

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** Exercita o listener real do background, o roteador registrado e ações reais para identidade da aba, relay de progresso explícito/fallback e solicitação de imagem com sucesso e falha de conexão.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 127

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “GET_TAB_ID / GEMINI_PROGRESS / REQUEST_IMAGE_DATA”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 128

**Fonte:** <code>    test('BG-52/BG-55/BG-56: handlers de imagem e erro atualizam manga tab e disparam finalize', async () =&gt; {</code>

**O que faz:** Declara um caso Jest: test('BG-52/BG-55/BG-56: handlers de imagem e erro atualizam manga tab e disparam finalize', async () => {

**Como e por que:** O caso pertence ao bloco “staging, commit, aba auxiliar e erro” e usa dispatchToBackground para atravessar o listener real em vez de chamar uma função copiada.

**Por que uma alternativa ingênua seria pior:** Testar somente helpers/mocks sem passar pelo listener e roteador poderia deixar regressões de wiring invisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 129

**Fonte:** <code>        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-4', active: true });</code>

**O que faz:** Cria uma aba stateful no mock de tabs com URL/estado definidos pelo cenário.

**Como e por que:** A aba recebe id real do mock e passa a ser alvo de mensagens do background.

**Por que uma alternativa ingênua seria pior:** Usar id inventado sem registrar a aba impediria testar search/remove/show/roteamento de forma coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 130

**Fonte:** <code>        const forwardedMessages = [];</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: const forwardedMessages = [];.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 131

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 132

**Fonte:** <code>        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) =&gt; {</code>

**O que faz:** Registra um receiver de content script na aba de mangá simulada.

**Como e por que:** chrome.tabs.sendMessage do background passa por esse handler e o teste captura payloads encaminhados.

**Por que uma alternativa ingênua seria pior:** Mockar sendMessage diretamente perderia a prova de integração com o mock stateful e sua lastError.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 133

**Fonte:** <code>            forwardedMessages.push(message);</code>

**O que faz:** Captura cada mensagem realmente enviada à aba de mangá.

**Como e por que:** A lista é usada por assertions posteriores para provar PROGRESS, REQUEST_IMAGE_DATA, UPDATE_IMAGE e SHOW_ERROR_INTEGRATED.

**Por que uma alternativa ingênua seria pior:** Afirmar apenas a resposta do handler não provaria o payload encaminhado ao content script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 134

**Fonte:** <code>            sendResponse({ ok: true });</code>

**O que faz:** Emula a resposta do content script à mensagem recebida: sendResponse({ ok: true });.

**Como e por que:** O callback percorre o mock chrome.tabs.sendMessage e retorna à ação real do background.

**Por que uma alternativa ingênua seria pior:** Não responder em fluxos que esperam ACK deixaria a Promise pendente ou acionaria timeout.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 135

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 136

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 137

**Fonte:** <code>        jest.useFakeTimers();</code>

**O que faz:** Ativa fake timers para controlar deterministamente os delays do lifecycle do job.

**Como e por que:** Permite provar o estado antes e depois do delay de finalização de 600 ms sem esperar tempo real.

**Por que uma alternativa ingênua seria pior:** Esperar delays reais tornaria a suíte lenta e suscetível a jitter.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 138

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 139

**Fonte:** <code>        tabsMock._tabs.set(3333, {</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: tabsMock._tabs.set(3333, {.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 140

**Fonte:** <code>            id: 3333, url: 'https://gemini.google.com/app/job-direct',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: id: 3333, url: 'https://gemini.google.com/app/job-direct',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 141

**Fonte:** <code>            active: false, status: 'complete', title: '',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: active: false, status: 'complete', title: '',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 142

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 143

**Fonte:** <code>        backgroundModule.__setState({</code>

**O que faz:** Injeta estado interno necessário no background real instrumentado.

**Como e por que:** O setter anexado pelo loader escreve no mesmo state() usado pelos handlers, permitindo montar activeMangaTabId, jobIndex, contadores e extractionTabs.

**Por que uma alternativa ingênua seria pior:** Substituir o módulo por objeto fake não provaria integração com o state real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 144

**Fonte:** <code>            activeJobsCount: 1,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: activeJobsCount: 1,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 145

**Fonte:** <code>            completedJobs: 0,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: completedJobs: 0,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 146

**Fonte:** <code>            currentBatchId: 'batch-direct',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: currentBatchId: 'batch-direct',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 147

**Fonte:** <code>            isProcessing: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: isProcessing: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 148

**Fonte:** <code>            activeMangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: activeMangaTabId: mangaTab.id,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 149

**Fonte:** <code>            totalJobs: 1,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: totalJobs: 1,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 150

**Fonte:** <code>            jobIndex: [{</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: jobIndex: [{.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 151

**Fonte:** <code>                geminiTabId: 3333, jobId: 'job-direct', batchId: 'batch-direct',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: geminiTabId: 3333, jobId: 'job-direct', batchId: 'batch-direct',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 152

**Fonte:** <code>                mangaTabId: mangaTab.id, index: 7,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id, index: 7,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 153

**Fonte:** <code>            }],</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }],.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 154

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 155

**Fonte:** <code>        storageMock._setStore({</code>

**O que faz:** Semeia storage.local com o journal/job persistido requerido pelo cenário.

**Como e por que:** As ações reais consultam gemini_job_<tabId>, debugMode e metadados para ownership e comportamento.

**Por que uma alternativa ingênua seria pior:** Sem registro persistido, os guards reais rejeitariam a mensagem e o teste exercitaria outro branch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 156

**Fonte:** <code>            ...storageMock._getStore(),</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: ...storageMock._getStore(),.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 157

**Fonte:** <code>            gemini_job_3333: {</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: gemini_job_3333: {.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 158

**Fonte:** <code>                geminiTabId: 3333, jobId: 'job-direct', batchId: 'batch-direct',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: geminiTabId: 3333, jobId: 'job-direct', batchId: 'batch-direct',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 159

**Fonte:** <code>                mangaTabId: mangaTab.id, index: 7, executionMode: 'temp_chat',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id, index: 7, executionMode: 'temp_chat',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 160

**Fonte:** <code>            },</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 161

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 162

**Fonte:** <code>        const extractedResultPromise = dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GEMINI_IMAGE_EXTRACTED.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 163

**Fonte:** <code>            action: 'GEMINI_IMAGE_EXTRACTED',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'GEMINI_IMAGE_EXTRACTED',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 164

**Fonte:** <code>            mangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 165

**Fonte:** <code>            index: 7,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: index: 7,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 166

**Fonte:** <code>            src: 'data:image/png;base64,FROM_GEMINI',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: src: 'data:image/png;base64,FROM_GEMINI',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 167

**Fonte:** <code>            jobId: 'job-direct',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: jobId: 'job-direct',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 168

**Fonte:** <code>        }, { tab: { id: 3333 } });</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }, { tab: { id: 3333 } });.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 169

**Fonte:** <code>        await flushFakeTimerRounds(20);</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: await flushFakeTimerRounds(20);.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 170

**Fonte:** <code>        const extractedResult = await extractedResultPromise;</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: const extractedResult = await extractedResultPromise;.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 171

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 172

**Fonte:** <code>        expect(extractedResult.response).toEqual({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(extractedResult.response).toEqual({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 173

**Fonte:** <code>            ok: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: ok: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 174

**Fonte:** <code>            staged: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: staged: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 175

**Fonte:** <code>            persisted: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: persisted: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 176

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 177

**Fonte:** <code>        expect(forwardedMessages).toContainEqual(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(forwardedMessages).toContainEqual(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 178

**Fonte:** <code>            action: 'UPDATE_IMAGE',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'UPDATE_IMAGE',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 179

**Fonte:** <code>            index: 7,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: index: 7,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 180

**Fonte:** <code>            newSrc: 'data:image/png;base64,FROM_GEMINI',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: newSrc: 'data:image/png;base64,FROM_GEMINI',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 181

**Fonte:** <code>            expectAck: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: expectAck: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 182

**Fonte:** <code>        }));</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }));.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 183

**Fonte:** <code>        expect(backgroundModule.__getState().activeJobsCount).toBe(1);</code>

**O que faz:** Lê o estado interno do background real após a ação.

**Como e por que:** A suíte usa esse ponto de observação apenas de teste para afirmar activeJobsCount antes/depois de commit/finalize.

**Por que uma alternativa ingênua seria pior:** Afirmar somente mensagens externas poderia deixar regressão de contabilidade de jobs invisível.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 184

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 185

**Fonte:** <code>        const directCommitPromise = dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GEMINI_RESULT_COMMIT.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 186

**Fonte:** <code>            action: 'GEMINI_RESULT_COMMIT',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'GEMINI_RESULT_COMMIT',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 187

**Fonte:** <code>            mangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 188

**Fonte:** <code>            index: 7,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: index: 7,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 189

**Fonte:** <code>            jobId: 'job-direct',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: jobId: 'job-direct',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 190

**Fonte:** <code>        }, { tab: { id: 3333 } });</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }, { tab: { id: 3333 } });.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 191

**Fonte:** <code>        await flushFakeTimerRounds(24);</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: await flushFakeTimerRounds(24);.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 192

**Fonte:** <code>        const directCommit = await directCommitPromise;</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: const directCommit = await directCommitPromise;.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 193

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 194

**Fonte:** <code>        expect(directCommit.response).toEqual({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(directCommit.response).toEqual({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 195

**Fonte:** <code>            ok: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: ok: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 196

**Fonte:** <code>            committed: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: committed: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 197

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 198

**Fonte:** <code>        await jest.advanceTimersByTimeAsync(601);</code>

**O que faz:** Avança o relógio falso do Jest (await jest.advanceTimersByTimeAsync(601);).

**Como e por que:** O avanço assíncrono deixa callbacks/promises associados ao timer executarem antes da próxima assertion.

**Por que uma alternativa ingênua seria pior:** Usar avanço síncrono em fluxo com Promises pode observar estado intermediário e tornar o teste intermitente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 199

**Fonte:** <code>        await flushFakeTimerRounds(4);</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: await flushFakeTimerRounds(4);.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 200

**Fonte:** <code>        expect(backgroundModule.__getState().activeJobsCount).toBe(0);</code>

**O que faz:** Lê o estado interno do background real após a ação.

**Como e por que:** A suíte usa esse ponto de observação apenas de teste para afirmar activeJobsCount antes/depois de commit/finalize.

**Por que uma alternativa ingênua seria pior:** Afirmar somente mensagens externas poderia deixar regressão de contabilidade de jobs invisível.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 201

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 202

**Fonte:** <code>        const extractionTab = await tabsMock.create({ url: 'https://cdn.reader.test/result.png', active: false });</code>

**O que faz:** Cria uma aba stateful no mock de tabs com URL/estado definidos pelo cenário.

**Como e por que:** A aba recebe id real do mock e passa a ser alvo de mensagens do background.

**Por que uma alternativa ingênua seria pior:** Usar id inventado sem registrar a aba impediria testar search/remove/show/roteamento de forma coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 203

**Fonte:** <code>        tabsMock._tabs.set(4444, {</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: tabsMock._tabs.set(4444, {.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 204

**Fonte:** <code>            id: 4444, url: 'https://gemini.google.com/app/job-extraction',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: id: 4444, url: 'https://gemini.google.com/app/job-extraction',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 205

**Fonte:** <code>            active: false, status: 'complete', title: '',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: active: false, status: 'complete', title: '',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 206

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 207

**Fonte:** <code>        backgroundModule.__setState({</code>

**O que faz:** Injeta estado interno necessário no background real instrumentado.

**Como e por que:** O setter anexado pelo loader escreve no mesmo state() usado pelos handlers, permitindo montar activeMangaTabId, jobIndex, contadores e extractionTabs.

**Por que uma alternativa ingênua seria pior:** Substituir o módulo por objeto fake não provaria integração com o state real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 208

**Fonte:** <code>            extractionTabs: {</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: extractionTabs: {.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 209

**Fonte:** <code>                [extractionTab.id]: {</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: [extractionTab.id]: {.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 210

**Fonte:** <code>                    mangaTabId: mangaTab.id, index: 8, geminiTabId: 4444,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id, index: 8, geminiTabId: 4444,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 211

**Fonte:** <code>                    jobId: 'job-extraction', batchId: 'batch-extraction',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: jobId: 'job-extraction', batchId: 'batch-extraction',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 212

**Fonte:** <code>                },</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 213

**Fonte:** <code>            },</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 214

**Fonte:** <code>            activeJobsCount: 1,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: activeJobsCount: 1,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 215

**Fonte:** <code>            completedJobs: 0,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: completedJobs: 0,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 216

**Fonte:** <code>            currentBatchId: 'batch-extraction',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: currentBatchId: 'batch-extraction',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 217

**Fonte:** <code>            isProcessing: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: isProcessing: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 218

**Fonte:** <code>            activeMangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: activeMangaTabId: mangaTab.id,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 219

**Fonte:** <code>            totalJobs: 1,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: totalJobs: 1,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 220

**Fonte:** <code>            jobIndex: [{</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: jobIndex: [{.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 221

**Fonte:** <code>                geminiTabId: 4444, jobId: 'job-extraction', batchId: 'batch-extraction',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: geminiTabId: 4444, jobId: 'job-extraction', batchId: 'batch-extraction',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 222

**Fonte:** <code>                mangaTabId: mangaTab.id, index: 8,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id, index: 8,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 223

**Fonte:** <code>            }],</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }],.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 224

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 225

**Fonte:** <code>        storageMock._setStore({</code>

**O que faz:** Semeia storage.local com o journal/job persistido requerido pelo cenário.

**Como e por que:** As ações reais consultam gemini_job_<tabId>, debugMode e metadados para ownership e comportamento.

**Por que uma alternativa ingênua seria pior:** Sem registro persistido, os guards reais rejeitariam a mensagem e o teste exercitaria outro branch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 226

**Fonte:** <code>            ...storageMock._getStore(),</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: ...storageMock._getStore(),.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 227

**Fonte:** <code>            gemini_job_4444: {</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: gemini_job_4444: {.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 228

**Fonte:** <code>                geminiTabId: 4444, jobId: 'job-extraction', batchId: 'batch-extraction',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: geminiTabId: 4444, jobId: 'job-extraction', batchId: 'batch-extraction',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 229

**Fonte:** <code>                mangaTabId: mangaTab.id, index: 8, executionMode: 'temp_chat',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id, index: 8, executionMode: 'temp_chat',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 230

**Fonte:** <code>            },</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 231

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 232

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 233

**Fonte:** <code>        const readyFromTabPromise = dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário IMAGE_READY_FROM_NEW_TAB.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 234

**Fonte:** <code>            action: 'IMAGE_READY_FROM_NEW_TAB',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'IMAGE_READY_FROM_NEW_TAB',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 235

**Fonte:** <code>            mangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 236

**Fonte:** <code>            index: 8,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: index: 8,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 237

**Fonte:** <code>            src: 'data:image/png;base64,FROM_EXTRACTION_TAB',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: src: 'data:image/png;base64,FROM_EXTRACTION_TAB',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 238

**Fonte:** <code>            geminiTabId: 4444,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: geminiTabId: 4444,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 239

**Fonte:** <code>            jobId: 'job-extraction',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: jobId: 'job-extraction',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 240

**Fonte:** <code>        }, { tab: { id: extractionTab.id } });</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }, { tab: { id: extractionTab.id } });.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 241

**Fonte:** <code>        await flushFakeTimerRounds(28);</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: await flushFakeTimerRounds(28);.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 242

**Fonte:** <code>        const readyFromTab = await readyFromTabPromise;</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: const readyFromTab = await readyFromTabPromise;.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 243

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 244

**Fonte:** <code>        expect(readyFromTab.response).toEqual({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(readyFromTab.response).toEqual({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 245

**Fonte:** <code>            ok: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: ok: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 246

**Fonte:** <code>            staged: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: staged: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 247

**Fonte:** <code>            persisted: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: persisted: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 248

**Fonte:** <code>            committed: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: committed: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 249

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 250

**Fonte:** <code>        expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 251

**Fonte:** <code>        expect(forwardedMessages).toContainEqual(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(forwardedMessages).toContainEqual(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 252

**Fonte:** <code>            action: 'UPDATE_IMAGE',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'UPDATE_IMAGE',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 253

**Fonte:** <code>            index: 8,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: index: 8,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 254

**Fonte:** <code>            newSrc: 'data:image/png;base64,FROM_EXTRACTION_TAB',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: newSrc: 'data:image/png;base64,FROM_EXTRACTION_TAB',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 255

**Fonte:** <code>            expectAck: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: expectAck: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 256

**Fonte:** <code>        }));</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }));.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 257

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 258

**Fonte:** <code>        await jest.advanceTimersByTimeAsync(601);</code>

**O que faz:** Avança o relógio falso do Jest (await jest.advanceTimersByTimeAsync(601);).

**Como e por que:** O avanço assíncrono deixa callbacks/promises associados ao timer executarem antes da próxima assertion.

**Por que uma alternativa ingênua seria pior:** Usar avanço síncrono em fluxo com Promises pode observar estado intermediário e tornar o teste intermitente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 259

**Fonte:** <code>        await flushFakeTimerRounds(4);</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: await flushFakeTimerRounds(4);.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 260

**Fonte:** <code>        expect(backgroundModule.__getState().activeJobsCount).toBe(0);</code>

**O que faz:** Lê o estado interno do background real após a ação.

**Como e por que:** A suíte usa esse ponto de observação apenas de teste para afirmar activeJobsCount antes/depois de commit/finalize.

**Por que uma alternativa ingênua seria pior:** Afirmar somente mensagens externas poderia deixar regressão de contabilidade de jobs invisível.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 261

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 262

**Fonte:** <code>        storageMock._setStore({</code>

**O que faz:** Semeia storage.local com o journal/job persistido requerido pelo cenário.

**Como e por que:** As ações reais consultam gemini_job_<tabId>, debugMode e metadados para ownership e comportamento.

**Por que uma alternativa ingênua seria pior:** Sem registro persistido, os guards reais rejeitariam a mensagem e o teste exercitaria outro branch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 263

**Fonte:** <code>            ...storageMock._getStore(),</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: ...storageMock._getStore(),.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 264

**Fonte:** <code>            debugMode: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: debugMode: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 265

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 266

**Fonte:** <code>        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });</code>

**O que faz:** Injeta estado interno necessário no background real instrumentado.

**Como e por que:** O setter anexado pelo loader escreve no mesmo state() usado pelos handlers, permitindo montar activeMangaTabId, jobIndex, contadores e extractionTabs.

**Por que uma alternativa ingênua seria pior:** Substituir o módulo por objeto fake não provaria integração com o state real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 267

**Fonte:** <code>        storageMock._setStore({</code>

**O que faz:** Semeia storage.local com o journal/job persistido requerido pelo cenário.

**Como e por que:** As ações reais consultam gemini_job_<tabId>, debugMode e metadados para ownership e comportamento.

**Por que uma alternativa ingênua seria pior:** Sem registro persistido, os guards reais rejeitariam a mensagem e o teste exercitaria outro branch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 268

**Fonte:** <code>            ...storageMock._getStore(),</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: ...storageMock._getStore(),.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 269

**Fonte:** <code>            gemini_job_5555: { geminiTabId: 5555, jobId: 'job-error' },</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: gemini_job_5555: { geminiTabId: 5555, jobId: 'job-error' },.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 270

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 271

**Fonte:** <code>        const geminiErrorPromise = dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário GEMINI_ERROR.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 272

**Fonte:** <code>            action: 'GEMINI_ERROR',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'GEMINI_ERROR',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 273

**Fonte:** <code>            mangaTabId: mangaTab.id,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: mangaTabId: mangaTab.id,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 274

**Fonte:** <code>            index: 9,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: index: 9,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 275

**Fonte:** <code>            error: 'Falhou bonito',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: error: 'Falhou bonito',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 276

**Fonte:** <code>            jobId: 'job-error',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: jobId: 'job-error',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 277

**Fonte:** <code>        }, { tab: { id: 5555 } });</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }, { tab: { id: 5555 } });.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 278

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 279

**Fonte:** <code>        await flushFakeTimerRounds(24);</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: await flushFakeTimerRounds(24);.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 280

**Fonte:** <code>        const geminiError = await geminiErrorPromise;</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: const geminiError = await geminiErrorPromise;.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 281

**Fonte:** <code>        expect(geminiError.response).toEqual({ ok: true });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(geminiError.response).toEqual({ ok: true });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 282

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 283

**Fonte:** <code>        expect(forwardedMessages).toContainEqual(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(forwardedMessages).toContainEqual(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 284

**Fonte:** <code>            action: 'SHOW_ERROR_INTEGRATED',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'SHOW_ERROR_INTEGRATED',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “staging, commit, aba auxiliar e erro”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 285

**Fonte:** <code>            errorMsg: 'Falhou bonito',</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: errorMsg: 'Falhou bonito',.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 286

**Fonte:** <code>            imgIndex: 9,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: imgIndex: 9,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 287

**Fonte:** <code>            isDebug: true,</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: isDebug: true,.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 288

**Fonte:** <code>        }));</code>

**O que faz:** Compõe o bloco “staging, commit, aba auxiliar e erro” com a instrução: }));.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 289

**Fonte:** <code>        expect(backgroundModule.__getState().activeJobsCount).toBe(0);</code>

**O que faz:** Lê o estado interno do background real após a ação.

**Como e por que:** A suíte usa esse ponto de observação apenas de teste para afirmar activeJobsCount antes/depois de commit/finalize.

**Por que uma alternativa ingênua seria pior:** Afirmar somente mensagens externas poderia deixar regressão de contabilidade de jobs invisível.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 290

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “staging, commit, aba auxiliar e erro”.

**Como e por que:** Monta jobs persistidos/estado realista e prova os fluxos GEMINI_IMAGE_EXTRACTED, GEMINI_RESULT_COMMIT, IMAGE_READY_FROM_NEW_TAB e GEMINI_ERROR através do background real.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 291

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “staging, commit, aba auxiliar e erro”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 292

**Fonte:** <code>    test('BG-59: CALCULATE_VISUAL_FINGERPRINT calcula hashes visuais via fetch do service worker', async () =&gt; {</code>

**O que faz:** Declara um caso Jest: test('BG-59: CALCULATE_VISUAL_FINGERPRINT calcula hashes visuais via fetch do service worker', async () => {

**Como e por que:** O caso pertence ao bloco “fingerprint visual — caminho HTTP” e usa dispatchToBackground para atravessar o listener real em vez de chamar uma função copiada.

**Por que uma alternativa ingênua seria pior:** Testar somente helpers/mocks sem passar pelo listener e roteador poderia deixar regressões de wiring invisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 293

**Fonte:** <code>        const originalFetch = global.fetch;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 294

**Fonte:** <code>        const originalSelf = global.self;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 295

**Fonte:** <code>        const originalCreateImageBitmap = global.createImageBitmap;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 296

**Fonte:** <code>        const originalOffscreenCanvas = global.OffscreenCanvas;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 297

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 298

**Fonte:** <code>        const closeBitmap = jest.fn();</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: const closeBitmap = jest.fn();.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 299

**Fonte:** <code>        const makePixels = (length) =&gt; Uint8ClampedArray.from({ length }, (_value, index) =&gt; index % 256);</code>

**O que faz:** Cria pixels RGBA determinísticos para os canvases simulados.

**Como e por que:** O padrão index%256 torna pixelSample reproduzível e fornece buffers não vazios aos algoritmos de hash mockados.

**Por que uma alternativa ingênua seria pior:** Buffer vazio/aleatório reduziria a capacidade de detectar pipeline incorreto ou tornaria o teste não determinístico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 300

**Fonte:** <code>        const fpApi = {</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: const fpApi = {.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 301

**Fonte:** <code>            calculateDHash: jest.fn(() =&gt; 'dhash-16-hex'),</code>

**O que faz:** Define/usa função de fingerprint observável: calculateDHash: jest.fn(() =&gt; 'dhash-16-hex'),

**Como e por que:** A ação real escolhe quais algoritmos chamar conforme disponibilidade da API e devolve seus resultados.

**Por que uma alternativa ingênua seria pior:** Mockar o execute da ação não provaria dimensionamento/caminho do service worker.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 302

**Fonte:** <code>            calculateWHash: jest.fn(() =&gt; 'w'.repeat(64)),</code>

**O que faz:** Define/usa função de fingerprint observável: calculateWHash: jest.fn(() =&gt; 'w'.repeat(64)),

**Como e por que:** A ação real escolhe quais algoritmos chamar conforme disponibilidade da API e devolve seus resultados.

**Por que uma alternativa ingênua seria pior:** Mockar o execute da ação não provaria dimensionamento/caminho do service worker.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 303

**Fonte:** <code>            calculatePHash: jest.fn(() =&gt; 'p'.repeat(64)),</code>

**O que faz:** Define/usa função de fingerprint observável: calculatePHash: jest.fn(() =&gt; 'p'.repeat(64)),

**Como e por que:** A ação real escolhe quais algoritmos chamar conforme disponibilidade da API e devolve seus resultados.

**Por que uma alternativa ingênua seria pior:** Mockar o execute da ação não provaria dimensionamento/caminho do service worker.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 304

**Fonte:** <code>            calculateRegionalHashes: jest.fn(() =&gt; ({</code>

**O que faz:** Define/usa função de fingerprint observável: calculateRegionalHashes: jest.fn(() =&gt; ({

**Como e por que:** A ação real escolhe quais algoritmos chamar conforme disponibilidade da API e devolve seus resultados.

**Por que uma alternativa ingênua seria pior:** Mockar o execute da ação não provaria dimensionamento/caminho do service worker.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 305

**Fonte:** <code>                topLeft: 'tl',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: topLeft: 'tl',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 306

**Fonte:** <code>                topRight: 'tr',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: topRight: 'tr',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 307

**Fonte:** <code>                bottomLeft: 'bl',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: bottomLeft: 'bl',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 308

**Fonte:** <code>                bottomRight: 'br',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: bottomRight: 'br',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 309

**Fonte:** <code>            })),</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: })),.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 310

**Fonte:** <code>        };</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: };.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 311

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 312

**Fonte:** <code>        class MockOffscreenCanvas {</code>

**O que faz:** Define substituto mínimo de OffscreenCanvas para executar a ação real em Jest.

**Como e por que:** A classe preserva width/height e fornece contexto com drawImage/getImageData.

**Por que uma alternativa ingênua seria pior:** Sem esse shim, o ambiente Node não oferece o primitive usado pelo service worker.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 313

**Fonte:** <code>            constructor(width, height) {</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: constructor(width, height) {.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 314

**Fonte:** <code>                this.width = width;</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: this.width = width;.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 315

**Fonte:** <code>                this.height = height;</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: this.height = height;.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 316

**Fonte:** <code>            }</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 317

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 318

**Fonte:** <code>            getContext() {</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: getContext() {.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 319

**Fonte:** <code>                return {</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: return {.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 320

**Fonte:** <code>                    drawImage: jest.fn(),</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: drawImage: jest.fn(),.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 321

**Fonte:** <code>                    getImageData: jest.fn(() =&gt; ({</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: getImageData: jest.fn(() =&gt; ({.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 322

**Fonte:** <code>                        data: makePixels(this.width * this.height * 4),</code>

**O que faz:** Cria pixels RGBA determinísticos para os canvases simulados.

**Como e por que:** O padrão index%256 torna pixelSample reproduzível e fornece buffers não vazios aos algoritmos de hash mockados.

**Por que uma alternativa ingênua seria pior:** Buffer vazio/aleatório reduziria a capacidade de detectar pipeline incorreto ou tornaria o teste não determinístico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 323

**Fonte:** <code>                    })),</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: })),.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 324

**Fonte:** <code>                };</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: };.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 325

**Fonte:** <code>            }</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 326

**Fonte:** <code>        }</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 327

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 328

**Fonte:** <code>        try {</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: try {.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 329

**Fonte:** <code>            runtimeMock._messageListeners = [];</code>

**O que faz:** Zera listeners de runtime antes de recarregar o background: runtimeMock._messageListeners = [];.

**Como e por que:** O loader executará novamente o composition root, portanto a lista precisa começar limpa para getBackgroundListener encontrar exatamente um handler.

**Por que uma alternativa ingênua seria pior:** Listener duplicado faria uma mesma mensagem executar mais de uma vez ou invalidaria o helper de dispatch.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 330

**Fonte:** <code>            global.self = global;</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: global.self = global;.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 331

**Fonte:** <code>            global.MangaTranslatorGtcFingerprint = fpApi;</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: global.MangaTranslatorGtcFingerprint = fpApi;.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 332

**Fonte:** <code>            global.fetch = jest.fn(async () =&gt; ({</code>

**O que faz:** Substitui fetch por resposta HTTP controlada que devolve Blob de imagem.

**Como e por que:** A ação real ainda valida URL, chama fetch com credenciais omitidas/no-store e decodifica o blob.

**Por que uma alternativa ingênua seria pior:** Acesso de rede real tornaria teste lento, externo e não determinístico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 333

**Fonte:** <code>                ok: true,</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: ok: true,.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 334

**Fonte:** <code>                blob: async () =&gt; new Blob(['image-bytes'], { type: 'image/png' }),</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: blob: async () =&gt; new Blob(['image-bytes'], { type: 'image/png' }),.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 335

**Fonte:** <code>            }));</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: }));.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 336

**Fonte:** <code>            global.createImageBitmap = jest.fn(async () =&gt; ({ close: closeBitmap }));</code>

**O que faz:** Substitui createImageBitmap por bitmap controlado com close observável.

**Como e por que:** Permite verificar liberação explícita do recurso pela ação real.

**Por que uma alternativa ingênua seria pior:** Sem close observável, vazamento de bitmap poderia passar despercebido neste caminho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 337

**Fonte:** <code>            global.OffscreenCanvas = MockOffscreenCanvas;</code>

**O que faz:** Instala o shim de OffscreenCanvas para a duração do cenário.

**Como e por que:** Os tamanhos 8x8, 9x8, 32x32 e 48x48 são criados pela implementação real.

**Por que uma alternativa ingênua seria pior:** Trocar a própria ação por mock eliminaria a prova do pipeline de canvases.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 338

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 339

**Fonte:** <code>            backgroundModule = loadBackgroundModule(BACKGROUND_PATH);</code>

**O que faz:** Carrega e executa os bytes reais de extension/background.js com instrumentação de teste.

**Como e por que:** O loader acrescenta somente getters/setters/exports de inspeção e executa o fonte com chrome/fetch/FileReader reais do ambiente de teste.

**Por que uma alternativa ingênua seria pior:** Mockar o background inteiro eliminaria justamente o wiring onMessage que esta suíte pretende validar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 340

**Fonte:** <code>            await flush(8);</code>

**O que faz:** Drena tarefas assíncronas do bootstrap do background antes de iniciar assertions.

**Como e por que:** flush usa sucessivos setTimeout(0), permitindo concluir callbacks de storage/registro inicial.

**Por que uma alternativa ingênua seria pior:** Despachar mensagens cedo demais pode observar estado ainda não restaurado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 341

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 342

**Fonte:** <code>            const result = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário CALCULATE_VISUAL_FINGERPRINT (HTTP).

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 343

**Fonte:** <code>                action: 'CALCULATE_VISUAL_FINGERPRINT',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'CALCULATE_VISUAL_FINGERPRINT',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 344

**Fonte:** <code>                url: 'https://cdn.reader.test/page-001.png',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: url: 'https://cdn.reader.test/page-001.png',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 345

**Fonte:** <code>            });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 346

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 347

**Fonte:** <code>            expect(result.keepAlive).toBe(true);</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(result.keepAlive).toBe(true);

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 348

**Fonte:** <code>            expect(result.response).toEqual(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(result.response).toEqual(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 349

**Fonte:** <code>                ok: true,</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: ok: true,.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 350

**Fonte:** <code>                pixelSample: expect.stringMatching(/^[0-9a-f]+$/),</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: pixelSample: expect.stringMatching(/^[0-9a-f]+$/),.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 351

**Fonte:** <code>                dHash: 'dhash-16-hex',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: dHash: 'dhash-16-hex',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 352

**Fonte:** <code>                wHash: 'w'.repeat(64),</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: wHash: 'w'.repeat(64),.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 353

**Fonte:** <code>                pHash: 'p'.repeat(64),</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: pHash: 'p'.repeat(64),.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 354

**Fonte:** <code>                regionalHashes: {</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: regionalHashes: {.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 355

**Fonte:** <code>                    topLeft: 'tl',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: topLeft: 'tl',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 356

**Fonte:** <code>                    topRight: 'tr',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: topRight: 'tr',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 357

**Fonte:** <code>                    bottomLeft: 'bl',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: bottomLeft: 'bl',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 358

**Fonte:** <code>                    bottomRight: 'br',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: bottomRight: 'br',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 359

**Fonte:** <code>                },</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 360

**Fonte:** <code>            }));</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: }));.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 361

**Fonte:** <code>            expect(result.response.pixelSample).toHaveLength(512);</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(result.response.pixelSample).toHaveLength(512);

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 362

**Fonte:** <code>            expect(global.fetch).toHaveBeenCalledWith('https://cdn.reader.test/page-001.png', {</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(global.fetch).toHaveBeenCalledWith('https://cdn.reader.test/page-001.png', {

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 363

**Fonte:** <code>                credentials: 'omit',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: credentials: 'omit',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 364

**Fonte:** <code>                cache: 'no-store',</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: cache: 'no-store',.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 365

**Fonte:** <code>            });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 366

**Fonte:** <code>            expect(global.createImageBitmap).toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(global.createImageBitmap).toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 367

**Fonte:** <code>            expect(fpApi.calculateDHash).toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(fpApi.calculateDHash).toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 368

**Fonte:** <code>            expect(fpApi.calculateWHash).toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(fpApi.calculateWHash).toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 369

**Fonte:** <code>            expect(fpApi.calculatePHash).toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(fpApi.calculatePHash).toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 370

**Fonte:** <code>            expect(fpApi.calculateRegionalHashes).toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(fpApi.calculateRegionalHashes).toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 371

**Fonte:** <code>            expect(closeBitmap).toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(closeBitmap).toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — caminho HTTP”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 372

**Fonte:** <code>        } finally {</code>

**O que faz:** Compõe o bloco “fingerprint visual — caminho HTTP” com a instrução: } finally {.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 373

**Fonte:** <code>            global.fetch = originalFetch;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 374

**Fonte:** <code>            global.self = originalSelf;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 375

**Fonte:** <code>            delete global.MangaTranslatorGtcFingerprint;</code>

**O que faz:** Remove a API global de fingerprint injetada pelo cenário.

**Como e por que:** Evita que outro teste encontre algoritmos que não instalou.

**Por que uma alternativa ingênua seria pior:** Namespace residual pode converter fallback em caminho de hash completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 376

**Fonte:** <code>            global.createImageBitmap = originalCreateImageBitmap;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 377

**Fonte:** <code>            global.OffscreenCanvas = originalOffscreenCanvas;</code>

**O que faz:** Salva referência global original antes de substituir API indisponível/indesejada no Jest.

**Como e por que:** O bloco finally restaura exatamente essas referências mesmo se a assertion falhar.

**Por que uma alternativa ingênua seria pior:** Não restaurar globals contamina outras suítes no mesmo runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 378

**Fonte:** <code>        }</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 379

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — caminho HTTP”.

**Como e por que:** Substitui somente APIs indisponíveis no Jest (fetch, createImageBitmap, OffscreenCanvas e API de hashes), mantendo a ação real e verificando o resultado/efeitos observáveis.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 380

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — caminho HTTP”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 381

**Fonte:** <code>    test('BG-59: CALCULATE_VISUAL_FINGERPRINT rejeita data/blob URL sem tentar fetch', async () =&gt; {</code>

**O que faz:** Declara um caso Jest: test('BG-59: CALCULATE_VISUAL_FINGERPRINT rejeita data/blob URL sem tentar fetch', async () => {

**Como e por que:** O caso pertence ao bloco “fingerprint visual — protocolo inválido” e usa dispatchToBackground para atravessar o listener real em vez de chamar uma função copiada.

**Por que uma alternativa ingênua seria pior:** Testar somente helpers/mocks sem passar pelo listener e roteador poderia deixar regressões de wiring invisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 382

**Fonte:** <code>        const fetchSpy = jest.spyOn(global, 'fetch');</code>

**O que faz:** Espiona fetch existente sem substituí-lo por uma resposta de sucesso.

**Como e por que:** A assertion final exige que URL data: seja recusada antes de qualquer acesso de rede.

**Por que uma alternativa ingênua seria pior:** Se fetch fosse chamado, data: poderia entrar em caminho não permitido e quebrar a fronteira de protocolo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 383

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — protocolo inválido”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 384

**Fonte:** <code>        const result = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário CALCULATE_VISUAL_FINGERPRINT (data:).

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 385

**Fonte:** <code>            action: 'CALCULATE_VISUAL_FINGERPRINT',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'CALCULATE_VISUAL_FINGERPRINT',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “fingerprint visual — protocolo inválido”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 386

**Fonte:** <code>            url: 'data:image/png;base64,AAA',</code>

**O que faz:** Compõe o bloco “fingerprint visual — protocolo inválido” com a instrução: url: 'data:image/png;base64,AAA',.

**Como e por que:** Despacha data: URL pelo roteador real e exige rejeição antes de fetch.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 387

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — protocolo inválido”.

**Como e por que:** Despacha data: URL pelo roteador real e exige rejeição antes de fetch.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 388

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — protocolo inválido”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 389

**Fonte:** <code>        expect(result.response).toEqual({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(result.response).toEqual({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — protocolo inválido”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 390

**Fonte:** <code>            ok: false,</code>

**O que faz:** Compõe o bloco “fingerprint visual — protocolo inválido” com a instrução: ok: false,.

**Como e por que:** Despacha data: URL pelo roteador real e exige rejeição antes de fetch.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 391

**Fonte:** <code>            error: 'URL inválida para fingerprint visual',</code>

**O que faz:** Compõe o bloco “fingerprint visual — protocolo inválido” com a instrução: error: 'URL inválida para fingerprint visual',.

**Como e por que:** Despacha data: URL pelo roteador real e exige rejeição antes de fetch.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 392

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — protocolo inválido”.

**Como e por que:** Despacha data: URL pelo roteador real e exige rejeição antes de fetch.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 393

**Fonte:** <code>        expect(fetchSpy).not.toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(fetchSpy).not.toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “fingerprint visual — protocolo inválido”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 394

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “fingerprint visual — protocolo inválido”.

**Como e por que:** Despacha data: URL pelo roteador real e exige rejeição antes de fetch.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 395

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “fingerprint visual — protocolo inválido”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 396

**Fonte:** <code>    test('BG-60/BG-61/BG-63/BG-64: DOWNLOAD_IMAGE, SHOW_EXISTING_FOLDER e EXPORT_ALL_AND_SHOW respeitam prefixos e completude', async () =&gt; {</code>

**O que faz:** Declara um caso Jest: test('BG-60/BG-61/BG-63/BG-64: DOWNLOAD_IMAGE, SHOW_EXISTING_FOLDER e EXPORT_ALL_AND_SHOW respeitam prefixos e completude', async () => {

**Como e por que:** O caso pertence ao bloco “downloads, pasta existente e exportação” e usa dispatchToBackground para atravessar o listener real em vez de chamar uma função copiada.

**Por que uma alternativa ingênua seria pior:** Testar somente helpers/mocks sem passar pelo listener e roteador poderia deixar regressões de wiring invisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 397

**Fonte:** <code>        const downloadSpy = jest.spyOn(downloadsMock, 'download');</code>

**O que faz:** Espiona a API de download stateful para verificar cardinalidade e filename normalizado.

**Como e por que:** O spy conserva a implementação do mock, portanto ids/estado de download continuam disponíveis às ações reais.

**Por que uma alternativa ingênua seria pior:** Substituir por jest.fn vazio poderia impedir waitForDownload/search e produzir prova artificial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 398

**Fonte:** <code>        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();</code>

**O que faz:** Espiona abertura de download/pasta sem depender da UI do SO.

**Como e por que:** A implementação é mockada como Promise resolvida e as assertions verificam chamadas.

**Por que uma alternativa ingênua seria pior:** Tentar abrir pasta real tornaria o teste dependente de plataforma.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 399

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 400

**Fonte:** <code>        const downloadImage = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário DOWNLOAD_IMAGE sem prefixo.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 401

**Fonte:** <code>            action: 'DOWNLOAD_IMAGE',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'DOWNLOAD_IMAGE',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 402

**Fonte:** <code>            url: 'data:image/png;base64,AAA',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: url: 'data:image/png;base64,AAA',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 403

**Fonte:** <code>            filename: 'chap/pagina_001.png',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: filename: 'chap/pagina_001.png',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 404

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “downloads, pasta existente e exportação”.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 405

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 406

**Fonte:** <code>        expect(downloadImage.response).toEqual(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(downloadImage.response).toEqual(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 407

**Fonte:** <code>            filePath: expect.stringContaining('MangaTranslator/chap/pagina_001.png'),</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: filePath: expect.stringContaining('MangaTranslator/chap/pagina_001.png'),.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 408

**Fonte:** <code>            downloadId: expect.any(Number),</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: downloadId: expect.any(Number),.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 409

**Fonte:** <code>        }));</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: }));.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 410

**Fonte:** <code>        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 411

**Fonte:** <code>            filename: 'MangaTranslator/chap/pagina_001.png',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: filename: 'MangaTranslator/chap/pagina_001.png',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 412

**Fonte:** <code>        }), expect.any(Function));</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: }), expect.any(Function));.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 413

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 414

**Fonte:** <code>        const downloadAlreadyPrefixed = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário DOWNLOAD_IMAGE já prefixado.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 415

**Fonte:** <code>            action: 'DOWNLOAD_IMAGE',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'DOWNLOAD_IMAGE',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 416

**Fonte:** <code>            url: 'data:image/png;base64,BBB',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: url: 'data:image/png;base64,BBB',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 417

**Fonte:** <code>            filename: 'MangaTranslator/chap/pagina_002.png',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: filename: 'MangaTranslator/chap/pagina_002.png',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 418

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “downloads, pasta existente e exportação”.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 419

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 420

**Fonte:** <code>        expect(downloadAlreadyPrefixed.response).toEqual(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(downloadAlreadyPrefixed.response).toEqual(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 421

**Fonte:** <code>            filePath: expect.stringContaining('MangaTranslator/chap/pagina_002.png'),</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: filePath: expect.stringContaining('MangaTranslator/chap/pagina_002.png'),.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 422

**Fonte:** <code>        }));</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: }));.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 423

**Fonte:** <code>        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 424

**Fonte:** <code>            filename: 'MangaTranslator/chap/pagina_002.png',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: filename: 'MangaTranslator/chap/pagina_002.png',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 425

**Fonte:** <code>        }), expect.any(Function));</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: }), expect.any(Function));.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 426

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 427

**Fonte:** <code>        downloadsMock._downloads.set(999, {</code>

**O que faz:** Semeia um download existente no banco stateful do mock.

**Como e por que:** SHOW_EXISTING_FOLDER/OPEN_CHAPTER_FOLDER pesquisam esse registro como fariam com chrome.downloads.search.

**Por que uma alternativa ingênua seria pior:** Sem registro existente, o teste cairia no fallback de marker/download e não provaria reutilização.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 428

**Fonte:** <code>            id: 999,</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: id: 999,.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 429

**Fonte:** <code>            url: 'data:image/png;base64,MARKER',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: url: 'data:image/png;base64,MARKER',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 430

**Fonte:** <code>            filename: 'C:/Users/TestUser/Downloads/MangaTranslator/Chapter_10/pagina_001.png',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: filename: 'C:/Users/TestUser/Downloads/MangaTranslator/Chapter_10/pagina_001.png',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 431

**Fonte:** <code>            state: 'complete',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: state: 'complete',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 432

**Fonte:** <code>            exists: true,</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: exists: true,.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 433

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “downloads, pasta existente e exportação”.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 434

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 435

**Fonte:** <code>        const existingFolder = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário SHOW_EXISTING_FOLDER.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 436

**Fonte:** <code>            action: 'SHOW_EXISTING_FOLDER',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'SHOW_EXISTING_FOLDER',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 437

**Fonte:** <code>            folderPath: 'C:/Users/TestUser/Downloads/MangaTranslator/Chapter_10',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: folderPath: 'C:/Users/TestUser/Downloads/MangaTranslator/Chapter_10',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 438

**Fonte:** <code>            safeTitle: 'Chapter_10',</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: safeTitle: 'Chapter_10',.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 439

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “downloads, pasta existente e exportação”.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 440

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 441

**Fonte:** <code>        expect(existingFolder.response).toEqual({ ok: true });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(existingFolder.response).toEqual({ ok: true });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 442

**Fonte:** <code>        expect(showSpy).toHaveBeenCalledWith(999);</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(showSpy).toHaveBeenCalledWith(999);

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 443

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 444

**Fonte:** <code>        showSpy.mockClear();</code>

**O que faz:** Zera somente o histórico do spy antes do subcenário seguinte.

**Como e por que:** Mantém a implementação observada, mas evita que chamadas de DOWNLOAD_IMAGE contaminem contagens de EXPORT_ALL.

**Por que uma alternativa ingênua seria pior:** Sem limpar, toHaveBeenCalledTimes mediria múltiplos subcenários juntos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 445

**Fonte:** <code>        downloadSpy.mockClear();</code>

**O que faz:** Zera somente o histórico do spy antes do subcenário seguinte.

**Como e por que:** Mantém a implementação observada, mas evita que chamadas de DOWNLOAD_IMAGE contaminem contagens de EXPORT_ALL.

**Por que uma alternativa ingênua seria pior:** Sem limpar, toHaveBeenCalledTimes mediria múltiplos subcenários juntos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 446

**Fonte:** <code>        const exportAll = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário EXPORT_ALL_AND_SHOW.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 447

**Fonte:** <code>            action: 'EXPORT_ALL_AND_SHOW',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'EXPORT_ALL_AND_SHOW',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 448

**Fonte:** <code>            allDownloads: [</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: allDownloads: [.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 449

**Fonte:** <code>                { url: 'data:image/png;base64,1', filename: 'alpha/pagina_001.png' },</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: { url: 'data:image/png;base64,1', filename: 'alpha/pagina_001.png' },.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 450

**Fonte:** <code>                { url: 'data:image/png;base64,2', filename: 'alpha/pagina_002.png' },</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: { url: 'data:image/png;base64,2', filename: 'alpha/pagina_002.png' },.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 451

**Fonte:** <code>                { url: 'data:image/png;base64,3', filename: 'alpha/pagina_003.png' },</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: { url: 'data:image/png;base64,3', filename: 'alpha/pagina_003.png' },.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 452

**Fonte:** <code>            ],</code>

**O que faz:** Compõe o bloco “downloads, pasta existente e exportação” com a instrução: ],.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 453

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “downloads, pasta existente e exportação”.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 454

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 455

**Fonte:** <code>        expect(exportAll.response).toEqual({ ok: true });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(exportAll.response).toEqual({ ok: true });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 456

**Fonte:** <code>        expect(downloadSpy).toHaveBeenCalledTimes(3);</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(downloadSpy).toHaveBeenCalledTimes(3);

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 457

**Fonte:** <code>        expect(showSpy).toHaveBeenCalledTimes(1);</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(showSpy).toHaveBeenCalledTimes(1);

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “downloads, pasta existente e exportação”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 458

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “downloads, pasta existente e exportação”.

**Como e por que:** Exercita ações reais de download com prefixo canônico, busca/abertura de pasta e exportação de lote usando o mock stateful de downloads.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 459

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “downloads, pasta existente e exportação”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 460

**Fonte:** <code>    test('OPEN_CHAPTER_FOLDER reutiliza anchorId existente sem redownload', async () =&gt; {</code>

**O que faz:** Declara um caso Jest: test('OPEN_CHAPTER_FOLDER reutiliza anchorId existente sem redownload', async () => {

**Como e por que:** O caso pertence ao bloco “OPEN_CHAPTER_FOLDER” e usa dispatchToBackground para atravessar o listener real em vez de chamar uma função copiada.

**Por que uma alternativa ingênua seria pior:** Testar somente helpers/mocks sem passar pelo listener e roteador poderia deixar regressões de wiring invisíveis.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 461

**Fonte:** <code>        downloadsMock._downloads.set(444, {</code>

**O que faz:** Semeia um download existente no banco stateful do mock.

**Como e por que:** SHOW_EXISTING_FOLDER/OPEN_CHAPTER_FOLDER pesquisam esse registro como fariam com chrome.downloads.search.

**Por que uma alternativa ingênua seria pior:** Sem registro existente, o teste cairia no fallback de marker/download e não provaria reutilização.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 462

**Fonte:** <code>            id: 444,</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: id: 444,.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 463

**Fonte:** <code>            url: 'data:image/png;base64,ANCHOR',</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: url: 'data:image/png;base64,ANCHOR',.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 464

**Fonte:** <code>            filename: '/home/user/Downloads/MangaTranslator/Capitulo_X/_anchor.png',</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: filename: '/home/user/Downloads/MangaTranslator/Capitulo_X/_anchor.png',.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 465

**Fonte:** <code>            state: 'complete',</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: state: 'complete',.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 466

**Fonte:** <code>            exists: true,</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: exists: true,.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 467

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “OPEN_CHAPTER_FOLDER”.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 468

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “OPEN_CHAPTER_FOLDER”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 469

**Fonte:** <code>        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();</code>

**O que faz:** Espiona abertura de download/pasta sem depender da UI do SO.

**Como e por que:** A implementação é mockada como Promise resolvida e as assertions verificam chamadas.

**Por que uma alternativa ingênua seria pior:** Tentar abrir pasta real tornaria o teste dependente de plataforma.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 470

**Fonte:** <code>        const downloadSpy = jest.spyOn(downloadsMock, 'download');</code>

**O que faz:** Espiona a API de download stateful para verificar cardinalidade e filename normalizado.

**Como e por que:** O spy conserva a implementação do mock, portanto ids/estado de download continuam disponíveis às ações reais.

**Por que uma alternativa ingênua seria pior:** Substituir por jest.fn vazio poderia impedir waitForDownload/search e produzir prova artificial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — parte do harness controlado necessário para produzir a observação afirmada depois.

### Linha/posição 471

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “OPEN_CHAPTER_FOLDER”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 472

**Fonte:** <code>        const openFolder = await dispatchToBackground(runtimeMock, {</code>

**O que faz:** Despacha mensagem pelo único listener onMessage real para o cenário OPEN_CHAPTER_FOLDER.

**Como e por que:** dispatchToBackground captura keepAlive e sendResponse sem pular o roteador registrado em background.js.

**Por que uma alternativa ingênua seria pior:** Invocar execute() diretamente não provaria mapeamento ACTION_MAP, response shape legado nem keepAlive do wiring.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa do fluxo real; a propriedade específica é fixada pelas assertions posteriores.

### Linha/posição 473

**Fonte:** <code>            action: 'OPEN_CHAPTER_FOLDER',</code>

**O que faz:** Define a ação pública enviada ao background: action: 'OPEN_CHAPTER_FOLDER',

**Como e por que:** O router resolve o nome legado para a ação canônica dentro do cenário “OPEN_CHAPTER_FOLDER”.

**Por que uma alternativa ingênua seria pior:** Um nome incorreto retornaria sem handler; a assertion posterior detecta isso pelo resultado/payload ausente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 474

**Fonte:** <code>            anchorId: 444,</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: anchorId: 444,.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 475

**Fonte:** <code>            chapId: 'chap_x',</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: chapId: 'chap_x',.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 476

**Fonte:** <code>            safeTitle: 'Capitulo_X',</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: safeTitle: 'Capitulo_X',.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 477

**Fonte:** <code>            images: {</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: images: {.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 478

**Fonte:** <code>                0: 'data:image/png;base64,PAGE_0',</code>

**O que faz:** Compõe o bloco “OPEN_CHAPTER_FOLDER” com a instrução: 0: 'data:image/png;base64,PAGE_0',.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Mudar esta instrução pode alterar os dados de entrada, o mock observado ou a sequência assíncrona que as assertions do bloco usam como prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 479

**Fonte:** <code>            },</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “OPEN_CHAPTER_FOLDER”.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 480

**Fonte:** <code>        });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “OPEN_CHAPTER_FOLDER”.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 481

**Fonte:** <code>␤ [linha vazia]</code>

**O que faz:** Separa visualmente unidades dentro de “OPEN_CHAPTER_FOLDER”.

**Como e por que:** A linha vazia não altera runtime; ela delimita blocos de setup, ação e assertion para tornar a suíte auditável.

**Por que uma alternativa ingênua seria pior:** Fundir blocos não quebraria JavaScript, mas pioraria legibilidade e revisão de uma suíte assíncrona extensa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha estrutural/documental; não representa comportamento executável isolado.

### Linha/posição 482

**Fonte:** <code>        expect(openFolder.response).toEqual({ ok: true });</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(openFolder.response).toEqual({ ok: true });

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “OPEN_CHAPTER_FOLDER”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 483

**Fonte:** <code>        expect(showSpy).toHaveBeenCalledWith(444);</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(showSpy).toHaveBeenCalledWith(444);

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “OPEN_CHAPTER_FOLDER”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 484

**Fonte:** <code>        expect(downloadSpy).not.toHaveBeenCalled();</code>

**O que faz:** Faz assertion explícita sobre o comportamento observado: expect(downloadSpy).not.toHaveBeenCalled();

**Como e por que:** É evidência direta para a propriedade expressa por este matcher dentro do cenário “OPEN_CHAPTER_FOLDER”.

**Por que uma alternativa ingênua seria pior:** Remover ou enfraquecer a assertion transformaria execução do fluxo em evidência indireta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — esta linha contém matcher que fixa o comportamento indicado.

### Linha/posição 485

**Fonte:** <code>    });</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “OPEN_CHAPTER_FOLDER”.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 486

**Fonte:** <code>});</code>

**O que faz:** Fecha/continua a estrutura sintática do bloco “OPEN_CHAPTER_FOLDER”.

**Como e por que:** Prova o ramo que reutiliza anchorId existente: abre o download já conhecido e não dispara novo download.

**Por que uma alternativa ingênua seria pior:** Alterar delimitadores quebraria parsing ou mudaria o escopo de setup/assertions.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha executada/avaliada pelo caso correspondente, sem matcher focal nesta própria linha.

### Linha/posição 487

**Fonte:** <code>␤ [newline final]</code>

**O que faz:** Preserva o newline final do arquivo.

**Como e por que:** Mantém a forma textual exata do blob auditado e permite distinguir 486 linhas textuais de 487 posições documentais.

**Por que uma alternativa ingênua seria pior:** Remover ou inventar a posição terminal quebraria a equivalência byte/texto usada pela auditoria.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição física/documental, sem comportamento runtime.

## 10. Autoauditoria do AGENTE 4

- SHA do fonte relido imediatamente antes da criação: `1c2815cd1f2fecba58a07c568f24d69af0367af3`.
- Fonte embutida acima é interpolada diretamente do blob lido no branch, sem reescrita manual.
- Cobertura documental: **487/487 posições**.
- As assertions foram classificadas conservadoramente: execução do fluxo não foi promovida a prova direta sem matcher correspondente.
- Suites focais complementares foram consultadas para não registrar falsos gaps onde já existe prova específica.
- Nenhum código, teste, fixture, workflow ou configuração externo foi alterado para produzir evidência.
- Pendência externa persistente: **156-001**.
- Autoauditoria documental: **APROVADA**.

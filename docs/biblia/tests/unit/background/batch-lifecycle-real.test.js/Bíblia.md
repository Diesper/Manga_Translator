# Bíblia técnica — tests/unit/background/batch-lifecycle-real.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `1368df4b1fdb85d8ad1f593f78decd16a3175c98`  
> **Agente responsável:** AGENTE 15  
> **Tipo:** suíte Jest de lifecycle real do background sob Chrome API mockada  
> **Linhas textuais:** 361  
> **Posições documentais:** 362, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/unit/background/batch-lifecycle-real.test.js` valida o lifecycle de lotes carregando **`extension/background.js` real** dentro de `jest.isolateModules` e interagindo com o listener real de `chrome.runtime.onMessage`.

A suíte não duplica handlers de START_BATCH/STOP_BATCH. Ela envia mensagens ao listener registrado pelo background e observa efeitos persistidos no storage, abas mockadas, alarms e mensagens encaminhadas.

A fronteira da prova é importante: a implementação do background é real, mas as Chrome APIs são fornecidas por `tests/mocks/chrome-api.mock.js`. Portanto as assertions provam regras de negócio/roteamento no harness Jest; comportamento de Chromium real continua sendo matéria de E2E/smoke.

## 2. Dependências e bootstrap

O arquivo importa:

- `path`;
- `getRuntimeMock`;
- `getStorageMock`;
- `getTabsMock`;
- `getAlarmsMock`.

`BACKGROUND_PATH` resolve diretamente `extension/background.js`.

Em cada `beforeEach`:

1. `jest.resetModules()`;
2. recupera as instâncias dos mocks;
3. limpa listeners/runtime error;
4. limpa storage;
5. requer `background.js` dentro de `jest.isolateModules`;
6. faz seis rounds de flush assíncrono.

Isso força cada caso a obter uma instância nova do módulo real, evitando compartilhar o singleton do background entre testes.

O `afterEach` limpa alarms, tabs e storage.

## 3. Helpers de sincronização

### delay — linhas 12–14

Wrapper simples de `setTimeout`.

### flush — linhas 16–20

Executa `delay(0)` repetidamente para permitir progressão de promises/callbacks do background. O default é seis rounds.

### waitFor — linhas 22–30

Polling baseado em `Date.now()`:

- timeout padrão: 2000 ms;
- intervalo padrão: 10 ms;
- retorna assim que a função produzir valor truthy;
- lança `Timeout aguardando condição assíncrona` no esgotamento.

Os caminhos verdes são usados repetidamente; o branch de timeout não possui teste focal nesta suíte.

### getBackgroundListener — linhas 32–38

Exige exatamente **um** listener de mensagem e falha imediatamente se o background registrar zero ou mais de um. Isso também funciona como assertion estrutural dinâmica da inicialização do background.

### dispatchToBackground — linhas 40–55

Invoca o listener diretamente com request, sender e `sendResponse`.

Retorna:

- `keepAlive`: retorno síncrono do listener;
- `response`: resposta entregue pelo callback.

Se o listener retorna exatamente `false` sem responder, resolve com `response: undefined`. Se retorna `true`, a Promise fica aguardando `sendResponse`.

### getSingleGeminiJob — linhas 57–62

Lê todo o storage, procura a primeira chave `gemini_job_*` e devolve chave, valor e tabId derivado do sufixo.

Os cenários que usam esse helper configuram `maxConcurrentJobs: 1`, portanto a premissa de “um job ativo” é coerente com o setup dos casos.

## 4. Lifecycle comum da suíte

O describe cobre seis cenários. Todos usam o background real recém-carregado.

O router de produção mapeia ações legadas:

- START_BATCH → `start-batch`;
- STOP_BATCH → `stop-batch`;
- GEMINI_RESULT_URL → `deliver-result-url`.

`background.js` também trata `CHECK_IF_EXTRACTION_TAB` como ação compatível e o handler de alarms procura nomes `watchdog_*`, envia `SHOW_ERROR_INTEGRATED` e finaliza o job em timeout.

## 5. Cenário 1 — START_BATCH

Linhas 97–146.

Configuração:

- `maxConcurrentJobs = 1`;
- Gemini base URL aponta para mock local;
- mangaTabId 77;
- duas imagens, índices 4 e 9.

Assertions diretas:

- resposta `ok: true` com `batchId` string;
- `mt_state.isProcessing = true`;
- `activeMangaTabId = 77`;
- `totalJobs = 2`;
- `activeJobsCount = 1`;
- fila contém a segunda imagem, índice 9;
- job persistido contém índice 4 e IDs esperados;
- aba Gemini contém `jobIndex=4`;
- aba criada é inativa.

Esse teste demonstra o efeito combinado de criação do primeiro job e enfileiramento do excedente sob concorrência 1.

## 6. Cenário 2 — resultado por URL e extraction tab

Linhas 148–195.

Após START_BATCH de uma imagem:

1. captura o job Gemini persistido;
2. envia `GEMINI_RESULT_URL` com URL CDN;
3. exige `{ ok: true, extractionRegistered: true }`;
4. detecta nova aba criada;
5. envia `CHECK_IF_EXTRACTION_TAB` como se viesse dessa aba;
6. exige mapeamento completo.

A resposta final prova associação de:

- mangaTabId 88;
- index 1;
- geminiTabId;
- jobId;
- batchId.

## 7. Cenário 3 — reidratação após worker novo

Linhas 197–213.

O teste não cria o fluxo por START_BATCH. Em vez disso, semeia `mt_state` persistido com `extractionTabs` e então consulta `CHECK_IF_EXTRACTION_TAB`.

A assertion exige que o background recém-carregado recupere o mapeamento e retorne `isExtractionTab: true` com mangaTabId/jobId/batchId corretos.

Isso cobre a propriedade P0 de reidratação depois de um worker novo a partir do estado persistido.

## 8. Cenário 4 — STOP_BATCH global

Linhas 215–266.

O teste:

1. inicia lote com duas imagens;
2. espera job Gemini;
3. registra extraction tab via `GEMINI_RESULT_URL`;
4. chama `STOP_BATCH` sem batchId;
5. faz flush.

Assertions diretas:

- resposta `{ ok: true }`;
- nenhuma aba permanece;
- nenhuma chave `gemini_job_*` permanece;
- nenhuma chave `wd_data_*` permanece;
- `stopRequested=false`;
- `isProcessing=false`;
- `currentBatchId=null`;
- `activeJobsCount=0`;
- `activeMangaTabId=null`;
- `pendingBatches=[]`;
- `jobQueue=[]`.

É a prova de cleanup global do fluxo montado pelo próprio background.

## 9. Cenário 5 — STOP_BATCH antigo preserva lote atual

Linhas 268–308.

O estado é semeado com:

- job A pertencente a `batch-a`;
- job B pertencente a `batch-b`;
- fila atual de batch-b;
- `currentBatchId=batch-b`;
- duas abas;
- chaves `gemini_job_*`;
- chaves `wd_data_*`.

A chamada é `STOP_BATCH batch-a`.

Assertions diretas:

- aba A removida;
- aba B preservada;
- `gemini_job_A` removido;
- `gemini_job_B` preservado;
- watchdog B preservado;
- batch-b continua current/processing;
- activeJobsCount cai para 1;
- fila e jobIndex mantêm somente batch/job B.

Esse teste é particularmente importante para isolamento de ownership entre lotes antigos e atuais.

## 10. Cenário 6 — watchdog real

Linhas 310–360.

O teste cria uma aba de mangá e registra handler para capturar mensagens enviadas a ela.

Depois:

1. inicia batch com índice 5;
2. espera job e `wd_data_<tabId>`;
3. verifica metadata do watchdog;
4. dispara o alarm `watchdog_<jobId>`;
5. faz flush e depois espera 650 ms;
6. exige `SHOW_ERROR_INTEGRATED` com `imgIndex: 5`;
7. exige fechamento da aba Gemini;
8. exige remoção de `gemini_job_*`;
9. exige remoção de `wd_data_*`;
10. exige `activeJobsCount = 0`.

`background.js` real contém o handler que procura `watchdog_*`, envia `SHOW_ERROR_INTEGRATED` e chama finalização do job.

## 11. Evidência automatizada observada

No GitHub Actions run **36577447500**:

- o blob deste arquivo é exatamente `1368df4b1fdb85d8ad1f593f78decd16a3175c98`;
- job **Unit + Integration (20.x)** `109437162616` registra `PASS background tests/unit/background/batch-lifecycle-real.test.js`;
- o mesmo job termina com **109/109 suites e 851/851 testes**, skipped=0, todo=0;
- job **Unit + Integration (22.x)** `109437162754` também termina com 109/109 suites e 851/851 testes.

Logo os seis casos deste blob passaram na matriz Node observada.

## 12. Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| `background.js` real é carregado por caso | `require(BACKGROUND_PATH)` dentro de `jest.isolateModules` + suite passou | ✅ PROVADO DIRETAMENTE |
| existe exatamente um listener após bootstrap | `getBackgroundListener` é usado por todos os dispatches passantes | ✅ PROVADO DIRETAMENTE |
| START_BATCH cria primeiro job e enfileira segundo sob concorrência 1 | assertions 110–145 | ✅ PROVADO DIRETAMENTE |
| GEMINI_RESULT_URL cria/associa extraction tab | assertions 174–194 | ✅ PROVADO DIRETAMENTE |
| CHECK_IF_EXTRACTION_TAB reconhece mapping persistente | assertions 187–194 e 210–212 | ✅ PROVADO DIRETAMENTE |
| reidratação de extractionTabs após novo worker | estado semeado + lookup 209–212 | ✅ PROVADO DIRETAMENTE |
| STOP_BATCH global limpa tabs/jobs/watchdogs/fila/state | assertions 250–265 | ✅ PROVADO DIRETAMENTE |
| STOP_BATCH batch-a preserva batch-b | assertions 294–307 | ✅ PROVADO DIRETAMENTE |
| watchdog persiste metadata e, ao disparar, encaminha erro e limpa job | assertions 338–359 | ✅ PROVADO DIRETAMENTE |
| router mapeia START/STOP/GEMINI_RESULT_URL para ações canônicas | `extension/background/router.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| comportamento com Chrome APIs reais | suite usa `chrome-api.mock.js` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesta suíte |
| branch `waitFor` que lança timeout | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branch dispatch com `keepAlive=false` sem resposta | sem assertion focal nesta suíte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| watchdog permanece estável sob runners lentos | passa atualmente, mas usa espera fixa de 650 ms | 🟨 EXECUTADO INDIRETAMENTE |

## 13. Solicitação ao auditor

### 132-001 — TEST_RELIABILITY — OPEN — NORMAL

**Encontrado:** após `alarmsMock._fire(...)`, o teste de watchdog executa `flush(10)` seguido de `delay(650)` antes das assertions.

**Arquivo auditado/relacionado:** `tests/unit/background/batch-lifecycle-real.test.js`.

**Evidência atual:** o mesmo blob passou em Node 20.x e 22.x no run 36577447500.

**Evidência ausente:** sincronização por condição observável que prove quando o encaminhamento/cleanup terminou, sem depender de uma janela fixa de parede.

**Por que é relevante:** em runner muito lento, 650 ms podem ser insuficientes; em runner rápido, introduzem latência desnecessária. O próprio arquivo já possui `waitFor` apropriado para polling.

**Ação esperada do auditor:** avaliar substituição da espera fixa por `waitFor` sobre `forwardedMessages` e/ou estado final, em alteração separada.

**Evidência esperada:** teste continua provando mensagem e cleanup sem sleep fixo dependente de timing.

**Possível regressão:** flake intermitente ou aumento desnecessário do tempo da suíte.

**Impacto:** confiabilidade e duração da suíte.

**Severidade:** NORMAL.

## 14. Fonte integral auditada

```js
const path = require('path');

const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');

const BACKGROUND_PATH = path.resolve(__dirname, '../../../extension/background.js');

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function flush(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        await delay(0);
    }
}

async function waitFor(assertion, { timeout = 2000, interval = 10 } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condição assíncrona');
}

function getBackgroundListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do background, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToBackground(runtimeMock, request, sender = { tab: null }) {
    return new Promise((resolve) => {
        let settled = false;
        let keepAlive = false;

        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = getBackgroundListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive === false && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

async function getSingleGeminiJob(storageMock) {
    const data = await storageMock.get(null);
    const key = Object.keys(data).find(item => item.startsWith('gemini_job_'));
    if (!key) return null;
    return { key, value: data[key], tabId: Number(key.replace('gemini_job_', '')) };
}

describe('background.js - lifecycle real do batch', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let alarmsMock;

    beforeEach(async () => {
        jest.resetModules();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        alarmsMock = getAlarmsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        await storageMock.clear();

        jest.isolateModules(() => {
            require(BACKGROUND_PATH);
        });

        await flush();
    });

    afterEach(async () => {
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        await storageMock.clear();
    });

    test('START_BATCH cria a primeira aba Gemini, persiste gemini_job e atualiza mt_state real', async () => {
        await storageMock.set({
            maxConcurrentJobs: 1,
            geminiBaseUrl: 'http://127.0.0.1:3999/app',
        });

        const start = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            mangaTabId: 77,
            prompt: 'Traduzir',
            images: [{ index: 4 }, { index: 9 }],
        });

        expect(start.response).toEqual(expect.objectContaining({
            ok: true,
            batchId: expect.any(String),
        }));

        await waitFor(async () => {
            const data = await storageMock.get(['mt_state']);
            const job = await getSingleGeminiJob(storageMock);
            return data.mt_state && job;
        });

        const state = await storageMock.get(['mt_state']);
        const geminiJob = await getSingleGeminiJob(storageMock);
        const geminiTabId = geminiJob.tabId;
        expect(state.mt_state).toEqual(expect.objectContaining({
            isProcessing: true,
            activeMangaTabId: 77,
            totalJobs: 2,
            activeJobsCount: 1,
        }));
        expect(state.mt_state.jobQueue).toEqual([expect.objectContaining({
            mangaTabId: 77,
            index: 9,
            prompt: 'Traduzir',
            batchId: expect.any(String),
        })]);
        expect(geminiJob.value).toEqual(expect.objectContaining({
            mangaTabId: 77,
            index: 4,
            prompt: 'Traduzir',
            geminiTabId,
        }));

        const geminiTab = tabsMock._tabs.get(geminiTabId);
        expect(geminiTab.url).toContain('jobIndex=4');
        expect(geminiTab.active).toBe(false);
    });

    test('GEMINI_RESULT_URL registra aba de extracao e CHECK_IF_EXTRACTION_TAB reconhece o mapeamento', async () => {
        await storageMock.set({
            maxConcurrentJobs: 1,
            geminiBaseUrl: 'https://example.com/mock',
        });

        await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            mangaTabId: 88,
            prompt: 'Traduzir',
            images: [{ index: 1 }],
        });

        const geminiJob = await waitFor(() => getSingleGeminiJob(storageMock));
        const geminiTabId = geminiJob.tabId;
        const beforeIds = new Set(tabsMock._tabs.keys());

        const extraction = await dispatchToBackground(runtimeMock, {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 88,
            index: 1,
            url: 'https://cdn.reader.test/result.png',
            jobId: geminiJob.value.jobId,
            batchId: geminiJob.value.batchId,
        }, { tab: { id: geminiTabId } });

        expect(extraction.response).toEqual({ ok: true, extractionRegistered: true });
        const extractionTabId = await waitFor(() => {
            const newId = [...tabsMock._tabs.keys()].find(id => !beforeIds.has(id));
            return newId || null;
        });

        const lookup = await waitFor(async () => {
            const result = await dispatchToBackground(runtimeMock, {
                action: 'CHECK_IF_EXTRACTION_TAB',
            }, { tab: { id: extractionTabId } });
            return result.response && result.response.isExtractionTab ? result : null;
        });

        expect(lookup.response).toEqual({
            isExtractionTab: true,
            mangaTabId: 88,
            index: 1,
            geminiTabId,
            jobId: geminiJob.value.jobId,
            batchId: geminiJob.value.batchId,
        });
    });

    test('P0: CHECK_IF_EXTRACTION_TAB reidrata mapeamento após worker novo', async () => {
        const extractionTab = await tabsMock.create({ url: 'https://cdn.reader.test/result.png', active: false });
        await storageMock.set({
            mt_state: {
                jobQueue: [], isProcessing: true, stopRequested: false, activeMangaTabId: 88,
                currentBatchId: 'batch-r', totalJobs: 1, completedJobs: 0, activeJobsCount: 0, jobIndex: [],
                extractionTabs: {
                    [extractionTab.id]: { mangaTabId: 88, index: 1, geminiTabId: 44, jobId: 'job-r', batchId: 'batch-r' },
                },
            },
        });

        const lookup = await dispatchToBackground(runtimeMock, { action: 'CHECK_IF_EXTRACTION_TAB' }, { tab: { id: extractionTab.id } });
        expect(lookup.response).toEqual(expect.objectContaining({
            isExtractionTab: true, mangaTabId: 88, jobId: 'job-r', batchId: 'batch-r',
        }));
    });

    test('STOP_BATCH limpa estado, jobs persistidos e abas abertas do fluxo real', async () => {
        await storageMock.set({
            maxConcurrentJobs: 1,
            geminiBaseUrl: 'https://example.com/mock',
        });

        await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            mangaTabId: 91,
            prompt: 'Traduzir',
            images: [{ index: 1 }, { index: 2 }],
        });

        const geminiJob = await waitFor(() => getSingleGeminiJob(storageMock));
        const geminiTabId = geminiJob.tabId;
        const beforeIds = new Set(tabsMock._tabs.keys());

        await dispatchToBackground(runtimeMock, {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 91,
            index: 1,
            url: 'https://cdn.reader.test/result.png',
            jobId: geminiJob.value.jobId,
            batchId: geminiJob.value.batchId,
        }, { tab: { id: geminiTabId } });

        await waitFor(() => {
            const newId = [...tabsMock._tabs.keys()].find(id => !beforeIds.has(id));
            return newId || null;
        });

        const stop = await dispatchToBackground(runtimeMock, {
            action: 'STOP_BATCH',
        });

        expect(stop.response).toEqual({ ok: true });
        await flush(10);

        const data = await storageMock.get(null);
        expect(tabsMock._tabs.size).toBe(0);
        expect(Object.keys(data).filter(key => key.startsWith('gemini_job_'))).toHaveLength(0);
        expect(Object.keys(data).filter(key => key.startsWith('wd_data_'))).toHaveLength(0);
        expect(data.mt_state).toEqual(expect.objectContaining({
            stopRequested: false,
            isProcessing: false,
            currentBatchId: null,
            activeJobsCount: 0,
            activeMangaTabId: null,
            pendingBatches: [],
        }));
        expect(data.mt_state.jobQueue).toEqual([]);
    });

    test('P0: STOP_BATCH de um lote antigo preserva jobs, fila e watchdogs do lote atual', async () => {
        const jobA = await tabsMock.create({ url: 'https://gemini.google.com/app/a', active: false });
        const jobB = await tabsMock.create({ url: 'https://gemini.google.com/app/b', active: false });
        await storageMock.set({
            mt_state: {
                jobQueue: [{ mangaTabId: 99, index: 8, prompt: 'B', batchId: 'batch-b' }],
                isProcessing: true,
                stopRequested: false,
                activeMangaTabId: 99,
                currentBatchId: 'batch-b',
                extractionTabs: {},
                totalJobs: 2,
                completedJobs: 0,
                activeJobsCount: 2,
                jobIndex: [
                    { geminiTabId: jobA.id, jobId: 'job-a', batchId: 'batch-a', mangaTabId: 99, index: 1 },
                    { geminiTabId: jobB.id, jobId: 'job-b', batchId: 'batch-b', mangaTabId: 99, index: 2 },
                ],
            },
            [`gemini_job_${jobA.id}`]: { geminiTabId: jobA.id, jobId: 'job-a', batchId: 'batch-a' },
            [`gemini_job_${jobB.id}`]: { geminiTabId: jobB.id, jobId: 'job-b', batchId: 'batch-b' },
            [`wd_data_${jobA.id}`]: { geminiTabId: jobA.id, jobId: 'job-a' },
            [`wd_data_${jobB.id}`]: { geminiTabId: jobB.id, jobId: 'job-b' },
        });

        const stop = await dispatchToBackground(runtimeMock, { action: 'STOP_BATCH', batchId: 'batch-a' });
        expect(stop.response).toEqual({ ok: true });
        await flush(8);

        const data = await storageMock.get(null);
        expect(tabsMock._tabs.has(jobA.id)).toBe(false);
        expect(tabsMock._tabs.has(jobB.id)).toBe(true);
        expect(data[`gemini_job_${jobA.id}`]).toBeUndefined();
        expect(data[`gemini_job_${jobB.id}`]).toEqual(expect.objectContaining({ jobId: 'job-b' }));
        expect(data[`wd_data_${jobB.id}`]).toEqual(expect.objectContaining({ jobId: 'job-b' }));
        expect(data.mt_state).toEqual(expect.objectContaining({
            currentBatchId: 'batch-b', isProcessing: true, stopRequested: false, activeJobsCount: 1,
        }));
        expect(data.mt_state.jobQueue).toEqual([expect.objectContaining({ batchId: 'batch-b' })]);
        expect(data.mt_state.jobIndex).toEqual([expect.objectContaining({ jobId: 'job-b' })]);
    });

    test('watchdog real envia erro integrado para a aba de manga e limpa o job ativo', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-1', active: true });
        const forwardedMessages = [];

        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            forwardedMessages.push(message);
            sendResponse({ ok: true });
        });

        await storageMock.set({
            maxConcurrentJobs: 1,
            geminiBaseUrl: 'https://example.com/mock',
        });

        await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            mangaTabId: mangaTab.id,
            prompt: 'Traduzir',
            images: [{ index: 5 }],
        });

        const geminiJob = await waitFor(() => getSingleGeminiJob(storageMock));
        const geminiTabId = geminiJob.tabId;

        await waitFor(async () => {
            const data = await storageMock.get([`wd_data_${geminiTabId}`]);
            return data[`wd_data_${geminiTabId}`] || null;
        });
        expect(await storageMock.get([`wd_data_${geminiTabId}`])).toEqual(expect.objectContaining({
            [`wd_data_${geminiTabId}`]: expect.objectContaining({
                mangaTabId: mangaTab.id,
                index: 5,
                geminiTabId,
            }),
        }));

        alarmsMock._fire(`watchdog_${geminiJob.value.jobId}`);
        await flush(10);
        await delay(650);

        expect(forwardedMessages).toContainEqual(expect.objectContaining({
            action: 'SHOW_ERROR_INTEGRATED',
            imgIndex: 5,
        }));

        const state = await storageMock.get(null);
        expect(tabsMock._tabs.has(geminiTabId)).toBe(false);
        expect(state[`gemini_job_${geminiTabId}`]).toBeUndefined();
        expect(state[`wd_data_${geminiTabId}`]).toBeUndefined();
        expect(state.mt_state.activeJobsCount).toBe(0);
    });
});
```

## 15. Cobertura linha a linha por faixas contíguas

Todas as 362 posições estão cobertas.

| Linhas | Papel específico | Evidência |
|---:|---|---|
| 1–10 | imports de path/mocks e resolução de background.js | ✅ usados no bootstrap passante |
| 11 | separador | estrutural |
| 12–14 | delay baseado em setTimeout | 🟨 usado por flush/wait watchdog |
| 15 | separador | estrutural |
| 16–20 | flush de micro/macrotasks em rounds | ✅ usado no lifecycle |
| 21 | separador | estrutural |
| 22–30 | waitFor com timeout/intervalo | caminho verde ✅; timeout ⚠️ |
| 31 | separador | estrutural |
| 32–38 | exige exatamente um listener real | ✅ todos dispatches passantes atravessam |
| 39 | separador | estrutural |
| 40–55 | adapter dispatchToBackground + keepAlive/sendResponse | ✅ caminho assíncrono usado; branch false sem resposta ⚠️ |
| 56 | separador | estrutural |
| 57–62 | encontra único `gemini_job_*` no storage | ✅ usado em cenários com concorrência 1 |
| 63 | separador | estrutural |
| 64–69 | declara suite e handles de mocks | estrutural |
| 70–89 | beforeEach reseta módulos/mocks/storage e carrega background real | ✅ executado por seis testes |
| 90 | separador | estrutural |
| 91–95 | afterEach limpa alarms/tabs/storage | ✅ executado após casos passantes |
| 96 | separador | estrutural |
| 97–108 | monta START_BATCH com duas imagens | ✅ cenário passou |
| 109–113 | exige resposta ok + batchId | ✅ PROVADO DIRETAMENTE |
| 114–123 | espera mt_state/job e captura tab id | ✅ caminho executado |
| 124–145 | exige estado, fila, job e aba inicial corretos | ✅ PROVADO DIRETAMENTE |
| 146 | fecha teste 1 | estrutural |
| 147 | separador | estrutural |
| 148–172 | inicia lote e envia GEMINI_RESULT_URL | ✅ cenário passou |
| 173–178 | exige registro e detecta nova extraction tab | ✅ PROVADO DIRETAMENTE |
| 179–194 | consulta CHECK_IF_EXTRACTION_TAB e exige mapping completo | ✅ PROVADO DIRETAMENTE |
| 195 | fecha teste 2 | estrutural |
| 196 | separador | estrutural |
| 197–207 | semeia extractionTabs persistido para simular worker novo | ✅ setup do cenário |
| 208–212 | consulta e exige reidratação | ✅ PROVADO DIRETAMENTE |
| 213 | fecha teste 3 | estrutural |
| 214 | separador | estrutural |
| 215–239 | monta lote real e extraction tab para cleanup | ✅ cenário passou |
| 240–248 | espera extraction tab e chama STOP_BATCH global | ✅ executado |
| 249–265 | exige resposta e cleanup integral | ✅ PROVADO DIRETAMENTE |
| 266 | fecha teste 4 | estrutural |
| 267 | separador | estrutural |
| 268–291 | semeia batches A/B, tabs, jobs e watchdogs | ✅ setup do cenário de ownership |
| 292–307 | para batch A e exige preservação seletiva de B | ✅ PROVADO DIRETAMENTE |
| 308 | fecha teste 5 | estrutural |
| 309 | separador | estrutural |
| 310–329 | cria manga tab/handler e inicia job com índice 5 | ✅ executado |
| 330–344 | espera job/watchdog e valida metadata | ✅ PROVADO DIRETAMENTE |
| 345–349 | dispara alarm, flush e sleep fixo 650 ms | 🟨 executado; robustez registrada em 132-001 |
| 350–359 | exige erro integrado e cleanup final | ✅ PROVADO DIRETAMENTE |
| 360–361 | fecha teste e describe | estrutural |
| 362 | newline final | 🟦 integridade do blob |

## 16. Unidades semânticas

### U01 — 1–62 — harness

Constrói adapters assíncronos que tornam o listener real do background observável via mocks.

### U02 — 64–95 — isolamento

Recarrega o módulo real a cada caso e limpa todas as superfícies persistentes do mock.

### U03 — 97–146 — criação e fila

Prova criação do primeiro job e preservação do segundo em fila.

### U04 — 148–195 — pipeline de extraction tab

Prova registro de aba auxiliar e lookup do mapeamento.

### U05 — 197–213 — crash/worker recovery

Prova reidratação a partir de `mt_state`.

### U06 — 215–266 — cleanup global

Prova parada completa do fluxo.

### U07 — 268–308 — ownership seletivo

Prova que lote antigo não destrói lote atual.

### U08 — 310–360 — timeout/watchdog

Prova persistência do watchdog, erro integrado e finalização do job.

### U09 — 361–362 — fechamento/integridade

Encerra a suite e cobre o newline final.

## 17. Limites da prova

A suíte não prova diretamente:

- comportamento das Chrome APIs reais;
- lifecycle MV3 em suspensão real do service worker;
- concorrência de browser real entre abas;
- falhas de disco/storage reais;
- branches negativos dos helpers internos;
- robustez do watchdog sem a janela fixa de 650 ms;
- comportamento E2E do content script junto ao background.

Essas limitações não invalidam as assertions existentes: elas delimitam o que uma suíte Jest com mock de Chrome pode afirmar.

## 18. Autoauditoria do AGENTE 15

- [x] reserva exclusiva confirmada;
- [x] state criado apenas após ownership;
- [x] SHA fonte reconfirmado;
- [x] 361 linhas + newline = 362 posições;
- [x] fonte integral embutida;
- [x] background.js real e router cruzados;
- [x] mesmo blob confirmado no run 36577447500;
- [x] PASS explícito do arquivo localizado;
- [x] matriz Node 20/22 verificada;
- [x] seis cenários documentados com assertions concretas;
- [x] Chrome mock não foi confundido com navegador real;
- [x] risco de timing do watchdog registrado como audit_request;
- [x] nenhum código/teste externo foi alterado.

**Resultado:** Bíblia concluída para o blob `1368df4b1fdb85d8ad1f593f78decd16a3175c98`; a solicitação 132-001 permanece aberta.

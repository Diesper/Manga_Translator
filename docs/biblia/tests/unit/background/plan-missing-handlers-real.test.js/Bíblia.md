# Bíblia técnica — tests/unit/background/plan-missing-handlers-real.test.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE RESPONSÁVEL  
> **SHA auditado:** 9f8c6e4a88256aae9e2b26cd2121fe8474d736b8  
> **Agente responsável:** AGENTE 19  
> **Índice do corpus:** 159  
> **Tipo:** suíte Jest de regressão/integração do background real instrumentado  
> **Linhas textuais:** 544  
> **Posições documentais:** 545, contando newline final  
> **Background exercitado:** `extension/background.js` — SHA `667c05eb2d7adfca16a79d3e706c39a1e9398b72`  
> **Mock Chrome:** `tests/mocks/chrome-api.mock.js` — SHA `c1d9a056b7777183bfd3f540c49811335f410425`  
> **Loader:** `tests/helpers/load-background-module.js` — SHA `b1a20544a10b3b1410f4b3e9c2be6f53b7ac3113`  
> **Helper de dispatch:** `tests/helpers/background-test-utils.js` — SHA `1c38cfc47917f2a42788c467b9dbf58648b73e2b`  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Esta suíte é um agregador de regressões para handlers que historicamente ficaram ausentes do plano v3.1. Ela não copia implementações de produção: `loadBackgroundModule(BACKGROUND_PATH)` lê `extension/background.js` real e acrescenta apenas hooks de inspeção/exportação usados pelo teste. O listener `chrome.runtime.onMessage` registrado pelo background é então invocado por `dispatchToBackground`.

O arquivo combina três níveis:

1. **implementação real do background e das actions registradas**;
2. **Chrome API em memória** para storage/tabs/downloads/alarms/runtime;
3. **rede/FileReader determinísticos** quando o cenário precisa exercitar CORS/base64.

Por isso, as assertions sobre estado, logs, filas, mensagens e chamadas aos mocks são prova direta do comportamento do código real dentro deste harness. Elas não provam efeitos externos do navegador/OS fora do mock.

## 2. Harness e trust boundaries

### 2.1 `loadBackgroundModule`

O loader lê o arquivo real, concatena `__getState`, `__setState` e exports de funções internas e executa esse texto como módulo. A instrumentação amplia observabilidade, mas não substitui o corpo dos handlers.

### 2.2 `dispatchToBackground`

O helper exige **exatamente um** listener do background. Ele chama esse listener com request/sender reais do cenário, captura o booleano de keep-alive e resolve quando `sendResponse` é chamado. Assim, assertions sobre `keepAlive` e `response` verificam o contrato do listener/router, não uma função auxiliar isolada.

### 2.3 Chrome mocks

Storage, tabs, alarms, runtime e downloads são singletons em memória, limpos no setup/teardown. O teste prova chamadas e estado observável desses mocks; não prova UI do gerenciador de downloads, persistência real do Chrome, política de rede real nem scheduler do navegador.

### 2.4 `MockFileReader`

A conversão de blob para dataURL é controlada: o mock preserva o MIME e retorna payload base64 fixo `UkVBRA==`, disparando `onloadend` em timer zero. Isso torna BG-57 determinístico, mas não valida a implementação nativa de FileReader.

## 3. Inventário dos dez casos

| Caso | Linhas | Contrato diretamente observado |
|---|---:|---|
| BG-43 | 84–109 | `LOG_ENTRY` responde `ok`, keepAlive=false e persiste campos exatos em `translatorLog` |
| BG-44 | 111–201 | lote A ativo é preservado; B..F entram em FIFO; retry de D é idempotente e não duplica |
| BG-44b | 203–252 | `STOP_BATCH` remove somente C pendente, preserva A/B/D e registra cancelamento |
| BG-45 | 254–339 | retry do lote ativo não duplica; lote novo respeita `maxConcurrentJobs=3` para 5 imagens |
| BG-46 | 341–386 | stop ativo remove abas, watchdogs, chaves persistidas e limpa estado de execução |
| BG-51/53/54 | 388–439 | `GEMINI_RESULT_URL` cria extraction tab e `CHECK_IF_EXTRACTION_TAB` distingue hit/miss |
| BG-57/58 | 441–477 | `FETCH_IMAGE_AS_BASE64` retorna dataURL legado e compatibiliza erro de fetch |
| BG-37/62 | 479–502 | anchor existente usa `downloads.show` e não cria novo download |
| BG-65 | 504–514 | export vazio retorna `ok` imediatamente sem iniciar downloads |
| BG-66/67 | 516–543 | debug mode é persistido e propagado para todas as abas observadas |

## 4. Provas diretas por cenário

### BG-43 — LOG_ENTRY

A request fixa `level=warn`, `source=popup`, `action_name=PLAN_LOG`, `detail` e `extra.id=43`. O teste exige:

- `keepAlive === false`;
- `response === { ok: true }`;
- entrada efetivamente encontrada em `translatorLog`;
- persistência exata de level/source/action/detail/extra.

Isso prova o caminho de sucesso do logger central no background real.

### BG-44 — fila B/C/D/E/F sem sobrescrever A

O estado inicial contém A ativo, dois jobs vivos e um job ainda em `jobQueue`. Cinco `START_BATCH` subsequentes devem retornar `queued=true`, posições 1..5 e `activeBatchId=batch-a`.

Depois das requests, as assertions exigem que:

- os contadores e ids de A sejam idênticos ao snapshot anterior;
- `jobQueue` e `jobIndex` de A permaneçam exatamente iguais;
- `pendingBatches` seja `[B,C,D,E,F]`;
- nenhuma nova aba seja aberta;
- retry de D reporte `alreadyQueued=true` e posição 3;
- a fila permaneça sem duplicação;
- existam exatamente cinco logs `BATCH_QUEUED`;
- exista `BATCH_QUEUE_DUPLICATE_IGNORED`;
- não exista `BATCH_OVERLAP_BLOCKED`.

A combinação prova FIFO, preservação do lote ativo e idempotência do lote já pendente.

### BG-44b — cancelamento de lote pendente

Com A ativo e `pendingBatches=[B,C,D]`, `STOP_BATCH(batch-c)` deve:

- responder `ok`;
- manter `currentBatchId=batch-a`;
- preservar job/aba de A;
- transformar pendentes em `[B,D]`;
- manter `isProcessing=true`;
- registrar `BATCH_QUEUE_CANCELLED` para C.

### BG-45 — idempotência ativa e limite de concorrência

A fase 1 usa `maxConcurrentJobs=1` para impedir que a abertura legítima de um segundo job seja confundida com duplicação. Retry do lote ativo retorna `alreadyStarted=true` e não altera contagens de queue/index/tabs.

A fase 2 reinicia o estado e usa `maxConcurrentJobs=3` com cinco imagens. O teste espera três abas/jobs ativos, `totalJobs=5`, `completedJobs=0` e apenas índices 3 e 4 restantes na fila. O próprio caso chama `STOP_BATCH` e exige `jobIndex=[]` para não vazar trabalho assíncrono.

### BG-46 — cleanup de lote ativo

O fixture contém duas abas Gemini, uma extraction tab, duas chaves `gemini_job_*`, duas `wd_data_*`, dois alarmes watchdog e jobIndex real.

Após `STOP_BATCH(batch-stop)`, assertions exigem:

- keepAlive=true e `{ok:true}`;
- três abas removidas;
- nenhuma chave `gemini_job_*` ou `wd_data_*`;
- zero alarmes;
- `extractionTabs={}`;
- `activeJobsCount=0`;
- `isProcessing=false`.

### BG-51/BG-53/BG-54 — URL auxiliar e identificação

Com metadados persistidos para o job Gemini, `GEMINI_RESULT_URL` deve responder `extractionRegistered=true`. O `waitFor` só termina quando existe uma aba cuja URL recebeu `#manga-translator-extraction` e cujo id já está em `state.extractionTabs`.

Depois:

- hit na própria extraction tab deve retornar `isExtractionTab=true` e mapping completo;
- miss com id inexistente deve retornar exatamente `{isExtractionTab:false}`;
- o mapping persistido no estado precisa manter mangaTabId/index/geminiTabId/jobId.

### BG-57/BG-58 — fallback base64

No sucesso, fetch mock retorna PNG e blob. O contrato exige:

- keepAlive=true;
- resposta legada sem envelope `ok`, contendo `data:image/png;base64,UkVBRA==`;
- fetch com `credentials:'omit'`, `cache:'no-store'` e AbortSignal.

Na falha, o fetch rejeita `Error('HTTP 404')` e a compatibilidade do background deve devolver `{error:'HTTP 404'}` com keepAlive=true.

### BG-37/BG-62 — anchor existente

O download 707 é semeado como existente. A action deve:

- responder `ok`;
- chamar `downloads.show(707)`;
- não chamar `downloads.download`.

Isso prova prioridade do anchor válido sobre criação de marcador novo.

### BG-65 — export vazio

Com `allDownloads=[]`, a action deve responder `ok` e não chamar `downloads.download`. O caso protege o retorno rápido de lista vazia.

### BG-66/BG-67 — debug mode

Duas abas simuladas registram handlers de mensagem. Após `SET_DEBUG_MODE(debugOn=true)`:

- keepAlive=true;
- resposta `ok`;
- `storage.debugMode === true`;
- ambas as abas recebem exatamente a mensagem `{action:'DEBUG_MODE_CHANGED', debugOn:true}`.

## 5. Evidência real de execução

O blob desta suíte, SHA `9f8c6e4a88256aae9e2b26cd2121fe8474d736b8`, é o mesmo no commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`.

No workflow **MangaTranslator CI #36577447500**, esse mesmo blob foi executado e passou em:

- job `109437162616` — **Unit + Integration (20.x)** — log: `PASS background tests/unit/background/plan-missing-handlers-real.test.js`;
- job `109437162754` — **Unit + Integration (22.x)** — mesma suíte em PASS;
- job `109437162789` — **Windows Portability** — mesma suíte em PASS.

Os jobs registraram **109 suites / 851 testes aprovados**. A evidência de CI confirma execução bem-sucedida da suíte no mesmo conteúdo auditado, em Node 20, Node 22 e Windows.

## 6. Matriz de evidência

| Propriedade | Evidência desta suíte | Classificação |
|---|---|---|
| LOG_ENTRY retorna ok e persiste payload normalizado | assertions de resposta + leitura `translatorLog` | ✅ PROVADO DIRETAMENTE |
| B..F entram em FIFO sem alterar A | respostas + estado completo + tabs + logs | ✅ PROVADO DIRETAMENTE |
| retry de D pendente não duplica | `alreadyQueued`, posição 3 e fila inalterada | ✅ PROVADO DIRETAMENTE |
| STOP_BATCH de C pendente preserva A e B/D | state/jobIndex/tab/pending/log | ✅ PROVADO DIRETAMENTE |
| retry do lote ativo não duplica jobs | queue/index/tabs permanecem 1 | ✅ PROVADO DIRETAMENTE |
| maxConcurrentJobs=3 abre 3 de 5 e deixa 2 na fila | `waitFor` + counters + queue exata | ✅ PROVADO DIRETAMENTE |
| STOP_BATCH ativo remove tabs/jobs/watchdogs/extraction state | tabs/storage/alarms/state | ✅ PROVADO DIRETAMENTE |
| result URL cria extraction tab mapeada | resposta + `waitFor` + state mapping | ✅ PROVADO DIRETAMENTE |
| CHECK_IF_EXTRACTION_TAB hit/miss | respostas e mapping | ✅ PROVADO DIRETAMENTE |
| fetch base64 usa omit/no-store/signal e retorna dataURL | response + `toHaveBeenCalledWith` | ✅ PROVADO DIRETAMENTE |
| falha de fetch vira `{error:'HTTP 404'}` | response exata | ✅ PROVADO DIRETAMENTE |
| anchor existente chama show e não download | spies positivos/negativos | ✅ PROVADO DIRETAMENTE |
| export vazio não baixa nada | response + spy negativo | ✅ PROVADO DIRETAMENTE |
| debug mode salva e faz broadcast | storage + mensagens em duas abas | ✅ PROVADO DIRETAMENTE |
| efeitos reais do SO para `downloads.show` | API é mockada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesta suíte |
| CORS/política real de rede do navegador | fetch é mockado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesta suíte |
| implementação nativa de FileReader | FileReader é substituído | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesta suíte |

As três últimas linhas são limites deliberados de um teste Jest com mocks, não defeitos descobertos que exijam alteração do projeto.

## 7. Relação com módulos de produção

As actions exercitadas pelo background modular incluem:

- `extension/background/actions/log-entry.js` — SHA `d57e1a25531beca36510928564ffd855f607881b`;
- `extension/background/actions/start-batch.js` — SHA `b0ef70bf1c23f97c3fd8c9a1c82483f712b96dc3`;
- `extension/background/actions/stop-batch.js` — SHA `e552d0a911092c5cd7e457fbe262d366c413f0c1`;
- `extension/background/actions/deliver-result-url.js` — SHA `91c50efe4764f56aac16aec2c91309e06db7d0ac`;
- `extension/background/actions/check-extraction-tab.js` — SHA `9ee40474d8c52da5e725ab04a2e325dd69830a51`;
- `extension/background/actions/fetch-image-base64.js` — SHA `4a4825c36fdbe630e80dd7fba1341bdc7a06aecf`;
- `extension/background/actions/open-existing-folder.js` — SHA `59ef82cbf960e360eb404fbd969067f017021607`;
- `extension/background/actions/export-all.js` — SHA `6160a220094dd14b3fef760570dec8ae37a32244`;
- `extension/background/actions/set-debug-mode.js` — SHA `92e4149b1bba2f8d0a4ce3d6881539565801776d`.

O background também possui camada de compatibilidade para respostas legadas: para `CHECK_IF_EXTRACTION_TAB` e `FETCH_IMAGE_AS_BASE64`, o envelope `ok:true` é removido; em erro de `FETCH_IMAGE_AS_BASE64`, `response.error` é reduzido à mensagem/código consumido pelo caller legado. BG-57/BG-58 prova esse formato externo.

## 8. Solicitações ao auditor

**Nenhuma solicitação externa nova foi aberta nesta auditoria.**

Foram encontrados limites inerentes ao harness (Chrome/downloads/fetch/FileReader simulados), mas eles já são explicitamente classificados como limites de prova e não constituem, por si só, falha do objeto auditado. Também existem suítes focais para várias das actions exercitadas; esta suíte permanece um agregador de regressões do plano, não a única fonte de cobertura de edge cases.

## 9. Fonte integral auditada

~~~js
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getDownloadsMock,
    getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const {
    BACKGROUND_PATH,
    flush,
    dispatchToBackground,
    waitFor,
} = require('../../helpers/background-test-utils.js');

describe('REG-09/IPC-07/IPC-08: background.js - handlers faltantes do plano v3.1', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let downloadsMock;
    let alarmsMock;
    let backgroundModule;
    let originalFetch;
    let originalFileReader;

    class MockFileReader {
        readAsDataURL(blob) {
            this.result = `data:${blob.type || 'application/octet-stream'};base64,UkVBRA==`;
            setTimeout(() => {
                if (typeof this.onloadend === 'function') this.onloadend();
            }, 0);
        }
    }

    beforeEach(async () => {
        jest.resetModules();
        jest.useRealTimers();

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

        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        alarmsMock.clearAll();
        await storageMock.clear();

        originalFetch = global.fetch;
        originalFileReader = global.FileReader;
        global.FileReader = MockFileReader;

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
        global.fetch = originalFetch;
        global.FileReader = originalFileReader;
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        await storageMock.clear();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('BG-43: LOG_ENTRY responde ok e persiste a entrada no translatorLog', async () => {
        const result = await dispatchToBackground(runtimeMock, {
            action: 'LOG_ENTRY',
            level: 'warn',
            source: 'popup',
            action_name: 'PLAN_LOG',
            detail: 'entrada do plano',
            extra: { id: 43 },
        });

        expect(result.keepAlive).toBe(false);
        expect(result.response).toEqual({ ok: true });

        const logs = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            return (data.translatorLog || []).find(entry => entry.action === 'PLAN_LOG');
        });

        expect(logs).toEqual(expect.objectContaining({
            level: 'warn',
            source: 'popup',
            action: 'PLAN_LOG',
            detail: 'entrada do plano',
            extra: { id: 43 },
        }));
    });

    test('BG-44: START_BATCH enfileira B/C/D/E/F sem sobrescrever A e preserva FIFO/idempotência', async () => {
        await storageMock.set({ maxConcurrentJobs: 3 });

        const liveA = await tabsMock.create({ url: 'https://gemini.google.com/app/a', active: false });
        const liveB = await tabsMock.create({ url: 'https://gemini.google.com/app/b', active: false });

        backgroundModule.__setState({
            isProcessing: true,
            currentBatchId: 'batch-a',
            completedJobs: 1,
            totalJobs: 4,
            activeJobsCount: 2,
            activeMangaTabId: 999,
            pendingBatches: [],
            jobQueue: [
                { mangaTabId: 999, index: 3, prompt: 'A', batchId: 'batch-a' },
            ],
            jobIndex: [
                { geminiTabId: liveA.id, jobId: 'job-a1', batchId: 'batch-a', mangaTabId: 999, index: 1 },
                { geminiTabId: liveB.id, jobId: 'job-a2', batchId: 'batch-a', mangaTabId: 999, index: 2 },
            ],
        });

        const before = backgroundModule.__getState();
        const batchIds = ['batch-b', 'batch-c', 'batch-d', 'batch-e', 'batch-f'];
        const responses = [];

        for (let index = 0; index < batchIds.length; index++) {
            // eslint-disable-next-line no-await-in-loop
            const result = await dispatchToBackground(runtimeMock, {
                action: 'START_BATCH',
                batchId: batchIds[index],
                images: [{ index: 0 }, { index: 1 }],
                prompt: `prompt-${batchIds[index]}`,
            }, { tab: { id: 120 + index } });
            responses.push(result.response);
        }

        responses.forEach((response, index) => {
            expect(response).toEqual(expect.objectContaining({
                ok: true,
                queued: true,
                batchId: batchIds[index],
                activeBatchId: 'batch-a',
                queuePosition: index + 1,
            }));
        });

        const after = backgroundModule.__getState();
        expect(after).toEqual(expect.objectContaining({
            isProcessing: before.isProcessing,
            currentBatchId: 'batch-a',
            completedJobs: before.completedJobs,
            totalJobs: before.totalJobs,
            activeJobsCount: before.activeJobsCount,
            activeMangaTabId: before.activeMangaTabId,
        }));
        expect(after.jobQueue).toEqual(before.jobQueue);
        expect(after.jobIndex).toEqual(before.jobIndex);
        expect(after.pendingBatches.map(batch => batch.batchId)).toEqual(batchIds);
        expect(tabsMock._tabs.size).toBe(2);

        const retryD = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            batchId: 'batch-d',
            images: [{ index: 0 }, { index: 1 }],
            prompt: 'retry não deve duplicar',
        }, { tab: { id: 122 } });

        expect(retryD.response).toEqual(expect.objectContaining({
            ok: true,
            queued: true,
            alreadyQueued: true,
            batchId: 'batch-d',
            queuePosition: 3,
            activeBatchId: 'batch-a',
        }));
        expect(backgroundModule.__getState().pendingBatches.map(batch => batch.batchId))
            .toEqual(batchIds);

        const logs = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            const entries = data.translatorLog || [];
            const queuedCount = entries.filter(entry => entry.action === 'BATCH_QUEUED').length;
            const hasDuplicate = entries.some(entry => entry.action === 'BATCH_QUEUE_DUPLICATE_IGNORED');
            return queuedCount === 5 && hasDuplicate ? entries : null;
        });
        expect(logs.filter(entry => entry.action === 'BATCH_QUEUED')).toHaveLength(5);
        expect(logs.some(entry => entry.action === 'BATCH_QUEUE_DUPLICATE_IGNORED')).toBe(true);
        expect(logs.some(entry => entry.action === 'BATCH_OVERLAP_BLOCKED')).toBe(false);
    });

    test('BG-44b: STOP_BATCH remove somente um lote pendente e mantém a ordem dos demais', async () => {
        const liveA = await tabsMock.create({ url: 'https://gemini.google.com/app/a-live', active: false });
        backgroundModule.__setState({
            isProcessing: true,
            currentBatchId: 'batch-a',
            completedJobs: 0,
            totalJobs: 1,
            activeJobsCount: 1,
            activeMangaTabId: 10,
            jobQueue: [],
            jobIndex: [
                { geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a', mangaTabId: 10, index: 0 },
            ],
            pendingBatches: [
                { batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [{ index: 0 }] },
                { batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [{ index: 0 }] },
                { batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [{ index: 0 }] },
            ],
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'STOP_BATCH',
            batchId: 'batch-c',
        });

        expect(result.response).toEqual({ ok: true });
        const state = backgroundModule.__getState();
        expect(state.currentBatchId).toBe('batch-a');
        expect(state.jobQueue).toEqual([]);
        expect(state.jobIndex).toEqual([
            expect.objectContaining({ geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a' }),
        ]);
        expect(tabsMock._tabs.has(liveA.id)).toBe(true);
        expect(state.pendingBatches.map(batch => batch.batchId))
            .toEqual(['batch-b', 'batch-d']);
        expect(state.isProcessing).toBe(true);

        const logs = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            const entries = data.translatorLog || [];
            return entries.some(entry =>
                entry.action === 'BATCH_QUEUE_CANCELLED' &&
                entry.extra?.batchId === 'batch-c'
            ) ? entries : null;
        });
        expect(logs.some(entry =>
            entry.action === 'BATCH_QUEUE_CANCELLED' &&
            entry.extra?.batchId === 'batch-c'
        )).toBe(true);
    });

    test('BG-45: START_BATCH idempotente não duplica jobs e lote ocioso respeita maxConcurrentJobs', async () => {
        // Fase 1 isola idempotência: com limite 1, o retry não pode ser
        // confundido com o scheduler abrindo legitimamente o segundo job.
        await storageMock.set({ maxConcurrentJobs: 1 });

        const existingTab = await tabsMock.create({ url: 'https://gemini.google.com/app/existing', active: false });

        backgroundModule.__setState({
            isProcessing: true,
            currentBatchId: 'batch-idempotente',
            completedJobs: 0,
            totalJobs: 2,
            activeJobsCount: 1,
            activeMangaTabId: 123,
            jobQueue: [
                { mangaTabId: 123, index: 1, prompt: 'mesmo', batchId: 'batch-idempotente' },
            ],
            jobIndex: [
                { geminiTabId: existingTab.id, jobId: 'job-existing', batchId: 'batch-idempotente', mangaTabId: 123, index: 0 },
            ],
        });

        const retry = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            batchId: 'batch-idempotente',
            images: [{ index: 0 }, { index: 1 }],
            prompt: 'mesmo',
        }, { tab: { id: 123 } });

        expect(retry.response).toEqual(expect.objectContaining({
            ok: true,
            batchId: 'batch-idempotente',
            alreadyStarted: true,
        }));
        expect(backgroundModule.__getState().jobQueue).toHaveLength(1);
        expect(backgroundModule.__getState().jobIndex).toHaveLength(1);
        expect(tabsMock._tabs.size).toBe(1);
        await new Promise(resolve => tabsMock.remove(existingTab.id, resolve));

        // Fase 2 testa separadamente o preenchimento do limite de concorrência.
        await storageMock.set({ maxConcurrentJobs: 3 });
        backgroundModule.__setState({
            isProcessing: false,
            currentBatchId: null,
            completedJobs: 0,
            totalJobs: 0,
            activeJobsCount: 0,
            activeMangaTabId: null,
            jobQueue: [],
            jobIndex: [],
            completionClaimedBatchId: null,
        });

        const start = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            batchId: 'batch-novo',
            images: Array.from({ length: 5 }, (_unused, index) => ({ index })),
            prompt: 'prompt novo',
        }, { tab: { id: 123 } });

        expect(start.response).toEqual(expect.objectContaining({
            ok: true,
            batchId: 'batch-novo',
        }));

        await waitFor(() => tabsMock._tabs.size === 3);
        const state = backgroundModule.__getState();
        expect(state.currentBatchId).toBe('batch-novo');
        expect(state.activeMangaTabId).toBe(123);
        expect(state.totalJobs).toBe(5);
        expect(state.completedJobs).toBe(0);
        expect(state.activeJobsCount).toBe(3);
        expect(state.jobQueue).toEqual([
            { mangaTabId: 123, index: 3, prompt: 'prompt novo', batchId: 'batch-novo' },
            { mangaTabId: 123, index: 4, prompt: 'prompt novo', batchId: 'batch-novo' },
        ]);

        // Não deixe jobs assíncronos deste teste vazarem para o próximo caso.
        const stop = await dispatchToBackground(runtimeMock, {
            action: 'STOP_BATCH',
            batchId: 'batch-novo',
        });
        expect(stop.response).toEqual({ ok: true });
        await flush(8);
        expect(backgroundModule.__getState().jobIndex).toEqual([]);
    });

    test('BG-46: STOP_BATCH remove abas Gemini, watchdogs, jobs e extractionTabs', async () => {
        const geminiA = await tabsMock.create({ url: 'https://gemini.google.com/app/a', active: false });
        const geminiB = await tabsMock.create({ url: 'https://gemini.google.com/app/b', active: false });
        const extractionTab = await tabsMock.create({ url: 'https://cdn.test/result.png', active: false });

        await storageMock.set({
            [`gemini_job_${geminiA.id}`]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },
            [`gemini_job_${geminiB.id}`]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },
            [`wd_data_${geminiA.id}`]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a' },
            [`wd_data_${geminiB.id}`]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b' },
        });
        alarmsMock.create('watchdog_job-a', { delayInMinutes: 4 });
        alarmsMock.create('watchdog_job-b', { delayInMinutes: 4 });
        backgroundModule.__setState({
            isProcessing: true,
            activeJobsCount: 2,
            activeMangaTabId: 10,
            extractionTabs: {
                [extractionTab.id]: { mangaTabId: 10, index: 9, geminiTabId: geminiA.id, batchId: 'batch-stop' },
            },
        });
        global.MangaTranslatorState.patch({
            currentBatchId: 'batch-stop',
            jobIndex: [
                { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },
                { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },
            ],
        });

        const result = await dispatchToBackground(runtimeMock, { action: 'STOP_BATCH', batchId: 'batch-stop' });
        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });

        const storage = await storageMock.get(null);
        const state = backgroundModule.__getState();

        expect(tabsMock._tabs.has(geminiA.id)).toBe(false);
        expect(tabsMock._tabs.has(geminiB.id)).toBe(false);
        expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);
        expect(Object.keys(storage).some(key => key.startsWith('gemini_job_'))).toBe(false);
        expect(Object.keys(storage).some(key => key.startsWith('wd_data_'))).toBe(false);
        expect((await alarmsMock.getAll())).toHaveLength(0);
        expect(state.extractionTabs).toEqual({});
        expect(state.activeJobsCount).toBe(0);
        expect(state.isProcessing).toBe(false);
    });

    test('BG-51/BG-53/BG-54: GEMINI_RESULT_URL registra extraction tab e CHECK_IF_EXTRACTION_TAB distingue hit/miss', async () => {
        const geminiTab = await tabsMock.create({ url: 'https://gemini.google.com/app/chat', active: false });

        await storageMock.set({
            [`gemini_job_${geminiTab.id}`]: {
                geminiTabId: geminiTab.id,
                mangaTabId: 22,
                index: 4,
                jobId: 'job-result-url',
            },
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 22,
            index: 4,
            url: 'https://lh3.googleusercontent.com/generated.png',
            jobId: 'job-result-url',
        }, { tab: { id: geminiTab.id, url: 'https://gemini.google.com/app/chat' } });

        expect(result.response).toEqual({ ok: true, extractionRegistered: true });

        const extractionTab = await waitFor(() =>
            Array.from(tabsMock._tabs.values()).find(tab =>
                tab.url === 'https://lh3.googleusercontent.com/generated.png#manga-translator-extraction'
                && backgroundModule.__getState().extractionTabs[tab.id]
            )
        );

        const hit = await dispatchToBackground(runtimeMock, {
            action: 'CHECK_IF_EXTRACTION_TAB',
        }, { tab: { id: extractionTab.id } });

        const miss = await dispatchToBackground(runtimeMock, {
            action: 'CHECK_IF_EXTRACTION_TAB',
        }, { tab: { id: 987654 } });

        expect(hit.response).toEqual(expect.objectContaining({
            isExtractionTab: true,
            mangaTabId: 22,
            index: 4,
            geminiTabId: geminiTab.id,
            jobId: 'job-result-url',
        }));
        expect(miss.response).toEqual({ isExtractionTab: false });
        expect(backgroundModule.__getState().extractionTabs[extractionTab.id]).toEqual(expect.objectContaining({
            mangaTabId: 22,
            index: 4,
            geminiTabId: geminiTab.id,
            jobId: 'job-result-url',
        }));
    });

    test('BG-57/BG-58: FETCH_IMAGE_AS_BASE64 converte blob em dataURL e responde erro em falha de fetch', async () => {
        global.fetch = jest.fn();
        global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'image/png' },
            blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
        });
        runtimeMock._messageListeners = [];
        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flush(4);

        const contentSender = { tab: { id: 222, url: 'https://manga.test/chapter' } };
        const success = await dispatchToBackground(runtimeMock, {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.test/page.png',
        }, contentSender);

        expect(success.keepAlive).toBe(true);
        expect(success.response).toEqual({
            dataUrl: 'data:image/png;base64,UkVBRA==',
        });
        expect(global.fetch).toHaveBeenCalledWith('https://cdn.test/page.png', expect.objectContaining({
            credentials: 'omit',
            cache: 'no-store',
            signal: expect.any(Object),
        }));

        global.fetch.mockRejectedValueOnce(new Error('HTTP 404'));
        const failure = await dispatchToBackground(runtimeMock, {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.test/missing.png',
        }, contentSender);

        expect(failure.keepAlive).toBe(true);
        expect(failure.response).toEqual({ error: 'HTTP 404' });
    });

    test('BG-37/BG-62: SHOW_EXISTING_FOLDER com anchorId valido chama downloads.show sem novo download', async () => {
        downloadsMock._downloads.set(707, {
            id: 707,
            url: 'data:image/png;base64,ANCHOR',
            filename: 'C:/Downloads/MangaTranslator/Capitulo/_anchor.png',
            state: 'complete',
            exists: true,
        });

        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();
        const downloadSpy = jest.spyOn(downloadsMock, 'download');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'C:/Downloads/MangaTranslator/Capitulo',
            safeTitle: 'Capitulo',
            anchorId: 707,
        });

        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });
        expect(showSpy).toHaveBeenCalledWith(707);
        expect(downloadSpy).not.toHaveBeenCalled();
    });

    test('BG-65: EXPORT_ALL_AND_SHOW com lista vazia responde imediatamente sem downloads', async () => {
        const downloadSpy = jest.spyOn(downloadsMock, 'download');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'EXPORT_ALL_AND_SHOW',
            allDownloads: [],
        });

        expect(result.response).toEqual({ ok: true });
        expect(downloadSpy).not.toHaveBeenCalled();
    });

    test('BG-66/BG-67: SET_DEBUG_MODE salva storage e envia DEBUG_MODE_CHANGED para todas as abas', async () => {
        const tabA = await tabsMock.create({ url: 'https://manga.test/a', active: true });
        const tabB = await tabsMock.create({ url: 'https://manga.test/b', active: false });
        const messagesA = [];
        const messagesB = [];

        tabsMock._registerMessageHandler(tabA.id, (message, _sender, sendResponse) => {
            messagesA.push(message);
            sendResponse({ ok: true });
        });
        tabsMock._registerMessageHandler(tabB.id, (message, _sender, sendResponse) => {
            messagesB.push(message);
            sendResponse({ ok: true });
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'SET_DEBUG_MODE',
            debugOn: true,
        });

        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });

        const data = await storageMock.get(['debugMode']);
        expect(data.debugMode).toBe(true);
        expect(messagesA).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
        expect(messagesB).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
    });
});
~~~

## 10. Mapa linha por linha

| Linha | Unidade | Fonte | Papel | Evidência |
|---:|---|---|---|---|
| 001 | U01 | <code>const {</code> | Executa instrução específica de imports e caminhos do harness: <code>const {</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 002 | U01 | <code>    getRuntimeMock,</code> | Executa instrução específica de imports e caminhos do harness: <code>getRuntimeMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 003 | U01 | <code>    getStorageMock,</code> | Executa instrução específica de imports e caminhos do harness: <code>getStorageMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 004 | U01 | <code>    getTabsMock,</code> | Executa instrução específica de imports e caminhos do harness: <code>getTabsMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 005 | U01 | <code>    getDownloadsMock,</code> | Executa instrução específica de imports e caminhos do harness: <code>getDownloadsMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 006 | U01 | <code>    getAlarmsMock,</code> | Executa instrução específica de imports e caminhos do harness: <code>getAlarmsMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 007 | U01 | <code>} = require('../../mocks/chrome-api.mock.js');</code> | Fecha a estrutura sintática corrente de imports e caminhos do harness. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 008 | U01 | <code>const { loadBackgroundModule } = require('../../helpers/load-background-module.js');</code> | Declara valor local usado em imports e caminhos do harness: <code>const { loadBackgroundModule } = require('../../helpers/load-background-module.js');</code> | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 009 | U01 | <code>const {</code> | Executa instrução específica de imports e caminhos do harness: <code>const {</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 010 | U01 | <code>    BACKGROUND_PATH,</code> | Executa instrução específica de imports e caminhos do harness: <code>BACKGROUND_PATH,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 011 | U01 | <code>    flush,</code> | Executa instrução específica de imports e caminhos do harness: <code>flush,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 012 | U01 | <code>    dispatchToBackground,</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 013 | U01 | <code>    waitFor,</code> | Inicia/participa de gate temporal que falha se o efeito assíncrono esperado não aparecer no timeout do helper. | ✅ PROVADO DIRETAMENTE |
| 014 | U01 | <code>} = require('../../helpers/background-test-utils.js');</code> | Fecha a estrutura sintática corrente de imports e caminhos do harness. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 015 | U02 | <code>␠ [linha vazia]</code> | Separador visual dentro de suíte, estado local e MockFileReader; sem efeito runtime. | estrutural |
| 016 | U02 | <code>describe('REG-09/IPC-07/IPC-08: background.js - handlers faltantes do plano v3.1', () =&gt; {</code> | Declara a suíte Jest que agrupa regressões de handlers do background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 017 | U02 | <code>    let runtimeMock;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let runtimeMock;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 018 | U02 | <code>    let storageMock;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let storageMock;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 019 | U02 | <code>    let tabsMock;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let tabsMock;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 020 | U02 | <code>    let downloadsMock;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let downloadsMock;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 021 | U02 | <code>    let alarmsMock;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let alarmsMock;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 022 | U02 | <code>    let backgroundModule;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let backgroundModule;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 023 | U02 | <code>    let originalFetch;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let originalFetch;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 024 | U02 | <code>    let originalFileReader;</code> | Declara valor local usado em suíte, estado local e MockFileReader: <code>let originalFileReader;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 025 | U02 | <code>␠ [linha vazia]</code> | Separador visual dentro de suíte, estado local e MockFileReader; sem efeito runtime. | estrutural |
| 026 | U02 | <code>    class MockFileReader {</code> | Define/usa FileReader mínimo que produz dataURL previsível e dispara onloadend assíncrono. | 🟨 EXECUTADO INDIRETAMENTE |
| 027 | U02 | <code>        readAsDataURL(blob) {</code> | Executa instrução específica de suíte, estado local e MockFileReader: <code>readAsDataURL(blob) {</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 028 | U02 | <code>            this.result = &#96;data:${blob.type || 'application/octet-stream'};base64,UkVBRA==&#96;;</code> | Fixa o dataURL retornado pelo MockFileReader usando o MIME do blob e payload base64 conhecido. | 🟨 EXECUTADO INDIRETAMENTE |
| 029 | U02 | <code>            setTimeout(() =&gt; {</code> | Agenda onloadend no próximo tick para reproduzir a natureza assíncrona de FileReader. | 🟨 EXECUTADO INDIRETAMENTE |
| 030 | U02 | <code>                if (typeof this.onloadend === 'function') this.onloadend();</code> | Executa instrução específica de suíte, estado local e MockFileReader: <code>if (typeof this.onloadend === 'function') this.onloadend();</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 031 | U02 | <code>            }, 0);</code> | Fecha a estrutura sintática corrente de suíte, estado local e MockFileReader. | 🟨 EXECUTADO INDIRETAMENTE |
| 032 | U02 | <code>        }</code> | Fecha a estrutura sintática corrente de suíte, estado local e MockFileReader. | 🟨 EXECUTADO INDIRETAMENTE |
| 033 | U02 | <code>    }</code> | Fecha a estrutura sintática corrente de suíte, estado local e MockFileReader. | 🟨 EXECUTADO INDIRETAMENTE |
| 034 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach; sem efeito runtime. | estrutural |
| 035 | U03 | <code>    beforeEach(async () =&gt; {</code> | Abre o setup executado antes de cada caso para reconstruir o ambiente do background. | 🟨 EXECUTADO INDIRETAMENTE |
| 036 | U03 | <code>        jest.resetModules();</code> | Limpa o cache de módulos Jest antes de reconstruir background e módulos IIFE. | 🟨 EXECUTADO INDIRETAMENTE |
| 037 | U03 | <code>        jest.useRealTimers();</code> | Garante timers reais para fluxos assíncronos do background e do MockFileReader. | 🟨 EXECUTADO INDIRETAMENTE |
| 038 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach; sem efeito runtime. | estrutural |
| 039 | U03 | <code>        runtimeMock = getRuntimeMock();</code> | Obtém a instância singleton do mock de chrome.runtime usada pelo listener real do background. | 🟨 EXECUTADO INDIRETAMENTE |
| 040 | U03 | <code>        storageMock = getStorageMock();</code> | Obtém o mock de chrome.storage.local que persiste o estado observável da suíte. | 🟨 EXECUTADO INDIRETAMENTE |
| 041 | U03 | <code>        tabsMock = getTabsMock();</code> | Obtém o mock de chrome.tabs que materializa abas e mensagens em memória. | 🟨 EXECUTADO INDIRETAMENTE |
| 042 | U03 | <code>        downloadsMock = getDownloadsMock();</code> | Obtém o mock de chrome.downloads usado para observar show/download sem tocar o SO. | 🟨 EXECUTADO INDIRETAMENTE |
| 043 | U03 | <code>        alarmsMock = getAlarmsMock();</code> | Obtém o mock de chrome.alarms usado para watchdogs e limpeza do lote. | 🟨 EXECUTADO INDIRETAMENTE |
| 044 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach; sem efeito runtime. | estrutural |
| 045 | U03 | <code>        runtimeMock._messageListeners = [];</code> | Remove listeners onMessage prévios antes de recarregar background.js, mantendo exatamente um listener observável. | 🟨 EXECUTADO INDIRETAMENTE |
| 046 | U03 | <code>        runtimeMock._connectListeners = [];</code> | Limpa listeners onConnect herdados de execução anterior. | 🟨 EXECUTADO INDIRETAMENTE |
| 047 | U03 | <code>        runtimeMock._installedListeners = [];</code> | Limpa listeners onInstalled herdados antes do reload do módulo. | 🟨 EXECUTADO INDIRETAMENTE |
| 048 | U03 | <code>        runtimeMock._startupListeners = [];</code> | Limpa listeners onStartup herdados antes do reload do módulo. | 🟨 EXECUTADO INDIRETAMENTE |
| 049 | U03 | <code>        runtimeMock.lastError = null;</code> | Executa instrução específica de beforeEach: <code>runtimeMock.lastError = null;</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 050 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach; sem efeito runtime. | estrutural |
| 051 | U03 | <code>        tabsMock._tabs.clear();</code> | Esvazia o registro de abas simuladas para isolar o caso. | 🟨 EXECUTADO INDIRETAMENTE |
| 052 | U03 | <code>        downloadsMock._downloads.clear();</code> | Esvazia downloads simulados para isolar o caso. | 🟨 EXECUTADO INDIRETAMENTE |
| 053 | U03 | <code>        alarmsMock.clearAll();</code> | Remove alarmes/watchdogs simulados para evitar estado residual entre casos. | 🟨 EXECUTADO INDIRETAMENTE |
| 054 | U03 | <code>        await storageMock.clear();</code> | Limpa completamente o storage mock para cada caso começar sem persistência residual. | 🟨 EXECUTADO INDIRETAMENTE |
| 055 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach; sem efeito runtime. | estrutural |
| 056 | U03 | <code>        originalFetch = global.fetch;</code> | Configura/restaura fetch global controlado para tornar o cenário de rede determinístico. | 🟨 EXECUTADO INDIRETAMENTE |
| 057 | U03 | <code>        originalFileReader = global.FileReader;</code> | Configura/restaura FileReader global determinístico usado na conversão para dataURL. | 🟨 EXECUTADO INDIRETAMENTE |
| 058 | U03 | <code>        global.FileReader = MockFileReader;</code> | Configura/restaura FileReader global determinístico usado na conversão para dataURL. | 🟨 EXECUTADO INDIRETAMENTE |
| 059 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach; sem efeito runtime. | estrutural |
| 060 | U03 | <code>        global.chrome = {</code> | Executa instrução específica de beforeEach: <code>global.chrome = {</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 061 | U03 | <code>            storage: { local: storageMock },</code> | Executa instrução específica de beforeEach: <code>storage: { local: storageMock },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 062 | U03 | <code>            tabs: tabsMock,</code> | Executa instrução específica de beforeEach: <code>tabs: tabsMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 063 | U03 | <code>            alarms: alarmsMock,</code> | Executa instrução específica de beforeEach: <code>alarms: alarmsMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 064 | U03 | <code>            runtime: runtimeMock,</code> | Executa instrução específica de beforeEach: <code>runtime: runtimeMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 065 | U03 | <code>            downloads: downloadsMock,</code> | Executa instrução específica de beforeEach: <code>downloads: downloadsMock,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 066 | U03 | <code>            scripting: global.chrome?.scripting,</code> | Executa instrução específica de beforeEach: <code>scripting: global.chrome?.scripting,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 067 | U03 | <code>        };</code> | Fecha a estrutura sintática corrente de beforeEach. | 🟨 EXECUTADO INDIRETAMENTE |
| 068 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach; sem efeito runtime. | estrutural |
| 069 | U03 | <code>        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);</code> | Carrega extension/background.js real e apenas anexa hooks de inspeção/exports do loader. | 🟨 EXECUTADO INDIRETAMENTE |
| 070 | U03 | <code>        await flush(8);</code> | Executa instrução específica de beforeEach: <code>await flush(8);</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 071 | U03 | <code>    });</code> | Fecha a estrutura sintática corrente de beforeEach. | 🟨 EXECUTADO INDIRETAMENTE |
| 072 | U04 | <code>␠ [linha vazia]</code> | Separador visual dentro de afterEach; sem efeito runtime. | estrutural |
| 073 | U04 | <code>    afterEach(async () =&gt; {</code> | Abre o teardown executado após cada caso para desfazer globais e limpar mocks. | 🟨 EXECUTADO INDIRETAMENTE |
| 074 | U04 | <code>        global.fetch = originalFetch;</code> | Configura/restaura fetch global controlado para tornar o cenário de rede determinístico. | 🟨 EXECUTADO INDIRETAMENTE |
| 075 | U04 | <code>        global.FileReader = originalFileReader;</code> | Configura/restaura FileReader global determinístico usado na conversão para dataURL. | 🟨 EXECUTADO INDIRETAMENTE |
| 076 | U04 | <code>        alarmsMock.clearAll();</code> | Remove alarmes/watchdogs simulados para evitar estado residual entre casos. | 🟨 EXECUTADO INDIRETAMENTE |
| 077 | U04 | <code>        tabsMock._tabs.clear();</code> | Esvazia o registro de abas simuladas para isolar o caso. | 🟨 EXECUTADO INDIRETAMENTE |
| 078 | U04 | <code>        downloadsMock._downloads.clear();</code> | Esvazia downloads simulados para isolar o caso. | 🟨 EXECUTADO INDIRETAMENTE |
| 079 | U04 | <code>        await storageMock.clear();</code> | Limpa completamente o storage mock para cada caso começar sem persistência residual. | 🟨 EXECUTADO INDIRETAMENTE |
| 080 | U04 | <code>        jest.useRealTimers();</code> | Garante timers reais para fluxos assíncronos do background e do MockFileReader. | 🟨 EXECUTADO INDIRETAMENTE |
| 081 | U04 | <code>        jest.restoreAllMocks();</code> | Restaura spies/mocks Jest criados pelo caso encerrado. | 🟨 EXECUTADO INDIRETAMENTE |
| 082 | U04 | <code>    });</code> | Fecha a estrutura sintática corrente de afterEach. | 🟨 EXECUTADO INDIRETAMENTE |
| 083 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-43 LOG_ENTRY; sem efeito runtime. | estrutural |
| 084 | U05 | <code>    test('BG-43: LOG_ENTRY responde ok e persiste a entrada no translatorLog', async () =&gt; {</code> | Declara o caso Jest BG-43: LOG_ENTRY responde ok e persiste a entrada no translatorLog. | 🟨 EXECUTADO INDIRETAMENTE |
| 085 | U05 | <code>        const result = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 086 | U05 | <code>            action: 'LOG_ENTRY',</code> | Define a action da request de BG-43 LOG_ENTRY: action: 'LOG_ENTRY',. | 🟨 EXECUTADO INDIRETAMENTE |
| 087 | U05 | <code>            level: 'warn',</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>level: 'warn',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 088 | U05 | <code>            source: 'popup',</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>source: 'popup',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 089 | U05 | <code>            action_name: 'PLAN_LOG',</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>action_name: 'PLAN_LOG',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 090 | U05 | <code>            detail: 'entrada do plano',</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>detail: 'entrada do plano',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 091 | U05 | <code>            extra: { id: 43 },</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>extra: { id: 43 },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 092 | U05 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-43 LOG_ENTRY. | 🟨 EXECUTADO INDIRETAMENTE |
| 093 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-43 LOG_ENTRY; sem efeito runtime. | estrutural |
| 094 | U05 | <code>        expect(result.keepAlive).toBe(false);</code> | Assertion direta do cenário BG-43 LOG_ENTRY; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 095 | U05 | <code>        expect(result.response).toEqual({ ok: true });</code> | Assertion direta do cenário BG-43 LOG_ENTRY; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 096 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-43 LOG_ENTRY; sem efeito runtime. | estrutural |
| 097 | U05 | <code>        const logs = await waitFor(async () =&gt; {</code> | Inicia/participa de gate temporal que falha se o efeito assíncrono esperado não aparecer no timeout do helper. | ✅ PROVADO DIRETAMENTE |
| 098 | U05 | <code>            const data = await storageMock.get(['translatorLog']);</code> | Lê o chrome.storage.local mock para observar efeito persistido pelo handler real. | ✅ PROVADO DIRETAMENTE |
| 099 | U05 | <code>            return (data.translatorLog || []).find(entry =&gt; entry.action === 'PLAN_LOG');</code> | Transforma/consulta a coleção observável de BG-43 LOG_ENTRY: <code>return (data.translatorLog || []).find(entry =&gt; entry.action === 'PLAN_LOG');</code> | ✅ PROVADO DIRETAMENTE |
| 100 | U05 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-43 LOG_ENTRY. | ✅ PROVADO DIRETAMENTE |
| 101 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-43 LOG_ENTRY; sem efeito runtime. | estrutural |
| 102 | U05 | <code>        expect(logs).toEqual(expect.objectContaining({</code> | Assertion direta do cenário BG-43 LOG_ENTRY; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 103 | U05 | <code>            level: 'warn',</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>level: 'warn',</code> | ✅ PROVADO DIRETAMENTE |
| 104 | U05 | <code>            source: 'popup',</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>source: 'popup',</code> | ✅ PROVADO DIRETAMENTE |
| 105 | U05 | <code>            action: 'PLAN_LOG',</code> | Define a action da request de BG-43 LOG_ENTRY: action: 'PLAN_LOG',. | ✅ PROVADO DIRETAMENTE |
| 106 | U05 | <code>            detail: 'entrada do plano',</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>detail: 'entrada do plano',</code> | ✅ PROVADO DIRETAMENTE |
| 107 | U05 | <code>            extra: { id: 43 },</code> | Configura/verifica dado específico de BG-43 LOG_ENTRY: <code>extra: { id: 43 },</code> | ✅ PROVADO DIRETAMENTE |
| 108 | U05 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-43 LOG_ENTRY. | ✅ PROVADO DIRETAMENTE |
| 109 | U05 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-43 LOG_ENTRY. | 🟨 EXECUTADO INDIRETAMENTE |
| 110 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 111 | U06 | <code>    test('BG-44: START_BATCH enfileira B/C/D/E/F sem sobrescrever A e preserva FIFO/idempotência', async () =&gt; {</code> | Declara o caso Jest BG-44: START_BATCH enfileira B/C/D/E/F sem sobrescrever A e preserva FIFO/idempotência. | 🟨 EXECUTADO INDIRETAMENTE |
| 112 | U06 | <code>        await storageMock.set({ maxConcurrentJobs: 3 });</code> | Persiste dados de entrada no chrome.storage.local mock antes de executar o handler real. | 🟨 EXECUTADO INDIRETAMENTE |
| 113 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 114 | U06 | <code>        const liveA = await tabsMock.create({ url: 'https://gemini.google.com/app/a', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 115 | U06 | <code>        const liveB = await tabsMock.create({ url: 'https://gemini.google.com/app/b', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 116 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 117 | U06 | <code>        backgroundModule.__setState({</code> | Injeta snapshot controlado no estado interno do background real por hook de instrumentação. | 🟨 EXECUTADO INDIRETAMENTE |
| 118 | U06 | <code>            isProcessing: true,</code> | Executa instrução específica de BG-44 START_BATCH FIFO: <code>isProcessing: true,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 119 | U06 | <code>            currentBatchId: 'batch-a',</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>currentBatchId: 'batch-a',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 120 | U06 | <code>            completedJobs: 1,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>completedJobs: 1,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 121 | U06 | <code>            totalJobs: 4,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>totalJobs: 4,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 122 | U06 | <code>            activeJobsCount: 2,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>activeJobsCount: 2,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 123 | U06 | <code>            activeMangaTabId: 999,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>activeMangaTabId: 999,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 124 | U06 | <code>            pendingBatches: [],</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>pendingBatches: [],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 125 | U06 | <code>            jobQueue: [</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>jobQueue: [</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 126 | U06 | <code>                { mangaTabId: 999, index: 3, prompt: 'A', batchId: 'batch-a' },</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>{ mangaTabId: 999, index: 3, prompt: 'A', batchId: 'batch-a' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 127 | U06 | <code>            ],</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | 🟨 EXECUTADO INDIRETAMENTE |
| 128 | U06 | <code>            jobIndex: [</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>jobIndex: [</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 129 | U06 | <code>                { geminiTabId: liveA.id, jobId: 'job-a1', batchId: 'batch-a', mangaTabId: 999, index: 1 },</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>{ geminiTabId: liveA.id, jobId: 'job-a1', batchId: 'batch-a', mangaTabId: 999, index: 1 },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 130 | U06 | <code>                { geminiTabId: liveB.id, jobId: 'job-a2', batchId: 'batch-a', mangaTabId: 999, index: 2 },</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>{ geminiTabId: liveB.id, jobId: 'job-a2', batchId: 'batch-a', mangaTabId: 999, index: 2 },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 131 | U06 | <code>            ],</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | 🟨 EXECUTADO INDIRETAMENTE |
| 132 | U06 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | 🟨 EXECUTADO INDIRETAMENTE |
| 133 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 134 | U06 | <code>        const before = backgroundModule.__getState();</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | 🟨 EXECUTADO INDIRETAMENTE |
| 135 | U06 | <code>        const batchIds = ['batch-b', 'batch-c', 'batch-d', 'batch-e', 'batch-f'];</code> | Declara valor local usado em BG-44 START_BATCH FIFO: <code>const batchIds = ['batch-b', 'batch-c', 'batch-d', 'batch-e', 'batch-f'];</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 136 | U06 | <code>        const responses = [];</code> | Declara valor local usado em BG-44 START_BATCH FIFO: <code>const responses = [];</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 137 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 138 | U06 | <code>        for (let index = 0; index &lt; batchIds.length; index++) {</code> | Declara valor local usado em BG-44 START_BATCH FIFO: <code>for (let index = 0; index &lt; batchIds.length; index++) {</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 139 | U06 | <code>            // eslint-disable-next-line no-await-in-loop</code> | Comentário de intenção em BG-44 START_BATCH FIFO: eslint-disable-next-line no-await-in-loop | 🟨 EXECUTADO INDIRETAMENTE |
| 140 | U06 | <code>            const result = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 141 | U06 | <code>                action: 'START_BATCH',</code> | Define a action da request de BG-44 START_BATCH FIFO: action: 'START_BATCH',. | 🟨 EXECUTADO INDIRETAMENTE |
| 142 | U06 | <code>                batchId: batchIds[index],</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>batchId: batchIds[index],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 143 | U06 | <code>                images: [{ index: 0 }, { index: 1 }],</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>images: [{ index: 0 }, { index: 1 }],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 144 | U06 | <code>                prompt: &#96;prompt-${batchIds[index]}&#96;,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>prompt: &#96;prompt-${batchIds[index]}&#96;,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 145 | U06 | <code>            }, { tab: { id: 120 + index } });</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | 🟨 EXECUTADO INDIRETAMENTE |
| 146 | U06 | <code>            responses.push(result.response);</code> | Transforma/consulta a coleção observável de BG-44 START_BATCH FIFO: <code>responses.push(result.response);</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 147 | U06 | <code>        }</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | 🟨 EXECUTADO INDIRETAMENTE |
| 148 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 149 | U06 | <code>        responses.forEach((response, index) =&gt; {</code> | Itera os itens do cenário BG-44 START_BATCH FIFO preservando a ordem verificada pelas assertions subsequentes. | ✅ PROVADO DIRETAMENTE |
| 150 | U06 | <code>            expect(response).toEqual(expect.objectContaining({</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 151 | U06 | <code>                ok: true,</code> | Define parte da resposta/fixture controlada de BG-44 START_BATCH FIFO: <code>ok: true,</code> | ✅ PROVADO DIRETAMENTE |
| 152 | U06 | <code>                queued: true,</code> | Executa instrução específica de BG-44 START_BATCH FIFO: <code>queued: true,</code> | ✅ PROVADO DIRETAMENTE |
| 153 | U06 | <code>                batchId: batchIds[index],</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>batchId: batchIds[index],</code> | ✅ PROVADO DIRETAMENTE |
| 154 | U06 | <code>                activeBatchId: 'batch-a',</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>activeBatchId: 'batch-a',</code> | ✅ PROVADO DIRETAMENTE |
| 155 | U06 | <code>                queuePosition: index + 1,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>queuePosition: index + 1,</code> | ✅ PROVADO DIRETAMENTE |
| 156 | U06 | <code>            }));</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | ✅ PROVADO DIRETAMENTE |
| 157 | U06 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | ✅ PROVADO DIRETAMENTE |
| 158 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 159 | U06 | <code>        const after = backgroundModule.__getState();</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 160 | U06 | <code>        expect(after).toEqual(expect.objectContaining({</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 161 | U06 | <code>            isProcessing: before.isProcessing,</code> | Executa instrução específica de BG-44 START_BATCH FIFO: <code>isProcessing: before.isProcessing,</code> | ✅ PROVADO DIRETAMENTE |
| 162 | U06 | <code>            currentBatchId: 'batch-a',</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>currentBatchId: 'batch-a',</code> | ✅ PROVADO DIRETAMENTE |
| 163 | U06 | <code>            completedJobs: before.completedJobs,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>completedJobs: before.completedJobs,</code> | ✅ PROVADO DIRETAMENTE |
| 164 | U06 | <code>            totalJobs: before.totalJobs,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>totalJobs: before.totalJobs,</code> | ✅ PROVADO DIRETAMENTE |
| 165 | U06 | <code>            activeJobsCount: before.activeJobsCount,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>activeJobsCount: before.activeJobsCount,</code> | ✅ PROVADO DIRETAMENTE |
| 166 | U06 | <code>            activeMangaTabId: before.activeMangaTabId,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>activeMangaTabId: before.activeMangaTabId,</code> | ✅ PROVADO DIRETAMENTE |
| 167 | U06 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | ✅ PROVADO DIRETAMENTE |
| 168 | U06 | <code>        expect(after.jobQueue).toEqual(before.jobQueue);</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 169 | U06 | <code>        expect(after.jobIndex).toEqual(before.jobIndex);</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 170 | U06 | <code>        expect(after.pendingBatches.map(batch =&gt; batch.batchId)).toEqual(batchIds);</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 171 | U06 | <code>        expect(tabsMock._tabs.size).toBe(2);</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 172 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 173 | U06 | <code>        const retryD = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | ✅ PROVADO DIRETAMENTE |
| 174 | U06 | <code>            action: 'START_BATCH',</code> | Define a action da request de BG-44 START_BATCH FIFO: action: 'START_BATCH',. | ✅ PROVADO DIRETAMENTE |
| 175 | U06 | <code>            batchId: 'batch-d',</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>batchId: 'batch-d',</code> | ✅ PROVADO DIRETAMENTE |
| 176 | U06 | <code>            images: [{ index: 0 }, { index: 1 }],</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>images: [{ index: 0 }, { index: 1 }],</code> | ✅ PROVADO DIRETAMENTE |
| 177 | U06 | <code>            prompt: 'retry não deve duplicar',</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>prompt: 'retry não deve duplicar',</code> | ✅ PROVADO DIRETAMENTE |
| 178 | U06 | <code>        }, { tab: { id: 122 } });</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | ✅ PROVADO DIRETAMENTE |
| 179 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 180 | U06 | <code>        expect(retryD.response).toEqual(expect.objectContaining({</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 181 | U06 | <code>            ok: true,</code> | Define parte da resposta/fixture controlada de BG-44 START_BATCH FIFO: <code>ok: true,</code> | ✅ PROVADO DIRETAMENTE |
| 182 | U06 | <code>            queued: true,</code> | Executa instrução específica de BG-44 START_BATCH FIFO: <code>queued: true,</code> | ✅ PROVADO DIRETAMENTE |
| 183 | U06 | <code>            alreadyQueued: true,</code> | Executa instrução específica de BG-44 START_BATCH FIFO: <code>alreadyQueued: true,</code> | ✅ PROVADO DIRETAMENTE |
| 184 | U06 | <code>            batchId: 'batch-d',</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>batchId: 'batch-d',</code> | ✅ PROVADO DIRETAMENTE |
| 185 | U06 | <code>            queuePosition: 3,</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>queuePosition: 3,</code> | ✅ PROVADO DIRETAMENTE |
| 186 | U06 | <code>            activeBatchId: 'batch-a',</code> | Configura/verifica dado específico de BG-44 START_BATCH FIFO: <code>activeBatchId: 'batch-a',</code> | ✅ PROVADO DIRETAMENTE |
| 187 | U06 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | ✅ PROVADO DIRETAMENTE |
| 188 | U06 | <code>        expect(backgroundModule.__getState().pendingBatches.map(batch =&gt; batch.batchId))</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 189 | U06 | <code>            .toEqual(batchIds);</code> | Executa instrução específica de BG-44 START_BATCH FIFO: <code>.toEqual(batchIds);</code> | ✅ PROVADO DIRETAMENTE |
| 190 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44 START_BATCH FIFO; sem efeito runtime. | estrutural |
| 191 | U06 | <code>        const logs = await waitFor(async () =&gt; {</code> | Inicia/participa de gate temporal que falha se o efeito assíncrono esperado não aparecer no timeout do helper. | ✅ PROVADO DIRETAMENTE |
| 192 | U06 | <code>            const data = await storageMock.get(['translatorLog']);</code> | Lê o chrome.storage.local mock para observar efeito persistido pelo handler real. | ✅ PROVADO DIRETAMENTE |
| 193 | U06 | <code>            const entries = data.translatorLog || [];</code> | Declara valor local usado em BG-44 START_BATCH FIFO: <code>const entries = data.translatorLog || [];</code> | ✅ PROVADO DIRETAMENTE |
| 194 | U06 | <code>            const queuedCount = entries.filter(entry =&gt; entry.action === 'BATCH_QUEUED').length;</code> | Transforma/consulta a coleção observável de BG-44 START_BATCH FIFO: <code>const queuedCount = entries.filter(entry =&gt; entry.action === 'BATCH_QUEUED').length;</code> | ✅ PROVADO DIRETAMENTE |
| 195 | U06 | <code>            const hasDuplicate = entries.some(entry =&gt; entry.action === 'BATCH_QUEUE_DUPLICATE_IGNORED');</code> | Transforma/consulta a coleção observável de BG-44 START_BATCH FIFO: <code>const hasDuplicate = entries.some(entry =&gt; entry.action === 'BATCH_QUEUE_DUPLICATE_IGNORED');</code> | ✅ PROVADO DIRETAMENTE |
| 196 | U06 | <code>            return queuedCount === 5 &amp;&amp; hasDuplicate ? entries : null;</code> | Retorna/produz valor intermediário em BG-44 START_BATCH FIFO: <code>return queuedCount === 5 &amp;&amp; hasDuplicate ? entries : null;</code> | ✅ PROVADO DIRETAMENTE |
| 197 | U06 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | ✅ PROVADO DIRETAMENTE |
| 198 | U06 | <code>        expect(logs.filter(entry =&gt; entry.action === 'BATCH_QUEUED')).toHaveLength(5);</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 199 | U06 | <code>        expect(logs.some(entry =&gt; entry.action === 'BATCH_QUEUE_DUPLICATE_IGNORED')).toBe(true);</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 200 | U06 | <code>        expect(logs.some(entry =&gt; entry.action === 'BATCH_OVERLAP_BLOCKED')).toBe(false);</code> | Assertion direta do cenário BG-44 START_BATCH FIFO; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 201 | U06 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-44 START_BATCH FIFO. | 🟨 EXECUTADO INDIRETAMENTE |
| 202 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44b STOP_BATCH pendente; sem efeito runtime. | estrutural |
| 203 | U07 | <code>    test('BG-44b: STOP_BATCH remove somente um lote pendente e mantém a ordem dos demais', async () =&gt; {</code> | Declara o caso Jest BG-44b: STOP_BATCH remove somente um lote pendente e mantém a ordem dos demais. | 🟨 EXECUTADO INDIRETAMENTE |
| 204 | U07 | <code>        const liveA = await tabsMock.create({ url: 'https://gemini.google.com/app/a-live', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 205 | U07 | <code>        backgroundModule.__setState({</code> | Injeta snapshot controlado no estado interno do background real por hook de instrumentação. | 🟨 EXECUTADO INDIRETAMENTE |
| 206 | U07 | <code>            isProcessing: true,</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>isProcessing: true,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 207 | U07 | <code>            currentBatchId: 'batch-a',</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>currentBatchId: 'batch-a',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 208 | U07 | <code>            completedJobs: 0,</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>completedJobs: 0,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 209 | U07 | <code>            totalJobs: 1,</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>totalJobs: 1,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 210 | U07 | <code>            activeJobsCount: 1,</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>activeJobsCount: 1,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 211 | U07 | <code>            activeMangaTabId: 10,</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>activeMangaTabId: 10,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 212 | U07 | <code>            jobQueue: [],</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>jobQueue: [],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 213 | U07 | <code>            jobIndex: [</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>jobIndex: [</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 214 | U07 | <code>                { geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a', mangaTabId: 10, index: 0 },</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>{ geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a', mangaTabId: 10, index: 0 },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 215 | U07 | <code>            ],</code> | Fecha a estrutura sintática corrente de BG-44b STOP_BATCH pendente. | 🟨 EXECUTADO INDIRETAMENTE |
| 216 | U07 | <code>            pendingBatches: [</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>pendingBatches: [</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 217 | U07 | <code>                { batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [{ index: 0 }] },</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>{ batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [{ index: 0 }] },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 218 | U07 | <code>                { batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [{ index: 0 }] },</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>{ batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [{ index: 0 }] },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 219 | U07 | <code>                { batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [{ index: 0 }] },</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>{ batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [{ index: 0 }] },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 220 | U07 | <code>            ],</code> | Fecha a estrutura sintática corrente de BG-44b STOP_BATCH pendente. | 🟨 EXECUTADO INDIRETAMENTE |
| 221 | U07 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-44b STOP_BATCH pendente. | 🟨 EXECUTADO INDIRETAMENTE |
| 222 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44b STOP_BATCH pendente; sem efeito runtime. | estrutural |
| 223 | U07 | <code>        const result = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 224 | U07 | <code>            action: 'STOP_BATCH',</code> | Define a action da request de BG-44b STOP_BATCH pendente: action: 'STOP_BATCH',. | 🟨 EXECUTADO INDIRETAMENTE |
| 225 | U07 | <code>            batchId: 'batch-c',</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>batchId: 'batch-c',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 226 | U07 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-44b STOP_BATCH pendente. | 🟨 EXECUTADO INDIRETAMENTE |
| 227 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44b STOP_BATCH pendente; sem efeito runtime. | estrutural |
| 228 | U07 | <code>        expect(result.response).toEqual({ ok: true });</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 229 | U07 | <code>        const state = backgroundModule.__getState();</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 230 | U07 | <code>        expect(state.currentBatchId).toBe('batch-a');</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 231 | U07 | <code>        expect(state.jobQueue).toEqual([]);</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 232 | U07 | <code>        expect(state.jobIndex).toEqual([</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 233 | U07 | <code>            expect.objectContaining({ geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a' }),</code> | Configura/verifica dado específico de BG-44b STOP_BATCH pendente: <code>expect.objectContaining({ geminiTabId: liveA.id, jobId: 'job-a-live', batchId: 'batch-a' }),</code> | ✅ PROVADO DIRETAMENTE |
| 234 | U07 | <code>        ]);</code> | Fecha a estrutura sintática corrente de BG-44b STOP_BATCH pendente. | ✅ PROVADO DIRETAMENTE |
| 235 | U07 | <code>        expect(tabsMock._tabs.has(liveA.id)).toBe(true);</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 236 | U07 | <code>        expect(state.pendingBatches.map(batch =&gt; batch.batchId))</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 237 | U07 | <code>            .toEqual(['batch-b', 'batch-d']);</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>.toEqual(['batch-b', 'batch-d']);</code> | ✅ PROVADO DIRETAMENTE |
| 238 | U07 | <code>        expect(state.isProcessing).toBe(true);</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 239 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-44b STOP_BATCH pendente; sem efeito runtime. | estrutural |
| 240 | U07 | <code>        const logs = await waitFor(async () =&gt; {</code> | Inicia/participa de gate temporal que falha se o efeito assíncrono esperado não aparecer no timeout do helper. | ✅ PROVADO DIRETAMENTE |
| 241 | U07 | <code>            const data = await storageMock.get(['translatorLog']);</code> | Lê o chrome.storage.local mock para observar efeito persistido pelo handler real. | ✅ PROVADO DIRETAMENTE |
| 242 | U07 | <code>            const entries = data.translatorLog || [];</code> | Declara valor local usado em BG-44b STOP_BATCH pendente: <code>const entries = data.translatorLog || [];</code> | ✅ PROVADO DIRETAMENTE |
| 243 | U07 | <code>            return entries.some(entry =&gt;</code> | Transforma/consulta a coleção observável de BG-44b STOP_BATCH pendente: <code>return entries.some(entry =&gt;</code> | ✅ PROVADO DIRETAMENTE |
| 244 | U07 | <code>                entry.action === 'BATCH_QUEUE_CANCELLED' &amp;&amp;</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>entry.action === 'BATCH_QUEUE_CANCELLED' &amp;&amp;</code> | ✅ PROVADO DIRETAMENTE |
| 245 | U07 | <code>                entry.extra?.batchId === 'batch-c'</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>entry.extra?.batchId === 'batch-c'</code> | ✅ PROVADO DIRETAMENTE |
| 246 | U07 | <code>            ) ? entries : null;</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>) ? entries : null;</code> | ✅ PROVADO DIRETAMENTE |
| 247 | U07 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-44b STOP_BATCH pendente. | ✅ PROVADO DIRETAMENTE |
| 248 | U07 | <code>        expect(logs.some(entry =&gt;</code> | Assertion direta do cenário BG-44b STOP_BATCH pendente; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 249 | U07 | <code>            entry.action === 'BATCH_QUEUE_CANCELLED' &amp;&amp;</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>entry.action === 'BATCH_QUEUE_CANCELLED' &amp;&amp;</code> | ✅ PROVADO DIRETAMENTE |
| 250 | U07 | <code>            entry.extra?.batchId === 'batch-c'</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>entry.extra?.batchId === 'batch-c'</code> | ✅ PROVADO DIRETAMENTE |
| 251 | U07 | <code>        )).toBe(true);</code> | Executa instrução específica de BG-44b STOP_BATCH pendente: <code>)).toBe(true);</code> | ✅ PROVADO DIRETAMENTE |
| 252 | U07 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-44b STOP_BATCH pendente. | 🟨 EXECUTADO INDIRETAMENTE |
| 253 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 254 | U08 | <code>    test('BG-45: START_BATCH idempotente não duplica jobs e lote ocioso respeita maxConcurrentJobs', async () =&gt; {</code> | Declara o caso Jest BG-45: START_BATCH idempotente não duplica jobs e lote ocioso respeita maxConcurrentJobs. | 🟨 EXECUTADO INDIRETAMENTE |
| 255 | U08 | <code>        // Fase 1 isola idempotência: com limite 1, o retry não pode ser</code> | Comentário de intenção em BG-45 START_BATCH idempotência/concorrência: Fase 1 isola idempotência: com limite 1, o retry não pode ser | 🟨 EXECUTADO INDIRETAMENTE |
| 256 | U08 | <code>        // confundido com o scheduler abrindo legitimamente o segundo job.</code> | Comentário de intenção em BG-45 START_BATCH idempotência/concorrência: confundido com o scheduler abrindo legitimamente o segundo job. | 🟨 EXECUTADO INDIRETAMENTE |
| 257 | U08 | <code>        await storageMock.set({ maxConcurrentJobs: 1 });</code> | Persiste dados de entrada no chrome.storage.local mock antes de executar o handler real. | 🟨 EXECUTADO INDIRETAMENTE |
| 258 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 259 | U08 | <code>        const existingTab = await tabsMock.create({ url: 'https://gemini.google.com/app/existing', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 260 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 261 | U08 | <code>        backgroundModule.__setState({</code> | Injeta snapshot controlado no estado interno do background real por hook de instrumentação. | 🟨 EXECUTADO INDIRETAMENTE |
| 262 | U08 | <code>            isProcessing: true,</code> | Executa instrução específica de BG-45 START_BATCH idempotência/concorrência: <code>isProcessing: true,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 263 | U08 | <code>            currentBatchId: 'batch-idempotente',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>currentBatchId: 'batch-idempotente',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 264 | U08 | <code>            completedJobs: 0,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>completedJobs: 0,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 265 | U08 | <code>            totalJobs: 2,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>totalJobs: 2,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 266 | U08 | <code>            activeJobsCount: 1,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>activeJobsCount: 1,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 267 | U08 | <code>            activeMangaTabId: 123,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>activeMangaTabId: 123,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 268 | U08 | <code>            jobQueue: [</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>jobQueue: [</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 269 | U08 | <code>                { mangaTabId: 123, index: 1, prompt: 'mesmo', batchId: 'batch-idempotente' },</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>{ mangaTabId: 123, index: 1, prompt: 'mesmo', batchId: 'batch-idempotente' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 270 | U08 | <code>            ],</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 271 | U08 | <code>            jobIndex: [</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>jobIndex: [</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 272 | U08 | <code>                { geminiTabId: existingTab.id, jobId: 'job-existing', batchId: 'batch-idempotente', mangaTabId: 123, index: 0 },</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>{ geminiTabId: existingTab.id, jobId: 'job-existing', batchId: 'batch-idempotente', mangaTabId: 123, index: 0 },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 273 | U08 | <code>            ],</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 274 | U08 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 275 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 276 | U08 | <code>        const retry = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 277 | U08 | <code>            action: 'START_BATCH',</code> | Define a action da request de BG-45 START_BATCH idempotência/concorrência: action: 'START_BATCH',. | 🟨 EXECUTADO INDIRETAMENTE |
| 278 | U08 | <code>            batchId: 'batch-idempotente',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>batchId: 'batch-idempotente',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 279 | U08 | <code>            images: [{ index: 0 }, { index: 1 }],</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>images: [{ index: 0 }, { index: 1 }],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 280 | U08 | <code>            prompt: 'mesmo',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>prompt: 'mesmo',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 281 | U08 | <code>        }, { tab: { id: 123 } });</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 282 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 283 | U08 | <code>        expect(retry.response).toEqual(expect.objectContaining({</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 284 | U08 | <code>            ok: true,</code> | Define parte da resposta/fixture controlada de BG-45 START_BATCH idempotência/concorrência: <code>ok: true,</code> | ✅ PROVADO DIRETAMENTE |
| 285 | U08 | <code>            batchId: 'batch-idempotente',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>batchId: 'batch-idempotente',</code> | ✅ PROVADO DIRETAMENTE |
| 286 | U08 | <code>            alreadyStarted: true,</code> | Executa instrução específica de BG-45 START_BATCH idempotência/concorrência: <code>alreadyStarted: true,</code> | ✅ PROVADO DIRETAMENTE |
| 287 | U08 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | ✅ PROVADO DIRETAMENTE |
| 288 | U08 | <code>        expect(backgroundModule.__getState().jobQueue).toHaveLength(1);</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 289 | U08 | <code>        expect(backgroundModule.__getState().jobIndex).toHaveLength(1);</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 290 | U08 | <code>        expect(tabsMock._tabs.size).toBe(1);</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 291 | U08 | <code>        await new Promise(resolve =&gt; tabsMock.remove(existingTab.id, resolve));</code> | Executa instrução específica de BG-45 START_BATCH idempotência/concorrência: <code>await new Promise(resolve =&gt; tabsMock.remove(existingTab.id, resolve));</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 292 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 293 | U08 | <code>        // Fase 2 testa separadamente o preenchimento do limite de concorrência.</code> | Comentário de intenção em BG-45 START_BATCH idempotência/concorrência: Fase 2 testa separadamente o preenchimento do limite de concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 294 | U08 | <code>        await storageMock.set({ maxConcurrentJobs: 3 });</code> | Persiste dados de entrada no chrome.storage.local mock antes de executar o handler real. | 🟨 EXECUTADO INDIRETAMENTE |
| 295 | U08 | <code>        backgroundModule.__setState({</code> | Injeta snapshot controlado no estado interno do background real por hook de instrumentação. | 🟨 EXECUTADO INDIRETAMENTE |
| 296 | U08 | <code>            isProcessing: false,</code> | Executa instrução específica de BG-45 START_BATCH idempotência/concorrência: <code>isProcessing: false,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 297 | U08 | <code>            currentBatchId: null,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>currentBatchId: null,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 298 | U08 | <code>            completedJobs: 0,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>completedJobs: 0,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 299 | U08 | <code>            totalJobs: 0,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>totalJobs: 0,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 300 | U08 | <code>            activeJobsCount: 0,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>activeJobsCount: 0,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 301 | U08 | <code>            activeMangaTabId: null,</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>activeMangaTabId: null,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 302 | U08 | <code>            jobQueue: [],</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>jobQueue: [],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 303 | U08 | <code>            jobIndex: [],</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>jobIndex: [],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 304 | U08 | <code>            completionClaimedBatchId: null,</code> | Executa instrução específica de BG-45 START_BATCH idempotência/concorrência: <code>completionClaimedBatchId: null,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 305 | U08 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 306 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 307 | U08 | <code>        const start = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 308 | U08 | <code>            action: 'START_BATCH',</code> | Define a action da request de BG-45 START_BATCH idempotência/concorrência: action: 'START_BATCH',. | 🟨 EXECUTADO INDIRETAMENTE |
| 309 | U08 | <code>            batchId: 'batch-novo',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>batchId: 'batch-novo',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 310 | U08 | <code>            images: Array.from({ length: 5 }, (_unused, index) =&gt; ({ index })),</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>images: Array.from({ length: 5 }, (_unused, index) =&gt; ({ index })),</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 311 | U08 | <code>            prompt: 'prompt novo',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>prompt: 'prompt novo',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 312 | U08 | <code>        }, { tab: { id: 123 } });</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 313 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 314 | U08 | <code>        expect(start.response).toEqual(expect.objectContaining({</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 315 | U08 | <code>            ok: true,</code> | Define parte da resposta/fixture controlada de BG-45 START_BATCH idempotência/concorrência: <code>ok: true,</code> | ✅ PROVADO DIRETAMENTE |
| 316 | U08 | <code>            batchId: 'batch-novo',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>batchId: 'batch-novo',</code> | ✅ PROVADO DIRETAMENTE |
| 317 | U08 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | ✅ PROVADO DIRETAMENTE |
| 318 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 319 | U08 | <code>        await waitFor(() =&gt; tabsMock._tabs.size === 3);</code> | Inicia/participa de gate temporal que falha se o efeito assíncrono esperado não aparecer no timeout do helper. | ✅ PROVADO DIRETAMENTE |
| 320 | U08 | <code>        const state = backgroundModule.__getState();</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 321 | U08 | <code>        expect(state.currentBatchId).toBe('batch-novo');</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 322 | U08 | <code>        expect(state.activeMangaTabId).toBe(123);</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 323 | U08 | <code>        expect(state.totalJobs).toBe(5);</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 324 | U08 | <code>        expect(state.completedJobs).toBe(0);</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 325 | U08 | <code>        expect(state.activeJobsCount).toBe(3);</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 326 | U08 | <code>        expect(state.jobQueue).toEqual([</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 327 | U08 | <code>            { mangaTabId: 123, index: 3, prompt: 'prompt novo', batchId: 'batch-novo' },</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>{ mangaTabId: 123, index: 3, prompt: 'prompt novo', batchId: 'batch-novo' },</code> | ✅ PROVADO DIRETAMENTE |
| 328 | U08 | <code>            { mangaTabId: 123, index: 4, prompt: 'prompt novo', batchId: 'batch-novo' },</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>{ mangaTabId: 123, index: 4, prompt: 'prompt novo', batchId: 'batch-novo' },</code> | ✅ PROVADO DIRETAMENTE |
| 329 | U08 | <code>        ]);</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | ✅ PROVADO DIRETAMENTE |
| 330 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-45 START_BATCH idempotência/concorrência; sem efeito runtime. | estrutural |
| 331 | U08 | <code>        // Não deixe jobs assíncronos deste teste vazarem para o próximo caso.</code> | Comentário de intenção em BG-45 START_BATCH idempotência/concorrência: Não deixe jobs assíncronos deste teste vazarem para o próximo caso. | ✅ PROVADO DIRETAMENTE |
| 332 | U08 | <code>        const stop = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | ✅ PROVADO DIRETAMENTE |
| 333 | U08 | <code>            action: 'STOP_BATCH',</code> | Define a action da request de BG-45 START_BATCH idempotência/concorrência: action: 'STOP_BATCH',. | ✅ PROVADO DIRETAMENTE |
| 334 | U08 | <code>            batchId: 'batch-novo',</code> | Configura/verifica dado específico de BG-45 START_BATCH idempotência/concorrência: <code>batchId: 'batch-novo',</code> | ✅ PROVADO DIRETAMENTE |
| 335 | U08 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | ✅ PROVADO DIRETAMENTE |
| 336 | U08 | <code>        expect(stop.response).toEqual({ ok: true });</code> | Assertion direta do cenário BG-45 START_BATCH idempotência/concorrência; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 337 | U08 | <code>        await flush(8);</code> | Executa instrução específica de BG-45 START_BATCH idempotência/concorrência: <code>await flush(8);</code> | ✅ PROVADO DIRETAMENTE |
| 338 | U08 | <code>        expect(backgroundModule.__getState().jobIndex).toEqual([]);</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 339 | U08 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-45 START_BATCH idempotência/concorrência. | 🟨 EXECUTADO INDIRETAMENTE |
| 340 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-46 STOP_BATCH cleanup ativo; sem efeito runtime. | estrutural |
| 341 | U09 | <code>    test('BG-46: STOP_BATCH remove abas Gemini, watchdogs, jobs e extractionTabs', async () =&gt; {</code> | Declara o caso Jest BG-46: STOP_BATCH remove abas Gemini, watchdogs, jobs e extractionTabs. | 🟨 EXECUTADO INDIRETAMENTE |
| 342 | U09 | <code>        const geminiA = await tabsMock.create({ url: 'https://gemini.google.com/app/a', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 343 | U09 | <code>        const geminiB = await tabsMock.create({ url: 'https://gemini.google.com/app/b', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 344 | U09 | <code>        const extractionTab = await tabsMock.create({ url: 'https://cdn.test/result.png', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 345 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-46 STOP_BATCH cleanup ativo; sem efeito runtime. | estrutural |
| 346 | U09 | <code>        await storageMock.set({</code> | Persiste dados de entrada no chrome.storage.local mock antes de executar o handler real. | 🟨 EXECUTADO INDIRETAMENTE |
| 347 | U09 | <code>            [&#96;gemini_job_${geminiA.id}&#96;]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>[&#96;gemini_job_${geminiA.id}&#96;]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 348 | U09 | <code>            [&#96;gemini_job_${geminiB.id}&#96;]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>[&#96;gemini_job_${geminiB.id}&#96;]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 349 | U09 | <code>            [&#96;wd_data_${geminiA.id}&#96;]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a' },</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>[&#96;wd_data_${geminiA.id}&#96;]: { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 350 | U09 | <code>            [&#96;wd_data_${geminiB.id}&#96;]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b' },</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>[&#96;wd_data_${geminiB.id}&#96;]: { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 351 | U09 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-46 STOP_BATCH cleanup ativo. | 🟨 EXECUTADO INDIRETAMENTE |
| 352 | U09 | <code>        alarmsMock.create('watchdog_job-a', { delayInMinutes: 4 });</code> | Semeia watchdog no mock de alarmes para verificar remoção no STOP_BATCH. | 🟨 EXECUTADO INDIRETAMENTE |
| 353 | U09 | <code>        alarmsMock.create('watchdog_job-b', { delayInMinutes: 4 });</code> | Semeia watchdog no mock de alarmes para verificar remoção no STOP_BATCH. | 🟨 EXECUTADO INDIRETAMENTE |
| 354 | U09 | <code>        backgroundModule.__setState({</code> | Injeta snapshot controlado no estado interno do background real por hook de instrumentação. | 🟨 EXECUTADO INDIRETAMENTE |
| 355 | U09 | <code>            isProcessing: true,</code> | Executa instrução específica de BG-46 STOP_BATCH cleanup ativo: <code>isProcessing: true,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 356 | U09 | <code>            activeJobsCount: 2,</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>activeJobsCount: 2,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 357 | U09 | <code>            activeMangaTabId: 10,</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>activeMangaTabId: 10,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 358 | U09 | <code>            extractionTabs: {</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>extractionTabs: {</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 359 | U09 | <code>                [extractionTab.id]: { mangaTabId: 10, index: 9, geminiTabId: geminiA.id, batchId: 'batch-stop' },</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>[extractionTab.id]: { mangaTabId: 10, index: 9, geminiTabId: geminiA.id, batchId: 'batch-stop' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 360 | U09 | <code>            },</code> | Fecha a estrutura sintática corrente de BG-46 STOP_BATCH cleanup ativo. | 🟨 EXECUTADO INDIRETAMENTE |
| 361 | U09 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-46 STOP_BATCH cleanup ativo. | 🟨 EXECUTADO INDIRETAMENTE |
| 362 | U09 | <code>        global.MangaTranslatorState.patch({</code> | Atualiza o estado compartilhado pela API MangaTranslatorState real para preparar o cenário de cleanup. | 🟨 EXECUTADO INDIRETAMENTE |
| 363 | U09 | <code>            currentBatchId: 'batch-stop',</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>currentBatchId: 'batch-stop',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 364 | U09 | <code>            jobIndex: [</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>jobIndex: [</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 365 | U09 | <code>                { geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>{ geminiTabId: geminiA.id, mangaTabId: 10, index: 0, jobId: 'job-a', batchId: 'batch-stop' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 366 | U09 | <code>                { geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },</code> | Configura/verifica dado específico de BG-46 STOP_BATCH cleanup ativo: <code>{ geminiTabId: geminiB.id, mangaTabId: 10, index: 1, jobId: 'job-b', batchId: 'batch-stop' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 367 | U09 | <code>            ],</code> | Fecha a estrutura sintática corrente de BG-46 STOP_BATCH cleanup ativo. | 🟨 EXECUTADO INDIRETAMENTE |
| 368 | U09 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-46 STOP_BATCH cleanup ativo. | 🟨 EXECUTADO INDIRETAMENTE |
| 369 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-46 STOP_BATCH cleanup ativo; sem efeito runtime. | estrutural |
| 370 | U09 | <code>        const result = await dispatchToBackground(runtimeMock, { action: 'STOP_BATCH', batchId: 'batch-stop' });</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 371 | U09 | <code>        expect(result.keepAlive).toBe(true);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 372 | U09 | <code>        expect(result.response).toEqual({ ok: true });</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 373 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-46 STOP_BATCH cleanup ativo; sem efeito runtime. | estrutural |
| 374 | U09 | <code>        const storage = await storageMock.get(null);</code> | Lê o chrome.storage.local mock para observar efeito persistido pelo handler real. | ✅ PROVADO DIRETAMENTE |
| 375 | U09 | <code>        const state = backgroundModule.__getState();</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 376 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-46 STOP_BATCH cleanup ativo; sem efeito runtime. | estrutural |
| 377 | U09 | <code>        expect(tabsMock._tabs.has(geminiA.id)).toBe(false);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 378 | U09 | <code>        expect(tabsMock._tabs.has(geminiB.id)).toBe(false);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 379 | U09 | <code>        expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 380 | U09 | <code>        expect(Object.keys(storage).some(key =&gt; key.startsWith('gemini_job_'))).toBe(false);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 381 | U09 | <code>        expect(Object.keys(storage).some(key =&gt; key.startsWith('wd_data_'))).toBe(false);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 382 | U09 | <code>        expect((await alarmsMock.getAll())).toHaveLength(0);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 383 | U09 | <code>        expect(state.extractionTabs).toEqual({});</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 384 | U09 | <code>        expect(state.activeJobsCount).toBe(0);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 385 | U09 | <code>        expect(state.isProcessing).toBe(false);</code> | Assertion direta do cenário BG-46 STOP_BATCH cleanup ativo; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 386 | U09 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-46 STOP_BATCH cleanup ativo. | 🟨 EXECUTADO INDIRETAMENTE |
| 387 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 388 | U10 | <code>    test('BG-51/BG-53/BG-54: GEMINI_RESULT_URL registra extraction tab e CHECK_IF_EXTRACTION_TAB distingue hit/miss', async () =&gt; {</code> | Declara o caso Jest BG-51/BG-53/BG-54: GEMINI_RESULT_URL registra extraction tab e CHECK_IF_EXTRACTION_TAB distingue hit/miss. | 🟨 EXECUTADO INDIRETAMENTE |
| 389 | U10 | <code>        const geminiTab = await tabsMock.create({ url: 'https://gemini.google.com/app/chat', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 390 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 391 | U10 | <code>        await storageMock.set({</code> | Persiste dados de entrada no chrome.storage.local mock antes de executar o handler real. | 🟨 EXECUTADO INDIRETAMENTE |
| 392 | U10 | <code>            [&#96;gemini_job_${geminiTab.id}&#96;]: {</code> | Executa instrução específica de BG-51/53/54 result URL e extraction tab: <code>[&#96;gemini_job_${geminiTab.id}&#96;]: {</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 393 | U10 | <code>                geminiTabId: geminiTab.id,</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>geminiTabId: geminiTab.id,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 394 | U10 | <code>                mangaTabId: 22,</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>mangaTabId: 22,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 395 | U10 | <code>                index: 4,</code> | Executa instrução específica de BG-51/53/54 result URL e extraction tab: <code>index: 4,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 396 | U10 | <code>                jobId: 'job-result-url',</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>jobId: 'job-result-url',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 397 | U10 | <code>            },</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | 🟨 EXECUTADO INDIRETAMENTE |
| 398 | U10 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | 🟨 EXECUTADO INDIRETAMENTE |
| 399 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 400 | U10 | <code>        const result = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 401 | U10 | <code>            action: 'GEMINI_RESULT_URL',</code> | Define a action da request de BG-51/53/54 result URL e extraction tab: action: 'GEMINI_RESULT_URL',. | 🟨 EXECUTADO INDIRETAMENTE |
| 402 | U10 | <code>            mangaTabId: 22,</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>mangaTabId: 22,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 403 | U10 | <code>            index: 4,</code> | Executa instrução específica de BG-51/53/54 result URL e extraction tab: <code>index: 4,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 404 | U10 | <code>            url: 'https://lh3.googleusercontent.com/generated.png',</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>url: 'https://lh3.googleusercontent.com/generated.png',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 405 | U10 | <code>            jobId: 'job-result-url',</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>jobId: 'job-result-url',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 406 | U10 | <code>        }, { tab: { id: geminiTab.id, url: 'https://gemini.google.com/app/chat' } });</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>}, { tab: { id: geminiTab.id, url: 'https://gemini.google.com/app/chat' } });</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 407 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 408 | U10 | <code>        expect(result.response).toEqual({ ok: true, extractionRegistered: true });</code> | Assertion direta do cenário BG-51/53/54 result URL e extraction tab; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 409 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 410 | U10 | <code>        const extractionTab = await waitFor(() =&gt;</code> | Inicia/participa de gate temporal que falha se o efeito assíncrono esperado não aparecer no timeout do helper. | ✅ PROVADO DIRETAMENTE |
| 411 | U10 | <code>            Array.from(tabsMock._tabs.values()).find(tab =&gt;</code> | Transforma/consulta a coleção observável de BG-51/53/54 result URL e extraction tab: <code>Array.from(tabsMock._tabs.values()).find(tab =&gt;</code> | ✅ PROVADO DIRETAMENTE |
| 412 | U10 | <code>                tab.url === 'https://lh3.googleusercontent.com/generated.png#manga-translator-extraction'</code> | Executa instrução específica de BG-51/53/54 result URL e extraction tab: <code>tab.url === 'https://lh3.googleusercontent.com/generated.png#manga-translator-extraction'</code> | ✅ PROVADO DIRETAMENTE |
| 413 | U10 | <code>                &amp;&amp; backgroundModule.__getState().extractionTabs[tab.id]</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 414 | U10 | <code>            )</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | ✅ PROVADO DIRETAMENTE |
| 415 | U10 | <code>        );</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | ✅ PROVADO DIRETAMENTE |
| 416 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 417 | U10 | <code>        const hit = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 418 | U10 | <code>            action: 'CHECK_IF_EXTRACTION_TAB',</code> | Define a action da request de BG-51/53/54 result URL e extraction tab: action: 'CHECK_IF_EXTRACTION_TAB',. | 🟨 EXECUTADO INDIRETAMENTE |
| 419 | U10 | <code>        }, { tab: { id: extractionTab.id } });</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | 🟨 EXECUTADO INDIRETAMENTE |
| 420 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 421 | U10 | <code>        const miss = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 422 | U10 | <code>            action: 'CHECK_IF_EXTRACTION_TAB',</code> | Define a action da request de BG-51/53/54 result URL e extraction tab: action: 'CHECK_IF_EXTRACTION_TAB',. | 🟨 EXECUTADO INDIRETAMENTE |
| 423 | U10 | <code>        }, { tab: { id: 987654 } });</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | 🟨 EXECUTADO INDIRETAMENTE |
| 424 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-51/53/54 result URL e extraction tab; sem efeito runtime. | estrutural |
| 425 | U10 | <code>        expect(hit.response).toEqual(expect.objectContaining({</code> | Assertion direta do cenário BG-51/53/54 result URL e extraction tab; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 426 | U10 | <code>            isExtractionTab: true,</code> | Executa instrução específica de BG-51/53/54 result URL e extraction tab: <code>isExtractionTab: true,</code> | ✅ PROVADO DIRETAMENTE |
| 427 | U10 | <code>            mangaTabId: 22,</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>mangaTabId: 22,</code> | ✅ PROVADO DIRETAMENTE |
| 428 | U10 | <code>            index: 4,</code> | Executa instrução específica de BG-51/53/54 result URL e extraction tab: <code>index: 4,</code> | ✅ PROVADO DIRETAMENTE |
| 429 | U10 | <code>            geminiTabId: geminiTab.id,</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>geminiTabId: geminiTab.id,</code> | ✅ PROVADO DIRETAMENTE |
| 430 | U10 | <code>            jobId: 'job-result-url',</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>jobId: 'job-result-url',</code> | ✅ PROVADO DIRETAMENTE |
| 431 | U10 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | ✅ PROVADO DIRETAMENTE |
| 432 | U10 | <code>        expect(miss.response).toEqual({ isExtractionTab: false });</code> | Assertion direta do cenário BG-51/53/54 result URL e extraction tab; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 433 | U10 | <code>        expect(backgroundModule.__getState().extractionTabs[extractionTab.id]).toEqual(expect.objectContaining({</code> | Lê snapshot do estado interno real para comparação/assertion sem substituir sua lógica. | ✅ PROVADO DIRETAMENTE |
| 434 | U10 | <code>            mangaTabId: 22,</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>mangaTabId: 22,</code> | ✅ PROVADO DIRETAMENTE |
| 435 | U10 | <code>            index: 4,</code> | Executa instrução específica de BG-51/53/54 result URL e extraction tab: <code>index: 4,</code> | ✅ PROVADO DIRETAMENTE |
| 436 | U10 | <code>            geminiTabId: geminiTab.id,</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>geminiTabId: geminiTab.id,</code> | ✅ PROVADO DIRETAMENTE |
| 437 | U10 | <code>            jobId: 'job-result-url',</code> | Configura/verifica dado específico de BG-51/53/54 result URL e extraction tab: <code>jobId: 'job-result-url',</code> | ✅ PROVADO DIRETAMENTE |
| 438 | U10 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | ✅ PROVADO DIRETAMENTE |
| 439 | U10 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-51/53/54 result URL e extraction tab. | 🟨 EXECUTADO INDIRETAMENTE |
| 440 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-57/58 FETCH_IMAGE_AS_BASE64; sem efeito runtime. | estrutural |
| 441 | U11 | <code>    test('BG-57/BG-58: FETCH_IMAGE_AS_BASE64 converte blob em dataURL e responde erro em falha de fetch', async () =&gt; {</code> | Declara o caso Jest BG-57/BG-58: FETCH_IMAGE_AS_BASE64 converte blob em dataURL e responde erro em falha de fetch. | 🟨 EXECUTADO INDIRETAMENTE |
| 442 | U11 | <code>        global.fetch = jest.fn();</code> | Configura/restaura fetch global controlado para tornar o cenário de rede determinístico. | 🟨 EXECUTADO INDIRETAMENTE |
| 443 | U11 | <code>        global.fetch.mockResolvedValueOnce({</code> | Configura/restaura fetch global controlado para tornar o cenário de rede determinístico. | 🟨 EXECUTADO INDIRETAMENTE |
| 444 | U11 | <code>            ok: true,</code> | Define parte da resposta/fixture controlada de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>ok: true,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 445 | U11 | <code>            status: 200,</code> | Define parte da resposta/fixture controlada de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>status: 200,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 446 | U11 | <code>            headers: { get: () =&gt; 'image/png' },</code> | Define parte da resposta/fixture controlada de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>headers: { get: () =&gt; 'image/png' },</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 447 | U11 | <code>            blob: async () =&gt; new Blob(['image-bytes'], { type: 'image/png' }),</code> | Define parte da resposta/fixture controlada de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>blob: async () =&gt; new Blob(['image-bytes'], { type: 'image/png' }),</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 448 | U11 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-57/58 FETCH_IMAGE_AS_BASE64. | 🟨 EXECUTADO INDIRETAMENTE |
| 449 | U11 | <code>        runtimeMock._messageListeners = [];</code> | Remove listeners onMessage prévios antes de recarregar background.js, mantendo exatamente um listener observável. | 🟨 EXECUTADO INDIRETAMENTE |
| 450 | U11 | <code>        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);</code> | Carrega extension/background.js real e apenas anexa hooks de inspeção/exports do loader. | 🟨 EXECUTADO INDIRETAMENTE |
| 451 | U11 | <code>        await flush(4);</code> | Executa instrução específica de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>await flush(4);</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 452 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-57/58 FETCH_IMAGE_AS_BASE64; sem efeito runtime. | estrutural |
| 453 | U11 | <code>        const contentSender = { tab: { id: 222, url: 'https://manga.test/chapter' } };</code> | Configura/verifica dado específico de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>const contentSender = { tab: { id: 222, url: 'https://manga.test/chapter' } };</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 454 | U11 | <code>        const success = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 455 | U11 | <code>            action: 'FETCH_IMAGE_AS_BASE64',</code> | Define a action da request de BG-57/58 FETCH_IMAGE_AS_BASE64: action: 'FETCH_IMAGE_AS_BASE64',. | 🟨 EXECUTADO INDIRETAMENTE |
| 456 | U11 | <code>            url: 'https://cdn.test/page.png',</code> | Configura/verifica dado específico de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>url: 'https://cdn.test/page.png',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 457 | U11 | <code>        }, contentSender);</code> | Fecha a estrutura sintática corrente de BG-57/58 FETCH_IMAGE_AS_BASE64. | 🟨 EXECUTADO INDIRETAMENTE |
| 458 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-57/58 FETCH_IMAGE_AS_BASE64; sem efeito runtime. | estrutural |
| 459 | U11 | <code>        expect(success.keepAlive).toBe(true);</code> | Assertion direta do cenário BG-57/58 FETCH_IMAGE_AS_BASE64; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 460 | U11 | <code>        expect(success.response).toEqual({</code> | Assertion direta do cenário BG-57/58 FETCH_IMAGE_AS_BASE64; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 461 | U11 | <code>            dataUrl: 'data:image/png;base64,UkVBRA==',</code> | Executa instrução específica de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>dataUrl: 'data:image/png;base64,UkVBRA==',</code> | ✅ PROVADO DIRETAMENTE |
| 462 | U11 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-57/58 FETCH_IMAGE_AS_BASE64. | ✅ PROVADO DIRETAMENTE |
| 463 | U11 | <code>        expect(global.fetch).toHaveBeenCalledWith('https://cdn.test/page.png', expect.objectContaining({</code> | Configura/restaura fetch global controlado para tornar o cenário de rede determinístico. | ✅ PROVADO DIRETAMENTE |
| 464 | U11 | <code>            credentials: 'omit',</code> | Executa instrução específica de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>credentials: 'omit',</code> | ✅ PROVADO DIRETAMENTE |
| 465 | U11 | <code>            cache: 'no-store',</code> | Executa instrução específica de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>cache: 'no-store',</code> | ✅ PROVADO DIRETAMENTE |
| 466 | U11 | <code>            signal: expect.any(Object),</code> | Executa instrução específica de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>signal: expect.any(Object),</code> | ✅ PROVADO DIRETAMENTE |
| 467 | U11 | <code>        }));</code> | Fecha a estrutura sintática corrente de BG-57/58 FETCH_IMAGE_AS_BASE64. | ✅ PROVADO DIRETAMENTE |
| 468 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-57/58 FETCH_IMAGE_AS_BASE64; sem efeito runtime. | estrutural |
| 469 | U11 | <code>        global.fetch.mockRejectedValueOnce(new Error('HTTP 404'));</code> | Configura/restaura fetch global controlado para tornar o cenário de rede determinístico. | 🟨 EXECUTADO INDIRETAMENTE |
| 470 | U11 | <code>        const failure = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 471 | U11 | <code>            action: 'FETCH_IMAGE_AS_BASE64',</code> | Define a action da request de BG-57/58 FETCH_IMAGE_AS_BASE64: action: 'FETCH_IMAGE_AS_BASE64',. | 🟨 EXECUTADO INDIRETAMENTE |
| 472 | U11 | <code>            url: 'https://cdn.test/missing.png',</code> | Configura/verifica dado específico de BG-57/58 FETCH_IMAGE_AS_BASE64: <code>url: 'https://cdn.test/missing.png',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 473 | U11 | <code>        }, contentSender);</code> | Fecha a estrutura sintática corrente de BG-57/58 FETCH_IMAGE_AS_BASE64. | 🟨 EXECUTADO INDIRETAMENTE |
| 474 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-57/58 FETCH_IMAGE_AS_BASE64; sem efeito runtime. | estrutural |
| 475 | U11 | <code>        expect(failure.keepAlive).toBe(true);</code> | Assertion direta do cenário BG-57/58 FETCH_IMAGE_AS_BASE64; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 476 | U11 | <code>        expect(failure.response).toEqual({ error: 'HTTP 404' });</code> | Assertion direta do cenário BG-57/58 FETCH_IMAGE_AS_BASE64; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 477 | U11 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-57/58 FETCH_IMAGE_AS_BASE64. | 🟨 EXECUTADO INDIRETAMENTE |
| 478 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-37/62 SHOW_EXISTING_FOLDER; sem efeito runtime. | estrutural |
| 479 | U12 | <code>    test('BG-37/BG-62: SHOW_EXISTING_FOLDER com anchorId valido chama downloads.show sem novo download', async () =&gt; {</code> | Declara o caso Jest BG-37/BG-62: SHOW_EXISTING_FOLDER com anchorId valido chama downloads.show sem novo download. | 🟨 EXECUTADO INDIRETAMENTE |
| 480 | U12 | <code>        downloadsMock._downloads.set(707, {</code> | Semeia download existente no mock para exercitar a rota de anchorId. | 🟨 EXECUTADO INDIRETAMENTE |
| 481 | U12 | <code>            id: 707,</code> | Executa instrução específica de BG-37/62 SHOW_EXISTING_FOLDER: <code>id: 707,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 482 | U12 | <code>            url: 'data:image/png;base64,ANCHOR',</code> | Configura/verifica dado específico de BG-37/62 SHOW_EXISTING_FOLDER: <code>url: 'data:image/png;base64,ANCHOR',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 483 | U12 | <code>            filename: 'C:/Downloads/MangaTranslator/Capitulo/_anchor.png',</code> | Executa instrução específica de BG-37/62 SHOW_EXISTING_FOLDER: <code>filename: 'C:/Downloads/MangaTranslator/Capitulo/_anchor.png',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 484 | U12 | <code>            state: 'complete',</code> | Executa instrução específica de BG-37/62 SHOW_EXISTING_FOLDER: <code>state: 'complete',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 485 | U12 | <code>            exists: true,</code> | Executa instrução específica de BG-37/62 SHOW_EXISTING_FOLDER: <code>exists: true,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 486 | U12 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-37/62 SHOW_EXISTING_FOLDER. | 🟨 EXECUTADO INDIRETAMENTE |
| 487 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-37/62 SHOW_EXISTING_FOLDER; sem efeito runtime. | estrutural |
| 488 | U12 | <code>        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();</code> | Declara valor local usado em BG-37/62 SHOW_EXISTING_FOLDER: <code>const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 489 | U12 | <code>        const downloadSpy = jest.spyOn(downloadsMock, 'download');</code> | Declara valor local usado em BG-37/62 SHOW_EXISTING_FOLDER: <code>const downloadSpy = jest.spyOn(downloadsMock, 'download');</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 490 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-37/62 SHOW_EXISTING_FOLDER; sem efeito runtime. | estrutural |
| 491 | U12 | <code>        const result = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 492 | U12 | <code>            action: 'SHOW_EXISTING_FOLDER',</code> | Define a action da request de BG-37/62 SHOW_EXISTING_FOLDER: action: 'SHOW_EXISTING_FOLDER',. | 🟨 EXECUTADO INDIRETAMENTE |
| 493 | U12 | <code>            folderPath: 'C:/Downloads/MangaTranslator/Capitulo',</code> | Configura/verifica dado específico de BG-37/62 SHOW_EXISTING_FOLDER: <code>folderPath: 'C:/Downloads/MangaTranslator/Capitulo',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 494 | U12 | <code>            safeTitle: 'Capitulo',</code> | Configura/verifica dado específico de BG-37/62 SHOW_EXISTING_FOLDER: <code>safeTitle: 'Capitulo',</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 495 | U12 | <code>            anchorId: 707,</code> | Configura/verifica dado específico de BG-37/62 SHOW_EXISTING_FOLDER: <code>anchorId: 707,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 496 | U12 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-37/62 SHOW_EXISTING_FOLDER. | 🟨 EXECUTADO INDIRETAMENTE |
| 497 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-37/62 SHOW_EXISTING_FOLDER; sem efeito runtime. | estrutural |
| 498 | U12 | <code>        expect(result.keepAlive).toBe(true);</code> | Assertion direta do cenário BG-37/62 SHOW_EXISTING_FOLDER; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 499 | U12 | <code>        expect(result.response).toEqual({ ok: true });</code> | Assertion direta do cenário BG-37/62 SHOW_EXISTING_FOLDER; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 500 | U12 | <code>        expect(showSpy).toHaveBeenCalledWith(707);</code> | Assertion direta do cenário BG-37/62 SHOW_EXISTING_FOLDER; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 501 | U12 | <code>        expect(downloadSpy).not.toHaveBeenCalled();</code> | Assertion direta do cenário BG-37/62 SHOW_EXISTING_FOLDER; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 502 | U12 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-37/62 SHOW_EXISTING_FOLDER. | 🟨 EXECUTADO INDIRETAMENTE |
| 503 | U13 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-65 EXPORT_ALL_AND_SHOW vazio; sem efeito runtime. | estrutural |
| 504 | U13 | <code>    test('BG-65: EXPORT_ALL_AND_SHOW com lista vazia responde imediatamente sem downloads', async () =&gt; {</code> | Declara o caso Jest BG-65: EXPORT_ALL_AND_SHOW com lista vazia responde imediatamente sem downloads. | 🟨 EXECUTADO INDIRETAMENTE |
| 505 | U13 | <code>        const downloadSpy = jest.spyOn(downloadsMock, 'download');</code> | Declara valor local usado em BG-65 EXPORT_ALL_AND_SHOW vazio: <code>const downloadSpy = jest.spyOn(downloadsMock, 'download');</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 506 | U13 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-65 EXPORT_ALL_AND_SHOW vazio; sem efeito runtime. | estrutural |
| 507 | U13 | <code>        const result = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 508 | U13 | <code>            action: 'EXPORT_ALL_AND_SHOW',</code> | Define a action da request de BG-65 EXPORT_ALL_AND_SHOW vazio: action: 'EXPORT_ALL_AND_SHOW',. | 🟨 EXECUTADO INDIRETAMENTE |
| 509 | U13 | <code>            allDownloads: [],</code> | Configura/verifica dado específico de BG-65 EXPORT_ALL_AND_SHOW vazio: <code>allDownloads: [],</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 510 | U13 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-65 EXPORT_ALL_AND_SHOW vazio. | 🟨 EXECUTADO INDIRETAMENTE |
| 511 | U13 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-65 EXPORT_ALL_AND_SHOW vazio; sem efeito runtime. | estrutural |
| 512 | U13 | <code>        expect(result.response).toEqual({ ok: true });</code> | Assertion direta do cenário BG-65 EXPORT_ALL_AND_SHOW vazio; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 513 | U13 | <code>        expect(downloadSpy).not.toHaveBeenCalled();</code> | Assertion direta do cenário BG-65 EXPORT_ALL_AND_SHOW vazio; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 514 | U13 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-65 EXPORT_ALL_AND_SHOW vazio. | 🟨 EXECUTADO INDIRETAMENTE |
| 515 | U14 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-66/67 SET_DEBUG_MODE; sem efeito runtime. | estrutural |
| 516 | U14 | <code>    test('BG-66/BG-67: SET_DEBUG_MODE salva storage e envia DEBUG_MODE_CHANGED para todas as abas', async () =&gt; {</code> | Declara o caso Jest BG-66/BG-67: SET_DEBUG_MODE salva storage e envia DEBUG_MODE_CHANGED para todas as abas. | 🟨 EXECUTADO INDIRETAMENTE |
| 517 | U14 | <code>        const tabA = await tabsMock.create({ url: 'https://manga.test/a', active: true });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 518 | U14 | <code>        const tabB = await tabsMock.create({ url: 'https://manga.test/b', active: false });</code> | Cria aba simulada com id observável para representar aba Gemini/mangá/extraction no cenário. | 🟨 EXECUTADO INDIRETAMENTE |
| 519 | U14 | <code>        const messagesA = [];</code> | Declara valor local usado em BG-66/67 SET_DEBUG_MODE: <code>const messagesA = [];</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 520 | U14 | <code>        const messagesB = [];</code> | Declara valor local usado em BG-66/67 SET_DEBUG_MODE: <code>const messagesB = [];</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 521 | U14 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-66/67 SET_DEBUG_MODE; sem efeito runtime. | estrutural |
| 522 | U14 | <code>        tabsMock._registerMessageHandler(tabA.id, (message, _sender, sendResponse) =&gt; {</code> | Registra receptor de mensagem na aba simulada para observar o broadcast do background. | 🟨 EXECUTADO INDIRETAMENTE |
| 523 | U14 | <code>            messagesA.push(message);</code> | Transforma/consulta a coleção observável de BG-66/67 SET_DEBUG_MODE: <code>messagesA.push(message);</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 524 | U14 | <code>            sendResponse({ ok: true });</code> | Define parte da resposta/fixture controlada de BG-66/67 SET_DEBUG_MODE: <code>sendResponse({ ok: true });</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 525 | U14 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-66/67 SET_DEBUG_MODE. | 🟨 EXECUTADO INDIRETAMENTE |
| 526 | U14 | <code>        tabsMock._registerMessageHandler(tabB.id, (message, _sender, sendResponse) =&gt; {</code> | Registra receptor de mensagem na aba simulada para observar o broadcast do background. | 🟨 EXECUTADO INDIRETAMENTE |
| 527 | U14 | <code>            messagesB.push(message);</code> | Transforma/consulta a coleção observável de BG-66/67 SET_DEBUG_MODE: <code>messagesB.push(message);</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 528 | U14 | <code>            sendResponse({ ok: true });</code> | Define parte da resposta/fixture controlada de BG-66/67 SET_DEBUG_MODE: <code>sendResponse({ ok: true });</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 529 | U14 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-66/67 SET_DEBUG_MODE. | 🟨 EXECUTADO INDIRETAMENTE |
| 530 | U14 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-66/67 SET_DEBUG_MODE; sem efeito runtime. | estrutural |
| 531 | U14 | <code>        const result = await dispatchToBackground(runtimeMock, {</code> | Despacha a request deste cenário para o único chrome.runtime.onMessage registrado pelo background real. | 🟨 EXECUTADO INDIRETAMENTE |
| 532 | U14 | <code>            action: 'SET_DEBUG_MODE',</code> | Define a action da request de BG-66/67 SET_DEBUG_MODE: action: 'SET_DEBUG_MODE',. | 🟨 EXECUTADO INDIRETAMENTE |
| 533 | U14 | <code>            debugOn: true,</code> | Configura/verifica dado específico de BG-66/67 SET_DEBUG_MODE: <code>debugOn: true,</code> | 🟨 EXECUTADO INDIRETAMENTE |
| 534 | U14 | <code>        });</code> | Fecha a estrutura sintática corrente de BG-66/67 SET_DEBUG_MODE. | 🟨 EXECUTADO INDIRETAMENTE |
| 535 | U14 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-66/67 SET_DEBUG_MODE; sem efeito runtime. | estrutural |
| 536 | U14 | <code>        expect(result.keepAlive).toBe(true);</code> | Assertion direta do cenário BG-66/67 SET_DEBUG_MODE; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 537 | U14 | <code>        expect(result.response).toEqual({ ok: true });</code> | Assertion direta do cenário BG-66/67 SET_DEBUG_MODE; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 538 | U14 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-66/67 SET_DEBUG_MODE; sem efeito runtime. | estrutural |
| 539 | U14 | <code>        const data = await storageMock.get(['debugMode']);</code> | Lê o chrome.storage.local mock para observar efeito persistido pelo handler real. | ✅ PROVADO DIRETAMENTE |
| 540 | U14 | <code>        expect(data.debugMode).toBe(true);</code> | Assertion direta do cenário BG-66/67 SET_DEBUG_MODE; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 541 | U14 | <code>        expect(messagesA).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });</code> | Assertion direta do cenário BG-66/67 SET_DEBUG_MODE; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 542 | U14 | <code>        expect(messagesB).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });</code> | Assertion direta do cenário BG-66/67 SET_DEBUG_MODE; a propriedade exigida está expressa literalmente nesta expectativa. | ✅ PROVADO DIRETAMENTE |
| 543 | U14 | <code>    });</code> | Fecha a estrutura sintática corrente de BG-66/67 SET_DEBUG_MODE. | 🟨 EXECUTADO INDIRETAMENTE |
| 544 | U15 | <code>});</code> | Fecha a estrutura sintática corrente de fecho e newline terminal. | 🟨 EXECUTADO INDIRETAMENTE |
| 545 | U15 | <code>␠ [newline final]</code> | Representa a posição vazia após o newline final; não executa código. | 🟦 verificação documental |

## 11. Unidades semânticas

| Unidade | Linhas | Nome | Função |
|---|---:|---|---|
| U01 | 1–14 | imports e caminhos do harness | Importa os cinco mocks Chrome, o loader do background real e os helpers de dispatch/espera. |
| U02 | 15–33 | suíte, estado local e MockFileReader | Declara a suíte REG-09/IPC-07/IPC-08, variáveis compartilhadas e FileReader determinístico usado pelo fallback base64. |
| U03 | 34–71 | beforeEach | Reinicia módulos/timers/listeners, limpa mocks e storage, instala chrome controlado, carrega background.js real e drena inicialização assíncrona. |
| U04 | 72–82 | afterEach | Restaura fetch/FileReader, limpa alarms/tabs/downloads/storage e restaura timers/mocks Jest. |
| U05 | 83–109 | BG-43 LOG_ENTRY | Prova resposta síncrona ok e persistência do log com level/source/action/detail/extra exatos. |
| U06 | 110–201 | BG-44 START_BATCH FIFO | Mantém lote A ativo, enfileira B..F em FIFO, preserva estado de A e prova idempotência de retry de D. |
| U07 | 202–252 | BG-44b STOP_BATCH pendente | Cancela somente C pendente, preserva A ativo e ordem B,D, e exige log BATCH_QUEUE_CANCELLED. |
| U08 | 253–339 | BG-45 START_BATCH idempotência/concorrência | Separa retry do lote ativo da abertura de um lote novo e prova limite maxConcurrentJobs=3 para cinco imagens. |
| U09 | 340–386 | BG-46 STOP_BATCH cleanup ativo | Prova remoção de abas, chaves de job/watchdog, alarmes e estado de extração/processamento. |
| U10 | 387–439 | BG-51/53/54 result URL e extraction tab | Registra aba auxiliar a partir de GEMINI_RESULT_URL e prova CHECK_IF_EXTRACTION_TAB em hit e miss. |
| U11 | 440–477 | BG-57/58 FETCH_IMAGE_AS_BASE64 | Prova dataURL legado, opções de fetch e compatibilidade de erro quando fetch rejeita. |
| U12 | 478–502 | BG-37/62 SHOW_EXISTING_FOLDER | Prova que anchor existente chama downloads.show e evita criar novo download. |
| U13 | 503–514 | BG-65 EXPORT_ALL_AND_SHOW vazio | Prova retorno imediato ok e ausência de downloads quando a lista está vazia. |
| U14 | 515–543 | BG-66/67 SET_DEBUG_MODE | Prova persistência de debugMode e broadcast DEBUG_MODE_CHANGED para duas abas. |
| U15 | 544–545 | fecho e newline terminal | Fecha describe e contabiliza a posição terminal vazia criada pelo newline final. |

## 12. Invariantes e limites

1. A suíte precisa carregar o `background.js` real; copiar funções para o teste invalidaria a força da evidência.
2. Deve existir exatamente um listener `runtime.onMessage` após o setup, porque `dispatchToBackground` rejeita qualquer outra cardinalidade.
3. O lote ativo não pode ser sobrescrito por `START_BATCH` concorrente.
4. A fila pendente precisa permanecer FIFO e idempotente por `batchId`.
5. `STOP_BATCH` de pendente não pode encerrar o lote ativo.
6. `STOP_BATCH` de lote ativo precisa limpar recursos persistidos/alarms/tabs observados.
7. Extraction tabs precisam preservar identidade do job suficiente para `CHECK_IF_EXTRACTION_TAB`.
8. O contrato legado de `FETCH_IMAGE_AS_BASE64` é observado na borda do background, não apenas na action modular.
9. Spies de Chrome provam chamadas ao mock; não equivalem a efeitos reais do navegador/OS.
10. Assertions negativas (`not.toHaveBeenCalled`, ausência de logs/chaves) são provas específicas somente das saídas nomeadas.
11. Setup e fixture executados sem assertion correspondente permanecem 🟨 EXECUTADOS INDIRETAMENTE.
12. O newline final é uma posição documental, não uma linha executável.

## 13. Autoauditoria — AGENTE 19

- [x] ownership #159 reconfirmado pela reserva ativa do AGENTE 19;
- [x] `.state/159.json` reconfirmado como IN_PROGRESS para o mesmo arquivo/agente;
- [x] SHA do fonte reconfirmado em `9f8c6e4a88256aae9e2b26cd2121fe8474d736b8`;
- [x] 544 linhas textuais + newline = **545/545 posições documentadas**;
- [x] fonte integral embutida;
- [x] loader/helper/mocks inspecionados;
- [x] módulos de produção exercitados identificados por SHA;
- [x] 10 casos enumerados e assertions específicas separadas de setup indireto;
- [x] CI do mesmo blob confirmada em Node 20, Node 22 e Windows;
- [x] limites de mocks explicitados sem promovê-los a prova real;
- [x] nenhuma modificação feita em código, testes, fixtures, workflows ou configuração.

**Resultado documental:** suíte integralmente mapeada; os contratos afirmados pelas assertions estão classificados como prova direta e os limites do harness permanecem explícitos.

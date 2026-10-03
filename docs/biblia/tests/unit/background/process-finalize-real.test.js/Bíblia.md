# Bíblia técnica — tests/unit/background/process-finalize-real.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** c242bda9fbae752c90e4b41de971b05f9880595f
> **Agente responsável:** AGENTE HÍBRIDO 3 — revisão corretiva
> **Tipo:** suíte Jest de integração unitária com background real instrumentado — lifecycle/finalização  
> **Linhas textuais:** 869
> **Posições documentais:** 870, contando o newline final
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/unit/background/process-finalize-real.test.js` é a suíte focal mais abrangente do ciclo real de lançamento e finalização de jobs do background. Ela carrega `extension/background.js` real e, por meio das fachadas exportadas por `loadBackgroundModule`, alcança `extension/background/jobs-lifecycle.js`, `jobs-reconciliation.js`, router/actions e os mocks Chrome compartilhados.

O arquivo congela contratos de alto risco: limite de concorrência, corrida entre chamadas de `processNextJob`, falha de abertura de aba, finalização idempotente, journal durável `gemini_finalized_<tabId>`, recuperação após restart do Service Worker, cancelamento durante `tabs.create`, ausência da aba do mangá e exclusão pós-persistência nos modos `minimized_window` e `background_delete`.

## 2. Cadeia de implementação real

Em `background.js`, `processNextJob` e `finalizeJob` são fachadas finas que inicializam os módulos e delegam a `jobsLifecycle.processNextJob` / `jobsLifecycle.finalizeJob`. O lifecycle mantém o slot de concorrência, persiste `gemini_job_<tabId>`, indexa o job, arma watchdog e repete o agendamento até atingir o limite.

A finalização escreve primeiro um marcador durável com `accountingApplied:false`; só depois aplica a contabilidade, marca `accountingApplied:true`, limpa watchdog e remove o job persistido. Isso cria um journal recuperável para o intervalo crítico em que o worker pode morrer entre a marca e o snapshot contábil.

`jobs-reconciliation.js` consulta esse journal antes de decidir se uma aba viva deve continuar. `recoverPendingFinalization` reaplica a contabilidade somente quando necessário e remove `gemini_job_*`/`wd_data_*`, impedindo dupla soma após restart.

## 3. Harness e isolamento

O `beforeEach` reseta o cache de módulos, volta a timers reais, instala rastreamento de delays do background, limpa listeners/runtime/storage e reconstrói `global.chrome`. Só então carrega `background.js` real. O `afterEach` cancela timers atrasados, limpa alarmes/abas/storage e restaura timers/spies.

Nos cenários temporais, `flushFakeTimerRounds` avança fake timers em passos pequenos. Isso é importante porque a implementação intercala Promises, callbacks Chrome e timers; um único avanço grande pode mascarar ordem de microtasks diferente entre Node 20 e Node 22.

## 4. Matriz dos 16 cenários

| Linhas | Caso | Contrato principal | Força |
|---|---|---|---|
| 74–126 | BG-16/17/18 | fila vazia conclui; STOP e limite impedem nova aba | ✅ direta |
| 128–198 | BG-19/20/22/23 | dois jobs paralelos; corrida não duplica criação; mangaTabId ausente não é inventado | ✅ direta |
| 200–228 | BG-21 | falha de `tabs.create` libera slot e emite erro integrado | ✅ direta |
| 230–308 | REG-11/BG-24/25/26/28/29 | cleanup, idempotência, debug e tab ausente | ✅ direta |
| 310–363 | BG-27/30/31 | TTL 10 min e cleanup 18 s em minimized_window | ✅ direta |
| 365–405 | BG-31b | fallback não remove janela compartilhada; fecha só aba Gemini | ✅ direta |
| 407–425 | P0 | marcador durável impede dupla finalização sem proteção em memória | ✅ direta |
| 427–467 | P0 | restart entre marca e contabilidade reconcilia uma vez | ✅ direta |
| 469–526 | BG-76b | STOP durante `tabs.create` não ressuscita lote | ✅ direta |
| 528–618 | BG-77 | staging falha com manga tab fechada e erro finaliza sem falso sucesso | ✅ direta |
| 620–685 | BG-31c | exclusão da conversa só começa após estado de resultado persistido | ✅ direta |
| 688–719 | BG-31d | `dedicatedWindow:true` fecha a janela Gemini pelo `windowId`, sem remoção isolada da aba | ✅ direta |
| 721–749 | BG-16b | reidratação restaura contador do índice vivo e impede conclusão prematura | ✅ direta |
| 751–867 | BG-76c (3 variações) | substituição A→B após persistência, na revalidação de identidade e depois do watchdog armado; limpa A e preserva a contabilidade de B | ✅ barreiras determinísticas |

## 5. Concorrência, lote e contabilidade

BG-16b monta `jobQueue:[]`, `activeJobsCount:0` e um job indexado no lote atual; exige que o contador seja recomposto e que `BATCH_COMPLETE` não seja enviado. O primeiro bloco prova três gates independentes: conclusão quando fila/ativos chegam a zero, bloqueio total quando `stopRequested` está ativo e respeito ao `_cachedMaxCon`. O segundo bloco deixa dois jobs serem materializados e depois dispara duas chamadas concorrentes contra uma fila de um único job; a assertion exige exatamente uma criação de aba.

BG-76c usa barreiras no snapshot persistido, na resolução do alias de identidade e na confirmação final do watchdog. Em cada ponto promove B enquanto A está suspenso, exige remoção do índice/job/watchdog/aba de A e preserva os contadores e a aba ativa de B.

O caso BG-76b cria deliberadamente uma Promise pendente em `tabs.create`, envia `STOP_BATCH` enquanto a API está suspensa, libera a criação depois e espera o sistema retornar a `activeJobsCount:0`, `jobIndex:[]`, sem abas e sem chaves `gemini_job_*`/`wd_data_*`.

A contabilidade de uma finalização tardia pertencente a lote antigo é provada em outra suíte focal, `jobs-lifecycle-batch-status.test.js` (BATCH-STATUS-07), que exige que job A seja removido sem alterar `completedJobs` ou `activeJobsCount` de B. Portanto essa proteção não é aberta como lacuna desta Bíblia.

## 6. Journal durável e restart

O caso P0 de idempotência primeiro finaliza o job 2100 e exige a presença de `gemini_finalized_2100` com o mesmo `jobId`. Depois apaga a proteção em memória via estado de teste e chama `finalizeJob` novamente; os contadores permanecem inalterados, demonstrando que a marca persistida é suficiente.

O segundo P0 monta o estado exato de crash: `jobIndex` ainda contém o job, os contadores estão antigos e o marcador existe com `accountingApplied:false`. O listener real de startup reconcilia para `completedJobs:1`, `activeJobsCount:0`, `jobIndex:[]`, marca `accountingApplied:true` e remove os dois registros do job. Um segundo startup mantém 1/0, provando exatamente-uma-vez.

## 7. Modos de fechamento/exclusão

No caminho padrão `temp_chat`, REG-11/BG-24… prova limpeza contábil e remoção da aba após o delay curto; em `debugMode:true`, a aba não é removida. Com tab ausente e finalização por erro, a contabilidade reduz ativos sem incrementar concluídos.

Em `minimized_window`, BG-31d complementa o cenário de janela compartilhada: para `dedicatedWindow:true` e `windowId` conhecido, exige `chrome.windows.remove(windowId)` e nenhuma chamada a `chrome.tabs.remove`.

`minimized_window` registra a URL em `deleting_urls`, mantém a aba durante a janela de exclusão e, após 18 s, limpa a lista e fecha a superfície. BG-31b fixa a regra de segurança para `dedicatedWindow:false`: mesmo com manga e Gemini na mesma janela, `chrome.windows.remove` não é chamado; apenas a aba Gemini é removida.

`background_delete` exige resultado já em estado `result_committed`/`resultPersisted:true`; BG-31c observa `DELETE_CONVERSATION`, URL em `deleting_urls`, aba ainda viva antes do timeout e remoção apenas depois de 18 s.

## 8. Evidência de validação desta revisão

O código-fonte revisado corresponde ao blob Git `c242bda9fbae752c90e4b41de971b05f9880595f` (869 linhas textuais; 870 posições documentais).

- `npx jest --config jest.config.js --runInBand tests/unit/background/process-finalize-real.test.js` — **PASS**, 1 suíte, 16/16 testes.
- `npm run test:unit:background -- --runInBand` — **PASS**, 45/45 suítes, 233/233 testes.
- `git diff --check` — **PASS**.

O run CI **36521561968**, commit `e720890cf34dc9437ee91f3b8172953497d69870`, verificou o blob anterior `abb1b936fadf0e309933e39b4b705116eb320a1f` com 11 casos, Node 20.x e 22.x (109/109 suítes; 851/851 testes). Ele permanece evidência histórica da revisão anterior e não é apresentado como execução do SHA atual.

A conclusão distribuída do SHA novo ainda depende das fases independentes PRIMARY e ADVERSARIAL.

## 9. Lacunas e solicitações ao auditor

### 160-001 — TEST_REQUIRED — ACCEPTED; cobertura corretiva adicionada — NORMAL

**Encontrado:** `closeGeminiSurface` fecha uma janela inteira quando `job.dedicatedWindow === true` e a tab possui `windowId`. BG-31b prova apenas o complemento `dedicatedWindow:false`.

**Evidência atual:** BG-31b exige que `chrome.windows.remove` não seja chamado e que somente a aba Gemini seja removida em uma janela compartilhada.

**Evidência adicionada:** BG-31d persiste job minimized com `dedicatedWindow:true` e `windowId:74`, exige uma chamada a `chrome.windows.remove(74)` e nenhuma chamada a `chrome.tabs.remove`.

**Risco:** uma regressão pode deixar janela dedicada órfã ou trocar o comportamento entre janela dedicada e compartilhada.

### 160-002 — TEST_REQUIRED — ACCEPTED; cobertura corretiva adicionada — NORMAL

**Encontrado:** `processNextJob` possui guard `stillOpen`: quando fila e contador estão em zero, mas o índice durável ainda contém jobs do lote, ele restaura `activeJobsCount` e não declara `BATCH_COMPLETE`.

**Evidência atual:** BG-16 cobre conclusão normal com fila/ativos realmente vazios; os cenários de restart cobrem journal de finalização, mas não este guard específico de índice vivo.

**Evidência adicionada:** BG-16b monta `jobQueue:[]`, `activeJobsCount:0` e um job no `jobIndex` do lote atual; exige contador persistido restaurado para 1 e ausência de `BATCH_COMPLETE`.

**Risco:** um contador transitório zerado pode finalizar lote enquanto ainda há job indexado.

### 160-003 — TEST_REQUIRED — ACCEPTED; cobertura corretiva adicionada — HIGH

**Encontrado:** o lifecycle revalida cancelamento em quatro checkpoints de lançamento: após criação da aba, após persistência/indexação do job, após migração de identidade e após armar watchdog. BG-76b coloca o STOP durante `tabs.create` e prova o primeiro checkpoint (`after_tab_create`), mas não congela os três checkpoints tardios.

**Evidência atual:** BG-76b é prova forte de que uma aba criada depois do STOP é desfeita sem ressuscitar o lote.

**Evidência adicionada:** BG-76c executa as três substituições A→B em barreiras distintas (persistência/indexação, revalidação de identidade e pós-armamento do watchdog); cada variação exige cleanup completo de A e preservação da contabilidade de B. BG-76b continua cobrindo STOP durante `tabs.create`.

**Risco:** uma mudança futura pode fechar a primeira janela de corrida e reabrir outra mais tardia, deixando job órfão, watchdog residual ou contabilidade contaminada.

## 10. Fonte integral auditada

```javascript
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getAlarmsMock,
    getDownloadsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');
const {
    BACKGROUND_PATH,
    dispatchToBackground,
    flush,
    waitFor,
} = require('../../helpers/background-test-utils.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('background.js - processNextJob e finalizeJob reais', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let alarmsMock;
    let downloadsMock;
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
        alarmsMock = getAlarmsMock();
        downloadsMock = getDownloadsMock();

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
        await storageMock.clear();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('BG-16/BG-17/BG-18: fila vazia conclui, stopRequested bloqueia e maxConcurrentJobs é respeitado', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-1', active: true });
        const forwardedMessages = [];
        const createSpy = jest.spyOn(tabsMock, 'create');

        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            forwardedMessages.push(message);
            sendResponse({ ok: true });
        });

        backgroundModule.__setState({
            jobQueue: [],
            isProcessing: true,
            stopRequested: false,
            activeMangaTabId: mangaTab.id,
            currentBatchId: 'batch-complete',
            completionClaimedBatchId: null,
            extractionTabs: {},
            totalJobs: 1,
            completedJobs: 1,
            activeJobsCount: 0,
        });

        await backgroundModule.processNextJob();
        await flush(6);

        expect(forwardedMessages).toContainEqual(expect.objectContaining({ action: 'BATCH_COMPLETE' }));
        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            isProcessing: false,
            activeMangaTabId: null,
        }));

        createSpy.mockClear();
        backgroundModule.__setState({
            jobQueue: [{ mangaTabId: mangaTab.id, index: 2, prompt: 'stop' }],
            stopRequested: true,
            activeJobsCount: 0,
            _cachedMaxCon: 1,
        });

        await backgroundModule.processNextJob();
        expect(createSpy).not.toHaveBeenCalled();

        backgroundModule.__setState({
            jobQueue: [{ mangaTabId: mangaTab.id, index: 3, prompt: 'full' }],
            stopRequested: false,
            activeJobsCount: 2,
            _cachedMaxCon: 2,
        });

        await backgroundModule.processNextJob();
        expect(createSpy).not.toHaveBeenCalled();
    });

    test('BG-19/BG-20/BG-22/BG-23: jobs normais, paralelismo e corrida entre chamadas', async () => {
        await storageMock.set({
            geminiBaseUrl: 'http://127.0.0.1:3999/app',
        });

        backgroundModule.__setState({
            jobQueue: [
                { mangaTabId: 70, index: 1, prompt: 'A' },
                { mangaTabId: 70, index: 2, prompt: 'B' },
            ],
            stopRequested: false,
            activeJobsCount: 0,
            totalJobs: 2,
            completedJobs: 0,
            _cachedMaxCon: 2,
        });

        await backgroundModule.processNextJob();

        const geminiJobs = await waitFor(async () => {
            const data = await storageMock.get(null);
            const keys = Object.keys(data).filter(key => key.startsWith('gemini_job_'));
            return keys.length === 2 ? keys : null;
        });

        expect(geminiJobs).toHaveLength(2);
        expect(tabsMock._tabs.size).toBe(2);
        expect(await alarmsMock.getAll()).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: expect.stringMatching(/^watchdog_/) }),
            expect.objectContaining({ name: expect.stringMatching(/^watchdog_/) }),
        ]));

        const createSpy = jest.spyOn(tabsMock, 'create');
        backgroundModule.__setState({
            jobQueue: [{ mangaTabId: 99, index: 7, prompt: 'Race' }],
            stopRequested: false,
            activeJobsCount: 0,
            totalJobs: 1,
            completedJobs: 0,
            _cachedMaxCon: 1,
        });
        tabsMock._tabs.clear();
        await storageMock.clear();
        await storageMock.set({ geminiBaseUrl: 'http://127.0.0.1:3999/app' });

        await Promise.all([
            backgroundModule.processNextJob(),
            backgroundModule.processNextJob(),
        ]);

        await waitFor(() => (tabsMock._tabs.size === 1 ? true : null));
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(backgroundModule.__getState().activeJobsCount).toBe(1);

        backgroundModule.__setState({
            jobQueue: [{ index: 10, prompt: 'no-tab' }],
            stopRequested: false,
            activeJobsCount: 0,
            totalJobs: 1,
            completedJobs: 0,
            _cachedMaxCon: 1,
        });
        tabsMock._tabs.clear();
        await storageMock.clear();
        await storageMock.set({ geminiBaseUrl: 'http://127.0.0.1:3999/app' });

        await backgroundModule.processNextJob();
        await waitFor(() => (tabsMock._tabs.size === 1 ? true : null));

        expect(backgroundModule.__getState().activeMangaTabId).toBeUndefined();
    });

    test('BG-21: erro ao criar aba Gemini decrementa contador e envia erro integrado', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-2', active: true });
        const forwardedMessages = [];

        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            forwardedMessages.push(message);
            sendResponse({ ok: true });
        });

        jest.spyOn(tabsMock, 'create').mockRejectedValue(new Error('create failed'));

        backgroundModule.__setState({
            jobQueue: [{ mangaTabId: mangaTab.id, index: 4, prompt: 'boom' }],
            stopRequested: false,
            activeJobsCount: 0,
            totalJobs: 1,
            completedJobs: 0,
            _cachedMaxCon: 1,
        });

        await backgroundModule.processNextJob();
        await waitFor(() => forwardedMessages.find(message => message.action === 'SHOW_ERROR_INTEGRATED') || null);

        expect(forwardedMessages).toContainEqual(expect.objectContaining({
            action: 'SHOW_ERROR_INTEGRATED',
            imgIndex: 4,
        }));
        expect(backgroundModule.__getState().activeJobsCount).toBe(0);
    });

    test('REG-11/BG-24/BG-25/BG-26/BG-28/BG-29: finalizeJob limpa estado, ignora duplicado e respeita debug/missing tab', async () => {
        const clearSpy = jest.spyOn(alarmsMock, 'clear');
        const removeSpy = jest.spyOn(tabsMock, 'remove');

        await storageMock.set({
            debugMode: false,
            deleting_urls: [],
            gemini_job_1500: { geminiTabId: 1500 },
            wd_data_1500: { mangaTabId: 55, index: 1, geminiTabId: 1500 },
        });
        tabsMock._tabs.set(1500, { id: 1500, url: 'https://reader.test/not-gemini', active: false, status: 'complete', title: '' });

        backgroundModule.__setState({
            activeJobsCount: 1,
            completedJobs: 0,
            jobQueue: [],
            stopRequested: false,
            _cachedMaxCon: 1,
        });

        backgroundModule.finalizeJob(1500, 55, false);
        await flush(8);
        await delay(650);

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            activeJobsCount: 0,
            completedJobs: 1,
        }));
        expect(clearSpy).toHaveBeenCalledWith('watchdog_1500', expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith(1500, expect.any(Function));
        expect((await storageMock.get(null)).gemini_job_1500).toBeUndefined();

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1 });
        backgroundModule.finalizeJob(1500, 55, false);
        await flush(4);

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            activeJobsCount: 1,
            completedJobs: 1,
        }));

        await storageMock.set({
            debugMode: true,
            gemini_job_1600: { geminiTabId: 1600 },
            wd_data_1600: { mangaTabId: 56, index: 2, geminiTabId: 1600 },
        });
        tabsMock._tabs.set(1600, { id: 1600, url: 'https://gemini.google.com/app/test', active: false, status: 'complete', title: '' });
        removeSpy.mockClear();

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });
        backgroundModule.finalizeJob(1600, 56, false);
        await flush(8);
        await delay(650);

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            activeJobsCount: 0,
            completedJobs: 1,
        }));
        expect(removeSpy).not.toHaveBeenCalled();

        await storageMock.set({
            debugMode: false,
            gemini_job_1700: { geminiTabId: 1700 },
            wd_data_1700: { mangaTabId: 57, index: 3, geminiTabId: 1700 },
        });
        tabsMock._tabs.delete(1700);
        removeSpy.mockClear();

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });
        backgroundModule.finalizeJob(1700, 57, true);
        await flush(8);
        await delay(650);

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            activeJobsCount: 0,
            completedJobs: 0,
        }));
        expect(removeSpy).toHaveBeenCalledWith(1700, expect.any(Function));
    });

    test('BG-27/BG-30/BG-31: marca de finalização expira após 10 min e cleanup de deleting_urls fecha a aba após 18s no modo minimized_window', async () => {
        await storageMock.set({
            debugMode: false,
            geminiExecutionMode: 'minimized_window',
            deleting_urls: [],
            gemini_job_1800: { geminiTabId: 1800, executionMode: 'minimized_window' },
            wd_data_1800: { mangaTabId: 60, index: 4, geminiTabId: 1800 },
        });
        tabsMock._tabs.set(1800, { id: 1800, url: 'https://gemini.google.com/app/job-1800', active: false, status: 'complete', title: '' });

        jest.useFakeTimers();

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });
        backgroundModule.finalizeJob(1800, 60, false);

        await flushFakeTimerRounds(6);

        let data = storageMock._getStore();
        expect(data.deleting_urls).toContain('https://gemini.google.com/app/job-1800');
        expect(tabsMock._tabs.has(1800)).toBe(true);

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1 });
        backgroundModule.finalizeJob(1800, 60, false);
        await flushFakeTimerRounds(3);

        expect(backgroundModule.__getState().activeJobsCount).toBe(1);

        await jest.advanceTimersByTimeAsync(18_001);
        await flushFakeTimerRounds(4);
        data = storageMock._getStore();
        expect(data.deleting_urls).toEqual([]);
        expect(tabsMock._tabs.has(1800)).toBe(false);

        storageMock._setStore({
            ...storageMock._getStore(),
            debugMode: false,
            geminiExecutionMode: 'minimized_window',
            deleting_urls: [],
            gemini_job_1800: { geminiTabId: 1800, executionMode: 'minimized_window' },
            wd_data_1800: { mangaTabId: 60, index: 4, geminiTabId: 1800 },
        });
        tabsMock._tabs.set(1800, { id: 1800, url: 'https://reader.test/not-gemini-1800', active: false, status: 'complete', title: '' });

        await jest.advanceTimersByTimeAsync(10 * 60_000 + 1);

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1 });
        backgroundModule.finalizeJob(1800, 60, false);
        await flushFakeTimerRounds(4);

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            activeJobsCount: 0,
            completedJobs: 2,
        }));
    });

    test('BG-31b: fallback de janela minimizada fecha somente a aba do Gemini', async () => {
        const removeWindow = jest.fn((_windowId, callback) => callback?.());
        global.chrome.windows = { remove: removeWindow };

        await storageMock.set({
            debugMode: false,
            geminiExecutionMode: 'minimized_window',
            gemini_job_1850: {
                geminiTabId: 1850,
                executionMode: 'minimized_window',
                dedicatedWindow: false,
            },
            wd_data_1850: { mangaTabId: 60, index: 5, geminiTabId: 1850 },
        });
        tabsMock._tabs.set(1850, {
            id: 1850,
            windowId: 73,
            url: 'https://gemini.google.com/',
            active: false,
            status: 'complete',
            title: '',
        });
        tabsMock._tabs.set(60, {
            id: 60,
            windowId: 73,
            url: 'https://reader.test/chapter',
            active: true,
            status: 'complete',
            title: 'Mangá',
        });
        const removeTab = jest.spyOn(tabsMock, 'remove');

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });
        await backgroundModule.finalizeJob(1850, 60, true);
        await flush(6);

        expect(removeWindow).not.toHaveBeenCalled();
        expect(removeTab).toHaveBeenCalledWith(1850, expect.any(Function));
        expect(tabsMock._tabs.has(1850)).toBe(false);
        expect(tabsMock._tabs.has(60)).toBe(true);
    });

    test('P0: marca durável impede dupla finalização após perda da proteção em memória', async () => {
        await storageMock.set({
            debugMode: true,
            gemini_job_2100: { geminiTabId: 2100, jobId: 'job-p0' },
            wd_data_2100: { mangaTabId: 61, index: 5, geminiTabId: 2100, jobId: 'job-p0' },
        });
        tabsMock._tabs.set(2100, { id: 2100, url: 'https://gemini.google.com/app/job-p0', active: false, status: 'complete', title: '' });
        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });

        backgroundModule.finalizeJob(2100, 61, false);
        await flush(8);
        expect((await storageMock.get(['gemini_finalized_2100'])).gemini_finalized_2100).toEqual(expect.objectContaining({ jobId: 'job-p0' }));

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1, _finalizedTabs: [] });
        backgroundModule.finalizeJob(2100, 61, false);
        await flush(8);

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({ activeJobsCount: 1, completedJobs: 1 }));
    });

    test('P0: restart entre a marca e a contabilidade reconcilia uma única vez', async () => {
        // Simula a última escrita que sobreviveu ao descarte do worker: a marca
        // existe, mas o snapshot ainda contém o job e os contadores antigos.
        // Este é exatamente o intervalo entre marcar finalização e contabilizar.
        const expiresAt = Date.now() + 60_000;
        await storageMock.set({
            mt_state: {
                jobQueue: [], isProcessing: true, stopRequested: false,
                activeMangaTabId: 62, currentBatchId: 'batch-restart', extractionTabs: {},
                totalJobs: 1, completedJobs: 0, activeJobsCount: 1,
                jobIndex: [{ geminiTabId: 2200, jobId: 'job-restart', mangaTabId: 62, index: 0, batchId: 'batch-restart' }],
            },
            gemini_job_2200: { geminiTabId: 2200, jobId: 'job-restart', mangaTabId: 62, index: 0 },
            wd_data_2200: { geminiTabId: 2200, jobId: 'job-restart' },
            gemini_finalized_2200: {
                jobId: 'job-restart', fromError: false, finalizedAt: Date.now(),
                expiresAt, accountingApplied: false,
            },
        });

        // onStartup usa o mesmo caminho de reidratação usado por um worker
        // recriado; a aba pode até continuar aberta, pois a marca prevalece.
        tabsMock._tabs.set(2200, { id: 2200, url: 'https://gemini.google.com/app', active: false, status: 'complete', title: '' });
        const startup = runtimeMock._startupListeners[0];
        await startup();
        await flush(8);

        let stored = await storageMock.get(null);
        expect(stored.mt_state).toEqual(expect.objectContaining({ completedJobs: 1, activeJobsCount: 0, jobIndex: [] }));
        expect(stored.gemini_finalized_2200).toEqual(expect.objectContaining({ accountingApplied: true }));
        expect(stored.gemini_job_2200).toBeUndefined();
        expect(stored.wd_data_2200).toBeUndefined();

        // Uma nova reconciliação não reencontra o journal e não pode somar o
        // mesmo job novamente.
        await startup();
        await flush(6);
        stored = await storageMock.get(['mt_state']);
        expect(stored.mt_state.completedJobs).toBe(1);
        expect(stored.mt_state.activeJobsCount).toBe(0);
    });

    test('BG-76b: STOP_BATCH durante tabs.create não permite job tardio ressuscitar o lote', async () => {
        await storageMock.set({
            maxConcurrentJobs: 1,
            geminiBaseUrl: 'https://example.com/mock',
            geminiExecutionMode: 'temp_chat',
        });

        const originalCreate = tabsMock.create.bind(tabsMock);
        let releaseCreate = null;
        jest.spyOn(tabsMock, 'create').mockImplementation(options =>
            new Promise(resolve => {
                releaseCreate = async () => resolve(await originalCreate(options));
            })
        );

        const start = await dispatchToBackground(runtimeMock, {
            action: 'START_BATCH',
            batchId: 'batch-cancel-launch',
            mangaTabId: 55,
            prompt: 'Traduzir',
            images: [{ index: 1 }],
        }, { tab: { id: 55 } });

        expect(start.response).toEqual(expect.objectContaining({
            ok: true,
            batchId: 'batch-cancel-launch',
        }));
        await waitFor(() => typeof releaseCreate === 'function');

        const stop = await dispatchToBackground(runtimeMock, {
            action: 'STOP_BATCH',
            batchId: 'batch-cancel-launch',
        });
        expect(stop.response).toEqual({ ok: true });

        await releaseCreate();
        await flush(12);

        await waitFor(async () => {
            const state = backgroundModule.__getState();
            const stored = await storageMock.get(null);
            return state.activeJobsCount === 0 &&
                state.jobIndex.length === 0 &&
                tabsMock._tabs.size === 0 &&
                !Object.keys(stored).some(key => key.startsWith('gemini_job_'));
        });

        const stored = await storageMock.get(null);
        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            stopRequested: false,
            isProcessing: false,
            currentBatchId: null,
            activeJobsCount: 0,
            jobIndex: [],
        }));
        expect(Object.keys(stored).filter(key => key.startsWith('wd_data_'))).toEqual([]);
        expect(Object.keys(stored).filter(key => key.startsWith('gemini_job_'))).toEqual([]);
    });

    test('BG-77: aba do mangá fechada falha staging e erro subsequente encerra o job sem falso sucesso', async () => {
        await storageMock.set({
            debugMode: false,
            geminiExecutionMode: 'temp_chat',
            gemini_job_1900: {
                geminiTabId: 1900,
                mangaTabId: 404,
                index: 7,
                jobId: 'job-1900',
                batchId: 'batch-1900',
                executionMode: 'temp_chat',
            },
            wd_data_1900: {
                mangaTabId: 404,
                index: 7,
                geminiTabId: 1900,
                jobId: 'job-1900',
            },
        });
        tabsMock._tabs.set(1900, {
            id: 1900,
            url: 'https://gemini.google.com/app/job-1900',
            active: false,
            status: 'complete',
            title: '',
        });

        jest.useFakeTimers();
        backgroundModule.__setState({
            jobQueue: [],
            jobIndex: [{
                geminiTabId: 1900,
                mangaTabId: 404,
                index: 7,
                jobId: 'job-1900',
                batchId: 'batch-1900',
            }],
            currentBatchId: 'batch-1900',
            isProcessing: true,
            stopRequested: false,
            activeMangaTabId: 404,
            activeJobsCount: 1,
            totalJobs: 1,
            completedJobs: 0,
        });

        const resultPromise = dispatchToBackground(runtimeMock, {
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: 404,
            index: 7,
            src: 'data:image/png;base64,TRANSLATED',
            jobId: 'job-1900',
            batchId: 'batch-1900',
        }, { tab: { id: 1900 } });
        // A ação passa por reidratação/storage antes de chrome.tabs.sendMessage;
        // avance em rodadas para também executar o callback de erro agendado no mock.
        await flushFakeTimerRounds(24);
        const result = await resultPromise;

        expect(result.response.ok).toBe(false);
        expect(result.response.staged).toBeUndefined();
        expect(backgroundModule.__getState().activeJobsCount).toBe(1);
        expect(storageMock._getStore().gemini_job_1900).toBeDefined();

        // O job runner transforma a falha de staging em GEMINI_ERROR. Mesmo
        // sem a aba do mangá, report-error finaliza o job real e libera o slot.
        const errorPromise = dispatchToBackground(runtimeMock, {
            action: 'GEMINI_ERROR',
            mangaTabId: 404,
            index: 7,
            error: 'RESULT_STAGE_FAILED',
            jobId: 'job-1900',
            batchId: 'batch-1900',
        }, { tab: { id: 1900 } });
        // report-error também agenda o callback de chrome.tabs.sendMessage no
        // mock; avance em rodadas após os awaits internos para não depender da
        // ordem de microtasks do Node 20/22.
        await flushFakeTimerRounds(24);
        const errorResult = await errorPromise;
        expect(errorResult.response).toEqual({ ok: true });

        await jest.advanceTimersByTimeAsync(601);
        await flushFakeTimerRounds(6);

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            activeJobsCount: 0,
            completedJobs: 0,
        }));
        expect(storageMock._getStore().gemini_job_1900).toBeUndefined();
        expect(tabsMock._tabs.has(1900)).toBe(false);
    });

    test('BG-31c: background_delete só inicia exclusão depois que o job chega à finalização pós-persistência', async () => {
        await storageMock.set({
            debugMode: false,
            geminiExecutionMode: 'background_delete',
            deleting_urls: [],
            gemini_job_1900: {
                geminiTabId: 1900,
                jobId: 'job-bg-delete',
                batchId: 'batch-bg-delete',
                mangaTabId: 60,
                executionMode: 'background_delete',
                state: 'result_committed',
                resultPersisted: true,
            },
            wd_data_1900: {
                mangaTabId: 60,
                index: 6,
                geminiTabId: 1900,
                jobId: 'job-bg-delete',
            },
        });
        tabsMock._tabs.set(1900, {
            id: 1900,
            url: 'https://gemini.google.com/app/job-1900',
            active: false,
            status: 'complete',
            title: '',
        });

        const received = [];
        tabsMock._registerMessageHandler(1900, (message, _sender, sendResponse) => {
            received.push(message);
            sendResponse({ ok: true });
        });

        jest.useFakeTimers();
        backgroundModule.__setState({
            activeJobsCount: 1,
            completedJobs: 0,
            currentBatchId: 'batch-bg-delete',
            totalJobs: 1,
            jobIndex: [{
                geminiTabId: 1900,
                jobId: 'job-bg-delete',
                batchId: 'batch-bg-delete',
                mangaTabId: 60,
                index: 6,
            }],
        });

        const finalizePromise = backgroundModule.finalizeJob(1900, 60, false);
        await flushFakeTimerRounds(12);
        await finalizePromise;
        await flushFakeTimerRounds(6);

        expect(received).toContainEqual({ action: 'DELETE_CONVERSATION' });
        expect(tabsMock._tabs.has(1900)).toBe(true);
        expect(storageMock._getStore().deleting_urls)
            .toContain('https://gemini.google.com/app/job-1900');

        await jest.advanceTimersByTimeAsync(18_001);
        await flushFakeTimerRounds(4);

        expect(tabsMock._tabs.has(1900)).toBe(false);
        expect(storageMock._getStore().deleting_urls).toEqual([]);
    });


    test('BG-31d: finalização de janela minimizada fecha a janela dedicada inteira', async () => {
        const removeWindow = jest.fn((_windowId, callback) => callback?.());
        global.chrome.windows = { remove: removeWindow };
        const removeTab = jest.spyOn(tabsMock, 'remove');

        await storageMock.set({
            debugMode: false,
            geminiExecutionMode: 'minimized_window',
            gemini_job_1851: {
                geminiTabId: 1851,
                executionMode: 'minimized_window',
                dedicatedWindow: true,
            },
            wd_data_1851: { mangaTabId: 60, index: 5, geminiTabId: 1851 },
        });
        tabsMock._tabs.set(1851, {
            id: 1851,
            windowId: 74,
            url: 'https://gemini.google.com/',
            active: false,
            status: 'complete',
            title: '',
        });

        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });
        await backgroundModule.finalizeJob(1851, 60, true);
        await flush(8);

        expect(removeWindow).toHaveBeenCalledTimes(1);
        expect(removeWindow).toHaveBeenCalledWith(74, expect.any(Function));
        expect(removeTab).not.toHaveBeenCalled();
    });

    test('BG-16b: reidratação do índice impede BATCH_COMPLETE com contador transitório zerado', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-guard', active: true });
        const forwardedMessages = [];
        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            forwardedMessages.push(message);
            sendResponse({ ok: true });
        });
        backgroundModule.__setState({
            jobQueue: [],
            isProcessing: true,
            stopRequested: false,
            activeMangaTabId: mangaTab.id,
            currentBatchId: 'batch-still-indexed',
            completionClaimedBatchId: null,
            extractionTabs: {},
            totalJobs: 1,
            completedJobs: 0,
            activeJobsCount: 0,
            jobIndex: [{ geminiTabId: 1950, batchId: 'batch-still-indexed', jobId: 'job-still-open' }],
        });

        await backgroundModule.processNextJob();
        await flush(6);

        expect(backgroundModule.__getState().activeJobsCount).toBe(1);
        expect((await storageMock.get('mt_state')).mt_state.activeJobsCount).toBe(1);
        expect(forwardedMessages).not.toContainEqual(expect.objectContaining({ action: 'BATCH_COMPLETE' }));
        expect(backgroundModule.__getState().jobIndex).toHaveLength(1);
    });

    test.each(['after_job_persist', 'after_tab_identity', 'after_watchdog_arm'])(
        'BG-76c: substituição do lote limpa lançamento cancelado em %s sem tocar na contabilidade do novo lote',
        async phase => {
            await storageMock.set({
                geminiBaseUrl: 'https://example.com/mock',
                geminiExecutionMode: 'temp_chat',
            });
            const gateEntered = (() => {
                let resolve;
                const promise = new Promise(done => { resolve = done; });
                return { promise, resolve };
            })();
            const gateReleased = (() => {
                let resolve;
                const promise = new Promise(done => { resolve = done; });
                return { promise, resolve };
            })();
            const originalSet = storageMock.set.bind(storageMock);
            const originalGet = storageMock.get.bind(storageMock);
            let gated = false;
            let indexedAliasReads = 0;
            const shouldGate = (keys, value) => {
                if (gated) return false;
                if (phase === 'after_job_persist') {
                    return Boolean(value?.mt_state?.jobIndex?.some(entry => entry.batchId === 'batch-A'));
                }
                const requested = Array.isArray(keys) ? keys : [keys];
                const isAliasRead = requested.some(key =>
                    typeof key === 'string' && key.startsWith('gemini_tab_alias_'));
                const isIndexedLaunch = backgroundModule.__getState().jobIndex
                    .some(entry => entry.batchId === 'batch-A');
                if (!isAliasRead || !isIndexedLaunch) return false;
                indexedAliasReads += 1;
                // Após indexação, a primeira leitura pertence ao recheck de
                // identidade; a quarta é a confirmação final de armWatchdog,
                // depois de o alarme e o payload durável já existirem.
                return phase === 'after_tab_identity'
                    ? indexedAliasReads === 1
                    : indexedAliasReads === 4;
            };
            storageMock.set = async (value, callback) => {
                const result = await originalSet(value, callback);
                if (shouldGate(null, value)) {
                    gated = true;
                    gateEntered.resolve();
                    await gateReleased.promise;
                }
                return result;
            };
            storageMock.get = async (keys, callback) => {
                if (shouldGate(keys, null)) {
                    gated = true;
                    gateEntered.resolve();
                    await gateReleased.promise;
                }
                return originalGet(keys, callback);
            };

            backgroundModule.__setState({
                jobQueue: [{ mangaTabId: 55, index: 1, prompt: 'A', batchId: 'batch-A' }],
                isProcessing: true,
                stopRequested: false,
                activeMangaTabId: 55,
                currentBatchId: 'batch-A',
                completionClaimedBatchId: null,
                pendingBatches: [],
                jobIndex: [],
                activeJobsCount: 0,
                completedJobs: 0,
                totalJobs: 1,
                _cachedMaxCon: 1,
            });

            const launch = backgroundModule.processNextJob();
            try {
                await waitFor(() => gated || null);
                await gateEntered.promise;
                expect(backgroundModule.__getState().jobIndex.some(entry => entry.batchId === 'batch-A')).toBe(true);
                if (phase === 'after_watchdog_arm') {
                    expect((await alarmsMock.getAll()).some(alarm => alarm.name.startsWith('watchdog_'))).toBe(true);
                    expect(Object.keys(await storageMock.get(null)).some(key => key.startsWith('wd_data_'))).toBe(true);
                }

                // Simula a promoção concorrente de B enquanto o lançamento de A
                // está parado exatamente antes do checkpoint selecionado.
                backgroundModule.__setState({
                    currentBatchId: 'batch-B',
                    activeMangaTabId: 56,
                    activeJobsCount: 1,
                    totalJobs: 3,
                    completedJobs: 2,
                });
                gateReleased.resolve();
                await launch;
                await flush(10);

                const state = backgroundModule.__getState();
                const stored = await storageMock.get(null);
                const launchedTabIds = Array.from(tabsMock._tabs.keys()).filter(id => id >= 1000);
                expect(state).toEqual(expect.objectContaining({
                    currentBatchId: 'batch-B',
                    activeMangaTabId: 56,
                    activeJobsCount: 1,
                    totalJobs: 3,
                    completedJobs: 2,
                    jobIndex: [],
                }));
                expect(Object.keys(stored).filter(key => key.startsWith('gemini_job_'))).toEqual([]);
                expect(Object.keys(stored).filter(key => key.startsWith('wd_data_'))).toEqual([]);
                expect(await alarmsMock.getAll()).toEqual([]);
                expect(launchedTabIds.every(id => !tabsMock._tabs.has(id))).toBe(true);
            } finally {
                gateReleased.resolve();
                storageMock.set = originalSet;
                storageMock.get = originalGet;
            }
        }
    );
});
```

## 11. Auditoria linha a linha

### Linha 001

- **Código:** `const {`
- **Função:** Importa parte do conjunto de mocks Chrome compartilhados usado para executar o background real sem navegador externo.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 002

- **Código:** `    getRuntimeMock,`
- **Função:** Importa parte do conjunto de mocks Chrome compartilhados usado para executar o background real sem navegador externo.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 003

- **Código:** `    getStorageMock,`
- **Função:** Importa parte do conjunto de mocks Chrome compartilhados usado para executar o background real sem navegador externo.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 004

- **Código:** `    getTabsMock,`
- **Função:** Importa parte do conjunto de mocks Chrome compartilhados usado para executar o background real sem navegador externo.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 005

- **Código:** `    getAlarmsMock,`
- **Função:** Importa parte do conjunto de mocks Chrome compartilhados usado para executar o background real sem navegador externo.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 006

- **Código:** `    getDownloadsMock,`
- **Função:** Importa parte do conjunto de mocks Chrome compartilhados usado para executar o background real sem navegador externo.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 007

- **Código:** `} = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa parte do conjunto de mocks Chrome compartilhados usado para executar o background real sem navegador externo.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 008

- **Código:** `const { loadBackgroundModule } = require('../../helpers/load-background-module.js');`
- **Função:** Importa `loadBackgroundModule`, helper que carrega e instrumenta `extension/background.js` real para a suíte.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga explicitamente a suíte ao arquivo/helper real carregado no CI.

### Linha 009

- **Código:** `const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');`
- **Função:** Importa o rastreador de timers atrasados do background, usado para evitar recursos assíncronos residuais entre casos.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga explicitamente a suíte ao arquivo/helper real carregado no CI.

### Linha 010

- **Código:** `const {`
- **Função:** Importa utilitários do harness: caminho do background real, despacho pela API runtime e sincronizadores assíncronos.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 011

- **Código:** `    BACKGROUND_PATH,`
- **Função:** Importa utilitários do harness: caminho do background real, despacho pela API runtime e sincronizadores assíncronos.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga explicitamente a suíte ao arquivo/helper real carregado no CI.

### Linha 012

- **Código:** `    dispatchToBackground,`
- **Função:** Importa utilitários do harness: caminho do background real, despacho pela API runtime e sincronizadores assíncronos.
- **Contexto:** infraestrutura importada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 013

- **Código:** `    flush,`
- **Função:** Importa utilitários do harness: caminho do background real, despacho pela API runtime e sincronizadores assíncronos.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 014

- **Código:** `    waitFor,`
- **Função:** Importa utilitários do harness: caminho do background real, despacho pela API runtime e sincronizadores assíncronos.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 015

- **Código:** `} = require('../../helpers/background-test-utils.js');`
- **Função:** Importa utilitários do harness: caminho do background real, despacho pela API runtime e sincronizadores assíncronos.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 016

- **Código:** `const delay = ms => new Promise(resolve => setTimeout(resolve, ms));`
- **Função:** Define atraso real auxiliar para aguardar o fechamento assíncrono de 600 ms no caminho `temp_chat`.
- **Contexto:** infraestrutura importada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 017

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 018

- **Código:** `describe('background.js - processNextJob e finalizeJob reais', () => {`
- **Função:** Abre a suíte focal que exercita `processNextJob` e `finalizeJob` reais, não uma reimplementação local.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 019

- **Código:** `    let runtimeMock;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 020

- **Código:** `    let storageMock;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 021

- **Código:** `    let tabsMock;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 022

- **Código:** `    let alarmsMock;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 023

- **Código:** `    let downloadsMock;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 024

- **Código:** `    let backgroundModule;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 025

- **Código:** `    let cancelBackgroundDelayTimers;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 026

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 027

- **Código:** `    async function flushFakeTimerRounds(rounds = 6, stepMs = 1) {`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 028

- **Código:** `        for (let index = 0; index < rounds; index++) {`
- **Função:** Prepara dado/fixture intermediário do cenário **harness, isolamento e teardown** para controlar ou observar o fluxo real.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 029

- **Código:** `            // eslint-disable-next-line no-await-in-loop`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 030

- **Código:** `            await jest.advanceTimersByTimeAsync(stepMs);`
- **Função:** Avança o relógio Jest pelo intervalo contratual e libera callbacks temporais do ramo auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 031

- **Código:** `        }`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 032

- **Código:** `    }`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 033

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 034

- **Código:** `    beforeEach(async () => {`
- **Função:** Inicia o setup por teste: limpa módulos/timers, restaura mocks e carrega novamente o background real.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 035

- **Código:** `        jest.resetModules();`
- **Função:** Força novo carregamento dos módulos para simular um worker/background limpo por cenário.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 036

- **Código:** `        jest.useRealTimers();`
- **Função:** Garante timers reais fora dos cenários que explicitamente optam por fake timers.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 037

- **Código:** `        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();`
- **Função:** Instala rastreamento/cancelamento dos atrasos relevantes do background antes do carregamento da implementação.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 038

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 039

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Obtém uma instância limpa do mock Chrome correspondente para controlar e observar efeitos da implementação real.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 040

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Obtém uma instância limpa do mock Chrome correspondente para controlar e observar efeitos da implementação real.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 041

- **Código:** `        tabsMock = getTabsMock();`
- **Função:** Obtém uma instância limpa do mock Chrome correspondente para controlar e observar efeitos da implementação real.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 042

- **Código:** `        alarmsMock = getAlarmsMock();`
- **Função:** Obtém uma instância limpa do mock Chrome correspondente para controlar e observar efeitos da implementação real.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 043

- **Código:** `        downloadsMock = getDownloadsMock();`
- **Função:** Obtém uma instância limpa do mock Chrome correspondente para controlar e observar efeitos da implementação real.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 044

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 045

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:** Zera estado/listeners do runtime mock, removendo efeitos de casos anteriores antes de recarregar o background.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 046

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:** Zera estado/listeners do runtime mock, removendo efeitos de casos anteriores antes de recarregar o background.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 047

- **Código:** `        runtimeMock._installedListeners = [];`
- **Função:** Zera estado/listeners do runtime mock, removendo efeitos de casos anteriores antes de recarregar o background.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 048

- **Código:** `        runtimeMock._startupListeners = [];`
- **Função:** Zera estado/listeners do runtime mock, removendo efeitos de casos anteriores antes de recarregar o background.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 049

- **Código:** `        runtimeMock.lastError = null;`
- **Função:** Zera estado/listeners do runtime mock, removendo efeitos de casos anteriores antes de recarregar o background.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 050

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 051

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa o storage simulado para impedir que journals, jobs ou configurações vazem entre cenários.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 052

- **Código:** `        global.chrome = {`
- **Função:** Monta a API `chrome` que será observada por `background.js` durante o carregamento deste caso.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 053

- **Código:** `            storage: { local: storageMock },`
- **Função:** Compõe o cenário **harness, isolamento e teardown**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 054

- **Código:** `            tabs: tabsMock,`
- **Função:** Compõe o cenário **harness, isolamento e teardown**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 055

- **Código:** `            alarms: alarmsMock,`
- **Função:** Compõe o cenário **harness, isolamento e teardown**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 056

- **Código:** `            runtime: runtimeMock,`
- **Função:** Compõe o cenário **harness, isolamento e teardown**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 057

- **Código:** `            downloads: downloadsMock,`
- **Função:** Compõe o cenário **harness, isolamento e teardown**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 058

- **Código:** `            scripting: global.chrome?.scripting,`
- **Função:** Compõe o cenário **harness, isolamento e teardown**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 059

- **Código:** `        };`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 060

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 061

- **Código:** `        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);`
- **Função:** Carrega a implementação real do background com os mocks atuais e expõe as fachadas instrumentadas usadas pelos testes.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga explicitamente a suíte ao arquivo/helper real carregado no CI.

### Linha 062

- **Código:** `        await flush(8);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 063

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 064

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 065

- **Código:** `    afterEach(async () => {`
- **Função:** Inicia o teardown por teste para cancelar timers, limpar alarmes/abas/storage e restaurar o ambiente Jest.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 066

- **Código:** `        cancelBackgroundDelayTimers();`
- **Função:** Cancela timers atrasados ainda pendentes, protegendo o processo Jest contra worker/timer leak.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 067

- **Código:** `        alarmsMock.clearAll();`
- **Função:** Remove alarmes simulados deixados pelo watchdog ou pelo marcador de finalização.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 068

- **Código:** `        tabsMock._tabs.clear();`
- **Função:** Remove as abas simuladas restantes e restaura isolamento para o próximo caso.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 069

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa o storage simulado para impedir que journals, jobs ou configurações vazem entre cenários.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 070

- **Código:** `        jest.useRealTimers();`
- **Função:** Garante timers reais fora dos cenários que explicitamente optam por fake timers.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 071

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Compõe o cenário **harness, isolamento e teardown**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 072

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** harness, isolamento e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 073

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 074

- **Código:** `    test('BG-16/BG-17/BG-18: fila vazia conclui, stopRequested bloqueia e maxConcurrentJobs é respeitado', async () => {`
- **Função:** Declara o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 075

- **Código:** `        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-1', active: true });`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência** para controlar ou observar o fluxo real.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 076

- **Código:** `        const forwardedMessages = [];`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência** para controlar ou observar o fluxo real.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 077

- **Código:** `        const createSpy = jest.spyOn(tabsMock, 'create');`
- **Função:** Instala spy sobre API/mock existente para medir chamadas sem substituir o restante do fluxo real.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 078

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 079

- **Código:** `        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {`
- **Função:** Registra handler da aba simulada para capturar mensagens produzidas pelo background e responder ao callback como o content script faria.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 080

- **Código:** `            forwardedMessages.push(message);`
- **Função:** Armazena a mensagem recebida pela aba do mangá para posterior assertion de contrato.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 081

- **Código:** `            sendResponse({ ok: true });`
- **Função:** Responde ao emissor simulado, permitindo que o fluxo assíncrono do background prossiga.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 082

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 083

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 084

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 085

- **Código:** `            jobQueue: [],`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 086

- **Código:** `            isProcessing: true,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 087

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 088

- **Código:** `            activeMangaTabId: mangaTab.id,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 089

- **Código:** `            currentBatchId: 'batch-complete',`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 090

- **Código:** `            completionClaimedBatchId: null,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 091

- **Código:** `            extractionTabs: {},`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 092

- **Código:** `            totalJobs: 1,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 093

- **Código:** `            completedJobs: 1,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 094

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 095

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 096

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 097

- **Código:** `        await backgroundModule.processNextJob();`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 098

- **Código:** `        await flush(6);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 099

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 100

- **Código:** `        expect(forwardedMessages).toContainEqual(expect.objectContaining({ action: 'BATCH_COMPLETE' }));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 101

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 102

- **Código:** `            isProcessing: false,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 103

- **Código:** `            activeMangaTabId: null,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 104

- **Código:** `        }));`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 105

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 106

- **Código:** `        createSpy.mockClear();`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 107

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 108

- **Código:** `            jobQueue: [{ mangaTabId: mangaTab.id, index: 2, prompt: 'stop' }],`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 109

- **Código:** `            stopRequested: true,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 110

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 111

- **Código:** `            _cachedMaxCon: 1,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 112

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 113

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 114

- **Código:** `        await backgroundModule.processNextJob();`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 115

- **Código:** `        expect(createSpy).not.toHaveBeenCalled();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 116

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 117

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 118

- **Código:** `            jobQueue: [{ mangaTabId: mangaTab.id, index: 3, prompt: 'full' }],`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 119

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 120

- **Código:** `            activeJobsCount: 2,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 121

- **Código:** `            _cachedMaxCon: 2,`
- **Função:** Compõe o cenário **BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 122

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 123

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 124

- **Código:** `        await backgroundModule.processNextJob();`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 125

- **Código:** `        expect(createSpy).not.toHaveBeenCalled();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 126

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-16/BG-17/BG-18 — conclusão de fila vazia, bloqueio por stopRequested e limite de concorrência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 127

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 128

- **Código:** `    test('BG-19/BG-20/BG-22/BG-23: jobs normais, paralelismo e corrida entre chamadas', async () => {`
- **Função:** Declara o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 129

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 130

- **Código:** `            geminiBaseUrl: 'http://127.0.0.1:3999/app',`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 131

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 132

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 133

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 134

- **Código:** `            jobQueue: [`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 135

- **Código:** `                { mangaTabId: 70, index: 1, prompt: 'A' },`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 136

- **Código:** `                { mangaTabId: 70, index: 2, prompt: 'B' },`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 137

- **Código:** `            ],`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 138

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 139

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 140

- **Código:** `            totalJobs: 2,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 141

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 142

- **Código:** `            _cachedMaxCon: 2,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 143

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 144

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 145

- **Código:** `        await backgroundModule.processNextJob();`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 146

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 147

- **Código:** `        const geminiJobs = await waitFor(async () => {`
- **Função:** Espera uma condição observável do fluxo assíncrono, evitando assertion antes da conclusão do efeito sob teste.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 148

- **Código:** `            const data = await storageMock.get(null);`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId** para controlar ou observar o fluxo real.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 149

- **Código:** `            const keys = Object.keys(data).filter(key => key.startsWith('gemini_job_'));`
- **Função:** Deriva a observação usada para localizar jobs, journals ou mensagens relevantes sem alterar o estado do sistema sob teste.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 150

- **Código:** `            return keys.length === 2 ? keys : null;`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 151

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 152

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 153

- **Código:** `        expect(geminiJobs).toHaveLength(2);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 154

- **Código:** `        expect(tabsMock._tabs.size).toBe(2);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 155

- **Código:** `        expect(await alarmsMock.getAll()).toEqual(expect.arrayContaining([`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 156

- **Código:** `            expect.objectContaining({ name: expect.stringMatching(/^watchdog_/) }),`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 157

- **Código:** `            expect.objectContaining({ name: expect.stringMatching(/^watchdog_/) }),`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 158

- **Código:** `        ]));`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 159

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 160

- **Código:** `        const createSpy = jest.spyOn(tabsMock, 'create');`
- **Função:** Instala spy sobre API/mock existente para medir chamadas sem substituir o restante do fluxo real.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 161

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 162

- **Código:** `            jobQueue: [{ mangaTabId: 99, index: 7, prompt: 'Race' }],`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 163

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 164

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 165

- **Código:** `            totalJobs: 1,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 166

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 167

- **Código:** `            _cachedMaxCon: 1,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 168

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 169

- **Código:** `        tabsMock._tabs.clear();`
- **Função:** Remove as abas simuladas restantes e restaura isolamento para o próximo caso.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 170

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa o storage simulado para impedir que journals, jobs ou configurações vazem entre cenários.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 171

- **Código:** `        await storageMock.set({ geminiBaseUrl: 'http://127.0.0.1:3999/app' });`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 172

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 173

- **Código:** `        await Promise.all([`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 174

- **Código:** `            backgroundModule.processNextJob(),`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 175

- **Código:** `            backgroundModule.processNextJob(),`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 176

- **Código:** `        ]);`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 177

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 178

- **Código:** `        await waitFor(() => (tabsMock._tabs.size === 1 ? true : null));`
- **Função:** Espera uma condição observável do fluxo assíncrono, evitando assertion antes da conclusão do efeito sob teste.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 179

- **Código:** `        expect(createSpy).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 180

- **Código:** `        expect(backgroundModule.__getState().activeJobsCount).toBe(1);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 181

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 182

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 183

- **Código:** `            jobQueue: [{ index: 10, prompt: 'no-tab' }],`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 184

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 185

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 186

- **Código:** `            totalJobs: 1,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 187

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 188

- **Código:** `            _cachedMaxCon: 1,`
- **Função:** Compõe o cenário **BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 189

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 190

- **Código:** `        tabsMock._tabs.clear();`
- **Função:** Remove as abas simuladas restantes e restaura isolamento para o próximo caso.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 191

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa o storage simulado para impedir que journals, jobs ou configurações vazem entre cenários.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 192

- **Código:** `        await storageMock.set({ geminiBaseUrl: 'http://127.0.0.1:3999/app' });`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 193

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 194

- **Código:** `        await backgroundModule.processNextJob();`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 195

- **Código:** `        await waitFor(() => (tabsMock._tabs.size === 1 ? true : null));`
- **Função:** Espera uma condição observável do fluxo assíncrono, evitando assertion antes da conclusão do efeito sob teste.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 196

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 197

- **Código:** `        expect(backgroundModule.__getState().activeMangaTabId).toBeUndefined();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 198

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-19/BG-20/BG-22/BG-23 — lançamento normal, paralelismo, corrida de duas chamadas e ausência de mangaTabId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 199

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 200

- **Código:** `    test('BG-21: erro ao criar aba Gemini decrementa contador e envia erro integrado', async () => {`
- **Função:** Declara o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 201

- **Código:** `        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-2', active: true });`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado** para controlar ou observar o fluxo real.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 202

- **Código:** `        const forwardedMessages = [];`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado** para controlar ou observar o fluxo real.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 203

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 204

- **Código:** `        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {`
- **Função:** Registra handler da aba simulada para capturar mensagens produzidas pelo background e responder ao callback como o content script faria.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 205

- **Código:** `            forwardedMessages.push(message);`
- **Função:** Armazena a mensagem recebida pela aba do mangá para posterior assertion de contrato.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 206

- **Código:** `            sendResponse({ ok: true });`
- **Função:** Responde ao emissor simulado, permitindo que o fluxo assíncrono do background prossiga.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 207

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 208

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 209

- **Código:** `        jest.spyOn(tabsMock, 'create').mockRejectedValue(new Error('create failed'));`
- **Função:** Instala spy sobre API/mock existente para medir chamadas sem substituir o restante do fluxo real.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 210

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 211

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 212

- **Código:** `            jobQueue: [{ mangaTabId: mangaTab.id, index: 4, prompt: 'boom' }],`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 213

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 214

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 215

- **Código:** `            totalJobs: 1,`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 216

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 217

- **Código:** `            _cachedMaxCon: 1,`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 218

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 219

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 220

- **Código:** `        await backgroundModule.processNextJob();`
- **Função:** Invoca diretamente a fachada que delega para `jobsLifecycle.processNextJob`, executando o algoritmo real de fila/concorrência.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 221

- **Código:** `        await waitFor(() => forwardedMessages.find(message => message.action === 'SHOW_ERROR_INTEGRATED') || null);`
- **Função:** Espera uma condição observável do fluxo assíncrono, evitando assertion antes da conclusão do efeito sob teste.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 222

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 223

- **Código:** `        expect(forwardedMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 224

- **Código:** `            action: 'SHOW_ERROR_INTEGRATED',`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 225

- **Código:** `            imgIndex: 4,`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 226

- **Código:** `        }));`
- **Função:** Compõe o cenário **BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 227

- **Código:** `        expect(backgroundModule.__getState().activeJobsCount).toBe(0);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 228

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-21 — falha de criação da aba Gemini libera slot e reporta erro integrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 229

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 230

- **Código:** `    test('REG-11/BG-24/BG-25/BG-26/BG-28/BG-29: finalizeJob limpa estado, ignora duplicado e respeita debug/missing tab', async () => {`
- **Função:** Declara o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**, com execução e assertions focais sobre a implementação real.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 231

- **Código:** `        const clearSpy = jest.spyOn(alarmsMock, 'clear');`
- **Função:** Instala spy sobre API/mock existente para medir chamadas sem substituir o restante do fluxo real.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 232

- **Código:** `        const removeSpy = jest.spyOn(tabsMock, 'remove');`
- **Função:** Instala spy sobre API/mock existente para medir chamadas sem substituir o restante do fluxo real.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 233

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 234

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 235

- **Código:** `            debugMode: false,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 236

- **Código:** `            deleting_urls: [],`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 237

- **Código:** `            gemini_job_1500: { geminiTabId: 1500 },`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 238

- **Código:** `            wd_data_1500: { mangaTabId: 55, index: 1, geminiTabId: 1500 },`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 239

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 240

- **Código:** `        tabsMock._tabs.set(1500, { id: 1500, url: 'https://reader.test/not-gemini', active: false, status: 'complete', title: '' });`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 241

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 242

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 243

- **Código:** `            activeJobsCount: 1,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 244

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 245

- **Código:** `            jobQueue: [],`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 246

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 247

- **Código:** `            _cachedMaxCon: 1,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 248

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 249

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 250

- **Código:** `        backgroundModule.finalizeJob(1500, 55, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 251

- **Código:** `        await flush(8);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 252

- **Código:** `        await delay(650);`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 253

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 254

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 255

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 256

- **Código:** `            completedJobs: 1,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 257

- **Código:** `        }));`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 258

- **Código:** `        expect(clearSpy).toHaveBeenCalledWith('watchdog_1500', expect.any(Function));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 259

- **Código:** `        expect(removeSpy).toHaveBeenCalledWith(1500, expect.any(Function));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 260

- **Código:** `        expect((await storageMock.get(null)).gemini_job_1500).toBeUndefined();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 261

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 262

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 263

- **Código:** `        backgroundModule.finalizeJob(1500, 55, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 264

- **Código:** `        await flush(4);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 265

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 266

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 267

- **Código:** `            activeJobsCount: 1,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 268

- **Código:** `            completedJobs: 1,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 269

- **Código:** `        }));`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 270

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 271

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 272

- **Código:** `            debugMode: true,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 273

- **Código:** `            gemini_job_1600: { geminiTabId: 1600 },`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 274

- **Código:** `            wd_data_1600: { mangaTabId: 56, index: 2, geminiTabId: 1600 },`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 275

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 276

- **Código:** `        tabsMock._tabs.set(1600, { id: 1600, url: 'https://gemini.google.com/app/test', active: false, status: 'complete', title: '' });`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 277

- **Código:** `        removeSpy.mockClear();`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 278

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 279

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 280

- **Código:** `        backgroundModule.finalizeJob(1600, 56, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 281

- **Código:** `        await flush(8);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 282

- **Código:** `        await delay(650);`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 283

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 284

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 285

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 286

- **Código:** `            completedJobs: 1,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 287

- **Código:** `        }));`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 288

- **Código:** `        expect(removeSpy).not.toHaveBeenCalled();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 289

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 290

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 291

- **Código:** `            debugMode: false,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 292

- **Código:** `            gemini_job_1700: { geminiTabId: 1700 },`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 293

- **Código:** `            wd_data_1700: { mangaTabId: 57, index: 3, geminiTabId: 1700 },`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 294

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 295

- **Código:** `        tabsMock._tabs.delete(1700);`
- **Função:** Remove a aba alvo do mock para exercitar explicitamente o caminho de recurso ausente.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 296

- **Código:** `        removeSpy.mockClear();`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 297

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 298

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 299

- **Código:** `        backgroundModule.finalizeJob(1700, 57, true);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 300

- **Código:** `        await flush(8);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 301

- **Código:** `        await delay(650);`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 302

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 303

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 304

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 305

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 306

- **Código:** `        }));`
- **Função:** Compõe o cenário **REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 307

- **Código:** `        expect(removeSpy).toHaveBeenCalledWith(1700, expect.any(Function));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 308

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** REG-11/BG-24/BG-25/BG-26/BG-28/BG-29 — finalização real, idempotência, debug e aba ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 309

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 310

- **Código:** `    test('BG-27/BG-30/BG-31: marca de finalização expira após 10 min e cleanup de deleting_urls fecha a aba após 18s no modo minimized_window', async () => {`
- **Função:** Declara o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 311

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 312

- **Código:** `            debugMode: false,`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 313

- **Código:** `            geminiExecutionMode: 'minimized_window',`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 314

- **Código:** `            deleting_urls: [],`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 315

- **Código:** `            gemini_job_1800: { geminiTabId: 1800, executionMode: 'minimized_window' },`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 316

- **Código:** `            wd_data_1800: { mangaTabId: 60, index: 4, geminiTabId: 1800 },`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 317

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 318

- **Código:** `        tabsMock._tabs.set(1800, { id: 1800, url: 'https://gemini.google.com/app/job-1800', active: false, status: 'complete', title: '' });`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 319

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 320

- **Código:** `        jest.useFakeTimers();`
- **Função:** Troca para timers falsos neste cenário para provar TTL/cleanup sem aguardar minutos reais.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 321

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 322

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 323

- **Código:** `        backgroundModule.finalizeJob(1800, 60, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 324

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 325

- **Código:** `        await flushFakeTimerRounds(6);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 326

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 327

- **Código:** `        let data = storageMock._getStore();`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 328

- **Código:** `        expect(data.deleting_urls).toContain('https://gemini.google.com/app/job-1800');`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 329

- **Código:** `        expect(tabsMock._tabs.has(1800)).toBe(true);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 330

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 331

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 332

- **Código:** `        backgroundModule.finalizeJob(1800, 60, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 333

- **Código:** `        await flushFakeTimerRounds(3);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 334

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 335

- **Código:** `        expect(backgroundModule.__getState().activeJobsCount).toBe(1);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 336

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 337

- **Código:** `        await jest.advanceTimersByTimeAsync(18_001);`
- **Função:** Avança o relógio Jest pelo intervalo contratual e libera callbacks temporais do ramo auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 338

- **Código:** `        await flushFakeTimerRounds(4);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 339

- **Código:** `        data = storageMock._getStore();`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 340

- **Código:** `        expect(data.deleting_urls).toEqual([]);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 341

- **Código:** `        expect(tabsMock._tabs.has(1800)).toBe(false);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 342

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 343

- **Código:** `        storageMock._setStore({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 344

- **Código:** `            ...storageMock._getStore(),`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 345

- **Código:** `            debugMode: false,`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 346

- **Código:** `            geminiExecutionMode: 'minimized_window',`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 347

- **Código:** `            deleting_urls: [],`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 348

- **Código:** `            gemini_job_1800: { geminiTabId: 1800, executionMode: 'minimized_window' },`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 349

- **Código:** `            wd_data_1800: { mangaTabId: 60, index: 4, geminiTabId: 1800 },`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 350

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 351

- **Código:** `        tabsMock._tabs.set(1800, { id: 1800, url: 'https://reader.test/not-gemini-1800', active: false, status: 'complete', title: '' });`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 352

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 353

- **Código:** `        await jest.advanceTimersByTimeAsync(10 * 60_000 + 1);`
- **Função:** Avança o relógio Jest pelo intervalo contratual e libera callbacks temporais do ramo auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 354

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 355

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 356

- **Código:** `        backgroundModule.finalizeJob(1800, 60, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 357

- **Código:** `        await flushFakeTimerRounds(4);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 358

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 359

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 360

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 361

- **Código:** `            completedJobs: 2,`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 362

- **Código:** `        }));`
- **Função:** Compõe o cenário **BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 363

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-27/BG-30/BG-31 — TTL de finalização e cleanup de deleting_urls/minimized_window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 364

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 365

- **Código:** `    test('BG-31b: fallback de janela minimizada fecha somente a aba do Gemini', async () => {`
- **Função:** Declara o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 366

- **Código:** `        const removeWindow = jest.fn((_windowId, callback) => callback?.());`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini** para controlar ou observar o fluxo real.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 367

- **Código:** `        global.chrome.windows = { remove: removeWindow };`
- **Função:** Monta a API `chrome` que será observada por `background.js` durante o carregamento deste caso.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 368

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 369

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 370

- **Código:** `            debugMode: false,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 371

- **Código:** `            geminiExecutionMode: 'minimized_window',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 372

- **Código:** `            gemini_job_1850: {`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 373

- **Código:** `                geminiTabId: 1850,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 374

- **Código:** `                executionMode: 'minimized_window',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 375

- **Código:** `                dedicatedWindow: false,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 376

- **Código:** `            },`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 377

- **Código:** `            wd_data_1850: { mangaTabId: 60, index: 5, geminiTabId: 1850 },`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 378

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 379

- **Código:** `        tabsMock._tabs.set(1850, {`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 380

- **Código:** `            id: 1850,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 381

- **Código:** `            windowId: 73,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 382

- **Código:** `            url: 'https://gemini.google.com/',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 383

- **Código:** `            active: false,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 384

- **Código:** `            status: 'complete',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 385

- **Código:** `            title: '',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 386

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 387

- **Código:** `        tabsMock._tabs.set(60, {`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 388

- **Código:** `            id: 60,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 389

- **Código:** `            windowId: 73,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 390

- **Código:** `            url: 'https://reader.test/chapter',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 391

- **Código:** `            active: true,`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 392

- **Código:** `            status: 'complete',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 393

- **Código:** `            title: 'Mangá',`
- **Função:** Compõe o cenário **BG-31b — fallback de minimized_window fecha somente a aba Gemini**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 394

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 395

- **Código:** `        const removeTab = jest.spyOn(tabsMock, 'remove');`
- **Função:** Instala spy sobre API/mock existente para medir chamadas sem substituir o restante do fluxo real.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 396

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 397

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 398

- **Código:** `        await backgroundModule.finalizeJob(1850, 60, true);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 399

- **Código:** `        await flush(6);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 400

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 401

- **Código:** `        expect(removeWindow).not.toHaveBeenCalled();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 402

- **Código:** `        expect(removeTab).toHaveBeenCalledWith(1850, expect.any(Function));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 403

- **Código:** `        expect(tabsMock._tabs.has(1850)).toBe(false);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 404

- **Código:** `        expect(tabsMock._tabs.has(60)).toBe(true);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 405

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31b — fallback de minimized_window fecha somente a aba Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 406

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 407

- **Código:** `    test('P0: marca durável impede dupla finalização após perda da proteção em memória', async () => {`
- **Função:** Declara o cenário **P0 — marcador durável impede dupla contabilidade após perda da proteção em memória**, com execução e assertions focais sobre a implementação real.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 408

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 409

- **Código:** `            debugMode: true,`
- **Função:** Compõe o cenário **P0 — marcador durável impede dupla contabilidade após perda da proteção em memória**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 410

- **Código:** `            gemini_job_2100: { geminiTabId: 2100, jobId: 'job-p0' },`
- **Função:** Compõe o cenário **P0 — marcador durável impede dupla contabilidade após perda da proteção em memória**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 411

- **Código:** `            wd_data_2100: { mangaTabId: 61, index: 5, geminiTabId: 2100, jobId: 'job-p0' },`
- **Função:** Compõe o cenário **P0 — marcador durável impede dupla contabilidade após perda da proteção em memória**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 412

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 413

- **Código:** `        tabsMock._tabs.set(2100, { id: 2100, url: 'https://gemini.google.com/app/job-p0', active: false, status: 'complete', title: '' });`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 414

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 415

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 416

- **Código:** `        backgroundModule.finalizeJob(2100, 61, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 417

- **Código:** `        await flush(8);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 418

- **Código:** `        expect((await storageMock.get(['gemini_finalized_2100'])).gemini_finalized_2100).toEqual(expect.objectContaining({ jobId: 'job-p0' }));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 419

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 420

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 1, _finalizedTabs: [] });`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 421

- **Código:** `        backgroundModule.finalizeJob(2100, 61, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 422

- **Código:** `        await flush(8);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 423

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 424

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({ activeJobsCount: 1, completedJobs: 1 }));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 425

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** P0 — marcador durável impede dupla contabilidade após perda da proteção em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 426

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 427

- **Código:** `    test('P0: restart entre a marca e a contabilidade reconcilia uma única vez', async () => {`
- **Função:** Declara o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**, com execução e assertions focais sobre a implementação real.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 428

- **Código:** `        // Simula a última escrita que sobreviveu ao descarte do worker: a marca`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 429

- **Código:** `        // existe, mas o snapshot ainda contém o job e os contadores antigos.`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 430

- **Código:** `        // Este é exatamente o intervalo entre marcar finalização e contabilizar.`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 431

- **Código:** `        const expiresAt = Date.now() + 60_000;`
- **Função:** Prepara dado/fixture intermediário do cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez** para controlar ou observar o fluxo real.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 432

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 433

- **Código:** `            mt_state: {`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 434

- **Código:** `                jobQueue: [], isProcessing: true, stopRequested: false,`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 435

- **Código:** `                activeMangaTabId: 62, currentBatchId: 'batch-restart', extractionTabs: {},`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 436

- **Código:** `                totalJobs: 1, completedJobs: 0, activeJobsCount: 1,`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 437

- **Código:** `                jobIndex: [{ geminiTabId: 2200, jobId: 'job-restart', mangaTabId: 62, index: 0, batchId: 'batch-restart' }],`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 438

- **Código:** `            },`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 439

- **Código:** `            gemini_job_2200: { geminiTabId: 2200, jobId: 'job-restart', mangaTabId: 62, index: 0 },`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 440

- **Código:** `            wd_data_2200: { geminiTabId: 2200, jobId: 'job-restart' },`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 441

- **Código:** `            gemini_finalized_2200: {`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 442

- **Código:** `                jobId: 'job-restart', fromError: false, finalizedAt: Date.now(),`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 443

- **Código:** `                expiresAt, accountingApplied: false,`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 444

- **Código:** `            },`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 445

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 446

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 447

- **Código:** `        // onStartup usa o mesmo caminho de reidratação usado por um worker`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 448

- **Código:** `        // recriado; a aba pode até continuar aberta, pois a marca prevalece.`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 449

- **Código:** `        tabsMock._tabs.set(2200, { id: 2200, url: 'https://gemini.google.com/app', active: false, status: 'complete', title: '' });`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 450

- **Código:** `        const startup = runtimeMock._startupListeners[0];`
- **Função:** Zera estado/listeners do runtime mock, removendo efeitos de casos anteriores antes de recarregar o background.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 451

- **Código:** `        await startup();`
- **Função:** Executa o listener `onStartup` real para simular reidratação/reconciliação após recriação do Service Worker.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 452

- **Código:** `        await flush(8);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 453

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 454

- **Código:** `        let stored = await storageMock.get(null);`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 455

- **Código:** `        expect(stored.mt_state).toEqual(expect.objectContaining({ completedJobs: 1, activeJobsCount: 0, jobIndex: [] }));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 456

- **Código:** `        expect(stored.gemini_finalized_2200).toEqual(expect.objectContaining({ accountingApplied: true }));`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 457

- **Código:** `        expect(stored.gemini_job_2200).toBeUndefined();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 458

- **Código:** `        expect(stored.wd_data_2200).toBeUndefined();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 459

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 460

- **Código:** `        // Uma nova reconciliação não reencontra o journal e não pode somar o`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 461

- **Código:** `        // mesmo job novamente.`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 462

- **Código:** `        await startup();`
- **Função:** Executa o listener `onStartup` real para simular reidratação/reconciliação após recriação do Service Worker.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 463

- **Código:** `        await flush(6);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 464

- **Código:** `        stored = await storageMock.get(['mt_state']);`
- **Função:** Compõe o cenário **P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 465

- **Código:** `        expect(stored.mt_state.completedJobs).toBe(1);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 466

- **Código:** `        expect(stored.mt_state.activeJobsCount).toBe(0);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 467

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** P0 — restart entre journal de finalização e contabilidade reconcilia exatamente uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 468

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 469

- **Código:** `    test('BG-76b: STOP_BATCH durante tabs.create não permite job tardio ressuscitar o lote', async () => {`
- **Função:** Declara o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 470

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 471

- **Código:** `            maxConcurrentJobs: 1,`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 472

- **Código:** `            geminiBaseUrl: 'https://example.com/mock',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 473

- **Código:** `            geminiExecutionMode: 'temp_chat',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 474

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 475

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 476

- **Código:** `        const originalCreate = tabsMock.create.bind(tabsMock);`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado** para controlar ou observar o fluxo real.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 477

- **Código:** `        let releaseCreate = null;`
- **Função:** Declara referência mutável que será reconstruída em cada `beforeEach`, evitando estado compartilhado entre testes.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 478

- **Código:** `        jest.spyOn(tabsMock, 'create').mockImplementation(options =>`
- **Função:** Instala spy sobre API/mock existente para medir chamadas sem substituir o restante do fluxo real.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 479

- **Código:** `            new Promise(resolve => {`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 480

- **Código:** `                releaseCreate = async () => resolve(await originalCreate(options));`
- **Função:** Controla a resolução tardia de `tabs.create`, permitindo inserir `STOP_BATCH` exatamente durante o lançamento.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 481

- **Código:** `            })`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 482

- **Código:** `        );`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 483

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 484

- **Código:** `        const start = await dispatchToBackground(runtimeMock, {`
- **Função:** Envia uma mensagem pelo listener runtime real do background, exercitando roteamento e ciclo integrado em vez de chamar apenas um helper isolado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 485

- **Código:** `            action: 'START_BATCH',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 486

- **Código:** `            batchId: 'batch-cancel-launch',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 487

- **Código:** `            mangaTabId: 55,`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 488

- **Código:** `            prompt: 'Traduzir',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 489

- **Código:** `            images: [{ index: 1 }],`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 490

- **Código:** `        }, { tab: { id: 55 } });`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 491

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 492

- **Código:** `        expect(start.response).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 493

- **Código:** `            ok: true,`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 494

- **Código:** `            batchId: 'batch-cancel-launch',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 495

- **Código:** `        }));`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 496

- **Código:** `        await waitFor(() => typeof releaseCreate === 'function');`
- **Função:** Espera uma condição observável do fluxo assíncrono, evitando assertion antes da conclusão do efeito sob teste.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 497

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 498

- **Código:** `        const stop = await dispatchToBackground(runtimeMock, {`
- **Função:** Envia uma mensagem pelo listener runtime real do background, exercitando roteamento e ciclo integrado em vez de chamar apenas um helper isolado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 499

- **Código:** `            action: 'STOP_BATCH',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 500

- **Código:** `            batchId: 'batch-cancel-launch',`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 501

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 502

- **Código:** `        expect(stop.response).toEqual({ ok: true });`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 503

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 504

- **Código:** `        await releaseCreate();`
- **Função:** Controla a resolução tardia de `tabs.create`, permitindo inserir `STOP_BATCH` exatamente durante o lançamento.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 505

- **Código:** `        await flush(12);`
- **Função:** Drena microtasks/callbacks pendentes para que os efeitos assíncronos anteriores fiquem observáveis antes das assertions.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 506

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 507

- **Código:** `        await waitFor(async () => {`
- **Função:** Espera uma condição observável do fluxo assíncrono, evitando assertion antes da conclusão do efeito sob teste.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 508

- **Código:** `            const state = backgroundModule.__getState();`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado** para controlar ou observar o fluxo real.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 509

- **Código:** `            const stored = await storageMock.get(null);`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado** para controlar ou observar o fluxo real.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 510

- **Código:** `            return state.activeJobsCount === 0 &&`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 511

- **Código:** `                state.jobIndex.length === 0 &&`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 512

- **Código:** `                tabsMock._tabs.size === 0 &&`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 513

- **Código:** `                !Object.keys(stored).some(key => key.startsWith('gemini_job_'));`
- **Função:** Deriva a observação usada para localizar jobs, journals ou mensagens relevantes sem alterar o estado do sistema sob teste.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 514

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 515

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 516

- **Código:** `        const stored = await storageMock.get(null);`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado** para controlar ou observar o fluxo real.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 517

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 518

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 519

- **Código:** `            isProcessing: false,`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 520

- **Código:** `            currentBatchId: null,`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 521

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 522

- **Código:** `            jobIndex: [],`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 523

- **Código:** `        }));`
- **Função:** Compõe o cenário **BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 524

- **Código:** `        expect(Object.keys(stored).filter(key => key.startsWith('wd_data_'))).toEqual([]);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 525

- **Código:** `        expect(Object.keys(stored).filter(key => key.startsWith('gemini_job_'))).toEqual([]);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 526

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-76b — STOP_BATCH durante tabs.create não ressuscita lote cancelado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 527

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 528

- **Código:** `    test('BG-77: aba do mangá fechada falha staging e erro subsequente encerra o job sem falso sucesso', async () => {`
- **Função:** Declara o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 529

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 530

- **Código:** `            debugMode: false,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 531

- **Código:** `            geminiExecutionMode: 'temp_chat',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 532

- **Código:** `            gemini_job_1900: {`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 533

- **Código:** `                geminiTabId: 1900,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 534

- **Código:** `                mangaTabId: 404,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 535

- **Código:** `                index: 7,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 536

- **Código:** `                jobId: 'job-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 537

- **Código:** `                batchId: 'batch-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 538

- **Código:** `                executionMode: 'temp_chat',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 539

- **Código:** `            },`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 540

- **Código:** `            wd_data_1900: {`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 541

- **Código:** `                mangaTabId: 404,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 542

- **Código:** `                index: 7,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 543

- **Código:** `                geminiTabId: 1900,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 544

- **Código:** `                jobId: 'job-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 545

- **Código:** `            },`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 546

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 547

- **Código:** `        tabsMock._tabs.set(1900, {`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 548

- **Código:** `            id: 1900,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 549

- **Código:** `            url: 'https://gemini.google.com/app/job-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 550

- **Código:** `            active: false,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 551

- **Código:** `            status: 'complete',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 552

- **Código:** `            title: '',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 553

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 554

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 555

- **Código:** `        jest.useFakeTimers();`
- **Função:** Troca para timers falsos neste cenário para provar TTL/cleanup sem aguardar minutos reais.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 556

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 557

- **Código:** `            jobQueue: [],`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 558

- **Código:** `            jobIndex: [{`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 559

- **Código:** `                geminiTabId: 1900,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 560

- **Código:** `                mangaTabId: 404,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 561

- **Código:** `                index: 7,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 562

- **Código:** `                jobId: 'job-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 563

- **Código:** `                batchId: 'batch-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 564

- **Código:** `            }],`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 565

- **Código:** `            currentBatchId: 'batch-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 566

- **Código:** `            isProcessing: true,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 567

- **Código:** `            stopRequested: false,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 568

- **Código:** `            activeMangaTabId: 404,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 569

- **Código:** `            activeJobsCount: 1,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 570

- **Código:** `            totalJobs: 1,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 571

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 572

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 573

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 574

- **Código:** `        const resultPromise = dispatchToBackground(runtimeMock, {`
- **Função:** Envia uma mensagem pelo listener runtime real do background, exercitando roteamento e ciclo integrado em vez de chamar apenas um helper isolado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 575

- **Código:** `            action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 576

- **Código:** `            mangaTabId: 404,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 577

- **Código:** `            index: 7,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 578

- **Código:** `            src: 'data:image/png;base64,TRANSLATED',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 579

- **Código:** `            jobId: 'job-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 580

- **Código:** `            batchId: 'batch-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 581

- **Código:** `        }, { tab: { id: 1900 } });`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 582

- **Código:** `        // A ação passa por reidratação/storage antes de chrome.tabs.sendMessage;`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 583

- **Código:** `        // avance em rodadas para também executar o callback de erro agendado no mock.`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 584

- **Código:** `        await flushFakeTimerRounds(24);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 585

- **Código:** `        const result = await resultPromise;`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso** para controlar ou observar o fluxo real.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 586

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 587

- **Código:** `        expect(result.response.ok).toBe(false);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 588

- **Código:** `        expect(result.response.staged).toBeUndefined();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 589

- **Código:** `        expect(backgroundModule.__getState().activeJobsCount).toBe(1);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 590

- **Código:** `        expect(storageMock._getStore().gemini_job_1900).toBeDefined();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 591

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 592

- **Código:** `        // O job runner transforma a falha de staging em GEMINI_ERROR. Mesmo`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 593

- **Código:** `        // sem a aba do mangá, report-error finaliza o job real e libera o slot.`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 594

- **Código:** `        const errorPromise = dispatchToBackground(runtimeMock, {`
- **Função:** Envia uma mensagem pelo listener runtime real do background, exercitando roteamento e ciclo integrado em vez de chamar apenas um helper isolado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 595

- **Código:** `            action: 'GEMINI_ERROR',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 596

- **Código:** `            mangaTabId: 404,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 597

- **Código:** `            index: 7,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 598

- **Código:** `            error: 'RESULT_STAGE_FAILED',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 599

- **Código:** `            jobId: 'job-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 600

- **Código:** `            batchId: 'batch-1900',`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 601

- **Código:** `        }, { tab: { id: 1900 } });`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 602

- **Código:** `        // report-error também agenda o callback de chrome.tabs.sendMessage no`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 603

- **Código:** `        // mock; avance em rodadas após os awaits internos para não depender da`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 604

- **Código:** `        // ordem de microtasks do Node 20/22.`
- **Função:** Comentário de intenção/regressão que documenta a razão do passo seguinte e o risco que o teste pretende congelar.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — comentário não é prova por si; descreve o cenário cuja implementação/assertions são executadas.

### Linha 605

- **Código:** `        await flushFakeTimerRounds(24);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 606

- **Código:** `        const errorResult = await errorPromise;`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso** para controlar ou observar o fluxo real.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 607

- **Código:** `        expect(errorResult.response).toEqual({ ok: true });`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 608

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 609

- **Código:** `        await jest.advanceTimersByTimeAsync(601);`
- **Função:** Avança o relógio Jest pelo intervalo contratual e libera callbacks temporais do ramo auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 610

- **Código:** `        await flushFakeTimerRounds(6);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 611

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 612

- **Código:** `        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 613

- **Código:** `            activeJobsCount: 0,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 614

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 615

- **Código:** `        }));`
- **Função:** Compõe o cenário **BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 616

- **Código:** `        expect(storageMock._getStore().gemini_job_1900).toBeUndefined();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 617

- **Código:** `        expect(tabsMock._tabs.has(1900)).toBe(false);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 618

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-77 — falha de staging por manga tab fechada termina em erro sem falso sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 619

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 620

- **Código:** `    test('BG-31c: background_delete só inicia exclusão depois que o job chega à finalização pós-persistência', async () => {`
- **Função:** Declara o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**, com execução e assertions focais sobre a implementação real.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 621

- **Código:** `        await storageMock.set({`
- **Função:** Configura storage durável simulado com modo, journal, job ou estado necessário ao ramo que será exercitado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 622

- **Código:** `            debugMode: false,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 623

- **Código:** `            geminiExecutionMode: 'background_delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 624

- **Código:** `            deleting_urls: [],`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 625

- **Código:** `            gemini_job_1900: {`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 626

- **Código:** `                geminiTabId: 1900,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 627

- **Código:** `                jobId: 'job-bg-delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 628

- **Código:** `                batchId: 'batch-bg-delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 629

- **Código:** `                mangaTabId: 60,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 630

- **Código:** `                executionMode: 'background_delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 631

- **Código:** `                state: 'result_committed',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 632

- **Código:** `                resultPersisted: true,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 633

- **Código:** `            },`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 634

- **Código:** `            wd_data_1900: {`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 635

- **Código:** `                mangaTabId: 60,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 636

- **Código:** `                index: 6,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 637

- **Código:** `                geminiTabId: 1900,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 638

- **Código:** `                jobId: 'job-bg-delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 639

- **Código:** `            },`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 640

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 641

- **Código:** `        tabsMock._tabs.set(1900, {`
- **Função:** Materializa uma aba específica no mock para que consultas/remoções do background reflitam um recurso existente.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 642

- **Código:** `            id: 1900,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 643

- **Código:** `            url: 'https://gemini.google.com/app/job-1900',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 644

- **Código:** `            active: false,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 645

- **Código:** `            status: 'complete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 646

- **Código:** `            title: '',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 647

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 648

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 649

- **Código:** `        const received = [];`
- **Função:** Prepara dado/fixture intermediário do cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização** para controlar ou observar o fluxo real.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 650

- **Código:** `        tabsMock._registerMessageHandler(1900, (message, _sender, sendResponse) => {`
- **Função:** Registra handler da aba simulada para capturar mensagens produzidas pelo background e responder ao callback como o content script faria.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 651

- **Código:** `            received.push(message);`
- **Função:** Armazena a mensagem enviada ao Gemini para provar a ordem/ação de exclusão pós-persistência.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 652

- **Código:** `            sendResponse({ ok: true });`
- **Função:** Responde ao emissor simulado, permitindo que o fluxo assíncrono do background prossiga.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 653

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 654

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 655

- **Código:** `        jest.useFakeTimers();`
- **Função:** Troca para timers falsos neste cenário para provar TTL/cleanup sem aguardar minutos reais.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 656

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta snapshot de estado interno controlado para posicionar `processNextJob`/`finalizeJob` exatamente no ramo sob teste.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 657

- **Código:** `            activeJobsCount: 1,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 658

- **Código:** `            completedJobs: 0,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 659

- **Código:** `            currentBatchId: 'batch-bg-delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 660

- **Código:** `            totalJobs: 1,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 661

- **Código:** `            jobIndex: [{`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 662

- **Código:** `                geminiTabId: 1900,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 663

- **Código:** `                jobId: 'job-bg-delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 664

- **Código:** `                batchId: 'batch-bg-delete',`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 665

- **Código:** `                mangaTabId: 60,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 666

- **Código:** `                index: 6,`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 667

- **Código:** `            }],`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 668

- **Código:** `        });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 669

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 670

- **Código:** `        const finalizePromise = backgroundModule.finalizeJob(1900, 60, false);`
- **Função:** Invoca a fachada real de finalização, incluindo journal durável, contabilidade, watchdog e fechamento/exclusão conforme o modo.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — aciona a implementação real; as assertions subsequentes verificam seus efeitos.

### Linha 671

- **Código:** `        await flushFakeTimerRounds(12);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 672

- **Código:** `        await finalizePromise;`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 673

- **Código:** `        await flushFakeTimerRounds(6);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 674

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 675

- **Código:** `        expect(received).toContainEqual({ action: 'DELETE_CONVERSATION' });`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 676

- **Código:** `        expect(tabsMock._tabs.has(1900)).toBe(true);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 677

- **Código:** `        expect(storageMock._getStore().deleting_urls)`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 678

- **Código:** `            .toContain('https://gemini.google.com/app/job-1900');`
- **Função:** Compõe o cenário **BG-31c — background_delete só inicia exclusão após persistência/finalização**; esta linha participa da preparação, execução ou observação do ramo real auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 679

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 680

- **Código:** `        await jest.advanceTimersByTimeAsync(18_001);`
- **Função:** Avança o relógio Jest pelo intervalo contratual e libera callbacks temporais do ramo auditado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 681

- **Código:** `        await flushFakeTimerRounds(4);`
- **Função:** Define/usa o helper que avança timers falsos em pequenas rodadas, permitindo que microtasks e callbacks Chrome intercalados progridam deterministicamente.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 682

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 683

- **Código:** `        expect(tabsMock._tabs.has(1900)).toBe(false);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 684

- **Código:** `        expect(storageMock._getStore().deleting_urls).toEqual([]);`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada do contrato declarado pelo cenário.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado observável não ocorrer.

### Linha 685

- **Código:** `    });`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** BG-31c — background_delete só inicia exclusão após persistência/finalização.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 686

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos para tornar o cenário e seu teardown legíveis; não altera o comportamento executado.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Linha 687

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 688

- **Código:** `    test('BG-31d: finalização de janela minimizada fecha a janela dedicada inteira', async () => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 689

- **Código:** `        const removeWindow = jest.fn((_windowId, callback) => callback?.());`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 690

- **Código:** `        global.chrome.windows = { remove: removeWindow };`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 691

- **Código:** `        const removeTab = jest.spyOn(tabsMock, 'remove');`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 692

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 693

- **Código:** `        await storageMock.set({`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 694

- **Código:** `            debugMode: false,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 695

- **Código:** `            geminiExecutionMode: 'minimized_window',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 696

- **Código:** `            gemini_job_1851: {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 697

- **Código:** `                geminiTabId: 1851,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 698

- **Código:** `                executionMode: 'minimized_window',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 699

- **Código:** `                dedicatedWindow: true,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 700

- **Código:** `            },`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 701

- **Código:** `            wd_data_1851: { mangaTabId: 60, index: 5, geminiTabId: 1851 },`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 702

- **Código:** `        });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 703

- **Código:** `        tabsMock._tabs.set(1851, {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 704

- **Código:** `            id: 1851,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 705

- **Código:** `            windowId: 74,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 706

- **Código:** `            url: 'https://gemini.google.com/',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 707

- **Código:** `            active: false,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 708

- **Código:** `            status: 'complete',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 709

- **Código:** `            title: '',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 710

- **Código:** `        });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 711

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 712

- **Código:** `        backgroundModule.__setState({ activeJobsCount: 1, completedJobs: 0 });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 713

- **Código:** `        await backgroundModule.finalizeJob(1851, 60, true);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 714

- **Código:** `        await flush(8);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 715

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 716

- **Código:** `        expect(removeWindow).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 717

- **Código:** `        expect(removeWindow).toHaveBeenCalledWith(74, expect.any(Function));`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 718

- **Código:** `        expect(removeTab).not.toHaveBeenCalled();`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 719

- **Código:** `    });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-31d — fechamento de janela Gemini dedicada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 720

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 721

- **Código:** `    test('BG-16b: reidratação do índice impede BATCH_COMPLETE com contador transitório zerado', async () => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 722

- **Código:** `        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-guard', active: true });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 723

- **Código:** `        const forwardedMessages = [];`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 724

- **Código:** `        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 725

- **Código:** `            forwardedMessages.push(message);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 726

- **Código:** `            sendResponse({ ok: true });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 727

- **Código:** `        });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 728

- **Código:** `        backgroundModule.__setState({`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 729

- **Código:** `            jobQueue: [],`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 730

- **Código:** `            isProcessing: true,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 731

- **Código:** `            stopRequested: false,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 732

- **Código:** `            activeMangaTabId: mangaTab.id,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 733

- **Código:** `            currentBatchId: 'batch-still-indexed',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 734

- **Código:** `            completionClaimedBatchId: null,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 735

- **Código:** `            extractionTabs: {},`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 736

- **Código:** `            totalJobs: 1,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 737

- **Código:** `            completedJobs: 0,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 738

- **Código:** `            activeJobsCount: 0,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 739

- **Código:** `            jobIndex: [{ geminiTabId: 1950, batchId: 'batch-still-indexed', jobId: 'job-still-open' }],`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 740

- **Código:** `        });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 741

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 742

- **Código:** `        await backgroundModule.processNextJob();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 743

- **Código:** `        await flush(6);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 744

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 745

- **Código:** `        expect(backgroundModule.__getState().activeJobsCount).toBe(1);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 746

- **Código:** `        expect((await storageMock.get('mt_state')).mt_state.activeJobsCount).toBe(1);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 747

- **Código:** `        expect(forwardedMessages).not.toContainEqual(expect.objectContaining({ action: 'BATCH_COMPLETE' }));`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 748

- **Código:** `        expect(backgroundModule.__getState().jobIndex).toHaveLength(1);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 749

- **Código:** `    });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-16b — guarda de job indexado durante reidratação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 750

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 751

- **Código:** `    test.each(['after_job_persist', 'after_tab_identity', 'after_watchdog_arm'])(`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 752

- **Código:** `        'BG-76c: substituição do lote limpa lançamento cancelado em %s sem tocar na contabilidade do novo lote',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 753

- **Código:** `        async phase => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 754

- **Código:** `            await storageMock.set({`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 755

- **Código:** `                geminiBaseUrl: 'https://example.com/mock',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 756

- **Código:** `                geminiExecutionMode: 'temp_chat',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 757

- **Código:** `            });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 758

- **Código:** `            const gateEntered = (() => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 759

- **Código:** `                let resolve;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 760

- **Código:** `                const promise = new Promise(done => { resolve = done; });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 761

- **Código:** `                return { promise, resolve };`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 762

- **Código:** `            })();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 763

- **Código:** `            const gateReleased = (() => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 764

- **Código:** `                let resolve;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 765

- **Código:** `                const promise = new Promise(done => { resolve = done; });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 766

- **Código:** `                return { promise, resolve };`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 767

- **Código:** `            })();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 768

- **Código:** `            const originalSet = storageMock.set.bind(storageMock);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 769

- **Código:** `            const originalGet = storageMock.get.bind(storageMock);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 770

- **Código:** `            let gated = false;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 771

- **Código:** `            let indexedAliasReads = 0;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 772

- **Código:** `            const shouldGate = (keys, value) => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 773

- **Código:** `                if (gated) return false;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 774

- **Código:** `                if (phase === 'after_job_persist') {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 775

- **Código:** `                    return Boolean(value?.mt_state?.jobIndex?.some(entry => entry.batchId === 'batch-A'));`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 776

- **Código:** `                }`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 777

- **Código:** `                const requested = Array.isArray(keys) ? keys : [keys];`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 778

- **Código:** `                const isAliasRead = requested.some(key =>`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 779

- **Código:** `                    typeof key === 'string' && key.startsWith('gemini_tab_alias_'));`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 780

- **Código:** `                const isIndexedLaunch = backgroundModule.__getState().jobIndex`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 781

- **Código:** `                    .some(entry => entry.batchId === 'batch-A');`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 782

- **Código:** `                if (!isAliasRead || !isIndexedLaunch) return false;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 783

- **Código:** `                indexedAliasReads += 1;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 784

- **Código:** `                // Após indexação, a primeira leitura pertence ao recheck de`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 785

- **Código:** `                // identidade; a quarta é a confirmação final de armWatchdog,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 786

- **Código:** `                // depois de o alarme e o payload durável já existirem.`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 787

- **Código:** `                return phase === 'after_tab_identity'`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 788

- **Código:** `                    ? indexedAliasReads === 1`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 789

- **Código:** `                    : indexedAliasReads === 4;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 790

- **Código:** `            };`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 791

- **Código:** `            storageMock.set = async (value, callback) => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 792

- **Código:** `                const result = await originalSet(value, callback);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 793

- **Código:** `                if (shouldGate(null, value)) {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 794

- **Código:** `                    gated = true;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 795

- **Código:** `                    gateEntered.resolve();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 796

- **Código:** `                    await gateReleased.promise;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 797

- **Código:** `                }`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 798

- **Código:** `                return result;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 799

- **Código:** `            };`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 800

- **Código:** `            storageMock.get = async (keys, callback) => {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 801

- **Código:** `                if (shouldGate(keys, null)) {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 802

- **Código:** `                    gated = true;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 803

- **Código:** `                    gateEntered.resolve();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 804

- **Código:** `                    await gateReleased.promise;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 805

- **Código:** `                }`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 806

- **Código:** `                return originalGet(keys, callback);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 807

- **Código:** `            };`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 808

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 809

- **Código:** `            backgroundModule.__setState({`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 810

- **Código:** `                jobQueue: [{ mangaTabId: 55, index: 1, prompt: 'A', batchId: 'batch-A' }],`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 811

- **Código:** `                isProcessing: true,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 812

- **Código:** `                stopRequested: false,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 813

- **Código:** `                activeMangaTabId: 55,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 814

- **Código:** `                currentBatchId: 'batch-A',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 815

- **Código:** `                completionClaimedBatchId: null,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 816

- **Código:** `                pendingBatches: [],`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 817

- **Código:** `                jobIndex: [],`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 818

- **Código:** `                activeJobsCount: 0,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 819

- **Código:** `                completedJobs: 0,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 820

- **Código:** `                totalJobs: 1,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 821

- **Código:** `                _cachedMaxCon: 1,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 822

- **Código:** `            });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 823

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 824

- **Código:** `            const launch = backgroundModule.processNextJob();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 825

- **Código:** `            try {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 826

- **Código:** `                await waitFor(() => gated || null);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 827

- **Código:** `                await gateEntered.promise;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 828

- **Código:** `                expect(backgroundModule.__getState().jobIndex.some(entry => entry.batchId === 'batch-A')).toBe(true);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 829

- **Código:** `                if (phase === 'after_watchdog_arm') {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 830

- **Código:** `                    expect((await alarmsMock.getAll()).some(alarm => alarm.name.startsWith('watchdog_'))).toBe(true);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 831

- **Código:** `                    expect(Object.keys(await storageMock.get(null)).some(key => key.startsWith('wd_data_'))).toBe(true);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 832

- **Código:** `                }`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 833

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 834

- **Código:** `                // Simula a promoção concorrente de B enquanto o lançamento de A`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 835

- **Código:** `                // está parado exatamente antes do checkpoint selecionado.`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 836

- **Código:** `                backgroundModule.__setState({`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 837

- **Código:** `                    currentBatchId: 'batch-B',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 838

- **Código:** `                    activeMangaTabId: 56,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 839

- **Código:** `                    activeJobsCount: 1,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 840

- **Código:** `                    totalJobs: 3,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 841

- **Código:** `                    completedJobs: 2,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 842

- **Código:** `                });`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 843

- **Código:** `                gateReleased.resolve();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 844

- **Código:** `                await launch;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 845

- **Código:** `                await flush(10);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 846

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não altera o comportamento executado.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 847

- **Código:** `                const state = backgroundModule.__getState();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 848

- **Código:** `                const stored = await storageMock.get(null);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 849

- **Código:** `                const launchedTabIds = Array.from(tabsMock._tabs.keys()).filter(id => id >= 1000);`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 850

- **Código:** `                expect(state).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 851

- **Código:** `                    currentBatchId: 'batch-B',`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 852

- **Código:** `                    activeMangaTabId: 56,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 853

- **Código:** `                    activeJobsCount: 1,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 854

- **Código:** `                    totalJobs: 3,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 855

- **Código:** `                    completedJobs: 2,`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 856

- **Código:** `                    jobIndex: [],`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 857

- **Código:** `                }));`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 858

- **Código:** `                expect(Object.keys(stored).filter(key => key.startsWith('gemini_job_'))).toEqual([]);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 859

- **Código:** `                expect(Object.keys(stored).filter(key => key.startsWith('wd_data_'))).toEqual([]);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 860

- **Código:** `                expect(await alarmsMock.getAll()).toEqual([]);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 861

- **Código:** `                expect(launchedTabIds.every(id => !tabsMock._tabs.has(id))).toBe(true);`
- **Função:** Assertion focal que falha quando o efeito observável do contrato não ocorre.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion do próprio caso falha se este resultado não ocorrer.

### Linha 862

- **Código:** `            } finally {`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 863

- **Código:** `                gateReleased.resolve();`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 864

- **Código:** `                storageMock.set = originalSet;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 865

- **Código:** `                storageMock.get = originalGet;`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 866

- **Código:** `            }`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 867

- **Código:** `        }`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 868

- **Código:** `    );`
- **Função:** Prepara, sincroniza ou verifica a barreira assíncrona do cenário de regressão.
- **Contexto:** BG-76c — substituição adversarial A→B em checkpoint de lançamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — integra o cenário real; sem assertion isolada exclusiva para esta linha.

### Linha 869

- **Código:** `});`
- **Função:** Fecha o bloco sintático iniciado anteriormente; mantém a estrutura do cenário/harness sem introduzir comportamento autônomo.
- **Contexto:** estrutura da suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde da implementação real, sem assertion isolada exclusiva para esta linha.

### Posição 870 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo de forma POSIX e preserva a representação textual canônica usada no blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — o conteúdo lido termina com `\n`; esta posição não é uma instrução JavaScript adicional.

## 12. Conclusão documental

A fonte integral foi preservada, todas as **869 linhas textuais** e a posição **870** do newline final estão documentadas. As alegações de comportamento distinguem assertions diretas, execução indireta e branches sem prova focal.

O CI histórico cobriu o blob anterior em Node 20 e Node 22. Nesta revisão, 16 testes do arquivo e a suíte relacionada inteira passaram; os três pedidos corretivos receberam cobertura, mas o SHA atualizado ainda aguarda PRIMARY e ADVERSARIAL independentes.

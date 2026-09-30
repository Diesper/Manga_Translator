# Bíblia técnica — tests/unit/background/lifecycle-alarms-real.test.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE RESPONSÁVEL  
> **SHA auditado:** 1d4c22ba9a78ef994906c4dd16617ddb6079942b  
> **Agente responsável:** AGENTE 19  
> **Índice do corpus:** 154  
> **Tipo:** suíte Jest focal do lifecycle/alarms do background real instrumentado  
> **Linhas textuais:** 409  
> **Posições documentais:** 410, contando newline final  
> **Background exercitado:** extension/background.js — SHA 667c05eb2d7adfca16a79d3e706c39a1e9398b72  
> **Watchdog exercitado:** extension/background/jobs-watchdog.js — SHA c17b766d7fbc34ea925fb82b19149d3d977de413  
> **Mock Chrome:** tests/mocks/chrome-api.mock.js — SHA c1d9a056b7777183bfd3f540c49811335f410425  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte testa lifecycle e alarm routing carregando extension/background.js real, não uma cópia das funções. O loader lê o fonte do background, acrescenta exclusivamente getters/setters/exports de inspeção e executa o resultado com chrome/fetch/FileReader controlados. Assim, listeners onInstalled, onStartup, onConnect e alarms.onAlarm pertencem à implementação real.

O foco é recuperação após restart de service worker, promoção FIFO de batches persistidos, porta keep-alive, disparo do scheduler por nextJobAlarm e timeout watchdog com cleanup de extraction tabs.

É uma suíte de infraestrutura: o ambiente Chrome é simulado, mas o scheduler/lifecycle/background carregado é real.

## 2. Harness e isolamento

### loadBackgroundModule

tests/helpers/load-background-module.js lê extension/background.js e adiciona hooks __getState/__setState, além de exports de funções internas. A instrumentação não substitui o corpo das funções de produção; ela abre observabilidade para o teste.

### trackBackgroundDelayTimers

O tracker intercepta somente delays longos conhecidos do background: 600 ms, 4 s e 18 s. Isso impede timers legítimos de finalize/anchor cleanup sobreviverem ao fim do worker Jest.

### beforeEach

Cada caso:

- reseta módulos;
- usa timers reais;
- ativa o tracker;
- limpa listeners/runtime/storage;
- instala chrome com storage/tabs/alarms/runtime/downloads;
- carrega background.js real;
- executa flush(8).

O flush também permite ao mock onInstalled executar o callback que ele autoagenda ao registrar o listener.

### afterEach

O teardown primeiro força stopRequested=true e esvazia filas via __setState, drena assíncrono, cancela timers longos, limpa alarmes/abas/storage e repete a limpeza para capturar callbacks tardios. Isso é importante porque onStartup dispara processNextJob sem aguardar seu resultado.

## 3. Particularidade do mock onInstalled

No Chrome real, onInstalled.addListener registra um listener e o evento ocorre apenas quando o navegador sinaliza instalação/atualização.

No mock atual, onInstalled.addListener:

- armazena o listener;
- agenda imediatamente fn({reason:'install'}) em setTimeout(0).

Portanto simplesmente carregar background.js dentro desta suíte já agenda um evento de instalação simulado. O teste BG-68 lê defaultPrompt depois do flush de setup e, por isso, prova a lógica do listener real dentro desse harness, mas também depende dessa semântica especial do mock.

O runtime mock possui _simulateInstall, porém esta suíte não o chama.

## 4. Inventário dos oito casos

| Caso | Linhas | Contrato provado |
|---|---:|---|
| BG-68/BG-69 | 84–118 | onInstalled popula defaultPrompt; startup vazio zera extractionTabs stale, sincroniza estado e não cria aba |
| BG-69b | 120–152 | completionClaimedBatchId persistido impede ressuscitar lote concluído |
| REG-13/BG-70/BG-71 | 154–204 | restart recupera fila, zera extractionTabs, relança um job, arma watchdog e preserva restante |
| BG-69c | 206–256 | A concluído + B/C pendentes promove B, deixa C e limpa completion claim |
| BG-71b | 258–309 | sem lote ativo, pending B/C/D promove B primeiro e mantém C/D em ordem |
| BG-72 | 311–317 | somente porta gemini-keep-alive recebe listener onDisconnect |
| BG-73 | 319–344 | nextJobAlarm dispara scheduler, cria aba, jobIndex e watchdog |
| BG-74/75/76 | 346–408 | watchdog com wd_data envia erro, finaliza contabilidade e fecha extraction tab; sem dados não remove nem envia |

## 5. Provas diretas por cenário

### BG-68/BG-69

Assertions provam:

- defaultPrompt contém “Objetivo primário” após o onInstalled autoexecutado pelo mock;
- startup de snapshot vazio mantém queue/process flags/counters coerentes;
- extractionTabs stale vira {};
- tabs.create não é chamado.

O teste não cobre o branch em que defaultPrompt já existe e deve ser preservado.

### BG-69b

Com currentBatchId e completionClaimedBatchId iguais a batch-done:

- o snapshot continua representando lote concluído;
- activeJobsCount permanece zero;
- jobQueue/pendingBatches permanecem vazios;
- nenhuma aba é criada.

Isso bloqueia regressão de “ressuscitar” lote já concluído após restart.

### REG-13/BG-70/BG-71

O waitFor é um gate real: se jobIndex, watchdog e tab launch não aparecerem em até o timeout do helper, o teste falha.

Depois, assertions provam:

- isProcessing=true;
- activeMangaTabId=42;
- extractionTabs stale limpo;
- totalJobs=2/completedJobs=0/activeJobsCount=1;
- somente o segundo job permanece em jobQueue;
- log STARTUP_RECOVERY existe;
- há exatamente uma aba.

### BG-69c

Prova que um snapshot com A completionClaimed e B/C pendentes promove B:

- currentBatchId=batch-b;
- completionClaimedBatchId=null;
- pending fica [batch-c];
- active manga tab 21;
- activeJobsCount=1;
- BATCH_PROMOTED referencia batch-b.

### BG-71b

Prova FIFO quando não existe lote ativo:

- B é promovido;
- pending fica [C,D] na mesma ordem;
- activeMangaTabId=21;
- totalJobs=1;
- activeJobsCount=1;
- log BATCH_PROMOTED contém batch-b.

### BG-72

runtimeMock.connect aciona listeners onConnect reais do background. Assertions provam:

- gemini-keep-alive recebe exatamente um disconnect listener;
- generic-port não recebe nenhum.

### BG-73

O teste injeta um job, cria/dispara nextJobAlarm e usa waitFor para exigir simultaneamente:

- uma aba criada;
- jobIndex de tamanho 1;
- watchdog armado.

A assertion final repete a existência de uma aba. O nome processNextJob é inferido da implementação real, mas os efeitos do scheduler são gates diretos.

### BG-74/BG-75/BG-76

Com wd_data_3003:

- SHOW_ERROR_INTEGRATED chega à manga tab com imgIndex 6 e isDebug=false;
- tabs.remove é chamado para a extraction tab;
- a aba deixa o mapa;
- activeJobsCount cai para zero;
- translatorLog contém JOB_TIMEOUT.

Depois, watchdog_9999 sem wd_data observável não remove abas nem envia mensagem.

## 6. Evidência real da execução desta suíte

O mesmo blob SHA 1d4c22ba9a78ef994906c4dd16617ddb6079942b estava no commit b6ad13fce47adcab3fcd10281f28848f7b4ce50f.

Na MangaTranslator CI #36577447500:

- job 109437162616 — Unit + Integration Node 20.x — PASS background tests/unit/background/lifecycle-alarms-real.test.js;
- job 109437162754 — Unit + Integration Node 22.x — PASS da mesma suíte;
- job 109437162789 — Windows Portability — PASS da mesma suíte.

Os jobs Linux registraram 109 suites / 851 testes aprovados. O job Windows também registrou a suíte como PASS.

Assim, as assertions e gates waitFor desta suíte são evidência direta sobre o comportamento que observam, enquanto linhas de setup sem assertion correspondente permanecem execução indireta.

## 7. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| defaultPrompt é criado quando ausente no harness de instalação | assertion contains após onInstalled autoagendado | ✅ PROVADO DIRETAMENTE |
| startup vazio limpa extractionTabs stale e não abre aba | snapshot + createSpy not called | ✅ PROVADO DIRETAMENTE |
| lote completionClaimed não ressuscita | snapshot + zero create | ✅ PROVADO DIRETAMENTE |
| startup recupera fila e relança só um job com max=1 | waitFor + snapshot + queue | ✅ PROVADO DIRETAMENTE |
| startup registra STARTUP_RECOVERY | arrayContaining | ✅ PROVADO DIRETAMENTE |
| A concluído promove B e deixa C | assertions de ids/fila/log | ✅ PROVADO DIRETAMENTE |
| B/C/D promovem B em FIFO e preservam C/D | assertions de fila/estado/log | ✅ PROVADO DIRETAMENTE |
| keep-alive recebe disconnect listener e porta genérica não | toHaveLength | ✅ PROVADO DIRETAMENTE |
| nextJobAlarm causa launch, jobIndex e watchdog | waitFor falha se qualquer condição faltar | ✅ PROVADO DIRETAMENTE |
| watchdog com wd_data envia erro e limpa extraction tab | mensagem/remove/mapa/active count/log | ✅ PROVADO DIRETAMENTE |
| watchdog sem dados não remove nem encaminha | not called + [] | ✅ PROVADO DIRETAMENTE para essas duas saídas |
| onInstalled preserva defaultPrompt existente | nenhum caso localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback watchdog por jobIndex sem wd_data | nenhum caso focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| semântica real de registro onInstalled sem disparo automático | mock diverge do Chrome e não há modo usado aqui que separe registro/evento | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Solicitações ao auditor

### 154-001 — HARNESS_SEMANTICS_REVIEW — OPEN

**Encontrado:** tests/mocks/chrome-api.mock.js dispara automaticamente o callback onInstalled via timer assim que addListener é chamado. No Chrome, registrar listener não equivale a receber o evento de instalação.

**Arquivo externo relacionado:** tests/mocks/chrome-api.mock.js.

**Arquivo auditado:** tests/unit/background/lifecycle-alarms-real.test.js.

**Evidência atual:** BG-68 depende do flush do beforeEach para observar defaultPrompt criado pelo listener real; existe também runtimeMock._simulateInstall, mas esta suíte não o usa.

**Evidência ausente:** separação explícita entre “background carregou/registrou listener” e “evento onInstalled foi disparado”.

**Por que é relevante:** o auto-fire pode esconder dependências de timing e fazer qualquer teste que apenas carregue o background sofrer efeitos de instalação que não ocorreriam em um startup normal do navegador.

**Ação esperada:** revisar se o auto-fire é intencional. Se não for, migrar para disparo explícito sem quebrar outras suítes; se for, documentar formalmente a semântica especial.

**Possível regressão:** testes podem passar por estado inicial criado artificialmente pelo evento de instalação, mascarando diferenças de lifecycle.

**Severidade:** NORMAL.

### 154-002 — TEST_REQUIRED — OPEN

**Encontrado:** o onInstalled real só grava DEFAULT_TRANSLATION_PROMPT quando defaultPrompt é falsy, mas os testes localizados cobrem apenas storage inicialmente vazio.

**Arquivo externo sugerido:** esta suíte ou teste focal equivalente de lifecycle.

**Evidência ausente:** prepopular defaultPrompt com valor existente, disparar onInstalled real e afirmar que o valor não foi sobrescrito.

**Ação esperada:** adicionar cenário separado em trabalho de auditoria autorizado.

**Evidência esperada:** assertion direta de preservação do prompt existente.

**Possível regressão:** atualização/instalação poderia sobrescrever configuração já persistida sem os testes atuais detectarem.

**Severidade:** NORMAL.

### 154-003 — TEST_REQUIRED — OPEN

**Encontrado:** jobs-watchdog.js possui fallback que reconstrói os dados do watchdog a partir de getJobIndex quando wd_data_* não existe. O subcenário watchdog_9999 desta suíte não possui wd_data nem jobIndex correspondente; jobs-watchdog-ordering.test.js também fornece wd_data.

**Arquivo externo sugerido:** teste focal de watchdog ou esta suíte.

**Evidência atual:** caminho com wd_data é diretamente coberto; caminho sem qualquer dado prova somente ausência de remove/mensagem.

**Evidência ausente:** jobIndex contém job correspondente, storage não contém wd_data, alarme dispara e timeout ainda usa o entry indexado.

**Ação esperada:** adicionar cenário que remova wd_data mas preserve jobIndex e afirme log/finalize/mensagem/cleanup esperados.

**Possível regressão:** recovery de watchdog após perda isolada da chave persistida pode parar de funcionar sem quebrar as suítes atuais.

**Severidade:** NORMAL.

As solicitações são externas ao escopo de escrita do AGENTE 19 e não bloqueiam a conclusão desta Bíblia.

## 9. Fonte integral auditada

~~~js
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
    flush,
    waitFor,
} = require('../../helpers/background-test-utils.js');

describe('background.js - lifecycle e alarms reais', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let alarmsMock;
    let downloadsMock;
    let backgroundModule;
    let cancelBackgroundDelayTimers;

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
        // onStartup dispara processNextJob() sem await. Primeiro bloqueie novos
        // launches e drene a cadeia assíncrona; só então cancele os timers que
        // finalizeJob() possa ter criado durante essa drenagem.
        if (backgroundModule?.__setState) {
            backgroundModule.__setState({
                stopRequested: true,
                jobQueue: [],
                pendingBatches: [],
            });
        }
        await flush(12);
        cancelBackgroundDelayTimers();

        await alarmsMock.clearAll();
        await flush(4);
        await alarmsMock.clearAll();
        tabsMock._tabs.clear();
        await storageMock.clear();

        // O tracker continua ativo após o primeiro cancelamento. Se qualquer
        // callback tardio tiver criado outro timer de 600 ms/4 s/18 s durante
        // a limpeza final, elimine-o antes de restaurar os mocks.
        cancelBackgroundDelayTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('BG-68/BG-69: onInstalled persiste defaultPrompt e onStartup com fila vazia só sincroniza estado', async () => {
        const createSpy = jest.spyOn(tabsMock, 'create');
        const initial = await storageMock.get(['defaultPrompt']);

        expect(initial.defaultPrompt).toContain('Objetivo primário');

        await storageMock.set({
            mt_state: {
                jobQueue: [],
                isProcessing: false,
                stopRequested: false,
                activeMangaTabId: null,
                extractionTabs: { 9999: { foo: 'bar' } },
                totalJobs: 0,
                completedJobs: 0,
                activeJobsCount: 0,
            },
        });

        await runtimeMock._simulateStartup();
        await flush(8);

        const state = await storageMock.get(['mt_state']);
        expect(state.mt_state).toEqual(expect.objectContaining({
            jobQueue: [],
            isProcessing: false,
            stopRequested: false,
            activeMangaTabId: null,
            extractionTabs: {},
            totalJobs: 0,
            completedJobs: 0,
            activeJobsCount: 0,
        }));
        expect(createSpy).not.toHaveBeenCalled();
    });

    test('BG-69b: onStartup não ressuscita lote cujo completionClaimedBatchId já foi persistido', async () => {
        const createSpy = jest.spyOn(tabsMock, 'create');
        await storageMock.set({
            mt_state: {
                jobQueue: [],
                isProcessing: false,
                stopRequested: false,
                activeMangaTabId: null,
                currentBatchId: 'batch-done',
                completionClaimedBatchId: 'batch-done',
                extractionTabs: {},
                totalJobs: 2,
                completedJobs: 2,
                activeJobsCount: 0,
                jobIndex: [],
                pendingBatches: [],
            },
        });

        await runtimeMock._simulateStartup();
        await flush(8);

        const data = await storageMock.get(['mt_state']);
        expect(data.mt_state).toEqual(expect.objectContaining({
            currentBatchId: 'batch-done',
            completionClaimedBatchId: 'batch-done',
            isProcessing: false,
            activeJobsCount: 0,
            jobQueue: [],
            pendingBatches: [],
        }));
        expect(createSpy).not.toHaveBeenCalled();
    });

    test('REG-13/BG-70/BG-71: onStartup recupera fila, zera extractionTabs e reinicia processamento sem ficar preso', async () => {
        await storageMock.set({
            geminiBaseUrl: 'http://127.0.0.1:3999/app',
            maxConcurrentJobs: 1,
            mt_state: {
                jobQueue: [
                    { mangaTabId: 42, index: 0, prompt: 'A' },
                    { mangaTabId: 42, index: 1, prompt: 'B' },
                ],
                isProcessing: true,
                stopRequested: false,
                activeMangaTabId: 42,
                extractionTabs: {
                    7001: { mangaTabId: 42, index: 0, geminiTabId: 9001 },
                },
                totalJobs: 2,
                completedJobs: 0,
                activeJobsCount: 2,
            },
        });

        await runtimeMock._simulateStartup();

        await waitFor(async () => {
            const data = await storageMock.get(['mt_state', 'translatorLog']);
            const alarms = await alarmsMock.getAll();
            const state = data.mt_state || {};
            const launchFinished = Array.isArray(state.jobIndex) &&
                state.jobIndex.length === 1 &&
                alarms.some(alarm => String(alarm.name || '').startsWith('watchdog_'));
            return (data.mt_state && Array.isArray(data.translatorLog) &&
                tabsMock._tabs.size === 1 && launchFinished) ? data : null;
        });

        const data = await storageMock.get(['mt_state', 'translatorLog']);
        expect(data.mt_state).toEqual(expect.objectContaining({
            isProcessing: true,
            activeMangaTabId: 42,
            extractionTabs: {},
            totalJobs: 2,
            completedJobs: 0,
            activeJobsCount: 1,
        }));
        expect(data.mt_state.jobQueue).toEqual([
            { mangaTabId: 42, index: 1, prompt: 'B' },
        ]);
        expect(data.translatorLog).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'STARTUP_RECOVERY' }),
        ]));
        expect(tabsMock._tabs.size).toBe(1);
    });

    test('BG-69c: startup promove B quando snapshot persistido contém A já concluído + B/C pendentes', async () => {
        await storageMock.set({
            geminiBaseUrl: 'http://127.0.0.1:3999/app',
            maxConcurrentJobs: 1,
            mt_state: {
                jobQueue: [],
                isProcessing: false,
                stopRequested: false,
                activeMangaTabId: null,
                currentBatchId: 'batch-a',
                completionClaimedBatchId: 'batch-a',
                extractionTabs: {},
                totalJobs: 1,
                completedJobs: 1,
                activeJobsCount: 0,
                jobIndex: [],
                pendingBatches: [
                    { batchId: 'batch-b', mangaTabId: 21, prompt: 'B', images: [{ index: 0 }] },
                    { batchId: 'batch-c', mangaTabId: 31, prompt: 'C', images: [{ index: 1 }] },
                ],
            },
        });

        await runtimeMock._simulateStartup();

        await waitFor(async () => {
            const data = await storageMock.get(['mt_state']);
            const alarms = await alarmsMock.getAll();
            const state = data.mt_state || {};
            const launchFinished = Array.isArray(state.jobIndex) &&
                state.jobIndex.length === 1 &&
                alarms.some(alarm => String(alarm.name || '').startsWith('watchdog_'));
            return state.currentBatchId === 'batch-b' &&
                tabsMock._tabs.size === 1 && launchFinished
                ? state
                : null;
        });

        const data = await storageMock.get(['mt_state', 'translatorLog']);
        expect(data.mt_state.currentBatchId).toBe('batch-b');
        expect(data.mt_state.completionClaimedBatchId).toBeNull();
        expect(data.mt_state.pendingBatches.map(batch => batch.batchId)).toEqual(['batch-c']);
        expect(data.mt_state.activeMangaTabId).toBe(21);
        expect(data.mt_state.activeJobsCount).toBe(1);
        expect(data.translatorLog).toEqual(expect.arrayContaining([
            expect.objectContaining({
                action: 'BATCH_PROMOTED',
                extra: expect.objectContaining({ batchId: 'batch-b' }),
            }),
        ]));
    });

    test('BG-71b: onStartup promove o primeiro de vários pendingBatches persistidos em FIFO', async () => {
        await storageMock.set({
            geminiBaseUrl: 'http://127.0.0.1:3999/app',
            maxConcurrentJobs: 1,
            mt_state: {
                jobQueue: [],
                isProcessing: false,
                stopRequested: false,
                activeMangaTabId: null,
                currentBatchId: null,
                extractionTabs: {},
                totalJobs: 0,
                completedJobs: 0,
                activeJobsCount: 0,
                jobIndex: [],
                pendingBatches: [
                    { batchId: 'batch-b', mangaTabId: 21, prompt: 'B', images: [{ index: 0 }] },
                    { batchId: 'batch-c', mangaTabId: 31, prompt: 'C', images: [{ index: 1 }] },
                    { batchId: 'batch-d', mangaTabId: 41, prompt: 'D', images: [{ index: 2 }] },
                ],
            },
        });

        await runtimeMock._simulateStartup();

        await waitFor(async () => {
            const data = await storageMock.get(['mt_state']);
            const alarms = await alarmsMock.getAll();
            const state = data.mt_state || {};
            const launchFinished = Array.isArray(state.jobIndex) &&
                state.jobIndex.length === 1 &&
                alarms.some(alarm => String(alarm.name || '').startsWith('watchdog_'));
            return state.currentBatchId === 'batch-b' &&
                tabsMock._tabs.size === 1 && launchFinished
                ? state
                : null;
        });

        const data = await storageMock.get(['mt_state', 'translatorLog']);
        expect(data.mt_state.currentBatchId).toBe('batch-b');
        expect(data.mt_state.pendingBatches.map(batch => batch.batchId))
            .toEqual(['batch-c', 'batch-d']);
        expect(data.mt_state.activeMangaTabId).toBe(21);
        expect(data.mt_state.totalJobs).toBe(1);
        expect(data.mt_state.activeJobsCount).toBe(1);
        expect(data.translatorLog).toEqual(expect.arrayContaining([
            expect.objectContaining({
                action: 'BATCH_PROMOTED',
                extra: expect.objectContaining({ batchId: 'batch-b' }),
            }),
        ]));
    });

    test('BG-72: onConnect registra listener de disconnect para porta keep-alive', async () => {
        const keepAlivePort = runtimeMock.connect({ name: 'gemini-keep-alive' });
        const genericPort = runtimeMock.connect({ name: 'generic-port' });

        expect(keepAlivePort._disconnectListeners).toHaveLength(1);
        expect(genericPort._disconnectListeners).toHaveLength(0);
    });

    test('BG-73: nextJobAlarm dispara processNextJob e abre a próxima aba Gemini', async () => {
        await storageMock.set({ geminiBaseUrl: 'http://127.0.0.1:3999/app' });
        backgroundModule.__setState({
            jobQueue: [{ mangaTabId: 91, index: 5, prompt: 'job' }],
            stopRequested: false,
            activeJobsCount: 0,
            totalJobs: 1,
            completedJobs: 0,
            _cachedMaxCon: 1,
        });

        alarmsMock.create('nextJobAlarm', { delayInMinutes: 1 });
        alarmsMock._fire('nextJobAlarm');

        await waitFor(async () => {
            const alarms = await alarmsMock.getAll();
            const state = backgroundModule.__getState();
            return tabsMock._tabs.size === 1 &&
                Array.isArray(state.jobIndex) &&
                state.jobIndex.length === 1 &&
                alarms.some(alarm => String(alarm.name || '').startsWith('watchdog_'))
                ? true
                : null;
        });
        expect(tabsMock._tabs.size).toBe(1);
    });

    test('BG-74/BG-75/BG-76: watchdog com e sem wd_data trata timeout e fecha extraction tabs orfas', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-5', active: true });
        const extractionTab = await tabsMock.create({ url: 'https://cdn.reader.test/extracted.png', active: false });
        const forwardedMessages = [];
        const removeSpy = jest.spyOn(tabsMock, 'remove');

        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            forwardedMessages.push(message);
            sendResponse({ ok: true });
        });

        backgroundModule.__setState({
            extractionTabs: {
                [extractionTab.id]: { mangaTabId: mangaTab.id, index: 6, geminiTabId: 3003 },
            },
            activeJobsCount: 1,
            completedJobs: 0,
        });
        await storageMock.set({
            wd_data_3003: { mangaTabId: mangaTab.id, index: 6, geminiTabId: 3003 },
        });

        alarmsMock.create('watchdog_3003', { delayInMinutes: 4 });
        alarmsMock._fire('watchdog_3003');

        await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            const timeoutForwarded = forwardedMessages.find(
                message => message.action === 'SHOW_ERROR_INTEGRATED'
            );
            const extractionClosed = !tabsMock._tabs.has(extractionTab.id);
            const accountingDone = backgroundModule.__getState().activeJobsCount === 0;
            return timeoutForwarded &&
                extractionClosed &&
                accountingDone &&
                (data.translatorLog || []).length > 0
                ? data
                : null;
        });

        expect(forwardedMessages).toContainEqual(expect.objectContaining({
            action: 'SHOW_ERROR_INTEGRATED',
            imgIndex: 6,
            isDebug: false,
        }));
        expect(removeSpy).toHaveBeenCalledWith(extractionTab.id, expect.any(Function));
        expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);
        expect(backgroundModule.__getState().activeJobsCount).toBe(0);

        const logsAfterTimeout = await storageMock.get(['translatorLog']);
        expect(logsAfterTimeout.translatorLog).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'JOB_TIMEOUT' }),
        ]));

        removeSpy.mockClear();
        forwardedMessages.length = 0;
        alarmsMock.create('watchdog_9999', { delayInMinutes: 4 });
        alarmsMock._fire('watchdog_9999');
        await flush(6);

        expect(removeSpy).not.toHaveBeenCalled();
        expect(forwardedMessages).toEqual([]);
    });
});
~~~

## 10. Mapa linha por linha

| Linha | Unidade | Fonte | Papel | Evidência |\n|---:|---|---|---|---|\n| 001 | U01 | <code>const {</code> | Inicia destructuring dos factories de mocks Chrome compartilhados. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 002 | U01 | <code>    getRuntimeMock,</code> | Importa factory do runtime mock usado para listeners lifecycle e connect. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 003 | U01 | <code>    getStorageMock,</code> | Importa storage local assíncrono em memória usado para snapshots reais do background. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 004 | U01 | <code>    getTabsMock,</code> | Importa tabs mock que mantém mapa de abas e message handlers. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 005 | U01 | <code>    getAlarmsMock,</code> | Importa alarms mock usado para criar/disparar alarmes deterministicamente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 006 | U01 | <code>    getDownloadsMock,</code> | Importa downloads mock exigido pela carga integral do background. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 007 | U01 | <code>} = require('../../mocks/chrome-api.mock.js');</code> | Fecha require do módulo de mocks Chrome. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 008 | U01 | <code>const { loadBackgroundModule } = require('../../helpers/load-background-module.js');</code> | Importa loader que executa extension/background.js real e acrescenta apenas hooks de inspeção __getState/__setState. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 009 | U01 | <code>const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');</code> | Importa tracker que intercepta somente delays longos conhecidos do background para teardown. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 010 | U01 | <code>const {</code> | Inicia destructuring dos helpers do harness de background. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 011 | U01 | <code>    BACKGROUND_PATH,</code> | Importa BACKGROUND_PATH para extension/background.js. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 012 | U01 | <code>    flush,</code> | Importa flush para drenar turnos assíncronos curtos. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 013 | U01 | <code>    waitFor,</code> | Importa waitFor, gate por polling que falha por timeout quando condição não ocorre. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 014 | U01 | <code>} = require('../../helpers/background-test-utils.js');</code> | Compõe fixture, controle assíncrono ou observação de Dependências e helpers reais; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 015 | U02 | <code>␠ [linha vazia]</code> | Separador visual dentro de Suite e referências mutáveis; sem efeito runtime isolado. | estrutural |\n| 016 | U02 | <code>describe('background.js - lifecycle e alarms reais', () =&gt; {</code> | Declara a suíte focal de lifecycle e alarms do background real. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 017 | U02 | <code>    let runtimeMock;</code> | Compõe fixture, controle assíncrono ou observação de Suite e referências mutáveis; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 018 | U02 | <code>    let storageMock;</code> | Compõe fixture, controle assíncrono ou observação de Suite e referências mutáveis; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 019 | U02 | <code>    let tabsMock;</code> | Compõe fixture, controle assíncrono ou observação de Suite e referências mutáveis; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 020 | U02 | <code>    let alarmsMock;</code> | Compõe fixture, controle assíncrono ou observação de Suite e referências mutáveis; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 021 | U02 | <code>    let downloadsMock;</code> | Compõe fixture, controle assíncrono ou observação de Suite e referências mutáveis; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 022 | U02 | <code>    let backgroundModule;</code> | Compõe fixture, controle assíncrono ou observação de Suite e referências mutáveis; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 023 | U02 | <code>    let cancelBackgroundDelayTimers;</code> | Compõe fixture, controle assíncrono ou observação de Suite e referências mutáveis; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 024 | U02 | <code>␠ [linha vazia]</code> | Separador visual dentro de Suite e referências mutáveis; sem efeito runtime isolado. | estrutural |\n| 025 | U03 | <code>    beforeEach(async () =&gt; {</code> | Inicia beforeEach assíncrono para recriar ambiente por caso. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 026 | U03 | <code>        jest.resetModules();</code> | Limpa cache Jest dos módulos antes de carregar background real. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 027 | U03 | <code>        jest.useRealTimers();</code> | Garante timers reais; a suíte não depende de fake timers. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 028 | U03 | <code>        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();</code> | Ativa tracker dos timers longos que o background pode criar. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 029 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach: ambiente real instrumentado; sem efeito runtime isolado. | estrutural |\n| 030 | U03 | <code>        runtimeMock = getRuntimeMock();</code> | Obtém runtime mock singleton. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 031 | U03 | <code>        storageMock = getStorageMock();</code> | Obtém storage mock singleton. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 032 | U03 | <code>        tabsMock = getTabsMock();</code> | Obtém tabs mock singleton. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 033 | U03 | <code>        alarmsMock = getAlarmsMock();</code> | Obtém alarms mock singleton. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 034 | U03 | <code>        downloadsMock = getDownloadsMock();</code> | Obtém downloads mock singleton. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 035 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach: ambiente real instrumentado; sem efeito runtime isolado. | estrutural |\n| 036 | U03 | <code>        runtimeMock._messageListeners = [];</code> | Zera listeners de mensagens previamente registrados no runtime mock. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 037 | U03 | <code>        runtimeMock._connectListeners = [];</code> | Zera listeners de connect. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 038 | U03 | <code>        runtimeMock._installedListeners = [];</code> | Zera listeners onInstalled. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 039 | U03 | <code>        runtimeMock._startupListeners = [];</code> | Zera listeners onStartup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 040 | U03 | <code>        runtimeMock.lastError = null;</code> | Limpa runtime.lastError. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 041 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach: ambiente real instrumentado; sem efeito runtime isolado. | estrutural |\n| 042 | U03 | <code>        await storageMock.clear();</code> | Esvazia storage antes de montar o background. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 043 | U03 | <code>        global.chrome = {</code> | Instala global.chrome controlado para a carga real do background. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 044 | U03 | <code>            storage: { local: storageMock },</code> | Compõe fixture, controle assíncrono ou observação de beforeEach: ambiente real instrumentado; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 045 | U03 | <code>            tabs: tabsMock,</code> | Compõe fixture, controle assíncrono ou observação de beforeEach: ambiente real instrumentado; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 046 | U03 | <code>            alarms: alarmsMock,</code> | Compõe fixture, controle assíncrono ou observação de beforeEach: ambiente real instrumentado; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 047 | U03 | <code>            runtime: runtimeMock,</code> | Compõe fixture, controle assíncrono ou observação de beforeEach: ambiente real instrumentado; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 048 | U03 | <code>            downloads: downloadsMock,</code> | Compõe fixture, controle assíncrono ou observação de beforeEach: ambiente real instrumentado; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 049 | U03 | <code>            scripting: global.chrome?.scripting,</code> | Compõe fixture, controle assíncrono ou observação de beforeEach: ambiente real instrumentado; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 050 | U03 | <code>        };</code> | Fecha estrutura sintática pertencente a beforeEach: ambiente real instrumentado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 051 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach: ambiente real instrumentado; sem efeito runtime isolado. | estrutural |\n| 052 | U03 | <code>        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);</code> | Carrega extension/background.js real por loader instrumentado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 053 | U03 | <code>        await flush(8);</code> | Drena 8 turnos; também permite que o onInstalled autoagendado pelo mock execute. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 054 | U03 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de beforeEach: ambiente real instrumentado; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 055 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de beforeEach: ambiente real instrumentado; sem efeito runtime isolado. | estrutural |\n| 056 | U04 | <code>    afterEach(async () =&gt; {</code> | Inicia afterEach assíncrono de contenção de side effects. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 057 | U04 | <code>        // onStartup dispara processNextJob() sem await. Primeiro bloqueie novos</code> | Comentário explica que onStartup pode lançar processNextJob sem await. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 058 | U04 | <code>        // launches e drene a cadeia assíncrona; só então cancele os timers que</code> | Comentário explica bloqueio de novos launches antes da drenagem. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 059 | U04 | <code>        // finalizeJob() possa ter criado durante essa drenagem.</code> | Comentário explica que timers criados durante a drenagem só são cancelados depois. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 060 | U04 | <code>        if (backgroundModule?.__setState) {</code> | Guarda uso do hook de estado exposto pelo loader. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 061 | U04 | <code>            backgroundModule.__setState({</code> | Força stopRequested=true e filas vazias para impedir novo trabalho no teardown. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 062 | U04 | <code>                stopRequested: true,</code> | Compõe fixture, controle assíncrono ou observação de afterEach: drenagem e cleanup de recursos; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 063 | U04 | <code>                jobQueue: [],</code> | Define fila de jobs na fixture/cleanup de afterEach: drenagem e cleanup de recursos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 064 | U04 | <code>                pendingBatches: [],</code> | Define fila de lotes pendentes na fixture de afterEach: drenagem e cleanup de recursos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 065 | U04 | <code>            });</code> | Compõe fixture, controle assíncrono ou observação de afterEach: drenagem e cleanup de recursos; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 066 | U04 | <code>        }</code> | Fecha estrutura sintática pertencente a afterEach: drenagem e cleanup de recursos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 067 | U04 | <code>        await flush(12);</code> | Drena turnos assíncronos do harness durante afterEach: drenagem e cleanup de recursos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 068 | U04 | <code>        cancelBackgroundDelayTimers();</code> | Drena 12 turnos antes de cancelar timers longos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 069 | U04 | <code>␠ [linha vazia]</code> | Separador visual dentro de afterEach: drenagem e cleanup de recursos; sem efeito runtime isolado. | estrutural |\n| 070 | U04 | <code>        await alarmsMock.clearAll();</code> | Compõe fixture, controle assíncrono ou observação de afterEach: drenagem e cleanup de recursos; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 071 | U04 | <code>        await flush(4);</code> | Limpa todos os alarmes. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 072 | U04 | <code>        await alarmsMock.clearAll();</code> | Drena callbacks após a primeira limpeza. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 073 | U04 | <code>        tabsMock._tabs.clear();</code> | Limpa novamente alarmes que possam ter surgido tardiamente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 074 | U04 | <code>        await storageMock.clear();</code> | Esvazia todas as abas do mock. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 075 | U04 | <code>␠ [linha vazia]</code> | Separador visual dentro de afterEach: drenagem e cleanup de recursos; sem efeito runtime isolado. | estrutural |\n| 076 | U04 | <code>        // O tracker continua ativo após o primeiro cancelamento. Se qualquer</code> | Comentário operacional do harness em afterEach: drenagem e cleanup de recursos; explica intenção de cleanup, sem executar código. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 077 | U04 | <code>        // callback tardio tiver criado outro timer de 600 ms/4 s/18 s durante</code> | Comentário operacional do harness em afterEach: drenagem e cleanup de recursos; explica intenção de cleanup, sem executar código. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 078 | U04 | <code>        // a limpeza final, elimine-o antes de restaurar os mocks.</code> | Comentário operacional do harness em afterEach: drenagem e cleanup de recursos; explica intenção de cleanup, sem executar código. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 079 | U04 | <code>        cancelBackgroundDelayTimers();</code> | Compõe fixture, controle assíncrono ou observação de afterEach: drenagem e cleanup de recursos; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 080 | U04 | <code>        jest.useRealTimers();</code> | Compõe fixture, controle assíncrono ou observação de afterEach: drenagem e cleanup de recursos; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 081 | U04 | <code>        jest.restoreAllMocks();</code> | Executa segundo cancelamento para timers longos criados durante cleanup tardio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 082 | U04 | <code>    });</code> | Restaura timers reais. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 083 | U04 | <code>␠ [linha vazia]</code> | Separador visual dentro de afterEach: drenagem e cleanup de recursos; sem efeito runtime isolado. | estrutural |\n| 084 | U05 | <code>    test('BG-68/BG-69: onInstalled persiste defaultPrompt e onStartup com fila vazia só sincroniza estado', async () =&gt; {</code> | Declara cenário BG-68/BG-69: defaultPrompt da instalação e startup com fila vazia. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 085 | U05 | <code>        const createSpy = jest.spyOn(tabsMock, 'create');</code> | Cria spy de tabs.create para provar ausência de launch no startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 086 | U05 | <code>        const initial = await storageMock.get(['defaultPrompt']);</code> | Lê defaultPrompt depois do setup; o mock onInstalled autoagenda o listener ao registrá-lo. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 087 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-68/BG-69 instalação + startup vazio; sem efeito runtime isolado. | estrutural |\n| 088 | U05 | <code>        expect(initial.defaultPrompt).toContain('Objetivo primário');</code> | Assertion direta: prompt padrão contém o marcador textual esperado. | ✅ PROVADO DIRETAMENTE |\n| 089 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-68/BG-69 instalação + startup vazio; sem efeito runtime isolado. | estrutural |\n| 090 | U05 | <code>        await storageMock.set({</code> | Persiste snapshot mt_state de fila vazia, incluindo extractionTabs stale. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 091 | U05 | <code>            mt_state: {</code> | Inicia/identifica snapshot mt_state da fixture de BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 092 | U05 | <code>                jobQueue: [],</code> | Define fila de jobs na fixture/cleanup de BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 093 | U05 | <code>                isProcessing: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 094 | U05 | <code>                stopRequested: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 095 | U05 | <code>                activeMangaTabId: null,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 096 | U05 | <code>                extractionTabs: { 9999: { foo: 'bar' } },</code> | Define mappings de abas auxiliares relevantes para BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 097 | U05 | <code>                totalJobs: 0,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 098 | U05 | <code>                completedJobs: 0,</code> | Define contabilidade de jobs concluídos na fixture de BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 099 | U05 | <code>                activeJobsCount: 0,</code> | Define contabilidade de jobs ativos na fixture de BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 100 | U05 | <code>            },</code> | Fecha estrutura sintática pertencente a BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 101 | U05 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 102 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-68/BG-69 instalação + startup vazio; sem efeito runtime isolado. | estrutural |\n| 103 | U05 | <code>        await runtimeMock._simulateStartup();</code> | Dispara explicitamente todos os listeners onStartup registrados. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 104 | U05 | <code>        await flush(8);</code> | Drena o trabalho assíncrono disparado pelo startup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 105 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-68/BG-69 instalação + startup vazio; sem efeito runtime isolado. | estrutural |\n| 106 | U05 | <code>        const state = await storageMock.get(['mt_state']);</code> | Relê mt_state persistido após startup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 107 | U05 | <code>        expect(state.mt_state).toEqual(expect.objectContaining({</code> | Inicia assertion estrutural do snapshot sincronizado. | ✅ PROVADO DIRETAMENTE |\n| 108 | U05 | <code>            jobQueue: [],</code> | Define fila de jobs na fixture/cleanup de BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 109 | U05 | <code>            isProcessing: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 110 | U05 | <code>            stopRequested: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 111 | U05 | <code>            activeMangaTabId: null,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 112 | U05 | <code>            extractionTabs: {},</code> | Prova diretamente que extractionTabs stale foi zerado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 113 | U05 | <code>            totalJobs: 0,</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 114 | U05 | <code>            completedJobs: 0,</code> | Define contabilidade de jobs concluídos na fixture de BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 115 | U05 | <code>            activeJobsCount: 0,</code> | Define contabilidade de jobs ativos na fixture de BG-68/BG-69 instalação + startup vazio. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 116 | U05 | <code>        }));</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 117 | U05 | <code>        expect(createSpy).not.toHaveBeenCalled();</code> | Prova diretamente que nenhuma aba Gemini foi criada. | ✅ PROVADO DIRETAMENTE |\n| 118 | U05 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de BG-68/BG-69 instalação + startup vazio; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 119 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-68/BG-69 instalação + startup vazio; sem efeito runtime isolado. | estrutural |\n| 120 | U06 | <code>    test('BG-69b: onStartup não ressuscita lote cujo completionClaimedBatchId já foi persistido', async () =&gt; {</code> | Declara cenário BG-69b de completionClaimedBatchId já persistido. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 121 | U06 | <code>        const createSpy = jest.spyOn(tabsMock, 'create');</code> | Espiona tabs.create para detectar ressurreição indevida. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 122 | U06 | <code>        await storageMock.set({</code> | Persiste snapshot de lote já concluído/claimed. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 123 | U06 | <code>            mt_state: {</code> | Inicia/identifica snapshot mt_state da fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 124 | U06 | <code>                jobQueue: [],</code> | Define fila de jobs na fixture/cleanup de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 125 | U06 | <code>                isProcessing: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 126 | U06 | <code>                stopRequested: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 127 | U06 | <code>                activeMangaTabId: null,</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 128 | U06 | <code>                currentBatchId: 'batch-done',</code> | Define identidade do lote atual na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 129 | U06 | <code>                completionClaimedBatchId: 'batch-done',</code> | Define claim durável de conclusão na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 130 | U06 | <code>                extractionTabs: {},</code> | Define mappings de abas auxiliares relevantes para BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 131 | U06 | <code>                totalJobs: 2,</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 132 | U06 | <code>                completedJobs: 2,</code> | Define contabilidade de jobs concluídos na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 133 | U06 | <code>                activeJobsCount: 0,</code> | Define contabilidade de jobs ativos na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 134 | U06 | <code>                jobIndex: [],</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 135 | U06 | <code>                pendingBatches: [],</code> | Define fila de lotes pendentes na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 136 | U06 | <code>            },</code> | Fecha estrutura sintática pertencente a BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 137 | U06 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 138 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-69b lote completionClaimed não ressuscita; sem efeito runtime isolado. | estrutural |\n| 139 | U06 | <code>        await runtimeMock._simulateStartup();</code> | Dispara onStartup explicitamente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 140 | U06 | <code>        await flush(8);</code> | Drena turnos assíncronos do harness durante BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 141 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-69b lote completionClaimed não ressuscita; sem efeito runtime isolado. | estrutural |\n| 142 | U06 | <code>        const data = await storageMock.get(['mt_state']);</code> | Relê mt_state após startup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 143 | U06 | <code>        expect(data.mt_state).toEqual(expect.objectContaining({</code> | Inicia assertion de preservação do lote já concluído. | ✅ PROVADO DIRETAMENTE |\n| 144 | U06 | <code>            currentBatchId: 'batch-done',</code> | Define identidade do lote atual na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 145 | U06 | <code>            completionClaimedBatchId: 'batch-done',</code> | Define claim durável de conclusão na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 146 | U06 | <code>            isProcessing: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 147 | U06 | <code>            activeJobsCount: 0,</code> | Define contabilidade de jobs ativos na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 148 | U06 | <code>            jobQueue: [],</code> | Define fila de jobs na fixture/cleanup de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 149 | U06 | <code>            pendingBatches: [],</code> | Define fila de lotes pendentes na fixture de BG-69b lote completionClaimed não ressuscita. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 150 | U06 | <code>        }));</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 151 | U06 | <code>        expect(createSpy).not.toHaveBeenCalled();</code> | Prova diretamente que nenhuma aba foi criada para lote já claimed. | ✅ PROVADO DIRETAMENTE |\n| 152 | U06 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de BG-69b lote completionClaimed não ressuscita; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 153 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-69b lote completionClaimed não ressuscita; sem efeito runtime isolado. | estrutural |\n| 154 | U07 | <code>    test('REG-13/BG-70/BG-71: onStartup recupera fila, zera extractionTabs e reinicia processamento sem ficar preso', async () =&gt; {</code> | Declara recovery de fila ativa após restart do service worker. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 155 | U07 | <code>        await storageMock.set({</code> | Persiste URL Gemini mock e maxConcurrentJobs=1. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 156 | U07 | <code>            geminiBaseUrl: 'http://127.0.0.1:3999/app',</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 157 | U07 | <code>            maxConcurrentJobs: 1,</code> | Persiste mt_state com dois jobs, processamento ativo e extraction tab stale. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 158 | U07 | <code>            mt_state: {</code> | Inicia/identifica snapshot mt_state da fixture de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 159 | U07 | <code>                jobQueue: [</code> | Define fila de jobs na fixture/cleanup de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 160 | U07 | <code>                    { mangaTabId: 42, index: 0, prompt: 'A' },</code> | Define mangaTabId em dados controlados de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 161 | U07 | <code>                    { mangaTabId: 42, index: 1, prompt: 'B' },</code> | Define mangaTabId em dados controlados de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 162 | U07 | <code>                ],</code> | Fecha estrutura sintática pertencente a REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 163 | U07 | <code>                isProcessing: true,</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 164 | U07 | <code>                stopRequested: false,</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 165 | U07 | <code>                activeMangaTabId: 42,</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 166 | U07 | <code>                extractionTabs: {</code> | Define mappings de abas auxiliares relevantes para REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 167 | U07 | <code>                    7001: { mangaTabId: 42, index: 0, geminiTabId: 9001 },</code> | Define mangaTabId em dados controlados de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 168 | U07 | <code>                },</code> | Fecha estrutura sintática pertencente a REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 169 | U07 | <code>                totalJobs: 2,</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 170 | U07 | <code>                completedJobs: 0,</code> | Define contabilidade de jobs concluídos na fixture de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 171 | U07 | <code>                activeJobsCount: 2,</code> | Define contabilidade de jobs ativos na fixture de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 172 | U07 | <code>            },</code> | Fecha estrutura sintática pertencente a REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 173 | U07 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 174 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de REG-13/BG-70/BG-71 recovery de fila; sem efeito runtime isolado. | estrutural |\n| 175 | U07 | <code>        await runtimeMock._simulateStartup();</code> | Dispara onStartup para acionar restore/reconcile/processNextJob reais. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 176 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de REG-13/BG-70/BG-71 recovery de fila; sem efeito runtime isolado. | estrutural |\n| 177 | U07 | <code>        await waitFor(async () =&gt; {</code> | Inicia waitFor que funciona como gate: timeout reprova o teste. | ✅ gate direto por waitFor |\n| 178 | U07 | <code>            const data = await storageMock.get(['mt_state', 'translatorLog']);</code> | Lê storage para observar efeito real em REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 179 | U07 | <code>            const alarms = await alarmsMock.getAll();</code> | Lê alarmes reais do mock durante polling. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 180 | U07 | <code>            const state = data.mt_state &#124;&#124; {};</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 181 | U07 | <code>            const launchFinished = Array.isArray(state.jobIndex) &amp;&amp;</code> | Exige jobIndex com exatamente um launch persistido. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 182 | U07 | <code>                state.jobIndex.length === 1 &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 183 | U07 | <code>                alarms.some(alarm =&gt; String(alarm.name &#124;&#124; '').startsWith('watchdog_'));</code> | Exige watchdog correspondente ao job lançado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 184 | U07 | <code>            return (data.mt_state &amp;&amp; Array.isArray(data.translatorLog) &amp;&amp;</code> | Consulta/define telemetria persistida em REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 185 | U07 | <code>                tabsMock._tabs.size === 1 &amp;&amp; launchFinished) ? data : null;</code> | Consulta/muta o mapa de abas do mock em REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 186 | U07 | <code>        });</code> | Gate só retorna quando mt_state/log existem, há exatamente uma aba e launch terminou. | ✅ gate direto por waitFor |\n| 187 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de REG-13/BG-70/BG-71 recovery de fila; sem efeito runtime isolado. | estrutural |\n| 188 | U07 | <code>        const data = await storageMock.get(['mt_state', 'translatorLog']);</code> | Lê storage para observar efeito real em REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 189 | U07 | <code>        expect(data.mt_state).toEqual(expect.objectContaining({</code> | Inicia assertion do estado pós-recovery. | ✅ PROVADO DIRETAMENTE |\n| 190 | U07 | <code>            isProcessing: true,</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 191 | U07 | <code>            activeMangaTabId: 42,</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 192 | U07 | <code>            extractionTabs: {},</code> | Prova que extractionTabs foi zerado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 193 | U07 | <code>            totalJobs: 2,</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 194 | U07 | <code>            completedJobs: 0,</code> | Define contabilidade de jobs concluídos na fixture de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 195 | U07 | <code>            activeJobsCount: 1,</code> | Prova activeJobsCount=1 após relançar apenas um job. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 196 | U07 | <code>        }));</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 197 | U07 | <code>        expect(data.mt_state.jobQueue).toEqual([</code> | Prova que só o segundo job permanece na fila. | ✅ PROVADO DIRETAMENTE |\n| 198 | U07 | <code>            { mangaTabId: 42, index: 1, prompt: 'B' },</code> | Define mangaTabId em dados controlados de REG-13/BG-70/BG-71 recovery de fila. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 199 | U07 | <code>        ]);</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 200 | U07 | <code>        expect(data.translatorLog).toEqual(expect.arrayContaining([</code> | Prova log STARTUP_RECOVERY. | ✅ PROVADO DIRETAMENTE |\n| 201 | U07 | <code>            expect.objectContaining({ action: 'STARTUP_RECOVERY' }),</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 202 | U07 | <code>        ]));</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 203 | U07 | <code>        expect(tabsMock._tabs.size).toBe(1);</code> | Prova exatamente uma aba aberta. | ✅ PROVADO DIRETAMENTE |\n| 204 | U07 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de REG-13/BG-70/BG-71 recovery de fila; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 205 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de REG-13/BG-70/BG-71 recovery de fila; sem efeito runtime isolado. | estrutural |\n| 206 | U08 | <code>    test('BG-69c: startup promove B quando snapshot persistido contém A já concluído + B/C pendentes', async () =&gt; {</code> | Declara startup que deve promover B quando A já está completionClaimed e B/C pendem. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 207 | U08 | <code>        await storageMock.set({</code> | Configura URL Gemini e concorrência 1. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 208 | U08 | <code>            geminiBaseUrl: 'http://127.0.0.1:3999/app',</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 209 | U08 | <code>            maxConcurrentJobs: 1,</code> | Persiste A concluído e fila pending [B,C]. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 210 | U08 | <code>            mt_state: {</code> | Inicia/identifica snapshot mt_state da fixture de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 211 | U08 | <code>                jobQueue: [],</code> | Define fila de jobs na fixture/cleanup de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 212 | U08 | <code>                isProcessing: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 213 | U08 | <code>                stopRequested: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 214 | U08 | <code>                activeMangaTabId: null,</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 215 | U08 | <code>                currentBatchId: 'batch-a',</code> | Define identidade do lote atual na fixture de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 216 | U08 | <code>                completionClaimedBatchId: 'batch-a',</code> | Define claim durável de conclusão na fixture de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 217 | U08 | <code>                extractionTabs: {},</code> | Define mappings de abas auxiliares relevantes para BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 218 | U08 | <code>                totalJobs: 1,</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 219 | U08 | <code>                completedJobs: 1,</code> | Define contabilidade de jobs concluídos na fixture de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 220 | U08 | <code>                activeJobsCount: 0,</code> | Define contabilidade de jobs ativos na fixture de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 221 | U08 | <code>                jobIndex: [],</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 222 | U08 | <code>                pendingBatches: [</code> | Define fila de lotes pendentes na fixture de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 223 | U08 | <code>                    { batchId: 'batch-b', mangaTabId: 21, prompt: 'B', images: [{ index: 0 }] },</code> | Define mangaTabId em dados controlados de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 224 | U08 | <code>                    { batchId: 'batch-c', mangaTabId: 31, prompt: 'C', images: [{ index: 1 }] },</code> | Define mangaTabId em dados controlados de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 225 | U08 | <code>                ],</code> | Fecha estrutura sintática pertencente a BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 226 | U08 | <code>            },</code> | Fecha estrutura sintática pertencente a BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 227 | U08 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 228 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-69c promoção após lote concluído; sem efeito runtime isolado. | estrutural |\n| 229 | U08 | <code>        await runtimeMock._simulateStartup();</code> | Dispara onStartup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 230 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-69c promoção após lote concluído; sem efeito runtime isolado. | estrutural |\n| 231 | U08 | <code>        await waitFor(async () =&gt; {</code> | Inicia gate de promoção + launch. | ✅ gate direto por waitFor |\n| 232 | U08 | <code>            const data = await storageMock.get(['mt_state']);</code> | Lê storage para observar efeito real em BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 233 | U08 | <code>            const alarms = await alarmsMock.getAll();</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 234 | U08 | <code>            const state = data.mt_state &#124;&#124; {};</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 235 | U08 | <code>            const launchFinished = Array.isArray(state.jobIndex) &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 236 | U08 | <code>                state.jobIndex.length === 1 &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 237 | U08 | <code>                alarms.some(alarm =&gt; String(alarm.name &#124;&#124; '').startsWith('watchdog_'));</code> | Exige jobIndex de tamanho 1. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 238 | U08 | <code>            return state.currentBatchId === 'batch-b' &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 239 | U08 | <code>                tabsMock._tabs.size === 1 &amp;&amp; launchFinished</code> | Exige watchdog armado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 240 | U08 | <code>                ? state</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 241 | U08 | <code>                : null;</code> | Só libera o gate quando currentBatchId virou batch-b, existe uma aba e launch terminou. | ✅ gate direto por waitFor |\n| 242 | U08 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 243 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-69c promoção após lote concluído; sem efeito runtime isolado. | estrutural |\n| 244 | U08 | <code>        const data = await storageMock.get(['mt_state', 'translatorLog']);</code> | Lê storage para observar efeito real em BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 245 | U08 | <code>        expect(data.mt_state.currentBatchId).toBe('batch-b');</code> | Prova currentBatchId=batch-b. | ✅ PROVADO DIRETAMENTE |\n| 246 | U08 | <code>        expect(data.mt_state.completionClaimedBatchId).toBeNull();</code> | Prova completionClaimedBatchId limpo para o novo lote. | ✅ PROVADO DIRETAMENTE |\n| 247 | U08 | <code>        expect(data.mt_state.pendingBatches.map(batch =&gt; batch.batchId)).toEqual(['batch-c']);</code> | Prova que somente batch-c permanece pendente. | ✅ PROVADO DIRETAMENTE |\n| 248 | U08 | <code>        expect(data.mt_state.activeMangaTabId).toBe(21);</code> | Prova activeMangaTabId do lote B. | ✅ PROVADO DIRETAMENTE |\n| 249 | U08 | <code>        expect(data.mt_state.activeJobsCount).toBe(1);</code> | Prova activeJobsCount=1. | ✅ PROVADO DIRETAMENTE |\n| 250 | U08 | <code>        expect(data.translatorLog).toEqual(expect.arrayContaining([</code> | Inicia assertion de log BATCH_PROMOTED com batch-b. | ✅ PROVADO DIRETAMENTE |\n| 251 | U08 | <code>            expect.objectContaining({</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 252 | U08 | <code>                action: 'BATCH_PROMOTED',</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 253 | U08 | <code>                extra: expect.objectContaining({ batchId: 'batch-b' }),</code> | Define batchId em dados controlados/assertions de BG-69c promoção após lote concluído. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 254 | U08 | <code>            }),</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 255 | U08 | <code>        ]));</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 256 | U08 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de BG-69c promoção após lote concluído; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 257 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-69c promoção após lote concluído; sem efeito runtime isolado. | estrutural |\n| 258 | U09 | <code>    test('BG-71b: onStartup promove o primeiro de vários pendingBatches persistidos em FIFO', async () =&gt; {</code> | Declara cenário FIFO com B/C/D pendentes e nenhum lote ativo. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 259 | U09 | <code>        await storageMock.set({</code> | Configura URL Gemini e concorrência 1. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 260 | U09 | <code>            geminiBaseUrl: 'http://127.0.0.1:3999/app',</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 261 | U09 | <code>            maxConcurrentJobs: 1,</code> | Persiste estado sem lote atual e pendingBatches [B,C,D]. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 262 | U09 | <code>            mt_state: {</code> | Inicia/identifica snapshot mt_state da fixture de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 263 | U09 | <code>                jobQueue: [],</code> | Define fila de jobs na fixture/cleanup de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 264 | U09 | <code>                isProcessing: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 265 | U09 | <code>                stopRequested: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 266 | U09 | <code>                activeMangaTabId: null,</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 267 | U09 | <code>                currentBatchId: null,</code> | Define identidade do lote atual na fixture de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 268 | U09 | <code>                extractionTabs: {},</code> | Define mappings de abas auxiliares relevantes para BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 269 | U09 | <code>                totalJobs: 0,</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 270 | U09 | <code>                completedJobs: 0,</code> | Define contabilidade de jobs concluídos na fixture de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 271 | U09 | <code>                activeJobsCount: 0,</code> | Define contabilidade de jobs ativos na fixture de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 272 | U09 | <code>                jobIndex: [],</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 273 | U09 | <code>                pendingBatches: [</code> | Define fila de lotes pendentes na fixture de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 274 | U09 | <code>                    { batchId: 'batch-b', mangaTabId: 21, prompt: 'B', images: [{ index: 0 }] },</code> | Define mangaTabId em dados controlados de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 275 | U09 | <code>                    { batchId: 'batch-c', mangaTabId: 31, prompt: 'C', images: [{ index: 1 }] },</code> | Define mangaTabId em dados controlados de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 276 | U09 | <code>                    { batchId: 'batch-d', mangaTabId: 41, prompt: 'D', images: [{ index: 2 }] },</code> | Define mangaTabId em dados controlados de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 277 | U09 | <code>                ],</code> | Fecha estrutura sintática pertencente a BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 278 | U09 | <code>            },</code> | Fecha estrutura sintática pertencente a BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 279 | U09 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 280 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-71b promoção FIFO de pendingBatches; sem efeito runtime isolado. | estrutural |\n| 281 | U09 | <code>        await runtimeMock._simulateStartup();</code> | Dispara onStartup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 282 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-71b promoção FIFO de pendingBatches; sem efeito runtime isolado. | estrutural |\n| 283 | U09 | <code>        await waitFor(async () =&gt; {</code> | Inicia gate que aguarda promoção e launch. | ✅ gate direto por waitFor |\n| 284 | U09 | <code>            const data = await storageMock.get(['mt_state']);</code> | Lê storage para observar efeito real em BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 285 | U09 | <code>            const alarms = await alarmsMock.getAll();</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 286 | U09 | <code>            const state = data.mt_state &#124;&#124; {};</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 287 | U09 | <code>            const launchFinished = Array.isArray(state.jobIndex) &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 288 | U09 | <code>                state.jobIndex.length === 1 &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 289 | U09 | <code>                alarms.some(alarm =&gt; String(alarm.name &#124;&#124; '').startsWith('watchdog_'));</code> | Exige jobIndex de um job. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 290 | U09 | <code>            return state.currentBatchId === 'batch-b' &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 291 | U09 | <code>                tabsMock._tabs.size === 1 &amp;&amp; launchFinished</code> | Exige watchdog do job promovido. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 292 | U09 | <code>                ? state</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 293 | U09 | <code>                : null;</code> | Gate exige batch-b e uma aba aberta. | ✅ gate direto por waitFor |\n| 294 | U09 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 295 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-71b promoção FIFO de pendingBatches; sem efeito runtime isolado. | estrutural |\n| 296 | U09 | <code>        const data = await storageMock.get(['mt_state', 'translatorLog']);</code> | Lê storage para observar efeito real em BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 297 | U09 | <code>        expect(data.mt_state.currentBatchId).toBe('batch-b');</code> | Prova que o primeiro promovido é batch-b. | ✅ PROVADO DIRETAMENTE |\n| 298 | U09 | <code>        expect(data.mt_state.pendingBatches.map(batch =&gt; batch.batchId))</code> | Inicia assertion da fila restante. | ✅ PROVADO DIRETAMENTE |\n| 299 | U09 | <code>            .toEqual(['batch-c', 'batch-d']);</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 300 | U09 | <code>        expect(data.mt_state.activeMangaTabId).toBe(21);</code> | Prova ordem restante batch-c, batch-d. | ✅ PROVADO DIRETAMENTE |\n| 301 | U09 | <code>        expect(data.mt_state.totalJobs).toBe(1);</code> | Prova activeMangaTabId=21 do lote B. | ✅ PROVADO DIRETAMENTE |\n| 302 | U09 | <code>        expect(data.mt_state.activeJobsCount).toBe(1);</code> | Prova totalJobs=1 para o lote promovido. | ✅ PROVADO DIRETAMENTE |\n| 303 | U09 | <code>        expect(data.translatorLog).toEqual(expect.arrayContaining([</code> | Prova activeJobsCount=1. | ✅ PROVADO DIRETAMENTE |\n| 304 | U09 | <code>            expect.objectContaining({</code> | Inicia assertion do log BATCH_PROMOTED. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 305 | U09 | <code>                action: 'BATCH_PROMOTED',</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 306 | U09 | <code>                extra: expect.objectContaining({ batchId: 'batch-b' }),</code> | Define batchId em dados controlados/assertions de BG-71b promoção FIFO de pendingBatches. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 307 | U09 | <code>            }),</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 308 | U09 | <code>        ]));</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 309 | U09 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de BG-71b promoção FIFO de pendingBatches; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 310 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-71b promoção FIFO de pendingBatches; sem efeito runtime isolado. | estrutural |\n| 311 | U10 | <code>    test('BG-72: onConnect registra listener de disconnect para porta keep-alive', async () =&gt; {</code> | Declara cenário de listener onConnect para porta keep-alive. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 312 | U10 | <code>        const keepAlivePort = runtimeMock.connect({ name: 'gemini-keep-alive' });</code> | Conecta porta gemini-keep-alive pelo runtime mock. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 313 | U10 | <code>        const genericPort = runtimeMock.connect({ name: 'generic-port' });</code> | Conecta uma porta genérica de controle. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 314 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-72 keep-alive onConnect; sem efeito runtime isolado. | estrutural |\n| 315 | U10 | <code>        expect(keepAlivePort._disconnectListeners).toHaveLength(1);</code> | Prova um listener de disconnect na porta keep-alive. | ✅ PROVADO DIRETAMENTE |\n| 316 | U10 | <code>        expect(genericPort._disconnectListeners).toHaveLength(0);</code> | Prova nenhum listener de disconnect na porta genérica. | ✅ PROVADO DIRETAMENTE |\n| 317 | U10 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de BG-72 keep-alive onConnect; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 318 | U10 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-72 keep-alive onConnect; sem efeito runtime isolado. | estrutural |\n| 319 | U11 | <code>    test('BG-73: nextJobAlarm dispara processNextJob e abre a próxima aba Gemini', async () =&gt; {</code> | Declara cenário nextJobAlarm que deve disparar processNextJob. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 320 | U11 | <code>        await storageMock.set({ geminiBaseUrl: 'http://127.0.0.1:3999/app' });</code> | Persiste geminiBaseUrl para criação da aba. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 321 | U11 | <code>        backgroundModule.__setState({</code> | Injeta estado com um job pronto e concorrência disponível. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 322 | U11 | <code>            jobQueue: [{ mangaTabId: 91, index: 5, prompt: 'job' }],</code> | Define fila de jobs na fixture/cleanup de BG-73 nextJobAlarm. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 323 | U11 | <code>            stopRequested: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 324 | U11 | <code>            activeJobsCount: 0,</code> | Define contabilidade de jobs ativos na fixture de BG-73 nextJobAlarm. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 325 | U11 | <code>            totalJobs: 1,</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 326 | U11 | <code>            completedJobs: 0,</code> | Define contabilidade de jobs concluídos na fixture de BG-73 nextJobAlarm. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 327 | U11 | <code>            _cachedMaxCon: 1,</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 328 | U11 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 329 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-73 nextJobAlarm; sem efeito runtime isolado. | estrutural |\n| 330 | U11 | <code>        alarmsMock.create('nextJobAlarm', { delayInMinutes: 1 });</code> | Cria nextJobAlarm no alarms mock. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 331 | U11 | <code>        alarmsMock._fire('nextJobAlarm');</code> | Dispara manualmente o alarme e seus listeners. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 332 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-73 nextJobAlarm; sem efeito runtime isolado. | estrutural |\n| 333 | U11 | <code>        await waitFor(async () =&gt; {</code> | Inicia waitFor do efeito assíncrono. | ✅ gate direto por waitFor |\n| 334 | U11 | <code>            const alarms = await alarmsMock.getAll();</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 335 | U11 | <code>            const state = backgroundModule.__getState();</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 336 | U11 | <code>            return tabsMock._tabs.size === 1 &amp;&amp;</code> | Gate exige uma aba criada. | ✅ gate direto por waitFor |\n| 337 | U11 | <code>                Array.isArray(state.jobIndex) &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 338 | U11 | <code>                state.jobIndex.length === 1 &amp;&amp;</code> | Gate exige jobIndex de um job. | ✅ gate direto por waitFor |\n| 339 | U11 | <code>                alarms.some(alarm =&gt; String(alarm.name &#124;&#124; '').startsWith('watchdog_'))</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 340 | U11 | <code>                ? true</code> | Gate exige watchdog armado. | ✅ gate direto por waitFor |\n| 341 | U11 | <code>                : null;</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 342 | U11 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 343 | U11 | <code>        expect(tabsMock._tabs.size).toBe(1);</code> | Assertion final confirma uma aba aberta. | ✅ PROVADO DIRETAMENTE |\n| 344 | U11 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de BG-73 nextJobAlarm; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 345 | U11 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-73 nextJobAlarm; sem efeito runtime isolado. | estrutural |\n| 346 | U12 | <code>    test('BG-74/BG-75/BG-76: watchdog com e sem wd_data trata timeout e fecha extraction tabs orfas', async () =&gt; {</code> | Declara cenário watchdog com wd_data válido e depois watchdog sem dados. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 347 | U12 | <code>        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter-5', active: true });</code> | Cria manga tab real no tabs mock. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 348 | U12 | <code>        const extractionTab = await tabsMock.create({ url: 'https://cdn.reader.test/extracted.png', active: false });</code> | Cria extraction tab órfã ligada ao job Gemini 3003. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 349 | U12 | <code>        const forwardedMessages = [];</code> | Cria ledger de mensagens encaminhadas ao leitor. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 350 | U12 | <code>        const removeSpy = jest.spyOn(tabsMock, 'remove');</code> | Espiona tabs.remove para provar cleanup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 351 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 352 | U12 | <code>        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) =&gt; {</code> | Registra handler de mensagem da manga tab e coleta mensagens. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 353 | U12 | <code>            forwardedMessages.push(message);</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 354 | U12 | <code>            sendResponse({ ok: true });</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 355 | U12 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 356 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 357 | U12 | <code>        backgroundModule.__setState({</code> | Injeta extractionTabs e contabilidade ativa no background real. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 358 | U12 | <code>            extractionTabs: {</code> | Define mappings de abas auxiliares relevantes para BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 359 | U12 | <code>                [extractionTab.id]: { mangaTabId: mangaTab.id, index: 6, geminiTabId: 3003 },</code> | Define mangaTabId em dados controlados de BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 360 | U12 | <code>            },</code> | Fecha estrutura sintática pertencente a BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 361 | U12 | <code>            activeJobsCount: 1,</code> | Define contabilidade de jobs ativos na fixture de BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 362 | U12 | <code>            completedJobs: 0,</code> | Define contabilidade de jobs concluídos na fixture de BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 363 | U12 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 364 | U12 | <code>        await storageMock.set({</code> | Persiste wd_data_3003 consumido pelo watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 365 | U12 | <code>            wd_data_3003: { mangaTabId: mangaTab.id, index: 6, geminiTabId: 3003 },</code> | Define mangaTabId em dados controlados de BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 366 | U12 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 367 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 368 | U12 | <code>        alarmsMock.create('watchdog_3003', { delayInMinutes: 4 });</code> | Cria watchdog_3003. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 369 | U12 | <code>        alarmsMock._fire('watchdog_3003');</code> | Dispara o watchdog com dados persistidos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 370 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 371 | U12 | <code>        await waitFor(async () =&gt; {</code> | Inicia waitFor da conclusão do timeout. | ✅ gate direto por waitFor |\n| 372 | U12 | <code>            const data = await storageMock.get(['translatorLog']);</code> | Lê storage para observar efeito real em BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 373 | U12 | <code>            const timeoutForwarded = forwardedMessages.find(</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 374 | U12 | <code>                message =&gt; message.action === 'SHOW_ERROR_INTEGRATED'</code> | Localiza SHOW_ERROR_INTEGRATED encaminhado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 375 | U12 | <code>            );</code> | Fecha estrutura sintática pertencente a BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 376 | U12 | <code>            const extractionClosed = !tabsMock._tabs.has(extractionTab.id);</code> | Consulta/muta o mapa de abas do mock em BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 377 | U12 | <code>            const accountingDone = backgroundModule.__getState().activeJobsCount === 0;</code> | Confirma que extraction tab saiu do mapa de abas. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 378 | U12 | <code>            return timeoutForwarded &amp;&amp;</code> | Confirma activeJobsCount chegou a zero. | ✅ gate direto por waitFor |\n| 379 | U12 | <code>                extractionClosed &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 380 | U12 | <code>                accountingDone &amp;&amp;</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 381 | U12 | <code>                (data.translatorLog &#124;&#124; []).length &gt; 0</code> | Consulta/define telemetria persistida em BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 382 | U12 | <code>                ? data</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 383 | U12 | <code>                : null;</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 384 | U12 | <code>        });</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 385 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 386 | U12 | <code>        expect(forwardedMessages).toContainEqual(expect.objectContaining({</code> | Prova conteúdo central da mensagem de erro integrada. | ✅ PROVADO DIRETAMENTE |\n| 387 | U12 | <code>            action: 'SHOW_ERROR_INTEGRATED',</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 388 | U12 | <code>            imgIndex: 6,</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 389 | U12 | <code>            isDebug: false,</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 390 | U12 | <code>        }));</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 391 | U12 | <code>        expect(removeSpy).toHaveBeenCalledWith(extractionTab.id, expect.any(Function));</code> | Prova tabs.remove da extraction tab. | ✅ PROVADO DIRETAMENTE |\n| 392 | U12 | <code>        expect(tabsMock._tabs.has(extractionTab.id)).toBe(false);</code> | Prova aba auxiliar realmente ausente no tabs mock. | ✅ PROVADO DIRETAMENTE |\n| 393 | U12 | <code>        expect(backgroundModule.__getState().activeJobsCount).toBe(0);</code> | Prova activeJobsCount=0. | ✅ PROVADO DIRETAMENTE |\n| 394 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 395 | U12 | <code>        const logsAfterTimeout = await storageMock.get(['translatorLog']);</code> | Lê storage para observar efeito real em BG-74/BG-75/BG-76 watchdog. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 396 | U12 | <code>        expect(logsAfterTimeout.translatorLog).toEqual(expect.arrayContaining([</code> | Inicia assertion do log persistido após timeout. | ✅ PROVADO DIRETAMENTE |\n| 397 | U12 | <code>            expect.objectContaining({ action: 'JOB_TIMEOUT' }),</code> | Prova evento JOB_TIMEOUT. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 398 | U12 | <code>        ]));</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 399 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 400 | U12 | <code>        removeSpy.mockClear();</code> | Limpa histórico do spy antes do segundo subcenário. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 401 | U12 | <code>        forwardedMessages.length = 0;</code> | Esvazia mensagens encaminhadas antes do watchdog sem dados. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 402 | U12 | <code>        alarmsMock.create('watchdog_9999', { delayInMinutes: 4 });</code> | Cria watchdog_9999 sem wd_data correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 403 | U12 | <code>        alarmsMock._fire('watchdog_9999');</code> | Dispara watchdog sem dados. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 404 | U12 | <code>        await flush(6);</code> | Drena callbacks assíncronos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 405 | U12 | <code>␠ [linha vazia]</code> | Separador visual dentro de BG-74/BG-75/BG-76 watchdog; sem efeito runtime isolado. | estrutural |\n| 406 | U12 | <code>        expect(removeSpy).not.toHaveBeenCalled();</code> | Prova que watchdog sem dados não remove abas. | ✅ PROVADO DIRETAMENTE |\n| 407 | U12 | <code>        expect(forwardedMessages).toEqual([]);</code> | Prova que watchdog sem dados não encaminha erro. | ✅ PROVADO DIRETAMENTE |\n| 408 | U12 | <code>    });</code> | Compõe fixture, controle assíncrono ou observação de BG-74/BG-75/BG-76 watchdog; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 409 | U13 | <code>});</code> | Compõe fixture, controle assíncrono ou observação de Fechamento da suite; o código exato desta posição está preservado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 410 | U14 | <code>␠ [linha vazia]</code> | Newline terminal do blob; posição editorial. | 🟦 verificação documental |\n

## 11. Unidades semânticas

### U01 — linhas 1–14 — dependências

Conecta a suíte aos mocks Chrome, loader do background, tracker de timers e helpers de polling. Os paths são estáticos e o Jest project background os executa em ambiente Node.

### U02 — linhas 15–24 — estado da suíte

Declara referências compartilhadas reatribuídas por beforeEach. Nenhum estado funcional é preservado intencionalmente entre testes.

### U03 — linhas 25–55 — beforeEach

Reconstrói o ambiente e carrega o background real. O uso de timers reais é importante porque onInstalled é autoagendado pelo mock com delay zero.

### U04 — linhas 56–83 — afterEach

Evita worker leaks bloqueando novos jobs antes de drenar callbacks e cancelando duas vezes os timers longos rastreados. Alarmes, tabs e storage são limpos.

### U05 — linhas 84–119 — instalação + startup vazio

Combina duas fases de lifecycle no mesmo caso: efeito de onInstalled ocorrido durante setup e onStartup explicitamente simulado depois de persistir estado vazio/stale.

### U06 — linhas 120–153 — completion claim

Protege contra ressurreição de lote concluído após restart.

### U07 — linhas 154–205 — recovery ativo

Exercita restore/reconcile/scheduler reais e exige launch/watchdog antes de avaliar snapshot.

### U08 — linhas 206–257 — promoção após conclusão

Verifica transição A concluído → B ativo → C pendente.

### U09 — linhas 258–310 — FIFO de pendentes

Verifica B/C/D → B ativo e C/D remanescentes em ordem.

### U10 — linhas 311–318 — onConnect

Diferencia a porta especial gemini-keep-alive de qualquer porta genérica.

### U11 — linhas 319–345 — nextJobAlarm

Dispara o evento de alarme real do background e observa scheduler via aba/jobIndex/watchdog.

### U12 — linhas 346–408 — watchdog

Cobre timeout persistido, mensagem para manga, finalize/contabilidade observável, cleanup de extraction tab e no-op sem dados.

### U13 — linha 409 — fechamento

Fecha describe.

### U14 — posição 410 — newline

Registra terminador físico final do blob.

## 12. Limites e trust boundaries

A suíte usa mocks em memória para Chrome APIs; portanto não mede comportamento de um service worker Chromium real, latência do navegador ou persistência entre processos físicos.

loadBackgroundModule executa background.js real, mas acrescenta funções de inspeção ao mesmo source string antes de compilar. As assertions sobre estado via __getState/__setState dependem dessa instrumentação de teste.

waitFor transforma condições em gates diretos, mas usa timeout de até 3 s. Um ambiente extremamente lento pode falhar por tempo mesmo sem regressão lógica; a execução observada em Linux/Windows reduz, mas não elimina, risco de flakiness futura.

## 13. Invariantes da suíte

1. nenhum caso deve herdar fila/alarme/tab/storage do anterior;
2. timers longos do background devem ser cancelados no teardown;
3. startup explícito deve usar listeners registrados pelo background real;
4. promoção de pendingBatches preserva FIFO;
5. completionClaimedBatchId impede ressurreição;
6. recovery remove extractionTabs stale;
7. nextJobAlarm deve produzir sinais concretos de scheduler;
8. watchdog persistido deve encaminhar timeout e limpar extraction tabs relacionadas;
9. watchdog sem dados não deve remover tab nem encaminhar erro;
10. porta keep-alive é diferenciada por nome;
11. side effect observado sem expect/gate correspondente não deve ser promovido a prova direta.

## 14. Autoauditoria — AGENTE 19

- [x] reserva #154 criada com CREATE ONLY e ownership reconfirmado;
- [x] state #154 criado de forma independente;
- [x] SHA do fonte reconfirmado;
- [x] 409 linhas textuais + newline = 410 posições;
- [x] fonte integral embutida diretamente do blob;
- [x] 8 casos Jest catalogados;
- [x] background real, watchdog, loader, timer tracker e mock Chrome inspecionados;
- [x] execução do mesmo blob confirmada em Node 20, Node 22 e Windows;
- [x] waitFor reconhecido como gate direto quando seu predicado é necessário para o teste prosseguir;
- [x] semântica especial de onInstalled do mock documentada;
- [x] lacunas externas persistidas como 154-001 a 154-003;
- [x] nenhum código, teste, fixture, mock, workflow ou configuração alterado.

**Resultado documental:** a suíte prova diretamente os oito fluxos que observa, com forte cobertura de restart/FIFO/watchdog. As três lacunas identificadas permanecem externas e não impedem status COMPLETED.

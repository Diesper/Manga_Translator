# Bíblia técnica — tests/unit/background/helpers-real.test.js

> **Estado documental:** ✅ CONCLUÍDO — revalidado pelo AGENTE 20; autoria histórica AGENTE 13  
> **Arquivo auditado:** `tests/unit/background/helpers-real.test.js`  
> **SHA auditado:** `668cef7f592231856d5071bd35ff6c5c12848a41`  
> **Agente:** AGENTE 13  
> **PR:** #66  
> **Branch:** `docs/project-bible`  
> **Linhas textuais:** **284**  
> **Posições documentais:** **285**, contando o newline final  
> **Natureza:** suíte Jest instrumentada que executa helpers reais de `extension/background.js`

## 1. Identidade e finalidade

Este arquivo audita helpers de infraestrutura do background por meio da implementação real de `extension/background.js`, carregada por `tests/helpers/load-background-module.js` com uma ponte de instrumentação que acrescenta exports de teste. A lógica exercitada continua sendo a lógica real do background; contudo, o ambiente Chrome é simulado e alguns estados internos são expostos somente para a suíte.

Os grupos cobertos são:

1. restauração parcial de estado persistido;
2. round-trip e serialização de `syncState`;
3. batching e limite do log persistido;
4. recuperação operacional após falha de escrita do log;
5. criação, rearme e limpeza do watchdog.

A suíte não é um E2E de extensão nem prova comportamento do Chrome real. `chrome.storage`, `chrome.alarms`, `chrome.tabs`, `chrome.runtime` e `chrome.downloads` são mocks.

## 2. Dependências e implementação real investigadas

### 2.1 `extension/background.js`

SHA observado durante a auditoria: `667c05eb2d7adfca16a79d3e706c39a1e9398b72`.

Comportamentos relevantes confirmados por leitura:

- `restoreState()` delega ao state module e aplica o snapshot restaurado;
- `syncState()` delega ao state module;
- `log()` enfileira entradas com ID `Date.now() + Math.random()`;
- `_flushLog()` drena a fila, concatena com `translatorLog`, limita a 500 e grava em storage;
- `armWatchdog()` e `clearWatchdog()` delegam ao módulo real de watchdog.

### 2.2 `extension/background/state.js`

SHA observado: `7570b545d5e92496201a7741dee8605cd66fb015`.

Pontos que explicam as assertions:

- `patch(nextState)` só altera propriedades que realmente existem em `nextState`;
- `restoreState()` retorna `null` se `mt_state` não existe/falsy;
- `syncState()` tira um snapshot e serializa as escritas usando `_persistenceChain.then(write, write)`;
- por isso chamadas concorrentes são encadeadas, e o último snapshot submetido deve vencer.

### 2.3 `extension/background/jobs-watchdog.js`

SHA observado: `c17b766d7fbc34ea925fb82b19149d3d977de413`.

O `arm()` real:

- resolve o tab canônico;
- limpa o alarme de mesmo nome;
- grava `wd_data_<tabId>`;
- cria o alarme com `delayInMinutes`;
- revalida identidade depois da escrita para fechar a janela de migração de tab.

O `clear()` real:

- chama `chrome.alarms.clear`;
- no callback remove `wd_data_<geminiTabId>`.

### 2.4 Loader instrumentado

Arquivo: `tests/helpers/load-background-module.js`  
SHA observado: `b1a20544a10b3b1410f4b3e9c2be6f53b7ac3113`.

O loader lê os bytes reais de `background.js`, acrescenta getters/setters e exports destinados ao teste e executa o módulo resultante. Isso permite chamar `restoreState`, `syncState`, `log`, `armWatchdog`, `clearWatchdog`, `__getState` e `__setState`.

**Classificação correta:** implementação funcional real com **ponte de instrumentação de teste**. Não é correto descrevê-la como carregamento de produção sem alterações de visibilidade.

### 2.5 Helpers e mocks

- `tests/helpers/background-test-utils.js`, SHA `1c38cfc47917f2a42788c467b9dbf58648b73e2b`: fornece `BACKGROUND_PATH`, `flush` e `waitFor`.
- `tests/mocks/chrome-api.mock.js`, SHA `c1d9a056b7777183bfd3f540c49811335f410425`: fornece os mocks de runtime/storage/alarms/tabs/downloads.
- `jest.config.js`, SHA `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`: inclui `tests/unit/background/**/*.test.js` no projeto `background`.

## 3. Setup e isolamento

Cada teste:

1. chama `jest.resetModules()`;
2. recupera os mocks compartilhados;
3. zera arrays de listeners do runtime e `lastError`;
4. limpa storage;
5. reconstrói `global.chrome`;
6. carrega o background real instrumentado;
7. executa vários ticks de event loop via `flush(8)`.

Após cada teste:

- todos os alarmes são limpos;
- o storage é limpo;
- spies/mocks Jest são restaurados.

A suíte preserva `global.chrome?.scripting` do ambiente já existente, o que é uma dependência de setup externa, embora nenhum caso desta suíte faça assertion sobre scripting.

## 4. Matriz de evidência

| Comportamento | Evidência no arquivo | Classificação |
|---|---|---|
| ausência de `mt_state` preserva estado residente | BG-01, linhas 58–82 | ✅ PROVADO DIRETAMENTE |
| snapshot parcial altera apenas campos presentes | BG-02, linhas 84–101 | ✅ PROVADO DIRETAMENTE |
| `syncState` + `restoreState` fazem round-trip | BG-03, linhas 104–131 | ✅ PROVADO DIRETAMENTE |
| dez syncs concorrentes terminam com o último snapshot esperado | BG-04, linhas 133–160 | ✅ PROVADO DIRETAMENTE |
| uma entrada de log é persistida com uma chamada relevante de set | linhas 163–174 | ✅ PROVADO DIRETAMENTE |
| burst de 20 entradas é persistido com no máximo duas escritas de log | linhas 176–190 | ✅ PROVADO DIRETAMENTE |
| as 20 entradas observadas naquele burst têm IDs distintos | linhas 192–194 | ✅ PROVADO DIRETAMENTE para a amostra executada |
| unicidade absoluta dos IDs diante de colisão de tempo/aleatoriedade | não há injeção determinística de colisão | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `_logFlushing=true` mantém nova entrada na fila | linhas 196–199 via instrumentação interna | ✅ PROVADO DIRETAMENTE |
| log é limitado a 500 e remove os cinco mais antigos | linhas 202–225 | ✅ PROVADO DIRETAMENTE |
| após uma falha de `storage.set`, o flag de flush volta a false | linhas 227–242 | ✅ PROVADO DIRETAMENTE |
| depois da falha, uma nova entrada pode voltar a ser persistida | linhas 244–250 | ✅ PROVADO DIRETAMENTE |
| a entrada cujo write falhou é preservada/retry | nenhuma assertion; implementação drena antes de escrever | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| primeiro `armWatchdog` cria alarme de 5 min e persiste metadata | linhas 253–264 | ✅ PROVADO DIRETAMENTE |
| rearme limpa um alarme e atualiza o metadata | linhas 266–272 | ✅ PROVADO DIRETAMENTE |
| clear remove metadata e deixa alarme ausente | linhas 274–279 | ✅ PROVADO DIRETAMENTE |
| clear com undefined/null não lança | linhas 281–282 | ✅ PROVADO DIRETAMENTE |
| clear undefined/null é side-effect free | não há assertion de chamadas inexistentes | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| execução em Chrome real | APIs são mocks | 🟨 EXECUTADO INDIRETAMENTE apenas quanto à lógica interna, não ao navegador |

## 5. Análise dos testes de estado

### 5.1 BG-01 — ausência de snapshot

O teste semeia o estado residente com fila, flags, tab ativo, extraction tabs e contadores. Depois grava `mt_state: undefined` no mock e chama `restoreState()`.

A assertion exige que todos os valores residentes permaneçam. Isso está alinhado com `state.js`, cujo `restoreState()` retorna `null` quando `d.mt_state` é falsy.

**Força:** prova direta da implementação real carregada pelo loader.

### 5.2 BG-02 — patch parcial

O storage passa a conter apenas:

- nova `jobQueue`;
- novo `completedJobs`.

Após restore, a suíte exige que esses dois campos mudem e que os demais valores residentes continuem intactos.

Isso prova a semântica essencial de `patch`: ausência de uma propriedade não equivale a reset dessa propriedade.

### 5.3 BG-03 — round-trip

O teste persiste um snapshot, destrói o estado residente e restaura do storage. A assertion usa `objectContaining(original)`.

Isso prova que o conjunto de campos incluído em `original` atravessa a ida e volta. Não prova igualdade exata de todos os campos internos do state module, porque `objectContaining` permite propriedades adicionais.

### 5.4 BG-04 — concorrência

São construídos dez snapshots sucessivos; cada `syncState()` é disparado sem await imediato e todas as Promises são aguardadas no fim.

O resultado esperado é o snapshot do índice 9. A implementação real captura o snapshot antes de enfileirar o write e usa uma promise chain para serializar.

**Prova direta:** o storage termina com os campos esperados do último snapshot.

**Limite:** o teste prova essa ordem de submissão e o mock de storage; não simula reorder/falha real da API Chrome.

## 6. Análise dos testes de logging

### 6.1 Batching básico

Uma entrada `ONE` é emitida, `waitFor` aguarda sua persistência e o spy exige exatamente uma chamada de `set` contendo `translatorLog`.

Depois, vinte chamadas síncronas `BURST` são emitidas. A suíte aguarda 20 entradas e exige no máximo duas escritas relevantes.

Isso prova que o logger atual agrega o burst no ambiente simulado, sem exigir uma quantidade exata de batches.

### 6.2 IDs

A suíte cria um `Set` dos 20 IDs e exige cardinalidade 20.

A implementação gera IDs com:

`${Date.now()}_${Math.random()}`.

A assertion prova que **nesta execução** não houve colisão. Ela não transforma o esquema probabilístico em uma garantia matemática de unicidade e não injeta `Date.now`/`Math.random` iguais para testar colisão.

### 6.3 Trava de flush via estado interno

O teste força `_logFlushing: true` e `_logQueue: []` pela ponte `__setState`. Depois chama `log()` e verifica que a entrada fica na fila e o flag permanece true.

Isso é prova direta de uma branch interna da implementação real, mas depende de acesso de instrumentação que o runtime de produção não expõe.

### 6.4 Cap de 500

O storage recebe 495 entradas antigas. Dez novas são emitidas.

O teste exige:

- total final 500;
- primeira entrada `old-5`;
- última entrada `new-9`.

Isso prova não apenas o cap, mas também que o recorte remove precisamente as cinco entradas mais antigas nesse cenário.

### 6.5 Falha no flush: recuperação operacional ≠ recuperação de dados

O spy de `storage.set` rejeita a primeira escrita que contém `translatorLog`.

Depois:

- a suíte exige `_logFlushing === false`;
- emite **outra** entrada, `RECOVERED`;
- exige que a segunda entrada apareça no storage.

Isso prova que o logger não fica permanentemente travado após a exceção.

Contudo, a implementação de `_flushLog()` faz `splice(0, _logQueue.length)` antes do `storage.set`. Se o write rejeita, o batch já foi retirado da fila e o `catch` não o recoloca. Logo a entrada `FAIL_ONCE` pode ser perdida silenciosamente.

A suíte não exige a sobrevivência dessa primeira entrada. Portanto, “recuperação” deve ser interpretada como recuperação da **capacidade futura de gravar**, não como retry/durabilidade do batch falhado.

## 7. Análise dos testes de watchdog

### 7.1 Arm inicial

`armWatchdog(55, 8, 2001)` deve:

- criar `watchdog_2001` com 5 minutos;
- persistir `wd_data_2001` com os três campos esperados.

A suíte verifica ambas as propriedades diretamente.

### 7.2 Rearme

O segundo arm usa o mesmo geminiTabId e índice 9.

A suíte exige:

- que `alarms.clear('watchdog_2001', callback)` tenha ocorrido;
- que o storage termine com índice 9.

Ela não compara explicitamente `invocationCallOrder` entre clear e create, então não congela a ordem temporal como assertion, embora a implementação atual limpe antes de criar.

### 7.3 Clear

Após `clearWatchdog(2001)`, a suíte exige:

- `storage.remove('wd_data_2001')`;
- nenhum alarme com esse nome;
- storage retornando `undefined` para a key.

Isso é uma prova direta do efeito observado nos mocks.

### 7.4 Inputs undefined/null

As duas últimas assertions exigem apenas `not.toThrow()`.

A implementação atual ainda pode formar nomes/keys como `watchdog_undefined` e `wd_data_undefined`, porque não existe guard explícito no wrapper/clear mostrado. O teste não determina se esses side effects são permitidos ou indesejados.

## 8. Trust boundaries e limites da prova

1. **Mocks de Chrome:** o contrato do mock pode divergir de Chrome real.
2. **Loader instrumentado:** getters/exports adicionais permitem acessar estado interno indisponível em produção.
3. **Timers/polling:** `flush` e `waitFor` dependem de scheduling do Node/Jest.
4. **Aleatoriedade:** IDs dependem de `Date.now` e `Math.random`.
5. **Falhas de storage:** o teste injeta Promise rejection em um mock, útil para branch de erro, mas não representa todas as variantes de `runtime.lastError`/callback API.
6. **Watchdog:** comportamento de alarmes é simulado; suspensão/restart do service worker não é exercitada aqui.
7. **CI concorrente:** durante esta auditoria o branch recebeu commits de vários agentes; esta Bíblia não inventa um run verde contemporâneo.

## 9. Lacunas e solicitações ao auditor

### 149-001 — ROBUSTNESS_REVIEW — NORMAL

**Encontrado:** `_flushLog()` remove o batch da fila antes de `storage.set`; se a escrita rejeitar, o catch não reencola as entradas.

**Evidência atual:** BG-10 prova que `_logFlushing` volta a false e que uma entrada posterior é persistida.

**Evidência ausente:** prova de que a entrada `FAIL_ONCE` reaparece, ou contrato explícito declarando perda best-effort aceitável.

**Risco:** logs diagnósticos podem desaparecer durante falha transitória de storage.

### 149-002 — CONTRACT_REVIEW — NORMAL

**Encontrado:** o teste chama a propriedade de “ids únicos”, mas a geração real combina relógio e `Math.random` sem mecanismo de deduplicação.

**Evidência atual:** 20 IDs de uma execução são distintos.

**Evidência ausente:** cenário determinístico de colisão e decisão sobre o contrato desejado.

**Risco:** consumidores podem assumir unicidade absoluta que a implementação não garante.

### 149-003 — TEST_REQUIRED — LOW

**Encontrado:** rearme verifica que `clear` ocorreu e que o estado final foi atualizado, mas não prova a ordem `clear → create`.

**Evidência ausente:** assertion por call order ou cenário equivalente que falhe se o alarme for criado antes da limpeza.

**Risco:** regressão de ordenação pode alterar janela/semântica do watchdog sem quebrar a assertion final.

### 149-004 — CONTRACT_REVIEW — LOW

**Encontrado:** `clearWatchdog(undefined/null)` só é testado como “não lança”; side effects sobre nomes/keys sintéticos não são verificados.

**Evidência ausente:** decisão explícita se entradas inválidas devem ser no-op e assertion sobre ausência/presença de chamadas.

**Risco:** chamadas inválidas podem produzir operações em `watchdog_undefined`/`wd_data_undefined` sem serem detectadas.

## 10. Invariantes documentados

1. Ausência de snapshot não deve apagar trabalho residente.
2. Restore parcial só deve alterar campos presentes no snapshot persistido.
3. `syncState` concorrente deve preservar ordem de submissão definida pela persistence chain.
4. Logger não deve exceder 500 entradas persistidas.
5. Um burst deve ser agregável sem uma escrita por entrada.
6. Falha de flush não deve deixar `_logFlushing` permanentemente true.
7. A política sobre perda/retry do batch falhado precisa permanecer explícita.
8. Watchdog deve persistir metadata coerente com o tab/index armado.
9. Rearme do mesmo watchdog deve substituir seu estado de forma consistente.
10. Clear deve remover alarm e metadata correspondente.
11. Provas baseadas em mocks não devem ser promovidas a prova de Chrome real.
12. Acesso a `__getState/__setState` deve ser classificado como instrumentação.
13. A Bíblia vale somente para o SHA `668cef7f592231856d5071bd35ff6c5c12848a41`.

## 11. Fonte integral auditada

~~~javascript
const {
    getRuntimeMock,
    getStorageMock,
    getAlarmsMock,
    getTabsMock,
    getDownloadsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const {
    BACKGROUND_PATH,
    flush,
    waitFor,
} = require('../../helpers/background-test-utils.js');

describe('background.js - helpers reais', () => {
    let runtimeMock;
    let storageMock;
    let alarmsMock;
    let tabsMock;
    let downloadsMock;
    let backgroundModule;

    beforeEach(async () => {
        jest.resetModules();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        alarmsMock = getAlarmsMock();
        tabsMock = getTabsMock();
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
        alarmsMock.clearAll();
        await storageMock.clear();
        jest.restoreAllMocks();
    });

    test('BG-01/BG-02: restoreState preserva campos residentes ausentes e aplica somente o snapshot persistido', async () => {
        backgroundModule.__setState({
            jobQueue: [{ mangaTabId: 9, index: 9, prompt: 'stale' }],
            isProcessing: true,
            stopRequested: true,
            activeMangaTabId: 9,
            extractionTabs: { 5000: { index: 9 } },
            totalJobs: 9,
            completedJobs: 8,
            activeJobsCount: 7,
        });

        await storageMock.set({ mt_state: undefined });
        await backgroundModule.restoreState();

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            jobQueue: [{ mangaTabId: 9, index: 9, prompt: 'stale' }],
            isProcessing: true,
            stopRequested: true,
            activeMangaTabId: 9,
            extractionTabs: { 5000: { index: 9 } },
            totalJobs: 9,
            completedJobs: 8,
            activeJobsCount: 7,
        }));

        await storageMock.set({
            mt_state: {
                jobQueue: [{ mangaTabId: 11, index: 2, prompt: 'novo' }],
                completedJobs: 3,
            },
        });
        await backgroundModule.restoreState();

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
            jobQueue: [{ mangaTabId: 11, index: 2, prompt: 'novo' }],
            isProcessing: true,
            stopRequested: true,
            activeMangaTabId: 9,
            extractionTabs: { 5000: { index: 9 } },
            totalJobs: 9,
            completedJobs: 3,
            activeJobsCount: 7,
        }));
    });

    test('BG-03/BG-04: syncState faz round-trip consistente e suporta concorrencia', async () => {
        const original = {
            jobQueue: [{ mangaTabId: 1, index: 7, prompt: 'a' }],
            isProcessing: true,
            stopRequested: false,
            activeMangaTabId: 1,
            extractionTabs: { 1234: { mangaTabId: 1, index: 7, geminiTabId: 321 } },
            totalJobs: 10,
            completedJobs: 4,
            activeJobsCount: 2,
        };

        backgroundModule.__setState(original);
        await backgroundModule.syncState();

        backgroundModule.__setState({
            jobQueue: [],
            isProcessing: false,
            stopRequested: true,
            activeMangaTabId: null,
            extractionTabs: {},
            totalJobs: 0,
            completedJobs: 0,
            activeJobsCount: 0,
        });
        await backgroundModule.restoreState();

        expect(backgroundModule.__getState()).toEqual(expect.objectContaining(original));

        const syncPromises = [];
        for (let index = 0; index < 10; index++) {
            backgroundModule.__setState({
                jobQueue: [{ mangaTabId: index, index, prompt: `p-${index}` }],
                isProcessing: index % 2 === 0,
                stopRequested: index % 3 === 0,
                activeMangaTabId: index,
                extractionTabs: {},
                totalJobs: index + 1,
                completedJobs: index,
                activeJobsCount: index % 4,
            });
            syncPromises.push(backgroundModule.syncState());
        }

        await Promise.all(syncPromises);

        const data = await storageMock.get(['mt_state']);
        expect(data.mt_state).toEqual(expect.objectContaining({
            jobQueue: [{ mangaTabId: 9, index: 9, prompt: 'p-9' }],
            isProcessing: false,
            stopRequested: true,
            activeMangaTabId: 9,
            extractionTabs: {},
            totalJobs: 10,
            completedJobs: 9,
            activeJobsCount: 1,
        }));
    });

    test('BG-05/BG-06/BG-08/BG-09: log faz batching, ids únicos e respeita a trava de flush', async () => {
        const setSpy = jest.spyOn(storageMock, 'set');
        setSpy.mockClear();

        backgroundModule.log('info', 'bg', 'ONE', 'primeira');
        await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            return (data.translatorLog || []).length === 1 ? data.translatorLog : null;
        });

        let translatorLogSetCalls = setSpy.mock.calls.filter(([items]) => items && items.translatorLog);
        expect(translatorLogSetCalls).toHaveLength(1);

        setSpy.mockClear();
        await storageMock.set({ translatorLog: [] });
        setSpy.mockClear();

        for (let index = 0; index < 20; index++) {
            backgroundModule.log('info', 'bg', 'BURST', `burst-${index}`, { index });
        }

        const burstEntries = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            return (data.translatorLog || []).length === 20 ? data.translatorLog : null;
        });

        translatorLogSetCalls = setSpy.mock.calls.filter(([items]) => items && items.translatorLog);
        expect(translatorLogSetCalls.length).toBeLessThanOrEqual(2);

        const uniqueIds = new Set();
        burstEntries.forEach(entry => uniqueIds.add(entry.id));
        expect(uniqueIds.size).toBe(20);

        backgroundModule.__setState({ _logFlushing: true, _logQueue: [] });
        backgroundModule.log('info', 'bg', 'QUEUED', 'travado');
        expect(backgroundModule.__getState()._logQueue).toHaveLength(1);
        expect(backgroundModule.__getState()._logFlushing).toBe(true);
    });

    test('BG-07/BG-10: cap de 500 entradas e recuperacao apos falha no flush', async () => {
        const existing = Array.from({ length: 495 }, (_, index) => ({
            id: index,
            ts: index,
            level: 'info',
            source: 'seed',
            action: 'OLD',
            detail: `old-${index}`,
            extra: {},
        }));
        await storageMock.set({ translatorLog: existing });

        for (let index = 0; index < 10; index++) {
            backgroundModule.log('warn', 'bg', 'NEW', `new-${index}`);
        }

        const capped = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            return (data.translatorLog || []).length === 500 ? data.translatorLog : null;
        });

        expect(capped).toHaveLength(500);
        expect(capped[0].detail).toBe('old-5');
        expect(capped[499].detail).toBe('new-9');

        await storageMock.set({ translatorLog: [] });
        backgroundModule.__setState({ _logQueue: [], _logFlushing: false });
        const originalSet = storageMock.set.bind(storageMock);
        let failedOnce = false;
        jest.spyOn(storageMock, 'set').mockImplementation((items, callback) => {
            if (!failedOnce && items && items.translatorLog) {
                failedOnce = true;
                return Promise.reject(new Error('storage down'));
            }
            return originalSet(items, callback);
        });

        backgroundModule.log('error', 'bg', 'FAIL_ONCE', 'primeira falha');
        await flush(8);

        expect(backgroundModule.__getState()._logFlushing).toBe(false);

        backgroundModule.log('info', 'bg', 'RECOVERED', 'segunda entrada');
        const recovered = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            return (data.translatorLog || []).length >= 1 ? data.translatorLog : null;
        });

        expect(recovered.some(entry => entry.detail === 'segunda entrada')).toBe(true);
    });

    test('BG-11/BG-12/BG-13/BG-14/BG-15: armWatchdog e clearWatchdog orquestram alarme e storage', async () => {
        const createSpy = jest.spyOn(alarmsMock, 'create');
        const clearSpy = jest.spyOn(alarmsMock, 'clear');
        const removeSpy = jest.spyOn(storageMock, 'remove');

        backgroundModule.armWatchdog(55, 8, 2001);
        await flush(4);

        expect(createSpy).toHaveBeenCalledWith('watchdog_2001', { delayInMinutes: 5 });
        expect(await storageMock.get(['wd_data_2001'])).toEqual({
            wd_data_2001: { mangaTabId: 55, index: 8, geminiTabId: 2001 },
        });

        backgroundModule.armWatchdog(55, 9, 2001);
        await flush(4);

        expect(clearSpy).toHaveBeenCalledWith('watchdog_2001', expect.any(Function));
        expect(await storageMock.get(['wd_data_2001'])).toEqual({
            wd_data_2001: { mangaTabId: 55, index: 9, geminiTabId: 2001 },
        });

        backgroundModule.clearWatchdog(2001);
        await flush(4);

        expect(removeSpy).toHaveBeenCalledWith('wd_data_2001');
        expect(await alarmsMock.get('watchdog_2001')).toBeNull();
        expect(await storageMock.get(['wd_data_2001'])).toEqual({ wd_data_2001: undefined });

        expect(() => backgroundModule.clearWatchdog(undefined)).not.toThrow();
        expect(() => backgroundModule.clearWatchdog(null)).not.toThrow();
    });
});
~~~

## 12. Cobertura documental por posições

A fonte tem **284 linhas textuais** e termina com newline; portanto há **285 posições documentais**. As faixas abaixo são contíguas e cobrem 1–285 sem lacunas.

### Posições 1–14 — imports e separação

~~~text
1: const {
2:     getRuntimeMock,
3:     getStorageMock,
4:     getAlarmsMock,
5:     getTabsMock,
6:     getDownloadsMock,
7: } = require('../../mocks/chrome-api.mock.js');
8: const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
9: const {
10:     BACKGROUND_PATH,
11:     flush,
12:     waitFor,
13: } = require('../../helpers/background-test-utils.js');
14: ␠
~~~

Importa os factories de mocks Chrome, o loader instrumentado do background e os helpers de caminho/timing. A posição 14 é linha vazia de separação.

### Posições 15–22 — escopo da suíte e referências mutáveis

~~~text
15: describe('background.js - helpers reais', () => {
16:     let runtimeMock;
17:     let storageMock;
18:     let alarmsMock;
19:     let tabsMock;
20:     let downloadsMock;
21:     let backgroundModule;
22: ␠
~~~

Declara a suíte e variáveis que receberão mocks e módulo em cada teste. Não há estado funcional próprio além das referências de setup.

### Posições 23–50 — `beforeEach`

~~~text
23:     beforeEach(async () => {
24:         jest.resetModules();
25: ␠
26:         runtimeMock = getRuntimeMock();
27:         storageMock = getStorageMock();
28:         alarmsMock = getAlarmsMock();
29:         tabsMock = getTabsMock();
30:         downloadsMock = getDownloadsMock();
31: ␠
32:         runtimeMock._messageListeners = [];
33:         runtimeMock._connectListeners = [];
34:         runtimeMock._installedListeners = [];
35:         runtimeMock._startupListeners = [];
36:         runtimeMock.lastError = null;
37: ␠
38:         await storageMock.clear();
39:         global.chrome = {
40:             storage: { local: storageMock },
41:             tabs: tabsMock,
42:             alarms: alarmsMock,
43:             runtime: runtimeMock,
44:             downloads: downloadsMock,
45:             scripting: global.chrome?.scripting,
46:         };
47: ␠
48:         backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
49:         await flush(8);
50:     });
~~~

Reseta módulos, recupera mocks, limpa listeners/storage, monta `global.chrome`, carrega o background real instrumentado e permite que tarefas assíncronas iniciais avancem.

**Evidência:** 🟨 setup executado por todos os casos; não é uma propriedade funcional isolada.

### Posições 51–57 — cleanup

~~~text
51: ␠
52:     afterEach(async () => {
53:         alarmsMock.clearAll();
54:         await storageMock.clear();
55:         jest.restoreAllMocks();
56:     });
57: ␠
~~~

Limpa alarmes, storage e spies depois de cada caso. A linha 57 é separação visual.

### Posições 58–69 — estado residente inicial de BG-01

~~~text
58:     test('BG-01/BG-02: restoreState preserva campos residentes ausentes e aplica somente o snapshot persistido', async () => {
59:         backgroundModule.__setState({
60:             jobQueue: [{ mangaTabId: 9, index: 9, prompt: 'stale' }],
61:             isProcessing: true,
62:             stopRequested: true,
63:             activeMangaTabId: 9,
64:             extractionTabs: { 5000: { index: 9 } },
65:             totalJobs: 9,
66:             completedJobs: 8,
67:             activeJobsCount: 7,
68:         });
69: ␠
~~~

Semeia valores deliberadamente não-default para detectar reset indevido durante restore.

### Posições 70–83 — restore sem snapshot persistido

~~~text
70:         await storageMock.set({ mt_state: undefined });
71:         await backgroundModule.restoreState();
72: ␠
73:         expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
74:             jobQueue: [{ mangaTabId: 9, index: 9, prompt: 'stale' }],
75:             isProcessing: true,
76:             stopRequested: true,
77:             activeMangaTabId: 9,
78:             extractionTabs: { 5000: { index: 9 } },
79:             totalJobs: 9,
80:             completedJobs: 8,
81:             activeJobsCount: 7,
82:         }));
83: ␠
~~~

Grava `mt_state: undefined`, chama restore real e exige preservação dos campos residentes.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 84–103 — restore parcial

~~~text
84:         await storageMock.set({
85:             mt_state: {
86:                 jobQueue: [{ mangaTabId: 11, index: 2, prompt: 'novo' }],
87:                 completedJobs: 3,
88:             },
89:         });
90:         await backgroundModule.restoreState();
91: ␠
92:         expect(backgroundModule.__getState()).toEqual(expect.objectContaining({
93:             jobQueue: [{ mangaTabId: 11, index: 2, prompt: 'novo' }],
94:             isProcessing: true,
95:             stopRequested: true,
96:             activeMangaTabId: 9,
97:             extractionTabs: { 5000: { index: 9 } },
98:             totalJobs: 9,
99:             completedJobs: 3,
100:             activeJobsCount: 7,
101:         }));
102:     });
103: ␠
~~~

Persiste somente `jobQueue` e `completedJobs`; após restore, exige que só esses valores mudem entre os campos observados.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 104–115 — snapshot original de round-trip

~~~text
104:     test('BG-03/BG-04: syncState faz round-trip consistente e suporta concorrencia', async () => {
105:         const original = {
106:             jobQueue: [{ mangaTabId: 1, index: 7, prompt: 'a' }],
107:             isProcessing: true,
108:             stopRequested: false,
109:             activeMangaTabId: 1,
110:             extractionTabs: { 1234: { mangaTabId: 1, index: 7, geminiTabId: 321 } },
111:             totalJobs: 10,
112:             completedJobs: 4,
113:             activeJobsCount: 2,
114:         };
115: ␠
~~~

Define o objeto usado para a ida ao storage e volta ao estado residente.

### Posições 116–132 — persistir, destruir e restaurar

~~~text
116:         backgroundModule.__setState(original);
117:         await backgroundModule.syncState();
118: ␠
119:         backgroundModule.__setState({
120:             jobQueue: [],
121:             isProcessing: false,
122:             stopRequested: true,
123:             activeMangaTabId: null,
124:             extractionTabs: {},
125:             totalJobs: 0,
126:             completedJobs: 0,
127:             activeJobsCount: 0,
128:         });
129:         await backgroundModule.restoreState();
130: ␠
131:         expect(backgroundModule.__getState()).toEqual(expect.objectContaining(original));
132: ␠
~~~

Executa `syncState`, substitui o estado por zeros/defaults, restaura e exige `objectContaining(original)`.

**Evidência:** ✅ PROVADO DIRETAMENTE para os campos do objeto original.

### Posições 133–162 — dez syncs concorrentes

~~~text
133:         const syncPromises = [];
134:         for (let index = 0; index < 10; index++) {
135:             backgroundModule.__setState({
136:                 jobQueue: [{ mangaTabId: index, index, prompt: `p-${index}` }],
137:                 isProcessing: index % 2 === 0,
138:                 stopRequested: index % 3 === 0,
139:                 activeMangaTabId: index,
140:                 extractionTabs: {},
141:                 totalJobs: index + 1,
142:                 completedJobs: index,
143:                 activeJobsCount: index % 4,
144:             });
145:             syncPromises.push(backgroundModule.syncState());
146:         }
147: ␠
148:         await Promise.all(syncPromises);
149: ␠
150:         const data = await storageMock.get(['mt_state']);
151:         expect(data.mt_state).toEqual(expect.objectContaining({
152:             jobQueue: [{ mangaTabId: 9, index: 9, prompt: 'p-9' }],
153:             isProcessing: false,
154:             stopRequested: true,
155:             activeMangaTabId: 9,
156:             extractionTabs: {},
157:             totalJobs: 10,
158:             completedJobs: 9,
159:             activeJobsCount: 1,
160:         }));
161:     });
162: ␠
~~~

Dispara dez snapshots em sequência sem aguardar cada write individual; depois `Promise.all` e storage final devem refletir índice 9.

**Evidência:** ✅ PROVADO DIRETAMENTE no mock + implementation real.

### Posições 163–175 — log unitário

~~~text
163:     test('BG-05/BG-06/BG-08/BG-09: log faz batching, ids únicos e respeita a trava de flush', async () => {
164:         const setSpy = jest.spyOn(storageMock, 'set');
165:         setSpy.mockClear();
166: ␠
167:         backgroundModule.log('info', 'bg', 'ONE', 'primeira');
168:         await waitFor(async () => {
169:             const data = await storageMock.get(['translatorLog']);
170:             return (data.translatorLog || []).length === 1 ? data.translatorLog : null;
171:         });
172: ␠
173:         let translatorLogSetCalls = setSpy.mock.calls.filter(([items]) => items && items.translatorLog);
174:         expect(translatorLogSetCalls).toHaveLength(1);
175: ␠
~~~

Espiona `storage.set`, emite uma entrada e aguarda a persistência. Exige uma chamada relevante.

### Posições 176–195 — burst, batching e IDs observados

~~~text
176:         setSpy.mockClear();
177:         await storageMock.set({ translatorLog: [] });
178:         setSpy.mockClear();
179: ␠
180:         for (let index = 0; index < 20; index++) {
181:             backgroundModule.log('info', 'bg', 'BURST', `burst-${index}`, { index });
182:         }
183: ␠
184:         const burstEntries = await waitFor(async () => {
185:             const data = await storageMock.get(['translatorLog']);
186:             return (data.translatorLog || []).length === 20 ? data.translatorLog : null;
187:         });
188: ␠
189:         translatorLogSetCalls = setSpy.mock.calls.filter(([items]) => items && items.translatorLog);
190:         expect(translatorLogSetCalls.length).toBeLessThanOrEqual(2);
191: ␠
192:         const uniqueIds = new Set();
193:         burstEntries.forEach(entry => uniqueIds.add(entry.id));
194:         expect(uniqueIds.size).toBe(20);
195: ␠
~~~

Zera o log persistido, emite vinte entradas, aguarda todas, exige no máximo duas writes e vinte IDs distintos na amostra.

**Evidência:** ✅ direta para batching e amostra; ⚠️ não prova unicidade absoluta.

### Posições 196–201 — branch `_logFlushing`

~~~text
196:         backgroundModule.__setState({ _logFlushing: true, _logQueue: [] });
197:         backgroundModule.log('info', 'bg', 'QUEUED', 'travado');
198:         expect(backgroundModule.__getState()._logQueue).toHaveLength(1);
199:         expect(backgroundModule.__getState()._logFlushing).toBe(true);
200:     });
201: ␠
~~~

Força estado interno via instrumentação, emite uma entrada e exige que fique enfileirada enquanto o flag permanece true.

### Posições 202–213 — seed do limite de 500

~~~text
202:     test('BG-07/BG-10: cap de 500 entradas e recuperacao apos falha no flush', async () => {
203:         const existing = Array.from({ length: 495 }, (_, index) => ({
204:             id: index,
205:             ts: index,
206:             level: 'info',
207:             source: 'seed',
208:             action: 'OLD',
209:             detail: `old-${index}`,
210:             extra: {},
211:         }));
212:         await storageMock.set({ translatorLog: existing });
213: ␠
~~~

Cria 495 entradas ordenadas com detalhes identificáveis e persiste o seed.

### Posições 214–226 — corte exato para 500

~~~text
214:         for (let index = 0; index < 10; index++) {
215:             backgroundModule.log('warn', 'bg', 'NEW', `new-${index}`);
216:         }
217: ␠
218:         const capped = await waitFor(async () => {
219:             const data = await storageMock.get(['translatorLog']);
220:             return (data.translatorLog || []).length === 500 ? data.translatorLog : null;
221:         });
222: ␠
223:         expect(capped).toHaveLength(500);
224:         expect(capped[0].detail).toBe('old-5');
225:         expect(capped[499].detail).toBe('new-9');
226: ␠
~~~

Adiciona dez entradas e exige total 500, primeiro `old-5` e último `new-9`.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 227–238 — injeção de falha no primeiro write de log

~~~text
227:         await storageMock.set({ translatorLog: [] });
228:         backgroundModule.__setState({ _logQueue: [], _logFlushing: false });
229:         const originalSet = storageMock.set.bind(storageMock);
230:         let failedOnce = false;
231:         jest.spyOn(storageMock, 'set').mockImplementation((items, callback) => {
232:             if (!failedOnce && items && items.translatorLog) {
233:                 failedOnce = true;
234:                 return Promise.reject(new Error('storage down'));
235:             }
236:             return originalSet(items, callback);
237:         });
238: ␠
~~~

Limpa o log/estado interno e substitui `storage.set` por spy que rejeita exatamente a primeira gravação de `translatorLog`.

### Posições 239–252 — recuperação operacional após falha

~~~text
239:         backgroundModule.log('error', 'bg', 'FAIL_ONCE', 'primeira falha');
240:         await flush(8);
241: ␠
242:         expect(backgroundModule.__getState()._logFlushing).toBe(false);
243: ␠
244:         backgroundModule.log('info', 'bg', 'RECOVERED', 'segunda entrada');
245:         const recovered = await waitFor(async () => {
246:             const data = await storageMock.get(['translatorLog']);
247:             return (data.translatorLog || []).length >= 1 ? data.translatorLog : null;
248:         });
249: ␠
250:         expect(recovered.some(entry => entry.detail === 'segunda entrada')).toBe(true);
251:     });
252: ␠
~~~

Emite a entrada que falha, confirma que o flag destrava, emite uma segunda entrada e exige que esta nova entrada seja persistida.

**Importante:** não exige retry da primeira entrada.

### Posições 253–265 — primeiro arm do watchdog

~~~text
253:     test('BG-11/BG-12/BG-13/BG-14/BG-15: armWatchdog e clearWatchdog orquestram alarme e storage', async () => {
254:         const createSpy = jest.spyOn(alarmsMock, 'create');
255:         const clearSpy = jest.spyOn(alarmsMock, 'clear');
256:         const removeSpy = jest.spyOn(storageMock, 'remove');
257: ␠
258:         backgroundModule.armWatchdog(55, 8, 2001);
259:         await flush(4);
260: ␠
261:         expect(createSpy).toHaveBeenCalledWith('watchdog_2001', { delayInMinutes: 5 });
262:         expect(await storageMock.get(['wd_data_2001'])).toEqual({
263:             wd_data_2001: { mangaTabId: 55, index: 8, geminiTabId: 2001 },
264:         });
265: ␠
~~~

Cria spies, arma o watchdog e prova nome/timeout do alarme e metadata persistido.

### Posições 266–273 — rearme

~~~text
266:         backgroundModule.armWatchdog(55, 9, 2001);
267:         await flush(4);
268: ␠
269:         expect(clearSpy).toHaveBeenCalledWith('watchdog_2001', expect.any(Function));
270:         expect(await storageMock.get(['wd_data_2001'])).toEqual({
271:             wd_data_2001: { mangaTabId: 55, index: 9, geminiTabId: 2001 },
272:         });
273: ␠
~~~

Arma novamente o mesmo tab com índice novo, prova chamada de clear e metadata final com índice 9.

### Posições 274–283 — clear e entradas inválidas

~~~text
274:         backgroundModule.clearWatchdog(2001);
275:         await flush(4);
276: ␠
277:         expect(removeSpy).toHaveBeenCalledWith('wd_data_2001');
278:         expect(await alarmsMock.get('watchdog_2001')).toBeNull();
279:         expect(await storageMock.get(['wd_data_2001'])).toEqual({ wd_data_2001: undefined });
280: ␠
281:         expect(() => backgroundModule.clearWatchdog(undefined)).not.toThrow();
282:         expect(() => backgroundModule.clearWatchdog(null)).not.toThrow();
283:     });
~~~

Limpa watchdog 2001 e prova remoção do alarme/storage. Depois exige apenas que undefined/null não lancem.

### Posições 284–285 — fechamento e newline final

~~~text
284: });
285: ␠
~~~

A posição 284 fecha o `describe`; a 285 representa o newline terminal.

## 13. Autoauditoria documental

- reserva relida e pertencente a **AGENTE 13**;
- state relido como **IN_PROGRESS / AGENTE 13**;
- SHA do fonte relido e igual ao state;
- fonte integral incorporada sem reconstrução manual;
- **285/285 posições** cobertas por faixas contíguas;
- `background.js`, state module, watchdog, loader e mocks lidos em modo read-only;
- assertions diretas separadas de inferências;
- mocks não promovidos a Chrome real;
- loader instrumentado identificado explicitamente;
- perda potencial de log em write falhado registrada, não corrigida;
- nenhuma alteração realizada em código, testes, fixtures, workflows, configs, STATUS, CHECKLIST ou AUDITORIA.

**Veredito da autoauditoria:** ✅ APROVADO para conclusão documental, com solicitações externas mantidas em `audit_requests`.

## 14. Revalidação de ownership — AGENTE 20 — 2026-09-30

O **AGENTE 20** assumiu explicitamente o índice **#149** por instrução do usuário e revalidou a Bíblia contra o blob atual.

### Resultado da revalidação

- fonte: `tests/unit/background/helpers-real.test.js`;
- SHA reconfirmado: `668cef7f592231856d5071bd35ff6c5c12848a41`;
- **284 linhas textuais + newline final = 285/285 posições documentais**;
- o fonte integral continua embutido nesta Bíblia sem divergência textual;
- permanece explícito que a lógica de `background.js` é real, mas carregada por ponte de instrumentação e executada com APIs Chrome mockadas;
- nenhuma execução contemporânea de CI foi inventada ou promovida a evidência;
- permanecem abertas as solicitações `149-001` a `149-004`, cobrindo durabilidade do log, contrato de IDs, ordenação do watchdog e side effects de inputs inválidos;
- nenhum código, teste, fixture, workflow ou configuração funcional foi alterado nesta revalidação.

**Veredito AGENTE 20:** ✅ Bíblia documentalmente concluída para o SHA acima, com quatro solicitações externas preservadas no state.

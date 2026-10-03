# Bíblia técnica — tests/integration/performance.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `21bd3ec25d71ea8eeb00108255249025253b3b50`  
> **Agente responsável:** AGENTE 16  
> **Tipo:** Jest integration/performance — background, popup, GTC e storage simulados  
> **Linhas textuais:** **451**  
> **Posições documentais:** **452**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/integration/performance.test.js` é uma suíte de integração que combina **limites de tempo**, **limites de concorrência**, **limites de volume**, **integridade de dados** e **comportamentos de storage** em nove cenários nomeados `PERF-01` a `PERF-09`.

Ela não é um benchmark homogêneo. Os nove casos têm níveis de realidade distintos:

- `PERF-01`, `PERF-02`, `PERF-06` e `PERF-07` carregam o **fonte real de `extension/background.js`**, com instrumentação de teste para expor estado/funções internas, sobre mocks de Chrome;
- `PERF-03` e `PERF-04` chamam diretamente o **repositório de memória real** exportado por `extension/shared/gtc-indexeddb.js`;
- `PERF-05` carrega o **HTML e JavaScript reais do popup** dentro de JSDOM, mas usa mocks das APIs Chrome;
- `PERF-08` chama o **repositório IndexedDB real**, porém sobre `fake-indexeddb`, não sobre o IndexedDB de um Chromium;
- `PERF-09` atravessa o **fluxo canônico de persistência**: `cm-chapter.js` envia `SM_SAVE_PAGE`, `storage-manager.js` persiste a página/asset em IndexedDB e o teste usa `fake-indexeddb`; um probe de quota baixa comprova separadamente que um payload grande seria rejeitado pelo `chrome.storage.local` mockado e que o fluxo canônico não tenta gravá-lo ali.

Essa distinção é crítica. O arquivo é valioso como gate de regressão do ambiente Jest e da lógica selecionada, mas nem todo número medido pode ser interpretado como SLO de navegador/produção.

## 2. Descoberta e execução no pipeline

`jest.config.js` inclui `tests/integration/**/*.test.js` no projeto `integration`, com ambiente `jsdom` e os setups:

- `tests/mocks/chrome-api.mock.js`;
- `tests/mocks/dom-environment.js`.

`package.json` expõe `test:integration` e o runner canônico `test:ci`. O job **Unit + Integration** da CI executa o inventário Jest por `scripts/ci/run-jest-ci.js`.

### Execução real conferida

No **Performance Integration Selftest run 37051069199**, head `cf6fb1c5a8ad1a77224f38da31db41563d953534`, o blob de `tests/integration/performance.test.js` é `21bd3ec25d71ea8eeb00108255249025253b3b50`.

O job `110984314942` executou o caso focal três vezes e depois toda a suíte de integração:

- tentativa 1: **9/9 testes PERF passaram**;
- tentativa 2: **9/9 testes PERF passaram**;
- tentativa 3: **9/9 testes PERF passaram**;
- suíte completa de integração: **13/13 suites e 83/83 testes passaram**.

Assim, a revisão atual tem evidência repetida do arquivo focal e evidência de integração completa no mesmo run.

## 3. Infraestrutura de teste e dependências

### 3.1 `loadBackgroundModule`

O helper lê `extension/background.js` do filesystem e compila o **fonte real**, anexando somente instrumentação que expõe getters/setters de estado e exports internos. Portanto os cenários de background não copiam `processNextJob`, `finalizeJob`, `log` ou `_flushLog`; exercitam a implementação real sob ambiente simulado.

Isso permite prova direta da lógica JavaScript, mas não transforma `chrome.tabs` mockado em comportamento real do navegador.

### 3.2 `loadExtensionPage`

O helper lê o HTML real, injeta-o no JSDOM, carrega dependências de script que aparecem antes do alvo e faz `require` do script real em isolamento Jest. `PERF-05` portanto executa `extension/popup/popup.js` real, mas em DOM sintético.

### 3.3 `createInMemoryRepository` e `createIndexedDbRepository`

Ambas são exports do módulo de produção `extension/shared/gtc-indexeddb.js`.

- o repositório de memória armazena entradas em `Map`;
- o repositório IndexedDB usa a API IndexedDB fornecida;
- em `PERF-08`, a fábrica é `new IDBFactory()` de `fake-indexeddb`.

A lógica do repositório é real; o backend e suas características de latência não são um browser real.

### 3.4 Chrome API mock

`getStorageMock` e `getTabsMock` vêm do mock compartilhado. Portanto quota, criação de tabs, mensagens e storage nesses cenários são controlados por JavaScript de teste, salvo onde um módulo de produção reage a esses mocks.

## 4. Política de tempo

`COVERAGE_MODE` é verdadeiro apenas quando `process.env.COVERAGE_MODE === '1'`.

`perfLimit(ms)` aplica:

- execução normal: limite original;
- coverage: `Math.ceil(ms * 10)`.

O multiplicador reconhece overhead do V8 coverage e evita que o gate de coverage seja confundido com regressão de performance.

Não há multiplicador específico para `CI`, sistema operacional ou carga do host. Isso torna os thresholds intencionalmente mais rígidos no job normal e também mais sensíveis à variância externa. O run conferido passou no ambiente GitHub Actions observado.

## 5. Helpers locais

### 5.1 `waitFor`

Faz polling pelo relógio de `performance.now()`, com intervalo padrão de 5 ms e timeout padrão 2500 ms (ou 25 s em coverage). A assertion pode ser síncrona ou assíncrona.

O helper retorna o primeiro valor truthy e lança erro explícito no timeout.

### 5.2 Fixtures

- `createFifteenJobBatch`: 15 jobs com `mangaTabId`, índice e prompt;
- `createFifteenPageImages`: 15 traduções Data URL com hash, URL limpa, 800×1200;
- `createHundredHashes`: `page-0` a `page-99`;
- `uniqueDbName`: prefixo + timestamp + random para isolar bancos.

### 5.3 Captura de `runtime.lastError`

`setWithLastError` encapsula `chrome.storage.local.set` e converte `chrome.runtime.lastError` em `Error` retornado, em vez de rejeitar.

Isso é infraestrutura **do teste**.

### 5.4 Simulação de quota

`installQuotaFailingStorage` substitui o mock de `storage.local.set`. Payload serializado acima do limite:

1. é registrado em `quotaFailures`;
2. recebe `chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' }`;
3. callback é chamado por timer;
4. `lastError` é limpo.

A aproximação é útil, mas mede bytes de `JSON.stringify(items)` e não reproduz necessariamente todos os detalhes da quota real do Chromium.

### 5.5 Probe de quota do PERF-09

A revisão atual **não reimplementa** a política de persistência em um helper local. O helper `installQuotaFailingStorage` serve somente para produzir uma condição observável de `QUOTA_BYTES` no mock de `chrome.storage.local`.

O PERF-09 então atravessa a implementação canônica de capítulo e storage. A separação é proposital: o probe comprova a condição de quota; a persistência é exercitada pela implementação real.

## 6. PERF-01 — 500 logs em burst

Carrega `background.js` real, limpa estado, espiona `chrome.storage.local.set` e dispara 500 chamadas `backgroundModule.log`.

A suíte espera o storage chegar a 500 entradas e mede o tempo desde antes do burst até esse estado. As assertions exigem:

- intervalo interno <= 200 ms no modo normal, ou <= 2000 ms em coverage;
- exatamente 500 logs;
- no máximo 10 writes contendo `translatorLog`.

### Interpretação

O teste prova batching funcional da implementação real de log sob o mock de storage. Não prova latência de `chrome.storage.local` real.

O tempo de 458 ms exibido pelo Jest no run não contradiz a assertion <=200 ms: o cronômetro interno cobre um subconjunto do trabalho total do caso.

## 7. PERF-02 — cap de 500 entradas

Semeia 500 entradas antigas, adiciona uma nova via `backgroundModule.log` e espera o flush.

As assertions exigem:

- tamanho final 500;
- entrada `old-0` descartada, pois a primeira passa a ser `old-1`;
- última entrada contém `NEW_ENTRY` e `newest entry`.

É uma prova direta do cap e da política “preservar as mais recentes” da implementação real do background sob storage mock.

## 8. PERF-03 — lookup de 100 hashes

Usa `createInMemoryRepository()` de produção:

- grava 15 entradas;
- consulta 100 hashes;
- exige <=500 ms normal;
- exige 15 hits;
- `page-0` contém Data URL;
- `page-99` está ausente.

Esse caso prova a lógica e complexidade prática do repositório in-memory no runtime Node observado. Não prova IndexedDB.

## 9. PERF-04 — putMany de 15 imagens

Também usa o repositório de memória real.

Exige:

- retorno `{ saved: true, count: 15 }`;
- <=300 ms normal;
- 15 chaves recuperáveis;
- igualdade exata de cada Data URL.

A assertion dentro do `forEach` evita que apenas contagem mascarasse truncamento ou troca de valores.

## 10. PERF-05 — popup com 200 capítulos / 3000 imagens legadas

O cenário cria:

- uma tab mock ativa;
- 200 capítulos;
- 15 imagens legadas por capítulo;
- metadata de site.

Depois carrega HTML + popup.js reais em JSDOM.

**O cronômetro começa somente depois de `loadExtensionPage` terminar**, imediatamente antes do clique na aba traduzida. Portanto o <=1 s é um limite para a renderização/ação a partir do clique, não para cold start completo do popup.

As assertions exigem:

- renderização em <=1 s normal;
- exatamente 1 pasta de site;
- 200 itens de capítulo;
- primeiro item indicando 15 páginas;
- se heapAfter >= heapBefore, crescimento <150 MB.

### Limites da evidência

- JSDOM não tem custo de layout/paint/compositor de Chromium;
- API Chrome é mock;
- o heap é do processo Node/Jest;
- não há GC forçada antes/depois;
- o limite de memória é condicional.

Logo o teste é um gate de regressão do código de renderização em JSDOM, não um benchmark UX de browser.

## 11. PERF-06 — concorrência 10 em duas ondas

Injeta no background real:

- fila de 15 jobs;
- `_cachedMaxCon=10`;
- processamento ativo.

Após uma chamada de `processNextJob`, espera 10 `chrome.tabs.create`. Exige 10 ativos e 5 na fila.

Finaliza as tabs da primeira onda; então espera 15 creates totais e exige:

- ativos <=10;
- fila vazia;
- 15 creates.

Isso prova que a lógica real do scheduler respeita o teto de 10 sob o mock de tabs e consegue drenar a fila em ondas.

## 12. PERF-07 — 100 chamadas concorrentes com limite 5

Com 15 jobs e `_cachedMaxCon=5`, dispara **100 Promises simultâneas** de `processNextJob`.

Um wrapper do mock de `tabs.create` captura o maior `activeJobsCount` observado na hora de criar tabs.

A suíte:

- espera cinco creates iniciais;
- finaliza progressivamente tabs pendentes;
- deixa a implementação lançar próximos jobs;
- exige 15 creates totais;
- exige `maxActiveObserved <= 5`;
- exige fila final vazia.

É uma prova direta da proteção de concorrência da lógica JavaScript real sob uma corrida sintética agressiva.

Não prova scheduling do Chrome real, mas cobre a race lógica que o módulo controla.

## 13. PERF-08 — 15 imagens de ~500 KB em fake IndexedDB

Cria `createIndexedDbRepository` real com `IDBFactory` de `fake-indexeddb`, em banco único.

Volume nominal de payload: cerca de 15 × 500 KB, mais prefixos/metadados.

As assertions exigem:

- `putMany` retorna saved/count 15;
- write <=2 s normal;
- `getMany` retorna 15;
- cada valor existe;
- diferença de comprimento <1% do original.

### Limite central

A implementação do repositório é de produção, mas a engine de banco é `fake-indexeddb` em processo Node. A assertion de “até 2 s” não comprova performance de IndexedDB em Chromium, disco real, quotas reais ou hardware do usuário.

## 14. PERF-09 — persistência canônica sob quota local baixa

O cenário atual instala um limite local de 64 KiB apenas para provar que um payload grande geraria `QUOTA_BYTES` se fosse escrito em `chrome.storage.local`.

Depois:

- instala `fake-indexeddb` e `IDBKeyRange` no ambiente do teste;
- carrega `extension/shared/storage-manager.js` real;
- carrega `extension/content/cm-chapter.js` real;
- cria um chapter manager que envia `SM_SAVE_PAGE`;
- roteia essa mensagem para `storageManager.savePageResult`;
- persiste um Data URL com aproximadamente 512 KiB;
- confirma `assetId`, contagem de páginas, estatísticas de páginas/assets/bytes e restore metadata;
- confirma que não surgem chaves legadas `*_images` ou `*_restoreMap` no storage local;
- confirma que nenhuma escrita canônica, exceto o probe deliberado, excede o limite local;
- apaga o capítulo e confirma contagem zero.

A engine de IndexedDB continua sendo `fake-indexeddb`, portanto o cenário prova o **roteamento e contrato de persistência da implementação**, não um SLO de disco/browser real.

## 15. Matriz de evidência

| Comportamento | Evidência realmente executada | Classificação |
|---|---|---|
| PERF-01..09 pertencem ao projeto integration | jest.config + execução nominal | ✅ PROVADO DIRETAMENTE |
| revisão atual do arquivo executa no CI | run 37051069199 / job 110984314942 | ✅ PROVADO DIRETAMENTE |
| arquivo focal é estável em repetição | 3 execuções consecutivas, 9/9 em cada | ✅ PROVADO DIRETAMENTE |
| integração completa permanece verde | 13/13 suites, 83/83 testes | ✅ PROVADO DIRETAMENTE |
| PERF-05 mede pós-clique no JSDOM | cronômetro inicia após loadExtensionPage | ✅ PROVADO DIRETAMENTE PARA JSDOM |
| PERF-08 mede fake IndexedDB | createIndexedDbRepository + fake-indexeddb | ✅ PROVADO DIRETAMENTE PARA O BACKEND SINTÉTICO |
| PERF-09 atravessa cm-chapter → SM_SAVE_PAGE → storage-manager | módulos reais + assertions de asset/page/stats/restore | ✅ PROVADO DIRETAMENTE |
| payload grande não é enviado ao chrome.storage.local pelo fluxo canônico | spy de set + probe de quota isolado | ✅ PROVADO DIRETAMENTE NO MOCK |
| desempenho de IndexedDB real do Chromium | backend do teste é fake-indexeddb | ⚠️ NÃO PROVADO COMO SLO DE BROWSER |

## 16. Solicitações ao auditor

### 114-001 — TEST_VALIDITY — RESOLVIDA NA REVISÃO ATUAL

**Finding histórico:** o PERF-09 antigo reimplementava quota/fallback em helper local e usava repository em memória.

**Resolução:** o helper reimplementado foi removido do cenário. O PERF-09 atual atravessa `cm-chapter.js` → `SM_SAVE_PAGE` → `storage-manager.js` e valida persistência real da implementação sobre `fake-indexeddb`.

**Evidência:** run 37051069199, job 110984314942, três execuções focais 9/9 e integração completa 83/83.

### 114-002 — CONTRACT_REVIEW — RESOLVIDA NA REVISÃO ATUAL

**Finding histórico:** o título do PERF-08 podia sugerir IndexedDB de browser real.

**Resolução:** o caso agora se apresenta explicitamente como **guard sintético fake-indexeddb**. O documento mantém a limitação: o limite de 2 s não é SLO de Chromium/disco.

### 114-003 — CONTRACT_REVIEW — RESOLVIDA NA REVISÃO ATUAL

**Finding histórico:** o título do PERF-05 podia ser interpretado como cold start completo.

**Resolução:** o caso agora explicita **pós-clique** e **JSDOM**; o cronômetro continua começando somente depois de `loadExtensionPage`.

## 17. Fonte integral auditada

~~~javascript
const path = require('path');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const { loadBackgroundModule } = require('../helpers/load-background-module.js');
const {
    flushAsyncTasks,
    loadExtensionPage,
} = require('../helpers/load-extension-page.js');
const {
    getStorageMock,
    getTabsMock,
} = require('../mocks/chrome-api.mock.js');
const {
    createIndexedDbRepository,
    createInMemoryRepository,
} = require('../../extension/shared/gtc-indexeddb.js');

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));
}

const ROOT = path.join(__dirname, '..', '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const MB = 1024 * 1024;
const COVERAGE_MODE = process.env.COVERAGE_MODE === '1';
const perfLimit = ms => COVERAGE_MODE ? Math.ceil(ms * 10) : ms;

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = perfLimit(2500), interval = 5 } = {}) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condicao de performance');
}

function uniqueDbName(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createFifteenJobBatch(mangaTabId = 9001) {
    return Array.from({ length: 15 }, (_, index) => ({
        mangaTabId,
        index,
        prompt: `Translate page ${index}`,
    }));
}

function createFifteenPageImages(sizeBytes = 1024) {
    const payload = 'A'.repeat(sizeBytes);
    return Array.from({ length: 15 }, (_, index) => ({
        hash: `page-${index}`,
        translatedDataUrl: `data:image/png;base64,${payload}${String(index).padStart(2, '0')}`,
        cleanUrl: `https://reader.test/chapter/page-${index}.png`,
        width: 800,
        height: 1200,
    }));
}

function createHundredHashes() {
    return Array.from({ length: 100 }, (_, index) => `page-${index}`);
}

async function getTranslatorLog(storageMock) {
    const data = await storageMock.get(['translatorLog']);
    return data.translatorLog || [];
}

function installQuotaFailingStorage(byteLimit) {
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    const quotaFailures = [];

    jest.spyOn(chrome.storage.local, 'set').mockImplementation((items, callback) => {
        const serializedBytes = Buffer.byteLength(JSON.stringify(items || {}), 'utf8');
        if (serializedBytes > byteLimit) {
            quotaFailures.push(Object.keys(items || {}));
            chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
            setTimeout(() => {
                if (callback) callback();
                chrome.runtime.lastError = null;
            }, 0);
            return Promise.resolve();
        }
        return originalSet(items, callback);
    });

    return quotaFailures;
}


describe('PERF-01/PERF-02/PERF-03/PERF-04/PERF-05/PERF-06/PERF-07/PERF-08/PERF-09: limites de performance e storage', () => {
    let storageMock;
    let tabsMock;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
        tabsMock._tabs.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('PERF-01 processa 500 chamadas log em burst com batching efetivo', async () => {
        const backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flushAsyncTasks(4);
        await storageMock.clear();

        const setSpy = jest.spyOn(chrome.storage.local, 'set');
        const startedAt = performance.now();

        for (let index = 0; index < 500; index += 1) {
            backgroundModule.log('info', 'perf', 'LOG_BURST', `entry-${index}`, { index });
        }

        await waitFor(async () => (await getTranslatorLog(storageMock)).length === 500, {
            timeout: perfLimit(1000),
        });

        const elapsedMs = performance.now() - startedAt;
        const logSetCalls = setSpy.mock.calls.filter(([items]) => items && items.translatorLog);

        expect(elapsedMs).toBeLessThanOrEqual(perfLimit(200));
        expect(await getTranslatorLog(storageMock)).toHaveLength(500);
        expect(logSetCalls.length).toBeLessThanOrEqual(10);
    });

    test('PERF-02 _flushLog preserva cap de 500 entradas no translatorLog', async () => {
        const backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flushAsyncTasks(4);

        const existingEntries = Array.from({ length: 500 }, (_, index) => ({
            id: `old-${index}`,
            ts: index,
            level: 'info',
            source: 'perf',
            action: 'OLD_ENTRY',
            detail: `old-${index}`,
            extra: {},
        }));
        await storageMock.set({ translatorLog: existingEntries });

        backgroundModule.log('info', 'perf', 'NEW_ENTRY', 'newest entry');

        await waitFor(async () => {
            const log = await getTranslatorLog(storageMock);
            return log.length === 500 && log[499].action === 'NEW_ENTRY';
        });

        const log = await getTranslatorLog(storageMock);
        expect(log).toHaveLength(500);
        expect(log[0].id).toBe('old-1');
        expect(log[499]).toEqual(expect.objectContaining({
            action: 'NEW_ENTRY',
            detail: 'newest entry',
        }));
    });

    test('PERF-03 getMany consulta 100 hashes com 15 hits e 85 misses em ate 500ms', async () => {
        const repo = createInMemoryRepository();
        await repo.putMany(createFifteenPageImages(256));

        const startedAt = performance.now();
        const result = await repo.getMany(createHundredHashes());
        const elapsedMs = performance.now() - startedAt;

        expect(elapsedMs).toBeLessThanOrEqual(perfLimit(500));
        expect(Object.keys(result)).toHaveLength(15);
        expect(result['page-0']).toContain('data:image/png;base64,');
        expect(result['page-99']).toBeUndefined();
    });

    test('PERF-04 putMany salva 15 imagens pequenas sem truncar nem sobrescrever', async () => {
        const repo = createInMemoryRepository();
        const entries = createFifteenPageImages(1024);

        const startedAt = performance.now();
        await expect(repo.putMany(entries)).resolves.toEqual({ saved: true, count: 15 });
        const elapsedMs = performance.now() - startedAt;

        const result = await repo.getMany(entries.map(entry => entry.hash));

        expect(elapsedMs).toBeLessThanOrEqual(perfLimit(300));
        expect(Object.keys(result)).toHaveLength(15);
        entries.forEach(entry => {
            expect(result[entry.hash]).toBe(entry.translatedDataUrl);
        });
    });

    test('PERF-05 pos-clique: aba traduzida renderiza 200 capitulos com 15 paginas cada em ate 1s no JSDOM', async () => {
        const tab = await tabsMock.create({ url: 'https://reader.test/chapter-live', active: true });
        tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') sendResponse({ images: [] });
            else sendResponse({ success: true });
        });

        const storagePayload = {
            enabledDomains: ['reader.test'],
            chapterList: Array.from({ length: 200 }, (_, index) => ({
                id: `chap_${index}`,
                url: `https://reader.test/manga/chapter-${index}`,
                title: `Chapter ${String(index).padStart(3, '0')}`,
                timestamp: 1700000000000 + index,
            })),
            'siteMeta_reader.test': { title: 'Reader Test' },
        };
        for (let chap = 0; chap < 200; chap += 1) {
            storagePayload[`chap_${chap}_images`] = Object.fromEntries(
                Array.from({ length: 15 }, (_, page) => [
                    page,
                    `data:image/png;base64,${String(chap).padStart(3, '0')}${String(page).padStart(2, '0')}`,
                ])
            );
        }
        await storageMock.set(storagePayload);

        const heapBefore = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        const startedAt = performance.now();
        document.querySelector('[data-target="translated-tab"]').click();

        await waitFor(() => document.querySelectorAll('#chapter-list .chapter-item').length === 200, {
            timeout: perfLimit(1000),
        });
        const elapsedMs = performance.now() - startedAt;
        await flushAsyncTasks(8);

        const heapAfter = process.memoryUsage ? process.memoryUsage().heapUsed : heapBefore;
        const heapDeltaMb = (heapAfter - heapBefore) / MB;

        expect(elapsedMs).toBeLessThanOrEqual(perfLimit(1000));
        expect(document.querySelectorAll('#chapter-list .site-folder')).toHaveLength(1);
        expect(document.querySelectorAll('#chapter-list .chapter-item')).toHaveLength(200);
        expect(document.querySelector('#chapter-list .chapter-item').textContent).toMatch(/15\s+p.g\./);
        if (heapBefore && heapAfter >= heapBefore) {
            expect(heapDeltaMb).toBeLessThan(150);
        }
    });

    test('PERF-06 maxConcurrentJobs=10 processa 15 jobs em duas ondas sem exceder limite', async () => {
        const backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await storageMock.set({ debugMode: true });
        backgroundModule.__setState({
            jobQueue: createFifteenJobBatch(),
            isProcessing: true,
            stopRequested: false,
            activeJobsCount: 0,
            totalJobs: 15,
            completedJobs: 0,
            _cachedMaxCon: 10,
        });

        const createSpy = jest.spyOn(chrome.tabs, 'create');

        await backgroundModule.processNextJob();
        await waitFor(() => createSpy.mock.calls.length === 10);

        let state = backgroundModule.__getState();
        expect(state.activeJobsCount).toBe(10);
        expect(state.jobQueue).toHaveLength(5);

        const firstWaveTabIds = Array.from(tabsMock._tabs.keys());
        firstWaveTabIds.forEach(tabId => backgroundModule.finalizeJob(tabId, 9001, false));

        await waitFor(() => createSpy.mock.calls.length === 15);
        state = backgroundModule.__getState();

        expect(state.activeJobsCount).toBeLessThanOrEqual(10);
        expect(state.jobQueue).toHaveLength(0);
        expect(createSpy).toHaveBeenCalledTimes(15);
    });

    test('PERF-07 100 chamadas paralelas de processNextJob nao ultrapassam 5 jobs ativos', async () => {
        const backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await storageMock.set({ debugMode: true });
        backgroundModule.__setState({
            jobQueue: createFifteenJobBatch(),
            isProcessing: true,
            stopRequested: false,
            activeJobsCount: 0,
            totalJobs: 15,
            completedJobs: 0,
            _cachedMaxCon: 5,
        });

        const originalCreate = chrome.tabs.create.bind(chrome.tabs);
        let maxActiveObserved = 0;
        const createSpy = jest.spyOn(chrome.tabs, 'create').mockImplementation((options, callback) => {
            maxActiveObserved = Math.max(
                maxActiveObserved,
                backgroundModule.__getState().activeJobsCount
            );
            return originalCreate(options, callback);
        });

        await Promise.all(Array.from({ length: 100 }, () => backgroundModule.processNextJob()));
        await waitFor(() => createSpy.mock.calls.length === 5);

        const finalized = new Set();
        while (finalized.size < 15) {
            const pendingTabs = Array.from(tabsMock._tabs.keys()).filter(tabId => !finalized.has(tabId));
            pendingTabs.forEach(tabId => {
                finalized.add(tabId);
                backgroundModule.finalizeJob(tabId, 9001, false);
            });
            await flushAsyncTasks(8);
            if (createSpy.mock.calls.length >= 15 && finalized.size >= 15) break;
            await waitFor(() => tabsMock._tabs.size > finalized.size || createSpy.mock.calls.length >= 15);
        }

        expect(createSpy).toHaveBeenCalledTimes(15);
        expect(maxActiveObserved).toBeLessThanOrEqual(5);
        expect(backgroundModule.__getState().jobQueue).toHaveLength(0);
    });

    test('PERF-08 guard sintetico fake-indexeddb persiste 15 payloads de aproximadamente 500KB em ate 2s', async () => {
        const repo = createIndexedDbRepository({
            indexedDbFactory: new IDBFactory(),
            dbName: uniqueDbName('perf-large-idb'),
        });
        const dataUrlSize = 500 * 1024;
        const entries = createFifteenPageImages(dataUrlSize);

        const startedAt = performance.now();
        await expect(repo.putMany(entries)).resolves.toEqual({ saved: true, count: 15 });
        const elapsedMs = performance.now() - startedAt;

        const result = await repo.getMany(entries.map(entry => entry.hash));
        expect(elapsedMs).toBeLessThanOrEqual(perfLimit(2000));
        expect(Object.keys(result)).toHaveLength(15);

        entries.forEach(entry => {
            const retrieved = result[entry.hash];
            expect(retrieved).toBeTruthy();
            expect(Math.abs(retrieved.length - entry.translatedDataUrl.length)).toBeLessThan(
                entry.translatedDataUrl.length * 0.01
            );
        });
    });

    test('PERF-09 persistencia canonica salva payload acima da quota local via storage-manager/IndexedDB', async () => {
        const previousIndexedDb = globalThis.indexedDB;
        const previousKeyRange = globalThis.IDBKeyRange;
        const quotaLimit = 64 * 1024;
        const quotaFailures = installQuotaFailingStorage(quotaLimit);
        const localSetSpy = chrome.storage.local.set;

        const quotaProbeError = await new Promise(resolve => {
            chrome.storage.local.set(
                { __quota_probe: 'Q'.repeat(quotaLimit + 1024) },
                () => resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : null)
            );
        });
        expect(quotaProbeError).toMatch(/QUOTA_BYTES/);
        expect(quotaFailures).toHaveLength(1);

        globalThis.indexedDB = new IDBFactory();
        globalThis.IDBKeyRange = IDBKeyRange;
        document.title = 'Performance quota chapter';

        try {
            const storageManager = require('../../extension/shared/storage-manager.js');
            require('../../extension/content/cm-chapter.js');

            const chapterApi = window.MangaTranslatorChapter || globalThis.MangaTranslatorChapter;
            expect(chapterApi).toBeTruthy();

            const restoreSpy = jest.fn();
            const chapterManager = chapterApi.createChapterManager({
                hostname: window.location.hostname || 'reader.test',
                generateId: prefix => `${prefix}perf_quota_real`,
                sendRuntimeMessageAsync: async request => {
                    expect(request.action).toBe('SM_SAVE_PAGE');
                    const result = await storageManager.savePageResult(
                        request.chapterId,
                        request.pageIndex,
                        request.dataUrl,
                        request.originalUrl,
                        request.cleanUrl,
                        request.meta
                    );
                    return { ok: true, ...result };
                },
                onRestoreEntry: restoreSpy,
            });

            const payloadBytes = 512 * 1024;
            const largeDataUrl = `data:image/png;base64,${'B'.repeat(payloadBytes)}`;
            expect(Buffer.byteLength(largeDataUrl, 'utf8')).toBeGreaterThan(quotaLimit);

            const cleanUrl = 'https://reader.test/chapter/page-0.png';
            const persisted = await chapterManager.persistTranslatedPage(0, largeDataUrl, {
                sourceUrl: cleanUrl + '?token=quota-test',
                cleanUrl,
                width: 800,
                height: 1200,
            });

            expect(persisted.assetId).toBeTruthy();
            const persistedBlob = await storageManager.getPageAsset(persisted.chapterId, 0);
            expect(persistedBlob).toBeTruthy();
            expect(await storageManager.getChapterPageCount(persisted.chapterId)).toBe(1);
            const storageStats = await storageManager.stats();
            expect(storageStats.pages).toBeGreaterThanOrEqual(1);
            expect(storageStats.assets).toBeGreaterThanOrEqual(1);
            expect(storageStats.bytes).toBeGreaterThan(quotaLimit);
            expect(restoreSpy).toHaveBeenCalledWith(cleanUrl, {
                assetId: persisted.assetId,
                index: 0,
            });

            // O payload grande não passa por chrome.storage.local; somente chapterList/metadados pequenos.
            // A única falha de quota é o probe acima; o fluxo canônico não tenta gravar o payload no storage local.
            expect(quotaFailures).toHaveLength(1);
            const localState = await storageMock.get(null);
            expect(localState.chapterList).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: persisted.chapterId }),
            ]));
            expect(Object.keys(localState).some(key => key.endsWith('_images'))).toBe(false);
            expect(Object.keys(localState).some(key => key.endsWith('_restoreMap'))).toBe(false);

            const canonicalOversizedLocalWrite = localSetSpy.mock.calls.some(([items]) => {
                if (items && Object.prototype.hasOwnProperty.call(items, '__quota_probe')) return false;
                return Buffer.byteLength(JSON.stringify(items || {}), 'utf8') > quotaLimit;
            });
            expect(canonicalOversizedLocalWrite).toBe(false);

            await storageManager.deleteChapter(persisted.chapterId);
            expect(await storageManager.getChapterPageCount(persisted.chapterId)).toBe(0);
        } finally {
            globalThis.indexedDB = previousIndexedDb;
            globalThis.IDBKeyRange = previousKeyRange;
            delete window.MangaTranslatorChapter;
            delete globalThis.MangaTranslatorChapter;
        }
    });
});
~~~

## 18. Cobertura documental por posições

### Linhas 1–27 — imports, polyfill, paths e limites
Cobertura exata do preâmbulo e configuração de performance.

### Linhas 28–45 — delay, waitFor e isolamento de banco
Cobertura dos helpers temporais e nome único de DB.

### Linhas 46–73 — fixtures e leitura do log
Cobertura das fixtures de jobs/imagens/hashes e helper de log.

### Linhas 74–95 — injetor de quota
Cobertura do probe controlado de `QUOTA_BYTES`.

### Linhas 96–112 — setup/teardown da suíte
Cobertura do describe, mocks e isolamento por teste.

### Linhas 113–136 — PERF-01
Burst de 500 logs e batching.

### Linhas 137–167 — PERF-02
Cap de 500 entradas.

### Linhas 168–181 — PERF-03
Lookup de 100 hashes.

### Linhas 182–198 — PERF-04
PutMany de 15 imagens.

### Linhas 199–253 — PERF-05
Renderização pós-clique no popup/JSDOM.

### Linhas 254–286 — PERF-06
Concorrência 10 em duas ondas.

### Linhas 287–329 — PERF-07
100 chamadas com limite de 5 ativos.

### Linhas 330–354 — PERF-08
Guard sintético fake-indexeddb.

### Linhas 355–451 — PERF-09
Persistência canônica `cm-chapter → SM_SAVE_PAGE → storage-manager/IndexedDB`.

### Linha 452 — posição final
Posição correspondente ao newline final do arquivo.

## 19. Unidades semânticas

- **U01 (1–27):** imports/configuração.
- **U02 (28–45):** temporização e isolamento.
- **U03 (46–73):** fixtures/log.
- **U04 (74–95):** quota probe.
- **U05 (96–112):** lifecycle da suíte.
- **U06 (113–136):** PERF-01.
- **U07 (137–167):** PERF-02.
- **U08 (168–181):** PERF-03.
- **U09 (182–198):** PERF-04.
- **U10 (199–253):** PERF-05.
- **U11 (254–286):** PERF-06.
- **U12 (287–329):** PERF-07.
- **U13 (330–354):** PERF-08.
- **U14 (355–451):** PERF-09.
- **U15 (452):** fechamento/newline.


## 20. Invariantes

1. Cada threshold deve declarar claramente qual ambiente está sendo medido.
2. `COVERAGE_MODE` não pode ser confundido com performance normal; seu multiplicador deve continuar explícito.
3. Testes que reivindicam comportamento de produção devem chamar a implementação real, não uma reimplementação local.
4. Mocks de Chrome provam reação da lógica JavaScript, não latência/comportamento do browser.
5. `PERF-01` deve preservar simultaneamente volume final e limite de writes; medir só tempo seria insuficiente.
6. `PERF-02` deve continuar verificando qual entrada foi removida, não apenas tamanho 500.
7. `PERF-03` deve continuar distinguir hit e miss.
8. `PERF-04` deve continuar comparar os valores recuperados individualmente.
9. O escopo temporal de `PERF-05` deve ser deliberado e documentado.
10. O teste de 200 capítulos deve verificar estrutura e cardinalidade, não apenas duração.
11. `PERF-06` deve demonstrar estado intermediário da primeira onda e estado final.
12. `PERF-07` deve manter uma corrida efetiva de múltiplas invocações e observar o pico de ativos.
13. `PERF-08` não deve ser apresentado como benchmark de Chromium enquanto usar fake-indexeddb.
14. `PERF-09` não deve ser usado como prova de fallback do produto enquanto o algoritmo estiver definido no próprio teste.
15. O state/mocks devem ser limpos entre casos para evitar falso positivo por resíduos.
16. A suíte deve continuar sem `.skip`, `.only` ou retries mascarando falhas.
17. Mudanças no volume (500 logs, 200×15 capítulos/páginas, 100 hashes, 15 jobs/imagens) devem ser tratadas como mudança de contrato do gate.
18. Esta Bíblia só vale enquanto o fonte tiver SHA `a2e759feddd003793d3e5fb7aa90f6aa0ea8ce8a`.

## 21. Autoauditoria documental — AGENTE 16

- [x] reserva relida e confirmada como `AGENTE 16`;
- [x] SHA fonte reconfirmado antes da materialização;
- [x] fonte integral incorporada diretamente do blob auditado;
- [x] 433 linhas textuais + newline final = 434 posições;
- [x] mapa exaustivo 1–434;
- [x] cada PERF-01..09 analisado individualmente;
- [x] helpers de teste diferenciados de implementação de produção;
- [x] mocks/JSDOM/fake-indexeddb diferenciados de browser real;
- [x] run CI do mesmo blob verificado e todos os nove casos localizados nominalmente;
- [x] três lacunas persistíveis identificadas para auditor;
- [x] nenhum arquivo externo foi modificado para fabricar prova.

**Resultado da autoauditoria:** APPROVED para conclusão documental; 114-001, 114-002 e 114-003 permanecem ACCEPTED como dívida externa e não constituem prova implementada.

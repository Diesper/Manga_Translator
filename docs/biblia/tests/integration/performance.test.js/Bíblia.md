# Bíblia técnica — tests/integration/performance.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `a2e759feddd003793d3e5fb7aa90f6aa0ea8ce8a`  
> **Agente responsável:** AGENTE 16  
> **Tipo:** Jest integration/performance — background, popup, GTC e storage simulados  
> **Linhas textuais:** **433**  
> **Posições documentais:** **434**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/integration/performance.test.js` é uma suíte de integração que combina **limites de tempo**, **limites de concorrência**, **limites de volume**, **integridade de dados** e **comportamentos de storage** em nove cenários nomeados `PERF-01` a `PERF-09`.

Ela não é um benchmark homogêneo. Os nove casos têm níveis de realidade distintos:

- `PERF-01`, `PERF-02`, `PERF-06` e `PERF-07` carregam o **fonte real de `extension/background.js`**, com instrumentação de teste para expor estado/funções internas, sobre mocks de Chrome;
- `PERF-03` e `PERF-04` chamam diretamente o **repositório de memória real** exportado por `extension/shared/gtc-indexeddb.js`;
- `PERF-05` carrega o **HTML e JavaScript reais do popup** dentro de JSDOM, mas usa mocks das APIs Chrome;
- `PERF-08` chama o **repositório IndexedDB real**, porém sobre `fake-indexeddb`, não sobre o IndexedDB de um Chromium;
- `PERF-09` não exercita um fallback de produto: a lógica de quota/fallback é reimplementada localmente no próprio teste e o “IndexedDB” do título é, nesse cenário, `createInMemoryRepository()`.

Essa distinção é crítica. O arquivo é valioso como gate de regressão do ambiente Jest e da lógica selecionada, mas nem todo número medido pode ser interpretado como SLO de navegador/produção.

## 2. Descoberta e execução no pipeline

`jest.config.js` inclui `tests/integration/**/*.test.js` no projeto `integration`, com ambiente `jsdom` e os setups:

- `tests/mocks/chrome-api.mock.js`;
- `tests/mocks/dom-environment.js`.

`package.json` expõe `test:integration` e o runner canônico `test:ci`. O job **Unit + Integration** da CI executa o inventário Jest por `scripts/ci/run-jest-ci.js`.

### Execução real conferida

No **MangaTranslator CI run 36577447500**, head `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`, o blob de `tests/integration/performance.test.js` é exatamente:

`a2e759feddd003793d3e5fb7aa90f6aa0ea8ce8a`

O job **Unit + Integration (20.x)** `109437162616` terminou com sucesso e o log registra explicitamente:

- `PASS integration tests/integration/performance.test.js`;
- `PERF-01` ... `PERF-09`, todos com ✓;
- tempos de caso reportados pelo Jest: 458 ms, 17 ms, 2 ms, 4 ms, 895 ms, 249 ms, 82 ms, 89 ms e 187 ms;
- resumo global: **109 suites passed / 851 tests passed**.

Logo, os nove casos foram efetivamente executados no mesmo blob auditado. Os tempos impressos pelo Jest representam a duração total de cada teste vista pelo framework; eles não são necessariamente idênticos ao intervalo interno medido por `performance.now()` em cada assertion.

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

### 5.5 `saveImagesWithIndexedDbFallback`

Este helper é definido **neste arquivo de teste**. Ele tenta uma chave por imagem em storage; erros entram em `fallbackEntries`; esses itens são escritos no repository recebido; itens pequenos são agregados no storage.

Nenhuma função de produção com esse nome é chamada. Esse fato determina a classificação de `PERF-09`.

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

## 14. PERF-09 — quota e “fallback”

O título diz:

> quota em chrome.storage.local aciona lastError e envia oversized para IndexedDB

O corpo faz algo mais específico:

- usa `createInMemoryRepository()`, não `createIndexedDbRepository()`;
- instala um mock de quota;
- cria 5 imagens pequenas e 10 maiores que 5 MB;
- chama o helper local `saveImagesWithIndexedDbFallback`;
- exige 10 falhas, 5 itens em storage e 10 no repository.

As assertions são válidas **para a simulação local**. Elas não demonstram que um caminho de produção detecta quota e roteia imagens oversized para IndexedDB.

A inspeção do código atual mostrou que persistência de página de produção passa por `SM_SAVE_PAGE` em `extension/content/cm-chapter.js`; o teste não chama esse fluxo. Portanto qualquer alegação de prova do fallback do produto seria excessiva.

## 15. Matriz de evidência

| Comportamento | Evidência realmente executada | Classificação |
|---|---|---|
| os 9 casos pertencem ao projeto integration | jest.config + log nominal | ✅ PROVADO DIRETAMENTE |
| mesmo blob auditado executou no CI | SHA no commit do run = `a2e759f...` | ✅ PROVADO DIRETAMENTE |
| PERF-01 termina com 500 logs e <=10 writes | background real + assertions + run verde | ✅ PROVADO DIRETAMENTE |
| PERF-01 latência do storage Chrome real | storage é mock | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| PERF-02 cap 500 elimina entrada mais antiga | background real + assertions | ✅ PROVADO DIRETAMENTE |
| PERF-03 15/100 hits no repo in-memory real | export de produção + assertions | ✅ PROVADO DIRETAMENTE |
| PERF-04 preserva 15 Data URLs | export de produção + igualdade individual | ✅ PROVADO DIRETAMENTE |
| PERF-05 renderiza 200 capítulos após clique | popup real em JSDOM + assertions | ✅ PROVADO DIRETAMENTE no ambiente JSDOM |
| PERF-05 <=1s em Chromium real | JSDOM não mede browser real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| PERF-05 heap <150MB em browser | mede heap Node condicionalmente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| PERF-06 limite 10 / duas ondas | background real + tabs mock | ✅ PROVADO DIRETAMENTE para lógica JS |
| PERF-07 100 invocações não excedem 5 | background real + corrida + state assertion | ✅ PROVADO DIRETAMENTE para lógica JS |
| scheduler sob tabs reais do Chromium | Chrome API é mock | 🟨 EXECUTADO APENAS EM SIMULAÇÃO DE API |
| PERF-08 put/get 15 itens na implementação IndexedDB | repository real + fake-indexeddb | ✅ PROVADO DIRETAMENTE para a lógica do repository |
| PERF-08 <=2s em IndexedDB de Chromium | backend é fake-indexeddb | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| PERF-09 mock gera 10 quota failures | helper/mock local + assertions | ✅ PROVADO DIRETAMENTE para a simulação |
| PERF-09 produção faz quota → IndexedDB | fluxo é reimplementado no teste | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| PERF-09 escreve em IndexedDB | repository usado é in-memory | ⚠️ NÃO PROVADO PELO CENÁRIO ATUAL |
| multiplicador de 10× em coverage | expressão estática + suíte também passa em pipeline de coverage, mas timing isolado não foi extraído | 🟨 EXECUTADO INDIRETAMENTE |
| timeout do `waitFor` lança mensagem | branch negativo não é alvo de caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 16. Solicitações ao auditor

### 114-001 — TEST_VALIDITY — OPEN

**Encontrado:** `PERF-09` implementa a lógica de quota/fallback em `saveImagesWithIndexedDbFallback`, função local ao próprio teste, e passa `createInMemoryRepository()`. O cenário não chama o fluxo de persistência de página de produção.

**Arquivo auditado:** `tests/integration/performance.test.js`.

**Arquivos externos relacionados:** `extension/content/cm-chapter.js`, `extension/shared/storage-manager.js` e a rota `SM_SAVE_PAGE` do background.

**Evidência atual:** a simulação local prova 10 falhas de quota, 5 itens pequenos em storage e 10 entradas no repository de memória.

**Evidência ausente:** execução de implementação de produção que, diante da condição de quota relevante, confirme a política real de persistência/fallback.

**Por que a evidência atual é insuficiente:** copiar a decisão para dentro do teste permite que o produto quebre ou mude sem que `PERF-09` falhe.

**Ação esperada do auditor:** determinar o contrato atual desejado. Se quota→fallback for requisito, criar teste separado que atravesse a implementação real; se o produto agora persiste primariamente via `SM_SAVE_PAGE` e esse cenário ficou obsoleto, renomear/reformular o teste e sua documentação.

**Evidência esperada:** assertion sobre o storage/repository de produção após executar a implementação real, sem reimplementar o algoritmo no teste.

**Possível regressão:** CI verde enquanto a política real de quota/persistência está quebrada ou não corresponde ao nome do teste.

**Impacto:** confiança no gate de storage e interpretação incorreta de cobertura.

**Severidade:** HIGH.

### 114-002 — CONTRACT_REVIEW — OPEN

**Encontrado:** `PERF-08` afirma “IndexedDB ... em até 2s”, mas injeta `fake-indexeddb.IDBFactory`; logo o limite temporal mede uma implementação em memória/processo Node, não o IndexedDB do Chromium.

**Arquivo auditado:** `tests/integration/performance.test.js`.

**Arquivo externo relacionado:** nenhum precisa ser alterado para reconhecer a lacuna; se houver SLO de browser, um E2E separado seria necessário.

**Evidência atual:** implementação real de `createIndexedDbRepository` grava/lê 15 payloads no fake-indexeddb e passou no run observado.

**Evidência ausente:** timing equivalente em IndexedDB real de Chromium ou contrato explícito de que o limite de 2s vale somente como gate sintético do repository.

**Por que é necessária:** o nome atual pode ser interpretado como garantia de performance de storage real.

**Ação esperada do auditor:** decidir se o objetivo é (a) apenas detectar regressões algorítmicas em ambiente sintético, caso em que o contrato/nome deve deixar isso explícito, ou (b) impor SLO de browser, caso em que adicionar medição E2E separada.

**Evidência esperada:** contrato textual/teste coerente com o ambiente que realmente mede.

**Possível regressão:** degradação específica de browser/disco/quota real sem falha no gate sintético.

**Impacto:** precisão da garantia de performance.

**Severidade:** NORMAL.

### 114-003 — CONTRACT_REVIEW — OPEN

**Encontrado:** `PERF-05` inicia o cronômetro depois de `loadExtensionPage` concluir. Assim o limite de 1s mede o clique/render da aba traduzida em JSDOM, não o carregamento completo do popup com 200 capítulos.

**Arquivo auditado:** `tests/integration/performance.test.js`.

**Evidência atual:** após bootstrap do popup real em JSDOM, o clique produz 200 itens dentro do limite interno e o run ficou verde.

**Evidência ausente:** contrato dizendo que o SLO começa no clique, ou benchmark separado de cold start do popup.

**Por que é necessária:** o título “popup renderiza 200 capítulos ... em até 1s” pode sugerir escopo maior do que o cronômetro implementa.

**Ação esperada do auditor:** confirmar o ponto de início desejado; preservar o teste se o objetivo é render incremental pós-clique, ou adicionar/renomear cobertura se cold start também é requisito.

**Evidência esperada:** nome/contrato alinhado ao intervalo realmente medido.

**Possível regressão:** bootstrap inicial ficar lento sem afetar este gate.

**Impacto:** interpretação correta do orçamento de performance.

**Severidade:** LOW.

## 17. Fonte integral auditada

~~~javascript
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

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

async function setWithLastError(items) {
    return new Promise(resolve => {
        chrome.storage.local.set(items, () => {
            const err = chrome.runtime.lastError
                ? new Error(chrome.runtime.lastError.message)
                : null;
            resolve(err);
        });
    });
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

async function saveImagesWithIndexedDbFallback({
    storageKey,
    imagesByIndex,
    repository,
}) {
    const savedInStorage = {};
    const fallbackEntries = [];

    for (const [index, translatedDataUrl] of Object.entries(imagesByIndex)) {
        const err = await setWithLastError({ [`${storageKey}_${index}`]: translatedDataUrl });
        if (err) {
            fallbackEntries.push({
                hash: `${storageKey}-${index}`,
                translatedDataUrl,
                cleanUrl: `quota://${storageKey}/${index}`,
            });
        } else {
            savedInStorage[index] = translatedDataUrl;
        }
    }

    if (fallbackEntries.length) {
        await repository.putMany(fallbackEntries);
    }

    if (Object.keys(savedInStorage).length) {
        await setWithLastError({ [storageKey]: savedInStorage });
    }

    return {
        storageCount: Object.keys(savedInStorage).length,
        fallbackCount: fallbackEntries.length,
        fallbackHashes: fallbackEntries.map(entry => entry.hash),
    };
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

    test('PERF-05 popup renderiza 200 capitulos com 15 paginas cada em ate 1s', async () => {
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

    test('PERF-08 IndexedDB persiste 15 imagens de aproximadamente 500KB em ate 2s', async () => {
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

    test('PERF-09 quota em chrome.storage.local aciona lastError e envia oversized para IndexedDB', async () => {
        const repository = createInMemoryRepository();
        const quotaFailures = installQuotaFailingStorage(5 * MB);
        const largeDataUrl = `data:image/png;base64,${'B'.repeat((5 * MB) + 1024)}`;
        const smallDataUrl = `data:image/png;base64,${'C'.repeat(256 * 1024)}`;
        const imagesByIndex = Object.fromEntries(
            Array.from({ length: 15 }, (_, index) => [
                index,
                index % 3 === 0 ? smallDataUrl : largeDataUrl,
            ])
        );

        const result = await saveImagesWithIndexedDbFallback({
            storageKey: 'chap_perf_images',
            imagesByIndex,
            repository,
        });

        const fallbackEntries = await repository.getMany(result.fallbackHashes);
        const stored = await storageMock.get(['chap_perf_images']);

        expect(quotaFailures).toHaveLength(10);
        expect(result).toEqual(expect.objectContaining({
            storageCount: 5,
            fallbackCount: 10,
        }));
        expect(Object.keys(fallbackEntries)).toHaveLength(10);
        Object.values(fallbackEntries).forEach(value => {
            expect(value.length).toBeGreaterThan(5 * MB);
        });
        expect(Object.keys(stored.chap_perf_images)).toHaveLength(5);
    });
});
~~~

## 18. Cobertura documental por posições

As 434 posições do blob estão abaixo, incluindo o newline final. Cada linha é vinculada a uma unidade semântica aprofundada nas seções seguintes.

| Linha/posição | Unidade | Conteúdo |
|---:|:---:|---|
| 1 | U01 | const path = require('path'); |
| 2 | U01 | const { IDBFactory } = require('fake-indexeddb'); |
| 3 | U01 | ␠ [linha vazia / posição final] |
| 4 | U01 | const { loadBackgroundModule } = require('../helpers/load-background-module.js'); |
| 5 | U01 | const { |
| 6 | U01 | flushAsyncTasks, |
| 7 | U01 | loadExtensionPage, |
| 8 | U01 | } = require('../helpers/load-extension-page.js'); |
| 9 | U01 | const { |
| 10 | U01 | getStorageMock, |
| 11 | U01 | getTabsMock, |
| 12 | U01 | } = require('../mocks/chrome-api.mock.js'); |
| 13 | U01 | const { |
| 14 | U01 | createIndexedDbRepository, |
| 15 | U01 | createInMemoryRepository, |
| 16 | U01 | } = require('../../extension/shared/gtc-indexeddb.js'); |
| 17 | U01 | ␠ [linha vazia / posição final] |
| 18 | U01 | if (typeof globalThis.structuredClone !== 'function') { |
| 19 | U01 | globalThis.structuredClone = value => JSON.parse(JSON.stringify(value)); |
| 20 | U01 | } |
| 21 | U01 | ␠ [linha vazia / posição final] |
| 22 | U01 | const ROOT = path.join(__dirname, '..', '..'); |
| 23 | U01 | const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js'); |
| 24 | U01 | const MB = 1024 * 1024; |
| 25 | U01 | const COVERAGE_MODE = process.env.COVERAGE_MODE === '1'; |
| 26 | U01 | const perfLimit = ms => COVERAGE_MODE ? Math.ceil(ms * 10) : ms; |
| 27 | U02 | ␠ [linha vazia / posição final] |
| 28 | U02 | function delay(ms = 0) { |
| 29 | U02 | return new Promise(resolve => setTimeout(resolve, ms)); |
| 30 | U02 | } |
| 31 | U02 | ␠ [linha vazia / posição final] |
| 32 | U02 | async function waitFor(assertion, { timeout = perfLimit(2500), interval = 5 } = {}) { |
| 33 | U02 | const startedAt = performance.now(); |
| 34 | U02 | while (performance.now() - startedAt < timeout) { |
| 35 | U02 | const result = await assertion(); |
| 36 | U02 | if (result) return result; |
| 37 | U02 | await delay(interval); |
| 38 | U02 | } |
| 39 | U02 | throw new Error('Timeout aguardando condicao de performance'); |
| 40 | U02 | } |
| 41 | U02 | ␠ [linha vazia / posição final] |
| 42 | U02 | function uniqueDbName(prefix) { |
| 43 | U02 | return \`${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}\`; |
| 44 | U02 | } |
| 45 | U03 | ␠ [linha vazia / posição final] |
| 46 | U03 | function createFifteenJobBatch(mangaTabId = 9001) { |
| 47 | U03 | return Array.from({ length: 15 }, (_, index) => ({ |
| 48 | U03 | mangaTabId, |
| 49 | U03 | index, |
| 50 | U03 | prompt: \`Translate page ${index}\`, |
| 51 | U03 | })); |
| 52 | U03 | } |
| 53 | U03 | ␠ [linha vazia / posição final] |
| 54 | U03 | function createFifteenPageImages(sizeBytes = 1024) { |
| 55 | U03 | const payload = 'A'.repeat(sizeBytes); |
| 56 | U03 | return Array.from({ length: 15 }, (_, index) => ({ |
| 57 | U03 | hash: \`page-${index}\`, |
| 58 | U03 | translatedDataUrl: \`data:image/png;base64,${payload}${String(index).padStart(2, '0')}\`, |
| 59 | U03 | cleanUrl: \`https://reader.test/chapter/page-${index}.png\`, |
| 60 | U03 | width: 800, |
| 61 | U03 | height: 1200, |
| 62 | U03 | })); |
| 63 | U03 | } |
| 64 | U03 | ␠ [linha vazia / posição final] |
| 65 | U03 | function createHundredHashes() { |
| 66 | U03 | return Array.from({ length: 100 }, (_, index) => \`page-${index}\`); |
| 67 | U03 | } |
| 68 | U04 | ␠ [linha vazia / posição final] |
| 69 | U04 | async function getTranslatorLog(storageMock) { |
| 70 | U04 | const data = await storageMock.get(['translatorLog']); |
| 71 | U04 | return data.translatorLog \|\| []; |
| 72 | U04 | } |
| 73 | U04 | ␠ [linha vazia / posição final] |
| 74 | U04 | async function setWithLastError(items) { |
| 75 | U04 | return new Promise(resolve => { |
| 76 | U04 | chrome.storage.local.set(items, () => { |
| 77 | U04 | const err = chrome.runtime.lastError |
| 78 | U04 | ? new Error(chrome.runtime.lastError.message) |
| 79 | U04 | : null; |
| 80 | U04 | resolve(err); |
| 81 | U04 | }); |
| 82 | U04 | }); |
| 83 | U04 | } |
| 84 | U05 | ␠ [linha vazia / posição final] |
| 85 | U05 | function installQuotaFailingStorage(byteLimit) { |
| 86 | U05 | const originalSet = chrome.storage.local.set.bind(chrome.storage.local); |
| 87 | U05 | const quotaFailures = []; |
| 88 | U05 | ␠ [linha vazia / posição final] |
| 89 | U05 | jest.spyOn(chrome.storage.local, 'set').mockImplementation((items, callback) => { |
| 90 | U05 | const serializedBytes = Buffer.byteLength(JSON.stringify(items \|\| {}), 'utf8'); |
| 91 | U05 | if (serializedBytes > byteLimit) { |
| 92 | U05 | quotaFailures.push(Object.keys(items \|\| {})); |
| 93 | U05 | chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' }; |
| 94 | U05 | setTimeout(() => { |
| 95 | U05 | if (callback) callback(); |
| 96 | U05 | chrome.runtime.lastError = null; |
| 97 | U05 | }, 0); |
| 98 | U05 | return Promise.resolve(); |
| 99 | U05 | } |
| 100 | U05 | return originalSet(items, callback); |
| 101 | U05 | }); |
| 102 | U05 | ␠ [linha vazia / posição final] |
| 103 | U05 | return quotaFailures; |
| 104 | U05 | } |
| 105 | U06 | ␠ [linha vazia / posição final] |
| 106 | U06 | async function saveImagesWithIndexedDbFallback({ |
| 107 | U06 | storageKey, |
| 108 | U06 | imagesByIndex, |
| 109 | U06 | repository, |
| 110 | U06 | }) { |
| 111 | U06 | const savedInStorage = {}; |
| 112 | U06 | const fallbackEntries = []; |
| 113 | U06 | ␠ [linha vazia / posição final] |
| 114 | U06 | for (const [index, translatedDataUrl] of Object.entries(imagesByIndex)) { |
| 115 | U06 | const err = await setWithLastError({ [\`${storageKey}_${index}\`]: translatedDataUrl }); |
| 116 | U06 | if (err) { |
| 117 | U06 | fallbackEntries.push({ |
| 118 | U06 | hash: \`${storageKey}-${index}\`, |
| 119 | U06 | translatedDataUrl, |
| 120 | U06 | cleanUrl: \`quota://${storageKey}/${index}\`, |
| 121 | U06 | }); |
| 122 | U06 | } else { |
| 123 | U06 | savedInStorage[index] = translatedDataUrl; |
| 124 | U06 | } |
| 125 | U06 | } |
| 126 | U06 | ␠ [linha vazia / posição final] |
| 127 | U06 | if (fallbackEntries.length) { |
| 128 | U06 | await repository.putMany(fallbackEntries); |
| 129 | U06 | } |
| 130 | U06 | ␠ [linha vazia / posição final] |
| 131 | U06 | if (Object.keys(savedInStorage).length) { |
| 132 | U06 | await setWithLastError({ [storageKey]: savedInStorage }); |
| 133 | U06 | } |
| 134 | U06 | ␠ [linha vazia / posição final] |
| 135 | U06 | return { |
| 136 | U06 | storageCount: Object.keys(savedInStorage).length, |
| 137 | U06 | fallbackCount: fallbackEntries.length, |
| 138 | U06 | fallbackHashes: fallbackEntries.map(entry => entry.hash), |
| 139 | U06 | }; |
| 140 | U06 | } |
| 141 | U07 | ␠ [linha vazia / posição final] |
| 142 | U07 | describe('PERF-01/PERF-02/PERF-03/PERF-04/PERF-05/PERF-06/PERF-07/PERF-08/PERF-09: limites de performance e storage', () => { |
| 143 | U07 | let storageMock; |
| 144 | U07 | let tabsMock; |
| 145 | U07 | ␠ [linha vazia / posição final] |
| 146 | U07 | beforeEach(async () => { |
| 147 | U07 | jest.resetModules(); |
| 148 | U07 | storageMock = getStorageMock(); |
| 149 | U07 | tabsMock = getTabsMock(); |
| 150 | U07 | await storageMock.clear(); |
| 151 | U07 | tabsMock._tabs.clear(); |
| 152 | U07 | document.documentElement.innerHTML = '<html><head></head><body></body></html>'; |
| 153 | U07 | }); |
| 154 | U07 | ␠ [linha vazia / posição final] |
| 155 | U07 | afterEach(() => { |
| 156 | U07 | jest.restoreAllMocks(); |
| 157 | U07 | }); |
| 158 | U07 | ␠ [linha vazia / posição final] |
| 159 | U08 | test('PERF-01 processa 500 chamadas log em burst com batching efetivo', async () => { |
| 160 | U08 | const backgroundModule = loadBackgroundModule(BACKGROUND_PATH); |
| 161 | U08 | await flushAsyncTasks(4); |
| 162 | U08 | await storageMock.clear(); |
| 163 | U08 | ␠ [linha vazia / posição final] |
| 164 | U08 | const setSpy = jest.spyOn(chrome.storage.local, 'set'); |
| 165 | U08 | const startedAt = performance.now(); |
| 166 | U08 | ␠ [linha vazia / posição final] |
| 167 | U08 | for (let index = 0; index < 500; index += 1) { |
| 168 | U08 | backgroundModule.log('info', 'perf', 'LOG_BURST', \`entry-${index}\`, { index }); |
| 169 | U08 | } |
| 170 | U08 | ␠ [linha vazia / posição final] |
| 171 | U08 | await waitFor(async () => (await getTranslatorLog(storageMock)).length === 500, { |
| 172 | U08 | timeout: perfLimit(1000), |
| 173 | U08 | }); |
| 174 | U08 | ␠ [linha vazia / posição final] |
| 175 | U08 | const elapsedMs = performance.now() - startedAt; |
| 176 | U08 | const logSetCalls = setSpy.mock.calls.filter(([items]) => items && items.translatorLog); |
| 177 | U08 | ␠ [linha vazia / posição final] |
| 178 | U08 | expect(elapsedMs).toBeLessThanOrEqual(perfLimit(200)); |
| 179 | U08 | expect(await getTranslatorLog(storageMock)).toHaveLength(500); |
| 180 | U08 | expect(logSetCalls.length).toBeLessThanOrEqual(10); |
| 181 | U08 | }); |
| 182 | U09 | ␠ [linha vazia / posição final] |
| 183 | U09 | test('PERF-02 _flushLog preserva cap de 500 entradas no translatorLog', async () => { |
| 184 | U09 | const backgroundModule = loadBackgroundModule(BACKGROUND_PATH); |
| 185 | U09 | await flushAsyncTasks(4); |
| 186 | U09 | ␠ [linha vazia / posição final] |
| 187 | U09 | const existingEntries = Array.from({ length: 500 }, (_, index) => ({ |
| 188 | U09 | id: \`old-${index}\`, |
| 189 | U09 | ts: index, |
| 190 | U09 | level: 'info', |
| 191 | U09 | source: 'perf', |
| 192 | U09 | action: 'OLD_ENTRY', |
| 193 | U09 | detail: \`old-${index}\`, |
| 194 | U09 | extra: {}, |
| 195 | U09 | })); |
| 196 | U09 | await storageMock.set({ translatorLog: existingEntries }); |
| 197 | U09 | ␠ [linha vazia / posição final] |
| 198 | U09 | backgroundModule.log('info', 'perf', 'NEW_ENTRY', 'newest entry'); |
| 199 | U09 | ␠ [linha vazia / posição final] |
| 200 | U09 | await waitFor(async () => { |
| 201 | U09 | const log = await getTranslatorLog(storageMock); |
| 202 | U09 | return log.length === 500 && log[499].action === 'NEW_ENTRY'; |
| 203 | U09 | }); |
| 204 | U09 | ␠ [linha vazia / posição final] |
| 205 | U09 | const log = await getTranslatorLog(storageMock); |
| 206 | U09 | expect(log).toHaveLength(500); |
| 207 | U09 | expect(log[0].id).toBe('old-1'); |
| 208 | U09 | expect(log[499]).toEqual(expect.objectContaining({ |
| 209 | U09 | action: 'NEW_ENTRY', |
| 210 | U09 | detail: 'newest entry', |
| 211 | U09 | })); |
| 212 | U09 | }); |
| 213 | U10 | ␠ [linha vazia / posição final] |
| 214 | U10 | test('PERF-03 getMany consulta 100 hashes com 15 hits e 85 misses em ate 500ms', async () => { |
| 215 | U10 | const repo = createInMemoryRepository(); |
| 216 | U10 | await repo.putMany(createFifteenPageImages(256)); |
| 217 | U10 | ␠ [linha vazia / posição final] |
| 218 | U10 | const startedAt = performance.now(); |
| 219 | U10 | const result = await repo.getMany(createHundredHashes()); |
| 220 | U10 | const elapsedMs = performance.now() - startedAt; |
| 221 | U10 | ␠ [linha vazia / posição final] |
| 222 | U10 | expect(elapsedMs).toBeLessThanOrEqual(perfLimit(500)); |
| 223 | U10 | expect(Object.keys(result)).toHaveLength(15); |
| 224 | U10 | expect(result['page-0']).toContain('data:image/png;base64,'); |
| 225 | U10 | expect(result['page-99']).toBeUndefined(); |
| 226 | U10 | }); |
| 227 | U11 | ␠ [linha vazia / posição final] |
| 228 | U11 | test('PERF-04 putMany salva 15 imagens pequenas sem truncar nem sobrescrever', async () => { |
| 229 | U11 | const repo = createInMemoryRepository(); |
| 230 | U11 | const entries = createFifteenPageImages(1024); |
| 231 | U11 | ␠ [linha vazia / posição final] |
| 232 | U11 | const startedAt = performance.now(); |
| 233 | U11 | await expect(repo.putMany(entries)).resolves.toEqual({ saved: true, count: 15 }); |
| 234 | U11 | const elapsedMs = performance.now() - startedAt; |
| 235 | U11 | ␠ [linha vazia / posição final] |
| 236 | U11 | const result = await repo.getMany(entries.map(entry => entry.hash)); |
| 237 | U11 | ␠ [linha vazia / posição final] |
| 238 | U11 | expect(elapsedMs).toBeLessThanOrEqual(perfLimit(300)); |
| 239 | U11 | expect(Object.keys(result)).toHaveLength(15); |
| 240 | U11 | entries.forEach(entry => { |
| 241 | U11 | expect(result[entry.hash]).toBe(entry.translatedDataUrl); |
| 242 | U11 | }); |
| 243 | U11 | }); |
| 244 | U12 | ␠ [linha vazia / posição final] |
| 245 | U12 | test('PERF-05 popup renderiza 200 capitulos com 15 paginas cada em ate 1s', async () => { |
| 246 | U12 | const tab = await tabsMock.create({ url: 'https://reader.test/chapter-live', active: true }); |
| 247 | U12 | tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => { |
| 248 | U12 | if (message.action === 'GET_PAGE_IMAGES') sendResponse({ images: [] }); |
| 249 | U12 | else sendResponse({ success: true }); |
| 250 | U12 | }); |
| 251 | U12 | ␠ [linha vazia / posição final] |
| 252 | U12 | const storagePayload = { |
| 253 | U12 | enabledDomains: ['reader.test'], |
| 254 | U12 | chapterList: Array.from({ length: 200 }, (_, index) => ({ |
| 255 | U12 | id: \`chap_${index}\`, |
| 256 | U12 | url: \`https://reader.test/manga/chapter-${index}\`, |
| 257 | U12 | title: \`Chapter ${String(index).padStart(3, '0')}\`, |
| 258 | U12 | timestamp: 1700000000000 + index, |
| 259 | U12 | })), |
| 260 | U12 | 'siteMeta_reader.test': { title: 'Reader Test' }, |
| 261 | U12 | }; |
| 262 | U12 | for (let chap = 0; chap < 200; chap += 1) { |
| 263 | U12 | storagePayload[\`chap_${chap}_images\`] = Object.fromEntries( |
| 264 | U12 | Array.from({ length: 15 }, (_, page) => [ |
| 265 | U12 | page, |
| 266 | U12 | \`data:image/png;base64,${String(chap).padStart(3, '0')}${String(page).padStart(2, '0')}\`, |
| 267 | U12 | ]) |
| 268 | U12 | ); |
| 269 | U12 | } |
| 270 | U12 | await storageMock.set(storagePayload); |
| 271 | U12 | ␠ [linha vazia / posição final] |
| 272 | U12 | const heapBefore = process.memoryUsage ? process.memoryUsage().heapUsed : 0; |
| 273 | U12 | await loadExtensionPage({ |
| 274 | U12 | htmlPath: 'extension/popup/popup.html', |
| 275 | U12 | scriptPath: 'extension/popup/popup.js', |
| 276 | U12 | fireDOMContentLoaded: true, |
| 277 | U12 | }); |
| 278 | U12 | ␠ [linha vazia / posição final] |
| 279 | U12 | const startedAt = performance.now(); |
| 280 | U12 | document.querySelector('[data-target="translated-tab"]').click(); |
| 281 | U12 | ␠ [linha vazia / posição final] |
| 282 | U12 | await waitFor(() => document.querySelectorAll('#chapter-list .chapter-item').length === 200, { |
| 283 | U12 | timeout: perfLimit(1000), |
| 284 | U12 | }); |
| 285 | U12 | const elapsedMs = performance.now() - startedAt; |
| 286 | U12 | await flushAsyncTasks(8); |
| 287 | U12 | ␠ [linha vazia / posição final] |
| 288 | U12 | const heapAfter = process.memoryUsage ? process.memoryUsage().heapUsed : heapBefore; |
| 289 | U12 | const heapDeltaMb = (heapAfter - heapBefore) / MB; |
| 290 | U12 | ␠ [linha vazia / posição final] |
| 291 | U12 | expect(elapsedMs).toBeLessThanOrEqual(perfLimit(1000)); |
| 292 | U12 | expect(document.querySelectorAll('#chapter-list .site-folder')).toHaveLength(1); |
| 293 | U12 | expect(document.querySelectorAll('#chapter-list .chapter-item')).toHaveLength(200); |
| 294 | U12 | expect(document.querySelector('#chapter-list .chapter-item').textContent).toMatch(/15\s+p.g\./); |
| 295 | U12 | if (heapBefore && heapAfter >= heapBefore) { |
| 296 | U12 | expect(heapDeltaMb).toBeLessThan(150); |
| 297 | U12 | } |
| 298 | U12 | }); |
| 299 | U13 | ␠ [linha vazia / posição final] |
| 300 | U13 | test('PERF-06 maxConcurrentJobs=10 processa 15 jobs em duas ondas sem exceder limite', async () => { |
| 301 | U13 | const backgroundModule = loadBackgroundModule(BACKGROUND_PATH); |
| 302 | U13 | await storageMock.set({ debugMode: true }); |
| 303 | U13 | backgroundModule.__setState({ |
| 304 | U13 | jobQueue: createFifteenJobBatch(), |
| 305 | U13 | isProcessing: true, |
| 306 | U13 | stopRequested: false, |
| 307 | U13 | activeJobsCount: 0, |
| 308 | U13 | totalJobs: 15, |
| 309 | U13 | completedJobs: 0, |
| 310 | U13 | _cachedMaxCon: 10, |
| 311 | U13 | }); |
| 312 | U13 | ␠ [linha vazia / posição final] |
| 313 | U13 | const createSpy = jest.spyOn(chrome.tabs, 'create'); |
| 314 | U13 | ␠ [linha vazia / posição final] |
| 315 | U13 | await backgroundModule.processNextJob(); |
| 316 | U13 | await waitFor(() => createSpy.mock.calls.length === 10); |
| 317 | U13 | ␠ [linha vazia / posição final] |
| 318 | U13 | let state = backgroundModule.__getState(); |
| 319 | U13 | expect(state.activeJobsCount).toBe(10); |
| 320 | U13 | expect(state.jobQueue).toHaveLength(5); |
| 321 | U13 | ␠ [linha vazia / posição final] |
| 322 | U13 | const firstWaveTabIds = Array.from(tabsMock._tabs.keys()); |
| 323 | U13 | firstWaveTabIds.forEach(tabId => backgroundModule.finalizeJob(tabId, 9001, false)); |
| 324 | U13 | ␠ [linha vazia / posição final] |
| 325 | U13 | await waitFor(() => createSpy.mock.calls.length === 15); |
| 326 | U13 | state = backgroundModule.__getState(); |
| 327 | U13 | ␠ [linha vazia / posição final] |
| 328 | U13 | expect(state.activeJobsCount).toBeLessThanOrEqual(10); |
| 329 | U13 | expect(state.jobQueue).toHaveLength(0); |
| 330 | U13 | expect(createSpy).toHaveBeenCalledTimes(15); |
| 331 | U13 | }); |
| 332 | U14 | ␠ [linha vazia / posição final] |
| 333 | U14 | test('PERF-07 100 chamadas paralelas de processNextJob nao ultrapassam 5 jobs ativos', async () => { |
| 334 | U14 | const backgroundModule = loadBackgroundModule(BACKGROUND_PATH); |
| 335 | U14 | await storageMock.set({ debugMode: true }); |
| 336 | U14 | backgroundModule.__setState({ |
| 337 | U14 | jobQueue: createFifteenJobBatch(), |
| 338 | U14 | isProcessing: true, |
| 339 | U14 | stopRequested: false, |
| 340 | U14 | activeJobsCount: 0, |
| 341 | U14 | totalJobs: 15, |
| 342 | U14 | completedJobs: 0, |
| 343 | U14 | _cachedMaxCon: 5, |
| 344 | U14 | }); |
| 345 | U14 | ␠ [linha vazia / posição final] |
| 346 | U14 | const originalCreate = chrome.tabs.create.bind(chrome.tabs); |
| 347 | U14 | let maxActiveObserved = 0; |
| 348 | U14 | const createSpy = jest.spyOn(chrome.tabs, 'create').mockImplementation((options, callback) => { |
| 349 | U14 | maxActiveObserved = Math.max( |
| 350 | U14 | maxActiveObserved, |
| 351 | U14 | backgroundModule.__getState().activeJobsCount |
| 352 | U14 | ); |
| 353 | U14 | return originalCreate(options, callback); |
| 354 | U14 | }); |
| 355 | U14 | ␠ [linha vazia / posição final] |
| 356 | U14 | await Promise.all(Array.from({ length: 100 }, () => backgroundModule.processNextJob())); |
| 357 | U14 | await waitFor(() => createSpy.mock.calls.length === 5); |
| 358 | U14 | ␠ [linha vazia / posição final] |
| 359 | U14 | const finalized = new Set(); |
| 360 | U14 | while (finalized.size < 15) { |
| 361 | U14 | const pendingTabs = Array.from(tabsMock._tabs.keys()).filter(tabId => !finalized.has(tabId)); |
| 362 | U14 | pendingTabs.forEach(tabId => { |
| 363 | U14 | finalized.add(tabId); |
| 364 | U14 | backgroundModule.finalizeJob(tabId, 9001, false); |
| 365 | U14 | }); |
| 366 | U14 | await flushAsyncTasks(8); |
| 367 | U14 | if (createSpy.mock.calls.length >= 15 && finalized.size >= 15) break; |
| 368 | U14 | await waitFor(() => tabsMock._tabs.size > finalized.size \|\| createSpy.mock.calls.length >= 15); |
| 369 | U14 | } |
| 370 | U14 | ␠ [linha vazia / posição final] |
| 371 | U14 | expect(createSpy).toHaveBeenCalledTimes(15); |
| 372 | U14 | expect(maxActiveObserved).toBeLessThanOrEqual(5); |
| 373 | U14 | expect(backgroundModule.__getState().jobQueue).toHaveLength(0); |
| 374 | U14 | }); |
| 375 | U15 | ␠ [linha vazia / posição final] |
| 376 | U15 | test('PERF-08 IndexedDB persiste 15 imagens de aproximadamente 500KB em ate 2s', async () => { |
| 377 | U15 | const repo = createIndexedDbRepository({ |
| 378 | U15 | indexedDbFactory: new IDBFactory(), |
| 379 | U15 | dbName: uniqueDbName('perf-large-idb'), |
| 380 | U15 | }); |
| 381 | U15 | const dataUrlSize = 500 * 1024; |
| 382 | U15 | const entries = createFifteenPageImages(dataUrlSize); |
| 383 | U15 | ␠ [linha vazia / posição final] |
| 384 | U15 | const startedAt = performance.now(); |
| 385 | U15 | await expect(repo.putMany(entries)).resolves.toEqual({ saved: true, count: 15 }); |
| 386 | U15 | const elapsedMs = performance.now() - startedAt; |
| 387 | U15 | ␠ [linha vazia / posição final] |
| 388 | U15 | const result = await repo.getMany(entries.map(entry => entry.hash)); |
| 389 | U15 | expect(elapsedMs).toBeLessThanOrEqual(perfLimit(2000)); |
| 390 | U15 | expect(Object.keys(result)).toHaveLength(15); |
| 391 | U15 | ␠ [linha vazia / posição final] |
| 392 | U15 | entries.forEach(entry => { |
| 393 | U15 | const retrieved = result[entry.hash]; |
| 394 | U15 | expect(retrieved).toBeTruthy(); |
| 395 | U15 | expect(Math.abs(retrieved.length - entry.translatedDataUrl.length)).toBeLessThan( |
| 396 | U15 | entry.translatedDataUrl.length * 0.01 |
| 397 | U15 | ); |
| 398 | U15 | }); |
| 399 | U15 | }); |
| 400 | U16 | ␠ [linha vazia / posição final] |
| 401 | U16 | test('PERF-09 quota em chrome.storage.local aciona lastError e envia oversized para IndexedDB', async () => { |
| 402 | U16 | const repository = createInMemoryRepository(); |
| 403 | U16 | const quotaFailures = installQuotaFailingStorage(5 * MB); |
| 404 | U16 | const largeDataUrl = \`data:image/png;base64,${'B'.repeat((5 * MB) + 1024)}\`; |
| 405 | U16 | const smallDataUrl = \`data:image/png;base64,${'C'.repeat(256 * 1024)}\`; |
| 406 | U16 | const imagesByIndex = Object.fromEntries( |
| 407 | U16 | Array.from({ length: 15 }, (_, index) => [ |
| 408 | U16 | index, |
| 409 | U16 | index % 3 === 0 ? smallDataUrl : largeDataUrl, |
| 410 | U16 | ]) |
| 411 | U16 | ); |
| 412 | U16 | ␠ [linha vazia / posição final] |
| 413 | U16 | const result = await saveImagesWithIndexedDbFallback({ |
| 414 | U16 | storageKey: 'chap_perf_images', |
| 415 | U16 | imagesByIndex, |
| 416 | U16 | repository, |
| 417 | U16 | }); |
| 418 | U16 | ␠ [linha vazia / posição final] |
| 419 | U16 | const fallbackEntries = await repository.getMany(result.fallbackHashes); |
| 420 | U16 | const stored = await storageMock.get(['chap_perf_images']); |
| 421 | U16 | ␠ [linha vazia / posição final] |
| 422 | U16 | expect(quotaFailures).toHaveLength(10); |
| 423 | U16 | expect(result).toEqual(expect.objectContaining({ |
| 424 | U16 | storageCount: 5, |
| 425 | U16 | fallbackCount: 10, |
| 426 | U16 | })); |
| 427 | U16 | expect(Object.keys(fallbackEntries)).toHaveLength(10); |
| 428 | U16 | Object.values(fallbackEntries).forEach(value => { |
| 429 | U16 | expect(value.length).toBeGreaterThan(5 * MB); |
| 430 | U16 | }); |
| 431 | U16 | expect(Object.keys(stored.chap_perf_images)).toHaveLength(5); |
| 432 | U16 | }); |
| 433 | U17 | }); |
| 434 | U17 | ␠ [linha vazia / posição final] |

## 19. Unidades semânticas

### U01 — linhas 1–26 — imports, polyfill e limites

Liga a suíte aos helpers, mocks e módulos reais; instala fallback de `structuredClone` somente quando a runtime não o oferece; define raiz, background, MB e política de relaxamento em coverage.

**Risco:** o polyfill JSON não possui semântica completa de structured clone, mas é apenas compatibilidade do ambiente de teste.

### U02 — linhas 27–44 — polling e isolamento de DB

`delay` e `waitFor` permitem esperar side effects assíncronos sem um sleep único fixo; `uniqueDbName` evita colisão entre bancos no processo.

**Lacuna:** banco fake não recebe `deleteDatabase` explícito ao final, embora nome único evite interferência funcional durante o run.

### U03 — linhas 45–67 — fixtures

Constrói volumes controlados: 15 jobs, 15 páginas e 100 hashes. As strings deliberadamente tornam tamanho e identidade previsvisíveis.

### U04 — linhas 68–83 — log e lastError

Lê `translatorLog` e converte o padrão callback + `runtime.lastError` em um valor `Error|null` para a simulação.

### U05 — linhas 84–104 — quota simulada

Instrumenta exclusivamente o mock de storage. O limite usa tamanho JSON, não quota real do browser.

### U06 — linhas 105–140 — fallback reimplementado

Implementa uma política completa dentro do teste: tentativa por item, seleção dos falhos, write no repository e agregado dos pequenos.

**Conclusão crítica:** essa unidade é objeto de teste, mas não é código de produção. Ver 114-001.

### U07 — linhas 141–158 — isolamento por teste

Reseta módulos, storage, tabs e DOM antes de cada caso; restaura spies depois. Isso reduz contaminação entre os nove cenários.

### U08 — linhas 159–181 — PERF-01

Exercita `log` real em burst e mede batching por número de writes e estado final.

### U09 — linhas 182–212 — PERF-02

Exercita política de retenção de 500 logs, incluindo expulsão da entrada mais antiga.

### U10 — linhas 213–226 — PERF-03

Exercita `getMany` do repository in-memory real em 100 chaves com 15 hits.

### U11 — linhas 227–243 — PERF-04

Exercita `putMany`/getMany real e verifica integridade exata das quinze Data URLs.

### U12 — linhas 244–298 — PERF-05

Monta 200 capítulos × 15 páginas, carrega popup real em JSDOM e mede o render disparado pelo clique. Também aplica uma guarda aproximada de heap Node.

### U13 — linhas 299–331 — PERF-06

Injeta estado do background, abre dez jobs, finaliza a primeira onda e comprova drenagem dos quinze sem superar o teto de 10.

### U14 — linhas 332–374 — PERF-07

Cria corrida de 100 chamadas concorrentes contra limite 5, registra pico visto durante `tabs.create` e drena os quinze jobs.

### U15 — linhas 375–399 — PERF-08

Usa repository real sobre fake-indexeddb, mede putMany e confirma recuperação/tamanho. É boa regressão algorítmica, não benchmark de browser.

### U16 — linhas 400–432 — PERF-09

Testa o mock de quota e o helper local de fallback. As contagens 10 grandes/5 pequenas derivam de `index % 3 === 0`.

### U17 — linhas 433–434 — fechamento

Fecha o describe; a posição 434 é o newline final explicitamente contabilizado.

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

**Resultado da autoauditoria:** APPROVED para conclusão documental, com solicitações externas abertas.

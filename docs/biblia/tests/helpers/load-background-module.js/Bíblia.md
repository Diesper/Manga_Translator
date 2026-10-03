# Bíblia técnica — tests/helpers/load-background-module.js


> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 8  
> **SHA auditado:** b1a20544a10b3b1410f4b3e9c2be6f53b7ac3113  
> **Índice:** 100  
> **Linhas textuais:** 120 — **posições:** 121 com newline final  
> **PR:** #66 — **branch:** docs/project-bible

## 1. Papel arquitetural

Este helper transforma `extension/background.js` em um módulo inspecionável no Node/Jest sem modificar produção. Ele lê o fonte real, concatena `__getState`, `__setState` e uma superfície de exports, e executa tudo no mesmo `new Function`. A instrumentação, por ficar no mesmo corpo lexical, alcança internals privados do background.

O helper é somente de teste; não é carregado pelo service worker em produção.

## 2. Vínculo com o background real

O SHA observado de `extension/background.js` foi `667c05eb2d7adfca16a79d3e706c39a1e9398b72`. O fonte atual contém `_finalizedTabs` na linha 28, `state()` na 240, `restoreState`/`syncState` nas 254/264, `_logQueue`/`_logFlushing` nas 405–406, watchdogs nas 489/493, `sendProgress` na 793, helpers de download/marker nas 798/819/870 e wrappers `processNextJob`, `finalizeJob` e `_refreshMaxCon` próximos de 1217–1225.

Esses símbolos formam um contrato implícito de teste: não são API pública de produção, porém o loader depende nominalmente deles.

## 3. Bootstrap e resolução CommonJS

No service worker o background usa `importScripts`; em Node, quando `require` existe, usa o branch CommonJS. `Module.createRequire(backgroundPath)` faz `./background/*` e `./shared/*` resolverem como se o próprio `extension/background.js` tivesse sido requerido.

Cada chamada cria novo corpo lexical do background principal, mas dependências carregadas por `localRequire` continuam sujeitas ao cache normal do Node. Isso é uma fronteira de isolamento importante.

## 4. Estado e seams de teste

`__getState` devolve vários campos por referência direta e somente converte `_finalizedTabs` em Array. `__setState` escreve diretamente no runtimeState e em variáveis lexicais, podendo montar estados difíceis ou impossíveis de alcançar pelos fluxos normais. O tratamento do Set preserva sua identidade ao limpar e repopular.

## 5. Consumidores localizados

Foram localizados pelo menos 11 consumers: `test_bg59.test.js`, `regex-escape.test.js`, `download-wait.test.js`, `performance.test.js`, `marker-anchor-real.test.js`, `helpers-real.test.js`, `routed-actions-legacy.test.js`, `lifecycle-alarms-real.test.js`, `message-handlers-real.test.js`, `process-finalize-real.test.js` e `plan-missing-handlers-real.test.js`.

## 6. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| Loader devolve internals invocáveis | múltiplas suítes usam o helper e exercitam exports | 🟨 EXECUTADO INDIRETAMENTE |
| `__setState`/`__getState` funcionam nos campos assertados | `helpers-real.test.js` e outras fazem mutação + assertions | ✅ PROVADO DIRETAMENTE |
| `_logQueue`/`_logFlushing` são controláveis | `helpers-real.test.js` injeta e verifica esses campos | ✅ PROVADO DIRETAMENTE |
| `processNextJob`/`finalizeJob` atingem lógica real | `process-finalize-real.test.js` verifica estado/storage/tabs | ✅ PROVADO DIRETAMENTE nos fluxos exercitados |
| `fetch` injetado é usado | `test_bg59.test.js` verifica `global.fetch` após carregar o helper | ✅ PROVADO DIRETAMENTE no cenário |
| resolução relativa via `createRequire` | consumers dependem dos módulos reais | 🟨 EXECUTADO INDIRETAMENTE |
| binding focal de `FileReader` | sem assertion específica localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| isolamento entre cargas | sem prova focal de cache/globals/listeners | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| lista completa de exports | consumers cobrem subconjuntos | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Trust boundaries e riscos

`new Function` executa fonte local confiado pelo caller e existe somente no tooling de teste. `backgroundPath` não possui allowlist; apontar para outro JavaScript executaria esse conteúdo no processo de teste. `chrome`, `fetch` e `FileReader` são capturados no momento do load. O helper não oferece teardown de listeners/timers/side effects.

Riscos principais: acoplamento a nomes privados; snapshots parcialmente mutáveis; setter que bypassa invariantes; dependências CommonJS cacheadas; namespaces globais compartilhados; ausência de `dispose()`; colisão futura com `__getState`/`__setState`; e drift da lista manual de exports.

## 8. Solicitações ao auditor

### 100-001 — TEST_REQUIRED — OPEN

Criar teste focal do próprio loader para path/sintaxe inválidos, bindings, resolução local de require, superfície de exports e propagação de erros. **Severidade: NORMAL.**

### 100-002 — TEST_ISOLATION_REVIEW — OPEN

Provar duas cargas consecutivas sem vazamento por cache CommonJS, globals, listeners ou timers; hoje não há prova focal. **Severidade: HIGH.**

### 100-003 — CONTRACT_REVIEW — OPEN

Decidir se a duplicação manual de nomes privados/exports deve continuar e, se sim, criar gate focal de drift. **Severidade: NORMAL.**

### 100-004 — TEST_SEAM_REVIEW — OPEN

Revisar o contrato de referências mutáveis no getter e de bypass de invariantes no setter. **Severidade: NORMAL.**

## 9. Invariantes

1. O fonte real deve continuar sendo o primeiro bloco executado.
2. A instrumentação deve permanecer no mesmo Function body.
3. O require deve continuar relativo ao background real.
4. Nenhum export de teste deve entrar no runtime de produção.
5. `_finalizedTabs` deve preservar a identidade do Set no reset.
6. Mocks necessários devem existir antes do load.
7. Erros de compilação/execução não podem ser convertidos em sucesso.
8. Consumers não devem tratar `__getState` como snapshot imutável.
9. O SHA desta Bíblia vale somente para `b1a20544a10b3b1410f4b3e9c2be6f53b7ac3113`.

## 10. Fonte integral auditada

~~~javascript
const fs = require('fs');
const path = require('path');
const Module = require('module');

function buildStateGetter() {
    return `
function __getState() {
    const runtimeState = state();
    return {
        jobQueue: runtimeState.jobQueue,
        isProcessing: runtimeState.isProcessing,
        stopRequested: runtimeState.stopRequested,
        activeMangaTabId: runtimeState.activeMangaTabId,
        currentBatchId: runtimeState.currentBatchId,
        extractionTabs: runtimeState.extractionTabs,
        totalJobs: runtimeState.totalJobs,
        completedJobs: runtimeState.completedJobs,
        activeJobsCount: runtimeState.activeJobsCount,
        completionClaimedBatchId: runtimeState.completionClaimedBatchId,
        pendingBatches: runtimeState.pendingBatches,
        jobIndex: runtimeState.jobIndex,
        _cachedMaxCon: runtimeState._cachedMaxCon,
        _logQueue,
        _logFlushing,
        _finalizedTabs: Array.from(_finalizedTabs),
    };
}
`;
}

function buildStateSetter() {
    return `
function __setState(next = {}) {
    const has = (key) => Object.prototype.hasOwnProperty.call(next, key);
    const runtimeState = state();
    if (has('jobQueue')) runtimeState.jobQueue = next.jobQueue;
    if (has('isProcessing')) runtimeState.isProcessing = next.isProcessing;
    if (has('stopRequested')) runtimeState.stopRequested = next.stopRequested;
    if (has('activeMangaTabId')) runtimeState.activeMangaTabId = next.activeMangaTabId;
    if (has('currentBatchId')) runtimeState.currentBatchId = next.currentBatchId;
    if (has('extractionTabs')) runtimeState.extractionTabs = next.extractionTabs;
    if (has('totalJobs')) runtimeState.totalJobs = next.totalJobs;
    if (has('completedJobs')) runtimeState.completedJobs = next.completedJobs;
    if (has('activeJobsCount')) runtimeState.activeJobsCount = next.activeJobsCount;
    if (has('completionClaimedBatchId')) runtimeState.completionClaimedBatchId = next.completionClaimedBatchId;
    if (has('pendingBatches')) runtimeState.pendingBatches = next.pendingBatches;
    if (has('jobIndex')) runtimeState.jobIndex = next.jobIndex;
    if (has('_cachedMaxCon')) runtimeState._cachedMaxCon = next._cachedMaxCon;
    if (has('_logQueue')) _logQueue = next._logQueue;
    if (has('_logFlushing')) _logFlushing = next._logFlushing;
    if (has('_finalizedTabs')) {
        _finalizedTabs.clear();
        (next._finalizedTabs || []).forEach(id => _finalizedTabs.add(id));
    }
    return __getState();
}
`;
}

function buildExports() {
    return `
module.exports = {
    restoreState,
    syncState,
    log,
    _flushLog,
    clearWatchdog,
    armWatchdog,
    sendProgress,
    _refreshMaxCon,
    processNextJob,
    finalizeJob,
    waitForDownload,
    downloadImagesAndShow,
    handleMarkerAndShow,
    __getState,
    __setState,
};
`;
}

function loadBackgroundModule(backgroundPath) {
    const source = fs.readFileSync(backgroundPath, 'utf8');
    const instrumentedSource = [
        source,
        buildStateGetter(),
        buildStateSetter(),
        buildExports(),
    ].join('\n');
    const localRequire = Module.createRequire(backgroundPath);
    const backgroundModule = { exports: {} };
    const runner = new Function(
        'chrome',
        'fetch',
        'FileReader',
        'require',
        'module',
        'exports',
        '__filename',
        '__dirname',
        instrumentedSource
    );

    runner(
        globalThis.chrome || global.chrome,
        global.fetch,
        global.FileReader,
        localRequire,
        backgroundModule,
        backgroundModule.exports,
        backgroundPath,
        path.dirname(backgroundPath)
    );

    return backgroundModule.exports;
}

module.exports = {
    loadBackgroundModule,
};
~~~

## 11. Cobertura posição por posição

### Linha 001

- **Conteúdo:** `const fs = require('fs');`
- **Papel:** Importa fs para ler o background real.

### Linha 002

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa path para derivar diretórios.

### Linha 003

- **Conteúdo:** `const Module = require('module');`
- **Papel:** Importa Module para criar require relativo ao arquivo auditado.

### Linha 004

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 005

- **Conteúdo:** `function buildStateGetter() {`
- **Papel:** Declara o builder do getter injetado.

### Linha 006

- **Conteúdo:** `    return \``
- **Papel:** Abre o template literal do getter.

### Linha 007

- **Conteúdo:** `function __getState() {`
- **Papel:** Declara __getState no mesmo corpo lexical do background.

### Linha 008

- **Conteúdo:** `    const runtimeState = state();`
- **Papel:** Obtém o estado real via state().

### Linha 009

- **Conteúdo:** `    return {`
- **Papel:** Abre o objeto exposto pelo getter.

### Linha 010

- **Conteúdo:** `        jobQueue: runtimeState.jobQueue,`
- **Papel:** Expõe o campo interno `jobQueue` diretamente a partir de runtimeState.

### Linha 011

- **Conteúdo:** `        isProcessing: runtimeState.isProcessing,`
- **Papel:** Expõe o campo interno `isProcessing` diretamente a partir de runtimeState.

### Linha 012

- **Conteúdo:** `        stopRequested: runtimeState.stopRequested,`
- **Papel:** Expõe o campo interno `stopRequested` diretamente a partir de runtimeState.

### Linha 013

- **Conteúdo:** `        activeMangaTabId: runtimeState.activeMangaTabId,`
- **Papel:** Expõe o campo interno `activeMangaTabId` diretamente a partir de runtimeState.

### Linha 014

- **Conteúdo:** `        currentBatchId: runtimeState.currentBatchId,`
- **Papel:** Expõe o campo interno `currentBatchId` diretamente a partir de runtimeState.

### Linha 015

- **Conteúdo:** `        extractionTabs: runtimeState.extractionTabs,`
- **Papel:** Expõe o campo interno `extractionTabs` diretamente a partir de runtimeState.

### Linha 016

- **Conteúdo:** `        totalJobs: runtimeState.totalJobs,`
- **Papel:** Expõe o campo interno `totalJobs` diretamente a partir de runtimeState.

### Linha 017

- **Conteúdo:** `        completedJobs: runtimeState.completedJobs,`
- **Papel:** Expõe o campo interno `completedJobs` diretamente a partir de runtimeState.

### Linha 018

- **Conteúdo:** `        activeJobsCount: runtimeState.activeJobsCount,`
- **Papel:** Expõe o campo interno `activeJobsCount` diretamente a partir de runtimeState.

### Linha 019

- **Conteúdo:** `        completionClaimedBatchId: runtimeState.completionClaimedBatchId,`
- **Papel:** Expõe o campo interno `completionClaimedBatchId` diretamente a partir de runtimeState.

### Linha 020

- **Conteúdo:** `        pendingBatches: runtimeState.pendingBatches,`
- **Papel:** Expõe o campo interno `pendingBatches` diretamente a partir de runtimeState.

### Linha 021

- **Conteúdo:** `        jobIndex: runtimeState.jobIndex,`
- **Papel:** Expõe o campo interno `jobIndex` diretamente a partir de runtimeState.

### Linha 022

- **Conteúdo:** `        _cachedMaxCon: runtimeState._cachedMaxCon,`
- **Papel:** Expõe o campo interno `_cachedMaxCon` diretamente a partir de runtimeState.

### Linha 023

- **Conteúdo:** `        _logQueue,`
- **Papel:** Expõe _logQueue diretamente do escopo lexical; a referência é mutável.

### Linha 024

- **Conteúdo:** `        _logFlushing,`
- **Papel:** Expõe _logFlushing diretamente do escopo lexical.

### Linha 025

- **Conteúdo:** `        _finalizedTabs: Array.from(_finalizedTabs),`
- **Papel:** Expõe _finalizedTabs como Array, criando cópia do Set.

### Linha 026

- **Conteúdo:** `    };`
- **Papel:** Fecha o objeto do getter.

### Linha 027

- **Conteúdo:** `}`
- **Papel:** Fecha __getState.

### Linha 028

- **Conteúdo:** `\`;`
- **Papel:** Fecha o template do getter.

### Linha 029

- **Conteúdo:** `}`
- **Papel:** Fecha buildStateGetter.

### Linha 030

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 031

- **Conteúdo:** `function buildStateSetter() {`
- **Papel:** Declara o builder do setter injetado.

### Linha 032

- **Conteúdo:** `    return \``
- **Papel:** Abre o template literal do setter.

### Linha 033

- **Conteúdo:** `function __setState(next = {}) {`
- **Papel:** Declara __setState(next={}), seam de preparação de estado para testes.

### Linha 034

- **Conteúdo:** `    const has = (key) => Object.prototype.hasOwnProperty.call(next, key);`
- **Papel:** Usa hasOwnProperty para diferenciar chave ausente de chave presente com undefined.

### Linha 035

- **Conteúdo:** `    const runtimeState = state();`
- **Papel:** Obtém o runtimeState real via state().

### Linha 036

- **Conteúdo:** `    if (has('jobQueue')) runtimeState.jobQueue = next.jobQueue;`
- **Papel:** Se `jobQueue` estiver presente em next, sobrescreve diretamente runtimeState.jobQueue; o seam bypassa invariantes normais de produção.

### Linha 037

- **Conteúdo:** `    if (has('isProcessing')) runtimeState.isProcessing = next.isProcessing;`
- **Papel:** Se `isProcessing` estiver presente em next, sobrescreve diretamente runtimeState.isProcessing; o seam bypassa invariantes normais de produção.

### Linha 038

- **Conteúdo:** `    if (has('stopRequested')) runtimeState.stopRequested = next.stopRequested;`
- **Papel:** Se `stopRequested` estiver presente em next, sobrescreve diretamente runtimeState.stopRequested; o seam bypassa invariantes normais de produção.

### Linha 039

- **Conteúdo:** `    if (has('activeMangaTabId')) runtimeState.activeMangaTabId = next.activeMangaTabId;`
- **Papel:** Se `activeMangaTabId` estiver presente em next, sobrescreve diretamente runtimeState.activeMangaTabId; o seam bypassa invariantes normais de produção.

### Linha 040

- **Conteúdo:** `    if (has('currentBatchId')) runtimeState.currentBatchId = next.currentBatchId;`
- **Papel:** Se `currentBatchId` estiver presente em next, sobrescreve diretamente runtimeState.currentBatchId; o seam bypassa invariantes normais de produção.

### Linha 041

- **Conteúdo:** `    if (has('extractionTabs')) runtimeState.extractionTabs = next.extractionTabs;`
- **Papel:** Se `extractionTabs` estiver presente em next, sobrescreve diretamente runtimeState.extractionTabs; o seam bypassa invariantes normais de produção.

### Linha 042

- **Conteúdo:** `    if (has('totalJobs')) runtimeState.totalJobs = next.totalJobs;`
- **Papel:** Se `totalJobs` estiver presente em next, sobrescreve diretamente runtimeState.totalJobs; o seam bypassa invariantes normais de produção.

### Linha 043

- **Conteúdo:** `    if (has('completedJobs')) runtimeState.completedJobs = next.completedJobs;`
- **Papel:** Se `completedJobs` estiver presente em next, sobrescreve diretamente runtimeState.completedJobs; o seam bypassa invariantes normais de produção.

### Linha 044

- **Conteúdo:** `    if (has('activeJobsCount')) runtimeState.activeJobsCount = next.activeJobsCount;`
- **Papel:** Se `activeJobsCount` estiver presente em next, sobrescreve diretamente runtimeState.activeJobsCount; o seam bypassa invariantes normais de produção.

### Linha 045

- **Conteúdo:** `    if (has('completionClaimedBatchId')) runtimeState.completionClaimedBatchId = next.completionClaimedBatchId;`
- **Papel:** Se `completionClaimedBatchId` estiver presente em next, sobrescreve diretamente runtimeState.completionClaimedBatchId; o seam bypassa invariantes normais de produção.

### Linha 046

- **Conteúdo:** `    if (has('pendingBatches')) runtimeState.pendingBatches = next.pendingBatches;`
- **Papel:** Se `pendingBatches` estiver presente em next, sobrescreve diretamente runtimeState.pendingBatches; o seam bypassa invariantes normais de produção.

### Linha 047

- **Conteúdo:** `    if (has('jobIndex')) runtimeState.jobIndex = next.jobIndex;`
- **Papel:** Se `jobIndex` estiver presente em next, sobrescreve diretamente runtimeState.jobIndex; o seam bypassa invariantes normais de produção.

### Linha 048

- **Conteúdo:** `    if (has('_cachedMaxCon')) runtimeState._cachedMaxCon = next._cachedMaxCon;`
- **Papel:** Se `_cachedMaxCon` estiver presente em next, sobrescreve diretamente runtimeState._cachedMaxCon; o seam bypassa invariantes normais de produção.

### Linha 049

- **Conteúdo:** `    if (has('_logQueue')) _logQueue = next._logQueue;`
- **Papel:** Permite substituir diretamente a variável lexical _logQueue.

### Linha 050

- **Conteúdo:** `    if (has('_logFlushing')) _logFlushing = next._logFlushing;`
- **Papel:** Permite substituir diretamente _logFlushing.

### Linha 051

- **Conteúdo:** `    if (has('_finalizedTabs')) {`
- **Papel:** Abre tratamento especial de _finalizedTabs.

### Linha 052

- **Conteúdo:** `        _finalizedTabs.clear();`
- **Papel:** Limpa o Set existente preservando sua identidade.

### Linha 053

- **Conteúdo:** `        (next._finalizedTabs || []).forEach(id => _finalizedTabs.add(id));`
- **Papel:** Repopula o Set com os ids fornecidos.

### Linha 054

- **Conteúdo:** `    }`
- **Papel:** Fecha o tratamento de _finalizedTabs.

### Linha 055

- **Conteúdo:** `    return __getState();`
- **Papel:** Retorna __getState após a mutação.

### Linha 056

- **Conteúdo:** `}`
- **Papel:** Fecha __setState.

### Linha 057

- **Conteúdo:** `\`;`
- **Papel:** Fecha o template do setter.

### Linha 058

- **Conteúdo:** `}`
- **Papel:** Fecha buildStateSetter.

### Linha 059

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 060

- **Conteúdo:** `function buildExports() {`
- **Papel:** Declara o builder da superfície de exports artificial.

### Linha 061

- **Conteúdo:** `    return \``
- **Papel:** Abre o template literal de exports.

### Linha 062

- **Conteúdo:** `module.exports = {`
- **Papel:** Substitui module.exports da instância instrumentada por uma lista explícita de internals.

### Linha 063

- **Conteúdo:** `    restoreState,`
- **Papel:** Exporta `restoreState` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 064

- **Conteúdo:** `    syncState,`
- **Papel:** Exporta `syncState` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 065

- **Conteúdo:** `    log,`
- **Papel:** Exporta `log` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 066

- **Conteúdo:** `    _flushLog,`
- **Papel:** Exporta `_flushLog` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 067

- **Conteúdo:** `    clearWatchdog,`
- **Papel:** Exporta `clearWatchdog` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 068

- **Conteúdo:** `    armWatchdog,`
- **Papel:** Exporta `armWatchdog` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 069

- **Conteúdo:** `    sendProgress,`
- **Papel:** Exporta `sendProgress` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 070

- **Conteúdo:** `    _refreshMaxCon,`
- **Papel:** Exporta `_refreshMaxCon` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 071

- **Conteúdo:** `    processNextJob,`
- **Papel:** Exporta `processNextJob` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 072

- **Conteúdo:** `    finalizeJob,`
- **Papel:** Exporta `finalizeJob` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 073

- **Conteúdo:** `    waitForDownload,`
- **Papel:** Exporta `waitForDownload` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 074

- **Conteúdo:** `    downloadImagesAndShow,`
- **Papel:** Exporta `downloadImagesAndShow` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 075

- **Conteúdo:** `    handleMarkerAndShow,`
- **Papel:** Exporta `handleMarkerAndShow` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 076

- **Conteúdo:** `    __getState,`
- **Papel:** Exporta `__getState` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 077

- **Conteúdo:** `    __setState,`
- **Papel:** Exporta `__setState` da mesma instância lexical instrumentada; a lista manual cria acoplamento nominal.

### Linha 078

- **Conteúdo:** `};`
- **Papel:** Fecha o objeto de exports.

### Linha 079

- **Conteúdo:** `\`;`
- **Papel:** Fecha o template literal.

### Linha 080

- **Conteúdo:** `}`
- **Papel:** Fecha buildExports.

### Linha 081

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 082

- **Conteúdo:** `function loadBackgroundModule(backgroundPath) {`
- **Papel:** Declara loadBackgroundModule(backgroundPath), única API pública do helper.

### Linha 083

- **Conteúdo:** `    const source = fs.readFileSync(backgroundPath, 'utf8');`
- **Papel:** Lê integralmente o arquivo indicado como UTF-8; erros propagam.

### Linha 084

- **Conteúdo:** `    const instrumentedSource = [`
- **Papel:** Inicia a composição do corpo instrumentado.

### Linha 085

- **Conteúdo:** `        source,`
- **Papel:** Inclui o fonte real como primeiro bloco.

### Linha 086

- **Conteúdo:** `        buildStateGetter(),`
- **Papel:** Anexa __getState.

### Linha 087

- **Conteúdo:** `        buildStateSetter(),`
- **Papel:** Anexa __setState.

### Linha 088

- **Conteúdo:** `        buildExports(),`
- **Papel:** Anexa o bloco de exports.

### Linha 089

- **Conteúdo:** `    ].join('\n');`
- **Papel:** Une os blocos com newline.

### Linha 090

- **Conteúdo:** `    const localRequire = Module.createRequire(backgroundPath);`
- **Papel:** Cria require relativo a backgroundPath para preservar resolução de paths do background.

### Linha 091

- **Conteúdo:** `    const backgroundModule = { exports: {} };`
- **Papel:** Cria objeto module artificial.

### Linha 092

- **Conteúdo:** `    const runner = new Function(`
- **Papel:** Inicia new Function com fonte real + instrumentação.

### Linha 093

- **Conteúdo:** `        'chrome',`
- **Papel:** Declara o parâmetro explícito `chrome` no wrapper dinâmico.

### Linha 094

- **Conteúdo:** `        'fetch',`
- **Papel:** Declara o parâmetro explícito `fetch` no wrapper dinâmico.

### Linha 095

- **Conteúdo:** `        'FileReader',`
- **Papel:** Declara o parâmetro explícito `FileReader` no wrapper dinâmico.

### Linha 096

- **Conteúdo:** `        'require',`
- **Papel:** Declara o parâmetro explícito `require` no wrapper dinâmico.

### Linha 097

- **Conteúdo:** `        'module',`
- **Papel:** Declara o parâmetro explícito `module` no wrapper dinâmico.

### Linha 098

- **Conteúdo:** `        'exports',`
- **Papel:** Declara o parâmetro explícito `exports` no wrapper dinâmico.

### Linha 099

- **Conteúdo:** `        '__filename',`
- **Papel:** Declara o parâmetro explícito `__filename` no wrapper dinâmico.

### Linha 100

- **Conteúdo:** `        '__dirname',`
- **Papel:** Declara o parâmetro explícito `__dirname` no wrapper dinâmico.

### Linha 101

- **Conteúdo:** `        instrumentedSource`
- **Papel:** Passa instrumentedSource como corpo do new Function; erros de sintaxe aparecem na compilação.

### Linha 102

- **Conteúdo:** `    );`
- **Papel:** Fecha a criação do runner.

### Linha 103

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 104

- **Conteúdo:** `    runner(`
- **Papel:** Invoca o runner imediatamente; side effects top-level do background acontecem aqui.

### Linha 105

- **Conteúdo:** `        globalThis.chrome || global.chrome,`
- **Papel:** Injeta chrome global, preferindo globalThis.chrome.

### Linha 106

- **Conteúdo:** `        global.fetch,`
- **Papel:** Injeta global.fetch capturado no momento do load.

### Linha 107

- **Conteúdo:** `        global.FileReader,`
- **Papel:** Injeta global.FileReader.

### Linha 108

- **Conteúdo:** `        localRequire,`
- **Papel:** Injeta localRequire.

### Linha 109

- **Conteúdo:** `        backgroundModule,`
- **Papel:** Injeta o objeto artificial como module.

### Linha 110

- **Conteúdo:** `        backgroundModule.exports,`
- **Papel:** Injeta a referência exports inicial.

### Linha 111

- **Conteúdo:** `        backgroundPath,`
- **Papel:** Injeta backgroundPath como __filename.

### Linha 112

- **Conteúdo:** `        path.dirname(backgroundPath)`
- **Papel:** Injeta dirname(backgroundPath) como __dirname.

### Linha 113

- **Conteúdo:** `    );`
- **Papel:** Fecha a execução do runner.

### Linha 114

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 115

- **Conteúdo:** `    return backgroundModule.exports;`
- **Papel:** Retorna module.exports final da instância instrumentada.

### Linha 116

- **Conteúdo:** `}`
- **Papel:** Fecha loadBackgroundModule.

### Linha 117

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 118

- **Conteúdo:** `module.exports = {`
- **Papel:** Abre o export CommonJS do próprio helper.

### Linha 119

- **Conteúdo:** `    loadBackgroundModule,`
- **Papel:** Exporta somente loadBackgroundModule.

### Linha 120

- **Conteúdo:** `};`
- **Papel:** Fecha o export do helper.

### Linha 121

- **Conteúdo:** _newline final após a linha 120_
- **Papel:** Posição terminal: newline final do arquivo.

## 12. Autoauditoria documental

- Fonte integral embutida e SHA reconfirmado.
- 120 linhas textuais + newline final = **121/121 posições**.
- Headings `Linha 001` → `Linha 121` completos e sequenciais.
- Consumers e background real foram lidos; evidência indireta não foi promovida a direta.
- Nenhum arquivo funcional/teste foi alterado para fabricar prova.
- Solicitações 100-001..004 permanecem OPEN no processo de auditoria separado.

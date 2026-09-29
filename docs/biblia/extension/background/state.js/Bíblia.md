# Bíblia técnica — `extension/background/state.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `7570b545d5e92496201a7741dee8605cd66fb015`  
> **Linhas textuais:** **267**  
> **Posições documentais:** **268** contando newline final  
> **Teste focal:** `tests/unit/background/state-api.test.js` — `d9c080339202848719ac448d7684d793684aced2`

## Identidade e papel arquitetural

`background/state.js` é a fonte residente de estado do background MV3 e a facade de persistência para `mt_state`. `background.js` carrega este módulo via `importScripts`, obtém `MangaTranslatorState`, e delega `get/patch/restore/sync/index` para ele. `jobs-lifecycle.js` e `tab-identity.js` recebem a própria facade de state como dependência.

O arquivo tem duas camadas históricas misturadas:

1. **API ativa e central:** `get`, `patch`, `syncState`, `mutate`, índice de jobs, `replaceGeminiTabReferences` e os getters/setters usados pelo background/módulos.
2. **API residual/legada:** `generateId`, `_markFinalized`, `reconcileJobs` e `ensureInitialized`. O `background.js` atual mantém seu próprio `generateId`/Set de finalização e usa `jobs-reconciliation.js` + seu próprio `ensureInitialized`, em vez dessas implementações exportadas por state.js.

Essa distinção é importante: presença no objeto exportado não prova uso runtime atual.

## Estado residente

Os campos controlam fila, batch ativo, contadores, abas auxiliares, batches pendentes e `jobIndex`. `_cachedMaxCon`, `_finalizedTabs` e `_initialized` também ficam residentes e somem quando o Service Worker é descartado.

A fonte durável é `chrome.storage.local.mt_state`; portanto callers que alteram getters/setters diretos precisam eventualmente sincronizar. Os setters **não** persistem automaticamente.

## get(): snapshot e isolamento de referências

`get()` clona `jobQueue` e `jobIndex` apenas no nível do Array, clona `extractionTabs` apenas no nível do objeto e faz clone adicional de cada batch/imagem em `pendingBatches`. O teste focal prova especificamente que `pendingBatches` retornado não altera o estado interno quando mutado externamente.

⚠️ Isso não significa deep immutability geral: objetos dentro de `jobQueue`, `jobIndex` e valores internos de `extractionTabs` ainda podem compartilhar referência com o estado residente.

## patch(): normalização

`patch` só toca campos presentes via `hasOwnProperty`. Booleans usam `!!`; contadores usam `Number(value)||0`; IDs usam `value||null`; arrays inválidos caem para `[]`; `extractionTabs` não-objeto cai para `{}`.

Há algumas consequências concretas: `activeMangaTabId=0` vira null; `currentBatchId=''` vira null; `Infinity` permanece Infinity porque é truthy após `Number`; números negativos também são aceitos. Não há schema validation neste módulo.

`jobQueue`, `jobIndex` e `extractionTabs` recebidos por patch não são clonados antes de virar estado residente. Um caller que retém essas referências pode alterá-las fora da facade.

## syncState(): ordem de snapshots

`syncState` captura `snapshot=get()` no momento da chamada e enfileira `storage.set` na `_persistenceChain`. O uso de `.then(write,write)` faz uma falha anterior não bloquear para sempre os writes seguintes.

Isso preserva a ordem dos snapshots **dentro da vida atual do worker**. Não é uma transação cross-worker nem compare-and-swap no storage.

## mutate(): read-modify-write serializado

`mutate` difere de `syncState`: o `get()` é feito dentro de `run`, depois que a operação anterior da chain terminou. Assim dois mutators concorrentes não começam do mesmo snapshot stale.

Se o mutator retorna objeto, `patch(result)` aplica a transição; se retorna undefined, o estado pode ainda ter sido alterado via setters/referências e mesmo assim um snapshot é persistido.

`tab-identity.test.js` usa o `state.js` real: `recordReplacement()` chama `state.replaceGeminiTabReferences()`, que por sua vez usa `mutate`. O teste prova que `jobIndex` e `extractionTabs` migram juntos sem alterar `completedJobs`. Porém não há teste focal lançando **dois mutates concorrentes** e demonstrando a ordem da chain.

## Índice de jobs

`indexAddJob` garante no máximo uma entrada por `geminiTabId` removendo a anterior e fazendo push da nova. `indexRemoveJob` devolve booleano indicando mudança. `indexJobsOfBatch(null/falsy)` devolve cópia do índice inteiro; com batchId, filtra por igualdade estrita.

Essas funções mutam apenas memória; o caller precisa `syncState`/`mutate` para durabilidade.

## Tab replacement

`replaceGeminiTabReferences` roda dentro de `mutate`, substitui `geminiTabId` no `jobIndex` e em cada entry de `extractionTabs`, depois persiste o snapshot. `tab-identity.test.js` prova o wiring real por meio de `recordReplacement(200,100)`.

O módulo de TabIdentity também migra `gemini_job_*`, watchdog, recovery journal, finalization marker e aliases; state.js cuida apenas das referências que vivem em `mt_state`.

## Funções legadas/residuais

### generateId

É uma implementação válida de UUID/fallback, mas o `background.js` atual injeta sua **própria** função `generateId` em `jobs-lifecycle`. Não encontrei caller de produção atual de `MangaTranslatorState.generateId`.

### _markFinalized

Também existe uma implementação duplicada no `background.js`, e é essa versão que é injetada no lifecycle atual. O export de state.js permanece compatível/legado.

### reconcileJobs / ensureInitialized

`state.js::reconcileJobs` é uma versão antiga que só checa existência física de tabs, limpa jobs/watchdogs mortos e ajusta contadores. O runtime atual usa `jobs-reconciliation.js`, que é canonical-aware e também trata recovery de finalização e resultado persistido. `background.js` possui seu próprio `ensureInitialized` moderno.

Usar acidentalmente a implementação legada de state.js como gate principal reduziria as garantias atuais de tab replacement/recovery.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `state-api.test.js` | ✅ PROVADO DIRETAMENTE | `patch + sync`, restore com mt_state, restore sem mt_state e isolamento de `pendingBatches` no snapshot. |
| `tab-identity.test.js` TAB-01 | ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO | Carrega state.js real e prova `replaceGeminiTabReferences` via TabIdentity: jobIndex/extractionTabs migram juntos e completedJobs é preservado. |
| `background.js` | 🟨 CONSUMIDOR REAL | Usa a facade para get/patch/restore/sync/index e a injeta em TabIdentity/Lifecycle. |
| `jobs-lifecycle-batch-status.test.js` | 🟨 EVIDÊNCIA INDIRETA | Prova a necessidade/contrato de `state.mutate`, mas vários casos usam um mock de mutate, não a implementação real deste arquivo. |
| `claim-gemini-job-action.test.js` | 🟨 CONSUMIDOR INDIRETO | Usa state/background em fluxos de ownership; não isola persistência desta facade. |

## Lacunas de teste, casos-limite e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para duas ou mais chamadas `mutate()` concorrentes provando que nenhuma atualização é perdida.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para duas chamadas `syncState()` concorrentes com primeiro write lento/falhando e segundo write posterior.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `patch(null)`, arrays/strings como nextState e todos os campos inválidos individualmente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para valores negativos/Infinity nos contadores.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para referência externa alterar `jobQueue`, `jobIndex` ou valores internos de `extractionTabs` depois de `patch()`/`get()`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `indexAddJob`, `indexRemoveJob` e `indexJobsOfBatch` isoladamente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `tabExists(0)`, lastError, tab ausente e throw síncrono.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** focal para `generateId` fallback sem crypto/randomUUID.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `_markFinalized` cleanup em 30 s neste módulo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `reconcileJobs`/`ensureInitialized` desta implementação legada; runtime atual usa outros caminhos.
- ⚠️ Em `reconcileJobs`, quando jobIndex está vazio, `activeJobsCount = Math.min(activeJobsCount,0)` deixa valor negativo negativo; o estado normal não deveria permitir negativos, mas patch/setters não impedem.
- ⚠️ `ensureInitialized` legado marca `_initialized=true` **antes** de reconciliar e captura qualquer erro; uma falha transitória não seria retentada por essa função durante o mesmo worker.
- ⚠️ Getters/setters diretos permitem contornar `patch` e não persistem automaticamente.
- ⚠️ A duplicação residual de `generateId`, `_markFinalized`, `reconcileJobs` e `ensureInitialized` aumenta risco de drift entre contratos antigos e runtime atual.

## Segurança e privacidade

`mt_state` contém IDs de abas, batch/job metadata e prompts dentro de `jobQueue/pendingBatches`; portanto é estado interno sensível ao fluxo da extensão. Este módulo não envia dados para rede.

A facade não valida origem de callers; ela é módulo interno do background. O boundary de segurança precisa ocorrer no router/actions antes de mutar state.

Clones parciais reduzem mutação acidental, mas não constituem isolamento de segurança entre código hostil — todos os callers rodam no mesmo contexto privilegiado do worker.

## Invariantes

1. `background/state.js` deve continuar sendo a única fonte residente oficial do snapshot de jobs.
2. `syncState` deve preservar ordem de writes dentro do worker.
3. `mutate` deve executar o read do snapshot somente depois da mutação anterior da chain.
4. `pendingBatches` retornado por get não pode compartilhar arrays/imagens mutáveis com o estado interno.
5. `replaceGeminiTabReferences` deve atualizar jobIndex e extractionTabs na mesma transição persistida.
6. Índice não deve conter duas entradas com o mesmo geminiTabId após `indexAddJob`.
7. Restore sem mt_state não deve apagar estado residente.
8. Setters diretos continuam compatibilidade, mas callers responsáveis por durabilidade precisam sincronizar.
9. Runtime moderno não deve regredir para `reconcileJobs/ensureInitialized` legados sem recuperar garantias de alias/journals.
10. Estado residente não deve ser tratado como durável após suspensão MV3.

## Fonte integral

~~~javascript
'use strict';
// background/state.js — Estado global e persistência do MangaTranslator

(function(scope) {
  // ── Estado Global ─────────────────────────────────────────
  let jobQueue        = [];
  let isProcessing    = false;
  let stopRequested   = false;
  let activeMangaTabId = null;
  let currentBatchId = null;
  let extractionTabs  = {};   
  let totalJobs       = 0;
  let completedJobs   = 0;
  let activeJobsCount = 0;
  let completionClaimedBatchId = null;
  let pendingBatches = [];

  // ── Índice durável de jobs abertos ───────────────────────────────────────────
  let jobIndex = [];

  let _cachedMaxCon = 1;
  const _finalizedTabs = new Set();
  let _initialized = false;
  // chrome.storage.local não oferece uma transação entre chamadas.  Uma fila
  // local preserva a ordem dos snapshots quando handlers concorrentes alteram o
  // estado no mesmo ciclo de vida do service worker.
  let _persistenceChain = Promise.resolve();

  function get() {
      return {
          jobQueue: Array.isArray(jobQueue) ? jobQueue.slice() : [],
          isProcessing: !!isProcessing,
          stopRequested: !!stopRequested,
          activeMangaTabId,
          currentBatchId,
          extractionTabs: { ...extractionTabs },
          totalJobs,
          completedJobs,
          activeJobsCount,
          completionClaimedBatchId,
          pendingBatches: Array.isArray(pendingBatches) ? pendingBatches.map(batch => ({
              ...batch,
              images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [],
          })) : [],
          jobIndex: Array.isArray(jobIndex) ? jobIndex.slice() : [],
      };
  }

  function patch(nextState = {}) {
      if (!nextState || typeof nextState !== 'object') return get();
      if (Object.prototype.hasOwnProperty.call(nextState, 'jobQueue')) jobQueue = Array.isArray(nextState.jobQueue) ? nextState.jobQueue : [];
      if (Object.prototype.hasOwnProperty.call(nextState, 'isProcessing')) isProcessing = !!nextState.isProcessing;
      if (Object.prototype.hasOwnProperty.call(nextState, 'stopRequested')) stopRequested = !!nextState.stopRequested;
      if (Object.prototype.hasOwnProperty.call(nextState, 'activeMangaTabId')) activeMangaTabId = nextState.activeMangaTabId || null;
      if (Object.prototype.hasOwnProperty.call(nextState, 'currentBatchId')) currentBatchId = nextState.currentBatchId || null;
      if (Object.prototype.hasOwnProperty.call(nextState, 'extractionTabs')) extractionTabs = nextState.extractionTabs && typeof nextState.extractionTabs === 'object' ? nextState.extractionTabs : {};
      if (Object.prototype.hasOwnProperty.call(nextState, 'totalJobs')) totalJobs = Number(nextState.totalJobs) || 0;
      if (Object.prototype.hasOwnProperty.call(nextState, 'completedJobs')) completedJobs = Number(nextState.completedJobs) || 0;
      if (Object.prototype.hasOwnProperty.call(nextState, 'activeJobsCount')) activeJobsCount = Number(nextState.activeJobsCount) || 0;
      if (Object.prototype.hasOwnProperty.call(nextState, 'completionClaimedBatchId')) completionClaimedBatchId = nextState.completionClaimedBatchId || null;
      if (Object.prototype.hasOwnProperty.call(nextState, 'pendingBatches')) pendingBatches = Array.isArray(nextState.pendingBatches) ? nextState.pendingBatches.map(batch => ({ ...batch, images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [] })) : [];
      if (Object.prototype.hasOwnProperty.call(nextState, 'jobIndex')) jobIndex = Array.isArray(nextState.jobIndex) ? nextState.jobIndex : [];
      return get();
  }

  // ── Utilitários ────────────────────────────────────────────────────────────
  function generateId(prefix = '') {
      try {
          if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
              return prefix + crypto.randomUUID();
          }
      } catch (_e) {}
      return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function _markFinalized(geminiTabId) {
      _finalizedTabs.add(geminiTabId);
      const cleanupTimer = setTimeout(() => _finalizedTabs.delete(geminiTabId), 30_000);
      if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
  }

  // ── Persistência de Estado ─────────────────────────────────────────────────
  async function restoreState() {
      const d = await chrome.storage.local.get(['mt_state']);
      if (!d.mt_state) return null;
      patch(d.mt_state);
      return get();
  }

  function syncState() {
      const snapshot = get();
      const write = () => chrome.storage.local.set({ mt_state: snapshot }).then(() => snapshot);
      _persistenceChain = _persistenceChain.then(write, write);
      return _persistenceChain;
  }

  // Use esta API para alterações que precisam ser observadas como uma única
  // transição persistida.  O mutator executa somente depois que a transição
  // anterior foi gravada, evitando o padrão read/modify/write concorrente.
  function mutate(mutator) {
      if (typeof mutator !== 'function') return Promise.resolve(get());
      const run = async () => {
          const result = await mutator(get());
          if (result && typeof result === 'object') patch(result);
          const snapshot = get();
          await chrome.storage.local.set({ mt_state: snapshot });
          return snapshot;
      };
      _persistenceChain = _persistenceChain.then(run, run);
      return _persistenceChain;
  }

  // ── Manutenção do índice de jobs ─────────────────────────────────────────────
  function indexAddJob(entry) {
      jobIndex = jobIndex.filter(j => j && j.geminiTabId !== entry.geminiTabId);
      jobIndex.push(entry);
  }
  function indexRemoveJob(geminiTabId) {
      const before = jobIndex.length;
      jobIndex = jobIndex.filter(j => j && j.geminiTabId !== geminiTabId);
      return jobIndex.length !== before;
  }
  function indexJobsOfBatch(batchId) {
      if (!batchId) return jobIndex.slice();
      return jobIndex.filter(j => j && j.batchId === batchId);
  }

  function replaceGeminiTabReferences(oldTabId, newTabId) {
      return mutate(snapshot => {
          snapshot.jobIndex = (Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []).map(entry =>
              entry && entry.geminiTabId === oldTabId
                  ? { ...entry, geminiTabId: newTabId }
                  : entry
          );
          const nextExtractionTabs = { ...(snapshot.extractionTabs || {}) };
          Object.keys(nextExtractionTabs).forEach(key => {
              const info = nextExtractionTabs[key];
              if (info && info.geminiTabId === oldTabId) {
                  nextExtractionTabs[key] = { ...info, geminiTabId: newTabId };
              }
          });
          snapshot.extractionTabs = nextExtractionTabs;
          return snapshot;
      });
  }

  function tabExists(tabId) {
      return new Promise(resolve => {
          if (!tabId && tabId !== 0) { resolve(false); return; }
          try {
              chrome.tabs.get(tabId, (tab) => {
                  if (chrome.runtime.lastError || !tab) resolve(false);
                  else resolve(true);
              });
          } catch (_e) { resolve(false); }
      });
  }

  async function reconcileJobs() {
      if (!Array.isArray(jobIndex) || jobIndex.length === 0) {
          activeJobsCount = Math.min(activeJobsCount, 0);
          return { alive: 0, dropped: 0 };
      }

      const alive = [];
      const dropped = [];
      for (const entry of jobIndex) {
          if (!entry) continue;
          const exists = await tabExists(entry.geminiTabId);
          if (exists) alive.push(entry);
          else dropped.push(entry);
      }

      if (dropped.length > 0) {
          const keys = [];
          dropped.forEach(entry => {
              keys.push(`gemini_job_${entry.geminiTabId}`);
              keys.push(`wd_data_${entry.geminiTabId}`);
              const alarmName = entry.jobId ? `watchdog_${entry.jobId}` : `watchdog_${entry.geminiTabId}`;
              chrome.alarms.clear(alarmName, () => {});
          });
          try { await chrome.storage.local.remove(keys); } catch (_e) {}
          
          if (self.MangaTranslatorLog && typeof self.MangaTranslatorLog.log === 'function') {
              self.MangaTranslatorLog.log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s) descartado(s) após reinício do worker`, {
                  dropped: dropped.map(j => j.geminiTabId),
              });
          } else if (typeof self.log === 'function') {
              self.log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s) descartado(s) após reinício do worker`, {
                  dropped: dropped.map(j => j.geminiTabId),
              });
          }
      }

      jobIndex = alive;
      activeJobsCount = alive.length;
      if (alive.length > 0 && !activeMangaTabId) {
          activeMangaTabId = alive[0].mangaTabId || null;
      }
      return { alive: alive.length, dropped: dropped.length };
  }

  async function ensureInitialized() {
      if (_initialized) return;
      await restoreState();
      _initialized = true;
      try {
          const result = await reconcileJobs();
          if (result.dropped > 0 || result.alive > 0) {
              await syncState();
              if (result.dropped > 0 && typeof self.processNextJob === 'function') {
                  self.processNextJob();
              }
          }
      } catch (_e) {}
  }

  scope.MangaTranslatorState = {
      get,
      patch,
      // Getters/setters for state
      get jobQueue() { return jobQueue; },
      set jobQueue(v) { jobQueue = v; },
      get isProcessing() { return isProcessing; },
      set isProcessing(v) { isProcessing = v; },
      get stopRequested() { return stopRequested; },
      set stopRequested(v) { stopRequested = v; },
      get activeMangaTabId() { return activeMangaTabId; },
      set activeMangaTabId(v) { activeMangaTabId = v; },
      get currentBatchId() { return currentBatchId; },
      set currentBatchId(v) { currentBatchId = v; },
      get extractionTabs() { return extractionTabs; },
      set extractionTabs(v) { extractionTabs = v; },
      get totalJobs() { return totalJobs; },
      set totalJobs(v) { totalJobs = v; },
      get completedJobs() { return completedJobs; },
      set completedJobs(v) { completedJobs = v; },
      get activeJobsCount() { return activeJobsCount; },
      set activeJobsCount(v) { activeJobsCount = v; },
      get completionClaimedBatchId() { return completionClaimedBatchId; },
      set completionClaimedBatchId(v) { completionClaimedBatchId = v || null; },
      get pendingBatches() { return pendingBatches; },
      set pendingBatches(v) { pendingBatches = Array.isArray(v) ? v : []; },
      get jobIndex() { return jobIndex; },
      set jobIndex(v) { jobIndex = v; },
      get _cachedMaxCon() { return _cachedMaxCon; },
      set _cachedMaxCon(v) { _cachedMaxCon = v; },
      get _finalizedTabs() { return _finalizedTabs; },
      get _initialized() { return _initialized; },
      set _initialized(v) { _initialized = v; },
      
      // Functions
      generateId,
      restoreState, 
      syncState, 
      mutate,
      ensureInitialized,
      indexAddJob, 
      indexRemoveJob, 
      indexJobsOfBatch,
      replaceGeminiTabReferences,
      tabExists, 
      _markFinalized, 
      reconcileJobs
  };

})(typeof self !== 'undefined' ? self : globalThis);

~~~

## Rastreabilidade 268/268

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/state.js — Estado global e persistência do MangaTranslator | Comentário arquitetural: background/state.js — Estado global e persistência do MangaTranslator. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U01 | (function(scope) { | Abre função/escopo de U01: (function(scope) { |
| 005 | U02 |   // ── Estado Global ───────────────────────────────────────── | Comentário arquitetural: ── Estado Global ─────────────────────────────────────────. |
| 006 | U02 |   let jobQueue        = []; | Declara estado residente mutável de U02: let jobQueue        = []; |
| 007 | U02 |   let isProcessing    = false; | Declara estado residente mutável de U02: let isProcessing    = false; |
| 008 | U02 |   let stopRequested   = false; | Declara estado residente mutável de U02: let stopRequested   = false; |
| 009 | U02 |   let activeMangaTabId = null; | Declara estado residente mutável de U02: let activeMangaTabId = null; |
| 010 | U02 |   let currentBatchId = null; | Declara estado residente mutável de U02: let currentBatchId = null; |
| 011 | U02 |   let extractionTabs  = {};    | Declara estado residente mutável de U02: let extractionTabs  = {}; |
| 012 | U02 |   let totalJobs       = 0; | Declara estado residente mutável de U02: let totalJobs       = 0; |
| 013 | U02 |   let completedJobs   = 0; | Declara estado residente mutável de U02: let completedJobs   = 0; |
| 014 | U02 |   let activeJobsCount = 0; | Declara estado residente mutável de U02: let activeJobsCount = 0; |
| 015 | U02 |   let completionClaimedBatchId = null; | Declara estado residente mutável de U02: let completionClaimedBatchId = null; |
| 016 | U02 |   let pendingBatches = []; | Declara estado residente mutável de U02: let pendingBatches = []; |
| 017 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 018 | U02 |   // ── Índice durável de jobs abertos ─────────────────────────────────────────── | Comentário arquitetural: ── Índice durável de jobs abertos ───────────────────────────────────────────. |
| 019 | U02 |   let jobIndex = []; | Declara estado residente mutável de U02: let jobIndex = []; |
| 020 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 021 | U02 |   let _cachedMaxCon = 1; | Declara estado residente mutável de U02: let _cachedMaxCon = 1; |
| 022 | U02 |   const _finalizedTabs = new Set(); | Declara binding/estrutura local de U02: const _finalizedTabs = new Set(); |
| 023 | U02 |   let _initialized = false; | Declara estado residente mutável de U02: let _initialized = false; |
| 024 | U02 |   // chrome.storage.local não oferece uma transação entre chamadas.  Uma fila | Comentário arquitetural: chrome.storage.local não oferece uma transação entre chamadas.  Uma fila. |
| 025 | U02 |   // local preserva a ordem dos snapshots quando handlers concorrentes alteram o | Comentário arquitetural: local preserva a ordem dos snapshots quando handlers concorrentes alteram o. |
| 026 | U02 |   // estado no mesmo ciclo de vida do service worker. | Comentário arquitetural: estado no mesmo ciclo de vida do service worker.. |
| 027 | U03 |   let _persistenceChain = Promise.resolve(); | Declara estado residente mutável de U03: let _persistenceChain = Promise.resolve(); |
| 028 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 029 | U03 |   function get() { | Abre função/escopo de U03: function get() { |
| 030 | U03 |       return { | Retorna/encerra caminho da unidade: return { |
| 031 | U03 |           jobQueue: Array.isArray(jobQueue) ? jobQueue.slice() : [], | Parte concreta de U03: jobQueue: Array.isArray(jobQueue) ? jobQueue.slice() : [], |
| 032 | U03 |           isProcessing: !!isProcessing, | Parte concreta de U03: isProcessing: !!isProcessing, |
| 033 | U03 |           stopRequested: !!stopRequested, | Parte concreta de U03: stopRequested: !!stopRequested, |
| 034 | U03 |           activeMangaTabId, | Atualiza/expõe identidade do batch/owner atual. |
| 035 | U03 |           currentBatchId, | Atualiza/expõe identidade do batch/owner atual. |
| 036 | U03 |           extractionTabs: { ...extractionTabs }, | Manipula mapa de abas auxiliares de extração. |
| 037 | U03 |           totalJobs, | Atualiza/expõe contador operacional do scheduler. |
| 038 | U03 |           completedJobs, | Atualiza/expõe contador operacional do scheduler. |
| 039 | U03 |           activeJobsCount, | Atualiza/expõe contador operacional do scheduler. |
| 040 | U03 |           completionClaimedBatchId, | Atualiza/expõe identidade do batch/owner atual. |
| 041 | U03 |           pendingBatches: Array.isArray(pendingBatches) ? pendingBatches.map(batch => ({ | Manipula/clona fila FIFO de batches pendentes. |
| 042 | U03 |               ...batch, | Parte concreta de U03: ...batch, |
| 043 | U03 |               images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [], | Parte concreta de U03: images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [], |
| 044 | U03 |           })) : [], | Parte concreta de U03: })) : [], |
| 045 | U03 |           jobIndex: Array.isArray(jobIndex) ? jobIndex.slice() : [], | Manipula o índice residente de jobs abertos. |
| 046 | U03 |       }; | Fecha/continua estrutura sintática de U03. |
| 047 | U03 |   } | Fecha/continua estrutura sintática de U03. |
| 048 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 049 | U04 |   function patch(nextState = {}) { | Abre função/escopo de U04: function patch(nextState = {}) { |
| 050 | U04 |       if (!nextState \|\| typeof nextState !== 'object') return get(); | Guard/branch que protege a invariável da unidade: if (!nextState // typeof nextState !== 'object') return get(); |
| 051 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'jobQueue')) jobQueue = Array.isArray(nextState.jobQueue) ? nextState.jobQueue : []; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'jobQueue')) jobQueue = Array.isArray(nextState.jobQueue) ? nextState.jobQueue : []; |
| 052 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'isProcessing')) isProcessing = !!nextState.isProcessing; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'isProcessing')) isProcessing = !!nextState.isProcessing; |
| 053 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'stopRequested')) stopRequested = !!nextState.stopRequested; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'stopRequested')) stopRequested = !!nextState.stopRequested; |
| 054 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'activeMangaTabId')) activeMangaTabId = nextState.activeMangaTabId \|\| null; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'activeMangaTabId')) activeMangaTabId = nextState.activeMangaTabId // null; |
| 055 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'currentBatchId')) currentBatchId = nextState.currentBatchId \|\| null; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'currentBatchId')) currentBatchId = nextState.currentBatchId // null; |
| 056 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'extractionTabs')) extractionTabs = nextState.extractionTabs && typeof nextState.extractionTabs === 'object' ? nextState.extractionTabs : {}; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'extractionTabs')) extractionTabs = nextState.extractionTabs && typeof nextState.extractionTabs === 'object' ? nextState.extractionTabs : {}; |
| 057 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'totalJobs')) totalJobs = Number(nextState.totalJobs) \|\| 0; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'totalJobs')) totalJobs = Number(nextState.totalJobs) // 0; |
| 058 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'completedJobs')) completedJobs = Number(nextState.completedJobs) \|\| 0; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'completedJobs')) completedJobs = Number(nextState.completedJobs) // 0; |
| 059 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'activeJobsCount')) activeJobsCount = Number(nextState.activeJobsCount) \|\| 0; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'activeJobsCount')) activeJobsCount = Number(nextState.activeJobsCount) // 0; |
| 060 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'completionClaimedBatchId')) completionClaimedBatchId = nextState.completionClaimedBatchId \|\| null; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'completionClaimedBatchId')) completionClaimedBatchId = nextState.completionClaimedBatchId // null; |
| 061 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'pendingBatches')) pendingBatches = Array.isArray(nextState.pendingBatches) ? nextState.pendingBatches.map(batch => ({ ...batch, images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [] })) : []; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'pendingBatches')) pendingBatches = Array.isArray(nextState.pendingBatches) ? nextState.pendingBatches.map(batch => ({ ...batch, images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [] })) : []; |
| 062 | U04 |       if (Object.prototype.hasOwnProperty.call(nextState, 'jobIndex')) jobIndex = Array.isArray(nextState.jobIndex) ? nextState.jobIndex : []; | Guard/branch que protege a invariável da unidade: if (Object.prototype.hasOwnProperty.call(nextState, 'jobIndex')) jobIndex = Array.isArray(nextState.jobIndex) ? nextState.jobIndex : []; |
| 063 | U04 |       return get(); | Retorna/encerra caminho da unidade: return get(); |
| 064 | U04 |   } | Fecha/continua estrutura sintática de U04. |
| 065 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 066 | U05 |   // ── Utilitários ──────────────────────────────────────────────────────────── | Comentário arquitetural: ── Utilitários ────────────────────────────────────────────────────────────. |
| 067 | U05 |   function generateId(prefix = '') { | Abre função/escopo de U05: function generateId(prefix = '') { |
| 068 | U05 |       try { | Abre região tolerante a falha de API/runtime. |
| 069 | U05 |           if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { | Guard/branch que protege a invariável da unidade: if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { |
| 070 | U05 |               return prefix + crypto.randomUUID(); | Retorna/encerra caminho da unidade: return prefix + crypto.randomUUID(); |
| 071 | U05 |           } | Fecha/continua estrutura sintática de U05. |
| 072 | U05 |       } catch (_e) {} | Absorve/degrada falha da operação anterior. |
| 073 | U05 |       return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`; | Retorna/encerra caminho da unidade: return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`; |
| 074 | U05 |   } | Fecha/continua estrutura sintática de U05. |
| 075 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 076 | U06 |   function _markFinalized(geminiTabId) { | Abre função/escopo de U06: function _markFinalized(geminiTabId) { |
| 077 | U06 |       _finalizedTabs.add(geminiTabId); | Manipula tombstone de finalização em memória. |
| 078 | U06 |       const cleanupTimer = setTimeout(() => _finalizedTabs.delete(geminiTabId), 30_000); | Declara binding/estrutura local de U06: const cleanupTimer = setTimeout(() => _finalizedTabs.delete(geminiTabId), 30_000); |
| 079 | U06 |       if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref(); | Guard/branch que protege a invariável da unidade: if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref(); |
| 080 | U06 |   } | Fecha/continua estrutura sintática de U06. |
| 081 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 082 | U07 |   // ── Persistência de Estado ───────────────────────────────────────────────── | Comentário arquitetural: ── Persistência de Estado ─────────────────────────────────────────────────. |
| 083 | U07 |   async function restoreState() { | Abre função/escopo de U07: async function restoreState() { |
| 084 | U07 |       const d = await chrome.storage.local.get(['mt_state']); | Declara binding/estrutura local de U07: const d = await chrome.storage.local.get(['mt_state']); |
| 085 | U07 |       if (!d.mt_state) return null; | Guard/branch que protege a invariável da unidade: if (!d.mt_state) return null; |
| 086 | U07 |       patch(d.mt_state); | Reutiliza patch para aplicar snapshot normalizado. |
| 087 | U07 |       return get(); | Retorna/encerra caminho da unidade: return get(); |
| 088 | U07 |   } | Fecha/continua estrutura sintática de U07. |
| 089 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 090 | U08 |   function syncState() { | Abre função/escopo de U08: function syncState() { |
| 091 | U08 |       const snapshot = get(); | Declara binding/estrutura local de U08: const snapshot = get(); |
| 092 | U08 |       const write = () => chrome.storage.local.set({ mt_state: snapshot }).then(() => snapshot); | Declara binding/estrutura local de U08: const write = () => chrome.storage.local.set({ mt_state: snapshot }).then(() => snapshot); |
| 093 | U08 |       _persistenceChain = _persistenceChain.then(write, write); | Encadeia operação para preservar ordem de persistência dentro do worker. |
| 094 | U08 |       return _persistenceChain; | Retorna/encerra caminho da unidade: return _persistenceChain; |
| 095 | U08 |   } | Fecha/continua estrutura sintática de U08. |
| 096 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 097 | U09 |   // Use esta API para alterações que precisam ser observadas como uma única | Comentário arquitetural: Use esta API para alterações que precisam ser observadas como uma única. |
| 098 | U09 |   // transição persistida.  O mutator executa somente depois que a transição | Comentário arquitetural: transição persistida.  O mutator executa somente depois que a transição. |
| 099 | U09 |   // anterior foi gravada, evitando o padrão read/modify/write concorrente. | Comentário arquitetural: anterior foi gravada, evitando o padrão read/modify/write concorrente.. |
| 100 | U09 |   function mutate(mutator) { | Abre função/escopo de U09: function mutate(mutator) { |
| 101 | U09 |       if (typeof mutator !== 'function') return Promise.resolve(get()); | Guard/branch que protege a invariável da unidade: if (typeof mutator !== 'function') return Promise.resolve(get()); |
| 102 | U09 |       const run = async () => { | Declara binding/estrutura local de U09: const run = async () => { |
| 103 | U09 |           const result = await mutator(get()); | Declara binding/estrutura local de U09: const result = await mutator(get()); |
| 104 | U09 |           if (result && typeof result === 'object') patch(result); | Guard/branch que protege a invariável da unidade: if (result && typeof result === 'object') patch(result); |
| 105 | U09 |           const snapshot = get(); | Declara binding/estrutura local de U09: const snapshot = get(); |
| 106 | U09 |           await chrome.storage.local.set({ mt_state: snapshot }); | Persiste snapshot/estado em chrome.storage.local. |
| 107 | U09 |           return snapshot; | Retorna/encerra caminho da unidade: return snapshot; |
| 108 | U09 |       }; | Fecha/continua estrutura sintática de U09. |
| 109 | U09 |       _persistenceChain = _persistenceChain.then(run, run); | Encadeia operação para preservar ordem de persistência dentro do worker. |
| 110 | U09 |       return _persistenceChain; | Retorna/encerra caminho da unidade: return _persistenceChain; |
| 111 | U09 |   } | Fecha/continua estrutura sintática de U09. |
| 112 | U09 | ␠ [linha vazia] | Separador visual da unidade U09. |
| 113 | U10 |   // ── Manutenção do índice de jobs ───────────────────────────────────────────── | Comentário arquitetural: ── Manutenção do índice de jobs ─────────────────────────────────────────────. |
| 114 | U10 |   function indexAddJob(entry) { | Abre função/escopo de U10: function indexAddJob(entry) { |
| 115 | U10 |       jobIndex = jobIndex.filter(j => j && j.geminiTabId !== entry.geminiTabId); | Manipula o índice residente de jobs abertos. |
| 116 | U10 |       jobIndex.push(entry); | Manipula o índice residente de jobs abertos. |
| 117 | U10 |   } | Fecha/continua estrutura sintática de U10. |
| 118 | U10 |   function indexRemoveJob(geminiTabId) { | Abre função/escopo de U10: function indexRemoveJob(geminiTabId) { |
| 119 | U10 |       const before = jobIndex.length; | Declara binding/estrutura local de U10: const before = jobIndex.length; |
| 120 | U10 |       jobIndex = jobIndex.filter(j => j && j.geminiTabId !== geminiTabId); | Manipula o índice residente de jobs abertos. |
| 121 | U10 |       return jobIndex.length !== before; | Retorna/encerra caminho da unidade: return jobIndex.length !== before; |
| 122 | U10 |   } | Fecha/continua estrutura sintática de U10. |
| 123 | U10 |   function indexJobsOfBatch(batchId) { | Abre função/escopo de U10: function indexJobsOfBatch(batchId) { |
| 124 | U10 |       if (!batchId) return jobIndex.slice(); | Guard/branch que protege a invariável da unidade: if (!batchId) return jobIndex.slice(); |
| 125 | U10 |       return jobIndex.filter(j => j && j.batchId === batchId); | Retorna/encerra caminho da unidade: return jobIndex.filter(j => j && j.batchId === batchId); |
| 126 | U10 |   } | Fecha/continua estrutura sintática de U10. |
| 127 | U10 | ␠ [linha vazia] | Separador visual da unidade U10. |
| 128 | U11 |   function replaceGeminiTabReferences(oldTabId, newTabId) { | Abre função/escopo de U11: function replaceGeminiTabReferences(oldTabId, newTabId) { |
| 129 | U11 |       return mutate(snapshot => { | Retorna/encerra caminho da unidade: return mutate(snapshot => { |
| 130 | U11 |           snapshot.jobIndex = (Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []).map(entry => | Manipula o índice residente de jobs abertos. |
| 131 | U11 |               entry && entry.geminiTabId === oldTabId | Parte concreta de U11: entry && entry.geminiTabId === oldTabId |
| 132 | U11 |                   ? { ...entry, geminiTabId: newTabId } | Parte concreta de U11: ? { ...entry, geminiTabId: newTabId } |
| 133 | U11 |                   : entry | Parte concreta de U11: : entry |
| 134 | U11 |           ); | Fecha/continua estrutura sintática de U11. |
| 135 | U11 |           const nextExtractionTabs = { ...(snapshot.extractionTabs \|\| {}) }; | Declara binding/estrutura local de U11: const nextExtractionTabs = { ...(snapshot.extractionTabs // {}) }; |
| 136 | U11 |           Object.keys(nextExtractionTabs).forEach(key => { | Parte concreta de U11: Object.keys(nextExtractionTabs).forEach(key => { |
| 137 | U11 |               const info = nextExtractionTabs[key]; | Declara binding/estrutura local de U11: const info = nextExtractionTabs[key]; |
| 138 | U11 |               if (info && info.geminiTabId === oldTabId) { | Guard/branch que protege a invariável da unidade: if (info && info.geminiTabId === oldTabId) { |
| 139 | U11 |                   nextExtractionTabs[key] = { ...info, geminiTabId: newTabId }; | Parte concreta de U11: nextExtractionTabs[key] = { ...info, geminiTabId: newTabId }; |
| 140 | U11 |               } | Fecha/continua estrutura sintática de U11. |
| 141 | U11 |           }); | Fecha/continua estrutura sintática de U11. |
| 142 | U11 |           snapshot.extractionTabs = nextExtractionTabs; | Manipula mapa de abas auxiliares de extração. |
| 143 | U11 |           return snapshot; | Retorna/encerra caminho da unidade: return snapshot; |
| 144 | U11 |       }); | Fecha/continua estrutura sintática de U11. |
| 145 | U11 |   } | Fecha/continua estrutura sintática de U11. |
| 146 | U12 | ␠ [linha vazia] | Separador visual da unidade U12. |
| 147 | U12 |   function tabExists(tabId) { | Abre função/escopo de U12: function tabExists(tabId) { |
| 148 | U12 |       return new Promise(resolve => { | Retorna/encerra caminho da unidade: return new Promise(resolve => { |
| 149 | U12 |           if (!tabId && tabId !== 0) { resolve(false); return; } | Guard/branch que protege a invariável da unidade: if (!tabId && tabId !== 0) { resolve(false); return; } |
| 150 | U12 |           try { | Abre região tolerante a falha de API/runtime. |
| 151 | U12 |               chrome.tabs.get(tabId, (tab) => { | Consulta existência da aba via API Chrome. |
| 152 | U12 |                   if (chrome.runtime.lastError \|\| !tab) resolve(false); | Guard/branch que protege a invariável da unidade: if (chrome.runtime.lastError // !tab) resolve(false); |
| 153 | U12 |                   else resolve(true); | Parte concreta de U12: else resolve(true); |
| 154 | U12 |               }); | Fecha/continua estrutura sintática de U12. |
| 155 | U12 |           } catch (_e) { resolve(false); } | Absorve/degrada falha da operação anterior. |
| 156 | U12 |       }); | Fecha/continua estrutura sintática de U12. |
| 157 | U12 |   } | Fecha/continua estrutura sintática de U12. |
| 158 | U13 | ␠ [linha vazia] | Separador visual da unidade U13. |
| 159 | U13 |   async function reconcileJobs() { | Abre função/escopo de U13: async function reconcileJobs() { |
| 160 | U13 |       if (!Array.isArray(jobIndex) \|\| jobIndex.length === 0) { | Guard/branch que protege a invariável da unidade: if (!Array.isArray(jobIndex) // jobIndex.length === 0) { |
| 161 | U13 |           activeJobsCount = Math.min(activeJobsCount, 0); | Atualiza/expõe contador operacional do scheduler. |
| 162 | U13 |           return { alive: 0, dropped: 0 }; | Retorna/encerra caminho da unidade: return { alive: 0, dropped: 0 }; |
| 163 | U13 |       } | Fecha/continua estrutura sintática de U13. |
| 164 | U13 | ␠ [linha vazia] | Separador visual da unidade U13. |
| 165 | U13 |       const alive = []; | Declara binding/estrutura local de U13: const alive = []; |
| 166 | U13 |       const dropped = []; | Declara binding/estrutura local de U13: const dropped = []; |
| 167 | U13 |       for (const entry of jobIndex) { | Itera coleção usada pela unidade: for (const entry of jobIndex) { |
| 168 | U13 |           if (!entry) continue; | Guard/branch que protege a invariável da unidade: if (!entry) continue; |
| 169 | U13 |           const exists = await tabExists(entry.geminiTabId); | Declara binding/estrutura local de U13: const exists = await tabExists(entry.geminiTabId); |
| 170 | U13 |           if (exists) alive.push(entry); | Guard/branch que protege a invariável da unidade: if (exists) alive.push(entry); |
| 171 | U13 |           else dropped.push(entry); | Parte concreta de U13: else dropped.push(entry); |
| 172 | U13 |       } | Fecha/continua estrutura sintática de U13. |
| 173 | U13 | ␠ [linha vazia] | Separador visual da unidade U13. |
| 174 | U13 |       if (dropped.length > 0) { | Guard/branch que protege a invariável da unidade: if (dropped.length > 0) { |
| 175 | U13 |           const keys = []; | Declara binding/estrutura local de U13: const keys = []; |
| 176 | U13 |           dropped.forEach(entry => { | Parte concreta de U13: dropped.forEach(entry => { |
| 177 | U13 |               keys.push(`gemini_job_${entry.geminiTabId}`); | Parte concreta de U13: keys.push(`gemini_job_${entry.geminiTabId}`); |
| 178 | U13 |               keys.push(`wd_data_${entry.geminiTabId}`); | Parte concreta de U13: keys.push(`wd_data_${entry.geminiTabId}`); |
| 179 | U13 |               const alarmName = entry.jobId ? `watchdog_${entry.jobId}` : `watchdog_${entry.geminiTabId}`; | Declara binding/estrutura local de U13: const alarmName = entry.jobId ? `watchdog_${entry.jobId}` : `watchdog_${entry.geminiTabId}`; |
| 180 | U13 |               chrome.alarms.clear(alarmName, () => {}); | Limpa watchdog associado ao job descartado. |
| 181 | U13 |           }); | Fecha/continua estrutura sintática de U13. |
| 182 | U13 |           try { await chrome.storage.local.remove(keys); } catch (_e) {} | Abre região tolerante a falha de API/runtime. |
| 183 | U13 |            | Separador visual da unidade U13. |
| 184 | U13 |           if (self.MangaTranslatorLog && typeof self.MangaTranslatorLog.log === 'function') { | Guard/branch que protege a invariável da unidade: if (self.MangaTranslatorLog && typeof self.MangaTranslatorLog.log === 'function') { |
| 185 | U13 |               self.MangaTranslatorLog.log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s) descartado(s) após reinício do worker`, { | Parte concreta de U13: self.MangaTranslatorLog.log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s) descartado(s) após reinício do worker`, { |
| 186 | U13 |                   dropped: dropped.map(j => j.geminiTabId), | Parte concreta de U13: dropped: dropped.map(j => j.geminiTabId), |
| 187 | U13 |               }); | Fecha/continua estrutura sintática de U13. |
| 188 | U13 |           } else if (typeof self.log === 'function') { | Parte concreta de U13: } else if (typeof self.log === 'function') { |
| 189 | U13 |               self.log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s) descartado(s) após reinício do worker`, { | Parte concreta de U13: self.log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s) descartado(s) após reinício do worker`, { |
| 190 | U13 |                   dropped: dropped.map(j => j.geminiTabId), | Parte concreta de U13: dropped: dropped.map(j => j.geminiTabId), |
| 191 | U13 |               }); | Fecha/continua estrutura sintática de U13. |
| 192 | U13 |           } | Fecha/continua estrutura sintática de U13. |
| 193 | U13 |       } | Fecha/continua estrutura sintática de U13. |
| 194 | U13 | ␠ [linha vazia] | Separador visual da unidade U13. |
| 195 | U13 |       jobIndex = alive; | Manipula o índice residente de jobs abertos. |
| 196 | U13 |       activeJobsCount = alive.length; | Atualiza/expõe contador operacional do scheduler. |
| 197 | U13 |       if (alive.length > 0 && !activeMangaTabId) { | Guard/branch que protege a invariável da unidade: if (alive.length > 0 && !activeMangaTabId) { |
| 198 | U13 |           activeMangaTabId = alive[0].mangaTabId \|\| null; | Atualiza/expõe identidade do batch/owner atual. |
| 199 | U13 |       } | Fecha/continua estrutura sintática de U13. |
| 200 | U13 |       return { alive: alive.length, dropped: dropped.length }; | Retorna/encerra caminho da unidade: return { alive: alive.length, dropped: dropped.length }; |
| 201 | U13 |   } | Fecha/continua estrutura sintática de U13. |
| 202 | U14 | ␠ [linha vazia] | Separador visual da unidade U14. |
| 203 | U14 |   async function ensureInitialized() { | Abre função/escopo de U14: async function ensureInitialized() { |
| 204 | U14 |       if (_initialized) return; | Guard/branch que protege a invariável da unidade: if (_initialized) return; |
| 205 | U14 |       await restoreState(); | Parte concreta de U14: await restoreState(); |
| 206 | U14 |       _initialized = true; | Manipula flag de bootstrap desta facade. |
| 207 | U14 |       try { | Abre região tolerante a falha de API/runtime. |
| 208 | U14 |           const result = await reconcileJobs(); | Declara binding/estrutura local de U14: const result = await reconcileJobs(); |
| 209 | U14 |           if (result.dropped > 0 \|\| result.alive > 0) { | Guard/branch que protege a invariável da unidade: if (result.dropped > 0 // result.alive > 0) { |
| 210 | U14 |               await syncState(); | Parte concreta de U14: await syncState(); |
| 211 | U14 |               if (result.dropped > 0 && typeof self.processNextJob === 'function') { | Guard/branch que protege a invariável da unidade: if (result.dropped > 0 && typeof self.processNextJob === 'function') { |
| 212 | U14 |                   self.processNextJob(); | Parte concreta de U14: self.processNextJob(); |
| 213 | U14 |               } | Fecha/continua estrutura sintática de U14. |
| 214 | U14 |           } | Fecha/continua estrutura sintática de U14. |
| 215 | U14 |       } catch (_e) {} | Absorve/degrada falha da operação anterior. |
| 216 | U14 |   } | Fecha/continua estrutura sintática de U14. |
| 217 | U14 | ␠ [linha vazia] | Separador visual da unidade U14. |
| 218 | U15 |   scope.MangaTranslatorState = { | Publica a facade global consumida pelo background. |
| 219 | U15 |       get, | Parte concreta de U15: get, |
| 220 | U15 |       patch, | Parte concreta de U15: patch, |
| 221 | U15 |       // Getters/setters for state | Comentário arquitetural: Getters/setters for state. |
| 222 | U15 |       get jobQueue() { return jobQueue; }, | Expõe accessor compatível da facade: get jobQueue() { return jobQueue; }, |
| 223 | U15 |       set jobQueue(v) { jobQueue = v; }, | Expõe accessor compatível da facade: set jobQueue(v) { jobQueue = v; }, |
| 224 | U15 |       get isProcessing() { return isProcessing; }, | Expõe accessor compatível da facade: get isProcessing() { return isProcessing; }, |
| 225 | U15 |       set isProcessing(v) { isProcessing = v; }, | Expõe accessor compatível da facade: set isProcessing(v) { isProcessing = v; }, |
| 226 | U15 |       get stopRequested() { return stopRequested; }, | Expõe accessor compatível da facade: get stopRequested() { return stopRequested; }, |
| 227 | U15 |       set stopRequested(v) { stopRequested = v; }, | Expõe accessor compatível da facade: set stopRequested(v) { stopRequested = v; }, |
| 228 | U15 |       get activeMangaTabId() { return activeMangaTabId; }, | Expõe accessor compatível da facade: get activeMangaTabId() { return activeMangaTabId; }, |
| 229 | U15 |       set activeMangaTabId(v) { activeMangaTabId = v; }, | Expõe accessor compatível da facade: set activeMangaTabId(v) { activeMangaTabId = v; }, |
| 230 | U15 |       get currentBatchId() { return currentBatchId; }, | Expõe accessor compatível da facade: get currentBatchId() { return currentBatchId; }, |
| 231 | U15 |       set currentBatchId(v) { currentBatchId = v; }, | Expõe accessor compatível da facade: set currentBatchId(v) { currentBatchId = v; }, |
| 232 | U15 |       get extractionTabs() { return extractionTabs; }, | Expõe accessor compatível da facade: get extractionTabs() { return extractionTabs; }, |
| 233 | U15 |       set extractionTabs(v) { extractionTabs = v; }, | Expõe accessor compatível da facade: set extractionTabs(v) { extractionTabs = v; }, |
| 234 | U15 |       get totalJobs() { return totalJobs; }, | Expõe accessor compatível da facade: get totalJobs() { return totalJobs; }, |
| 235 | U15 |       set totalJobs(v) { totalJobs = v; }, | Expõe accessor compatível da facade: set totalJobs(v) { totalJobs = v; }, |
| 236 | U15 |       get completedJobs() { return completedJobs; }, | Expõe accessor compatível da facade: get completedJobs() { return completedJobs; }, |
| 237 | U15 |       set completedJobs(v) { completedJobs = v; }, | Expõe accessor compatível da facade: set completedJobs(v) { completedJobs = v; }, |
| 238 | U15 |       get activeJobsCount() { return activeJobsCount; }, | Expõe accessor compatível da facade: get activeJobsCount() { return activeJobsCount; }, |
| 239 | U15 |       set activeJobsCount(v) { activeJobsCount = v; }, | Expõe accessor compatível da facade: set activeJobsCount(v) { activeJobsCount = v; }, |
| 240 | U15 |       get completionClaimedBatchId() { return completionClaimedBatchId; }, | Expõe accessor compatível da facade: get completionClaimedBatchId() { return completionClaimedBatchId; }, |
| 241 | U15 |       set completionClaimedBatchId(v) { completionClaimedBatchId = v \|\| null; }, | Expõe accessor compatível da facade: set completionClaimedBatchId(v) { completionClaimedBatchId = v // null; }, |
| 242 | U15 |       get pendingBatches() { return pendingBatches; }, | Expõe accessor compatível da facade: get pendingBatches() { return pendingBatches; }, |
| 243 | U15 |       set pendingBatches(v) { pendingBatches = Array.isArray(v) ? v : []; }, | Expõe accessor compatível da facade: set pendingBatches(v) { pendingBatches = Array.isArray(v) ? v : []; }, |
| 244 | U15 |       get jobIndex() { return jobIndex; }, | Expõe accessor compatível da facade: get jobIndex() { return jobIndex; }, |
| 245 | U15 |       set jobIndex(v) { jobIndex = v; }, | Expõe accessor compatível da facade: set jobIndex(v) { jobIndex = v; }, |
| 246 | U15 |       get _cachedMaxCon() { return _cachedMaxCon; }, | Expõe accessor compatível da facade: get _cachedMaxCon() { return _cachedMaxCon; }, |
| 247 | U15 |       set _cachedMaxCon(v) { _cachedMaxCon = v; }, | Expõe accessor compatível da facade: set _cachedMaxCon(v) { _cachedMaxCon = v; }, |
| 248 | U15 |       get _finalizedTabs() { return _finalizedTabs; }, | Expõe accessor compatível da facade: get _finalizedTabs() { return _finalizedTabs; }, |
| 249 | U15 |       get _initialized() { return _initialized; }, | Expõe accessor compatível da facade: get _initialized() { return _initialized; }, |
| 250 | U15 |       set _initialized(v) { _initialized = v; }, | Expõe accessor compatível da facade: set _initialized(v) { _initialized = v; }, |
| 251 | U15 |        | Separador visual da unidade U15. |
| 252 | U15 |       // Functions | Comentário arquitetural: Functions. |
| 253 | U15 |       generateId, | Parte concreta de U15: generateId, |
| 254 | U15 |       restoreState,  | Parte concreta de U15: restoreState, |
| 255 | U15 |       syncState,  | Parte concreta de U15: syncState, |
| 256 | U15 |       mutate, | Parte concreta de U15: mutate, |
| 257 | U15 |       ensureInitialized, | Parte concreta de U15: ensureInitialized, |
| 258 | U15 |       indexAddJob,  | Parte concreta de U15: indexAddJob, |
| 259 | U15 |       indexRemoveJob,  | Parte concreta de U15: indexRemoveJob, |
| 260 | U15 |       indexJobsOfBatch, | Parte concreta de U15: indexJobsOfBatch, |
| 261 | U15 |       replaceGeminiTabReferences, | Parte concreta de U15: replaceGeminiTabReferences, |
| 262 | U15 |       tabExists,  | Parte concreta de U15: tabExists, |
| 263 | U15 |       _markFinalized,  | Parte concreta de U15: _markFinalized, |
| 264 | U15 |       reconcileJobs | Parte concreta de U15: reconcileJobs |
| 265 | U15 |   }; | Fecha/continua estrutura sintática de U15. |
| 266 | U16 | ␠ [linha vazia] | Separador visual da unidade U16. |
| 267 | U16 | })(typeof self !== 'undefined' ? self : globalThis); | Parte concreta de U16: })(typeof self !== 'undefined' ? self : globalThis); |
| 268 | U17 | ⏎ [newline final] | Newline terminal editorial. |

## Análise por unidade

### U01 — linhas 1–4 — Cabeçalho e IIFE

**O que faz:** Ativa strict mode, documenta a função do módulo e abre escopo global compatível com worker/Jest.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Mantém o módulo carregável via importScripts e require sem criar imports ES modules.

**Por que uma alternativa ingênua seria pior:** Misturar scopes ou depender de window quebraria Service Worker MV3.

### U02 — linhas 5–26 — Estado residente e fila de persistência

**O que faz:** Declara todos os campos do snapshot, índice de jobs, cache de concorrência, tombstone de finalização, flag de inicialização e a Promise chain de writes.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Centraliza o estado residente em um único módulo e serializa writes concorrentes no mesmo worker.

**Por que uma alternativa ingênua seria pior:** Cópias paralelas em background/lifecycle gerariam split-brain após reidratação.

### U03 — linhas 27–47 — get()

**O que faz:** Produz snapshot normalizado para persistência/consumo, clonando arrays/objetos selecionados e fazendo clone mais profundo de pendingBatches/images.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Evita que o caller de get() altere diretamente a fila pendente e normaliza booleans.

**Por que uma alternativa ingênua seria pior:** Retornar todas as referências internas permitiria mutações invisíveis e fora da fila de persistência.

### U04 — linhas 48–64 — patch()

**O que faz:** Aplica campos conhecidos de um snapshot ao estado residente com defaults/coerções e retorna um novo get().

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Permite reidratar/atualizar apenas chaves presentes sem apagar as demais.

**Por que uma alternativa ingênua seria pior:** Object.assign cru aceitaria chaves arbitrárias e tipos incompatíveis.

### U05 — linhas 65–74 — generateId()

**O que faz:** Gera id com crypto.randomUUID quando disponível e usa fallback temporal/aleatório quando não está.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Mantém compatibilidade com ambientes sem WebCrypto global.

**Por que uma alternativa ingênua seria pior:** Depender só de randomUUID mataria o scheduler em runtimes/testes antigos.

### U06 — linhas 75–81 — _markFinalized()

**O que faz:** Mantém tombstone em memória por 30 s e usa unref em Node quando disponível.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Bloqueia dupla finalização dentro da vida atual do worker sem manter testes vivos.

**Por que uma alternativa ingênua seria pior:** Persistir este Set duplicaria o journal durável de finalização; não limpá-lo cresceria memória.

### U07 — linhas 82–88 — restoreState()

**O que faz:** Lê mt_state, aplica patch se existir e devolve snapshot; sem chave retorna null e preserva estado residente.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Distingue ausência de snapshot de snapshot vazio e reutiliza as regras de normalização de patch.

**Por que uma alternativa ingênua seria pior:** Zerar estado quando storage não contém mt_state destruiria trabalho residente.

### U08 — linhas 89–96 — syncState()

**O que faz:** Captura snapshot atual e enfileira storage.set na _persistenceChain, inclusive após falha anterior.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Preserva ordem de snapshots concorrentes dentro da vida do worker.

**Por que uma alternativa ingênua seria pior:** Writes paralelos podem completar fora de ordem e ressuscitar snapshot antigo.

### U09 — linhas 97–112 — mutate()

**O que faz:** Executa read-modify-write serializado: espera chain anterior, chama mutator sobre get(), patcha resultado e persiste snapshot.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Evita stale read/modify/write quando vários handlers mutam o mesmo estado.

**Por que uma alternativa ingênua seria pior:** Ler antes de aguardar o write anterior faria concorrência perder mudanças.

### U10 — linhas 113–127 — Índice de jobs

**O que faz:** Adiciona por geminiTabId substituindo entrada anterior, remove por tab e consulta todos ou por batch.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Mantém um journal residente simples que o lifecycle/reconciler usa para ownership/contabilidade.

**Por que uma alternativa ingênua seria pior:** Permitir duplicatas por tab causaria slots duplicados e recovery ambíguo.

### U11 — linhas 128–145 — replaceGeminiTabReferences()

**O que faz:** Muda geminiTabId no jobIndex e em extractionTabs dentro de mutate serializado.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Mantém referências coerentes durante tabs.onReplaced e persiste a transição como unidade.

**Por que uma alternativa ingênua seria pior:** Atualizar só uma coleção deixaria jobs/extraction tabs apontando para identidades diferentes.

### U12 — linhas 146–157 — tabExists()

**O que faz:** Converte chrome.tabs.get callback-style em Promise booleana e trata id inválido, lastError e throw como false.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Oferece probe tolerante para reconciliadores legados.

**Por que uma alternativa ingênua seria pior:** Propagar lastError durante recovery poderia abortar toda a reconciliação por uma aba morta.

### U13 — linhas 158–201 — reconcileJobs() legado

**O que faz:** Classifica jobIndex em alive/dropped, limpa storage/watchdogs órfãos, reajusta activeJobsCount e recupera activeMangaTabId.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Era a reconciliação local do state antes do reconciler canonical-aware atual.

**Por que uma alternativa ingênua seria pior:** Usar esta versão como runtime principal hoje perderia lógica moderna de alias/recovery de resultado/finalização.

### U14 — linhas 202–217 — ensureInitialized() legado

**O que faz:** Restaura mt_state uma vez, marca initialized, roda reconcileJobs legado, sincroniza e opcionalmente chama self.processNextJob.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Fornece bootstrap autocontido para versões antigas/testes, mas não é o gate atual do background.js.

**Por que uma alternativa ingênua seria pior:** Misturá-lo ao ensureInitialized moderno criaria dois caminhos de recovery com semânticas diferentes.

### U15 — linhas 218–265 — Facade MangaTranslatorState

**O que faz:** Expõe get/patch, getters/setters legados e funções de persistência/índice/replacement/recovery.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Mantém compatibilidade com o background e módulos auxiliares enquanto concentra storage state.

**Por que uma alternativa ingênua seria pior:** Exportar campos sem facade obrigaria cada módulo a conhecer variáveis internas; por outro lado setters diretos podem contornar normalização/persistência.

### U16 — linhas 266–267 — Fechamento

**O que faz:** Fecha o objeto exportado e a IIFE com self/globalThis.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Mantém compatibilidade de execução entre Service Worker e Jest.

**Por que uma alternativa ingênua seria pior:** Assumir self sem fallback quebraria parte dos testes Node.

### U17 — linhas 268–268 — Newline final

**O que faz:** Representa o newline terminal auditado.

**Como faz:** usa apenas as variáveis/Chrome APIs/facade explícitas daquele bloco e, quando há persistência, mantém a ordem descrita no código.

**Por que foi feito assim:** Mantém equivalência física explícita.

**Por que uma alternativa ingênua seria pior:** Ignorá-lo quebra a convenção de rastreabilidade das Bíblias.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 267 linhas + newline = 268/268;
- [x] snapshot/normalização/persistência analisados;
- [x] mutate/index/tab replacement analisados;
- [x] runtime ativo separado de exports legados/residuais;
- [x] testes diretos diferenciados de evidência indireta;
- [x] lacunas de concorrência/referências/legacy explícitas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `7570b545d5e92496201a7741dee8605cd66fb015`.

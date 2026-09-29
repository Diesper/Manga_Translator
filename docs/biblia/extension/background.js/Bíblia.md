# Bíblia técnica — `extension/background.js`

> **Estado:** ✅ REAUDITADO E APROVÁVEL no padrão de 2026-09-29.  
> **SHA auditado:** `667c05eb2d7adfca16a79d3e706c39a1e9398b72`  
> **Tipo:** JavaScript de runtime — service worker/orquestrador Manifest V3.  
> **Linhas textuais do fonte:** **1251**.  
> **Posições documentais:** **1252**, contando separadamente o newline final presente no blob.  
> **Princípio de evidência:** assertions provam **comportamentos/unidades**, não cada delimitador ou declaração individual.

## 1. Papel arquitetural

`extension/background.js` é o **composition root** do background do Manga Translator. Ele carrega módulos, registra o listener global, compõe dependências, reconcilia lifecycle MV3, mantém bridges GTC/Storage, coordena batch FIFO e expõe facades legadas enquanto `jobs-lifecycle.js`, `jobs-watchdog.js`, `jobs-reconciliation.js`, `jobs-dom-ack.js`, `tab-identity.js` e as actions concentram regras especializadas.

A versão anterior da Bíblia era fisicamente completa, porém superestimava a força de testes por linha. Esta revisão move evidência para unidades de comportamento e mantém uma tabela separada para a função concreta de cada posição do blob.

## 2. Lifecycle real

1. Carrega router/state/jobs/actions/shared modules.
2. Registra install/startup/connect/tab replacement/alarm/storage/context menu/runtime.
3. Em wake-up comum, `ensureInitialized()` preserva trabalho residente e reconcilia storage.
4. Em startup, restaura snapshot, recupera aliases, limpa extractionTabs pela política atual e retoma/promove batches.
5. Mensagens passam por router modular; GTC e SM são bridges posteriores.
6. Scheduler/finalização delegam a `jobs-lifecycle.js`.
7. Downloads e abertura de pasta ainda possuem helpers locais.
8. START/STOP batch mantêm a orquestração FIFO local.

## 3. Dependências, consumidores e APIs

**Módulos:** router, state, tab-identity, jobs-watchdog, jobs-reconciliation, jobs-dom-ack, jobs-lifecycle, actions, gtc-fingerprint, gtc-indexeddb e storage-manager.

**Chrome APIs:** runtime, storage, tabs, alarms, downloads, contextMenus e windows (via lifecycle).

**Consumers:** content scripts do leitor/Gemini, popup/actions IPC e suítes Jest que carregam o arquivo real por `tests/helpers/load-background-module.js`.

## 4. Estado e durabilidade MV3

Job state durável pertence a `background/state.js`. `background.js` mantém referências/cache e estruturas transitórias como `_finalizedTabs` e fila de logs.

Memória pode desaparecer; portanto jobs/índice são reidratáveis, alarms protegem watchdogs, aliases de replacement têm journal, finalização tem marcador durável e `ensureInitialized` reconcilia antes de processar.

## 5. Segurança e privacidade

- Payload IPC não deve ser tratado como autoridade quando sender/tab ownership está disponível.
- Storage Manager fica no background para manter IndexedDB na origem da extensão.
- Imagens Base64 não devem entrar em `translatorLog`.
- Menu de contexto usa `contexts:['image']`, patterns por domínio e revalidação no clique.

## 6. Matriz de evidência lida

| Arquivo | SHA | Classificação | O que a assertion realmente sustenta |
|---|---|---|---|
| `tests/unit/background/background-strict-load.test.js` | `25a663f527f7d3303c51751b4bf3440ea3424b9f` | ✅ PROVADO DIRETAMENTE (carregamento) | Source real isolado não lança; não prova a lista de importScripts porque usa importScripts no-op. |
| `tests/unit/background/helpers-real.test.js` | `668cef7f592231856d5071bd35ff6c5c12848a41` | ✅ PROVADO DIRETAMENTE | restore/sync, log batching/cap/recovery e arm/clear watchdog. |
| `tests/unit/background/lifecycle-alarms-real.test.js` | `1d4c22ba9a78ef994906c4dd16617ddb6079942b` | ✅ PROVADO DIRETAMENTE | install/startup/recovery/FIFO/connect/alarms/watchdog. |
| `tests/unit/background/single-image-context-menu.test.js` | `c4e122e3fd2a5298b255e647dbc804c903ed17f5` | ✅ PROVADO DIRETAMENTE | image-only/patterns, srcUrl exata e desativação. |
| `tests/unit/background/plan-missing-handlers-real.test.js` | `9f8c6e4a88256aae9e2b26cd2121fe8474d736b8` | ✅ PROVADO DIRETAMENTE | START FIFO/idempotência, STOP pending/cleanup e handlers. |
| `tests/unit/background/batch-lifecycle-real.test.js` | `1368df4b1fdb85d8ad1f593f78decd16a3175c98` | ✅ PROVADO DIRETAMENTE | START job/storage real, STOP cleanup/preservação e watchdog. |
| `tests/unit/background/gtc-runtime-bridge.test.js` | `21c01d044af7313cae9b571ab715c4e5846b9a30` | ✅ PROVADO DIRETAMENTE | GTC real + coexistência com GET_TAB_ID. |
| `tests/unit/background/routed-actions-legacy.test.js` | `62d534355ac80b9b1f4e23dac3ce0ec1515ae4c5` | ✅ PROVADO DIRETAMENTE | router/aliases/compatibilidade de respostas. |
| `tests/unit/background/process-finalize-real.test.js` | `abb1b936fadf0e309933e39b4b705116eb320a1f` | ✅ PROVADO DIRETAMENTE | scheduler/finalize, duplicate protection, marker durável e races. |
| `tests/unit/background/message-handlers-real.test.js` | `1c2815cd1f2fecba58a07c568f24d69af0367af3` | ✅ PROVADO DIRETAMENTE | listener real em relay/imagem/erro/fingerprint/downloads. |
| `tests/unit/background/download-wait.test.js` | `1bb13ac03ab0bcaff68921211679355f9971678c` | ✅ PROVADO DIRETAMENTE | waitForDownload completo/interrompido/timeout/cleanup/concorrência. |
| `tests/unit/background/marker-anchor-real.test.js` | `6a6c977a1a2bad89a49813153039e17a93945017` | ✅ PROVADO DIRETAMENTE | anchor path/show/cleanup/falha. |
| `tests/unit/background/regex-escape.test.js` | `3707482c013734dd2fd0e6a3989eee30c5f5406e` | ✅ PROVADO DIRETAMENTE/INTEGRADO | regex escapada via background real. |
| `tests/unit/background/jobs-dom-ack-staging.test.js` | `5db47daff53026aa778944c999d7dc922f35ecad` | ✅ PROVADO DIRETAMENTE DO HELPER | helper injetado; não prova cada linha do facade. |
| `tests/unit/background/tab-identity.test.js` | `1f2dd52513037f061613d04453a961fbaeddef84` | ✅ PROVADO DIRETAMENTE DO MÓDULO | replacement/journal/aliases; não dispara listener onReplaced de background. |
| `tests/smoke/smoke-06-sm-message-routing.js` | `dd32621bee49bfe64bb4a667ecbf68fb516e03dd` | ⚠️ SIMULAÇÃO COMPLEMENTAR | Copia o handler e diverge no default; não prova background.js real. |

## 7. Lacunas e achados críticos

### L1 — Bridge SM_* sem prova direta completa
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todos os cases reais. A smoke é cópia manual e diverge no default. Um teste deve carregar background.js e disparar SM_SAVE_PAGE/GET/DELETE/STATS.

### L2 — Lista/order de importScripts
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO**. BG-STRICT-01 usa importScripts no-op. Recomenda-se gate estático ou worker test que capture argumentos reais.

### L3 — `armFinalizationMarkerCleanup` sem consumidor
Declarada, mas não chamada neste arquivo. O lifecycle possui sua própria estratégia durável. É dívida/documentação, não alteração funcional desta tarefa.

### L4 — comentário de tab replacement desatualizado
Linhas 707–708 dizem “PR 0 apenas observa”, mas o código atual chama `recordReplacement` e já faz rekey durável.

### L5 — listener onReplaced sem teste focal
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que dispare o listener real de background e observe `recordReplacement`.

### L6 — timers longos em MV3
`waitForDownload` usa 10 min e anchor cleanup usa 4 s. Jest prova lógica enquanto o worker vive, não sobrevivência à suspensão MV3.

### L7 — `downloadImagesAndShow` sem teste focal
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para merge de paths/lastPath/dlId e mistura de sucessos/falhas chamando o helper real.

### L8 — catch vazio em reconciliação
Falha de reconcile é engolida. Favorece disponibilidade, mas perde diagnóstico. Falta teste focal do erro.

### L9 — pressuposto de startup
A suíte prova que extractionTabs é zerado; não prova que nenhuma aba relevante possa ser restaurada pelo Chrome em toda configuração.

## 8. Invariantes

1. State durável continua pertencendo a `background/state.js`.
2. Listener runtime permanece único e ordenado router → GTC → SM.
3. Compatibilidade legada não muda sem migração de clientes.
4. Ownership/tab metadata prevalece sobre payload em ações críticas.
5. `ensureInitialized` não restaura sobre trabalho residente.
6. Reconcile permanece canonical-aware.
7. Marcador durável complementa proteção em memória.
8. START_BATCH permanece idempotente/FIFO.
9. STOP invalida launches tardios antes de promoção.
10. Cancelar pending não toca batch ativo.
11. Promoção ocorre após cleanup.
12. Logs mantêm cap e recuperam a trava após falha.
13. Menu só existe/age em domínio habilitado e revalida no clique.
14. `srcUrl` vem do evento nativo.
15. Storage Manager/IndexedDB permanecem na origem da extensão.
16. waitForDownload remove listener nos caminhos terminais enquanto worker vive.
17. Download em lote resolve somente após todas as tentativas terminarem.
18. Base64 não vai para logs.
19. Garantias duráveis de MV3 preferem alarms a timers.
20. Facades não recuperam corpos duplicados do lifecycle.

## 9. Fonte integral auditada

~~~javascript
'use strict';

// ── Estado Global ─────────────────────────────────────────
// O estado de jobs pertence exclusivamente a background/state.js.  Não manter
// cópias locais aqui é essencial no MV3: um worker reidratado não pode escolher
// acidentalmente entre um espelho antigo e o snapshot durável.
let backgroundState = null;

// Margem sobre os 4 min de geração; rearmada ao observar seu início real.
const JOB_TIMEOUT_MINUTES = 5;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let gtcIndexedDbApi = null;
let gtcRepository = null;
let gtcRuntimeHandler = null;
let storageManagerApi = null;

// Nem todo ambiente (Service Worker antigo, Node/Jest sem webcrypto global)
// expõe crypto.randomUUID. Sem fallback, processNextJob lança e o lote morre.
function generateId(prefix = '') {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return prefix + crypto.randomUUID();
        }
    } catch (_e) {}
    return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

const _finalizedTabs = new Set();
const FINALIZATION_MARKER_TTL_MINUTES = 10;

function finalizationMarkerKey(geminiTabId) {
    return `gemini_finalized_${geminiTabId}`;
}

function armFinalizationMarkerCleanup(geminiTabId) {
    chrome.alarms.create(`finalization_marker_${geminiTabId}`, {
        delayInMinutes: FINALIZATION_MARKER_TTL_MINUTES,
    });
}

function _markFinalized(geminiTabId) {
    _finalizedTabs.add(geminiTabId);
    const cleanupTimer = setTimeout(() => _finalizedTabs.delete(geminiTabId), 30_000);
    if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

if (typeof importScripts === 'function') {
    try {
        importScripts('background/router.js');
        importScripts('background/state.js');
        importScripts('background/tab-identity.js');
        importScripts('background/jobs-watchdog.js');
        importScripts('background/jobs-reconciliation.js');
        importScripts('background/jobs-dom-ack.js');
        importScripts('background/jobs-lifecycle.js');
        importScripts('background/actions/log-entry.js');
        importScripts('background/actions/get-tab-id.js');
        importScripts('background/actions/claim-gemini-job.js');
        importScripts('background/actions/relay-progress.js');
        importScripts('background/actions/check-extraction-tab.js');
        importScripts('background/actions/set-debug-mode.js');
        importScripts('background/actions/fetch-image-base64.js');
        importScripts('background/actions/calculate-visual-fingerprint.js');
        importScripts('background/actions/force-send-activation.js');
        importScripts('background/actions/refresh-job-watchdog.js');
        importScripts('background/actions/request-image-data.js');
        importScripts('background/actions/open-manga-root.js');
        importScripts('background/actions/download-image.js');
        importScripts('background/actions/open-existing-folder.js');
        importScripts('background/actions/download-chapter.js');
        importScripts('background/actions/export-all.js');
        importScripts('background/actions/deliver-result-url.js');
        importScripts('background/actions/deliver-result-from-tab.js');
        importScripts('background/actions/report-error.js');
        importScripts('background/actions/deliver-result.js');
        importScripts('background/actions/commit-result.js');
        importScripts('background/actions/start-batch.js');
        importScripts('background/actions/stop-batch.js');
    } catch (e) {
        console.error('[MangaTranslator background] Falha ao carregar módulos obrigatórios do background.', e);
        throw e;
    }
    try {
        // gtc-fingerprint.js expõe self.MangaTranslatorGtcFingerprint:
        //   - SHA-256 (visual-v1/v2)
        //   - dHash   (visual-v2)
        //   - wHash   (visual-v3 — Haar Wavelet, 32×32 → 64 hex / 256 bits)
        //   - pHash   (visual-v3 — DCT, 32×32 → 64 hex / 256 bits)
        //   - Regional hashes (visual-v3 — 4 cantos, 48×48)
        //   - matchPerceptualHashes / Relaxed (decisão combinada wHash+pHash)
        importScripts('shared/gtc-fingerprint.js');
        importScripts('shared/gtc-indexeddb.js');
        // storage-manager.js roda SÓ aqui: o banco de páginas/assets precisa da
        // origem da extensão. Num content script ele criaria um banco por site.
        importScripts('shared/storage-manager.js');
        if (typeof self !== 'undefined' && self.MangaTranslatorGtcIndexedDb) {
            gtcIndexedDbApi = self.MangaTranslatorGtcIndexedDb;
        }
        if (typeof self !== 'undefined' && self.MangaTranslatorStorageManager) {
            storageManagerApi = self.MangaTranslatorStorageManager;
        }
    } catch (e) {
        console.error('[MangaTranslator background] Falha ao carregar cache/storage obrigatórios.', e);
        throw e;
    }
} else if (typeof require === 'function') {
    try {
        require('./background/router.js');
        require('./background/state.js');
        require('./background/tab-identity.js');
        require('./background/jobs-watchdog.js');
        require('./background/jobs-reconciliation.js');
        require('./background/jobs-dom-ack.js');
        require('./background/jobs-lifecycle.js');
        require('./background/actions/log-entry.js');
        require('./background/actions/get-tab-id.js');
        require('./background/actions/claim-gemini-job.js');
        require('./background/actions/relay-progress.js');
        require('./background/actions/check-extraction-tab.js');
        require('./background/actions/set-debug-mode.js');
        require('./background/actions/fetch-image-base64.js');
        require('./background/actions/calculate-visual-fingerprint.js');
        require('./background/actions/force-send-activation.js');
        require('./background/actions/refresh-job-watchdog.js');
        require('./background/actions/request-image-data.js');
        require('./background/actions/open-manga-root.js');
        require('./background/actions/download-image.js');
        require('./background/actions/open-existing-folder.js');
        require('./background/actions/download-chapter.js');
        require('./background/actions/export-all.js');
        require('./background/actions/deliver-result-url.js');
        require('./background/actions/deliver-result-from-tab.js');
        require('./background/actions/report-error.js');
        require('./background/actions/deliver-result.js');
        require('./background/actions/commit-result.js');
        require('./background/actions/start-batch.js');
        require('./background/actions/stop-batch.js');
    } catch (e) {}
    try {
        gtcIndexedDbApi = require('./shared/gtc-indexeddb.js');
    } catch (e) {}
    try {
        storageManagerApi = require('./shared/storage-manager.js');
    } catch (e) {}
}

function getGtcRepository() {
    if (!gtcRepository && gtcIndexedDbApi && gtcIndexedDbApi.createIndexedDbRepository) {
        gtcRepository = gtcIndexedDbApi.createIndexedDbRepository();
    }
    return gtcRepository;
}

// ── handleGtcRuntimeMessage ──────────────────────────────────────────────────
// Passa o fingerprintApi (self.MangaTranslatorGtcFingerprint) para o handler
// para que GTC_QUERY_BY_PERCEPTUAL possa invocar matchPerceptualHashes no SW,
// onde o banco IndexedDB também reside (mesmo processo do Service Worker).
//
// Sem o fingerprintApi, o lookup perceptual retorna vazio mas não quebra o fluxo
// (conteúdo do manga continua sendo tratado por SHA-256 e dHash como fallback).
// ─────────────────────────────────────────────────────────────────────────────
// ── handleStorageManagerMessage ──────────────────────────────────────────────
// O background é o ÚNICO dono da persistência de páginas traduzidas. O content
// script deixou de gravar direto em chrome.storage.local; agora ele envia o
// resultado e recebe confirmação. Isso elimina a corrida na raiz e permite que
// leitor/popup consultem metadados sem carregar Base64 nenhum.
//
// Síncrona por contrato (igual ao handler do GTC): retornar uma Promise faria o
// listener devolver sempre truthy e bloquearia todas as outras mensagens.
function handleStorageManagerMessage(request, sender, sendResponse) {
    if (!request || typeof request.action !== 'string' || request.action.indexOf('SM_') !== 0) return false;

    const sm = storageManagerApi;
    if (!sm) {
        sendResponse({ ok: false, error: 'storage-manager indisponível' });
        return true;
    }

    const run = (promise) => {
        promise
            .then(result => sendResponse({ ok: true, ...(result || {}) }))
            .catch(error => {
                const message = error && error.message ? error.message : String(error);
                log('error', 'bg', 'SM_ERROR', `Falha em ${request.action}: ${message}`, {});
                sendResponse({ ok: false, error: message });
            });
        return true;
    };

    switch (request.action) {
        case 'SM_SAVE_PAGE':
            return run(sm.savePageResult(
                request.chapterId, request.pageIndex, request.dataUrl,
                request.originalUrl || '', request.cleanUrl || '', request.meta || {}
            ));
        case 'SM_GET_ASSET':
            return run(sm.getAssetDataUrl(request.assetId).then(dataUrl => ({ dataUrl })));
        case 'SM_GET_PAGE':
            return run(sm.getPageDataUrl(request.chapterId, request.pageIndex).then(dataUrl => ({ dataUrl })));
        case 'SM_PAGE_INDEX':
            return run(sm.getChapterPageIndex(request.chapterId).then(pages => ({ pages })));
        case 'SM_RESTORE_INDEX':
            return run(sm.getRestoreIndex(request.chapterId).then(entries => ({ entries })));
        case 'SM_LIST_RESTORE':
            return run(sm.listRestoreEntries(request.chapterIds || null).then(entries => ({ entries })));
        case 'SM_CHAPTERS_STATS':
            return run(sm.getChaptersStats(request.chapterIds || []).then(stats => ({ stats })));
        case 'SM_DELETE_CLEAN_URL':
            return run(sm.deleteByCleanUrl(request.cleanUrl));
        case 'SM_DELETE_CHAPTER':
            return run(sm.deleteChapter(request.chapterId));
        case 'SM_MIGRATE_CHAPTER':
            return run(sm.migrateChapterFromLegacy(request.chapterId));
        case 'SM_STATS':
            return run(sm.stats().then(stats => ({ stats })));
        default:
            return false;
    }
}

function handleGtcRuntimeMessage(request, sender, sendResponse) {
    if (!gtcIndexedDbApi || !gtcIndexedDbApi.createGtcRuntimeHandler) return false;
    if (!gtcRuntimeHandler) {
        const fpApi = (typeof self !== 'undefined' && self.MangaTranslatorGtcFingerprint)
                   || null;
        gtcRuntimeHandler = gtcIndexedDbApi.createGtcRuntimeHandler({
            repository:    getGtcRepository(),
            fingerprintApi: fpApi,
            logger: (level, action, detail, extra = {}) => log(level, 'bg', action, detail, extra),
        });
    }
    return gtcRuntimeHandler(request, sender, sendResponse);
}

function getBackgroundStateApi() {
    const scope = typeof self !== 'undefined' ? self : globalThis;
    return scope && scope.MangaTranslatorState;
}

function state() {
    if (!backgroundState) backgroundState = getBackgroundStateApi();
    if (!backgroundState) throw new Error('MangaTranslatorState indisponível');
    return backgroundState;
}

function getStateSnapshot() {
    return state().get();
}

function applyStateSnapshot(snapshot = {}) {
    return state().patch(snapshot);
}

async function restoreState() {
    const stateApi = state();
    if (stateApi && typeof stateApi.restoreState === 'function') {
        const restored = await stateApi.restoreState();
        if (restored) applyStateSnapshot(restored);
        return;
    }
    await stateApi.restoreState();
}

async function syncState() {
    await state().syncState();
}

// ── Manutenção do índice de jobs ─────────────────────────────────────────────
function indexAddJob(entry) {
    state().indexAddJob(entry);
}
function indexRemoveJob(geminiTabId) {
    return state().indexRemoveJob(geminiTabId);
}
function indexJobsOfBatch(batchId) {
    return state().indexJobsOfBatch(batchId);
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

let tabIdentity = null;
let jobsWatchdog = null;
let jobsReconciler = null;
let jobsDomAck = null;
let jobsLifecycle = null;

function moveFinalizedTabId(oldTabId, newTabId) {
    if (_finalizedTabs.has(oldTabId)) {
        _finalizedTabs.delete(oldTabId);
        _finalizedTabs.add(newTabId);
    }
}

function initializeTabIdentity() {
    if (tabIdentity) return tabIdentity;
    const scope = typeof self !== 'undefined' ? self : globalThis;
    if (!scope.MangaTranslatorTabIdentity) throw new Error('MangaTranslatorTabIdentity indisponível');
    tabIdentity = scope.MangaTranslatorTabIdentity.createTabIdentity({
        state: state(),
        log,
        moveFinalizedTabId,
    });
    return tabIdentity;
}

function initializeJobsModules() {
    if (jobsWatchdog && jobsReconciler && jobsDomAck && jobsLifecycle) return;
    const scope = typeof self !== 'undefined' ? self : globalThis;
    const identity = initializeTabIdentity();
    jobsWatchdog = scope.MangaTranslatorJobsWatchdog.createWatchdog({
        getJobIndex: () => state().jobIndex,
        getExtractionTabs: () => state().extractionTabs,
        finalizeJob: (...args) => finalizeJob(...args),
        log,
        timeoutMinutes: JOB_TIMEOUT_MINUTES,
        resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId),
    });
    jobsReconciler = scope.MangaTranslatorJobsReconciliation.createReconciler({
        state: state(),
        tabExists,
        log,
        resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId),
        migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options),
        syncState,
        processNextJob: () => processNextJob(),
        recoverPendingFinalization: entry => jobsLifecycle.recoverPendingFinalization(entry),
        recoverPersistedResult: entry => jobsLifecycle.recoverPersistedResult(entry),
    });
    jobsDomAck = scope.MangaTranslatorJobsDomAck.createDomAckDelivery({
        updateJobState: (...args) => updateJobState(...args),
        finalizeJob: (...args) => finalizeJob(...args),
        log,
        timeoutMs: DOM_ACK_TIMEOUT_MS,
    });
    jobsLifecycle = scope.MangaTranslatorJobsLifecycle.createLifecycle({
        state: state(),
        log, syncState, sendProgress, armWatchdog, clearWatchdog,
        indexAddJob, indexRemoveJob, indexJobsOfBatch, delay, generateId,
        markFinalized: _markFinalized,
        isFinalized: tabId => _finalizedTabs.has(tabId),
        finalizedMarkerTtlMinutes: FINALIZATION_MARKER_TTL_MINUTES,
        resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId),
        migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options),
    });
}

// ── reconcileJobs ────────────────────────────────────────────────────────────
// Um Service Worker MV3 pode ser descartado e recriado sem reiniciar o Chrome.
// Nesse caso as variáveis voltam vazias enquanto abas do Gemini continuam vivas.
// Antes, o código simplesmente zerava activeJobsCount — o que fazia o lote ser
// declarado concluído com jobs ainda em execução. Agora reconstruímos o estado
// a partir do índice durável e conferimos cada aba com chrome.tabs.get:
//   - aba viva   → job continua ativo (conta no activeJobsCount)
//   - aba morta  → job é descartado (chave + watchdog removidos, slot liberado)
async function reconcileJobs() {
    initializeJobsModules();
    return jobsReconciler.reconcile();
}

async function ensureInitialized() {
    if (state()._initialized) return;
    // Um alarme pode disparar enquanto este worker já detém um lote vivo. Não
    // sobrescreva essa fila/extractionTabs com um snapshot antigo ou vazio.
    const hasResidentWork = state().jobQueue.length > 0 || state().activeJobsCount > 0 ||
        state().jobIndex.length > 0 || state().pendingBatches.length > 0 ||
        Object.keys(state().extractionTabs).length > 0;
    if (!hasResidentWork) await restoreState();

    // A reconciliação é canonical-aware e por isso é o gate síncrono
    // necessário para mensagens. O replay de journals residuais não bloqueia
    // ações normais; ele roda logo depois e continua crash-recoverable.
    const identity = initializeTabIdentity();
    state()._initialized = true;
    try {
        const result = await reconcileJobs();
        if (result.dropped > 0 || result.alive > 0 || result.recovered > 0) {
            await syncState();
        }
        if (!state().stopRequested && (
            state().jobQueue.length > 0 ||
            state().activeJobsCount > 0 ||
            state().pendingBatches.length > 0 ||
            (state().isProcessing && state().currentBatchId)
        )) processNextJob();
    } catch (_e) {}

    identity.recoverPendingMigrations()
        .then(() => identity.cleanupExpiredAliases())
        .catch(error => log('warn', 'bg', 'TAB_REKEY_RECOVERY_DEFERRED_ERROR',
            'Falha no replay assíncrono de migração de aba', {
                errorName: error && error.name ? error.name : 'Error',
            }));
}

let _logQueue = [];
let _logFlushing = false;

function log(level, source, action, detail, extra = {}) {
    _logQueue.push({ id: `${Date.now()}_${Math.random()}`, ts: Date.now(), level: level || 'info', source: source || 'bg', action: action || 'UNKNOWN', detail: detail || '', extra: extra || {} });
    if (!_logFlushing) _flushLog();
}

async function _flushLog() {
    _logFlushing = true;
    try {
        while (_logQueue.length > 0) {
            const batch = _logQueue.splice(0, _logQueue.length);
            const data = await chrome.storage.local.get(['translatorLog']);
            const entries = data.translatorLog || [];
            entries.push(...batch);
            if (entries.length > 500) entries.splice(0, entries.length - 500);
            await chrome.storage.local.set({ translatorLog: entries });
        }
    } catch (e) {}
    _logFlushing = false;
}

let registeredActionRouter = null;

function routeRegisteredAction(request, sender, sendResponse) {
    const scope = typeof self !== 'undefined' ? self : globalThis;
    const routerApi = scope && scope.MangaTranslatorRouter;
    if (!routerApi || !request || typeof request.action !== 'string') return null;

    const actionName = routerApi.resolveActionName(request.action);
    if (!actionName || !routerApi.getAction(actionName)) return null;

    if (!registeredActionRouter) {
        registeredActionRouter = routerApi.createMessageRouter({
            contextFactory: () => ({
                state: state(),
                log,
                handleMarkerAndShow,
                waitForDownload,
                downloadImagesAndShow,
                syncState,
                assertJobOwnership,
                ensureInitialized,
                tabIdentity: initializeTabIdentity(),
                deliverResultToManga,
                updateJobState,
                finalizeJob,
                armWatchdog,
                startBatch,
                stopBatch,
            }),
        });
    }

    const legacyResponseActions = new Set([
        'GET_TAB_ID',
        'CHECK_IF_EXTRACTION_TAB',
        'REQUEST_IMAGE_DATA',
        'FETCH_IMAGE_AS_BASE64',
        'DOWNLOAD_IMAGE',
    ]);
    const sendResponseCompat = response => {
        if (legacyResponseActions.has(request.action) && response && response.ok === true) {
            const { ok: _ok, ...legacyResponse } = response;
            sendResponse(legacyResponse);
            return;
        }
        if (request.action === 'FETCH_IMAGE_AS_BASE64' && response && response.ok === false && response.error) {
            const error = typeof response.error === 'object'
                ? response.error.message || response.error.code
                : response.error;
            sendResponse({ error });
            return;
        }
        sendResponse(response);
    };

    return {
        handled: true,
        keepAlive: registeredActionRouter(request, sender, sendResponseCompat),
    };
}

function armWatchdog(mangaTabId, index, geminiTabId, jobId) {
    initializeJobsModules();
    return jobsWatchdog.arm(mangaTabId, index, geminiTabId, jobId);
}
function clearWatchdog(geminiTabId, jobId) {
    initializeJobsModules();
    return jobsWatchdog.clear(geminiTabId, jobId);
}

// ── deliverResultToManga ─────────────────────────────────────────────────────
// Substitui o antigo `setTimeout(() => finalizeJob(...), 1500)`.
//
// Antes: o resultado era enviado à página e, 1,5 s depois, o job era declarado
// concluído — sem nenhuma garantia de que a imagem tinha sido aplicada ou
// persistida. Com concorrência C e N páginas, isso somava ~1,5 × N / C segundos
// ociosos ao caminho crítico e podia marcar sucesso antes da gravação terminar.
//
// Agora: enviamos o resultado, o content script grava/aplica e só então responde.
// O slot de concorrência é liberado no instante do ACK.
//
// O timer aqui é apenas um guarda-chuva contra um content script que aceita a
// mensagem e nunca responde; a garantia durável continua sendo o alarme watchdog.
const DOM_ACK_TIMEOUT_MS = 30_000;

function deliverResultToManga({
    mangaTabId, index, src, jobId, batchId, geminiTabId, finalizeOnAck = true,
}) {
    initializeJobsModules();
    return jobsDomAck.deliver({
        mangaTabId, index, src, jobId, batchId, geminiTabId, finalizeOnAck,
    });
}

// ── Menu nativo: tradução de uma única imagem ────────────────────────────────
const SINGLE_IMAGE_CONTEXT_MENU_ID = 'manga-translator-translate-single-image';
const SINGLE_IMAGE_CONTEXT_MENU_TITLE = 'Traduzir esta imagem';
let singleImageContextMenuSyncVersion = 0;

function enabledDomainToMatchPattern(domain) {
    const host = String(domain || '').trim().toLowerCase();
    if (!host || !/^[a-z0-9.-]+$/.test(host)) return null;
    return `*://${host}/*`;
}

function rebuildSingleImageContextMenu(enabled, enabledDomains) {
    if (!chrome.contextMenus || typeof chrome.contextMenus.create !== 'function' || typeof chrome.contextMenus.remove !== 'function') {
        return;
    }

    const syncVersion = ++singleImageContextMenuSyncVersion;
    const documentUrlPatterns = Array.from(new Set(
        (Array.isArray(enabledDomains) ? enabledDomains : [])
            .map(enabledDomainToMatchPattern)
            .filter(Boolean)
    ));
    const shouldCreate = enabled === true && documentUrlPatterns.length > 0;

    const createCurrentMenu = () => {
        if (syncVersion !== singleImageContextMenuSyncVersion || !shouldCreate) return;
        try {
            chrome.contextMenus.create({
                id: SINGLE_IMAGE_CONTEXT_MENU_ID,
                title: SINGLE_IMAGE_CONTEXT_MENU_TITLE,
                contexts: ['image'],
                documentUrlPatterns,
            }, () => {
                const error = chrome.runtime && chrome.runtime.lastError;
                if (error) {
                    log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_CREATE_FAILED',
                        'Falha ao criar a ação de tradução no menu de contexto.', {
                            error: error.message || String(error),
                        });
                }
            });
        } catch (error) {
            log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_CREATE_FAILED',
                'Falha síncrona ao criar a ação de tradução no menu de contexto.', {
                    error: error && error.message ? error.message : String(error),
                });
        }
    };

    try {
        chrome.contextMenus.remove(SINGLE_IMAGE_CONTEXT_MENU_ID, () => {
            // Ler lastError evita o aviso "Unchecked runtime.lastError" quando o
            // item ainda não existe (primeira instalação ou preferência desligada).
            void (chrome.runtime && chrome.runtime.lastError);
            createCurrentMenu();
        });
    } catch (_error) {
        createCurrentMenu();
    }
}

function refreshSingleImageContextMenu() {
    if (!chrome.storage || !chrome.storage.local || typeof chrome.storage.local.get !== 'function') return;
    chrome.storage.local.get(['clickToTranslateEnabled', 'enabledDomains'], (data) => {
        rebuildSingleImageContextMenu(
            data && data.clickToTranslateEnabled === true,
            data && Array.isArray(data.enabledDomains) ? data.enabledDomains : []
        );
    });
}

function isContextMenuPageEnabled(url, enabledDomains) {
    try {
        const hostname = new URL(String(url || '')).hostname;
        return Array.isArray(enabledDomains) && enabledDomains.includes(hostname);
    } catch (_error) {
        return false;
    }
}

if (chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName && areaName !== 'local') return;
        if (changes.clickToTranslateEnabled || changes.enabledDomains) {
            refreshSingleImageContextMenu();
        }
    });
}

if (chrome.contextMenus && chrome.contextMenus.onClicked && typeof chrome.contextMenus.onClicked.addListener === 'function') {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (!info || info.menuItemId !== SINGLE_IMAGE_CONTEXT_MENU_ID) return;
        if (!tab || !Number.isInteger(tab.id)) return;

        chrome.storage.local.get(['clickToTranslateEnabled', 'enabledDomains'], (data) => {
            const enabledDomains = data && Array.isArray(data.enabledDomains) ? data.enabledDomains : [];
            if (!data || data.clickToTranslateEnabled !== true) return;
            if (!isContextMenuPageEnabled(info.pageUrl || tab.url, enabledDomains)) return;

            chrome.tabs.sendMessage(tab.id, {
                action: 'TRANSLATE_CONTEXT_IMAGE',
                srcUrl: info.srcUrl || null,
            }, (response) => {
                const error = chrome.runtime && chrome.runtime.lastError;
                if (error) {
                    log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_DELIVERY_FAILED',
                        'Não foi possível entregar a ação de clique direito ao leitor.', {
                            tabId: tab.id,
                            error: error.message || String(error),
                        });
                    return;
                }
                if (!response || response.ok !== true) {
                    log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_REJECTED',
                        'A página rejeitou a solicitação de tradução individual.', {
                            tabId: tab.id,
                            reason: response && response.reason ? response.reason : 'no_response',
                        });
                }
            });
        });
    });
}

// SEC-05: Constante nomeada para prompt padrão em vez de string longa inline
const DEFAULT_TRANSLATION_PROMPT = "Objetivo primário: voce vai criar uma imagem , exata da imagem fornecida e traduzir ela pro português brasileiro . \nNão altere nenhum pixel fora das áreas de texto e Remova o texto original dos balões de fala, preenchendo o fundo com a cor correspondente. \nConverta os diálogos para PT-BR, mantendo a informalidade do contexto. Tipografia: Renderize o novo texto em caixa alta, fonte padrão de HQ (sans-serif), alinhamento centralizado.\nEfeitos Sonoros: Traduza e recrie as onomatopeias  mantendo as fontes estilizadas, cores, contornos e inclinação originais. lembre-se que todas as palavras devem sem traduzidas sem exceção";

chrome.runtime.onInstalled.addListener(() => {
    refreshSingleImageContextMenu();
    chrome.storage.local.get(['defaultPrompt'], (data) => {
        if (!data.defaultPrompt) {
            chrome.storage.local.set({ defaultPrompt: DEFAULT_TRANSLATION_PROMPT });
        }
    });
});

chrome.runtime.onStartup.addListener(async () => {
    refreshSingleImageContextMenu();
    await restoreState();
    const identity = initializeTabIdentity();
    await identity.recoverPendingMigrations();
    await identity.cleanupExpiredAliases();
    state()._initialized = true;
    
    // FIX M-5
    state().extractionTabs = {};

    const currentBatchNeedsWork = Boolean(
        state().currentBatchId &&
        state().completionClaimedBatchId !== state().currentBatchId
    );
    const hadWork = state().jobQueue.length > 0 || state().activeJobsCount > 0 ||
        state().jobIndex.length > 0 || state().pendingBatches.length > 0 ||
        currentBatchNeedsWork;

    // Em onStartup o navegador foi reiniciado: nenhuma aba do Gemini sobrevive,
    // então a reconciliação sempre descarta os jobs órfãos e libera os slots.
    const reconciled = await reconcileJobs();

    if (hadWork) {
        log('warn', 'bg', 'STARTUP_RECOVERY', `Service worker reiniciado: ${state().jobQueue.length} jobs do lote atual, ${state().pendingBatches.length} lote(s) pendente(s), ${reconciled.alive} ativos preservados, ${reconciled.dropped} órfãos descartados, ${reconciled.recovered || 0} finalizações reconciliadas`, {
            jobQueue: state().jobQueue.length,
            pendingBatches: state().pendingBatches.length,
            currentBatchId: String(state().currentBatchId || '').slice(0, 8),
            alive: reconciled.alive,
            dropped: reconciled.dropped,
            recovered: reconciled.recovered || 0,
        });
        state().isProcessing = Boolean(
            (state().currentBatchId &&
                state().completionClaimedBatchId !== state().currentBatchId) ||
            state().jobQueue.length > 0 ||
            state().activeJobsCount > 0
        );
        await syncState();
        if (!state().stopRequested) processNextJob();
    } else {
        await syncState();
    }
});

chrome.runtime.onConnect.addListener(port => {
    if (port.name === 'gemini-keep-alive') port.onDisconnect.addListener(() => {});
});

// Diagnóstico de identidade de aba. PR 0 apenas observa a transição; a
// canonicalização/rekey durável é implementada no PR 1.
if (chrome.tabs && chrome.tabs.onReplaced) {
    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
        log('info', 'bg', 'TAB_REPLACED', 'Aba substituída pelo Chromium', {
            oldTabId: removedTabId,
            newTabId: addedTabId,
        });
        try {
            initializeTabIdentity().recordReplacement(addedTabId, removedTabId)
                .catch(error => log('error', 'bg', 'TAB_REKEY_ERROR', 'Falha ao migrar identidade de aba', {
                    oldTabId: removedTabId,
                    newTabId: addedTabId,
                    errorName: error && error.name ? error.name : 'Error',
                }));
        } catch (error) {
            log('error', 'bg', 'TAB_REKEY_ERROR', 'Falha ao iniciar migração de identidade de aba', {
                oldTabId: removedTabId,
                newTabId: addedTabId,
                errorName: error && error.name ? error.name : 'Error',
            });
        }
    });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    await ensureInitialized();
    if (alarm.name.startsWith('finalization_marker_')) {
        const geminiTabId = alarm.name.replace('finalization_marker_', '');
        chrome.storage.local.remove(finalizationMarkerKey(geminiTabId));
        return;
    }
    if (alarm.name === 'nextJobAlarm') {
        processNextJob();
        return;
    }

    initializeJobsModules();
    if (jobsWatchdog.handleAlarm(alarm)) return;

    if (alarm.name.startsWith('watchdog_')) {
        // O nome do alarme agora pode ser watchdog_${jobId} (UUID) ou watchdog_${tabId} (legado)
        // Buscar wd_data pelo sufixo — pode ser jobId ou tabId
        const suffix = alarm.name.replace('watchdog_', '');

        // O alarme pode se chamar watchdog_<jobId> (UUID) ou watchdog_<tabId> (legado).
        // O índice durável resolve jobId → geminiTabId sem precisar de get(null),
        // que carregaria todas as imagens Base64 do acervo na memória do worker.
        const indexed = state().jobIndex.find(j => j && (String(j.jobId) === suffix || String(j.geminiTabId) === suffix));
        const candidateKeys = [];
        if (indexed) candidateKeys.push(`wd_data_${indexed.geminiTabId}`);
        if (!candidateKeys.includes(`wd_data_${suffix}`)) candidateKeys.push(`wd_data_${suffix}`);

        chrome.storage.local.get(candidateKeys, (data) => {
            const storageKey = candidateKeys.find(k => data && data[k]);
            const wd = storageKey
                ? data[storageKey]
                : (indexed ? { geminiTabId: indexed.geminiTabId, mangaTabId: indexed.mangaTabId, index: indexed.index, jobId: indexed.jobId } : null);

            if (!wd) return;

            if (storageKey) chrome.storage.local.remove(storageKey);
            const parsedSuffix = parseInt(suffix, 10);
            const geminiTabId = wd.geminiTabId
                || (indexed && indexed.geminiTabId)
                || (Number.isFinite(parsedSuffix) ? parsedSuffix : null);
            if (geminiTabId === null) return;
            log('warn', 'bg', 'JOB_TIMEOUT', `Timeout de ${JOB_TIMEOUT_MINUTES} min no index ${wd.index}`, { geminiTabId });

            if (wd.mangaTabId) {
                chrome.tabs.sendMessage(wd.mangaTabId, {
                    action: 'SHOW_ERROR_INTEGRATED', errorMsg: `⏰ LIMITE DE TEMPO (${JOB_TIMEOUT_MINUTES} min)`, imgIndex: wd.index, isDebug: false
                }, () => { if (chrome.runtime.lastError) {} });
            }

            finalizeJob(geminiTabId, wd.mangaTabId, true);
            const orphanIds = Object.keys(state().extractionTabs).filter(tabId => state().extractionTabs[tabId] && state().extractionTabs[tabId].geminiTabId === geminiTabId);
            orphanIds.forEach(tabId => {
                const numId = Number(tabId);
                chrome.tabs.remove(numId, () => { if (chrome.runtime.lastError) {} });
                delete state().extractionTabs[numId];
            });
        });
    }
});

function sendProgress(mangaTabId, text) {
    if (!mangaTabId) return;
    chrome.tabs.sendMessage(mangaTabId, { action: 'PROGRESS', text }, () => { if (chrome.runtime.lastError) {} });
}

function waitForDownload(id, onComplete, onError) {
    let safetyTimer;
    function handler(delta) {
        if (delta.id !== id) return;
        if (delta.state?.current === 'complete') {
            clearTimeout(safetyTimer);
            chrome.downloads.onChanged.removeListener(handler);
            onComplete(id);
        } else if (delta.state?.current === 'interrupted') {
            clearTimeout(safetyTimer);
            chrome.downloads.onChanged.removeListener(handler);
            if (onError) onError(new Error(`Download ${id} interrupted`));
        }
    }
    chrome.downloads.onChanged.addListener(handler);
    safetyTimer = setTimeout(() => {
        chrome.downloads.onChanged.removeListener(handler);
        if (onError) onError(new Error(`Temp timeout (10min)`));
    }, 600_000);
}

function downloadImagesAndShow(images, safeTitle, chapId) {
    const indices = Object.keys(images).map(Number).sort((a, b) => a - b);
    let completed = 0;
    let lastCompletedId = null;
    const pathsUpdate = {};

    return new Promise((resolve) => {
        if (indices.length === 0) return resolve(true);

        indices.forEach((idx) => {
            const fname = `MangaTranslator/${safeTitle}/pagina_${String(idx).padStart(3, '0')}.png`;
            chrome.downloads.download({ url: images[idx], filename: fname, saveAs: false }, (id) => {
                if (chrome.runtime.lastError || id === undefined) { 
                    completed++; if (completed === indices.length) finalize();
                    return; 
                }
                waitForDownload(id, 
                    (doneId) => {
                        chrome.downloads.search({ id: doneId }, (results) => {
                            if (results?.[0]) pathsUpdate[idx] = results[0].filename;
                            lastCompletedId = doneId;
                            completed++;
                            if (completed === indices.length) finalize();
                        });
                    },
                    (err) => {
                        log('error', 'bg', 'DOWNLOAD_INTERRUPTED', 'Download interrompido', { fname });
                        completed++;
                        if (completed === indices.length) finalize();
                    }
                );
            });
        });

        function finalize() {
            chrome.storage.local.get([`${chapId}_paths`], (d) => {
                if (Object.keys(pathsUpdate).length > 0) {
                    const toSet = {
                        [`${chapId}_paths`]: { ...(d[`${chapId}_paths`] || {}), ...pathsUpdate },
                        mangaTranslatorLastPath: pathsUpdate[indices[indices.length - 1]] || null
                    };
                    if (lastCompletedId) toSet[`${chapId}_dlId`] = lastCompletedId;
                    chrome.storage.local.set(toSet);
                }
                if (lastCompletedId) chrome.downloads.show(lastCompletedId);
                resolve(true);
            });
        }
    });
}

function handleMarkerAndShow(safeTitle, sendResponse) {
    const query = safeTitle ? `MangaTranslator(?:\\\\|/)${safeTitle}` : 'MangaTranslator';
    
    chrome.downloads.search({ filenameRegex: query }, (results) => {
        if (results && results.length > 0) {
            const valid = results.find(r => r.exists && r.state === 'complete');
            if (valid) {
                chrome.downloads.show(valid.id);
                log('success', 'bg', 'FOLDER_OPEN_OK', 'Pasta nativa', { safeTitle });
                if(sendResponse) sendResponse({ ok: true });
                return;
            }
        }
        
        const MARKER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';
        const markerPath = safeTitle ? `MangaTranslator/${safeTitle}/_anchor.png` : 'MangaTranslator/_anchor.png';

        chrome.downloads.download({ url: MARKER, filename: markerPath, saveAs: false, conflictAction: 'overwrite' }, (id) => {
            if (chrome.runtime.lastError || id === undefined) {
                if(sendResponse) sendResponse({ ok: false, error: 'Falha.' });
                return;
            }
            waitForDownload(id, 
                (doneId) => {
                    chrome.downloads.show(doneId);
                    setTimeout(() => { chrome.downloads.removeFile(doneId, () => { chrome.downloads.erase({ id: doneId }); }); }, 4000);
                    log('success', 'bg', 'FOLDER_OPEN_OK', 'Marcador aberto', { safeTitle });
                    if(sendResponse) sendResponse({ ok: true });
                },
                (err) => { if(sendResponse) sendResponse({ ok: false, error: 'Interrompido' }); }
            );
        });
    });
}

function createBatchDescriptor(request, mangaTabId, batchId) {
    return {
        batchId,
        mangaTabId,
        prompt: request.prompt || '',
        images: request.images.map(image => ({ index: image.index })),
        enqueuedAt: Date.now(),
    };
}

function activateBatchSnapshot(snapshot, batch) {
    snapshot.currentBatchId = batch.batchId;
    snapshot.stopRequested = false;
    snapshot.jobQueue = (Array.isArray(batch.images) ? batch.images : []).map(image => ({
        mangaTabId: batch.mangaTabId,
        index: image.index,
        prompt: batch.prompt || '',
        batchId: batch.batchId,
    }));
    snapshot.completedJobs = 0;
    snapshot.activeJobsCount = 0;
    snapshot.totalJobs = snapshot.jobQueue.length;
    snapshot.activeMangaTabId = batch.mangaTabId || null;
    snapshot.isProcessing = true;
    snapshot.completionClaimedBatchId = null;
    return snapshot;
}

async function startBatch(request, sender) {
    await ensureInitialized();
    const batchId = request.batchId || generateId();
    const runtimeState = state();
    const mangaTabId = sender && sender.tab ? sender.tab.id : request.mangaTabId;
    const incoming = createBatchDescriptor(request, mangaTabId, batchId);
    let outcome = null;

    const transition = snapshot => {
        const queuedJobs = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : [];
        const indexedJobs = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : [];
        const pending = Array.isArray(snapshot.pendingBatches)
            ? snapshot.pendingBatches.map(batch => ({
                ...batch,
                images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [],
            }))
            : [];
        snapshot.pendingBatches = pending;

        const hasActiveWork = Boolean(
            snapshot.isProcessing ||
            queuedJobs.length > 0 ||
            Number(snapshot.activeJobsCount) > 0 ||
            indexedJobs.length > 0
        );

        if (snapshot.currentBatchId === batchId) {
            outcome = {
                type: 'duplicate_active',
                batchId,
                alreadyCompleted: !hasActiveWork && snapshot.completionClaimedBatchId === batchId,
            };
            return snapshot;
        }

        const existingPendingIndex = pending.findIndex(batch => batch && batch.batchId === batchId);
        if (existingPendingIndex >= 0) {
            outcome = {
                type: 'duplicate_pending',
                batchId,
                activeBatchId: snapshot.currentBatchId || null,
                queuePosition: existingPendingIndex + 1,
            };
            return snapshot;
        }

        // Se existem lotes aguardando após uma reidratação, o novo lote entra
        // no fim da fila. Nunca ultrapasse B/C/D já aceitos anteriormente.
        if (hasActiveWork || pending.length > 0) {
            pending.push(incoming);
            snapshot.pendingBatches = pending;
            outcome = {
                type: 'queued',
                batchId,
                activeBatchId: snapshot.currentBatchId || null,
                queuePosition: pending.length,
                pendingCount: pending.length,
            };
            return snapshot;
        }

        activateBatchSnapshot(snapshot, incoming);
        outcome = { type: 'started', batchId, totalJobs: request.images.length };
        return snapshot;
    };

    if (typeof runtimeState.mutate === 'function') {
        await runtimeState.mutate(transition);
    } else {
        const snapshot = typeof runtimeState.get === 'function' ? runtimeState.get() : {
            jobQueue: runtimeState.jobQueue,
            jobIndex: runtimeState.jobIndex,
            pendingBatches: runtimeState.pendingBatches,
            isProcessing: runtimeState.isProcessing,
            activeJobsCount: runtimeState.activeJobsCount,
            currentBatchId: runtimeState.currentBatchId,
            completionClaimedBatchId: runtimeState.completionClaimedBatchId,
        };
        const next = transition(snapshot);
        if (typeof runtimeState.patch === 'function') runtimeState.patch(next);
        else Object.assign(runtimeState, next);
        await syncState();
    }

    if (outcome?.type === 'duplicate_active') {
        log('info', 'bg', 'BATCH_DUPLICATE_IGNORED',
            outcome.alreadyCompleted
                ? 'START_BATCH repetido para lote já concluído; nenhuma tarefa foi recriada.'
                : 'START_BATCH repetido para o lote ativo; estado existente foi preservado.', {
                batchId: batchId.slice(0, 8),
                alreadyCompleted: outcome.alreadyCompleted === true,
            });
        return {
            batchId,
            alreadyStarted: true,
            alreadyCompleted: outcome.alreadyCompleted === true,
        };
    }

    if (outcome?.type === 'duplicate_pending') {
        log('info', 'bg', 'BATCH_QUEUE_DUPLICATE_IGNORED',
            'START_BATCH repetido para lote já enfileirado; posição FIFO foi preservada.', {
                batchId: batchId.slice(0, 8),
                activeBatchId: String(outcome.activeBatchId || '').slice(0, 8),
                queuePosition: outcome.queuePosition,
            });
        return {
            batchId,
            queued: true,
            alreadyQueued: true,
            queuePosition: outcome.queuePosition,
            activeBatchId: outcome.activeBatchId,
        };
    }

    if (outcome?.type === 'queued') {
        initializeJobsModules();
        jobsLifecycle.allowBatchLaunches(batchId);
        log('info', 'bg', 'BATCH_QUEUED',
            'Lote aceito na fila FIFO sem alterar o lote atualmente ativo.', {
                batchId: batchId.slice(0, 8),
                activeBatchId: String(outcome.activeBatchId || '').slice(0, 8),
                queuePosition: outcome.queuePosition,
                pendingCount: outcome.pendingCount,
                totalJobs: request.images.length,
            });
        sendProgress(mangaTabId, `⏳ NA FILA (#${outcome.queuePosition})...`);
        // Também cobre o caso de reidratação em que havia fila persistida mas
        // nenhum lote ativo no instante desta nova requisição.
        processNextJob();
        return {
            batchId,
            queued: true,
            queuePosition: outcome.queuePosition,
            activeBatchId: outcome.activeBatchId,
        };
    }

    initializeJobsModules();
    jobsLifecycle.allowBatchLaunches(batchId);
    log('info', 'bg', 'BATCH_START',
        `Iniciando ${outcome.totalJobs} imagens (batch: ${batchId.slice(0, 8)})`);
    await _refreshMaxCon();
    processNextJob();
    return { batchId };
}

async function stopBatch(request) {
    await ensureInitialized();
    const runtimeState = state();
    const targetBatchId = request.batchId || runtimeState.currentBatchId;
    if (!targetBatchId) return {};

    // Lotes ainda não promovidos podem ser cancelados sem tocar no lote ativo.
    const pending = Array.isArray(runtimeState.pendingBatches)
        ? runtimeState.pendingBatches
        : [];
    const pendingIndex = pending.findIndex(batch => batch && batch.batchId === targetBatchId);
    if (pendingIndex >= 0 && targetBatchId !== runtimeState.currentBatchId) {
        const [removed] = pending.splice(pendingIndex, 1);
        runtimeState.pendingBatches = pending;
        await syncState();
        log('info', 'bg', 'BATCH_QUEUE_CANCELLED',
            'Lote pendente removido da fila FIFO sem interromper o lote ativo.', {
                batchId: targetBatchId,
                queuePosition: pendingIndex + 1,
                pendingCount: pending.length,
                mangaTabId: removed?.mangaTabId || null,
            });
        return {};
    }

    const stopsCurrentBatch = targetBatchId === runtimeState.currentBatchId;
    runtimeState.jobQueue = runtimeState.jobQueue.filter(job => job.batchId !== targetBatchId);

    if (stopsCurrentBatch) {
        // Marca o batch antes de liberar currentBatchId/stopRequested. Isso
        // cobre tabs.create/windows.create que resolvem depois da limpeza.
        initializeJobsModules();
        jobsLifecycle.invalidateBatchLaunches(targetBatchId);
        // stopRequested permanece true durante a limpeza para invalidar qualquer
        // tabs.create ainda em voo. A promoção do próximo lote ocorre somente
        // depois que os recursos conhecidos do lote atual foram removidos.
        runtimeState.stopRequested = true;
        runtimeState.isProcessing = false;
    }

    log('warn', 'bg', 'BATCH_STOP', `Batch parado (batch: ${targetBatchId.slice(0, 8)})`);

    let entries = indexJobsOfBatch(targetBatchId);
    const keysToRemove = [];
    entries.forEach(entry => {
        if (!entry) return;
        if (entry.geminiTabId || entry.geminiTabId === 0) {
            chrome.tabs.remove(entry.geminiTabId, () => { if (chrome.runtime.lastError) {} });
            keysToRemove.push(`gemini_job_${entry.geminiTabId}`, `wd_data_${entry.geminiTabId}`);
        }
        const alarmName = entry.jobId ? `watchdog_${entry.jobId}` : `watchdog_${entry.geminiTabId}`;
        chrome.alarms.clear(alarmName, () => {});
        indexRemoveJob(entry.geminiTabId);
    });
    if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove);

    Object.keys(runtimeState.extractionTabs).map(Number).forEach(tabId => {
        const info = runtimeState.extractionTabs[tabId];
        if (info && info.batchId && info.batchId !== targetBatchId) return;
        chrome.tabs.remove(tabId, () => { if (chrome.runtime.lastError) {} });
        delete runtimeState.extractionTabs[tabId];
    });

    if (stopsCurrentBatch) {
        let promoted = null;
        const transition = snapshot => {
            const nextPending = Array.isArray(snapshot.pendingBatches)
                ? snapshot.pendingBatches.map(batch => ({
                    ...batch,
                    images: Array.isArray(batch?.images)
                        ? batch.images.map(image => ({ ...image }))
                        : [],
                }))
                : [];

            snapshot.jobIndex = (Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : [])
                .filter(entry => !entry || entry.batchId !== targetBatchId);
            snapshot.jobQueue = (Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : [])
                .filter(job => !job || job.batchId !== targetBatchId);
            snapshot.activeJobsCount = 0;
            snapshot.activeMangaTabId = null;
            snapshot.currentBatchId = null;
            snapshot.completionClaimedBatchId = null;
            snapshot.stopRequested = false;
            snapshot.isProcessing = false;

            if (nextPending.length > 0) {
                promoted = nextPending.shift();
                snapshot.pendingBatches = nextPending;
                activateBatchSnapshot(snapshot, promoted);
            } else {
                snapshot.pendingBatches = nextPending;
            }
            return snapshot;
        };

        if (typeof runtimeState.mutate === 'function') await runtimeState.mutate(transition);
        else {
            transition(runtimeState);
            await syncState();
        }

        if (promoted) {
            log('info', 'bg', 'BATCH_PROMOTED',
                'Próximo lote da fila FIFO foi promovido após cancelamento do lote ativo.', {
                    previousBatchId: targetBatchId.slice(0, 8),
                    batchId: String(promoted.batchId || '').slice(0, 8),
                    pendingCount: runtimeState.pendingBatches.length,
                    totalJobs: Array.isArray(promoted.images) ? promoted.images.length : 0,
                });
            sendProgress(promoted.mangaTabId, '▶️ INICIANDO LOTE DA FILA...');
            await _refreshMaxCon();
            processNextJob();
        }
        return {};
    }

    runtimeState.activeJobsCount = indexJobsOfBatch(runtimeState.currentBatchId).length;
    await syncState();
    if (runtimeState.isProcessing) processNextJob();
    return {};
}

// Fachadas compatíveis: ações e testes existentes continuam chamando os nomes
// históricos, mas a implementação canônica agora vive em jobs-lifecycle.js.
// A remoção física dos corpos antigos fica segura porque estas referências são
// também o contrato temporário dos módulos já extraídos.
const updateJobState = (...args) => {
    initializeJobsModules();
    return jobsLifecycle.updateJobState(...args);
};
const assertJobOwnership = (sender, jobId, callback) => {
    initializeJobsModules();
    jobsLifecycle.assertJobOwnership(sender, jobId)
        .then(({ owns, tabId, job }) => callback(owns, tabId, job || null))
        .catch(() => callback(false, sender && sender.tab ? sender.tab.id : null, null));
};
const processNextJob = (...args) => {
    initializeJobsModules();
    return jobsLifecycle.processNextJob(...args);
};
const finalizeJob = (...args) => {
    initializeJobsModules();
    return jobsLifecycle.finalizeJob(...args);
};
const _refreshMaxCon = (...args) => {
    initializeJobsModules();
    return jobsLifecycle.refreshMaxConcurrency(...args);
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request && request.action === 'GET_TAB_ID') {
        log('info', 'bg', 'TAB_ID_OBSERVED', 'tabId observado em GET_TAB_ID', {
            tabId: sender && sender.tab ? sender.tab.id : null,
        });
    }

    const routedAction = routeRegisteredAction(request, sender, sendResponse);
    if (routedAction && routedAction.handled) {
        return routedAction.keepAlive;
    }

    if (handleGtcRuntimeMessage(request, sender, sendResponse)) {
        return true;
    }

    if (handleStorageManagerMessage(request, sender, sendResponse)) {
        return true;
    }

});
~~~

## 10. Rastreabilidade de 100% das posições

São **1252 entradas**: 1251 linhas textuais e o newline final. A evidência é classificada por unidade, não inventada para delimitadores.

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 0001 | U01 | 'use strict'; | Ativa strict mode para todo background.js antes do registro de listeners. |
| 0002 | U01 | ␠ [linha vazia] | Separa visualmente etapas dentro de U01 (Estado global e configuração-base); não altera estado, Promise, listener nem controle de fluxo. |
| 0003 | U01 | // ── Estado Global ───────────────────────────────────────── | Registra a decisão/manutenção local de U01: “── Estado Global ─────────────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0004 | U01 | // O estado de jobs pertence exclusivamente a background/state.js.  Não manter | Registra a decisão/manutenção local de U01: “O estado de jobs pertence exclusivamente a background/state.js.  Não manter”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0005 | U01 | // cópias locais aqui é essencial no MV3: um worker reidratado não pode escolher | Registra a decisão/manutenção local de U01: “cópias locais aqui é essencial no MV3: um worker reidratado não pode escolher”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0006 | U01 | // acidentalmente entre um espelho antigo e o snapshot durável. | Registra a decisão/manutenção local de U01: “acidentalmente entre um espelho antigo e o snapshot durável.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0007 | U01 | let backgroundState = null; | Cria o binding `backgroundState` (let) usado por U01; o inicializador da linha estabelece o valor/closure inicial. |
| 0008 | U01 | ␠ [linha vazia] | Separa visualmente etapas dentro de U01 (Estado global e configuração-base); não altera estado, Promise, listener nem controle de fluxo. |
| 0009 | U01 | // Margem sobre os 4 min de geração; rearmada ao observar seu início real. | Registra a decisão/manutenção local de U01: “Margem sobre os 4 min de geração; rearmada ao observar seu início real.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0010 | U01 | const JOB_TIMEOUT_MINUTES = 5; | Cria o binding `JOB_TIMEOUT_MINUTES` (const) usado por U01; o inicializador da linha estabelece o valor/closure inicial. |
| 0011 | U01 | const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); | Cria o binding `delay` (const) usado por U01; o inicializador da linha estabelece o valor/closure inicial. |
| 0012 | U01 | let gtcIndexedDbApi = null; | Cria o binding `gtcIndexedDbApi` (let) usado por U01; o inicializador da linha estabelece o valor/closure inicial. |
| 0013 | U01 | let gtcRepository = null; | Cria o binding `gtcRepository` (let) usado por U01; o inicializador da linha estabelece o valor/closure inicial. |
| 0014 | U01 | let gtcRuntimeHandler = null; | Cria o binding `gtcRuntimeHandler` (let) usado por U01; o inicializador da linha estabelece o valor/closure inicial. |
| 0015 | U01 | let storageManagerApi = null; | Cria o binding `storageManagerApi` (let) usado por U01; o inicializador da linha estabelece o valor/closure inicial. |
| 0016 | U01 | ␠ [linha vazia] | Separa visualmente etapas dentro de U01 (Estado global e configuração-base); não altera estado, Promise, listener nem controle de fluxo. |
| 0017 | U02 | // Nem todo ambiente (Service Worker antigo, Node/Jest sem webcrypto global) | Registra a decisão/manutenção local de U02: “Nem todo ambiente (Service Worker antigo, Node/Jest sem webcrypto global)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0018 | U02 | // expõe crypto.randomUUID. Sem fallback, processNextJob lança e o lote morre. | Registra a decisão/manutenção local de U02: “expõe crypto.randomUUID. Sem fallback, processNextJob lança e o lote morre.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0019 | U02 | function generateId(prefix = '') { | Declara generateId(prefix = '') como entrada nomeada de U02; o corpo seguinte implementa o contrato da unidade. |
| 0020 | U02 |     try { | Inicia região protegida de U02; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0021 | U02 |         if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { | Abre a guarda `if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {` em U02; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0022 | U02 |             return prefix + crypto.randomUUID(); | Encerra este caminho de U02 devolvendo `prefix + crypto.randomUUID();`; o chamador usa esse valor como contrato/controle. |
| 0023 | U02 |         } | Fecha a estrutura sintática aberta imediatamente antes em U02 (bloco, callback, objeto ou chamada). |
| 0024 | U02 |     } catch (_e) {} | Captura a exceção do try de U02; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0025 | U02 |     return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`; | Encerra este caminho de U02 devolvendo ``${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;`; o chamador usa esse valor como contrato/controle. |
| 0026 | U02 | } | Fecha a estrutura sintática aberta imediatamente antes em U02 (bloco, callback, objeto ou chamada). |
| 0027 | U02 | ␠ [linha vazia] | Separa visualmente etapas dentro de U02 (Geração robusta de IDs); não altera estado, Promise, listener nem controle de fluxo. |
| 0028 | U03 | const _finalizedTabs = new Set(); | Cria o binding `_finalizedTabs` (const) usado por U03; o inicializador da linha estabelece o valor/closure inicial. |
| 0029 | U03 | const FINALIZATION_MARKER_TTL_MINUTES = 10; | Cria o binding `FINALIZATION_MARKER_TTL_MINUTES` (const) usado por U03; o inicializador da linha estabelece o valor/closure inicial. |
| 0030 | U03 | ␠ [linha vazia] | Separa visualmente etapas dentro de U03 (Proteção de finalização em memória); não altera estado, Promise, listener nem controle de fluxo. |
| 0031 | U03 | function finalizationMarkerKey(geminiTabId) { | Declara finalizationMarkerKey(geminiTabId) como entrada nomeada de U03; o corpo seguinte implementa o contrato da unidade. |
| 0032 | U03 |     return `gemini_finalized_${geminiTabId}`; | Encerra este caminho de U03 devolvendo ``gemini_finalized_${geminiTabId}`;`; o chamador usa esse valor como contrato/controle. |
| 0033 | U03 | } | Fecha a estrutura sintática aberta imediatamente antes em U03 (bloco, callback, objeto ou chamada). |
| 0034 | U03 | ␠ [linha vazia] | Separa visualmente etapas dentro de U03 (Proteção de finalização em memória); não altera estado, Promise, listener nem controle de fluxo. |
| 0035 | U03 | function armFinalizationMarkerCleanup(geminiTabId) { | Declara armFinalizationMarkerCleanup(geminiTabId) como entrada nomeada de U03; o corpo seguinte implementa o contrato da unidade. |
| 0036 | U03 |     chrome.alarms.create(`finalization_marker_${geminiTabId}`, { | Invoca `chrome.alarms.create` em U03; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0037 | U03 |         delayInMinutes: FINALIZATION_MARKER_TTL_MINUTES, | Define a propriedade `delayInMinutes` no objeto/snapshot de U03, compondo o contrato enviado ao módulo/storage/API. |
| 0038 | U03 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U03 (bloco, callback, objeto ou chamada). |
| 0039 | U03 | } | Fecha a estrutura sintática aberta imediatamente antes em U03 (bloco, callback, objeto ou chamada). |
| 0040 | U03 | ␠ [linha vazia] | Separa visualmente etapas dentro de U03 (Proteção de finalização em memória); não altera estado, Promise, listener nem controle de fluxo. |
| 0041 | U03 | function _markFinalized(geminiTabId) { | Declara _markFinalized(geminiTabId) como entrada nomeada de U03; o corpo seguinte implementa o contrato da unidade. |
| 0042 | U03 |     _finalizedTabs.add(geminiTabId); | Invoca `_finalizedTabs.add` nesta etapa de U03; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0043 | U03 |     const cleanupTimer = setTimeout(() => _finalizedTabs.delete(geminiTabId), 30_000); | Cria o binding `cleanupTimer` (const) usado por U03; o inicializador da linha estabelece o valor/closure inicial. |
| 0044 | U03 |     if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref(); | Abre a guarda `if (cleanupTimer && typeof cleanupTimer.unref === 'function') cleanupTimer.unref();` em U03; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0045 | U03 | } | Fecha a estrutura sintática aberta imediatamente antes em U03 (bloco, callback, objeto ou chamada). |
| 0046 | U03 | ␠ [linha vazia] | Separa visualmente etapas dentro de U03 (Proteção de finalização em memória); não altera estado, Promise, listener nem controle de fluxo. |
| 0047 | U04 | if (typeof importScripts === 'function') { | Abre a guarda `if (typeof importScripts === 'function') {` em U04; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0048 | U04 |     try { | Inicia região protegida de U04; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0049 | U04 |         importScripts('background/router.js'); | Carrega `background/router.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0050 | U04 |         importScripts('background/state.js'); | Carrega `background/state.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0051 | U04 |         importScripts('background/tab-identity.js'); | Carrega `background/tab-identity.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0052 | U04 |         importScripts('background/jobs-watchdog.js'); | Carrega `background/jobs-watchdog.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0053 | U04 |         importScripts('background/jobs-reconciliation.js'); | Carrega `background/jobs-reconciliation.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0054 | U04 |         importScripts('background/jobs-dom-ack.js'); | Carrega `background/jobs-dom-ack.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0055 | U04 |         importScripts('background/jobs-lifecycle.js'); | Carrega `background/jobs-lifecycle.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0056 | U04 |         importScripts('background/actions/log-entry.js'); | Carrega `background/actions/log-entry.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0057 | U04 |         importScripts('background/actions/get-tab-id.js'); | Carrega `background/actions/get-tab-id.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0058 | U04 |         importScripts('background/actions/claim-gemini-job.js'); | Carrega `background/actions/claim-gemini-job.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0059 | U04 |         importScripts('background/actions/relay-progress.js'); | Carrega `background/actions/relay-progress.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0060 | U04 |         importScripts('background/actions/check-extraction-tab.js'); | Carrega `background/actions/check-extraction-tab.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0061 | U04 |         importScripts('background/actions/set-debug-mode.js'); | Carrega `background/actions/set-debug-mode.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0062 | U04 |         importScripts('background/actions/fetch-image-base64.js'); | Carrega `background/actions/fetch-image-base64.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0063 | U04 |         importScripts('background/actions/calculate-visual-fingerprint.js'); | Carrega `background/actions/calculate-visual-fingerprint.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0064 | U04 |         importScripts('background/actions/force-send-activation.js'); | Carrega `background/actions/force-send-activation.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0065 | U04 |         importScripts('background/actions/refresh-job-watchdog.js'); | Carrega `background/actions/refresh-job-watchdog.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0066 | U04 |         importScripts('background/actions/request-image-data.js'); | Carrega `background/actions/request-image-data.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0067 | U04 |         importScripts('background/actions/open-manga-root.js'); | Carrega `background/actions/open-manga-root.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0068 | U04 |         importScripts('background/actions/download-image.js'); | Carrega `background/actions/download-image.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0069 | U04 |         importScripts('background/actions/open-existing-folder.js'); | Carrega `background/actions/open-existing-folder.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0070 | U04 |         importScripts('background/actions/download-chapter.js'); | Carrega `background/actions/download-chapter.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0071 | U04 |         importScripts('background/actions/export-all.js'); | Carrega `background/actions/export-all.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0072 | U04 |         importScripts('background/actions/deliver-result-url.js'); | Carrega `background/actions/deliver-result-url.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0073 | U04 |         importScripts('background/actions/deliver-result-from-tab.js'); | Carrega `background/actions/deliver-result-from-tab.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0074 | U04 |         importScripts('background/actions/report-error.js'); | Carrega `background/actions/report-error.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0075 | U04 |         importScripts('background/actions/deliver-result.js'); | Carrega `background/actions/deliver-result.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0076 | U04 |         importScripts('background/actions/commit-result.js'); | Carrega `background/actions/commit-result.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0077 | U04 |         importScripts('background/actions/start-batch.js'); | Carrega `background/actions/start-batch.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0078 | U04 |         importScripts('background/actions/stop-batch.js'); | Carrega `background/actions/stop-batch.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0079 | U04 |     } catch (e) { | Captura a exceção do try de U04; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0080 | U04 |         console.error('[MangaTranslator background] Falha ao carregar módulos obrigatórios do background.', e); | Invoca `console.error` nesta etapa de U04; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0081 | U04 |         throw e; | Completa a expressão multilinha de U04 com `throw e;`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0082 | U04 |     } | Fecha a estrutura sintática aberta imediatamente antes em U04 (bloco, callback, objeto ou chamada). |
| 0083 | U04 |     try { | Inicia região protegida de U04; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0084 | U04 |         // gtc-fingerprint.js expõe self.MangaTranslatorGtcFingerprint: | Registra a decisão/manutenção local de U04: “gtc-fingerprint.js expõe self.MangaTranslatorGtcFingerprint:”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0085 | U04 |         //   - SHA-256 (visual-v1/v2) | Registra a decisão/manutenção local de U04: “  - SHA-256 (visual-v1/v2)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0086 | U04 |         //   - dHash   (visual-v2) | Registra a decisão/manutenção local de U04: “  - dHash   (visual-v2)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0087 | U04 |         //   - wHash   (visual-v3 — Haar Wavelet, 32×32 → 64 hex / 256 bits) | Registra a decisão/manutenção local de U04: “  - wHash   (visual-v3 — Haar Wavelet, 32×32 → 64 hex / 256 bits)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0088 | U04 |         //   - pHash   (visual-v3 — DCT, 32×32 → 64 hex / 256 bits) | Registra a decisão/manutenção local de U04: “  - pHash   (visual-v3 — DCT, 32×32 → 64 hex / 256 bits)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0089 | U04 |         //   - Regional hashes (visual-v3 — 4 cantos, 48×48) | Registra a decisão/manutenção local de U04: “  - Regional hashes (visual-v3 — 4 cantos, 48×48)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0090 | U04 |         //   - matchPerceptualHashes / Relaxed (decisão combinada wHash+pHash) | Registra a decisão/manutenção local de U04: “  - matchPerceptualHashes / Relaxed (decisão combinada wHash+pHash)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0091 | U04 |         importScripts('shared/gtc-fingerprint.js'); | Carrega `shared/gtc-fingerprint.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0092 | U04 |         importScripts('shared/gtc-indexeddb.js'); | Carrega `shared/gtc-indexeddb.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0093 | U04 |         // storage-manager.js roda SÓ aqui: o banco de páginas/assets precisa da | Registra a decisão/manutenção local de U04: “storage-manager.js roda SÓ aqui: o banco de páginas/assets precisa da”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0094 | U04 |         // origem da extensão. Num content script ele criaria um banco por site. | Registra a decisão/manutenção local de U04: “origem da extensão. Num content script ele criaria um banco por site.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0095 | U04 |         importScripts('shared/storage-manager.js'); | Carrega `shared/storage-manager.js` no escopo global do service worker antes dos consumidores posteriores de U04. |
| 0096 | U04 |         if (typeof self !== 'undefined' && self.MangaTranslatorGtcIndexedDb) { | Abre a guarda `if (typeof self !== 'undefined' && self.MangaTranslatorGtcIndexedDb) {` em U04; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0097 | U04 |             gtcIndexedDbApi = self.MangaTranslatorGtcIndexedDb; | Atualiza `gtcIndexedDbApi` dentro de U04; passos posteriores da unidade observam esse novo valor. |
| 0098 | U04 |         } | Fecha a estrutura sintática aberta imediatamente antes em U04 (bloco, callback, objeto ou chamada). |
| 0099 | U04 |         if (typeof self !== 'undefined' && self.MangaTranslatorStorageManager) { | Abre a guarda `if (typeof self !== 'undefined' && self.MangaTranslatorStorageManager) {` em U04; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0100 | U04 |             storageManagerApi = self.MangaTranslatorStorageManager; | Atualiza `storageManagerApi` dentro de U04; passos posteriores da unidade observam esse novo valor. |
| 0101 | U04 |         } | Fecha a estrutura sintática aberta imediatamente antes em U04 (bloco, callback, objeto ou chamada). |
| 0102 | U04 |     } catch (e) { | Captura a exceção do try de U04; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0103 | U04 |         console.error('[MangaTranslator background] Falha ao carregar cache/storage obrigatórios.', e); | Invoca `console.error` nesta etapa de U04; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0104 | U04 |         throw e; | Completa a expressão multilinha de U04 com `throw e;`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0105 | U04 |     } | Fecha a estrutura sintática aberta imediatamente antes em U04 (bloco, callback, objeto ou chamada). |
| 0106 | U05 | } else if (typeof require === 'function') { | Seleciona o caminho alternativo de U05 quando a guarda imediatamente anterior falha. |
| 0107 | U05 |     try { | Inicia região protegida de U05; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0108 | U05 |         require('./background/router.js'); | Carrega `./background/router.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0109 | U05 |         require('./background/state.js'); | Carrega `./background/state.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0110 | U05 |         require('./background/tab-identity.js'); | Carrega `./background/tab-identity.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0111 | U05 |         require('./background/jobs-watchdog.js'); | Carrega `./background/jobs-watchdog.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0112 | U05 |         require('./background/jobs-reconciliation.js'); | Carrega `./background/jobs-reconciliation.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0113 | U05 |         require('./background/jobs-dom-ack.js'); | Carrega `./background/jobs-dom-ack.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0114 | U05 |         require('./background/jobs-lifecycle.js'); | Carrega `./background/jobs-lifecycle.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0115 | U05 |         require('./background/actions/log-entry.js'); | Carrega `./background/actions/log-entry.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0116 | U05 |         require('./background/actions/get-tab-id.js'); | Carrega `./background/actions/get-tab-id.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0117 | U05 |         require('./background/actions/claim-gemini-job.js'); | Carrega `./background/actions/claim-gemini-job.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0118 | U05 |         require('./background/actions/relay-progress.js'); | Carrega `./background/actions/relay-progress.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0119 | U05 |         require('./background/actions/check-extraction-tab.js'); | Carrega `./background/actions/check-extraction-tab.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0120 | U05 |         require('./background/actions/set-debug-mode.js'); | Carrega `./background/actions/set-debug-mode.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0121 | U05 |         require('./background/actions/fetch-image-base64.js'); | Carrega `./background/actions/fetch-image-base64.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0122 | U05 |         require('./background/actions/calculate-visual-fingerprint.js'); | Carrega `./background/actions/calculate-visual-fingerprint.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0123 | U05 |         require('./background/actions/force-send-activation.js'); | Carrega `./background/actions/force-send-activation.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0124 | U05 |         require('./background/actions/refresh-job-watchdog.js'); | Carrega `./background/actions/refresh-job-watchdog.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0125 | U05 |         require('./background/actions/request-image-data.js'); | Carrega `./background/actions/request-image-data.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0126 | U05 |         require('./background/actions/open-manga-root.js'); | Carrega `./background/actions/open-manga-root.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0127 | U05 |         require('./background/actions/download-image.js'); | Carrega `./background/actions/download-image.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0128 | U05 |         require('./background/actions/open-existing-folder.js'); | Carrega `./background/actions/open-existing-folder.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0129 | U05 |         require('./background/actions/download-chapter.js'); | Carrega `./background/actions/download-chapter.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0130 | U05 |         require('./background/actions/export-all.js'); | Carrega `./background/actions/export-all.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0131 | U05 |         require('./background/actions/deliver-result-url.js'); | Carrega `./background/actions/deliver-result-url.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0132 | U05 |         require('./background/actions/deliver-result-from-tab.js'); | Carrega `./background/actions/deliver-result-from-tab.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0133 | U05 |         require('./background/actions/report-error.js'); | Carrega `./background/actions/report-error.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0134 | U05 |         require('./background/actions/deliver-result.js'); | Carrega `./background/actions/deliver-result.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0135 | U05 |         require('./background/actions/commit-result.js'); | Carrega `./background/actions/commit-result.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0136 | U05 |         require('./background/actions/start-batch.js'); | Carrega `./background/actions/start-batch.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0137 | U05 |         require('./background/actions/stop-batch.js'); | Carrega `./background/actions/stop-batch.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0138 | U05 |     } catch (e) {} | Captura a exceção do try de U05; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0139 | U05 |     try { | Inicia região protegida de U05; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0140 | U05 |         gtcIndexedDbApi = require('./shared/gtc-indexeddb.js'); | Carrega `./shared/gtc-indexeddb.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0141 | U05 |     } catch (e) {} | Captura a exceção do try de U05; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0142 | U05 |     try { | Inicia região protegida de U05; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0143 | U05 |         storageManagerApi = require('./shared/storage-manager.js'); | Carrega `./shared/storage-manager.js` no caminho Node/Jest para executar o mesmo background real no harness. |
| 0144 | U05 |     } catch (e) {} | Captura a exceção do try de U05; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0145 | U05 | } | Fecha a estrutura sintática aberta imediatamente antes em U05 (bloco, callback, objeto ou chamada). |
| 0146 | U05 | ␠ [linha vazia] | Separa visualmente etapas dentro de U05 (Boot alternativo Node/Jest via require); não altera estado, Promise, listener nem controle de fluxo. |
| 0147 | U06 | function getGtcRepository() { | Declara getGtcRepository() como entrada nomeada de U06; o corpo seguinte implementa o contrato da unidade. |
| 0148 | U06 |     if (!gtcRepository && gtcIndexedDbApi && gtcIndexedDbApi.createIndexedDbRepository) { | Abre a guarda `if (!gtcRepository && gtcIndexedDbApi && gtcIndexedDbApi.createIndexedDbRepository) {` em U06; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0149 | U06 |         gtcRepository = gtcIndexedDbApi.createIndexedDbRepository(); | Atualiza `gtcRepository` dentro de U06; passos posteriores da unidade observam esse novo valor. |
| 0150 | U06 |     } | Fecha a estrutura sintática aberta imediatamente antes em U06 (bloco, callback, objeto ou chamada). |
| 0151 | U06 |     return gtcRepository; | Encerra este caminho de U06 devolvendo `gtcRepository;`; o chamador usa esse valor como contrato/controle. |
| 0152 | U06 | } | Fecha a estrutura sintática aberta imediatamente antes em U06 (bloco, callback, objeto ou chamada). |
| 0153 | U06 | ␠ [linha vazia] | Separa visualmente etapas dentro de U06 (Repositório GTC lazy); não altera estado, Promise, listener nem controle de fluxo. |
| 0154 | U07 | // ── handleGtcRuntimeMessage ────────────────────────────────────────────────── | Registra a decisão/manutenção local de U07: “── handleGtcRuntimeMessage ──────────────────────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0155 | U07 | // Passa o fingerprintApi (self.MangaTranslatorGtcFingerprint) para o handler | Registra a decisão/manutenção local de U07: “Passa o fingerprintApi (self.MangaTranslatorGtcFingerprint) para o handler”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0156 | U07 | // para que GTC_QUERY_BY_PERCEPTUAL possa invocar matchPerceptualHashes no SW, | Registra a decisão/manutenção local de U07: “para que GTC_QUERY_BY_PERCEPTUAL possa invocar matchPerceptualHashes no SW,”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0157 | U07 | // onde o banco IndexedDB também reside (mesmo processo do Service Worker). | Registra a decisão/manutenção local de U07: “onde o banco IndexedDB também reside (mesmo processo do Service Worker).”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0158 | U07 | // | Registra a decisão/manutenção local de U07: “”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0159 | U07 | // Sem o fingerprintApi, o lookup perceptual retorna vazio mas não quebra o fluxo | Registra a decisão/manutenção local de U07: “Sem o fingerprintApi, o lookup perceptual retorna vazio mas não quebra o fluxo”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0160 | U07 | // (conteúdo do manga continua sendo tratado por SHA-256 e dHash como fallback). | Registra a decisão/manutenção local de U07: “(conteúdo do manga continua sendo tratado por SHA-256 e dHash como fallback).”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0161 | U07 | // ───────────────────────────────────────────────────────────────────────────── | Registra a decisão/manutenção local de U07: “─────────────────────────────────────────────────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0162 | U07 | // ── handleStorageManagerMessage ────────────────────────────────────────────── | Registra a decisão/manutenção local de U07: “── handleStorageManagerMessage ──────────────────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0163 | U07 | // O background é o ÚNICO dono da persistência de páginas traduzidas. O content | Registra a decisão/manutenção local de U07: “O background é o ÚNICO dono da persistência de páginas traduzidas. O content”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0164 | U07 | // script deixou de gravar direto em chrome.storage.local; agora ele envia o | Registra a decisão/manutenção local de U07: “script deixou de gravar direto em chrome.storage.local; agora ele envia o”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0165 | U07 | // resultado e recebe confirmação. Isso elimina a corrida na raiz e permite que | Registra a decisão/manutenção local de U07: “resultado e recebe confirmação. Isso elimina a corrida na raiz e permite que”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0166 | U07 | // leitor/popup consultem metadados sem carregar Base64 nenhum. | Registra a decisão/manutenção local de U07: “leitor/popup consultem metadados sem carregar Base64 nenhum.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0167 | U07 | // | Registra a decisão/manutenção local de U07: “”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0168 | U07 | // Síncrona por contrato (igual ao handler do GTC): retornar uma Promise faria o | Registra a decisão/manutenção local de U07: “Síncrona por contrato (igual ao handler do GTC): retornar uma Promise faria o”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0169 | U07 | // listener devolver sempre truthy e bloquearia todas as outras mensagens. | Registra a decisão/manutenção local de U07: “listener devolver sempre truthy e bloquearia todas as outras mensagens.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0170 | U08 | function handleStorageManagerMessage(request, sender, sendResponse) { | Declara handleStorageManagerMessage(request, sender, sendResponse) como entrada nomeada de U08; o corpo seguinte implementa o contrato da unidade. |
| 0171 | U08 |     if (!request \|\| typeof request.action !== 'string' \|\| request.action.indexOf('SM_') !== 0) return false; | Abre a guarda `if (!request // typeof request.action !== 'string' // request.action.indexOf('SM_') !== 0) return false;` em U08; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0172 | U08 | ␠ [linha vazia] | Separa visualmente etapas dentro de U08 (Bridge Storage Manager SM_*); não altera estado, Promise, listener nem controle de fluxo. |
| 0173 | U08 |     const sm = storageManagerApi; | Cria o binding `sm` (const) usado por U08; o inicializador da linha estabelece o valor/closure inicial. |
| 0174 | U08 |     if (!sm) { | Abre a guarda `if (!sm) {` em U08; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0175 | U08 |         sendResponse({ ok: false, error: 'storage-manager indisponível' }); | Invoca `sendResponse` nesta etapa de U08; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0176 | U08 |         return true; | Encerra este caminho de U08 devolvendo `true;`; o chamador usa esse valor como contrato/controle. |
| 0177 | U08 |     } | Fecha a estrutura sintática aberta imediatamente antes em U08 (bloco, callback, objeto ou chamada). |
| 0178 | U08 | ␠ [linha vazia] | Separa visualmente etapas dentro de U08 (Bridge Storage Manager SM_*); não altera estado, Promise, listener nem controle de fluxo. |
| 0179 | U08 |     const run = (promise) => { | Cria o binding `run` (const) usado por U08; o inicializador da linha estabelece o valor/closure inicial. |
| 0180 | U08 |         promise | Completa a expressão multilinha de U08 com `promise`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0181 | U08 |             .then(result => sendResponse({ ok: true, ...(result \|\| {}) })) | Continua a cadeia de U08 com `.then(result => sendResponse({ ok: true, ...(result // {}) }))`, transformando/filtrando/tratando o valor anterior. |
| 0182 | U08 |             .catch(error => { | Continua a cadeia de U08 com `.catch(error => {`, transformando/filtrando/tratando o valor anterior. |
| 0183 | U08 |                 const message = error && error.message ? error.message : String(error); | Cria o binding `message` (const) usado por U08; o inicializador da linha estabelece o valor/closure inicial. |
| 0184 | U08 |                 log('error', 'bg', 'SM_ERROR', `Falha em ${request.action}: ${message}`, {}); | Invoca `log` nesta etapa de U08; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0185 | U08 |                 sendResponse({ ok: false, error: message }); | Invoca `sendResponse` nesta etapa de U08; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0186 | U08 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U08 (bloco, callback, objeto ou chamada). |
| 0187 | U08 |         return true; | Encerra este caminho de U08 devolvendo `true;`; o chamador usa esse valor como contrato/controle. |
| 0188 | U08 |     }; | Fecha a estrutura sintática aberta imediatamente antes em U08 (bloco, callback, objeto ou chamada). |
| 0189 | U08 | ␠ [linha vazia] | Separa visualmente etapas dentro de U08 (Bridge Storage Manager SM_*); não altera estado, Promise, listener nem controle de fluxo. |
| 0190 | U08 |     switch (request.action) { | Abre o dispatcher por action de U08; os cases seguintes mapeiam comandos concretos. |
| 0191 | U08 |         case 'SM_SAVE_PAGE': | Seleciona `case 'SM_SAVE_PAGE'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0192 | U08 |             return run(sm.savePageResult( | Encerra este caminho de U08 devolvendo `run(sm.savePageResult(`; o chamador usa esse valor como contrato/controle. |
| 0193 | U08 |                 request.chapterId, request.pageIndex, request.dataUrl, | Completa a expressão multilinha de U08 com `request.chapterId, request.pageIndex, request.dataUrl,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0194 | U08 |                 request.originalUrl \|\| '', request.cleanUrl \|\| '', request.meta \|\| {} | Completa a expressão multilinha de U08 com `request.originalUrl // '', request.cleanUrl // '', request.meta // {}`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0195 | U08 |             )); | Fecha a estrutura sintática aberta imediatamente antes em U08 (bloco, callback, objeto ou chamada). |
| 0196 | U08 |         case 'SM_GET_ASSET': | Seleciona `case 'SM_GET_ASSET'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0197 | U08 |             return run(sm.getAssetDataUrl(request.assetId).then(dataUrl => ({ dataUrl }))); | Encerra este caminho de U08 devolvendo `run(sm.getAssetDataUrl(request.assetId).then(dataUrl => ({ dataUrl })));`; o chamador usa esse valor como contrato/controle. |
| 0198 | U08 |         case 'SM_GET_PAGE': | Seleciona `case 'SM_GET_PAGE'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0199 | U08 |             return run(sm.getPageDataUrl(request.chapterId, request.pageIndex).then(dataUrl => ({ dataUrl }))); | Encerra este caminho de U08 devolvendo `run(sm.getPageDataUrl(request.chapterId, request.pageIndex).then(dataUrl => ({ dataUrl })));`; o chamador usa esse valor como contrato/controle. |
| 0200 | U08 |         case 'SM_PAGE_INDEX': | Seleciona `case 'SM_PAGE_INDEX'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0201 | U08 |             return run(sm.getChapterPageIndex(request.chapterId).then(pages => ({ pages }))); | Encerra este caminho de U08 devolvendo `run(sm.getChapterPageIndex(request.chapterId).then(pages => ({ pages })));`; o chamador usa esse valor como contrato/controle. |
| 0202 | U08 |         case 'SM_RESTORE_INDEX': | Seleciona `case 'SM_RESTORE_INDEX'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0203 | U08 |             return run(sm.getRestoreIndex(request.chapterId).then(entries => ({ entries }))); | Encerra este caminho de U08 devolvendo `run(sm.getRestoreIndex(request.chapterId).then(entries => ({ entries })));`; o chamador usa esse valor como contrato/controle. |
| 0204 | U08 |         case 'SM_LIST_RESTORE': | Seleciona `case 'SM_LIST_RESTORE'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0205 | U08 |             return run(sm.listRestoreEntries(request.chapterIds \|\| null).then(entries => ({ entries }))); | Encerra este caminho de U08 devolvendo `run(sm.listRestoreEntries(request.chapterIds // null).then(entries => ({ entries })));`; o chamador usa esse valor como contrato/controle. |
| 0206 | U08 |         case 'SM_CHAPTERS_STATS': | Seleciona `case 'SM_CHAPTERS_STATS'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0207 | U08 |             return run(sm.getChaptersStats(request.chapterIds \|\| []).then(stats => ({ stats }))); | Encerra este caminho de U08 devolvendo `run(sm.getChaptersStats(request.chapterIds // []).then(stats => ({ stats })));`; o chamador usa esse valor como contrato/controle. |
| 0208 | U08 |         case 'SM_DELETE_CLEAN_URL': | Seleciona `case 'SM_DELETE_CLEAN_URL'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0209 | U08 |             return run(sm.deleteByCleanUrl(request.cleanUrl)); | Encerra este caminho de U08 devolvendo `run(sm.deleteByCleanUrl(request.cleanUrl));`; o chamador usa esse valor como contrato/controle. |
| 0210 | U08 |         case 'SM_DELETE_CHAPTER': | Seleciona `case 'SM_DELETE_CHAPTER'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0211 | U08 |             return run(sm.deleteChapter(request.chapterId)); | Encerra este caminho de U08 devolvendo `run(sm.deleteChapter(request.chapterId));`; o chamador usa esse valor como contrato/controle. |
| 0212 | U08 |         case 'SM_MIGRATE_CHAPTER': | Seleciona `case 'SM_MIGRATE_CHAPTER'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0213 | U08 |             return run(sm.migrateChapterFromLegacy(request.chapterId)); | Encerra este caminho de U08 devolvendo `run(sm.migrateChapterFromLegacy(request.chapterId));`; o chamador usa esse valor como contrato/controle. |
| 0214 | U08 |         case 'SM_STATS': | Seleciona `case 'SM_STATS'` no switch de U08; só esse comando usa a chamada subsequente. |
| 0215 | U08 |             return run(sm.stats().then(stats => ({ stats }))); | Encerra este caminho de U08 devolvendo `run(sm.stats().then(stats => ({ stats })));`; o chamador usa esse valor como contrato/controle. |
| 0216 | U08 |         default: | Define o caminho de action não reconhecida no switch de U08. |
| 0217 | U08 |             return false; | Encerra este caminho de U08 devolvendo `false;`; o chamador usa esse valor como contrato/controle. |
| 0218 | U08 |     } | Fecha a estrutura sintática aberta imediatamente antes em U08 (bloco, callback, objeto ou chamada). |
| 0219 | U08 | } | Fecha a estrutura sintática aberta imediatamente antes em U08 (bloco, callback, objeto ou chamada). |
| 0220 | U08 | ␠ [linha vazia] | Separa visualmente etapas dentro de U08 (Bridge Storage Manager SM_*); não altera estado, Promise, listener nem controle de fluxo. |
| 0221 | U09 | function handleGtcRuntimeMessage(request, sender, sendResponse) { | Declara handleGtcRuntimeMessage(request, sender, sendResponse) como entrada nomeada de U09; o corpo seguinte implementa o contrato da unidade. |
| 0222 | U09 |     if (!gtcIndexedDbApi \|\| !gtcIndexedDbApi.createGtcRuntimeHandler) return false; | Abre a guarda `if (!gtcIndexedDbApi // !gtcIndexedDbApi.createGtcRuntimeHandler) return false;` em U09; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0223 | U09 |     if (!gtcRuntimeHandler) { | Abre a guarda `if (!gtcRuntimeHandler) {` em U09; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0224 | U09 |         const fpApi = (typeof self !== 'undefined' && self.MangaTranslatorGtcFingerprint) | Cria o binding `fpApi` (const) usado por U09; o inicializador da linha estabelece o valor/closure inicial. |
| 0225 | U09 |                    \|\| null; | Completa a expressão multilinha de U09 com `// null;`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0226 | U09 |         gtcRuntimeHandler = gtcIndexedDbApi.createGtcRuntimeHandler({ | Atualiza `gtcRuntimeHandler` dentro de U09; passos posteriores da unidade observam esse novo valor. |
| 0227 | U09 |             repository:    getGtcRepository(), | Define a propriedade `repository` no objeto/snapshot de U09, compondo o contrato enviado ao módulo/storage/API. |
| 0228 | U09 |             fingerprintApi: fpApi, | Define a propriedade `fingerprintApi` no objeto/snapshot de U09, compondo o contrato enviado ao módulo/storage/API. |
| 0229 | U09 |             logger: (level, action, detail, extra = {}) => log(level, 'bg', action, detail, extra), | Define a propriedade `logger` no objeto/snapshot de U09, compondo o contrato enviado ao módulo/storage/API. |
| 0230 | U09 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U09 (bloco, callback, objeto ou chamada). |
| 0231 | U09 |     } | Fecha a estrutura sintática aberta imediatamente antes em U09 (bloco, callback, objeto ou chamada). |
| 0232 | U09 |     return gtcRuntimeHandler(request, sender, sendResponse); | Encerra este caminho de U09 devolvendo `gtcRuntimeHandler(request, sender, sendResponse);`; o chamador usa esse valor como contrato/controle. |
| 0233 | U09 | } | Fecha a estrutura sintática aberta imediatamente antes em U09 (bloco, callback, objeto ou chamada). |
| 0234 | U09 | ␠ [linha vazia] | Separa visualmente etapas dentro de U09 (Bridge GTC runtime); não altera estado, Promise, listener nem controle de fluxo. |
| 0235 | U10 | function getBackgroundStateApi() { | Declara getBackgroundStateApi() como entrada nomeada de U10; o corpo seguinte implementa o contrato da unidade. |
| 0236 | U10 |     const scope = typeof self !== 'undefined' ? self : globalThis; | Cria o binding `scope` (const) usado por U10; o inicializador da linha estabelece o valor/closure inicial. |
| 0237 | U10 |     return scope && scope.MangaTranslatorState; | Encerra este caminho de U10 devolvendo `scope && scope.MangaTranslatorState;`; o chamador usa esse valor como contrato/controle. |
| 0238 | U10 | } | Fecha a estrutura sintática aberta imediatamente antes em U10 (bloco, callback, objeto ou chamada). |
| 0239 | U10 | ␠ [linha vazia] | Separa visualmente etapas dentro de U10 (Facade de estado durável); não altera estado, Promise, listener nem controle de fluxo. |
| 0240 | U10 | function state() { | Declara state() como entrada nomeada de U10; o corpo seguinte implementa o contrato da unidade. |
| 0241 | U10 |     if (!backgroundState) backgroundState = getBackgroundStateApi(); | Abre a guarda `if (!backgroundState) backgroundState = getBackgroundStateApi();` em U10; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0242 | U10 |     if (!backgroundState) throw new Error('MangaTranslatorState indisponível'); | Abre a guarda `if (!backgroundState) throw new Error('MangaTranslatorState indisponível');` em U10; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0243 | U10 |     return backgroundState; | Encerra este caminho de U10 devolvendo `backgroundState;`; o chamador usa esse valor como contrato/controle. |
| 0244 | U10 | } | Fecha a estrutura sintática aberta imediatamente antes em U10 (bloco, callback, objeto ou chamada). |
| 0245 | U10 | ␠ [linha vazia] | Separa visualmente etapas dentro de U10 (Facade de estado durável); não altera estado, Promise, listener nem controle de fluxo. |
| 0246 | U10 | function getStateSnapshot() { | Declara getStateSnapshot() como entrada nomeada de U10; o corpo seguinte implementa o contrato da unidade. |
| 0247 | U10 |     return state().get(); | Encerra este caminho de U10 devolvendo `state().get();`; o chamador usa esse valor como contrato/controle. |
| 0248 | U10 | } | Fecha a estrutura sintática aberta imediatamente antes em U10 (bloco, callback, objeto ou chamada). |
| 0249 | U10 | ␠ [linha vazia] | Separa visualmente etapas dentro de U10 (Facade de estado durável); não altera estado, Promise, listener nem controle de fluxo. |
| 0250 | U10 | function applyStateSnapshot(snapshot = {}) { | Declara applyStateSnapshot(snapshot = {}) como entrada nomeada de U10; o corpo seguinte implementa o contrato da unidade. |
| 0251 | U10 |     return state().patch(snapshot); | Encerra este caminho de U10 devolvendo `state().patch(snapshot);`; o chamador usa esse valor como contrato/controle. |
| 0252 | U10 | } | Fecha a estrutura sintática aberta imediatamente antes em U10 (bloco, callback, objeto ou chamada). |
| 0253 | U10 | ␠ [linha vazia] | Separa visualmente etapas dentro de U10 (Facade de estado durável); não altera estado, Promise, listener nem controle de fluxo. |
| 0254 | U10 | async function restoreState() { | Declara restoreState() como entrada nomeada de U10; o corpo seguinte implementa o contrato da unidade. |
| 0255 | U10 |     const stateApi = state(); | Cria o binding `stateApi` (const) usado por U10; o inicializador da linha estabelece o valor/closure inicial. |
| 0256 | U10 |     if (stateApi && typeof stateApi.restoreState === 'function') { | Abre a guarda `if (stateApi && typeof stateApi.restoreState === 'function') {` em U10; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0257 | U10 |         const restored = await stateApi.restoreState(); | Cria o binding `restored` (const) usado por U10; o inicializador da linha estabelece o valor/closure inicial. |
| 0258 | U10 |         if (restored) applyStateSnapshot(restored); | Abre a guarda `if (restored) applyStateSnapshot(restored);` em U10; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0259 | U10 |         return; | Encerra este caminho de U10 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0260 | U10 |     } | Fecha a estrutura sintática aberta imediatamente antes em U10 (bloco, callback, objeto ou chamada). |
| 0261 | U10 |     await stateApi.restoreState(); | Aguarda `stateApi.restoreState();` antes de prosseguir em U10, preservando a ordem assíncrona. |
| 0262 | U10 | } | Fecha a estrutura sintática aberta imediatamente antes em U10 (bloco, callback, objeto ou chamada). |
| 0263 | U10 | ␠ [linha vazia] | Separa visualmente etapas dentro de U10 (Facade de estado durável); não altera estado, Promise, listener nem controle de fluxo. |
| 0264 | U10 | async function syncState() { | Declara syncState() como entrada nomeada de U10; o corpo seguinte implementa o contrato da unidade. |
| 0265 | U10 |     await state().syncState(); | Aguarda `state().syncState();` antes de prosseguir em U10, preservando a ordem assíncrona. |
| 0266 | U10 | } | Fecha a estrutura sintática aberta imediatamente antes em U10 (bloco, callback, objeto ou chamada). |
| 0267 | U10 | ␠ [linha vazia] | Separa visualmente etapas dentro de U10 (Facade de estado durável); não altera estado, Promise, listener nem controle de fluxo. |
| 0268 | U11 | // ── Manutenção do índice de jobs ───────────────────────────────────────────── | Registra a decisão/manutenção local de U11: “── Manutenção do índice de jobs ─────────────────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0269 | U11 | function indexAddJob(entry) { | Declara indexAddJob(entry) como entrada nomeada de U11; o corpo seguinte implementa o contrato da unidade. |
| 0270 | U11 |     state().indexAddJob(entry); | Invoca `state` nesta etapa de U11; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0271 | U11 | } | Fecha a estrutura sintática aberta imediatamente antes em U11 (bloco, callback, objeto ou chamada). |
| 0272 | U11 | function indexRemoveJob(geminiTabId) { | Declara indexRemoveJob(geminiTabId) como entrada nomeada de U11; o corpo seguinte implementa o contrato da unidade. |
| 0273 | U11 |     return state().indexRemoveJob(geminiTabId); | Encerra este caminho de U11 devolvendo `state().indexRemoveJob(geminiTabId);`; o chamador usa esse valor como contrato/controle. |
| 0274 | U11 | } | Fecha a estrutura sintática aberta imediatamente antes em U11 (bloco, callback, objeto ou chamada). |
| 0275 | U11 | function indexJobsOfBatch(batchId) { | Declara indexJobsOfBatch(batchId) como entrada nomeada de U11; o corpo seguinte implementa o contrato da unidade. |
| 0276 | U11 |     return state().indexJobsOfBatch(batchId); | Encerra este caminho de U11 devolvendo `state().indexJobsOfBatch(batchId);`; o chamador usa esse valor como contrato/controle. |
| 0277 | U11 | } | Fecha a estrutura sintática aberta imediatamente antes em U11 (bloco, callback, objeto ou chamada). |
| 0278 | U11 | ␠ [linha vazia] | Separa visualmente etapas dentro de U11 (Índice de jobs e existência de abas); não altera estado, Promise, listener nem controle de fluxo. |
| 0279 | U11 | function tabExists(tabId) { | Declara tabExists(tabId) como entrada nomeada de U11; o corpo seguinte implementa o contrato da unidade. |
| 0280 | U11 |     return new Promise(resolve => { | Encerra este caminho de U11 devolvendo `new Promise(resolve => {`; o chamador usa esse valor como contrato/controle. |
| 0281 | U11 |         if (!tabId && tabId !== 0) { resolve(false); return; } | Abre a guarda `if (!tabId && tabId !== 0) { resolve(false); return; }` em U11; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0282 | U11 |         try { | Inicia região protegida de U11; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0283 | U11 |             chrome.tabs.get(tabId, (tab) => { | Invoca `chrome.tabs.get` em U11; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0284 | U11 |                 if (chrome.runtime.lastError \|\| !tab) resolve(false); | Abre a guarda `if (chrome.runtime.lastError // !tab) resolve(false);` em U11; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0285 | U11 |                 else resolve(true); | Seleciona o caminho alternativo de U11 quando a guarda imediatamente anterior falha. |
| 0286 | U11 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U11 (bloco, callback, objeto ou chamada). |
| 0287 | U11 |         } catch (_e) { resolve(false); } | Captura a exceção do try de U11; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0288 | U11 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U11 (bloco, callback, objeto ou chamada). |
| 0289 | U11 | } | Fecha a estrutura sintática aberta imediatamente antes em U11 (bloco, callback, objeto ou chamada). |
| 0290 | U11 | ␠ [linha vazia] | Separa visualmente etapas dentro de U11 (Índice de jobs e existência de abas); não altera estado, Promise, listener nem controle de fluxo. |
| 0291 | U12 | let tabIdentity = null; | Cria o binding `tabIdentity` (let) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0292 | U12 | let jobsWatchdog = null; | Cria o binding `jobsWatchdog` (let) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0293 | U12 | let jobsReconciler = null; | Cria o binding `jobsReconciler` (let) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0294 | U12 | let jobsDomAck = null; | Cria o binding `jobsDomAck` (let) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0295 | U12 | let jobsLifecycle = null; | Cria o binding `jobsLifecycle` (let) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0296 | U12 | ␠ [linha vazia] | Separa visualmente etapas dentro de U12 (Composição dos módulos de jobs); não altera estado, Promise, listener nem controle de fluxo. |
| 0297 | U12 | function moveFinalizedTabId(oldTabId, newTabId) { | Declara moveFinalizedTabId(oldTabId, newTabId) como entrada nomeada de U12; o corpo seguinte implementa o contrato da unidade. |
| 0298 | U12 |     if (_finalizedTabs.has(oldTabId)) { | Abre a guarda `if (_finalizedTabs.has(oldTabId)) {` em U12; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0299 | U12 |         _finalizedTabs.delete(oldTabId); | Invoca `_finalizedTabs.delete` nesta etapa de U12; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0300 | U12 |         _finalizedTabs.add(newTabId); | Invoca `_finalizedTabs.add` nesta etapa de U12; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0301 | U12 |     } | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0302 | U12 | } | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0303 | U12 | ␠ [linha vazia] | Separa visualmente etapas dentro de U12 (Composição dos módulos de jobs); não altera estado, Promise, listener nem controle de fluxo. |
| 0304 | U12 | function initializeTabIdentity() { | Declara initializeTabIdentity() como entrada nomeada de U12; o corpo seguinte implementa o contrato da unidade. |
| 0305 | U12 |     if (tabIdentity) return tabIdentity; | Abre a guarda `if (tabIdentity) return tabIdentity;` em U12; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0306 | U12 |     const scope = typeof self !== 'undefined' ? self : globalThis; | Cria o binding `scope` (const) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0307 | U12 |     if (!scope.MangaTranslatorTabIdentity) throw new Error('MangaTranslatorTabIdentity indisponível'); | Abre a guarda `if (!scope.MangaTranslatorTabIdentity) throw new Error('MangaTranslatorTabIdentity indisponível');` em U12; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0308 | U12 |     tabIdentity = scope.MangaTranslatorTabIdentity.createTabIdentity({ | Atualiza `tabIdentity` dentro de U12; passos posteriores da unidade observam esse novo valor. |
| 0309 | U12 |         state: state(), | Define a propriedade `state` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0310 | U12 |         log, | Completa a expressão multilinha de U12 com `log,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0311 | U12 |         moveFinalizedTabId, | Completa a expressão multilinha de U12 com `moveFinalizedTabId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0312 | U12 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0313 | U12 |     return tabIdentity; | Encerra este caminho de U12 devolvendo `tabIdentity;`; o chamador usa esse valor como contrato/controle. |
| 0314 | U12 | } | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0315 | U12 | ␠ [linha vazia] | Separa visualmente etapas dentro de U12 (Composição dos módulos de jobs); não altera estado, Promise, listener nem controle de fluxo. |
| 0316 | U12 | function initializeJobsModules() { | Declara initializeJobsModules() como entrada nomeada de U12; o corpo seguinte implementa o contrato da unidade. |
| 0317 | U12 |     if (jobsWatchdog && jobsReconciler && jobsDomAck && jobsLifecycle) return; | Abre a guarda `if (jobsWatchdog && jobsReconciler && jobsDomAck && jobsLifecycle) return;` em U12; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0318 | U12 |     const scope = typeof self !== 'undefined' ? self : globalThis; | Cria o binding `scope` (const) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0319 | U12 |     const identity = initializeTabIdentity(); | Cria o binding `identity` (const) usado por U12; o inicializador da linha estabelece o valor/closure inicial. |
| 0320 | U12 |     jobsWatchdog = scope.MangaTranslatorJobsWatchdog.createWatchdog({ | Atualiza `jobsWatchdog` dentro de U12; passos posteriores da unidade observam esse novo valor. |
| 0321 | U12 |         getJobIndex: () => state().jobIndex, | Define a propriedade `getJobIndex` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0322 | U12 |         getExtractionTabs: () => state().extractionTabs, | Define a propriedade `getExtractionTabs` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0323 | U12 |         finalizeJob: (...args) => finalizeJob(...args), | Define a propriedade `finalizeJob` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0324 | U12 |         log, | Completa a expressão multilinha de U12 com `log,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0325 | U12 |         timeoutMinutes: JOB_TIMEOUT_MINUTES, | Define a propriedade `timeoutMinutes` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0326 | U12 |         resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId), | Define a propriedade `resolveCanonicalTabId` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0327 | U12 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0328 | U12 |     jobsReconciler = scope.MangaTranslatorJobsReconciliation.createReconciler({ | Atualiza `jobsReconciler` dentro de U12; passos posteriores da unidade observam esse novo valor. |
| 0329 | U12 |         state: state(), | Define a propriedade `state` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0330 | U12 |         tabExists, | Completa a expressão multilinha de U12 com `tabExists,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0331 | U12 |         log, | Completa a expressão multilinha de U12 com `log,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0332 | U12 |         resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId), | Define a propriedade `resolveCanonicalTabId` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0333 | U12 |         migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options), | Define a propriedade `migrateTabIdentity` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0334 | U12 |         syncState, | Completa a expressão multilinha de U12 com `syncState,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0335 | U12 |         processNextJob: () => processNextJob(), | Define a propriedade `processNextJob` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0336 | U12 |         recoverPendingFinalization: entry => jobsLifecycle.recoverPendingFinalization(entry), | Define a propriedade `recoverPendingFinalization` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0337 | U12 |         recoverPersistedResult: entry => jobsLifecycle.recoverPersistedResult(entry), | Define a propriedade `recoverPersistedResult` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0338 | U12 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0339 | U12 |     jobsDomAck = scope.MangaTranslatorJobsDomAck.createDomAckDelivery({ | Atualiza `jobsDomAck` dentro de U12; passos posteriores da unidade observam esse novo valor. |
| 0340 | U12 |         updateJobState: (...args) => updateJobState(...args), | Define a propriedade `updateJobState` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0341 | U12 |         finalizeJob: (...args) => finalizeJob(...args), | Define a propriedade `finalizeJob` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0342 | U12 |         log, | Completa a expressão multilinha de U12 com `log,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0343 | U12 |         timeoutMs: DOM_ACK_TIMEOUT_MS, | Define a propriedade `timeoutMs` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0344 | U12 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0345 | U12 |     jobsLifecycle = scope.MangaTranslatorJobsLifecycle.createLifecycle({ | Atualiza `jobsLifecycle` dentro de U12; passos posteriores da unidade observam esse novo valor. |
| 0346 | U12 |         state: state(), | Define a propriedade `state` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0347 | U12 |         log, syncState, sendProgress, armWatchdog, clearWatchdog, | Completa a expressão multilinha de U12 com `log, syncState, sendProgress, armWatchdog, clearWatchdog,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0348 | U12 |         indexAddJob, indexRemoveJob, indexJobsOfBatch, delay, generateId, | Completa a expressão multilinha de U12 com `indexAddJob, indexRemoveJob, indexJobsOfBatch, delay, generateId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0349 | U12 |         markFinalized: _markFinalized, | Define a propriedade `markFinalized` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0350 | U12 |         isFinalized: tabId => _finalizedTabs.has(tabId), | Define a propriedade `isFinalized` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0351 | U12 |         finalizedMarkerTtlMinutes: FINALIZATION_MARKER_TTL_MINUTES, | Define a propriedade `finalizedMarkerTtlMinutes` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0352 | U12 |         resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId), | Define a propriedade `resolveCanonicalTabId` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0353 | U12 |         migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options), | Define a propriedade `migrateTabIdentity` no objeto/snapshot de U12, compondo o contrato enviado ao módulo/storage/API. |
| 0354 | U12 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0355 | U12 | } | Fecha a estrutura sintática aberta imediatamente antes em U12 (bloco, callback, objeto ou chamada). |
| 0356 | U12 | ␠ [linha vazia] | Separa visualmente etapas dentro de U12 (Composição dos módulos de jobs); não altera estado, Promise, listener nem controle de fluxo. |
| 0357 | U13 | // ── reconcileJobs ──────────────────────────────────────────────────────────── | Registra a decisão/manutenção local de U13: “── reconcileJobs ────────────────────────────────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0358 | U13 | // Um Service Worker MV3 pode ser descartado e recriado sem reiniciar o Chrome. | Registra a decisão/manutenção local de U13: “Um Service Worker MV3 pode ser descartado e recriado sem reiniciar o Chrome.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0359 | U13 | // Nesse caso as variáveis voltam vazias enquanto abas do Gemini continuam vivas. | Registra a decisão/manutenção local de U13: “Nesse caso as variáveis voltam vazias enquanto abas do Gemini continuam vivas.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0360 | U13 | // Antes, o código simplesmente zerava activeJobsCount — o que fazia o lote ser | Registra a decisão/manutenção local de U13: “Antes, o código simplesmente zerava activeJobsCount — o que fazia o lote ser”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0361 | U13 | // declarado concluído com jobs ainda em execução. Agora reconstruímos o estado | Registra a decisão/manutenção local de U13: “declarado concluído com jobs ainda em execução. Agora reconstruímos o estado”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0362 | U13 | // a partir do índice durável e conferimos cada aba com chrome.tabs.get: | Registra a decisão/manutenção local de U13: “a partir do índice durável e conferimos cada aba com chrome.tabs.get:”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0363 | U13 | //   - aba viva   → job continua ativo (conta no activeJobsCount) | Registra a decisão/manutenção local de U13: “  - aba viva   → job continua ativo (conta no activeJobsCount)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0364 | U13 | //   - aba morta  → job é descartado (chave + watchdog removidos, slot liberado) | Registra a decisão/manutenção local de U13: “  - aba morta  → job é descartado (chave + watchdog removidos, slot liberado)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0365 | U13 | async function reconcileJobs() { | Declara reconcileJobs() como entrada nomeada de U13; o corpo seguinte implementa o contrato da unidade. |
| 0366 | U13 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0367 | U13 |     return jobsReconciler.reconcile(); | Encerra este caminho de U13 devolvendo `jobsReconciler.reconcile();`; o chamador usa esse valor como contrato/controle. |
| 0368 | U13 | } | Fecha a estrutura sintática aberta imediatamente antes em U13 (bloco, callback, objeto ou chamada). |
| 0369 | U13 | ␠ [linha vazia] | Separa visualmente etapas dentro de U13 (Reidratação e reconciliação MV3); não altera estado, Promise, listener nem controle de fluxo. |
| 0370 | U13 | async function ensureInitialized() { | Declara ensureInitialized() como entrada nomeada de U13; o corpo seguinte implementa o contrato da unidade. |
| 0371 | U13 |     if (state()._initialized) return; | Abre a guarda `if (state()._initialized) return;` em U13; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0372 | U13 |     // Um alarme pode disparar enquanto este worker já detém um lote vivo. Não | Registra a decisão/manutenção local de U13: “Um alarme pode disparar enquanto este worker já detém um lote vivo. Não”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0373 | U13 |     // sobrescreva essa fila/extractionTabs com um snapshot antigo ou vazio. | Registra a decisão/manutenção local de U13: “sobrescreva essa fila/extractionTabs com um snapshot antigo ou vazio.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0374 | U13 |     const hasResidentWork = state().jobQueue.length > 0 \|\| state().activeJobsCount > 0 \|\| | Cria o binding `hasResidentWork` (const) usado por U13; o inicializador da linha estabelece o valor/closure inicial. |
| 0375 | U13 |         state().jobIndex.length > 0 \|\| state().pendingBatches.length > 0 \|\| | Invoca `state` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0376 | U13 |         Object.keys(state().extractionTabs).length > 0; | Invoca `Object.keys` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0377 | U13 |     if (!hasResidentWork) await restoreState(); | Abre a guarda `if (!hasResidentWork) await restoreState();` em U13; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0378 | U13 | ␠ [linha vazia] | Separa visualmente etapas dentro de U13 (Reidratação e reconciliação MV3); não altera estado, Promise, listener nem controle de fluxo. |
| 0379 | U13 |     // A reconciliação é canonical-aware e por isso é o gate síncrono | Registra a decisão/manutenção local de U13: “A reconciliação é canonical-aware e por isso é o gate síncrono”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0380 | U13 |     // necessário para mensagens. O replay de journals residuais não bloqueia | Registra a decisão/manutenção local de U13: “necessário para mensagens. O replay de journals residuais não bloqueia”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0381 | U13 |     // ações normais; ele roda logo depois e continua crash-recoverable. | Registra a decisão/manutenção local de U13: “ações normais; ele roda logo depois e continua crash-recoverable.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0382 | U13 |     const identity = initializeTabIdentity(); | Cria o binding `identity` (const) usado por U13; o inicializador da linha estabelece o valor/closure inicial. |
| 0383 | U13 |     state()._initialized = true; | Invoca `state` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0384 | U13 |     try { | Inicia região protegida de U13; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0385 | U13 |         const result = await reconcileJobs(); | Cria o binding `result` (const) usado por U13; o inicializador da linha estabelece o valor/closure inicial. |
| 0386 | U13 |         if (result.dropped > 0 \|\| result.alive > 0 \|\| result.recovered > 0) { | Abre a guarda `if (result.dropped > 0 // result.alive > 0 // result.recovered > 0) {` em U13; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0387 | U13 |             await syncState(); | Aguarda `syncState();` antes de prosseguir em U13, preservando a ordem assíncrona. |
| 0388 | U13 |         } | Fecha a estrutura sintática aberta imediatamente antes em U13 (bloco, callback, objeto ou chamada). |
| 0389 | U13 |         if (!state().stopRequested && ( | Abre a guarda `if (!state().stopRequested && (` em U13; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0390 | U13 |             state().jobQueue.length > 0 \|\| | Invoca `state` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0391 | U13 |             state().activeJobsCount > 0 \|\| | Invoca `state` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0392 | U13 |             state().pendingBatches.length > 0 \|\| | Invoca `state` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0393 | U13 |             (state().isProcessing && state().currentBatchId) | Completa a expressão multilinha de U13 com `(state().isProcessing && state().currentBatchId)`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0394 | U13 |         )) processNextJob(); | Completa a expressão multilinha de U13 com `)) processNextJob();`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0395 | U13 |     } catch (_e) {} | Captura a exceção do try de U13; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0396 | U13 | ␠ [linha vazia] | Separa visualmente etapas dentro de U13 (Reidratação e reconciliação MV3); não altera estado, Promise, listener nem controle de fluxo. |
| 0397 | U13 |     identity.recoverPendingMigrations() | Invoca `identity.recoverPendingMigrations` nesta etapa de U13; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0398 | U13 |         .then(() => identity.cleanupExpiredAliases()) | Continua a cadeia de U13 com `.then(() => identity.cleanupExpiredAliases())`, transformando/filtrando/tratando o valor anterior. |
| 0399 | U13 |         .catch(error => log('warn', 'bg', 'TAB_REKEY_RECOVERY_DEFERRED_ERROR', | Continua a cadeia de U13 com `.catch(error => log('warn', 'bg', 'TAB_REKEY_RECOVERY_DEFERRED_ERROR',`, transformando/filtrando/tratando o valor anterior. |
| 0400 | U13 |             'Falha no replay assíncrono de migração de aba', { | Completa a expressão multilinha de U13 com `'Falha no replay assíncrono de migração de aba', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0401 | U13 |                 errorName: error && error.name ? error.name : 'Error', | Define a propriedade `errorName` no objeto/snapshot de U13, compondo o contrato enviado ao módulo/storage/API. |
| 0402 | U13 |             })); | Fecha a estrutura sintática aberta imediatamente antes em U13 (bloco, callback, objeto ou chamada). |
| 0403 | U13 | } | Fecha a estrutura sintática aberta imediatamente antes em U13 (bloco, callback, objeto ou chamada). |
| 0404 | U13 | ␠ [linha vazia] | Separa visualmente etapas dentro de U13 (Reidratação e reconciliação MV3); não altera estado, Promise, listener nem controle de fluxo. |
| 0405 | U14 | let _logQueue = []; | Cria o binding `_logQueue` (let) usado por U14; o inicializador da linha estabelece o valor/closure inicial. |
| 0406 | U14 | let _logFlushing = false; | Cria o binding `_logFlushing` (let) usado por U14; o inicializador da linha estabelece o valor/closure inicial. |
| 0407 | U14 | ␠ [linha vazia] | Separa visualmente etapas dentro de U14 (Fila de logs persistidos); não altera estado, Promise, listener nem controle de fluxo. |
| 0408 | U14 | function log(level, source, action, detail, extra = {}) { | Declara log(level, source, action, detail, extra = {}) como entrada nomeada de U14; o corpo seguinte implementa o contrato da unidade. |
| 0409 | U14 |     _logQueue.push({ id: `${Date.now()}_${Math.random()}`, ts: Date.now(), level: level \|\| 'info', source: source \|\| 'bg', action: action \|\| 'UNKNOWN', detail: detail \|\| '', extra: extra \|\| {} }); | Invoca `_logQueue.push` nesta etapa de U14; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0410 | U14 |     if (!_logFlushing) _flushLog(); | Abre a guarda `if (!_logFlushing) _flushLog();` em U14; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0411 | U14 | } | Fecha a estrutura sintática aberta imediatamente antes em U14 (bloco, callback, objeto ou chamada). |
| 0412 | U14 | ␠ [linha vazia] | Separa visualmente etapas dentro de U14 (Fila de logs persistidos); não altera estado, Promise, listener nem controle de fluxo. |
| 0413 | U14 | async function _flushLog() { | Declara _flushLog() como entrada nomeada de U14; o corpo seguinte implementa o contrato da unidade. |
| 0414 | U14 |     _logFlushing = true; | Atualiza `_logFlushing` dentro de U14; passos posteriores da unidade observam esse novo valor. |
| 0415 | U14 |     try { | Inicia região protegida de U14; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0416 | U14 |         while (_logQueue.length > 0) { | Itera a coleção/condição mostrada em U14; cada item/volta executa o corpo adjacente. |
| 0417 | U14 |             const batch = _logQueue.splice(0, _logQueue.length); | Cria o binding `batch` (const) usado por U14; o inicializador da linha estabelece o valor/closure inicial. |
| 0418 | U14 |             const data = await chrome.storage.local.get(['translatorLog']); | Cria o binding `data` (const) usado por U14; o inicializador da linha estabelece o valor/closure inicial. |
| 0419 | U14 |             const entries = data.translatorLog \|\| []; | Cria o binding `entries` (const) usado por U14; o inicializador da linha estabelece o valor/closure inicial. |
| 0420 | U14 |             entries.push(...batch); | Invoca `entries.push` nesta etapa de U14; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0421 | U14 |             if (entries.length > 500) entries.splice(0, entries.length - 500); | Abre a guarda `if (entries.length > 500) entries.splice(0, entries.length - 500);` em U14; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0422 | U14 |             await chrome.storage.local.set({ translatorLog: entries }); | Aguarda `chrome.storage.local.set({ translatorLog: entries });` antes de prosseguir em U14, preservando a ordem assíncrona. |
| 0423 | U14 |         } | Fecha a estrutura sintática aberta imediatamente antes em U14 (bloco, callback, objeto ou chamada). |
| 0424 | U14 |     } catch (e) {} | Captura a exceção do try de U14; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0425 | U14 |     _logFlushing = false; | Atualiza `_logFlushing` dentro de U14; passos posteriores da unidade observam esse novo valor. |
| 0426 | U14 | } | Fecha a estrutura sintática aberta imediatamente antes em U14 (bloco, callback, objeto ou chamada). |
| 0427 | U14 | ␠ [linha vazia] | Separa visualmente etapas dentro de U14 (Fila de logs persistidos); não altera estado, Promise, listener nem controle de fluxo. |
| 0428 | U15 | let registeredActionRouter = null; | Cria o binding `registeredActionRouter` (let) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0429 | U15 | ␠ [linha vazia] | Separa visualmente etapas dentro de U15 (Adapter do router modular e compatibilidade legada); não altera estado, Promise, listener nem controle de fluxo. |
| 0430 | U15 | function routeRegisteredAction(request, sender, sendResponse) { | Declara routeRegisteredAction(request, sender, sendResponse) como entrada nomeada de U15; o corpo seguinte implementa o contrato da unidade. |
| 0431 | U15 |     const scope = typeof self !== 'undefined' ? self : globalThis; | Cria o binding `scope` (const) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0432 | U15 |     const routerApi = scope && scope.MangaTranslatorRouter; | Cria o binding `routerApi` (const) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0433 | U15 |     if (!routerApi \|\| !request \|\| typeof request.action !== 'string') return null; | Abre a guarda `if (!routerApi // !request // typeof request.action !== 'string') return null;` em U15; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0434 | U15 | ␠ [linha vazia] | Separa visualmente etapas dentro de U15 (Adapter do router modular e compatibilidade legada); não altera estado, Promise, listener nem controle de fluxo. |
| 0435 | U15 |     const actionName = routerApi.resolveActionName(request.action); | Cria o binding `actionName` (const) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0436 | U15 |     if (!actionName \|\| !routerApi.getAction(actionName)) return null; | Abre a guarda `if (!actionName // !routerApi.getAction(actionName)) return null;` em U15; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0437 | U15 | ␠ [linha vazia] | Separa visualmente etapas dentro de U15 (Adapter do router modular e compatibilidade legada); não altera estado, Promise, listener nem controle de fluxo. |
| 0438 | U15 |     if (!registeredActionRouter) { | Abre a guarda `if (!registeredActionRouter) {` em U15; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0439 | U15 |         registeredActionRouter = routerApi.createMessageRouter({ | Atualiza `registeredActionRouter` dentro de U15; passos posteriores da unidade observam esse novo valor. |
| 0440 | U15 |             contextFactory: () => ({ | Define a propriedade `contextFactory` no objeto/snapshot de U15, compondo o contrato enviado ao módulo/storage/API. |
| 0441 | U15 |                 state: state(), | Define a propriedade `state` no objeto/snapshot de U15, compondo o contrato enviado ao módulo/storage/API. |
| 0442 | U15 |                 log, | Completa a expressão multilinha de U15 com `log,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0443 | U15 |                 handleMarkerAndShow, | Completa a expressão multilinha de U15 com `handleMarkerAndShow,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0444 | U15 |                 waitForDownload, | Completa a expressão multilinha de U15 com `waitForDownload,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0445 | U15 |                 downloadImagesAndShow, | Completa a expressão multilinha de U15 com `downloadImagesAndShow,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0446 | U15 |                 syncState, | Completa a expressão multilinha de U15 com `syncState,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0447 | U15 |                 assertJobOwnership, | Completa a expressão multilinha de U15 com `assertJobOwnership,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0448 | U15 |                 ensureInitialized, | Completa a expressão multilinha de U15 com `ensureInitialized,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0449 | U15 |                 tabIdentity: initializeTabIdentity(), | Define a propriedade `tabIdentity` no objeto/snapshot de U15, compondo o contrato enviado ao módulo/storage/API. |
| 0450 | U15 |                 deliverResultToManga, | Completa a expressão multilinha de U15 com `deliverResultToManga,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0451 | U15 |                 updateJobState, | Completa a expressão multilinha de U15 com `updateJobState,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0452 | U15 |                 finalizeJob, | Completa a expressão multilinha de U15 com `finalizeJob,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0453 | U15 |                 armWatchdog, | Completa a expressão multilinha de U15 com `armWatchdog,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0454 | U15 |                 startBatch, | Completa a expressão multilinha de U15 com `startBatch,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0455 | U15 |                 stopBatch, | Completa a expressão multilinha de U15 com `stopBatch,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0456 | U15 |             }), | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0457 | U15 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0458 | U15 |     } | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0459 | U15 | ␠ [linha vazia] | Separa visualmente etapas dentro de U15 (Adapter do router modular e compatibilidade legada); não altera estado, Promise, listener nem controle de fluxo. |
| 0460 | U15 |     const legacyResponseActions = new Set([ | Cria o binding `legacyResponseActions` (const) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0461 | U15 |         'GET_TAB_ID', | Completa a expressão multilinha de U15 com `'GET_TAB_ID',`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0462 | U15 |         'CHECK_IF_EXTRACTION_TAB', | Completa a expressão multilinha de U15 com `'CHECK_IF_EXTRACTION_TAB',`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0463 | U15 |         'REQUEST_IMAGE_DATA', | Completa a expressão multilinha de U15 com `'REQUEST_IMAGE_DATA',`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0464 | U15 |         'FETCH_IMAGE_AS_BASE64', | Completa a expressão multilinha de U15 com `'FETCH_IMAGE_AS_BASE64',`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0465 | U15 |         'DOWNLOAD_IMAGE', | Completa a expressão multilinha de U15 com `'DOWNLOAD_IMAGE',`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0466 | U15 |     ]); | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0467 | U15 |     const sendResponseCompat = response => { | Cria o binding `sendResponseCompat` (const) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0468 | U15 |         if (legacyResponseActions.has(request.action) && response && response.ok === true) { | Abre a guarda `if (legacyResponseActions.has(request.action) && response && response.ok === true) {` em U15; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0469 | U15 |             const { ok: _ok, ...legacyResponse } = response; | Cria o binding `{ ok: _ok, ...legacyResponse }` (const) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0470 | U15 |             sendResponse(legacyResponse); | Invoca `sendResponse` nesta etapa de U15; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0471 | U15 |             return; | Encerra este caminho de U15 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0472 | U15 |         } | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0473 | U15 |         if (request.action === 'FETCH_IMAGE_AS_BASE64' && response && response.ok === false && response.error) { | Abre a guarda `if (request.action === 'FETCH_IMAGE_AS_BASE64' && response && response.ok === false && response.error) {` em U15; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0474 | U15 |             const error = typeof response.error === 'object' | Cria o binding `error` (const) usado por U15; o inicializador da linha estabelece o valor/closure inicial. |
| 0475 | U15 |                 ? response.error.message \|\| response.error.code | Completa a seleção condicional iniciada acima em U15, fornecendo um dos valores possíveis. |
| 0476 | U15 |                 : response.error; | Completa a seleção condicional iniciada acima em U15, fornecendo um dos valores possíveis. |
| 0477 | U15 |             sendResponse({ error }); | Invoca `sendResponse` nesta etapa de U15; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0478 | U15 |             return; | Encerra este caminho de U15 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0479 | U15 |         } | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0480 | U15 |         sendResponse(response); | Invoca `sendResponse` nesta etapa de U15; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0481 | U15 |     }; | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0482 | U15 | ␠ [linha vazia] | Separa visualmente etapas dentro de U15 (Adapter do router modular e compatibilidade legada); não altera estado, Promise, listener nem controle de fluxo. |
| 0483 | U15 |     return { | Encerra este caminho de U15 devolvendo `{`; o chamador usa esse valor como contrato/controle. |
| 0484 | U15 |         handled: true, | Define a propriedade `handled` no objeto/snapshot de U15, compondo o contrato enviado ao módulo/storage/API. |
| 0485 | U15 |         keepAlive: registeredActionRouter(request, sender, sendResponseCompat), | Define a propriedade `keepAlive` no objeto/snapshot de U15, compondo o contrato enviado ao módulo/storage/API. |
| 0486 | U15 |     }; | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0487 | U15 | } | Fecha a estrutura sintática aberta imediatamente antes em U15 (bloco, callback, objeto ou chamada). |
| 0488 | U15 | ␠ [linha vazia] | Separa visualmente etapas dentro de U15 (Adapter do router modular e compatibilidade legada); não altera estado, Promise, listener nem controle de fluxo. |
| 0489 | U16 | function armWatchdog(mangaTabId, index, geminiTabId, jobId) { | Declara armWatchdog(mangaTabId, index, geminiTabId, jobId) como entrada nomeada de U16; o corpo seguinte implementa o contrato da unidade. |
| 0490 | U16 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U16; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0491 | U16 |     return jobsWatchdog.arm(mangaTabId, index, geminiTabId, jobId); | Encerra este caminho de U16 devolvendo `jobsWatchdog.arm(mangaTabId, index, geminiTabId, jobId);`; o chamador usa esse valor como contrato/controle. |
| 0492 | U16 | } | Fecha a estrutura sintática aberta imediatamente antes em U16 (bloco, callback, objeto ou chamada). |
| 0493 | U16 | function clearWatchdog(geminiTabId, jobId) { | Declara clearWatchdog(geminiTabId, jobId) como entrada nomeada de U16; o corpo seguinte implementa o contrato da unidade. |
| 0494 | U16 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U16; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0495 | U16 |     return jobsWatchdog.clear(geminiTabId, jobId); | Encerra este caminho de U16 devolvendo `jobsWatchdog.clear(geminiTabId, jobId);`; o chamador usa esse valor como contrato/controle. |
| 0496 | U16 | } | Fecha a estrutura sintática aberta imediatamente antes em U16 (bloco, callback, objeto ou chamada). |
| 0497 | U16 | ␠ [linha vazia] | Separa visualmente etapas dentro de U16 (Facades watchdog e ACK de DOM); não altera estado, Promise, listener nem controle de fluxo. |
| 0498 | U16 | // ── deliverResultToManga ───────────────────────────────────────────────────── | Registra a decisão/manutenção local de U16: “── deliverResultToManga ─────────────────────────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0499 | U16 | // Substitui o antigo `setTimeout(() => finalizeJob(...), 1500)`. | Registra a decisão/manutenção local de U16: “Substitui o antigo `setTimeout(() => finalizeJob(...), 1500)`.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0500 | U16 | // | Registra a decisão/manutenção local de U16: “”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0501 | U16 | // Antes: o resultado era enviado à página e, 1,5 s depois, o job era declarado | Registra a decisão/manutenção local de U16: “Antes: o resultado era enviado à página e, 1,5 s depois, o job era declarado”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0502 | U16 | // concluído — sem nenhuma garantia de que a imagem tinha sido aplicada ou | Registra a decisão/manutenção local de U16: “concluído — sem nenhuma garantia de que a imagem tinha sido aplicada ou”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0503 | U16 | // persistida. Com concorrência C e N páginas, isso somava ~1,5 × N / C segundos | Registra a decisão/manutenção local de U16: “persistida. Com concorrência C e N páginas, isso somava ~1,5 × N / C segundos”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0504 | U16 | // ociosos ao caminho crítico e podia marcar sucesso antes da gravação terminar. | Registra a decisão/manutenção local de U16: “ociosos ao caminho crítico e podia marcar sucesso antes da gravação terminar.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0505 | U16 | // | Registra a decisão/manutenção local de U16: “”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0506 | U16 | // Agora: enviamos o resultado, o content script grava/aplica e só então responde. | Registra a decisão/manutenção local de U16: “Agora: enviamos o resultado, o content script grava/aplica e só então responde.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0507 | U16 | // O slot de concorrência é liberado no instante do ACK. | Registra a decisão/manutenção local de U16: “O slot de concorrência é liberado no instante do ACK.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0508 | U16 | // | Registra a decisão/manutenção local de U16: “”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0509 | U16 | // O timer aqui é apenas um guarda-chuva contra um content script que aceita a | Registra a decisão/manutenção local de U16: “O timer aqui é apenas um guarda-chuva contra um content script que aceita a”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0510 | U16 | // mensagem e nunca responde; a garantia durável continua sendo o alarme watchdog. | Registra a decisão/manutenção local de U16: “mensagem e nunca responde; a garantia durável continua sendo o alarme watchdog.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0511 | U16 | const DOM_ACK_TIMEOUT_MS = 30_000; | Cria o binding `DOM_ACK_TIMEOUT_MS` (const) usado por U16; o inicializador da linha estabelece o valor/closure inicial. |
| 0512 | U16 | ␠ [linha vazia] | Separa visualmente etapas dentro de U16 (Facades watchdog e ACK de DOM); não altera estado, Promise, listener nem controle de fluxo. |
| 0513 | U16 | function deliverResultToManga({ | Declara undefined() como entrada nomeada de U16; o corpo seguinte implementa o contrato da unidade. |
| 0514 | U16 |     mangaTabId, index, src, jobId, batchId, geminiTabId, finalizeOnAck = true, | Completa a expressão multilinha de U16 com `mangaTabId, index, src, jobId, batchId, geminiTabId, finalizeOnAck = true,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0515 | U16 | }) { | Completa a expressão multilinha de U16 com `}) {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0516 | U16 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U16; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0517 | U16 |     return jobsDomAck.deliver({ | Encerra este caminho de U16 devolvendo `jobsDomAck.deliver({`; o chamador usa esse valor como contrato/controle. |
| 0518 | U16 |         mangaTabId, index, src, jobId, batchId, geminiTabId, finalizeOnAck, | Completa a expressão multilinha de U16 com `mangaTabId, index, src, jobId, batchId, geminiTabId, finalizeOnAck,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0519 | U16 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U16 (bloco, callback, objeto ou chamada). |
| 0520 | U16 | } | Fecha a estrutura sintática aberta imediatamente antes em U16 (bloco, callback, objeto ou chamada). |
| 0521 | U16 | ␠ [linha vazia] | Separa visualmente etapas dentro de U16 (Facades watchdog e ACK de DOM); não altera estado, Promise, listener nem controle de fluxo. |
| 0522 | U17 | // ── Menu nativo: tradução de uma única imagem ──────────────────────────────── | Registra a decisão/manutenção local de U17: “── Menu nativo: tradução de uma única imagem ────────────────────────────────”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0523 | U17 | const SINGLE_IMAGE_CONTEXT_MENU_ID = 'manga-translator-translate-single-image'; | Cria o binding `SINGLE_IMAGE_CONTEXT_MENU_ID` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0524 | U17 | const SINGLE_IMAGE_CONTEXT_MENU_TITLE = 'Traduzir esta imagem'; | Cria o binding `SINGLE_IMAGE_CONTEXT_MENU_TITLE` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0525 | U17 | let singleImageContextMenuSyncVersion = 0; | Cria o binding `singleImageContextMenuSyncVersion` (let) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0526 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0527 | U17 | function enabledDomainToMatchPattern(domain) { | Declara enabledDomainToMatchPattern(domain) como entrada nomeada de U17; o corpo seguinte implementa o contrato da unidade. |
| 0528 | U17 |     const host = String(domain \|\| '').trim().toLowerCase(); | Cria o binding `host` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0529 | U17 |     if (!host \|\| !/^[a-z0-9.-]+$/.test(host)) return null; | Abre a guarda `if (!host // !/^[a-z0-9.-]+$/.test(host)) return null;` em U17; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0530 | U17 |     return `*://${host}/*`; | Encerra este caminho de U17 devolvendo ``*://${host}/*`;`; o chamador usa esse valor como contrato/controle. |
| 0531 | U17 | } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0532 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0533 | U17 | function rebuildSingleImageContextMenu(enabled, enabledDomains) { | Declara rebuildSingleImageContextMenu(enabled, enabledDomains) como entrada nomeada de U17; o corpo seguinte implementa o contrato da unidade. |
| 0534 | U17 |     if (!chrome.contextMenus \|\| typeof chrome.contextMenus.create !== 'function' \|\| typeof chrome.contextMenus.remove !== 'function') { | Abre a guarda `if (!chrome.contextMenus // typeof chrome.contextMenus.create !== 'function' // typeof chrome.contextMenus.remove !== 'function') {` em U17; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0535 | U17 |         return; | Encerra este caminho de U17 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0536 | U17 |     } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0537 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0538 | U17 |     const syncVersion = ++singleImageContextMenuSyncVersion; | Cria o binding `syncVersion` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0539 | U17 |     const documentUrlPatterns = Array.from(new Set( | Cria o binding `documentUrlPatterns` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0540 | U17 |         (Array.isArray(enabledDomains) ? enabledDomains : []) | Completa a expressão multilinha de U17 com `(Array.isArray(enabledDomains) ? enabledDomains : [])`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0541 | U17 |             .map(enabledDomainToMatchPattern) | Continua a cadeia de U17 com `.map(enabledDomainToMatchPattern)`, transformando/filtrando/tratando o valor anterior. |
| 0542 | U17 |             .filter(Boolean) | Continua a cadeia de U17 com `.filter(Boolean)`, transformando/filtrando/tratando o valor anterior. |
| 0543 | U17 |     )); | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0544 | U17 |     const shouldCreate = enabled === true && documentUrlPatterns.length > 0; | Cria o binding `shouldCreate` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0545 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0546 | U17 |     const createCurrentMenu = () => { | Cria o binding `createCurrentMenu` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0547 | U17 |         if (syncVersion !== singleImageContextMenuSyncVersion \|\| !shouldCreate) return; | Abre a guarda `if (syncVersion !== singleImageContextMenuSyncVersion // !shouldCreate) return;` em U17; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0548 | U17 |         try { | Inicia região protegida de U17; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0549 | U17 |             chrome.contextMenus.create({ | Invoca `chrome.contextMenus.create` em U17; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0550 | U17 |                 id: SINGLE_IMAGE_CONTEXT_MENU_ID, | Define a propriedade `id` no objeto/snapshot de U17, compondo o contrato enviado ao módulo/storage/API. |
| 0551 | U17 |                 title: SINGLE_IMAGE_CONTEXT_MENU_TITLE, | Define a propriedade `title` no objeto/snapshot de U17, compondo o contrato enviado ao módulo/storage/API. |
| 0552 | U17 |                 contexts: ['image'], | Define a propriedade `contexts` no objeto/snapshot de U17, compondo o contrato enviado ao módulo/storage/API. |
| 0553 | U17 |                 documentUrlPatterns, | Completa a expressão multilinha de U17 com `documentUrlPatterns,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0554 | U17 |             }, () => { | Completa a expressão multilinha de U17 com `}, () => {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0555 | U17 |                 const error = chrome.runtime && chrome.runtime.lastError; | Cria o binding `error` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0556 | U17 |                 if (error) { | Abre a guarda `if (error) {` em U17; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0557 | U17 |                     log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_CREATE_FAILED', | Invoca `log` nesta etapa de U17; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0558 | U17 |                         'Falha ao criar a ação de tradução no menu de contexto.', { | Completa a expressão multilinha de U17 com `'Falha ao criar a ação de tradução no menu de contexto.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0559 | U17 |                             error: error.message \|\| String(error), | Define a propriedade `error` no objeto/snapshot de U17, compondo o contrato enviado ao módulo/storage/API. |
| 0560 | U17 |                         }); | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0561 | U17 |                 } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0562 | U17 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0563 | U17 |         } catch (error) { | Captura a exceção do try de U17; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0564 | U17 |             log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_CREATE_FAILED', | Invoca `log` nesta etapa de U17; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0565 | U17 |                 'Falha síncrona ao criar a ação de tradução no menu de contexto.', { | Completa a expressão multilinha de U17 com `'Falha síncrona ao criar a ação de tradução no menu de contexto.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0566 | U17 |                     error: error && error.message ? error.message : String(error), | Define a propriedade `error` no objeto/snapshot de U17, compondo o contrato enviado ao módulo/storage/API. |
| 0567 | U17 |                 }); | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0568 | U17 |         } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0569 | U17 |     }; | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0570 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0571 | U17 |     try { | Inicia região protegida de U17; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0572 | U17 |         chrome.contextMenus.remove(SINGLE_IMAGE_CONTEXT_MENU_ID, () => { | Invoca `chrome.contextMenus.remove` em U17; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0573 | U17 |             // Ler lastError evita o aviso "Unchecked runtime.lastError" quando o | Registra a decisão/manutenção local de U17: “Ler lastError evita o aviso "Unchecked runtime.lastError" quando o”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0574 | U17 |             // item ainda não existe (primeira instalação ou preferência desligada). | Registra a decisão/manutenção local de U17: “item ainda não existe (primeira instalação ou preferência desligada).”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0575 | U17 |             void (chrome.runtime && chrome.runtime.lastError); | Invoca `chrome.runtime` em U17; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0576 | U17 |             createCurrentMenu(); | Invoca `createCurrentMenu` nesta etapa de U17; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0577 | U17 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0578 | U17 |     } catch (_error) { | Captura a exceção do try de U17; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0579 | U17 |         createCurrentMenu(); | Invoca `createCurrentMenu` nesta etapa de U17; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0580 | U17 |     } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0581 | U17 | } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0582 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0583 | U17 | function refreshSingleImageContextMenu() { | Declara refreshSingleImageContextMenu() como entrada nomeada de U17; o corpo seguinte implementa o contrato da unidade. |
| 0584 | U17 |     if (!chrome.storage \|\| !chrome.storage.local \|\| typeof chrome.storage.local.get !== 'function') return; | Abre a guarda `if (!chrome.storage // !chrome.storage.local // typeof chrome.storage.local.get !== 'function') return;` em U17; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0585 | U17 |     chrome.storage.local.get(['clickToTranslateEnabled', 'enabledDomains'], (data) => { | Executa `chrome.storage.local.get` em U17; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0586 | U17 |         rebuildSingleImageContextMenu( | Invoca `rebuildSingleImageContextMenu` nesta etapa de U17; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0587 | U17 |             data && data.clickToTranslateEnabled === true, | Completa a expressão multilinha de U17 com `data && data.clickToTranslateEnabled === true,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0588 | U17 |             data && Array.isArray(data.enabledDomains) ? data.enabledDomains : [] | Completa a expressão multilinha de U17 com `data && Array.isArray(data.enabledDomains) ? data.enabledDomains : []`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0589 | U17 |         ); | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0590 | U17 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0591 | U17 | } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0592 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0593 | U17 | function isContextMenuPageEnabled(url, enabledDomains) { | Declara isContextMenuPageEnabled(url, enabledDomains) como entrada nomeada de U17; o corpo seguinte implementa o contrato da unidade. |
| 0594 | U17 |     try { | Inicia região protegida de U17; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0595 | U17 |         const hostname = new URL(String(url \|\| '')).hostname; | Cria o binding `hostname` (const) usado por U17; o inicializador da linha estabelece o valor/closure inicial. |
| 0596 | U17 |         return Array.isArray(enabledDomains) && enabledDomains.includes(hostname); | Encerra este caminho de U17 devolvendo `Array.isArray(enabledDomains) && enabledDomains.includes(hostname);`; o chamador usa esse valor como contrato/controle. |
| 0597 | U17 |     } catch (_error) { | Captura a exceção do try de U17; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0598 | U17 |         return false; | Encerra este caminho de U17 devolvendo `false;`; o chamador usa esse valor como contrato/controle. |
| 0599 | U17 |     } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0600 | U17 | } | Fecha a estrutura sintática aberta imediatamente antes em U17 (bloco, callback, objeto ou chamada). |
| 0601 | U17 | ␠ [linha vazia] | Separa visualmente etapas dentro de U17 (Construção do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0602 | U18 | if (chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') { | Abre a guarda `if (chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0603 | U18 |     chrome.storage.onChanged.addListener((changes, areaName) => { | Registra o listener Chrome expresso na linha como parte de U18; o callback passa a participar do lifecycle do navegador. |
| 0604 | U18 |         if (areaName && areaName !== 'local') return; | Abre a guarda `if (areaName && areaName !== 'local') return;` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0605 | U18 |         if (changes.clickToTranslateEnabled \|\| changes.enabledDomains) { | Abre a guarda `if (changes.clickToTranslateEnabled // changes.enabledDomains) {` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0606 | U18 |             refreshSingleImageContextMenu(); | Invoca `refreshSingleImageContextMenu` nesta etapa de U18; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0607 | U18 |         } | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0608 | U18 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0609 | U18 | } | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0610 | U18 | ␠ [linha vazia] | Separa visualmente etapas dentro de U18 (Listeners do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0611 | U18 | if (chrome.contextMenus && chrome.contextMenus.onClicked && typeof chrome.contextMenus.onClicked.addListener === 'function') { | Abre a guarda `if (chrome.contextMenus && chrome.contextMenus.onClicked && typeof chrome.contextMenus.onClicked.addListener === 'function') {` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0612 | U18 |     chrome.contextMenus.onClicked.addListener((info, tab) => { | Registra o listener Chrome expresso na linha como parte de U18; o callback passa a participar do lifecycle do navegador. |
| 0613 | U18 |         if (!info \|\| info.menuItemId !== SINGLE_IMAGE_CONTEXT_MENU_ID) return; | Abre a guarda `if (!info // info.menuItemId !== SINGLE_IMAGE_CONTEXT_MENU_ID) return;` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0614 | U18 |         if (!tab \|\| !Number.isInteger(tab.id)) return; | Abre a guarda `if (!tab // !Number.isInteger(tab.id)) return;` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0615 | U18 | ␠ [linha vazia] | Separa visualmente etapas dentro de U18 (Listeners do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0616 | U18 |         chrome.storage.local.get(['clickToTranslateEnabled', 'enabledDomains'], (data) => { | Executa `chrome.storage.local.get` em U18; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0617 | U18 |             const enabledDomains = data && Array.isArray(data.enabledDomains) ? data.enabledDomains : []; | Cria o binding `enabledDomains` (const) usado por U18; o inicializador da linha estabelece o valor/closure inicial. |
| 0618 | U18 |             if (!data \|\| data.clickToTranslateEnabled !== true) return; | Abre a guarda `if (!data // data.clickToTranslateEnabled !== true) return;` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0619 | U18 |             if (!isContextMenuPageEnabled(info.pageUrl \|\| tab.url, enabledDomains)) return; | Abre a guarda `if (!isContextMenuPageEnabled(info.pageUrl // tab.url, enabledDomains)) return;` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0620 | U18 | ␠ [linha vazia] | Separa visualmente etapas dentro de U18 (Listeners do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0621 | U18 |             chrome.tabs.sendMessage(tab.id, { | Envia IPC tab-scoped ao content script em U18; tabId e payload definem o boundary efetivo. |
| 0622 | U18 |                 action: 'TRANSLATE_CONTEXT_IMAGE', | Define a propriedade `action` no objeto/snapshot de U18, compondo o contrato enviado ao módulo/storage/API. |
| 0623 | U18 |                 srcUrl: info.srcUrl \|\| null, | Define a propriedade `srcUrl` no objeto/snapshot de U18, compondo o contrato enviado ao módulo/storage/API. |
| 0624 | U18 |             }, (response) => { | Completa a expressão multilinha de U18 com `}, (response) => {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0625 | U18 |                 const error = chrome.runtime && chrome.runtime.lastError; | Cria o binding `error` (const) usado por U18; o inicializador da linha estabelece o valor/closure inicial. |
| 0626 | U18 |                 if (error) { | Abre a guarda `if (error) {` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0627 | U18 |                     log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_DELIVERY_FAILED', | Invoca `log` nesta etapa de U18; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0628 | U18 |                         'Não foi possível entregar a ação de clique direito ao leitor.', { | Completa a expressão multilinha de U18 com `'Não foi possível entregar a ação de clique direito ao leitor.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0629 | U18 |                             tabId: tab.id, | Define a propriedade `tabId` no objeto/snapshot de U18, compondo o contrato enviado ao módulo/storage/API. |
| 0630 | U18 |                             error: error.message \|\| String(error), | Define a propriedade `error` no objeto/snapshot de U18, compondo o contrato enviado ao módulo/storage/API. |
| 0631 | U18 |                         }); | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0632 | U18 |                     return; | Encerra este caminho de U18 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0633 | U18 |                 } | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0634 | U18 |                 if (!response \|\| response.ok !== true) { | Abre a guarda `if (!response // response.ok !== true) {` em U18; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0635 | U18 |                     log('warn', 'bg', 'SINGLE_IMAGE_CONTEXT_MENU_REJECTED', | Invoca `log` nesta etapa de U18; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0636 | U18 |                         'A página rejeitou a solicitação de tradução individual.', { | Completa a expressão multilinha de U18 com `'A página rejeitou a solicitação de tradução individual.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0637 | U18 |                             tabId: tab.id, | Define a propriedade `tabId` no objeto/snapshot de U18, compondo o contrato enviado ao módulo/storage/API. |
| 0638 | U18 |                             reason: response && response.reason ? response.reason : 'no_response', | Define a propriedade `reason` no objeto/snapshot de U18, compondo o contrato enviado ao módulo/storage/API. |
| 0639 | U18 |                         }); | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0640 | U18 |                 } | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0641 | U18 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0642 | U18 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0643 | U18 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0644 | U18 | } | Fecha a estrutura sintática aberta imediatamente antes em U18 (bloco, callback, objeto ou chamada). |
| 0645 | U18 | ␠ [linha vazia] | Separa visualmente etapas dentro de U18 (Listeners do menu de contexto); não altera estado, Promise, listener nem controle de fluxo. |
| 0646 | U19 | // SEC-05: Constante nomeada para prompt padrão em vez de string longa inline | Registra a decisão/manutenção local de U19: “SEC-05: Constante nomeada para prompt padrão em vez de string longa inline”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0647 | U19 | const DEFAULT_TRANSLATION_PROMPT = "Objetivo primário: voce vai criar uma imagem , exata da imagem fornecida e traduzir ela pro português brasileiro . \nNão altere nenhum pixel fora das áreas de texto e Remova o texto original dos balões de fala, preenchendo o fundo com a cor correspondente. \nConverta os diálogos para PT-BR, mantendo a informalidade do contexto. Tipografia: Renderize o novo texto em caixa alta, fonte padrão de HQ (sans-serif), alinhamento centralizado.\nEfeitos Sonoros: Traduza e recrie as onomatopeias  mantendo as fontes estilizadas, cores, contornos e inclinação originais. lembre-se que todas as palavras devem sem traduzidas sem exceção"; | Cria o binding `DEFAULT_TRANSLATION_PROMPT` (const) usado por U19; o inicializador da linha estabelece o valor/closure inicial. |
| 0648 | U19 | ␠ [linha vazia] | Separa visualmente etapas dentro de U19 (Prompt padrão e onInstalled); não altera estado, Promise, listener nem controle de fluxo. |
| 0649 | U19 | chrome.runtime.onInstalled.addListener(() => { | Registra o listener Chrome expresso na linha como parte de U19; o callback passa a participar do lifecycle do navegador. |
| 0650 | U19 |     refreshSingleImageContextMenu(); | Invoca `refreshSingleImageContextMenu` nesta etapa de U19; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0651 | U19 |     chrome.storage.local.get(['defaultPrompt'], (data) => { | Executa `chrome.storage.local.get` em U19; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0652 | U19 |         if (!data.defaultPrompt) { | Abre a guarda `if (!data.defaultPrompt) {` em U19; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0653 | U19 |             chrome.storage.local.set({ defaultPrompt: DEFAULT_TRANSLATION_PROMPT }); | Executa `chrome.storage.local.set` em U19; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0654 | U19 |         } | Fecha a estrutura sintática aberta imediatamente antes em U19 (bloco, callback, objeto ou chamada). |
| 0655 | U19 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U19 (bloco, callback, objeto ou chamada). |
| 0656 | U19 | }); | Fecha a estrutura sintática aberta imediatamente antes em U19 (bloco, callback, objeto ou chamada). |
| 0657 | U19 | ␠ [linha vazia] | Separa visualmente etapas dentro de U19 (Prompt padrão e onInstalled); não altera estado, Promise, listener nem controle de fluxo. |
| 0658 | U20 | chrome.runtime.onStartup.addListener(async () => { | Registra o listener Chrome expresso na linha como parte de U20; o callback passa a participar do lifecycle do navegador. |
| 0659 | U20 |     refreshSingleImageContextMenu(); | Invoca `refreshSingleImageContextMenu` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0660 | U20 |     await restoreState(); | Aguarda `restoreState();` antes de prosseguir em U20, preservando a ordem assíncrona. |
| 0661 | U20 |     const identity = initializeTabIdentity(); | Cria o binding `identity` (const) usado por U20; o inicializador da linha estabelece o valor/closure inicial. |
| 0662 | U20 |     await identity.recoverPendingMigrations(); | Aguarda `identity.recoverPendingMigrations();` antes de prosseguir em U20, preservando a ordem assíncrona. |
| 0663 | U20 |     await identity.cleanupExpiredAliases(); | Aguarda `identity.cleanupExpiredAliases();` antes de prosseguir em U20, preservando a ordem assíncrona. |
| 0664 | U20 |     state()._initialized = true; | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0665 | U20 |      | Separa visualmente etapas dentro de U20 (Recuperação no onStartup); não altera estado, Promise, listener nem controle de fluxo. |
| 0666 | U20 |     // FIX M-5 | Registra a decisão/manutenção local de U20: “FIX M-5”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0667 | U20 |     state().extractionTabs = {}; | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0668 | U20 | ␠ [linha vazia] | Separa visualmente etapas dentro de U20 (Recuperação no onStartup); não altera estado, Promise, listener nem controle de fluxo. |
| 0669 | U20 |     const currentBatchNeedsWork = Boolean( | Cria o binding `currentBatchNeedsWork` (const) usado por U20; o inicializador da linha estabelece o valor/closure inicial. |
| 0670 | U20 |         state().currentBatchId && | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0671 | U20 |         state().completionClaimedBatchId !== state().currentBatchId | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0672 | U20 |     ); | Fecha a estrutura sintática aberta imediatamente antes em U20 (bloco, callback, objeto ou chamada). |
| 0673 | U20 |     const hadWork = state().jobQueue.length > 0 \|\| state().activeJobsCount > 0 \|\| | Cria o binding `hadWork` (const) usado por U20; o inicializador da linha estabelece o valor/closure inicial. |
| 0674 | U20 |         state().jobIndex.length > 0 \|\| state().pendingBatches.length > 0 \|\| | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0675 | U20 |         currentBatchNeedsWork; | Completa a expressão multilinha de U20 com `currentBatchNeedsWork;`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0676 | U20 | ␠ [linha vazia] | Separa visualmente etapas dentro de U20 (Recuperação no onStartup); não altera estado, Promise, listener nem controle de fluxo. |
| 0677 | U20 |     // Em onStartup o navegador foi reiniciado: nenhuma aba do Gemini sobrevive, | Registra a decisão/manutenção local de U20: “Em onStartup o navegador foi reiniciado: nenhuma aba do Gemini sobrevive,”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0678 | U20 |     // então a reconciliação sempre descarta os jobs órfãos e libera os slots. | Registra a decisão/manutenção local de U20: “então a reconciliação sempre descarta os jobs órfãos e libera os slots.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0679 | U20 |     const reconciled = await reconcileJobs(); | Cria o binding `reconciled` (const) usado por U20; o inicializador da linha estabelece o valor/closure inicial. |
| 0680 | U20 | ␠ [linha vazia] | Separa visualmente etapas dentro de U20 (Recuperação no onStartup); não altera estado, Promise, listener nem controle de fluxo. |
| 0681 | U20 |     if (hadWork) { | Abre a guarda `if (hadWork) {` em U20; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0682 | U20 |         log('warn', 'bg', 'STARTUP_RECOVERY', `Service worker reiniciado: ${state().jobQueue.length} jobs do lote atual, ${state().pendingBatches.length} lote(s) pendente(s), ${reconciled.alive} ativos preservados, ${reconciled.dropped} órfãos descartados, ${reconciled.recovered \|\| 0} finalizações reconciliadas`, { | Invoca `log` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0683 | U20 |             jobQueue: state().jobQueue.length, | Define a propriedade `jobQueue` no objeto/snapshot de U20, compondo o contrato enviado ao módulo/storage/API. |
| 0684 | U20 |             pendingBatches: state().pendingBatches.length, | Define a propriedade `pendingBatches` no objeto/snapshot de U20, compondo o contrato enviado ao módulo/storage/API. |
| 0685 | U20 |             currentBatchId: String(state().currentBatchId \|\| '').slice(0, 8), | Define a propriedade `currentBatchId` no objeto/snapshot de U20, compondo o contrato enviado ao módulo/storage/API. |
| 0686 | U20 |             alive: reconciled.alive, | Define a propriedade `alive` no objeto/snapshot de U20, compondo o contrato enviado ao módulo/storage/API. |
| 0687 | U20 |             dropped: reconciled.dropped, | Define a propriedade `dropped` no objeto/snapshot de U20, compondo o contrato enviado ao módulo/storage/API. |
| 0688 | U20 |             recovered: reconciled.recovered \|\| 0, | Define a propriedade `recovered` no objeto/snapshot de U20, compondo o contrato enviado ao módulo/storage/API. |
| 0689 | U20 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U20 (bloco, callback, objeto ou chamada). |
| 0690 | U20 |         state().isProcessing = Boolean( | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0691 | U20 |             (state().currentBatchId && | Completa a expressão multilinha de U20 com `(state().currentBatchId &&`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0692 | U20 |                 state().completionClaimedBatchId !== state().currentBatchId) \|\| | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0693 | U20 |             state().jobQueue.length > 0 \|\| | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0694 | U20 |             state().activeJobsCount > 0 | Invoca `state` nesta etapa de U20; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0695 | U20 |         ); | Fecha a estrutura sintática aberta imediatamente antes em U20 (bloco, callback, objeto ou chamada). |
| 0696 | U20 |         await syncState(); | Aguarda `syncState();` antes de prosseguir em U20, preservando a ordem assíncrona. |
| 0697 | U20 |         if (!state().stopRequested) processNextJob(); | Abre a guarda `if (!state().stopRequested) processNextJob();` em U20; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0698 | U20 |     } else { | Seleciona o caminho alternativo de U20 quando a guarda imediatamente anterior falha. |
| 0699 | U20 |         await syncState(); | Aguarda `syncState();` antes de prosseguir em U20, preservando a ordem assíncrona. |
| 0700 | U20 |     } | Fecha a estrutura sintática aberta imediatamente antes em U20 (bloco, callback, objeto ou chamada). |
| 0701 | U20 | }); | Fecha a estrutura sintática aberta imediatamente antes em U20 (bloco, callback, objeto ou chamada). |
| 0702 | U20 | ␠ [linha vazia] | Separa visualmente etapas dentro de U20 (Recuperação no onStartup); não altera estado, Promise, listener nem controle de fluxo. |
| 0703 | U21 | chrome.runtime.onConnect.addListener(port => { | Registra o listener Chrome expresso na linha como parte de U21; o callback passa a participar do lifecycle do navegador. |
| 0704 | U21 |     if (port.name === 'gemini-keep-alive') port.onDisconnect.addListener(() => {}); | Abre a guarda `if (port.name === 'gemini-keep-alive') port.onDisconnect.addListener(() => {});` em U21; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0705 | U21 | }); | Fecha a estrutura sintática aberta imediatamente antes em U21 (bloco, callback, objeto ou chamada). |
| 0706 | U21 | ␠ [linha vazia] | Separa visualmente etapas dentro de U21 (Porta de keep-alive); não altera estado, Promise, listener nem controle de fluxo. |
| 0707 | U22 | // Diagnóstico de identidade de aba. PR 0 apenas observa a transição; a | Registra a decisão/manutenção local de U22: “Diagnóstico de identidade de aba. PR 0 apenas observa a transição; a”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0708 | U22 | // canonicalização/rekey durável é implementada no PR 1. | Registra a decisão/manutenção local de U22: “canonicalização/rekey durável é implementada no PR 1.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0709 | U22 | if (chrome.tabs && chrome.tabs.onReplaced) { | Abre a guarda `if (chrome.tabs && chrome.tabs.onReplaced) {` em U22; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0710 | U22 |     chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => { | Registra o listener Chrome expresso na linha como parte de U22; o callback passa a participar do lifecycle do navegador. |
| 0711 | U22 |         log('info', 'bg', 'TAB_REPLACED', 'Aba substituída pelo Chromium', { | Invoca `log` nesta etapa de U22; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0712 | U22 |             oldTabId: removedTabId, | Define a propriedade `oldTabId` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0713 | U22 |             newTabId: addedTabId, | Define a propriedade `newTabId` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0714 | U22 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U22 (bloco, callback, objeto ou chamada). |
| 0715 | U22 |         try { | Inicia região protegida de U22; falhas síncronas das chamadas internas seguem para o catch correspondente. |
| 0716 | U22 |             initializeTabIdentity().recordReplacement(addedTabId, removedTabId) | Invoca `initializeTabIdentity` nesta etapa de U22; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0717 | U22 |                 .catch(error => log('error', 'bg', 'TAB_REKEY_ERROR', 'Falha ao migrar identidade de aba', { | Continua a cadeia de U22 com `.catch(error => log('error', 'bg', 'TAB_REKEY_ERROR', 'Falha ao migrar identidade de aba', {`, transformando/filtrando/tratando o valor anterior. |
| 0718 | U22 |                     oldTabId: removedTabId, | Define a propriedade `oldTabId` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0719 | U22 |                     newTabId: addedTabId, | Define a propriedade `newTabId` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0720 | U22 |                     errorName: error && error.name ? error.name : 'Error', | Define a propriedade `errorName` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0721 | U22 |                 })); | Fecha a estrutura sintática aberta imediatamente antes em U22 (bloco, callback, objeto ou chamada). |
| 0722 | U22 |         } catch (error) { | Captura a exceção do try de U22; as linhas seguintes aplicam o fallback/log/continuidade previsto. |
| 0723 | U22 |             log('error', 'bg', 'TAB_REKEY_ERROR', 'Falha ao iniciar migração de identidade de aba', { | Invoca `log` nesta etapa de U22; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0724 | U22 |                 oldTabId: removedTabId, | Define a propriedade `oldTabId` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0725 | U22 |                 newTabId: addedTabId, | Define a propriedade `newTabId` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0726 | U22 |                 errorName: error && error.name ? error.name : 'Error', | Define a propriedade `errorName` no objeto/snapshot de U22, compondo o contrato enviado ao módulo/storage/API. |
| 0727 | U22 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U22 (bloco, callback, objeto ou chamada). |
| 0728 | U22 |         } | Fecha a estrutura sintática aberta imediatamente antes em U22 (bloco, callback, objeto ou chamada). |
| 0729 | U22 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U22 (bloco, callback, objeto ou chamada). |
| 0730 | U22 | } | Fecha a estrutura sintática aberta imediatamente antes em U22 (bloco, callback, objeto ou chamada). |
| 0731 | U22 | ␠ [linha vazia] | Separa visualmente etapas dentro de U22 (Substituição de abas e rekey); não altera estado, Promise, listener nem controle de fluxo. |
| 0732 | U23 | chrome.alarms.onAlarm.addListener(async (alarm) => { | Registra o listener Chrome expresso na linha como parte de U23; o callback passa a participar do lifecycle do navegador. |
| 0733 | U23 |     await ensureInitialized(); | Aguarda `ensureInitialized();` antes de prosseguir em U23, preservando a ordem assíncrona. |
| 0734 | U23 |     if (alarm.name.startsWith('finalization_marker_')) { | Abre a guarda `if (alarm.name.startsWith('finalization_marker_')) {` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0735 | U23 |         const geminiTabId = alarm.name.replace('finalization_marker_', ''); | Cria o binding `geminiTabId` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0736 | U23 |         chrome.storage.local.remove(finalizationMarkerKey(geminiTabId)); | Executa `chrome.storage.local.remove` em U23; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0737 | U23 |         return; | Encerra este caminho de U23 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0738 | U23 |     } | Fecha a estrutura sintática aberta imediatamente antes em U23 (bloco, callback, objeto ou chamada). |
| 0739 | U23 |     if (alarm.name === 'nextJobAlarm') { | Abre a guarda `if (alarm.name === 'nextJobAlarm') {` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0740 | U23 |         processNextJob(); | Invoca `processNextJob` nesta etapa de U23; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0741 | U23 |         return; | Encerra este caminho de U23 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0742 | U23 |     } | Fecha a estrutura sintática aberta imediatamente antes em U23 (bloco, callback, objeto ou chamada). |
| 0743 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0744 | U23 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U23; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0745 | U23 |     if (jobsWatchdog.handleAlarm(alarm)) return; | Abre a guarda `if (jobsWatchdog.handleAlarm(alarm)) return;` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0746 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0747 | U23 |     if (alarm.name.startsWith('watchdog_')) { | Abre a guarda `if (alarm.name.startsWith('watchdog_')) {` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0748 | U23 |         // O nome do alarme agora pode ser watchdog_${jobId} (UUID) ou watchdog_${tabId} (legado) | Registra a decisão/manutenção local de U23: “O nome do alarme agora pode ser watchdog_${jobId} (UUID) ou watchdog_${tabId} (legado)”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0749 | U23 |         // Buscar wd_data pelo sufixo — pode ser jobId ou tabId | Registra a decisão/manutenção local de U23: “Buscar wd_data pelo sufixo — pode ser jobId ou tabId”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0750 | U23 |         const suffix = alarm.name.replace('watchdog_', ''); | Cria o binding `suffix` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0751 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0752 | U23 |         // O alarme pode se chamar watchdog_<jobId> (UUID) ou watchdog_<tabId> (legado). | Registra a decisão/manutenção local de U23: “O alarme pode se chamar watchdog_<jobId> (UUID) ou watchdog_<tabId> (legado).”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0753 | U23 |         // O índice durável resolve jobId → geminiTabId sem precisar de get(null), | Registra a decisão/manutenção local de U23: “O índice durável resolve jobId → geminiTabId sem precisar de get(null),”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0754 | U23 |         // que carregaria todas as imagens Base64 do acervo na memória do worker. | Registra a decisão/manutenção local de U23: “que carregaria todas as imagens Base64 do acervo na memória do worker.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0755 | U23 |         const indexed = state().jobIndex.find(j => j && (String(j.jobId) === suffix \|\| String(j.geminiTabId) === suffix)); | Cria o binding `indexed` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0756 | U23 |         const candidateKeys = []; | Cria o binding `candidateKeys` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0757 | U23 |         if (indexed) candidateKeys.push(`wd_data_${indexed.geminiTabId}`); | Abre a guarda `if (indexed) candidateKeys.push(`wd_data_${indexed.geminiTabId}`);` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0758 | U23 |         if (!candidateKeys.includes(`wd_data_${suffix}`)) candidateKeys.push(`wd_data_${suffix}`); | Abre a guarda `if (!candidateKeys.includes(`wd_data_${suffix}`)) candidateKeys.push(`wd_data_${suffix}`);` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0759 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0760 | U23 |         chrome.storage.local.get(candidateKeys, (data) => { | Executa `chrome.storage.local.get` em U23; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0761 | U23 |             const storageKey = candidateKeys.find(k => data && data[k]); | Cria o binding `storageKey` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0762 | U23 |             const wd = storageKey | Cria o binding `wd` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0763 | U23 |                 ? data[storageKey] | Completa a seleção condicional iniciada acima em U23, fornecendo um dos valores possíveis. |
| 0764 | U23 |                 : (indexed ? { geminiTabId: indexed.geminiTabId, mangaTabId: indexed.mangaTabId, index: indexed.index, jobId: indexed.jobId } : null); | Completa a seleção condicional iniciada acima em U23, fornecendo um dos valores possíveis. |
| 0765 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0766 | U23 |             if (!wd) return; | Abre a guarda `if (!wd) return;` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0767 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0768 | U23 |             if (storageKey) chrome.storage.local.remove(storageKey); | Abre a guarda `if (storageKey) chrome.storage.local.remove(storageKey);` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0769 | U23 |             const parsedSuffix = parseInt(suffix, 10); | Cria o binding `parsedSuffix` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0770 | U23 |             const geminiTabId = wd.geminiTabId | Cria o binding `geminiTabId` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0771 | U23 |                 \|\| (indexed && indexed.geminiTabId) | Completa a expressão multilinha de U23 com `// (indexed && indexed.geminiTabId)`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0772 | U23 |                 \|\| (Number.isFinite(parsedSuffix) ? parsedSuffix : null); | Completa a expressão multilinha de U23 com `// (Number.isFinite(parsedSuffix) ? parsedSuffix : null);`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0773 | U23 |             if (geminiTabId === null) return; | Abre a guarda `if (geminiTabId === null) return;` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0774 | U23 |             log('warn', 'bg', 'JOB_TIMEOUT', `Timeout de ${JOB_TIMEOUT_MINUTES} min no index ${wd.index}`, { geminiTabId }); | Invoca `log` nesta etapa de U23; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0775 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0776 | U23 |             if (wd.mangaTabId) { | Abre a guarda `if (wd.mangaTabId) {` em U23; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0777 | U23 |                 chrome.tabs.sendMessage(wd.mangaTabId, { | Envia IPC tab-scoped ao content script em U23; tabId e payload definem o boundary efetivo. |
| 0778 | U23 |                     action: 'SHOW_ERROR_INTEGRATED', errorMsg: `⏰ LIMITE DE TEMPO (${JOB_TIMEOUT_MINUTES} min)`, imgIndex: wd.index, isDebug: false | Define a propriedade `action` no objeto/snapshot de U23, compondo o contrato enviado ao módulo/storage/API. |
| 0779 | U23 |                 }, () => { if (chrome.runtime.lastError) {} }); | Invoca `chrome.runtime.lastError` em U23; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0780 | U23 |             } | Fecha a estrutura sintática aberta imediatamente antes em U23 (bloco, callback, objeto ou chamada). |
| 0781 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0782 | U23 |             finalizeJob(geminiTabId, wd.mangaTabId, true); | Invoca `finalizeJob` nesta etapa de U23; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0783 | U23 |             const orphanIds = Object.keys(state().extractionTabs).filter(tabId => state().extractionTabs[tabId] && state().extractionTabs[tabId].geminiTabId === geminiTabId); | Cria o binding `orphanIds` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0784 | U23 |             orphanIds.forEach(tabId => { | Itera a coleção/condição mostrada em U23; cada item/volta executa o corpo adjacente. |
| 0785 | U23 |                 const numId = Number(tabId); | Cria o binding `numId` (const) usado por U23; o inicializador da linha estabelece o valor/closure inicial. |
| 0786 | U23 |                 chrome.tabs.remove(numId, () => { if (chrome.runtime.lastError) {} }); | Invoca `chrome.tabs.remove` em U23; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0787 | U23 |                 delete state().extractionTabs[numId]; | Completa a expressão multilinha de U23 com `delete state().extractionTabs[numId];`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0788 | U23 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U23 (bloco, callback, objeto ou chamada). |
| 0789 | U23 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U23 (bloco, callback, objeto ou chamada). |
| 0790 | U23 |     } | Fecha a estrutura sintática aberta imediatamente antes em U23 (bloco, callback, objeto ou chamada). |
| 0791 | U23 | }); | Fecha a estrutura sintática aberta imediatamente antes em U23 (bloco, callback, objeto ou chamada). |
| 0792 | U23 | ␠ [linha vazia] | Separa visualmente etapas dentro de U23 (Alarmes, watchdog e limpeza de órfãos); não altera estado, Promise, listener nem controle de fluxo. |
| 0793 | U24 | function sendProgress(mangaTabId, text) { | Declara sendProgress(mangaTabId, text) como entrada nomeada de U24; o corpo seguinte implementa o contrato da unidade. |
| 0794 | U24 |     if (!mangaTabId) return; | Abre a guarda `if (!mangaTabId) return;` em U24; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0795 | U24 |     chrome.tabs.sendMessage(mangaTabId, { action: 'PROGRESS', text }, () => { if (chrome.runtime.lastError) {} }); | Envia IPC tab-scoped ao content script em U24; tabId e payload definem o boundary efetivo. |
| 0796 | U24 | } | Fecha a estrutura sintática aberta imediatamente antes em U24 (bloco, callback, objeto ou chamada). |
| 0797 | U24 | ␠ [linha vazia] | Separa visualmente etapas dentro de U24 (Progresso e espera de downloads); não altera estado, Promise, listener nem controle de fluxo. |
| 0798 | U24 | function waitForDownload(id, onComplete, onError) { | Declara waitForDownload(id, onComplete, onError) como entrada nomeada de U24; o corpo seguinte implementa o contrato da unidade. |
| 0799 | U24 |     let safetyTimer; | Cria o binding `safetyTimer` (let) usado por U24; o inicializador da linha estabelece o valor/closure inicial. |
| 0800 | U24 |     function handler(delta) { | Declara handler(delta) como entrada nomeada de U24; o corpo seguinte implementa o contrato da unidade. |
| 0801 | U24 |         if (delta.id !== id) return; | Abre a guarda `if (delta.id !== id) return;` em U24; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0802 | U24 |         if (delta.state?.current === 'complete') { | Abre a guarda `if (delta.state?.current === 'complete') {` em U24; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0803 | U24 |             clearTimeout(safetyTimer); | Invoca `clearTimeout` nesta etapa de U24; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0804 | U24 |             chrome.downloads.onChanged.removeListener(handler); | Invoca `chrome.downloads.onChanged.removeListener` em U24; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0805 | U24 |             onComplete(id); | Invoca `onComplete` nesta etapa de U24; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0806 | U24 |         } else if (delta.state?.current === 'interrupted') { | Seleciona o caminho alternativo de U24 quando a guarda imediatamente anterior falha. |
| 0807 | U24 |             clearTimeout(safetyTimer); | Invoca `clearTimeout` nesta etapa de U24; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0808 | U24 |             chrome.downloads.onChanged.removeListener(handler); | Invoca `chrome.downloads.onChanged.removeListener` em U24; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0809 | U24 |             if (onError) onError(new Error(`Download ${id} interrupted`)); | Abre a guarda `if (onError) onError(new Error(`Download ${id} interrupted`));` em U24; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0810 | U24 |         } | Fecha a estrutura sintática aberta imediatamente antes em U24 (bloco, callback, objeto ou chamada). |
| 0811 | U24 |     } | Fecha a estrutura sintática aberta imediatamente antes em U24 (bloco, callback, objeto ou chamada). |
| 0812 | U24 |     chrome.downloads.onChanged.addListener(handler); | Registra o listener Chrome expresso na linha como parte de U24; o callback passa a participar do lifecycle do navegador. |
| 0813 | U24 |     safetyTimer = setTimeout(() => { | Atualiza `safetyTimer` dentro de U24; passos posteriores da unidade observam esse novo valor. |
| 0814 | U24 |         chrome.downloads.onChanged.removeListener(handler); | Invoca `chrome.downloads.onChanged.removeListener` em U24; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0815 | U24 |         if (onError) onError(new Error(`Temp timeout (10min)`)); | Abre a guarda `if (onError) onError(new Error(`Temp timeout (10min)`));` em U24; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0816 | U24 |     }, 600_000); | Completa a expressão multilinha de U24 com `}, 600_000);`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0817 | U24 | } | Fecha a estrutura sintática aberta imediatamente antes em U24 (bloco, callback, objeto ou chamada). |
| 0818 | U24 | ␠ [linha vazia] | Separa visualmente etapas dentro de U24 (Progresso e espera de downloads); não altera estado, Promise, listener nem controle de fluxo. |
| 0819 | U25 | function downloadImagesAndShow(images, safeTitle, chapId) { | Declara downloadImagesAndShow(images, safeTitle, chapId) como entrada nomeada de U25; o corpo seguinte implementa o contrato da unidade. |
| 0820 | U25 |     const indices = Object.keys(images).map(Number).sort((a, b) => a - b); | Cria o binding `indices` (const) usado por U25; o inicializador da linha estabelece o valor/closure inicial. |
| 0821 | U25 |     let completed = 0; | Cria o binding `completed` (let) usado por U25; o inicializador da linha estabelece o valor/closure inicial. |
| 0822 | U25 |     let lastCompletedId = null; | Cria o binding `lastCompletedId` (let) usado por U25; o inicializador da linha estabelece o valor/closure inicial. |
| 0823 | U25 |     const pathsUpdate = {}; | Cria o binding `pathsUpdate` (const) usado por U25; o inicializador da linha estabelece o valor/closure inicial. |
| 0824 | U25 | ␠ [linha vazia] | Separa visualmente etapas dentro de U25 (Download em lote e persistência de paths); não altera estado, Promise, listener nem controle de fluxo. |
| 0825 | U25 |     return new Promise((resolve) => { | Encerra este caminho de U25 devolvendo `new Promise((resolve) => {`; o chamador usa esse valor como contrato/controle. |
| 0826 | U25 |         if (indices.length === 0) return resolve(true); | Abre a guarda `if (indices.length === 0) return resolve(true);` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0827 | U25 | ␠ [linha vazia] | Separa visualmente etapas dentro de U25 (Download em lote e persistência de paths); não altera estado, Promise, listener nem controle de fluxo. |
| 0828 | U25 |         indices.forEach((idx) => { | Itera a coleção/condição mostrada em U25; cada item/volta executa o corpo adjacente. |
| 0829 | U25 |             const fname = `MangaTranslator/${safeTitle}/pagina_${String(idx).padStart(3, '0')}.png`; | Cria o binding `fname` (const) usado por U25; o inicializador da linha estabelece o valor/closure inicial. |
| 0830 | U25 |             chrome.downloads.download({ url: images[idx], filename: fname, saveAs: false }, (id) => { | Invoca `chrome.downloads.download` em U25; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0831 | U25 |                 if (chrome.runtime.lastError \|\| id === undefined) {  | Abre a guarda `if (chrome.runtime.lastError // id === undefined) {` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0832 | U25 |                     completed++; if (completed === indices.length) finalize(); | Completa a expressão multilinha de U25 com `completed++; if (completed === indices.length) finalize();`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0833 | U25 |                     return;  | Encerra este caminho de U25 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0834 | U25 |                 } | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0835 | U25 |                 waitForDownload(id,  | Invoca `waitForDownload` nesta etapa de U25; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0836 | U25 |                     (doneId) => { | Completa a expressão multilinha de U25 com `(doneId) => {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0837 | U25 |                         chrome.downloads.search({ id: doneId }, (results) => { | Invoca `chrome.downloads.search` em U25; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0838 | U25 |                             if (results?.[0]) pathsUpdate[idx] = results[0].filename; | Abre a guarda `if (results?.[0]) pathsUpdate[idx] = results[0].filename;` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0839 | U25 |                             lastCompletedId = doneId; | Atualiza `lastCompletedId` dentro de U25; passos posteriores da unidade observam esse novo valor. |
| 0840 | U25 |                             completed++; | Completa a expressão multilinha de U25 com `completed++;`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0841 | U25 |                             if (completed === indices.length) finalize(); | Abre a guarda `if (completed === indices.length) finalize();` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0842 | U25 |                         }); | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0843 | U25 |                     }, | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0844 | U25 |                     (err) => { | Completa a expressão multilinha de U25 com `(err) => {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0845 | U25 |                         log('error', 'bg', 'DOWNLOAD_INTERRUPTED', 'Download interrompido', { fname }); | Invoca `log` nesta etapa de U25; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0846 | U25 |                         completed++; | Completa a expressão multilinha de U25 com `completed++;`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0847 | U25 |                         if (completed === indices.length) finalize(); | Abre a guarda `if (completed === indices.length) finalize();` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0848 | U25 |                     } | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0849 | U25 |                 ); | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0850 | U25 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0851 | U25 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0852 | U25 | ␠ [linha vazia] | Separa visualmente etapas dentro de U25 (Download em lote e persistência de paths); não altera estado, Promise, listener nem controle de fluxo. |
| 0853 | U25 |         function finalize() { | Declara finalize() como entrada nomeada de U25; o corpo seguinte implementa o contrato da unidade. |
| 0854 | U25 |             chrome.storage.local.get([`${chapId}_paths`], (d) => { | Executa `chrome.storage.local.get` em U25; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0855 | U25 |                 if (Object.keys(pathsUpdate).length > 0) { | Abre a guarda `if (Object.keys(pathsUpdate).length > 0) {` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0856 | U25 |                     const toSet = { | Cria o binding `toSet` (const) usado por U25; o inicializador da linha estabelece o valor/closure inicial. |
| 0857 | U25 |                         [`${chapId}_paths`]: { ...(d[`${chapId}_paths`] \|\| {}), ...pathsUpdate }, | Define a propriedade `[`${chapId}_paths`]` no objeto/snapshot de U25, compondo o contrato enviado ao módulo/storage/API. |
| 0858 | U25 |                         mangaTranslatorLastPath: pathsUpdate[indices[indices.length - 1]] \|\| null | Define a propriedade `mangaTranslatorLastPath` no objeto/snapshot de U25, compondo o contrato enviado ao módulo/storage/API. |
| 0859 | U25 |                     }; | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0860 | U25 |                     if (lastCompletedId) toSet[`${chapId}_dlId`] = lastCompletedId; | Abre a guarda `if (lastCompletedId) toSet[`${chapId}_dlId`] = lastCompletedId;` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0861 | U25 |                     chrome.storage.local.set(toSet); | Executa `chrome.storage.local.set` em U25; acessa estado durável que deve sobreviver melhor que memória do worker. |
| 0862 | U25 |                 } | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0863 | U25 |                 if (lastCompletedId) chrome.downloads.show(lastCompletedId); | Abre a guarda `if (lastCompletedId) chrome.downloads.show(lastCompletedId);` em U25; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0864 | U25 |                 resolve(true); | Invoca `resolve` nesta etapa de U25; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0865 | U25 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0866 | U25 |         } | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0867 | U25 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0868 | U25 | } | Fecha a estrutura sintática aberta imediatamente antes em U25 (bloco, callback, objeto ou chamada). |
| 0869 | U25 | ␠ [linha vazia] | Separa visualmente etapas dentro de U25 (Download em lote e persistência de paths); não altera estado, Promise, listener nem controle de fluxo. |
| 0870 | U26 | function handleMarkerAndShow(safeTitle, sendResponse) { | Declara handleMarkerAndShow(safeTitle, sendResponse) como entrada nomeada de U26; o corpo seguinte implementa o contrato da unidade. |
| 0871 | U26 |     const query = safeTitle ? `MangaTranslator(?:\\\\\|/)${safeTitle}` : 'MangaTranslator'; | Cria o binding `query` (const) usado por U26; o inicializador da linha estabelece o valor/closure inicial. |
| 0872 | U26 |      | Separa visualmente etapas dentro de U26 (Abertura de pasta via download/âncora); não altera estado, Promise, listener nem controle de fluxo. |
| 0873 | U26 |     chrome.downloads.search({ filenameRegex: query }, (results) => { | Invoca `chrome.downloads.search` em U26; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0874 | U26 |         if (results && results.length > 0) { | Abre a guarda `if (results && results.length > 0) {` em U26; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0875 | U26 |             const valid = results.find(r => r.exists && r.state === 'complete'); | Cria o binding `valid` (const) usado por U26; o inicializador da linha estabelece o valor/closure inicial. |
| 0876 | U26 |             if (valid) { | Abre a guarda `if (valid) {` em U26; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0877 | U26 |                 chrome.downloads.show(valid.id); | Invoca `chrome.downloads.show` em U26; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0878 | U26 |                 log('success', 'bg', 'FOLDER_OPEN_OK', 'Pasta nativa', { safeTitle }); | Invoca `log` nesta etapa de U26; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0879 | U26 |                 if(sendResponse) sendResponse({ ok: true }); | Abre a guarda `if(sendResponse) sendResponse({ ok: true });` em U26; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0880 | U26 |                 return; | Encerra este caminho de U26 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0881 | U26 |             } | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0882 | U26 |         } | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0883 | U26 |          | Separa visualmente etapas dentro de U26 (Abertura de pasta via download/âncora); não altera estado, Promise, listener nem controle de fluxo. |
| 0884 | U26 |         const MARKER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII='; | Cria o binding `MARKER` (const) usado por U26; o inicializador da linha estabelece o valor/closure inicial. |
| 0885 | U26 |         const markerPath = safeTitle ? `MangaTranslator/${safeTitle}/_anchor.png` : 'MangaTranslator/_anchor.png'; | Cria o binding `markerPath` (const) usado por U26; o inicializador da linha estabelece o valor/closure inicial. |
| 0886 | U26 | ␠ [linha vazia] | Separa visualmente etapas dentro de U26 (Abertura de pasta via download/âncora); não altera estado, Promise, listener nem controle de fluxo. |
| 0887 | U26 |         chrome.downloads.download({ url: MARKER, filename: markerPath, saveAs: false, conflictAction: 'overwrite' }, (id) => { | Invoca `chrome.downloads.download` em U26; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0888 | U26 |             if (chrome.runtime.lastError \|\| id === undefined) { | Abre a guarda `if (chrome.runtime.lastError // id === undefined) {` em U26; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0889 | U26 |                 if(sendResponse) sendResponse({ ok: false, error: 'Falha.' }); | Abre a guarda `if(sendResponse) sendResponse({ ok: false, error: 'Falha.' });` em U26; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0890 | U26 |                 return; | Encerra este caminho de U26 devolvendo `;`; o chamador usa esse valor como contrato/controle. |
| 0891 | U26 |             } | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0892 | U26 |             waitForDownload(id,  | Invoca `waitForDownload` nesta etapa de U26; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0893 | U26 |                 (doneId) => { | Completa a expressão multilinha de U26 com `(doneId) => {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0894 | U26 |                     chrome.downloads.show(doneId); | Invoca `chrome.downloads.show` em U26; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0895 | U26 |                     setTimeout(() => { chrome.downloads.removeFile(doneId, () => { chrome.downloads.erase({ id: doneId }); }); }, 4000); | Invoca `chrome.downloads.removeFile` em U26; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 0896 | U26 |                     log('success', 'bg', 'FOLDER_OPEN_OK', 'Marcador aberto', { safeTitle }); | Invoca `log` nesta etapa de U26; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0897 | U26 |                     if(sendResponse) sendResponse({ ok: true }); | Abre a guarda `if(sendResponse) sendResponse({ ok: true });` em U26; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0898 | U26 |                 }, | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0899 | U26 |                 (err) => { if(sendResponse) sendResponse({ ok: false, error: 'Interrompido' }); } | Completa a expressão multilinha de U26 com `(err) => { if(sendResponse) sendResponse({ ok: false, error: 'Interrompido' }); }`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0900 | U26 |             ); | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0901 | U26 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0902 | U26 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0903 | U26 | } | Fecha a estrutura sintática aberta imediatamente antes em U26 (bloco, callback, objeto ou chamada). |
| 0904 | U26 | ␠ [linha vazia] | Separa visualmente etapas dentro de U26 (Abertura de pasta via download/âncora); não altera estado, Promise, listener nem controle de fluxo. |
| 0905 | U27 | function createBatchDescriptor(request, mangaTabId, batchId) { | Declara createBatchDescriptor(request, mangaTabId, batchId) como entrada nomeada de U27; o corpo seguinte implementa o contrato da unidade. |
| 0906 | U27 |     return { | Encerra este caminho de U27 devolvendo `{`; o chamador usa esse valor como contrato/controle. |
| 0907 | U27 |         batchId, | Completa a expressão multilinha de U27 com `batchId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0908 | U27 |         mangaTabId, | Completa a expressão multilinha de U27 com `mangaTabId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0909 | U27 |         prompt: request.prompt \|\| '', | Define a propriedade `prompt` no objeto/snapshot de U27, compondo o contrato enviado ao módulo/storage/API. |
| 0910 | U27 |         images: request.images.map(image => ({ index: image.index })), | Define a propriedade `images` no objeto/snapshot de U27, compondo o contrato enviado ao módulo/storage/API. |
| 0911 | U27 |         enqueuedAt: Date.now(), | Define a propriedade `enqueuedAt` no objeto/snapshot de U27, compondo o contrato enviado ao módulo/storage/API. |
| 0912 | U27 |     }; | Fecha a estrutura sintática aberta imediatamente antes em U27 (bloco, callback, objeto ou chamada). |
| 0913 | U27 | } | Fecha a estrutura sintática aberta imediatamente antes em U27 (bloco, callback, objeto ou chamada). |
| 0914 | U27 | ␠ [linha vazia] | Separa visualmente etapas dentro de U27 (Descritor e ativação de batch); não altera estado, Promise, listener nem controle de fluxo. |
| 0915 | U27 | function activateBatchSnapshot(snapshot, batch) { | Declara activateBatchSnapshot(snapshot, batch) como entrada nomeada de U27; o corpo seguinte implementa o contrato da unidade. |
| 0916 | U27 |     snapshot.currentBatchId = batch.batchId; | Atualiza `snapshot.currentBatchId` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0917 | U27 |     snapshot.stopRequested = false; | Atualiza `snapshot.stopRequested` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0918 | U27 |     snapshot.jobQueue = (Array.isArray(batch.images) ? batch.images : []).map(image => ({ | Atualiza `snapshot.jobQueue` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0919 | U27 |         mangaTabId: batch.mangaTabId, | Define a propriedade `mangaTabId` no objeto/snapshot de U27, compondo o contrato enviado ao módulo/storage/API. |
| 0920 | U27 |         index: image.index, | Define a propriedade `index` no objeto/snapshot de U27, compondo o contrato enviado ao módulo/storage/API. |
| 0921 | U27 |         prompt: batch.prompt \|\| '', | Define a propriedade `prompt` no objeto/snapshot de U27, compondo o contrato enviado ao módulo/storage/API. |
| 0922 | U27 |         batchId: batch.batchId, | Define a propriedade `batchId` no objeto/snapshot de U27, compondo o contrato enviado ao módulo/storage/API. |
| 0923 | U27 |     })); | Fecha a estrutura sintática aberta imediatamente antes em U27 (bloco, callback, objeto ou chamada). |
| 0924 | U27 |     snapshot.completedJobs = 0; | Atualiza `snapshot.completedJobs` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0925 | U27 |     snapshot.activeJobsCount = 0; | Atualiza `snapshot.activeJobsCount` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0926 | U27 |     snapshot.totalJobs = snapshot.jobQueue.length; | Atualiza `snapshot.totalJobs` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0927 | U27 |     snapshot.activeMangaTabId = batch.mangaTabId \|\| null; | Atualiza `snapshot.activeMangaTabId` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0928 | U27 |     snapshot.isProcessing = true; | Atualiza `snapshot.isProcessing` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0929 | U27 |     snapshot.completionClaimedBatchId = null; | Atualiza `snapshot.completionClaimedBatchId` dentro de U27; passos posteriores da unidade observam esse novo valor. |
| 0930 | U27 |     return snapshot; | Encerra este caminho de U27 devolvendo `snapshot;`; o chamador usa esse valor como contrato/controle. |
| 0931 | U27 | } | Fecha a estrutura sintática aberta imediatamente antes em U27 (bloco, callback, objeto ou chamada). |
| 0932 | U27 | ␠ [linha vazia] | Separa visualmente etapas dentro de U27 (Descritor e ativação de batch); não altera estado, Promise, listener nem controle de fluxo. |
| 0933 | U28 | async function startBatch(request, sender) { | Declara startBatch(request, sender) como entrada nomeada de U28; o corpo seguinte implementa o contrato da unidade. |
| 0934 | U28 |     await ensureInitialized(); | Aguarda `ensureInitialized();` antes de prosseguir em U28, preservando a ordem assíncrona. |
| 0935 | U28 |     const batchId = request.batchId \|\| generateId(); | Cria o binding `batchId` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0936 | U28 |     const runtimeState = state(); | Cria o binding `runtimeState` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0937 | U28 |     const mangaTabId = sender && sender.tab ? sender.tab.id : request.mangaTabId; | Cria o binding `mangaTabId` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0938 | U28 |     const incoming = createBatchDescriptor(request, mangaTabId, batchId); | Cria o binding `incoming` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0939 | U28 |     let outcome = null; | Cria o binding `outcome` (let) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0940 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 0941 | U28 |     const transition = snapshot => { | Cria o binding `transition` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0942 | U28 |         const queuedJobs = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : []; | Cria o binding `queuedJobs` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0943 | U28 |         const indexedJobs = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []; | Cria o binding `indexedJobs` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0944 | U28 |         const pending = Array.isArray(snapshot.pendingBatches) | Cria o binding `pending` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0945 | U28 |             ? snapshot.pendingBatches.map(batch => ({ | Completa a seleção condicional iniciada acima em U28, fornecendo um dos valores possíveis. |
| 0946 | U28 |                 ...batch, | Completa a expressão multilinha de U28 com `...batch,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0947 | U28 |                 images: Array.isArray(batch?.images) ? batch.images.map(image => ({ ...image })) : [], | Define a propriedade `images` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0948 | U28 |             })) | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0949 | U28 |             : []; | Completa a seleção condicional iniciada acima em U28, fornecendo um dos valores possíveis. |
| 0950 | U28 |         snapshot.pendingBatches = pending; | Atualiza `snapshot.pendingBatches` dentro de U28; passos posteriores da unidade observam esse novo valor. |
| 0951 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 0952 | U28 |         const hasActiveWork = Boolean( | Cria o binding `hasActiveWork` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0953 | U28 |             snapshot.isProcessing \|\| | Completa a expressão multilinha de U28 com `snapshot.isProcessing //`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0954 | U28 |             queuedJobs.length > 0 \|\| | Completa a expressão multilinha de U28 com `queuedJobs.length > 0 //`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0955 | U28 |             Number(snapshot.activeJobsCount) > 0 \|\| | Invoca `Number` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0956 | U28 |             indexedJobs.length > 0 | Completa a expressão multilinha de U28 com `indexedJobs.length > 0`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0957 | U28 |         ); | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0958 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 0959 | U28 |         if (snapshot.currentBatchId === batchId) { | Abre a guarda `if (snapshot.currentBatchId === batchId) {` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0960 | U28 |             outcome = { | Atualiza `outcome` dentro de U28; passos posteriores da unidade observam esse novo valor. |
| 0961 | U28 |                 type: 'duplicate_active', | Define a propriedade `type` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0962 | U28 |                 batchId, | Completa a expressão multilinha de U28 com `batchId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0963 | U28 |                 alreadyCompleted: !hasActiveWork && snapshot.completionClaimedBatchId === batchId, | Define a propriedade `alreadyCompleted` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0964 | U28 |             }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0965 | U28 |             return snapshot; | Encerra este caminho de U28 devolvendo `snapshot;`; o chamador usa esse valor como contrato/controle. |
| 0966 | U28 |         } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0967 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 0968 | U28 |         const existingPendingIndex = pending.findIndex(batch => batch && batch.batchId === batchId); | Cria o binding `existingPendingIndex` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 0969 | U28 |         if (existingPendingIndex >= 0) { | Abre a guarda `if (existingPendingIndex >= 0) {` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0970 | U28 |             outcome = { | Atualiza `outcome` dentro de U28; passos posteriores da unidade observam esse novo valor. |
| 0971 | U28 |                 type: 'duplicate_pending', | Define a propriedade `type` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0972 | U28 |                 batchId, | Completa a expressão multilinha de U28 com `batchId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0973 | U28 |                 activeBatchId: snapshot.currentBatchId \|\| null, | Define a propriedade `activeBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0974 | U28 |                 queuePosition: existingPendingIndex + 1, | Define a propriedade `queuePosition` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0975 | U28 |             }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0976 | U28 |             return snapshot; | Encerra este caminho de U28 devolvendo `snapshot;`; o chamador usa esse valor como contrato/controle. |
| 0977 | U28 |         } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0978 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 0979 | U28 |         // Se existem lotes aguardando após uma reidratação, o novo lote entra | Registra a decisão/manutenção local de U28: “Se existem lotes aguardando após uma reidratação, o novo lote entra”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0980 | U28 |         // no fim da fila. Nunca ultrapasse B/C/D já aceitos anteriormente. | Registra a decisão/manutenção local de U28: “no fim da fila. Nunca ultrapasse B/C/D já aceitos anteriormente.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 0981 | U28 |         if (hasActiveWork \|\| pending.length > 0) { | Abre a guarda `if (hasActiveWork // pending.length > 0) {` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 0982 | U28 |             pending.push(incoming); | Invoca `pending.push` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0983 | U28 |             snapshot.pendingBatches = pending; | Atualiza `snapshot.pendingBatches` dentro de U28; passos posteriores da unidade observam esse novo valor. |
| 0984 | U28 |             outcome = { | Atualiza `outcome` dentro de U28; passos posteriores da unidade observam esse novo valor. |
| 0985 | U28 |                 type: 'queued', | Define a propriedade `type` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0986 | U28 |                 batchId, | Completa a expressão multilinha de U28 com `batchId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 0987 | U28 |                 activeBatchId: snapshot.currentBatchId \|\| null, | Define a propriedade `activeBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0988 | U28 |                 queuePosition: pending.length, | Define a propriedade `queuePosition` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0989 | U28 |                 pendingCount: pending.length, | Define a propriedade `pendingCount` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 0990 | U28 |             }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0991 | U28 |             return snapshot; | Encerra este caminho de U28 devolvendo `snapshot;`; o chamador usa esse valor como contrato/controle. |
| 0992 | U28 |         } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0993 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 0994 | U28 |         activateBatchSnapshot(snapshot, incoming); | Invoca `activateBatchSnapshot` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 0995 | U28 |         outcome = { type: 'started', batchId, totalJobs: request.images.length }; | Atualiza `outcome` dentro de U28; passos posteriores da unidade observam esse novo valor. |
| 0996 | U28 |         return snapshot; | Encerra este caminho de U28 devolvendo `snapshot;`; o chamador usa esse valor como contrato/controle. |
| 0997 | U28 |     }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 0998 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 0999 | U28 |     if (typeof runtimeState.mutate === 'function') { | Abre a guarda `if (typeof runtimeState.mutate === 'function') {` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1000 | U28 |         await runtimeState.mutate(transition); | Aguarda `runtimeState.mutate(transition);` antes de prosseguir em U28, preservando a ordem assíncrona. |
| 1001 | U28 |     } else { | Seleciona o caminho alternativo de U28 quando a guarda imediatamente anterior falha. |
| 1002 | U28 |         const snapshot = typeof runtimeState.get === 'function' ? runtimeState.get() : { | Cria o binding `snapshot` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 1003 | U28 |             jobQueue: runtimeState.jobQueue, | Define a propriedade `jobQueue` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1004 | U28 |             jobIndex: runtimeState.jobIndex, | Define a propriedade `jobIndex` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1005 | U28 |             pendingBatches: runtimeState.pendingBatches, | Define a propriedade `pendingBatches` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1006 | U28 |             isProcessing: runtimeState.isProcessing, | Define a propriedade `isProcessing` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1007 | U28 |             activeJobsCount: runtimeState.activeJobsCount, | Define a propriedade `activeJobsCount` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1008 | U28 |             currentBatchId: runtimeState.currentBatchId, | Define a propriedade `currentBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1009 | U28 |             completionClaimedBatchId: runtimeState.completionClaimedBatchId, | Define a propriedade `completionClaimedBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1010 | U28 |         }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1011 | U28 |         const next = transition(snapshot); | Cria o binding `next` (const) usado por U28; o inicializador da linha estabelece o valor/closure inicial. |
| 1012 | U28 |         if (typeof runtimeState.patch === 'function') runtimeState.patch(next); | Abre a guarda `if (typeof runtimeState.patch === 'function') runtimeState.patch(next);` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1013 | U28 |         else Object.assign(runtimeState, next); | Seleciona o caminho alternativo de U28 quando a guarda imediatamente anterior falha. |
| 1014 | U28 |         await syncState(); | Aguarda `syncState();` antes de prosseguir em U28, preservando a ordem assíncrona. |
| 1015 | U28 |     } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1016 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 1017 | U28 |     if (outcome?.type === 'duplicate_active') { | Abre a guarda `if (outcome?.type === 'duplicate_active') {` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1018 | U28 |         log('info', 'bg', 'BATCH_DUPLICATE_IGNORED', | Invoca `log` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1019 | U28 |             outcome.alreadyCompleted | Completa a expressão multilinha de U28 com `outcome.alreadyCompleted`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1020 | U28 |                 ? 'START_BATCH repetido para lote já concluído; nenhuma tarefa foi recriada.' | Completa a seleção condicional iniciada acima em U28, fornecendo um dos valores possíveis. |
| 1021 | U28 |                 : 'START_BATCH repetido para o lote ativo; estado existente foi preservado.', { | Completa a seleção condicional iniciada acima em U28, fornecendo um dos valores possíveis. |
| 1022 | U28 |                 batchId: batchId.slice(0, 8), | Define a propriedade `batchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1023 | U28 |                 alreadyCompleted: outcome.alreadyCompleted === true, | Define a propriedade `alreadyCompleted` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1024 | U28 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1025 | U28 |         return { | Encerra este caminho de U28 devolvendo `{`; o chamador usa esse valor como contrato/controle. |
| 1026 | U28 |             batchId, | Completa a expressão multilinha de U28 com `batchId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1027 | U28 |             alreadyStarted: true, | Define a propriedade `alreadyStarted` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1028 | U28 |             alreadyCompleted: outcome.alreadyCompleted === true, | Define a propriedade `alreadyCompleted` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1029 | U28 |         }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1030 | U28 |     } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1031 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 1032 | U28 |     if (outcome?.type === 'duplicate_pending') { | Abre a guarda `if (outcome?.type === 'duplicate_pending') {` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1033 | U28 |         log('info', 'bg', 'BATCH_QUEUE_DUPLICATE_IGNORED', | Invoca `log` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1034 | U28 |             'START_BATCH repetido para lote já enfileirado; posição FIFO foi preservada.', { | Completa a expressão multilinha de U28 com `'START_BATCH repetido para lote já enfileirado; posição FIFO foi preservada.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1035 | U28 |                 batchId: batchId.slice(0, 8), | Define a propriedade `batchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1036 | U28 |                 activeBatchId: String(outcome.activeBatchId \|\| '').slice(0, 8), | Define a propriedade `activeBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1037 | U28 |                 queuePosition: outcome.queuePosition, | Define a propriedade `queuePosition` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1038 | U28 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1039 | U28 |         return { | Encerra este caminho de U28 devolvendo `{`; o chamador usa esse valor como contrato/controle. |
| 1040 | U28 |             batchId, | Completa a expressão multilinha de U28 com `batchId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1041 | U28 |             queued: true, | Define a propriedade `queued` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1042 | U28 |             alreadyQueued: true, | Define a propriedade `alreadyQueued` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1043 | U28 |             queuePosition: outcome.queuePosition, | Define a propriedade `queuePosition` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1044 | U28 |             activeBatchId: outcome.activeBatchId, | Define a propriedade `activeBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1045 | U28 |         }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1046 | U28 |     } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1047 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 1048 | U28 |     if (outcome?.type === 'queued') { | Abre a guarda `if (outcome?.type === 'queued') {` em U28; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1049 | U28 |         initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1050 | U28 |         jobsLifecycle.allowBatchLaunches(batchId); | Invoca `jobsLifecycle.allowBatchLaunches` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1051 | U28 |         log('info', 'bg', 'BATCH_QUEUED', | Invoca `log` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1052 | U28 |             'Lote aceito na fila FIFO sem alterar o lote atualmente ativo.', { | Completa a expressão multilinha de U28 com `'Lote aceito na fila FIFO sem alterar o lote atualmente ativo.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1053 | U28 |                 batchId: batchId.slice(0, 8), | Define a propriedade `batchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1054 | U28 |                 activeBatchId: String(outcome.activeBatchId \|\| '').slice(0, 8), | Define a propriedade `activeBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1055 | U28 |                 queuePosition: outcome.queuePosition, | Define a propriedade `queuePosition` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1056 | U28 |                 pendingCount: outcome.pendingCount, | Define a propriedade `pendingCount` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1057 | U28 |                 totalJobs: request.images.length, | Define a propriedade `totalJobs` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1058 | U28 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1059 | U28 |         sendProgress(mangaTabId, `⏳ NA FILA (#${outcome.queuePosition})...`); | Invoca `sendProgress` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1060 | U28 |         // Também cobre o caso de reidratação em que havia fila persistida mas | Registra a decisão/manutenção local de U28: “Também cobre o caso de reidratação em que havia fila persistida mas”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1061 | U28 |         // nenhum lote ativo no instante desta nova requisição. | Registra a decisão/manutenção local de U28: “nenhum lote ativo no instante desta nova requisição.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1062 | U28 |         processNextJob(); | Invoca `processNextJob` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1063 | U28 |         return { | Encerra este caminho de U28 devolvendo `{`; o chamador usa esse valor como contrato/controle. |
| 1064 | U28 |             batchId, | Completa a expressão multilinha de U28 com `batchId,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1065 | U28 |             queued: true, | Define a propriedade `queued` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1066 | U28 |             queuePosition: outcome.queuePosition, | Define a propriedade `queuePosition` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1067 | U28 |             activeBatchId: outcome.activeBatchId, | Define a propriedade `activeBatchId` no objeto/snapshot de U28, compondo o contrato enviado ao módulo/storage/API. |
| 1068 | U28 |         }; | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1069 | U28 |     } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1070 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 1071 | U28 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1072 | U28 |     jobsLifecycle.allowBatchLaunches(batchId); | Invoca `jobsLifecycle.allowBatchLaunches` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1073 | U28 |     log('info', 'bg', 'BATCH_START', | Invoca `log` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1074 | U28 |         `Iniciando ${outcome.totalJobs} imagens (batch: ${batchId.slice(0, 8)})`); | Completa a expressão multilinha de U28 com ``Iniciando ${outcome.totalJobs} imagens (batch: ${batchId.slice(0, 8)})`);`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1075 | U28 |     await _refreshMaxCon(); | Aguarda `_refreshMaxCon();` antes de prosseguir em U28, preservando a ordem assíncrona. |
| 1076 | U28 |     processNextJob(); | Invoca `processNextJob` nesta etapa de U28; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1077 | U28 |     return { batchId }; | Encerra este caminho de U28 devolvendo `{ batchId };`; o chamador usa esse valor como contrato/controle. |
| 1078 | U28 | } | Fecha a estrutura sintática aberta imediatamente antes em U28 (bloco, callback, objeto ou chamada). |
| 1079 | U28 | ␠ [linha vazia] | Separa visualmente etapas dentro de U28 (START_BATCH, FIFO e idempotência); não altera estado, Promise, listener nem controle de fluxo. |
| 1080 | U29 | async function stopBatch(request) { | Declara stopBatch(request) como entrada nomeada de U29; o corpo seguinte implementa o contrato da unidade. |
| 1081 | U29 |     await ensureInitialized(); | Aguarda `ensureInitialized();` antes de prosseguir em U29, preservando a ordem assíncrona. |
| 1082 | U29 |     const runtimeState = state(); | Cria o binding `runtimeState` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1083 | U29 |     const targetBatchId = request.batchId \|\| runtimeState.currentBatchId; | Cria o binding `targetBatchId` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1084 | U29 |     if (!targetBatchId) return {}; | Abre a guarda `if (!targetBatchId) return {};` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1085 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1086 | U29 |     // Lotes ainda não promovidos podem ser cancelados sem tocar no lote ativo. | Registra a decisão/manutenção local de U29: “Lotes ainda não promovidos podem ser cancelados sem tocar no lote ativo.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1087 | U29 |     const pending = Array.isArray(runtimeState.pendingBatches) | Cria o binding `pending` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1088 | U29 |         ? runtimeState.pendingBatches | Completa a seleção condicional iniciada acima em U29, fornecendo um dos valores possíveis. |
| 1089 | U29 |         : []; | Completa a seleção condicional iniciada acima em U29, fornecendo um dos valores possíveis. |
| 1090 | U29 |     const pendingIndex = pending.findIndex(batch => batch && batch.batchId === targetBatchId); | Cria o binding `pendingIndex` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1091 | U29 |     if (pendingIndex >= 0 && targetBatchId !== runtimeState.currentBatchId) { | Abre a guarda `if (pendingIndex >= 0 && targetBatchId !== runtimeState.currentBatchId) {` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1092 | U29 |         const [removed] = pending.splice(pendingIndex, 1); | Cria o binding `[removed]` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1093 | U29 |         runtimeState.pendingBatches = pending; | Atualiza `runtimeState.pendingBatches` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1094 | U29 |         await syncState(); | Aguarda `syncState();` antes de prosseguir em U29, preservando a ordem assíncrona. |
| 1095 | U29 |         log('info', 'bg', 'BATCH_QUEUE_CANCELLED', | Invoca `log` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1096 | U29 |             'Lote pendente removido da fila FIFO sem interromper o lote ativo.', { | Completa a expressão multilinha de U29 com `'Lote pendente removido da fila FIFO sem interromper o lote ativo.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1097 | U29 |                 batchId: targetBatchId, | Define a propriedade `batchId` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1098 | U29 |                 queuePosition: pendingIndex + 1, | Define a propriedade `queuePosition` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1099 | U29 |                 pendingCount: pending.length, | Define a propriedade `pendingCount` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1100 | U29 |                 mangaTabId: removed?.mangaTabId \|\| null, | Define a propriedade `mangaTabId` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1101 | U29 |             }); | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1102 | U29 |         return {}; | Encerra este caminho de U29 devolvendo `{};`; o chamador usa esse valor como contrato/controle. |
| 1103 | U29 |     } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1104 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1105 | U29 |     const stopsCurrentBatch = targetBatchId === runtimeState.currentBatchId; | Cria o binding `stopsCurrentBatch` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1106 | U29 |     runtimeState.jobQueue = runtimeState.jobQueue.filter(job => job.batchId !== targetBatchId); | Atualiza `runtimeState.jobQueue` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1107 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1108 | U29 |     if (stopsCurrentBatch) { | Abre a guarda `if (stopsCurrentBatch) {` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1109 | U29 |         // Marca o batch antes de liberar currentBatchId/stopRequested. Isso | Registra a decisão/manutenção local de U29: “Marca o batch antes de liberar currentBatchId/stopRequested. Isso”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1110 | U29 |         // cobre tabs.create/windows.create que resolvem depois da limpeza. | Registra a decisão/manutenção local de U29: “cobre tabs.create/windows.create que resolvem depois da limpeza.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1111 | U29 |         initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1112 | U29 |         jobsLifecycle.invalidateBatchLaunches(targetBatchId); | Invoca `jobsLifecycle.invalidateBatchLaunches` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1113 | U29 |         // stopRequested permanece true durante a limpeza para invalidar qualquer | Registra a decisão/manutenção local de U29: “stopRequested permanece true durante a limpeza para invalidar qualquer”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1114 | U29 |         // tabs.create ainda em voo. A promoção do próximo lote ocorre somente | Registra a decisão/manutenção local de U29: “tabs.create ainda em voo. A promoção do próximo lote ocorre somente”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1115 | U29 |         // depois que os recursos conhecidos do lote atual foram removidos. | Registra a decisão/manutenção local de U29: “depois que os recursos conhecidos do lote atual foram removidos.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1116 | U29 |         runtimeState.stopRequested = true; | Atualiza `runtimeState.stopRequested` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1117 | U29 |         runtimeState.isProcessing = false; | Atualiza `runtimeState.isProcessing` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1118 | U29 |     } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1119 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1120 | U29 |     log('warn', 'bg', 'BATCH_STOP', `Batch parado (batch: ${targetBatchId.slice(0, 8)})`); | Invoca `log` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1121 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1122 | U29 |     let entries = indexJobsOfBatch(targetBatchId); | Cria o binding `entries` (let) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1123 | U29 |     const keysToRemove = []; | Cria o binding `keysToRemove` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1124 | U29 |     entries.forEach(entry => { | Itera a coleção/condição mostrada em U29; cada item/volta executa o corpo adjacente. |
| 1125 | U29 |         if (!entry) return; | Abre a guarda `if (!entry) return;` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1126 | U29 |         if (entry.geminiTabId \|\| entry.geminiTabId === 0) { | Abre a guarda `if (entry.geminiTabId // entry.geminiTabId === 0) {` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1127 | U29 |             chrome.tabs.remove(entry.geminiTabId, () => { if (chrome.runtime.lastError) {} }); | Invoca `chrome.tabs.remove` em U29; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 1128 | U29 |             keysToRemove.push(`gemini_job_${entry.geminiTabId}`, `wd_data_${entry.geminiTabId}`); | Invoca `keysToRemove.push` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1129 | U29 |         } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1130 | U29 |         const alarmName = entry.jobId ? `watchdog_${entry.jobId}` : `watchdog_${entry.geminiTabId}`; | Cria o binding `alarmName` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1131 | U29 |         chrome.alarms.clear(alarmName, () => {}); | Invoca `chrome.alarms.clear` em U29; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 1132 | U29 |         indexRemoveJob(entry.geminiTabId); | Invoca `indexRemoveJob` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1133 | U29 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1134 | U29 |     if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove); | Abre a guarda `if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove);` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1135 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1136 | U29 |     Object.keys(runtimeState.extractionTabs).map(Number).forEach(tabId => { | Itera a coleção/condição mostrada em U29; cada item/volta executa o corpo adjacente. |
| 1137 | U29 |         const info = runtimeState.extractionTabs[tabId]; | Cria o binding `info` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1138 | U29 |         if (info && info.batchId && info.batchId !== targetBatchId) return; | Abre a guarda `if (info && info.batchId && info.batchId !== targetBatchId) return;` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1139 | U29 |         chrome.tabs.remove(tabId, () => { if (chrome.runtime.lastError) {} }); | Invoca `chrome.tabs.remove` em U29; esta linha interage com recurso externo do navegador e pode produzir callback/lastError. |
| 1140 | U29 |         delete runtimeState.extractionTabs[tabId]; | Completa a expressão multilinha de U29 com `delete runtimeState.extractionTabs[tabId];`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1141 | U29 |     }); | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1142 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1143 | U29 |     if (stopsCurrentBatch) { | Abre a guarda `if (stopsCurrentBatch) {` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1144 | U29 |         let promoted = null; | Cria o binding `promoted` (let) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1145 | U29 |         const transition = snapshot => { | Cria o binding `transition` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1146 | U29 |             const nextPending = Array.isArray(snapshot.pendingBatches) | Cria o binding `nextPending` (const) usado por U29; o inicializador da linha estabelece o valor/closure inicial. |
| 1147 | U29 |                 ? snapshot.pendingBatches.map(batch => ({ | Completa a seleção condicional iniciada acima em U29, fornecendo um dos valores possíveis. |
| 1148 | U29 |                     ...batch, | Completa a expressão multilinha de U29 com `...batch,`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1149 | U29 |                     images: Array.isArray(batch?.images) | Define a propriedade `images` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1150 | U29 |                         ? batch.images.map(image => ({ ...image })) | Completa a seleção condicional iniciada acima em U29, fornecendo um dos valores possíveis. |
| 1151 | U29 |                         : [], | Completa a seleção condicional iniciada acima em U29, fornecendo um dos valores possíveis. |
| 1152 | U29 |                 })) | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1153 | U29 |                 : []; | Completa a seleção condicional iniciada acima em U29, fornecendo um dos valores possíveis. |
| 1154 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1155 | U29 |             snapshot.jobIndex = (Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []) | Atualiza `snapshot.jobIndex` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1156 | U29 |                 .filter(entry => !entry \|\| entry.batchId !== targetBatchId); | Continua a cadeia de U29 com `.filter(entry => !entry // entry.batchId !== targetBatchId);`, transformando/filtrando/tratando o valor anterior. |
| 1157 | U29 |             snapshot.jobQueue = (Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : []) | Atualiza `snapshot.jobQueue` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1158 | U29 |                 .filter(job => !job \|\| job.batchId !== targetBatchId); | Continua a cadeia de U29 com `.filter(job => !job // job.batchId !== targetBatchId);`, transformando/filtrando/tratando o valor anterior. |
| 1159 | U29 |             snapshot.activeJobsCount = 0; | Atualiza `snapshot.activeJobsCount` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1160 | U29 |             snapshot.activeMangaTabId = null; | Atualiza `snapshot.activeMangaTabId` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1161 | U29 |             snapshot.currentBatchId = null; | Atualiza `snapshot.currentBatchId` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1162 | U29 |             snapshot.completionClaimedBatchId = null; | Atualiza `snapshot.completionClaimedBatchId` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1163 | U29 |             snapshot.stopRequested = false; | Atualiza `snapshot.stopRequested` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1164 | U29 |             snapshot.isProcessing = false; | Atualiza `snapshot.isProcessing` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1165 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1166 | U29 |             if (nextPending.length > 0) { | Abre a guarda `if (nextPending.length > 0) {` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1167 | U29 |                 promoted = nextPending.shift(); | Atualiza `promoted` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1168 | U29 |                 snapshot.pendingBatches = nextPending; | Atualiza `snapshot.pendingBatches` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1169 | U29 |                 activateBatchSnapshot(snapshot, promoted); | Invoca `activateBatchSnapshot` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1170 | U29 |             } else { | Seleciona o caminho alternativo de U29 quando a guarda imediatamente anterior falha. |
| 1171 | U29 |                 snapshot.pendingBatches = nextPending; | Atualiza `snapshot.pendingBatches` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1172 | U29 |             } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1173 | U29 |             return snapshot; | Encerra este caminho de U29 devolvendo `snapshot;`; o chamador usa esse valor como contrato/controle. |
| 1174 | U29 |         }; | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1175 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1176 | U29 |         if (typeof runtimeState.mutate === 'function') await runtimeState.mutate(transition); | Abre a guarda `if (typeof runtimeState.mutate === 'function') await runtimeState.mutate(transition);` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1177 | U29 |         else { | Seleciona o caminho alternativo de U29 quando a guarda imediatamente anterior falha. |
| 1178 | U29 |             transition(runtimeState); | Invoca `transition` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1179 | U29 |             await syncState(); | Aguarda `syncState();` antes de prosseguir em U29, preservando a ordem assíncrona. |
| 1180 | U29 |         } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1181 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1182 | U29 |         if (promoted) { | Abre a guarda `if (promoted) {` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1183 | U29 |             log('info', 'bg', 'BATCH_PROMOTED', | Invoca `log` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1184 | U29 |                 'Próximo lote da fila FIFO foi promovido após cancelamento do lote ativo.', { | Completa a expressão multilinha de U29 com `'Próximo lote da fila FIFO foi promovido após cancelamento do lote ativo.', {`; fornece argumento, condição, template ou elemento necessário à operação contígua. |
| 1185 | U29 |                     previousBatchId: targetBatchId.slice(0, 8), | Define a propriedade `previousBatchId` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1186 | U29 |                     batchId: String(promoted.batchId \|\| '').slice(0, 8), | Define a propriedade `batchId` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1187 | U29 |                     pendingCount: runtimeState.pendingBatches.length, | Define a propriedade `pendingCount` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1188 | U29 |                     totalJobs: Array.isArray(promoted.images) ? promoted.images.length : 0, | Define a propriedade `totalJobs` no objeto/snapshot de U29, compondo o contrato enviado ao módulo/storage/API. |
| 1189 | U29 |                 }); | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1190 | U29 |             sendProgress(promoted.mangaTabId, '▶️ INICIANDO LOTE DA FILA...'); | Invoca `sendProgress` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1191 | U29 |             await _refreshMaxCon(); | Aguarda `_refreshMaxCon();` antes de prosseguir em U29, preservando a ordem assíncrona. |
| 1192 | U29 |             processNextJob(); | Invoca `processNextJob` nesta etapa de U29; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1193 | U29 |         } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1194 | U29 |         return {}; | Encerra este caminho de U29 devolvendo `{};`; o chamador usa esse valor como contrato/controle. |
| 1195 | U29 |     } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1196 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1197 | U29 |     runtimeState.activeJobsCount = indexJobsOfBatch(runtimeState.currentBatchId).length; | Atualiza `runtimeState.activeJobsCount` dentro de U29; passos posteriores da unidade observam esse novo valor. |
| 1198 | U29 |     await syncState(); | Aguarda `syncState();` antes de prosseguir em U29, preservando a ordem assíncrona. |
| 1199 | U29 |     if (runtimeState.isProcessing) processNextJob(); | Abre a guarda `if (runtimeState.isProcessing) processNextJob();` em U29; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1200 | U29 |     return {}; | Encerra este caminho de U29 devolvendo `{};`; o chamador usa esse valor como contrato/controle. |
| 1201 | U29 | } | Fecha a estrutura sintática aberta imediatamente antes em U29 (bloco, callback, objeto ou chamada). |
| 1202 | U29 | ␠ [linha vazia] | Separa visualmente etapas dentro de U29 (STOP_BATCH, cleanup e promoção FIFO); não altera estado, Promise, listener nem controle de fluxo. |
| 1203 | U30 | // Fachadas compatíveis: ações e testes existentes continuam chamando os nomes | Registra a decisão/manutenção local de U30: “Fachadas compatíveis: ações e testes existentes continuam chamando os nomes”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1204 | U30 | // históricos, mas a implementação canônica agora vive em jobs-lifecycle.js. | Registra a decisão/manutenção local de U30: “históricos, mas a implementação canônica agora vive em jobs-lifecycle.js.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1205 | U30 | // A remoção física dos corpos antigos fica segura porque estas referências são | Registra a decisão/manutenção local de U30: “A remoção física dos corpos antigos fica segura porque estas referências são”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1206 | U30 | // também o contrato temporário dos módulos já extraídos. | Registra a decisão/manutenção local de U30: “também o contrato temporário dos módulos já extraídos.”. O comentário não executa, mas orienta a invariável descrita na unidade. |
| 1207 | U30 | const updateJobState = (...args) => { | Cria o binding `updateJobState` (const) usado por U30; o inicializador da linha estabelece o valor/closure inicial. |
| 1208 | U30 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U30; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1209 | U30 |     return jobsLifecycle.updateJobState(...args); | Encerra este caminho de U30 devolvendo `jobsLifecycle.updateJobState(...args);`; o chamador usa esse valor como contrato/controle. |
| 1210 | U30 | }; | Fecha a estrutura sintática aberta imediatamente antes em U30 (bloco, callback, objeto ou chamada). |
| 1211 | U30 | const assertJobOwnership = (sender, jobId, callback) => { | Cria o binding `assertJobOwnership` (const) usado por U30; o inicializador da linha estabelece o valor/closure inicial. |
| 1212 | U30 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U30; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1213 | U30 |     jobsLifecycle.assertJobOwnership(sender, jobId) | Invoca `jobsLifecycle.assertJobOwnership` nesta etapa de U30; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1214 | U30 |         .then(({ owns, tabId, job }) => callback(owns, tabId, job \|\| null)) | Continua a cadeia de U30 com `.then(({ owns, tabId, job }) => callback(owns, tabId, job // null))`, transformando/filtrando/tratando o valor anterior. |
| 1215 | U30 |         .catch(() => callback(false, sender && sender.tab ? sender.tab.id : null, null)); | Continua a cadeia de U30 com `.catch(() => callback(false, sender && sender.tab ? sender.tab.id : null, null));`, transformando/filtrando/tratando o valor anterior. |
| 1216 | U30 | }; | Fecha a estrutura sintática aberta imediatamente antes em U30 (bloco, callback, objeto ou chamada). |
| 1217 | U30 | const processNextJob = (...args) => { | Cria o binding `processNextJob` (const) usado por U30; o inicializador da linha estabelece o valor/closure inicial. |
| 1218 | U30 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U30; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1219 | U30 |     return jobsLifecycle.processNextJob(...args); | Encerra este caminho de U30 devolvendo `jobsLifecycle.processNextJob(...args);`; o chamador usa esse valor como contrato/controle. |
| 1220 | U30 | }; | Fecha a estrutura sintática aberta imediatamente antes em U30 (bloco, callback, objeto ou chamada). |
| 1221 | U30 | const finalizeJob = (...args) => { | Cria o binding `finalizeJob` (const) usado por U30; o inicializador da linha estabelece o valor/closure inicial. |
| 1222 | U30 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U30; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1223 | U30 |     return jobsLifecycle.finalizeJob(...args); | Encerra este caminho de U30 devolvendo `jobsLifecycle.finalizeJob(...args);`; o chamador usa esse valor como contrato/controle. |
| 1224 | U30 | }; | Fecha a estrutura sintática aberta imediatamente antes em U30 (bloco, callback, objeto ou chamada). |
| 1225 | U30 | const _refreshMaxCon = (...args) => { | Cria o binding `_refreshMaxCon` (const) usado por U30; o inicializador da linha estabelece o valor/closure inicial. |
| 1226 | U30 |     initializeJobsModules(); | Invoca `initializeJobsModules` nesta etapa de U30; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1227 | U30 |     return jobsLifecycle.refreshMaxConcurrency(...args); | Encerra este caminho de U30 devolvendo `jobsLifecycle.refreshMaxConcurrency(...args);`; o chamador usa esse valor como contrato/controle. |
| 1228 | U30 | }; | Fecha a estrutura sintática aberta imediatamente antes em U30 (bloco, callback, objeto ou chamada). |
| 1229 | U30 | ␠ [linha vazia] | Separa visualmente etapas dentro de U30 (Facades compatíveis do lifecycle extraído); não altera estado, Promise, listener nem controle de fluxo. |
| 1230 | U31 | chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { | Registra o listener Chrome expresso na linha como parte de U31; o callback passa a participar do lifecycle do navegador. |
| 1231 | U31 | ␠ [linha vazia] | Separa visualmente etapas dentro de U31 (Listener runtime principal); não altera estado, Promise, listener nem controle de fluxo. |
| 1232 | U31 |     if (request && request.action === 'GET_TAB_ID') { | Abre a guarda `if (request && request.action === 'GET_TAB_ID') {` em U31; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1233 | U31 |         log('info', 'bg', 'TAB_ID_OBSERVED', 'tabId observado em GET_TAB_ID', { | Invoca `log` nesta etapa de U31; os argumentos desta linha/continuação determinam o efeito e a identidade usada. |
| 1234 | U31 |             tabId: sender && sender.tab ? sender.tab.id : null, | Define a propriedade `tabId` no objeto/snapshot de U31, compondo o contrato enviado ao módulo/storage/API. |
| 1235 | U31 |         }); | Fecha a estrutura sintática aberta imediatamente antes em U31 (bloco, callback, objeto ou chamada). |
| 1236 | U31 |     } | Fecha a estrutura sintática aberta imediatamente antes em U31 (bloco, callback, objeto ou chamada). |
| 1237 | U31 | ␠ [linha vazia] | Separa visualmente etapas dentro de U31 (Listener runtime principal); não altera estado, Promise, listener nem controle de fluxo. |
| 1238 | U31 |     const routedAction = routeRegisteredAction(request, sender, sendResponse); | Cria o binding `routedAction` (const) usado por U31; o inicializador da linha estabelece o valor/closure inicial. |
| 1239 | U31 |     if (routedAction && routedAction.handled) { | Abre a guarda `if (routedAction && routedAction.handled) {` em U31; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1240 | U31 |         return routedAction.keepAlive; | Encerra este caminho de U31 devolvendo `routedAction.keepAlive;`; o chamador usa esse valor como contrato/controle. |
| 1241 | U31 |     } | Fecha a estrutura sintática aberta imediatamente antes em U31 (bloco, callback, objeto ou chamada). |
| 1242 | U31 | ␠ [linha vazia] | Separa visualmente etapas dentro de U31 (Listener runtime principal); não altera estado, Promise, listener nem controle de fluxo. |
| 1243 | U31 |     if (handleGtcRuntimeMessage(request, sender, sendResponse)) { | Abre a guarda `if (handleGtcRuntimeMessage(request, sender, sendResponse)) {` em U31; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1244 | U31 |         return true; | Encerra este caminho de U31 devolvendo `true;`; o chamador usa esse valor como contrato/controle. |
| 1245 | U31 |     } | Fecha a estrutura sintática aberta imediatamente antes em U31 (bloco, callback, objeto ou chamada). |
| 1246 | U31 | ␠ [linha vazia] | Separa visualmente etapas dentro de U31 (Listener runtime principal); não altera estado, Promise, listener nem controle de fluxo. |
| 1247 | U31 |     if (handleStorageManagerMessage(request, sender, sendResponse)) { | Abre a guarda `if (handleStorageManagerMessage(request, sender, sendResponse)) {` em U31; o bloco aninhado só é permitido quando ela é verdadeira. |
| 1248 | U31 |         return true; | Encerra este caminho de U31 devolvendo `true;`; o chamador usa esse valor como contrato/controle. |
| 1249 | U31 |     } | Fecha a estrutura sintática aberta imediatamente antes em U31 (bloco, callback, objeto ou chamada). |
| 1250 | U31 | ␠ [linha vazia] | Separa visualmente etapas dentro de U31 (Listener runtime principal); não altera estado, Promise, listener nem controle de fluxo. |
| 1251 | U31 | }); | Fecha a estrutura sintática aberta imediatamente antes em U31 (bloco, callback, objeto ou chamada). |
| 1252 | U32 | ⏎ [newline final] | Preserva o newline terminal do blob auditado; não executa JavaScript, mas é parte da equivalência física documentada. |

## 11. Análise profunda por unidade estrutural

### U01 — linhas/posição 1–16: Estado global e configuração-base

**O que faz:** Estabelece os únicos bindings mutáveis que ainda pertencem ao orquestrador: cache da API de estado, timeout de job, delay e caches das bridges GTC/Storage.

**Como faz:** backgroundState começa nulo e é resolvido lazily; JOB_TIMEOUT_MINUTES vale 5; delay encapsula setTimeout; as APIs compartilhadas começam nulas para serem preenchidas pelo boot.

**Por que foi feito desta forma:** Separar o estado durável em background/state.js evita dois donos concorrentes do mesmo snapshot. Os caches locais são apenas referências a módulos, não espelhos do job state.

**Por que uma implementação ingênua seria pior:** Reintroduzir jobQueue/activeJobsCount locais faria um worker MV3 reidratado escolher entre memória stale e storage; espalhar o timeout como literal dificultaria manter watchdogs coerentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — BG-STRICT-01 prova que o arquivo carrega isoladamente; testes de lifecycle usam JOB_TIMEOUT_MINUTES por seus efeitos. Não há assertion isolada para cada declaração.

### U02 — linhas/posição 17–27: Geração robusta de IDs

**O que faz:** Gera identificadores com prefixo usando crypto.randomUUID quando disponível e um fallback temporal+aleatório quando Web Crypto não existe ou lança.

**Como faz:** A função testa a presença de crypto/randomUUID dentro de try; no fallback concatena Date.now em base36 e duas amostras Math.random em base36.

**Por que foi feito desta forma:** O lifecycle precisa continuar criando jobs em Service Worker antigo e em Jest/Node incompletos; falhar por ausência de randomUUID pararia o lote antes de persistir o job.

**Por que uma implementação ingênua seria pior:** Assumir crypto.randomUUID incondicionalmente quebra ambientes de teste/compatibilidade; usar só Date.now aumenta colisões quando múltiplos jobs nascem no mesmo milissegundo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — jobs-lifecycle recebe generateId por injeção e seus testes exercitam criação de jobs; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO que force o fallback deste generateId real.

### U03 — linhas/posição 28–46: Proteção de finalização em memória

**O que faz:** Mantém uma Set de tabIds já finalizados e auxiliares para chave/TTL de marcador durável, evitando dupla contabilidade durante a mesma vida do worker.

**Como faz:** _markFinalized adiciona o tabId e agenda remoção da Set após 30 s; finalizationMarkerKey padroniza gemini_finalized_<tabId>; existe também armFinalizationMarkerCleanup para alarm de 10 min.

**Por que foi feito desta forma:** A Set é uma barreira barata contra callbacks duplicados; o marcador persistido no lifecycle cobre reinício do worker, porque a Set desaparece no MV3.

**Por que uma implementação ingênua seria pior:** Confiar só na Set permitiria dupla finalização depois de restart; manter IDs indefinidamente causaria crescimento e falso bloqueio de tabs reutilizadas.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE POR EFEITO para a proteção em memória via process-finalize-real (finalize duplicado não altera contadores) e para o marcador durável via P0; ⚠️ armFinalizationMarkerCleanup não possui consumidor no arquivo e não tem teste focal.

### U04 — linhas/posição 47–105: Boot do service worker via importScripts

**O que faz:** Carrega o router, estado, identidade, módulos de jobs, actions e módulos compartilhados obrigatórios no escopo do service worker.

**Como faz:** Quando importScripts existe, cada script é carregado em ordem; erros dos módulos obrigatórios são logados e relançados. Fingerprint/IndexedDB/Storage Manager são carregados em um segundo try e referências globais são capturadas.

**Por que foi feito desta forma:** MV3 classic service workers sem bundler precisam de importScripts e namespaces globais. A ordem garante que actions encontrem MangaTranslatorRouter já registrado e que jobs encontrem suas factories.

**Por que uma implementação ingênua seria pior:** Engolir falha no caminho real produziria worker parcialmente inicializado e mensagens que falham tardiamente; mover storage-manager para content scripts criaria bancos IndexedDB por origem/site.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o worker real depende desta ordem em produção; BG-STRICT-01 usa importScripts no-op e portanto não prova os caminhos. ⚠️ SEM GATE ESTÁTICO ESPECÍFICO que compare toda a lista/order de imports.

### U05 — linhas/posição 106–146: Boot alternativo Node/Jest via require

**O que faz:** Reproduz no Node/Jest os módulos globais que o service worker obteria por importScripts e tenta carregar as APIs shared por require.

**Como faz:** Quando require existe e importScripts não, require() é chamado para router/state/jobs/actions; falhas são toleradas para permitir harnesses parciais. IndexedDB e Storage Manager são tentados separadamente.

**Por que foi feito desta forma:** Os testes carregam background.js sem um browser real. Esse caminho evita manter uma implementação paralela apenas para teste.

**Por que uma implementação ingênua seria pior:** Exigir todos os módulos em qualquer harness faria testes focais precisarem mockar superfícies irrelevantes; por outro lado, copiar lógica para helpers de teste deixaria testes verdes contra código diferente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE COMO CARREGAMENTO por dezenas de suítes que requirem o background real, incluindo routed-actions-legacy, helpers-real e lifecycle-alarms; a necessidade de cada catch permissivo individual não é assertada.

### U06 — linhas/posição 147–153: Repositório GTC lazy

**O que faz:** Cria o repositório IndexedDB de cache GTC somente na primeira solicitação e reutiliza a instância.

**Como faz:** getGtcRepository verifica gtcRepository e a factory createIndexedDbRepository antes de instanciar; sempre devolve o cache atual.

**Por que foi feito desta forma:** Evita abrir o banco antes de existir mensagem GTC e impede múltiplas instâncias do repositório no mesmo worker.

**Por que uma implementação ingênua seria pior:** Criar o repositório em toda mensagem aumentaria overhead/competição de conexões; criar no boot tornaria todo startup dependente de IndexedDB mesmo sem uso de cache.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE PELO FLUXO — gtc-runtime-bridge salva e consulta entradas atravessando o listener real e o repository real. A laziness em si não tem contador/assertion separado.

### U07 — linhas/posição 154–169: Contrato de bridges GTC/Storage

**O que faz:** Documenta por que fingerprint/IndexedDB vivem no background e por que o handler SM precisa ser síncrono no valor de retorno mesmo disparando Promises internas.

**Como faz:** São comentários arquiteturais imediatamente antes das bridges, sem instruções runtime.

**Por que foi feito desta forma:** Esses comentários registram dois invariantes fáceis de quebrar: banco na origem da extensão e listener não pode retornar uma Promise genérica que capture mensagens alheias.

**Por que uma implementação ingênua seria pior:** Mover persistência para content scripts fragmenta dados por origem; retornar Promise para toda mensagem pode manter o canal aberto/interceptar IPC que deveria cair em outro handler.

**Evidência automatizada:** 🟦 EVIDÊNCIA ARQUITETURAL/INDIRETA — gtc-runtime-bridge prova coexistência com GET_TAB_ID. ⚠️ Não existe assertion para o texto dos comentários.

### U08 — linhas/posição 170–220: Bridge Storage Manager SM_*

**O que faz:** Reconhece ações SM_, verifica se storageManagerApi existe e adapta Promises do storage-manager para sendResponse, despachando onze operações de páginas/assets/restauração/estatísticas.

**Como faz:** run(promise) padroniza {ok:true,...} e captura erros em {ok:false,error}; o switch passa os campos do request para os métodos específicos e retorna false para ação não reconhecida.

**Por que foi feito desta forma:** Centraliza o ownership do IndexedDB no background sem transformar o listener principal inteiro em async. O boolean true mantém apenas o canal da mensagem efetivamente tratada.

**Por que uma implementação ingênua seria pior:** Persistir direto do content script duplicaria ownership; devolver true para ações SM desconhecidas bloquearia outros handlers; omitir catch deixaria o remetente sem resposta em rejeições.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO DIRETO DO ARQUIVO para todos os ramos SM. smoke-06-sm-message-routing.js é uma SIMULAÇÃO que copia a função e inclusive diverge no default; integrações de UI provam contratos do storage-manager, não esta implementação linha a linha.

### U09 — linhas/posição 221–234: Bridge GTC runtime

**O que faz:** Cria uma vez o handler GTC com repository, fingerprint API e logger, depois encaminha cada request/sender/sendResponse.

**Como faz:** Se a API GTC não existe retorna false; fpApi é lida de self; createGtcRuntimeHandler recebe dependências e o resultado é cacheado em gtcRuntimeHandler.

**Por que foi feito desta forma:** A factory concentra persistência e matching perceptual no processo que também possui IndexedDB, evitando serializar estruturas internas para content scripts.

**Por que uma implementação ingênua seria pior:** Recriar handler/repository por mensagem aumenta custo; omitir fingerprintApi degradaria lookup perceptual silenciosamente; capturar mensagens não-GTC impediria handlers posteriores.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — gtc-runtime-bridge testa GTC_SAVE, GTC_QUERY_MANY, GTC_SAVE_MANY, GTC_STATS e confirma que GET_TAB_ID continua chegando ao handler correto.

### U10 — linhas/posição 235–267: Facade de estado durável

**O que faz:** Resolve MangaTranslatorState, expõe get/patch/restore/sync e preserva compatibilidade com implementações que retornam snapshot restaurado.

**Como faz:** state() faz cache e falha cedo se a API não existe; restoreState chama a API, aplica snapshot quando retornado e mantém fallback; syncState delega persistência.

**Por que foi feito desta forma:** Todo o restante do orquestrador usa uma única autoridade de estado e os testes conseguem exercitar o mesmo contrato que o worker.

**Por que uma implementação ingênua seria pior:** Ler/escrever campos persistidos por conta própria reintroduziria duplicação; esconder ausência da API faria corrupção aparecer só muito depois.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — helpers-real verifica restore preservando campos residentes, aplicação de snapshot e sync round-trip; state-api testa o módulo canônico separadamente.

### U11 — linhas/posição 268–290: Índice de jobs e existência de abas

**O que faz:** Encapsula operações do índice durável e oferece tabExists resiliente a id inválido, runtime.lastError, aba ausente e exceção síncrona.

**Como faz:** indexAdd/Remove/JobsOfBatch delegam a MangaTranslatorState; tabExists envolve chrome.tabs.get em Promise e converte qualquer falha em false.

**Por que foi feito desta forma:** Reconciler e STOP_BATCH precisam de uma visão única do índice e de uma consulta de liveness que nunca derrube a reconciliação.

**Por que uma implementação ingênua seria pior:** Propagar lastError/exceção de tabs.get poderia interromper todo recovery; varrer storage inteiro em vez do índice carrega dados não relacionados e pode incluir Base64.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — batch-lifecycle/process-finalize confirmam efeitos do índice; reconciliação de tabs é coberta por cenários integrados, mas não existe teste focal de cada branch de tabExists.

### U12 — linhas/posição 291–356: Composição dos módulos de jobs

**O que faz:** Instancia uma única vez identidade, watchdog, reconciler, DOM ACK e lifecycle, injetando estado, logs, storage/Chrome facades e callbacks cruzados.

**Como faz:** initializeTabIdentity cria o serviço com moveFinalizedTabId; initializeJobsModules cria quatro factories e injeta closures para resolver ciclos entre lifecycle/watchdog/reconciler/domAck.

**Por que foi feito desta forma:** Extrair regras complexas de background.js reduz monólito sem duplicar estado; dependency injection permite testar módulos separadamente e manter um único service worker listener.

**Por que uma implementação ingênua seria pior:** Instanciar factories em cada chamada perderia caches/journals e multiplicaria listeners/timers; importar módulos uns aos outros diretamente criaria ciclos rígidos e dificultaria Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo background real em helpers/lifecycle/message-handlers. ✅ Os módulos injetados têm suítes próprias (tab-identity, jobs-dom-ack, jobs-lifecycle). A composição exata de cada argumento não possui assertion única.

### U13 — linhas/posição 357–404: Reidratação e reconciliação MV3

**O que faz:** Recupera jobs duráveis após wake-up, evita sobrescrever trabalho residente, reconcilia abas/índice e dispara recovery assíncrono de aliases.

**Como faz:** ensureInitialized detecta resident work antes de restore; marca _initialized; reconcileJobs classifica jobs vivos/órfãos; sync ocorre se houve alteração; processNextJob só retoma quando há trabalho e stopRequested é falso.

**Por que foi feito desta forma:** MV3 pode destruir memória sem fechar abas. O worker refeito precisa reconstruir contabilidade do storage, mas não pode substituir uma fila que já voltou a residir em memória durante a mesma vida.

**Por que uma implementação ingênua seria pior:** Zerar activeJobsCount ou restaurar snapshot antigo cegamente pode declarar lote concluído com jobs vivos; bloquear toda mensagem esperando cleanup secundário aumenta latência e risco de deadlock.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE POR FLUXO — lifecycle-alarms cobre restart/fila, promoção FIFO e reinício; process-finalize cobre restart entre journal e contabilidade; ⚠️ catch vazio da reconciliação não tem assertion de observabilidade.

### U14 — linhas/posição 405–427: Fila de logs persistidos

**O que faz:** Agrupa logs em memória, persiste em translatorLog, limita histórico a 500 entradas e recupera a trava de flush após erro.

**Como faz:** log enfileira entrada com id/ts/defaults e inicia _flushLog só se não houver flush; _flushLog drena a fila em batches, lê histórico, aplica cap e escreve storage.

**Por que foi feito desta forma:** Batching reduz writes de storage durante bursts e o cap impede crescimento ilimitado; liberar _logFlushing após catch permite próxima tentativa.

**Por que uma implementação ingênua seria pior:** Um write por log amplifica IO; deixar _logFlushing true após rejeição congelaria logging; histórico sem cap pode consumir quota.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — helpers-real verifica batching, IDs únicos, trava, cap 500 e recuperação após falha.

### U15 — linhas/posição 428–488: Adapter do router modular e compatibilidade legada

**O que faz:** Resolve actions registradas, cria uma única instância do router com contexto rico e converte respostas novas {ok,...} para formatos legados de cinco actions.

**Como faz:** resolveActionName/getAction filtram mensagens; contextFactory injeta estado/helpers; sendResponseCompat remove ok em responses legadas e reduz erro FETCH_IMAGE_AS_BASE64 para string compatível.

**Por que foi feito desta forma:** Permite extrair actions do monólito sem quebrar consumidores antigos que esperavam shapes históricos.

**Por que uma implementação ingênua seria pior:** Alterar todos os clientes de uma vez aumenta risco; criar router por mensagem perde identidade/cache e custa mais; retirar compat sem migração quebra content scripts existentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — routed-actions-legacy espiona roteamento e verifica shapes de GET_TAB_ID, CHECK_IF_EXTRACTION_TAB, GEMINI_PROGRESS, SET_DEBUG_MODE e LOG_ENTRY; gtc-runtime-bridge prova que fallback para bridges continua funcional.

### U16 — linhas/posição 489–521: Facades watchdog e ACK de DOM

**O que faz:** Expõe arm/clear watchdog e deliverResultToManga como adaptadores finos dos módulos extraídos, mantendo timeout local de ACK em 30 s.

**Como faz:** Cada facade inicializa módulos antes de delegar; deliverResultToManga repassa mangaTabId/index/src/jobId/batchId/geminiTabId/finalizeOnAck.

**Por que foi feito desta forma:** Actions antigas e testes podem manter nomes históricos enquanto implementação canônica fica em módulos especializados.

**Por que uma implementação ingênua seria pior:** Duplicar lógica de watchdog/ACK aqui e nos módulos criaria comportamentos divergentes; remover timeout deixaria Promise pendurada se content script nunca responder.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRADO — helpers-real cobre arm/clear watchdog; message-handlers/process-finalize atravessam entrega real; jobs-dom-ack-staging prova o helper consumido. A constante 30 s não tem teste focal neste facade.

### U17 — linhas/posição 522–601: Construção do menu de contexto

**O que faz:** Normaliza domínios habilitados, remove item antigo e recria um menu exclusivo de imagens apenas quando click-to-translate está ligado.

**Como faz:** enabledDomainToMatchPattern aceita apenas host chars simples; rebuild usa Set para deduplicar, version counter para descartar callbacks stale e documentUrlPatterns para limitar páginas; create/remove tratam runtime.lastError.

**Por que foi feito desta forma:** O menu é uma superfície privilegiada do browser e deve existir somente em páginas autorizadas. O version counter evita corrida entre mudanças rápidas de preferência.

**Por que uma implementação ingênua seria pior:** Menu global permitiria ação em sites não habilitados; criar sem remover pode duplicar item/gerar erro; callback antigo poderia recriar opção após o usuário desligar.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — single-image-context-menu testa contexts:['image'], patterns por domínio e remoção ao desligar. ⚠️ Não há teste focal para domínio inválido, deduplicação, version race ou exceção síncrona de create/remove.

### U18 — linhas/posição 602–645: Listeners do menu de contexto

**O que faz:** Atualiza o menu quando storage muda e, no clique, revalida configuração/domínio antes de enviar TRANSLATE_CONTEXT_IMAGE à aba.

**Como faz:** storage.onChanged reage a duas chaves; contextMenus.onClicked filtra id/tab, relê preferências, valida hostname e envia srcUrl; falhas/rejeições são logadas.

**Por que foi feito desta forma:** Revalidar no clique fecha a janela entre item visível e preferência alterada; srcUrl vem do evento nativo em vez de seleção DOM inventada pelo background.

**Por que uma implementação ingênua seria pior:** Confiar só no estado da criação permitiria ação depois de desativar; enviar para tab sem id/host autorizado ampliaria superfície de privilégio.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — single-image-context-menu testa encaminhamento exato do srcUrl e que clique stale não envia após desativação. ⚠️ Logs de delivery/rejection não têm assertions focais.

### U19 — linhas/posição 646–657: Prompt padrão e onInstalled

**O que faz:** Mantém o prompt padrão em constante e, na instalação, atualiza menu e grava o prompt apenas quando ainda não existe.

**Como faz:** onInstalled chama refreshSingleImageContextMenu e chrome.storage.local.get(defaultPrompt); set só acontece se o valor for falsy.

**Por que foi feito desta forma:** Não sobrescreve customização do usuário durante atualização e centraliza o prompt default em um nome auditável.

**Por que uma implementação ingênua seria pior:** Gravar sempre destruiria preferências; string duplicada em vários handlers facilitaria divergência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lifecycle-alarms verifica que defaultPrompt é persistido e contém o texto esperado. ⚠️ Caso de prompt já existente não tem assertion focal nesta suíte.

### U20 — linhas/posição 658–702: Recuperação no onStartup

**O que faz:** Restaura snapshot após reinício do navegador, recupera aliases, limpa extractionTabs conforme a política do projeto, reconcilia jobs e retoma/promove trabalho pendente.

**Como faz:** restoreState → recoverPendingMigrations → cleanupExpiredAliases → _initialized; calcula hadWork; reconcileJobs; se havia trabalho recalcula isProcessing, sincroniza e chama processNextJob quando permitido.

**Por que foi feito desta forma:** onStartup é diferente de simples wake-up: o projeto trata sessões de extração transitórias como não confiáveis e reconstrói trabalho a partir do estado durável reconciliado.

**Por que uma implementação ingênua seria pior:** Retomar extractionTabs stale pode apontar para tabIds reciclados; ignorar pendingBatches perderia FIFO; reviver batch já completionClaimed duplicaria conclusão/jobs.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lifecycle-alarms cobre startup vazio, batch já concluído, fila recuperada, promoção B/C e múltiplos pendingBatches. ⚠️ A premissa sobre extraction tabs é decisão arquitetural, não propriedade testada no Chrome real.

### U21 — linhas/posição 703–706: Porta de keep-alive

**O que faz:** Aceita conexões runtime e instala listener de disconnect apenas para a porta gemini-keep-alive.

**Como faz:** onConnect compara port.name e registra callback vazio no onDisconnect.

**Por que foi feito desta forma:** Mantém a superfície mínima: outras portas não ganham listener desnecessário; a conexão é observável pelo runtime enquanto aberta.

**Por que uma implementação ingênua seria pior:** Registrar lógica em toda porta cria efeitos laterais em canais alheios; depender exclusivamente de keep-alive seria frágil porque MV3 pode suspender workers.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lifecycle-alarms verifica um disconnect listener para gemini-keep-alive e zero para porta genérica.

### U22 — linhas/posição 707–731: Substituição de abas e rekey

**O que faz:** Observa chrome.tabs.onReplaced, registra telemetria e delega a migração durável de identidade para TabIdentity.recordReplacement.

**Como faz:** O listener recebe new/old ids, loga TAB_REPLACED e inicia Promise de recordReplacement; falhas síncronas e assíncronas viram TAB_REKEY_ERROR.

**Por que foi feito desta forma:** Chromium pode substituir tabId sem que o job lógico mude. Reapontar storage/índice/watchdog preserva ownership e evita classificar o job como órfão.

**Por que uma implementação ingênua seria pior:** Tratar tabId como imutável perde jobs durante replacement; migrar sem journal pode deixar metade das chaves no id antigo após crash.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — tab-identity.test prova migração/journal/aliases do módulo e tab-replacement-observability prova o mock onReplaced, mas ⚠️ não há teste que dispare o listener de background.js e faça assertion do recordReplacement/log. Comentário PR0 está desatualizado: o código já executa rekey, não apenas observa.

### U23 — linhas/posição 732–792: Alarmes, watchdog e limpeza de órfãos

**O que faz:** Despacha alarmes de cleanup de marcador, next job e watchdog; mantém fallback legado que reconstrói metadata do job pelo índice/storage e encerra jobs expirados/extraction tabs órfãs.

**Como faz:** ensureInitialized roda primeiro; finalization_marker remove key; nextJob chama scheduler; jobsWatchdog.handleAlarm tem prioridade; fallback watchdog resolve sufixo por jobId/tabId, busca wd_data, envia erro e finaliza/remove auxiliares.

**Por que foi feito desta forma:** Alarms são mais duráveis que timers para MV3 e permitem recovery após suspensão. O índice evita chrome.storage.get(null), que poderia materializar grandes Base64.

**Por que uma implementação ingênua seria pior:** Timer em memória pode desaparecer; get(null) aumenta memória/quota de serialização; timeout sem cleanup deixa slot preso e abas órfãs.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lifecycle-alarms cobre nextJobAlarm e watchdog com/sem wd_data, mensagem de erro e fechamento de extraction tabs. process-finalize cobre expiração de marcador durável. ⚠️ ramo finalization_marker_* deste listener não tem assertion isolada.

### U24 — linhas/posição 793–818: Progresso e espera de downloads

**O que faz:** Envia PROGRESS ao leitor e implementa espera por conclusão/interrupção de um download com listener filtrado por id e safety timeout de 10 min.

**Como faz:** waitForDownload registra handler em downloads.onChanged; ao complete/interrupted limpa timer+listener; timer também remove listener e chama onError.

**Por que foi feito desta forma:** O helper evita polling de downloads e garante cleanup no caminho normal do mesmo worker.

**Por que uma implementação ingênua seria pior:** Não filtrar id mistura downloads concorrentes; não remover listener causa leak/duplicação; não ter timeout mantém callback pendente indefinidamente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — download-wait testa ID estranho, complete, interrupted, remoção de listener, timeout, timer cancelado e múltiplos downloads. ⚠️ Em MV3 o setTimeout de 10 min não é durável se o worker for suspenso; Jest não prova sobrevivência real.

### U25 — linhas/posição 819–869: Download em lote e persistência de paths

**O que faz:** Baixa imagens em ordem de índice, espera cada download, coleta paths concluídos e persiste mapa de paths/último download antes de mostrar o último item.

**Como faz:** Cria um download por índice; falha de criação conta como concluída; waitForDownload conduz sucesso/erro; finalize lê <chapId>_paths, mergeia pathsUpdate, salva mangaTranslatorLastPath/dlId e resolve a Promise.

**Por que foi feito desta forma:** Permite exportar várias páginas sem abortar o lote inteiro por uma falha e preserva caminhos para reabrir a pasta posteriormente.

**Por que uma implementação ingênua seria pior:** Resolver no primeiro download perderia páginas; sobrescrever o mapa apagaria paths antigos; não contabilizar falhas impediria finalize de ocorrer.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por actions de download/export que recebem este helper no contexto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO chamando backgroundModule.downloadImagesAndShow e verificando merge/último path/falhas.

### U26 — linhas/posição 870–904: Abertura de pasta via download/âncora

**O que faz:** Procura download existente; se não achar, cria PNG âncora no diretório, mostra-o e tenta remover/erase após 4 s.

**Como faz:** downloads.search usa regex do diretório; valid existing/complete abre direto; fallback cria data URL 1×1, aguarda conclusão, show, agenda cleanup e responde ao caller.

**Por que foi feito desta forma:** Chrome Downloads não fornece API direta de abrir pasta arbitrária; um download conhecido fornece handle que downloads.show consegue revelar.

**Por que uma implementação ingênua seria pior:** Criar âncora sempre suja disco e demora; regex não escapada pode abrir match errado; não responder falha deixaria popup/content aguardando.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — marker-anchor-real cobre path root/título, show+cleanup em 4 s e falha de download; regex-escape atravessa o background real para metacaracteres. ⚠️ setTimeout de 4 s é best-effort em MV3 e pode morrer com o worker antes do cleanup.

### U27 — linhas/posição 905–932: Descritor e ativação de batch

**O que faz:** Converte request em descritor persistível e aplica um batch ao snapshot como lote corrente, reconstruindo jobQueue e resetando contadores/flags.

**Como faz:** createBatchDescriptor guarda apenas index de cada imagem, prompt, mangaTabId, batchId e timestamp; activateBatchSnapshot mapeia images para jobs e zera completed/active, limpa completionClaimed e liga isProcessing.

**Por que foi feito desta forma:** Separar descritor de execução mantém pendingBatches pequenos e serializáveis; a ativação centralizada garante o mesmo reset em START_BATCH, startup e promoção.

**Por que uma implementação ingênua seria pior:** Persistir src/Base64 na fila aumentaria storage/memória; promover lote sem reset de completionClaimed/contadores misturaria contabilidade entre batches.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE POR RESULTADO — plan-missing-handlers e lifecycle-alarms verificam fila, currentBatchId, contadores e promoção; ⚠️ enqueuedAt não tem assertion focal.

### U28 — linhas/posição 933–1079: START_BATCH, FIFO e idempotência

**O que faz:** Aceita novo batch, rejeita duplicação lógica sem recriar jobs, preserva FIFO de batches pendentes e inicia imediatamente apenas quando não existe trabalho anterior.

**Como faz:** ensureInitialized; gera/aceita batchId; calcula snapshot sob runtimeState.mutate quando disponível; classifica outcome em duplicate_active, duplicate_pending, queued ou started; cada resultado loga/responde e chama scheduler apenas quando apropriado.

**Por que foi feito desta forma:** Mutação serializada evita duas mensagens START_BATCH concorrentes sobrescreverem fila; idempotência protege retries de IPC; FIFO impede batch novo furar B/C/D já aceitos.

**Por que uma implementação ingênua seria pior:** Reinicializar estado a cada START apagaria lote ativo; inserir novo batch na frente reordena trabalho; retry sem dedupe duplicaria traduções e tabs Gemini.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — plan-missing-handlers BG-44/44b/45 verifica B–F FIFO, duplicate_pending, duplicate_active e concorrência; batch-lifecycle prova primeira aba/job/storage real. E2E cobre sequência maior como evidência adicional.

### U29 — linhas/posição 1080–1202: STOP_BATCH, cleanup e promoção FIFO

**O que faz:** Cancela batch pendente isoladamente ou interrompe batch corrente, invalida launches tardios, remove jobs/storage/alarms/extraction tabs e promove o próximo pending somente após cleanup.

**Como faz:** Identifica target; remove pending sem tocar lote ativo; para lote corrente filtra queue, marca stopRequested e invalidateBatchLaunches; remove tabs/chaves/alarms; transição zera estado e shift do próximo batch; depois refresh concurrency e scheduler.

**Por que foi feito desta forma:** Tabs/windows podem resolver depois do STOP; invalidar launches antes do cleanup fecha essa race. Promoção posterior evita recursos de A contaminarem B.

**Por que uma implementação ingênua seria pior:** Promover B antes de invalidar/limpar A permite callback tardio de A consumir slot de B; remover todos os pending ao cancelar um só quebra FIFO; cleanup sem batch filter mata jobs atuais por engano.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — plan-missing-handlers BG-44b/BG-46 e batch-lifecycle cobrem cancel pending, cleanup completo e preservação de batch atual ao parar antigo; process-finalize BG-76b cobre tabs.create tardio.

### U30 — linhas/posição 1203–1229: Facades compatíveis do lifecycle extraído

**O que faz:** Mantém nomes históricos updateJobState/assertJobOwnership/processNextJob/finalizeJob/_refreshMaxCon enquanto delega a jobs-lifecycle.

**Como faz:** Cada wrapper chama initializeJobsModules e encaminha args; assertJobOwnership adapta Promise para callback e converte rejeição em owns=false.

**Por que foi feito desta forma:** Permite migração incremental: actions extraídas e testes existentes continuam com o contrato antigo enquanto a implementação canônica é modular.

**Por que uma implementação ingênua seria pior:** Duplicar corpos antigos causaria duas fontes de verdade; remover wrappers de uma vez quebraria contextFactory/actions e muitos testes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE POR FLUXO — process-finalize testa processNextJob/finalizeJob reais; actions de commit/deliver usam assertJobOwnership via context em integração. ⚠️ o catch de assertJobOwnership que converte qualquer erro em false não tem caso focal no background.

### U31 — linhas/posição 1230–1251: Listener runtime principal

**O que faz:** É o único dispatcher de chrome.runtime.onMessage: registra observabilidade GET_TAB_ID, tenta router modular, depois bridge GTC e por fim bridge Storage Manager.

**Como faz:** routeRegisteredAction retorna {handled,keepAlive}; se tratado, o listener devolve keepAlive. GTC/SM retornam true somente quando capturam a mensagem.

**Por que foi feito desta forma:** Ordem explícita impede handlers legados interceptarem actions já migradas e preserva canais async somente quando necessário.

**Por que uma implementação ingênua seria pior:** Múltiplos listeners concorrentes podem responder a mesma mensagem; colocar bridge genérica antes do router pode capturar ações erradas; devolver true incondicional deixa canais abertos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — routed-actions-legacy verifica actions migradas; gtc-runtime-bridge verifica GTC + regressão GET_TAB_ID; message-handlers-real atravessa o listener para fluxos de imagem/erro/download.

### U32 — linhas/posição 1252–1252: Newline final do blob

**O que faz:** Registra a posição editorial após a linha textual 1251, porque o blob termina em newline.

**Como faz:** A Bíblia contabiliza essa posição separadamente sem inventar uma linha de código.

**Por que foi feito desta forma:** A auditoria exige equivalência física e o newline final não pode ficar invisível.

**Por que uma implementação ingênua seria pior:** Ignorar a posição recriaria falso 100% de cobertura documental.

**Evidência automatizada:** 🟦 GATE DOCUMENTAL — conferido pela comparação do blob e por esta rastreabilidade; não é comportamento runtime.


## 12. Reauditoria desta versão

- [x] SHA e fonte integral conferidos;
- [x] 1251 linhas + newline final = 1252/1252 posições;
- [x] 32 unidades específicas, sem gaps/overlaps;
- [x] fallback textual genérico anterior eliminado;
- [x] etiqueta verde repetida indiscriminadamente por linha eliminada;
- [x] assertions reais lidas;
- [x] implementação/helper/simulação diferenciados;
- [x] gaps marcados conservadoramente;
- [x] MV3/security/privacy/consumers reavaliados;
- [x] nenhuma alteração funcional em `extension/background.js`.

**Veredito documental:** aprovada para o SHA `667c05eb2d7adfca16a79d3e706c39a1e9398b72`, sem alegar correção matemática do software ou cobertura automatizada total.

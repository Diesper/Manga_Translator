# Bíblia técnica — `extension/content/content_gemini.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `55bc83afe31a10c53f39799717f2f221b6919029`  
> **Linhas textuais:** **461**  
> **Posições documentais:** **462** contando newline final

## 1. Papel arquitetural

`content_gemini.js` é o composition root/bootstrap do worker Gemini no isolated world. A execução detalhada pertence aos módulos `extension/content/gemini/*.js`; este arquivo carrega suas APIs, injeta dependências, reivindica o job correto e expõe handlers de compatibilidade.

O manifest injeta selectors, DOM, quarantine, observer, editor, attachment, temporary-chat, result-extractor, deletion e job-runner antes deste arquivo. O helper de testes reproduz a mesma ordem.

## 2. Fail-fast de dependências

O bootstrap lança se qualquer uma das nove APIs obrigatórias estiver ausente. Isso evita começar um job com pipeline parcialmente carregado.

## 3. Keep-alive sob demanda

O port `gemini-keep-alive` só abre durante job. Disconnect inesperado agenda uma única reconexão após 250 ms; `closeKeepAlive` marca shutdown antes de desconectar para impedir o próprio onDisconnect de reabrir.

`claim-bootstrap-keepalive.test.js` prova aba manual sem port, abertura/fechamento em job válido, uma única reconexão e ausência de reconnect após close explícito.

## 4. Privacidade de logs

`sanitizeLogExtra` redige chaves como URL/src/prompt/hash/base64/token/cookie/auth, redige strings data/blob/http e trunca strings comuns >160 caracteres. `sendLog` fixa `source:'gemini'`.

`debugConsole` tem boundary diferente: só sanitiza argumentos objeto. String primitiva sensível pode chegar ao console quando debug está habilitado; isso não vai ao translatorLog, mas é risco documental.

## 5. Metadata de URL

`getUrlLogMetadata` reduz URL a tipo/host/hasQuery e nunca retorna path/query completo. É injetado no resultExtractor.

## 6. Composition root

O arquivo instancia `resultExtractor`, `deletionController`, `imageQuarantine` e `jobRunner` com DOM/runtime/storage/fetch/log/progress/keep-alive reais. Testes dos submódulos isolados não devem ser confundidos com prova deste wiring; wrappers/fluxos que usam os objetos instanciados aqui contam.

## 7. Claim moderno e aba manual

`getExpectedGeminiJobId` lê `jobId` da URL. `claimGeminiJob` tenta `CLAIM_GEMINI_JOB`. `{ok:true,job}` encerra o claim; `{ok:true,job:null}` sem expectedJobId encerra em null imediatamente, mantendo aba Gemini manual inerte.

Com expectedJobId, job:null é tratado como registro potencialmente tardio e o claim continua até timeout. O teste de keep-alive/claim prova job surgindo na terceira tentativa.

## 8. Fallback legado limitado

Fallback só é usado quando a action moderna parece não suportada (`response` ausente). Não há full scan: tenta GET_TAB_ID até cinco vezes e depois consulta somente `gemini_job_<tabId>`, exigindo expectedJobId quando presente.

CG-10 prova job legado aparecendo tarde; CG-11 prova expiração sem job, JOB_NOT_FOUND e ausência de RPA.

## 9. Bootstrap seguro e deleting_urls

Em paths `/app/...`, o bootstrap consulta `deleting_urls`; se o pathname está sendo excluído, retorna antes do claim/runner. CG-14 prova que não há REQUEST_IMAGE_DATA nem GEMINI_ERROR.

Jobs com jobId recebem janela de claim de 12 s; abas sem jobId, 5 s. Sem job em nova conversa registra JOB_NOT_FOUND; chat existente sem job fica silencioso. Job válido vai para `jobRunner.run(job)`.

## 10. Handler DO_SEND_NOW

Se existe botão Stop visível, responde `alreadyGenerating:true`. Senão tenta botão Send habilitado; se não estiver utilizável, faz nudge no editor e dispara `MANGA_TRANSLATOR_TRIGGER_SEND`. O canal fecha sincronicamente.

⚠️ Não foi localizada suíte que execute esse receiver diretamente. O teste do background prova apenas o envio de DO_SEND_NOW até a aba.

## 11. Handler DELETE_CONVERSATION

Delega ao deletionController e retorna `true` para manter canal aberto. `rpa-flow.test.js` prova resposta em debug e deleção DOM confirmada. Suites de regressão exercitam wrappers do controller instanciado aqui e provam recusas seguras.

## 12. CommonJS e auto-start

Em testes CommonJS, exporta API e não inicia automaticamente. No browser, `window.__mt_gemini_started` impede bootstrap duplicado e chama `processGeminiJob()` uma vez.

## 13. Evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| ordem de módulos | manifest + `load-content-gemini-module.js` | 🟦 GATE/HARNESS ESPECÍFICO |
| aba manual claim nulo | KEEP-01 | ✅ PROVADO DIRETAMENTE |
| keep-alive lifecycle | KEEP-02/03/04/05 | ✅ PROVADO DIRETAMENTE |
| retry CLAIM moderno | claim-bootstrap-keepalive | ✅ PROVADO DIRETAMENTE |
| fallback legado tardio | plan-rpa-edge-cases CG-10 | ✅ PROVADO PELO BOOTSTRAP REAL |
| timeout/no job | CG-11 | ✅ PROVADO PELO BOOTSTRAP REAL |
| deleting_urls | helpers-and-regressions CG-14 | ✅ PROVADO DIRETAMENTE |
| DELETE_CONVERSATION handler | rpa-flow CG-43/44... | ✅ PROVADO DIRETAMENTE |
| deletion wrappers seguros | helpers/regressions CG-45/46/50/... | ✅ PROVADO VIA OBJETO INSTANCIADO AQUI |
| RPA/editor/extractor detalhados | suites content-gemini | 🟨 EXECUTADO VIA jobRunner; propriedade interna pertence aos submódulos |
| DO_SEND_NOW receiver | nenhuma assertion direta localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 14. Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fail-fast com módulo obrigatório ausente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para erro no primeiro `chrome.runtime.connect` ou reconnect que lança.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para sanitização recursiva/truncamento de logs.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `debugConsole` e string sensível primitiva.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para data/blob/invalid em getUrlLogMetadata através do composition root.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `reportProgress` neste arquivo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para throw síncrono de sendRuntimeMessage.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para GET_TAB_ID falhar cinco vezes no fallback.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para job legado com jobId divergente até timeout.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para URL inválida em getExpectedGeminiJobId.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para deleting_urls inválida cair em includes(path).
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todos os ramos de DO_SEND_NOW.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para rejeição Promise de DELETE_CONVERSATION.
- ⚠️ `reportProgress` é best-effort; perder progresso não aborta job.
- ⚠️ keep-alive é memória da aba, não journal durável.
- ⚠️ quando a action moderna é ausente, fallback legado possui janela de timeout própria adicional.
- ⚠️ auto-start chama `processGeminiJob()` sem `.catch()` externo; rejeição inesperada fora do runner pode virar Promise rejection.

## 15. Segurança e privacidade

- Claim moderno evita full scan e usa jobId esperado da URL.
- Fallback legado consulta só a própria tab e valida expectedJobId.
- Aba manual sem job permanece inerte.
- Logs persistidos passam por redaction.
- deleting_urls impede RPA em conversa que está sendo excluída.
- DELETE_CONVERSATION delega seleção/confirm safety ao controller especializado.

## 16. Invariantes

1. Todos os módulos obrigatórios precisam existir antes do bootstrap.
2. Aba sem job não pode editar/uploadar/enviar.
3. Claim moderno precede fallback legado.
4. Fallback legado nunca faz full scan.
5. expectedJobId impede aceitar job legado divergente.
6. Keep-alive só existe durante job e reconecta no máximo uma vez.
7. closeKeepAlive bloqueia reconnect do próprio disconnect.
8. Logs persistidos continuam sanitizados.
9. deleting_urls bloqueia job na mesma conversa.
10. DO_SEND_NOW não reenvia quando já existe Stop visível.
11. DELETE_CONVERSATION mantém canal aberto até resolução.
12. Auto-start ocorre uma única vez por contexto.

## 17. Fonte integral

~~~javascript
// content_gemini.js — Manga Translator
//
// Bootstrap/orquestração do worker Gemini.
// Implementação detalhada vive em extension/content/gemini/*.js.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const GeminiDom = globalThis.MangaTranslatorGeminiDom;
const GeminiImageQuarantine = globalThis.MangaTranslatorGeminiImageQuarantine;
const GeminiObserver = globalThis.MangaTranslatorGeminiObserver;
const GeminiEditor = globalThis.MangaTranslatorGeminiEditor;
const GeminiAttachment = globalThis.MangaTranslatorGeminiAttachment;
const GeminiTemporaryChat = globalThis.MangaTranslatorGeminiTemporaryChat;
const GeminiResultExtractor = globalThis.MangaTranslatorGeminiResultExtractor;
const GeminiDeletion = globalThis.MangaTranslatorGeminiDeletion;
const GeminiJobRunner = globalThis.MangaTranslatorGeminiJobRunner;

if (
    !GeminiDom ||
    !GeminiImageQuarantine ||
    !GeminiObserver ||
    !GeminiEditor ||
    !GeminiAttachment ||
    !GeminiTemporaryChat ||
    !GeminiResultExtractor ||
    !GeminiDeletion ||
    !GeminiJobRunner
) {
    throw new Error('Módulos Gemini obrigatórios não foram carregados antes de content_gemini.js');
}

// ── Keep-alive sob demanda ───────────────────────────────────────────────────
let keepAlivePort = null;
let keepAliveJobActive = false;
let keepAliveClosing = false;
let keepAliveReconnectAttempted = false;

function connectKeepAlive({ reconnect = false } = {}) {
    if (!keepAliveJobActive || keepAlivePort) return keepAlivePort;

    try {
        const port = chrome.runtime.connect({ name: 'gemini-keep-alive' });
        keepAlivePort = port;

        if (port?.onDisconnect?.addListener) {
            port.onDisconnect.addListener(() => {
                if (keepAlivePort === port) keepAlivePort = null;
                if (
                    keepAliveClosing ||
                    !keepAliveJobActive ||
                    keepAliveReconnectAttempted
                ) {
                    return;
                }

                keepAliveReconnectAttempted = true;
                setTimeout(() => {
                    if (
                        !keepAliveClosing &&
                        keepAliveJobActive &&
                        !keepAlivePort
                    ) {
                        connectKeepAlive({ reconnect: true });
                    }
                }, 250);
            });
        }

        return port;
    } catch (_error) {
        keepAlivePort = null;
        if (reconnect) keepAliveReconnectAttempted = true;
        return null;
    }
}

function openKeepAlive() {
    keepAliveJobActive = true;
    keepAliveClosing = false;
    keepAliveReconnectAttempted = false;
    return connectKeepAlive();
}

function closeKeepAlive() {
    keepAliveClosing = true;
    keepAliveJobActive = false;

    const port = keepAlivePort;
    keepAlivePort = null;
    if (port) {
        try { port.disconnect(); } catch (_error) {}
    }

    keepAliveReconnectAttempted = false;
}

// ── Logs sanitizados ─────────────────────────────────────────────────────────
function sanitizeLogExtra(value, key = '') {
    const sensitiveKey =
        /(url|uri|src|prompt|preview|hash|base64|dataurl|image|token|cookie|authorization)/i;

    if (sensitiveKey.test(key)) return '[redacted]';

    if (typeof value === 'string') {
        if (
            value.startsWith('data:') ||
            value.startsWith('blob:') ||
            /^https?:/i.test(value)
        ) {
            return '[redacted]';
        }
        return value.length > 160 ? `${value.slice(0, 160)}…` : value;
    }

    if (Array.isArray(value)) {
        return value.map(item => sanitizeLogExtra(item));
    }

    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((safe, [entryKey, entryValue]) => {
            safe[entryKey] = sanitizeLogExtra(entryValue, entryKey);
            return safe;
        }, {});
    }

    return value;
}

function sendLog(level, action_name, detail, extra = {}) {
    chrome.runtime.sendMessage({
        action: 'LOG_ENTRY',
        level,
        source: 'gemini',
        action_name,
        detail: sanitizeLogExtra(String(detail || '')),
        extra: sanitizeLogExtra(extra),
    }, () => {
        if (chrome.runtime.lastError) {}
    });
}

function getUrlLogMetadata(value) {
    const rawUrl = String(value || '');
    if (rawUrl.startsWith('data:')) {
        return { urlKind: 'data', host: null, hasQuery: false };
    }
    if (rawUrl.startsWith('blob:')) {
        return { urlKind: 'blob', host: null, hasQuery: false };
    }

    try {
        const parsed = new URL(rawUrl);
        return {
            urlKind: parsed.protocol.replace(':', ''),
            host: parsed.hostname || null,
            hasQuery: Boolean(parsed.search),
        };
    } catch (_error) {
        return { urlKind: 'invalid', host: null, hasQuery: false };
    }
}

// ── Debug gated ──────────────────────────────────────────────────────────────
let _debugModeEnabled = false;

chrome.storage.local.get(['debugMode'], data => {
    _debugModeEnabled = data?.debugMode === true;
});

if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.debugMode) {
            _debugModeEnabled = changes.debugMode.newValue === true;
        }
    });
}

function debugConsole(level, ...args) {
    if (!_debugModeEnabled) return;
    const safeArgs = args.map(arg =>
        typeof arg === 'object' && arg !== null
            ? sanitizeLogExtra(arg)
            : arg
    );
    console[level](...safeArgs);
}

function reportProgress(text, mangaTabId = null) {
    chrome.runtime.sendMessage({
        action: 'GEMINI_PROGRESS',
        text,
        mangaTabId,
    }, () => {
        if (chrome.runtime.lastError) {}
    });
}

// ── Módulos com dependências de runtime ─────────────────────────────────────
const resultExtractor = GeminiResultExtractor.createResultExtractor({
    sendLog,
    getUrlLogMetadata,
    sleep,
    runtime: chrome.runtime,
    pageWindow: window,
    pageDocument: document,
    fetchImpl: (...args) => fetch(...args),
});

const deletionController = GeminiDeletion.createDeletionController({
    root: document,
    pageWindow: window,
    storage: chrome.storage.local,
    sleep,
    sendLog,
});

const imageQuarantine = GeminiImageQuarantine.createImageQuarantine({
    dom: GeminiDom,
});

const jobRunner = GeminiJobRunner.createGeminiJobRunner({
    root: document,
    pageWindow: window,
    runtime: chrome.runtime,
    storage: chrome.storage.local,
    domApi: GeminiDom,
    imageQuarantine,
    observerApi: GeminiObserver,
    editorApi: GeminiEditor,
    attachmentApi: GeminiAttachment,
    temporaryChatApi: GeminiTemporaryChat,
    resultExtractor,
    deletionController,
    sleep,
    sendLog,
    getUrlLogMetadata,
    debugConsole,
    reportProgress,
    openKeepAlive,
    closeKeepAlive,
});

// ── Claim seguro ─────────────────────────────────────────────────────────────
function getExpectedGeminiJobId() {
    try {
        const parsed = new URL(window.location.href);
        const jobId = parsed.searchParams.get('jobId');
        return jobId?.trim() ? jobId.trim() : null;
    } catch (_error) {
        return null;
    }
}

function sendRuntimeMessage(message) {
    return new Promise(resolve => {
        try {
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(response || null);
            });
        } catch (_error) {
            resolve(null);
        }
    });
}

async function claimGeminiJob({ timeoutMs = 5000 } = {}) {
    const expectedJobId = getExpectedGeminiJobId();
    const startedAt = Date.now();
    let claimUnsupported = false;

    do {
        const response = await sendRuntimeMessage({
            action: 'CLAIM_GEMINI_JOB',
            jobId: expectedJobId || undefined,
        });

        if (response?.ok === true && response.job) {
            return response.job;
        }

        if (
            response?.ok === true &&
            Object.prototype.hasOwnProperty.call(response, 'job')
        ) {
            if (!expectedJobId) return null;
        } else if (!response) {
            // Compatibilidade transitória com background/fixtures anteriores.
            // Nunca faz full scan.
            claimUnsupported = true;
            break;
        }

        if (Date.now() - startedAt >= timeoutMs) return null;
        await sleep(500);
    } while (Date.now() - startedAt < timeoutMs);

    if (!claimUnsupported) return null;

    let tabResponse = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        tabResponse = await sendRuntimeMessage({ action: 'GET_TAB_ID' });
        if (tabResponse && Number.isInteger(tabResponse.tabId)) break;
        await sleep(500);
    }

    if (!tabResponse || !Number.isInteger(tabResponse.tabId)) return null;

    const tabId = tabResponse.tabId;
    const jobKey = `gemini_job_${tabId}`;
    const legacyStartedAt = Date.now();

    do {
        const data = await new Promise(resolve =>
            chrome.storage.local.get([jobKey], resolve)
        );
        const job = data?.[jobKey];

        if (job && (!expectedJobId || job.jobId === expectedJobId)) {
            return { ...job, geminiTabId: tabId };
        }

        if (Date.now() - legacyStartedAt >= timeoutMs) return null;
        await sleep(500);
    } while (Date.now() - legacyStartedAt < timeoutMs);

    return null;
}

// ── Bootstrap / claim / runner ───────────────────────────────────────────────
async function processGeminiJob() {
    debugConsole(
        'log',
        '[MangaTranslator Gemini] processGeminiJob iniciado na aba'
    );

    const currentPath = window.location.pathname;
    if (
        currentPath &&
        currentPath.length > 8 &&
        currentPath.startsWith('/app/')
    ) {
        const data = await new Promise(resolve =>
            chrome.storage.local.get(['deleting_urls'], resolve)
        );
        const deletingUrls = data.deleting_urls || [];
        const isBeingDeleted = deletingUrls.some(value => {
            try {
                return new URL(value).pathname === currentPath;
            } catch (_error) {
                return String(value).includes(currentPath);
            }
        });

        if (isBeingDeleted) return;
    }

    // Jobs gerenciados carregam jobId na URL. Em janela minimizada o Chrome
    // pode atrasar o scheduling/document_idle; dê margem maior para o registro
    // durável aparecer sem penalizar abas Gemini manuais (sem jobId).
    const managedJobClaimTimeoutMs = getExpectedGeminiJobId() ? 12_000 : 5_000;
    const job = await claimGeminiJob({ timeoutMs: managedJobClaimTimeoutMs });
    const isExistingChat = currentPath.startsWith('/app/');

    if (!job) {
        if (!isExistingChat) {
            sendLog(
                'warn',
                'JOB_NOT_FOUND',
                'Nenhum job válido foi reivindicado para esta aba — script desativado',
                { path: currentPath }
            );
        }
        closeKeepAlive();
        return;
    }

    return jobRunner.run(job);
}

// ── Runtime handlers ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'DO_SEND_NOW') {
        const stopButton = GeminiDom.findVisibleStopButton(document);
        if (stopButton) {
            sendResponse({ ok: true, alreadyGenerating: true });
            return false;
        }

        const editor = document.querySelector(
            'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
        );
        const sendButton = GeminiDom.findSendButton(document.body);
        let attempted = false;

        if (sendButton && GeminiDom.isControlEnabled(sendButton)) {
            attempted = GeminiEditor.clickSendButton(sendButton);
        } else {
            GeminiEditor.nudgeEditor(editor);
            window.dispatchEvent(
                new CustomEvent('MANGA_TRANSLATOR_TRIGGER_SEND')
            );
            attempted = true;
        }

        sendResponse({ ok: true, attempted });
        return false;
    }

    if (request.action === 'DELETE_CONVERSATION') {
        deletionController.deleteCurrentConversation()
            .then(ok => sendResponse({ ok }))
            .catch(error => sendResponse({
                ok: false,
                error: error.message,
            }));
        return true;
    }
});

const contentGeminiApi = {
    sleep,
    getExpectedGeminiJobId,
    claimGeminiJob,
    openKeepAlive,
    closeKeepAlive,
    processGeminiJob,
    dataURLtoFile: (...args) => jobRunner.dataURLtoFile(...args),
    waitForElement: (...args) => jobRunner.waitForElement(...args),
    createGeminiManualPanel: (...args) => jobRunner.createGeminiManualPanel(...args),
    removeGeminiManualPanel: (...args) => jobRunner.removeGeminiManualPanel(...args),
    setManualGeminiResultUrl: (...args) => jobRunner.setManualGeminiResultUrl(...args),
    findGeneratedResultImages: (...args) => jobRunner.findGeneratedResultImages(...args),
    isManualSelectableImage: (...args) => jobRunner.isManualSelectableImage(...args),
    shouldKeepConversationForDebug: (...args) => jobRunner.shouldKeepConversationForDebug(...args),
    imageElementToDataUrl: (...args) => resultExtractor.imageElementToDataUrl(...args),
    fetchImageThroughGeminiPage: (...args) => resultExtractor.fetchImageThroughGeminiPage(...args),
    fetchImageThroughExtension: (...args) => resultExtractor.fetchGeminiImageThroughExtension(...args),
    fetchImageThroughGeminiExtension: (...args) => resultExtractor.fetchGeminiImageThroughExtension(...args),
    fetchGeminiImageThroughExtension: (...args) => resultExtractor.fetchGeminiImageThroughExtension(...args),
    extractImageInGeminiTab: (...args) => resultExtractor.extractImageInGeminiTab(...args),
    extractResultImage: (...args) => resultExtractor.extractResultImage(...args),
    extractResultImageWithRetry: (...args) => resultExtractor.extractResultImageWithRetry(...args),
    getExtractionFailureKind: (...args) => resultExtractor.getExtractionFailureKind(...args),
    deleteCurrentConversation: (...args) => deletionController.deleteCurrentConversation(...args),
    waitForElementToSettle: (...args) => deletionController.waitForElementToSettle(...args),
    escapeCssAttributeValue: (...args) => deletionController.escapeCssAttributeValue(...args),
    __getDeletionInProgress: () => deletionController.isDeletionInProgress(),
}

const isCommonJsTest =
    typeof module !== 'undefined' &&
    module &&
    module.exports;

if (isCommonJsTest) {
    module.exports = contentGeminiApi;
} else if (!window.__mt_gemini_started) {
    window.__mt_gemini_started = true;
    processGeminiJob();
}

~~~

## 18. Rastreabilidade 462/462

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | // content_gemini.js — Manga Translator | Comentário arquitetural/operacional: content_gemini.js — Manga Translator. |
| 002 | U01 | // | Comentário arquitetural/operacional: . |
| 003 | U01 | // Bootstrap/orquestração do worker Gemini. | Comentário arquitetural/operacional: Bootstrap/orquestração do worker Gemini.. |
| 004 | U01 | // Implementação detalhada vive em extension/content/gemini/*.js. | Comentário arquitetural/operacional: Implementação detalhada vive em extension/content/gemini/*.js.. |
| 005 | U01 | ␠ [linha vazia] | Separador visual dentro de U01. |
| 006 | U01 | const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)); | Helper Promise de atraso injetado nos módulos Gemini. |
| 007 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 008 | U02 | const GeminiDom = globalThis.MangaTranslatorGeminiDom; | Captura dependência global carregada antes pelo manifest. |
| 009 | U02 | const GeminiImageQuarantine = globalThis.MangaTranslatorGeminiImageQuarantine; | Captura dependência global carregada antes pelo manifest. |
| 010 | U02 | const GeminiObserver = globalThis.MangaTranslatorGeminiObserver; | Captura dependência global carregada antes pelo manifest. |
| 011 | U02 | const GeminiEditor = globalThis.MangaTranslatorGeminiEditor; | Captura dependência global carregada antes pelo manifest. |
| 012 | U02 | const GeminiAttachment = globalThis.MangaTranslatorGeminiAttachment; | Captura dependência global carregada antes pelo manifest. |
| 013 | U02 | const GeminiTemporaryChat = globalThis.MangaTranslatorGeminiTemporaryChat; | Captura dependência global carregada antes pelo manifest. |
| 014 | U02 | const GeminiResultExtractor = globalThis.MangaTranslatorGeminiResultExtractor; | Captura dependência global carregada antes pelo manifest. |
| 015 | U02 | const GeminiDeletion = globalThis.MangaTranslatorGeminiDeletion; | Captura dependência global carregada antes pelo manifest. |
| 016 | U02 | const GeminiJobRunner = globalThis.MangaTranslatorGeminiJobRunner; | Captura dependência global carregada antes pelo manifest. |
| 017 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 018 | U02 | if ( | Parte concreta de U02: if ( |
| 019 | U02 |     !GeminiDom \|\| | Parte concreta de U02: !GeminiDom // |
| 020 | U02 |     !GeminiImageQuarantine \|\| | Parte concreta de U02: !GeminiImageQuarantine // |
| 021 | U02 |     !GeminiObserver \|\| | Parte concreta de U02: !GeminiObserver // |
| 022 | U02 |     !GeminiEditor \|\| | Parte concreta de U02: !GeminiEditor // |
| 023 | U02 |     !GeminiAttachment \|\| | Parte concreta de U02: !GeminiAttachment // |
| 024 | U02 |     !GeminiTemporaryChat \|\| | Parte concreta de U02: !GeminiTemporaryChat // |
| 025 | U02 |     !GeminiResultExtractor \|\| | Parte concreta de U02: !GeminiResultExtractor // |
| 026 | U02 |     !GeminiDeletion \|\| | Parte concreta de U02: !GeminiDeletion // |
| 027 | U02 |     !GeminiJobRunner | Parte concreta de U02: !GeminiJobRunner |
| 028 | U02 | ) { | Parte concreta de U02: ) { |
| 029 | U02 |     throw new Error('Módulos Gemini obrigatórios não foram carregados antes de content_gemini.js'); | Fail-fast se o manifest/bootstrap não forneceu todos os módulos obrigatórios. |
| 030 | U02 | } | Fecha/continua estrutura sintática de U02. |
| 031 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 032 | U03 | // ── Keep-alive sob demanda ─────────────────────────────────────────────────── | Comentário arquitetural/operacional: ── Keep-alive sob demanda ───────────────────────────────────────────────────. |
| 033 | U03 | let keepAlivePort = null; | Estado em memória do ciclo do port keep-alive. |
| 034 | U03 | let keepAliveJobActive = false; | Estado em memória do ciclo do port keep-alive. |
| 035 | U03 | let keepAliveClosing = false; | Estado em memória do ciclo do port keep-alive. |
| 036 | U03 | let keepAliveReconnectAttempted = false; | Estado em memória do ciclo do port keep-alive. |
| 037 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 038 | U03 | function connectKeepAlive({ reconnect = false } = {}) { | Abre lógica de conexão/reconexão do port. |
| 039 | U03 |     if (!keepAliveJobActive \|\| keepAlivePort) return keepAlivePort; | Evita port fora de job e conexão duplicada. |
| 040 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 041 | U03 |     try { | Parte concreta de U03: try { |
| 042 | U03 |         const port = chrome.runtime.connect({ name: 'gemini-keep-alive' }); | Abre Port nomeado para manter comunicação com o background. |
| 043 | U03 |         keepAlivePort = port; | Parte concreta de U03: keepAlivePort = port; |
| 044 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 045 | U03 |         if (port?.onDisconnect?.addListener) { | Parte concreta de U03: if (port?.onDisconnect?.addListener) { |
| 046 | U03 |             port.onDisconnect.addListener(() => { | Observa desconexão inesperada do Port. |
| 047 | U03 |                 if (keepAlivePort === port) keepAlivePort = null; | Limpa somente a referência do Port que realmente desconectou. |
| 048 | U03 |                 if ( | Parte concreta de U03: if ( |
| 049 | U03 |                     keepAliveClosing \|\| | Parte concreta de U03: keepAliveClosing // |
| 050 | U03 |                     !keepAliveJobActive \|\| | Parte concreta de U03: !keepAliveJobActive // |
| 051 | U03 |                     keepAliveReconnectAttempted | Guard de no máximo uma reconexão por ciclo. |
| 052 | U03 |                 ) { | Parte concreta de U03: ) { |
| 053 | U03 |                     return; | Parte concreta de U03: return; |
| 054 | U03 |                 } | Fecha/continua estrutura sintática de U03. |
| 055 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 056 | U03 |                 keepAliveReconnectAttempted = true; | Guard de no máximo uma reconexão por ciclo. |
| 057 | U03 |                 setTimeout(() => { | Agenda retry/efeito temporizado. |
| 058 | U03 |                     if ( | Parte concreta de U03: if ( |
| 059 | U03 |                         !keepAliveClosing && | Parte concreta de U03: !keepAliveClosing && |
| 060 | U03 |                         keepAliveJobActive && | Parte concreta de U03: keepAliveJobActive && |
| 061 | U03 |                         !keepAlivePort | Parte concreta de U03: !keepAlivePort |
| 062 | U03 |                     ) { | Parte concreta de U03: ) { |
| 063 | U03 |                         connectKeepAlive({ reconnect: true }); | Executa única tentativa de reconexão após 250 ms. |
| 064 | U03 |                     } | Fecha/continua estrutura sintática de U03. |
| 065 | U03 |                 }, 250); | Parte concreta de U03: }, 250); |
| 066 | U03 |             }); | Fecha/continua estrutura sintática de U03. |
| 067 | U03 |         } | Fecha/continua estrutura sintática de U03. |
| 068 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 069 | U03 |         return port; | Parte concreta de U03: return port; |
| 070 | U03 |     } catch (_error) { | Parte concreta de U03: } catch (_error) { |
| 071 | U03 |         keepAlivePort = null; | Parte concreta de U03: keepAlivePort = null; |
| 072 | U03 |         if (reconnect) keepAliveReconnectAttempted = true; | Guard de no máximo uma reconexão por ciclo. |
| 073 | U03 |         return null; | Parte concreta de U03: return null; |
| 074 | U03 |     } | Fecha/continua estrutura sintática de U03. |
| 075 | U03 | } | Fecha/continua estrutura sintática de U03. |
| 076 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 077 | U04 | function openKeepAlive() { | Marca job ativo e abre port. |
| 078 | U04 |     keepAliveJobActive = true; | Parte concreta de U04: keepAliveJobActive = true; |
| 079 | U04 |     keepAliveClosing = false; | Parte concreta de U04: keepAliveClosing = false; |
| 080 | U04 |     keepAliveReconnectAttempted = false; | Guard de no máximo uma reconexão por ciclo. |
| 081 | U04 |     return connectKeepAlive(); | Parte concreta de U04: return connectKeepAlive(); |
| 082 | U04 | } | Fecha/continua estrutura sintática de U04. |
| 083 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 084 | U04 | function closeKeepAlive() { | Entra em shutdown e impede reconexão. |
| 085 | U04 |     keepAliveClosing = true; | Parte concreta de U04: keepAliveClosing = true; |
| 086 | U04 |     keepAliveJobActive = false; | Parte concreta de U04: keepAliveJobActive = false; |
| 087 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 088 | U04 |     const port = keepAlivePort; | Parte concreta de U04: const port = keepAlivePort; |
| 089 | U04 |     keepAlivePort = null; | Parte concreta de U04: keepAlivePort = null; |
| 090 | U04 |     if (port) { | Parte concreta de U04: if (port) { |
| 091 | U04 |         try { port.disconnect(); } catch (_error) {} | Desconecta Port atual com exceção absorvida. |
| 092 | U04 |     } | Fecha/continua estrutura sintática de U04. |
| 093 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 094 | U04 |     keepAliveReconnectAttempted = false; | Guard de no máximo uma reconexão por ciclo. |
| 095 | U04 | } | Fecha/continua estrutura sintática de U04. |
| 096 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 097 | U04 | // ── Logs sanitizados ───────────────────────────────────────────────────────── | Comentário arquitetural/operacional: ── Logs sanitizados ─────────────────────────────────────────────────────────. |
| 098 | U05 | function sanitizeLogExtra(value, key = '') { | Abre sanitizador recursivo de logs. |
| 099 | U05 |     const sensitiveKey = | Regex de nomes de campos que devem ser redigidos. |
| 100 | U05 |         /(url\|uri\|src\|prompt\|preview\|hash\|base64\|dataurl\|image\|token\|cookie\|authorization)/i; | Parte concreta de U05: /(url/uri/src/prompt/preview/hash/base64/dataurl/image/token/cookie/authorization)/i; |
| 101 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 102 | U05 |     if (sensitiveKey.test(key)) return '[redacted]'; | Regex de nomes de campos que devem ser redigidos. |
| 103 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 104 | U05 |     if (typeof value === 'string') { | Parte concreta de U05: if (typeof value === 'string') { |
| 105 | U05 |         if ( | Parte concreta de U05: if ( |
| 106 | U05 |             value.startsWith('data:') \|\| | Parte concreta de U05: value.startsWith('data:') // |
| 107 | U05 |             value.startsWith('blob:') \|\| | Parte concreta de U05: value.startsWith('blob:') // |
| 108 | U05 |             /^https?:/i.test(value) | Parte concreta de U05: /^https?:/i.test(value) |
| 109 | U05 |         ) { | Parte concreta de U05: ) { |
| 110 | U05 |             return '[redacted]'; | Substitui campo/valor sensível por marcador. |
| 111 | U05 |         } | Fecha/continua estrutura sintática de U05. |
| 112 | U05 |         return value.length > 160 ? `${value.slice(0, 160)}…` : value; | Trunca string comum para limitar payload. |
| 113 | U05 |     } | Fecha/continua estrutura sintática de U05. |
| 114 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 115 | U05 |     if (Array.isArray(value)) { | Sanitiza cada elemento da coleção. |
| 116 | U05 |         return value.map(item => sanitizeLogExtra(item)); | Parte concreta de U05: return value.map(item => sanitizeLogExtra(item)); |
| 117 | U05 |     } | Fecha/continua estrutura sintática de U05. |
| 118 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 119 | U05 |     if (value && typeof value === 'object') { | Parte concreta de U05: if (value && typeof value === 'object') { |
| 120 | U05 |         return Object.entries(value).reduce((safe, [entryKey, entryValue]) => { | Sanitiza recursivamente cada propriedade. |
| 121 | U05 |             safe[entryKey] = sanitizeLogExtra(entryValue, entryKey); | Parte concreta de U05: safe[entryKey] = sanitizeLogExtra(entryValue, entryKey); |
| 122 | U05 |             return safe; | Parte concreta de U05: return safe; |
| 123 | U05 |         }, {}); | Parte concreta de U05: }, {}); |
| 124 | U05 |     } | Fecha/continua estrutura sintática de U05. |
| 125 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 126 | U05 |     return value; | Parte concreta de U05: return value; |
| 127 | U05 | } | Fecha/continua estrutura sintática de U05. |
| 128 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 129 | U06 | function sendLog(level, action_name, detail, extra = {}) { | Abre bridge LOG_ENTRY sanitizada. |
| 130 | U06 |     chrome.runtime.sendMessage({ | Parte concreta de U06: chrome.runtime.sendMessage({ |
| 131 | U06 |         action: 'LOG_ENTRY', | Envia evento ao logger central. |
| 132 | U06 |         level, | Parte concreta de U06: level, |
| 133 | U06 |         source: 'gemini', | Fixa origem gemini. |
| 134 | U06 |         action_name, | Parte concreta de U06: action_name, |
| 135 | U06 |         detail: sanitizeLogExtra(String(detail \|\| '')), | Sanitiza detail antes de IPC. |
| 136 | U06 |         extra: sanitizeLogExtra(extra), | Sanitiza metadata extra. |
| 137 | U06 |     }, () => { | Parte concreta de U06: }, () => { |
| 138 | U06 |         if (chrome.runtime.lastError) {} | Consome falha best-effort do IPC. |
| 139 | U06 |     }); | Fecha/continua estrutura sintática de U06. |
| 140 | U06 | } | Fecha/continua estrutura sintática de U06. |
| 141 | U06 | ␠ [linha vazia] | Separador visual dentro de U06. |
| 142 | U07 | function getUrlLogMetadata(value) { | Abre minimização de metadata de URL. |
| 143 | U07 |     const rawUrl = String(value \|\| ''); | Parte concreta de U07: const rawUrl = String(value // ''); |
| 144 | U07 |     if (rawUrl.startsWith('data:')) { | Parte concreta de U07: if (rawUrl.startsWith('data:')) { |
| 145 | U07 |         return { urlKind: 'data', host: null, hasQuery: false }; | Classifica Data URL sem conteúdo. |
| 146 | U07 |     } | Fecha/continua estrutura sintática de U07. |
| 147 | U07 |     if (rawUrl.startsWith('blob:')) { | Parte concreta de U07: if (rawUrl.startsWith('blob:')) { |
| 148 | U07 |         return { urlKind: 'blob', host: null, hasQuery: false }; | Classifica Blob URL sem identificador. |
| 149 | U07 |     } | Fecha/continua estrutura sintática de U07. |
| 150 | U07 | ␠ [linha vazia] | Separador visual dentro de U07. |
| 151 | U07 |     try { | Parte concreta de U07: try { |
| 152 | U07 |         const parsed = new URL(rawUrl); | Parseia URL para scheme/host/query flag. |
| 153 | U07 |         return { | Parte concreta de U07: return { |
| 154 | U07 |             urlKind: parsed.protocol.replace(':', ''), | Expõe apenas metadados mínimos. |
| 155 | U07 |             host: parsed.hostname \|\| null, | Parte concreta de U07: host: parsed.hostname // null, |
| 156 | U07 |             hasQuery: Boolean(parsed.search), | Parte concreta de U07: hasQuery: Boolean(parsed.search), |
| 157 | U07 |         }; | Fecha/continua estrutura sintática de U07. |
| 158 | U07 |     } catch (_error) { | Parte concreta de U07: } catch (_error) { |
| 159 | U07 |         return { urlKind: 'invalid', host: null, hasQuery: false }; | Classifica valor não parseável. |
| 160 | U07 |     } | Fecha/continua estrutura sintática de U07. |
| 161 | U07 | } | Fecha/continua estrutura sintática de U07. |
| 162 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 163 | U08 | // ── Debug gated ────────────────────────────────────────────────────────────── | Comentário arquitetural/operacional: ── Debug gated ──────────────────────────────────────────────────────────────. |
| 164 | U08 | let _debugModeEnabled = false; | Cache em memória da flag debug. |
| 165 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 166 | U08 | chrome.storage.local.get(['debugMode'], data => { | Inicializa debugMode do storage. |
| 167 | U08 |     _debugModeEnabled = data?.debugMode === true; | Parte concreta de U08: _debugModeEnabled = data?.debugMode === true; |
| 168 | U08 | }); | Fecha/continua estrutura sintática de U08. |
| 169 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 170 | U08 | if (chrome.storage?.onChanged) { | Parte concreta de U08: if (chrome.storage?.onChanged) { |
| 171 | U08 |     chrome.storage.onChanged.addListener((changes, area) => { | Atualiza debug gate sem reload. |
| 172 | U08 |         if (area === 'local' && changes.debugMode) { | Parte concreta de U08: if (area === 'local' && changes.debugMode) { |
| 173 | U08 |             _debugModeEnabled = changes.debugMode.newValue === true; | Parte concreta de U08: _debugModeEnabled = changes.debugMode.newValue === true; |
| 174 | U08 |         } | Fecha/continua estrutura sintática de U08. |
| 175 | U08 |     }); | Fecha/continua estrutura sintática de U08. |
| 176 | U08 | } | Fecha/continua estrutura sintática de U08. |
| 177 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 178 | U08 | function debugConsole(level, ...args) { | Abre console condicionado a debug. |
| 179 | U08 |     if (!_debugModeEnabled) return; | Bloqueia console fora do debug. |
| 180 | U08 |     const safeArgs = args.map(arg => | Parte concreta de U08: const safeArgs = args.map(arg => |
| 181 | U08 |         typeof arg === 'object' && arg !== null | Parte concreta de U08: typeof arg === 'object' && arg !== null |
| 182 | U08 |             ? sanitizeLogExtra(arg) | Sanitiza argumentos objeto. |
| 183 | U08 |             : arg | Parte concreta de U08: : arg |
| 184 | U08 |     ); | Fecha/continua estrutura sintática de U08. |
| 185 | U08 |     console[level](...safeArgs); | Emite console no nível fornecido internamente. |
| 186 | U08 | } | Fecha/continua estrutura sintática de U08. |
| 187 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 188 | U09 | function reportProgress(text, mangaTabId = null) { | Abre relay best-effort de progresso. |
| 189 | U09 |     chrome.runtime.sendMessage({ | Parte concreta de U09: chrome.runtime.sendMessage({ |
| 190 | U09 |         action: 'GEMINI_PROGRESS', | Encaminha progresso ao background. |
| 191 | U09 |         text, | Parte concreta de U09: text, |
| 192 | U09 |         mangaTabId, | Parte concreta de U09: mangaTabId, |
| 193 | U09 |     }, () => { | Parte concreta de U09: }, () => { |
| 194 | U09 |         if (chrome.runtime.lastError) {} | Consome falha best-effort do IPC. |
| 195 | U09 |     }); | Fecha/continua estrutura sintática de U09. |
| 196 | U09 | } | Fecha/continua estrutura sintática de U09. |
| 197 | U09 | ␠ [linha vazia] | Separador visual dentro de U09. |
| 198 | U10 | // ── Módulos com dependências de runtime ───────────────────────────────────── | Comentário arquitetural/operacional: ── Módulos com dependências de runtime ─────────────────────────────────────. |
| 199 | U10 | const resultExtractor = GeminiResultExtractor.createResultExtractor({ | Instancia extractor com dependências reais. |
| 200 | U10 |     sendLog, | Parte concreta de U10: sendLog, |
| 201 | U10 |     getUrlLogMetadata, | Parte concreta de U10: getUrlLogMetadata, |
| 202 | U10 |     sleep, | Parte concreta de U10: sleep, |
| 203 | U10 |     runtime: chrome.runtime, | Parte concreta de U10: runtime: chrome.runtime, |
| 204 | U10 |     pageWindow: window, | Parte concreta de U10: pageWindow: window, |
| 205 | U10 |     pageDocument: document, | Parte concreta de U10: pageDocument: document, |
| 206 | U10 |     fetchImpl: (...args) => fetch(...args), | Parte concreta de U10: fetchImpl: (...args) => fetch(...args), |
| 207 | U10 | }); | Fecha/continua estrutura sintática de U10. |
| 208 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 209 | U10 | const deletionController = GeminiDeletion.createDeletionController({ | Instancia controller de exclusão. |
| 210 | U10 |     root: document, | Parte concreta de U10: root: document, |
| 211 | U10 |     pageWindow: window, | Parte concreta de U10: pageWindow: window, |
| 212 | U10 |     storage: chrome.storage.local, | Parte concreta de U10: storage: chrome.storage.local, |
| 213 | U10 |     sleep, | Parte concreta de U10: sleep, |
| 214 | U10 |     sendLog, | Parte concreta de U10: sendLog, |
| 215 | U10 | }); | Fecha/continua estrutura sintática de U10. |
| 216 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 217 | U10 | const imageQuarantine = GeminiImageQuarantine.createImageQuarantine({ | Instancia quarantine. |
| 218 | U10 |     dom: GeminiDom, | Parte concreta de U10: dom: GeminiDom, |
| 219 | U10 | }); | Fecha/continua estrutura sintática de U10. |
| 220 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 221 | U10 | const jobRunner = GeminiJobRunner.createGeminiJobRunner({ | Instancia orquestrador RPA principal. |
| 222 | U10 |     root: document, | Parte concreta de U10: root: document, |
| 223 | U10 |     pageWindow: window, | Parte concreta de U10: pageWindow: window, |
| 224 | U10 |     runtime: chrome.runtime, | Parte concreta de U10: runtime: chrome.runtime, |
| 225 | U10 |     storage: chrome.storage.local, | Parte concreta de U10: storage: chrome.storage.local, |
| 226 | U10 |     domApi: GeminiDom, | Parte concreta de U10: domApi: GeminiDom, |
| 227 | U10 |     imageQuarantine, | Parte concreta de U10: imageQuarantine, |
| 228 | U10 |     observerApi: GeminiObserver, | Parte concreta de U10: observerApi: GeminiObserver, |
| 229 | U10 |     editorApi: GeminiEditor, | Parte concreta de U10: editorApi: GeminiEditor, |
| 230 | U10 |     attachmentApi: GeminiAttachment, | Parte concreta de U10: attachmentApi: GeminiAttachment, |
| 231 | U10 |     temporaryChatApi: GeminiTemporaryChat, | Parte concreta de U10: temporaryChatApi: GeminiTemporaryChat, |
| 232 | U10 |     resultExtractor, | Parte concreta de U10: resultExtractor, |
| 233 | U10 |     deletionController, | Parte concreta de U10: deletionController, |
| 234 | U10 |     sleep, | Parte concreta de U10: sleep, |
| 235 | U10 |     sendLog, | Parte concreta de U10: sendLog, |
| 236 | U10 |     getUrlLogMetadata, | Parte concreta de U10: getUrlLogMetadata, |
| 237 | U10 |     debugConsole, | Parte concreta de U10: debugConsole, |
| 238 | U10 |     reportProgress, | Parte concreta de U10: reportProgress, |
| 239 | U10 |     openKeepAlive, | Injeta abertura keep-alive no runner. |
| 240 | U10 |     closeKeepAlive, | Injeta fechamento keep-alive no runner. |
| 241 | U10 | }); | Fecha/continua estrutura sintática de U10. |
| 242 | U10 | ␠ [linha vazia] | Separador visual dentro de U10. |
| 243 | U10 | // ── Claim seguro ───────────────────────────────────────────────────────────── | Comentário arquitetural/operacional: ── Claim seguro ─────────────────────────────────────────────────────────────. |
| 244 | U11 | function getExpectedGeminiJobId() { | Abre extração do jobId esperado. |
| 245 | U11 |     try { | Parte concreta de U11: try { |
| 246 | U11 |         const parsed = new URL(window.location.href); | Parte concreta de U11: const parsed = new URL(window.location.href); |
| 247 | U11 |         const jobId = parsed.searchParams.get('jobId'); | Lê jobId explícito da query. |
| 248 | U11 |         return jobId?.trim() ? jobId.trim() : null; | Normaliza vazio/whitespace para null. |
| 249 | U11 |     } catch (_error) { | Parte concreta de U11: } catch (_error) { |
| 250 | U11 |         return null; | Parte concreta de U11: return null; |
| 251 | U11 |     } | Fecha/continua estrutura sintática de U11. |
| 252 | U11 | } | Fecha/continua estrutura sintática de U11. |
| 253 | U11 | ␠ [linha vazia] | Separador visual dentro de U11. |
| 254 | U12 | function sendRuntimeMessage(message) { | Abre wrapper de IPC de claim. |
| 255 | U12 |     return new Promise(resolve => { | Parte concreta de U12: return new Promise(resolve => { |
| 256 | U12 |         try { | Parte concreta de U12: try { |
| 257 | U12 |             chrome.runtime.sendMessage(message, response => { | Parte concreta de U12: chrome.runtime.sendMessage(message, response => { |
| 258 | U12 |                 if (chrome.runtime.lastError) resolve(null); | Consome falha best-effort do IPC. |
| 259 | U12 |                 else resolve(response \|\| null); | Parte concreta de U12: else resolve(response // null); |
| 260 | U12 |             }); | Fecha/continua estrutura sintática de U12. |
| 261 | U12 |         } catch (_error) { | Parte concreta de U12: } catch (_error) { |
| 262 | U12 |             resolve(null); | Normaliza erro/ausência em null. |
| 263 | U12 |         } | Fecha/continua estrutura sintática de U12. |
| 264 | U12 |     }); | Fecha/continua estrutura sintática de U12. |
| 265 | U12 | } | Fecha/continua estrutura sintática de U12. |
| 266 | U12 | ␠ [linha vazia] | Separador visual dentro de U12. |
| 267 | U13 | async function claimGeminiJob({ timeoutMs = 5000 } = {}) { | Abre claim moderno com fallback legado. |
| 268 | U13 |     const expectedJobId = getExpectedGeminiJobId(); | Fixa identidade esperada no início. |
| 269 | U13 |     const startedAt = Date.now(); | Parte concreta de U13: const startedAt = Date.now(); |
| 270 | U13 |     let claimUnsupported = false; | Parte concreta de U13: let claimUnsupported = false; |
| 271 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 272 | U13 |     do { | Parte concreta de U13: do { |
| 273 | U13 |         const response = await sendRuntimeMessage({ | Parte concreta de U13: const response = await sendRuntimeMessage({ |
| 274 | U13 |             action: 'CLAIM_GEMINI_JOB', | Solicita job pertencente à aba. |
| 275 | U13 |             jobId: expectedJobId \|\| undefined, | Parte concreta de U13: jobId: expectedJobId // undefined, |
| 276 | U13 |         }); | Fecha/continua estrutura sintática de U13. |
| 277 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 278 | U13 |         if (response?.ok === true && response.job) { | Retorna job moderno válido. |
| 279 | U13 |             return response.job; | Parte concreta de U13: return response.job; |
| 280 | U13 |         } | Fecha/continua estrutura sintática de U13. |
| 281 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 282 | U13 |         if ( | Parte concreta de U13: if ( |
| 283 | U13 |             response?.ok === true && | Parte concreta de U13: response?.ok === true && |
| 284 | U13 |             Object.prototype.hasOwnProperty.call(response, 'job') | Distingue job:null moderno de action sem resposta. |
| 285 | U13 |         ) { | Parte concreta de U13: ) { |
| 286 | U13 |             if (!expectedJobId) return null; | Aba manual fica inerte. |
| 287 | U13 |         } else if (!response) { | Parte concreta de U13: } else if (!response) { |
| 288 | U13 |             // Compatibilidade transitória com background/fixtures anteriores. | Comentário arquitetural/operacional: Compatibilidade transitória com background/fixtures anteriores.. |
| 289 | U13 |             // Nunca faz full scan. | Comentário arquitetural/operacional: Nunca faz full scan.. |
| 290 | U13 |             claimUnsupported = true; | Ativa fallback apenas se action moderna não respondeu. |
| 291 | U13 |             break; | Parte concreta de U13: break; |
| 292 | U13 |         } | Fecha/continua estrutura sintática de U13. |
| 293 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 294 | U13 |         if (Date.now() - startedAt >= timeoutMs) return null; | Limita retry moderno por timeout. |
| 295 | U13 |         await sleep(500); | Espaça polling. |
| 296 | U13 |     } while (Date.now() - startedAt < timeoutMs); | Limita retry moderno por timeout. |
| 297 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 298 | U13 |     if (!claimUnsupported) return null; | Parte concreta de U13: if (!claimUnsupported) return null; |
| 299 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 300 | U13 |     let tabResponse = null; | Parte concreta de U13: let tabResponse = null; |
| 301 | U13 |     for (let attempt = 0; attempt < 5; attempt += 1) { | Limita descoberta de tabId a cinco tentativas. |
| 302 | U13 |         tabResponse = await sendRuntimeMessage({ action: 'GET_TAB_ID' }); | Descobre tabId no fallback legado. |
| 303 | U13 |         if (tabResponse && Number.isInteger(tabResponse.tabId)) break; | Parte concreta de U13: if (tabResponse && Number.isInteger(tabResponse.tabId)) break; |
| 304 | U13 |         await sleep(500); | Espaça polling. |
| 305 | U13 |     } | Fecha/continua estrutura sintática de U13. |
| 306 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 307 | U13 |     if (!tabResponse \|\| !Number.isInteger(tabResponse.tabId)) return null; | Parte concreta de U13: if (!tabResponse // !Number.isInteger(tabResponse.tabId)) return null; |
| 308 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 309 | U13 |     const tabId = tabResponse.tabId; | Parte concreta de U13: const tabId = tabResponse.tabId; |
| 310 | U13 |     const jobKey = `gemini_job_${tabId}`; | Deriva chave legado específica da aba. |
| 311 | U13 |     const legacyStartedAt = Date.now(); | Parte concreta de U13: const legacyStartedAt = Date.now(); |
| 312 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 313 | U13 |     do { | Parte concreta de U13: do { |
| 314 | U13 |         const data = await new Promise(resolve => | Parte concreta de U13: const data = await new Promise(resolve => |
| 315 | U13 |             chrome.storage.local.get([jobKey], resolve) | Consulta somente o job da aba. |
| 316 | U13 |         ); | Fecha/continua estrutura sintática de U13. |
| 317 | U13 |         const job = data?.[jobKey]; | Parte concreta de U13: const job = data?.[jobKey]; |
| 318 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 319 | U13 |         if (job && (!expectedJobId \|\| job.jobId === expectedJobId)) { | Valida jobId esperado no fallback legado. |
| 320 | U13 |             return { ...job, geminiTabId: tabId }; | Normaliza geminiTabId no job legado. |
| 321 | U13 |         } | Fecha/continua estrutura sintática de U13. |
| 322 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 323 | U13 |         if (Date.now() - legacyStartedAt >= timeoutMs) return null; | Parte concreta de U13: if (Date.now() - legacyStartedAt >= timeoutMs) return null; |
| 324 | U13 |         await sleep(500); | Espaça polling. |
| 325 | U13 |     } while (Date.now() - legacyStartedAt < timeoutMs); | Parte concreta de U13: } while (Date.now() - legacyStartedAt < timeoutMs); |
| 326 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 327 | U13 |     return null; | Parte concreta de U13: return null; |
| 328 | U13 | } | Fecha/continua estrutura sintática de U13. |
| 329 | U13 | ␠ [linha vazia] | Separador visual dentro de U13. |
| 330 | U13 | // ── Bootstrap / claim / runner ─────────────────────────────────────────────── | Comentário arquitetural/operacional: ── Bootstrap / claim / runner ───────────────────────────────────────────────. |
| 331 | U14 | async function processGeminiJob() { | Abre bootstrap de job. |
| 332 | U14 |     debugConsole( | Parte concreta de U14: debugConsole( |
| 333 | U14 |         'log', | Parte concreta de U14: 'log', |
| 334 | U14 |         '[MangaTranslator Gemini] processGeminiJob iniciado na aba' | Parte concreta de U14: '[MangaTranslator Gemini] processGeminiJob iniciado na aba' |
| 335 | U14 |     ); | Fecha/continua estrutura sintática de U14. |
| 336 | U14 | ␠ [linha vazia] | Separador visual dentro de U14. |
| 337 | U14 |     const currentPath = window.location.pathname; | Captura path atual. |
| 338 | U14 |     if ( | Parte concreta de U14: if ( |
| 339 | U14 |         currentPath && | Parte concreta de U14: currentPath && |
| 340 | U14 |         currentPath.length > 8 && | Parte concreta de U14: currentPath.length > 8 && |
| 341 | U14 |         currentPath.startsWith('/app/') | Parte concreta de U14: currentPath.startsWith('/app/') |
| 342 | U14 |     ) { | Parte concreta de U14: ) { |
| 343 | U14 |         const data = await new Promise(resolve => | Parte concreta de U14: const data = await new Promise(resolve => |
| 344 | U14 |             chrome.storage.local.get(['deleting_urls'], resolve) | Consulta journal de conversas sendo apagadas. |
| 345 | U14 |         ); | Fecha/continua estrutura sintática de U14. |
| 346 | U14 |         const deletingUrls = data.deleting_urls \|\| []; | Consulta journal de conversas sendo apagadas. |
| 347 | U14 |         const isBeingDeleted = deletingUrls.some(value => { | Parte concreta de U14: const isBeingDeleted = deletingUrls.some(value => { |
| 348 | U14 |             try { | Parte concreta de U14: try { |
| 349 | U14 |                 return new URL(value).pathname === currentPath; | Compara deleting_url por pathname. |
| 350 | U14 |             } catch (_error) { | Parte concreta de U14: } catch (_error) { |
| 351 | U14 |                 return String(value).includes(currentPath); | Fallback para valor inválido. |
| 352 | U14 |             } | Fecha/continua estrutura sintática de U14. |
| 353 | U14 |         }); | Fecha/continua estrutura sintática de U14. |
| 354 | U14 | ␠ [linha vazia] | Separador visual dentro de U14. |
| 355 | U14 |         if (isBeingDeleted) return; | Impede RPA durante cleanup da conversa. |
| 356 | U14 |     } | Fecha/continua estrutura sintática de U14. |
| 357 | U14 | ␠ [linha vazia] | Separador visual dentro de U14. |
| 358 | U14 |     // Jobs gerenciados carregam jobId na URL. Em janela minimizada o Chrome | Comentário arquitetural/operacional: Jobs gerenciados carregam jobId na URL. Em janela minimizada o Chrome. |
| 359 | U14 |     // pode atrasar o scheduling/document_idle; dê margem maior para o registro | Comentário arquitetural/operacional: pode atrasar o scheduling/document_idle; dê margem maior para o registro. |
| 360 | U14 |     // durável aparecer sem penalizar abas Gemini manuais (sem jobId). | Comentário arquitetural/operacional: durável aparecer sem penalizar abas Gemini manuais (sem jobId).. |
| 361 | U14 |     const managedJobClaimTimeoutMs = getExpectedGeminiJobId() ? 12_000 : 5_000; | Dá timeout maior a jobs gerenciados. |
| 362 | U14 |     const job = await claimGeminiJob({ timeoutMs: managedJobClaimTimeoutMs }); | Dá timeout maior a jobs gerenciados. |
| 363 | U14 |     const isExistingChat = currentPath.startsWith('/app/'); | Distingue chat existente. |
| 364 | U14 | ␠ [linha vazia] | Separador visual dentro de U14. |
| 365 | U14 |     if (!job) { | Parte concreta de U14: if (!job) { |
| 366 | U14 |         if (!isExistingChat) { | Parte concreta de U14: if (!isExistingChat) { |
| 367 | U14 |             sendLog( | Parte concreta de U14: sendLog( |
| 368 | U14 |                 'warn', | Parte concreta de U14: 'warn', |
| 369 | U14 |                 'JOB_NOT_FOUND', | Registra ausência de job em nova conversa. |
| 370 | U14 |                 'Nenhum job válido foi reivindicado para esta aba — script desativado', | Parte concreta de U14: 'Nenhum job válido foi reivindicado para esta aba — script desativado', |
| 371 | U14 |                 { path: currentPath } | Parte concreta de U14: { path: currentPath } |
| 372 | U14 |             ); | Fecha/continua estrutura sintática de U14. |
| 373 | U14 |         } | Fecha/continua estrutura sintática de U14. |
| 374 | U14 |         closeKeepAlive(); | Parte concreta de U14: closeKeepAlive(); |
| 375 | U14 |         return; | Parte concreta de U14: return; |
| 376 | U14 |     } | Fecha/continua estrutura sintática de U14. |
| 377 | U14 | ␠ [linha vazia] | Separador visual dentro de U14. |
| 378 | U14 |     return jobRunner.run(job); | Delega execução detalhada ao jobRunner. |
| 379 | U14 | } | Fecha/continua estrutura sintática de U14. |
| 380 | U14 | ␠ [linha vazia] | Separador visual dentro de U14. |
| 381 | U14 | // ── Runtime handlers ───────────────────────────────────────────────────────── | Comentário arquitetural/operacional: ── Runtime handlers ─────────────────────────────────────────────────────────. |
| 382 | U15 | chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { | Registra comandos runtime externos. |
| 383 | U15 |     if (request.action === 'DO_SEND_NOW') { | Handler de submit imediato. |
| 384 | U15 |         const stopButton = GeminiDom.findVisibleStopButton(document); | Detecta geração ativa. |
| 385 | U15 |         if (stopButton) { | Parte concreta de U15: if (stopButton) { |
| 386 | U15 |             sendResponse({ ok: true, alreadyGenerating: true }); | ACK de geração já em curso. |
| 387 | U15 |             return false; | Parte concreta de U15: return false; |
| 388 | U15 |         } | Fecha/continua estrutura sintática de U15. |
| 389 | U15 | ␠ [linha vazia] | Separador visual dentro de U15. |
| 390 | U15 |         const editor = document.querySelector( | Localiza editor fallback. |
| 391 | U15 |             'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]' | Parte concreta de U15: 'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]' |
| 392 | U15 |         ); | Fecha/continua estrutura sintática de U15. |
| 393 | U15 |         const sendButton = GeminiDom.findSendButton(document.body); | Localiza botão send. |
| 394 | U15 |         let attempted = false; | Parte concreta de U15: let attempted = false; |
| 395 | U15 | ␠ [linha vazia] | Separador visual dentro de U15. |
| 396 | U15 |         if (sendButton && GeminiDom.isControlEnabled(sendButton)) { | Evita botão desabilitado. |
| 397 | U15 |             attempted = GeminiEditor.clickSendButton(sendButton); | Tenta click via Editor API. |
| 398 | U15 |         } else { | Parte concreta de U15: } else { |
| 399 | U15 |             GeminiEditor.nudgeEditor(editor); | Provoca atualização do editor antes do evento fallback. |
| 400 | U15 |             window.dispatchEvent( | Parte concreta de U15: window.dispatchEvent( |
| 401 | U15 |                 new CustomEvent('MANGA_TRANSLATOR_TRIGGER_SEND') | Dispara bridge MAIN-world. |
| 402 | U15 |             ); | Fecha/continua estrutura sintática de U15. |
| 403 | U15 |             attempted = true; | Parte concreta de U15: attempted = true; |
| 404 | U15 |         } | Fecha/continua estrutura sintática de U15. |
| 405 | U15 | ␠ [linha vazia] | Separador visual dentro de U15. |
| 406 | U15 |         sendResponse({ ok: true, attempted }); | Responde tentativa síncrona. |
| 407 | U15 |         return false; | Parte concreta de U15: return false; |
| 408 | U15 |     } | Fecha/continua estrutura sintática de U15. |
| 409 | U15 | ␠ [linha vazia] | Separador visual dentro de U15. |
| 410 | U15 |     if (request.action === 'DELETE_CONVERSATION') { | Handler assíncrono de deleção. |
| 411 | U15 |         deletionController.deleteCurrentConversation() | Delega ao controller seguro. |
| 412 | U15 |             .then(ok => sendResponse({ ok })) | Converte booleano em ACK. |
| 413 | U15 |             .catch(error => sendResponse({ | Parte concreta de U15: .catch(error => sendResponse({ |
| 414 | U15 |                 ok: false, | Parte concreta de U15: ok: false, |
| 415 | U15 |                 error: error.message, | Serializa rejeição. |
| 416 | U15 |             })); | Fecha/continua estrutura sintática de U15. |
| 417 | U15 |         return true; | Parte concreta de U15: return true; |
| 418 | U15 |     } | Fecha/continua estrutura sintática de U15. |
| 419 | U15 | }); | Fecha/continua estrutura sintática de U15. |
| 420 | U15 | ␠ [linha vazia] | Separador visual dentro de U15. |
| 421 | U16 | const contentGeminiApi = { | Abre API CommonJS/testes. |
| 422 | U16 |     sleep, | Parte concreta de U16: sleep, |
| 423 | U16 |     getExpectedGeminiJobId, | Parte concreta de U16: getExpectedGeminiJobId, |
| 424 | U16 |     claimGeminiJob, | Parte concreta de U16: claimGeminiJob, |
| 425 | U16 |     openKeepAlive, | Injeta abertura keep-alive no runner. |
| 426 | U16 |     closeKeepAlive, | Injeta fechamento keep-alive no runner. |
| 427 | U16 |     processGeminiJob, | Parte concreta de U16: processGeminiJob, |
| 428 | U16 |     dataURLtoFile: (...args) => jobRunner.dataURLtoFile(...args), | Proxy para helper do jobRunner. |
| 429 | U16 |     waitForElement: (...args) => jobRunner.waitForElement(...args), | Proxy para helper do jobRunner. |
| 430 | U16 |     createGeminiManualPanel: (...args) => jobRunner.createGeminiManualPanel(...args), | Proxy para helper do jobRunner. |
| 431 | U16 |     removeGeminiManualPanel: (...args) => jobRunner.removeGeminiManualPanel(...args), | Proxy para helper do jobRunner. |
| 432 | U16 |     setManualGeminiResultUrl: (...args) => jobRunner.setManualGeminiResultUrl(...args), | Proxy para helper do jobRunner. |
| 433 | U16 |     findGeneratedResultImages: (...args) => jobRunner.findGeneratedResultImages(...args), | Proxy para helper do jobRunner. |
| 434 | U16 |     isManualSelectableImage: (...args) => jobRunner.isManualSelectableImage(...args), | Proxy para helper do jobRunner. |
| 435 | U16 |     shouldKeepConversationForDebug: (...args) => jobRunner.shouldKeepConversationForDebug(...args), | Proxy para helper do jobRunner. |
| 436 | U16 |     imageElementToDataUrl: (...args) => resultExtractor.imageElementToDataUrl(...args), | Proxy para helper do extractor. |
| 437 | U16 |     fetchImageThroughGeminiPage: (...args) => resultExtractor.fetchImageThroughGeminiPage(...args), | Proxy para helper do extractor. |
| 438 | U16 |     fetchImageThroughExtension: (...args) => resultExtractor.fetchGeminiImageThroughExtension(...args), | Proxy para helper do extractor. |
| 439 | U16 |     fetchImageThroughGeminiExtension: (...args) => resultExtractor.fetchGeminiImageThroughExtension(...args), | Proxy para helper do extractor. |
| 440 | U16 |     fetchGeminiImageThroughExtension: (...args) => resultExtractor.fetchGeminiImageThroughExtension(...args), | Proxy para helper do extractor. |
| 441 | U16 |     extractImageInGeminiTab: (...args) => resultExtractor.extractImageInGeminiTab(...args), | Proxy para helper do extractor. |
| 442 | U16 |     extractResultImage: (...args) => resultExtractor.extractResultImage(...args), | Proxy para helper do extractor. |
| 443 | U16 |     extractResultImageWithRetry: (...args) => resultExtractor.extractResultImageWithRetry(...args), | Proxy para helper do extractor. |
| 444 | U16 |     getExtractionFailureKind: (...args) => resultExtractor.getExtractionFailureKind(...args), | Proxy para helper do extractor. |
| 445 | U16 |     deleteCurrentConversation: (...args) => deletionController.deleteCurrentConversation(...args), | Proxy para helper do deletion controller. |
| 446 | U16 |     waitForElementToSettle: (...args) => deletionController.waitForElementToSettle(...args), | Proxy para helper do deletion controller. |
| 447 | U16 |     escapeCssAttributeValue: (...args) => deletionController.escapeCssAttributeValue(...args), | Proxy para helper do deletion controller. |
| 448 | U16 |     __getDeletionInProgress: () => deletionController.isDeletionInProgress(), | Proxy para helper do deletion controller. |
| 449 | U16 | } | Fecha/continua estrutura sintática de U16. |
| 450 | U16 | ␠ [linha vazia] | Separador visual dentro de U16. |
| 451 | U17 | const isCommonJsTest = | Detecta ambiente CommonJS. |
| 452 | U17 |     typeof module !== 'undefined' && | Parte concreta de U17: typeof module !== 'undefined' && |
| 453 | U17 |     module && | Parte concreta de U17: module && |
| 454 | U17 |     module.exports; | Parte concreta de U17: module.exports; |
| 455 | U17 | ␠ [linha vazia] | Separador visual dentro de U17. |
| 456 | U17 | if (isCommonJsTest) { | Parte concreta de U17: if (isCommonJsTest) { |
| 457 | U17 |     module.exports = contentGeminiApi; | Exporta API sem auto-start. |
| 458 | U17 | } else if (!window.__mt_gemini_started) { | Guard contra dupla injeção. |
| 459 | U17 |     window.__mt_gemini_started = true; | Marca contexto como iniciado. |
| 460 | U17 |     processGeminiJob(); | Dispara bootstrap automático em produção. |
| 461 | U17 | } | Fecha/continua estrutura sintática de U17. |
| 462 | U18 | ⏎ [newline final] | Newline terminal editorial da fonte. |

## 19. Análise por unidade

### U01 — linhas 1–6 — Cabeçalho e sleep

**O que faz:** Declara o papel de bootstrap e helper sleep compartilhado.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Mantém delays injetáveis nos submódulos sem duplicar implementação.

**Alternativa ingênua pior:** Timers ad-hoc em cada módulo dificultariam testes e cleanup.

### U02 — linhas 7–30 — Resolução/fail-fast dos módulos Gemini

**O que faz:** Captura nove APIs globais e aborta se qualquer dependência obrigatória não foi carregada.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Manifest injeta módulos clássicos em ordem antes do bootstrap.

**Alternativa ingênua pior:** Prosseguir com módulo ausente produziria falha tardia e estado parcial durante um job.

### U03 — linhas 31–76 — connectKeepAlive

**O que faz:** Abre port `gemini-keep-alive`, observa disconnect e tenta uma única reconexão por job.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Mantém o worker/background alcançável durante job sem reconexão infinita.

**Alternativa ingênua pior:** Loop ilimitado de reconnect poderia gerar churn/leak; port permanente em abas manuais seria desperdício.

### U04 — linhas 77–97 — open/closeKeepAlive

**O que faz:** Ativa/desativa flags do ciclo do port e desconecta explicitamente no fim.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Separa estado do job do objeto Port e bloqueia reconnect durante shutdown.

**Alternativa ingênua pior:** Apenas disconnect sem flags permitiria onDisconnect reabrir o port após conclusão.

### U05 — linhas 98–128 — sanitizeLogExtra

**O que faz:** Redige chaves sensíveis, URLs/data/blob, limita strings e percorre objetos/arrays.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Telemetria Gemini não deve vazar prompt, imagem, token, URL ou Base64.

**Alternativa ingênua pior:** Logar objetos crus poderia expor dados de página/credenciais no translatorLog.

### U06 — linhas 129–141 — sendLog

**O que faz:** Encaminha LOG_ENTRY com source gemini e payload sanitizado.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Centraliza privacy boundary de logs do content Gemini.

**Alternativa ingênua pior:** Cada submódulo enviar logs diretamente poderia esquecer redaction.

### U07 — linhas 142–161 — getUrlLogMetadata

**O que faz:** Converte URL em metadados mínimos: kind/host/hasQuery.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Permite diagnóstico de rotas de imagem sem registrar URL completa.

**Alternativa ingênua pior:** Logar URL completa pode expor query tokens/paths privados.

### U08 — linhas 162–187 — Debug gating

**O que faz:** Carrega/observa debugMode e só escreve console quando habilitado.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Mantém console silencioso em produção e sincroniza mudança sem reload.

**Alternativa ingênua pior:** Console incondicional aumenta ruído e risco de dados sensíveis.

### U09 — linhas 188–197 — reportProgress

**O que faz:** Envia GEMINI_PROGRESS com texto e mangaTabId, ignorando falha de transporte.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** O progresso é best-effort e não deve travar o job.

**Alternativa ingênua pior:** Aguardar ACK de UI poderia bloquear RPA por uma aba leitora fechada.

### U10 — linhas 198–243 — Composição dos módulos de runtime

**O que faz:** Cria extractor, deletion, quarantine e jobRunner injetando DOM, runtime, storage, logging, helpers e keep-alive.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Concentra wiring num único composition root; lógica detalhada fica em módulos específicos.

**Alternativa ingênua pior:** Reimplementar RPA neste arquivo recriaria o monólito e esconderia dependências.

### U11 — linhas 244–253 — getExpectedGeminiJobId

**O que faz:** Extrai jobId da query da URL, trimado, ou null.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Liga a aba aberta pelo lifecycle ao job esperado sem full scan.

**Alternativa ingênua pior:** Aceitar qualquer job encontrado poderia fazer uma aba manual reivindicar trabalho alheio.

### U12 — linhas 254–266 — sendRuntimeMessage

**O que faz:** Wrapper Promise que transforma lastError/throw/resposta ausente em null.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Claim pode distinguir bridge indisponível de resposta explícita.

**Alternativa ingênua pior:** Propagar exceção de IPC interromperia bootstrap em vez de permitir fallback controlado.

### U13 — linhas 267–330 — claimGeminiJob

**O que faz:** Tenta CLAIM_GEMINI_JOB com retry; só se a action parecer não suportada cai para GET_TAB_ID + `gemini_job_<tabId>` legado.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Prioriza ownership/claim moderno e mantém compatibilidade transitória sem fazer full scan.

**Alternativa ingênua pior:** Full scan de storage ou pegar primeiro job poderia causar cross-tab takeover/race.

### U14 — linhas 331–381 — processGeminiJob

**O que faz:** Evita chats em deleção, escolhe timeout de claim, permanece inerte sem job e delega job válido ao runner.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Bootstrap deve ser seguro em abas Gemini manuais e em superfícies de cleanup.

**Alternativa ingênua pior:** Rodar RPA sem job válido poderia editar/enviar conteúdo em conversa do usuário.

### U15 — linhas 382–420 — Handlers DO_SEND_NOW e DELETE_CONVERSATION

**O que faz:** Expõe dois comandos runtime: submit imediato/fallback e deleção assíncrona.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Mantém compatibilidade com background legado e cleanup pós-finalização.

**Alternativa ingênua pior:** Misturar esses comandos no jobRunner tornaria lifecycle e handlers externos fortemente acoplados.

### U16 — linhas 421–450 — API CommonJS/wrappers

**O que faz:** Expõe helpers do bootstrap e proxies para jobRunner/resultExtractor/deletion usados por testes/compatibilidade.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Permite testes focalizados sem exportar internals de cada submódulo diretamente do global runtime.

**Alternativa ingênua pior:** Duplicar implementações nos exports produziria comportamento diferente de produção.

### U17 — linhas 451–461 — Seleção teste versus auto-start

**O que faz:** Em CommonJS exporta API sem iniciar; no browser usa flag idempotente e chama processGeminiJob uma vez.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Evita efeitos colaterais automáticos nos testes e dupla injeção no browser.

**Alternativa ingênua pior:** Auto-start em require tornaria testes não determinísticos; sem flag dupla injeção criaria dois runners.

### U18 — linhas 462–462 — Newline final

**O que faz:** Representa newline terminal da fonte.

**Como faz:** compõe APIs Gemini e runtime Chrome conforme o bloco, preservando guards de claim, keep-alive e privacidade.

**Por que assim:** Mantém equivalência física da Bíblia.

**Alternativa ingênua pior:** Omitir posição quebraria rastreabilidade integral.

## 20. Auditoria final

- [x] SHA/fonte integral;
- [x] 461 linhas + newline = 462/462;
- [x] composition root separado dos submódulos;
- [x] claim moderno/fallback legado ligados às suites reais;
- [x] keep-alive ligado a assertions diretas;
- [x] deleting_urls/deletion handler ligados a provas reais;
- [x] DO_SEND_NOW mantido como lacuna do receiver;
- [x] privacy/logging/auto-start analisados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `55bc83afe31a10c53f39799717f2f221b6919029`.

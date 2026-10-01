# Bíblia técnica — tests/helpers/load-content-script.js

> **Estado documental:** reparo corretivo materializado; validação executável final em andamento  
> **SHA auditado:** `0b52224bd7063db9b6bb683d827217d8f2fda69c`  
> **Tipo:** helper de harness Jest/JSDOM para executar o bundle Manga real sob estado controlado  
> **Linhas textuais:** **495**  
> **Posições documentais:** **496**, contando o LF final  
> **Tamanho textual observado:** **19242 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`loadContentScript()` prepara um JSDOM controlado e executa os módulos reais do bundle Manga. Ele não replica a lógica de `content_manga.js`; configura localização, storage, fixtures e globals, carrega a sequência declarada no Manifest e devolve utilitários que dirigem os listeners reais.

A revisão atual também assume ownership explícito dos recursos criados pela carga: listeners Chrome, listeners globais de `window/document`, teardown seletivo da instância anterior e um guard contra duas cargas concorrentes no mesmo ambiente JSDOM.

## 2. Contrato público

Entradas: `hostname`, `enabledDomains`, `bannedImages`, `imageMinWidth`, `imageMinHeight`, `floatingButtonEnabled`, `clickToTranslateEnabled`, `domImages` e `readyTimeoutMs`.

`enabledDomains ?? [hostname]` preserva array vazio. Flags booleanas só são persistidas quando diferentes de `undefined`, preservando `false`. O timeout default de readiness permanece 250 ms.

O JSDoc está ligado diretamente a `loadContentScript` e descreve o retorno real: `sendMessage(action, extra)`, `getButton()` e `getMainContent()`.

## 3. Manifest como fonte canônica

`getMangaContentScriptRelativePaths()` lê `extension/manifest.json`, encontra o entry que contém `content/content_manga.js` e retorna a lista `js` na ordem declarada. O helper deixou de duplicar manualmente os seis paths do bundle.

O self-test compara o retorno com o Manifest atual, de modo que inclusão, remoção ou reordenação do bundle passa a ser detectável.

## 4. Ownership e reinjeção

Registries persistidos em `globalThis` mantêm ownership mesmo após `jest.resetModules()` para:

- listeners de `chrome.storage.onChanged`;
- listeners de `chrome.runtime.onMessage`;
- listeners globais de `window/document` capturados como originados do diretório `extension/`;
- flag de carga em andamento.

Antes de nova carga, o helper executa teardown seletivo dos listeners `pagehide` pertencentes ao bundle anterior, remove os listeners rastreados e só então troca o token `window.__manga_translator_active_instance`.

O teardown seletivo não dispara `pagehide` globalmente; portanto listeners externos da página/teste não recebem um evento artificial.

## 5. Captura de listeners globais

`startGlobalEventListenerCapture()` instrumenta temporariamente `window.addEventListener` e `document.addEventListener`, preservando se o método era own property e seu descriptor original. `stop()` restaura a forma exata anterior.

A captura usa o stack normalizado para registrar somente chamadas originadas de `extension/`. Isso evita tomar ownership de listeners externos adicionados no mesmo intervalo assíncrono.

A instrumentação permanece ativa até o bootstrap terminar, cobrindo handlers adicionados por callbacks assíncronos de storage e pela criação do botão.

## 6. Cleanup e erros

`cleanupContentInstanceListeners()` tenta o teardown da instância e, independentemente de erro, percorre cleanup de storage, runtime e listeners globais. Cada remover é best-effort por item: um erro não impede os outros recursos de serem liberados.

Se existe um erro causal de bundle/bootstrap/timeout, um erro secundário de cleanup pode ser anexado como `cleanupError` somente quando o objeto de erro permite escrita; o erro causal continua sendo propagado.

O guard `LOAD_IN_PROGRESS` é liberado em `finally`, inclusive em timeout, exceção de bootstrap, falha parcial e teardown que lança.

## 7. Fixture DOM

As imagens são construídas por `document.createElement` e `setAttribute`, não por interpolação de `innerHTML`. Isso mantém valores controlados pelo teste como dados e evita que aspas/markup alterem a estrutura do fixture.

`naturalWidth`, `naturalHeight` e `complete` são definidos explicitamente e configuráveis para suprir o que JSDOM não renderiza.

## 8. Bootstrap e readiness

Quando o host está habilitado e `floatingButtonEnabled !== false`, o helper aguarda o botão `#manga-translator-trigger` marcar `dataset.positionReady === 'true'`.

Timeout não é silencioso: o caminho negativo limpa a carga parcial, remove o botão e rejeita com mensagem causal contendo o limite efetivo.

Exceções ocorridas durante a conversão/espera do timeout também param a captura global em `finally` e executam cleanup.

## 9. sendMessage

`sendMessage` entrega o payload aos listeners reais armazenados no mock de runtime.

- payload: `{ ...extra, action }`, portanto `extra.action` não substitui o argumento explícito;
- primeira resolução/rejeição efetiva vence;
- resposta síncrona não deixa fallback pendente;
- listener que retorna `true` abre janela assíncrona do harness de 500 ms;
- sem canal assíncrono, o fallback é 50 ms;
- fallback é cancelado após settlement;
- throw antes do settlement rejeita; throw posterior não reverte resultado anterior.

Os 500 ms são política bounded do harness, não uma afirmação de equivalência temporal ilimitada com Chromium.

## 10. Concorrência

Duas chamadas simultâneas no mesmo JSDOM são rejeitadas explicitamente. Sem esse guard, duas instrumentações de `addEventListener` e dois conjuntos de registries poderiam disputar ownership e restaurar métodos/listeners fora de ordem.

O self-test inicia duas cargas concorrentes, exige rejeição da segunda e prova que uma terceira carga funciona após a primeira finalizar.

## 11. Requests históricas

### 102-001 — IMPLEMENTED; validação final pendente

JSDoc corrigido e teste estático garante que ele continua imediatamente associado à função pública.

### 102-002 — IMPLEMENTED; validação final pendente

Fallback cancelável, resposta síncrona/assíncrona, ausência de resposta, throws e `--detectOpenHandles` possuem regressões focais.

### 102-003 — IMPLEMENTED; validação final pendente

Bundle derivado diretamente do Manifest e comparação focal com `content_scripts[].js`.

### 102-004 — IMPLEMENTED; validação final pendente

Bootstrap incompleto rejeita com diagnóstico causal e cleanup; exceção intermediária também restaura instrumentação.

### 102-005 — IMPLEMENTED; validação final pendente

Listeners stale de storage/runtime/global são rastreados e removidos; existem testes para reinjeção, `jest.resetModules`, falha parcial, handlers criados pelo botão, preservação de listeners externos e erros durante cleanup.

## 12. Evidência de teste

- Self-test focal: `docs/biblia/.coordination/load-content-script-selftest.test.js` (SHA `95b2584cb61a180265d5b8c9712c6f846e37b960`).
- Casos focais atuais: 26.
- Workflow: `.github/workflows/load-content-script-selftest.yml` (SHA `9eb534298b30c7dd619ecbb2d51e044f972f50d6`).
- O workflow executa primeiro o self-test com `--runInBand --detectOpenHandles` e depois o projeto Jest `content-scripts` completo.
- A decisão final desta Bíblia depende da execução verde vinculada a este `SOURCE_SHA`; runs de revisões anteriores não contam como prova final.

## 13. Regressão contra BASE

`main` possuía o helper original sem cleanup de listeners, sem fonte única do Manifest, sem timeout causal, sem guard concorrente e com fallback residual. Os consumers continuam recebendo a mesma API pública (`sendMessage`, `getButton`, `getMainContent`) e os mesmos defaults funcionais relevantes; as mudanças endurecem lifecycle/diagnóstico e eliminam ambiguidades, sem trocar a interface pública.

## 14. Limites explícitos

- O helper depende de internals dos mocks (`_listeners`, `_messageListeners`); refatorar os mocks exige revalidar esta unidade.
- O shape de `window.location` é propositalmente parcial (`hostname`, `href`, `pathname`) e suficiente ao bundle atual auditado.
- A captura global depende de stack traces Node/Jest contendo o path dos módulos sob `extension/`; o self-test exercita handlers síncronos e assíncronos do bundle atual.
- Recursos internos que o próprio content script não expõe e que não criam handles observáveis continuam responsabilidade do lifecycle do código de produção, não do harness.

## 15. Fonte integral exata

```js
/**
 * load-content-script.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configura o ambiente JSDOM para testes comportamentais do content_manga.js.
 *
 * PROBLEMA: content_manga.js é um IIFE que:
 * 1. Roda imediatamente ao ser carregado (via require)
 * 2. Registra listeners no chrome.runtime.onMessage
 * 3. Acessa window.location.hostname para verificar whitelist
 * 4. Chama chrome.storage.local.get(['enabledDomains']) assincronamente
 *
 * Esta função configura tudo na ordem certa para que os testes funcionem.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
const { findRepoRoot } = require('./repo-root');
const ROOT = findRepoRoot(__dirname);


const MANIFEST_PATH = path.join(ROOT, 'extension/manifest.json');
const EXTENSION_STACK_ROOT = path.join(ROOT, 'extension').replace(/\\/g, '/');

const STORAGE_LISTENER_REGISTRY_KEY = '__manga_translator_harness_storage_listeners';
const RUNTIME_LISTENER_REGISTRY_KEY = '__manga_translator_harness_runtime_listeners';
const GLOBAL_EVENT_LISTENER_REGISTRY_KEY = '__manga_translator_harness_global_event_listeners';
const LOAD_IN_PROGRESS_REGISTRY_KEY = '__manga_translator_harness_load_in_progress';

function getTrackedStorageListeners() {
    const tracked = globalThis[STORAGE_LISTENER_REGISTRY_KEY];
    return Array.isArray(tracked) ? tracked : [];
}

function setTrackedStorageListeners(listeners) {
    globalThis[STORAGE_LISTENER_REGISTRY_KEY] = [...listeners];
}

function getTrackedRuntimeListeners() {
    const tracked = globalThis[RUNTIME_LISTENER_REGISTRY_KEY];
    return Array.isArray(tracked) ? tracked : [];
}

function setTrackedRuntimeListeners(listeners) {
    globalThis[RUNTIME_LISTENER_REGISTRY_KEY] = [...listeners];
}

function getTrackedGlobalEventListeners() {
    const tracked = globalThis[GLOBAL_EVENT_LISTENER_REGISTRY_KEY];
    return Array.isArray(tracked) ? tracked : [];
}

function setTrackedGlobalEventListeners(listeners) {
    globalThis[GLOBAL_EVENT_LISTENER_REGISTRY_KEY] = [...listeners];
}

function getMangaContentScriptRelativePaths() {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const entry = (manifest.content_scripts || []).find(candidate =>
        Array.isArray(candidate.js) && candidate.js.includes('content/content_manga.js')
    );
    if (!entry) {
        throw new Error('Manifest não contém o bundle Manga com content/content_manga.js');
    }
    return [...entry.js];
}

function getMangaContentScriptPaths() {
    return getMangaContentScriptRelativePaths().map(relativePath =>
        path.join(ROOT, 'extension', relativePath)
    );
}

function storageListenersSnapshot() {
    const listeners = global.chrome?.storage?.local?._listeners;
    return Array.isArray(listeners) ? [...listeners] : [];
}

function runtimeListenersSnapshot() {
    const listeners = global.chrome?.runtime?._messageListeners;
    return Array.isArray(listeners) ? [...listeners] : [];
}

function removeStorageListeners(listeners) {
    const removeListener = global.chrome?.storage?.onChanged?.removeListener;
    if (typeof removeListener !== 'function') return null;

    let firstError = null;
    listeners.forEach(listener => {
        try {
            removeListener(listener);
        } catch (error) {
            if (!firstError) firstError = error;
        }
    });
    return firstError;
}

function removeRuntimeListeners(listeners) {
    const removeListener = global.chrome?.runtime?.onMessage?.removeListener;
    if (typeof removeListener !== 'function') return null;

    let firstError = null;
    listeners.forEach(listener => {
        try {
            removeListener(listener);
        } catch (error) {
            if (!firstError) firstError = error;
        }
    });
    return firstError;
}

function removeGlobalEventListeners(listeners) {
    let firstError = null;
    listeners.forEach(({ target, type, listener, options }) => {
        if (!target || typeof target.removeEventListener !== 'function') return;
        try {
            target.removeEventListener(type, listener, options);
        } catch (error) {
            if (!firstError) firstError = error;
        }
    });
    return firstError;
}

function isExtensionListenerRegistration() {
    const stack = String(new Error().stack || '').replace(/\\/g, '/');
    return stack.includes(`${EXTENSION_STACK_ROOT}/`);
}

function startGlobalEventListenerCapture() {
    const captured = [];
    const targets = [window, document];
    const originals = targets.map(target => ({
        target,
        hadOwn: Object.prototype.hasOwnProperty.call(target, 'addEventListener'),
        descriptor: Object.getOwnPropertyDescriptor(target, 'addEventListener'),
        addEventListener: target.addEventListener,
    }));
    let stopped = false;

    originals.forEach(({ target, addEventListener }) => {
        target.addEventListener = function trackedAddEventListener(type, listener, options) {
            if (isExtensionListenerRegistration()) {
                captured.push({ target, type, listener, options });
            }
            return addEventListener.call(this, type, listener, options);
        };
    });

    return {
        stop() {
            if (!stopped) {
                originals.forEach(({ target, hadOwn, descriptor }) => {
                    if (hadOwn && descriptor) {
                        Object.defineProperty(target, 'addEventListener', descriptor);
                    } else {
                        delete target.addEventListener;
                    }
                });
                stopped = true;
            }
            return [...captured];
        },
    };
}

function disposePreviousContentInstance(listeners = getTrackedGlobalEventListeners()) {
    if (
        typeof window === 'undefined'
        || !window.__manga_translator_content_injected
        || typeof window.Event !== 'function'
    ) {
        return;
    }

    const event = new window.Event('pagehide');
    listeners
        .filter(({ target, type }) => target === window && type === 'pagehide')
        .forEach(({ listener }) => {
            if (typeof listener === 'function') listener.call(window, event);
            else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent(event);
        });
}

function cleanupContentInstanceListeners({
    storageListeners = getTrackedStorageListeners(),
    runtimeListeners = getTrackedRuntimeListeners(),
    globalEventListeners = getTrackedGlobalEventListeners(),
} = {}) {
    let firstError = null;
    try {
        disposePreviousContentInstance(globalEventListeners);
    } catch (error) {
        firstError = error;
    }

    const cleanupErrors = [
        removeStorageListeners(storageListeners),
        removeRuntimeListeners(runtimeListeners),
        removeGlobalEventListeners(globalEventListeners),
    ];
    if (!firstError) firstError = cleanupErrors.find(Boolean) || null;

    setTrackedStorageListeners([]);
    setTrackedRuntimeListeners([]);
    setTrackedGlobalEventListeners([]);
    return firstError;
}

function attachCleanupError(primaryError, cleanupError) {
    if (
        cleanupError
        && primaryError
        && (typeof primaryError === 'object' || typeof primaryError === 'function')
        && Object.isExtensible(primaryError)
    ) {
        const descriptor = Object.getOwnPropertyDescriptor(primaryError, 'cleanupError');
        if (!descriptor || descriptor.writable === true) {
            primaryError.cleanupError = cleanupError;
        }
    }
    return primaryError;
}

/**
 * Carrega o content script em ambiente JSDOM com estado controlado.
 *
 * @param {Object} options
 * @param {string}   options.hostname         - Hostname simulado (default: 'testmanga.com')
 * @param {string[]} options.enabledDomains   - Domínios na whitelist (default: [hostname])
 * @param {string[]} options.bannedImages     - URLs banidas para o hostname
 * @param {number}   options.imageMinWidth    - Largura mínima configurada para varredura
 * @param {number}   options.imageMinHeight   - Altura mínima configurada para varredura
 * @param {Array}    options.domImages        - Array de { src, width, height, className, attributes } para criar no DOM
 * @param {boolean}  options.floatingButtonEnabled - Controla a visibilidade persistente do botão
 * @param {boolean}  options.clickToTranslateEnabled - Controla tradução individual por clique
 * @param {number}   options.readyTimeoutMs    - Timeout do bootstrap do botão (default: 250 ms)
 * @returns {Promise<Object>} Helpers { sendMessage, getButton, getMainContent }
 */
async function loadContentScript({
    hostname = 'testmanga.com',
    enabledDomains = null,
    bannedImages = [],
    imageMinWidth,
    imageMinHeight,
    floatingButtonEnabled,
    clickToTranslateEnabled,
    domImages = [],
    readyTimeoutMs = 250,
} = {}) {
    if (globalThis[LOAD_IN_PROGRESS_REGISTRY_KEY]) {
        throw new Error('loadContentScript não suporta cargas concorrentes no mesmo ambiente JSDOM');
    }
    globalThis[LOAD_IN_PROGRESS_REGISTRY_KEY] = true;

    try {
        const previousCleanupError = cleanupContentInstanceListeners();
        if (previousCleanupError) throw previousCleanupError;

        const storageListenersBeforeLoad = new Set(storageListenersSnapshot());
        const runtimeListenersBeforeLoad = new Set(runtimeListenersSnapshot());
        // Invalida explicitamente qualquer instância anterior ANTES de tocar no
    // storage. Alguns testes reutilizam o mesmo window/JSDOM; sem isto, um
    // listener antigo ainda pode reagir ao clear/set do teste seguinte e
    // recriar um botão órfão antes da nova instância assumir.
    window.__manga_translator_active_instance =
        `__mt_test_reset_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const staleButton = document.getElementById('manga-translator-trigger');
    if (staleButton) staleButton.remove();

    // 1. Configura window.location
    Object.defineProperty(window, 'location', {
        value: {
            hostname,
            href: `https://${hostname}/chapter/1`,
            pathname: '/chapter/1',
        },
        writable: true,
        configurable: true,
    });

    // 2. window === window.top (garantido em JSDOM — boa prática tornar explícito)
    // Em JSDOM, window.top === window por padrão.

    // 3. Configura storage com whitelist e banidas
    const domains = enabledDomains ?? [hostname];
    const storageInit = {
        enabledDomains: domains,
        [`bannedImages_${hostname}`]: bannedImages,
        customPrompt: 'Teste prompt',
    };
    if (imageMinWidth !== undefined) storageInit.imageMinWidth = imageMinWidth;
    if (imageMinHeight !== undefined) storageInit.imageMinHeight = imageMinHeight;
    if (floatingButtonEnabled !== undefined) storageInit.floatingButtonEnabled = floatingButtonEnabled;
    if (clickToTranslateEnabled !== undefined) storageInit.clickToTranslateEnabled = clickToTranslateEnabled;
    await global.chrome.storage.local.set(storageInit);

    // 4. Constrói DOM com imagens de teste sem interpolar HTML.
    document.body.replaceChildren();
    domImages.forEach(({ src, width, height, className = '', attributes = {} }, i) => {
        const img = document.createElement('img');
        for (const [key, value] of Object.entries(attributes)) {
            img.setAttribute(key, String(value));
        }
        img.setAttribute('src', String(src));
        img.setAttribute('data-testid', `img-${i}`);
        if (className) img.className = className;
        img.setAttribute('width', String(width));
        img.setAttribute('height', String(height));
        document.body.appendChild(img);
    });

    // 5. Injeta naturalWidth/naturalHeight (JSDOM não renderiza imagens reais)
    document.querySelectorAll('img').forEach((img, i) => {
        const spec = domImages[i] || {};
        Object.defineProperty(img, 'naturalWidth',  { value: spec.width  || 0, configurable: true });
        Object.defineProperty(img, 'naturalHeight', { value: spec.height || 0, configurable: true });
        Object.defineProperty(img, 'complete',      { value: true,             configurable: true });
    });

    // 6. Espelha dependências globais da extensão no contexto de janela do JSDOM
    if (typeof global.crypto !== 'undefined' && !window.crypto) {
        Object.defineProperty(window, 'crypto', {
            value: global.crypto,
            configurable: true,
        });
    }
    if (typeof global.TextEncoder !== 'undefined' && !window.TextEncoder) {
        Object.defineProperty(window, 'TextEncoder', {
            value: global.TextEncoder,
            configurable: true,
        });
    }

    // 7. Limpa flag de idempotência para permitir re-injeção
    delete window.__manga_translator_content_injected;

    // 8. Carrega os módulos injetados pela extensão diretamente da ordem real do manifest.
    const globalEventCapture = startGlobalEventListenerCapture();
    let bundleLoadError = null;
    try {
        jest.isolateModules(() => {
            getMangaContentScriptPaths().forEach(modulePath => require(modulePath));
        });
    } catch (error) {
        bundleLoadError = error;
    }

    if (bundleLoadError) {
        const addedGlobalEventListeners = globalEventCapture.stop();
        const addedStorageListeners = storageListenersSnapshot()
            .filter(listener => !storageListenersBeforeLoad.has(listener));
        const addedRuntimeListeners = runtimeListenersSnapshot()
            .filter(listener => !runtimeListenersBeforeLoad.has(listener));

        const cleanupError = cleanupContentInstanceListeners({
            storageListeners: addedStorageListeners,
            runtimeListeners: addedRuntimeListeners,
            globalEventListeners: addedGlobalEventListeners,
        });
        throw attachCleanupError(bundleLoadError, cleanupError);
    }

    // 9. Aguarda a inicialização assíncrona do content script de forma determinística.
    // A captura de listeners globais permanece ativa até o bootstrap terminar para
    // incluir registros feitos por callbacks assíncronos de storage/createButton.
    let shouldCreateButton = false;
    let normalizedReadyTimeoutMs = 250;
    let bootstrapError = null;
    let addedGlobalEventListeners = [];
    let addedStorageListeners = [];
    let addedRuntimeListeners = [];

    try {
        shouldCreateButton = domains.includes(hostname) && floatingButtonEnabled !== false;
        const numericReadyTimeoutMs = Number(readyTimeoutMs);
        normalizedReadyTimeoutMs = Number.isFinite(numericReadyTimeoutMs) && numericReadyTimeoutMs >= 0
            ? numericReadyTimeoutMs
            : 250;
        const startedAt = Date.now();
        while (Date.now() - startedAt < normalizedReadyTimeoutMs) {
            const button = document.getElementById('manga-translator-trigger');
            if (!shouldCreateButton) break;
            if (button && button.dataset.positionReady === 'true') break;
            await new Promise(r => setTimeout(r, 10));
        }
    } catch (error) {
        bootstrapError = error;
    } finally {
        addedGlobalEventListeners = globalEventCapture.stop();
        addedStorageListeners = storageListenersSnapshot()
            .filter(listener => !storageListenersBeforeLoad.has(listener));
        addedRuntimeListeners = runtimeListenersSnapshot()
            .filter(listener => !runtimeListenersBeforeLoad.has(listener));
    }

    if (bootstrapError) {
        const cleanupError = cleanupContentInstanceListeners({
            storageListeners: addedStorageListeners,
            runtimeListeners: addedRuntimeListeners,
            globalEventListeners: addedGlobalEventListeners,
        });
        throw attachCleanupError(bootstrapError, cleanupError);
    }

    if (shouldCreateButton) {
        const button = document.getElementById('manga-translator-trigger');
        if (!button || button.dataset.positionReady !== 'true') {
            const timeoutError = new Error(
                `Timeout aguardando botão do content_manga ficar pronto após ${normalizedReadyTimeoutMs} ms`
            );
            const cleanupError = cleanupContentInstanceListeners({
                storageListeners: addedStorageListeners,
                runtimeListeners: addedRuntimeListeners,
                globalEventListeners: addedGlobalEventListeners,
            });
            window.__manga_translator_active_instance =
                `__mt_test_timeout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            if (button) button.remove();
            throw attachCleanupError(timeoutError, cleanupError);
        }
    }

    setTrackedStorageListeners(addedStorageListeners);
    setTrackedRuntimeListeners(addedRuntimeListeners);
    setTrackedGlobalEventListeners(addedGlobalEventListeners);

    // 10. Retorna helpers para os testes
    return {
        /**
         * Dispara uma mensagem para o listener do content script.
         * Simula chrome.tabs.sendMessage do background ou popup.
         */
        sendMessage(action, extra = {}) {
            return new Promise((resolve, reject) => {
                const listeners = global.chrome.runtime._messageListeners ?? [];
                const payload = { ...extra, action };
                let settled = false;
                let fallbackTimer = null;
                let asyncChannelOpen = false;

                const settle = (value) => {
                    if (settled) return;
                    settled = true;
                    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
                    resolve(value);
                };
                const fail = (error) => {
                    if (settled) return;
                    settled = true;
                    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
                    reject(error);
                };

                for (const listener of listeners) {
                    try {
                        if (listener(payload, { tab: { id: 1 } }, settle) === true) {
                            asyncChannelOpen = true;
                        }
                    } catch (error) {
                        fail(error);
                        if (settled) break;
                    }
                }

                if (!settled) {
                    fallbackTimer = setTimeout(
                        () => settle(null),
                        asyncChannelOpen ? 500 : 50
                    );
                }
            });
        },

        /** Retorna o elemento DOM do botão flutuante (se existir) */
        getButton() {
            return document.getElementById('manga-translator-trigger');
        },

        /** Retorna o mainContent do botão */
        getMainContent() {
            return document.getElementById('manga-main-content');
        },
    };
    } finally {
        globalThis[LOAD_IN_PROGRESS_REGISTRY_KEY] = false;
    }
}

module.exports = {
    loadContentScript,
    getMangaContentScriptRelativePaths,
};
```

## 16. Cobertura integral por posições

Faixas contíguas da revisão auditada:

- **1–13:** cabeçalho e propósito.
- **14–24:** imports, root, Manifest e root de stack da extensão.
- **25–56:** registries persistentes e seus getters/setters.
- **57–73:** derivação do bundle pelo Manifest.
- **74–83:** snapshots de listeners Chrome.
- **84–126:** remoção best-effort de storage/runtime/global listeners.
- **127–131:** filtro de origem por stack da extensão.
- **132–168:** instrumentação/restauração de `addEventListener`.
- **169–186:** teardown seletivo `pagehide` do bundle.
- **187–211:** cleanup unificado e preservação do primeiro erro.
- **212–227:** associação segura de `cleanupError` ao erro causal.
- **228–241:** JSDoc público.
- **242–272:** assinatura/defaults, guard concorrente, cleanup anterior, snapshots e invalidação de ownership.
- **273–286:** `window.location` e premissa `window.top`.
- **287–299:** seed de storage.
- **300–314:** construção DOM segura.
- **315–322:** dimensões naturais/`complete`.
- **323–336:** espelhamento de `crypto`/`TextEncoder`.
- **337–339:** liberação do guard de injeção.
- **340–365:** carga do bundle, captura e cleanup de falha parcial.
- **366–398:** bootstrap bounded e parada garantida da instrumentação.
- **399–410:** tratamento de erro de bootstrap.
- **411–425:** timeout causal e cleanup do caminho negativo.
- **426–429:** persistência do ownership da carga bem-sucedida.
- **430–435:** início do objeto de helpers.
- **436–477:** contrato de `sendMessage`.
- **478–491:** `getButton`, `getMainContent` e fechamento da função/`finally` de concorrência.
- **492–495:** export CommonJS.
- **496:** posição vazia correspondente ao LF final.

**Cobertura:** 496/496 posições, sem gap ou overlap.

## 17. Autoauditoria documental

- Source SHA reconfirmado na materialização: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- Fonte integral inserida diretamente do blob, sem o LF final dentro do fence.
- Cinco requests históricas foram preservadas individualmente; nenhuma contagem stale de quatro requests.
- Nenhum status `COMPLETED`/100 foi inferido a partir de execução antiga.
- Próximo passo canônico: confirmar a run final da revisão atual, atualizar evidência/state, reler diff e devolver para auditoria independente.

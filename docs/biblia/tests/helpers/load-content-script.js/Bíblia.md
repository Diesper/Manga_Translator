# Bíblia técnica — tests/helpers/load-content-script.js

> **Estado documental:** reparo corretivo local concluído; decisão distribuída final pendente  
> **SHA auditado:** `0b52224bd7063db9b6bb683d827217d8f2fda69c`  
> **Tipo:** helper Jest/JSDOM que carrega o bundle Manga real sob estado controlado  
> **Linhas textuais:** **495**  
> **Posições documentais:** **496**, contando o LF final  
> **Tamanho textual observado:** **19242 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/helpers/load-content-script.js` prepara um JSDOM controlado e executa o bundle Manga real declarado no Manifest. O helper não mantém uma cópia da lógica de `content_manga.js`; sua responsabilidade é preparar o ambiente, controlar recursos entre reinjeções, aguardar readiness e expor utilitários de teste.

## 2. Contrato público

`loadContentScript(options)` aceita hostname/whitelist, imagens banidas, dimensões mínimas, preferências de botão/clique, fixtures de imagens e `readyTimeoutMs`.

`enabledDomains ?? [hostname]` preserva `[]` explícito. Preferências booleanas só são gravadas quando diferentes de `undefined`, preservando `false`. `readyTimeoutMs` usa 250 ms por padrão e valor inválido/negativo retorna ao default.

O JSDoc atual está anexado à função pública e descreve o retorno real: `sendMessage`, `getButton` e `getMainContent`.

## 3. Bundle e Manifest

`getMangaContentScriptRelativePaths()` lê `extension/manifest.json`, localiza o `content_scripts` contendo `content/content_manga.js` e devolve sua lista `js`. O helper carrega essa lista diretamente em `jest.isolateModules()`, removendo a duplicação manual que originou 102-003.

## 4. Reentrada e registries de ownership

`LOAD_IN_PROGRESS_REGISTRY_KEY` impede duas cargas simultâneas no mesmo JSDOM. O outer `finally` sempre libera o guard.

Registries persistidos em `globalThis` rastreiam listeners pertencentes à carga anterior de `chrome.storage.onChanged`, `chrome.runtime.onMessage` e eventos de `window`/`document`, inclusive através de `jest.resetModules()`.

## 5. Ownership de listeners globais

A captura temporária de `addEventListener` fica ativa até o bootstrap terminar. `isExtensionListenerRegistration()` normaliza barras da stack e só classifica como ownership do bundle registros cuja stack contém o diretório `extension/`. Assim, listeners externos registrados antes ou durante o bootstrap não entram no registry do Manga.

`stop()` restaura o descriptor original quando `addEventListener` era propriedade própria; quando era herdado, remove a propriedade temporária.

## 6. Teardown e cleanup best-effort

`disposePreviousContentInstance()` invoca apenas handlers `pagehide` rastreados como pertencentes ao bundle, em vez de emitir `pagehide` globalmente.

`cleanupContentInstanceListeners()` tenta o teardown cooperativo e depois remove todos os listeners rastreados. Cada remoção é best-effort por listener: uma exceção em storage não impede cleanup de runtime/global, e os registries são zerados mesmo quando existe erro.

`attachCleanupError()` preserva o erro causal principal. O erro secundário de cleanup só é anexado quando o erro principal é extensível e a propriedade `cleanupError` é gravável; não existe `catch` silencioso para mascarar metadata.

## 7. Seed, DOM e globals

O storage é semeado antes da carga do bundle. Fixtures de imagem são construídas com DOM API (`createElement`, `setAttribute`, `appendChild`), evitando interpretar valores de atributo como markup. `naturalWidth`, `naturalHeight` e `complete` são definidos como propriedades configuráveis.

`crypto` e `TextEncoder` só são espelhados para `window` quando existem no `global` e ainda não existem na janela.

## 8. Carga e caminhos negativos

Se um módulo falha durante o `require`, a captura global é finalizada, os listeners adicionados são identificados, o teardown/cleanup é executado e o erro original é relançado com metadata de cleanup apenas quando seguro.

Durante o bootstrap, a captura global continua ativa para registrar listeners criados por callbacks assíncronos. Um `finally` sempre restaura a instrumentação e coleta recursos mesmo se o polling lançar.

Timeout de readiness não é silencioso: executa cleanup, invalida o token da instância, remove o botão parcial e lança erro causal.

## 9. sendMessage

`sendMessage` dirige diretamente os listeners de runtime do mock.

- O payload é `{ ...extra, action }`: `extra.action` não substitui a ação explícita.
- A primeira resolução/rejeição efetiva vence.
- O fallback é cancelado no settlement.
- Sem canal assíncrono, silêncio resolve `null` em 50 ms.
- Se algum listener retorna `true`, o fallback bounded é 500 ms.
- Throw antes do settlement rejeita; throw posterior não reverte Promise já resolvida.

## 10. Audit requests históricas

### 102-001 — corrigida
JSDoc alinhado à API real, com regressão de attachment.

### 102-002 — corrigida
Fallback cancelável, sem timer residual após resposta, cobertura de resposta imediata/assíncrona/silêncio/throw e `--detectOpenHandles`.

### 102-003 — corrigida
Bundle derivado do Manifest, com comparação focal.

### 102-004 — corrigida
Bootstrap incompleto rejeita com erro causal e cleanup.

### 102-005 — corrigida
Ownership e cleanup de listeners storage/runtime/globais cobertos em reinjeção, reload de módulo, registros assíncronos e caminhos de falha.

## 11. Evidência focal

Self-test: `docs/biblia/.coordination/load-content-script-selftest.test.js` — SHA `43d45452eb664b2a1fe11fae3a97e2a4ff3cc175`.

O self-test cobre, entre outros: reentrada, JSDoc, Manifest, DOM fixture, listeners externos síncronos/assíncronos, restore de `addEventListener`, storage/runtime/global ownership, `jest.resetModules`, teardown normal e com erro, cleanup best-effort quando `removeListener` lança, erro primário não extensível com erro secundário de cleanup, falha parcial, bootstrap exception/timeout e semântica de `sendMessage`.

Workflow dedicado: `.github/workflows/load-content-script-selftest.yml` — SHA `9eb534298b30c7dd619ecbb2d51e044f972f50d6`.

O workflow executa o self-test com `--detectOpenHandles` e depois a suíte relacionada `content-scripts` em `--runInBand`.

## 12. Limites honestos

- O helper depende de internals do mock (`_listeners`, `_messageListeners`).
- `window.location` é modelado parcialmente.
- A janela assíncrona de 500 ms é política bounded do harness, não lifetime ilimitado do Chromium.
- O ownership de eventos globais depende de stack Node/Jest; self-test e CI validam esse contrato no ambiente suportado.

## 13. Fonte integral exata

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

## 14. Cobertura integral por posições

- **1–13:** comentário de propósito.
- **14–24:** imports, raiz, Manifest e raiz de stack normalizada.
- **25–56:** keys/registries persistentes.
- **57–73:** derivação do bundle pelo Manifest.
- **74–113:** snapshots e remoção best-effort de listeners Chrome.
- **114–126:** remoção best-effort de eventos globais.
- **127–131:** classificação de origem de listener pela stack.
- **132–168:** captura/restauração de `addEventListener`.
- **169–186:** teardown seletivo de handlers `pagehide` do bundle.
- **187–211:** cleanup unificado e best-effort.
- **212–241:** anexo seguro de `cleanupError` e JSDoc público.
- **242–272:** assinatura, guard de concorrência, cleanup anterior, snapshots e invalidação stale.
- **273–286:** `window.location`.
- **287–299:** seed de storage.
- **300–314:** construção DOM segura.
- **315–322:** dimensões naturais.
- **323–336:** globals `crypto`/`TextEncoder`.
- **337–339:** liberação do guard de injeção.
- **340–365:** carga do bundle e cleanup de falha parcial.
- **366–398:** polling e `finally` de captura/coleta.
- **399–407:** cleanup de exceção de bootstrap.
- **408–425:** timeout causal e cleanup.
- **426–429:** persistência dos registries da carga válida.
- **430–477:** retorno e `sendMessage`.
- **478–486:** lookups DOM e fechamento do retorno.
- **487–491:** outer `finally` do guard e fechamento da função.
- **492–495:** export CommonJS.
- **496:** newline final.

**Cobertura: 496/496 posições, sem gap ou overlap.**

## 15. Autoauditoria

- Source SHA: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- Fonte integral embutida a partir do blob corrente.
- Lifecycle documental não é apresentado como `COMPLETED` distribuído.
- Cinco requests históricas tratadas individualmente; não há contagem stale.
- Metadata estrutural deve ser sincronizada no state após esta materialização.
- Promoção para `READY_FOR_AUDIT` depende da execução verde da mesma revisão e da releitura final do diff.

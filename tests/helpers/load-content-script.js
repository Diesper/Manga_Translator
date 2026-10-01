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

const STORAGE_LISTENER_REGISTRY_KEY = '__manga_translator_harness_storage_listeners';
const RUNTIME_LISTENER_REGISTRY_KEY = '__manga_translator_harness_runtime_listeners';

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
    if (typeof removeListener === 'function') {
        listeners.forEach(listener => removeListener(listener));
    }
}

function removeRuntimeListeners(listeners) {
    const removeListener = global.chrome?.runtime?.onMessage?.removeListener;
    if (typeof removeListener === 'function') {
        listeners.forEach(listener => removeListener(listener));
    }
}

function cleanupPreviousListeners() {
    removeStorageListeners(getTrackedStorageListeners());
    setTrackedStorageListeners([]);
    removeRuntimeListeners(getTrackedRuntimeListeners());
    setTrackedRuntimeListeners([]);
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
    cleanupPreviousListeners();
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
    let bundleLoaded = false;
    try {
        jest.isolateModules(() => {
            getMangaContentScriptPaths().forEach(modulePath => require(modulePath));
        });
        bundleLoaded = true;
    } finally {
        const addedStorageListeners = storageListenersSnapshot()
            .filter(listener => !storageListenersBeforeLoad.has(listener));
        const addedRuntimeListeners = runtimeListenersSnapshot()
            .filter(listener => !runtimeListenersBeforeLoad.has(listener));
        if (bundleLoaded) {
            setTrackedStorageListeners(addedStorageListeners);
            setTrackedRuntimeListeners(addedRuntimeListeners);
        } else {
            removeStorageListeners(addedStorageListeners);
            setTrackedStorageListeners([]);
            removeRuntimeListeners(addedRuntimeListeners);
            setTrackedRuntimeListeners([]);
        }
    }

    // 9. Aguarda a inicialização assíncrona do content script de forma determinística
    const shouldCreateButton = domains.includes(hostname) && floatingButtonEnabled !== false;
    const normalizedReadyTimeoutMs = Number.isFinite(Number(readyTimeoutMs)) && Number(readyTimeoutMs) >= 0
        ? Number(readyTimeoutMs)
        : 250;
    const startedAt = Date.now();
    while (Date.now() - startedAt < normalizedReadyTimeoutMs) {
        const button = document.getElementById('manga-translator-trigger');
        if (!shouldCreateButton) break;
        if (button && button.dataset.positionReady === 'true') break;
        await new Promise(r => setTimeout(r, 10));
    }
    if (shouldCreateButton) {
        const button = document.getElementById('manga-translator-trigger');
        if (!button || button.dataset.positionReady !== 'true') {
            cleanupPreviousListeners();
            window.__manga_translator_active_instance =
                `__mt_test_timeout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            if (button) button.remove();
            throw new Error(
                `Timeout aguardando botão do content_manga ficar pronto após ${normalizedReadyTimeoutMs} ms`
            );
        }
    }

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
}

module.exports = {
    loadContentScript,
    getMangaContentScriptRelativePaths,
};

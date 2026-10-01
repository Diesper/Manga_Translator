# Bíblia técnica — tests/helpers/load-content-script.js

> **Estado documental:** reparo local concluído; decisão distribuída ainda pendente  
> **SHA auditado:** `024a2a8f4ace4579f622a232dfb1d2a46505d807`  
> **Tipo:** helper de harness Jest/JSDOM para executar o bundle Manga real sob estado controlado  
> **Linhas textuais:** **376**  
> **Posições documentais:** **377**, contando o newline final  
> **Tamanho textual observado:** **14915 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/helpers/load-content-script.js` prepara um ambiente JSDOM controlado e carrega os módulos reais do bundle Manga. Ele não substitui `content_manga.js` por mirror: o helper prepara storage/DOM/globals, reinjeta os módulos do Manifest e expõe utilitários para dirigir a implementação real.

O fluxo atual é deliberadamente defensivo:

1. entrega `pagehide` à instância anterior ainda ativa para permitir teardown cooperativo;
2. remove apenas listeners Chrome rastreados como pertencentes à carga anterior;
3. invalida o token de ownership e remove UI stale;
4. prepara `window.location`, storage e imagens de fixture;
5. deriva a lista de módulos diretamente do `extension/manifest.json`;
6. carrega o bundle real em `jest.isolateModules`; em falha parcial, executa teardown e remove listeners já adicionados;
7. aguarda readiness do botão por até 250 ms quando ele deveria existir e rejeita com erro causal se não ficar pronto;
8. retorna `sendMessage`, `getButton` e `getMainContent`.

## 2. Contrato de entrada e saída

Entradas principais: `hostname`, `enabledDomains`, `bannedImages`, `imageMinWidth`, `imageMinHeight`, `floatingButtonEnabled`, `clickToTranslateEnabled`, `domImages` e `readyTimeoutMs`.

`enabledDomains ?? [hostname]` preserva `[]` explícito. Preferências booleanas só são semeadas quando diferentes de `undefined`, preservando `false`. `readyTimeoutMs` default é 250 ms; valor não-numérico/negativo volta a 250 ms.

O JSDoc está alinhado ao retorno real: a Promise resolve para um objeto com `sendMessage(action, extra)`, `getButton()` e `getMainContent()`.

## 3. Manifest e fidelidade do bundle

`getMangaContentScriptRelativePaths()` lê `extension/manifest.json`, procura o `content_scripts` que contém `content/content_manga.js` e devolve sua sequência `js`. A carga usa essa lista diretamente; não existe mais cópia manual dos seis paths no helper.

O self-test dedicado compara a lista retornada com o Manifest atual. Isso elimina o drift que originou 102-003.

## 4. Lifecycle e ownership

O helper usa registries persistidos em `globalThis` para sobreviver a `jest.resetModules()`. São rastreados separadamente listeners de `chrome.storage.onChanged` e `chrome.runtime.onMessage` adicionados pela carga do bundle.

`disposePreviousContentInstance()` dispara `pagehide` somente quando há uma instância content injetada. Esse evento permite que o próprio `content_manga.js` desconecte observers/timers/contextmenu que ele controla enquanto ainda é a instância ativa. Depois, `cleanupPreviousListeners()` remove do mock apenas listeners Chrome previamente rastreados pelo harness.

O helper não afirma remover todo listener anônimo de `window` criado pelo código de produção. Callbacks stale que permanecem registrados no ambiente precisam continuar sendo inertes pelos guards do próprio content script; a Bíblia não converte esse limite em alegação de cleanup universal.

Em falha parcial durante `require`, o `finally` calcula os listeners adicionados antes da exceção, dispara teardown cooperativo e remove esses listeners. Em timeout de readiness, o mesmo teardown ocorre antes de invalidar definitivamente o token e rejeitar.

## 5. Fixture DOM

As imagens são criadas por `document.createElement`/`setAttribute`, sem interpolação de `innerHTML`. Assim, valores de atributos controlados pelo teste permanecem dados e não viram markup acidental. Depois o helper define `naturalWidth`, `naturalHeight` e `complete` como propriedades configuráveis para reproduzir dimensões que JSDOM não calcula.

## 6. Bootstrap e timeout

Quando `domains.includes(hostname)` e `floatingButtonEnabled !== false`, o helper aguarda `#manga-translator-trigger[data-position-ready=true]`. Se o limite termina sem readiness, a função rejeita com mensagem causal, executa teardown da instância e remove o botão parcial.

Quando o botão não deveria existir, o helper não exige readiness visual.

## 7. sendMessage

`sendMessage` dirige diretamente `global.chrome.runtime._messageListeners`, simulando a entrega de uma mensagem ao content script.

- O payload é `{ ...extra, action }`; portanto `extra.action` não sobrescreve a ação explícita.
- A primeira resolução/rejeição vence.
- Se um listener responde sincronamente, nenhum fallback fica pendente.
- Se pelo menos um listener retorna `true`, a janela de fallback é 500 ms; caso contrário, 50 ms.
- O fallback é cancelado na primeira resposta/rejeição.
- Throw antes de settlement rejeita; throw posterior a um settlement não o reverte.

O helper não pretende implementar toda a API Chrome; 500 ms é um limite do harness para permitir respostas assíncronas sem introduzir Promise indefinida.

## 8. Requests históricas da unidade

### 102-001 — RESOLVED

O JSDoc agora descreve os três helpers reais.

### 102-002 — RESOLVED

O fallback é armazenado/cancelado no settlement. O self-test cobre resposta imediata, resposta assíncrona com `return true`, ausência de resposta, throw e ausência de handles abertos.

### 102-003 — RESOLVED

A ordem do bundle é derivada do Manifest e existe comparação focal com `content_scripts[].js`.

### 102-004 — RESOLVED

Bootstrap incompleto rejeita com diagnóstico local e executa cleanup. O self-test força esse caminho.

### 102-005 — RESOLVED

Listeners de storage adicionados pela carga são rastreados e removidos antes da reinjeção, inclusive através de `jest.resetModules`; o teste focal verifica contagem bounded e identidades novas. O hardening também aplica o mesmo ownership a `runtime.onMessage` e dispara `pagehide` antes da reinjeção.

## 9. Evidência de teste

- Self-test focal: `docs/biblia/.coordination/load-content-script-selftest.test.js` (SHA `3928d232a85e40601fd6984d06bdb180de5bcecd`).
- O self-test cobre Manifest, fixture DOM, reinjeção de listeners storage/runtime, reload de módulo, falha parcial, teardown por `pagehide`, messaging síncrono/assíncrono, precedência de `action`, throw e timeout de bootstrap.
- Workflow dedicado: `.github/workflows/load-content-script-selftest.yml` (SHA `9eb534298b30c7dd619ecbb2d51e044f972f50d6`).
- O workflow executa o self-test com `--detectOpenHandles` e depois toda a suíte Jest `content-scripts`.

## 10. Limites e riscos remanescentes

- O harness depende de internals do mock (`_messageListeners`, `_listeners`); mudanças no mock exigem revalidação.
- O shape de `window.location` continua parcial (`hostname`, `href`, `pathname`), suficiente para o código atual auditado.
- A janela assíncrona de 500 ms é política de teste, não equivalência temporal ilimitada ao runtime Chromium.
- O teardown cooperativo depende de `content_manga.js` manter seu contrato de `pagehide`; mudanças nesse contrato devem quebrar/atualizar o self-test.
- Não há `.skip`, `.only`, `xit` ou `xdescribe` introduzido nesta unidade.

## 11. Fonte integral exata

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

const STORAGE_LISTENER_REGISTRY_KEY = '__manga_translator_harness_storage_listeners';
const RUNTIME_LISTENER_REGISTRY_KEY = '__manga_translator_harness_runtime_listeners';
const GLOBAL_EVENT_LISTENER_REGISTRY_KEY = '__manga_translator_harness_global_event_listeners';

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

function removeGlobalEventListeners(listeners) {
    listeners.forEach(({ target, type, listener, options }) => {
        if (target && typeof target.removeEventListener === 'function') {
            target.removeEventListener(type, listener, options);
        }
    });
}

function captureGlobalEventListeners(callback) {
    const captured = [];
    const targets = [window, document];
    const originals = targets.map(target => ({
        target,
        addEventListener: target.addEventListener,
    }));

    originals.forEach(({ target, addEventListener }) => {
        target.addEventListener = function trackedAddEventListener(type, listener, options) {
            captured.push({ target, type, listener, options });
            return addEventListener.call(this, type, listener, options);
        };
    });

    try {
        callback();
        return captured;
    } catch (error) {
        removeGlobalEventListeners(captured);
        throw error;
    } finally {
        originals.forEach(({ target, addEventListener }) => {
            target.addEventListener = addEventListener;
        });
    }
}

function cleanupPreviousListeners() {
    removeStorageListeners(getTrackedStorageListeners());
    setTrackedStorageListeners([]);
    removeRuntimeListeners(getTrackedRuntimeListeners());
    setTrackedRuntimeListeners([]);
    removeGlobalEventListeners(getTrackedGlobalEventListeners());
    setTrackedGlobalEventListeners([]);
}

function disposePreviousContentInstance() {
    if (
        typeof window !== 'undefined'
        && window.__manga_translator_content_injected
        && typeof window.dispatchEvent === 'function'
        && typeof window.Event === 'function'
    ) {
        window.dispatchEvent(new window.Event('pagehide'));
    }
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
    disposePreviousContentInstance();
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
    let addedGlobalEventListeners = [];
    try {
        addedGlobalEventListeners = captureGlobalEventListeners(() => {
            jest.isolateModules(() => {
                getMangaContentScriptPaths().forEach(modulePath => require(modulePath));
            });
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
            setTrackedGlobalEventListeners(addedGlobalEventListeners);
        } else {
            disposePreviousContentInstance();
            removeStorageListeners(addedStorageListeners);
            setTrackedStorageListeners([]);
            removeRuntimeListeners(addedRuntimeListeners);
            setTrackedRuntimeListeners([]);
            removeGlobalEventListeners(addedGlobalEventListeners);
            setTrackedGlobalEventListeners([]);
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
            disposePreviousContentInstance();
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
```

## 12. Cobertura integral por posições

Faixas contíguas da revisão atual:

- **1–13:** cabeçalho/propósito do helper.
- **14–22:** imports, descoberta da raiz e Manifest.
- **23–44:** registries persistentes de listeners do harness.
- **45–60:** derivação do bundle Manga diretamente do Manifest.
- **61–85:** snapshots e remoção de listeners Chrome.
- **86–102:** cleanup rastreado e teardown cooperativo por `pagehide`.
- **103–118:** JSDoc público do `loadContentScript`.
- **119–142:** assinatura, defaults, teardown anterior, snapshots de ownership, invalidação e botão stale.
- **143–156:** `window.location` e premissa `window.top`.
- **157–169:** seed de storage.
- **170–184:** construção segura das imagens de fixture.
- **185–192:** propriedades naturais das imagens.
- **193–206:** espelhamento de `crypto`/`TextEncoder`.
- **207–209:** liberação do guard de injeção.
- **210–233:** carga do bundle, tracking e cleanup em falha parcial.
- **234–259:** polling de readiness, timeout causal e cleanup do caminho negativo.
- **260–305:** objeto de retorno e contrato de `sendMessage`.
- **306–317:** lookups `getButton`/`getMainContent` e fechamento da função.
- **318–322:** export CommonJS.
- **323:** newline final.

**Cobertura:** 323/323 posições, sem gap ou overlap.

## 13. Autoauditoria documental

- Source SHA conferido: `024a2a8f4ace4579f622a232dfb1d2a46505d807`.
- Fonte integral acima é o blob atual sem o LF final dentro do fence.
- Lifecycle descrito como revisão/reparo local, não como `COMPLETED` distribuído.
- Cinco requests 102-001..102-005 descritos individualmente; não há contagem stale de quatro.
- Metadata estrutural desta Bíblia deve ser sincronizada no `.state/102.json` após materialização.
- A promoção para `READY_FOR_AUDIT` depende da execução verde da revisão corrente e da releitura final do diff.

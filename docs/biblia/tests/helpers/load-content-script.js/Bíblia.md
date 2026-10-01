# Bíblia técnica — tests/helpers/load-content-script.js

> **Estado documental:** reparo corretivo local concluído; decisão distribuída final ainda pendente  
> **SHA auditado:** `48deaef8742e7629c46c8930128699c4443329ff`  
> **Tipo:** helper de harness Jest/JSDOM para executar o bundle Manga real sob estado controlado  
> **Linhas textuais:** **429**  
> **Posições documentais:** **430**, contando o LF final  
> **Tamanho textual observado:** **17960 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/helpers/load-content-script.js` é o adaptador entre suites Jest/JSDOM e o bundle Manga real declarado no Manifest V3. Ele prepara ambiente, storage, DOM e globals; executa os módulos reais; controla ownership de recursos entre reinjeções; espera readiness do botão; e devolve utilitários de teste.

O helper **não** deve criar um mirror da lógica de `content_manga.js`. A fidelidade vem de carregar diretamente os módulos apontados por `extension/manifest.json` dentro de `jest.isolateModules()`.

## 2. Contrato de entrada

A função `loadContentScript(options)` aceita:

- `hostname`: default `testmanga.com`;
- `enabledDomains`: `null`/`undefined` vira `[hostname]`; `[]` explícito continua vazio;
- `bannedImages`: lista semeada na chave `bannedImages_<hostname>`;
- `imageMinWidth` / `imageMinHeight`: só são gravados se não forem `undefined`;
- `floatingButtonEnabled` / `clickToTranslateEnabled`: `false` explícito é preservado;
- `domImages`: descritores de imagens de fixture;
- `readyTimeoutMs`: default 250 ms; valor inválido/negativo cai para 250 ms.

## 3. Contrato de saída

O retorno é `Promise<Object>` com exatamente os helpers públicos usados pelos consumidores:

- `sendMessage(action, extra = {})`;
- `getButton()`;
- `getMainContent()`.

O JSDoc do source atual descreve esse contrato e está imediatamente anexado à função `loadContentScript`. A regressão focal correspondente existe no self-test dedicado.

## 4. Manifest como fonte canônica

`getMangaContentScriptRelativePaths()` lê `extension/manifest.json`, localiza o `content_scripts` que contém `content/content_manga.js` e devolve a sequência `js` daquele entry. `getMangaContentScriptPaths()` converte os paths relativos em paths absolutos sob `extension/`.

Isso elimina a antiga duplicação manual da ordem dos seis módulos: se o Manifest mudar, o harness acompanha a fonte canônica. O self-test compara explicitamente a lista retornada com o Manifest atual.

## 5. Ownership e lifecycle entre reinjeções

O helper mantém registries em `globalThis` para sobreviver a `jest.resetModules()`. São rastreados separadamente:

- listeners de `chrome.storage.onChanged`;
- listeners de `chrome.runtime.onMessage`;
- listeners globais de `window`/`document` adicionados pelo bundle durante o bootstrap.

Antes de uma nova carga, `disposePreviousContentInstance()` entrega um evento `pagehide` **somente ao handler rastreado do bundle anterior**, sem disparar `pagehide` globalmente para listeners externos do teste. Depois `cleanupPreviousListeners()` remove os listeners Chrome e globais pertencentes à carga anterior.

Essa ordem preserva o teardown interno de `content_manga.js` — observers/timers/contextmenu próprios — e evita acumular closures stale entre reinjeções.

## 6. Captura de listeners globais

`startGlobalEventListenerCapture()` intercepta temporariamente `window.addEventListener` e `document.addEventListener`. A captura permanece ativa até o bootstrap do botão terminar, cobrindo registros síncronos do IIFE e registros assíncronos feitos por callbacks de storage/createButton.

`stop()` restaura exatamente a forma anterior de `addEventListener`: se a propriedade era própria, restaura o descriptor; se vinha do prototype, remove a propriedade temporária. Listeners preexistentes não entram no registry da instância e portanto não são removidos na reinjeção seguinte.

## 7. Falha parcial e exceções

Há três caminhos de falha explícitos:

1. **erro durante carga do bundle**: para captura, identifica listeners adicionados, entrega `pagehide` à instância parcial, remove ownership e relança o erro original;
2. **exceção durante bootstrap/polling**: o `finally` sempre restaura a instrumentação e coleta os recursos; depois o caminho de erro executa teardown e relança;
3. **timeout de readiness**: se o botão deveria existir mas não chega a `positionReady=true`, executa teardown completo, invalida o token da instância, remove o botão parcial e lança erro causal.

Nenhum desses caminhos converte falha em warning nem deixa o helper retornar um contexto aparentemente pronto.

## 8. DOM de fixture

As imagens são construídas com DOM API (`createElement`, `setAttribute`, `appendChild`) em vez de interpolação em `innerHTML`. Assim, valores de atributos controlados por testes permanecem valores de atributo e não viram markup adicional.

`naturalWidth`, `naturalHeight` e `complete` são definidos como propriedades configuráveis para modelar imagens carregadas em JSDOM.

## 9. Seed de storage e globals

O storage é semeado antes do bundle ser carregado. Isso evita corrida em que o IIFE leia whitelist, banidas ou dimensões antes de a fixture estar pronta.

`crypto` e `TextEncoder` só são espelhados de `global` para `window` quando a referência global existe e a janela ainda não fornece a propriedade.

## 10. Readiness do botão

`shouldCreateButton` é verdadeiro quando o hostname está nos domínios habilitados e `floatingButtonEnabled !== false`. Quando verdadeiro, o helper aguarda até `#manga-translator-trigger` existir com `dataset.positionReady === 'true'`, limitado por `readyTimeoutMs`.

O default permaneceu 250 ms; a correção não mascarou instabilidade aumentando silenciosamente o timeout. O failure mode agora é explícito e causal.

## 11. sendMessage

`sendMessage` entrega diretamente o payload aos listeners do mock `chrome.runtime._messageListeners`, simulando a chegada de uma mensagem ao content script.

Contratos atuais:

- o parâmetro `action` explícito vence `extra.action` (`{ ...extra, action }`);
- a primeira resolução/rejeição efetiva vence;
- resposta síncrona cancela qualquer fallback;
- listener que retorna `true` abre uma janela assíncrona bounded de 500 ms;
- sem canal assíncrono, silêncio resolve `null` em 50 ms;
- throws antes do settlement rejeitam; throws posteriores não alteram uma Promise já resolvida.

A janela de 500 ms é uma aproximação deliberadamente bounded do canal assíncrono Chrome para evitar Promises pendentes indefinidamente no harness; não deve ser confundida com lifetime ilimitado do runtime real.

## 12. Evidência focal

Self-test: `docs/biblia/.coordination/load-content-script-selftest.test.js` — SHA `3ad467cb310debaf72eefbd8f522f57529cce8af`.

O self-test cobre, entre outros:

- JSDoc anexado à função pública;
- derivação do bundle pelo Manifest;
- construção de fixture sem markup injection;
- restauração exata de `addEventListener`;
- preservação de listeners externos;
- teardown anterior sem disparar `pagehide` externo;
- cleanup de listeners globais síncronos e assíncronos;
- cleanup de storage/runtime;
- reinjeção após `jest.resetModules()`;
- falha parcial do bundle;
- resposta imediata/assíncrona/silêncio em `sendMessage`;
- `return true` e fallback de 500 ms;
- precedência de `action`;
- throws antes/depois do settlement;
- exceção durante bootstrap;
- timeout causal com cleanup.

Workflow dedicado: `.github/workflows/load-content-script-selftest.yml` — SHA `9eb534298b30c7dd619ecbb2d51e044f972f50d6`.

O workflow executa o self-test com `--detectOpenHandles` e, em seguida, a suíte Jest relacionada `content-scripts` em `--runInBand`.

## 13. Resolução das audit requests históricas

### 102-001 — SOURCE_DOCUMENTATION_CORRECTION

**Implementado localmente:** JSDoc alinhado à API real e regressão estática que garante que o bloco permanece anexado a `loadContentScript`.

### 102-002 — RESOURCE_LIFECYCLE_REVIEW / sendMessage

**Implementado localmente:** fallback é cancelado na primeira resolução; canal `return true` possui janela assíncrona bounded; casos imediato, assíncrono, sem resposta e throw possuem regressões focais; workflow usa `--detectOpenHandles`.

### 102-003 — STATIC_CONTRACT_TEST_REQUIRED

**Implementado localmente:** o helper deriva a ordem do Manifest em vez de duplicá-la, e o self-test compara o resultado ao Manifest real.

### 102-004 — TEST_HARNESS_ROBUSTNESS

**Implementado localmente:** timeout não é mais silencioso; executa teardown e lança diagnóstico causal, com cenário focal controlado.

### 102-005 — RESOURCE_LIFECYCLE_REVIEW / listeners stale

**Implementado localmente:** listeners de storage/runtime e listeners globais pertencentes ao bundle são rastreados e removidos; ownership sobrevive a `jest.resetModules`; reinjeção executa teardown cooperativo antes da remoção; regressões verificam contagem bounded e não-retenção de listeners antigos.

Esses itens só devem ser promovidos de `ACCEPTED` para `RESOLVED` no state após a execução verde da revisão vinculada e a releitura final.

## 14. Invariantes

1. A Bíblia só vale para o `SOURCE_SHA` declarado no cabeçalho.
2. O Manifest é a fonte canônica da ordem do bundle Manga.
3. Storage de bootstrap é preparado antes da carga dos módulos.
4. Reinjecção entrega teardown à instância anterior antes de invalidar ownership.
5. O helper remove somente recursos que rastreou como pertencentes ao bundle; listeners externos devem sobreviver.
6. Instrumentação temporária de `addEventListener` deve ser restaurada mesmo sob erro.
7. Falha parcial/timeout não pode deixar listeners/timers do harness como sucesso silencioso.
8. `action` explícito não pode ser sobrescrito por `extra.action`.
9. `false` e arrays vazios explícitos não podem ser perdidos por defaults/truthiness.
10. O helper executa módulos reais; não replica a implementação de produção.

## 15. Limites honestos

- `window.location` do harness é um shape parcial (`hostname`, `href`, `pathname`); código futuro que dependa de outros campos precisa ampliar o fixture.
- A janela assíncrona de `sendMessage` é bounded e não reproduz lifetime indefinido do Chrome.
- Listeners adicionados fora de `window`/`document` e fora das APIs Chrome rastreadas dependem do teardown interno do próprio bundle ou da remoção do nó DOM correspondente.
- A prova focal do helper não substitui os testes funcionais do content script; por isso o workflow executa também a suíte `content-scripts`.

## 16. Fonte integral auditada

~~~javascript
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

function cleanupPreviousListeners() {
    removeStorageListeners(getTrackedStorageListeners());
    setTrackedStorageListeners([]);
    removeRuntimeListeners(getTrackedRuntimeListeners());
    setTrackedRuntimeListeners([]);
    removeGlobalEventListeners(getTrackedGlobalEventListeners());
    setTrackedGlobalEventListeners([]);
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

        disposePreviousContentInstance(addedGlobalEventListeners);
        removeStorageListeners(addedStorageListeners);
        removeRuntimeListeners(addedRuntimeListeners);
        removeGlobalEventListeners(addedGlobalEventListeners);
        setTrackedStorageListeners([]);
        setTrackedRuntimeListeners([]);
        setTrackedGlobalEventListeners([]);
        throw bundleLoadError;
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
        disposePreviousContentInstance(addedGlobalEventListeners);
        removeStorageListeners(addedStorageListeners);
        removeRuntimeListeners(addedRuntimeListeners);
        removeGlobalEventListeners(addedGlobalEventListeners);
        setTrackedStorageListeners([]);
        setTrackedRuntimeListeners([]);
        setTrackedGlobalEventListeners([]);
        throw bootstrapError;
    }

    if (shouldCreateButton) {
        const button = document.getElementById('manga-translator-trigger');
        if (!button || button.dataset.positionReady !== 'true') {
            disposePreviousContentInstance(addedGlobalEventListeners);
            removeStorageListeners(addedStorageListeners);
            removeRuntimeListeners(addedRuntimeListeners);
            removeGlobalEventListeners(addedGlobalEventListeners);
            setTrackedStorageListeners([]);
            setTrackedRuntimeListeners([]);
            setTrackedGlobalEventListeners([]);
            window.__manga_translator_active_instance =
                `__mt_test_timeout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            if (button) button.remove();
            throw new Error(
                `Timeout aguardando botão do content_manga ficar pronto após ${normalizedReadyTimeoutMs} ms`
            );
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
~~~

## 17. Cobertura integral por posições

- **1–13:** cabeçalho explicativo do helper.
- **14–23:** imports, descoberta da raiz e path do Manifest.
- **24–54:** registries persistentes e accessors de ownership.
- **55–71:** leitura do Manifest e resolução dos módulos.
- **72–95:** snapshots e remoção de listeners Chrome.
- **96–103:** remoção de listeners globais.
- **104–138:** captura/restauração de `addEventListener`.
- **139–147:** cleanup da carga anterior.
- **148–165:** teardown `pagehide` direcionado ao handler rastreado.
- **166–180:** JSDoc do contrato público.
- **181–204:** assinatura, teardown anterior, snapshots e invalidação de ownership.
- **205–218:** `window.location` e premissa `window.top`.
- **219–231:** seed de storage.
- **232–246:** construção DOM segura das imagens.
- **247–254:** dimensões naturais/complete no JSDOM.
- **255–268:** espelhamento de globals.
- **269–282:** liberação do guard e carga do bundle com captura de erro.
- **283–299:** cleanup/rethrow de falha parcial.
- **300–332:** polling de readiness e finalização segura da captura.
- **333–365:** cleanup de exceção/timeout e persistência dos registries.
- **366–413:** objeto retornado e contrato de `sendMessage`.
- **414–424:** getters DOM e fechamento de `loadContentScript`.
- **425–429:** export CommonJS.
- **430:** LF final.

Faixas contíguas: **1–430**, sem lacunas e sem sobreposição.

## 18. Autoauditoria pós-correção

- SOURCE_SHA reconfirmado: `48deaef8742e7629c46c8930128699c4443329ff`.
- Self-test focal vinculado: `3ad467cb310debaf72eefbd8f522f57529cce8af`.
- Workflow vinculado: `9eb534298b30c7dd619ecbb2d51e044f972f50d6`.
- Fonte embutida obtida diretamente do blob e deve ser comparada byte-a-byte na reauditoria.
- Lifecycle do cabeçalho não alega `COMPLETED` antes da decisão distribuída.
- Cinco requests históricas são descritas como correções locais, não como aprovação independente.
- Não há `.skip`, `.only`, `xit`, `xdescribe`, TODO/FIXME usado para esconder pendência neste helper.

**Conclusão local:** o reparo da unidade está pronto para revalidação por evidência. O estado canônico deve permanecer `IN_PROGRESS`/`READY_FOR_AUDIT` até a execução verde e a auditoria independente da revisão vinculada.

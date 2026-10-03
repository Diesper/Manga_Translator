# Bíblia técnica — tests/integration/ipc/gtc-indexeddb-deep.test.js

> **Estado documental:** reparo corretivo materializado; decisão distribuída final pendente  
> **SHA auditado:** `b2210cb75cc03b447399b35d71813b7b4c6463a2`  
> **Índice do corpus:** 111  
> **Tipo:** integração JSDOM do GTC/IndexedDB + guard sintético de regressão de CI  
> **Linhas textuais:** **317**  
> **Posições documentais:** **318**, contando o LF final  
> **Tamanho textual observado:** **11439 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte conecta `content_manga.js`/`cm-gtc-client.js` reais ao `createGtcRuntimeHandler` e `createIndexedDbRepository` reais dentro de JSDOM/fake-indexeddb. Ela prova consulta IPC, cache hit, preservação do DOM e `UPDATE_IMAGE → GTC_SAVE`.

O caso de 50 hits é explicitamente um **guard sintético de regressão do harness de CI**. Não é SLO/SLA de Chromium e não representa decodificação de imagens 800×1200 reais.

## 2. Dependências revalidadas

- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/content/cm-gtc-client.js`: `95d062f41b9f1bd789a576c3a5c5d903b705fa55`.
- `extension/content/content_manga.js`: `a8b3698019f6f22027f09f544f15c0563a9f6515`.
- `extension/shared/gtc-indexeddb.js`: `0c872f23a665304b46dc2bb43c6468762feb2e31`.
- `extension/shared/gtc-fingerprint.js`: `fa014028d5e2ec9d9ca5d05c1199e1f6c45a2198`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- `package.json`: `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`.
- Workflow focal: `b42d421fa3db8ed6fda71182e5219d9919095e66`.

## 3. Performance: contrato corrigido

A revisão anterior prometia `<200ms` no cabeçalho/nome, mas a assertion era `<1000ms`. A primeira correção tentou alinhar tudo a 200 ms e o stress CI refutou essa hipótese: run `36946383899`, job `110649358532`, recebeu **443,818 ms** no primeiro attempt.

A revisão final usa `SYNTHETIC_50_HIT_BUDGET_MS = 750`. O nome e o cabeçalho usam o mesmo valor e deixam explícito que o limite pertence ao ambiente JSDOM/fake-IDB de CI, não ao produto real.

O workflow exige três execuções focais consecutivas antes da suíte integration completa. Run `36946537160`, job `110649842266`, passou as três tentativas.

## 4. Higiene do IndexedDB

A suíte não usa mais `fake-indexeddb/auto` global. Cada `beforeEach` cria uma `IDBFactory` própria e injeta essa factory no repository.

`afterEach` agora é assíncrono, executa `await repository.clear()`, solta referências a repository/factory e restaura os globals/mocks. O import morto `fs` foi removido.

## 5. Cenários funcionais mantidos

### Fingerprint
`createFingerprintFromDescriptor` real prova igualdade para pixels/descritor iguais mesmo com URL/extensão diferentes e diferencia o fallback sem pixels por URL.

### Cache hit por IPC
Uma entrada semeada no repository real é recuperada por `GTC_QUERY_MANY`; não há `START_BATCH` nem lookup legacy, e atributos de framework permanecem no DOM.

### UPDATE_IMAGE
O listener real de `UPDATE_IMAGE` usa `origHash`, emite salvamento GTC e o teste lê o mesmo repository para confirmar persistência.

### Lote de 50 hits
O guard exige 50 elementos traduzidos, nenhuma chamada `fetch`, zero `START_BATCH`, uma única `GTC_QUERY_MANY` com 50 hashes e tempo do harness `<750ms`.

## 6. Audit requests

### 111-001 — RESOLVED
O contrato temporal agora coincide com a assertion executável. A hipótese de 200 ms foi testada e refutada em CI; o budget final de 750 ms é explicitamente sintético e passou três execuções consecutivas.

### 111-002 — RESOLVED
A força probatória foi classificada: o teste é benchmark/guard sintético do harness, não SLA de produto. Nenhuma afirmação de imagens pesadas reais/IndexedDB Chromium permanece.

### 111-003 — RESOLVED
`fs` removido; `IDBFactory` isolada por teste; repository limpo no teardown; referências são liberadas.

## 7. Evidência executável

- Workflow: `.github/workflows/gtc-indexeddb-deep-selftest.yml` SHA `b42d421fa3db8ed6fda71182e5219d9919095e66`.
- Evidência negativa: run `36946383899`, job `110649358532`, `<200ms` falhou com **443,818 ms**.
- Evidência final: run `36946537160`, job `110649842266`, conclusão `success`.
- Stress focal: **3 execuções consecutivas**, cada uma **1/1 suíte, 4/4 testes**, com `--detectOpenHandles`.
- Regressão relacionada: **13/13 suítes, 81/81 testes** do projeto `integration`.

## 8. Limites honestos

- `fake-indexeddb` não mede latência do IndexedDB nativo de Chromium.
- Data URLs são pequenas; width/height são metadados do fixture, não payload decodificado de 800×1200 pixels.
- `MutationObserver` é no-op durante a suíte.
- O handler GTC é registrado diretamente no runtime mock; não inicializa o service worker completo.
- O budget de 750 ms só é uma barreira de regressão deste harness/runner.

## 9. Fonte integral exata

```js
/**
 * gtc-indexeddb-deep.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Suíte de integração profunda para a migração do GTC para IndexedDB.
 *
 * Objetivos:
 * 1. Content script consulta o cache via IPC no background, não via storage.local
 * 2. Hash visual ignora formato/URL quando há pixels disponíveis
 * 3. Restauração de cache preserva atributos de framework no DOM
 * 4. UPDATE_IMAGE persiste a tradução no IndexedDB do background
 * 5. Guard sintético de CI: 50 cache hits restauram em <750ms no JSDOM/fake-IDB; não é SLA de produto
 */

const path = require('path');
const v8 = require('v8');
const { TextEncoder } = require('util');
const crypto = require('crypto');
const { IDBFactory } = require('fake-indexeddb');

if (typeof global.structuredClone !== 'function') {
    Object.defineProperty(global, 'structuredClone', {
        value: (value) => v8.deserialize(v8.serialize(value)),
        configurable: true,
    });
}


const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const { getRuntimeMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));
const { createIndexedDbRepository, createGtcRuntimeHandler } = require(path.join(ROOT, 'extension/shared/gtc-indexeddb.js'));
const { createFingerprintFromDescriptor } = require(path.join(ROOT, 'extension/shared/gtc-fingerprint.js'));

function cleanUrl(urlStr) {
    if (!urlStr || urlStr.startsWith('data:')) return null;
    try {
        const u = new URL(urlStr, 'https://reader.test');
        return u.origin + u.pathname;
    } catch (e) {
        return urlStr.split('?')[0].split('#')[0];
    }
}

async function buildJsdomFallbackHash(src, width, height) {
    return createFingerprintFromDescriptor({
        width,
        height,
        cleanUrl: cleanUrl(src),
        pixelSample: 'nopixels',
        hasVisualPixels: false,
    });
}

function makeDataUrl(label, mimeType = 'image/png') {
    return `data:${mimeType};base64,${Buffer.from(label).toString('base64')}`;
}

async function waitFor(assertion, { timeout = 2000, interval = 10 } = {}) {
    const startedAt = performance.now();

    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Timeout aguardando condição assíncrona');
}

describe('GTC IndexedDB — Integração Profunda', () => {
    const SYNTHETIC_50_HIT_BUDGET_MS = 750;
    let runtimeMock;
    let repository;
    let sendMessageSpy;
    let storageGetSpy;
    let originalMutationObserver;
    let indexedDbFactory;

    beforeEach(() => {
        runtimeMock = getRuntimeMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];

        originalMutationObserver = window.MutationObserver;
        const NoopMutationObserver = class {
            observe() {}
            disconnect() {}
            takeRecords() { return []; }
        };
        window.MutationObserver = NoopMutationObserver;
        global.MutationObserver = NoopMutationObserver;

        indexedDbFactory = new IDBFactory();
        repository = createIndexedDbRepository({
            indexedDbFactory,
            dbName: `gtc-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        });

        runtimeMock.onMessage.addListener(createGtcRuntimeHandler({ repository }));

        sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        storageGetSpy = jest.spyOn(global.chrome.storage.local, 'get');
        global.fetch = jest.fn();
    });

    afterEach(async () => {
        if (repository) await repository.clear();
        repository = null;
        indexedDbFactory = null;
        jest.restoreAllMocks();
        delete global.fetch;
        window.MutationObserver = originalMutationObserver;
        global.MutationObserver = originalMutationObserver;
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('regra de colisão visual: pixels iguais geram o mesmo hash; fallback por URL continua distinto', async () => {
        const sharedPixelSample = 'ff0000cc'.repeat(64);

        const pngHash = await createFingerprintFromDescriptor({
            width: 800,
            height: 1200,
            pixelSample: sharedPixelSample,
            cleanUrl: 'https://cdn-a.example/panel.png',
            hasVisualPixels: true,
        });

        const jpgHash = await createFingerprintFromDescriptor({
            width: 800,
            height: 1200,
            pixelSample: sharedPixelSample,
            cleanUrl: 'https://cdn-b.example/panel.jpg',
            hasVisualPixels: true,
        });

        const fallbackHashA = await createFingerprintFromDescriptor({
            width: 800,
            height: 1200,
            pixelSample: 'nopixels',
            cleanUrl: 'https://cdn-a.example/panel.png',
            hasVisualPixels: false,
        });

        const fallbackHashB = await createFingerprintFromDescriptor({
            width: 800,
            height: 1200,
            pixelSample: 'nopixels',
            cleanUrl: 'https://cdn-b.example/panel.jpg',
            hasVisualPixels: false,
        });

        expect(pngHash).toBe(jpgHash);
        expect(fallbackHashA).not.toBe(fallbackHashB);
    });

    test('cache hit via IPC restaura a imagem sem START_BATCH e preserva atributos do DOM', async () => {
        const src = 'https://reader.test/panel-001.png?token=abc123';
        const translated = makeDataUrl('translated-panel-001');
        const hash = await buildJsdomFallbackHash(src, 800, 1200);

        await repository.put({
            hash,
            translatedDataUrl: translated,
            cleanUrl: cleanUrl(src),
            width: 800,
            height: 1200,
        });

        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{
                src,
                width: 800,
                height: 1200,
                className: 'panel panel--hydrated',
                attributes: {
                    'data-reactid': '$.0.1.0',
                    'data-v-app': 'reader-root',
                    'aria-label': 'manga-panel-001',
                },
            }],
        });

        context.getMainContent().click();

        await waitFor(() => {
            const img = document.querySelector('[data-testid="img-0"]');
            return img && img.getAttribute('src') === translated;
        });

        const img = document.querySelector('[data-testid="img-0"]');
        const queryMessages = sendMessageSpy.mock.calls
            .map(([message]) => message)
            .filter(message => message && message.action === 'GTC_QUERY_MANY');
        const startBatchMessages = sendMessageSpy.mock.calls
            .map(([message]) => message)
            .filter(message => message && message.action === 'START_BATCH');
        const legacyGtcLookups = storageGetSpy.mock.calls.filter(([keys]) =>
            Array.isArray(keys) && keys.some(key => String(key).startsWith('gtc_'))
        );

        expect(queryMessages).toHaveLength(1);
        expect(queryMessages[0].hashes).toEqual([hash]);
        expect(startBatchMessages).toHaveLength(0);
        expect(legacyGtcLookups).toHaveLength(0);

        expect(img.getAttribute('src')).toBe(translated);
        expect(img.dataset.translated).toBe('true');
        expect(img.getAttribute('data-reactid')).toBe('$.0.1.0');
        expect(img.getAttribute('data-v-app')).toBe('reader-root');
        expect(img.getAttribute('aria-label')).toBe('manga-panel-001');
        expect(img.className).toBe('panel panel--hydrated');
    });

    test('UPDATE_IMAGE persiste a tradução no IndexedDB do background', async () => {
        const src = 'https://reader.test/panel-002.png?token=rotated';
        const translated = makeDataUrl('translated-panel-002');
        const hash = await buildJsdomFallbackHash(src, 800, 1200);

        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{
                src,
                width: 800,
                height: 1200,
                attributes: {
                    'data-reactid': '$.0.2.0',
                },
            }],
        });

        const img = document.querySelector('[data-testid="img-0"]');
        img.dataset.mangaIndex = '0';
        img.dataset.origHash = hash;

        await context.sendMessage('UPDATE_IMAGE', {
            index: 0,
            newSrc: translated,
        });

        await waitFor(async () => {
            const entries = await repository.getMany([hash]);
            return entries[hash] === translated;
        });

        const entries = await repository.getMany([hash]);
        expect(entries[hash]).toBe(translated);
    });

    test('guard sintético de CI restaura 50 cache hits em menos de 750ms sem tráfego externo', async () => {
        const translatedEntries = [];
        const domImages = [];

        for (let i = 0; i < 50; i++) {
            const src = `https://reader.test/chapter-1/page-${String(i).padStart(3, '0')}.png?token=${i}`;
            const hash = await buildJsdomFallbackHash(src, 800, 1200);
            const translatedDataUrl = makeDataUrl(`translated-${i}`);

            translatedEntries.push({
                hash,
                translatedDataUrl,
                cleanUrl: cleanUrl(src),
                width: 800,
                height: 1200,
            });

            domImages.push({
                src,
                width: 800,
                height: 1200,
                className: 'reader-panel',
                attributes: {
                    'data-reactid': `$.panel.${i}`,
                },
            });
        }

        await repository.putMany(translatedEntries);

        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages,
        });

        const startedAt = performance.now();
        context.getMainContent().click();

        await waitFor(() => {
            return document.querySelectorAll('img[data-translated="true"]').length === 50;
        }, { timeout: 4000 });

        const elapsedMs = performance.now() - startedAt;
        const startBatchMessages = sendMessageSpy.mock.calls
            .map(([message]) => message)
            .filter(message => message && message.action === 'START_BATCH');
        const queryMessages = sendMessageSpy.mock.calls
            .map(([message]) => message)
            .filter(message => message && message.action === 'GTC_QUERY_MANY');

        expect(elapsedMs).toBeLessThan(SYNTHETIC_50_HIT_BUDGET_MS);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(startBatchMessages).toHaveLength(0);
        expect(queryMessages).toHaveLength(1);
        expect(queryMessages[0].hashes).toHaveLength(50);
        expect(context.getMainContent().textContent).toContain('TRADUZIR 50');
    });
});
```

## 10. Cobertura integral por posições

- **1–13:** cabeçalho e contrato do guard sintético.
- **14–27:** imports, structuredClone e preparação de dependências.
- **28–42:** root, WebCrypto/TextEncoder e módulos reais.
- **43–65:** helpers `cleanUrl`, hash fallback e data URL.
- **66–77:** polling bounded.
- **78–86:** abertura da suíte, budget e estado compartilhado.
- **87–113:** setup com IDBFactory isolada, repository, runtime handler e spies.
- **114–126:** teardown assíncrono e cleanup do repository/globals.
- **127–165:** fingerprint visual/fallback.
- **166–224:** cache hit por IPC e preservação DOM.
- **225–259:** `UPDATE_IMAGE → IndexedDB`.
- **260–317:** guard sintético de 50 hits, tempo/call-count e ausência de tráfego/fila.
- **318:** posição vazia do LF final.

**Cobertura:** 318/318 posições, contíguas e sem overlap.

## 11. Autoauditoria pós-correção

- Fonte integral byte-a-byte exata com o blob auditado, exceto LF terminal fora do fence.
- Nenhum `.skip`, `.only`, `xit`, `xdescribe`, TODO/FIXME.
- Nenhum import `fs` ou `fake-indexeddb/auto` global.
- Limite temporal, nome e documentação usam o mesmo valor.
- Run negativa preservada como evidência de refutação; run final 3× + suíte relacionada verde.
- A unidade retorna para PRIMARY + ADVERSARIAL independentes; esta correção não autoaprova a decisão distribuída final.

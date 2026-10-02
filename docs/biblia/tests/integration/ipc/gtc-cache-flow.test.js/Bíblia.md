# Bíblia técnica — tests/integration/ipc/gtc-cache-flow.test.js

> **Estado documental:** reparo corretivo materializado; decisão distribuída final pendente  
> **SHA auditado:** `d2d0685772206873d2dfe5b5a43efd7f5218ad60`  
> **Índice do corpus:** 110  
> **Tipo:** integração Jest real do pipeline GTC moderno + fallback legado  
> **Linhas textuais:** **290**  
> **Posições documentais:** **291**, contando o LF final  
> **Tamanho textual observado:** **11068 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A revisão anterior era um modelo sintético sobre `ChromeStorageMock`. A revisão atual removeu `simulateExtractWithGTC`, o import morto `fs` e as gravações diretas usadas como falsa evidência de `UPDATE_IMAGE`.

O fluxo exercitado agora é real dentro do ambiente Jest suportado:

`content_manga.js / cm-gtc-client.js` → `chrome.runtime` → `createGtcRuntimeHandler()` → `createIndexedDbRepository()` com `fake-indexeddb`.

O fallback `storage.local gtc_<hash>` permanece coberto somente quando a resposta moderna é forçada a falhar; a decisão de cair no fallback pertence ao cliente GTC real.

## 2. Dependências revalidadas

- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/content/content_manga.js`: `a8b3698019f6f22027f09f544f15c0563a9f6515`.
- `extension/shared/gtc-indexeddb.js`: `0c872f23a665304b46dc2bb43c6468762feb2e31`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- `package.json`: `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`.
- `.github/workflows/ci.yml`: `9ce62e2b116e2204d1689edf9d302e6ee0cf8c3a`.
- `.github/workflows/gtc-cache-flow-selftest.yml`: `65fd11e02cb63ae290772526da30aae6365d186b`.

## 3. Bridge GTC real

`installRealGtcBridge()` cria `createGtcRuntimeHandler({ repository })` da implementação de produção. Mensagens `GTC_*` são delegadas a esse handler; o repository é o `createIndexedDbRepository()` real sobre uma `IDBFactory` do `fake-indexeddb`.

Nos cenários de hit, a fixture pré-popula o repository **antes de delegar a consulta ao handler real**. Ela não decide se algo é hit/miss; essa decisão ocorre no repository/handler/cliente reais.

Mensagens externas ao escopo GTC (`START_BATCH`, fingerprint visual e alguns serviços auxiliares) recebem respostas controladas somente para permitir observar o comportamento do content script.

## 4. Caso 100% hit

O primeiro teste cria duas imagens, intercepta a primeira `GTC_QUERY_MANY` somente para pré-popular o repository real com as traduções correspondentes e então delega a mesma request ao handler de produção.

As assertions exigem:

- as duas imagens marcadas como traduzidas;
- Data URLs exatos aplicados ao DOM;
- nenhum `START_BATCH`; e
- exatamente **uma** `GTC_QUERY_MANY` contendo os dois hashes.

Essa última assertion substitui a antiga alegação de “eficiência” sem prova por uma propriedade observável: o cliente moderno faz consulta SHA em batch único.

## 5. Hit parcial e miss → fila

O segundo teste pré-popula apenas o primeiro hash. O handler/repository reais devolvem um hit e um miss.

O content script real aplica a tradução do índice 0 e envia `START_BATCH` **somente** com `{ index: 1 }`. Também exige uma única consulta `GTC_QUERY_MANY` com os dois hashes.

## 6. Fallback legado

O terceiro teste força apenas a indisponibilidade da resposta moderna `GTC_QUERY_MANY`. No momento dessa request, a fixture grava as chaves legadas correspondentes para representar dados históricos já existentes.

`cm-gtc-client.js` real detecta `ok:false`, lê `storage.local` e aplica as duas traduções. O teste exige nenhum `START_BATCH`, uma única consulta moderna tentada e as duas chaves legacy presentes.

Assim a suíte diferencia explicitamente a arquitetura primária moderna do caminho de backward compatibility.

## 7. UPDATE_IMAGE → GTC_SAVE

O quarto teste carrega `content_manga.js` real, marca o elemento com `dataset.origHash = 'abc123hash'` e despacha `UPDATE_IMAGE` pelo listener real.

O content script emite `GTC_SAVE`; o bridge de produção persiste no repository IndexedDB real. A prova final consulta **o repository**, não apenas a mensagem, e exige `{ abc123hash: TRANSLATED_0 }`, além de validar `cleanUrl` e DOM atualizado.

## 8. Ambiente fake-indexeddb

A primeira execução real reproduziu um problema do ambiente de teste: sem `structuredClone`, o backend `fake-indexeddb` rejeitava operações, fazendo os hits modernos virarem misses e impedindo `GTC_SAVE` de persistir.

A correção adiciona o mesmo polyfill de `structuredClone` já usado em `tests/integration/performance.test.js`. Nenhuma assertion de produto foi enfraquecida.

## 9. Audit requests

### 110-001 — RESOLVED

A suíte é agora integração real do pipeline moderno; `simulateExtractWithGTC` foi removida e o cabeçalho/classificação correspondem ao que é executado.

### 110-002 — RESOLVED

Hit completo, hit parcial/miss→fila e `UPDATE_IMAGE→GTC_SAVE→IndexedDB` passam por produtores/consumidores reais.

### 110-003 — RESOLVED

O caminho primário runtime/IndexedDB é o foco da suíte; o fallback `gtc_<hash>` é exercitado separadamente forçando falha moderna e deixando o cliente real decidir pelo fallback.

### 110-004 — RESOLVED

O caso antigo de “eficiência” foi removido. A estratégia moderna é provada por call-count: exatamente uma `GTC_QUERY_MANY` com todos os hashes do lote nos casos de hit completo e parcial.

### 110-005 — RESOLVED

O import morto `fs` foi removido.

## 10. Evidência executável

- Workflow focal: `.github/workflows/gtc-cache-flow-selftest.yml` SHA `65fd11e02cb63ae290772526da30aae6365d186b`.
- Run negativa: `36945821282`, job `110647594401`: 3/4 casos falharam e revelaram a ausência de `structuredClone` no backend fake IndexedDB.
- Run final: `36945960530`, job `110648032272`: **success**.
- Focal final: **1/1 suíte, 4/4 testes**, `--runTestsByPath`, `--runInBand`, `--detectOpenHandles`.
- Regressão relacionada: **13/13 suítes, 81/81 testes** do projeto `integration`.
- Snapshots: 0.

## 11. Limites honestos

- O IndexedDB exercitado é `fake-indexeddb`, não armazenamento Chromium em disco; a lógica de repository/transações é a implementação real.
- `START_BATCH` é observado por listener controlado; o background Gemini não é necessário para provar que apenas os misses são enfileirados.
- O seed tardio do repository existe somente para descobrir os hashes gerados pelo content real antes da consulta; depois disso a request original é processada pelo handler/repository reais.
- O fallback legacy precisa de fixture direta em `storage.local` porque representa entradas históricas preexistentes; a decisão de consultá-las permanece lógica real do cliente.

## 12. Fonte integral exata

```js
/**
 * gtc-cache-flow.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real do GTC moderno:
 * content_manga.js -> chrome.runtime -> createGtcRuntimeHandler -> IndexedDB.
 *
 * A suíte não reimplementa a decisão hit/miss. Fixtures apenas pré-populam o
 * repository real ou forçam explicitamente o fallback legado.
 */

const crypto = require('crypto');
const { TextEncoder } = require('util');
const { IDBFactory } = require('fake-indexeddb');

const { loadContentScript } = require('../../helpers/load-content-script.js');
const {
    getRuntimeMock,
    getStorageMock,
} = require('../../mocks/chrome-api.mock.js');
const {
    createGtcRuntimeHandler,
    createIndexedDbRepository,
} = require('../../../extension/shared/gtc-indexeddb.js');

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;
if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));
}

describe('Global Translation Cache (GTC) — integração moderna real', () => {
    const TRANSLATED_0 = 'data:image/png;base64,Q0FDSEVfMA==';
    const TRANSLATED_1 = 'data:image/png;base64,Q0FDSEVfMQ==';

    let runtimeMock;
    let storageMock;
    let repository;
    let runtimeMessages;
    let startBatches;
    let queryManyMode;

    function uniqueDbName() {
        return `gtc-cache-flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    async function waitFor(assertion, { timeout = 3000, interval = 10 } = {}) {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
            const result = await assertion();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        throw new Error('Timeout aguardando integração GTC');
    }

    function installRealGtcBridge() {
        const realHandler = createGtcRuntimeHandler({ repository });

        runtimeMock.onMessage.addListener((request, sender, sendResponse) => {
            if (!request || !request.action || !request.action.startsWith('GTC_')) return false;
            runtimeMessages.push(request);

            if (request.action === 'GTC_QUERY_MANY' && queryManyMode) {
                if (queryManyMode.kind === 'seed') {
                    Promise.resolve()
                        .then(async () => {
                            const selected = queryManyMode.select(request.hashes || []);
                            await repository.putMany(
                                selected.map(({ hash, translatedDataUrl }) => ({
                                    hash,
                                    translatedDataUrl,
                                    cleanUrl: `fixture://${hash}`,
                                }))
                            );
                            realHandler(request, sender, sendResponse);
                        })
                        .catch(error => sendResponse({ ok: false, error: error.message }));
                    return true;
                }

                if (queryManyMode.kind === 'legacy-fallback') {
                    Promise.resolve()
                        .then(async () => {
                            const legacyEntries = Object.fromEntries(
                                (request.hashes || []).map((hash, index) => [
                                    `gtc_${hash}`,
                                    queryManyMode.values[index] || TRANSLATED_0,
                                ])
                            );
                            await storageMock.set(legacyEntries);
                            sendResponse({ ok: false, error: 'forced modern GTC failure' });
                        })
                        .catch(error => sendResponse({ ok: false, error: error.message }));
                    return true;
                }
            }

            return realHandler(request, sender, sendResponse);
        });

        runtimeMock.onMessage.addListener((request, _sender, sendResponse) => {
            if (!request || !request.action) return false;

            if (request.action === 'START_BATCH') {
                startBatches.push(request);
                sendResponse({
                    ok: true,
                    batchId: request.batchId,
                    queued: false,
                    queuePosition: null,
                });
                return false;
            }

            if (request.action === 'CALCULATE_VISUAL_FINGERPRINT') {
                sendResponse({ ok: false, error: 'fingerprint visual não necessário no cenário SHA' });
                return false;
            }

            if (
                request.action === 'LOG_ENTRY'
                || request.action === 'SM_SAVE_PAGE'
                || request.action === 'SM_STATS'
            ) {
                sendResponse({ ok: true });
                return false;
            }

            return false;
        });
    }

    async function loadPages(count = 2) {
        return loadContentScript({
            hostname: 'localhost',
            domImages: Array.from({ length: count }, (_, index) => ({
                src: `http://localhost/page-${index}.png`,
                width: 800 + index,
                height: 1200 + index,
            })),
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        runtimeMessages = [];
        startBatches = [];
        queryManyMode = null;

        await storageMock.clear();
        repository = createIndexedDbRepository({
            indexedDbFactory: new IDBFactory(),
            dbName: uniqueDbName(),
        });
        installRealGtcBridge();

        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await repository.clear();
        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('100% SHA hits passam pelo runtime/IndexedDB real e evitam START_BATCH', async () => {
        queryManyMode = {
            kind: 'seed',
            select(hashes) {
                return (hashes || []).map((hash, index) => ({
                    hash,
                    translatedDataUrl: index === 0 ? TRANSLATED_0 : TRANSLATED_1,
                }));
            },
        };

        await loadPages(2);
        document.getElementById('manga-main-content').click();

        await waitFor(() =>
            Array.from(document.querySelectorAll('img')).every(img => img.dataset.translated === 'true')
        );

        const images = Array.from(document.querySelectorAll('img'));
        expect(images[0].getAttribute('src')).toBe(TRANSLATED_0);
        expect(images[1].getAttribute('src')).toBe(TRANSLATED_1);
        expect(startBatches).toHaveLength(0);

        const shaQueries = runtimeMessages.filter(message => message.action === 'GTC_QUERY_MANY');
        expect(shaQueries).toHaveLength(1);
        expect(shaQueries[0].hashes).toHaveLength(2);
    });

    test('hit parcial aplica cache e encaminha somente o miss para START_BATCH', async () => {
        queryManyMode = {
            kind: 'seed',
            select(hashes) {
                return hashes && hashes[0]
                    ? [{ hash: hashes[0], translatedDataUrl: TRANSLATED_0 }]
                    : [];
            },
        };

        await loadPages(2);
        document.getElementById('manga-main-content').click();

        const batch = await waitFor(() => startBatches[0]);
        expect(batch.images).toEqual([{ index: 1 }]);

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe(TRANSLATED_0);
        expect(document.querySelector('[data-testid="img-1"]').dataset.translated).not.toBe('true');

        const shaQueries = runtimeMessages.filter(message => message.action === 'GTC_QUERY_MANY');
        expect(shaQueries).toHaveLength(1);
        expect(shaQueries[0].hashes).toHaveLength(2);
    });

    test('falha do caminho moderno ativa fallback legado gtc_<hash> na implementação real', async () => {
        queryManyMode = {
            kind: 'legacy-fallback',
            values: [TRANSLATED_0, TRANSLATED_1],
        };

        await loadPages(2);
        document.getElementById('manga-main-content').click();

        await waitFor(() =>
            Array.from(document.querySelectorAll('img')).every(img => img.dataset.translated === 'true')
        );

        const images = Array.from(document.querySelectorAll('img'));
        expect(images[0].getAttribute('src')).toBe(TRANSLATED_0);
        expect(images[1].getAttribute('src')).toBe(TRANSLATED_1);
        expect(startBatches).toHaveLength(0);

        const shaQueries = runtimeMessages.filter(message => message.action === 'GTC_QUERY_MANY');
        expect(shaQueries).toHaveLength(1);

        const legacyState = await storageMock.get(
            shaQueries[0].hashes.map(hash => `gtc_${hash}`)
        );
        expect(Object.keys(legacyState)).toHaveLength(2);
    });

    test('UPDATE_IMAGE real persiste tradução via GTC_SAVE no repository IndexedDB real', async () => {
        const context = await loadPages(1);
        const original = document.querySelector('[data-testid="img-0"]');
        original.dataset.mangaIndex = '0';
        original.dataset.origHash = 'abc123hash';

        await context.sendMessage('UPDATE_IMAGE', {
            index: 0,
            newSrc: TRANSLATED_0,
        });

        await waitFor(async () => {
            const result = await repository.getMany(['abc123hash']);
            return result.abc123hash === TRANSLATED_0;
        });

        const stored = await repository.getMany(['abc123hash']);
        expect(stored).toEqual({ abc123hash: TRANSLATED_0 });
        expect(runtimeMessages).toContainEqual(expect.objectContaining({
            action: 'GTC_SAVE',
            hash: 'abc123hash',
            translatedDataUrl: TRANSLATED_0,
            cleanUrl: 'http://localhost/page-0.png',
        }));
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe(TRANSLATED_0);
    });
});
```

## 13. Cobertura integral por posições

- **1–33:** cabeçalho, imports, polyfills e abertura da suíte.
- **34–44:** constantes e estado compartilhado.
- **45–48:** nome único do banco IndexedDB.
- **49–58:** polling bounded.
- **59–135:** bridge GTC real, seed/fallback controlados e responders auxiliares.
- **136–146:** criação de páginas reais pelo helper.
- **147–171:** setup por teste e repository IndexedDB.
- **172–183:** cleanup por teste.
- **184–211:** 100% hit moderno.
- **212–236:** hit parcial e miss para `START_BATCH`.
- **237–263:** fallback legado real.
- **264–290:** `UPDATE_IMAGE → GTC_SAVE → repository`.
- **291:** posição vazia do LF final.

**Cobertura:** 291/291 posições, contíguas e sem overlap.

## 14. Autoauditoria pós-correção

- Fonte integral byte-a-byte exata com o blob auditado, exceto LF terminal fora do fence.
- Nenhum `.skip`, `.only`, `xit`, `xdescribe`, TODO/FIXME.
- Nenhum helper local reimplementa a decisão hit/miss.
- Erro de ambiente reproduzido em CI antes do reparo e revalidado depois.
- Cinco requests possuem correção executável e evidência verde.
- A unidade deve voltar para PRIMARY + ADVERSARIAL independentes; esta correção não substitui a decisão distribuída final.

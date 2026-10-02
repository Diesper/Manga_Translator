# Bíblia técnica — tests/integration/ipc/image-translation-routing.test.js

> **Estado documental:** correção materializada; nova auditoria independente ainda necessária  
> **SHA auditado:** `6c47003aae5207d711c667bc805fb71373ae788f`  
> **Índice do corpus:** 112  
> **Tipo:** integração Jest do roteamento GTC/IPC do content script real  
> **Linhas textuais:** **172**  
> **Posições documentais:** **173**, contando exclusivamente o LF terminal como posição editorial  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte carrega o bundle real de mangá por `loadContentScript()` e verifica como `content_manga.js` decide entre cache global (GTC) e envio para o background/Gemini.

O background não é executado aqui: `chrome.runtime.sendMessage` é substituído por um responder controlado. Portanto, as provas pertencem ao lado emissor/consumidor do content script, não à execução interna de `START_BATCH` no service worker.

## 2. Dependências revalidadas

- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/content/content_manga.js`: `a8b3698019f6f22027f09f544f15c0563a9f6515`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.

O import morto de `fs` foi removido nesta revisão.

## 3. Cenários diretos

### 3.1 Miss completo

Com `entriesByHash: {}`, o clique no botão real deve produzir `START_BATCH` com:

- `images === [{ index: 0 }]`;
- `prompt === 'Teste prompt'`.

### 3.2 Hit completo

O responder devolve tradução apenas para o hash consultado. A suíte exige:

- `data-translated="true"`;
- `src === data:image/png;base64,TRANSLATED_HIT`;
- nenhuma mensagem `START_BATCH`.

### 3.3 Hit parcial + miss no mesmo lote

Esta revisão fecha a request 112-001 em implementação:

- cria duas imagens elegíveis;
- registra os dois hashes consultados;
- devolve cache apenas para `message.hashes[0]`;
- exige que a primeira imagem seja substituída e marcada traduzida;
- exige que a segunda permaneça não traduzida;
- exige `START_BATCH.images === [{ index: 1 }]`;
- exige explicitamente que `{ index: 0 }` não apareça no lote.

Assim, o branch real `GTC_PARTIAL_HIT` passa a ser coberto pela própria suíte de roteamento real.

### 3.4 Filtro por dimensão

Duas páginas 800×1200 e um avatar 50×50 são carregados; o lote enviado deve conter somente índices 0 e 1.

## 4. Audit request

### 112-001 — TEST_REQUIRED — RESOLVED

**Finding original:** a suíte separava 100% hit e 100% miss, sem provar composição parcial no mesmo lote.

**Correção:** cenário 3.3 usa duas imagens no `content_manga.js` real, uma hit e uma miss, e valida simultaneamente DOM + payload IPC.

**Validação executável:** run `36949474407`; Node 20 job `110658968522` e Node 22 job `110658968523` executaram `image-translation-routing.test.js` com **4/4 casos PASS**. O novo caso de cache parcial passou nos dois ambientes.

## 5. Findings distribuídos da revisão anterior

### A32-112-01 / A12-112-A01 — lifecycle stale — CORRIGIDO

O cabeçalho antigo declarava “CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA” apesar de o state estar `READY_FOR_AUDIT`. Esta revisão **não** declara aprovação final; registra apenas correção materializada e necessidade de nova auditoria independente.

### A32-112-02 / A12-112-A02 — newline final — CORRIGIDO

A posição 173 representa **somente o LF terminal** após a linha textual 172. Ela é posição editorial, não linha de runtime, não separa bloco seguinte e não recebe classificação de execução.

## 6. Evidência atual

Até esta atualização:

- parse JavaScript estático: **PASS**;
- source/Bíblia: **sincronizados para o SHA acima**;
- fonte integral: **embutida abaixo**;
- run `36949474407`, Node 20 job `110658968522`: **PASS 4/4** para `image-translation-routing.test.js`;
- run `36949474407`, Node 22 job `110658968523`: **PASS 4/4** para `image-translation-routing.test.js`;
- o cenário novo `cache parcial substitui hit e envia somente miss no START_BATCH real` passou em ambos.

Os jobs globais `Unit + Integration` terminaram vermelhos por uma falha **externa a #112** em `tests/integration/performance.test.js` (`PERF-09`/storage-manager), unidade #114 já reservada por outro corretor. Nenhuma falha de #112 aparece nos logs.

## 7. Limites honestos

- O responder de runtime é controlado; esta suíte não prova o handler real do background.
- Falha/timeout de `GTC_QUERY_MANY` e fallback legado pertencem a suítes específicas.
- O filtro de dimensão aqui cobre um exemplo 50×50, não todas as bordas configuráveis.
- A prova de cache parcial é do content script real carregado pelo manifest/helper, não de uma função simulada local.

## 8. Fonte integral exata

```javascript
const path = require('path');
const crypto = require('crypto');
const { TextEncoder } = require('util');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condicao');
}

describe('IPC-01/IPC-02/IPC-03: Image translation routing - GTC e IPC', () => {
    let runtimeMock;
    let storageMock;
    let sentMessages;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        sentMessages = [];
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    function installRuntimeResponder({ onQueryMany, onStartBatch } = {}) {
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                const response = onQueryMany ? onQueryMany(message) : { ok: true, entriesByHash: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'START_BATCH') {
                if (typeof onStartBatch === 'function') onStartBatch(message);
                if (callback) setTimeout(() => callback({ ok: true }), 0);
                return;
            }

            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    test('GTC miss envia START_BATCH para o background', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));
        expect(startBatch.images).toEqual([{ index: 0 }]);
        expect(startBatch.prompt).toBe('Teste prompt');
    });

    test('GTC hit substitui a imagem e nao chama START_BATCH', async () => {
        installRuntimeResponder({
            onQueryMany(message) {
                return {
                    ok: true,
                    entriesByHash: {
                        [message.hashes[0]]: 'data:image/png;base64,TRANSLATED_HIT',
                    },
                };
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        await waitFor(() => document.querySelector('img').dataset.translated === 'true');
        expect(document.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,TRANSLATED_HIT');
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);
    });

    test('cache parcial substitui hit e envia somente miss no START_BATCH real', async () => {
        let queriedHashes = null;
        installRuntimeResponder({
            onQueryMany(message) {
                queriedHashes = message.hashes.slice();
                return {
                    ok: true,
                    entriesByHash: {
                        [message.hashes[0]]: 'data:image/png;base64,PARTIAL_HIT',
                    },
                };
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/hybrid/page-1.png', width: 800, height: 1200 },
                { src: 'http://localhost/hybrid/page-2.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));
        await waitFor(() => document.querySelectorAll('img')[0].dataset.translated === 'true');

        const images = document.querySelectorAll('img');
        expect(queriedHashes).toHaveLength(2);
        expect(images[0].getAttribute('src')).toBe('data:image/png;base64,PARTIAL_HIT');
        expect(images[0].dataset.translated).toBe('true');
        expect(images[1].dataset.translated).not.toBe('true');
        expect(startBatch.images).toEqual([{ index: 1 }]);
        expect(startBatch.images).not.toContainEqual({ index: 0 });
    });

    test('processamento em lote ignora imagem pequena e envia somente paginas validas', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/witch/page-1.jpg', width: 800, height: 1200 },
                { src: 'http://localhost/witch/page-2.jpg', width: 800, height: 1200 },
                { src: 'http://localhost/witch/avatar.jpg', width: 50, height: 50 },
            ],
        });

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));
        expect(startBatch.images).toEqual([{ index: 0 }, { index: 1 }]);
    });
});
```

## 9. Cobertura integral por posições

- **1–16:** imports, raiz portátil, WebCrypto/TextEncoder e helpers externos.
- **17–30:** `delay` e `waitFor`.
- **31–35:** abertura da suíte e estado compartilhado.
- **36–49:** setup por teste.
- **50–57:** cleanup por teste.
- **58–77:** responder controlado de runtime.
- **78–93:** cenário de miss completo.
- **94–119:** cenário de hit completo.
- **120–155:** cenário de cache parcial real.
- **156–172:** filtro de imagem pequena.
- **173:** LF terminal — posição editorial não executável.

**Cobertura:** 173/173 posições, contíguas e sem overlap.

## 10. Reauditoria pós-correção

- status stale “APROVADA/CONCLUÍDA”: removido;
- LF terminal: documentado como posição editorial;
- import morto `fs`: removido;
- cache parcial real: adicionado;
- assertion negativa: hit não reaparece em `START_BATCH`;
- source integral e SHA: sincronizados;
- CI focal do SHA atual: PASS 4/4 em Node 20 e Node 22.
- Falha global remanescente do run: `PERF-09`/storage-manager, externa a #112 e já sob reserva de outro agente.

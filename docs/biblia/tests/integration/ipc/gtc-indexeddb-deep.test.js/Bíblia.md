# Bíblia técnica — gtc-indexeddb-deep.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `39d0542f9bad4ee59fe1939396e2fb3e41e2c38d`  
> **Agente responsável:** AGENTE 6  
> **Tipo:** teste Jest de integração JSDOM do GTC/IndexedDB/IPC  
> **Linhas textuais:** **311**  
> **Posições documentais:** **312**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`tests/integration/ipc/gtc-indexeddb-deep.test.js` conecta peças reais do pipeline de Global Translation Cache (GTC) em um ambiente controlado: carrega `extension/content/content_manga.js` pelo helper `loadContentScript`, usa `createFingerprintFromDescriptor` real, registra `createGtcRuntimeHandler` real sobre o runtime mock e persiste em um `createIndexedDbRepository` real alimentado por `fake-indexeddb`.

A suíte é mais forte que um teste que reimplementa o algoritmo localmente: as decisões de consulta `GTC_QUERY_MANY`, aplicação de cache hit e persistência `GTC_SAVE` passam pelas implementações de produção dos módulos citados. Ao mesmo tempo, ela **não inicializa o service worker `extension/background.js` completo** e não usa o IndexedDB nativo de Chromium; o “background” é representado pelo handler real registrado diretamente no runtime mock.

## 2. Ambiente e dependências

- `fake-indexeddb/auto` fornece `indexedDB` compatível com a API usada pelo repositório;
- `v8.serialize/deserialize` é fallback de `structuredClone` quando o runtime não o oferece;
- WebCrypto de Node é exposto como `global.crypto`;
- `TextEncoder` de `util` é exposto globalmente;
- `tests/helpers/repo-root.js` encontra a raiz sem depender do cwd;
- `tests/helpers/load-content-script.js` prepara JSDOM, storage, imagens e carrega os módulos reais do content script;
- `tests/mocks/chrome-api.mock.js` fornece `chrome.runtime` e `chrome.storage`;
- `extension/shared/gtc-indexeddb.js` fornece o repositório e o handler IPC reais;
- `extension/shared/gtc-fingerprint.js` fornece o fingerprint real;
- `fs` é importado na linha 15, mas não é utilizado no restante do arquivo;
- `jest.config.js` inclui `tests/integration/**/*.test.js` no projeto `integration`.

## 3. Relação com a implementação real

### 3.1 Consulta do cache

No `content_manga.js`, `queryGlobalTranslationCache` envia `{ action: 'GTC_QUERY_MANY', hashes }` e aceita `entriesByHash` quando a resposta é `ok`. O teste registra `createGtcRuntimeHandler({ repository })`, cujo branch `GTC_QUERY_MANY` chama `repository.getMany(...)` e responde de forma assíncrona pelo runtime mock.

Assim, o cenário de cache hit prova uma cadeia real:

`content_manga.js → chrome.runtime.sendMessage → createGtcRuntimeHandler → createIndexedDbRepository → resposta IPC → content_manga.js → DOM`.

### 3.2 Persistência de UPDATE_IMAGE

O helper `context.sendMessage` injeta uma mensagem no listener real do content script, simulando `chrome.tabs.sendMessage`. Ao receber `UPDATE_IMAGE`, `content_manga.js` usa o `origHash` da imagem e chama o salvamento GTC; esse salvamento emite `GTC_SAVE` pelo runtime mock, que é tratado por `createGtcRuntimeHandler` e gravado no repositório IndexedDB.

O teste então consulta **o mesmo repositório** com `repository.getMany([hash])` e exige o `translatedDataUrl` persistido.

### 3.3 Fingerprint

`createFingerprintFromDescriptor` usa a implementação real de `gtc-fingerprint.js`. O primeiro cenário mantém dimensões e amostra visual iguais, muda URL/extensão e prova hash igual quando `hasVisualPixels=true`; no fallback sem pixels, URLs diferentes geram hashes diferentes.

Isso prova o contrato do **descritor de fingerprint**. Não prova captura/decodificação real de pixels de PNG/JPEG pelo navegador.

## 4. Cenários e força das assertions

### 4.1 Colisão visual controlada

Assertions:
- `expect(pngHash).toBe(jpgHash)`;
- `expect(fallbackHashA).not.toBe(fallbackHashB)`.

**Classificação:** ✅ PROVADO DIRETAMENTE para o descritor real de fingerprint.

### 4.2 Cache hit por IPC

A entrada é semeada por `repository.put`; o content script real consulta o runtime e restaura a imagem.

Assertions provam diretamente:
- exatamente uma `GTC_QUERY_MANY`;
- hashes consultados iguais a `[hash]`;
- zero `START_BATCH`;
- zero lookup legado `storage.local` em chaves `gtc_*`;
- `src` traduzido;
- `data-translated="true"`;
- preservação de `data-reactid`, `data-v-app`, `aria-label` e `className`.

**Classificação:** ✅ PROVADO DIRETAMENTE para o pipeline real do content script + handler/repositório reais no ambiente JSDOM/fake-indexeddb.

### 4.3 UPDATE_IMAGE → IndexedDB

O teste injeta `mangaIndex` e `origHash`, dispara o listener real de `UPDATE_IMAGE`, espera a gravação e lê do repositório.

Assertion:
- `expect(entries[hash]).toBe(translated)`.

**Classificação:** ✅ PROVADO DIRETAMENTE para a persistência pelo content script real até o repositório real do módulo GTC sobre fake-indexeddb.

### 4.4 Lote de 50 cache hits

O teste cria 50 hashes/entradas, carrega 50 imagens e exige:
- 50 imagens marcadas `data-translated="true"`;
- `elapsedMs < 1000`;
- `global.fetch` nunca chamado;
- zero `START_BATCH`;
- exatamente uma `GTC_QUERY_MANY`;
- 50 hashes nessa consulta;
- UI contendo `TRADUZIR 50`.

**Classificação funcional:** ✅ PROVADO DIRETAMENTE no harness atual.  
**Classificação da meta “<200 ms”:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a assertion aceita até **999,999… ms**, não 200 ms.

## 5. Evidência automatizada examinada

| Propriedade | Evidência atual | Classificação |
|---|---|---|
| arquivo pertence ao projeto Jest integration | `jest.config.js` usa `tests/integration/**/*.test.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| mesmo blob do teste estava no CI #36577447500 | blob no commit do run = `39d054...` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| jobs Unit + Integration Node 20/22 terminaram verdes nesse run | jobs 109437162616 e 109437162754 | 🟨 EXECUTADO INDIRETAMENTE |
| job Code Coverage terminou verde | job 109437162502 | 🟨 EXECUTADO INDIRETAMENTE |
| job Windows Portability terminou verde | job 109437162789 | 🟨 EXECUTADO INDIRETAMENTE |
| pixels iguais + URLs diferentes produzem mesmo hash visual | assertions linhas 156–157 | ✅ PROVADO DIRETAMENTE |
| fallback sem pixels diferencia URLs | assertion linha 157 | ✅ PROVADO DIRETAMENTE |
| cache hit passa por GTC_QUERY_MANY uma vez | linhas 206–207 | ✅ PROVADO DIRETAMENTE |
| cache hit evita START_BATCH | linha 208 | ✅ PROVADO DIRETAMENTE |
| cache hit evita lookup legacy gtc_* | linha 209 | ✅ PROVADO DIRETAMENTE |
| atributos de framework sobrevivem à restauração | linhas 211–216 | ✅ PROVADO DIRETAMENTE |
| UPDATE_IMAGE persiste por hash | linha 251 | ✅ PROVADO DIRETAMENTE |
| 50 hits restauram sem fetch e sem Gemini | linhas 293–309 | ✅ PROVADO DIRETAMENTE no harness |
| 50 hits restauram em menos de 200 ms | código exige apenas `elapsedMs < 1000` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| benchmark representa Chromium + IndexedDB nativo + imagens pesadas reais | JSDOM, fake-indexeddb, data URLs pequenas e MutationObserver no-op | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| service worker completo registra/roteia o handler GTC | handler é registrado diretamente pelo teste | 🟨 EXECUTADO INDIRETAMENTE por outras superfícies; não provado por este arquivo |

## 6. Limitações e riscos de interpretação

1. A frase da linha 11 e o nome do teste da linha 254 dizem **menos de 200 ms**, porém a única assertion temporal é `toBeLessThan(1000)`.
2. As “50 imagens pesadas” não contêm payloads pesados: `makeDataUrl('translated-N')` gera poucos bytes codificados em base64. As dimensões 800×1200 são metadados no DOM; JSDOM não decodifica uma imagem pesada real.
3. O benchmark usa `fake-indexeddb` e substitui `MutationObserver` por uma classe no-op, reduzindo trabalho que existiria no navegador real.
4. `global.fetch = jest.fn()` e a ausência de `START_BATCH` provam as duas superfícies observadas, mas “sem tráfego externo” deve ser interpretado dentro do harness, não como monitoramento geral de rede do navegador.
5. O teste registra `createGtcRuntimeHandler` diretamente; portanto não prova que `background.js` completo tenha registrado o handler corretamente.
6. `context.sendMessage` chama os listeners do runtime mock diretamente para simular uma mensagem de tab; essa parte não testa serialização/dispatch real do Chrome.
7. O banco usa nome aleatório por teste e não há `clear`/delete explícito no `afterEach`; em fake-indexeddb isso limita contaminação por nome, mas mantém bancos até o fim do processo.
8. O import `fs` é morto.
9. O primeiro cenário testa descritores de pixels já produzidos, não o processo de extração de pixels de uma imagem real.
10. O timeout de `waitFor` é um mecanismo do harness; passar dentro dele não define uma SLA do produto.

## 7. Invariantes documentadas

1. Um hit SHA-256 válido deve ser resolvido por `GTC_QUERY_MANY` antes do fallback legado.
2. Um hit completo não deve iniciar `START_BATCH`.
3. Aplicar tradução do cache não deve destruir atributos relevantes do elemento original.
4. `UPDATE_IMAGE` com `origHash` válido deve persistir a tradução no GTC.
5. Para descritores com pixels válidos, URL/formato não devem alterar o fingerprint quando dimensões e amostra visual são idênticas.
6. Sem pixels, a URL limpa participa do fallback e pode diferenciar fingerprints.
7. O lote de 50 hits deve ser consultado em uma única mensagem `GTC_QUERY_MANY`.
8. Evidência de performance deve refletir exatamente o limite que a assertion executável impõe; comentários/títulos não elevam a força da prova.
9. A validade desta Bíblia depende do SHA `39d0542f9bad4ee59fe1939396e2fb3e41e2c38d`.

## 8. Solicitações ao auditor

### 111-001 — PERFORMANCE_ASSERTION_GAP — OPEN

**Encontrado:** o contrato textual afirma “menos de 200ms”, mas a assertion aceita `elapsedMs < 1000`.  
**Arquivo relacionado:** `tests/integration/ipc/gtc-indexeddb-deep.test.js`.  
**Evidência atual:** linha 304 usa `toBeLessThan(1000)`.  
**Evidência ausente:** falha executável quando o tempo é >=200 ms.  
**Necessário:** decidir a meta real. Se 200 ms for requisito, alinhar a assertion/ambiente em alteração separada; se 1000 ms for o limite correto, alinhar nome/comentário.  
**Risco:** regressões entre 200 e 999 ms permanecem verdes enquanto a documentação do teste promete 200 ms.  
**Severidade:** HIGH.

### 111-002 — PERFORMANCE_BENCHMARK_REVIEW — OPEN

**Encontrado:** o cenário “50 imagens pesadas” usa strings data URL pequenas, JSDOM, fake-indexeddb e MutationObserver no-op.  
**Arquivo relacionado:** `tests/integration/ipc/gtc-indexeddb-deep.test.js`.  
**Evidência atual:** o harness prova 50 hits e mede tempo dentro desse ambiente sintético.  
**Evidência ausente:** benchmark de Chromium/IndexedDB nativo com payloads representativos e observação de custo real de DOM/imagem.  
**Necessário:** decidir se o teste é apenas regressão de performance relativa do harness ou SLA de produto; se SLA, criar benchmark separado e estável no ambiente apropriado.  
**Risco:** o teste pode permanecer rápido enquanto a experiência real degrada, ou flutuar por carga do runner sem representar o produto.  
**Severidade:** NORMAL.

### 111-003 — RESOURCE_CLEANUP — OPEN

**Encontrado:** cada `beforeEach` cria um banco com nome único, mas o `afterEach` não chama `repository.clear()` nem apaga o database; `fs` também é importado sem uso.  
**Arquivo relacionado:** `tests/integration/ipc/gtc-indexeddb-deep.test.js`.  
**Evidência atual:** nomes únicos impedem reutilização acidental entre os quatro casos, mas os bancos ficam vivos durante o processo.  
**Evidência ausente:** prova de cleanup explícito/lifecycle e necessidade do import `fs`.  
**Necessário:** avaliar cleanup explícito do banco/fixture e remover import morto em alteração separada se apropriado.  
**Risco:** crescimento de estado em execuções longas/isoladas repetidas e ruído de manutenção; impacto atual baixo.  
**Severidade:** LOW.

## 9. Fonte integral auditada

```javascript
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
 * 5. Restauração de 50 imagens ocorre em menos de 200ms e sem tráfego externo
 */

const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const { TextEncoder } = require('util');
const crypto = require('crypto');

if (typeof global.structuredClone !== 'function') {
    Object.defineProperty(global, 'structuredClone', {
        value: (value) => v8.deserialize(v8.serialize(value)),
        configurable: true,
    });
}

require('fake-indexeddb/auto');

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
    let runtimeMock;
    let repository;
    let sendMessageSpy;
    let storageGetSpy;
    let originalMutationObserver;

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

        repository = createIndexedDbRepository({
            dbName: `gtc-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        });

        runtimeMock.onMessage.addListener(createGtcRuntimeHandler({ repository }));

        sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        storageGetSpy = jest.spyOn(global.chrome.storage.local, 'get');
        global.fetch = jest.fn();
    });

    afterEach(() => {
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

    test('restaura 50 imagens pesadas em menos de 200ms e sem tráfego externo', async () => {
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

        expect(elapsedMs).toBeLessThan(1000);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(startBatchMessages).toHaveLength(0);
        expect(queryMessages).toHaveLength(1);
        expect(queryMessages[0].hashes).toHaveLength(50);
        expect(context.getMainContent().textContent).toContain('TRADUZIR 50');
    });
});
```

## 10. Cobertura de todas as posições

Os blocos abaixo são contíguos e cobrem **1–312 sem lacunas**.

| Posições | Função técnica | Evidência |
|---|---|---|
| 1–13 | cabeçalho, objetivos declarados e separador inicial | 🟦 contrato documental; objetivo temporal é confrontado com a assertion real |
| 14–19 | imports Node; `fs` fica sem uso | 🟨 setup executado; import morto sem prova comportamental |
| 20–28 | fallback de `structuredClone` e ativação de fake-indexeddb | 🟨 executado conforme capacidades do runtime; branch do fallback não tem assertion isolada |
| 29–31 | localização da raiz do repositório | 🟨 dependência de setup |
| 32–37 | instalação de WebCrypto e TextEncoder globais | 🟨 setup necessário ao fingerprint |
| 38–42 | carregamento dos helpers e módulos reais de produção | 🟦 wiring específico + execução pelos cenários |
| 43–52 | `cleanUrl`: null/data, URL válida e fallback por split | 🟨 caminho válido usado; branches null/data/erro não têm assertion focal nesta suíte |
| 53–62 | `buildJsdomFallbackHash` monta descritor sem pixels | ✅ resultado é usado em assertions/persistência; campos internos participam diretamente |
| 63–66 | `makeDataUrl` gera fixtures data URL pequenas | 🟨 usado nos cenários; não prova imagem pesada/decodificação |
| 67–78 | polling `waitFor` com timeout | 🟨 exercitado nos cenários; branch de timeout não possui assertion específica |
| 79–85 | abertura do `describe` e referências mutáveis | 🟨 estrutura do harness |
| 86–110 | `beforeEach`: reset listeners, MutationObserver no-op, repositório único, handler, spies e fetch mock | 🟨 setup executado por todos os testes; vários detalhes não têm assertion isolada |
| 111–120 | `afterEach`: restauração de mocks/globals/DOM | 🟨 cleanup executado; ausência de cleanup do banco é lacuna registrada |
| 121–159 | cenário de fingerprint visual versus fallback por URL | ✅ linhas 156–157 são assertions diretas |
| 160–218 | cenário de cache hit por IPC, ausência de START_BATCH/legacy e preservação de atributos | ✅ assertions 206–216 diretamente ligadas ao pipeline real |
| 219–253 | cenário `UPDATE_IMAGE` até persistência e leitura do IndexedDB | ✅ assertion 251 prova a gravação final |
| 254–311 | cenário de 50 hits, medição, ausência de fetch/Gemini e cardinalidade da query | ✅ funcionalmente; ⚠️ limite de 200 ms não é provado porque a linha 304 exige apenas <1000 ms |
| 312 | newline final | 🟦 posição estrutural explicitamente contabilizada |

## 11. Verificação documental final

- SHA reconfirmado contra o branch antes da escrita: **sim**;
- fonte integral incorporada: **sim**;
- posições documentadas: **312/312**;
- faixas contíguas sem buracos: **sim**;
- implementação real distinguida de mocks/harness: **sim**;
- prova direta distinguida de gate estático/execução indireta/lacuna: **sim**;
- problemas externos não foram corrigidos para fabricar evidência: **sim**;
- solicitações ao auditor abertas: **3**;
- `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md`, código, testes, fixtures e configs externos permaneceram somente leitura para AGENTE 6.

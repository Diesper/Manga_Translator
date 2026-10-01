# Bíblia técnica — tests/unit/content-manga/auto-restorer-real.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `cf792733e62f4b787073f1f7257e2701d29547a6`  
> **Agente responsável:** AGENTE 5  
> **Tipo:** suíte Jest/JSDOM que carrega a implementação real de `content_manga.js` e módulos auxiliares  
> **Linhas textuais do fonte:** 440  
> **Posições documentais:** 441, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Esta suíte é a principal prova comportamental real do Auto-Restore no content script. Diferentemente de `tests/unit/content-manga/auto-restore-system.test.js`, ela não reimplementa um mirror local do algoritmo: usa `loadContentScript()` e, por meio dele, carrega os módulos reais `gtc-fingerprint.js`, `cm-gtc-client.js`, `cm-dom-replace.js`, `cm-chapter.js`, `cm-auto-restore.js` e `content_manga.js` em JSDOM.

O arquivo verifica quatro famílias de contrato:

1. restauração automática de imagens a partir do `restoreMap` legado;
2. reação do `MutationObserver` a alteração de `src` e inserção tardia de `<img>`;
3. políticas de habilitação/bloqueio global, por site e por imagem;
4. integração de handlers reais de `content_manga.js`, especialmente `UPDATE_IMAGE` e `GET_PAGE_IMAGES`.

Além disso, há duas provas específicas de canonicalização visual (`preview.redd.it` → `i.redd.it` e remoção de sufixo de tamanho do Imgur) e um cenário de corrida REG-10.

## 2. Ambiente de execução e wiring

- `jest.config.js` inclui `tests/unit/content-manga/**/*.test.js` no projeto `content-scripts` com ambiente `jsdom`.
- `package.json#test:unit:content` executa `jest --config jest.config.js --selectProjects content-scripts`.
- `tests/helpers/load-content-script.js` prepara `window.location`, storage, DOM sintético e dimensões naturais, limpa a flag de idempotência e carrega os scripts reais na ordem de dependência.
- `tests/mocks/chrome-api.mock.js` fornece `chrome.storage.local`, `chrome.runtime` e listeners stateful usados pelo teste.
- a suíte injeta `crypto.webcrypto` e `TextEncoder` no escopo global antes do carregamento do content script.

### Ordem real carregada pelo helper

`gtc-fingerprint.js` → `cm-gtc-client.js` → `cm-dom-replace.js` → `cm-chapter.js` → `cm-auto-restore.js` → `content_manga.js`.

Isso é relevante porque `content_manga.js` exige explicitamente `window.MangaTranslatorAutoRestore` antes de criar o `autoRestorer` real.

## 3. Evidência de execução automatizada

Existe prova de execução verde da mesma versão deste arquivo no GitHub Actions:

- workflow run: `36577447500`;
- head commit do run: `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`;
- job: `109437162616` — **Unit + Integration (20.x)** — `success`;
- o blob de `tests/unit/content-manga/auto-restorer-real.test.js` nesse commit é exatamente `cf792733e62f4b787073f1f7257e2701d29547a6`, idêntico ao SHA auditado atual;
- o log registra `PASS content-scripts tests/unit/content-manga/auto-restorer-real.test.js` e lista nominalmente os 11 casos abaixo como aprovados.

Portanto, para as propriedades realmente afirmadas pelas expectations, há execução automatizada da implementação real, não apenas inspeção estática.

## 4. Helpers locais

### `delay(ms)` — linhas 18–20

Wrapper mínimo de `setTimeout` usado apenas para esperas assíncronas. Não possui cancelamento nem diagnóstico próprio.

### `waitFor(assertion, options)` — linhas 22–30

Polling por `performance.now()` com timeout padrão de 3 s e intervalo de 20 ms. Executa a callback até receber valor truthy; se nada ocorrer, lança `Timeout aguardando condicao`.

Ele é usado para esperar efeitos positivos observáveis no DOM/storage. Os testes negativos de configuração, porém, usam `delay(250)` fixo em vez deste helper.

### `getContentListener(runtimeMock)` — linhas 32–38

Exige exatamente um listener registrado em `runtimeMock._messageListeners`. Se houver zero ou mais de um, falha imediatamente com diagnóstico contendo a contagem.

### `dispatchToContent(...)` — linhas 40–55

Invoca diretamente o listener real de `chrome.runtime.onMessage`, captura o retorno booleano de keep-alive e o payload de `sendResponse`. Se o listener não retornar `true` e ainda não tiver respondido, resolve com `response: undefined`.

Limitação: quando `keepAlive === true` e `sendResponse` nunca ocorre, o helper não possui timeout próprio; nesse caso a proteção passa a ser o timeout global do Jest.

### `defineImageMetrics(...)` — linhas 57–61

Define `naturalWidth`, `naturalHeight` e `complete` em imagens criadas depois do `loadContentScript`, compensando a ausência de layout/carregamento real no JSDOM.

## 5. Setup e teardown

### `beforeEach` — linhas 68–94

O setup:

- reseta módulos Jest;
- obtém as instâncias de runtime/storage mock;
- preserva o método original de `storageMock.get`;
- zera listeners de message/connect e `runtime.lastError`;
- substitui `runtimeMock.sendMessage` por stub assíncrono;
- responde especialmente `GTC_SAVE` e `DOWNLOAD_IMAGE`;
- limpa storage, flags globais e DOM.

### `afterEach` — linhas 96–103

Restaura `storageMock.get`, mocks Jest, storage e DOM. Isso evita que a monkey-patch usada pelo REG-10 vaze para outros casos.

## 6. Casos de teste e força probatória

### 6.1 Restore imediato por clean URL — linhas 105–129

O storage recebe um capítulo e `restoreMap` com a chave limpa `http://localhost/page-0.png`. O DOM recebe a mesma imagem com querystring `?token=abc`.

Assertions:

- espera `data-translated="true"`;
- exige `src` final igual ao Data URL armazenado.

**Classificação:** ✅ PROVADO DIRETAMENTE. A implementação real canonicaliza a URL e aplica a substituição.

### 6.2 MutationObserver em mudança de `src` — linhas 131–156

A página começa com `placeholder.png`; depois o `src` é trocado para `lazy-page.png?cache=bypass`, cuja clean URL existe no mapa.

Assertions:

- espera marca de traduzida;
- exige Data URL final exato.

**Classificação:** ✅ PROVADO DIRETAMENTE. O observer real de `cm-auto-restore.js` reage à mutação de atributo.

### 6.3 Imagem inserida depois da inicialização — linhas 158–184

O content script inicia sem imagens. Depois o teste cria `<img id="late-image">`, define métricas e o adiciona ao `body`.

Assertions:

- espera `dataset.translated === 'true'`;
- exige substituição pelo Data URL esperado.

**Classificação:** ✅ PROVADO DIRETAMENTE. O observer real reage a `childList`/`subtree`.

### 6.4 REG-10 — UPDATE_IMAGE durante inicialização — linhas 186–243

O teste injeta atraso de 180 ms somente no `storage.get([chapterId_restoreMap])`, carrega o content script, envia `UPDATE_IMAGE`, espera a entrada aparecer no `restoreMap`, adiciona uma imagem futura com a mesma clean URL e exige auto-restore para o Data URL recém-entregue.

Propriedade final efetivamente comprovada: uma entrada criada por `UPDATE_IMAGE` alimenta futuras restaurações mesmo durante o período de inicialização.

**Classificação da propriedade final:** ✅ PROVADO DIRETAMENTE.

**Classificação da alegação temporal literal “antes do fim da inicialização”:** 🟨 EXECUTADO/INDUZIDO, MAS NÃO PROVADO DE FORMA DETERMINÍSTICA. Não existe latch/assertion que confirme que o `get` atrasado ainda está pendente no instante do `UPDATE_IMAGE`; o teste depende de 180 ms e do tempo gasto por `loadContentScript()`.

### 6.5 `autoRestoreEnabled=false` — linhas 245–270

Prepara mapa válido, mas desliga a feature globalmente. Após o carregamento, espera 250 ms.

Assertions:

- imagem não ganha `data-translated`;
- `src` original permanece intacto.

**Classificação:** ✅ PROVADO DIRETAMENTE dentro da janela observada. Há ressalva de robustez por ser uma prova negativa baseada em espera fixa.

### 6.6 site bloqueado — linhas 272–297

`autoRestoreDisabledSites: ['localhost']` bloqueia somente o host corrente.

Assertions idênticas ao caso anterior: sem flag traduzida e `src` original preservado.

**Classificação:** ✅ PROVADO DIRETAMENTE dentro da janela observada, com a mesma ressalva temporal.

### 6.7 imagem bloqueada sem bloquear UPDATE_IMAGE manual — linhas 299–340

A clean URL aparece em `autoRestoreBlockedImages` e no `restoreMap`. O auto-restore não pode atuar; depois o teste prepara `mangaIndex`/`origHash` e envia `UPDATE_IMAGE` manual.

Assertions:

- fase automática: imagem continua original e não traduzida;
- fase manual: imagem passa a `data-translated="true"` e recebe o novo Data URL.

**Classificação:** ✅ PROVADO DIRETAMENTE. O bloqueio é específico do auto-restore e não impede a entrega manual.

### 6.8 canonicalização Reddit — linhas 342–369

O `restoreMap` usa `https://i.redd.it/7g1u3dqswqyg1.png`, enquanto o DOM usa uma URL `preview.redd.it/...-7g1u3dqswqyg1.png?...`.

`cm-dom-replace.js` converte `preview.redd.it`/`external-preview.redd.it` para `i.redd.it`.

**Classificação:** ✅ PROVADO DIRETAMENTE pela substituição final.

### 6.9 canonicalização Imgur — linhas 371–394

O mapa usa `abc1234.jpg`, enquanto o DOM usa `abc1234m.jpg?...`. A canonicalização remove o sufixo de tamanho do Imgur antes da consulta.

**Classificação:** ✅ PROVADO DIRETAMENTE pela substituição final.

### 6.10 `GET_PAGE_IMAGES` com todas as candidatas banidas — linhas 396–418

O helper inicializa três imagens válidas dimensionalmente e registra todas no array `bannedImages` do hostname.

Assertion exata:

`{ images: [], total: 0 }`.

**Classificação:** ✅ PROVADO DIRETAMENTE. O handler real lê `bannedImages_<hostname>`, aplica `getScanEligibleImages()` e responde vazio.

### 6.11 `UPDATE_IMAGE` com índice inexistente — linhas 420–439

O teste envia `UPDATE_IMAGE` para índice 99 quando existe apenas uma imagem sem `data-manga-index=99`.

Assertions reais:

- após 100 ms, não existe chave de storage cujo nome termine em `_images`;
- a imagem presente no DOM continua sem `data-translated="true"`.

O título do teste, porém, diz também “não cria estado de capítulo”. Essa parte não é provada. A implementação de `content_manga.js` trata imagem ausente no DOM como resultado que **não deve ser perdido** e chama `persistTranslatedPage(request.index, request.newSrc)`. `cm-chapter.js#persistTranslatedPage` começa por `getOrCreateChapterId()`, usa `SM_SAVE_PAGE` e pode criar/atualizar `chapterList` sem criar a chave legado `*_images`.

**Classificação da não alteração do DOM:** ✅ PROVADO DIRETAMENTE.

**Classificação da ausência de chave legado `*_images`:** ✅ PROVADO DIRETAMENTE na janela de 100 ms.

**Classificação de “não cria estado de capítulo”:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO / CLAIM MAIS AMPLO QUE A ASSERTION.

## 7. Relação com a implementação real

### `cm-auto-restore.js`

O módulo real:

- carrega `autoRestoreEnabled`, `autoRestoreDisabledSites` e `autoRestoreBlockedImages`;
- mantém `restoreMap` interno;
- varre `img:not([data-translated="true"])`;
- canonicaliza pela dependência `getCleanUrl`;
- observa `childList`, `subtree` e atributos `src`, `data-src`, `data-lazy`;
- usa debounce de 150 ms;
- prefere índice/bridge de storage e faz fallback para `${chapterId}_restoreMap` legado;
- expõe `setEntry`, usado para incorporar traduções novas no mapa.

A suíte #194 prova vários desses caminhos por efeito observável, mas não todos.

### `content_manga.js` — `UPDATE_IMAGE`

Quando encontra a imagem pelo `data-manga-index`, aplica substituição, atualiza GTC quando há fingerprint e persiste a página. Quando não encontra a imagem, a implementação registra `UPDATE_IMAGE_NO_DOM` e chama `persistTranslatedPage()` mesmo assim.

Isso é a razão pela qual o último nome de teste deve ser interpretado com cuidado: “não alterou a imagem/legacy `_images`” não equivale a “nenhum estado de capítulo foi criado”.

### `content_manga.js` — `GET_PAGE_IMAGES`

O handler consulta `bannedImages_<hostname>`, filtra candidatas com `getScanEligibleImages` e retorna `{ images, total }`. O caso 396–418 prova diretamente o resultado vazio quando todas as candidatas estão banidas.

## 8. Matriz consolidada de evidência

| Propriedade | Evidência neste arquivo | Classificação |
|---|---|---|
| restore inicial por clean URL | caso 105–129 + CI verde | ✅ PROVADO DIRETAMENTE |
| observer reage a `src` | caso 131–156 + CI verde | ✅ PROVADO DIRETAMENTE |
| observer reage a nó novo | caso 158–184 + CI verde | ✅ PROVADO DIRETAMENTE |
| entrada de UPDATE_IMAGE alimenta restore futuro | caso 186–243 + CI verde | ✅ PROVADO DIRETAMENTE |
| UPDATE_IMAGE ocorreu necessariamente antes do fim da inicialização | atraso fixo, sem latch | 🟨 EXECUTADO/INDUZIDO; temporalidade não garantida |
| global off bloqueia auto-restore | caso 245–270 | ✅ PROVADO DIRETAMENTE, janela temporal |
| site off bloqueia auto-restore | caso 272–297 | ✅ PROVADO DIRETAMENTE, janela temporal |
| imagem bloqueada não auto-restaura | caso 299–329 | ✅ PROVADO DIRETAMENTE, janela temporal |
| UPDATE_IMAGE manual ignora bloqueio de auto-restore | caso 330–339 | ✅ PROVADO DIRETAMENTE |
| Reddit preview converge para i.redd.it | caso 342–369 | ✅ PROVADO DIRETAMENTE |
| Imgur remove sufixo de tamanho | caso 371–394 | ✅ PROVADO DIRETAMENTE |
| todas banidas → GET_PAGE_IMAGES vazio | caso 396–418 | ✅ PROVADO DIRETAMENTE |
| índice inexistente não altera DOM | caso 420–439 | ✅ PROVADO DIRETAMENTE |
| índice inexistente não cria `*_images` legado | caso 420–439 | ✅ PROVADO DIRETAMENTE na janela observada |
| índice inexistente não cria qualquer estado de capítulo | nenhuma assertion de `chapterList`/SM_SAVE_PAGE/bridge | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| wiring no projeto `content-scripts` | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| execução automatizada dos 11 casos | run 36577447500 / job 109437162616 / mesmo blob | ✅ PROVADO DIRETAMENTE |

## 9. Limitações de cobertura

Esta suíte não deve ser interpretada como prova exaustiva de todos os branches de `cm-auto-restore.js`. Entre os caminhos não isolados aqui estão:

- `isTranslating()` interrompendo restauração;
- guard `running` contra reentrância;
- `resolveAsset()` retornando vazio/falhando;
- branch visual específico de backdrop/blur;
- `isActive()` ficando falso durante aplicação;
- reconfiguração dinâmica via `chrome.storage.onChanged`;
- falha best-effort capturada pelo `catch` do `initialize()`;
- comportamento de disconnect/reinitialize isolado;
- caminho IndexedDB/`SM_RESTORE_INDEX` como prova focal (os cenários desta suíte dependem do fallback legado).

Essas ausências não invalidam as provas existentes; apenas delimitam o que #194 realmente garante.

## 10. Solicitações ao auditor

### 194-001 — TEST_ASSERTION_MISMATCH — OPEN

**Encontrado:** o teste “UPDATE_IMAGE para indice inexistente nao quebra e nao cria estado de capitulo” verifica somente ausência de chave `*_images` e ausência de mutação visual.

**Evidência atual:** `content_manga.js` chama `persistTranslatedPage()` quando a imagem não está no DOM; `persistTranslatedPage()` chama `getOrCreateChapterId()`, `SM_SAVE_PAGE` e consulta `chapterList`.

**Evidência ausente:** assertions sobre `chapterList`, chamada `SM_SAVE_PAGE`, ACK/persistência e qualquer outra representação de estado de capítulo.

**Por que é insuficiente:** ausência de `_images` legado não prova ausência de estado no contrato atual de storage.

**Ação solicitada:** revisar o contrato desejado. Se a persistência sem DOM é correta, renomear/reformular o teste para afirmar que o resultado é persistido sem alterar DOM e verificar `SM_SAVE_PAGE`/`chapterList`/ACK. Se a intenção era descartar índice inexistente, isso conflita com a implementação e exige decisão funcional separada.

**Evidência esperada:** assertions específicas sobre o efeito de persistência decidido, usando a implementação real.

**Possível regressão:** a suíte pode continuar verde enquanto a persistência de resultados sem DOM quebra, ou pode induzir manutenção a “corrigir” um comportamento intencional por causa de um nome desatualizado.

**Impacto:** contrato de entrega/persistência de traduções quando o nó original já saiu do DOM.

**Severidade:** HIGH.

### 194-002 — TEST_DETERMINISM — OPEN

**Encontrado:** REG-10 usa atraso cronológico de 180 ms para tentar manter a leitura de restoreMap em aberto, mas não possui latch/assertion provando que a inicialização ainda está pendente quando `UPDATE_IMAGE` é enviado.

**Evidência atual:** no run 36577447500 o caso passou em 373 ms e o efeito final foi correto.

**Evidência ausente:** sincronização determinística que mantenha o `storage.get` bloqueado até depois do dispatch e prove explicitamente a ordem dos eventos.

**Por que é insuficiente:** em ambiente lento, `loadContentScript()` pode demorar o bastante para os 180 ms expirarem antes do dispatch; o teste ainda pode passar sem exercer a corrida que o nome promete.

**Ação solicitada:** substituir o atraso fixo por uma Promise/latch controlada pelo teste; confirmar que a leitura está pendente, enviar UPDATE_IMAGE, depois liberar a leitura e validar o restore futuro.

**Evidência esperada:** ordem causal explicitamente assertada, independente da velocidade da máquina.

**Possível regressão:** a proteção REG-10 pode virar falso positivo temporal.

**Impacto:** confiança na regressão de inicialização concorrente.

**Severidade:** NORMAL.

### 194-003 — TEST_ROBUSTNESS — OPEN

**Encontrado:** os três casos negativos de configuração (global off, site off, imagem bloqueada) provam ausência de efeito por `delay(250)` fixo.

**Evidência atual:** todos passaram no CI no mesmo blob, com durações aproximadas de 274–283 ms.

**Evidência ausente:** um sinal determinístico de que a configuração foi carregada e o restaurador teve oportunidade completa de agir antes da assertion negativa.

**Por que é insuficiente:** ausência observada antes de uma janela temporal não é tão forte quanto sincronizar explicitamente com o estado pronto do restaurador.

**Ação solicitada:** se a suíte expuser ou puder observar um marco estável de inicialização, usá-lo antes de afirmar ausência; alternativamente introduzir helper de prontidão no harness em alteração separada.

**Evidência esperada:** assertion negativa após condição de prontidão verificável, não apenas após sono fixo.

**Possível regressão:** uma inicialização muito mais lenta pode fazer um bloqueio quebrado parecer correto.

**Impacto:** robustez/flakiness da prova negativa.

**Severidade:** NORMAL.

## 11. Fonte integral auditada

```js
const path = require('path');
const fs = require('fs');
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
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 3000, interval = 20 } = {}) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condicao');
}

function getContentListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do content_manga, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToContent(runtimeMock, request, sender = { tab: { id: 1 } }) {
    return new Promise((resolve) => {
        let settled = false;
        let keepAlive = false;

        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = getContentListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive !== true && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

function defineImageMetrics(img, { width = 800, height = 1200, complete = true } = {}) {
    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true, writable: true });
    Object.defineProperty(img, 'complete', { value: complete, configurable: true, writable: true });
}

describe('REG-04/REG-05/REG-10/CM-94/CM-95/CM-96/CM-97/CM-98/CM-107b/CM-116: content_manga.js - auto restore real', () => {
    let runtimeMock;
    let storageMock;
    let originalStorageGet;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        originalStorageGet = storageMock.get.bind(storageMock);

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        runtimeMock.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'GTC_SAVE' && callback) {
                setTimeout(() => callback({ ok: true }), 0);
                return;
            }
            if (message.action === 'DOWNLOAD_IMAGE' && callback) {
                setTimeout(() => callback({ filePath: 'C:/tmp/page.png', downloadId: 41 }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        storageMock.get = originalStorageGet;
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('aplica restoreMap imediatamente na inicializacao quando a clean URL bate', async () => {
        const chapterId = 'chap_auto_restore_1';
        await storageMock.set({
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'http://localhost/page-0.png': 'data:image/png;base64,UkVTVE9SRURfT0s=',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png?token=abc', width: 800, height: 1200 },
            ],
        });

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');

        const img = document.querySelector('[data-testid="img-0"]');
        expect(img.getAttribute('src')).toBe('data:image/png;base64,UkVTVE9SRURfT0s=');
    });

    test('observer reaplica a traducao quando o src muda para uma clean URL conhecida', async () => {
        const chapterId = 'chap_auto_restore_2';
        await storageMock.set({
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'http://localhost/lazy-page.png': 'data:image/png;base64,UkVTVE9SRV9MQVpZ',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/placeholder.png', width: 800, height: 1200 },
            ],
        });

        document.querySelector('[data-testid="img-0"]').setAttribute('src', 'http://localhost/lazy-page.png?cache=bypass');

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');

        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe('data:image/png;base64,UkVTVE9SRV9MQVpZ');
    });

    test('observer restaura imagens novas adicionadas ao DOM apos a inicializacao', async () => {
        const chapterId = 'chap_auto_restore_3';
        await storageMock.set({
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'http://localhost/new-page.png': 'data:image/png;base64,TkVXX1JFU1RPUkU=',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [],
        });

        const newImg = document.createElement('img');
        newImg.id = 'late-image';
        newImg.src = 'http://localhost/new-page.png?nonce=42';
        defineImageMetrics(newImg);
        document.body.appendChild(newImg);

        await waitFor(() => document.getElementById('late-image').dataset.translated === 'true');
        expect(document.getElementById('late-image').getAttribute('src')).toBe('data:image/png;base64,TkVXX1JFU1RPUkU=');
    });

    test('regressao REG-10: UPDATE_IMAGE antes do fim da inicializacao ainda alimenta restauracoes futuras', async () => {
        const chapterId = 'chap_auto_restore_4';
        await storageMock.set({
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {},
        });

        storageMock.get = jest.fn((keys, callback) => {
            const shouldDelayRestoreMap = Array.isArray(keys)
                && keys.length === 1
                && keys[0] === `${chapterId}_restoreMap`;

            if (shouldDelayRestoreMap) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        originalStorageGet(keys, callback).then(resolve);
                    }, 180);
                });
            }
            return originalStorageGet(keys, callback);
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/original-page.png', width: 800, height: 1200 },
            ],
        });

        const originalImg = document.querySelector('[data-testid="img-0"]');
        originalImg.dataset.mangaIndex = '0';
        originalImg.dataset.origHash = 'hash-reg-10';

        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 0,
            newSrc: 'data:image/png;base64,UkVHXzEwX09L',
        });

        await waitFor(async () => {
            const data = await storageMock.get([`${chapterId}_restoreMap`]);
            return data[`${chapterId}_restoreMap`]
                && data[`${chapterId}_restoreMap`]['http://localhost/original-page.png'];
        });

        const futureImg = document.createElement('img');
        futureImg.id = 'future-restore-image';
        futureImg.src = 'http://localhost/original-page.png?late=1';
        defineImageMetrics(futureImg);
        document.body.appendChild(futureImg);

        await waitFor(() => document.getElementById('future-restore-image').dataset.translated === 'true', { timeout: 4000 });
        expect(document.getElementById('future-restore-image').getAttribute('src')).toBe('data:image/png;base64,UkVHXzEwX09L');
    });

    test('autoRestoreEnabled=false impede substituicao automatica global', async () => {
        const chapterId = 'chap_auto_restore_global_off';
        await storageMock.set({
            autoRestoreEnabled: false,
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'http://localhost/page-0.png': 'data:image/png;base64,TkFPTUFJUw==',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png?token=abc', width: 800, height: 1200 },
            ],
        });

        await delay(250);
        const img = document.querySelector('[data-testid="img-0"]');
        expect(img.dataset.translated).not.toBe('true');
        expect(img.getAttribute('src')).toBe('http://localhost/page-0.png?token=abc');
    });

    test('autoRestoreDisabledSites impede auto-substituicao so no site bloqueado', async () => {
        const chapterId = 'chap_auto_restore_site_off';
        await storageMock.set({
            autoRestoreDisabledSites: ['localhost'],
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'http://localhost/page-0.png': 'data:image/png;base64,U0lURV9PRkY=',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png?token=abc', width: 800, height: 1200 },
            ],
        });

        await delay(250);
        const img = document.querySelector('[data-testid="img-0"]');
        expect(img.dataset.translated).not.toBe('true');
        expect(img.getAttribute('src')).toBe('http://localhost/page-0.png?token=abc');
    });

    test('autoRestoreBlockedImages bloqueia imagem especifica sem bloquear traducao manual', async () => {
        const chapterId = 'chap_auto_restore_image_off';
        await storageMock.set({
            autoRestoreBlockedImages: {
                'http://localhost/page-0.png': {
                    cleanUrl: 'http://localhost/page-0.png',
                    host: 'localhost',
                },
            },
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'http://localhost/page-0.png': 'data:image/png;base64,QkxPQ0tFRA==',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png?token=abc', width: 800, height: 1200 },
            ],
        });

        await delay(250);
        const img = document.querySelector('[data-testid="img-0"]');
        expect(img.dataset.translated).not.toBe('true');
        expect(img.getAttribute('src')).toBe('http://localhost/page-0.png?token=abc');

        img.dataset.mangaIndex = '0';
        img.dataset.origHash = 'hash-manual-exception';
        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 0,
            newSrc: 'data:image/png;base64,TUFOVUFMX09L',
        });

        expect(document.querySelector('[data-testid="img-0"]').dataset.translated).toBe('true');
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe('data:image/png;base64,TUFOVUFMX09L');
    });

    test('visual-v4 Solucao A: preview.redd.it restaura pela chave canonica i.redd.it', async () => {
        const chapterId = 'chap_auto_restore_reddit_preview';
        await storageMock.set({
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'https://i.redd.it/7g1u3dqswqyg1.png': 'data:image/png;base64,UkVERElUX09L',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                {
                    src: 'https://preview.redd.it/why-dont-eritreans-7g1u3dqswqyg1.png?width=640&crop=smart&auto=webp&s=token',
                    width: 800,
                    height: 1200,
                },
            ],
        });

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');

        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe('data:image/png;base64,UkVERElUX09L');
    });

    test('visual-v4 Solucao A: imgur remove sufixo de tamanho antes do restoreMap', async () => {
        const chapterId = 'chap_auto_restore_imgur_suffix';
        await storageMock.set({
            chapterList: [{
                id: chapterId,
                url: 'https://localhost/chapter/1',
                title: 'chapter_1',
            }],
            [`${chapterId}_restoreMap`]: {
                'https://i.imgur.com/abc1234.jpg': 'data:image/png;base64,SU1HVVJfT0s=',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'https://i.imgur.com/abc1234m.jpg?width=320&q=80', width: 800, height: 1200 },
            ],
        });

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');

        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe('data:image/png;base64,SU1HVVJfT0s=');
    });

    test('GET_PAGE_IMAGES retorna lista vazia quando todas as imagens validas estao banidas', async () => {
        const banned = [
            'http://localhost/page-0.png',
            'http://localhost/page-1.png',
            'http://localhost/page-2.png',
        ];

        const context = await loadContentScript({
            hostname: 'localhost',
            bannedImages: banned,
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                { src: 'http://localhost/page-1.png', width: 800, height: 1200 },
                { src: 'http://localhost/page-2.png', width: 800, height: 1200 },
            ],
        });

        const response = await context.sendMessage('GET_PAGE_IMAGES');
        expect(response).toEqual({
            images: [],
            total: 0,
        });
    });

    test('UPDATE_IMAGE para indice inexistente nao quebra e nao cria estado de capitulo', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 99,
            newSrc: 'data:image/png;base64,SU5FWElTVEVOVEU=',
        });

        await delay(100);
        const data = await storageMock.get(null);
        const chapterImageKey = Object.keys(data).find((key) => key.endsWith('_images'));
        expect(chapterImageKey).toBeUndefined();
        expect(document.querySelector('[data-testid="img-0"]').dataset.translated).not.toBe('true');
    });
});
```

## 12. Mapa integral por faixas

| Posições | Função documental/técnica |
|---:|---|
| 1–4 | imports Node (`path`, `fs`, `crypto`, `TextEncoder`) |
| 5 | separador |
| 6–7 | localização da raiz do repositório |
| 8 | separador |
| 9–13 | instalação de Web Crypto e TextEncoder globais |
| 14 | separador |
| 15–16 | imports do harness e mocks Chrome |
| 17 | separador |
| 18–20 | helper `delay` |
| 21 | separador |
| 22–30 | helper polling `waitFor` |
| 31 | separador |
| 32–38 | seleção/validação do único listener do content script |
| 39 | separador |
| 40–55 | dispatch direto ao listener runtime |
| 56 | separador |
| 57–61 | injeção de métricas de imagem em JSDOM |
| 62 | separador |
| 63–66 | `describe` principal e variáveis compartilhadas |
| 67 | separador |
| 68–94 | setup por teste |
| 95 | separador |
| 96–103 | teardown por teste |
| 104 | separador |
| 105–129 | restore imediato por clean URL |
| 130 | separador |
| 131–156 | observer para mudança de `src` |
| 157 | separador |
| 158–184 | observer para nó de imagem inserido |
| 185 | separador |
| 186–243 | REG-10: UPDATE_IMAGE durante inicialização e restore futuro |
| 244 | separador |
| 245–270 | bloqueio global do auto-restore |
| 271 | separador |
| 272–297 | bloqueio por site |
| 298 | separador |
| 299–340 | bloqueio por imagem + exceção manual UPDATE_IMAGE |
| 341 | separador |
| 342–369 | canonicalização Reddit |
| 370 | separador |
| 371–394 | canonicalização Imgur |
| 395 | separador |
| 396–418 | GET_PAGE_IMAGES com todas banidas |
| 419 | separador |
| 420–439 | UPDATE_IMAGE para índice inexistente |
| 440 | fechamento do `describe` |
| 441 | newline final do arquivo |

**Cobertura posicional:** 441/441 posições documentadas, sem lacunas.

## 13. Conclusão técnica

#194 é uma suíte de alta relevância porque exercita o runtime real do content manga/auto-restore e possui execução CI verde comprovada no mesmo blob. As dez primeiras famílias de assertions têm boa força probatória sobre efeitos observáveis. A principal divergência documental está no último nome de teste, que afirma ausência ampla de “estado de capítulo” sem medir o storage moderno; a implementação, na verdade, foi desenhada para persistir resultados mesmo quando o nó já não existe no DOM.

A Bíblia pode ser concluída mantendo as solicitações 194-001/002/003 abertas, pois elas descrevem lacunas externas sem alterar o objeto auditado.

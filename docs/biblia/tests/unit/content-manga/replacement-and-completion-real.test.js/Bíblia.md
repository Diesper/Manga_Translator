# Bíblia técnica — tests/unit/content-manga/replacement-and-completion-real.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `9dcd26cf4a963ab22c11f8535421603d83260572`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte Jest com content script real e integrações externas mockadas  
> **Linhas textuais:** **524**  
> **Posições documentais:** **525**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Esta suíte exercita `content_manga.js` e os módulos content auxiliares reais via `tests/helpers/load-content-script.js`. Seu escopo é replacement visual, cache hit, auto-download do ponto de vista do content script, progresso, idempotência de conclusão, áudio/telemetria e drawer de debug.

A suíte **não** carrega o background real para GTC, download ou batch: `runtimeMock.sendMessage` é substituído por `installRuntimeResponder`. Portanto ela é prova direta das decisões/efeitos do content script e prova apenas simulada das respostas externas.

## 2. Setup e harness

- injeta `crypto.webcrypto` e `TextEncoder` no global;
- usa `loadContentScript`, que injeta os módulos na ordem real do manifest;
- usa `ChromeRuntimeMock`/`StorageMock` compartilhados;
- reinicia módulos, listeners, storage, DOM e flags entre casos;
- `installRuntimeResponder` captura todas as mensagens e simula `GTC_QUERY_MANY`, `GTC_SAVE`, `DOWNLOAD_IMAGE`, `START_BATCH` e `GET_TAB_ID`.

O helper `dispatchToContent` chama o listener real diretamente. Como `sendResponse` pode executar sincronamente antes da atribuição final de `keepAlive`, o campo retornado pode ter a mesma limitação temporal já encontrada em outras suítes; aqui, porém, os cenários não dependem de assertions críticas sobre `keepAlive`.

## 3. Cenários e contratos provados

### 3.1 `UPDATE_IMAGE` — replacement DOM

Prova remoção de `<source>` de `<picture>`, limpeza de atributos lazy/srcset/sizes, troca por Data URL, marca `data-translated`, criação do overlay vermelho, listener de scroll e desmontagem posterior do overlay/listener.

### 3.2 Cache hit visual

Simula hit em `GTC_QUERY_MANY`, clica o botão real e prova tradução a partir do cache, overlay verde e ausência de `START_BATCH`.

### 3.3 Auto-download

Com `autoDownload:true`, `UPDATE_IMAGE` emite `DOWNLOAD_IMAGE`; a resposta mockada do serviço é persistida em `<chapter>_paths`, `mangaTranslatorLastPath` e `<chapter>_dlId`.

### 3.4 `PROGRESS`

Prova atualização de texto e fundo laranja no botão integrado.

### 3.5 Idempotência de conclusão

Após `START_TRANSLATION_FROM_POPUP`, duas mensagens `UPDATE_IMAGE` para o mesmo índice geram apenas um log `BATCH_COMPLETE` e a segunda não substitui a imagem já traduzida.

### 3.6 Áudio e telemetria

Dois batches reutilizam um único `AudioContext`, agendam três notas por conclusão e emitem logs com `originTabId`, papel da aba, host, estado e número de notas.

### 3.7 Conclusão parcial

`BATCH_COMPLETE {hasErrors:true}` não cria AudioContext, mostra `Concluído com erros` e registra `BATCH_COMPLETE` warn.

### 3.8 Falha de resume do áudio

Com contexto suspenso cujo `resume()` rejeita `NotAllowedError`, prova log `AUDIO_SUCCESS_FAILED` com metadados e ausência de oscilador.

### 3.9 Debug sem erros

Com `debugMode:true`, conclusão normal abre a drawer e exibe `Nenhum erro encontrado no lote.`.

## 4. Matriz de evidência

| Comportamento | Classificação |
|---|---|
| Replacement real de `<picture>`/attrs/Data URL | ✅ PROVADO DIRETAMENTE |
| Overlay vermelho e cleanup temporal | ✅ PROVADO DIRETAMENTE |
| Hit de cache conduz replacement verde sem iniciar batch | ✅ PROVADO DIRETAMENTE no content script; resposta GTC é mockada |
| Emissão de `DOWNLOAD_IMAGE` e persistência da resposta | ✅ PROVADO DIRETAMENTE no content script; download real não é executado |
| `PROGRESS` altera texto/cor | ✅ PROVADO DIRETAMENTE |
| UPDATE duplicado não duplica conclusão | ✅ PROVADO DIRETAMENTE |
| AudioContext é reutilizado | ✅ PROVADO DIRETAMENTE |
| Telemetria de áudio contém origem | ✅ PROVADO DIRETAMENTE |
| `hasErrors` suprime sucesso sonoro | ✅ PROVADO DIRETAMENTE |
| Falha de `resume()` é registrada | ✅ PROVADO DIRETAMENTE |
| Drawer debug positiva na conclusão | ✅ PROVADO DIRETAMENTE |
| Background GTC retorna a forma simulada | 🟨 EXECUTADO INDIRETAMENTE / mock; precisa de testes do background |
| Download real cria o arquivo/path/id | 🟨 EXECUTADO INDIRETAMENTE / mock nesta suíte |
| `START_BATCH` real é aceito pelo background | 🟨 apenas mensagem emitida e callback mockado |

## 5. Dependências externas e provas complementares

O corpus possui testes focais do background para GTC, fingerprint, actions e lifecycle. Esses testes são a evidência adequada para o lado servidor das mensagens que #209 apenas simula.

O `load-content-script.js` injeta `gtc-fingerprint`, `cm-gtc-client`, `cm-dom-replace`, `cm-chapter`, `cm-auto-restore` e `content_manga.js`, portanto os efeitos DOM/UI observados aqui atravessam a implementação real atual do content side.

## 6. Invariantes

1. Imagem traduzida não deve manter fontes/lazy attrs capazes de sobrescrever a tradução.
2. Feedback visual de replacement deve ser temporário e limpar listeners.
3. Cache hit não deve disparar batch Gemini desnecessário.
4. Download automático deve persistir os identificadores/caminhos retornados.
5. Conclusão de índice deve ser idempotente.
6. Sucesso e conclusão parcial têm feedback sonoro/visual distintos.
7. Falha de áudio nunca deve bloquear conclusão; deve virar telemetria.

## 7. Riscos e limites

**Integrações externas são doubles.** A suíte não detectará mudança incompatível do payload real retornado por background/download/GTC se os mocks não forem atualizados.

**Timers mistos.** Parte usa fake timers e parte usa delays reais; isso pode aumentar sensibilidade a scheduling do ambiente, embora os waits tenham timeout.

**Import morto.** `fs` é importado e não é usado.

**Cobertura de falhas de serviços externos é parcial.** O caso de áudio cobre falha local; não há nesta suíte falha de `DOWNLOAD_IMAGE`, `GTC_SAVE` ou `START_BATCH` durante os cenários de replacement.

## 8. Solicitações ao auditor

### 209-001 — CONTRACT_INTEGRATION_REVIEW — OPEN

**Encontrado:** GTC, download, start-batch e tab-id são simulados por um responder local; os contratos consumidos pelo content script podem divergir dos handlers reais.

**Evidência atual:** efeitos do content script são diretos; respostas externas são doubles.

**Necessário:** garantir, por testes contratuais ou composição real já existente, que payloads/respostas de `GTC_QUERY_MANY`, `DOWNLOAD_IMAGE`, `START_BATCH` e `GET_TAB_ID` permanecem compatíveis com estas expectativas.

**Risco:** suíte verde com quebra entre content e background.

**Severidade:** NORMAL.

### 209-002 — TEST_REQUIRED — OPEN

**Encontrado:** caminhos de erro das integrações externas não são exercitados aqui, sobretudo `DOWNLOAD_IMAGE` e `GTC_SAVE`.

**Necessário:** localizar cobertura existente ou adicionar cenários content-side que recebam falha explícita e verifiquem estado/telemetria/cleanup esperado.

**Risco:** falha externa pode deixar estado parcial sem regressão detectada nesta suíte.

**Severidade:** NORMAL.

## 9. Fonte integral exata

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

async function flushFakeTimers(ms = 0) {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
}

function findOverlayByColor(color) {
    return Array.from(document.body.children).find((node) => {
        return node instanceof HTMLElement
            && node !== document.getElementById('manga-translator-trigger')
            && node.style.background === color;
    });
}

describe('CM-65/CM-66/CM-67/CM-68/CM-69/CM-70/CM-71/CM-72/CM-73/CM-74/CM-82/CM-83/CM-84/CM-85/CM-86/CM-87/CM-101/CM-105/CM-106: content_manga.js - replacement e completion reais', () => {
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
        try {
            jest.useRealTimers();
        } catch (e) {}
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    function installRuntimeResponder({
        onQueryMany,
        onSave,
        onDownload,
        onStartBatch,
        onGetTabId,
    } = {}) {
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                const response = onQueryMany
                    ? onQueryMany(message)
                    : { ok: true, entriesByHash: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'GTC_SAVE') {
                const response = onSave
                    ? onSave(message)
                    : { ok: true };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'DOWNLOAD_IMAGE') {
                const response = onDownload
                    ? onDownload(message)
                    : { ok: true };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'START_BATCH') {
                if (typeof onStartBatch === 'function') onStartBatch(message);
                if (callback) setTimeout(() => callback({ ok: true }), 0);
                return;
            }

            if (message.action === 'GET_TAB_ID') {
                const response = onGetTabId ? onGetTabId(message) : { tabId: null };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    test('UPDATE_IMAGE remove sources de picture, limpa lazy attrs e desmonta o overlay vermelho apos o tempo', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                {
                    src: 'http://localhost/page-0.png',
                    width: 800,
                    height: 1200,
                    attributes: {
                        loading: 'lazy',
                        'data-src': 'http://localhost/lazy.png',
                        'data-lazy': 'http://localhost/lazy-alt.png',
                        'data-original': 'http://localhost/original.png',
                        srcset: 'http://localhost/page-0-2x.png 2x',
                        sizes: '100vw',
                    },
                },
            ],
        });

        const originalImg = document.querySelector('[data-testid="img-0"]');
        originalImg.dataset.mangaIndex = '0';
        originalImg.dataset.origHash = 'hash-picture-0';
        originalImg.dataset.src = 'http://localhost/lazy.png';
        originalImg.dataset.lazySrc = 'http://localhost/lazy-alt.png';

        const picture = document.createElement('picture');
        const sourceWebp = document.createElement('source');
        sourceWebp.srcset = 'http://localhost/page-0.webp';
        const sourceJpg = document.createElement('source');
        sourceJpg.srcset = 'http://localhost/page-0.jpg';
        originalImg.parentNode.insertBefore(picture, originalImg);
        picture.appendChild(sourceWebp);
        picture.appendChild(sourceJpg);
        picture.appendChild(originalImg);

        const addListenerSpy = jest.spyOn(window, 'addEventListener');
        const removeListenerSpy = jest.spyOn(window, 'removeEventListener');

        jest.useFakeTimers();

        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 0,
            newSrc: 'data:image/png;base64,UkVQTEFDRUQ=',
        });
        await flushFakeTimers(1);

        const translatedImg = picture.querySelector('img');
        expect(picture.querySelectorAll('source')).toHaveLength(0);
        expect(translatedImg.getAttribute('src')).toBe('data:image/png;base64,UkVQTEFDRUQ=');
        expect(translatedImg.dataset.translated).toBe('true');
        expect(translatedImg.hasAttribute('loading')).toBe(false);
        expect(translatedImg.hasAttribute('data-src')).toBe(false);
        expect(translatedImg.hasAttribute('data-lazy')).toBe(false);
        expect(translatedImg.hasAttribute('data-original')).toBe(false);
        expect(translatedImg.hasAttribute('srcset')).toBe(false);
        expect(translatedImg.hasAttribute('sizes')).toBe(false);

        const redOverlay = findOverlayByColor('rgba(200, 30, 30, 0.55)');
        expect(redOverlay).toBeTruthy();
        expect(addListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });

        await flushFakeTimers(3020);

        expect(findOverlayByColor('rgba(200, 30, 30, 0.55)')).toBeUndefined();
        expect(removeListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    test('cache hit visual usa overlay verde e nao dispara START_BATCH', async () => {
        installRuntimeResponder({
            onQueryMany(message) {
                return {
                    ok: true,
                    entriesByHash: {
                        [message.hashes[0]]: 'data:image/png;base64,Q0FDSEVfR1JFRU4=',
                    },
                };
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/cache-hit-page-99.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();
        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');

        const translatedImg = document.querySelector('[data-testid="img-0"]');
        expect(translatedImg.dataset.translated).toBe('true');
        expect(translatedImg.getAttribute('src')).toBe('data:image/png;base64,Q0FDSEVfR1JFRU4=');
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);
        expect(findOverlayByColor('rgba(76, 175, 80, 0.5)')).toBeTruthy();

        await delay(2100);
        expect(findOverlayByColor('rgba(76, 175, 80, 0.5)')).toBeUndefined();
    });

    test('UPDATE_IMAGE com autoDownload persiste paths, ultimo caminho e downloadId', async () => {
        document.title = 'Reader Download Chapter';
        installRuntimeResponder({
            onDownload() {
                return {
                    filePath: 'C:/Downloads/MangaTranslator/reader_download_chapter/pagina_000.png',
                    downloadId: 91,
                };
            },
        });
        await storageMock.set({ autoDownload: true });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const originalImg = document.querySelector('[data-testid="img-0"]');
        originalImg.dataset.mangaIndex = '0';
        originalImg.dataset.origHash = 'hash-autodownload-0';

        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 0,
            newSrc: 'data:image/png;base64,RE9XTkxPQUQ=',
        });

        const storage = await waitFor(async () => {
            const data = await storageMock.get(null);
            const pathKey = Object.keys(data).find(key => key.endsWith('_paths'));
            return pathKey ? data : null;
        }, { timeout: 3000 });

        const pathKey = Object.keys(storage).find(key => key.endsWith('_paths'));
        const dlKey = Object.keys(storage).find(key => key.endsWith('_dlId'));

        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'DOWNLOAD_IMAGE',
            filename: expect.stringContaining('pagina_000.png'),
        }));
        expect(storage[pathKey]).toEqual({
            0: 'C:/Downloads/MangaTranslator/reader_download_chapter/pagina_000.png',
        });
        expect(storage.mangaTranslatorLastPath).toBe('C:/Downloads/MangaTranslator/reader_download_chapter/pagina_000.png');
        expect(storage[dlKey]).toBe(91);
    });

    test('PROGRESS atualiza o texto do botao e a cor de fundo para laranja', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        await dispatchToContent(runtimeMock, {
            action: 'PROGRESS',
            text: 'GEMINI PROCESSANDO...',
        });

        expect(document.getElementById('manga-main-content').textContent).toContain('GEMINI PROCESSANDO');
        expect(document.getElementById('manga-error-static-part').style.background).toBe('rgb(255, 152, 0)');
    });

    test('UPDATE_IMAGE repetido para o mesmo indice nao duplica a conclusao do batch', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const img = document.querySelector('[data-testid="img-0"]');
        img.dataset.origHash = 'hash-repeat-0';

        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [0],
        });
        await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));

        document.querySelector('[data-testid="img-0"]').dataset.mangaIndex = '0';
        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 0,
            newSrc: 'data:image/png;base64,RklSU1Q=',
        });

        await waitFor(() => sentMessages.filter(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'BATCH_COMPLETE'
        ).length === 1);

        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 0,
            newSrc: 'data:image/png;base64,U0VDT05E',
        });
        await delay(100);

        const completionLogs = sentMessages.filter(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'BATCH_COMPLETE'
        );

        expect(completionLogs).toHaveLength(1);
        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe('data:image/png;base64,RklSU1Q=');
    });

    test('reutiliza o AudioContext e registra a telemetria da aba de origem', async () => {
        installRuntimeResponder({ onGetTabId: () => ({ tabId: 73 }) });
        const originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        const audioCtx = {
            state: 'running',
            currentTime: 0,
            destination: {},
            createOscillator: jest.fn(() => ({
                connect: jest.fn(), start: jest.fn(), stop: jest.fn(),
                frequency: { setValueAtTime: jest.fn() },
            })),
            createGain: jest.fn(() => ({
                connect: jest.fn(),
                gain: {
                    setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(),
                    exponentialRampToValueAtTime: jest.fn(),
                },
            })),
        };
        const AudioContextMock = jest.fn(() => audioCtx);
        Object.defineProperty(window, 'AudioContext', { value: AudioContextMock, configurable: true });

        try {
            await loadContentScript({
                hostname: 'localhost',
                domImages: [{ src: 'http://localhost/page-0.png', width: 800, height: 1200 }],
            });

            for (let batch = 0; batch < 2; batch++) {
                await dispatchToContent(runtimeMock, { action: 'START_TRANSLATION_FROM_POPUP', indices: [0] });
                await waitFor(() => sentMessages.filter(message => message.action === 'START_BATCH').length === batch + 1);
                await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
            }

            expect(AudioContextMock).toHaveBeenCalledTimes(1);
            expect(audioCtx.createOscillator).toHaveBeenCalledTimes(6);
            const audioLogs = sentMessages.filter(message => message.source === 'audio');
            expect(audioLogs).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    action_name: 'AUDIO_CONTEXT_CREATED',
                    extra: expect.objectContaining({ originTabId: 73, originTabRole: 'manga_reader', pageHost: 'localhost' }),
                }),
                expect.objectContaining({
                    action_name: 'AUDIO_SUCCESS_SCHEDULED',
                    level: 'success',
                    extra: expect.objectContaining({ originTabId: 73, contextState: 'running', notes: 3 }),
                }),
            ]));
        } finally {
            if (originalAudioContext) Object.defineProperty(window, 'AudioContext', originalAudioContext);
            else delete window.AudioContext;
        }
    });

    test('BATCH_COMPLETE com hasErrors suprime som de sucesso e sinaliza conclusão parcial', async () => {
        installRuntimeResponder();
        const originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        const AudioContextMock = jest.fn();
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        try {
            await loadContentScript({
                hostname: 'localhost',
                domImages: [{ src: 'http://localhost/page-0.png', width: 800, height: 1200 }],
            });
            await dispatchToContent(runtimeMock, {
                action: 'START_TRANSLATION_FROM_POPUP',
                indices: [0],
            });
            await waitFor(() => sentMessages.some(message => message.action === 'START_BATCH'));

            await dispatchToContent(runtimeMock, {
                action: 'BATCH_COMPLETE',
                hasErrors: true,
            });

            expect(AudioContextMock).not.toHaveBeenCalled();
            expect(document.body.textContent).toContain('Concluído com erros');
            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'LOG_ENTRY',
                level: 'warn',
                action_name: 'BATCH_COMPLETE',
                detail: 'Lote encerrado com erros',
            }));
        } finally {
            if (originalAudioContext) Object.defineProperty(window, 'AudioContext', originalAudioContext);
            else delete window.AudioContext;
        }
    });

    test('registra a falha de retomada do áudio com a aba de origem', async () => {
        installRuntimeResponder({ onGetTabId: () => ({ tabId: 91 }) });
        const originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        const audioCtx = {
            state: 'suspended',
            currentTime: 0,
            destination: {},
            resume: jest.fn(() => Promise.reject(Object.assign(new Error('Autoplay blocked'), { name: 'NotAllowedError' }))),
            createOscillator: jest.fn(),
            createGain: jest.fn(),
        };
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => audioCtx),
            configurable: true,
        });

        try {
            await loadContentScript({
                hostname: 'localhost',
                domImages: [{ src: 'http://localhost/page-0.png', width: 800, height: 1200 }],
            });
            await dispatchToContent(runtimeMock, { action: 'START_TRANSLATION_FROM_POPUP', indices: [0] });
            await waitFor(() => sentMessages.some(message => message.action === 'START_BATCH'));
            await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
            await delay(0);

            expect(sentMessages).toContainEqual(expect.objectContaining({
                source: 'audio',
                level: 'error',
                action_name: 'AUDIO_SUCCESS_FAILED',
                extra: expect.objectContaining({
                    originTabId: 91,
                    originTabRole: 'manga_reader',
                    pageHost: 'localhost',
                    errorName: 'NotAllowedError',
                    errorMessage: 'Autoplay blocked',
                }),
            }));
            expect(audioCtx.createOscillator).not.toHaveBeenCalled();
        } finally {
            if (originalAudioContext) Object.defineProperty(window, 'AudioContext', originalAudioContext);
            else delete window.AudioContext;
        }
    });

    test('BATCH_COMPLETE em debug mode sem erros abre a drawer com mensagem positiva', async () => {
        installRuntimeResponder();
        await storageMock.set({ debugMode: true });
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [0],
        });
        await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));

        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
        await delay(60);

        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
        expect(document.getElementById('manga-error-collapsible-content').textContent).toContain('Nenhum erro encontrado no lote.');
    });
});
```

## 10. Cobertura documental por linha/posição

Cobertura contígua de **1–525**; 525 é o newline terminal.

### Posições 1–17 — imports e globals
Configura crypto/TextEncoder e importa loader/mocks reais. **Evidência:** 🟨 setup executado.

### Posições 18–31 — espera assíncrona
Define `delay`/`waitFor` com timeout. **Evidência:** 🟨 infraestrutura.

### Posições 32–56 — listener e dispatch
Obtém listener único e adapta callback para Promise. **Evidência:** 🟨 harness.

### Posições 57–70 — fake timers e overlay finder
Auxilia avanço temporal e localização de overlay por cor. **Evidência:** 🟨 harness.

### Posições 71–107 — suíte/setup/cleanup
Reseta módulos, runtime, storage, flags e DOM entre casos. **Evidência:** 🟨 lifecycle Jest.

### Posições 108–150 — responder outbound
Simula contratos externos e registra mensagens. **Evidência:** ✅ para emissão content-side; mock para serviço remoto.

### Posições 151–220 — replacement/overlay vermelho
Executa UPDATE_IMAGE real e verifica DOM, attrs, overlay e cleanup. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 221–252 — cache hit/overlay verde
Hit mockado de GTC passa pelo pipeline real de content e evita START_BATCH. **Evidência:** ✅ content-side; 🟨 GTC externo.

### Posições 253–301 — auto-download
Prova emissão e persistência da resposta mockada. **Evidência:** ✅ content-side; 🟨 download externo.

### Posições 302–319 — progress
Prova texto e cor do botão. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 320–363 — idempotência
Segundo UPDATE_IMAGE do mesmo índice não duplica conclusão nem replacement. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 364–417 — AudioContext/telemetria
Dois batches reutilizam contexto e geram logs de origem/sucesso. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 418–456 — conclusão com erros
Suprime áudio, sinaliza parcial e loga warn. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 457–501 — falha de resume
Rejeição NotAllowedError gera telemetria e não toca notas. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 502–524 — debug drawer
Debug sem erros abre drawer positiva. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 525 — newline final
Terminador textual. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA reconfirmado antes da escrita.
- Fonte integral embutida.
- **525/525 posições** cobertas.
- Fronteira entre content real e serviços mockados explicitada.
- Nenhuma execução de suíte foi alegada.
- Nenhum código/teste externo foi alterado.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com duas solicitações externas abertas.

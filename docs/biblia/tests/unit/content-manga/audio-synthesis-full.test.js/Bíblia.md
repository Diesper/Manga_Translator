# Bíblia técnica — tests/unit/content-manga/audio-synthesis-full.test.js

> **Estado documental:** correção materializada; validação executável da revisão atual pendente  
> **SHA auditado:** `52f27af4d8d21cbdd19eabf3d1143eeef96cc9b3`  
> **Índice do corpus:** 191  
> **Tipo:** integração Jest real da síntese de áudio do content script  
> **Linhas textuais:** **389**  
> **Posições documentais:** **390**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta revisão substitui a suíte anterior de mirrors por uma prova que carrega o bundle Manga real via `loadContentScript()` e dispara as rotinas de áudio encapsuladas em `content_manga.js` pelos caminhos públicos do próprio content script.

Não há mais import de `tests/helpers/extracted-functions.js` nem implementação local de `playSuccessSound()`. Assim, mudanças no runtime real de áudio podem quebrar esta suíte diretamente.

## 2. Dependências revalidadas

- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `tests/unit/content-manga/replacement-and-completion-real.test.js`: `9dcd26cf4a963ab22c11f8535421603d83260572`.
- `extension/content/content_manga.js`: `a8b3698019f6f22027f09f544f15c0563a9f6515`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- `package.json`: `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`.

## 3. Harness real

`loadContentScript()` lê a ordem de scripts do `manifest.json`, configura JSDOM/Chrome mocks e carrega o bundle real. A suíte usa o listener registrado por `content_manga.js`, não uma função espelho.

O responder de runtime só estabiliza dependências externas ao foco:

- `GTC_QUERY_MANY` retorna miss controlado;
- `START_BATCH` aceita o lote;
- `GET_TAB_ID` fornece aba para telemetria;
- mensagens auxiliares recebem `{ ok: true }`.

## 4. Som de erro — runtime real

O primeiro teste envia `SHOW_ERROR_INTEGRATED` com `imgIndex=0`. Esse caminho chama `showIntegratedError()`, que no runtime executa `playErrorSound()`.

A prova exige dois oscillators e dois gains **distintos** e valida, por instância:

- onda `sawtooth`;
- frequências 300 Hz e 150 Hz;
- offsets 0 s e 0,2 s;
- envelope 0 → 0,4 → 0,001;
- `osc → gain → destination`;
- `start()` e `stop()` corretos;
- log `BATCH_ERROR`.

Isso fecha a fraqueza anterior em que todos os eventos eram acumulados no mesmo mock.

## 5. Som de sucesso — runtime real

O segundo teste inicia um lote real com `START_TRANSLATION_FROM_POPUP`, espera **uma nova ocorrência** de `START_BATCH` (contagem anterior + 1) emitida pela implementação e envia `BATCH_COMPLETE`. Isso impede que o segundo ciclo reutilize a mensagem do primeiro como falso sinal de prontidão.

`checkIfComplete(true)` executa `playSuccessSound()`. A suíte valida três pares oscillator/gain independentes:

- 660 Hz em t+0;
- 880 Hz em t+0,18;
- 1100 Hz em t+0,36;
- onda `sine`;
- mesmo envelope procedural do runtime;
- conexões e horários de start/stop por nota.

Também dispara `onended` da última nota e exige telemetria `AUDIO_CONTEXT_CREATED`, `AUDIO_SUCCESS_SCHEDULED` e `AUDIO_SUCCESS_FINISHED`.

Depois inicia um segundo lote e prova que o mesmo `AudioContext` é reutilizado: uma construção do contexto e seis notas totais.

## 6. Lifecycle suspended → resume

O terceiro teste cria contexto `suspended` com um `resume()` bloqueado por Promise controlada.

Antes de liberar o resume:

- `resume()` foi chamado;
- nenhum oscillator foi criado.

Depois de liberar e mudar o estado para `running`:

- três notas são agendadas;
- a telemetria `AUDIO_SUCCESS_SCHEDULED` informa `contextState: running`.

Isso cobre diretamente o lifecycle moderno que o mirror anterior não representava.

## 7. Compatibilidade e falha de criação

A suíte preserva os edge cases úteis da versão antiga, agora pelo runtime real:

- sem `window.AudioContext`, `playErrorSound()` usa `window.webkitAudioContext`;
- se o construtor de `AudioContext` lança, o erro sonoro continua silencioso e a UI integrada de erro permanece funcional.

## 8. Audit requests

### 191-001 — TEST_AUTHENTICITY — IMPLEMENTED_AWAITING_CI

**Correção:** mirrors removidos. O teste dispara `playErrorSound()` e `playSuccessSound()` dentro da closure real de `content_manga.js`.

**Validação pendente:** execução focal e suíte relacionada no SHA atual.

### 191-002 — STALE_TEST_CONTRACT — IMPLEMENTED_AWAITING_CI

**Correção:** cabeçalho/escopo agora descrevem integração real e a suíte cobre explicitamente contexto reutilizável, estado `suspended`, `resume()` e telemetria.

**Validação pendente:** execução focal e suíte relacionada no SHA atual.

### 191-003 — TEST_STRENGTH_REVIEW — IMPLEMENTED_AWAITING_CI

**Correção:** `createOscillator()` e `createGain()` criam mocks distintos a cada chamada; cada nota é validada contra seu próprio oscillator/gain.

**Validação pendente:** execução focal e suíte relacionada no SHA atual.

## 9. Findings distribuídos da revisão anterior

### 191-PRI/ADV — mapa integral incompleto — CORRIGIDO

A documentação antiga omitia posições e misturava fronteiras de seções. Esta Bíblia foi regenerada para a revisão nova e usa faixas contíguas derivadas diretamente do source atual.

### lifecycle de requests — CORRIGIDO

A documentação antiga rotulava 191-001/002/003 como OPEN. O state canônico os registra como ACCEPTED; esta revisão os representa como correções implementadas aguardando validação executável.

## 10. Evidência atual

Até esta atualização:

- parse JavaScript estático: **PASS**;
- source/Bíblia: **sincronizados para o SHA acima**;
- execução Jest/CI da revisão nova: **PENDENTE**.

Nenhuma request é marcada RESOLVED apenas por inspeção estática.

## 11. Limites honestos

- O áudio é verificado com um `AudioContext` mockado; não há reprodução física em hardware.
- A prova valida o wiring e os parâmetros que o runtime envia à Web Audio API.
- O ambiente continua sendo JSDOM/Jest; políticas reais de autoplay do Chromium são aproximadas pelo estado/resume mockado.
- `replacement-and-completion-real.test.js` continua cobrindo outros aspectos de completion/telemetria; #191 agora é a prova focal dos parâmetros de síntese e do lifecycle essencial.

## 12. Fonte integral exata

```js
/**
 * audio-synthesis-full.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real da síntese de áudio de content_manga.js.
 *
 * A suíte carrega o bundle Manga pelo manifest e dispara os caminhos públicos
 * que executam playErrorSound()/playSuccessSound() dentro da closure real.
 * Não existe mirror local da síntese nem helper extraído usado como prova.
 */

const crypto = require('crypto');
const { TextEncoder } = require('util');

const { loadContentScript } = require('../../helpers/load-content-script.js');
const {
    getRuntimeMock,
    getStorageMock,
} = require('../../mocks/chrome-api.mock.js');

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

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
    throw new Error('Timeout aguardando síntese de áudio real');
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
        if (keepAlive !== true && !settled) resolve({ keepAlive, response: undefined });
    });
}

function createOscillatorNode() {
    return {
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        frequency: { setValueAtTime: jest.fn() },
        type: '',
        onended: null,
    };
}

function createGainNode() {
    return {
        connect: jest.fn(),
        gain: {
            setValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
        },
    };
}

function createAudioContext({ state = 'running', currentTime = 0, onResume = null } = {}) {
    const oscillators = [];
    const gains = [];
    const ctx = {
        state,
        currentTime,
        destination: {},
        createOscillator: jest.fn(() => {
            const node = createOscillatorNode();
            oscillators.push(node);
            return node;
        }),
        createGain: jest.fn(() => {
            const node = createGainNode();
            gains.push(node);
            return node;
        }),
        resume: jest.fn(async () => {
            if (onResume) await onResume(ctx);
            else ctx.state = 'running';
        }),
    };
    return { ctx, oscillators, gains };
}

function assertNote({ osc, gain, destination, type, frequency, start, stop }) {
    expect(osc.type).toBe(type);
    expect(osc.connect).toHaveBeenCalledTimes(1);
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledTimes(1);
    expect(gain.connect).toHaveBeenCalledWith(destination);
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledTimes(1);
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(frequency, start);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, start);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, start + 0.04);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, start + 0.28);
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.start).toHaveBeenCalledWith(start);
    expect(osc.stop).toHaveBeenCalledTimes(1);
    expect(osc.stop).toHaveBeenCalledWith(stop);
}

describe('Síntese de áudio procedural — runtime real de content_manga.js', () => {
    let runtimeMock;
    let storageMock;
    let sentMessages;
    let audioContextDescriptor;
    let webkitAudioContextDescriptor;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        sentMessages = [];
        await storageMock.clear();

        audioContextDescriptor = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        webkitAudioContextDescriptor = Object.getOwnPropertyDescriptor(window, 'webkitAudioContext');

        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';

        if (audioContextDescriptor) Object.defineProperty(window, 'AudioContext', audioContextDescriptor);
        else delete window.AudioContext;
        if (webkitAudioContextDescriptor) Object.defineProperty(window, 'webkitAudioContext', webkitAudioContextDescriptor);
        else delete window.webkitAudioContext;
    });

    function installRuntimeResponder({ tabId = 17 } = {}) {
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByHash: {} }), 0);
                return;
            }
            if (message.action === 'START_BATCH') {
                if (callback) setTimeout(() => callback({ ok: true, batchId: message.batchId }), 0);
                return;
            }
            if (message.action === 'GET_TAB_ID') {
                if (callback) setTimeout(() => callback({ tabId }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    async function loadOnePage() {
        return loadContentScript({
            hostname: 'localhost',
            domImages: [{
                src: 'http://localhost/page-0.png',
                width: 800,
                height: 1200,
            }],
        });
    }

    async function startBatch() {
        const previousCount = sentMessages.filter(message => message.action === 'START_BATCH').length;
        await dispatchToContent(runtimeMock, {
            action: 'START_TRANSLATION_FROM_POPUP',
            indices: [0],
        });
        await waitFor(() =>
            sentMessages.filter(message => message.action === 'START_BATCH').length === previousCount + 1
        );
    }

    test('SHOW_ERROR_INTEGRATED executa playErrorSound real com dois nós independentes', async () => {
        installRuntimeResponder();
        const { ctx, oscillators, gains } = createAudioContext({ currentTime: 4 });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'falha focal',
            imgIndex: 0,
            isDebug: false,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(2);
        expect(gains).toHaveLength(2);
        expect(oscillators[0]).not.toBe(oscillators[1]);
        expect(gains[0]).not.toBe(gains[1]);

        assertNote({
            osc: oscillators[0], gain: gains[0], destination: ctx.destination,
            type: 'sawtooth', frequency: 300, start: 4, stop: 4.3,
        });
        assertNote({
            osc: oscillators[1], gain: gains[1], destination: ctx.destination,
            type: 'sawtooth', frequency: 150, start: 4.2, stop: 4.5,
        });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            level: 'error',
            action_name: 'BATCH_ERROR',
        }));
    });

    test('BATCH_COMPLETE executa arpejo real por nota e reutiliza o mesmo AudioContext', async () => {
        installRuntimeResponder({ tabId: 73 });
        const { ctx, oscillators, gains } = createAudioContext({ currentTime: 2 });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(3);
        expect(gains).toHaveLength(3);
        expect(new Set(oscillators).size).toBe(3);
        expect(new Set(gains).size).toBe(3);

        [
            [660, 0],
            [880, 0.18],
            [1100, 0.36],
        ].forEach(([frequency, offset], index) => {
            assertNote({
                osc: oscillators[index],
                gain: gains[index],
                destination: ctx.destination,
                type: 'sine',
                frequency,
                start: 2 + offset,
                stop: 2 + offset + 0.3,
            });
        });

        expect(typeof oscillators[2].onended).toBe('function');
        oscillators[2].onended();
        expect(sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                source: 'audio',
                action_name: 'AUDIO_CONTEXT_CREATED',
                extra: expect.objectContaining({ originTabId: 73 }),
            }),
            expect.objectContaining({
                source: 'audio',
                level: 'success',
                action_name: 'AUDIO_SUCCESS_SCHEDULED',
                extra: expect.objectContaining({ notes: 3, contextState: 'running' }),
            }),
            expect.objectContaining({
                source: 'audio',
                level: 'success',
                action_name: 'AUDIO_SUCCESS_FINISHED',
                extra: expect.objectContaining({ notes: 3 }),
            }),
        ]));

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(6);
        expect(gains).toHaveLength(6);
    });

    test('contexto suspended só agenda sucesso depois de resume real completar', async () => {
        installRuntimeResponder();
        let releaseResume;
        const resumeGate = new Promise(resolve => { releaseResume = resolve; });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            currentTime: 1,
            onResume: async (audioCtx) => {
                await resumeGate;
                audioCtx.state = 'running';
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);

        releaseResume();
        await waitFor(() => oscillators.length === 3);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_SUCCESS_SCHEDULED',
            extra: expect.objectContaining({ contextState: 'running', notes: 3 }),
        }));
    });

    test('playErrorSound real usa webkitAudioContext quando AudioContext não existe', async () => {
        installRuntimeResponder();
        const { ctx, oscillators } = createAudioContext();
        const WebkitAudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: WebkitAudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'fallback webkit',
            imgIndex: 0,
        });

        expect(WebkitAudioContextMock).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(2);
    });

    test('falha ao criar AudioContext no erro é silenciosa e não interrompe a UI', async () => {
        installRuntimeResponder();
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => { throw new Error('Policy violation'); }),
            configurable: true,
        });

        await loadOnePage();
        await expect(dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'sem áudio',
            imgIndex: 0,
        })).resolves.toEqual(expect.objectContaining({ keepAlive: false }));

        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
        expect(document.getElementById('manga-error-collapsible-content').textContent)
            .toContain('sem áudio');
    });
});
```

## 13. Cobertura integral por posições

- **1–25:** cabeçalho, imports e instalação de crypto/TextEncoder.
- **26–39:** helpers de delay/wait.
- **40–60:** acesso/dispatch ao listener real do content script.
- **61–82:** factories de oscillator/gain independentes.
- **83–107:** factory de AudioContext e coleção dos nós criados.
- **108–124:** assertion por nota, incluindo grafo, frequência, envelope e start/stop.
- **125–131:** abertura da suíte e estado compartilhado.
- **132–150:** setup por teste.
- **151–165:** cleanup/restauração de globals por teste.
- **166–189:** responder controlado de runtime.
- **190–208:** helpers de página/lote; `startBatch()` exige incremento exato de `START_BATCH`.
- **209–247:** `SHOW_ERROR_INTEGRATED → playErrorSound` real.
- **248–312:** `BATCH_COMPLETE → playSuccessSound` real, telemetria e reuso de contexto.
- **313–346:** lifecycle `suspended → resume → running`.
- **347–370:** fallback `webkitAudioContext`.
- **371–389:** falha de criação de AudioContext sem quebrar UI.
- **390:** posição vazia do LF final.

**Cobertura:** 390/390 posições, contíguas e sem overlap.

## 14. Reauditoria pós-correção

- Mirror local de sucesso: removido.
- Import de `extracted-functions.js`: removido.
- Import morto `fs/path`: removidos.
- Nós compartilhados entre notas: removidos.
- Runtime real de erro: exercitado por mensagem pública.
- Runtime real de sucesso: exercitado por lifecycle de lote.
- Reuso do contexto: coberto.
- Estado suspended/resume: coberto.
- Fallback webkit: coberto.
- Falha silenciosa de criação no som de erro: coberta.
- CI do SHA atual: ainda necessário antes de fechar as requests.

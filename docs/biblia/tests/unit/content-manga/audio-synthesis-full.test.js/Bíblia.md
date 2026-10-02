# Bíblia técnica — tests/unit/content-manga/audio-synthesis-full.test.js

> **Estado documental:** ✅ CORRIGIDO E REVALIDADO — 191-001..005 RESOLVIDOS  
> **SHA auditado:** `b6226367282983e6900ebbfa0be2d056bf7de72e`  
> **Índice do corpus:** 191  
> **Tipo:** integração Jest real do áudio de `content_manga.js`  
> **Linhas textuais:** **701**  
> **Posições documentais:** **702**, contando LF final  
> **PR principal:** #66  
> **Validação isolada pós-fix:** PR #73  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é a prova focal do áudio real do reader Manga. Ela carrega o bundle pelo manifest, usa o listener real de `content_manga.js` e não possui mirror de `playErrorSound`/synthesis como fonte de verdade.

A revisão atual cobre tanto o som de erro quanto o som de sucesso, incluindo lifecycle do `notificationAudioContext`, user gesture, `closed`, `suspended`, resume recusado/incompleto, fallback WebKit, falha de construtor e falha de scheduling.

## 2. Dependências revalidadas

- `extension/content/content_manga.js`: `50f01eab6cbe3d6c0ad4e31ce2f2c78f286a6ba8`.
- `tests/unit/content-manga/replacement-and-completion-real.test.js`: `9dcd26cf4a963ab22c11f8535421603d83260572`.
- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `.github/workflows/audio-synthesis-selftest.yml`: `eb1bdf727d6dde90a8b8c3634fe0d724b0f09b6f`.

## 3. Casos executados

1. `SHOW_ERROR_INTEGRATED` executa `playErrorSound` real e valida os dois nós por instância.
2. Dois erros consecutivos reutilizam um único contexto e acumulam quatro notas no mesmo contexto.
3. Erro com contexto `suspended` não agenda antes do `resume()` concluir.
4. Rejeição de `resume()` no erro gera `AUDIO_ERROR_FAILED` e não cria notas.
5. `BATCH_COMPLETE` executa o arpejo real e reutiliza o contexto.
6. Clique real desbloqueia contexto suspenso e registra `AUDIO_UNLOCKED`.
7. Falha de unlock por gesto é observável e não impede o lote.
8. Contexto `closed` é descartado e substituído.
9. API de AudioContext indisponível gera `AUDIO_UNAVAILABLE`.
10. Resume resolvido sem estado `running` gera `AUDIO_SUCCESS_SKIPPED`.
11. Falha de `createOscillator` gera `AUDIO_SUCCESS_FAILED`.
12. Sucesso suspenso só agenda depois de resume real.
13. `webkitAudioContext` continua sendo fallback real do som de erro.
14. Falha de criação de AudioContext no erro não interrompe a UI integrada.

## 4. 191-001 — TEST_AUTHENTICITY — RESOLVED

Os mirrors deixaram de ser a prova principal. Os caminhos reais de erro e sucesso são acionados dentro da closure de `content_manga.js`.

## 5. 191-002 — STALE_TEST_CONTRACT — RESOLVED

O escopo da suíte agora corresponde ao runtime atual: reuse, estado, resume, telemetria e fallbacks fazem parte da prova.

## 6. 191-003 — TEST_STRENGTH_REVIEW — RESOLVED

Cada chamada a `createOscillator()`/`createGain()` retorna instância própria e as notas são verificadas individualmente.

## 7. 191-004 — AUDIO_LIFECYCLE_BRANCH_GAP — RESOLVED

A revisão anterior adicionou user-gesture unlock, falha de unlock, recriação após `closed`, API indisponível, resume incompleto e falha de scheduling.

Evidência anterior:
- run `36951292966`;
- Node 20 job `110664598493`;
- Node 22 job `110664598462`;
- full content-scripts job `110664598276`;
- focal 20/20 em ambos os nós;
- suíte completa 40/40, 439/439 com `--detectOpenHandles`.

## 8. 191-005 — AUDIO_CONTEXT_LEAK — RESOLVED

### Finding

A REAUDIT final encontrou que `playErrorSound()` ainda criava um `new AudioContext()` a cada erro, contrariando o próprio contrato de contexto único/reutilizável do runtime.

### Prova pre-fix

PR draft #72, run `36954506306`:

- Node 20 job `110674388356`: **FAIL esperado** apenas no novo regression;
- Node 22 job `110674388455`: **FAIL esperado** no mesmo regression;
- erro exato: esperado `AudioContextMock` 1 chamada, recebido 2;
- os demais 20 testes focais/relacionados passaram.

### Correção produtiva

`playErrorSound()` passou a usar `getLoggedNotificationAudioContext('integrated_error')`, portanto:

- reutiliza `notificationAudioContext`;
- respeita `running`;
- em `suspended`, espera `resume()`;
- registra `AUDIO_ERROR_FAILED` se resume for recusado;
- registra `AUDIO_ERROR_SKIPPED` se o contexto não ficar executável;
- mantém waveform e fallback WebKit.

### Pós-fix

PR draft #73, run `36954798257`:

- Node 20 job `110675268570`: **SUCCESS**;
- Node 22 job `110675268644`: **SUCCESS**;
- full content-scripts job `110675268412`: **SUCCESS — 40/40 suites, 442/442 testes** com `--detectOpenHandles`.

191-005 está RESOLVED com prova red→green: pre-fix falhou exatamente em cardinalidade de AudioContext nos dois nós; pós-fix passou focal e suíte completa.

## 9. Invariantes provadas

- Dois erros consecutivos não podem criar dois contextos.
- Um erro suspenso não cria oscillator antes de `resume()`.
- Falha de resume do erro não pode produzir áudio silenciosamente como se tivesse agendado.
- Contexto de sucesso e contexto de erro compartilham o mesmo lifecycle de notificação.
- Uma instância `closed` não pode ser reutilizada.
- Cada nota mantém oscillator/gain próprios.
- O terceiro nó do sucesso continua emitindo completion telemetry via `onended`.
- Falhas da Web Audio API não escapam do handler de mensagem nem quebram a UI.

## 10. Limites honestos

- JSDOM/mocks validam chamadas e lifecycle da Web Audio API, não saída física do hardware.
- Política real de autoplay do Chromium é aproximada por estado/resume mockado, porém o clique é o clique DOM real do content script.
- A suíte relacionada continua necessária para completion, `hasErrors` e telemetria adjacente.
- A suíte completa foi executada pós-fix com `--detectOpenHandles` e passou 40/40 suites, 442/442 testes.

## 11. Fonte integral exata

```javascript
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

    test('erros consecutivos reutilizam um único AudioContext de notificação', async () => {
        installRuntimeResponder({ tabId: 74 });
        const first = createAudioContext({ currentTime: 3 });
        const second = createAudioContext({ currentTime: 9 });
        const AudioContextMock = jest.fn()
            .mockImplementationOnce(() => first.ctx)
            .mockImplementationOnce(() => second.ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();

        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro um',
            imgIndex: 0,
            isDebug: false,
        });
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro dois',
            imgIndex: 0,
            isDebug: false,
        });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(first.oscillators).toHaveLength(4);
        expect(first.gains).toHaveLength(4);
        expect(second.oscillators).toHaveLength(0);
        expect(second.gains).toHaveLength(0);
        expect(sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_CONTEXT_CREATED'
        )).toHaveLength(1);
    });

    test('erro com contexto suspended só agenda após resume concluir', async () => {
        installRuntimeResponder({ tabId: 75 });
        let releaseResume;
        const resumeGate = new Promise(resolve => { releaseResume = resolve; });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            currentTime: 7,
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
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro suspenso',
            imgIndex: 0,
            isDebug: false,
        });

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);

        releaseResume();
        await waitFor(() => oscillators.length === 2);
        expect(ctx.state).toBe('running');
    });

    test('erro registra falha de resume sem criar notas', async () => {
        installRuntimeResponder({ tabId: 76 });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {
                throw Object.assign(new Error('error-resume-blocked'), {
                    name: 'NotAllowedError',
                });
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro sem resume',
            imgIndex: 0,
            isDebug: false,
        });

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_ERROR_FAILED'
        ));
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_FAILED',
            extra: expect.objectContaining({
                originTabId: 76,
                errorName: 'NotAllowedError',
                errorMessage: 'error-resume-blocked',
            }),
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

    test('clique real desbloqueia AudioContext suspended antes do lote', async () => {
        installRuntimeResponder({ tabId: 44 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async (audioCtx) => {
                audioCtx.state = 'running';
            },
        });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => ctx.resume.mock.calls.length === 1);
        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCKED'
            && message.extra?.originTabId === 44
        ));

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('running');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_UNLOCKED',
            extra: expect.objectContaining({
                originTabId: 44,
                contextState: 'running',
            }),
        }));
    });

    test('clique real registra falha de unlock sem impedir o início do lote', async () => {
        installRuntimeResponder({ tabId: 45 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async () => {
                throw Object.assign(new Error('gesture-blocked'), {
                    name: 'NotAllowedError',
                });
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_FAILED'
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_UNLOCK_FAILED',
            extra: expect.objectContaining({
                originTabId: 45,
                errorName: 'NotAllowedError',
                errorMessage: 'gesture-blocked',
            }),
        }));
    });

    test('contexto closed é descartado e substituído no próximo BATCH_COMPLETE', async () => {
        installRuntimeResponder({ tabId: 55 });
        const first = createAudioContext({ currentTime: 1 });
        const second = createAudioContext({ currentTime: 5 });
        const AudioContextMock = jest.fn()
            .mockImplementationOnce(() => first.ctx)
            .mockImplementationOnce(() => second.ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
        expect(first.oscillators).toHaveLength(3);

        first.ctx.state = 'closed';

        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(AudioContextMock).toHaveBeenCalledTimes(2);
        expect(second.oscillators).toHaveLength(3);
        expect(second.gains).toHaveLength(3);

        const creationLogs = sentMessages.filter(message =>
            message.source === 'audio'
            && message.action_name === 'AUDIO_CONTEXT_CREATED'
        );
        expect(creationLogs).toHaveLength(2);
        expect(creationLogs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                extra: expect.objectContaining({ originTabId: 55 }),
            }),
        ]));
    });

    test('AudioContext indisponível registra AUDIO_UNAVAILABLE sem agendar som', async () => {
        installRuntimeResponder({ tabId: 66 });
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: undefined,
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNAVAILABLE',
            extra: expect.objectContaining({
                originTabId: 66,
                trigger: 'batch_complete',
            }),
        }));
        expect(sentMessages.some(message =>
            message.action_name === 'AUDIO_SUCCESS_SCHEDULED'
        )).toBe(false);
    });

    test('resume resolvido sem estado running não agenda som e registra skip', async () => {
        installRuntimeResponder();
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {},
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });
        await delay(0);

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('suspended');
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_SUCCESS_SKIPPED',
            extra: expect.objectContaining({ contextState: 'suspended' }),
        }));
    });

    test('falha ao criar oscillator no sucesso é observável e não escapa do handler', async () => {
        installRuntimeResponder();
        const { ctx } = createAudioContext({ state: 'running' });
        ctx.createOscillator = jest.fn(() => {
            throw new Error('oscillator-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await startBatch();

        await expect(dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_SUCCESS_FAILED',
            extra: expect.objectContaining({
                errorName: 'Error',
                errorMessage: 'oscillator-boom',
            }),
        }));
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
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
        expect(document.getElementById('manga-error-collapsible-content').textContent)
            .toContain('sem áudio');
    });
});
```

## 12. Cobertura integral por posições

- **1–25:** cabeçalho/imports/globals.
- **26–39:** delay/waitFor bounded.
- **40–60:** listener real e dispatch.
- **61–82:** factories de oscillator/gain.
- **83–107:** factory de AudioContext.
- **108–124:** `assertNote()`.
- **125–131:** abertura da suíte/estado.
- **132–150:** setup.
- **151–166:** teardown.
- **167–186:** runtime responder.
- **187–197:** `loadOnePage()`.
- **198–208:** `startBatch()`.
- **209–247:** erro real básico.
- **248–285:** dois erros, contexto único.
- **286–318:** erro suspended → resume → áudio.
- **319–357:** erro com resume recusado.
- **358–422:** sucesso/arpejo/reuso.
- **423–460:** unlock positivo por clique.
- **461–500:** unlock recusado por clique.
- **501–539:** contexto closed substituído.
- **540–568:** AudioContext indisponível.
- **569–595:** resume sem running.
- **596–624:** falha de scheduling.
- **625–658:** sucesso suspended gate.
- **659–682:** fallback WebKit do erro.
- **683–701:** construtor de áudio falha sem quebrar UI.
- **702:** LF final.

**Cobertura:** **702/702 posições**, contíguas, sem gap ou overlap.

## 13. Reauditoria pós-correção

- Fonte real, não mirror: confirmado.
- Nós independentes: confirmado.
- Reuse no sucesso: confirmado.
- Reuse no erro: confirmado por regression pós-fix Node 20/22.
- User gesture: confirmado.
- Closed: confirmado.
- Suspended/resume sucesso e erro: confirmado focalmente.
- Constructor/scheduling failure: confirmado.
- Fallback webkit: confirmado.
- Skips/only/TODO/FIXME: nenhum.
- Full content-scripts pós-fix: **PASS — 40/40 suites, 442/442 testes com `--detectOpenHandles`**.

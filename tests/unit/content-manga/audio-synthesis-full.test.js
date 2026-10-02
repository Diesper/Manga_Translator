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

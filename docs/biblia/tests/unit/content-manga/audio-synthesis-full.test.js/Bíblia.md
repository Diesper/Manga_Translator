# Bíblia técnica — tests/unit/content-manga/audio-synthesis-full.test.js

> **Estado documental:** ✅ REAUDITADO E REVALIDADO — 191-001..006 RESOLVIDOS  
> **SHA auditado:** `0a2fa6dd4024d64e21225a4dc329f0915abd4bdb`  
> **Índice do corpus:** 191  
> **Tipo:** integração Jest real da síntese/lifecycle Web Audio de `content_manga.js`  
> **Linhas textuais:** **806**  
> **Posições documentais:** **807**, contando o LF final  
> **PR principal:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é a prova focal do áudio **real** do reader Manga. Ela carrega os scripts na ordem do manifest por `loadContentScript()`, dispara mensagens/cliques públicos do content script e observa a closure real de `content_manga.js`. Não há mirror local de `playErrorSound()` nem de `playSuccessSound()` usado como prova principal.

A revisão final cobre:

- waveform e wiring por nota;
- contexto compartilhado entre erro e sucesso;
- erros consecutivos sem criação ilimitada de `AudioContext`;
- estado `suspended`, `closed` e indisponibilidade da API;
- user gesture real e `resume()`;
- resume recusado e resume resolvido sem `running`;
- falha de constructor;
- falha síncrona de scheduling;
- fallback `webkitAudioContext`;
- telemetria bounded do lifecycle.

## 2. Dependências finais revalidadas

- `extension/content/content_manga.js`: `3601efd9a66f8408b724b42d008dc43d518dabe6`.
- `tests/unit/content-manga/replacement-and-completion-real.test.js`: `9dcd26cf4a963ab22c11f8535421603d83260572`.
- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `.github/workflows/audio-synthesis-selftest.yml`: `eb1bdf727d6dde90a8b8c3634fe0d724b0f09b6f`.

## 3. Matriz final dos 17 casos

1. `SHOW_ERROR_INTEGRATED` executa o som real com dois nós independentes.
2. Erros consecutivos reutilizam um único `AudioContext`.
3. Erro em contexto suspended só agenda após resume concluir.
4. Erro com resume rejeitado emite `AUDIO_ERROR_FAILED` e não cria notas.
5. `BATCH_COMPLETE` executa arpejo real por nota e reutiliza o contexto.
6. Clique real desbloqueia contexto suspended antes do lote.
7. Falha de unlock no clique é observável sem impedir início do lote.
8. Contexto `closed` é descartado e substituído.
9. AudioContext indisponível no fluxo de sucesso emite `AUDIO_UNAVAILABLE`.
10. Resume de sucesso que não chega a `running` gera skip.
11. Falha de `createOscillator` no sucesso é observável.
12. Sucesso suspended só agenda depois do resume.
13. Erro cujo resume resolve mas continua suspended gera `AUDIO_ERROR_SKIPPED`.
14. Erro sem AudioContext registra indisponibilidade e mantém UI.
15. Falha síncrona de scheduling do erro emite `AUDIO_ERROR_FAILED`.
16. `webkitAudioContext` é fallback real do erro.
17. Falha ao construir AudioContext no erro emite `AUDIO_ERROR_FAILED` e mantém UI.

## 4. Audit requests 191-001..004

### 191-001 — TEST_AUTHENTICITY — RESOLVED
Mirrors deixaram de ser fonte de verdade; erro e sucesso são acionados no content script real.

### 191-002 — STALE_TEST_CONTRACT — RESOLVED
Descrição e objeto executado agora incluem lifecycle, reuse, resume e telemetria reais.

### 191-003 — TEST_STRENGTH_REVIEW — RESOLVED
Oscillators/gains são mocks distintos por chamada e validados por instância.

### 191-004 — AUDIO_LIFECYCLE_BRANCH_GAP — RESOLVED
User gesture, `closed`, API ausente, resume incompleto e falhas de scheduling do sucesso foram adicionados e executados.

Evidência consolidada anterior: run `36951292966`, focal Node20/22 20/20; full content-scripts 40/40 suites, 439/439 testes.

## 5. 191-005 — AUDIO_CONTEXT_LEAK — RESOLVED

### Finding
`playErrorSound()` criava `new AudioContext()` a cada erro.

### Prova pre-fix
PR draft #72, run `36954506306`:
- Node20 job `110674388356`: FAIL esperado — 1 contexto esperado, 2 recebidos;
- Node22 job `110674388455`: mesma falha;
- os demais 20 testes focais/relacionados passaram.

### Correção
`playErrorSound()` passou a obter `getLoggedNotificationAudioContext('integrated_error')`, compartilhando `notificationAudioContext` com o lifecycle já usado pelo sucesso.

### Prova pós-fix
PR draft #73, run `36954798257`:
- Node20 `110675268570`: SUCCESS, 23/23;
- Node22 `110675268644`: SUCCESS, 23/23;
- full content-scripts `110675268412`: SUCCESS, 40/40 suites, 442/442 testes, `--detectOpenHandles`.

## 6. 191-006 — ERROR_OBSERVABILITY — RESOLVED

### Finding
Mesmo após o reuse, `playErrorSound()` terminava em `catch (e) {}`, ocultando falhas síncronas de constructor/`createOscillator`/`createGain`/wiring.

### Prova pre-fix
PR draft #74, run `36955075188`:
- Node20 job `110676149604`: FAIL exatamente nos 2 casos novos;
- Node22 job `110676149544`: FAIL exatamente nos mesmos 2 casos;
- falha 1: ausência de `AUDIO_ERROR_FAILED` para `error-oscillator-boom`;
- falha 2: ausência de `AUDIO_ERROR_FAILED` para `Policy violation`;
- os demais casos focais e a suíte relacionada permaneceram verdes.

### Correção
O catch final agora emite:

`sendAudioLog('warn', 'AUDIO_ERROR_FAILED', 'Falha ao preparar ou agendar o áudio de erro.', audioErrorExtra(error))`

sem rethrow, preservando a UI e tornando a falha observável com `originTabId`, `errorName` e `errorMessage`.

### Prova pós-fix final
PR draft #75, run `36955311711`:
- Node20 job `110676865237`: **SUCCESS — 2/2 suites, 26/26 testes**;
- Node22 job `110676865246`: **SUCCESS — 2/2 suites, 26/26 testes**;
- full content-scripts job `110676864994`: **SUCCESS — 40/40 suites, 445/445 testes**, com `--detectOpenHandles`.

## 7. Invariantes finais

- Um erro repetido não cria um novo contexto a cada ocorrência.
- Contexto `closed` nunca é reutilizado.
- Contexto `suspended` nunca recebe scheduling antes de resume efetivo.
- Resume rejeitado/incompleto é observável e não gera notas.
- Falha síncrona do erro nunca é engolida silenciosamente.
- Falha do áudio não escapa do handler e não impede a drawer de erro.
- Cada nota tem oscillator/gain próprios e parâmetros corretos.
- Sucesso e erro obedecem ao mesmo lifecycle de contexto reutilizável.
- WebKit fallback permanece funcional.
- Não existem skips/only/TODO/FIXME usados para esconder pendências nesta suíte.

## 8. Evidência executável acumulada

| Revisão | Evidência |
|---|---|
| mirrors → runtime real | `36948794013`, focal 5/5 Node20+Node22 |
| lifecycle user gesture/closed | `36951292966`, focal 20/20 Node20+Node22; full 439/439 |
| 191-005 pre-fix | `36954506306`, vermelho específico em Node20+Node22 |
| 191-005 post-fix | `36954798257`, focal 23/23 Node20+Node22; full 442/442 |
| 191-006 pre-fix | `36955075188`, 2 falhas específicas de observabilidade Node20+Node22 |
| 191-006 post-fix | `36955311711`, focal 26/26 Node20+Node22; full 445/445 |

Todos os full-suite citados usam `--detectOpenHandles`.

## 9. Limites honestos

- JSDOM/mocks validam chamadas, parâmetros, estados e telemetria da Web Audio API; não medem saída física do hardware.
- Política de autoplay do Chromium é aproximada pelo estado/resume mockado, mas o teste de unlock usa clique DOM real do content script.
- A suíte relacionada continua cobrindo completion/hasErrors e telemetria adjacente.

## 10. Fonte integral exata

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

    test('erro com resume resolvido sem running registra skip e não cria notas', async () => {
        installRuntimeResponder({ tabId: 77 });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {},
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro ainda suspenso',
            imgIndex: 0,
            isDebug: false,
        });
        await delay(0);

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_SKIPPED',
            extra: expect.objectContaining({
                originTabId: 77,
                contextState: 'suspended',
            }),
        }));
    });

    test('erro sem AudioContext registra indisponibilidade e preserva a UI', async () => {
        installRuntimeResponder({ tabId: 78 });
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: undefined,
            configurable: true,
        });

        await loadOnePage();
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro sem API',
            imgIndex: 0,
            isDebug: false,
        });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNAVAILABLE',
            extra: expect.objectContaining({
                originTabId: 78,
                trigger: 'integrated_error',
            }),
        }));
        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
    });

    test('falha síncrona ao agendar som de erro é observável sem escapar do handler', async () => {
        installRuntimeResponder({ tabId: 79 });
        const { ctx } = createAudioContext({ state: 'running' });
        ctx.createOscillator = jest.fn(() => {
            throw new Error('error-oscillator-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await expect(dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro de oscillator',
            imgIndex: 0,
            isDebug: false,
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_FAILED',
            extra: expect.objectContaining({
                originTabId: 79,
                errorName: 'Error',
                errorMessage: 'error-oscillator-boom',
            }),
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

    test('falha ao criar AudioContext no erro é observável e não interrompe a UI', async () => {
        installRuntimeResponder({ tabId: 80 });
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
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_FAILED',
            extra: expect.objectContaining({
                originTabId: 80,
                errorName: 'Error',
                errorMessage: 'Policy violation',
            }),
        }));
    });
});
```

## 11. Cobertura integral por posições

- **1–25:** cabeçalho/imports/globals.
- **26–39:** delay/waitFor.
- **40–60:** listener real e dispatch.
- **61–82:** factories oscillator/gain.
- **83–107:** factory de AudioContext.
- **108–124:** `assertNote()`.
- **125–131:** abertura da suíte/estado.
- **132–150:** setup.
- **151–166:** teardown.
- **167–186:** runtime responder.
- **187–197:** `loadOnePage()`.
- **198–208:** `startBatch()`.
- **209–247:** erro básico real.
- **248–285:** dois erros / contexto único.
- **286–318:** erro suspended → resume.
- **319–357:** erro resume rejeitado.
- **358–422:** sucesso/arpejo/reuse.
- **423–460:** unlock positivo por clique.
- **461–500:** unlock recusado por clique.
- **501–539:** contexto closed.
- **540–568:** AudioContext indisponível no sucesso.
- **569–595:** sucesso resume sem running.
- **596–624:** falha de scheduling no sucesso.
- **625–658:** sucesso suspended gate.
- **659–691:** erro resume sem running.
- **692–722:** erro sem AudioContext.
- **723–753:** falha síncrona de scheduling do erro.
- **754–777:** fallback WebKit.
- **778–806:** falha de constructor no erro + UI/telemetria.
- **807:** LF final.

**Cobertura:** **807/807 posições**, contíguas, sem gap/overlap.

## 12. Reauditoria pós-correção

- Source/Bíblia vinculados ao mesmo SHA: confirmado.
- Runtime real, sem mirror principal: confirmado.
- 17 testes reais: confirmado.
- Red→green de 191-005: confirmado em Node20/22.
- Red→green de 191-006: confirmado em Node20/22.
- Full content-scripts: 40/40 suites, 445/445 testes, `--detectOpenHandles`.
- Skips/only/TODO/FIXME: nenhum.
- Pendência conhecida corrigível dentro do escopo de #191: **nenhuma**.

# Bíblia técnica — tests/unit/content-manga/audio-synthesis-full.test.js

> **Estado documental:** correções 191-007/191-008/191-009/191-010 aplicadas; revisão atual aguardando validação executável e novo par PRIMARY + ADVERSARIAL independente  
> **SHA auditado:** `668714d95b63e04ccc219e7170c8222609ce816c`  
> **Índice do corpus:** 191  
> **Tipo:** integração Jest real da síntese/lifecycle Web Audio de `content_manga.js`  
> **Linhas textuais:** **1157**  
> **Posições documentais:** **1158**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte #191 carrega o bundle Manga real via `loadContentScript()` e dispara os caminhos públicos que entram nas funções de áudio encapsuladas em `content_manga.js`.

Não há mirror local de `playErrorSound`/`playSuccessSound` como prova principal. O teste controla apenas a Web Audio API e as fronteiras Chrome necessárias para observar o runtime verdadeiro.

## 2. Dependências revalidadas

- `extension/content/content_manga.js`: `3601efd9a66f8408b724b42d008dc43d518dabe6`.
- `tests/unit/content-manga/replacement-and-completion-real.test.js`: `9dcd26cf4a963ab22c11f8535421603d83260572`.
- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `.github/workflows/audio-synthesis-selftest.yml`: `eb1bdf727d6dde90a8b8c3634fe0d724b0f09b6f`.

## 3. Cobertura funcional atual — 27 casos

1. `SHOW_ERROR_INTEGRATED executa playErrorSound real com dois nós independentes`
2. `erros consecutivos reutilizam um único AudioContext de notificação`
3. `erro com contexto suspended só agenda após resume concluir`
4. `erro registra falha de resume sem criar notas`
5. `BATCH_COMPLETE executa arpejo real por nota e reutiliza o mesmo AudioContext`
6. `clique real desbloqueia AudioContext suspended antes do lote`
7. `clique real registra falha de unlock sem impedir o início do lote`
8. `clique com contexto já running registra unlock sem chamar resume`
9. `clique com resume resolvido sem running registra unlock incompleto e inicia lote`
10. `clique com estado intermediário não chama resume e registra unlock incompleto`
11. `clique sem AudioContext registra indisponibilidade e ainda inicia o lote`
12. `falha síncrona do construtor no clique registra unlock failed e não bloqueia o lote`
13. `tradução individual por TRANSLATE_CONTEXT_IMAGE também executa unlock real`
14. `contexto closed é descartado e substituído no próximo BATCH_COMPLETE`
15. `BATCH_COMPLETE em estado interrupted registra skip sem tentar resume`
16. `falha do construtor no BATCH_COMPLETE registra AUDIO_SUCCESS_FAILED sem escapar`
17. `BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas`
18. `erro em estado interrupted registra skip sem tentar resume`
19. `AudioContext indisponível registra AUDIO_UNAVAILABLE sem agendar som`
20. `resume resolvido sem estado running não agenda som e registra skip`
21. `falha ao criar oscillator no sucesso é observável e não escapa do handler`
22. `contexto suspended só agenda sucesso depois de resume real completar`
23. `erro com resume resolvido sem running registra skip e não cria notas`
24. `erro sem AudioContext registra indisponibilidade e preserva a UI`
25. `falha síncrona ao agendar som de erro é observável sem escapar do handler`
26. `playErrorSound real usa webkitAudioContext quando AudioContext não existe`
27. `falha ao criar AudioContext no erro é observável e não interrompe a UI`

Os casos 8–12 fecham os branches restantes de `unlockNotificationAudio()` no clique do botão principal. O caso 13 protege o segundo call site real, `TRANSLATE_CONTEXT_IMAGE → startSingleImageTranslation() → unlockNotificationAudio()`. Os casos 15–17 fecham o 191-009. O caso 18 fecha o 191-010, cobrindo rejeição assíncrona de `resume()` no caminho de sucesso.

## 4. 191-001 — TEST_AUTHENTICITY — RESOLVED

Os mirrors foram removidos. A suíte executa `playErrorSound()`, `playSuccessSound()`, unlock e lifecycle dentro da closure real do content script.

## 5. 191-002 — STALE_TEST_CONTRACT — RESOLVED

A descrição e a prova incluem contexto reutilizável, estados relevantes, `resume()`, unlock por gesto e telemetria.

## 6. 191-003 — TEST_STRENGTH_REVIEW — RESOLVED

Cada chamada de `createOscillator()`/`createGain()` cria objeto distinto. Frequência, type, envelope, conexões, start e stop são validados por instância.

## 7. 191-004 — AUDIO_LIFECYCLE_BRANCH_GAP — RESOLVED

Foram adicionados casos reais para unlock, falha de unlock, substituição de contexto `closed`, API indisponível, resume incompleto e falha de scheduling.

## 8. 191-005 — AUDIO_CONTEXT_LEAK — RESOLVED COM RED→GREEN

A regressão provou que dois erros consecutivos criavam dois `AudioContext`. O runtime foi corrigido para compartilhar `notificationAudioContext` também no caminho de erro.

Evidência histórica:
- PR draft #72, run `36954506306`: falha esperada em Node 20/22.
- PR draft #76, run `36955506902`: regressão corrigida e verde.

## 9. 191-006 — ERROR_OBSERVABILITY — RESOLVED COM RED→GREEN

Falhas síncronas de preparação/agendamento do áudio de erro agora emitem `AUDIO_ERROR_FAILED` com `errorName`, `errorMessage` e origem, sem escapar para a UI.

Evidência histórica:
- PR draft #74, run `36955075188`: os dois regressions novos falharam como esperado.
- PR draft #76, run `36955506902`: ambos passaram.

## 10. 191-007 — AUDIO_UNLOCK_BRANCH_GAP — CORREÇÃO APLICADA

Foram adicionadas regressões pelo clique real para contexto já `running`, resume incompleto, estado `interrupted`, API ausente e falha síncrona do construtor. O caso `suspended → running` também passou a exigir `START_BATCH`.

## 11. 191-008 — AUDIO_UNLOCK_SECOND_CALLSITE_GAP — CORREÇÃO APLICADA

A tradução individual via `TRANSLATE_CONTEXT_IMAGE → startSingleImageTranslation()` agora possui regressão própria que exige `resume()`, `AUDIO_UNLOCKED` e `START_BATCH`. Remover esse segundo call site de `unlockNotificationAudio()` passa a quebrar a suíte focal.

## 12. 191-009 — AUDIO_STATE_BRANCH_GAP — CORREÇÃO APLICADA

A passagem adversarial identificou três branches restantes:
- `playSuccessSound()` com contexto em estado `interrupted`;
- `playErrorSound()` com contexto em estado `interrupted`;
- falha síncrona do construtor no caminho `BATCH_COMPLETE → playSuccessSound()`.

A revisão atual adiciona regressões que exigem:
- `AUDIO_SUCCESS_SKIPPED` sem `resume()`/notas no success interrupted;
- `AUDIO_ERROR_SKIPPED` sem `resume()`/notas no error interrupted, preservando a UI;
- `AUDIO_SUCCESS_FAILED` com nome/mensagem/origem quando o construtor falha, sem exceção escapar do handler.

## 13. 191-010 — AUDIO_SUCCESS_RESUME_REJECTION_GAP — CORREÇÃO APLICADA

A matriz ainda não protegia o branch próprio de `playSuccessSound()` em que o contexto está `suspended` e `resume()` rejeita.

A revisão atual adiciona `BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas`, que exige:

- `resume()` chamado exatamente uma vez;
- zero osciladores agendados;
- `AUDIO_SUCCESS_FAILED` com `originTabId`;
- preservação de `errorName=NotAllowedError` e da mensagem `success-resume-blocked`;
- nenhuma exceção escapando do handler público.

Isso fecha a assimetria entre rejeição de resume no unlock, erro e sucesso.

## 14. Evidência executável

### Baseline histórica

Workflow **Audio Synthesis Selftest**, run `36955506902`, commit `942281386ae6958f02ebccb36173c862af823b0a`:
- Node 20 job `110677469400`: 2/2 suítes, 26/26 testes PASS com `--detectOpenHandles`.
- Node 22 job `110677469562`: 2/2 suítes, 26/26 testes PASS com `--detectOpenHandles`.
- Full content-scripts job `110677469527`: 40/40 suítes, 445/445 testes PASS.
- A versão correspondente de #191 tinha 17/17 PASS.

### Revisão atual

A revisão `668714d95b63e04ccc219e7170c8222609ce816c` contém 27 testes. A prova final exige workflow verde desta revisão; runs anteriores são apenas baseline e não substituem a validação do SHA atual.

## 15. Reauditoria adversarial pós-correção

Matriz de ataques coberta estruturalmente:
- erro e sucesso em `running`;
- erro e sucesso em `suspended`;
- resume tardio, rejeitado e resolvido sem `running`;
- erro e sucesso em `interrupted`;
- contexto `closed` e recriação;
- ausência de AudioContext;
- fallback webkit;
- construtor falhando no erro, sucesso e unlock;
- oscillator falhando;
- dois erros consecutivos/reuso;
- unlock pelo botão principal;
- unlock por tradução individual;
- continuidade de `START_BATCH`;
- assertions por nó;
- callbacks assíncronos;
- ausência de skips/only/TODO/FIXME.

A correção está aplicada, mas a reauditoria final permanece **não concluída** até a CI do SHA atual.

## 16. Fonte integral exata

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

    async function loadOnePage(overrides = {}) {
        return loadContentScript({
            hostname: 'localhost',
            domImages: [{
                src: 'http://localhost/page-0.png',
                width: 800,
                height: 1200,
            }],
            ...overrides,
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
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
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

    test('clique com contexto já running registra unlock sem chamar resume', async () => {
        installRuntimeResponder({ tabId: 46 });
        const { ctx } = createAudioContext({ state: 'running' });
        const AudioContextMock = jest.fn(() => ctx);
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCKED'
            && message.extra?.originTabId === 46
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(ctx.resume).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_UNLOCKED',
            extra: expect.objectContaining({
                originTabId: 46,
                contextState: 'running',
            }),
        }));
    });

    test('clique com resume resolvido sem running registra unlock incompleto e inicia lote', async () => {
        installRuntimeResponder({ tabId: 47 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async () => {},
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_INCOMPLETE'
            && message.extra?.originTabId === 47
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('suspended');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_UNLOCK_INCOMPLETE',
            extra: expect.objectContaining({
                originTabId: 47,
                contextState: 'suspended',
            }),
        }));
    });

    test('clique com estado intermediário não chama resume e registra unlock incompleto', async () => {
        installRuntimeResponder({ tabId: 48 });
        const { ctx } = createAudioContext({ state: 'interrupted' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_INCOMPLETE'
            && message.extra?.originTabId === 48
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_UNLOCK_INCOMPLETE',
            extra: expect.objectContaining({
                originTabId: 48,
                contextState: 'interrupted',
            }),
        }));
    });

    test('clique sem AudioContext registra indisponibilidade e ainda inicia o lote', async () => {
        installRuntimeResponder({ tabId: 49 });
        Object.defineProperty(window, 'AudioContext', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'webkitAudioContext', {
            value: undefined,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNAVAILABLE'
            && message.extra?.originTabId === 49
            && message.extra?.trigger === 'reader_button'
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNAVAILABLE',
            extra: expect.objectContaining({
                originTabId: 49,
                trigger: 'reader_button',
            }),
        }));
    });

    test('falha síncrona do construtor no clique registra unlock failed e não bloqueia o lote', async () => {
        installRuntimeResponder({ tabId: 50 });
        const AudioContextMock = jest.fn(() => {
            throw new Error('unlock-constructor-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);

        document.getElementById('manga-main-content').click();

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCK_FAILED'
            && message.extra?.originTabId === 50
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_UNLOCK_FAILED',
            extra: expect.objectContaining({
                originTabId: 50,
                errorName: 'Error',
                errorMessage: 'unlock-constructor-boom',
            }),
        }));
    });

    test('tradução individual por TRANSLATE_CONTEXT_IMAGE também executa unlock real', async () => {
        installRuntimeResponder({ tabId: 51 });
        const { ctx } = createAudioContext({
            state: 'suspended',
            onResume: async (audioCtx) => {
                audioCtx.state = 'running';
            },
        });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage({ clickToTranslateEnabled: true });
        await delay(0);

        const result = await dispatchToContent(runtimeMock, {
            action: 'TRANSLATE_CONTEXT_IMAGE',
            srcUrl: 'http://localhost/page-0.png',
        });

        expect(result.response).toEqual({ ok: true, index: 0 });
        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_UNLOCKED'
            && message.extra?.originTabId === 51
        ));
        await waitFor(() => sentMessages.some(message =>
            message.action === 'START_BATCH'
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('running');
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'success',
            action_name: 'AUDIO_UNLOCKED',
            extra: expect.objectContaining({
                originTabId: 51,
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

    test('BATCH_COMPLETE em estado interrupted registra skip sem tentar resume', async () => {
        installRuntimeResponder({ tabId: 81 });
        const { ctx, oscillators } = createAudioContext({ state: 'interrupted' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        expect(ctx.resume).not.toHaveBeenCalled();
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_SUCCESS_SKIPPED',
            extra: expect.objectContaining({
                originTabId: 81,
                contextState: 'interrupted',
            }),
        }));
    });

    test('falha do construtor no BATCH_COMPLETE registra AUDIO_SUCCESS_FAILED sem escapar', async () => {
        installRuntimeResponder({ tabId: 82 });
        const AudioContextMock = jest.fn(() => {
            throw new Error('success-constructor-boom');
        });
        Object.defineProperty(window, 'AudioContext', {
            value: AudioContextMock,
            configurable: true,
        });

        await loadOnePage();
        await delay(0);
        await startBatch();

        await expect(dispatchToContent(runtimeMock, {
            action: 'BATCH_COMPLETE',
        })).resolves.toEqual({ keepAlive: undefined, response: undefined });

        expect(AudioContextMock).toHaveBeenCalledTimes(1);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_SUCCESS_FAILED',
            extra: expect.objectContaining({
                originTabId: 82,
                errorName: 'Error',
                errorMessage: 'success-constructor-boom',
            }),
        }));
    });

    test('BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas', async () => {
        installRuntimeResponder({ tabId: 84 });
        const { ctx, oscillators } = createAudioContext({
            state: 'suspended',
            onResume: async () => {
                throw Object.assign(new Error('success-resume-blocked'), {
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
        await startBatch();
        await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

        await waitFor(() => sentMessages.some(message =>
            message.action_name === 'AUDIO_SUCCESS_FAILED'
            && message.extra?.originTabId === 84
        ));

        expect(ctx.resume).toHaveBeenCalledTimes(1);
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'error',
            action_name: 'AUDIO_SUCCESS_FAILED',
            extra: expect.objectContaining({
                originTabId: 84,
                errorName: 'NotAllowedError',
                errorMessage: 'success-resume-blocked',
            }),
        }));
    });

    test('erro em estado interrupted registra skip sem tentar resume', async () => {
        installRuntimeResponder({ tabId: 83 });
        const { ctx, oscillators } = createAudioContext({ state: 'interrupted' });
        Object.defineProperty(window, 'AudioContext', {
            value: jest.fn(() => ctx),
            configurable: true,
        });

        await loadOnePage();
        await delay(0);
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'erro em estado interrupted',
            imgIndex: 0,
            isDebug: false,
        });

        expect(ctx.resume).not.toHaveBeenCalled();
        expect(oscillators).toHaveLength(0);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            source: 'audio',
            level: 'warn',
            action_name: 'AUDIO_ERROR_SKIPPED',
            extra: expect.objectContaining({
                originTabId: 83,
                contextState: 'interrupted',
            }),
        }));
        expect(document.getElementById('manga-error-line').style.display).toBe('flex');
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

## 17. Cobertura integral por posições

- **1–25:** cabeçalho/imports/globals.
- **26–39:** delay/wait.
- **40–60:** dispatch ao listener real.
- **61–82:** factories independentes de oscillator/gain.
- **83–107:** factory de AudioContext.
- **108–124:** assertion por nota.
- **125–209:** suíte, setup/cleanup, runtime responder e helpers de lote.
- **210–248:** caso 1 — `SHOW_ERROR_INTEGRATED executa playErrorSound real com dois nós independentes`.
- **249–286:** caso 2 — `erros consecutivos reutilizam um único AudioContext de notificação`.
- **287–319:** caso 3 — `erro com contexto suspended só agenda após resume concluir`.
- **320–358:** caso 4 — `erro registra falha de resume sem criar notas`.
- **359–423:** caso 5 — `BATCH_COMPLETE executa arpejo real por nota e reutiliza o mesmo AudioContext`.
- **424–464:** caso 6 — `clique real desbloqueia AudioContext suspended antes do lote`.
- **465–504:** caso 7 — `clique real registra falha de unlock sem impedir o início do lote`.
- **505–539:** caso 8 — `clique com contexto já running registra unlock sem chamar resume`.
- **540–576:** caso 9 — `clique com resume resolvido sem running registra unlock incompleto e inicia lote`.
- **577–609:** caso 10 — `clique com estado intermediário não chama resume e registra unlock incompleto`.
- **610–645:** caso 11 — `clique sem AudioContext registra indisponibilidade e ainda inicia o lote`.
- **646–681:** caso 12 — `falha síncrona do construtor no clique registra unlock failed e não bloqueia o lote`.
- **682–724:** caso 13 — `tradução individual por TRANSLATE_CONTEXT_IMAGE também executa unlock real`.
- **725–763:** caso 14 — `contexto closed é descartado e substituído no próximo BATCH_COMPLETE`.
- **764–789:** caso 15 — `BATCH_COMPLETE em estado interrupted registra skip sem tentar resume`.
- **790–820:** caso 16 — `falha do construtor no BATCH_COMPLETE registra AUDIO_SUCCESS_FAILED sem escapar`.
- **821–859:** caso 17 — `BATCH_COMPLETE com resume rejeitado registra AUDIO_SUCCESS_FAILED sem agendar notas`.
- **860–890:** caso 18 — `erro em estado interrupted registra skip sem tentar resume`.
- **891–919:** caso 19 — `AudioContext indisponível registra AUDIO_UNAVAILABLE sem agendar som`.
- **920–946:** caso 20 — `resume resolvido sem estado running não agenda som e registra skip`.
- **947–975:** caso 21 — `falha ao criar oscillator no sucesso é observável e não escapa do handler`.
- **976–1009:** caso 22 — `contexto suspended só agenda sucesso depois de resume real completar`.
- **1010–1042:** caso 23 — `erro com resume resolvido sem running registra skip e não cria notas`.
- **1043–1073:** caso 24 — `erro sem AudioContext registra indisponibilidade e preserva a UI`.
- **1074–1104:** caso 25 — `falha síncrona ao agendar som de erro é observável sem escapar do handler`.
- **1105–1128:** caso 26 — `playErrorSound real usa webkitAudioContext quando AudioContext não existe`.
- **1129–1157:** caso 27 — `falha ao criar AudioContext no erro é observável e não interrompe a UI`.
- **1158:** LF terminal.

**Cobertura documental:** **1158/1158 posições**, contíguas e sem overlap.

## 18. Pontuação provisória pós-correção

- Correção funcional: **25/25**
- Robustez adversarial: **18/20**
- Cobertura/testes: **18/20**
- Regressões/compatibilidade: **15/15**
- Tratamento de erros: **10/10**
- Qualidade estrutural: **5/5**
- Documentação/coerência: **5/5**

**TOTAL PROVISÓRIO: 96/100.**

Os 4 pontos restantes correspondem à validação executável da revisão atual e ao gate distribuído independente. Não declarar 100/100 antes dessas evidências.

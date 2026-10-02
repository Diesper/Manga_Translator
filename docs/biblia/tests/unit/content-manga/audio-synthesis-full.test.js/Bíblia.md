# Bíblia técnica — tests/unit/content-manga/audio-synthesis-full.test.js

> **Estado documental:** ✅ REAUDIT FINAL APROVADA — 100/100 COM EVIDÊNCIA EXECUTÁVEL  
> **SHA auditado:** `0a2fa6dd4024d64e21225a4dc329f0915abd4bdb`  
> **Índice do corpus:** 191  
> **Tipo:** integração Jest real do Web Audio de `content_manga.js`  
> **Linhas textuais:** **806**  
> **Posições documentais:** **807**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é a prova focal do áudio real da aba leitora. Ela carrega `content_manga.js` pela ordem do `manifest.json` e aciona `playErrorSound()`, `unlockNotificationAudio()`, `playSuccessSound()` e o lifecycle compartilhado de `notificationAudioContext` pelos caminhos públicos do content script.

Não há mirror local de `playErrorSound()`/`playSuccessSound()`, nem import de `extracted-functions.js` como prova.

## 2. Dependências revalidadas

- `extension/content/content_manga.js`: `3601efd9a66f8408b724b42d008dc43d518dabe6`.
- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `tests/unit/content-manga/replacement-and-completion-real.test.js`: `9dcd26cf4a963ab22c11f8535421603d83260572`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- `package.json`: `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`.

## 3. Harness real e invariantes

`loadContentScript()` carrega os módulos de produção, registra o listener real de runtime e usa JSDOM/Chrome mocks apenas nas fronteiras de navegador.

O harness exige:

- exatamente um listener do content script;
- batches novos identificados por incremento real de `START_BATCH`;
- oscillators e gains distintos por chamada;
- validação por nó de frequência, tipo, envelope, grafo, start e stop;
- restauração de `AudioContext`/`webkitAudioContext` após cada caso;
- ausência de `.skip`, `.only`, `xit`, `xdescribe`, TODO ou FIXME.

## 4. Matriz final — 17 casos reais

1. `SHOW_ERROR_INTEGRATED` executa o som de erro real com dois nós independentes.
2. Dois erros consecutivos reutilizam **um único** `AudioContext`.
3. Erro em contexto `suspended` só agenda após `resume()` concluir.
4. Rejeição de `resume()` no erro emite `AUDIO_ERROR_FAILED` e não cria notas.
5. `BATCH_COMPLETE` agenda 660/880/1100 Hz e reutiliza o contexto.
6. Clique real desbloqueia contexto suspenso e emite `AUDIO_UNLOCKED`.
7. Falha de unlock por clique é observável e não impede o lote.
8. Contexto `closed` é descartado e substituído.
9. API Web Audio indisponível em sucesso emite `AUDIO_UNAVAILABLE`.
10. `resume()` de sucesso que não chega a `running` emite `AUDIO_SUCCESS_SKIPPED`.
11. Falha de `createOscillator()` no sucesso emite `AUDIO_SUCCESS_FAILED`.
12. Sucesso suspenso só agenda depois de `resume()`.
13. Erro cujo `resume()` resolve mas permanece suspenso emite `AUDIO_ERROR_SKIPPED`.
14. Erro sem `AudioContext` preserva UI e emite `AUDIO_UNAVAILABLE`.
15. Falha síncrona de scheduling do erro emite `AUDIO_ERROR_FAILED`.
16. Fallback `webkitAudioContext` continua funcional.
17. Falha do construtor `AudioContext` no erro é observável e não interrompe a UI.

## 5. Requests 191-001..004

### 191-001 — TEST_AUTHENTICITY — RESOLVED

Mirrors foram removidos e os paths reais de erro/sucesso são exercitados.

### 191-002 — STALE_TEST_CONTRACT — RESOLVED

O contrato da suíte corresponde ao lifecycle atual: reuse, closed, suspended/resume, gesture unlock e telemetria.

### 191-003 — TEST_STRENGTH_REVIEW — RESOLVED

Cada oscillator/gain é uma instância distinta e cada nota é validada individualmente.

### 191-004 — AUDIO_LIFECYCLE_BRANCH_GAP — RESOLVED

Clique real, rejeição de unlock, contexto closed, API indisponível, resume incompleto e falha de scheduling foram materializados e validados.

Evidência histórica final antes da nova REAUDIT: run `36951292966`, focal Node 20/22 verde e full content-scripts 40/40 suites, 439/439 testes.

## 6. 191-005 — AUDIO_CONTEXT_LEAK

### Finding da REAUDIT

`playErrorSound()` criava um `new AudioContext()` para cada erro, contradizendo o lifecycle de contexto único do próprio runtime e podendo atingir o limite de AudioContexts do Chromium.

### Prova pre-fix

PR draft #72, run `36954506306`:

- Node 20 job `110674388356`: regression falhou — esperado 1 construção, recebido 2.
- Node 22 job `110674388455`: mesma falha.
- Os demais 20 testes focais/relacionados passaram.

### Correção

`playErrorSound()` passou a usar `getLoggedNotificationAudioContext('integrated_error')`, compartilhando `notificationAudioContext` com o lifecycle de sucesso.

Também trata `running`, `suspended → resume`, resume rejeitado e estado ainda indisponível.

### Prova pós-fix intermediária

PR draft #73, run `36954798257`:

- Node 20 `110675268570`: PASS;
- Node 22 `110675268644`: PASS;
- full content-scripts `110675268412`: **40/40 suites, 442/442 testes PASS** com `--detectOpenHandles`.

## 7. 191-006 — ERROR_OBSERVABILITY

### Finding da REAUDIT

Mesmo após 191-005, `playErrorSound()` terminava com `catch (e) {}`. Falhas síncronas do construtor ou de `createOscillator()/createGain()` eram engolidas.

### Prova pre-fix

PR draft #74, run `36955075188`:

- Node 20 `110676149604`: **2 falhas / 24 passes**;
- Node 22 `110676149544`: **2 falhas / 24 passes**;
- falharam somente:
  - scheduling síncrono do erro sem `AUDIO_ERROR_FAILED`;
  - construtor de `AudioContext` sem `AUDIO_ERROR_FAILED`.

### Correção

O catch final agora emite:

- `source: audio`;
- `level: warn`;
- `action_name: AUDIO_ERROR_FAILED`;
- `errorName/errorMessage` via `audioErrorExtra()`;
- `originTabId` pela telemetria comum;

sem rethrow e sem impedir a UI integrada de erro.

### Prova pós-fix final — PASS

PR draft #75, run `36955311711`:

- Node 20 job `110676865237`: **PASS — 2/2 suites, 26/26 testes**;
- Node 22 job `110676865246`: **PASS — 2/2 suites, 26/26 testes**;
- full content-scripts job `110676864994`: **PASS — 40/40 suites, 445/445 testes**, com `--detectOpenHandles`.

Os dois regressions que falharam no pre-fix #74 passaram no pós-fix #75. Não restou falha conhecida corrigível dentro do escopo de #191.

## 8. Reauditoria adversarial final

Passagem A — “como deveria funcionar”:

- um contexto de notificação por página, recriado apenas se `closed`;
- som de erro: 300/150 Hz;
- som de sucesso: 660/880/1100 Hz;
- `suspended` exige resume antes de scheduling;
- falhas devem ser observáveis sem derrubar o handler/UI.

Passagem B — “como quebrar”:

- erro repetido;
- contexto closed;
- API ausente;
- fallback WebKit;
- resume rejeitado;
- resume resolvido sem `running`;
- scheduling síncrono falhando;
- construtor falhando;
- clique real sob política de autoplay;
- segundo lote sem reutilizar `START_BATCH` antigo.

Resultado estático da revisão atual:

- skips/only/TODO/FIXME: **0**;
- mirrors de áudio como prova: **0**;
- testes focais reais: **17**;
- syntax parse: **PASS**;
- source de teste: `0a2fa6dd4024d64e21225a4dc329f0915abd4bdb`;
- runtime de áudio: `3601efd9a66f8408b724b42d008dc43d518dabe6`.

## 9. Pontuação final

- **Correção funcional:** 25/25
- **Robustez adversarial:** 20/20
- **Cobertura/testes:** 20/20
- **Regressões/compatibilidade:** 15/15
- **Tratamento de erros:** 10/10
- **Qualidade estrutural:** 5/5
- **Documentação/coerência:** 5/5

**TOTAL: 100/100**

Justificativa objetiva:

- 17 casos focais reais, sem mirrors como prova principal;
- red→green explícito para leak de AudioContext e exceções engolidas;
- Node 20/22 verdes;
- suíte relacionada verde;
- full content-scripts 40/40 e 445/445 com detecção de open handles;
- zero skip/only/TODO/FIXME;
- source/Bíblia sincronizados;
- nenhuma request 191-001..006 permanece corrigível ou sem evidência.

## 10. Limites honestos

- O Web Audio é mockado: a prova valida API calls/lifecycle, não pressão física em hardware.
- JSDOM não replica integralmente políticas de autoplay do Chromium; o clique real no DOM + estados/resume simulam o contrato que o content script observa.
- O lifecycle do contexto é por página/isolated world; teardown físico final do browser é responsabilidade da destruição do contexto da página.
- A suíte relacionada continua necessária para completion/hasErrors e fluxos de replacement que não pertencem à síntese focal.

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

## 12. Cobertura integral por posições

- **1–10:** cabeçalho/escopo.
- **11–25:** imports e globals.
- **26–39:** delay/waitFor bounded.
- **40–47:** listener real.
- **48–60:** dispatch real.
- **61–71:** oscillator factory.
- **72–82:** gain factory.
- **83–107:** AudioContext factory/registries.
- **108–124:** assertion por nota.
- **125–131:** suíte/estado.
- **132–150:** setup.
- **151–166:** teardown/descriptors.
- **167–186:** responder de runtime.
- **187–197:** loadOnePage.
- **198–208:** startBatch com incremento de START_BATCH.
- **209–247:** erro real / duas notas independentes.
- **248–285:** dois erros / contexto único.
- **286–318:** erro suspended → resume → scheduling.
- **319–357:** erro / resume rejeitado.
- **358–422:** sucesso real / arpejo / reuse / telemetria.
- **423–460:** user-gesture unlock positivo.
- **461–500:** user-gesture unlock rejeitado.
- **501–539:** closed → novo contexto.
- **540–568:** API indisponível no sucesso.
- **569–595:** resume de sucesso sem running.
- **596–624:** scheduling de sucesso falha observável.
- **625–658:** sucesso suspended → resume.
- **659–691:** erro resume sem running → skipped.
- **692–722:** erro sem API → unavailable + UI.
- **723–753:** scheduling síncrono de erro → failed.
- **754–777:** fallback webkit.
- **778–806:** construtor falha → failed + UI preservada.
- **807:** posição vazia do LF final.

**Cobertura:** **807/807 posições**, contíguas, sem gap ou overlap.

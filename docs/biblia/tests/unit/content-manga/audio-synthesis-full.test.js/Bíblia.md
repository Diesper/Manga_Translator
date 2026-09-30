# Bíblia técnica — tests/unit/content-manga/audio-synthesis-full.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `e53e43da4f20d727355666e444f0adf0428fc6dc`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest de síntese de áudio baseada em mirrors/helpers extraídos  
> **Linhas textuais:** 225  
> **Posições documentais:** 226, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte descreve a forma de onda esperada para os sons de erro e sucesso do fluxo de tradução.

Ela **não importa as funções de áudio reais de `extension/content/content_manga.js`**.

O teste usa dois objetos diferentes:

- `playErrorSound` importado de `tests/helpers/extracted-functions.js`, helper que declara explicitamente reimplementar a função de produção;
- `playSuccessSound` redefinido localmente dentro desta própria suíte como espelho histórico.

Logo, a evidência deste arquivo deve ser lida como **prova direta dos mirrors** e apenas evidência indireta/estrutural do runtime.

## 2. Som de erro — mirror extraído

`playErrorSound` vem de `tests/helpers/extracted-functions.js`.

O helper cria dois pulsos:

- sawtooth;
- 300 Hz em t=0;
- 150 Hz em t=0.2;
- fade-in até 0.4 em +0.04 s;
- fade-out exponencial até 0.001 em +0.28 s;
- stop em +0.3 s.

A implementação atual de `content_manga.js` ainda possui a mesma estrutura de síntese, mas o teste não executa aquela closure real.

## 3. Casos de erro provados no mirror

A suíte prova no helper extraído:

- exatamente 2 chamadas de `createOscillator`;
- exatamente 2 chamadas de `createGain`;
- tipo final sawtooth;
- frequências 300 e 150;
- ordem 300 antes de 150;
- rampas de ganho;
- starts em 0 e 0.2;
- stops em 0.3 e 0.5;
- exceção do factory é absorvida;
- fallback `webkitAudioContext`;
- conexão osc → gain → destination.

Essas assertions são diretas para o helper.

## 4. Limitação dos mocks de áudio

`makeAudioMocks()` usa:

```js
createOscillator: jest.fn().mockReturnValue(mockOsc)
createGain: jest.fn().mockReturnValue(mockGain)
```

Ou seja, as duas/três notas reutilizam o **mesmo objeto mock**.

Isso permite provar a sequência agregada de chamadas, mas não prova que cada oscilador individual recebeu exatamente sua própria frequência, type, conexão e envelope.

## 5. Som de sucesso — mirror local

O `playSuccessSound(audioCtxFactory)` desta suíte é definido no próprio teste.

Ele modela:

- 3 osciladores sine;
- 660 / 880 / 1100 Hz;
- delays 0 / 0.18 / 0.36;
- envelope 0 → 0.4 → 0.001;
- stop após 0.3 s;
- catch silencioso.

Esse era compatível com a forma de onda histórica, mas já não representa todo o lifecycle atual.

## 6. Divergência do runtime atual

O `playSuccessSound()` real em `content_manga.js` hoje:

1. obtém contexto via `getLoggedNotificationAudioContext('batch_complete')`;
2. reutiliza um único `notificationAudioContext`;
3. trata estados `running`, `suspended` e outros;
4. chama `resume()` quando suspenso;
5. só agenda notas após contexto estar `running`;
6. registra `AUDIO_CONTEXT_CREATED`, `AUDIO_SUCCESS_SCHEDULED`, `AUDIO_SUCCESS_FINISHED`, `AUDIO_SUCCESS_SKIPPED` e `AUDIO_SUCCESS_FAILED`;
7. sanitiza detalhes de erro;
8. evita som de sucesso quando o lote encerra com erros.

Nada disso existe no mirror local de #191.

## 7. Cobertura real existente fora desta suíte

`tests/unit/content-manga/replacement-and-completion-real.test.js` carrega o content script real e cobre, entre outros pontos:

- reutilização de um único `AudioContext` entre lotes;
- 6 osciladores para dois lotes bem-sucedidos;
- `AUDIO_CONTEXT_CREATED`;
- `AUDIO_SUCCESS_SCHEDULED`;
- supressão do som quando `BATCH_COMPLETE.hasErrors=true`;
- falha de `resume()` com `AUDIO_SUCCESS_FAILED`;
- metadados da aba de origem.

Assim, a divergência deste arquivo não significa ausência global de cobertura do som de sucesso.

## 8. Polyfill

O bloco `webkitAudioContext` testa apenas o helper extraído de erro.

Ele não prova diretamente:

- `getNotificationAudioContext()` real;
- fallback webkit do contexto reutilizável de sucesso;
- comportamento do content script completo em navegador sem `AudioContext`.

## 9. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| helper playErrorSound cria 2 osciladores/gains | testes do mirror | ✅ PROVADO DIRETAMENTE — helper |
| helper usa sawtooth 300→150 | testes do mirror | ✅ PROVADO DIRETAMENTE — helper |
| helper usa envelopes/tempos esperados | testes do mirror | ✅ PROVADO DIRETAMENTE — helper |
| helper absorve erro | teste do mirror | ✅ PROVADO DIRETAMENTE — helper |
| helper usa webkitAudioContext | teste do mirror | ✅ PROVADO DIRETAMENTE — helper |
| runtime real de erro mantém forma equivalente | comparação estática com content_manga.js | 🟦 GATE ESTÁTICO / NÃO EXECUTADO AQUI |
| mirror local de sucesso cria 3 notas sine | testes locais | ✅ PROVADO DIRETAMENTE — mirror |
| runtime real reutiliza AudioContext | outra suíte real | 🟨 PROVADO EM OUTRA SUÍTE |
| runtime real trata suspended/resume | outra suíte real | 🟨 PROVADO EM OUTRA SUÍTE |
| runtime real emite telemetria de sucesso/falha | outra suíte real | 🟨 PROVADO EM OUTRA SUÍTE |
| #191 prova lifecycle atual de playSuccessSound | não | ⚠️ NÃO PROVADO |
| cada oscilador individual recebe parâmetros próprios | mocks compartilhados | ⚠️ ASSERTION NÃO ISOLA INSTÂNCIAS |

## 10. Solicitações ao auditor

### 191-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** #191 não executa nenhuma das duas funções reais de áudio da closure de `content_manga.js`.

**Evidência atual:** helper/mirror reproduzem a síntese histórica; outra suíte real cobre boa parte do sucesso atual.

**Evidência ausente:** execução real específica de `playErrorSound` e seus parâmetros de onda/envelope.

**Ação solicitada:** adicionar teste pelo content script real que provoque `showIntegratedError(..., imgIndex)` e verifique os osciladores do erro, ou refatorar a síntese para módulo testável canônico.

**Evidência esperada:** alteração na forma real de erro torna teste vermelho sem depender de atualizar mirror manualmente.

**Risco:** helper e produção podem divergir silenciosamente.

**Severidade:** HIGH.

### 191-002 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** o cabeçalho afirma testar ambos os sons de `content_manga.js`, mas o `playSuccessSound` local não inclui o lifecycle atual de contexto reutilizável, estados, resume e telemetria.

**Evidência atual:** forma de onda 660/880/1100 continua compatível com `scheduleSuccessSound`.

**Ação solicitada:** renomear o escopo para “forma de onda/mirror” ou remover o mirror de sucesso em favor da suíte real já existente; se mantido, sincronizar somente a parte de síntese, sem fingir cobrir lifecycle.

**Evidência esperada:** descrição do teste alinhada ao objeto realmente executado.

**Risco:** manutenção pode interpretar esta suíte como cobertura completa e ignorar divergência do runtime.

**Severidade:** HIGH.

### 191-003 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** todas as notas reutilizam o mesmo `mockOsc` e `mockGain`.

**Evidência atual:** contagem e sequência agregada de chamadas são verificadas.

**Evidência ausente:** associação por instância entre cada nota e seus parâmetros/conexões.

**Ação solicitada:** fazer `createOscillator/createGain` retornarem objetos distintos por chamada e validar cada par individualmente.

**Evidência esperada:** cada oscilador possui frequência, tipo, envelope, start/stop e conexões esperados.

**Risco:** erro de wiring por nota pode permanecer verde desde que a sequência agregada pareça correta.

**Severidade:** NORMAL.

## 11. Fonte integral auditada

```js
/**
 * audio-synthesis-full.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes completos de síntese de áudio procedural (Zero Dependency Asset).
 *
 * Testa AMBOS os sons implementados no content_manga.js v3.1:
 * 1. playErrorSound()  — dois pulsos sawtooth descendentes (300Hz → 150Hz)
 * 2. playSuccessSound() — arpejo ascendente sine (660Hz → 880Hz → 1100Hz)
 *
 * STATUS: Expande o audio-synthesis.test.js original (que só testava o som de erro)
 * e adiciona testes do som de sucesso (checkIfComplete) e testes de resiliência.
 *
 * MOTIVO: Documentação Seção 8 descreve os dois sons em detalhe. O teste original
 * não cobria o som de sucesso nem os edge cases de polyfill (webkitAudioContext).
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { playErrorSound } = require(path.join(ROOT, 'tests/helpers/extracted-functions.js'));

// ── Som de sucesso — espelho de checkIfComplete (content_manga.js) ────────────
function playSuccessSound(audioCtxFactory) {
    try {
        const audioCtx = audioCtxFactory
            ? audioCtxFactory()
            : new (window.AudioContext || window.webkitAudioContext)();

        [[660, 0], [880, 0.18], [1100, 0.36]].forEach(([freq, delay]) => {
            const osc  = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
            gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
            gain.gain.linearRampToValueAtTime(0.4,   audioCtx.currentTime + delay + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.28);
            osc.start(audioCtx.currentTime + delay);
            osc.stop(audioCtx.currentTime  + delay + 0.3);
        });
    } catch (e) { /* silencioso por design */ }
}

describe('Síntese de Áudio Procedural — Cobertura Completa', () => {

    let mockOsc, mockGain, mockCtx;

    function makeAudioMocks() {
        mockOsc = {
            connect: jest.fn(),
            start: jest.fn(),
            stop: jest.fn(),
            frequency: { setValueAtTime: jest.fn() },
            type: '',
        };
        mockGain = {
            connect: jest.fn(),
            gain: {
                setValueAtTime: jest.fn(),
                linearRampToValueAtTime: jest.fn(),
                exponentialRampToValueAtTime: jest.fn(),
            },
        };
        mockCtx = {
            createOscillator: jest.fn().mockReturnValue(mockOsc),
            createGain: jest.fn().mockReturnValue(mockGain),
            destination: {},
            currentTime: 0,
        };
        return () => mockCtx;
    }

    // ── playErrorSound ────────────────────────────────────────────────────────

    describe('playErrorSound() — Dois pulsos sawtooth descendentes', () => {
        test('cria exatamente 2 osciladores e 2 gains', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
            expect(mockCtx.createGain).toHaveBeenCalledTimes(2);
        });

        test('usa onda sawtooth (timbre áspero de alerta)', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            // O último valor de type atribuído deve ser sawtooth
            expect(mockOsc.type).toBe('sawtooth');
        });

        test('frequências descendentes: 300Hz (pulso 1) e 150Hz (pulso 2)', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            const freqCalls = mockOsc.frequency.setValueAtTime.mock.calls;
            const freqs = freqCalls.map(c => c[0]);
            expect(freqs).toContain(300);
            expect(freqs).toContain(150);
        });

        test('300Hz vem antes de 150Hz (padrão descendente)', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            const calls = mockOsc.frequency.setValueAtTime.mock.calls;
            const freq300idx = calls.findIndex(c => c[0] === 300);
            const freq150idx = calls.findIndex(c => c[0] === 150);
            expect(freq300idx).toBeLessThan(freq150idx);
        });

        test('fade-in linear de 40ms (evita click mecânico)', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            expect(mockGain.gain.linearRampToValueAtTime)
                .toHaveBeenCalledWith(0.4, 0.04);
        });

        test('fade-out exponencial de 240ms (decaimento natural)', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            expect(mockGain.gain.exponentialRampToValueAtTime)
                .toHaveBeenCalledWith(0.001, 0.28);
        });

        test('oscilador começa em t=0 e t=0.2 (dois pulsos com 200ms de intervalo)', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            const startCalls = mockOsc.start.mock.calls.map(c => c[0]);
            expect(startCalls).toContain(0);
            expect(startCalls).toContain(0.2);
        });

        test('oscilador para em t=0.3 e t=0.5', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            const stopCalls = mockOsc.stop.mock.calls.map(c => c[0]);
            expect(stopCalls).toContain(0.3);
            expect(stopCalls).toContain(0.5);
        });

        test('silencioso se AudioContext lançar exceção', () => {
            const failFactory = () => { throw new Error('Not allowed'); };
            expect(() => playErrorSound(failFactory)).not.toThrow();
        });
    });

    // ── playSuccessSound ──────────────────────────────────────────────────────

    describe('playSuccessSound() — Arpejo sine ascendente', () => {
        test('cria exatamente 3 osciladores e 3 gains', () => {
            const factory = makeAudioMocks();
            playSuccessSound(factory);
            expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
            expect(mockCtx.createGain).toHaveBeenCalledTimes(3);
        });

        test('usa onda sine (timbre suave de notificação)', () => {
            const factory = makeAudioMocks();
            playSuccessSound(factory);
            expect(mockOsc.type).toBe('sine');
        });

        test('frequências ascendentes: 660Hz → 880Hz → 1100Hz (proporção 3:4:5)', () => {
            const factory = makeAudioMocks();
            playSuccessSound(factory);
            const freqCalls = mockOsc.frequency.setValueAtTime.mock.calls;
            const freqs = freqCalls.map(c => c[0]);
            expect(freqs).toContain(660);
            expect(freqs).toContain(880);
            expect(freqs).toContain(1100);
        });

        test('delays de 0ms, 180ms e 360ms (arpejo com sobreposição)', () => {
            const factory = makeAudioMocks();
            playSuccessSound(factory);
            const startCalls = mockOsc.start.mock.calls.map(c => c[0]);
            expect(startCalls).toContain(0);
            expect(startCalls).toContain(0.18);
            expect(startCalls).toContain(0.36);
        });

        test('silencioso se AudioContext lançar exceção', () => {
            const failFactory = () => { throw new Error('Policy violation'); };
            expect(() => playSuccessSound(failFactory)).not.toThrow();
        });
    });

    // ── Polyfill webkitAudioContext ───────────────────────────────────────────

    describe('Compatibilidade com polyfill webkitAudioContext', () => {
        beforeEach(() => {
            delete window.AudioContext;
            window.webkitAudioContext = jest.fn().mockImplementation(() => mockCtx);
            makeAudioMocks();
        });

        afterEach(() => {
            delete window.webkitAudioContext;
        });

        test('playErrorSound usa webkitAudioContext quando AudioContext não existe', () => {
            // Não passa factory — usa o global
            expect(() => playErrorSound()).not.toThrow();
            expect(window.webkitAudioContext).toHaveBeenCalled();
        });
    });

    // ── Conexão do grafo de áudio ─────────────────────────────────────────────

    describe('Grafo de áudio: osc → gain → destination', () => {
        test('oscilador se conecta ao gain', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            expect(mockOsc.connect).toHaveBeenCalledWith(mockGain);
        });

        test('gain se conecta ao destination', () => {
            const factory = makeAudioMocks();
            playErrorSound(factory);
            expect(mockGain.connect).toHaveBeenCalledWith(mockCtx.destination);
        });
    });
});
```

## 12. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–15 | objetivo e contexto histórico |
| 17–24 | imports/root/helper extraído |
| 26–48 | mirror local de playSuccessSound |
| 50–78 | mocks de AudioContext |
| 80–148 | testes do som de erro |
| 150–189 | testes do mirror de sucesso |
| 191–211 | fallback webkitAudioContext |
| 213–224 | grafo osc→gain→destination |
| 225 | fecha describe |
| posição 226 | newline final |

## 13. Autoauditoria do AGENTE 17

- [x] reserva #191 criada e relida;
- [x] state próprio criado;
- [x] helper extraído comparado ao runtime;
- [x] playSuccessSound atual comparado ao mirror;
- [x] cobertura real de replacement-and-completion-real.test.js consultada;
- [x] fonte integral incorporada;
- [x] 225 linhas + newline = 226 posições;
- [x] prova de mirror separada de prova de runtime;
- [x] três solicitações persistíveis identificadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #191 é útil como especificação de forma de onda, especialmente para o helper de erro, mas não deve ser tratado como “cobertura completa” do áudio real atual.

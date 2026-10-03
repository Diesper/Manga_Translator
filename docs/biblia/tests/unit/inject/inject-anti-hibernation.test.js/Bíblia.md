# Bíblia técnica — tests/unit/inject/inject-anti-hibernation.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `22cc82c2ea7bc2b5fb5d588a29af5895648f4fc4`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte Jest híbrida — mirrors locais + gates estáticos sobre `inject.js`  
> **Linhas textuais:** **276**  
> **Posições documentais:** **277**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

A suíte pretende documentar o sistema anti-hibernação executado no MAIN world do Gemini. Ela cobre guard de ativação/idempotência, spoof de visibilidade, supressão de eventos, fila rAF, política minimal/balanced/legacy e bypass de lazy loading.

Porém, conforme o próprio cabeçalho declara nas linhas 17–18, **o arquivo não executa `extension/content/inject.js`**. Parte dos testes lê o fonte como string; o restante reimplementa técnicas isoladas no JSDOM. Portanto a evidência é dividida entre gate estático específico e prova direta apenas do mirror/harness.

## 2. Implementação de produção correlata

`extension/content/inject.js` — SHA lido `21f7f6cf9c940a6de6e4fd72d4bf7eeb88e7a27c` — é injetado pelo manifest em `world: MAIN`, `run_at: document_start` para Gemini e localhost.

A implementação real atual contém, além dos itens simulados na suíte:
- guard `__anti_hibernation_injected`;
- isolamento por URL contendo `mangatranslator` ou `sessionStorage.mangatranslator_tab === 'true'`;
- persistência do modo anti-throttle em sessionStorage;
- API `window.__mangaTranslatorAntiThrottle`;
- eventos `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` e `..._PULSE`;
- focus cadence 0/5000/1000 ms;
- wrapper rAF com Map de callbacks, original rAF e cancelamento real;
- scheduler rAF por `setTimeout` 250/100/50 ms;
- `requestIdleCallback`/`cancelIdleCallback` adaptativos;
- áudio silencioso somente após gesto confiável;
- ponte de prompt, fetch autenticado de imagem e outras funções MAIN-world.

## 3. Guard e isolamento

O primeiro teste lê o fonte real e verifica que existe `if (!isTranslatorTab)` e que o antigo bypass por hostname localhost não existe. Isso é um **gate estático**, não execução do guard.

Os dois testes seguintes simulam um booleano em `window.__anti_hibernation_injected`, mas não executam o IIFE real; provam a lógica equivalente do mirror.

Não há teste de comportamento real para os dois caminhos de ativação (`href.includes('mangatranslator')` e sessionStorage) nem para o caso de manifest match em localhost sem marcador.

## 4. Visibilidade e supressão de eventos

Os testes demonstram que JSDOM permite redefinir `visibilityState`, `hidden` e `hasFocus`, e que `stopImmediatePropagation` em listeners capture pode impedir listeners posteriores.

Isso comprova a técnica no ambiente de teste, mas não que o `inject.js` real instalou os descriptors/listeners certos em MAIN world, nem que a página Gemini não sobrescreve esses hooks depois.

## 5. rAF: drift entre mirror e produção

A suíte modela `requestAnimationFrame` como array simples e `cancelAnimationFrame` como **stub vazio**. A produção atual é diferente:
- cada callback recebe um id e entra em `Map`;
- se o rAF original existe e a aba parece visível, ele também é agendado;
- o callback é removido do Map antes da chamada;
- `cancelAnimationFrame(id)` remove do Map **e chama o cancel original**;
- fallback é drenado por `scheduleRafFlush` recursivo via `setTimeout`, não por `setInterval` fixo.

Logo o teste `cancelAnimationFrame é stub` documenta um comportamento histórico que já não corresponde ao produto.

## 6. Política progressiva

Os quatro casos da seção progressiva são gates textuais: procuram nomes dos modos, valores de cadência, ausência do antigo setInterval de foco e ausência de ghost mousemove.

Eles não despacham o evento real de troca de modo, não verificam sessionStorage, não medem reprogramação de foco/rAF e não comprovam fallback de modo inválido para `minimal`.

## 7. Funcionalidades atuais não exercitadas

### requestIdleCallback
O cabeçalho cita `requestIdleCallback`, mas não existe um único teste da implementação ou de mirror equivalente. Ficam sem prova: timeout limitado ao modeBudget, caminho com idle original, cancelamento, `didTimeout`, `timeRemaining` e prevenção de execução dupla.

### Áudio após gesto real
O código real só cria AudioContext quando `e.isTrusted` e remove listeners após ativação. A suíte não cobre esse requisito.

### API/eventos de modo
Não há teste comportamental de `window.__mangaTranslatorAntiThrottle`, `SET_MODE`, `PULSE`, restauração de modo do sessionStorage ou mudança de focus interval.

### Lazy→eager
O último teste monta seu próprio MutationObserver e prova que a técnica de converter `loading=lazy` para `eager` funciona, mas não carrega o observer real de `inject.js`.

## 8. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| Fonte exige `isTranslatorTab` e não bypassa localhost por hostname | linhas 25–29 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Guard booleano evita setup no mirror | 33–61 | ✅ PROVADO DIRETAMENTE para o mirror |
| JSDOM permite spoof visibility/hidden/focus | 65–101 | ✅ PROVADO DIRETAMENTE para a técnica |
| stopImmediatePropagation/capture bloqueia listeners de teste | 105–139 | ✅ PROVADO DIRETAMENTE para o harness |
| fila rAF local drena e tolera callback com erro | 143–204 | ✅ PROVADO DIRETAMENTE para o mirror |
| cancel rAF real remove callback e chama cancel original | teste usa stub vazio | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| scheduler real usa cadence dinâmica 250/100/50 | source checks 243–253 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| troca de modo real reprograma focus cadence | não executado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| modo inválido volta para minimal | não executado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| modo persistido em sessionStorage é restaurado | não executado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ghost mousemove removido | linhas 232–241 procuram ausência/presença textual | 🟦 GATE ESTÁTICO ESPECÍFICO |
| requestIdleCallback/cancelIdleCallback reais | nenhuma cobertura | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| áudio exige evento trusted | nenhuma cobertura | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| MutationObserver mirror converte lazy→eager | 258–275 | ✅ PROVADO DIRETAMENTE para o mirror |
| MutationObserver real do MAIN-world realiza a conversão | `inject.js` não é executado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Riscos

**‘Cobertura completa’ é uma classificação excessiva.** O arquivo não carrega a unidade auditada e omite ramos atuais importantes.

**Mirror rAF está obsoleto.** O teste afirma cancelamento stub e flush por setInterval, enquanto produção tem Map/origCancelRaf/setTimeout progressivo.

**MAIN world é parte do contrato.** Técnicas que funcionam em JSDOM isolado podem se comportar diferente quando scripts da página compartilham os mesmos globals.

**Source-string tests são frágeis ao refactor.** Uma mudança semântica equivalente pode quebrar `toContain`, e uma string preservada em comentário pode fazê-lo passar sem preservar a execução.

## 10. Solicitações ao auditor

### 213-001 — TEST_CORRECTION — OPEN

**Encontrado:** a suíte se apresenta como cobertura completa de `inject.js`, mas deliberadamente não carrega a implementação real; vários testes são mirrors ou buscas textuais.

**Evidência atual:** linhas 17–18 do próprio cabeçalho declaram a abordagem espelho; busca no corpus não encontrou outra suíte executando os principais hooks MAIN-world.

**Evidência ausente:** execução controlada do `inject.js` real em um contexto compatível ou harness VM/JSDOM que valide seus efeitos reais.

**Necessário:** construir teste da implementação real ou reclassificar a suíte e seus títulos para deixar claro que são testes de técnica/gates estáticos.

**Risco:** mudanças no produto podem divergir dos mirrors e permanecer verdes.

**Severidade:** HIGH.

### 213-002 — TEST_CORRECTION — OPEN

**Encontrado:** o caso `cancelAnimationFrame é stub` e os comentários de flush por setInterval não correspondem ao `inject.js` atual, que usa Map, `origCancelRaf` e scheduler recursivo via setTimeout.

**Evidência atual:** source real linhas 139–180 versus mirror linhas 143–203.

**Evidência ausente:** cancelamento real impedindo execução pelo original e pelo fallback, inclusive race em que original rAF e fallback competem.

**Necessário:** substituir o mirror histórico por cenário contra o wrapper real e validar exactly-once/cancel.

**Risco:** callback cancelado pode executar, ou callback pode executar duas vezes, sem falha nesta suíte.

**Severidade:** HIGH.

### 213-003 — TEST_REQUIRED — OPEN

**Encontrado:** `requestIdleCallback/cancelIdleCallback`, API/eventos de modo, restauração do sessionStorage e áudio por gesto trusted são funcionalidades atuais sem prova nesta suíte.

**Evidência atual:** branches existem em `inject.js`; o teste só fixa strings de cadência e técnicas correlatas.

**Necessário:** adicionar cenários comportamentais para idle exactly-once/cancel/timeout, SET_MODE/PULSE, modo inválido/persistido e bloqueio de áudio por evento não trusted.

**Risco:** regressão no anti-throttling progressivo pode afetar estabilidade do Gemini sem cobertura.

**Severidade:** HIGH.

### 213-004 — TEST_MAINTENANCE — OPEN

**Encontrado:** cabeçalho diz ‘5 sistemas’ mas enumera 1–6; também afirma substituir stubs enquanto a própria suíte usa mirrors.

**Necessário:** atualizar texto/contagem depois de definir a estratégia de testes reais.

**Risco:** confusão documental e superestimação de cobertura.

**Severidade:** LOW.

## 11. Fonte integral exata

```js
const fs = require('fs');
const path = require('path');

/**
 * inject-anti-hibernation.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes completos do inject.js — Sistema Anti-Hibernação.
 *
 * Cobre os 5 sistemas implementados em inject.js:
 * 1. Falsificação de visibilidade (visibilityState, hidden, hasFocus)
 * 2. requestAnimationFrame/requestIdleCallback com cadência progressiva
 * 3. Supressão de eventos de blur/pagehide
 * 4. Modos minimal/balanced/legacy com foco apenas em escalada
 * 5. Ausência de ghost mousemove aleatório
 * 6. Guard de idempotência (__anti_hibernation_injected)
 *
 * ABORDAGEM: Testa a lógica de cada sistema isoladamente, sem carregar o inject.js
 * (que requer world:MAIN do Chrome). Usa implementações espelho verificáveis.
 *
 * STATUS: Substitui os stubs de raf-replacement.test.js e visibility-spoof.test.js.
 */

describe('INJ-01/INJ-02/INJ-03/INJ-04/INJ-05/INJ-06/INJ-07/INJ-08/INJ-09/INJ-10/INJ-11/INJ-12/INJ-13/INJ-14/INJ-15/INJ-16/INJ-17: inject.js — Sistema Anti-Hibernação (Cobertura Completa)', () => {

    test('a ativação exige o marcador explícito, inclusive em localhost', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../../extension/content/inject.js'), 'utf8');
        expect(source).toContain('if (!isTranslatorTab) {');
        expect(source).not.toContain("hostname.includes('127.0.0.1')");
    });

    // ── 1. Guard de Idempotência ──────────────────────────────────────────────

    describe('Guard __anti_hibernation_injected', () => {
        test('flag é definida na primeira injeção', () => {
            delete window.__anti_hibernation_injected;

            // Simula a lógica do guard
            if (!window.__anti_hibernation_injected) {
                window.__anti_hibernation_injected = true;
            }

            expect(window.__anti_hibernation_injected).toBe(true);
        });

        test('segunda injeção retorna cedo (sem re-executar)', () => {
            window.__anti_hibernation_injected = true;
            const setupFn = jest.fn();

            // Simula o IIFE com guard
            (function() {
                if (window.__anti_hibernation_injected) return;
                setupFn(); // Não deve ser chamado
            })();

            expect(setupFn).not.toHaveBeenCalled();
        });

        afterEach(() => {
            delete window.__anti_hibernation_injected;
        });
    });

    // ── 2. Falsificação de Visibilidade ──────────────────────────────────────

    describe('Falsificação de document.visibilityState', () => {
        test('Object.defineProperty pode sobrescrever visibilityState para "visible"', () => {
            // Testa que a técnica usada no inject.js funciona em JSDOM
            Object.defineProperty(document, 'visibilityState', {
                get: () => 'visible',
                configurable: true,
            });
            expect(document.visibilityState).toBe('visible');
        });

        test('document.hidden pode ser forçado para false', () => {
            Object.defineProperty(document, 'hidden', {
                get: () => false,
                configurable: true,
            });
            expect(document.hidden).toBe(false);
        });

        test('document.hasFocus pode retornar true sempre', () => {
            document.hasFocus = () => true;
            expect(document.hasFocus()).toBe(true);
        });

        afterEach(() => {
            // Limpa as sobrescritas — redefine para comportamento padrão
            try {
                Object.defineProperty(document, 'visibilityState', {
                    get: () => 'visible',
                    configurable: true,
                });
                Object.defineProperty(document, 'hidden', {
                    get: () => false,
                    configurable: true,
                });
            } catch(e) {}
        });
    });

    // ── 3. Supressão de Eventos ───────────────────────────────────────────────

    describe('Supressão de visibilitychange / blur / pagehide', () => {
        test('stopImmediatePropagation impede listeners subsequentes', () => {
            const stopProp = e => e.stopImmediatePropagation();
            window.addEventListener('blur', stopProp, true);

            const laterListener = jest.fn();
            window.addEventListener('blur', laterListener, true);

            // Dispara blur
            window.dispatchEvent(new Event('blur'));

            // laterListener não deve ter sido chamado
            expect(laterListener).not.toHaveBeenCalled();

            window.removeEventListener('blur', stopProp, true);
            window.removeEventListener('blur', laterListener, true);
        });

        test('capture:true intercepta ANTES de outros listeners', () => {
            const order = [];
            const captureHandler = e => { order.push('capture'); e.stopImmediatePropagation(); };
            const bubbleHandler  = () => order.push('bubble');

            window.addEventListener('visibilitychange', captureHandler, true);
            window.addEventListener('visibilitychange', bubbleHandler);

            document.dispatchEvent(new Event('visibilitychange'));

            expect(order).toEqual(['capture']); // bubble não chegou
            expect(order).not.toContain('bubble');

            window.removeEventListener('visibilitychange', captureHandler, true);
            window.removeEventListener('visibilitychange', bubbleHandler);
        });
    });

    // ── 4. Fila requestAnimationFrame ────────────────────────────────────────

    describe('Fila requestAnimationFrame drenável pelo anti-throttling', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('callbacks registrados via rAF customizado são executados pelo setInterval', () => {
            const rafCallbacks = [];
            const customRAF = function(cb) {
                rafCallbacks.push(cb);
                return rafCallbacks.length;
            };

            const cb1 = jest.fn();
            const cb2 = jest.fn();
            customRAF(cb1);
            customRAF(cb2);

            // Simula o setInterval de 100ms do inject.js
            const flush = () => {
                const cbs = rafCallbacks.splice(0);
                const now = 12345;
                cbs.forEach(cb => { try { cb(now); } catch(e) {} });
            };

            flush();
            expect(cb1).toHaveBeenCalledWith(12345);
            expect(cb2).toHaveBeenCalledWith(12345);
        });

        test('callbacks com erro não crasham o loop', () => {
            const rafCallbacks = [];
            const customRAF = cb => { rafCallbacks.push(cb); };
            customRAF(() => { throw new Error('crash'); });
            customRAF(jest.fn()); // callback saudável

            const flush = () => {
                const cbs = rafCallbacks.splice(0);
                cbs.forEach(cb => { try { cb(0); } catch(e) {} });
            };

            expect(() => flush()).not.toThrow();
        });

        test('cancelAnimationFrame é stub (não lança exceção)', () => {
            const cancelRAF = function() {}; // stub do inject.js
            expect(() => cancelRAF(99)).not.toThrow();
        });

        test('fila é esvaziada a cada tick do setInterval', () => {
            const rafCallbacks = [];
            const customRAF = cb => rafCallbacks.push(cb);

            customRAF(jest.fn());
            customRAF(jest.fn());
            expect(rafCallbacks).toHaveLength(2);

            // Flush
            const cbs = rafCallbacks.splice(0);
            cbs.forEach(cb => cb(0));

            expect(rafCallbacks).toHaveLength(0);
        });
    });

    // ── 5. Anti-throttling progressivo ────────────────────────────────────

    describe('Política progressiva minimal/balanced/legacy', () => {
        test('source define os três níveis e inicia em minimal', () => {
            const source = fs.readFileSync(
                path.resolve(__dirname, '../../../extension/content/inject.js'),
                'utf8'
            );

            expect(source).toContain("new Set(['minimal', 'balanced', 'legacy'])");
            expect(source).toContain("let antiThrottleMode = 'minimal'");
            expect(source).toContain('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE');
        });

        test('minimal não mantém intervalo periódico de foco', () => {
            const source = fs.readFileSync(
                path.resolve(__dirname, '../../../extension/content/inject.js'),
                'utf8'
            );

            expect(source).toContain('minimal: 0');
            expect(source).toContain('balanced: 5000');
            expect(source).toContain('legacy: 1000');
            expect(source).not.toContain('setInterval(dispatchFocusEvents, 1000)');
        });

        test('mousemove aleatório foi removido do anti-throttling', () => {
            const source = fs.readFileSync(
                path.resolve(__dirname, '../../../extension/content/inject.js'),
                'utf8'
            );

            expect(source).not.toContain("new MouseEvent('mousemove'");
            expect(source).not.toContain('Math.random() * (window.innerWidth');
            expect(source).toContain('Ghost mousemove removido');
        });

        test('cadência do rAF diminui no baseline e escala progressivamente', () => {
            const source = fs.readFileSync(
                path.resolve(__dirname, '../../../extension/content/inject.js'),
                'utf8'
            );

            expect(source).toContain('minimal: 250');
            expect(source).toContain('balanced: 100');
            expect(source).toContain('legacy: 50');
            expect(source).toContain('scheduleRafFlush');
        });
    });

    // ── 6. MutationObserver para lazy→eager ──────────────────────────────────

    describe('MutationObserver — lazy loading bypass', () => {
        test('converte img[loading=lazy] para eager ao adicionar ao DOM', (done) => {
            const img = document.createElement('img');
            img.setAttribute('loading', 'lazy');

            const observer = new MutationObserver(() => {
                document.querySelectorAll('img[loading="lazy"]').forEach(i => {
                    i.setAttribute('loading', 'eager');
                });
                expect(img.getAttribute('loading')).toBe('eager');
                observer.disconnect();
                done();
            });

            observer.observe(document.body, { childList: true, subtree: true });
            document.body.appendChild(img);
        });
    });
});
```

## 12. Cobertura documental por linha/posição

Faixas contíguas cobrindo **1–277**; 277 é o newline terminal.

### Posições 1–21 — imports e cabeçalho
Define escopo, enumera sistemas e declara explicitamente o uso de mirrors. **Evidência:** 🟦 editorial/estrutural.

### Posição 22 — separador
Linha vazia.

### Posições 23–29 — gate de ativação
Lê `inject.js` real e procura padrões de isolamento. **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO.

### Posição 30 — separador
Linha vazia.

### Posições 31–61 — guard mirror
Simula primeira/segunda injeção e cleanup. **Evidência:** ✅ mirror.

### Posição 62 — separador
Linha vazia.

### Posições 63–101 — visibility spoof
Redefine propriedades diretamente no JSDOM. **Evidência:** ✅ técnica, não execução do fonte.

### Posição 102 — separador
Linha vazia.

### Posições 103–139 — supressão de eventos
Cria listeners próprios e verifica stopImmediatePropagation/capture. **Evidência:** ✅ harness.

### Posição 140 — separador
Linha vazia.

### Posições 141–204 — fila rAF mirror
Array local, flush manual e cancel stub; difere do produto atual. **Evidência:** ✅ mirror / ⚠️ contrato real.

### Posição 205 — separador
Linha vazia.

### Posições 206–254 — política progressiva por strings
Verifica tokens/cadências/ausências no fonte. **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO.

### Posição 255 — separador
Linha vazia.

### Posições 256–275 — MutationObserver mirror
Observer local muda lazy para eager após append. **Evidência:** ✅ mirror.

### Posição 276 — fechamento
Fecha describe raiz. **Evidência:** 🟨 estrutural.

### Posição 277 — newline final
Terminador textual. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 13. Autoauditoria documental

- SHA do fonte reconfirmado imediatamente antes da escrita.
- Fonte integral incorporada do blob auditado.
- **277/277 posições** cobertas sem lacunas.
- Mirrors/gates foram separados de prova da implementação real.
- Nenhum arquivo externo foi alterado.
- Nenhuma execução de Jest foi alegada nesta sessão.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com quatro solicitações externas abertas.

# Bíblia técnica — tests/unit/inject/visibility-spoof.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `e94a89c7a69afc8717bf3686171a759902245267`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** stub Jest/jsdom dos mecanismos de visibilidade anti-hibernação  
> **Linhas textuais:** 142  
> **Posições documentais:** 143, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é um stub histórico v3.0 que demonstra, isoladamente, os mecanismos DOM usados para fingir uma aba visível e suprimir eventos de perda de visibilidade/foco.

Ele **não carrega `extension/content/inject.js`**. Em cada teste, aplica diretamente `Object.defineProperty`, substitui `document.hasFocus` ou registra listeners locais com `stopImmediatePropagation`.

Portanto suas assertions provam que essas técnicas funcionam no JSDOM usado pelo projeto; não constituem prova direta de que o bundle real instala corretamente as mesmas técnicas sob seus guards, ordem e lifecycle.

## 2. Contrato real observado em `inject.js`

No blob atual, `inject.js`:

1. só executa após guard/idempotência e identificação de aba tradutora;
2. redefine `document.visibilityState` para `visible`;
3. redefine `document.hidden` para `false`;
4. redefine `Document.prototype.hasFocus` para retornar true dentro do try;
5. também faz `document.hasFocus = () => true` fora do try;
6. cria `stopProp = e => e.stopImmediatePropagation()`;
7. registra captura em:
   - `document: visibilitychange`;
   - `window: visibilitychange`;
   - `window: blur`;
   - `window: pagehide`.

O stub cobre as primitivas principais, mas não executa esse bloco real nem cobre toda a matriz de targets/eventos.

## 3. Cenários do arquivo

### visibilityState

- redefine a propriedade para getter `visible`;
- prova leitura `visible`;
- prova que o getter é chamado duas vezes, não cacheado.

### hidden

- redefine para `false`;
- prova consistência lógica `hidden === (visibilityState !== 'visible')`.

### hasFocus

- substitui diretamente `document.hasFocus`;
- exige retorno true;
- restaura a referência original.

Esse caso não cobre a alteração de `Document.prototype.hasFocus` usada pelo runtime.

### visibilitychange

Registra dois listeners **no window**, ambos capture=true. O primeiro chama `stopImmediatePropagation`; o segundo é spy. O evento, porém, é disparado com `document.dispatchEvent(new Event('visibilitychange'))`.

A assertion prova que, no JSDOM desta suíte, o listener tardio não recebe o evento nesse arranjo. Não prova separadamente o listener real instalado no document e o listener real instalado no window.

### blur

Registra suppressor e listener tardio em `window`, dispara blur no window e prova que o segundo não roda. Esse padrão está alinhado com um dos listeners reais.

## 4. Setup/cleanup

Os grupos de `visibilityState` e `hidden` executam `afterEach` que redefine a propriedade para o valor spoofado (`visible`/`false`) em vez de restaurar o descriptor original do JSDOM.

Isso não afeta a intenção local da suíte porque todos os cenários esperam estado visível; porém o cleanup não é uma restauração semântica do ambiente original.

Listeners de visibilitychange/blur são explicitamente removidos no fim de cada teste.

## 5. Relação com `inject-anti-hibernation.test.js`

A suíte full relacionada declara explicitamente que testa lógica isolada **sem carregar inject.js**, usando mirrors verificáveis. Ela cobre mais combinações de visibilidade/foco/eventos, mas a busca atual não encontrou caso focal de `pagehide` além da menção no comentário.

Assim, a suíte full não elimina a lacuna de autenticidade e aparentemente também não prova o listener real de pagehide.

## 6. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| defineProperty pode forçar visibilityState=visible em JSDOM | teste dedicado | ✅ PROVADO DIRETAMENTE — primitiva |
| getter é avaliado a cada acesso | contador = 2 | ✅ PROVADO DIRETAMENTE — primitiva |
| defineProperty pode forçar hidden=false | teste dedicado | ✅ PROVADO DIRETAMENTE — primitiva |
| hidden/visible ficam logicamente consistentes | assertion dedicada | ✅ PROVADO DIRETAMENTE — primitiva |
| substituição direta de document.hasFocus funciona | teste dedicado | ✅ PROVADO DIRETAMENTE — primitiva |
| stopImmediatePropagation bloqueia listener tardio de blur | teste dedicado | ✅ PROVADO DIRETAMENTE — primitiva |
| bloco real de inject.js instala tudo | arquivo real não é carregado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| guard de aba/idempotência permite chegar ao bloco | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Document.prototype.hasFocus é substituído | stub testa apenas document.hasFocus | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| document visibilitychange listener real | não isolado pelo stub | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| window pagehide é suprimido | não há caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Solicitações ao auditor

### 215-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** o arquivo reimplementa manualmente as primitivas de visibilidade/evento e nunca executa `extension/content/inject.js`.

**Evidência atual:** sete testes provam comportamento de DOM/JSDOM com código construído dentro do teste.

**Evidência ausente:** carregamento do script real sob marker de aba tradutora e assertions sobre descriptors/listeners resultantes.

**Ação solicitada:** construir harness em alteração separada para executar `inject.js` real, garantindo guard/idempotência e verificando `visibilityState`, `hidden`, `hasFocus` e supressão dos eventos.

**Evidência esperada:** regressão na instalação real faz a suíte falhar.

**Possível regressão:** teste continua verde mesmo se `inject.js` deixar de instalar um dos shims.

**Impacto:** estabilidade de automação em abas de background.

**Severidade:** HIGH.

### 215-002 — TEST_REQUIRED — OPEN

**Encontrado:** produção registra `pagehide` em `window` e `visibilitychange` também em `document`; este stub não possui caso focal de pagehide nem assertion específica do listener em document. A suíte full relacionada menciona pagehide no comentário, mas busca atual não localizou teste focal desse evento.

**Evidência atual:** blur e uma configuração de visibilitychange possuem prova de primitiva.

**Evidência ausente:** eventos reais `pagehide` e `document.visibilitychange` após execução de inject.js.

**Ação solicitada:** após estabelecer harness autêntico, cobrir explicitamente os quatro registros reais de `stopProp`.

**Evidência esperada:** listener tardio não recebe cada evento no target correspondente.

**Possível regressão:** um evento não coberto pode suspender pipeline enquanto os demais continuam verdes.

**Impacto:** anti-hibernação.

**Severidade:** NORMAL.

### 215-003 — TEST_ISOLATION_REVIEW — OPEN

**Encontrado:** os `afterEach` de visibilityState/hidden não restauram descriptors originais; redefinem para os valores spoofados.

**Evidência atual:** não há falha observada dentro deste arquivo, e o ambiente é reutilizado pelo projeto Jest.

**Evidência ausente:** garantia de que nenhum teste subsequente depende dos descriptors originais.

**Ação solicitada:** considerar capturar descriptor original em beforeEach e restaurá-lo exatamente em afterEach.

**Evidência esperada:** isolamento independente da ordem das suítes.

**Possível regressão:** leak de estado DOM pode mascarar comportamento em testes posteriores.

**Impacto:** confiabilidade do ambiente de teste.

**Severidade:** LOW.

## 8. Fonte integral auditada

```js
/**
 * visibility-spoof.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a falsificação do estado de visibilidade da aba no inject.js.
 * Cobertura mínima original (v3.0).
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM inject-anti-hibernation.test.js?
 * O v3.0 isolou apenas o sistema de visibilidade. O v3.1 integrou todos
 * os 5 sistemas em inject-anti-hibernation.test.js, incluindo testes de
 * supressão de eventos (blur/pagehide/visibilitychange) com captura.
 *
 * CONTEXTO TÉCNICO — Por que o inject.js precisa falsificar visibilidade:
 *
 * O Chrome implementa "tab throttling" para abas em background:
 * - JavaScript timers (setTimeout/setInterval) são reduzidos a 1 tick/segundo
 * - requestAnimationFrame é pausado completamente
 * - O evento `visibilitychange` dispara com `document.visibilityState = 'hidden'`
 *
 * O content_gemini.js usa polling de 500ms para detectar quando o Gemini
 * termina de gerar a imagem. Se o tab throttling reduzir esse polling para
 * 1 tick/segundo, o tempo de espera pode triplicar e o job pode expirar
 * pelo watchdog de 4 minutos sem ter completado.
 *
 * A solução: injetar no world:MAIN (contexto da página, não isolado) para
 * ter acesso às propriedades nativas do document e window, então usar
 * Object.defineProperty para tornar visibilityState sempre 'visible'.
 *
 * Por que Object.defineProperty e não uma simples atribuição?
 * `document.visibilityState = 'visible'` não funciona — a propriedade
 * é read-only por padrão. Apenas Object.defineProperty com { get: () => 'visible' }
 * consegue sobrescrever getters de objetos nativos do DOM.
 *
 * VEJA: inject-anti-hibernation.test.js para a suíte completa.
 */

describe('Falsificação de Estado de Visibilidade (stub v3.0)', () => {

    describe('document.visibilityState', () => {
        afterEach(() => {
            // Restaura para 'visible' (padrão em JSDOM) após cada teste
            try {
                Object.defineProperty(document, 'visibilityState', {
                    get: () => 'visible',
                    configurable: true,
                });
            } catch(e) {}
        });

        test('Object.defineProperty sobrescreve visibilityState para "visible"', () => {
            Object.defineProperty(document, 'visibilityState', {
                get: () => 'visible',
                configurable: true,
            });
            expect(document.visibilityState).toBe('visible');
        });

        test('getter é chamado a cada acesso (não é cached)', () => {
            let callCount = 0;
            Object.defineProperty(document, 'visibilityState', {
                get: () => { callCount++; return 'visible'; },
                configurable: true,
            });
            void document.visibilityState;
            void document.visibilityState;
            expect(callCount).toBe(2);
        });
    });

    describe('document.hidden', () => {
        afterEach(() => {
            try {
                Object.defineProperty(document, 'hidden', {
                    get: () => false,
                    configurable: true,
                });
            } catch(e) {}
        });

        test('Object.defineProperty força hidden para false', () => {
            Object.defineProperty(document, 'hidden', {
                get: () => false,
                configurable: true,
            });
            expect(document.hidden).toBe(false);
        });

        test('hidden false e visibilityState "visible" são consistentes', () => {
            Object.defineProperty(document, 'visibilityState', {
                get: () => 'visible',
                configurable: true,
            });
            Object.defineProperty(document, 'hidden', {
                get: () => false,
                configurable: true,
            });
            // Invariante: hidden = (visibilityState !== 'visible')
            expect(document.hidden).toBe(document.visibilityState !== 'visible');
        });
    });

    describe('document.hasFocus()', () => {
        test('substituição direta do método funciona', () => {
            const original = document.hasFocus;
            document.hasFocus = () => true;
            expect(document.hasFocus()).toBe(true);
            document.hasFocus = original;
        });
    });

    describe('Supressão de evento visibilitychange', () => {
        test('stopImmediatePropagation impede listener subsequente de receber o evento', () => {
            const suppressHandler = e => e.stopImmediatePropagation();
            const lateHandler = jest.fn();

            // Capture:true garante execução antes dos demais listeners
            window.addEventListener('visibilitychange', suppressHandler, true);
            window.addEventListener('visibilitychange', lateHandler, true);

            document.dispatchEvent(new Event('visibilitychange'));

            expect(lateHandler).not.toHaveBeenCalled();

            window.removeEventListener('visibilitychange', suppressHandler, true);
            window.removeEventListener('visibilitychange', lateHandler, true);
        });

        test('listener de blur é suprimido da mesma forma', () => {
            const suppressHandler = e => e.stopImmediatePropagation();
            const lateHandler = jest.fn();

            window.addEventListener('blur', suppressHandler, true);
            window.addEventListener('blur', lateHandler, true);

            window.dispatchEvent(new Event('blur'));

            expect(lateHandler).not.toHaveBeenCalled();

            window.removeEventListener('blur', suppressHandler, true);
            window.removeEventListener('blur', lateHandler, true);
        });
    });
});
```

## 9. Mapa integral de linhas/posições

| Linhas | Responsabilidade | Classificação |
|---:|---|---|
| 1–33 | contexto/histórico/técnica | documental |
| 34 | separador | estrutural |
| 35 | describe raiz | estrutural |
| 36 | separador | estrutural |
| 37–66 | visibilityState + cleanup | ✅ primitiva; cleanup parcial |
| 67 | separador | estrutural |
| 68–98 | hidden + consistência | ✅ primitiva |
| 99 | separador | estrutural |
| 100–107 | hasFocus direto | ✅ primitiva, não prototype |
| 108 | separador | estrutural |
| 109–140 | supressão visibilitychange/blur | ✅ primitiva |
| 141 | separador | estrutural |
| 142 | fecha describe | estrutural |
| posição 143 | newline final | blob confirmado |

## 10. Invariantes realmente impostos

1. JSDOM aceita override configurável de visibilityState;
2. getter pode retornar visible a cada leitura;
3. hidden pode ser forçado a false;
4. document.hasFocus pode ser substituído diretamente;
5. stopImmediatePropagation em capture pode bloquear listener tardio nos cenários montados.

Não imposto pelo arquivo:
- execução do guard real;
- instalação real pelo inject.js;
- prototype hasFocus;
- pagehide;
- todos os targets de visibilitychange;
- cleanup dos listeners reais.

## 11. Autoauditoria do AGENTE 17

- [x] reserva #215 criada via CREATE ONLY e relida;
- [x] state próprio criado;
- [x] source SHA reconfirmado;
- [x] `inject.js` real comparado;
- [x] suíte full relacionada inspecionada;
- [x] fonte integral incorporada;
- [x] 142 linhas textuais + newline = 143 posições;
- [x] prova da primitiva separada de prova da instalação real;
- [x] três solicitações preparadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** o stub documenta e prova as primitivas DOM de visibilidade/supressão em JSDOM, mas não valida a instalação real e completa executada por `inject.js`.

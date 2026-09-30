# Bíblia técnica — tests/unit/content-manga/close-interval.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** ccbf20485608a223c723adf638860cb7151c8886  
> **Agente responsável:** AGENTE 21  
> **Índice do corpus:** 200  
> **Tipo:** suíte Jest unitária em JSDOM com implementação espelho local de countdown  
> **Linhas textuais:** **168**  
> **Posições documentais:** **169**, contando o newline final  
> **Tamanho textual observado:** **6115 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo modela, em isolamento, o countdown da gaveta de erro do botão flutuante. A suíte **não importa extension/content/content_manga.js**: ela define localmente createCloseCountdown e testa essa cópia usando fake timers do Jest.

Logo, as assertions são provas diretas do helper local, não provas autônomas do content script de produção.

## 2. Implementação real relacionada

A implementação real auditada está em extension/content/content_manga.js, SHA a8b3698019f6f22027f09f544f15c0563a9f6515.

No blob examinado:

- linha 876 declara _closeInterval e _closeCountdown;
- linhas 1388–1405 tratam a reabertura e limpam intervalo ativo;
- linhas 1414–1438 iniciam e executam o countdown real;
- linhas 1418–1419 cancelam intervalo anterior antes de criar outro;
- linhas 1420–1434 decrementam, terminam em zero e atualizam o texto somente no branch positivo;
- linhas 1668–1669 limpam o intervalo em pagehide.

## 3. Divergências do espelho

| Aspecto | Espelho #200 | Produção real | Impacto |
|---|---|---|---|
| duração | start(seconds = 30) é parametrizado | valor é fixado em 30 | testes 3s/5s são abstrações |
| tick zero | onTick é chamado antes do teste <= 0 | zero entra no branch terminal | o espelho produz 0S; a UI real não |
| conclusão | onComplete genérico | esconde linha, limpa hasError, lastIntegratedErrorState e rótulo | abstração não cobre side effects |
| cancelamento | limpa timer e força contador a 0 | limpa timer, sem zerar explicitamente contador | estado interno diverge |
| API | isActive/getCount públicos no helper | não existe API pública equivalente | assertions valem apenas para a cópia |
| debug/lifecycle | inexistentes | debugMode, datasets e pagehide participam | branches de produção não são modelados |

A linha 20 afirma que o helper “espelha exatamente” content_manga.js, mas isso não corresponde ao blob atual.

## 4. Prova real já existente

tests/unit/content-manga/drawer-real.test.js, SHA eeebbd56fe1a1c788a81b43e222be06309b90f32, usa tests/helpers/load-content-script.js para carregar o content_manga.js real.

Evidências diretas encontradas:

- linhas 130–160: recolher a drawer exige FECHANDO EM 30S e, após 30s, exige linha oculta, hasError=false e rótulo 🚨 VER ÚLTIMO ERRO;
- linhas 163–197: após 5s, reabrir cancela o fechamento; 40s depois o erro continua visível e pendente.

Essas assertions têm força maior para produção do que o modelo local do #200.

## 5. Dependências e ambiente

O arquivo não possui imports. Depende dos globals Jest: describe, test, expect, jest.fn, jest.useFakeTimers, jest.useRealTimers e jest.advanceTimersByTime.

jest.config.js linhas 18–28 inclui tests/unit/content-manga/**/*.test.js no projeto content-scripts com ambiente jsdom.

O arquivo não usa DOM diretamente; JSDOM é herdado da partição do projeto.

beforeEach ativa fake timers e afterEach restaura timers reais, isolando os intervals entre casos.

## 6. Descoberta e execução oficial

package.json linha 26 define test:ci como node scripts/ci/run-jest-ci.js.

scripts/ci/run-jest-ci.js:

- linhas 34–40 inventariam todos os .test.js de unit e integration;
- linhas 85–109 executam Jest com jest.config.js;
- linhas 177–185 falham se algum arquivo esperado não aparecer no relatório;
- linhas 196–207 falham para skipped/TODO/falhas.

Portanto existe gate explícito para impedir que #200 permaneça no corpus de testes sem ser descoberto.

## 7. Helper local

createCloseCountdown possui dois estados de closure:

- _closeInterval: id do interval ou null;
- _closeCountdown: valor corrente.

start(seconds = 30) grava o contador, cancela interval anterior, cria setInterval de 1s, decrementa, chama onTick e conclui ao chegar a zero ou menos.

cancel limpa o interval ativo, marca null e zera o contador.

isActive retorna se há interval ativo. getCount retorna o contador.

Não há validação de seconds nem tratamento local para callback que lance.

## 8. Matriz dos nove casos

| Caso | Linhas | Prova |
|---|---:|---|
| início 30 | 59–66 | ✅ helper local armazena 30 quando 30 é passado |
| decremento | 68–76 | ✅ onTick recebe 29 após 1s |
| sequência | 78–89 | ✅ helper local gera 4,3,2,1,0 |
| conclusão | 91–98 | ✅ onComplete local roda uma vez |
| cancel inativa | 102–111 | ✅ isActive passa true→false |
| cancel bloqueia conclusão | 113–123 | ✅ onComplete não roda depois do cancel |
| reinício | 125–135 | ✅ novo ciclo completa |
| start duplo | 139–149 | ✅ só um callback após 1s |
| texto modelado | 153–166 | ✅ callback local produz 2S,1S,0S; ⚠️ não prova UI real |

Todas as marcas verdes acima se limitam ao helper definido neste próprio arquivo.

## 9. Evidência de produção

| Comportamento | Evidência | Classificação |
|---|---|---|
| inicia em 30S | drawer-real.test.js linha 154 | ✅ PROVADO DIRETAMENTE |
| termina ocultando erro e restaura rótulo | drawer-real linhas 156–160 | ✅ PROVADO DIRETAMENTE |
| reabrir cancela countdown | drawer-real linhas 183–197 | ✅ PROVADO DIRETAMENTE |
| este arquivo pertence ao projeto Jest | jest.config.js linha 21 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI exige execução de todos os .test.js | run-jest-ci linhas 34–40 e 177–185 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| UI real mostra 29S...1S | sem assertion focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| UI real mostra 0S | código real termina antes de escrever 0S | ⚠️ o espelho não representa produção |
| duplo start sem dois intervals no fluxo real | linha 1418 limpa interval, mas sem assertion focal localizada | 🟨 EXECUTADO/INSPECIONADO INDIRETAMENTE |
| parâmetro default do helper local | todos os testes passam argumento | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Casos-limite

### Default não exercitado

O caso “inicia com valor correto de 30 segundos” chama start(30). Ele não prova start() sem argumento.

### Duração zero/negativa

start(0) ou start(-1) ainda cria interval e somente no primeiro tick termina, após emitir valor negativo via onTick. Não há assertion para isso.

### Ordem do tick terminal

No espelho, o callback onTick ocorre antes do teste de término, por isso recebe 0. Na produção, o texto só é atualizado no else, portanto 0S não é exibido.

### Cancelamento fora de ciclo ativo

Se cancel for chamado sem interval ativo, não altera _closeCountdown. Não há teste desse caso.

### Callback com erro

Se onTick lançar, o cleanup daquele tick não é alcançado. Se onComplete lançar, o interval já foi limpo. Não há teste desses casos.

## 11. Invariantes

1. cada caso inicia com fake timers;
2. cada caso restaura timers reais;
3. interval ativo no helper local corresponde a _closeInterval não-null;
4. start substitui ciclo anterior no helper local;
5. decremento acontece antes de onTick;
6. cancel impede conclusão do ciclo cancelado;
7. um novo start após cancel funciona;
8. assertions do espelho não devem ser promovidas a prova do content_manga.js;
9. qualquer alegação de equivalência deve ser reconfirmada contra o SHA de produção;
10. esta Bíblia vale apenas para ccbf20485608a223c723adf638860cb7151c8886.

## 12. Side effects

Não há filesystem, rede, chrome API, storage, DOM, subprocesso ou IndexedDB.

Os únicos recursos são timers fake e mocks de callback.

O risco técnico dominante é drift entre a cópia local e a produção, não vazamento de recurso.

## 13. Solicitação ao auditor

### 200-001 — TEST_INTEGRITY_REVIEW — OPEN

**Encontrado:** o teste usa reimplementação local apresentada como espelho exato, mas ela diverge do content_manga.js real.

**Contexto:** auditoria de tests/unit/content-manga/close-interval.test.js.

**Arquivos relacionados:** este teste, extension/content/content_manga.js e tests/unit/content-manga/drawer-real.test.js.

**Evidência atual:** linhas 31–37 do espelho chamam onTick(0); linhas 163–165 exigem FECHANDO EM 0S. Na produção, linhas 1421–1433 tratam zero como término e escrevem FECHANDO EM N S apenas para valor positivo. drawer-real confirma o rótulo terminal real.

**Evidência ausente:** vínculo automatizado de equivalência; assertions reais para ticks intermediários e para prevenção de intervals duplicados no DOM real.

**Por que insuficiente:** uma cópia pode continuar verde após produção mudar; neste SHA já existe divergência observável.

**Ação solicitada:** decidir se #200 deve ser removido/reduzido, refeito para executar content_manga.js via load-content-script, ou substituído por teste de um módulo de produção extraído e compartilhado.

**Teste esperado:** provar na implementação real início 30S, tick intermediário, término sem 0S visível, cancelamento, reinício e ausência de timers duplicados.

**Possível regressão:** manutenção futura confia numa suíte verde que testa o espelho enquanto a UI real diverge.

**Impacto:** drawer-real já protege início/término/cancelamento básicos, mas não todos os cenários modelados aqui.

**Severidade:** HIGH.

Nenhum arquivo externo foi alterado pelo AGENTE 21.

## 14. Fonte integral auditada

~~~javascript
/**
 * close-interval.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o sistema de countdown de auto-recuperação da gaveta de erro (INCONS #1).
 *
 * CONTEXTO: Quando o usuário fecha a gaveta de erro do botão flutuante, o código
 * inicia um contador de 30 segundos. Se não reabrir a gaveta em 30s, o botão
 * reseta completamente para o estado neutro.
 *
 * Variável renomeada: `_closeTimer` → `_closeInterval` (mais semântico para
 * `setInterval`). INCONS #1 corrigida.
 *
 * ABORDAGEM: Testa a lógica do countdown com fake timers do Jest.
 * A implementação é testada em isolamento via classe de controle.
 */

describe('Sistema de Auto-Recuperação de UI — Countdown de 30s (INCONS #1)', () => {

    // ── Implementação espelho do sistema de countdown ─────────────────────────
    // Espelha exatamente a lógica do content_manga.js v3.1
    function createCloseCountdown({ onTick, onComplete }) {
        let _closeInterval = null;  // Nome v3.1 (era _closeTimer no v3.0)
        let _closeCountdown = 0;

        return {
            start(seconds = 30) {
                _closeCountdown = seconds;
                if (_closeInterval) clearInterval(_closeInterval);

                _closeInterval = setInterval(() => {
                    _closeCountdown--;
                    onTick(_closeCountdown);

                    if (_closeCountdown <= 0) {
                        clearInterval(_closeInterval);
                        _closeInterval = null;
                        onComplete();
                    }
                }, 1000);
            },

            cancel() {
                if (_closeInterval) {
                    clearInterval(_closeInterval);
                    _closeInterval = null;
                    _closeCountdown = 0;
                }
            },

            isActive() { return _closeInterval !== null; },
            getCount() { return _closeCountdown; },
        };
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    describe('Inicialização e contagem', () => {
        test('inicia com o valor correto de 30 segundos', () => {
            const onTick = jest.fn();
            const onComplete = jest.fn();
            const countdown = createCloseCountdown({ onTick, onComplete });

            countdown.start(30);
            expect(countdown.getCount()).toBe(30);
        });

        test('decrementa 1 segundo por tick', () => {
            const onTick = jest.fn();
            const onComplete = jest.fn();
            const countdown = createCloseCountdown({ onTick, onComplete });

            countdown.start(30);
            jest.advanceTimersByTime(1000);
            expect(onTick).toHaveBeenCalledWith(29);
        });

        test('chama onTick com valor correto em cada segundo', () => {
            const tickValues = [];
            const countdown = createCloseCountdown({
                onTick: (val) => tickValues.push(val),
                onComplete: jest.fn(),
            });

            countdown.start(5); // Usa 5s para teste rápido
            jest.advanceTimersByTime(5000);

            expect(tickValues).toEqual([4, 3, 2, 1, 0]);
        });

        test('chama onComplete quando chega a zero', () => {
            const onComplete = jest.fn();
            const countdown = createCloseCountdown({ onTick: jest.fn(), onComplete });

            countdown.start(3);
            jest.advanceTimersByTime(3000);
            expect(onComplete).toHaveBeenCalledTimes(1);
        });
    });

    describe('Cancelamento (ao reabrir a gaveta)', () => {
        test('cancel() para o intervalo imediatamente', () => {
            const onComplete = jest.fn();
            const countdown = createCloseCountdown({ onTick: jest.fn(), onComplete });

            countdown.start(30);
            expect(countdown.isActive()).toBe(true);

            countdown.cancel();
            expect(countdown.isActive()).toBe(false);
        });

        test('após cancel(), onComplete não é chamado mesmo com tempo avançando', () => {
            const onComplete = jest.fn();
            const countdown = createCloseCountdown({ onTick: jest.fn(), onComplete });

            countdown.start(3);
            jest.advanceTimersByTime(1000); // 1s passou
            countdown.cancel();             // Usuário reabriu a gaveta
            jest.advanceTimersByTime(5000); // Mais 5s passam

            expect(onComplete).not.toHaveBeenCalled();
        });

        test('após cancel(), pode ser iniciado novamente', () => {
            const onComplete = jest.fn();
            const countdown = createCloseCountdown({ onTick: jest.fn(), onComplete });

            countdown.start(30);
            countdown.cancel();
            countdown.start(5);

            jest.advanceTimersByTime(5000);
            expect(onComplete).toHaveBeenCalledTimes(1);
        });
    });

    describe('Prevenção de múltiplos intervalos', () => {
        test('start() duplo não cria dois intervals simultâneos', () => {
            const tickCount = jest.fn();
            const countdown = createCloseCountdown({ onTick: tickCount, onComplete: jest.fn() });

            countdown.start(30);
            countdown.start(30); // Segundo start — deve cancelar o anterior

            jest.advanceTimersByTime(1000);
            // Deve ter chamado onTick apenas 1 vez (não 2)
            expect(tickCount).toHaveBeenCalledTimes(1);
        });
    });

    describe('Comportamento visual (texto do botão)', () => {
        test('texto do botão deve refletir contagem regressiva', () => {
            const texts = [];
            const countdown = createCloseCountdown({
                onTick: (val) => texts.push(`FECHANDO EM ${val}S`),
                onComplete: jest.fn(),
            });

            countdown.start(3);
            jest.advanceTimersByTime(3000);

            expect(texts).toContain('FECHANDO EM 2S');
            expect(texts).toContain('FECHANDO EM 1S');
            expect(texts).toContain('FECHANDO EM 0S');
        });
    });
});
~~~

O blob termina com newline LF.

## 15. Cobertura posição a posição

### Linhas 1–15
Cabeçalho documental: identifica cenário, rename histórico e estratégia. Comentários não executam código. A afirmação de equivalência é apenas intenção e foi confrontada com produção.

### Linha 16
Separação estrutural sem efeito runtime.

### Linhas 17–20
Abrem a suíte e introduzem a implementação espelho. A linha 20 é afetada diretamente por 200-001.

### Linhas 21–23
Criam helper e estados internos. ✅ comportamento local exercitado por getCount/isActive.

### Linha 24
Separação estrutural.

### Linhas 25–40
Implementam start, substituição de timer, tick, onTick e onComplete. ✅ diretamente exercitadas no helper local; ⚠️ não equivalem automaticamente à produção.

### Linha 41
Separação estrutural.

### Linhas 42–48
Implementam cancel com clearInterval, null e contador 0. ✅ exercitado pelos testes de cancel/restart.

### Linha 49
Separação estrutural.

### Linhas 50–53
Expõem isActive/getCount e fecham helper. ✅ APIs locais, inexistentes na produção.

### Linha 54
Separação estrutural.

### Linhas 55–56
Hooks de fake timers. 🟨 executados indiretamente por todos os casos.

### Linha 57
Separação estrutural.

### Linhas 58–66
Primeiro grupo e caso de valor 30 explícito. ✅ prova 30 passado; ⚠️ não prova default.

### Linha 67
Separação.

### Linhas 68–76
Caso de um tick. ✅ prova onTick(29) no helper.

### Linha 77
Separação.

### Linhas 78–89
Sequência 5→0. ✅ prova ordem local; ⚠️ 0 visual diverge da UI real.

### Linha 90
Separação.

### Linhas 91–99
Conclusão em zero e fechamento do primeiro grupo. ✅ helper local.

### Linha 100
Separação.

### Linhas 101–111
Cancelamento imediato e isActive. ✅ helper local.

### Linha 112
Separação.

### Linhas 113–123
Cancel impede conclusão após tempo adicional. ✅ helper local.

### Linha 124
Separação.

### Linhas 125–136
Reinício após cancel. ✅ helper local.

### Linha 137
Separação.

### Linhas 138–150
Dois starts consecutivos e assertion de um callback. ✅ helper local; ⚠️ fluxo real sem assertion focal encontrada.

### Linha 151
Separação.

### Linhas 152–166
Callback visual sintético e assertions 2S/1S/0S. ✅ string local; ⚠️ não prova DOM e 0S contradiz produção.

### Linhas 167–168
Fecham describes. 🟨 estrutura executada pelo Jest.

### Posição 169
Posição vazia do newline LF terminal. Sem comportamento; faz parte do blob exato.

## 16. Análise crítica

1. suíte rápida e determinística por fake timers;
2. nove casos claros para o helper local;
3. fronteira de prova é fraca porque lógica é copiada;
4. cópia já diverge no tick zero;
5. default de 30 não é testado como default;
6. durações arbitrárias não existem no trecho real;
7. debugMode, DOM, datasets e lifecycle não são modelados;
8. drawer-real.test.js mitiga parte do risco com implementação real;
9. gate de inventário do Jest reduz risco de suíte presente porém não executada;
10. comentários “espelho” nunca devem substituir ligação à implementação real.

## 17. Autoauditoria documental

- reserva exclusiva confirmada para **AGENTE 21**;
- SHA do fonte reconfirmado: **ccbf20485608a223c723adf638860cb7151c8886**;
- fonte integral embutida diretamente do blob;
- **168 linhas textuais + newline final = 169/169 posições**;
- produção confrontada: content_manga.js SHA **a8b3698019f6f22027f09f544f15c0563a9f6515**;
- teste real confrontado: drawer-real.test.js SHA **eeebbd56fe1a1c788a81b43e222be06309b90f32**;
- loader confrontado: load-content-script.js SHA **40d7c59d81a533c2f7d2b12d6c8c30bc77fb43f0**;
- jest.config.js, package.json e run-jest-ci.js lidos para descoberta/execução;
- evidência do espelho não foi promovida indevidamente a prova da produção;
- divergência registrada como 200-001, sem alterar código/testes;
- nenhum STATUS, CHECKLIST, AUDITORIA, workflow, config ou arquivo externo foi modificado.

**Conclusão documental:** Bíblia completa para o estado observado. Pode ser marcada **COMPLETED** mantendo 200-001 OPEN.

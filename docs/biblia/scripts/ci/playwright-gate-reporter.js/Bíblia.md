# Bíblia técnica — scripts/ci/playwright-gate-reporter.js

> **Estado:** 🟠 EM ANDAMENTO — conteúdo técnico completo; finalização global pendente de mutex  
> **SHA auditado:** 71fb92c1215a86cdb309f4599ea8d0b422e9b02e  
> **Agente responsável pela auditoria:** AGENTE 9  
> **Tipo:** tooling Node.js / custom reporter Playwright / gate de CI  
> **Linhas textuais:** **82**  
> **Posições documentais:** **83**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é o gate semântico do E2E Playwright. Ele não roda dentro da extensão Chromium nem dentro do service worker MV3; roda no processo Node do Playwright/merge-reports e transforma resultados de testes em uma política de aprovação adicional.

O problema concreto que resolve é evitar falsos verdes em quatro situações: redução do inventário E2E abaixo do baseline, testes terminando como skipped, testes que só passam após retry/flakiness e testes com estado terminal não aprovado. Também possui uma quinta defesa: se o run global vier como passed, mas menos test.id tiverem onTestEnd do que o total descoberto em onBegin, o reporter reprova a execução.

O estado é deliberadamente efêmero e por instância. this.total guarda o inventário descoberto e attemptsById guarda somente pares status/retry por test.id. Nada é persistido em disco ou chrome.storage: o lifecycle é o de uma execução de CI, e o processo pode terminar logo depois de onEnd.

## 2. Dependências, consumidores e fluxo real

### Dependência direta

- scripts/ci/data/test-baseline.json: fornece e2e.minTests=21, e2e.maxSkipped=0 e e2e.maxFlaky=0 no SHA auditado.

### Consumidores reais

1. playwright.config.js: em CI sem MANGA_E2E_SHARD=1, adiciona ./scripts/ci/playwright-gate-reporter.js ao reporter. Isso cobre npm run test:e2e, inclusive o job fresh-developer-flow.
2. scripts/ci/playwright-merge.config.js: usa este reporter ao executar playwright merge-reports. É o gate global após os cinco shards.
3. scripts/validation/playwright-gate-reporter-selftest.js: importa e executa diretamente a classe real com suites/resultados controlados.
4. scripts/validation/verify-ci-contract.js: lê o texto deste arquivo e aplica gates estáticos para attemptsById/maxFlaky e para a lógica de failed/status final não aprovado.
5. package.json#validate e .github/workflows/ci.yml: executam o self-test do reporter como gate de infraestrutura.

### Relação com sharding

Nos jobs e2e-shard, MANGA_E2E_SHARD=1 faz playwright.config.js usar line + blob, não este reporter. Cada shard produz um blob. O job e2e baixa exatamente cinco blobs e executa merge-reports com scripts/ci/playwright-merge.config.js; nesse merge o reporter é carregado e enxerga o conjunto agregado. Assim, a política minTests/skip/flaky/final status é aplicada globalmente, não cinco vezes contra subconjuntos que naturalmente teriam menos de 21 testes.

O plano atual contém 1 + 3 + 4 + 4 + 9 = 21 E2E esperados, coerente com baseline.e2e.minTests=21. verify-ci-contract.js exige que a soma expectedTests dos cinco grupos seja exatamente o baseline.

## 3. Lifecycle e modelo de dados

Fluxo esperado:

onBegin
→ suite.allTests().length vira this.total
→ cada onTestEnd anexa {status,retry} em attemptsById[test.id]
→ onEnd extrai o último status por test.id
→ conta skipped, failed e flaky
→ compara com baseline
→ retorna {status:'failed'} se houver qualquer problema
→ caso contrário retorna undefined e deixa Playwright preservar o status normal.

A definição de flaky é intencionalmente mais forte que “houve retry”: o teste precisa terminar passed, ter retry detectável e possuir uma tentativa anterior não-passed. Isso evita chamar qualquer repetição de flaky sem evidência de falha anterior.

## 4. Segurança, privacidade e trust boundaries

Este módulo não toca dados do mangá, Gemini, tabs, storage, permissões Chrome, rede ou Base64. O boundary relevante é de integridade da CI:

- baseline JSON é configuração local confiada; valores malformados podem enfraquecer comparações JavaScript;
- suite, test e result vêm do runtime Playwright; o reporter assume test.id estável/único e callbacks onTestEnd em ordem de tentativas;
- logs expõem apenas contagens e mensagens de gate, não nomes de testes, URLs, anexos ou payloads;
- o Map retém objetos mínimos, reduzindo memória e retenção acidental de metadata de teste.

## 5. Evidência automatizada

| Comportamento | Evidência verificada | Classificação |
|---|---|---|
| happy path com 21 passed retorna undefined | playwright-gate-reporter-selftest.js instancia o reporter real, chama hooks reais e assert.strictEqual | ✅ PROVADO DIRETAMENTE |
| um skipped reprova | self-test substitui t20 por skipped e espera {status:'failed'} | ✅ PROVADO DIRETAMENTE |
| failed → passed com retry reprova como flaky | self-test envia duas tentativas do mesmo id e espera failed | ✅ PROVADO DIRETAMENTE |
| timedOut → passed com retry reprova como flaky | self-test envia a sequência real ao reporter e espera failed | ✅ PROVADO DIRETAMENTE |
| total abaixo de 21 reprova | self-test usa total=20 e espera failed | ✅ PROVADO DIRETAMENTE |
| failed/timedOut/interrupted terminais reprovam | loop do self-test executa os três status e espera failed | ✅ PROVADO DIRETAMENTE |
| config Playwright carrega reporter em CI não shard | verify-ci-contract.js procura o path literal em playwright.config.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| reporter preserva tentativas e referencia maxFlaky | verify-ci-contract.js procura attemptsById e maxFlaky | 🟦 GATE ESTÁTICO ESPECÍFICO |
| reporter possui lógica explícita de failed terminal | verify-ci-contract.js procura const failed = e a mensagem status final não aprovado | 🟦 GATE ESTÁTICO ESPECÍFICO |
| pipeline de shards usa reporter no merge global | workflow executa merge-reports com playwright-merge.config.js, que referencia este módulo | 🟨 EXECUTADO INDIRETAMENTE / integração CI |
| branch de menos resultados que total em run passed | nenhuma assertion focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| textos/canais console.log/console.error | nenhuma assertion focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

Importante: a regression-matrix contém REG-E2E-FLAKY-RETRY-GATE apontando para o self-test e para os markers failed retry 0 → passed retry 1. Isso é rastreabilidade de regressão; a prova direta continua sendo a assertion do self-test executando esta implementação real.

## 6. Análise crítica

1. **e2e.maxSkipped sem validação estrutural equivalente:** no verify-ci-contract.js auditado existe validação explícita de e2e.maxFlaky, mas a busca no repositório não encontrou gate equivalente para e2e.maxSkipped. Se maxSkipped ficar ausente/undefined, a expressão skipped > undefined vira comparação com NaN e pode deixar skips passarem. O reporter usa corretamente o valor atual 0, mas a integridade do tipo não está protegida no mesmo nível.
2. **Branch de resultado ausente não tem self-test focal:** this.attemptsById.size < this.total && result.status === 'passed' é uma defesa importante contra falso verde, porém nenhum cenário do self-test fornece total maior que a quantidade de ids observados.
3. **Assunção de unicidade/estabilidade de test.id:** retries precisam reutilizar o mesmo id; colisão entre testes misturaria históricos. O reporter confia no contrato do Playwright e não valida.
4. **Assunção de ordem:** a última entrada do array é tratada como tentativa final. O código pressupõe callbacks onTestEnd ordenados por tentativa para um mesmo id.
5. **Normalização permissiva de retry:** Number(result.retry || 0) aceita strings numéricas e pode produzir NaN para valor malformado. O runtime real fornece número, mas não há defesa/teste para input corrompido.
6. **Diagnóstico parcial quando result.status já é failed:** a inconsistência attemptsById.size < total só adiciona problema se o run global foi passed. Isso é suficiente para evitar falso verde; porém um run já falho pode terminar sem diagnóstico específico de resultados ausentes.
7. **Mensagem de failed enumera três estados, predicate é mais ampla:** o cálculo classifica qualquer status final que não seja passed/skipped como failed. Isso é fail-closed, mas uma futura categoria do Playwright seria reprovada embora a mensagem cite somente failed/timedOut/interrupted.
8. **Sem cleanup explícito do Map:** não é leak operacional relevante no desenho atual, porque a instância dura uma execução e termina com o processo/reporter; ainda assim, suites enormes mantêm uma entrada mínima por teste até onEnd.
9. **onEnd é async sem await:** não é bug; preserva compatibilidade com hook assíncrono e permite evolução futura, mas hoje a função resolve imediatamente.

## 7. Casos-limite

- suite vazia ou menor que 21: reprovada pelo baseline.
- skipped final: reprovado enquanto maxSkipped=0.
- failed/timedOut/interrupted final: reprovado.
- failed/timedOut anterior seguido de passed: classificado flaky e reprovado enquanto maxFlaky=0.
- múltiplas violações: todas são acumuladas e impressas antes do único retorno failed.
- test.id observado mais de uma vez: tentativas ficam no mesmo array.
- test.id nunca observado apesar de ter sido descoberto: somente há gate focal se result.status global for passed.
- histórico vazio inserido artificialmente: finalStatuses o filtra e flaky ignora; não ocorre pelo onTestEnd normal.
- baseline malformado: não há validação dentro do reporter; depende de gates externos, que são incompletos para maxSkipped.
- retry malformado: Number pode produzir NaN; não existe teste específico.

## 8. Lacunas de teste

1. Adicionar self-test com total=21, apenas 20 ids em attempts e runStatus='passed'; deve retornar {status:'failed'} e provar linhas 62–64.
2. Adicionar teste de maxSkipped ausente/malformado via fixture/injeção de baseline ou, preferencialmente, fortalecer verify-ci-contract.js para validar inteiro não negativo como já faz com maxFlaky.
3. Adicionar cenário interrupted → passed com retry para provar que hadNonPassingAttempt é genérico, não apenas failed/timedOut.
4. Adicionar teste isolando a condição retry > 0 quando o histórico recebido tem uma única tentativa, para documentar a tolerância a callbacks incompletos.
5. Adicionar teste para status final desconhecido e confirmar a política fail-closed.
6. Adicionar teste de duas violações simultâneas com console interceptado, provando que problems acumula e imprime todas.
7. Adicionar teste dos logs de aprovação/falha se o texto for contrato operacional.
8. Adicionar teste de input retry não numérico caso se deseje robustez contra objetos result forjados em tooling.
9. Adicionar gate que confirme que playwright-merge.config.js continua apontando para este reporter; hoje a execução do workflow e o contrato do merge dão evidência indireta, mas não há assertion focal do módulo dentro do self-test deste reporter.
10. Adicionar teste que simule ids distintos e retries intercalados para provar isolamento por Map em cenário paralelo.

## 9. Invariantes

1. O reporter deve continuar sendo carregado no E2E completo de CI e no merge global dos shards.
2. Shards individuais não devem aplicar minTests global de 21; o gate global pertence ao merge agregado.
3. O histórico por test.id não pode ser reduzido ao último status enquanto maxFlaky=0 for requisito.
4. Um teste que falha ou timedOut e depois passa em retry deve continuar reprovando sob o baseline atual.
5. skipped final não pode passar enquanto e2e.maxSkipped=0.
6. failed/timedOut/interrupted final não pode ser considerado aprovado.
7. Redução da descoberta abaixo de e2e.minTests deve falhar.
8. Um run global passed não pode ser aceito se menos ids produzirem resultado do que testes descobertos.
9. Alterar baseline deve preservar validação de tipo e coerência com o plano de shards.
10. O reporter não deve logar payloads, URLs ou objetos de teste desnecessários.
11. O Map deve permanecer por instância, não global, para evitar contaminação entre execuções.
12. A tentativa final deve continuar sendo a última observação cronológica por id, ou a implementação precisa trocar para uma ordenação explícita.
13. Retorno de falha deve continuar sendo semântico para Playwright, não apenas console.error.
14. Caminho saudável deve continuar sem forçar passed sobre o status global.
15. O SHA desta Bíblia só é válido enquanto o fonte for 71fb92c1215a86cdb309f4599ea8d0b422e9b02e.

## 10. Fonte integral

~~~javascript
'use strict';

const baseline = require('./data/test-baseline.json');

class PlaywrightGateReporter {
  constructor() {
    this.total = 0;
    this.attemptsById = new Map();
  }

  onBegin(_config, suite) {
    this.total = suite.allTests().length;
    console.log('[CI/E2E] Playwright descobriu ' + this.total + ' teste(s).');
  }

  onTestEnd(test, result) {
    const attempts = this.attemptsById.get(test.id) || [];
    attempts.push({
      status: result.status,
      retry: Number(result.retry || 0),
    });
    this.attemptsById.set(test.id, attempts);
  }

  async onEnd(result) {
    const entries = [...this.attemptsById.values()];
    const finalStatuses = entries
      .map((attempts) => attempts[attempts.length - 1])
      .filter(Boolean);

    const skipped = finalStatuses.filter((attempt) => attempt.status === 'skipped').length;
    const failed = finalStatuses.filter(
      (attempt) => attempt.status !== 'passed' && attempt.status !== 'skipped'
    ).length;
    const flaky = entries.filter((attempts) => {
      if (!attempts.length) return false;
      const finalAttempt = attempts[attempts.length - 1];
      if (finalAttempt.status !== 'passed') return false;

      const retried = attempts.length > 1 || attempts.some((attempt) => attempt.retry > 0);
      const hadNonPassingAttempt = attempts
        .slice(0, -1)
        .some((attempt) => attempt.status !== 'passed');

      return retried && hadNonPassingAttempt;
    }).length;

    const problems = [];

    if (this.total < baseline.e2e.minTests) {
      problems.push('somente ' + this.total + ' E2E descobertos; mínimo protegido: ' + baseline.e2e.minTests);
    }
    if (skipped > baseline.e2e.maxSkipped) {
      problems.push(skipped + ' E2E skipped; máximo permitido: ' + baseline.e2e.maxSkipped);
    }
    if (flaky > baseline.e2e.maxFlaky) {
      problems.push(flaky + ' E2E flaky/retry; máximo permitido: ' + baseline.e2e.maxFlaky);
    }
    if (failed > 0) {
      problems.push(failed + ' E2E com status final não aprovado (failed/timedOut/interrupted)');
    }
    if (this.attemptsById.size < this.total && result.status === 'passed') {
      problems.push('apenas ' + this.attemptsById.size + '/' + this.total + ' testes produziram resultado final');
    }

    if (problems.length) {
      console.error('\nGate E2E falhou:');
      for (const problem of problems) console.error('- ' + problem);
      return { status: 'failed' };
    }

    console.log(
      'Gate E2E aprovado: ' + this.total +
      ' teste(s), skipped=' + skipped +
      ', flaky=' + flaky +
      ', failed=' + failed + '.'
    );
    return undefined;
  }
}

module.exports = PlaywrightGateReporter;
~~~

O blob auditado possui newline final. A posição documental 83 representa explicitamente esse terminador.

## 11. Cobertura documental linha a linha

### Linha 1

**Fonte:** 'use strict';

**O que faz:** Ativa o modo estrito do CommonJS.

**Como faz:** O parser aplica strict mode a todo o módulo antes de carregar baseline ou definir a classe.

**Por que foi implementado dessa forma:** Evita semânticas permissivas e mantém o tooling de CI previsível.

**Por que uma implementação ingênua seria pior:** Sem strict mode, erros como atribuições implícitas poderiam passar silenciosamente em manutenção futura.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o self-test requer e executa o módulo real, mas não há assertion focal do strict mode.

### Linha 2

**Fonte:** (linha vazia)

**O que faz:** Separa a diretiva de modo estrito da dependência de baseline.

**Como faz:** É uma linha vazia editorial; não altera o runtime.

**Por que foi implementado dessa forma:** Mantém visível a divisão entre configuração do módulo e imports.

**Por que uma implementação ingênua seria pior:** Remover não mudaria a execução, apenas reduziria legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: formatação não é alvo de assertion.

### Linha 3

**Fonte:** const baseline = require('./data/test-baseline.json');

**O que faz:** Carrega o baseline canônico de testes da CI.

**Como faz:** require resolve scripts/ci/data/test-baseline.json uma vez no carregamento e entrega o objeto usado por onEnd.

**Por que foi implementado dessa forma:** Centraliza minTests, maxSkipped e maxFlaky em uma fonte única compartilhada com outros gates.

**Por que uma implementação ingênua seria pior:** Hardcode no reporter duplicaria thresholds e permitiria drift entre reporter, shard plan e verificadores.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo self-test real; verify-ci-contract.js também lê o mesmo baseline e valida e2e.minTests/maxFlaky.

### Linha 4

**Fonte:** (linha vazia)

**O que faz:** Separa dependências da definição da classe.

**Como faz:** Linha vazia sem efeito de execução.

**Por que foi implementado dessa forma:** Distingue bootstrap do módulo de sua API principal.

**Por que uma implementação ingênua seria pior:** Sem separação, somente a leitura ficaria mais densa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 5

**Fonte:** class PlaywrightGateReporter {

**O que faz:** Declara o custom reporter usado pelo Playwright.

**Como faz:** A classe expõe hooks reconhecidos pelo ciclo de reporter: constructor, onBegin, onTestEnd e onEnd.

**Por que foi implementado dessa forma:** Encapsula estado por execução e permite ao Playwright instanciar o gate via configuração.

**Por que uma implementação ingênua seria pior:** Funções globais tornariam ownership do estado de tentativas menos claro e mais propenso a vazamento entre instâncias.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o self-test importa a classe real e cria instâncias; configs reais apontam para este módulo.

### Linha 6

**Fonte:**   constructor() {

**O que faz:** Abre o construtor de uma instância do reporter.

**Como faz:** Playwright ou o self-test chama new PlaywrightGateReporter antes dos hooks.

**Por que foi implementado dessa forma:** Garante que cada execução começa com estado próprio.

**Por que uma implementação ingênua seria pior:** Estado em escopo de módulo poderia sobreviver entre instâncias no mesmo processo e contaminar resultados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelos cenários do self-test.

### Linha 7

**Fonte:**     this.total = 0;

**O que faz:** Inicializa a contagem de testes descobertos em zero.

**Como faz:** Cria this.total antes de onBegin substituí-lo pela descoberta real.

**Por que foi implementado dessa forma:** Fornece estado definido mesmo se lifecycle incompleto ocorrer.

**Por que uma implementação ingênua seria pior:** Deixar undefined produziria logs/comparações menos determinísticos em fluxos anormais.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; não há assertion isolada do valor inicial.

### Linha 8

**Fonte:**     this.attemptsById = new Map();

**O que faz:** Cria o mapa que preserva todas as tentativas por test.id.

**Como faz:** Cada chave representa um teste e o valor será um array cronológico de status/retry.

**Por que foi implementado dessa forma:** O gate precisa distinguir falha terminal de flaky que falha e depois passa.

**Por que uma implementação ingênua seria pior:** Guardar apenas o último status apagaria a evidência de retry e permitiria regressão flaky ficar verde.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo self-test de failed→passed e timedOut→passed, que só reprovam se o histórico for preservado.

### Linha 9

**Fonte:**   }

**O que faz:** Fecha o construtor.

**Como faz:** Conclui a inicialização de total e attemptsById antes dos hooks.

**Por que foi implementado dessa forma:** Mantém o estado obrigatório criado atomicamente na instanciação.

**Por que uma implementação ingênua seria pior:** Um construtor parcialmente inicializado quebraria hooks posteriores.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento/instanciação real.

### Linha 10

**Fonte:** (linha vazia)

**O que faz:** Separa construtor do hook onBegin.

**Como faz:** Linha vazia editorial sem efeito de runtime.

**Por que foi implementado dessa forma:** Marca mudança de fase do lifecycle.

**Por que uma implementação ingênua seria pior:** A ausência só afetaria legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 11

**Fonte:**   onBegin(_config, suite) {

**O que faz:** Declara o hook onBegin do reporter.

**Como faz:** Recebe config não usado e a suite descoberta pelo Playwright.

**Por que foi implementado dessa forma:** É o ponto correto para capturar o inventário total antes dos resultados individuais.

**Por que uma implementação ingênua seria pior:** Contar apenas callbacks onTestEnd confundiria testes descobertos com testes que efetivamente produziram resultado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: o self-test chama onBegin com suites sintéticas e a assertion de total=20 reprova pelo baseline.

### Linha 12

**Fonte:**     this.total = suite.allTests().length;

**O que faz:** Captura quantos testes Playwright descobriu.

**Como faz:** suite.allTests() retorna a coleção e length é gravado em this.total.

**Por que foi implementado dessa forma:** Esse número vira denominador do gate de mínimo e da checagem de resultados ausentes.

**Por que uma implementação ingênua seria pior:** Usar attemptsById.size como total permitiria que testes sem onTestEnd desaparecessem da contagem.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo cenário com total 20 e pelos demais cenários de total 21.

### Linha 13

**Fonte:**     console.log('[CI/E2E] Playwright descobriu ' + this.total + ' teste(s).');

**O que faz:** Emite diagnóstico com a contagem descoberta.

**Como faz:** console.log registra somente a quantidade, sem títulos/payloads de teste.

**Por que foi implementado dessa forma:** Ajuda a auditar inventário E2E nos logs de CI com baixa exposição de dados.

**Por que uma implementação ingênua seria pior:** Logar objetos de teste completos seria mais ruidoso e poderia expor detalhes desnecessários.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: o self-test não intercepta nem valida console.log.

### Linha 14

**Fonte:**   }

**O que faz:** Fecha onBegin.

**Como faz:** Termina o hook após persistir total e escrever o log.

**Por que foi implementado dessa forma:** Mantém onBegin síncrono e pequeno.

**Por que uma implementação ingênua seria pior:** Adicionar trabalho assíncrono aqui complicaria o começo da execução sem necessidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no fluxo do self-test, sem assertion focal do delimitador.

### Linha 15

**Fonte:** (linha vazia)

**O que faz:** Separa onBegin de onTestEnd.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Evidencia a transição de descoberta para coleta de tentativas.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 16

**Fonte:**   onTestEnd(test, result) {

**O que faz:** Declara o hook chamado ao terminar cada tentativa de teste.

**Como faz:** Recebe o objeto test e o result daquela tentativa.

**Por que foi implementado dessa forma:** É o ponto de coleta necessário para reconstruir retry/flakiness sem depender do status global.

**Por que uma implementação ingênua seria pior:** Olhar somente onEnd perderia o histórico por teste.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: o self-test chama onTestEnd repetidamente com o módulo real.

### Linha 17

**Fonte:**     const attempts = this.attemptsById.get(test.id) || [];

**O que faz:** Recupera o histórico do test.id ou cria array vazio.

**Como faz:** Map.get usa a identidade estável do teste; || [] inicializa a primeira tentativa.

**Por que foi implementado dessa forma:** Agrupar por id permite comparar tentativas do mesmo teste.

**Por que uma implementação ingênua seria pior:** Um array global exigiria correlação posterior e facilitaria misturar retries de testes diferentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários que usam t20 duas vezes com retry.

### Linha 18

**Fonte:**     attempts.push({

**O que faz:** Abre o objeto de tentativa que será anexado ao histórico.

**Como faz:** attempts.push acrescenta a nova observação ao fim do array.

**Por que foi implementado dessa forma:** A ordem de callbacks vira ordem usada por onEnd para achar tentativa final.

**Por que uma implementação ingênua seria pior:** Sobrescrever a tentativa anterior destruiria evidência de flaky.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários de retry do self-test.

### Linha 19

**Fonte:**       status: result.status,

**O que faz:** Persiste o status reportado pelo Playwright.

**Como faz:** Copia result.status sem reinterpretá-lo na coleta.

**Por que foi implementado dessa forma:** Preserva passed/skipped/failed/timedOut/interrupted para classificação posterior centralizada.

**Por que uma implementação ingênua seria pior:** Converter cedo para booleano perderia distinções úteis de diagnóstico e regressão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por asserts com skipped, failed, timedOut, interrupted e passed.

### Linha 20

**Fonte:**       retry: Number(result.retry || 0),

**O que faz:** Normaliza o índice de retry para número, com zero como fallback.

**Como faz:** result.retry falsy vira 0 e Number converte o valor antes de armazenar.

**Por que foi implementado dessa forma:** Permite detectar retry tanto pelo tamanho do histórico quanto pelo contador do Playwright.

**Por que uma implementação ingênua seria pior:** Ignorar retry reduziria a defesa contra histórico incompleto; guardar valor não numérico fragilizaria a comparação.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para retry 0/1 no self-test; ⚠️ não há teste para valor malformado/NaN.

### Linha 21

**Fonte:**     });

**O que faz:** Fecha o objeto status/retry passado a push.

**Como faz:** A tentativa armazenada fica deliberadamente mínima.

**Por que foi implementado dessa forma:** Minimiza memória e evita reter objetos Playwright pesados até onEnd.

**Por que uma implementação ingênua seria pior:** Guardar result/test inteiros aumentaria memória e poderia carregar anexos/metadata sem necessidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelos cenários do self-test.

### Linha 22

**Fonte:**     this.attemptsById.set(test.id, attempts);

**O que faz:** Grava de volta o array atualizado no Map.

**Como faz:** set associa o histórico ao test.id após o push.

**Por que foi implementado dessa forma:** Na primeira tentativa materializa a chave; nas seguintes mantém o mesmo histórico.

**Por que uma implementação ingênua seria pior:** Esquecer o set na primeira tentativa faria o resultado desaparecer e quebraria contagem/flaky.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos asserts de happy path, falha e retry.

### Linha 23

**Fonte:**   }

**O que faz:** Fecha onTestEnd.

**Como faz:** Termina a coleta sem I/O nem awaits.

**Por que foi implementado dessa forma:** Mantém o hook barato mesmo com E2E paralelo.

**Por que uma implementação ingênua seria pior:** Fazer validação final a cada tentativa duplicaria trabalho e produziria falhas prematuras antes de retries.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no fluxo do self-test.

### Linha 24

**Fonte:** (linha vazia)

**O que faz:** Separa coleta de tentativas da avaliação final.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Destaca que as políticas são aplicadas só em onEnd.

**Por que uma implementação ingênua seria pior:** Misturar as fases reduziria clareza.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 25

**Fonte:**   async onEnd(result) {

**O que faz:** Declara onEnd, hook final e async do reporter.

**Como faz:** Recebe o resultado global do run e pode retornar override de status.

**Por que foi implementado dessa forma:** Centraliza todas as decisões após o conjunto de callbacks onTestEnd.

**Por que uma implementação ingênua seria pior:** Falhar dentro de onTestEnd impediria avaliar retries e inventário completo.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: finish retorna reporter.onEnd e compara seus retornos.

### Linha 26

**Fonte:**     const entries = [...this.attemptsById.values()];

**O que faz:** Converte os valores do Map em uma lista de históricos por teste.

**Como faz:** Spread materializa um array de arrays sem as chaves.

**Por que foi implementado dessa forma:** As métricas seguintes operam por histórico, enquanto a checagem de cardinalidade usa o Map original.

**Por que uma implementação ingênua seria pior:** Reiterar Map.values em cada métrica repetiria traversal e deixaria o fluxo menos legível.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por todos os cenários de onEnd.

### Linha 27

**Fonte:**     const finalStatuses = entries

**O que faz:** Inicia a construção da lista de status finais.

**Como faz:** finalStatuses será derivado de cada histórico de tentativas.

**Por que foi implementado dessa forma:** Separar status terminal simplifica contagem de skipped/failed sem apagar entries usado para flaky.

**Por que uma implementação ingênua seria pior:** Usar somente finalStatuses para flaky perderia tentativas anteriores.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários de terminal e retry.

### Linha 28

**Fonte:**       .map((attempts) => attempts[attempts.length - 1])

**O que faz:** Seleciona a última tentativa de cada teste.

**Como faz:** Index attempts.length - 1 implementa a noção de status final.

**Por que foi implementado dessa forma:** Playwright pode executar retries; o gate terminal deve considerar o desfecho mais recente.

**Por que uma implementação ingênua seria pior:** Usar a primeira tentativa reprovaria todo retry mesmo se a política futura permitisse alguns flaky; usar qualquer passed mascararia terminal posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos casos failed→passed e timedOut→passed, em conjunto com a lógica flaky.

### Linha 29

**Fonte:**       .filter(Boolean);

**O que faz:** Remove valores finais falsy da lista.

**Como faz:** filter(Boolean) protege a agregação caso apareça histórico vazio.

**Por que foi implementado dessa forma:** Evita acesso de status em undefined em estado corrompido/manual.

**Por que uma implementação ingênua seria pior:** Sem filtro, um array vazio inserido artificialmente no Map poderia causar TypeError; no fluxo normal onTestEnd só cria arrays não vazios.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para histórico vazio; no fluxo real é defesa redundante.

### Linha 30

**Fonte:** (linha vazia)

**O que faz:** Separa derivação dos status finais das métricas.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Facilita auditar o pipeline: derivar, contar, aplicar políticas.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 31

**Fonte:**     const skipped = finalStatuses.filter((attempt) => attempt.status === 'skipped').length;

**O que faz:** Conta testes cujo status final é skipped.

**Como faz:** Filtra finalStatuses por igualdade exata e usa length.

**Por que foi implementado dessa forma:** A política do baseline exige maxSkipped=0 atualmente.

**Por que uma implementação ingênua seria pior:** Contar skip em qualquer tentativa poderia marcar como skip um teste que depois realmente executou/passa.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo cenário que troca t20 para skipped e espera status failed.

### Linha 32

**Fonte:**     const failed = finalStatuses.filter(

**O que faz:** Inicia a contagem de status finais não aprovados.

**Como faz:** Filtra finalStatuses antes de obter length.

**Por que foi implementado dessa forma:** Mantém o critério terminal separado de skipped e flaky.

**Por que uma implementação ingênua seria pior:** Confiar só no result.status global reduziria diagnóstico e poderia não indicar quantos testes terminaram mal.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários de failed/timedOut/interrupted finais.

### Linha 33

**Fonte:**       (attempt) => attempt.status !== 'passed' && attempt.status !== 'skipped'

**O que faz:** Define failed como tudo que não é passed nem skipped.

**Como faz:** A predicate trata failed, timedOut, interrupted e futuros status não aprovados como falha conservadora.

**Por que foi implementado dessa forma:** Fail-closed para status finais desconhecidos protege o gate.

**Por que uma implementação ingênua seria pior:** Enumerar apenas failed e timedOut poderia deixar novo status terminal passar silenciosamente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para failed/timedOut/interrupted; status futuro desconhecido não é testado.

### Linha 34

**Fonte:**     ).length;

**O que faz:** Obtém a quantidade de status finais não aprovados.

**Como faz:** length transforma o filtro em métrica numérica.

**Por que foi implementado dessa forma:** A mensagem posterior informa quantos E2E terminaram fora de passed/skipped.

**Por que uma implementação ingênua seria pior:** Guardar apenas booleano perderia diagnóstico de cardinalidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos asserts de estados terminais.

### Linha 35

**Fonte:**     const flaky = entries.filter((attempts) => {

**O que faz:** Inicia a contagem de testes flaky por histórico.

**Como faz:** Filtra entries, não finalStatuses, para inspecionar tentativas anteriores.

**Por que foi implementado dessa forma:** Flaky é propriedade da sequência, não apenas do status final.

**Por que uma implementação ingênua seria pior:** Olhar só o último resultado permitiria failed→passed em retry ficar verde.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelas duas regressões de failed/timedOut→passed.

### Linha 36

**Fonte:**       if (!attempts.length) return false;

**O que faz:** Descarta defensivamente um histórico vazio.

**Como faz:** Retorna false antes de indexar a última tentativa.

**Por que foi implementado dessa forma:** Evita exceção em estado impossível no fluxo normal.

**Por que uma implementação ingênua seria pior:** Sem o guard, histórico vazio manual/corrompido resultaria em undefined.status.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; onTestEnd não cria histórico vazio.

### Linha 37

**Fonte:**       const finalAttempt = attempts[attempts.length - 1];

**O que faz:** Captura a última tentativa do histórico corrente.

**Como faz:** Usa o mesmo critério de terminalidade aplicado em finalStatuses.

**Por que foi implementado dessa forma:** A detecção de flaky só interessa quando o desfecho final é passed.

**Por que uma implementação ingênua seria pior:** Recomputar múltiplas vezes o índice aumentaria ruído e risco de inconsistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários de retry.

### Linha 38

**Fonte:**       if (finalAttempt.status !== 'passed') return false;

**O que faz:** Exclui da métrica flaky qualquer teste que não termine passed.

**Como faz:** Retorna false cedo se status final for diferente de passed.

**Por que foi implementado dessa forma:** Falhas terminais já são tratadas por failed; flaky aqui significa recuperação em retry.

**Por que uma implementação ingênua seria pior:** Contar falha terminal também como flaky duplicaria categorias e tornaria diagnóstico menos preciso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários terminais e de recuperação.

### Linha 39

**Fonte:** (linha vazia)

**O que faz:** Separa guardas da detecção detalhada de retry.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Torna a regra flaky legível em duas condições independentes.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 40

**Fonte:**       const retried = attempts.length > 1 || attempts.some((attempt) => attempt.retry > 0);

**O que faz:** Detecta se houve retry pelo número de tentativas ou pelo campo retry.

**Como faz:** OR cobre histórico com mais de um callback e metadata retry positiva.

**Por que foi implementado dessa forma:** Redundância defensiva reduz chance de perder retry se uma das representações vier incompleta.

**Por que uma implementação ingênua seria pior:** Usar apenas attempts.length dependeria de receber todos os callbacks; usar apenas retry dependeria integralmente da metadata.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário com duas tentativas e retry=1; ⚠️ não há teste isolando apenas uma das duas condições.

### Linha 41

**Fonte:**       const hadNonPassingAttempt = attempts

**O que faz:** Inicia a detecção de tentativa anterior não aprovada.

**Como faz:** A variável separa o fato de retry do fato de existir falha antes do passed final.

**Por que foi implementado dessa forma:** Um retry por razão não-falha não deve automaticamente ser classificado como flaky por esta definição.

**Por que uma implementação ingênua seria pior:** Classificar qualquer retry como flaky poderia gerar falso positivo em políticas futuras.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelas sequências failed/timedOut→passed.

### Linha 42

**Fonte:**         .slice(0, -1)

**O que faz:** Remove a tentativa final antes de procurar problemas prévios.

**Como faz:** slice(0,-1) restringe a busca ao histórico anterior ao passed final.

**Por que foi implementado dessa forma:** Evita que o próprio passed terminal interfira na condição.

**Por que uma implementação ingênua seria pior:** Pesquisar o array inteiro seria equivalente nos casos atuais, mas esconderia a intenção temporal e facilitaria erro se predicate mudasse.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários de retry.

### Linha 43

**Fonte:**         .some((attempt) => attempt.status !== 'passed');

**O que faz:** Procura qualquer tentativa anterior cujo status não seja passed.

**Como faz:** some retorna true para failed/timedOut/skipped/interrupted anteriores.

**Por que foi implementado dessa forma:** Captura recuperação após não-aprovação sem exigir enumeração exaustiva.

**Por que uma implementação ingênua seria pior:** Checar apenas failed perderia timeouts e outros status.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para failed e timedOut anteriores; outros status anteriores não têm caso focal.

### Linha 44

**Fonte:** (linha vazia)

**O que faz:** Separa cálculo das condições da decisão flaky.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Deixa visível que duas condições precisam ser combinadas.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 45

**Fonte:**       return retried && hadNonPassingAttempt;

**O que faz:** Classifica como flaky somente retry com não-passing anterior e passed final.

**Como faz:** AND exige evidência de repetição e de falha prévia.

**Por que foi implementado dessa forma:** Evita marcar um histórico anômalo sem retry como flaky e formaliza a regressão protegida.

**Por que uma implementação ingênua seria pior:** Usar OR geraria falsos positivos e usar apenas final passed mascararia flaky.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos self-tests failed→passed e timedOut→passed.

### Linha 46

**Fonte:**     }).length;

**O que faz:** Fecha o filtro de flaky e converte a seleção em contagem.

**Como faz:** length produz a métrica comparada ao baseline.

**Por que foi implementado dessa forma:** Mantém problems independente da estrutura dos históricos.

**Por que uma implementação ingênua seria pior:** Guardar a lista inteira seria desnecessário porque o reporter só precisa da contagem para gate/log.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelas assertions de retry.

### Linha 47

**Fonte:** (linha vazia)

**O que faz:** Separa métricas da construção de erros.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Distingue observação de política.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 48

**Fonte:**     const problems = [];

**O que faz:** Cria o acumulador de violações do gate.

**Como faz:** problems começa vazio e recebe todas as políticas violadas.

**Por que foi implementado dessa forma:** Permite reportar múltiplos problemas numa única execução antes de reprovar.

**Por que uma implementação ingênua seria pior:** Retornar na primeira falha esconderia diagnósticos adicionais e aumentaria ciclos de correção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por todos os cenários; não há assert da lista/mensagens completa.

### Linha 49

**Fonte:** (linha vazia)

**O que faz:** Separa inicialização de problems do primeiro threshold.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Melhora leitura das políticas independentes.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 50

**Fonte:**     if (this.total < baseline.e2e.minTests) {

**O que faz:** Abre o gate de quantidade mínima de E2E.

**Como faz:** Compara descoberta real this.total com baseline.e2e.minTests, hoje 21.

**Por que foi implementado dessa forma:** Impede redução silenciosa do inventário de testes.

**Por que uma implementação ingênua seria pior:** Sem piso, remoções/erros de discovery poderiam deixar CI verde com cobertura funcional menor.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: total=20 é esperado como failed no self-test.

### Linha 51

**Fonte:**       problems.push('somente ' + this.total + ' E2E descobertos; mínimo protegido: ' + baseline.e2e.minTests);

**O que faz:** Registra mensagem quando a descoberta fica abaixo do mínimo.

**Como faz:** Inclui valor observado e threshold protegido no diagnóstico.

**Por que foi implementado dessa forma:** Facilita identificar drift do inventário sem inspecionar código.

**Por que uma implementação ingênua seria pior:** Mensagem genérica sem números exigiria investigação adicional.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela falha de total 20; texto exato não é asserted.

### Linha 52

**Fonte:**     }

**O que faz:** Fecha o gate de minTests.

**Como faz:** Isola esta política das demais para permitir acumulação.

**Por que foi implementado dessa forma:** Cada regra adiciona problema sem retornar cedo.

**Por que uma implementação ingênua seria pior:** Um else encadeado impediria detectar violações simultâneas.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo cenário de total baixo.

### Linha 53

**Fonte:**     if (skipped > baseline.e2e.maxSkipped) {

**O que faz:** Abre o gate de skipped acima do limite.

**Como faz:** Compara skipped final com baseline.e2e.maxSkipped, hoje 0.

**Por que foi implementado dessa forma:** Evita que E2E desativados contem como suíte saudável.

**Por que uma implementação ingênua seria pior:** Ignorar skipped permitiria neutralizar regressões marcando testes como skip.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo cenário com um skipped.

### Linha 54

**Fonte:**       problems.push(skipped + ' E2E skipped; máximo permitido: ' + baseline.e2e.maxSkipped);

**O que faz:** Registra quantidade skipped e limite na mensagem.

**Como faz:** Adiciona diagnóstico a problems em vez de encerrar imediatamente.

**Por que foi implementado dessa forma:** Mantém todas as violações visíveis em uma execução.

**Por que uma implementação ingênua seria pior:** Falhar sem contagem dificultaria saber extensão do problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela assertion de skipped; texto não é testado.

### Linha 55

**Fonte:**     }

**O que faz:** Fecha o gate de skipped.

**Como faz:** Mantém política independente.

**Por que foi implementado dessa forma:** Permite avaliar flaky/failures mesmo quando já há skip.

**Por que uma implementação ingênua seria pior:** Early-return reduziria informação.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo cenário skipped.

### Linha 56

**Fonte:**     if (flaky > baseline.e2e.maxFlaky) {

**O que faz:** Abre o gate de flaky/retry acima do limite.

**Como faz:** Compara flaky com baseline.e2e.maxFlaky, hoje 0.

**Por que foi implementado dessa forma:** Bloqueia exatamente a regressão em que retry recupera falha e a execução parece verde.

**Por que uma implementação ingênua seria pior:** Aceitar flaky sem política explícita mascara instabilidade e pode tornar E2E não determinístico.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por failed→passed e timedOut→passed.

### Linha 57

**Fonte:**       problems.push(flaky + ' E2E flaky/retry; máximo permitido: ' + baseline.e2e.maxFlaky);

**O que faz:** Registra quantidade flaky e limite protegido.

**Como faz:** Adiciona a violação a problems com contexto numérico.

**Por que foi implementado dessa forma:** Torna o motivo do vermelho auditável nos logs.

**Por que uma implementação ingênua seria pior:** Mensagem sem métricas dificultaria distinguir um caso isolado de regressão ampla.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelos self-tests de flaky; texto exato não é asserted.

### Linha 58

**Fonte:**     }

**O que faz:** Fecha o gate de flaky.

**Como faz:** Mantém avaliação acumulativa.

**Por que foi implementado dessa forma:** Permite que falhas terminais e inventário ausente também sejam reportados.

**Por que uma implementação ingênua seria pior:** Retorno precoce reduziria diagnóstico.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários de retry.

### Linha 59

**Fonte:**     if (failed > 0) {

**O que faz:** Abre o gate de status final não aprovado.

**Como faz:** Qualquer failed count maior que zero gera problema independentemente do status global.

**Por que foi implementado dessa forma:** Adiciona defesa explícita por teste e mensagem uniforme.

**Por que uma implementação ingênua seria pior:** Confiar somente na saída padrão do Playwright deixaria o contrato do reporter menos verificável.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para failed, timedOut e interrupted.

### Linha 60

**Fonte:**       problems.push(failed + ' E2E com status final não aprovado (failed/timedOut/interrupted)');

**O que faz:** Registra a quantidade de E2E com terminal não aprovado.

**Como faz:** A mensagem explicita failed/timedOut/interrupted como classes esperadas.

**Por que foi implementado dessa forma:** Produz diagnóstico direto do motivo do gate.

**Por que uma implementação ingênua seria pior:** Silenciar a categoria obrigaria depender de logs internos do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; o texto exato não é asserted e status futuro também cairia aqui apesar da enumeração textual.

### Linha 61

**Fonte:**     }

**O que faz:** Fecha o gate de falha terminal.

**Como faz:** Preserva independência das políticas.

**Por que foi implementado dessa forma:** Ainda permite verificar falta de resultados antes da decisão final.

**Por que uma implementação ingênua seria pior:** Retorno cedo esconderia problemas adicionais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários terminais.

### Linha 62

**Fonte:**     if (this.attemptsById.size < this.total && result.status === 'passed') {

**O que faz:** Abre a proteção contra testes descobertos sem resultado quando o run global passou.

**Como faz:** Compara cardinalidade de test.id observados com this.total e exige result.status passed para gerar esta violação.

**Por que foi implementado dessa forma:** Detecta uma execução aparentemente verde em que callbacks/resultados ficaram faltando.

**Por que uma implementação ingênua seria pior:** Sem a comparação, testes descobertos mas sem onTestEnd poderiam desaparecer das métricas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: nenhum self-test usa total maior que attempts com runStatus passed.

### Linha 63

**Fonte:**       problems.push('apenas ' + this.attemptsById.size + '/' + this.total + ' testes produziram resultado final');

**O que faz:** Registra quantos testes produziram resultado versus quantos foram descobertos.

**Como faz:** A mensagem usa attemptsById.size/this.total para tornar a lacuna mensurável.

**Por que foi implementado dessa forma:** Ajuda diagnosticar reporter incompleto ou execução abortada de modo inconsistente.

**Por que uma implementação ingênua seria pior:** Mensagem sem denominador esconderia o tamanho do buraco.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; o branch não é exercitado focalmente.

### Linha 64

**Fonte:**     }

**O que faz:** Fecha a proteção de resultado ausente.

**Como faz:** Limita a política ao run global passed.

**Por que foi implementado dessa forma:** Evita duplicar a falha global quando Playwright já terminou failed, embora isso reduza diagnóstico do reporter nesse caso.

**Por que uma implementação ingênua seria pior:** Aplicar sem condição reprovaria também runs já falhos, sem mudar status mas com mais diagnóstico; a escolha atual prioriza gate de falso-verde.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 65

**Fonte:** (linha vazia)

**O que faz:** Separa coleta de problemas da decisão do reporter.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Marca a fronteira entre avaliação e efeito final.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 66

**Fonte:**     if (problems.length) {

**O que faz:** Abre o branch de reprovação quando existe qualquer problema.

**Como faz:** problems.length é truthy se ao menos uma política adicionou mensagem.

**Por que foi implementado dessa forma:** Uma única violação é suficiente para derrubar o gate, mas todas já foram acumuladas.

**Por que uma implementação ingênua seria pior:** Exigir mais de uma violação permitiria regressão isolada passar.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por todos os cenários negativos do self-test.

### Linha 67

**Fonte:**       console.error('\nGate E2E falhou:');

**O que faz:** Escreve o cabeçalho de falha no stderr.

**Como faz:** console.error inicia um bloco visual separado por newline.

**Por que foi implementado dessa forma:** Distingue o gate das mensagens normais do Playwright nos logs de CI.

**Por que uma implementação ingênua seria pior:** Usar console.log para falha reduziria sinalização semântica em pipelines que separam stderr.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do texto/canal.

### Linha 68

**Fonte:**       for (const problem of problems) console.error('- ' + problem);

**O que faz:** Imprime cada problema acumulado.

**Como faz:** O for...of preserva a ordem das políticas e prefixa cada mensagem com hífen.

**Por que foi implementado dessa forma:** Exibe todas as causas de uma vez.

**Por que uma implementação ingênua seria pior:** Imprimir apenas problems[0] esconderia violações simultâneas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do conteúdo do console; o retorno failed é testado.

### Linha 69

**Fonte:**       return { status: 'failed' };

**O que faz:** Retorna override de status failed ao Playwright.

**Como faz:** O custom reporter usa o retorno de onEnd para tornar a execução reprovada quando o gate detecta violações.

**Por que foi implementado dessa forma:** Conecta diagnóstico à semântica de CI, em vez de apenas escrever logs.

**Por que uma implementação ingênua seria pior:** Somente console.error permitiria o comando continuar verde se o run base estivesse passed.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: todos os casos negativos esperam exatamente { status: 'failed' }.

### Linha 70

**Fonte:**     }

**O que faz:** Fecha o branch de problems.

**Como faz:** Garante que sucesso só ocorre quando nenhuma política registrou problema.

**Por que foi implementado dessa forma:** Se o fluxo caísse no success log após retorno condicional incorreto, poderia gerar mensagens contraditórias.

**Por que uma implementação ingênua seria pior:** A estrutura atual evita log de aprovado depois de falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos retornos mutuamente exclusivos do self-test.

### Linha 71

**Fonte:** (linha vazia)

**O que faz:** Separa o caminho de falha do caminho de sucesso.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Torna explícito o fallthrough apenas sem problemas.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 72

**Fonte:**     console.log(

**O que faz:** Inicia o log resumido de aprovação.

**Como faz:** console.log é chamado somente depois de problems.length ser zero.

**Por que foi implementado dessa forma:** Fornece confirmação positiva e métricas finais.

**Por que uma implementação ingênua seria pior:** Ausência de resumo dificultaria auditar rapidamente skipped/flaky/failed na CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do log.

### Linha 73

**Fonte:**       'Gate E2E aprovado: ' + this.total +

**O que faz:** Adiciona a quantidade total ao resumo de aprovação.

**Como faz:** Concatena this.total ao prefixo da mensagem.

**Por que foi implementado dessa forma:** Permite conferir rapidamente o inventário descoberto.

**Por que uma implementação ingênua seria pior:** Omitir total esconderia redução que ainda estivesse acima do mínimo.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do texto; total é testado por outras assertions.

### Linha 74

**Fonte:**       ' teste(s), skipped=' + skipped +

**O que faz:** Adiciona total de testes e skipped ao resumo.

**Como faz:** Concatena skipped calculado a partir dos status finais.

**Por que foi implementado dessa forma:** Expõe explicitamente que aprovação teve zero skips sob baseline atual.

**Por que uma implementação ingênua seria pior:** Log sem skipped reduziria observabilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do log.

### Linha 75

**Fonte:**       ', flaky=' + flaky +

**O que faz:** Adiciona a métrica flaky ao resumo.

**Como faz:** Concatena o número derivado dos históricos de retry.

**Por que foi implementado dessa forma:** Torna visível a política que motivou este reporter customizado.

**Por que uma implementação ingênua seria pior:** Sem métrica, uma futura mudança de limite seria menos auditável.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do log; cálculo flaky é diretamente testado.

### Linha 76

**Fonte:**       ', failed=' + failed + '.'

**O que faz:** Adiciona failed e ponto final à mensagem.

**Como faz:** Concatena a contagem de terminais não aprovados.

**Por que foi implementado dessa forma:** Fecha o resumo com as três métricas de saúde relevantes.

**Por que uma implementação ingênua seria pior:** Omitir failed exigiria consultar outros logs para confirmar zero.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do texto; cálculo failed é testado.

### Linha 77

**Fonte:**     );

**O que faz:** Fecha a chamada console.log do caminho aprovado.

**Como faz:** Finaliza a montagem da mensagem multilinha no código-fonte.

**Por que foi implementado dessa forma:** Mantém formatação legível sem alterar semântica.

**Por que uma implementação ingênua seria pior:** Uma única linha longa teria mesma execução, porém manutenção pior.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 78

**Fonte:**     return undefined;

**O que faz:** Retorna undefined no caminho aprovado.

**Como faz:** Não sobrescreve o status do run quando o gate customizado não encontra problema.

**Por que foi implementado dessa forma:** Preserva a semântica padrão do Playwright em execução saudável.

**Por que uma implementação ingênua seria pior:** Retornar {status:'passed'} poderia indevidamente tentar forçar sucesso sobre estado global que o Playwright administra.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: o happy path do self-test espera undefined.

### Linha 79

**Fonte:**   }

**O que faz:** Fecha onEnd.

**Como faz:** Conclui o hook depois do retorno de falha ou do caminho de sucesso.

**Por que foi implementado dessa forma:** Mantém toda política encapsulada no lifecycle final.

**Por que uma implementação ingênua seria pior:** Deixar lógica fora do hook não seria invocada pelo reporter automaticamente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no self-test.

### Linha 80

**Fonte:** }

**O que faz:** Fecha a classe PlaywrightGateReporter.

**Como faz:** Termina a API do reporter antes do export CommonJS.

**Por que foi implementado dessa forma:** Mantém somente os hooks necessários e estado interno.

**Por que uma implementação ingênua seria pior:** Exportar múltiplas superfícies aumentaria contrato sem necessidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo require real.

### Linha 81

**Fonte:** (linha vazia)

**O que faz:** Separa a definição da classe do export.

**Como faz:** Linha vazia editorial.

**Por que foi implementado dessa forma:** Dá visibilidade ao boundary CommonJS.

**Por que uma implementação ingênua seria pior:** Só afeta legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 82

**Fonte:** module.exports = PlaywrightGateReporter;

**O que faz:** Exporta a classe como valor padrão CommonJS do módulo.

**Como faz:** module.exports permite que Playwright config e self-test façam require do construtor.

**Por que foi implementado dessa forma:** Compatível com o restante do tooling Node/CommonJS do repositório.

**Por que uma implementação ingênua seria pior:** Export nomeado/ESM exigiria mudar consumidores e carregamento do Playwright.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: playwright-gate-reporter-selftest.js requer este módulo e instancia a classe real.

### Linha 83 — newline final

**Fonte:** (newline final após module.exports)

**O que faz:** Termina o arquivo textual com LF depois do export.

**Como faz:** O blob armazenado contém um caractere newline após a linha 82; ele não cria statement JavaScript adicional.

**Por que foi implementado dessa forma:** É a terminação textual convencional do repositório e evita arquivos sem newline final em tooling/diffs.

**Por que uma implementação ingênua seria pior:** Remover o newline não mudaria o runtime Node, mas cria ruído de diff e divergência byte-a-byte em auditorias de fonte integral.

**Evidência automatizada:** 🟦 INTEGRIDADE DE FONTE: posição confirmada no blob auditado; não é comportamento de runtime.

## 12. Autoauditoria de conclusão técnica

- SHA do fonte relido antes da materialização: 71fb92c1215a86cdb309f4599ea8d0b422e9b02e.
- Fonte integral: 82/82 linhas textuais copiadas, com newline final declarado como posição 83.
- Cobertura: 83/83 posições com seção própria.
- Consumers e dependências: playwright.config.js, playwright-merge.config.js, self-test, verify-ci-contract.js, package.json e workflow CI cruzados.
- Prova direta separada de gates estáticos e execução indireta.
- REG-E2E-FLAKY-RETRY-GATE tratado como rastreabilidade, não como substituto da assertion.
- Lacunas de missing-results, maxSkipped, ids/ordem, retry malformado e logging registradas sem alterar código funcional.
- Arquitetura MV3: explicitado que este arquivo é tooling Node e não mantém estado de service worker/extensão.
- Trust boundaries e minimização de logs documentados.

**Estado documental desta versão:** conteúdo completo e pronto para a seção crítica de AUDITORIA/STATUS/CHECKLIST quando o PROGRESS lock estiver disponível.

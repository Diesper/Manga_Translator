# Bíblia técnica — scripts/ci/playwright-gate-reporter.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** 16bddbd559f0c8def18b3d7923695ca693332391  
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
15. O SHA desta Bíblia só é válido enquanto o fonte for 16bddbd559f0c8def18b3d7923695ca693332391.

## 10. Fonte integral

~~~javascript
'use strict';

const baseline = require('./data/test-baseline.json');

function minimumExpectedTests() {
  const raw = process.env.MANGA_E2E_MIN_TESTS;
  if (raw === undefined || raw === '') return baseline.e2e.minTests;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('MANGA_E2E_MIN_TESTS deve ser inteiro positivo');
  }
  return value;
}

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

    const minTests = minimumExpectedTests();
    if (this.total < minTests) {
      problems.push('somente ' + this.total + ' E2E descobertos; mínimo protegido: ' + minTests);
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
module.exports.minimumExpectedTests = minimumExpectedTests;
~~~

O blob auditado possui newline final. A posição documental 83 representa explicitamente esse terminador.

## 11. Cobertura integral por posições — revisão atual

- **1:** strict mode.
- **2:** separação estrutural.
- **3:** baseline de testes protegido.
- **4:** separação estrutural.
- **5–13:** `minimumExpectedTests`: override focal validado e fallback para o baseline global.
- **14:** separação estrutural.
- **15–24:** classe reporter: estado e contagem de testes descobertos.
- **25:** separação estrutural.
- **26–33:** registro de tentativas por `test.id`.
- **34:** separação estrutural.
- **35–90:** cálculo de skipped/flaky/failures, mínimo efetivo e decisão final do gate.
- **91:** fechamento da classe.
- **92:** separação estrutural.
- **93–94:** exports do reporter e do helper de mínimo.
- **95:** newline terminal.

**Cobertura:** **95/95 posições**, contíguas, sem gap ou overlap.

**Revisão 2026-10-02:** `MANGA_E2E_MIN_TESTS` só aceita inteiro positivo; sem override, o mínimo global continua vindo do baseline.

## 12. Autoauditoria de conclusão técnica

- SHA do fonte relido antes da materialização: 16bddbd559f0c8def18b3d7923695ca693332391.
- Fonte integral: 82/82 linhas textuais copiadas, com newline final declarado como posição 83.
- Cobertura: 83/83 posições com seção própria.
- Consumers e dependências: playwright.config.js, playwright-merge.config.js, self-test, verify-ci-contract.js, package.json e workflow CI cruzados.
- Prova direta separada de gates estáticos e execução indireta.
- REG-E2E-FLAKY-RETRY-GATE tratado como rastreabilidade, não como substituto da assertion.
- Lacunas de missing-results, maxSkipped, ids/ordem, retry malformado e logging registradas sem alterar código funcional.
- Arquitetura MV3: explicitado que este arquivo é tooling Node e não mantém estado de service worker/extensão.
- Trust boundaries e minimização de logs documentados.

**Estado documental desta versão:** ✅ CONCLUÍDO — auditoria de qualidade documental aprovada para o SHA auditado; lacunas externas permanecem registradas como solicitações ao auditor.

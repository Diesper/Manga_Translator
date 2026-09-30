# Bíblia técnica — scripts/validation/playwright-gate-reporter-selftest.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA TÉCNICA APROVADA  
> **SHA auditado:** 478d6673dbb6d751e19f185feaed78764ebe6fde  
> **Agente responsável:** AGENTE 2  
> **Tipo:** tooling Node.js / self-test de infraestrutura / gate E2E  
> **Linhas textuais:** **79**  
> **Posições documentais:** **80**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é um self-test executável, sem Jest ou Playwright Test como runner, cujo objetivo é provar propriedades críticas do reporter `scripts/ci/playwright-gate-reporter.js`. Ele importa a implementação real, fabrica apenas a superfície mínima de suite/result necessária aos hooks `onBegin`, `onTestEnd` e `onEnd`, e usa o módulo nativo `assert` para transformar regressões de política E2E em exit code não zero.

O self-test não abre Chromium, não executa casos E2E reais e não lê DOM. A unidade sob teste é o reporter de gate. Isso torna a execução barata o suficiente para fazer parte do job **CI Contract** e também do comando agregado `npm run validate`.

A proteção central é impedir que a política do reporter seja enfraquecida sem detecção nas situações já cobertas: caminho saudável com 21 testes passed; skipped final; failed → passed em retry; timedOut → passed em retry; redução do inventário para 20; e estados finais failed/timedOut/interrupted.

## 2. Dependências diretas e limites

### Dependências diretas

- Node.js `assert`: fornece `strictEqual` e `deepStrictEqual`.
- `scripts/ci/playwright-gate-reporter.js`: implementação real sob teste.
- Indiretamente, o reporter carrega `scripts/ci/data/test-baseline.json`, cujo snapshot auditado define `e2e.minTests=21`, `e2e.maxSkipped=0` e `e2e.maxFlaky=0`.

### Consumidores / pontos de execução encontrados

1. `package.json` inclui `node scripts/validation/playwright-gate-reporter-selftest.js` dentro de `npm run validate`.
2. `.github/workflows/ci.yml`, job `ci-contract`, executa diretamente o self-test no step **Testar gate E2E contra retries/flaky**.
3. `.github/workflows/ci.yml`, job `windows-portability`, executa `npm run validate`, portanto também atravessa este self-test no Windows.
4. `scripts/ci/data/regression-matrix.json` registra `REG-E2E-FLAKY-RETRY-GATE` apontando para este arquivo e exige markers dos cenários failed/timedOut → passed.
5. `scripts/validation/verify-ci-contract.js` valida genericamente que cada entrada da matriz aponta para arquivo existente e contém seus markers. Isso é um gate estático complementar; não substitui as assertions deste self-test.

## 3. Fluxo de execução

`node scripts/validation/playwright-gate-reporter-selftest.js`

→ carrega `assert`  
→ carrega a classe real `PlaywrightGateReporter`  
→ define helper de suite controlada  
→ define `finish()` que executa `onBegin`, todos os `onTestEnd` e `onEnd`  
→ define massa-base de tentativas passed  
→ executa sequencialmente os cenários  
→ cada cenário compara exatamente o retorno esperado  
→ se tudo passar, imprime mensagem de sucesso  
→ qualquer assertion/rejeição cai no `.catch`, imprime erro e encerra com código 1.

Cada chamada a `finish()` cria uma instância nova do reporter. Isso é importante porque o reporter mantém estado por instância (`total` e `attemptsById`), e reutilizar a mesma instância contaminaria cenários.

## 4. Modelo dos fakes

O helper `suite(total)` implementa somente `allTests()`, retornando `total` objetos com ids determinísticos `t0`, `t1`, ... Essa forma é suficiente porque `onBegin` do reporter usa apenas `suite.allTests().length`.

As tentativas são objetos mínimos com `id`, `status` e `retry`. `finish()` transforma cada uma nos dois objetos que `onTestEnd(test, result)` recebe. A estratégia evita mocks extensos do Playwright e mantém visível qual parte do contrato realmente interessa ao gate.

## 5. Cenários e força da evidência

| Cenário | Preparação | Assertion | Classificação |
|---|---|---|---|
| 21 testes passed | `passedAttempts()` | retorno deve ser `undefined` | ✅ PROVADO DIRETAMENTE |
| 1 skipped entre 21 | substitui `t20` por skipped | retorno deve ser `{status:'failed'}` | ✅ PROVADO DIRETAMENTE |
| failed → passed em retry | duas tentativas do mesmo `t20` | retorno deve ser failed | ✅ PROVADO DIRETAMENTE |
| timedOut → passed em retry | duas tentativas do mesmo `t20` | retorno deve ser failed | ✅ PROVADO DIRETAMENTE |
| apenas 20 descobertos/resultados | `total=20` + 20 passed | retorno deve ser failed | ✅ PROVADO DIRETAMENTE |
| failed final | 20 passed + `t20 failed` | retorno deve ser failed | ✅ PROVADO DIRETAMENTE |
| timedOut final | 20 passed + `t20 timedOut` | retorno deve ser failed | ✅ PROVADO DIRETAMENTE |
| interrupted final | 20 passed + `t20 interrupted` | retorno deve ser failed | ✅ PROVADO DIRETAMENTE |
| markers de regressão failed/timedOut→passed permanecem no arquivo | regression-matrix + verify-ci-contract | presença textual dos markers | 🟦 GATE ESTÁTICO ESPECÍFICO |
| branch do reporter “total descoberto > ids que emitiram resultado” com run global passed | nenhum cenário atual | inexistente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `finish(...runStatus)` com runStatus diferente de passed | parâmetro existe, mas nenhum caller o varia | inexistente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| caminho `.catch` + `process.exit(1)` | só ocorre se o próprio self-test falhar | sem harness externo focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| texto exato de stdout/stderr | logs são emitidos | não há captura/assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Especificidade das assertions

As assertions negativas atuais são fortes porque os cenários foram montados para evitar causas paralelas de reprovação.

- No caso skipped, continuam existindo 21 IDs e os demais 20 estão passed; portanto a falha não depende de `minTests`, `failed` ou resultados ausentes.
- Nos casos flaky, existem 21 IDs finais e todos terminam passed; a falha é causada pelo histórico de retry com tentativa anterior não aprovada.
- No caso de mínimo, existem exatamente 20 IDs e todos produzem resultado passed; portanto a falha isola `minTests=21`.
- Nos casos terminais, existem 21 IDs, retry zero e somente um status final não aprovado; assim a falha isola a regra de status terminal.

Isso é superior a simplesmente verificar se strings como “failed” e “retry” aparecem no arquivo. A matriz de regressão protege esses markers estaticamente, mas a prova semântica vem das chamadas reais ao reporter seguidas de `assert.deepStrictEqual`.

## 7. Integração com a política E2E

O reporter real usa o baseline E2E atual:

- mínimo de 21 testes;
- máximo de 0 skipped;
- máximo de 0 flaky.

Este self-test codifica explicitamente os três limites por comportamento, embora não importe o JSON diretamente: a dependência chega via reporter. Se o baseline mudar, alguns cenários podem deixar de representar o contrato pretendido. Por isso a Bíblia trata os valores como dependência externa observada no SHA atual, não como constante definida neste arquivo.

O reporter também possui uma defesa adicional: se `attemptsById.size < total` e o status global for `passed`, ele reprova o run. Essa defesa é relevante contra falso verde por resultado final ausente, mas **não está coberta por este self-test** no SHA auditado.

## 8. Segurança, privacidade e efeitos colaterais

O arquivo não acessa rede, sistema de arquivos, navegador, extensão, credenciais, URLs de mangá, conteúdo Gemini ou dados de usuário. Seus efeitos colaterais são limitados a:

- carregar módulos CommonJS locais;
- escrever em stdout/stderr;
- encerrar o processo com código 1 em caso de erro.

A trust boundary principal é a integridade da CI. Um falso verde aqui pode permitir que o reporter seja enfraquecido sem detecção; um falso vermelho pode bloquear validações legítimas.

## 9. Casos-limite

1. `finish({attempts: []})`: não é exercitado; com total padrão 21 tende a acionar mínimo de resultados ausentes no reporter quando runStatus passed.
2. `runStatus !== 'passed'`: helper suporta, mas nenhum cenário utiliza.
3. 21 descobertos + apenas 20 IDs reportados + runStatus passed: branch crítico existente no reporter, sem assertion focal.
4. `interrupted -> passed` com retry: a política genérica do reporter deveria tratá-lo como flaky; o self-test só cobre interrupted como status final.
5. tentativa única com `retry > 0`: não é exercitada.
6. status final desconhecido: não é exercitado; o reporter atual falha fechado para qualquer status diferente de passed/skipped.
7. `retry` malformado: helper aplica `|| 0`, e o reporter aplica `Number(...)`; não há prova focal.
8. falha do próprio helper/módulo importado: será capturada pela IIFE e causará exit 1, mas o mecanismo de catch não possui self-test externo.

## 10. Invariantes

1. O arquivo deve continuar importando a implementação real do reporter.
2. Cada cenário deve usar nova instância do reporter.
3. O happy path deve continuar provando que o gate não falha sem violação.
4. Skipped final deve reprovar enquanto `maxSkipped=0`.
5. failed → passed e timedOut → passed em retry devem reprovar enquanto `maxFlaky=0`.
6. Inventário abaixo de `minTests` deve reprovar.
7. failed/timedOut/interrupted finais devem reprovar.
8. As tentativas de retry de um mesmo teste devem reutilizar o mesmo id.
9. Cenários negativos devem evitar causas de falha secundárias sempre que possível.
10. Falha de qualquer assertion precisa produzir exit code não zero.
11. O self-test deve continuar sendo executado por pelo menos um caminho obrigatório da CI.
12. Markers estáticos da matriz de regressão não devem ser confundidos com prova comportamental.
13. A validade documental desta Bíblia depende do SHA `478d6673dbb6d751e19f185feaed78764ebe6fde`.

## 11. Solicitações ao auditor

### 080-001 — TEST_REQUIRED — OPEN

**Arquivo relacionado:** `scripts/validation/playwright-gate-reporter-selftest.js`

**Encontrado enquanto auditava:** `scripts/validation/playwright-gate-reporter-selftest.js`

**Achado:** o reporter possui defesa explícita para `attemptsById.size < total && result.status === 'passed'`, porém nenhum cenário deste self-test cria 21 testes descobertos com somente 20 IDs que produziram `onTestEnd`.

**Evidência atual:** inspeção da implementação real do reporter e dos 79 lines deste self-test; o cenário `total=20` existente testa inventário abaixo de `minTests`, não resultado ausente com total nominal preservado.

**Evidência ausente:** assertion focal de `finish({ total: 21, attempts: passedAttempts(20), runStatus: 'passed' })` esperando `{status:'failed'}`.

**Por que precisa:** sem ela, uma regressão específica na defesa contra resultados ausentes pode não ser detectada pelos cenários atuais.

**Ação solicitada:** em alteração de testes separada, adicionar cenário usando a implementação real e confirmar também a semântica quando `runStatus` já é não-passed, se esse contrato for considerado relevante.

**Regressão possível:** run global marcado passed com callback final ausente poderia ser aceito.

**Severidade:** NORMAL.

### 080-002 — CI_CONTRACT_REVIEW — OPEN

**Arquivos relacionados:** `.github/workflows/ci.yml`, `package.json`, `scripts/validation/verify-ci-contract.js`

**Encontrado enquanto auditava:** `scripts/validation/playwright-gate-reporter-selftest.js`

**Achado:** o self-test é executado diretamente pelo job `ci-contract` e indiretamente por `npm run validate` no job Windows, porém o `verify-ci-contract.js` não possui checagem focal da presença dessas invocações; sua proteção relativa a este arquivo vem da matriz de regressão, que garante arquivo/markers, não que o self-test continue sendo executado.

**Evidência atual:** `ci.yml` contém o step direto; `package.json#validate` contém o comando; `verify-ci-contract.js` valida genericamente a matriz e vários outros markers, mas não foi encontrada verificação textual específica da invocação deste self-test.

**Evidência ausente:** gate estático que falhe se o step/comando de execução deste self-test desaparecer dos caminhos obrigatórios.

**Por que precisa:** manter o arquivo e seus markers não garante que ele seja efetivamente executado.

**Ação solicitada:** avaliar se o contrato de CI deve proteger explicitamente ao menos uma invocação obrigatória deste self-test e adicionar self-test negativo correspondente em mudança separada.

**Regressão possível:** o self-test permanecer no repositório e na matriz, mas deixar de rodar na CI, reduzindo a proteção contra flaky/retry.

**Severidade:** NORMAL.

## 12. Fonte integral

~~~javascript
'use strict';

const assert = require('assert');
const PlaywrightGateReporter = require('../ci/playwright-gate-reporter');

function suite(total) {
  return {
    allTests() {
      return Array.from({ length: total }, (_, index) => ({ id: 't' + index }));
    },
  };
}

async function finish({ total = 21, attempts = [], runStatus = 'passed' }) {
  const reporter = new PlaywrightGateReporter();
  reporter.onBegin({}, suite(total));
  for (const attempt of attempts) {
    reporter.onTestEnd(
      { id: attempt.id },
      { status: attempt.status, retry: attempt.retry || 0 }
    );
  }
  return reporter.onEnd({ status: runStatus });
}

function passedAttempts(total = 21) {
  return Array.from({ length: total }, (_, index) => ({
    id: 't' + index,
    status: 'passed',
    retry: 0,
  }));
}

(async () => {
  assert.strictEqual(await finish({ attempts: passedAttempts() }), undefined);

  {
    const attempts = passedAttempts();
    attempts[20] = { id: 't20', status: 'skipped', retry: 0 };
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(20);
    attempts.push({ id: 't20', status: 'failed', retry: 0 });
    attempts.push({ id: 't20', status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(20);
    attempts.push({ id: 't20', status: 'timedOut', retry: 0 });
    attempts.push({ id: 't20', status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(20);
    assert.deepStrictEqual(
      await finish({ total: 20, attempts }),
      { status: 'failed' }
    );
  }

  for (const terminalStatus of ['failed', 'timedOut', 'interrupted']) {
    const attempts = passedAttempts(20);
    attempts.push({ id: 't20', status: terminalStatus, retry: 0 });
    assert.deepStrictEqual(
      await finish({ attempts }),
      { status: 'failed' },
      'status terminal deve reprovar o gate: ' + terminalStatus
    );
  }

  console.log('Self-test do reporter E2E aprovado.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
~~~

O blob auditado contém newline final. A posição documental 80 representa explicitamente esse terminador após a linha textual 79.

## 13. Cobertura documental linha a linha

### Linha 1

**Fonte:** `'use strict';`

**O que faz:** Ativa strict mode para todo o módulo CommonJS.

**Como faz:** A diretiva literal é processada antes dos imports e helpers.

**Por que existe assim:** Mantém o tooling de CI sob semântica JavaScript estrita.

**Risco/regressão:** Remoção não muda os cenários atuais, mas enfraquece a disciplina contra erros permissivos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo real é carregado/executado, sem assertion focal do strict mode.

### Linha 2

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 3

**Fonte:** `const assert = require('assert');`

**O que faz:** Importa o módulo nativo `assert`.

**Como faz:** Usa `require('assert')`, sem dependência externa.

**Por que existe assim:** Permite assertions síncronas/deep estritas sem framework de testes adicional.

**Risco/regressão:** Se o import quebrar, o self-test aborta antes de validar o reporter.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — todas as assertions subsequentes dependem deste import.

### Linha 4

**Fonte:** `const PlaywrightGateReporter = require('../ci/playwright-gate-reporter');`

**O que faz:** Importa a implementação real `PlaywrightGateReporter`.

**Como faz:** Resolve `../ci/playwright-gate-reporter` pelo CommonJS.

**Por que existe assim:** Garante que o self-test exercite a classe usada pela CI, não uma cópia simulada.

**Risco/regressão:** Apontar para stub/cópia poderia deixar o self-test verde enquanto o reporter real regredisse.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — os cenários instanciam essa classe e assertam seus retornos.

### Linha 5

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 6

**Fonte:** `function suite(total) {`

**O que faz:** Declara o helper `suite(total)`.

**Como faz:** Recebe a quantidade de testes descobertos e fabrica apenas a superfície mínima esperada por `onBegin`.

**Por que existe assim:** Mantém o teste focado no contrato consumido pelo reporter.

**Risco/regressão:** Uma suite mock excessiva aumentaria acoplamento a detalhes irrelevantes do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — usado por `finish()` em todos os cenários.

### Linha 7

**Fonte:** `  return {`

**O que faz:** Inicia o objeto fake de suite retornado pelo helper.

**Como faz:** O objeto expõe o método `allTests`.

**Por que existe assim:** Modela somente a API necessária ao reporter.

**Risco/regressão:** Adicionar propriedades desnecessárias esconderia qual contrato é realmente requerido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 8

**Fonte:** `    allTests() {`

**O que faz:** Declara `allTests()` no fake de suite.

**Como faz:** Imita a chamada que o reporter faz em `onBegin`.

**Por que existe assim:** Permite controlar deterministicamente o inventário descoberto.

**Risco/regressão:** Se o helper retornasse um número diretamente, não provaria compatibilidade com a API consumida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 9

**Fonte:** `      return Array.from({ length: total }, (_, index) => ({ id: 't' + index }));`

**O que faz:** Materializa exatamente `total` descritores com IDs determinísticos.

**Como faz:** `Array.from` cria objetos `{id:'t'+index}` de `t0` a `t(total-1)`.

**Por que existe assim:** Permite correlacionar total descoberto com IDs enviados em `onTestEnd`.

**Risco/regressão:** IDs duplicados ou contagem divergente poderiam mascarar a lógica de inventário do reporter.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE em conjunto com os cenários de 21 e 20 testes.

### Linha 10

**Fonte:** `    },`

**O que faz:** Fecha o método `allTests`.

**Como faz:** Finaliza a função retornadora do array.

**Por que existe assim:** Preserva a forma de objeto esperada pelo reporter.

**Risco/regressão:** Erro estrutural impediria todos os cenários.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 11

**Fonte:** `  };`

**O que faz:** Fecha o objeto fake retornado.

**Como faz:** Conclui o literal de suite.

**Por que existe assim:** Mantém o helper mínimo e explícito.

**Risco/regressão:** Erro de estrutura quebraria `onBegin`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 12

**Fonte:** `}`

**O que faz:** Fecha `suite(total)`.

**Como faz:** Termina o helper.

**Por que existe assim:** Isola a fabricação da suite da execução dos hooks.

**Risco/regressão:** Misturar criação de suite com assertions reduziria reutilização entre cenários.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 13

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 14

**Fonte:** `async function finish({ total = 21, attempts = [], runStatus = 'passed' }) {`

**O que faz:** Declara `finish(...)`, o executor central dos cenários.

**Como faz:** Desestrutura opções com defaults: `total=21`, `attempts=[]`, `runStatus='passed'`.

**Por que existe assim:** Centraliza o lifecycle real do reporter e torna cada cenário conciso.

**Risco/regressão:** Duplicar lifecycle em cada bloco aumentaria risco de cenários inconsistentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; os defaults são exercidos repetidamente, mas `runStatus` alternativo não é coberto.

### Linha 15

**Fonte:** `  const reporter = new PlaywrightGateReporter();`

**O que faz:** Cria uma nova instância real do reporter por cenário.

**Como faz:** Usa `new PlaywrightGateReporter()`.

**Por que existe assim:** Evita vazamento de `attemptsById`/`total` entre testes.

**Risco/regressão:** Reutilizar uma instância poderia contaminar cenários e gerar falsos resultados.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pela independência necessária de todos os cenários.

### Linha 16

**Fonte:** `  reporter.onBegin({}, suite(total));`

**O que faz:** Invoca `onBegin` com config vazio e suite controlada.

**Como faz:** O reporter lê `suite(total).allTests().length`.

**Por que existe assim:** Exercita a coleta real do inventário antes dos resultados.

**Risco/regressão:** Pular `onBegin` não testaria o gate de mínimo nem coerência de contagem.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos cenários de total 21 e total 20.

### Linha 17

**Fonte:** `  for (const attempt of attempts) {`

**O que faz:** Itera sobre cada tentativa fornecida ao cenário.

**Como faz:** Usa `for...of` preservando a ordem declarada.

**Por que existe assim:** Mantém a cronologia de retries que o reporter usa para definir tentativa final/flaky.

**Risco/regressão:** Reordenar tentativas poderia testar uma sequência diferente da pretendida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em todos os cenários com `attempts`.

### Linha 18

**Fonte:** `    reporter.onTestEnd(`

**O que faz:** Chama o hook real `onTestEnd`.

**Como faz:** Transmite um objeto de teste e um objeto de resultado mínimos.

**Por que existe assim:** Exercita o armazenamento real por `test.id`.

**Risco/regressão:** Mutar diretamente `attemptsById` fabricaria estado e deixaria de provar a API pública do reporter.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE nos cenários de skip, retry e status terminal.

### Linha 19

**Fonte:** `      { id: attempt.id },`

**O que faz:** Passa o `id` da tentativa ao reporter.

**Como faz:** Constrói `{ id: attempt.id }`.

**Por que existe assim:** Garante que retries do mesmo teste reutilizem a mesma chave.

**Risco/regressão:** Usar IDs novos por retry impediria a detecção correta de flakiness histórica.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE nos cenários failed/timedOut → passed do mesmo `t20`.

### Linha 20

**Fonte:** `      { status: attempt.status, retry: attempt.retry || 0 }`

**O que faz:** Passa `status` e `retry` ao resultado.

**Como faz:** Aplica fallback `attempt.retry || 0`.

**Por que existe assim:** Permite cenários compactos e garante número zero quando retry não é informado/falsy.

**Risco/regressão:** O fallback permissivo pode ocultar valor `NaN`/string vazia; não há cenário focal disso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; valores 0 e 1 são exercidos, sem prova de inputs anômalos.

### Linha 21

**Fonte:** `    );`

**O que faz:** Fecha a chamada `onTestEnd`.

**Como faz:** Conclui a entrega de um resultado ao reporter.

**Por que existe assim:** Mantém cada iteração independente.

**Risco/regressão:** Erro sintático impediria o self-test por completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 22

**Fonte:** `  }`

**O que faz:** Fecha o loop de tentativas.

**Como faz:** Depois desta linha todos os resultados do cenário já foram entregues.

**Por que existe assim:** Separa alimentação de eventos da avaliação final.

**Risco/regressão:** Avaliar antes do fim produziria contagens parciais.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 23

**Fonte:** `  return reporter.onEnd({ status: runStatus });`

**O que faz:** Invoca e retorna `reporter.onEnd`.

**Como faz:** Propaga `{status: runStatus}` e o retorno/promise do hook.

**Por que existe assim:** Faz cada assertion observar exatamente a decisão final do reporter.

**Risco/regressão:** Engolir o retorno ou substituí-lo por boolean perderia o contrato semântico do Playwright.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `strictEqual/deepStrictEqual`; falta cenário com `runStatus` diferente de `passed`.

### Linha 24

**Fonte:** `}`

**O que faz:** Fecha `finish`.

**Como faz:** Termina o executor central.

**Por que existe assim:** Isola lifecycle dos dados de cenário.

**Risco/regressão:** Erro estrutural quebraria toda a suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 25

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 26

**Fonte:** `function passedAttempts(total = 21) {`

**O que faz:** Declara `passedAttempts(total=21)`.

**Como faz:** Fornece massa-base saudável com inventário padrão igual ao baseline atual.

**Por que existe assim:** Reduz repetição e permite alterar somente a tentativa relevante por cenário.

**Risco/regressão:** Copiar manualmente 21 objetos em cada caso aumentaria risco de diferença acidental.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em todos os cenários.

### Linha 27

**Fonte:** `  return Array.from({ length: total }, (_, index) => ({`

**O que faz:** Cria o array de tentativas passed.

**Como faz:** `Array.from` usa a contagem solicitada.

**Por que existe assim:** Permite produzir 21 ou 20 resultados coerentes.

**Risco/regressão:** Contagem errada invalidaria a especificidade dos cenários.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos casos healthy, mínimo e terminais.

### Linha 28

**Fonte:** `    id: 't' + index,`

**O que faz:** Atribui ID determinístico a cada tentativa saudável.

**Como faz:** Reutiliza o padrão `t<index>`.

**Por que existe assim:** Alinha resultados com os IDs da suite fake.

**Risco/regressão:** IDs divergentes afetariam a defesa de resultados ausentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; não existe assertion focal de correspondência completa.

### Linha 29

**Fonte:** `    status: 'passed',`

**O que faz:** Marca a tentativa saudável como `passed`.

**Como faz:** Define status literal consumido pelo reporter.

**Por que existe assim:** Estabelece baseline sem violações.

**Risco/regressão:** Outro status introduziria falha alheia ao comportamento isolado em cada cenário.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE porque os cenários saudáveis e negativos dependem de todas as demais tentativas permanecerem passed.

### Linha 30

**Fonte:** `    retry: 0,`

**O que faz:** Marca a tentativa saudável com `retry: 0`.

**Como faz:** Fornece explicitamente ausência de retry.

**Por que existe assim:** Evita que casos-base sejam classificados flaky.

**Risco/regressão:** Omitir retry funcionaria pelo fallback, mas provaria menos do caminho real.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo happy path.

### Linha 31

**Fonte:** `  }));`

**O que faz:** Fecha o objeto de tentativa no `Array.from`.

**Como faz:** Completa `{id,status,retry}`.

**Por que existe assim:** Mantém formato mínimo do resultado controlado.

**Risco/regressão:** Erro estrutural impediria os cenários.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 32

**Fonte:** `}`

**O que faz:** Fecha `passedAttempts`.

**Como faz:** Termina o helper.

**Por que existe assim:** Separa preparação de dados da IIFE executora.

**Risco/regressão:** Misturar execução aqui reduziria clareza dos cenários.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 33

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 34

**Fonte:** `(async () => {`

**O que faz:** Inicia IIFE assíncrona que executa o self-test ao chamar o arquivo.

**Como faz:** Não exporta suíte; a validação acontece como processo Node autocontido.

**Por que existe assim:** Facilita uso direto em `node ...` dentro da CI e de `npm run validate`.

**Risco/regressão:** Depender de runner externo exigiria configuração adicional e poderia retirar o gate do caminho CLI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE sempre que o script é chamado.

### Linha 35

**Fonte:** `  assert.strictEqual(await finish({ attempts: passedAttempts() }), undefined);`

**O que faz:** Valida o happy path.

**Como faz:** Executa 21 attempts passed e exige retorno `undefined`.

**Por que existe assim:** Prova que o reporter não força falha quando nenhum limite é violado.

**Risco/regressão:** Sem este caso, o gate poderia ficar permanentemente fail-closed e os testes negativos ainda passariam.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion focal sobre a implementação real.

### Linha 36

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 37

**Fonte:** `  {`

**O que faz:** Abre escopo do cenário de skipped.

**Como faz:** Isola a variável `attempts` dos outros blocos.

**Por que existe assim:** Evita colisão lexical entre cenários.

**Risco/regressão:** Sem escopo, reutilização/mutação poderia contaminar casos subsequentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 38

**Fonte:** `    const attempts = passedAttempts();`

**O que faz:** Cria 21 resultados initially passed para o caso de skip.

**Como faz:** Parte de baseline saudável antes de alterar exatamente um teste.

**Por que existe assim:** Isola a regra `maxSkipped` das demais causas de falha.

**Risco/regressão:** Inventário menor ou outro status extra tornaria a assertion ambígua.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE como preparação específica do cenário.

### Linha 39

**Fonte:** `    attempts[20] = { id: 't20', status: 'skipped', retry: 0 };`

**O que faz:** Substitui `t20` por status `skipped`.

**Como faz:** Mantém mesmo id e retry zero.

**Por que existe assim:** Cria exatamente uma violação de skip com total ainda 21.

**Risco/regressão:** Adicionar outro problema poderia fazer o teste falhar pelo motivo errado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 40

**Fonte:** `    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });`

**O que faz:** Exige `{status:'failed'}` para um skipped.

**Como faz:** `deepStrictEqual` compara o objeto retornado integralmente.

**Por que existe assim:** Prova a decisão de reprovação sob `maxSkipped=0`.

**Risco/regressão:** Uma checagem truthy poderia aceitar formatos errados de retorno.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 41

**Fonte:** `  }`

**O que faz:** Fecha o bloco do cenário skipped.

**Como faz:** Descarta a variável local `attempts`.

**Por que existe assim:** Garante isolamento lexical.

**Risco/regressão:** Sem isolamento, mutações poderiam vazar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 42

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 43

**Fonte:** `  {`

**O que faz:** Abre o cenário failed → passed com retry.

**Como faz:** Isola o histórico flaky.

**Por que existe assim:** Mantém a prova separada de timedOut → passed.

**Risco/regressão:** Misturar sequências dificultaria saber qual transição está protegida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 44

**Fonte:** `    const attempts = passedAttempts(20);`

**O que faz:** Cria 20 testes saudáveis.

**Como faz:** Reserva o id `t20` para duas tentativas controladas.

**Por que existe assim:** Mantém 21 IDs finais no total após os pushes.

**Risco/regressão:** Usar 21 base + novo id elevaria inventário de resultados e mudaria o contrato do cenário.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE como preparação específica.

### Linha 45

**Fonte:** `    attempts.push({ id: 't20', status: 'failed', retry: 0 });`

**O que faz:** Adiciona tentativa inicial `failed` de `t20`, retry 0.

**Como faz:** Registra a falha histórica antes da recuperação.

**Por que existe assim:** É metade da regressão que o gate precisa capturar.

**Risco/regressão:** Sem a tentativa anterior não haveria flakiness a detectar.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE; adicionalmente protegido como marker por `REG-E2E-FLAKY-RETRY-GATE`.

### Linha 46

**Fonte:** `    attempts.push({ id: 't20', status: 'passed', retry: 1 });`

**O que faz:** Adiciona nova tentativa de `t20` como `passed`, retry 1.

**Como faz:** Reutiliza o mesmo id e representa recuperação após retry.

**Por que existe assim:** Força o reporter a considerar o histórico, não só o status final.

**Risco/regressão:** Se o reporter olhasse apenas o último passed, o run poderia ficar verde.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE; também protegido como marker da matriz de regressão.

### Linha 47

**Fonte:** `    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });`

**O que faz:** Exige reprovação do histórico failed → passed.

**Como faz:** Compara exatamente `{status:'failed'}`.

**Por que existe assim:** Prova que retry/flaky é gate bloqueante enquanto `maxFlaky=0`.

**Risco/regressão:** Sem assertion focal, a presença dos markers não provaria semântica.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 48

**Fonte:** `  }`

**O que faz:** Fecha o cenário failed → passed.

**Como faz:** Encerra seu escopo local.

**Por que existe assim:** Evita interferência no próximo histórico.

**Risco/regressão:** Sem separação, mutações poderiam confundir a prova.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 49

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 50

**Fonte:** `  {`

**O que faz:** Abre o cenário timedOut → passed.

**Como faz:** Isola a segunda forma de tentativa não aprovada recuperada por retry.

**Por que existe assim:** Prova que flakiness não é limitada a `failed`.

**Risco/regressão:** Sem este cenário, timeout recuperado poderia escapar mesmo com failed recuperado protegido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 51

**Fonte:** `    const attempts = passedAttempts(20);`

**O que faz:** Cria 20 tentativas saudáveis.

**Como faz:** Reserva `t20` para o histórico de timeout/retry.

**Por que existe assim:** Mantém inventário final coerente.

**Risco/regressão:** Contagem diferente adicionaria causa secundária de falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE como preparação do cenário.

### Linha 52

**Fonte:** `    attempts.push({ id: 't20', status: 'timedOut', retry: 0 });`

**O que faz:** Adiciona `timedOut` em `t20` com retry 0.

**Como faz:** Cria uma tentativa histórica não-passed distinta de failed.

**Por que existe assim:** Exercita o predicate genérico `status !== 'passed'`.

**Risco/regressão:** Sem este caso, refactor poderia tratar somente failed.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE; também marker da matriz de regressão.

### Linha 53

**Fonte:** `    attempts.push({ id: 't20', status: 'passed', retry: 1 });`

**O que faz:** Adiciona `passed` em `t20` com retry 1.

**Como faz:** Representa recuperação do timeout.

**Por que existe assim:** Força o gate de flaky apesar do status final saudável.

**Risco/regressão:** Se apenas o status final fosse avaliado, o caso seria falso verde.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 54

**Fonte:** `    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });`

**O que faz:** Exige reprovação de timedOut → passed.

**Como faz:** Compara exatamente o retorno de falha.

**Por que existe assim:** Prova que timeout recuperado continua bloqueante sob maxFlaky=0.

**Risco/regressão:** Sem essa assertion, o marker timedOut isolado não provaria o comportamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 55

**Fonte:** `  }`

**O que faz:** Fecha o cenário timedOut → passed.

**Como faz:** Termina o escopo local.

**Por que existe assim:** Preserva independência entre testes.

**Risco/regressão:** Vazamento de `attempts` poderia contaminar o próximo caso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 56

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 57

**Fonte:** `  {`

**O que faz:** Abre o cenário de inventário abaixo do mínimo.

**Como faz:** Isola o teste de `e2e.minTests`.

**Por que existe assim:** Mantém todos os resultados passed para que só o limite de quantidade cause falha.

**Risco/regressão:** Outra violação tornaria a prova menos específica.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 58

**Fonte:** `    const attempts = passedAttempts(20);`

**O que faz:** Cria exatamente 20 tentativas passed.

**Como faz:** Alinha quantidade de resultados ao total que será informado.

**Por que existe assim:** Fica um abaixo do baseline atual 21.

**Risco/regressão:** Usar 21 resultados com total 20 introduziria inconsistência adicional.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 59

**Fonte:** `    assert.deepStrictEqual(`

**O que faz:** Inicia assertion profunda do cenário de mínimo.

**Como faz:** A assertion abrange a chamada multilinha a `finish`.

**Por que existe assim:** Permite leitura clara dos parâmetros e resultado esperado.

**Risco/regressão:** Assertion frouxa reduziria precisão do contrato.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 60

**Fonte:** `      await finish({ total: 20, attempts }),`

**O que faz:** Executa `finish` com `total:20` e 20 attempts.

**Como faz:** Faz `onBegin` descobrir 20 e `onEnd` receber todos os 20 resultados.

**Por que existe assim:** Isola a regra `minTests=21` sem resultados ausentes.

**Risco/regressão:** Um total padrão 21 não exercitaria a proteção contra redução do inventário.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 61

**Fonte:** `      { status: 'failed' }`

**O que faz:** Define `{status:'failed'}` como resultado esperado.

**Como faz:** É o segundo argumento de `deepStrictEqual`.

**Por que existe assim:** Codifica o contrato de reprovação do inventário reduzido.

**Risco/regressão:** Esperar apenas valor truthy permitiria retorno incompatível.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 62

**Fonte:** `    );`

**O que faz:** Fecha a assertion.

**Como faz:** Conclui a prova do limite mínimo.

**Por que existe assim:** Mantém falha síncrona/assíncrona propagada para a IIFE.

**Risco/regressão:** Erro aqui impediria o script de concluir verde indevidamente.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 63

**Fonte:** `  }`

**O que faz:** Fecha o bloco de mínimo.

**Como faz:** Encerra variável local.

**Por que existe assim:** Evita interferência com a tabela de status terminais.

**Risco/regressão:** Sem escopo, mutação poderia vazar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 64

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 65

**Fonte:** `  for (const terminalStatus of ['failed', 'timedOut', 'interrupted']) {`

**O que faz:** Itera por `failed`, `timedOut` e `interrupted` como status finais.

**Como faz:** Executa o mesmo contrato para três categorias terminais.

**Por que existe assim:** Evita duplicação e prova política fail-closed para os estados conhecidos.

**Risco/regressão:** Cobrir apenas failed deixaria timeouts/interrupções sem prova focal final.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para os três valores listados.

### Linha 66

**Fonte:** `    const attempts = passedAttempts(20);`

**O que faz:** Cria 20 tentativas saudáveis em cada iteração.

**Como faz:** Reserva `t20` para o único status terminal negativo.

**Por que existe assim:** Mantém total de 21 IDs e elimina causas secundárias.

**Risco/regressão:** Inventário menor faria o caso também falhar pelo baseline.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE como preparação específica.

### Linha 67

**Fonte:** `    attempts.push({ id: 't20', status: terminalStatus, retry: 0 });`

**O que faz:** Adiciona `t20` com o status terminal corrente e retry 0.

**Como faz:** Varia somente `status` entre as três iterações.

**Por que existe assim:** Isola a regra de status final não aprovado.

**Risco/regressão:** Múltiplas tentativas poderiam converter o cenário em flaky em vez de falha terminal.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 68

**Fonte:** `    assert.deepStrictEqual(`

**O que faz:** Inicia `deepStrictEqual` para cada status terminal.

**Como faz:** Compara retorno integral do reporter.

**Por que existe assim:** Garante forma semântica exata da reprovação.

**Risco/regressão:** Assertion genérica poderia aceitar retorno incorreto.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 69

**Fonte:** `      await finish({ attempts }),`

**O que faz:** Executa `finish` com o histórico atual.

**Como faz:** Usa total padrão 21 e runStatus padrão passed.

**Por que existe assim:** Entrega 21 IDs, sendo um terminalmente não aprovado.

**Risco/regressão:** Isso isola `failed > 0` no reporter.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 70

**Fonte:** `      { status: 'failed' },`

**O que faz:** Espera `{status:'failed'}`.

**Como faz:** Define a decisão obrigatória do reporter.

**Por que existe assim:** Torna cada iteração um teste de regressão real.

**Risco/regressão:** Sem este esperado, o loop só exercitaria o código sem provar resultado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE.

### Linha 71

**Fonte:** `      'status terminal deve reprovar o gate: ' + terminalStatus`

**O que faz:** Fornece mensagem diagnóstica à assertion.

**Como faz:** Concatena o status terminal corrente.

**Por que existe assim:** Melhora diagnóstico se apenas uma categoria regredir.

**Risco/regressão:** Sem mensagem, a falha ainda seria detectada, mas com menos contexto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; texto da mensagem não é validado.

### Linha 72

**Fonte:** `    );`

**O que faz:** Fecha a assertion do status terminal.

**Como faz:** Conclui comparação antes da próxima iteração.

**Por que existe assim:** Preserva uma falha por status.

**Risco/regressão:** Erro estrutural abortaria o self-test.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE em conjunto com linhas 68–71.

### Linha 73

**Fonte:** `  }`

**O que faz:** Fecha o loop de status terminais.

**Como faz:** Após esta linha as três variantes foram avaliadas.

**Por que existe assim:** Evita duplicação manual mantendo a mesma preparação/assertion.

**Risco/regressão:** Alterar a lista é a forma central de expandir/reduzir a matriz terminal.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo loop completo.

### Linha 74

**Fonte:** `(linha vazia)`

**O que faz:** Linha vazia editorial que separa blocos lógicos do self-test.

**Como faz:** Não produz operação em runtime; apenas delimita visualmente dependências, helpers e cenários.

**Por que existe assim:** Facilita leitura e revisão sem alterar a semântica JavaScript.

**Risco/regressão:** Nenhum risco funcional próprio; remover a linha afetaria apenas legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — formatação não é objeto de assertion.

### Linha 75

**Fonte:** `  console.log('Self-test do reporter E2E aprovado.');`

**O que faz:** Imprime mensagem de sucesso após todas as assertions.

**Como faz:** `console.log` só é alcançado se nenhum `assert` rejeitar.

**Por que existe assim:** Fornece diagnóstico humano simples no CLI/CI.

**Risco/regressão:** A mensagem não é prova por si só; é consequência de todas as assertions passarem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — não há assertion do texto.

### Linha 76

**Fonte:** `})().catch((error) => {`

**O que faz:** Anexa `catch` à Promise da IIFE.

**Como faz:** Captura rejeições/erros, inclusive `AssertionError`.

**Por que existe assim:** Converte falhas assíncronas em saída de processo controlada.

**Risco/regressão:** Sem catch, Node ainda falharia em muitos casos, mas o diagnóstico/exit dependeria de política de unhandled rejection.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do caminho de catch.

### Linha 77

**Fonte:** `  console.error(error);`

**O que faz:** Imprime o erro capturado em stderr.

**Como faz:** Passa o objeto inteiro a `console.error`.

**Por que existe assim:** Preserva stack/mensagem de assertion para investigação de CI.

**Risco/regressão:** Engolir o erro tornaria o gate difícil de diagnosticar.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do conteúdo de stderr.

### Linha 78

**Fonte:** `  process.exit(1);`

**O que faz:** Termina o processo com código 1 após qualquer erro capturado.

**Como faz:** Chama `process.exit(1)`.

**Por que existe assim:** Transforma assertion/rejeição em falha inequívoca do step de CI.

**Risco/regressão:** Apenas logar sem exit poderia deixar o job verde.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do exit code em um cenário deliberadamente quebrado.

### Linha 79

**Fonte:** `});`

**O que faz:** Fecha o callback de catch e a cadeia da IIFE.

**Como faz:** Completa a execução autocontida do script.

**Por que existe assim:** Garante sintaxe/encadeamento correto do entry point.

**Risco/regressão:** Erro aqui impediria o arquivo de executar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento do script.

### Posição 80 — newline final

**Fonte:** terminador LF após a linha 79.

**O que faz:** finaliza o arquivo texto de forma canônica.

**Como faz:** o conteúdo do blob termina com `\n`.

**Por que existe assim:** mantém compatibilidade editorial/CLI e evita arquivo sem newline final.

**Risco/regressão:** não altera a lógica do self-test, mas faz parte da identidade byte/textual auditada.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO da própria inspeção do blob; não há assertion funcional dedicada ao terminador.

## 14. Autoauditoria documental

- SHA do fonte relido imediatamente antes da escrita da Bíblia: **confirmado**.
- Fonte integral incorporada: **sim**.
- 79/79 linhas textuais documentadas individualmente: **sim**.
- newline final documentado como posição 80: **sim**.
- Dependência real do reporter inspecionada: **sim**.
- Baseline E2E inspecionado: **sim**.
- `package.json` e workflow consumidores inspecionados: **sim**.
- Matriz de regressão e gate estático genérico inspecionados: **sim**.
- Assertions diferenciadas de gates estáticos/execução indireta: **sim**.
- Lacunas externas registradas sem modificar código/testes/workflows: **sim**.
- Solicitações ao auditor: **2 OPEN**.

### Conclusão

A Bíblia descreve integralmente o comportamento real do arquivo no SHA auditado e separa prova direta, gate estático e ausência de prova específica. As duas lacunas identificadas não impedem a conclusão documental: elas foram registradas como solicitações externas e não foram usadas como evidência inexistente.

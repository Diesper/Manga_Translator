# Bíblia técnica — scripts/validation/verify-jest-worker-warning-selftest.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** `4c8ce078abcf58f66ded7918650b2f54d9fa40cf`  
> **Agente responsável:** AGENTE 10  
> **Tipo:** self-test Node.js executável para o gate de worker Jest encerrado à força  
> **Linhas textuais:** **10**  
> **Posições documentais:** **11**, contando o newline final  
> **Tamanho textual observado:** **481 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é um self-test mínimo e bloqueante da infraestrutura de CI que detecta o warning de worker Jest encerrado à força.

Ele não implementa a detecção. A implementação real está em **scripts/ci/jest-worker-warning.js**, que exporta:

- **FORCED_WORKER_EXIT**: a assinatura textual do warning;
- **hasForcedWorkerExit(stderr)**: função booleana que procura essa assinatura em uma string.

O papel deste self-test é executar a implementação real e verificar três propriedades centrais:

1. uma saída que contém o warning compartilhado é reconhecida;
2. uma saída normal de PASS não é confundida com worker force-exit;
3. uma mensagem comum de FAIL não é confundida com o warning específico.

Por ser um script executável e não um módulo de biblioteca, ele não exporta API própria. O contrato operacional é seu **exit status**: se qualquer assertion falhar, Node lança AssertionError e o processo termina com falha; se todas passarem, a mensagem final é impressa e o processo termina normalmente.

## 2. Posição no pipeline do projeto

O self-test está ligado ao fluxo oficial por múltiplos pontos independentes:

- **package.json**, linha 38 do SHA examinado, inclui diretamente:
  - node scripts/validation/verify-jest-worker-warning-selftest.js
  - dentro do script composto **validate**;
- **.github/workflows/ci.yml**, linha 85 do SHA examinado, executa o arquivo diretamente no job **CI Contract**;
- **scripts/validation/verify-ci-contract.js**, linha 436 do SHA examinado, exige estaticamente que o workflow continue contendo esse comando;
- **scripts/validation/verify-ci-contract.js**, linha 423, exige que o runner Jest continue contendo a chamada **hasForcedWorkerExit(jestStderr)**;
- **scripts/ci/data/regression-matrix.json**, linhas 129–135 do SHA examinado, registra **REG-WORKER-WARNING-GATE** e aponta este arquivo como artefato de regressão.

Assim, o arquivo possui dois papéis complementares:

1. **teste comportamental do helper real** por assertions;
2. **âncora estrutural da regressão** protegida pelo CI Contract e pela matriz de regressões.

## 3. Dependências diretas

### 3.1 node:assert/strict

O arquivo importa **node:assert/strict** do próprio Node.js.

A função usada é **assert.equal** em modo strict. Na prática, isso exige igualdade estrita entre o retorno real de **hasForcedWorkerExit** e o booleano esperado.

Não há dependência npm para o mecanismo de assertion, portanto este self-test pode rodar antes de qualquer bootstrap especial de Jest.

### 3.2 scripts/ci/jest-worker-warning.js

O arquivo carrega o módulo real por:

~~~javascript
const { FORCED_WORKER_EXIT, hasForcedWorkerExit } = require('../ci/jest-worker-warning');
~~~

Não há cópia da função sob teste, mock, fixture substituta ou reimplementação local.

Isso é importante porque as três assertions exercitam exatamente o mesmo helper consumido por:

- **scripts/ci/run-jest-ci.js**;
- **scripts/maintenance/diagnose-jest-workers.js**;
- **scripts/maintenance/diagnose-background-leak.js**.

## 4. Consumers e gates

### Consumer 1 — package.json#validate

O script **validate** executa este self-test depois dos gates de estrutura, política de testes, publicação, CI Contract, coverage e reporter E2E.

Se uma assertion falhar, a cadeia **&&** é interrompida e a validação retorna não zero.

**Classificação:** 🟨 EXECUTADO INDIRETAMENTE quanto ao encadeamento npm; as assertions internas continuam sendo a prova direta do helper.

### Consumer 2 — GitHub Actions / CI Contract

O workflow **MangaTranslator CI** executa:

~~~text
node scripts/validation/verify-jest-worker-warning-selftest.js
~~~

em passo dedicado chamado **Testar detecção de worker Jest forçado**.

Como o workflow usa shell padrão sem continue-on-error nesse passo, um AssertionError torna o job vermelho.

**Classificação:** 🟨 EXECUTADO INDIRETAMENTE para o lifecycle do workflow; o conteúdo testado pelo script é provado pelas assertions locais.

### Gate estrutural — verify-ci-contract.js

O verificador de contrato da CI exige a presença textual do comando deste self-test no workflow.

Isso não prova o comportamento de **hasForcedWorkerExit**, mas impede que o passo seja removido silenciosamente sem quebrar o contrato.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO.

### Matriz de regressão

A entrada **REG-WORKER-WARNING-GATE** exige que o arquivo continue contendo os markers:

- FORCED_WORKER_EXIT
- hasForcedWorkerExit
- warning detectado sem mascarar falhas comuns

O CI Contract valida a matriz e a presença de seus markers nos arquivos indicados.

Isso protege a existência estrutural da regressão, mas não substitui as assertions comportamentais.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO.

## 5. Fluxo de execução

O fluxo completo é síncrono e linear:

1. Node ativa strict mode;
2. carrega **node:assert/strict**;
3. carrega a constante e a função reais do helper;
4. executa assertion positiva;
5. executa assertion negativa para PASS normal;
6. executa assertion negativa para FAIL comum;
7. somente se todas passarem imprime a mensagem de sucesso;
8. o processo termina naturalmente com status 0.

Não há:

- Promise;
- await;
- callback;
- timer;
- listener;
- filesystem;
- rede;
- subprocesso;
- mutação de ambiente;
- escrita em artifact;
- cleanup próprio.

Por isso, não existe janela interna de race condition neste arquivo.

## 6. Evidência automatizada examinada

| Comportamento | Evidência real | Classificação |
|---|---|---|
| helper real é carregado, não mockado | require direto de ../ci/jest-worker-warning | ✅ PROVADO DIRETAMENTE pelo próprio self-test ao usar os exports reais |
| string contendo a constante compartilhada retorna true | assertion da linha 6 | ✅ PROVADO DIRETAMENTE |
| PASS normal sem warning retorna false | assertion da linha 7 | ✅ PROVADO DIRETAMENTE |
| FAIL comum não é confundido com worker force-exit | assertion da linha 8 | ✅ PROVADO DIRETAMENTE |
| CI contém passo dedicado que executa este arquivo | .github/workflows/ci.yml linha 85 | 🟦 GATE ESTÁTICO ESPECÍFICO + execução no workflow |
| CI Contract exige que o passo continue existindo | verify-ci-contract.js linha 436 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| runner principal continua usando hasForcedWorkerExit(jestStderr) | verify-ci-contract.js linha 423 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| regressão REG-WORKER-WARNING-GATE continua apontando para este arquivo | regression-matrix.json linhas 129–135 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| literal canônico do warning está correto independentemente da constante exportada | o caso positivo monta a entrada usando FORCED_WORKER_EXIT importado do próprio helper | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branch de entrada não-string do helper | todas as três entradas deste self-test são strings | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| stdout de sucesso possui texto exato | não foi localizado teste externo que capture e compare stdout | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Limite importante da prova positiva

A assertion positiva é:

~~~javascript
assert.equal(hasForcedWorkerExit('PASS 107 suites\n' + FORCED_WORKER_EXIT + '\n'), true);
~~~

Ela é forte para provar que:

- o export existe;
- a função existe;
- o detector encontra a constante dentro de texto com outras linhas;
- o detector não exige igualdade exata da string inteira.

Porém ela é **tautológica quanto ao texto externo do Jest**.

O input positivo é construído usando a mesma constante exportada pelo módulo sob teste. Se alguém alterasse **FORCED_WORKER_EXIT** para um literal incorreto e mantivesse **hasForcedWorkerExit** baseado nessa constante, a assertion continuaria verde.

Portanto, este self-test prova **consistência interna**, mas não prova sozinho que a constante continua idêntica ao warning real emitido pela versão suportada do Jest.

Essa lacuna é registrada em **087-001**.

## 8. Casos-limite

### 8.1 Prefixo e sufixo ao redor do warning

A linha 6 inclui **PASS 107 suites** antes do warning e newline depois.

Isso demonstra que a função reconhece o warning como substring, não somente quando a entrada é idêntica ao literal.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### 8.2 Saída de sucesso comum

A linha 7 usa:

~~~text
PASS 107 suites
Tests: 840 passed
~~~

e exige false.

Isso impede uma implementação ingênua que considere qualquer PASS ou qualquer output Jest como sinal de worker forçado.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### 8.3 Falha funcional comum

A linha 8 usa:

~~~text
FAIL unit/example.test.js
~~~

e exige false.

A distinção é importante: uma falha funcional do Jest já deve reprovar por seu próprio status; ela não deve ser reclassificada como warning de worker.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### 8.4 Entrada não-string

O helper real possui guard **typeof stderr === 'string'**, mas este self-test não usa null, undefined, número, objeto ou Buffer.

Como consumers conhecidos passam strings produzidas/capturadas por subprocessos, a lacuna tem risco operacional menor que o literal canônico, mas permanece sem assertion focal.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### 8.5 Mudança de wording/ANSI/capitalização

Este self-test não possui fixture independente de output real do Jest com variações de versão, ANSI inserido no meio da frase ou mudança de pontuação.

O helper usa includes literal e case-sensitive, então essas mudanças podem causar falso negativo.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 9. Invariantes

1. O arquivo deve continuar carregando **scripts/ci/jest-worker-warning.js** real.
2. O caso positivo deve continuar exigindo true.
3. Saída PASS comum deve continuar exigindo false.
4. FAIL comum deve continuar exigindo false.
5. Remover qualquer assertion não pode ser tratado como refactor neutro sem reavaliar o gate.
6. O workflow deve continuar executando o self-test enquanto o warning de worker forçado fizer parte da política da CI.
7. O runner Jest deve continuar transformando detecção positiva em falha bloqueante.
8. Este self-test não deve ganhar mock do helper, pois isso destruiria sua função como prova da implementação real.
9. A mensagem final só deve ser alcançada após todas as assertions.
10. O SHA desta Bíblia só é válido para o blob **4c8ce078abcf58f66ded7918650b2f54d9fa40cf**.

## 10. Segurança, privacidade e side effects

O arquivo não lê dados de usuário e não toca APIs da extensão.

Sua superfície é restrita a código local do repositório e stdout.

Não há risco de:

- exfiltração de dados;
- modificação de arquivos;
- escrita em storage;
- acesso a chrome.*;
- rede;
- execução de comando externo.

A principal fronteira de confiança está fora deste arquivo: o texto que o helper real recebe dos processos Jest.

## 11. Solicitações ao auditor

### 087-001 — TEST_REQUIRED — OPEN

**Encontrado:** o caso positivo constrói a amostra usando a própria constante **FORCED_WORKER_EXIT** importada do módulo auditado indiretamente.

**Contexto:** auditoria de **scripts/validation/verify-jest-worker-warning-selftest.js**.

**Arquivo relacionado:** **scripts/validation/verify-jest-worker-warning-selftest.js** e, conceitualmente, o contrato externo de **scripts/ci/jest-worker-warning.js**.

**Evidência atual:** linha 6 prova que a função real encontra a constante exportada dentro de uma string maior.

**Evidência ausente:** uma amostra independente que fixe o warning esperado sem reutilizar a mesma constante como oráculo.

**Por que insuficiente:** uma alteração simultânea da constante e da função pode manter o self-test verde mesmo que o literal deixe de corresponder ao output real do Jest.

**Ação solicitada:** adicionar, em alteração separada, assertion/fixture independente baseada no literal canônico esperado ou em output capturado de uma versão Jest suportada.

**Evidência esperada:** falha do self-test se **FORCED_WORKER_EXIT** divergir da amostra independente; manutenção das assertions positivas/negativas atuais.

**Possível regressão:** o runner deixa de reconhecer worker force-exit real e um leak volta a passar pelo gate.

**Severidade:** NORMAL.

Nenhuma alteração no arquivo de teste foi feita pelo AGENTE 10.

## 12. Fonte integral auditada

~~~javascript
'use strict';

const assert = require('node:assert/strict');
const { FORCED_WORKER_EXIT, hasForcedWorkerExit } = require('../ci/jest-worker-warning');

assert.equal(hasForcedWorkerExit('PASS 107 suites\n' + FORCED_WORKER_EXIT + '\n'), true);
assert.equal(hasForcedWorkerExit('PASS 107 suites\nTests: 840 passed\n'), false);
assert.equal(hasForcedWorkerExit('FAIL unit/example.test.js\n'), false);

console.log('Gate de worker Jest: warning detectado sem mascarar falhas comuns.');
~~~

O blob termina com newline.

## 13. Cobertura posição a posição

### Linha 1 — strict mode

**Fonte:** 'use strict';

Ativa strict mode para o script CommonJS inteiro. Não altera a política do gate, mas reduz semânticas permissivas acidentais.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE. O arquivo é carregado/executado pelo Node; nenhuma assertion é específica à directive.

### Linha 2 — separação estrutural

Linha vazia entre a directive prologue e os imports.

Não produz efeito em runtime; organiza o arquivo.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO, apropriado para whitespace editorial.

### Linha 3 — import de assert estrito

**Fonte:** const assert = require('node:assert/strict');

Carrega o módulo nativo de assertions usado nas linhas 6–8.

Se o import falhar, nenhuma prova é executada e o processo encerra com erro.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo uso subsequente de assert.equal.

### Linha 4 — import da implementação real

**Fonte:** const { FORCED_WORKER_EXIT, hasForcedWorkerExit } = require('../ci/jest-worker-warning');

Carrega os dois exports reais do helper compartilhado.

Essa linha impede que o self-test use cópia local ou mock da lógica.

**Evidência:** ✅ PROVADO DIRETAMENTE no sentido operacional: as linhas 6–8 chamam o export real e a linha 6 consome a constante real.

### Linha 5 — separação estrutural

Linha vazia entre imports e assertions.

Sem efeito runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 6 — caso positivo

**Fonte:** assert.equal(hasForcedWorkerExit('PASS 107 suites\n' + FORCED_WORKER_EXIT + '\n'), true);

Constrói uma string contendo texto de PASS, o warning exportado e newline final; chama o detector real e exige true.

Prova que prefixo/sufixo não impedem detecção e que a função reconhece a assinatura compartilhada.

Limite: não fixa independentemente o literal externo, porque usa a própria constante como parte do input.

**Evidência:** ✅ PROVADO DIRETAMENTE para detecção da constante exportada; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para fidelidade independente do literal ao output real do Jest.

### Linha 7 — negativo de PASS saudável

**Fonte:** assert.equal(hasForcedWorkerExit('PASS 107 suites\nTests: 840 passed\n'), false);

Executa a implementação real com output plausível de sucesso que não contém o warning.

Evita falso positivo em saída Jest saudável.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 8 — negativo de FAIL comum

**Fonte:** assert.equal(hasForcedWorkerExit('FAIL unit/example.test.js\n'), false);

Executa a implementação real com uma falha comum e exige false.

A intenção é não mascarar/reclassificar erro funcional comum como worker force-exit.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 9 — separação estrutural

Linha vazia entre assertions e mensagem terminal.

Também cria separação visual entre prova e relatório de sucesso.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 10 — mensagem de sucesso

**Fonte:** console.log('Gate de worker Jest: warning detectado sem mascarar falhas comuns.');

Só é alcançada depois que as três assertions terminam sem lançar.

Além de feedback humano, o trecho **warning detectado sem mascarar falhas comuns** funciona como marker da regressão **REG-WORKER-WARNING-GATE**.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO para a presença do marker na matriz/CI Contract; 🟨 EXECUTADO INDIRETAMENTE para a emissão em stdout, pois não há assertion externa sobre o texto impresso.

### Linha 11 — newline final

**Fonte:** posição vazia resultante do LF terminal.

O conteúdo auditado termina com newline; por isso **content.split('\n')** possui 11 posições para 10 linhas textuais.

Não há comportamento funcional associado.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; foi verificado diretamente no blob auditado.

## 14. Análise crítica

1. **A força principal deste arquivo vem das assertions simples e reais.** Não há framework intermediário nem mocks.
2. **O caso positivo é parcialmente tautológico.** A mesma constante alimenta detector e fixture positiva.
3. **Os dois casos negativos são úteis e independentes da constante.** Eles protegem contra detector excessivamente amplo.
4. **O arquivo não testa o branch não-string do helper.** Consumers conhecidos trabalham com strings, então a prioridade é menor.
5. **O arquivo não testa a integração completa spawn → stderr → runner → exit code.** Essa parte pertence ao runner e aos gates de CI; aqui a responsabilidade é focal no detector.
6. **A matriz de regressão é estrutural, não comportamental.** Presença de markers não substitui assertions.
7. **O CI Contract protege a existência do passo.** Isso reduz o risco de o self-test ser simplesmente removido do workflow.
8. **Nenhum cleanup é necessário.** O script é síncrono e sem recursos persistentes.
9. **O sucesso depende de Node >=18 conforme package.json.** As APIs usadas são estáveis nesse intervalo.
10. **O arquivo é pequeno o suficiente para que qualquer expansão significativa de responsabilidade mereça um módulo/teste separado.**

## 15. Autoauditoria documental

- Identidade confirmada por reserva exclusiva: **AGENTE 10**.
- Fonte reconfirmada após a reserva: SHA **4c8ce078abcf58f66ded7918650b2f54d9fa40cf**.
- Conteúdo integral transcrito sem alteração funcional.
- Contagem verificada: **10 linhas textuais + newline final = 11/11 posições**.
- Consumers lidos no branch atual: package.json, ci.yml, verify-ci-contract.js e regression-matrix.json.
- Dependência real **scripts/ci/jest-worker-warning.js** lida integralmente.
- Assertions classificadas individualmente; gate estático não foi promovido a prova comportamental.
- Lacuna do literal canônico registrada como **087-001** em vez de ser corrigida pelo agente documental.
- Nenhum código, teste, fixture, workflow, configuração ou documento global foi modificado.
- A Bíblia corresponde exclusivamente ao SHA declarado.

**Conclusão documental:** a Bíblia está completa para o estado real observado do arquivo e pode ser marcada como **COMPLETED**, mantendo **087-001 OPEN** para auditoria externa.

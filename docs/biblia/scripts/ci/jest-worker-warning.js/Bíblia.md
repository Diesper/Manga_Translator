# Bíblia técnica — scripts/ci/jest-worker-warning.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `b1379b6811e5513b955ebbbef4450ca4ca1e77da`  
> **Agente responsável pela auditoria:** AGENTE 8  
> **Tipo:** helper CommonJS de CI/diagnóstico para detecção de worker Jest encerrado à força  
> **Linhas textuais:** **9**  
> **Posições documentais:** **10**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Identidade e papel arquitetural

`scripts/ci/jest-worker-warning.js` é um módulo Node.js pequeno e deliberadamente puro. Ele centraliza duas coisas que não devem divergir entre o gate principal e os diagnósticos:

1. a frase exata que o Jest emite quando um processo worker não termina graciosamente e precisa ser encerrado à força;
2. a regra booleana usada para reconhecer essa frase em texto capturado de subprocesso.

O arquivo existe porque o projeto não trata “Jest retornou código 0” como evidência suficiente de saúde. O runner canônico `scripts/ci/run-jest-ci.js` captura o `stderr` do Jest, chama `hasForcedWorkerExit(jestStderr)` e adiciona um problema bloqueante quando o warning aparece. No fim do runner, qualquer problema acumulado define `process.exitCode = 1`. Assim, um worker vazando recursos não fica mascarado por um status de processo aparentemente bem-sucedido.

O helper **não corrige** open handles, não encerra processos, não identifica qual suíte vazou recurso e não implementa retry. Seu papel é somente transformar um sintoma textual conhecido em um sinal booleano compartilhado. A investigação causal fica nos scripts de diagnóstico e nos testes que exercitam teardown.

## 2. Contexto concreto no Manga Translator

A documentação arquitetural do projeto registra que essa proteção foi motivada por um worker leak real: um timer de 4 segundos ligado ao fallback do arquivo `_anchor.png` podia sobreviver ao teardown. O teste `tests/unit/background/marker-anchor-real.test.js`, caso `REG-WORKER-4S`, comprova o ownership e cancelamento desse timer: ele verifica que `4_000` aparece entre os delays pendentes, cancela os delays e exige contagem final zero.

Esse teste de regressão é **contexto da causa-raiz**, não teste deste helper. O detector tem self-test próprio em `scripts/validation/verify-jest-worker-warning-selftest.js`.

A matriz `scripts/ci/data/regression-matrix.json` registra o incidente `REG-WORKER-WARNING-GATE`: o problema descrito é que o Jest podia retornar zero mesmo depois de force-exit de worker. A matriz aponta para o self-test do detector e para o gate `CI Contract`.

## 3. Consumers e dependências

### 3.1 Consumers diretos

- `scripts/ci/run-jest-ci.js`
  - importa apenas `hasForcedWorkerExit`;
  - passa **somente `jestStderr`** ao detector;
  - se o retorno for `true`, adiciona `Um worker Jest precisou ser encerrado à força; corrigir os recursos pendentes.` à lista de problemas;
  - qualquer item em `problems` torna o runner bloqueante por `process.exitCode = 1`;
  - o mesmo runner atende `npm run test:ci` e `npm run test:coverage`.

- `scripts/maintenance/diagnose-jest-workers.js`
  - importa `FORCED_WORKER_EXIT` e `hasForcedWorkerExit`;
  - concatena `stdout + '\n' + stderr`;
  - calcula `forcedWorkerExit`;
  - grava o booleano nos logs/resultados diagnósticos;
  - usa também a constante ao filtrar linhas relevantes.

- `scripts/maintenance/diagnose-background-leak.js`
  - importa `hasForcedWorkerExit`;
  - concatena stdout e stderr do subprocesso Jest;
  - persiste `forcedWorkerExit` em cada registro da bisseção diagnóstica.

- `scripts/validation/verify-jest-worker-warning-selftest.js`
  - importa **o módulo real**;
  - usa a constante exportada e chama a função real em três assertions.

### 3.2 Gates e orquestração

- `package.json#validate` executa `node scripts/validation/verify-jest-worker-warning-selftest.js`.
- `package.json#test:ci` aponta para `node scripts/ci/run-jest-ci.js`.
- `package.json#test:coverage` usa o mesmo runner com `--coverage`.
- `package.json#test:diagnose-workers` e `test:diagnose-background-leak` expõem os dois consumidores diagnósticos.
- `.github/workflows/ci.yml` possui passo dedicado “Testar detecção de worker Jest forçado” no job `CI Contract`.
- O workflow também executa `npm run test:ci`, de modo que o detector participa do gate Jest normal.
- `scripts/validation/verify-ci-contract.js` verifica estaticamente que:
  - `run-jest-ci.js` ainda contém a chamada `hasForcedWorkerExit(jestStderr)`;
  - a CI ainda executa o self-test;
  - o runner não introduz `--forceExit`, que mascararia open handles em vez de corrigi-los.

### 3.3 Dependências do próprio arquivo

O módulo não importa bibliotecas internas nem externas. Usa apenas:

- sintaxe CommonJS de Node.js;
- `typeof`;
- `String.prototype.includes`;
- `module.exports`.

Isso reduz o risco de side effects e torna o helper carregável em scripts de validação sem bootstrap adicional.

## 4. Fluxo de dados e comportamento

Fluxo do gate principal:

`spawnSync(Jest)` → captura `stderr` → `hasForcedWorkerExit(stderr)` → `true/false` → se `true`, adiciona problema → runner termina com exit code 1.

Fluxo dos diagnósticos:

`spawnSync(Jest)` → concatena stdout/stderr → `hasForcedWorkerExit(combined)` → grava `forcedWorkerExit` em artefato/registro → diagnóstico usa o sinal para classificar a execução.

A função é síncrona, determinística e não muta o argumento. Para strings, seu custo é dominado por `includes`, portanto linear no tamanho do texto pesquisado no pior caso. Para valores não string, o short-circuit do `&&` evita chamar `.includes`.

## 5. Estado, efeitos colaterais, lifecycle e concorrência

O módulo não mantém estado mutável. `FORCED_WORKER_EXIT` é uma constante lexical e `hasForcedWorkerExit` não altera globals, arquivos, storage ou processos.

Não há:

- timers;
- Promises;
- callbacks;
- listeners;
- acesso a rede;
- acesso a `chrome.*`;
- IPC;
- filesystem;
- subprocessos próprios;
- cleanup necessário;
- dependência de lifecycle Manifest V3.

A concorrência relevante acontece fora deste arquivo, nos subprocessos Jest. Como o detector só recebe uma string já capturada, não há race interna. O risco é **observacional**: o consumer precisa pesquisar o canal correto. O runner principal pesquisa apenas `stderr`; os diagnósticos pesquisam stdout + stderr.

## 6. Segurança, privacidade e trust boundaries

Este helper não processa dados da extensão nem dados do usuário. A fronteira de confiança é o **texto vindo de processos externos**.

Propriedades importantes:

- entrada não string retorna `false` e não lança por tentativa de chamar `.includes`;
- a busca é literal e case-sensitive;
- prefixos/sufixos ao redor da mensagem não impedem detecção;
- o helper não grava o texto recebido e não o envia para terceiros.

Os scripts diagnósticos que o consomem gravam stdout/stderr em artefatos locais/CI, mas essa persistência pertence a esses consumers, não a este módulo.

Um payload textual malicioso ou um teste que escreva deliberadamente a frase exata no canal pesquisado pode gerar **falso positivo**. Isso não representa elevação de privilégio, mas pode reprovar a CI indevidamente.

## 7. Casos-limite

1. `undefined`, `null`, número, objeto, Buffer ou `new String(...)`: retornam `false` porque `typeof value !== 'string'`.
2. string vazia: retorna `false`.
3. mensagem exata: retorna `true`.
4. mensagem com prefixo/sufixo: retorna `true` porque `includes` procura substring.
5. diferença de maiúsculas/minúsculas: retorna `false`.
6. alteração mínima de pontuação ou wording do Jest: retorna `false`.
7. códigos ANSI inseridos **dentro** da frase podem impedir a correspondência literal.
8. warning emitido no stdout: o runner principal pode perder o sinal porque passa só `jestStderr`; os diagnósticos, que combinam ambos, ainda podem detectá-lo.
9. texto de teste/log contendo casualmente a frase exata no canal pesquisado: pode produzir falso positivo.
10. string muito grande: continua correta, mas a busca percorre o texto; os consumers já limitam buffers de subprocesso, portanto este helper não é o limitador primário.

## 8. Evidência automatizada

| Comportamento | Evidência real | Classificação |
|---|---|---|
| string que contém a constante exportada é reconhecida | self-test requer o módulo real e faz `assert.equal(hasForcedWorkerExit('PASS...'+FORCED_WORKER_EXIT+'\n'), true)` | ✅ PROVADO DIRETAMENTE |
| output normal de PASS não é confundido com worker force-exit | self-test chama a implementação real com `PASS ... Tests: 840 passed` e exige `false` | ✅ PROVADO DIRETAMENTE |
| uma mensagem comum de FAIL não é confundida com worker force-exit | self-test chama a implementação real com `FAIL unit/example.test.js` e exige `false` | ✅ PROVADO DIRETAMENTE |
| nomes `FORCED_WORKER_EXIT` e `hasForcedWorkerExit` são exportados de forma utilizável | o self-test faz destructuring dos dois exports e os utiliza imediatamente | ✅ PROVADO DIRETAMENTE |
| runner canônico ainda chama `hasForcedWorkerExit(jestStderr)` | `verify-ci-contract.js` procura esse literal no arquivo do runner | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI ainda executa o self-test | `verify-ci-contract.js` exige o comando no workflow; o próprio workflow contém o passo dedicado | 🟦 GATE ESTÁTICO ESPECÍFICO |
| runner não mascara leaks com `--forceExit` | `verify-ci-contract.js` reprova presença de `--forceExit` no runner | 🟦 GATE ESTÁTICO ESPECÍFICO |
| detector participa do gate Jest normal | `run-jest-ci.js` importa e chama o helper; workflow executa `npm run test:ci` | 🟨 EXECUTADO INDIRETAMENTE |
| diagnósticos de workers/background usam o mesmo detector | ambos importam a implementação e registram `forcedWorkerExit` | 🟨 EXECUTADO INDIRETAMENTE |
| literal inglês exato da constante está correto para todas as versões de Jest suportadas | o self-test constrói o caso positivo usando **a própria constante exportada**, portanto uma mudança simultânea da constante e do detector continuaria passando | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branch de tipo não string | nenhuma assertion focal encontrada para `null`, `undefined`, objetos ou Buffer | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| warning no stdout é bloqueado pelo runner principal | o runner fornece apenas stderr ao helper | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Lacunas de teste

### 9.1 Literal canônico não é protegido independentemente

**Comportamento:** `FORCED_WORKER_EXIT` precisa corresponder ao warning real emitido pelo Jest.

**Por que os testes atuais não provam:** o caso positivo monta a entrada usando a própria constante importada. Se alguém alterar a constante para uma frase errada, a função e o teste continuarão concordando entre si.

**Teste necessário:** assertion independente como `assert.equal(FORCED_WORKER_EXIT, '<literal canônico esperado>')`, ou fixture capturada de uma execução Jest compatível.

**Regressão que pode escapar:** a CI deixa de reconhecer o warning real após drift textual.

### 9.2 Guard de não string não recebe assertion

**Comportamento:** entradas não string devem retornar `false` sem exception.

**Por que os testes atuais não provam:** as três entradas do self-test são strings.

**Teste necessário:** casos para `undefined`, `null`, número, objeto, Buffer e, se desejado, `new String`.

**Regressão que pode escapar:** remoção do `typeof` produz TypeError em consumers que recebam valor inesperado.

### 9.3 Canal do runner principal

**Comportamento:** o gate principal só bloqueia quando o warning aparece em `jestStderr`.

**Por que os testes atuais não provam:** o self-test testa a função isolada, não a captura real do subprocesso no runner.

**Teste necessário:** self-test do runner com subprocesso/fixture que coloque a frase em stderr e confirme exit code final 1; um segundo caso no stdout deve documentar explicitamente a política escolhida.

**Regressão que pode escapar:** mudança do canal de emissão pelo Jest faz o warning passar despercebido.

### 9.4 Formatação ANSI e drift de wording

**Comportamento:** a correspondência atual exige substring literal contígua.

**Por que os testes atuais não provam:** não há casos com ANSI, prefixos coloridos dentro da frase, mudança de pontuação, capitalização ou nova redação do Jest.

**Teste necessário:** fixtures representativas do output das versões de Jest suportadas.

**Regressão que pode escapar:** falso negativo após upgrade do Jest.

### 9.5 Falso positivo por texto ecoado

**Comportamento:** qualquer ocorrência literal no canal pesquisado gera `true`, independentemente da origem.

**Por que os testes atuais não provam:** não há cenário em que um teste ou ferramenta imprime a frase apenas como dado.

**Teste necessário:** decidir se essa ocorrência deve mesmo reprovar sempre. Se não, usar parser/regex com contexto de linha e testar origem/estrutura.

**Regressão que pode escapar:** CI vermelha sem worker realmente forçado.

## 10. Invariantes

1. `run-jest-ci.js` deve continuar transformando worker force-exit em falha bloqueante enquanto esse warning puder coexistir com status Jest zero.
2. Não introduzir `--forceExit` como atalho para esconder open handles.
3. O detector deve permanecer sem side effects; consumers dependem dele como função pura.
4. A constante e a função devem continuar exportadas com os nomes atuais enquanto houver consumers CommonJS usando destructuring.
5. Entrada não string não deve lançar.
6. A detecção não deve considerar uma falha Jest comum equivalente ao warning de worker forçado.
7. Se o wording do Jest mudar, constante, testes independentes e documentação devem ser revisados juntos.
8. Se o runner mudar de stderr para stdout/combined output, essa decisão precisa ser testada explicitamente.
9. Os diagnósticos podem enriquecer contexto, mas não devem possuir uma cópia divergente da frase.
10. O SHA desta Bíblia só permanece válido enquanto o blob for `b1379b6811e5513b955ebbbef4450ca4ca1e77da`.

## 11. Fonte integral

```javascript
'use strict';

const FORCED_WORKER_EXIT = 'A worker process has failed to exit gracefully and has been force exited';

function hasForcedWorkerExit(stderr) {
  return typeof stderr === 'string' && stderr.includes(FORCED_WORKER_EXIT);
}

module.exports = { FORCED_WORKER_EXIT, hasForcedWorkerExit };
```

## 12. Cobertura linha a linha

### Linha 1 — modo estrito do módulo

**Fonte:** `'use strict';`

**O que faz:** habilita strict mode para todo o arquivo CommonJS.

**Como faz:** a directive prologue é reconhecida pelo runtime JavaScript antes da avaliação das declarações seguintes.

**Por que assim:** mantém o helper alinhado aos demais scripts Node do repositório e evita semânticas permissivas acidentais, por exemplo atribuições implícitas a globals.

**Por que uma alternativa ingênua seria pior:** remover a diretiva não quebra a lógica atual, mas reduz a proteção contra futuras edições que dependam de semântica estrita.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o self-test e consumers carregam o módulo real, mas nenhuma assertion é específica ao strict mode.

### Linha 2 — separação estrutural

**Fonte:** linha vazia.

**O que faz:** separa a directive prologue da constante do domínio.

**Como faz:** não produz operação em runtime; é organização do fonte.

**Por que assim:** torna visualmente distinta a configuração de linguagem do contrato textual exportado.

**Por que uma alternativa ingênua seria pior:** compactar tudo em uma linha reduziria legibilidade sem benefício funcional.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: whitespace editorial não recebe assertion e não precisa receber, desde que a fonte auditada permaneça íntegra.

### Linha 3 — literal do warning Jest

**Fonte:** `const FORCED_WORKER_EXIT = 'A worker process has failed to exit gracefully and has been force exited';`

**O que faz:** define a assinatura textual usada para reconhecer o sintoma de worker que precisou de force-exit.

**Como faz:** armazena a frase como `const` lexical e a reutiliza tanto na busca quanto nos diagnostics/self-test.

**Por que assim:** centralizar evita que runner e diagnósticos mantenham strings duplicadas que possam divergir.

**Por que uma alternativa ingênua seria pior:** repetir o literal em cada consumer permitiria drift silencioso e classificações diferentes para a mesma execução.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a **correção independente do literal**. O self-test importa esta mesma constante para montar o caso positivo, portanto prova consistência interna, não que o texto continua igual ao warning real de uma versão futura do Jest.

### Linha 4 — separação estrutural

**Fonte:** linha vazia.

**O que faz:** separa a constante exportável da função que a consome.

**Como faz:** não executa instrução em runtime.

**Por que assim:** deixa o contrato textual e a lógica de reconhecimento visualmente independentes.

**Por que uma alternativa ingênua seria pior:** não haveria falha funcional, apenas piora de leitura/manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: posição editorial apenas.

### Linha 5 — declaração do detector

**Fonte:** `function hasForcedWorkerExit(stderr) {`

**O que faz:** declara a API booleana consumida pelo runner, diagnósticos e self-test.

**Como faz:** cria uma function declaration síncrona cujo parâmetro representa texto de saída de subprocesso.

**Por que assim:** uma função nomeada e pura é reutilizável em múltiplos scripts e simples de testar isoladamente.

**Por que uma alternativa ingênua seria pior:** embutir a busca em cada consumer duplicaria política e dificultaria garantir que todos reconhecem o mesmo sintoma.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE quanto à função exportada/invocável: o self-test requer o módulo real e chama `hasForcedWorkerExit` três vezes.

### Linha 6 — guard de tipo e busca literal

**Fonte:** `  return typeof stderr === 'string' && stderr.includes(FORCED_WORKER_EXIT);`

**O que faz:** retorna `true` somente quando a entrada é string e contém a assinatura textual; caso contrário retorna `false`.

**Como faz:** o primeiro operando do `&&` verifica o tipo. Se falhar, short-circuit impede acesso a `.includes`. Para strings, `includes` procura a substring literal e case-sensitive.

**Por que assim:** o guard evita TypeError sem transformar tipos arbitrários em texto, enquanto `includes` aceita prefixos/sufixos comuns do stderr.

**Por que uma alternativa ingênua seria pior:** chamar `stderr.includes` sem guard poderia lançar; usar coerção `String(stderr)` poderia converter objetos inesperados e criar matches artificiais; comparar igualdade exata perderia o warning quando houver outras linhas no stderr.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para strings positivas/negativas pelos três asserts do self-test. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para o branch não string.

### Linha 7 — fechamento da função

**Fonte:** `}`

**O que faz:** encerra o corpo de `hasForcedWorkerExit`.

**Como faz:** delimita lexicalmente o retorno da linha anterior.

**Por que assim:** mantém a função como unidade isolada e exportável.

**Por que uma alternativa ingênua seria pior:** mudança estrutural incorreta impediria parse/carregamento do módulo; não há lógica adicional que deva ficar escondida nesse helper.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o módulo precisa parsear e carregar para o self-test chegar às assertions.

### Linha 8 — separação antes do export

**Fonte:** linha vazia.

**O que faz:** separa implementação do contrato público CommonJS.

**Como faz:** não possui efeito de runtime.

**Por que assim:** facilita localizar a fronteira pública do módulo.

**Por que uma alternativa ingênua seria pior:** apenas perda de legibilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: posição editorial apenas.

### Linha 9 — export CommonJS

**Fonte:** `module.exports = { FORCED_WORKER_EXIT, hasForcedWorkerExit };`

**O que faz:** expõe a constante e o detector aos consumers Node.

**Como faz:** substitui `module.exports` por um objeto com propriedades shorthand que preservam exatamente esses nomes.

**Por que assim:** o repositório usa `require(...)` e destructuring nesses scripts; exportar ambos permite que diagnósticos reutilizem a frase e que gates chamem a função sem duplicação.

**Por que uma alternativa ingênua seria pior:** renomear/remover qualquer propriedade quebraria os `require` existentes; exportar só a função faria diagnósticos voltarem a duplicar a frase.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo self-test, que destructura os dois nomes e os usa; consumers adicionais confirmam dependência operacional dos nomes.

### Linha 10 — newline final

**Fonte:** `⏎ [newline final]`

**O que faz:** representa o LF terminal contado como décima posição documental.

**Como faz:** o blob termina com newline depois da linha de `module.exports`.

**Por que assim:** preserva convenção de arquivo texto e permite equivalência posicional exata usada pelo gate das Bíblias.

**Por que uma alternativa ingênua seria pior:** remover a posição terminal faria a contagem documental divergir do `source.split('\n')` usado pelo verificador estrutural.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO no contexto documental: `verify-repository-structure.js` compara quantidade sequencial de headings `Linha N` com as posições do fonte para Bíblias aprovadas.

## 13. Análise crítica

1. **O self-test positivo é parcialmente tautológico para o literal.** Ele usa `FORCED_WORKER_EXIT` para montar a própria entrada positiva. Isso prova que função e export concordam, não que a constante representa fielmente uma mensagem externa futura.
2. **O runner principal pesquisa somente stderr.** Os dois diagnósticos pesquisam output combinado. Essa assimetria pode virar falso negativo se a ferramenta mudar o canal do warning.
3. **Correspondência textual é frágil a upgrades.** Mudanças de wording, capitalização ou ANSI interno podem quebrar detecção sem erro de parse.
4. **`includes` aceita qualquer origem da frase.** Um teste que ecoe a mensagem exata pode derrubar a CI mesmo sem leak real.
5. **A função não identifica causa.** Isso é intencional: causa-raiz exige `--detectOpenHandles`, bisseção ou testes focais de teardown. Transformar este helper em parser complexo misturaria detecção e diagnóstico.
6. **Não usar `--forceExit` é parte do desenho.** Forçar saída faria a suíte parecer saudável e eliminaria precisamente o sintoma que este módulo quer tornar bloqueante.
7. **O helper é pequeno o suficiente para ser estável.** O principal risco não é complexidade algorítmica, mas drift entre mensagem externa, canal de saída e política da CI.

## 14. Autoauditoria

- SHA do fonte reconfirmado antes da materialização: `b1379b6811e5513b955ebbbef4450ca4ca1e77da`.
- Reserva confirmada: `AGENTE 8`.
- Fonte integral: 9 linhas textuais + newline final.
- Cobertura: 10/10 posições, com headings sequenciais `Linha 1` a `Linha 10`.
- Consumers reais conferidos no branch: runner CI, dois diagnostics e self-test.
- Assertions reais do self-test lidas individualmente e classificadas sem promover gates textuais a prova comportamental.
- Regressão `REG-WORKER-4S` classificada apenas como contexto da causa-raiz, não como teste deste helper.
- Lacuna do literal canônico registrada explicitamente.
- Nenhum código funcional foi alterado.

**Estado documental desta materialização:** ✅ APROVADO em `AUDITORIA.md`; fonte integral, 10/10 posições, consumers e força das evidências foram reconfirmados para o SHA auditado.

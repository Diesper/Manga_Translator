# Bíblia técnica — scripts/validation/verify-e2e-shard-plan.js

> **Estado documental:** ✅ CONCLUÍDO PELO AGENTE RESPONSÁVEL  
> **SHA auditado:** `ea1149ced74425ad27ede90ec409c2548cb5b65d`  
> **Agente responsável:** AGENTE 6  
> **Tipo:** gate Node.js de inventário/partição E2E com Playwright  
> **Linhas textuais:** **155**  
> **Posições documentais:** **156**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é o gate dinâmico que confronta `e2e-shard-plan.json` com a descoberta real do Playwright. Ele chama `playwright test --list --reporter=json` sem filtro e depois uma vez por tag de grupo, transforma cada teste em chave `file::line::column::title::project` e exige que os grupos formem uma partição exata: todos os testes aparecem, nenhum aparece duas vezes e cada contagem por grupo coincide com `expectedTests`.

Ele também impede regressão de volume via `test-baseline.json#e2e.minTests`. No estado auditado, o plano contém cinco grupos somando 21 testes e o baseline E2E exige no mínimo 21. A política de “exatamente cinco grupos nesta fase”, IDs, contagens e workers específicos é adicionalmente congelada por `verify-ci-contract.js`.

## 2. Dependências, consumidores e efeitos

- **Node:** `child_process.spawnSync`, `fs`, `path`.
- **Dados:** `scripts/ci/data/e2e-shard-plan.json`, `scripts/ci/data/test-baseline.json`.
- **Ferramentas:** `node_modules/playwright/cli.js`, `playwright.config.js`.
- **npm:** `test:e2e:plan` aponta diretamente para este arquivo; `validate` também o executa.
- **CI:** o job agregado `e2e` executa `npm run test:e2e:plan` antes de baixar e mesclar blob reports dos cinco shards.
- **Gate complementar:** `verify-ci-contract.js` protege o wiring, cinco IDs atuais, `expectedTests`, workers, total igual ao baseline e três marcadores deste verificador.
- **Efeito:** inicia processos de listagem Playwright, escreve logs e falha o processo; não altera testes, plano, baseline ou artefatos.

## 3. Fluxo completo

1. carrega plano/baseline e resolve o CLI;
2. valida quantidade mínima, shape básico, IDs/tags únicos, workers e grupo rápido;
3. lista todo o inventário Playwright;
4. rejeita chaves duplicadas e inventário abaixo do baseline;
5. lista cada grupo por `--grep <tag>`;
6. exige a contagem declarada;
7. prova que cada chave pertence ao inventário completo;
8. rejeita interseção entre grupos;
9. rejeita qualquer chave completa sem grupo;
10. reconfirma cardinalidades;
11. imprime aprovação somente após todas as guardas.

## 4. Evidência automatizada

| Propriedade | Evidência atual | Classificação |
|---|---|---|
| `test:e2e:plan` usa este arquivo | `package.json` + checagem em `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI agregado executa o gate | `.github/workflows/ci.yml` | 🟨 EXECUTADO INDIRETAMENTE |
| plano atual = 5 grupos com IDs/contagens/workers esperados | `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| soma do plano = baseline E2E | `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| marcadores de completude/duplicata/omissão permanecem no fonte | `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| listagem real e caminho verde do particionamento | execução do CLI em `test:e2e:plan` | 🟨 EXECUTADO INDIRETAMENTE |
| branches negativos, JSON inválido, falha de spawn, duplicação/omissão | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

O workflow do head observado durante esta auditoria estava **pendente**; esta Bíblia não transforma um run ainda sem conclusão em prova.

## 5. Invariantes

1. inventário-base vem do Playwright real e do config canônico;
2. toda chave completa pertence a exatamente um grupo;
3. grupos não se sobrepõem;
4. cada grupo contém somente chaves do inventário completo;
5. contagem real por grupo = `expectedTests`;
6. inventário completo >= `baseline.e2e.minTests`;
7. IDs e tags são únicos;
8. `expectedTests` e `workers` são inteiros positivos;
9. existe ao menos um `kind: fast`;
10. descoberta do gate força `CI=1`, `MANGA_E2E_SHARD=0`, `MANGA_E2E_WORKERS=1`;
11. falha de Playwright ou parse torna o processo vermelho;
12. aprovação só ocorre após checagens de completude, disjunção e cardinalidade.

## 6. Casos-limite e riscos

- **Self-test focal ausente:** o arquivo é executado de verdade, mas não há suíte localizada que force cada erro.
- **Sem timeout em `spawnSync`:** uma listagem travada depende do limite externo do runner/job. `result.error` também não recebe diagnóstico próprio; erros de spawn/maxBuffer caem em tratamento genérico.
- **JSON canônico malformado:** plano/baseline são parseados no topo sem `try/catch`; falham fechado por exceção, mas fora do padrão de mensagem `[E2E/PLAN]`.
- **Schema parcial:** `plan.version` não é validado; `estimatedSeconds` apenas aparece no log; `kind` só é usado para exigir pelo menos um `fast`. Este arquivo aceita `groups.length >= 5`, enquanto o contrato externo congela exatamente 5.
- **Tipo de tag:** a guarda aplica `String(tag)`, mas o valor original é fornecido a `spawnSync`; entradas não-string não possuem prova focal.
- **Identidade composta:** arquivo/linha/coluna/título/projeto é uma chave forte para cruzar relatórios, mas casos patológicos de identidade repetida não possuem self-test dedicado.
- **Layout do CLI:** o path direto `node_modules/playwright/cli.js` depende do layout instalado por `@playwright/test`; funciona no contrato atual, mas não há teste focal deste acoplamento.

## 7. Solicitações ao auditor

- **086-001 — TEST_REQUIRED:** self-test da implementação real para sucesso, plano inválido, duplicações, omissões, divergência de contagem, status Playwright e JSON inválido.
- **086-002 — CI_POLICY_REVIEW:** definir/provar timeout, tratamento de `spawnSync().error`, `maxBuffer` e diagnóstico de falha da descoberta.
- **086-003 — CONTRACT_REVIEW:** decidir se `plan.version`, tipo da tag, `estimatedSeconds`, enum de `kind` e “>=5 aqui / exatamente 5 externamente” devem ter schema/gate explícito.

## 8. Fonte integral exata

```js
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const plan = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts', 'ci', 'data', 'e2e-shard-plan.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts', 'ci', 'data', 'test-baseline.json'), 'utf8'));
const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');

function fail(message) {
  console.error('[E2E/PLAN] ' + message);
  process.exit(1);
}

function runList(extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      'test',
      '--config',
      path.join(repoRoot, 'playwright.config.js'),
      '--list',
      '--reporter=json',
      ...extraArgs,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CI: '1',
        MANGA_E2E_SHARD: '0',
        MANGA_E2E_WORKERS: '1',
      },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    fail('playwright --list terminou com código ' + result.status);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(result.stdout || '');
    fail('não foi possível interpretar o JSON do playwright --list: ' + error.message);
  }
}

function collectSpecs(report) {
  const keys = [];

  function visitSuite(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const project = test.projectName || '<sem-projeto>';
        keys.push([
          spec.file || '',
          spec.line || 0,
          spec.column || 0,
          spec.title || '',
          project,
        ].join('::'));
      }
    }
    for (const child of suite.suites || []) visitSuite(child);
  }

  for (const suite of report.suites || []) visitSuite(suite);
  return keys;
}

if (!Array.isArray(plan.groups) || plan.groups.length < 5) {
  fail('o plano precisa conter no mínimo 5 grupos');
}

const ids = new Set();
const tags = new Set();
for (const group of plan.groups) {
  if (!group.id || !group.tag || !Number.isInteger(group.expectedTests) || group.expectedTests <= 0) {
    fail('grupo inválido no plano: ' + JSON.stringify(group));
  }
  if (!Number.isInteger(group.workers) || group.workers <= 0) {
    fail('workers inválido no plano para ' + group.id + ': ' + group.workers);
  }
  if (!String(group.tag).startsWith('@')) fail('tag precisa começar com @: ' + group.tag);
  if (ids.has(group.id)) fail('grupo duplicado: ' + group.id);
  if (tags.has(group.tag)) fail('tag duplicada: ' + group.tag);
  ids.add(group.id);
  tags.add(group.tag);
}

if (!plan.groups.some(group => group.kind === 'fast')) {
  fail('o plano precisa manter um grupo dedicado aos testes rápidos');
}

const full = collectSpecs(runList());
const fullSet = new Set(full);
if (full.length !== fullSet.size) {
  fail('inventário completo contém chaves de teste duplicadas');
}
if (full.length < baseline.e2e.minTests) {
  fail('inventário completo caiu para ' + full.length + '; mínimo protegido=' + baseline.e2e.minTests);
}

const union = new Map();
let sum = 0;

for (const group of plan.groups) {
  const keys = collectSpecs(runList(['--grep', group.tag]));
  if (keys.length !== group.expectedTests) {
    fail(
      'grupo ' + group.id + ' coletou ' + keys.length +
      ' teste(s); esperado=' + group.expectedTests
    );
  }

  console.log(
    '[E2E/PLAN] ' + group.id +
    ': ' + keys.length + ' teste(s), workers=' + group.workers +
    ', ~' + group.estimatedSeconds + 's'
  );

  sum += keys.length;
  for (const key of keys) {
    if (!fullSet.has(key)) fail('grupo ' + group.id + ' contém teste fora do inventário: ' + key);
    if (union.has(key)) {
      fail('teste duplicado entre grupos ' + union.get(key) + ' e ' + group.id + ': ' + key);
    }
    union.set(key, group.id);
  }
}

const missing = full.filter(key => !union.has(key));
if (missing.length) {
  console.error('[E2E/PLAN] Testes sem grupo:');
  for (const key of missing) console.error('- ' + key);
  fail(missing.length + ' teste(s) do inventário não pertencem a nenhum grupo');
}

if (sum !== full.length || union.size !== full.length) {
  fail('união dos grupos=' + union.size + ', soma=' + sum + ', inventário=' + full.length);
}

console.log(
  '[E2E/PLAN] Plano válido: ' + plan.groups.length +
  ' grupos, ' + full.length +
  ' testes, cobertura exata sem omissões ou duplicatas.'
);
```

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** `'use strict';`

**O que faz:** Ativa strict mode no módulo CommonJS.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 2

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de imports Node.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 3

**Fonte:** `const { spawnSync } = require('child_process');`

**O que faz:** Importa `spawnSync` para executar a descoberta Playwright de forma síncrona.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 4

**Fonte:** `const fs = require('fs');`

**O que faz:** Importa `fs` para ler o plano e o baseline.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 5

**Fonte:** `const path = require('path');`

**O que faz:** Importa `path` para paths portáveis.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 6

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de resolução de caminhos e leitura das fontes canônicas.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 7

**Fonte:** `const repoRoot = path.resolve(__dirname, '../..');`

**O que faz:** Resolve a raiz do repositório a partir de `scripts/validation`.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 8

**Fonte:** `const plan = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts', 'ci', 'data', 'e2e-shard-plan.json'), 'utf8'));`

**O que faz:** Lê e parseia `scripts/ci/data/e2e-shard-plan.json`.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 9

**Fonte:** `const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts', 'ci', 'data', 'test-baseline.json'), 'utf8'));`

**O que faz:** Lê e parseia `scripts/ci/data/test-baseline.json`.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 10

**Fonte:** `const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');`

**O que faz:** Resolve `node_modules/playwright/cli.js`.

**Como faz:** Usa CommonJS e paths absolutos derivados de `__dirname`, evitando dependência do `cwd` do chamador.

**Por que foi implementado dessa forma:** As entradas precisam ser as fontes reais do workspace que a CI usa.

**Por que uma implementação ingênua seria pior:** Paths relativos ao `cwd` ou cópias de JSON aumentariam divergência entre local e CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 11

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de helper de falha.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 12

**Fonte:** `function fail(message) {`

**O que faz:** Declara o helper central de falha.

**Como faz:** Centraliza stderr e saída não zero em uma única função.

**Por que foi implementado dessa forma:** O arquivo é gate de CI; falhas precisam virar exit code não zero.

**Por que uma implementação ingênua seria pior:** Apenas logar e continuar permitiria falso verde.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 13

**Fonte:** `  console.error('[E2E/PLAN] ' + message);`

**O que faz:** Escreve erro com o prefixo estável `[E2E/PLAN]`.

**Como faz:** Centraliza stderr e saída não zero em uma única função.

**Por que foi implementado dessa forma:** O arquivo é gate de CI; falhas precisam virar exit code não zero.

**Por que uma implementação ingênua seria pior:** Apenas logar e continuar permitiria falso verde.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 14

**Fonte:** `  process.exit(1);`

**O que faz:** Encerra imediatamente o processo com código 1.

**Como faz:** Centraliza stderr e saída não zero em uma única função.

**Por que foi implementado dessa forma:** O arquivo é gate de CI; falhas precisam virar exit code não zero.

**Por que uma implementação ingênua seria pior:** Apenas logar e continuar permitiria falso verde.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 15

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de helper de falha.

**Como faz:** Centraliza stderr e saída não zero em uma única função.

**Por que foi implementado dessa forma:** O arquivo é gate de CI; falhas precisam virar exit code não zero.

**Por que uma implementação ingênua seria pior:** Apenas logar e continuar permitiria falso verde.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 16

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de consulta `playwright --list`.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 17

**Fonte:** `function runList(extraArgs = []) {`

**O que faz:** Declara o wrapper das listagens Playwright.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 18

**Fonte:** `  const result = spawnSync(`

**O que faz:** Executa o CLI via `spawnSync` e captura o resultado.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 19

**Fonte:** `    process.execPath,`

**O que faz:** Usa o executável Node corrente.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 20

**Fonte:** `    [`

**O que faz:** Completa a fase de consulta `playwright --list` com a expressão `[`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 21

**Fonte:** `      playwrightCli,`

**O que faz:** Seleciona o CLI Playwright instalado.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 22

**Fonte:** `      'test',`

**O que faz:** Seleciona o comando `test`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 23

**Fonte:** `      '--config',`

**O que faz:** Abre a opção `--config`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 24

**Fonte:** `      path.join(repoRoot, 'playwright.config.js'),`

**O que faz:** Aponta para o `playwright.config.js` canônico.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 25

**Fonte:** `      '--list',`

**O que faz:** Usa `--list`, descobrindo testes sem executar seus corpos.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 26

**Fonte:** `      '--reporter=json',`

**O que faz:** Pede reporter JSON para obter inventário estruturado.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 27

**Fonte:** `      ...extraArgs,`

**O que faz:** Acrescenta args extras; por grupo são `--grep` e a tag.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 28

**Fonte:** `    ],`

**O que faz:** Fecha a estrutura sintática ativa na fase de consulta `playwright --list`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 29

**Fonte:** `    {`

**O que faz:** Completa a fase de consulta `playwright --list` com a expressão `{`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 30

**Fonte:** `      cwd: repoRoot,`

**O que faz:** Fixa `cwd` na raiz.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 31

**Fonte:** `      env: {`

**O que faz:** Completa a fase de consulta `playwright --list` com a expressão `env: {`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 32

**Fonte:** `        ...process.env,`

**O que faz:** Herdada o ambiente atual.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 33

**Fonte:** `        CI: '1',`

**O que faz:** Força semântica CI.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 34

**Fonte:** `        MANGA_E2E_SHARD: '0',`

**O que faz:** Desativa modo shard do reporter durante a verificação.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 35

**Fonte:** `        MANGA_E2E_WORKERS: '1',`

**O que faz:** Fixa a descoberta em um worker.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 36

**Fonte:** `      },`

**O que faz:** Fecha a estrutura sintática ativa na fase de consulta `playwright --list`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 37

**Fonte:** `      encoding: 'utf8',`

**O que faz:** Captura saída como UTF-8.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 38

**Fonte:** `      maxBuffer: 20 * 1024 * 1024,`

**O que faz:** Limita stdout/stderr a 20 MiB.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 39

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática ativa na fase de consulta `playwright --list`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 40

**Fonte:** `  );`

**O que faz:** Completa a fase de consulta `playwright --list` com a expressão `);`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 41

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de consulta `playwright --list`.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 42

**Fonte:** `  if (result.status !== 0) {`

**O que faz:** Detecta status diferente de zero.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 43

**Fonte:** `    console.error(result.stdout || '');`

**O que faz:** Reemite stdout em falha.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 44

**Fonte:** `    console.error(result.stderr || '');`

**O que faz:** Reemite stderr em falha.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 45

**Fonte:** `    fail('playwright --list terminou com código ' + result.status);`

**O que faz:** Transforma status Playwright ruim em falha do gate.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 46

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática ativa na fase de consulta `playwright --list`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 47

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de consulta `playwright --list`.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 48

**Fonte:** `  try {`

**O que faz:** Abre parse protegido do stdout.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 49

**Fonte:** `    return JSON.parse(result.stdout);`

**O que faz:** Parseia e retorna o JSON do reporter.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 50

**Fonte:** `  } catch (error) {`

**O que faz:** Captura erro de parse.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 51

**Fonte:** `    console.error(result.stdout || '');`

**O que faz:** Mostra o stdout que não pôde ser parseado.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 52

**Fonte:** `    fail('não foi possível interpretar o JSON do playwright --list: ' + error.message);`

**O que faz:** Falha incluindo a mensagem do erro de JSON.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 53

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática ativa na fase de consulta `playwright --list`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 54

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de consulta `playwright --list`.

**Como faz:** Chama o CLI real com config canônico, modo listagem, reporter JSON e ambiente CI controlado; depois valida status e parse.

**Por que foi implementado dessa forma:** Consultar o Playwright evita duplicar manualmente um inventário que poderia ficar desatualizado.

**Por que uma implementação ingênua seria pior:** Contar arquivos ou títulos manualmente não representa projetos/filtros reais do Playwright.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 55

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de normalização do relatório.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 56

**Fonte:** `function collectSpecs(report) {`

**O que faz:** Declara o normalizador do relatório em chaves comparáveis.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 57

**Fonte:** `  const keys = [];`

**O que faz:** Inicializa o vetor de chaves.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 58

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de normalização do relatório.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 59

**Fonte:** `  function visitSuite(suite) {`

**O que faz:** Declara visita recursiva de suites.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 60

**Fonte:** `    for (const spec of suite.specs || []) {`

**O que faz:** Percorre specs da suite.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 61

**Fonte:** `      for (const test of spec.tests || []) {`

**O que faz:** Percorre testes do spec.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 62

**Fonte:** `        const project = test.projectName || '<sem-projeto>';`

**O que faz:** Obtém o projeto, usando sentinela se ausente.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 63

**Fonte:** `        keys.push([`

**O que faz:** Começa a chave composta do teste.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 64

**Fonte:** `          spec.file || '',`

**O que faz:** Inclui o arquivo.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 65

**Fonte:** `          spec.line || 0,`

**O que faz:** Inclui a linha.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 66

**Fonte:** `          spec.column || 0,`

**O que faz:** Inclui a coluna.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 67

**Fonte:** `          spec.title || '',`

**O que faz:** Inclui o título.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 68

**Fonte:** `          project,`

**O que faz:** Inclui o projeto.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 69

**Fonte:** `        ].join('::'));`

**O que faz:** Concatena os componentes com `::`.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 70

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática ativa na fase de normalização do relatório.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 71

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática ativa na fase de normalização do relatório.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 72

**Fonte:** `    for (const child of suite.suites || []) visitSuite(child);`

**O que faz:** Recursa em suites filhas.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 73

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática ativa na fase de normalização do relatório.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 74

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de normalização do relatório.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 75

**Fonte:** `  for (const suite of report.suites || []) visitSuite(suite);`

**O que faz:** Percorre suites de topo.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 76

**Fonte:** `  return keys;`

**O que faz:** Retorna as chaves achatadas.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 77

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de normalização do relatório.

**Como faz:** Recorre pela árvore `suites/specs/tests` e produz identidade `file::line::column::title::project`.

**Por que foi implementado dessa forma:** Chaves compostas permitem cruzar relatórios independentes sem depender da ordem.

**Por que uma implementação ingênua seria pior:** Usar só título ou só arquivo gera colisões; comparar objetos por referência não cruza relatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 78

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de quantidade mínima de grupos.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 79

**Fonte:** `if (!Array.isArray(plan.groups) || plan.groups.length < 5) {`

**O que faz:** Exige `plan.groups` array com pelo menos cinco entradas.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 80

**Fonte:** `  fail('o plano precisa conter no mínimo 5 grupos');`

**O que faz:** Falha se a quantidade mínima não for satisfeita.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 81

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de quantidade mínima de grupos.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 82

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de schema mínimo e unicidade dos grupos.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 83

**Fonte:** `const ids = new Set();`

**O que faz:** Inicializa o conjunto de IDs.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 84

**Fonte:** `const tags = new Set();`

**O que faz:** Inicializa o conjunto de tags.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 85

**Fonte:** `for (const group of plan.groups) {`

**O que faz:** Percorre cada grupo.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 86

**Fonte:** `  if (!group.id || !group.tag || !Number.isInteger(group.expectedTests) || group.expectedTests <= 0) {`

**O que faz:** Exige ID/tag presentes e `expectedTests` inteiro positivo.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 87

**Fonte:** `    fail('grupo inválido no plano: ' + JSON.stringify(group));`

**O que faz:** Falha mostrando o grupo estruturalmente inválido.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 88

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática ativa na fase de schema mínimo e unicidade dos grupos.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 89

**Fonte:** `  if (!Number.isInteger(group.workers) || group.workers <= 0) {`

**O que faz:** Exige `workers` inteiro positivo.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 90

**Fonte:** `    fail('workers inválido no plano para ' + group.id + ': ' + group.workers);`

**O que faz:** Falha mostrando workers inválidos e o grupo.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 91

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática ativa na fase de schema mínimo e unicidade dos grupos.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 92

**Fonte:** `  if (!String(group.tag).startsWith('@')) fail('tag precisa começar com @: ' + group.tag);`

**O que faz:** Exige tag cuja representação textual comece por `@`.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 93

**Fonte:** `  if (ids.has(group.id)) fail('grupo duplicado: ' + group.id);`

**O que faz:** Rejeita ID repetido.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 94

**Fonte:** `  if (tags.has(group.tag)) fail('tag duplicada: ' + group.tag);`

**O que faz:** Rejeita tag repetida.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 95

**Fonte:** `  ids.add(group.id);`

**O que faz:** Registra ID validado.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 96

**Fonte:** `  tags.add(group.tag);`

**O que faz:** Registra tag validada.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 97

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de schema mínimo e unicidade dos grupos.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 98

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de grupo rápido.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 99

**Fonte:** `if (!plan.groups.some(group => group.kind === 'fast')) {`

**O que faz:** Exige ao menos um grupo com `kind === 'fast'`.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 100

**Fonte:** `  fail('o plano precisa manter um grupo dedicado aos testes rápidos');`

**O que faz:** Falha quando não existe grupo rápido.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 101

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de grupo rápido.

**Como faz:** Valida o JSON do plano antes das descobertas por grupo, usando `Set` para unicidade.

**Por que foi implementado dessa forma:** Erros declarativos devem falhar cedo, antes de várias execuções do CLI.

**Por que uma implementação ingênua seria pior:** Deixar validação para os shards produz falhas tardias e diagnósticos menos específicos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho verde; o plano atual possui proteção estática complementar em `verify-ci-contract.js`.

### Linha/posição 102

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de inventário completo e baseline.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 103

**Fonte:** `const full = collectSpecs(runList());`

**O que faz:** Descobre o inventário completo e o normaliza.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 104

**Fonte:** `const fullSet = new Set(full);`

**O que faz:** Cria `Set` para medir unicidade.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 105

**Fonte:** `if (full.length !== fullSet.size) {`

**O que faz:** Compara cardinalidade total e única.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 106

**Fonte:** `  fail('inventário completo contém chaves de teste duplicadas');`

**O que faz:** Falha se houver chave duplicada no inventário completo.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 107

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de inventário completo e baseline.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 108

**Fonte:** `if (full.length < baseline.e2e.minTests) {`

**O que faz:** Compara quantidade real com `baseline.e2e.minTests`.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 109

**Fonte:** `  fail('inventário completo caiu para ' + full.length + '; mínimo protegido=' + baseline.e2e.minTests);`

**O que faz:** Falha se o inventário cair abaixo do piso.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 110

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de inventário completo e baseline.

**Como faz:** Compara a listagem completa contra seu `Set` e contra o piso E2E do baseline.

**Por que foi implementado dessa forma:** O baseline impede que uma redução do inventário torne um plano menor aparentemente válido.

**Por que uma implementação ingênua seria pior:** Sem piso/unicidade, remover testes poderia manter o plano internamente coerente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 111

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de validação individual e união dos shards.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 112

**Fonte:** `const union = new Map();`

**O que faz:** Cria mapa `chave -> grupo` para a união.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 113

**Fonte:** `let sum = 0;`

**O que faz:** Inicializa a soma observada.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 114

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de validação individual e união dos shards.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 115

**Fonte:** `for (const group of plan.groups) {`

**O que faz:** Percorre os grupos para validar cada shard.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 116

**Fonte:** `  const keys = collectSpecs(runList(['--grep', group.tag]));`

**O que faz:** Descobre testes filtrando pela tag do grupo.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 117

**Fonte:** `  if (keys.length !== group.expectedTests) {`

**O que faz:** Compara contagem real com `expectedTests`.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 118

**Fonte:** `    fail(`

**O que faz:** Completa a fase de validação individual e união dos shards com a expressão `fail(`.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 119

**Fonte:** `      'grupo ' + group.id + ' coletou ' + keys.length +`

**O que faz:** Inclui no erro ID e quantidade realmente descoberta.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 120

**Fonte:** `      ' teste(s); esperado=' + group.expectedTests`

**O que faz:** Inclui a quantidade esperada.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 121

**Fonte:** `    );`

**O que faz:** Completa a fase de validação individual e união dos shards com a expressão `);`.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 122

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática ativa na fase de validação individual e união dos shards.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 123

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de validação individual e união dos shards.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 124

**Fonte:** `  console.log(`

**O que faz:** Inicia log informativo do grupo validado.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 125

**Fonte:** `    '[E2E/PLAN] ' + group.id +`

**O que faz:** Completa a fase de validação individual e união dos shards com a expressão `'[E2E/PLAN] ' + group.id +`.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 126

**Fonte:** `    ': ' + keys.length + ' teste(s), workers=' + group.workers +`

**O que faz:** Registra contagem e workers.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 127

**Fonte:** `    ', ~' + group.estimatedSeconds + 's'`

**O que faz:** Registra `estimatedSeconds`, sem usá-lo como gate.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 128

**Fonte:** `  );`

**O que faz:** Completa a fase de validação individual e união dos shards com a expressão `);`.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 129

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de validação individual e união dos shards.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 130

**Fonte:** `  sum += keys.length;`

**O que faz:** Soma a quantidade real do grupo.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 131

**Fonte:** `  for (const key of keys) {`

**O que faz:** Percorre cada chave do grupo.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 132

**Fonte:** `    if (!fullSet.has(key)) fail('grupo ' + group.id + ' contém teste fora do inventário: ' + key);`

**O que faz:** Rejeita chave que não pertença ao inventário completo.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 133

**Fonte:** `    if (union.has(key)) {`

**O que faz:** Detecta chave já atribuída a outro grupo.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 134

**Fonte:** `      fail('teste duplicado entre grupos ' + union.get(key) + ' e ' + group.id + ': ' + key);`

**O que faz:** Falha informando sobreposição e os grupos envolvidos.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige este marcador; isso não testa o branch negativo em runtime.

### Linha/posição 135

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática ativa na fase de validação individual e união dos shards.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 136

**Fonte:** `    union.set(key, group.id);`

**O que faz:** Registra a chave como pertencente ao grupo.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 137

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática ativa na fase de validação individual e união dos shards.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 138

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de validação individual e união dos shards.

**Como faz:** Executa uma listagem `--grep` por tag, confere contagem e constrói uma união disjunta em `Map`.

**Por que foi implementado dessa forma:** Somente a seleção real por tag prova que os shards correspondem ao que o Playwright descobre.

**Por que uma implementação ingênua seria pior:** Somar `expectedTests` declarados não prova o efeito real de `--grep`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 139

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de detecção de omissões.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 140

**Fonte:** `const missing = full.filter(key => !union.has(key));`

**O que faz:** Calcula testes completos ainda ausentes da união.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 141

**Fonte:** `if (missing.length) {`

**O que faz:** Entra no branch de omissão.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 142

**Fonte:** `  console.error('[E2E/PLAN] Testes sem grupo:');`

**O que faz:** Imprime cabeçalho para testes sem grupo.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige este marcador; isso não testa o branch negativo em runtime.

### Linha/posição 143

**Fonte:** `  for (const key of missing) console.error('- ' + key);`

**O que faz:** Imprime cada chave omitida.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 144

**Fonte:** `  fail(missing.length + ' teste(s) do inventário não pertencem a nenhum grupo');`

**O que faz:** Falha com a quantidade de omissões.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 145

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de detecção de omissões.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 146

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de cardinalidade final.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 147

**Fonte:** `if (sum !== full.length || union.size !== full.length) {`

**O que faz:** Compara soma, união e inventário completo.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 148

**Fonte:** `  fail('união dos grupos=' + union.size + ', soma=' + sum + ', inventário=' + full.length);`

**O que faz:** Falha em qualquer inconsistência residual de cardinalidade.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum self-test focal foi localizado para forçar este caminho negativo.

### Linha/posição 149

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática ativa na fase de cardinalidade final.

**Como faz:** Compara o inventário completo com a união e com a soma observada.

**Por que foi implementado dessa forma:** Partição correta exige completude e disjunção; somas isoladas não bastam.

**Por que uma implementação ingênua seria pior:** Uma duplicação pode mascarar uma omissão se apenas a soma for conferida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 150

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente a fase de aprovação.

**Como faz:** Não gera nó executável; apenas separa blocos no fonte.

**Por que foi implementado dessa forma:** Melhora auditabilidade sem afetar runtime.

**Por que uma implementação ingênua seria pior:** Remover separação não quebra execução, mas dificulta revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 151

**Fonte:** `console.log(`

**O que faz:** Inicia a mensagem final de aprovação.

**Como faz:** Só executa após todos os gates anteriores permanecerem satisfeitos.

**Por que foi implementado dessa forma:** O log final comunica cardinalidade e a invariável que acabou de ser validada.

**Por que uma implementação ingênua seria pior:** Uma aprovação genérica esconderia o tamanho real do inventário e a propriedade comprovada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 152

**Fonte:** `  '[E2E/PLAN] Plano válido: ' + plan.groups.length +`

**O que faz:** Inclui a quantidade de grupos.

**Como faz:** Só executa após todos os gates anteriores permanecerem satisfeitos.

**Por que foi implementado dessa forma:** O log final comunica cardinalidade e a invariável que acabou de ser validada.

**Por que uma implementação ingênua seria pior:** Uma aprovação genérica esconderia o tamanho real do inventário e a propriedade comprovada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 153

**Fonte:** `  ' grupos, ' + full.length +`

**O que faz:** Inclui a quantidade total de testes.

**Como faz:** Só executa após todos os gates anteriores permanecerem satisfeitos.

**Por que foi implementado dessa forma:** O log final comunica cardinalidade e a invariável que acabou de ser validada.

**Por que uma implementação ingênua seria pior:** Uma aprovação genérica esconderia o tamanho real do inventário e a propriedade comprovada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 154

**Fonte:** `  ' testes, cobertura exata sem omissões ou duplicatas.'`

**O que faz:** Declara a propriedade verificada: cobertura exata sem omissões ou duplicatas.

**Como faz:** Só executa após todos os gates anteriores permanecerem satisfeitos.

**Por que foi implementado dessa forma:** O log final comunica cardinalidade e a invariável que acabou de ser validada.

**Por que uma implementação ingênua seria pior:** Uma aprovação genérica esconderia o tamanho real do inventário e a propriedade comprovada.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige este marcador; isso não testa o branch negativo em runtime.

### Linha/posição 155

**Fonte:** `);`

**O que faz:** Completa a fase de aprovação com a expressão `);`.

**Como faz:** Só executa após todos os gates anteriores permanecerem satisfeitos.

**Por que foi implementado dessa forma:** O log final comunica cardinalidade e a invariável que acabou de ser validada.

**Por que uma implementação ingênua seria pior:** Uma aprovação genérica esconderia o tamanho real do inventário e a propriedade comprovada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando `npm run test:e2e:plan` percorre o caminho verde; sem assertion focal desta linha.

### Linha/posição 156

**Fonte:** `␤ [newline final]`

**O que faz:** Representa o newline final do arquivo.

**Como faz:** É o `\n` terminal após a última linha textual.

**Por que foi implementado dessa forma:** Preserva formato textual consistente para diff e tooling.

**Por que uma implementação ingênua seria pior:** Sem newline o runtime seria igual, mas diffs e convenções ficam piores.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

## 10. Verificação final

- SHA reconfirmado: **ea1149ced74425ad27ede90ec409c2548cb5b65d**.
- Fonte integral reproduzida: **sim**.
- Cobertura documental: **156/156 posições** (155 linhas + newline final).
- Dependências/consumidores cruzados: **sim**.
- Evidência classificada sem promover execução indireta a prova direta: **sim**.
- Lacunas externas registradas sem alterar código/testes/configuração: **sim**.

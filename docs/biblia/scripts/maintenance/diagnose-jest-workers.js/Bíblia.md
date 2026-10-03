# Bíblia técnica — diagnose-jest-workers.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 3 segundo o state individual  
> **SHA auditado:** `87d25d2b61cc1068059a39a24d3e4d86be78c335`  
> **Agente responsável:** AGENTE 3  
> **Arquivo:** `scripts/maintenance/diagnose-jest-workers.js`  
> **Tipo:** runner Node de diagnóstico matricial de workers Jest  
> **Linhas textuais:** **200**  
> **Posições documentais:** **201**, contando o newline terminal  
> **PR:** #66  
> **Branch:** `docs/project-bible`

> Observação de coordenação: neste protocolo multiagente o AGENTE 3 possui escrita somente sobre esta Bíblia, sua reserva e `.state/077.json`. `STATUS.md`, `CHECKLIST.md` e `AUDITORIA.md` permanecem read-only para este agente.

## 1. Papel arquitetural

`scripts/maintenance/diagnose-jest-workers.js` é um runner de diagnóstico que executa Jest repetidamente sob diferentes níveis de paralelismo e diferentes combinações de projetos. Seu objetivo é distinguir três resultados operacionais:

- **CLEAN**: o subprocesso Jest terminou com status 0 e não exibiu o warning canônico de worker forçado;
- **LEAK**: a saída combinada contém `FORCED_WORKER_EXIT`;
- **FAIL**: o comando terminou com status diferente de 0 sem o warning de worker forçado.

O arquivo não corrige open handles, não mata workers manualmente e não usa `--forceExit`. Ele coleta evidência diagnóstica, persiste logs/JSON e sinaliza problema ao caller por `process.exitCode = 2`.

Há dois modos de uso:

1. **uma case específica**, via `--case=<nome>` ou `MT_JEST_DIAG_CASE`;
2. **todas as cases**, quando nenhum filtro é fornecido.

Sem filtro, as 18 cases são executadas sequencialmente pelo processo pai.

## 2. Registro de cases

O array `cases` possui 18 entradas:

### Execução completa por quantidade de workers

- `full-default` — concorrência padrão do Jest;
- `full-w1` — `--maxWorkers=1`;
- `full-w2` — `--maxWorkers=2`;
- `full-w3` — `--maxWorkers=3`;
- `full-w4` — `--maxWorkers=4`.

### Projetos individuais

- `project-background`;
- `project-gtc`;
- `project-content-scripts`;
- `project-popup`;
- `project-reader`;
- `project-manifest`;
- `project-shared-ui`;
- `project-integration`.

Cada uma usa `--selectProjects <nome>`.

### Combinações

- `combo-content-integration`;
- `combo-jsdom-projects`;
- `combo-background-content`;
- `combo-background-integration`;
- `combo-background-jsdom`.

Essas combinações procuram leaks que só apareçam quando projetos diferentes coexistem no mesmo processo Jest/worker pool.

## 3. Entradas e precedência do filtro

`parseCaseFilter()` procura primeiro um argumento CLI começando por `--case=`. Quando existe, o valor da CLI prevalece sobre `process.env.MT_JEST_DIAG_CASE`.

Sem CLI, usa `MT_JEST_DIAG_CASE`. Sem nenhum valor, retorna `null`, selecionando todas as 18 cases.

Se o nome solicitado não existir no registro:

- imprime o nome inválido e a lista completa de cases válidas;
- encerra imediatamente com `process.exit(64)`;
- nenhuma case é executada;
- o aggregate final não é gravado porque o exit ocorre antes do fluxo principal.

O parser aceita `--case=` vazio como string vazia; esse valor não corresponde a nenhuma case e cai no erro 64.

## 4. Execução de uma case

`runCase(spec)` mede a duração usando `Date.now()` e chama:

`spawnSync(process.execPath, [jestBin, '--config', 'jest.config.js', '--ci', ...spec.args], ...)`

Características concretas:

- usa o mesmo executável Node do processo pai (`process.execPath`);
- chama diretamente `node_modules/jest/bin/jest.js`;
- fixa `--config jest.config.js`;
- sempre passa `--ci`;
- acrescenta os argumentos específicos da case;
- executa com `cwd = repoRoot`;
- captura stdout/stderr em UTF-8;
- permite buffer de até **64 MiB**;
- herda todo `process.env`;
- sobrescreve/adiciona `MT_JEST_DIAG_CASE=spec.name`;
- **não define timeout** no `spawnSync`.

Depois do subprocesso:

- stdout/stderr nulos viram string vazia;
- o detector recebe `stdout + "\n" + stderr`;
- `forcedWorkerExit` é decidido pelo helper compartilhado `hasForcedWorkerExit`;
- a duração inclui apenas o intervalo em torno de `spawnSync`, antes da gravação dos artifacts.

## 5. Logs e JSON por case

Para cada case executada, o script cria `.ci-results/jest-worker-diagnostic/` e grava:

### `<case>.log`

Cabeçalho:

- nome da case;
- versão do Node;
- PID do processo pai;
- quantidade de CPUs;
- argumentos Jest adicionais;
- status;
- signal;
- flag `forcedWorkerExit`;
- duração.

Em seguida preserva stdout e stderr completos, separados por headings.

### `<case>.json`

O objeto `result` contém:

- `name`;
- `args`;
- `node`;
- `platform`;
- `arch`;
- `cpuCount`;
- `status`;
- `signal`;
- `forcedWorkerExit`;
- `durationMs`;
- `error`, usando `proc.error.message` quando houver;
- `interestingLines`;
- path relativo normalizado de `logFile`.

`pickLines()` extrai somente linhas que contenham:

- o warning canônico de worker forçado; ou
- resumos Jest como `Test Suites:`, `Tests:`, `Time:`, `Ran all test suites`, `No tests found`, `FAIL ` ou `PASS `.

Ele mantém no máximo as últimas 80 linhas interessantes no JSON. O console mostra apenas as últimas 20 dessas linhas.

## 6. Aggregate global

Após executar as cases selecionadas, o script grava um aggregate em `.ci-results/`.

Nome:

- com filtro: `jest-worker-diagnostic-<case>.json`;
- sem filtro: `jest-worker-diagnostic.json`.

Campos:

- timestamp `generatedAt`;
- Node;
- plataforma;
- arquitetura;
- CPU count;
- `caseFilter`;
- array `cases` com todos os resultados executados.

O caminho do aggregate é explicitamente protegido por `scripts/validation/verify-ci-contract.js`, que exige `path.join(repoRoot, '.ci-results', aggregateName)` e rejeita reintrodução do antigo `tests/.ci-results`.

## 7. Semântica de resultado e exit code

Depois do aggregate:

- `leaks` contém resultados com `forcedWorkerExit === true`;
- `commandFailures` contém status diferente de 0 **somente quando não houve warning de worker forçado**.

Isso torna as categorias mutuamente exclusivas no resumo:

- warning presente → tratado como LEAK, mesmo que o processo também tenha status não zero;
- warning ausente + status 0 → CLEAN;
- warning ausente + status diferente de 0 (incluindo `null`) → FAIL.

Se houver qualquer LEAK, o script imprime as cases correspondentes em stderr.

Se houver qualquer FAIL, imprime as cases correspondentes em stderr.

Se houver ao menos um LEAK ou FAIL, define `process.exitCode = 2`. O arquivo não chama `process.exit(2)` nesse caminho; permite que o event loop finalize normalmente após as gravações síncronas.

## 8. Dependências diretas

- Node `fs`: diretórios, logs e JSON;
- Node `os`: CPU count;
- Node `path`: paths portáveis;
- Node `child_process.spawnSync`: execução do Jest;
- `scripts/ci/jest-worker-warning.js`: constante `FORCED_WORKER_EXIT` e detector;
- `jest.config.js`;
- `node_modules/jest/bin/jest.js`.

## 9. Consumers e integrações reais verificadas

### `package.json`

Existe o script:

`"test:diagnose-workers": "node scripts/maintenance/diagnose-jest-workers.js"`

### `.github/workflows/ci.yml`

Dois jobs chamam esse comando:

- `jest-worker-diagnostic`: matriz com as 18 cases;
- `focused-project-leak-diagnostic`: subconjunto de 10 cases de projeto/combinação.

Ambos executam somente em `workflow_dispatch` ou em push da `main`.

Os passos de diagnóstico não usam `continue-on-error`; portanto exit 2/64 do comando torna o passo bloqueante. Os passos seguintes de artifact usam `if: always()` e `continue-on-error: true`, preservando tentativa de publicação após falha do diagnóstico.

### `scripts/validation/verify-ci-contract.js`

O gate estático:

- lê este arquivo;
- exige que o aggregate fique em `/.ci-results`;
- rejeita `tests/.ci-results`;
- exige os jobs diagnósticos;
- exige as condições `workflow_dispatch`, push e `refs/heads/main`;
- exige comando `npm run test:diagnose-workers`/diagnóstico correspondente;
- rejeita `continue-on-error: true` no job/passo diagnóstico.

Ele **não** prova a execução interna de `runCase`, a escrita real dos artifacts, o parser, as 18 definições ou os códigos de saída.

## 10. Evidência automatizada examinada

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| detector reconhece o warning canônico | `verify-jest-worker-warning-selftest.js` chama `hasForcedWorkerExit` com warning, saída limpa e FAIL comum | ✅ PROVADO DIRETAMENTE — **do helper**, não deste runner |
| aggregate deve ficar em `/.ci-results` | `verify-ci-contract.js` procura exatamente o trecho de path | 🟦 GATE ESTÁTICO ESPECÍFICO |
| não reintroduzir `tests/.ci-results` | `verify-ci-contract.js` rejeita marcador correspondente | 🟦 GATE ESTÁTICO ESPECÍFICO |
| jobs diagnósticos existem e são bloqueantes | `verify-ci-contract.js` inspeciona workflow, condições e `continue-on-error` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workflow chama `test:diagnose-workers` | workflow + gate estático exigem o comando | 🟦 GATE ESTÁTICO ESPECÍFICO |
| cases do workflow correspondem exatamente às 18 cases do script | não há comparação estrutural localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| precedência CLI sobre env | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| case inválida termina 64 | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `runCase` monta argumentos/cwd/env corretamente | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| log preserva stdout/stderr e metadados | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| JSON por case possui shape/documentação acima | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `pickLines` filtra e limita 80/20 | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| LEAK/FAIL/CLEAN e exit 2 | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| execução de todas as 18 cases sem filtro | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ausência de hang | não há timeout local | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

Não foi promovida simples ocorrência textual a prova comportamental.

## 11. Análise crítica e riscos

1. **Sem self-test focal do runner.** O helper de warning é testado, mas parser, spawn, arquivos, aggregate e exit code não são.
2. **`spawnSync` sem timeout.** Um Jest que não termina pode bloquear a case indefinidamente até algum limite externo do runner/CI.
3. **Registro duplicado entre script e workflow.** As 18 cases vivem no JS e também na matriz YAML. `verify-ci-contract.js` não compara os nomes de ambos.
4. **Drift pode ter dois formatos.** Uma case adicionada ao script pode nunca rodar em CI; uma case digitada no workflow mas ausente do script encerra 64.
5. **Execução local sem filtro é pesada.** Todas as 18 cases rodam sequencialmente; algumas executam o corpus inteiro ou grandes combinações.
6. **Buffer alto, mas finito.** 64 MiB reduz ENOBUFS, porém saída maior pode produzir `proc.error` e status possivelmente nulo; isso cai em FAIL, o que é conservador.
7. **Logs persistem saída integral.** Qualquer segredo ou dado sensível impresso por testes pode parar nos artifacts.
8. **Diretório não é limpo no início.** Arquivos de cases com nomes fixos são sobrescritos quando a mesma case roda novamente, mas artifacts antigos de cases não executadas podem permanecer localmente no diretório.
9. **Aggregate filtrado evita ambiguidade na CI.** Cada case da matriz grava `jest-worker-diagnostic-<case>.json`, reduzindo colisão entre jobs individuais.
10. **`generatedAt` não prova momento de início.** Ele é criado depois de todas as cases; em execução completa representa o momento pós-diagnóstico.
11. **LEAK prevalece sobre FAIL.** Se warning e erro funcional coexistirem, o resumo classifica como leak e não duplica em `commandFailures`.
12. **O detector procura stdout e stderr.** Apesar do nome do parâmetro do helper ser `stderr`, este runner passa saída combinada.
13. **Case name não é entrada arbitrária em paths após validação.** Só specs do array chegam a `runCase`; filtro inválido sai antes.
14. **Erros de filesystem não são tratados.** Falha em `mkdirSync`/`writeFileSync` lança e encerra o processo sem aggregate completo.
15. **CPU count é recalculado.** `os.cpus().length` é usado no log por case e novamente no aggregate; normalmente igual, mas não há snapshot único compartilhado.
16. **Nenhum `--forceExit`.** O diagnóstico preserva justamente o comportamento de worker que tenta observar.

## 12. Segurança, privacidade e trust boundaries

O script não recebe URLs, código externo ou paths arbitrários do usuário para execução. A seleção de case é validada contra uma allowlist estática.

O principal boundary é o ambiente e a saída dos testes:

- todo `process.env` é herdado pelo Jest;
- stdout/stderr completos são persistidos;
- artifacts de CI podem expor qualquer valor que uma suite imprima;
- `MT_JEST_DIAG_CASE` é injetada nos testes e pode, em tese, alterar comportamento se alguma suite passar a consultá-la.

Assim, o runner deve ser tratado como infraestrutura interna de CI, não como interface segura para dados secretos impressos por testes.

## 13. Casos-limite importantes

- nenhum filtro → 18 execuções sequenciais;
- `--case=full-w1` → somente uma;
- CLI e env diferentes → CLI vence;
- `--case=` → erro 64;
- case inexistente → erro 64;
- Jest status 0 sem warning → CLEAN;
- Jest status 0 com warning → LEAK e exit 2;
- Jest status não zero sem warning → FAIL e exit 2;
- Jest status não zero com warning → LEAK e exit 2;
- spawn com `proc.error`/`status=null` sem warning → FAIL;
- stdout ausente/stderr ausente → string vazia;
- warning no stdout → ainda detectado porque saídas são combinadas;
- mais de 80 linhas interessantes → JSON mantém últimas 80;
- mais de 20 linhas interessantes → console mostra últimas 20;
- saída total acima de 64 MiB → risco de `maxBuffer`;
- subprocesso que nunca termina → sem timeout local;
- filesystem read-only/sem espaço → exceção síncrona ao gravar artifacts;
- repetição da mesma case → sobrescreve `<case>.log/.json`;
- duas instâncias locais simultâneas da mesma case → escrevem os mesmos paths, sem locking.

## 14. Invariantes documentais/operacionais

1. O SHA desta Bíblia é válido apenas para `87d25d2b61cc1068059a39a24d3e4d86be78c335`.
2. O registro atual contém exatamente 18 cases.
3. Toda case executa Jest com `--config jest.config.js --ci`.
4. O worker count somente é alterado nas cases `full-w1..w4`.
5. O processo pai não deve adicionar `--forceExit`.
6. O sinal canônico de leak vem do helper compartilhado.
7. Cada case deve gravar log e JSON antes da classificação final, se filesystem permitir.
8. O aggregate deve permanecer em `.ci-results/`, não `tests/.ci-results`.
9. Com filtro, o nome do aggregate incorpora exatamente a case validada.
10. Uma falha comum sem warning deve permanecer FAIL, não CLEAN.
11. Um warning canônico deve permanecer LEAK.
12. LEAK ou FAIL devem produzir exit não zero para callers bloqueantes.
13. O workflow deve continuar publicando artifacts com `always()` após o diagnóstico.
14. Alterar a lista de cases requer revalidar as matrizes de CI.
15. Se houver requisito de término limitado, um timeout precisa existir em camada explícita; atualmente não existe no subprocesso.
16. A saída integral dos testes deve ser considerada potencialmente sensível.
17. O runner não possui exclusão mútua de artifacts para execuções simultâneas locais.
18. Mudança na mensagem canônica do Jest exige revalidar `jest-worker-warning.js` e seu self-test.

## 15. Solicitações ao auditor

As solicitações abaixo são persistidas no state #077; não foram resolvidas modificando arquivos externos.

### 077-001 — TEST_REQUIRED — OPEN

**Encontrado:** não existe self-test focal de `diagnose-jest-workers.js`.

**Evidência atual:** helper de warning possui teste direto e o CI Contract possui verificações estáticas de path/job.

**Evidência ausente:** parser/filtro, montagem de spawn, artifacts por case, aggregate, truncamento 80/20, classificação LEAK/FAIL/CLEAN e exit codes.

**Ação esperada:** criar teste isolado que execute a implementação real com child process controlado/seam apropriado, sem copiar a lógica.

**Risco:** regressões no runner podem passar pelos gates estáticos existentes.

### 077-002 — CI_CONTRACT_REVIEW — OPEN

**Encontrado:** os nomes das cases são duplicados no JS e nas matrizes do workflow, mas o gate atual não prova igualdade exata.

**Evidência atual:** workflow contém listas explícitas e `verify-ci-contract.js` exige os jobs/comandos, não o conjunto de cases.

**Evidência ausente:** assertion que detecte case ausente, extra ou typo entre script e workflow.

**Ação esperada:** adicionar verificação estrutural ou fonte única de dados para a matriz.

**Risco:** cobertura diagnóstica pode encolher silenciosamente ou um job pode falhar com case desconhecida.

### 077-003 — TIMEOUT_POLICY_REVIEW — OPEN

**Encontrado:** `spawnSync` não define `timeout`.

**Evidência atual:** opções da chamada incluem cwd, encoding, maxBuffer e env, mas não timeout; os jobs diagnósticos não têm proteção local neste script.

**Evidência ausente:** teste/política de subprocesso Jest travado.

**Ação esperada:** decidir se o limite deve existir no spawn, no job ou ser conscientemente delegado ao ambiente externo; testar a política escolhida.

**Risco:** open handle severo pode transformar diagnóstico em execução muito longa sem summary conclusivo.

## 16. Mapa de cobertura do fonte

Cada posição do arquivo está coberta abaixo. Linhas em branco são incluídas no range imediatamente adjacente e descritas como separadores estruturais.

| Linhas/posição | Unidade | Papel específico |
|---|---|---|
| 1 | modo estrito | habilita `'use strict'` no módulo CommonJS |
| 2 | separador | separa diretiva dos imports |
| 3–7 | dependências | carrega fs/os/path/spawnSync e o detector compartilhado |
| 8 | separador | separa imports das constantes de path |
| 9–11 | paths | calcula raiz, binário Jest e diretório de saída |
| 12 | separador | inicia registro de cases |
| 13–18 | cases full | define execução completa default e workers 1–4 |
| 19 | separador interno | separa full de projetos individuais |
| 20–27 | cases de projeto | define oito `--selectProjects` individuais |
| 28 | separador interno | separa projetos das combinações |
| 29–32 | combo content+integration | combinação de dois projetos |
| 33–36 | combo jsdom | combinação ampla de projetos jsdom |
| 37–40 | combo background+content | combinação background/content |
| 41–44 | combo background+integration | combinação background/integration |
| 45–49 | combo background+jsdom | combinação ampla com background e fecha array |
| 50 | separador | antecede parser |
| 51–53 | parseCaseFilter entrada | lê CLI e fallback de env |
| 54 | ausência de filtro | retorna null para executar todas |
| 55–61 | validação de filtro | verifica allowlist, imprime erro e sai 64 |
| 62–63 | retorno parser | retorna nome validado e fecha função |
| 64 | separador | antecede filtro de linhas |
| 65–73 | `pickLines` | normaliza texto, filtra sinais Jest/warning e limita 80 |
| 74 | separador | antecede execução de case |
| 75–76 | início `runCase` | abre função e registra início |
| 77–83 | comando child | monta Node + Jest + config + ci + args |
| 84–91 | opções spawn | define cwd/encoding/buffer/env e executa sincronamente |
| 92 | separador | separa spawn da coleta |
| 93–97 | coleta | normaliza streams, combina, detecta warning e calcula duração |
| 98 | separador | antecede artifacts |
| 99–100 | path de log | cria diretório e nome da case |
| 101–121 | log textual | grava metadados, stdout e stderr completos |
| 122 | separador | antecede objeto normalizado |
| 123–137 | objeto result | materializa metadados, status, error, linhas interessantes e path |
| 138 | separador | antecede JSON por case |
| 139–140 | JSON por case | grava `<case>.json` formatado |
| 141 | separador | antecede resumo de console |
| 142 | marker | calcula LEAK/CLEAN/FAIL |
| 143–149 | linha de status | imprime resumo estruturado da case |
| 150–152 | detalhes console | imprime últimas 20 linhas interessantes |
| 153 | separador | antecede retorno |
| 154–155 | retorno `runCase` | retorna result e fecha função |
| 156 | separador | antecede fluxo principal |
| 157 | filtro | executa parser |
| 158 | seleção | escolhe uma case ou todas |
| 159 | execução | mapeia sequencialmente `runCase` |
| 160 | separador | antecede aggregate |
| 161–169 | objeto aggregate | consolida timestamp, ambiente, filtro e cases |
| 170 | separador | antecede persistência global |
| 171 | diretório global | garante `.ci-results` |
| 172–174 | nome aggregate | escolhe filename filtrado ou global |
| 175–178 | escrita aggregate | grava JSON final formatado |
| 179 | separador | antecede classificação coletiva |
| 180 | leaks | seleciona cases com warning |
| 181 | commandFailures | seleciona status não zero sem warning |
| 182 | separador | antecede mensagens |
| 183–188 | resumo de leaks | imprime nomes das cases com warning |
| 189–194 | resumo de failures | imprime nomes das cases com falha própria |
| 195 | separador | antecede política de saída |
| 196–197 | comentário de contrato | documenta que caller decide bloqueio e artifacts usam always |
| 198–200 | exit code | define 2 quando houver leak ou failure |
| 201 | newline terminal | posição documental correspondente ao LF final do arquivo |

## 17. Fonte integral auditada

```javascript
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { FORCED_WORKER_EXIT, hasForcedWorkerExit } = require('../ci/jest-worker-warning');

const repoRoot = path.resolve(__dirname, '../..');
const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const outDir = path.join(repoRoot, '.ci-results', 'jest-worker-diagnostic');

const cases = [
  { name: 'full-default', args: [] },
  { name: 'full-w1', args: ['--maxWorkers=1'] },
  { name: 'full-w2', args: ['--maxWorkers=2'] },
  { name: 'full-w3', args: ['--maxWorkers=3'] },
  { name: 'full-w4', args: ['--maxWorkers=4'] },

  { name: 'project-background', args: ['--selectProjects', 'background'] },
  { name: 'project-gtc', args: ['--selectProjects', 'gtc'] },
  { name: 'project-content-scripts', args: ['--selectProjects', 'content-scripts'] },
  { name: 'project-popup', args: ['--selectProjects', 'popup'] },
  { name: 'project-reader', args: ['--selectProjects', 'reader'] },
  { name: 'project-manifest', args: ['--selectProjects', 'manifest'] },
  { name: 'project-shared-ui', args: ['--selectProjects', 'shared-ui'] },
  { name: 'project-integration', args: ['--selectProjects', 'integration'] },

  {
    name: 'combo-content-integration',
    args: ['--selectProjects', 'content-scripts', 'integration'],
  },
  {
    name: 'combo-jsdom-projects',
    args: ['--selectProjects', 'content-scripts', 'popup', 'reader', 'shared-ui', 'integration'],
  },
  {
    name: 'combo-background-content',
    args: ['--selectProjects', 'background', 'content-scripts'],
  },
  {
    name: 'combo-background-integration',
    args: ['--selectProjects', 'background', 'integration'],
  },
  {
    name: 'combo-background-jsdom',
    args: ['--selectProjects', 'background', 'content-scripts', 'popup', 'reader', 'shared-ui', 'integration'],
  },
];

function parseCaseFilter() {
  const cliArg = process.argv.find(arg => arg.startsWith('--case='));
  const requested = cliArg ? cliArg.slice('--case='.length) : process.env.MT_JEST_DIAG_CASE;
  if (!requested) return null;
  if (!cases.some(spec => spec.name === requested)) {
    console.error(
      'Caso de diagnóstico desconhecido: ' + requested + '\nCasos válidos: ' +
      cases.map(spec => spec.name).join(', ')
    );
    process.exit(64);
  }
  return requested;
}

function pickLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) =>
      line.includes(FORCED_WORKER_EXIT) ||
      /Test Suites:|Tests:|Time:|Ran all test suites|No tests found|FAIL |PASS /.test(line)
    )
    .slice(-80);
}

function runCase(spec) {
  const startedAt = Date.now();
  const proc = spawnSync(process.execPath, [
    jestBin,
    '--config',
    'jest.config.js',
    '--ci',
    ...spec.args,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      MT_JEST_DIAG_CASE: spec.name,
    },
  });

  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';
  const combined = stdout + '\n' + stderr;
  const forcedWorkerExit = hasForcedWorkerExit(combined);
  const durationMs = Date.now() - startedAt;

  fs.mkdirSync(outDir, { recursive: true });
  const logFile = path.join(outDir, spec.name + '.log');
  fs.writeFileSync(
    logFile,
    [
      '# case=' + spec.name,
      '# node=' + process.version,
      '# pid=' + process.pid,
      '# cpuCount=' + os.cpus().length,
      '# args=' + JSON.stringify(spec.args),
      '# status=' + String(proc.status),
      '# signal=' + String(proc.signal || ''),
      '# forcedWorkerExit=' + String(forcedWorkerExit),
      '# durationMs=' + String(durationMs),
      '',
      '===== STDOUT =====',
      stdout,
      '',
      '===== STDERR =====',
      stderr,
      '',
    ].join('\n')
  );

  const result = {
    name: spec.name,
    args: spec.args,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: os.cpus().length,
    status: proc.status,
    signal: proc.signal || null,
    forcedWorkerExit,
    durationMs,
    error: proc.error ? proc.error.message : null,
    interestingLines: pickLines(combined),
    logFile: path.relative(repoRoot, logFile).replace(/\\/g, '/'),
  };

  const summaryFile = path.join(outDir, spec.name + '.json');
  fs.writeFileSync(summaryFile, JSON.stringify(result, null, 2) + '\n');

  const marker = forcedWorkerExit ? 'LEAK' : (proc.status === 0 ? 'CLEAN' : 'FAIL');
  console.log(
    '[jest-worker-diagnostic] ' + marker +
    ' case=' + spec.name +
    ' status=' + String(proc.status) +
    ' forcedWorkerExit=' + String(forcedWorkerExit) +
    ' durationMs=' + String(durationMs)
  );
  for (const line of result.interestingLines.slice(-20)) {
    console.log('  ' + line);
  }

  return result;
}

const filter = parseCaseFilter();
const selectedCases = filter ? cases.filter(spec => spec.name === filter) : cases;
const results = selectedCases.map(runCase);

const aggregate = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpuCount: os.cpus().length,
  caseFilter: filter,
  cases: results,
};

fs.mkdirSync(path.join(repoRoot, '.ci-results'), { recursive: true });
const aggregateName = filter
  ? 'jest-worker-diagnostic-' + filter + '.json'
  : 'jest-worker-diagnostic.json';
fs.writeFileSync(
  path.join(repoRoot, '.ci-results', aggregateName),
  JSON.stringify(aggregate, null, 2) + '\n'
);

const leaks = results.filter(result => result.forcedWorkerExit);
const commandFailures = results.filter(result => result.status !== 0 && !result.forcedWorkerExit);

if (leaks.length) {
  console.error(
    '[jest-worker-diagnostic] warning reproduzido em: ' +
    leaks.map(item => item.name).join(', ')
  );
}
if (commandFailures.length) {
  console.error(
    '[jest-worker-diagnostic] comandos com falha própria: ' +
    commandFailures.map(item => item.name).join(', ')
  );
}

// O caller decide se isto bloqueia a pipeline. Nos jobs de diagnóstico da CI,
// uma reprodução/falha é bloqueante; os artefatos são publicados com always().
if (leaks.length || commandFailures.length) {
  process.exitCode = 2;
}
```

## 18. Conclusão

Para o SHA auditado, o arquivo é um diagnóstico síncrono, determinístico quanto ao registro de cases e conservador quanto a falhas: warning ou status não zero tornam o processo não verde. O principal limite de confiabilidade não é a lógica observada, mas a falta de um self-test focal que execute o runner real.

A documentação não afirma que os paths sem teste estão provados. Os três gaps externos relevantes foram registrados em `.state/077.json` para auditoria separada.

# Bíblia técnica — scripts/ci/run-e2e-group.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `e23c7aaa17123e63904799c1b366c48e344ed82a`  
> **Agente responsável pela auditoria:** AGENTE 2  
> **Tipo:** runner/orquestrador Node.js de grupos E2E Playwright  
> **Linhas textuais:** **52**  
> **Posições documentais:** **53**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/ci/run-e2e-group.js` é a ponte entre a matrix E2E do GitHub Actions, o plano canônico `scripts/ci/data/e2e-shard-plan.json` e o Playwright. O workflow informa somente o **ID lógico do grupo**; este runner resolve a tag e workers no plano, inicia Playwright filtrado por `--grep` e propaga o resultado ao job.

O objetivo é evitar que o YAML duplique decisões de balanceamento. O plano atual contém `fifo`, `attachment`, `medium-a`, `medium-b` e `fast`. O verificador `verify-e2e-shard-plan.js` prova separadamente que as tags formam uma partição exata do inventário E2E.

## 2. Chamadores, dependências e consumidores

### Chamadores
- `package.json#test:e2e:group` → `node scripts/ci/run-e2e-group.js`.
- `pretest:e2e:group` prepara fixtures de imagem antes do runner.
- `.github/workflows/ci.yml` executa `npm run test:e2e:group -- "${{ matrix.group }}"` sob Xvfb.

### Dependências
- `scripts/ci/data/e2e-shard-plan.json`.
- `playwright.config.js`.
- `node_modules/playwright/cli.js`.
- APIs Node `child_process`, `fs` e `path`.

### Consumidores do ambiente
- `playwright.config.js` lê `MANGA_E2E_SHARD` e `MANGA_E2E_WORKERS`.
- `MANGA_E2E_GROUP` não teve outro consumidor material localizado além deste fluxo; funciona como identidade/observabilidade do grupo.

## 3. Fluxo concreto

1. resolve a raiz do repo;
2. lê o plano;
3. resolve o CLI Playwright;
4. obtém groupId de argv ou ambiente;
5. rejeita grupo inexistente;
6. rejeita workers inválidos;
7. registra metadados do grupo;
8. executa Playwright com `--grep <tag>`;
9. injeta grupo/shard/workers;
10. herda stdio e usa `shell:false`;
11. falha se spawn não iniciar;
12. propaga o exit code do Playwright.

## 4. Relação com plano/CI

`verify-e2e-shard-plan.js` executa `playwright --list --grep` para cada grupo e exige IDs/tags únicos, workers positivos, contagens exatas, nenhum teste duplicado, nenhum teste sem grupo e união igual ao inventário completo.

`verify-ci-contract.js` protege que:
- CI use `test:e2e:group`;
- workers não fiquem hardcoded no workflow;
- este runner contenha `MANGA_E2E_WORKERS: String(group.workers)`;
- package.json aponte ao runner canônico;
- o plano atual preserve os grupos/contagens/workers esperados.

## 5. Estado, lifecycle e side effects

O runner não mantém estado durável. Lê plano, argv/env e filesystem; cria um único subprocesso Playwright. Seus efeitos são execução dos E2E, geração de outputs/reports pelo Playwright e o código de saída do processo.

Não há Chrome API, storage, MV3 lifecycle, timers ou IPC de extensão neste arquivo. O risco operacional é de orquestração de subprocesso: filtro errado, paralelismo errado, processo que não inicia ou resultado mascarado.

## 6. Segurança e trust boundaries

- groupId vem de argv/env, mas deve casar exatamente com um ID do plano.
- group.tag vem de arquivo versionado e é passado como argumento com `shell:false`.
- workers vêm do plano e são validados como inteiro positivo.
- `process.env` é herdado integralmente; qualquer segredo já presente também chega ao Playwright.
- o caminho do CLI confia na instalação npm/lockfile.
- tag, expectedTests e estimatedSeconds não são validados aqui; a arquitetura confia no gate do plano.

## 7. Análise crítica

### 7.1 Local e CI têm semântica diferente
O runner seta `MANGA_E2E_SHARD=1` e `MANGA_E2E_WORKERS`, mas não seta `CI=1`. Em `playwright.config.js`, workers do plano e blob reporter só são usados quando `CI` é truthy.

Assim, `npm run test:e2e:group -- fast` localmente filtra a tag, mas não necessariamente reproduz workers/reporter do shard real. No GitHub Actions funciona porque o ambiente define CI.

### 7.2 Caminho interno do CLI
O runner depende de `node_modules/playwright/cli.js`, embora a dependência declarada seja `@playwright/test`. Hoje funciona pela árvore instalada, mas é acoplamento ao layout do pacote.

### 7.3 Plano ausente/JSON inválido
Leitura e parse ocorrem sem try/catch. O job falha, mas com stack genérico em vez de diagnóstico `[E2E/GROUP]`.

### 7.4 Validação parcial
O runner só valida grupo e workers. Tag/contagem/estimativa dependem do gate externo. Uma execução manual isolada pode usar plano semanticamente ruim se o gate não foi rodado.

### 7.5 Falta teste focal do runner
Não foi localizada suíte que mocke `spawn` para provar argv, cwd, env, shell, stdio, error e close.

## 8. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| package usa runner canônico | verify-ci-contract.js compara script npm | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI chama grupos explícitos | ci.yml + gate procura test:e2e:group | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workers vêm do plano | gate proíbe hardcode no YAML e exige linha do runner | 🟦 GATE ESTÁTICO ESPECÍFICO |
| tags particionam exatamente o inventário | verify-e2e-shard-plan.js executa Playwright --list --grep | ✅ PROVADO DIRETAMENTE para o plano |
| workers/contagens atuais do plano | verify-ci-contract.js compara mapa esperado | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workers chegam ao config | runner injeta; config lê em CI | 🟨 EXECUTADO INDIRETAMENTE |
| shard ativa blob reporter em CI | config usa isCi && isShardRun | 🟨 EXECUTADO INDIRETAMENTE |
| prioridade argv sobre env | nenhuma assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| grupo inválido → exit 2 | nenhuma execução focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| workers inválidos → exit 2 | branch não exercitado diretamente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| argv/cwd/stdio/shell do spawn | nenhuma suíte mocka spawn | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| spawn error → exit 1 | sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| close propaga exit code | CI depende do resultado | 🟨 EXECUTADO INDIRETAMENTE |
| execução local aplica workers/blob reporter | não, salvo CI truthy | ⚠️ ASSIMETRIA DOCUMENTADA |

## 9. Lacunas de teste

1. Unit test do runner com `spawn` mockado.
2. Prioridade argv[2] sobre `MANGA_E2E_GROUP`.
3. Trim de groupId.
4. Grupo vazio/inexistente → código 2 + lista válida.
5. Workers inválidos → código 2.
6. Conferir argv `test --config ... --grep`.
7. Conferir cwd, stdio e shell:false.
8. Conferir merge de env e sobrescritas MANGA_E2E_*.
9. Simular spawn error → 1.
10. Simular close(0), close(n), close(null).
11. Plano ausente/JSON inválido com diagnóstico claro.
12. Resolução do CLI após npm ci.
13. Teste explícito da diferença local vs CI.
14. Caso se queira equivalência local, teste da estratégia escolhida para forçar modo CI/shard.
15. Tag inválida no plano antes de chegar a --grep.

## 10. Invariantes

1. ID solicitado nunca pode executar grupo diferente do plano.
2. Grupo inexistente não pode cair para suíte completa.
3. Workers devem ser inteiros positivos e vir do plano.
4. Workflow não deve duplicar workers/tags.
5. Runner executa somente a tag do grupo.
6. Partição de tags continua sem omissão/duplicata.
7. Child executa na raiz do repo.
8. shell:false permanece ou recebe proteção equivalente.
9. Falha de spawn falha o job.
10. Exit code Playwright não é mascarado.
11. MANGA_E2E_SHARD=1 chega ao config.
12. Em CI, MANGA_E2E_WORKERS controla workers efetivos.
13. Diferença local vs CI deve ser deliberada/testada.
14. CLI deve existir após instalação canônica.
15. Mudanças no plano passam pelo verificador de cobertura exata.
16. Esta Bíblia só vale enquanto o fonte tiver SHA `e23c7aaa17123e63904799c1b366c48e344ed82a`.

## 11. Fonte integral

~~~javascript
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'e2e-shard-plan.json'), 'utf8'));
const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');
const groupId = String(process.argv[2] || process.env.MANGA_E2E_GROUP || '').trim();
const group = (plan.groups || []).find(item => item.id === groupId);

if (!group) {
  console.error('[E2E/GROUP] Grupo inválido: ' + (groupId || '<vazio>'));
  console.error('[E2E/GROUP] Grupos válidos: ' + (plan.groups || []).map(item => item.id).join(', '));
  process.exit(2);
}

if (!Number.isInteger(group.workers) || group.workers <= 0) {
  console.error('[E2E/GROUP] workers inválido para ' + group.id + ': ' + group.workers);
  process.exit(2);
}

console.log(
  '[E2E/GROUP] ' + group.id +
  ' | tag=' + group.tag +
  ' | expectedTests=' + group.expectedTests +
  ' | workers=' + group.workers +
  ' | estimatedSeconds=' + group.estimatedSeconds
);

const child = spawn(
  process.execPath,
  [playwrightCli, 'test', '--config', path.join(repoRoot, 'playwright.config.js'), '--grep', group.tag],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      MANGA_E2E_GROUP: group.id,
      MANGA_E2E_SHARD: '1',
      MANGA_E2E_WORKERS: String(group.workers),
    },
    stdio: 'inherit',
    shell: false,
  }
);

child.on('error', error => {
  console.error(error);
  process.exit(1);
});
child.on('close', code => process.exit(code == null ? 1 : code));
~~~

## 12. Cobertura documental por linhas

As faixas abaixo são contíguas e cobrem explicitamente as posições 1–53; a posição 53 é o newline final.

### 1. Linhas 1-2 — Strict mode e separação inicial

Fonte auditada:
~~~text
1: 'use strict';
2: ␠ [linha vazia]
~~~

**O que faz:** Ativa strict mode no módulo CommonJS e separa o cabeçalho dos imports.

**Como faz:** O Node avalia o arquivo como CommonJS; a linha vazia é apenas organização editorial.

**Por que foi implementado dessa forma:** Strict mode reduz erros silenciosos em um script de CI que controla subprocessos.

**Por que uma implementação ingênua seria pior:** Um runner permissivo torna falhas de programação menos visíveis; a linha vazia não afeta runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE sempre que o script é carregado pelo npm/CI; não há assertion focal.

### 2. Linhas 3-6 — Dependências padrão

Fonte auditada:
~~~text
3: const { spawn } = require('child_process');
4: const fs = require('fs');
5: const path = require('path');
6: ␠ [linha vazia]
~~~

**O que faz:** Importa spawn, fs e path e separa esse bloco da configuração.

**Como faz:** spawn cria o processo Playwright; fs lê o plano JSON; path monta caminhos portáveis.

**Por que foi implementado dessa forma:** O runner usa APIs Node built-in para orquestração e evita shell para montar o comando.

**Por que uma implementação ingênua seria pior:** Uma string shell seria mais sujeita a quoting/injeção e diferenças Windows/Linux.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no fluxo CI; não há teste unitário que mocke estes imports.

### 3. Linhas 7-12 — Raiz, plano, CLI e seleção de grupo

Fonte auditada:
~~~text
7: const repoRoot = path.resolve(__dirname, '../..');
8: const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'e2e-shard-plan.json'), 'utf8'));
9: const playwrightCli = path.join(repoRoot, 'node_modules', 'playwright', 'cli.js');
10: const groupId = String(process.argv[2] || process.env.MANGA_E2E_GROUP || '').trim();
11: const group = (plan.groups || []).find(item => item.id === groupId);
12: ␠ [linha vazia]
~~~

**O que faz:** Calcula a raiz, carrega e parseia o plano, aponta ao CLI Playwright, resolve groupId por argv ou MANGA_E2E_GROUP e procura o grupo.

**Como faz:** path.resolve sobe dois níveis; JSON.parse é síncrono; argv[2] tem prioridade; trim remove espaços periféricos.

**Por que foi implementado dessa forma:** Centraliza a topologia E2E no plano e permite chamada por argumento ou ambiente.

**Por que uma implementação ingênua seria pior:** Duplicar tags/workers no workflow causaria drift; JSON inválido/ausente gera exceção não tratada.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO protege que package.json use este runner; verify-e2e-shard-plan.js valida o plano separadamente. ⚠️ Sem teste focal da prioridade argv→env.

### 4. Linhas 13-18 — Grupo inexistente

Fonte auditada:
~~~text
13: if (!group) {
14:   console.error('[E2E/GROUP] Grupo inválido: ' + (groupId || '<vazio>'));
15:   console.error('[E2E/GROUP] Grupos válidos: ' + (plan.groups || []).map(item => item.id).join(', '));
16:   process.exit(2);
17: }
18: ␠ [linha vazia]
~~~

**O que faz:** Falha cedo quando groupId não corresponde a nenhum item, imprime valor recebido, IDs válidos e encerra com código 2.

**Como faz:** Usa o resultado de Array.find e deriva a lista diretamente do plano.

**Por que foi implementado dessa forma:** Evita executar Playwright sem filtro válido, o que poderia duplicar toda a suíte em shard incorreto.

**Por que uma implementação ingênua seria pior:** Fallback silencioso para todos os testes desperdiçaria CI e esconderia erro de configuração.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para grupo vazio/inválido e código 2.

### 5. Linhas 19-23 — Validação de workers

Fonte auditada:
~~~text
19: if (!Number.isInteger(group.workers) || group.workers <= 0) {
20:   console.error('[E2E/GROUP] workers inválido para ' + group.id + ': ' + group.workers);
21:   process.exit(2);
22: }
23: ␠ [linha vazia]
~~~

**O que faz:** Exige group.workers inteiro positivo e falha com código 2 se inválido.

**Como faz:** Number.isInteger rejeita strings/decimais/NaN; <=0 rejeita zero/negativos.

**Por que foi implementado dessa forma:** Impede propagar paralelismo inválido ao Playwright.

**Por que uma implementação ingênua seria pior:** Conversão permissiva poderia aceitar configuração não prevista e cair em defaults silenciosos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO/PLANO: verify-e2e-shard-plan.js valida workers e verify-ci-contract.js protege os valores atuais; este branch de erro não é testado diretamente.

### 6. Linhas 24-31 — Log de diagnóstico

Fonte auditada:
~~~text
24: console.log(
25:   '[E2E/GROUP] ' + group.id +
26:   ' | tag=' + group.tag +
27:   ' | expectedTests=' + group.expectedTests +
28:   ' | workers=' + group.workers +
29:   ' | estimatedSeconds=' + group.estimatedSeconds
30: );
31: ␠ [linha vazia]
~~~

**O que faz:** Imprime id, tag, expectedTests, workers e estimatedSeconds antes do spawn.

**Como faz:** Concatena os campos do grupo em uma única linha de log.

**Por que foi implementado dessa forma:** Facilita diagnóstico de balanceamento e confirmação da configuração aplicada.

**Por que uma implementação ingênua seria pior:** Sem log, investigar shard lento/configuração errada exigiria correlacionar vários arquivos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para o log.

### 7. Linhas 32-36 — Spawn e filtro Playwright

Fonte auditada:
~~~text
32: const child = spawn(
33:   process.execPath,
34:   [playwrightCli, 'test', '--config', path.join(repoRoot, 'playwright.config.js'), '--grep', group.tag],
35:   {
36:     cwd: repoRoot,
~~~

**O que faz:** Cria child process com o mesmo Node e executa Playwright test usando playwright.config.js e --grep group.tag.

**Como faz:** spawn recebe process.execPath e array de argumentos; a tag é argumento separado, não texto de shell.

**Por que foi implementado dessa forma:** Usar array de argumentos com shell:false preserva quoting e liga cada job ao grupo lógico do plano.

**Por que uma implementação ingênua seria pior:** Montar string shell aumentaria risco de injeção/escaping; caminho direto node_modules/playwright/cli.js é dependência de layout do pacote.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a partição de tags pelo verify-e2e-shard-plan.js, que executa Playwright --list --grep por grupo; 🟨 o runner em si é executado indiretamente nos shards.

### 8. Linhas 37-42 — Ambiente do shard

Fonte auditada:
~~~text
37:     env: {
38:       ...process.env,
39:       MANGA_E2E_GROUP: group.id,
40:       MANGA_E2E_SHARD: '1',
41:       MANGA_E2E_WORKERS: String(group.workers),
42:     },
~~~

**O que faz:** Herda process.env e sobrescreve MANGA_E2E_GROUP, MANGA_E2E_SHARD=1 e MANGA_E2E_WORKERS com o plano.

**Como faz:** Spread preserva CI e demais variáveis; workers vira string para process.env.

**Por que foi implementado dessa forma:** Separa a fonte de verdade do plano da configuração Playwright e mantém contexto do workflow.

**Por que uma implementação ingênua seria pior:** Substituir todo env quebraria PATH/CI; hardcode no YAML criaria duas fontes de verdade. Localmente, como o runner não seta CI, workers e blob reporter não são aplicados como na CI.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO exige MANGA_E2E_WORKERS: String(group.workers) e proíbe hardcode no workflow. 🟨 Aplicação efetiva depende de CI truthy no playwright.config.js.

### 9. Linhas 43-47 — I/O, shell e fechamento da configuração

Fonte auditada:
~~~text
43:     stdio: 'inherit',
44:     shell: false,
45:   }
46: );
47: ␠ [linha vazia]
~~~

**O que faz:** Herda stdio, desativa shell e encerra a chamada spawn.

**Como faz:** stdio inherit envia logs diretamente ao processo pai; shell false executa Node sem intermediário.

**Por que foi implementado dessa forma:** Logs ficam em tempo real e o comando é mais portável/seguro.

**Por que uma implementação ingênua seria pior:** Capturar tudo poderia gerar buffers grandes; shell true introduziria interpretação e diferenças de plataforma.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE. Não há teste focal de cwd/stdio/shell.

### 10. Linhas 48-51 — Falha ao iniciar child

Fonte auditada:
~~~text
48: child.on('error', error => {
49:   console.error(error);
50:   process.exit(1);
51: });
~~~

**O que faz:** Escuta error, imprime o erro e termina o runner com código 1.

**Como faz:** O evento error cobre falha de spawn antes de execução normal.

**Por que foi implementado dessa forma:** Converte falha infraestrutural em job vermelho explícito.

**Por que uma implementação ingênua seria pior:** Ignorar error poderia deixar falha ambígua; process.exit imediato exige cautela se futuramente houver writes assíncronos.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para spawn error.

### 11. Linhas 52-53 — Propagação de exit code e newline

Fonte auditada:
~~~text
52: child.on('close', code => process.exit(code == null ? 1 : code));
53: ␠ [linha vazia]
~~~

**O que faz:** No close, encerra o pai com o código do child; code null vira 1. A posição 53 é o newline final.

**Como faz:** O callback recebe o status terminal; null é tratado conservadoramente como falha.

**Por que foi implementado dessa forma:** Preserva o resultado real do Playwright no script npm/CI.

**Por que uma implementação ingênua seria pior:** Sempre retornar 0 mascararia testes falhos; propagar null seria ambíguo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE porque o step CI depende do status; ⚠️ sem assertion focal para 0/n/null.


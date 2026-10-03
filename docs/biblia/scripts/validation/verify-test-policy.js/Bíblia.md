# Bíblia técnica — verify-test-policy.js

> **Estado documental:** 🟡 CORRIGIDO após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `4a821403353445023452a0b5055e3a0893beaad2`  
> **Agente responsável:** AGENTE 3  
> **Arquivo:** `scripts/validation/verify-test-policy.js`  
> **Tipo:** gate estático Node para política anti-skip/anti-escape-hatch  
> **Linhas textuais:** **85**  
> **Posições documentais:** **86**, contando o newline terminal  
> **PR:** #66  
> **Branch:** `docs/project-bible`

> `STATUS.md`, `CHECKLIST.md` e `AUDITORIA.md` são read-only para este agente sob o protocolo atual; esta Bíblia documenta somente o arquivo #091 e suas evidências existentes.

## 1. Papel arquitetural

`scripts/validation/verify-test-policy.js` é um **gate de inspeção textual**. Ele varre partes do repositório e falha quando encontra padrões considerados mecanismos de enfraquecimento de testes.

O arquivo não executa Jest, Playwright, smoke ou E2E. Sua prova é estática: lê arquivos e procura tokens/regexes.

Quatro superfícies são inspecionadas:

1. arquivos JavaScript sob `tests/`;
2. scripts de `package.json`;
3. workflows YAML em `.github/workflows/`;
4. JavaScript operacional em `scripts/ci/`, `scripts/maintenance/` e `extension/`.

Se qualquer violação for encontrada, acumula todas em `problems`, imprime a lista e encerra com status 1. Caso contrário, imprime uma mensagem de sucesso.

## 2. Utilitário `walk(dir)`

`walk` faz travessia recursiva síncrona:

- se o path não existe, retorna `[]`;
- usa `readdirSync(..., { withFileTypes: true })`;
- recursa apenas quando `entry.isDirectory()`;
- inclui somente `entry.isFile()`;
- outros tipos de Dirent, como symlink, não entram na lista.

A função não aplica filtro de extensão; os consumidores fazem isso depois.

Consequência importante: ausência de uma árvore como `tests/` ou `.github/workflows/` não é, por si só, considerada erro por este gate. Outros validadores estruturais podem proteger isso, mas este arquivo isoladamente apenas varre o que existe.

## 3. Normalização `rel(file)`

`rel` produz path relativo à raiz do repositório e converte `\` para `/`. Isso torna as mensagens comparáveis entre Windows e POSIX.

A normalização afeta apenas reporting; não muda os paths usados para leitura.

## 4. Política aplicada a `tests/`

O gate coleta recursivamente arquivos sob `tests/` com extensões:

- `.js`;
- `.cjs`;
- `.mjs`.

Em cada arquivo, procura:

- `test.skip`, `it.skip`, `describe.skip`;
- `test.only`, `it.only`, `describe.only`;
- `test.todo`.

Cada ocorrência adiciona uma mensagem independente em `problems`.

### Limites do mecanismo

A análise é textual, não AST:

- comentários e strings também podem disparar o regex;
- formas semanticamente equivalentes que não batem no regex podem escapar;
- aliases/chains não listados explicitamente não são inferidos.

Exemplos relevantes de formas que **não são cobertas pelo regex atual** incluem aliases Jest como `xit`/`xdescribe` e `fit`/`fdescribe`, além de cadeias como `test.concurrent.skip` ou `test.concurrent.only`. A existência desse espaço de bypass é registrada como solicitação ao auditor; nenhuma correção foi aplicada por este agente.

## 5. Política aplicada a `package.json#scripts`

O arquivo lê `package.json`, usa `pkg.scripts || {}` e procura literalmente três tokens em cada comando:

- `--forceExit`;
- `--passWithNoTests`;
- `|| true`.

A busca é `String(command).includes(token)`.

Isso é conservador: qualquer ocorrência textual é rejeitada, independentemente de contexto shell.

Se o JSON estiver inválido ou ilegível, `JSON.parse`/`readFileSync` lança e o processo termina não zero por exceção; não há tratamento específico.

## 6. Política aplicada a workflows

Todos os `.yml` e `.yaml` recursivos sob `.github/workflows/` são lidos como texto.

O gate rejeita qualquer ocorrência de:

- `--forceExit`;
- `--passWithNoTests`.

Para `|| true`, a regra é mais estreita:

`/npm run test:[^\n]*\|\|\s*true/`

Portanto, ela procura somente linha contendo **`npm run test:<algo> ... || true`**.

Não cobre genericamente toda forma de teste mascarado em workflow, por exemplo um comando direto `npx jest || true`, `npm test || true` ou `node tests/smoke/run-smoke.js || true`. Esse limite é persistido como solicitação separada.

## 7. Política aplicada a JavaScript operacional

São varridos arquivos `.js` em:

- `scripts/ci/`;
- `scripts/maintenance/`;
- `extension/`.

Neles, o gate procura somente:

- `--forceExit`;
- `--passWithNoTests`.

`|| true` não é procurado nessa superfície.

O objetivo é impedir que runners e código operacional reintroduzam os dois flags que mascaram/afrouxam execução de testes.

## 8. Agregação e saída

O gate acumula problemas ao invés de falhar no primeiro.

Se `problems.length > 0`:

1. escreve `Política de testes inválida:` em stderr;
2. imprime cada problema com prefixo `- `;
3. chama `process.exit(1)`.

Se não há problemas, imprime:

`Política de testes validada: sem skip/only/todo, forceExit, passWithNoTests ou mascaramento de comandos de teste.`

A mensagem de sucesso descreve a intenção da política, mas deve ser interpretada segundo o conjunto concreto de padrões acima; ela não é prova semântica de que toda forma possível de skip/foco/masking foi eliminada.

## 9. Consumers e integrações reais

### `package.json`

- `validate:test-policy` aponta exatamente para `node scripts/validation/verify-test-policy.js`;
- `validate` inclui `npm run validate:test-policy`;
- `test:test-policy:infra` executa o self-test específico.

### `.github/workflows/ci.yml`

No job `ci-contract`:

- executa `npm run validate:test-policy`;
- em seguida executa `npm run test:test-policy:infra`.

Assim, a CI aplica o gate ao próprio repositório e depois executa um self-test negativo/positivo da infraestrutura.

### `verify-ci-contract.js`

Esse gate adicional exige:

- o passo `npm run validate:test-policy` no workflow;
- o wiring exato de `package.json#validate:test-policy`;
- o passo `npm run test:test-policy:infra`;
- o wiring exato do self-test;
- a presença textual dos marcadores `.skip`, `.only`, `test.todo`, `--forceExit`, `--passWithNoTests`, `|| true` neste verificador;
- os cenários `test.skip`, `--forceExit em script npm` e `teste mascarado com || true` no self-test.

Essas verificações protegem a existência dos mecanismos, não substituem execução comportamental de cada branch.

## 10. Self-test específico examinado

`scripts/validation/verify-test-policy-selftest.js` copia **a implementação real** para um sandbox temporário, cria estrutura mínima e a executa via `spawnSync(process.execPath, [verifier])`.

Casos provados diretamente:

1. **baseline válida** retorna status 0;
2. **`test.skip`** em `tests/sample.test.js` retorna não zero e mensagem `uso proibido de .skip`;
3. **`--forceExit` em script npm** retorna não zero e mensagem correspondente;
4. **`npm run test:ci || true` no workflow** retorna não zero e mensagem de mascaramento.

Depois que `createSandbox()` retorna com sucesso, o self-test remove esse sandbox em `finally`, inclusive nas falhas ocorridas dentro do bloco protegido. Uma falha durante a própria criação do sandbox, antes da entrada no `try/finally`, não é abrangida por essa garantia.

Ele **não** possui casos focais para `.only`, `test.todo`, `--passWithNoTests`, `--forceExit` em workflow/JS operacional, `|| true` em package script, aliases/chains Jest ou filesystem/symlink.

## 11. Classificação da evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| baseline limpa é aceita | self-test executa verificador real em sandbox | ✅ PROVADO DIRETAMENTE |
| `test.skip` é rejeitado | self-test injeta arquivo real e verifica status/mensagem | ✅ PROVADO DIRETAMENTE |
| `--forceExit` em package script é rejeitado | self-test altera package real do sandbox | ✅ PROVADO DIRETAMENTE |
| `npm run test:* || true` em workflow é rejeitado | self-test altera YAML do sandbox | ✅ PROVADO DIRETAMENTE |
| wiring `validate:test-policy` | `verify-ci-contract.js` verifica package/workflow | 🟦 GATE ESTÁTICO ESPECÍFICO |
| marcadores essenciais permanecem no fonte | `verify-ci-contract.js` usa `includes` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `.only` | implementação contém regex; sem cenário focal no self-test | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `test.todo` | implementação contém regex; sem cenário focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `--passWithNoTests` em package/workflow/JS | implementação contém checks; sem cenário focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `--forceExit` em workflow/JS operacional | sem cenário focal nessas superfícies | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `|| true` em package scripts | sem cenário focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| aliases/chains equivalentes de Jest | não são cobertos por regex atual | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| symlink/arquivo fora das extensões | sem prova focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 12. Riscos e limites

1. **Bypass semântico de skip/focus:** regex cobre APIs pontuais, não toda semântica Jest.
2. **Workflow masking estreito:** só `npm run test:<...> || true` é detectado para `|| true`.
3. **Possíveis falsos positivos:** ocorrência em comentário/string conta como violação.
4. **Symlinks ignorados:** `Dirent` que não for file/directory é descartado por `walk`.
5. **Árvore ausente vira lista vazia:** ausência de `tests/` ou workflows não é erro deste gate isoladamente.
6. **Extensões de teste limitadas:** TypeScript ou outra extensão futura em `tests/` não seria inspecionada.
7. **JS operacional limitado a três raízes:** scripts em outras pastas não entram nessa varredura específica.
8. **`|| true` não é verificado no JS operacional.**
9. **Leitura síncrona é adequada ao gate curto**, mas o custo cresce com o corpus inteiro.
10. **Acumulação é positiva para diagnóstico:** um run mostra múltiplas violações.
11. **Falhas de I/O/JSON são fail-closed por exceção**, mas a mensagem não é padronizada como policy error.
12. **Mensagem final é mais ampla que a prova textual**, por isso a Bíblia limita cada alegação aos regexes efetivos.

## 13. Segurança e trust boundaries

O script só lê o repositório e escreve em stdout/stderr. Não modifica arquivos.

Mesmo assim, paths e conteúdo são inputs de confiança interna:

- nomes de arquivos aparecem em mensagens;
- `package.json` é parseado diretamente;
- workflows e JS são lidos integralmente;
- diretórios muito grandes aumentam custo da travessia;
- symlinks não são seguidos.

Como gate de CI, seu papel é de policy enforcement do próprio código versionado, não sanitização de dados de usuário.

## 14. Invariantes

1. `problems` deve iniciar vazio em cada processo.
2. `rel` deve continuar normalizando separators para `/`.
3. Testes JS/CJS/MJS devem continuar sendo varridos recursivamente.
4. Cada padrão proibido encontrado deve produzir uma entrada em `problems`.
5. Package scripts devem continuar rejeitando `--forceExit`, `--passWithNoTests` e `|| true`.
6. Workflows devem continuar rejeitando `--forceExit` e `--passWithNoTests`.
7. O masking atualmente protegido em workflow é especificamente `npm run test:* || true`.
8. JS operacional deve continuar varrendo CI, maintenance e extension.
9. Qualquer problema deve resultar em exit 1.
10. Baseline limpa deve terminar 0.
11. O self-test deve continuar executar a implementação real copiada para sandbox.
12. O gate não deve criar sua própria evidência alterando o repositório real.
13. Mudanças de sintaxe Jest precisam reavaliar cobertura dos regexes.
14. Novas extensões/raízes de testes exigem reavaliar o escopo de `walk`.
15. O SHA desta Bíblia só vale para `4a821403353445023452a0b5055e3a0893beaad2`.

## 15. Solicitações ao auditor

### 091-001 — TEST_REQUIRED — SUPERSEDED → 090-001

**Encontrado:** o self-test cobre somente baseline, `test.skip`, `--forceExit` em package e masking `npm run test:* || true` em workflow.

**Falta:** casos focais para `.only`, `test.todo`, `--passWithNoTests`, `--forceExit` em workflow/JS operacional e `|| true` em package scripts.

**Necessário:** ampliar o self-test usando o verificador real em sandbox, sem reproduzir a lógica.

**Risco:** branches existentes podem regressar sem que o self-test atual falhe.

### 091-002 — POLICY_GAP_REVIEW — ACCEPTED — HIGH

**Encontrado:** a política declara impedir skip/only, mas os regexes atuais não cobrem aliases/chains semanticamente equivalentes como `xit`, `xdescribe`, `fit`, `fdescribe`, `test.concurrent.skip` e `test.concurrent.only`.

**Evidência atual:** linhas 25–29 limitam explicitamente os padrões a `test|it|describe` seguidos imediatamente de `.skip`/`.only`, e a `test.todo`.

**Necessário:** auditor decidir a superfície Jest proibida e, se a intenção for “nenhum skip/focus”, ampliar a política e adicionar regressões separadas.

**Lifecycle canônico:** ACCEPTED no `.state/091.json`.

**Risco:** suíte pode conter teste pulado/focado sem o gate acusar.

### 091-003 — POLICY_GAP_REVIEW — ACCEPTED

**Encontrado:** masking por `|| true` em workflow só é detectado quando a linha contém `npm run test:<...>`.

**Evidência atual:** linha 57 usa regex `npm run test:[^\n]*\|\|\s*true`.

**Falta:** proteção/teste para comandos diretos como `npm test || true`, `npx jest || true` ou `node tests/... || true`.

**Necessário:** definir se o contrato deve proibir qualquer comando de teste mascarado e, se sim, implementar detecção robusta + self-tests.

**Lifecycle canônico:** ACCEPTED no `.state/091.json`.

**Risco:** uma alteração de workflow pode mascarar falha real sem violar o gate atual.

## 16. Mapa de cobertura do fonte

| Linhas/posição | Unidade | Papel específico |
|---|---|---|
| 1 | strict mode | ativa semântica estrita |
| 2 | separador | separa diretiva dos imports |
| 3–4 | imports | carrega fs/path |
| 5 | separador | separa imports do estado |
| 6–7 | raiz/collector | resolve root e cria `problems` |
| 8 | separador | antecede walker |
| 9–16 | `walk` | ausência→[], recursão por diretório e coleta de arquivos |
| 17 | separador | antecede normalização |
| 18–20 | `rel` | gera path relativo POSIX |
| 21 | separador | antecede corpus de testes |
| 22–23 | `testFiles` | varre `tests/` e filtra js/cjs/mjs |
| 24 | separador | antecede padrões |
| 25–29 | padrões Jest | define skip/only/todo reconhecidos |
| 30 | separador | antecede varredura dos testes |
| 31–38 | loop de testes | lê cada fonte e registra padrões proibidos |
| 39 | separador | antecede package |
| 40 | parse package | lê/parseia package.json |
| 41–47 | scripts npm | procura três escape hatches e acumula problemas |
| 48 | separador | antecede workflows |
| 49 | path workflows | define raiz YAML |
| 50–60 | workflows | varre YAML, flags e masking `npm run test:* || true` |
| 61 | separador | antecede JS operacional |
| 62–66 | corpus operacional | combina CI/maintenance/extension e filtra `.js` |
| 67 | separador | antecede loop operacional |
| 68–75 | JS operacional | procura forceExit/passWithNoTests |
| 76 | separador | antecede resultado |
| 77–81 | falha | imprime header/problemas e encerra 1 |
| 82 | separador | antecede sucesso |
| 83–85 | sucesso | imprime mensagem final |
| 86 | newline terminal | posição documental do LF final |

## 17. Fonte integral auditada

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const problems = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() ? [full] : [];
  });
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

const testFiles = walk(path.join(root, 'tests'))
  .filter((file) => /\.(?:js|cjs|mjs)$/.test(file));

const forbiddenTestPatterns = [
  { label: '.skip', regex: /\b(?:test|it|describe)\.skip\b/ },
  { label: '.only', regex: /\b(?:test|it|describe)\.only\b/ },
  { label: 'test.todo', regex: /\btest\.todo\b/ },
];

for (const file of testFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const item of forbiddenTestPatterns) {
    if (item.regex.test(source)) {
      problems.push(rel(file) + ': uso proibido de ' + item.label);
    }
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(pkg.scripts || {})) {
  for (const token of ['--forceExit', '--passWithNoTests', '|| true']) {
    if (String(command).includes(token)) {
      problems.push('package.json#scripts.' + name + ': escape hatch proibido: ' + token);
    }
  }
}

const workflowDir = path.join(root, '.github', 'workflows');
for (const file of walk(workflowDir).filter((item) => /\.ya?ml$/i.test(item))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of ['--forceExit', '--passWithNoTests']) {
    if (source.includes(token)) {
      problems.push(rel(file) + ': escape hatch proibido: ' + token);
    }
  }
  if (/npm run test:[^\n]*\|\|\s*true/.test(source)) {
    problems.push(rel(file) + ': comando de teste mascarado com || true');
  }
}

const operationalJs = [
  ...walk(path.join(root, 'scripts', 'ci')),
  ...walk(path.join(root, 'scripts', 'maintenance')),
  ...walk(path.join(root, 'extension')),
].filter((file) => /\.js$/i.test(file));

for (const file of operationalJs) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of ['--forceExit', '--passWithNoTests']) {
    if (source.includes(token)) {
      problems.push(rel(file) + ': escape hatch proibido: ' + token);
    }
  }
}

if (problems.length) {
  console.error('Política de testes inválida:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log(
  'Política de testes validada: sem skip/only/todo, forceExit, passWithNoTests ou mascaramento de comandos de teste.'
);
```

## 18. Conclusão

Para o SHA auditado, o gate é funcionalmente simples e possui self-test direto para quatro cenários relevantes. Sua cobertura de política, porém, é estritamente textual e não deve ser interpretada como prova de todas as formas semanticamente equivalentes de skip/focus/masking.

A Bíblia mantém a classificação conservadora: apenas os quatro cenários realmente executados pelo self-test recebem prova direta; os demais permanecem gate estático, lacuna ou solicitação ao auditor.

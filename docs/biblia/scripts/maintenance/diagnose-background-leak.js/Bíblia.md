# Bíblia técnica — diagnose-background-leak.js

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE ATIVA  
> **SHA auditado:** `6b5a15d0d255d0285cfabc05f3412b81ffb3d3d4`  
> **Agente responsável pela auditoria:** AGENTE 1  
> **Tipo:** script Node de manutenção/diagnóstico de leak de workers Jest  
> **Linhas textuais:** **420**  
> **Posições documentais:** **421**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/maintenance/diagnose-background-leak.js` é um diagnóstico especializado do projeto Jest `background`. Ele não corrige leaks: executa subconjuntos de testes em processos Jest separados, procura o warning canônico de worker forçado, reduz o conjunto com uma estratégia inspirada em ddmin e grava logs/JSON em `.ci-results`.

O script existe porque o warning `A worker process has failed to exit gracefully and has been force exited` pode depender da combinação de testes e do nível de paralelismo. Uma simples execução de `--detectOpenHandles` ou um único arquivo isolado não localiza necessariamente interações entre suites.

No fluxo oficial, `package.json#test:diagnose-background-leak` chama este arquivo. O job `background-leak-bisection` da CI roda apenas em `workflow_dispatch` ou push da `main`, atualmente com `MT_BACKGROUND_LEAK_WORKERS="3"`, e publica o summary/logs como artifact.

## 2. Entradas, saídas e lifecycle

### Entradas

- inventário de `tests/unit/background/**/*.test.js`;
- `MT_BACKGROUND_LEAK_SEED`: lista opcional separada por vírgulas, usando paths relativos a `tests/`;
- `MT_BACKGROUND_LEAK_WORKERS`: vazio = sweep; `default` = concorrência padrão do Jest; inteiro >= 1 = modo fixo;
- ambiente herdado para cada subprocesso Jest.

### Execução

1. descobre/ordena testes;
2. valida seed;
3. cria diretório de logs;
4. escolhe workers por override ou sweep;
5. executa probes repetidos;
6. reduz por partes, complementos e interação cruzada;
7. confirma o candidato quatro vezes;
8. grava summary;
9. retorna 2 somente se o leak for reconfirmado.

### Saídas

- `.ci-results/background-leak-diagnostic/*.log`: stdout/stderr completos por tentativa;
- `.ci-results/background-leak-diagnostic.json`: ambiente, workers, candidatos, confirmações e `records`;
- console com marcadores `LEAK`, `CLEAN` ou `FAIL`;
- exit 64 para entrada inválida, 1 para corpus vazio, 2 para leak confirmado e 0 nos caminhos considerados sem leak.

## 3. Dependências e consumers

### Dependências diretas

- Node `fs`, `path`, `os`, `child_process.spawnSync`;
- Jest em `node_modules/jest/bin/jest.js`;
- `jest.config.js`;
- `scripts/ci/jest-worker-warning.js#hasForcedWorkerExit`;
- testes em `tests/unit/background`.

### Consumers/integrações reais

- `package.json#test:diagnose-background-leak`;
- `.github/workflows/ci.yml#background-leak-bisection`;
- `scripts/validation/verify-ci-contract.js`, que exige presença/condição/comando bloqueante do job;
- artifact uploader da CI, que coleta o JSON e o diretório de logs;
- operadores locais via comando especializado documentado no README.

## 4. Algoritmo de redução

A unidade observada não é “teste que falhou”, mas “subconjunto de arquivos que ainda produz o warning de worker forçado”.

- `probe` executa um subconjunto repetidamente;
- uma única tentativa com warning torna `leak=true`;
- `partition` divide o candidato;
- primeiro são testadas partes;
- depois complementos;
- com duas partes limpas isoladamente, `tryCrossInteractionNarrowing` tenta preservar um lado inteiro e reduzir o outro a um único pivô;
- se nada reduz, a granularidade dobra;
- por fim o candidato é repetido quatro vezes.

Isso é adequado a uma race inter-suite, mas não prova minimalidade matemática quando há flakiness forte, orçamento esgotado ou interação de ordem superior.

## 5. Evidência automatizada examinada

| Comportamento | Evidência | Classificação |
|---|---|---|
| detector reconhece exatamente o warning canônico | `verify-jest-worker-warning-selftest.js` exerce `hasForcedWorkerExit` | ✅ PROVADO DIRETAMENTE — do helper |
| script possui comando npm oficial | `package.json` referencia exatamente este arquivo | 🟦 GATE ESTÁTICO ESPECÍFICO |
| job diagnóstico existe em main/workflow_dispatch | `verify-ci-contract.js` exige job, condições e comando | 🟦 GATE ESTÁTICO ESPECÍFICO |
| job não usa `continue-on-error` no passo diagnóstico | `verify-ci-contract.js` verifica job/passo | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI atual usa workers 3 | workflow define `MT_BACKGROUND_LEAK_WORKERS: "3"` | 🟨 EXECUTADO INDIRETAMENTE |
| logs/summary são publicados | workflow aponta para os dois paths | 🟨 EXECUTADO INDIRETAMENTE |
| sweep, ddmin, complementos e interação cruzada | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| seed e workers inválidos | nenhuma suite focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| política de exit code para falha comum do Jest | nenhuma prova; código indica risco de falso verde | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| limite `maxProbes=90` | sem teste e não é teto estrito | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| timeout de subprocessos | não existe timeout configurado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Análise crítica

1. **Falso verde para falha comum — HIGH:** `probe.failures` é calculado, mas ignorado nas decisões principais. Se Jest falhar sem o warning alvo, o branch override/sweep pode concluir “não reproduziu” e executar `process.exit(0)`.
2. **Sem timeout de subprocesso:** `spawnSync` pode ficar bloqueado por Jest que nunca termina.
3. **`maxProbes=90` é aproximado:** a checagem ocorre somente no topo do `while`; probes internos e cross narrowing podem ultrapassar o orçamento.
4. **Erros de entrada sem summary:** seed/worker inválido e corpus vazio encerram antes do JSON principal.
5. **`maxBuffer=32 MiB` pode virar erro de spawn:** o record captura `proc.error`, porém esse erro também pode cair na categoria de falha comum não propagada.
6. **Ausência de teto para workers explícitos:** qualquer inteiro >=1 é aceito.
7. **Reprodutibilidade depende do warning textual:** mudança de mensagem do Jest invalida o sinal até o helper ser atualizado.
8. **Minimalidade não é garantida:** a estratégia é prática e bounded-ish, não busca exaustivamente combinações.
9. **Custos podem crescer muito:** cada probe normalmente executa duas vezes e confirmação final quatro.
10. **State global do filesystem:** logs antigos no mesmo diretório não são limpos no início; filenames sequenciais recomeçam em 001 e podem sobrescrever logs da rodada anterior.
11. **Summary é sobrescrito por rodada:** útil como “último diagnóstico”, mas histórico depende de artifact/commit SHA da CI.
12. **`MT_JEST_BACKGROUND_DIAG` é herdado pelos testes:** isso é intencional para identificação, mas qualquer teste que mude comportamento com essa env altera o fenômeno medido.
13. **Exit 2 significa “leak confirmado”, não necessariamente teste funcional falhou:** consumers devem interpretar corretamente.
14. **Execução em main é pesada:** o CI Contract exige esse diagnóstico em push da main, mesmo depois de correções futuras, até política ser alterada conscientemente.

## 7. Segurança, privacidade e boundaries

O script executa apenas código de teste do repositório, mas herda `process.env` para subprocessos Jest. Portanto, qualquer variável disponível ao job também fica visível às suites. Os logs persistem stdout/stderr integralmente; testes não devem imprimir segredos.

`safeName` reduz risco de labels criarem caminhos problemáticos, e `requestedSeed` só aceita arquivos descobertos no corpus, impedindo usar a variável como caminho arbitrário para `--runTestsByPath`.

Os artifacts podem conter paths locais, versões, mensagens de erro e saída das suites. Isso é informação de diagnóstico e não deve ser tratado como payload de usuário.

## 8. Casos-limite

- nenhum arquivo `.test.js` em background;
- seed vazia;
- seed com arquivo inexistente;
- espaços em elementos da seed;
- workers `default`, 1, valor muito alto, 0, negativo, decimal, NaN textual;
- child process com status não zero sem warning;
- child process morto por signal;
- erro `ENOBUFS` por saída acima de 32 MiB;
- Jest que nunca termina;
- warning ocorrendo em apenas uma das duas tentativas;
- partes isoladas limpas, mas combinação vaza;
- leak de ordem superior não reduzido pelo pivô cruzado;
- orçamento ultrapassado dentro de uma iteração;
- candidato final que deixa de reproduzir;
- falha para gravar log/summary;
- diretório com logs da rodada anterior;
- mudança textual do warning em versão futura do Jest.

## 9. Invariantes

1. O universo padrão deve continuar limitado ao projeto `background`.
2. Seeds externas não podem executar arquivos fora do inventário descoberto.
3. Cada tentativa deve preservar stdout/stderr completos em log.
4. A decisão de leak deve continuar usando um detector compartilhado, não regex divergente local.
5. O diagnóstico não pode usar `--forceExit` para esconder o problema que tenta localizar.
6. Workers fixos precisam ser inteiros positivos ou `default`.
7. A seleção de subconjunto deve preservar paths relativos estáveis e ordenados.
8. Parts e complements devem ser calculados sobre o mesmo candidato da iteração.
9. Interação cruzada não pode declarar redução se o novo conjunto não for menor.
10. O candidato final precisa ser confirmado por múltiplas tentativas antes de exit 2.
11. Falha comum do Jest/spawn não deve ser confundida com ausência saudável de leak.
12. Artifacts devem distinguir status, signal, warning, duração e arquivos executados.
13. O summary precisa apontar para os mesmos records dos logs daquela rodada.
14. Mudanças na mensagem canônica do Jest exigem revalidar o detector.
15. Se `maxProbes` for apresentado como limite duro, a implementação deve aplicá-lo dentro de todos os loops/repeats.
16. O SHA desta Bíblia só permanece válido enquanto o fonte for `6b5a15d0d255d0285cfabc05f3412b81ffb3d3d4`.

## 10. Lacunas de teste e solicitações ao auditor

- **076-001 — TEST_REQUIRED — OPEN:** self-test da orquestração/algoritmo.
- **076-002 — ROBUSTNESS_BUG_REVIEW — OPEN — HIGH:** falha comum do Jest pode não afetar exit code.
- **076-003 — CI_POLICY_REVIEW — OPEN:** ausência de timeout.
- **076-004 — ALGORITHM_REVIEW — OPEN:** orçamento de probes não estrito.
- **076-005 — ARTIFACT_CONTRACT_REVIEW — OPEN:** exits antecipados sem summary.

Essas solicitações estão persistidas em `docs/biblia/.state/076.json`. Elas não impedem concluir a Bíblia documental, mas impedem afirmar que esses comportamentos estão provados/corrigidos.

## 11. Fonte integral auditada

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { hasForcedWorkerExit } = require('../ci/jest-worker-warning');

const repoRoot = path.resolve(__dirname, '../..');
const testsRoot = path.join(repoRoot, 'tests');
const backgroundRoot = path.join(testsRoot, 'unit', 'background');
const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const resultRoot = path.join(repoRoot, '.ci-results');
const logDir = path.join(resultRoot, 'background-leak-diagnostic');
const summaryFile = path.join(resultRoot, 'background-leak-diagnostic.json');

fs.mkdirSync(logDir, { recursive: true });

function listTests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listTests(full) : [full];
    })
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => path.relative(testsRoot, file).replace(/\\/g, '/'))
    .sort();
}

const discoveredFiles = listTests(backgroundRoot);
const requestedSeed = String(process.env.MT_BACKGROUND_LEAK_SEED || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const unknownSeedFiles = requestedSeed.filter(file => !discoveredFiles.includes(file));
if (unknownSeedFiles.length) {
  console.error('[background-leak] seed contém arquivos desconhecidos: ' + unknownSeedFiles.join(', '));
  process.exit(64);
}
const allFiles = requestedSeed.length ? requestedSeed : discoveredFiles;
const records = [];
let sequence = 0;

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
}

function compactOutput(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) =>
      line.includes('A worker process has failed to exit gracefully') ||
      /Test Suites:|Tests:|Time:|Ran all test suites|FAIL |No tests found/.test(line)
    )
    .slice(-40);
}

function runOnce({ label, files, workers }) {
  sequence += 1;
  const args = [
    jestBin,
    '--config', 'jest.config.js',
    '--ci',
    '--selectProjects', 'background',
    '--runTestsByPath',
    ...files,
  ];
  if (workers !== null) args.push('--maxWorkers=' + String(workers));

  const startedAt = Date.now();
  const proc = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      MT_JEST_BACKGROUND_DIAG: label,
    },
  });

  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';
  const combined = stdout + '\n' + stderr;
  const forcedWorkerExit = hasForcedWorkerExit(combined);
  const durationMs = Date.now() - startedAt;
  const logName = String(sequence).padStart(3, '0') + '-' + safeName(label) + '.log';
  const logPath = path.join(logDir, logName);

  fs.writeFileSync(logPath, [
    '# label=' + label,
    '# workers=' + (workers === null ? 'default' : String(workers)),
    '# fileCount=' + String(files.length),
    '# status=' + String(proc.status),
    '# signal=' + String(proc.signal || ''),
    '# forcedWorkerExit=' + String(forcedWorkerExit),
    '# durationMs=' + String(durationMs),
    '# files=' + JSON.stringify(files),
    '',
    '===== STDOUT =====',
    stdout,
    '',
    '===== STDERR =====',
    stderr,
    '',
  ].join('\n'));

  const record = {
    sequence,
    label,
    workers: workers === null ? 'default' : workers,
    fileCount: files.length,
    files,
    status: proc.status,
    signal: proc.signal || null,
    forcedWorkerExit,
    durationMs,
    error: proc.error ? proc.error.message : null,
    interestingLines: compactOutput(combined),
    logFile: path.relative(repoRoot, logPath).replace(/\\/g, '/'),
  };
  records.push(record);

  const marker = forcedWorkerExit ? 'LEAK' : (proc.status === 0 ? 'CLEAN' : 'FAIL');
  console.log(
    '[background-leak] ' + marker +
    ' #' + String(sequence) +
    ' label=' + label +
    ' workers=' + String(record.workers) +
    ' files=' + String(files.length) +
    ' ms=' + String(durationMs)
  );

  return record;
}

function probe({ label, files, workers, repeats = 1 }) {
  const attempts = [];
  for (let i = 0; i < repeats; i += 1) {
    attempts.push(runOnce({
      label: label + '-r' + String(i + 1),
      files,
      workers,
    }));
  }
  return {
    leak: attempts.some((attempt) => attempt.forcedWorkerExit),
    failures: attempts.filter((attempt) => attempt.status !== 0 && !attempt.forcedWorkerExit),
    attempts,
  };
}

function partition(items, count) {
  const result = [];
  const size = Math.ceil(items.length / count);
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function complement(items, chunk) {
  const excluded = new Set(chunk);
  return items.filter((item) => !excluded.has(item));
}

function tryCrossInteractionNarrowing({ left, right, workers, iteration }) {
  // Quando left e right ficam limpos isoladamente mas left+right vaza,
  // existe interação entre os grupos. Primeiro procure um único arquivo de
  // left que, junto com todo right, preserve o leak. Depois faça o inverso.
  // Isso reduz muito mais rápido do que aumentar cegamente a granularidade.
  for (let i = 0; i < left.length; i += 1) {
    const combined = [left[i], ...right];
    const result = probe({
      label: 'cross-i' + String(iteration) + '-left' + String(i + 1),
      files: combined,
      workers,
      repeats: 2,
    });
    if (result.leak) {
      return { files: combined, side: 'left', pivot: left[i] };
    }
  }

  for (let i = 0; i < right.length; i += 1) {
    const combined = [...left, right[i]];
    const result = probe({
      label: 'cross-i' + String(iteration) + '-right' + String(i + 1),
      files: combined,
      workers,
      repeats: 2,
    });
    if (result.leak) {
      return { files: combined, side: 'right', pivot: right[i] };
    }
  }

  return null;
}

console.log('[background-leak] node=' + process.version +
  ' platform=' + process.platform +
  ' cpuCount=' + String(os.cpus().length) +
  ' backgroundFiles=' + String(allFiles.length));

if (!allFiles.length) {
  console.error('[background-leak] nenhum teste de background encontrado.');
  process.exit(1);
}

// 1) Escolher o nível de paralelismo.
// A CI pode fornecer MT_BACKGROUND_LEAK_WORKERS quando uma rodada anterior já
// isolou um valor reproduzível (no PR #47, w2 ficou limpo e w3 reproduziu).
// Sem override, preservamos o sweep completo para uso independente/local.
const requestedWorkersRaw = String(process.env.MT_BACKGROUND_LEAK_WORKERS || '').trim();
const requestedWorkers = requestedWorkersRaw === ''
  ? undefined
  : (requestedWorkersRaw === 'default' ? null : Number(requestedWorkersRaw));

if (
  requestedWorkers !== undefined &&
  requestedWorkers !== null &&
  (!Number.isInteger(requestedWorkers) || requestedWorkers < 1)
) {
  console.error('[background-leak] MT_BACKGROUND_LEAK_WORKERS inválido: ' + requestedWorkersRaw);
  process.exit(64);
}

let leakingModes = [];
let selectedWorkers;

if (requestedWorkers !== undefined) {
  const baseline = probe({
    label: 'baseline-' + (requestedWorkers === null ? 'default' : 'w' + String(requestedWorkers)),
    files: allFiles,
    workers: requestedWorkers,
    repeats: 2,
  });
  const leakCount = baseline.attempts.filter((attempt) => attempt.forcedWorkerExit).length;
  if (leakCount === 0) {
    const summary = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      cpuCount: os.cpus().length,
      backgroundFiles: allFiles,
      selectedWorkers: requestedWorkers === null ? 'default' : requestedWorkers,
      requestedWorkersDidNotReproduce: true,
      records,
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
    console.log('[background-leak] override não reproduziu o warning em 2 tentativas.');
    process.exit(0);
  }
  leakingModes = [{ workers: requestedWorkers, leakCount }];
  selectedWorkers = requestedWorkers;
} else {
  // Duas execuções por modo reduzem a chance de escolher um falso negativo de race.
  const modes = [1, 2, 3, 4, null];
  const sweep = modes.map((workers) => ({
    workers,
    result: probe({
      label: 'sweep-' + (workers === null ? 'default' : 'w' + String(workers)),
      files: allFiles,
      workers,
      repeats: 2,
    }),
  }));

  leakingModes = sweep
    .map((entry) => ({
      workers: entry.workers,
      leakCount: entry.result.attempts.filter((attempt) => attempt.forcedWorkerExit).length,
    }))
    .filter((entry) => entry.leakCount > 0)
    .sort((a, b) => {
      if (b.leakCount !== a.leakCount) return b.leakCount - a.leakCount;
      if (a.workers === null) return 1;
      if (b.workers === null) return -1;
      return Number(a.workers) - Number(b.workers);
    });

  if (!leakingModes.length) {
    const summary = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      cpuCount: os.cpus().length,
      backgroundFiles: allFiles,
      selectedWorkers: null,
      historicalLeakNotReproduced: true,
      records,
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
    console.log('[background-leak] warning não reproduziu no sweep desta rodada.');
    process.exit(0);
  }

  selectedWorkers = leakingModes[0].workers;
}

console.log('[background-leak] workers selecionados para bisection=' +
  (selectedWorkers === null ? 'default' : String(selectedWorkers)));

// 2) Delta debugging (ddmin): reduz o conjunto preservando a reprodução.
let candidate = [...allFiles];
let granularity = 2;
let iteration = 0;
const maxProbes = 90;
const probeStartSequence = sequence;

while (candidate.length > 1 && (sequence - probeStartSequence) < maxProbes) {
  iteration += 1;
  const chunks = partition(candidate, Math.min(granularity, candidate.length));
  let reduced = false;

  // Primeiro: alguma parte isolada ainda reproduz?
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const result = probe({
      label: 'ddmin-i' + String(iteration) + '-part' + String(i + 1),
      files: chunk,
      workers: selectedWorkers,
      repeats: 2,
    });
    if (result.leak) {
      candidate = chunk;
      granularity = 2;
      reduced = true;
      console.log('[background-leak] reduzido por parte para ' + String(candidate.length) + ' arquivo(s).');
      break;
    }
  }
  if (reduced) continue;

  // Depois: se nenhuma parte sozinha reproduz, tente os complementos.
  for (let i = 0; i < chunks.length; i += 1) {
    const rest = complement(candidate, chunks[i]);
    if (!rest.length) continue;
    const result = probe({
      label: 'ddmin-i' + String(iteration) + '-complement' + String(i + 1),
      files: rest,
      workers: selectedWorkers,
      repeats: 2,
    });
    if (result.leak) {
      candidate = rest;
      granularity = Math.max(2, granularity - 1);
      reduced = true;
      console.log('[background-leak] reduzido por complemento para ' + String(candidate.length) + ' arquivo(s).');
      break;
    }
  }
  if (reduced) continue;

  // Caso clássico de interação: com granularidade 2, nenhum lado sozinho
  // reproduz e nenhum complemento reproduz, mas o conjunto completo sim.
  // Tente preservar um lado inteiro e reduzir o outro a um pivô.
  if (chunks.length === 2) {
    const cross = tryCrossInteractionNarrowing({
      left: chunks[0],
      right: chunks[1],
      workers: selectedWorkers,
      iteration,
    });
    if (cross && cross.files.length < candidate.length) {
      candidate = cross.files;
      granularity = 2;
      console.log(
        '[background-leak] reduzido por interação (' + cross.side + ') para ' +
        String(candidate.length) + ' arquivo(s); pivot=' + cross.pivot
      );
      continue;
    }
  }

  if (granularity >= candidate.length) break;
  granularity = Math.min(candidate.length, granularity * 2);
  console.log('[background-leak] aumentando granularidade para ' + String(granularity));
}

// 3) Confirmação final para distinguir conjunto mínimo real de race esporádica.
const confirmation = probe({
  label: 'final-candidate',
  files: candidate,
  workers: selectedWorkers,
  repeats: 4,
});
const confirmationLeakCount = confirmation.attempts
  .filter((attempt) => attempt.forcedWorkerExit).length;

const summary = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpuCount: os.cpus().length,
  initialFileCount: allFiles.length,
  selectedWorkers: selectedWorkers === null ? 'default' : selectedWorkers,
  leakingModes: leakingModes.map((entry) => ({
    workers: entry.workers === null ? 'default' : entry.workers,
    leakCount: entry.leakCount,
  })),
  candidateFileCount: candidate.length,
  candidateFiles: candidate,
  confirmationLeakCount,
  confirmationAttempts: confirmation.attempts.length,
  records,
};

fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');

console.log('\n[background-leak] RESULTADO');
console.log('[background-leak] candidateFileCount=' + String(candidate.length));
for (const file of candidate) console.log('[background-leak] candidate=' + file);
console.log('[background-leak] confirmation=' +
  String(confirmationLeakCount) + '/' + String(confirmation.attempts.length));
console.log('[background-leak] summary=' +
  path.relative(repoRoot, summaryFile).replace(/\\/g, '/'));

if (confirmationLeakCount > 0) {
  process.exitCode = 2;
}
```

## 12. Cobertura linha a linha

### Linha 1

**Fonte:** `'use strict';`

**O que faz:** Ativa strict mode para a execução CommonJS do script de manutenção.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 2

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 3

**Fonte:** `const fs = require('fs');`

**O que faz:** Declara a constante `fs` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 4

**Fonte:** `const path = require('path');`

**O que faz:** Declara a constante `path` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 5

**Fonte:** `const os = require('os');`

**O que faz:** Declara a constante `os` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 6

**Fonte:** `const { spawnSync } = require('child_process');`

**O que faz:** Importa dependências por destructuring usadas neste diagnóstico: `const { spawnSync } = require('child_process');`.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 7

**Fonte:** `const { hasForcedWorkerExit } = require('../ci/jest-worker-warning');`

**O que faz:** Importa dependências por destructuring usadas neste diagnóstico: `const { hasForcedWorkerExit } = require('../ci/jest-worker-warning');`.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — `verify-jest-worker-warning-selftest.js` prova o helper `hasForcedWorkerExit`; a integração deste script com subprocessos continua indireta.

### Linha 8

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 9

**Fonte:** `const repoRoot = path.resolve(__dirname, '../..');`

**O que faz:** Declara a constante `repoRoot` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 10

**Fonte:** `const testsRoot = path.join(repoRoot, 'tests');`

**O que faz:** Declara a constante `testsRoot` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 11

**Fonte:** `const backgroundRoot = path.join(testsRoot, 'unit', 'background');`

**O que faz:** Declara a constante `backgroundRoot` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 12

**Fonte:** `const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');`

**O que faz:** Declara a constante `jestBin` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 13

**Fonte:** `const resultRoot = path.join(repoRoot, '.ci-results');`

**O que faz:** Declara a constante `resultRoot` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 14

**Fonte:** `const logDir = path.join(resultRoot, 'background-leak-diagnostic');`

**O que faz:** Declara a constante `logDir` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 15

**Fonte:** `const summaryFile = path.join(resultRoot, 'background-leak-diagnostic.json');`

**O que faz:** Declara a constante `summaryFile` que participa de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 16

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de bootstrap, dependências e caminhos de artefatos.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 17

**Fonte:** `fs.mkdirSync(logDir, { recursive: true });`

**O que faz:** Garante que o diretório de logs exista antes das tentativas.

**Como faz:** O script resolve a raiz a partir de `__dirname`, fixa o projeto Jest `background` e concentra logs/sumário em `.ci-results`, antes de qualquer subprocesso.

**Por que foi implementado dessa forma:** A bisection precisa reproduzir o mesmo Jest canônico da raiz e deixar evidência persistente para CI e análise manual.

**Por que uma implementação ingênua seria pior:** Paths relativos ao cwd, outro config Jest ou saída espalhada poderiam produzir diagnóstico não reproduzível e artefatos difíceis de correlacionar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — `package.json` e o job `background-leak-bisection` executam este script real; não há self-test focal destas linhas.

### Linha 18

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 19

**Fonte:** `function listTests(dir) {`

**O que faz:** Abre a função `listTests`, responsável por descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 20

**Fonte:** `  return fs.readdirSync(dir, { withFileTypes: true })`

**O que faz:** Retorna o valor estruturado produzido por descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 21

**Fonte:** `    .flatMap((entry) => {`

**O que faz:** Continua a expressão encadeada/condicional que implementa descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 22

**Fonte:** `      const full = path.join(dir, entry.name);`

**O que faz:** Declara a constante `full` que participa de descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 23

**Fonte:** `      return entry.isDirectory() ? listTests(full) : [full];`

**O que faz:** Retorna o valor estruturado produzido por descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 24

**Fonte:** `    })`

**O que faz:** Compõe a operação `})` dentro de descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 25

**Fonte:** `    .filter((file) => file.endsWith('.test.js'))`

**O que faz:** Continua a expressão encadeada/condicional que implementa descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 26

**Fonte:** `    .map((file) => path.relative(testsRoot, file).replace(/\\\\/g, '/'))`

**O que faz:** Continua a expressão encadeada/condicional que implementa descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 27

**Fonte:** `    .sort();`

**O que faz:** Continua a expressão encadeada/condicional que implementa descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 28

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de descoberta determinística dos testes de background.

**Como faz:** `listTests` percorre recursivamente `tests/unit/background`, retém apenas `.test.js`, converte paths para relativos a `tests/` com `/` e ordena o resultado.

**Por que foi implementado dessa forma:** O algoritmo ddmin precisa de um universo estável e serializável para comparar subconjuntos e aceitar seeds explícitos.

**Por que uma implementação ingênua seria pior:** Descoberta não ordenada, paths absolutos ou mistura de outros projetos mudariam a ordem de partição e reduziriam reprodutibilidade entre máquinas.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foi localizado self-test de recursão, filtragem, normalização ou ordenação.

### Linha 29

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 30

**Fonte:** `const discoveredFiles = listTests(backgroundRoot);`

**O que faz:** Declara a constante `discoveredFiles` que participa de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 31

**Fonte:** `const requestedSeed = String(process.env.MT_BACKGROUND_LEAK_SEED || '')`

**O que faz:** Declara a constante `requestedSeed` que participa de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 32

**Fonte:** `  .split(',')`

**O que faz:** Continua a expressão encadeada/condicional que implementa seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 33

**Fonte:** `  .map(value => value.trim())`

**O que faz:** Continua a expressão encadeada/condicional que implementa seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 34

**Fonte:** `  .filter(Boolean);`

**O que faz:** Continua a expressão encadeada/condicional que implementa seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 35

**Fonte:** `const unknownSeedFiles = requestedSeed.filter(file => !discoveredFiles.includes(file));`

**O que faz:** Declara a constante `unknownSeedFiles` que participa de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 36

**Fonte:** `if (unknownSeedFiles.length) {`

**O que faz:** Abre uma condição que decide um ramo de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 37

**Fonte:** `  console.error('[background-leak] seed contém arquivos desconhecidos: ' + unknownSeedFiles.join(', '));`

**O que faz:** Emite telemetria de console para tornar seed opcional, validação de entrada e estado global da rodada observável no log da CI.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 38

**Fonte:** `  process.exit(64);`

**O que faz:** Encerra imediatamente o diagnóstico com o código explícito desta linha.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 39

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 40

**Fonte:** `const allFiles = requestedSeed.length ? requestedSeed : discoveredFiles;`

**O que faz:** Declara a constante `allFiles` que participa de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 41

**Fonte:** `const records = [];`

**O que faz:** Declara a constante `records` que participa de seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 42

**Fonte:** `let sequence = 0;`

**O que faz:** Declara o estado mutável `sequence` usado em seed opcional, validação de entrada e estado global da rodada.

**Como faz:** A seed vem de `MT_BACKGROUND_LEAK_SEED`, é separada por vírgulas, normalizada e comparada ao inventário; em seguida são definidos `allFiles`, `records` e `sequence`.

**Por que foi implementado dessa forma:** Permite repetir uma investigação sobre um subconjunto conhecido sem aceitar nomes que escapem do corpus descoberto.

**Por que uma implementação ingênua seria pior:** Aceitar arquivo desconhecido faria Jest executar alvo fora do universo auditado; por outro lado, erro de seed encerra antes de gerar o summary principal.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o caminho de seed não possui self-test focal; a ausência de summary em erro foi registrada em `076-005`.

### Linha 43

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 44

**Fonte:** `function safeName(value) {`

**O que faz:** Abre a função `safeName`, responsável por normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 45

**Fonte:** `  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);`

**O que faz:** Retorna o valor estruturado produzido por normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 46

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 47

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 48

**Fonte:** `function compactOutput(text) {`

**O que faz:** Abre a função `compactOutput`, responsável por normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 49

**Fonte:** `  return String(text || '')`

**O que faz:** Retorna o valor estruturado produzido por normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 50

**Fonte:** `    .split(/\\r?\\n/)`

**O que faz:** Continua a expressão encadeada/condicional que implementa normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 51

**Fonte:** `    .filter((line) =>`

**O que faz:** Continua a expressão encadeada/condicional que implementa normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 52

**Fonte:** `      line.includes('A worker process has failed to exit gracefully') ||`

**O que faz:** Compõe a operação `line.includes('A worker process has failed to exit gracefully') ||` dentro de normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 53

**Fonte:** `      /Test Suites:|Tests:|Time:|Ran all test suites|FAIL |No tests found/.test(line)`

**O que faz:** Compõe a operação `/Test Suites:|Tests:|Time:|Ran all test suites|FAIL |No tests found/.test(line)` dentro de normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 54

**Fonte:** `    )`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 55

**Fonte:** `    .slice(-40);`

**O que faz:** Continua a expressão encadeada/condicional que implementa normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 56

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de normalização de nomes e compactação da saída diagnóstica.

**Como faz:** `safeName` limita caracteres/comprimento de nomes de log; `compactOutput` preserva somente linhas relevantes de Jest e no máximo as últimas 40.

**Por que foi implementado dessa forma:** Logs completos continuam em arquivo, enquanto o JSON ganha um resumo pequeno, legível e seguro para nome de arquivo.

**Por que uma implementação ingênua seria pior:** Sem sanitização, labels poderiam virar paths inválidos; sem limite, o summary duplicaria grandes saídas do Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há casos focais para caracteres especiais, truncamento ou seleção das 40 linhas.

### Linha 57

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 58

**Fonte:** `function runOnce({ label, files, workers }) {`

**O que faz:** Abre a função `runOnce`, responsável por execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 59

**Fonte:** `  sequence += 1;`

**O que faz:** Compõe a operação `sequence += 1;` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 60

**Fonte:** `  const args = [`

**O que faz:** Declara a constante `args` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 61

**Fonte:** `    jestBin,`

**O que faz:** Compõe a operação `jestBin,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 62

**Fonte:** `    '--config', 'jest.config.js',`

**O que faz:** Compõe a operação `'--config', 'jest.config.js',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 63

**Fonte:** `    '--ci',`

**O que faz:** Compõe a operação `'--ci',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 64

**Fonte:** `    '--selectProjects', 'background',`

**O que faz:** Compõe a operação `'--selectProjects', 'background',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 65

**Fonte:** `    '--runTestsByPath',`

**O que faz:** Compõe a operação `'--runTestsByPath',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 66

**Fonte:** `    ...files,`

**O que faz:** Expande valores existentes na coleção/objeto usado em execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 67

**Fonte:** `  ];`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 68

**Fonte:** `  if (workers !== null) args.push('--maxWorkers=' + String(workers));`

**O que faz:** Abre uma condição que decide um ramo de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 69

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 70

**Fonte:** `  const startedAt = Date.now();`

**O que faz:** Declara a constante `startedAt` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 71

**Fonte:** `  const proc = spawnSync(process.execPath, args, {`

**O que faz:** Declara a constante `proc` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 72

**Fonte:** `    cwd: repoRoot,`

**O que faz:** Compõe a operação `cwd: repoRoot,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 73

**Fonte:** `    encoding: 'utf8',`

**O que faz:** Compõe a operação `encoding: 'utf8',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 74

**Fonte:** `    maxBuffer: 32 * 1024 * 1024,`

**O que faz:** Compõe a operação `maxBuffer: 32 * 1024 * 1024,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 75

**Fonte:** `    env: {`

**O que faz:** Compõe a operação `env: {` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 76

**Fonte:** `      ...process.env,`

**O que faz:** Expande valores existentes na coleção/objeto usado em execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 77

**Fonte:** `      MT_JEST_BACKGROUND_DIAG: label,`

**O que faz:** Compõe a operação `MT_JEST_BACKGROUND_DIAG: label,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 78

**Fonte:** `    },`

**O que faz:** Compõe a operação `},` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 79

**Fonte:** `  });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 80

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 81

**Fonte:** `  const stdout = proc.stdout || '';`

**O que faz:** Declara a constante `stdout` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 82

**Fonte:** `  const stderr = proc.stderr || '';`

**O que faz:** Declara a constante `stderr` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 83

**Fonte:** `  const combined = stdout + '\\n' + stderr;`

**O que faz:** Declara a constante `combined` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 84

**Fonte:** `  const forcedWorkerExit = hasForcedWorkerExit(combined);`

**O que faz:** Declara a constante `forcedWorkerExit` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — `verify-jest-worker-warning-selftest.js` prova o helper `hasForcedWorkerExit`; a integração deste script com subprocessos continua indireta.

### Linha 85

**Fonte:** `  const durationMs = Date.now() - startedAt;`

**O que faz:** Declara a constante `durationMs` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 86

**Fonte:** `  const logName = String(sequence).padStart(3, '0') + '-' + safeName(label) + '.log';`

**O que faz:** Declara a constante `logName` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 87

**Fonte:** `  const logPath = path.join(logDir, logName);`

**O que faz:** Declara a constante `logPath` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 88

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 89

**Fonte:** `  fs.writeFileSync(logPath, [`

**O que faz:** Persiste evidência diagnóstica em disco de forma síncrona.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 90

**Fonte:** `    '# label=' + label,`

**O que faz:** Compõe a operação `'# label=' + label,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 91

**Fonte:** `    '# workers=' + (workers === null ? 'default' : String(workers)),`

**O que faz:** Compõe a operação `'# workers=' + (workers === null ? 'default' : String(workers)),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 92

**Fonte:** `    '# fileCount=' + String(files.length),`

**O que faz:** Compõe a operação `'# fileCount=' + String(files.length),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 93

**Fonte:** `    '# status=' + String(proc.status),`

**O que faz:** Compõe a operação `'# status=' + String(proc.status),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 94

**Fonte:** `    '# signal=' + String(proc.signal || ''),`

**O que faz:** Compõe a operação `'# signal=' + String(proc.signal || ''),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 95

**Fonte:** `    '# forcedWorkerExit=' + String(forcedWorkerExit),`

**O que faz:** Compõe a operação `'# forcedWorkerExit=' + String(forcedWorkerExit),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 96

**Fonte:** `    '# durationMs=' + String(durationMs),`

**O que faz:** Compõe a operação `'# durationMs=' + String(durationMs),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 97

**Fonte:** `    '# files=' + JSON.stringify(files),`

**O que faz:** Compõe a operação `'# files=' + JSON.stringify(files),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 98

**Fonte:** `    '',`

**O que faz:** Compõe a operação `'',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 99

**Fonte:** `    '===== STDOUT =====',`

**O que faz:** Compõe a operação `'===== STDOUT =====',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 100

**Fonte:** `    stdout,`

**O que faz:** Compõe a operação `stdout,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 101

**Fonte:** `    '',`

**O que faz:** Compõe a operação `'',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 102

**Fonte:** `    '===== STDERR =====',`

**O que faz:** Compõe a operação `'===== STDERR =====',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 103

**Fonte:** `    stderr,`

**O que faz:** Compõe a operação `stderr,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 104

**Fonte:** `    '',`

**O que faz:** Compõe a operação `'',` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 105

**Fonte:** `  ].join('\\n'));`

**O que faz:** Compõe a operação `].join('\n'));` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 106

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 107

**Fonte:** `  const record = {`

**O que faz:** Declara a constante `record` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 108

**Fonte:** `    sequence,`

**O que faz:** Compõe a operação `sequence,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 109

**Fonte:** `    label,`

**O que faz:** Compõe a operação `label,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 110

**Fonte:** `    workers: workers === null ? 'default' : workers,`

**O que faz:** Compõe a operação `workers: workers === null ? 'default' : workers,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 111

**Fonte:** `    fileCount: files.length,`

**O que faz:** Compõe a operação `fileCount: files.length,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 112

**Fonte:** `    files,`

**O que faz:** Compõe a operação `files,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 113

**Fonte:** `    status: proc.status,`

**O que faz:** Compõe a operação `status: proc.status,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 114

**Fonte:** `    signal: proc.signal || null,`

**O que faz:** Compõe a operação `signal: proc.signal || null,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 115

**Fonte:** `    forcedWorkerExit,`

**O que faz:** Compõe a operação `forcedWorkerExit,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 116

**Fonte:** `    durationMs,`

**O que faz:** Compõe a operação `durationMs,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 117

**Fonte:** `    error: proc.error ? proc.error.message : null,`

**O que faz:** Compõe a operação `error: proc.error ? proc.error.message : null,` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 118

**Fonte:** `    interestingLines: compactOutput(combined),`

**O que faz:** Compõe a operação `interestingLines: compactOutput(combined),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 119

**Fonte:** `    logFile: path.relative(repoRoot, logPath).replace(/\\\\/g, '/'),`

**O que faz:** Compõe a operação `logFile: path.relative(repoRoot, logPath).replace(/\\/g, '/'),` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 120

**Fonte:** `  };`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 121

**Fonte:** `  records.push(record);`

**O que faz:** Acrescenta o record desta tentativa ao histórico global incluído no summary.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 122

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 123

**Fonte:** `  const marker = forcedWorkerExit ? 'LEAK' : (proc.status === 0 ? 'CLEAN' : 'FAIL');`

**O que faz:** Declara a constante `marker` que participa de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 124

**Fonte:** `  console.log(`

**O que faz:** Emite telemetria de console para tornar execução de uma tentativa Jest e captura de evidências observável no log da CI.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 125

**Fonte:** `    '[background-leak] ' + marker +`

**O que faz:** Compõe a operação `'[background-leak] ' + marker +` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 126

**Fonte:** `    ' #' + String(sequence) +`

**O que faz:** Compõe a operação `' #' + String(sequence) +` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 127

**Fonte:** `    ' label=' + label +`

**O que faz:** Compõe a operação `' label=' + label +` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 128

**Fonte:** `    ' workers=' + String(record.workers) +`

**O que faz:** Compõe a operação `' workers=' + String(record.workers) +` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 129

**Fonte:** `    ' files=' + String(files.length) +`

**O que faz:** Compõe a operação `' files=' + String(files.length) +` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 130

**Fonte:** `    ' ms=' + String(durationMs)`

**O que faz:** Compõe a operação `' ms=' + String(durationMs)` dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 131

**Fonte:** `  );`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 132

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 133

**Fonte:** `  return record;`

**O que faz:** Retorna o valor estruturado produzido por execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 134

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de execução de uma tentativa Jest e captura de evidências.

**Como faz:** `runOnce` monta a CLI Jest do projeto `background`, opcionalmente fixa `--maxWorkers`, usa `spawnSync`, detecta o warning por helper compartilhado, grava log bruto e adiciona um record estruturado.

**Por que foi implementado dessa forma:** Cada probe precisa ser uma execução isolada, numerada e auditável; stdout/stderr e metadados precisam sobreviver para explicar por que um subconjunto foi classificado.

**Por que uma implementação ingênua seria pior:** Sem log por tentativa seria impossível distinguir leak de falha comum; sem timeout, um Jest travado pode bloquear a bisection; `maxBuffer` também pode gerar erro de subprocesso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o job CI chama o script real. A detecção textual usada na linha 84 tem self-test direto no helper, mas a orquestração `spawnSync`/logging não tem self-test.

### Linha 135

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não existe self-test que prove a política combinada de `leak`, `failures` e `attempts`.

### Linha 136

**Fonte:** `function probe({ label, files, workers, repeats = 1 }) {`

**O que faz:** Abre a função `probe`, responsável por agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 137

**Fonte:** `  const attempts = [];`

**O que faz:** Declara a constante `attempts` que participa de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 138

**Fonte:** `  for (let i = 0; i < repeats; i += 1) {`

**O que faz:** Itera sobre elementos/tentativas necessários em agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 139

**Fonte:** `    attempts.push(runOnce({`

**O que faz:** Acrescenta uma execução de `runOnce` ao conjunto de tentativas do probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 140

**Fonte:** `      label: label + '-r' + String(i + 1),`

**O que faz:** Compõe a operação `label: label + '-r' + String(i + 1),` dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 141

**Fonte:** `      files,`

**O que faz:** Compõe a operação `files,` dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 142

**Fonte:** `      workers,`

**O que faz:** Compõe a operação `workers,` dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 143

**Fonte:** `    }));`

**O que faz:** Compõe a operação `}));` dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 144

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 145

**Fonte:** `  return {`

**O que faz:** Retorna o valor estruturado produzido por agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 146

**Fonte:** `    leak: attempts.some((attempt) => attempt.forcedWorkerExit),`

**O que faz:** Compõe a operação `leak: attempts.some((attempt) => attempt.forcedWorkerExit),` dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 147

**Fonte:** `    failures: attempts.filter((attempt) => attempt.status !== 0 && !attempt.forcedWorkerExit),`

**O que faz:** Compõe a operação `failures: attempts.filter((attempt) => attempt.status !== 0 && !attempt.forcedWorkerExit),` dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 148

**Fonte:** `    attempts,`

**O que faz:** Compõe a operação `attempts,` dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 149

**Fonte:** `  };`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 150

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de agregação de tentativas em um probe.

**Como faz:** `probe` repete `runOnce`, considera leak quando qualquer tentativa contém o warning alvo e separa falhas comuns em `failures`.

**Por que foi implementado dessa forma:** Repetição reduz falso negativo de race e preserva a diferença conceitual entre worker leak e falha Jest comum.

**Por que uma implementação ingênua seria pior:** Embora `failures` seja calculado, os fluxos principais não o usam para decidir falha; isso pode gerar falso verde quando Jest falha sem o warning alvo (`076-002`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `probe` não tem self-test focal; a lacuna de propagação de `failures` está registrada em `076-002`.

### Linha 151

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 152

**Fonte:** `function partition(items, count) {`

**O que faz:** Abre a função `partition`, responsável por primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 153

**Fonte:** `  const result = [];`

**O que faz:** Declara a constante `result` que participa de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 154

**Fonte:** `  const size = Math.ceil(items.length / count);`

**O que faz:** Declara a constante `size` que participa de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 155

**Fonte:** `  for (let i = 0; i < items.length; i += size) {`

**O que faz:** Itera sobre elementos/tentativas necessários em primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 156

**Fonte:** `    result.push(items.slice(i, i + size));`

**O que faz:** Adiciona um chunk calculado ao vetor de partições.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 157

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 158

**Fonte:** `  return result;`

**O que faz:** Retorna o valor estruturado produzido por primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 159

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 160

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 161

**Fonte:** `function complement(items, chunk) {`

**O que faz:** Abre a função `complement`, responsável por primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 162

**Fonte:** `  const excluded = new Set(chunk);`

**O que faz:** Declara a constante `excluded` que participa de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 163

**Fonte:** `  return items.filter((item) => !excluded.has(item));`

**O que faz:** Retorna o valor estruturado produzido por primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 164

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de primitivas de partição e complemento para ddmin.

**Como faz:** `partition` fatia o candidato em grupos aproximadamente iguais; `complement` remove os elementos de um chunk via `Set`.

**Por que foi implementado dessa forma:** Delta debugging precisa testar tanto partes quanto complementos para reduzir um conjunto que preserva o sintoma.

**Por que uma implementação ingênua seria pior:** Partições inconsistentes ou complemento incorreto podem perder a combinação mínima ou executar subconjuntos errados.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não foram encontrados testes unitários dessas primitivas.

### Linha 165

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 166

**Fonte:** `function tryCrossInteractionNarrowing({ left, right, workers, iteration }) {`

**O que faz:** Abre a função `tryCrossInteractionNarrowing`, responsável por redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 167

**Fonte:** `  // Quando left e right ficam limpos isoladamente mas left+right vaza,`

**O que faz:** Comentário de manutenção que registra: `Quando left e right ficam limpos isoladamente mas left+right vaza,`.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 168

**Fonte:** `  // existe interação entre os grupos. Primeiro procure um único arquivo de`

**O que faz:** Comentário de manutenção que registra: `existe interação entre os grupos. Primeiro procure um único arquivo de`.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 169

**Fonte:** `  // left que, junto com todo right, preserve o leak. Depois faça o inverso.`

**O que faz:** Comentário de manutenção que registra: `left que, junto com todo right, preserve o leak. Depois faça o inverso.`.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 170

**Fonte:** `  // Isso reduz muito mais rápido do que aumentar cegamente a granularidade.`

**O que faz:** Comentário de manutenção que registra: `Isso reduz muito mais rápido do que aumentar cegamente a granularidade.`.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 171

**Fonte:** `  for (let i = 0; i < left.length; i += 1) {`

**O que faz:** Itera sobre elementos/tentativas necessários em redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 172

**Fonte:** `    const combined = [left[i], ...right];`

**O que faz:** Declara a constante `combined` que participa de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 173

**Fonte:** `    const result = probe({`

**O que faz:** Declara a constante `result` que participa de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 174

**Fonte:** `      label: 'cross-i' + String(iteration) + '-left' + String(i + 1),`

**O que faz:** Compõe a operação `label: 'cross-i' + String(iteration) + '-left' + String(i + 1),` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 175

**Fonte:** `      files: combined,`

**O que faz:** Compõe a operação `files: combined,` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 176

**Fonte:** `      workers,`

**O que faz:** Compõe a operação `workers,` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 177

**Fonte:** `      repeats: 2,`

**O que faz:** Compõe a operação `repeats: 2,` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 178

**Fonte:** `    });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 179

**Fonte:** `    if (result.leak) {`

**O que faz:** Abre uma condição que decide um ramo de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 180

**Fonte:** `      return { files: combined, side: 'left', pivot: left[i] };`

**O que faz:** Retorna o valor estruturado produzido por redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 181

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 182

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 183

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 184

**Fonte:** `  for (let i = 0; i < right.length; i += 1) {`

**O que faz:** Itera sobre elementos/tentativas necessários em redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 185

**Fonte:** `    const combined = [...left, right[i]];`

**O que faz:** Declara a constante `combined` que participa de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 186

**Fonte:** `    const result = probe({`

**O que faz:** Declara a constante `result` que participa de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 187

**Fonte:** `      label: 'cross-i' + String(iteration) + '-right' + String(i + 1),`

**O que faz:** Compõe a operação `label: 'cross-i' + String(iteration) + '-right' + String(i + 1),` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 188

**Fonte:** `      files: combined,`

**O que faz:** Compõe a operação `files: combined,` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 189

**Fonte:** `      workers,`

**O que faz:** Compõe a operação `workers,` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 190

**Fonte:** `      repeats: 2,`

**O que faz:** Compõe a operação `repeats: 2,` dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 191

**Fonte:** `    });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 192

**Fonte:** `    if (result.leak) {`

**O que faz:** Abre uma condição que decide um ramo de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 193

**Fonte:** `      return { files: combined, side: 'right', pivot: right[i] };`

**O que faz:** Retorna o valor estruturado produzido por redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 194

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 195

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 196

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 197

**Fonte:** `  return null;`

**O que faz:** Retorna o valor estruturado produzido por redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 198

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de redução de interações cruzadas.

**Como faz:** Quando dois lados são limpos isoladamente, a função combina um único pivô de um lado com o outro lado inteiro, primeiro left→right e depois right→left, repetindo cada probe duas vezes.

**Por que foi implementado dessa forma:** Leaks por interação entre arquivos não são reduzidos por um ddmin ingênuo que só testa partes isoladas; a estratégia tenta preservar a interação com menos arquivos.

**Por que uma implementação ingênua seria pior:** O loop pode disparar muitos subprocessos e não consulta `maxProbes` internamente; isso torna o orçamento global aproximado (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há fixture que modele um leak exclusivamente por interação cruzada.

### Linha 199

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 200

**Fonte:** `console.log('[background-leak] node=' + process.version +`

**O que faz:** Emite telemetria de console para tornar telemetria inicial e seleção/validação do override de workers observável no log da CI.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 201

**Fonte:** `  ' platform=' + process.platform +`

**O que faz:** Compõe a operação `' platform=' + process.platform +` dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 202

**Fonte:** `  ' cpuCount=' + String(os.cpus().length) +`

**O que faz:** Compõe a operação `' cpuCount=' + String(os.cpus().length) +` dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 203

**Fonte:** `  ' backgroundFiles=' + String(allFiles.length));`

**O que faz:** Compõe a operação `' backgroundFiles=' + String(allFiles.length));` dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 204

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 205

**Fonte:** `if (!allFiles.length) {`

**O que faz:** Abre uma condição que decide um ramo de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 206

**Fonte:** `  console.error('[background-leak] nenhum teste de background encontrado.');`

**O que faz:** Emite telemetria de console para tornar telemetria inicial e seleção/validação do override de workers observável no log da CI.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 207

**Fonte:** `  process.exit(1);`

**O que faz:** Encerra imediatamente o diagnóstico com o código explícito desta linha.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 208

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 209

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 210

**Fonte:** `// 1) Escolher o nível de paralelismo.`

**O que faz:** Comentário de manutenção que registra: `1) Escolher o nível de paralelismo.`.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 211

**Fonte:** `// A CI pode fornecer MT_BACKGROUND_LEAK_WORKERS quando uma rodada anterior já`

**O que faz:** Comentário de manutenção que registra: `A CI pode fornecer MT_BACKGROUND_LEAK_WORKERS quando uma rodada anterior já`.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 212

**Fonte:** `// isolou um valor reproduzível (no PR #47, w2 ficou limpo e w3 reproduziu).`

**O que faz:** Comentário de manutenção que registra: `isolou um valor reproduzível (no PR #47, w2 ficou limpo e w3 reproduziu).`.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 213

**Fonte:** `// Sem override, preservamos o sweep completo para uso independente/local.`

**O que faz:** Comentário de manutenção que registra: `Sem override, preservamos o sweep completo para uso independente/local.`.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 214

**Fonte:** `const requestedWorkersRaw = String(process.env.MT_BACKGROUND_LEAK_WORKERS || '').trim();`

**O que faz:** Declara a constante `requestedWorkersRaw` que participa de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 215

**Fonte:** `const requestedWorkers = requestedWorkersRaw === ''`

**O que faz:** Declara a constante `requestedWorkers` que participa de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 216

**Fonte:** `  ? undefined`

**O que faz:** Continua a expressão encadeada/condicional que implementa telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 217

**Fonte:** `  : (requestedWorkersRaw === 'default' ? null : Number(requestedWorkersRaw));`

**O que faz:** Continua a expressão encadeada/condicional que implementa telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 218

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 219

**Fonte:** `if (`

**O que faz:** Abre uma condição que decide um ramo de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 220

**Fonte:** `  requestedWorkers !== undefined &&`

**O que faz:** Compõe a operação `requestedWorkers !== undefined &&` dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 221

**Fonte:** `  requestedWorkers !== null &&`

**O que faz:** Compõe a operação `requestedWorkers !== null &&` dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 222

**Fonte:** `  (!Number.isInteger(requestedWorkers) || requestedWorkers < 1)`

**O que faz:** Compõe a operação `(!Number.isInteger(requestedWorkers) || requestedWorkers < 1)` dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 223

**Fonte:** `) {`

**O que faz:** Compõe a operação `) {` dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 224

**Fonte:** `  console.error('[background-leak] MT_BACKGROUND_LEAK_WORKERS inválido: ' + requestedWorkersRaw);`

**O que faz:** Emite telemetria de console para tornar telemetria inicial e seleção/validação do override de workers observável no log da CI.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 225

**Fonte:** `  process.exit(64);`

**O que faz:** Encerra imediatamente o diagnóstico com o código explícito desta linha.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 226

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de telemetria inicial e seleção/validação do override de workers.

**Como faz:** O script imprime Node/plataforma/CPU/inventário, aborta corpus vazio e interpreta `MT_BACKGROUND_LEAK_WORKERS` como ausente, `default` ou inteiro >=1.

**Por que foi implementado dessa forma:** A quantidade de workers é parte do fenômeno investigado; a CI pode repetir um modo já conhecido enquanto execução local pode fazer sweep.

**Por que uma implementação ingênua seria pior:** Entrada inválida encerra com 64 e sem summary; não há teto de workers e o valor `default` delega concorrência ao Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI atual injeta `MT_BACKGROUND_LEAK_WORKERS="3"`; branches inválidos/default não têm self-test.

### Linha 227

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 228

**Fonte:** `let leakingModes = [];`

**O que faz:** Declara o estado mutável `leakingModes` usado em baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 229

**Fonte:** `let selectedWorkers;`

**O que faz:** Declara o estado mutável `selectedWorkers` usado em baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 230

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 231

**Fonte:** `if (requestedWorkers !== undefined) {`

**O que faz:** Abre uma condição que decide um ramo de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 232

**Fonte:** `  const baseline = probe({`

**O que faz:** Declara a constante `baseline` que participa de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 233

**Fonte:** `    label: 'baseline-' + (requestedWorkers === null ? 'default' : 'w' + String(requestedWorkers)),`

**O que faz:** Compõe a operação `label: 'baseline-' + (requestedWorkers === null ? 'default' : 'w' + String(requestedWorkers)),` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 234

**Fonte:** `    files: allFiles,`

**O que faz:** Compõe a operação `files: allFiles,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 235

**Fonte:** `    workers: requestedWorkers,`

**O que faz:** Compõe a operação `workers: requestedWorkers,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 236

**Fonte:** `    repeats: 2,`

**O que faz:** Compõe a operação `repeats: 2,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 237

**Fonte:** `  });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 238

**Fonte:** `  const leakCount = baseline.attempts.filter((attempt) => attempt.forcedWorkerExit).length;`

**O que faz:** Declara a constante `leakCount` que participa de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 239

**Fonte:** `  if (leakCount === 0) {`

**O que faz:** Abre uma condição que decide um ramo de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 240

**Fonte:** `    const summary = {`

**O que faz:** Declara a constante `summary` que participa de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 241

**Fonte:** `      generatedAt: new Date().toISOString(),`

**O que faz:** Compõe a operação `generatedAt: new Date().toISOString(),` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 242

**Fonte:** `      node: process.version,`

**O que faz:** Compõe a operação `node: process.version,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 243

**Fonte:** `      cpuCount: os.cpus().length,`

**O que faz:** Compõe a operação `cpuCount: os.cpus().length,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 244

**Fonte:** `      backgroundFiles: allFiles,`

**O que faz:** Compõe a operação `backgroundFiles: allFiles,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 245

**Fonte:** `      selectedWorkers: requestedWorkers === null ? 'default' : requestedWorkers,`

**O que faz:** Compõe a operação `selectedWorkers: requestedWorkers === null ? 'default' : requestedWorkers,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 246

**Fonte:** `      requestedWorkersDidNotReproduce: true,`

**O que faz:** Compõe a operação `requestedWorkersDidNotReproduce: true,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 247

**Fonte:** `      records,`

**O que faz:** Compõe a operação `records,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 248

**Fonte:** `    };`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 249

**Fonte:** `    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\\n');`

**O que faz:** Persiste evidência diagnóstica em disco de forma síncrona.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 250

**Fonte:** `    console.log('[background-leak] override não reproduziu o warning em 2 tentativas.');`

**O que faz:** Emite telemetria de console para tornar baseline com override ou sweep de modos de workers observável no log da CI.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 251

**Fonte:** `    process.exit(0);`

**O que faz:** Encerra imediatamente o diagnóstico com o código explícito desta linha.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 252

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 253

**Fonte:** `  leakingModes = [{ workers: requestedWorkers, leakCount }];`

**O que faz:** Compõe a operação `leakingModes = [{ workers: requestedWorkers, leakCount }];` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 254

**Fonte:** `  selectedWorkers = requestedWorkers;`

**O que faz:** Compõe a operação `selectedWorkers = requestedWorkers;` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 255

**Fonte:** `} else {`

**O que faz:** Compõe a operação `} else {` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 256

**Fonte:** `  // Duas execuções por modo reduzem a chance de escolher um falso negativo de race.`

**O que faz:** Comentário de manutenção que registra: `Duas execuções por modo reduzem a chance de escolher um falso negativo de race.`.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 257

**Fonte:** `  const modes = [1, 2, 3, 4, null];`

**O que faz:** Declara a constante `modes` que participa de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 258

**Fonte:** `  const sweep = modes.map((workers) => ({`

**O que faz:** Declara a constante `sweep` que participa de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 259

**Fonte:** `    workers,`

**O que faz:** Compõe a operação `workers,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 260

**Fonte:** `    result: probe({`

**O que faz:** Compõe a operação `result: probe({` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 261

**Fonte:** `      label: 'sweep-' + (workers === null ? 'default' : 'w' + String(workers)),`

**O que faz:** Compõe a operação `label: 'sweep-' + (workers === null ? 'default' : 'w' + String(workers)),` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 262

**Fonte:** `      files: allFiles,`

**O que faz:** Compõe a operação `files: allFiles,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 263

**Fonte:** `      workers,`

**O que faz:** Compõe a operação `workers,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 264

**Fonte:** `      repeats: 2,`

**O que faz:** Compõe a operação `repeats: 2,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 265

**Fonte:** `    }),`

**O que faz:** Compõe a operação `}),` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 266

**Fonte:** `  }));`

**O que faz:** Compõe a operação `}));` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 267

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 268

**Fonte:** `  leakingModes = sweep`

**O que faz:** Compõe a operação `leakingModes = sweep` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 269

**Fonte:** `    .map((entry) => ({`

**O que faz:** Continua a expressão encadeada/condicional que implementa baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 270

**Fonte:** `      workers: entry.workers,`

**O que faz:** Compõe a operação `workers: entry.workers,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 271

**Fonte:** `      leakCount: entry.result.attempts.filter((attempt) => attempt.forcedWorkerExit).length,`

**O que faz:** Compõe a operação `leakCount: entry.result.attempts.filter((attempt) => attempt.forcedWorkerExit).length,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 272

**Fonte:** `    }))`

**O que faz:** Compõe a operação `}))` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 273

**Fonte:** `    .filter((entry) => entry.leakCount > 0)`

**O que faz:** Continua a expressão encadeada/condicional que implementa baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 274

**Fonte:** `    .sort((a, b) => {`

**O que faz:** Continua a expressão encadeada/condicional que implementa baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 275

**Fonte:** `      if (b.leakCount !== a.leakCount) return b.leakCount - a.leakCount;`

**O que faz:** Abre uma condição que decide um ramo de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 276

**Fonte:** `      if (a.workers === null) return 1;`

**O que faz:** Abre uma condição que decide um ramo de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 277

**Fonte:** `      if (b.workers === null) return -1;`

**O que faz:** Abre uma condição que decide um ramo de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 278

**Fonte:** `      return Number(a.workers) - Number(b.workers);`

**O que faz:** Retorna o valor estruturado produzido por baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 279

**Fonte:** `    });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 280

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 281

**Fonte:** `  if (!leakingModes.length) {`

**O que faz:** Abre uma condição que decide um ramo de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 282

**Fonte:** `    const summary = {`

**O que faz:** Declara a constante `summary` que participa de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 283

**Fonte:** `      generatedAt: new Date().toISOString(),`

**O que faz:** Compõe a operação `generatedAt: new Date().toISOString(),` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 284

**Fonte:** `      node: process.version,`

**O que faz:** Compõe a operação `node: process.version,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 285

**Fonte:** `      cpuCount: os.cpus().length,`

**O que faz:** Compõe a operação `cpuCount: os.cpus().length,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 286

**Fonte:** `      backgroundFiles: allFiles,`

**O que faz:** Compõe a operação `backgroundFiles: allFiles,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 287

**Fonte:** `      selectedWorkers: null,`

**O que faz:** Compõe a operação `selectedWorkers: null,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 288

**Fonte:** `      historicalLeakNotReproduced: true,`

**O que faz:** Compõe a operação `historicalLeakNotReproduced: true,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 289

**Fonte:** `      records,`

**O que faz:** Compõe a operação `records,` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 290

**Fonte:** `    };`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 291

**Fonte:** `    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\\n');`

**O que faz:** Persiste evidência diagnóstica em disco de forma síncrona.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 292

**Fonte:** `    console.log('[background-leak] warning não reproduziu no sweep desta rodada.');`

**O que faz:** Emite telemetria de console para tornar baseline com override ou sweep de modos de workers observável no log da CI.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 293

**Fonte:** `    process.exit(0);`

**O que faz:** Encerra imediatamente o diagnóstico com o código explícito desta linha.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 294

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 295

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 296

**Fonte:** `  selectedWorkers = leakingModes[0].workers;`

**O que faz:** Compõe a operação `selectedWorkers = leakingModes[0].workers;` dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 297

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de baseline com override ou sweep de modos de workers.

**Como faz:** Com override, executa duas tentativas e continua só se houver warning; sem override, testa 1/2/3/4/default, conta leaks, ordena modos por reprodutibilidade e escolhe o melhor para redução.

**Por que foi implementado dessa forma:** A race histórica depende do paralelismo; repetir por modo e priorizar o que mais reproduz aumenta chance de ddmin operar sobre sinal real.

**Por que uma implementação ingênua seria pior:** As saídas `process.exit(0)` olham somente `leakCount`; falhas comuns registradas em `probe.failures` podem ser mascaradas como sucesso (`076-002`).

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — workflow usa o branch de override 3; não há assertion focal de seleção, ordenação ou exit codes.

### Linha 298

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 299

**Fonte:** `console.log('[background-leak] workers selecionados para bisection=' +`

**O que faz:** Emite telemetria de console para tornar delta debugging do conjunto de testes observável no log da CI.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 300

**Fonte:** `  (selectedWorkers === null ? 'default' : String(selectedWorkers)));`

**O que faz:** Compõe a operação `(selectedWorkers === null ? 'default' : String(selectedWorkers)));` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 301

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 302

**Fonte:** `// 2) Delta debugging (ddmin): reduz o conjunto preservando a reprodução.`

**O que faz:** Comentário de manutenção que registra: `2) Delta debugging (ddmin): reduz o conjunto preservando a reprodução.`.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 303

**Fonte:** `let candidate = [...allFiles];`

**O que faz:** Declara o estado mutável `candidate` usado em delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 304

**Fonte:** `let granularity = 2;`

**O que faz:** Declara o estado mutável `granularity` usado em delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 305

**Fonte:** `let iteration = 0;`

**O que faz:** Declara o estado mutável `iteration` usado em delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o algoritmo não possui self-test de convergência, orçamento ou interação.

### Linha 306

**Fonte:** `const maxProbes = 90;`

**O que faz:** Declara a constante `maxProbes` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 307

**Fonte:** `const probeStartSequence = sequence;`

**O que faz:** Declara a constante `probeStartSequence` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 308

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 309

**Fonte:** `while (candidate.length > 1 && (sequence - probeStartSequence) < maxProbes) {`

**O que faz:** Inicia o laço de redução enquanto ainda houver mais de um candidato e orçamento disponível.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 310

**Fonte:** `  iteration += 1;`

**O que faz:** Compõe a operação `iteration += 1;` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 311

**Fonte:** `  const chunks = partition(candidate, Math.min(granularity, candidate.length));`

**O que faz:** Declara a constante `chunks` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 312

**Fonte:** `  let reduced = false;`

**O que faz:** Declara o estado mutável `reduced` usado em delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 313

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 314

**Fonte:** `  // Primeiro: alguma parte isolada ainda reproduz?`

**O que faz:** Comentário de manutenção que registra: `Primeiro: alguma parte isolada ainda reproduz?`.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 315

**Fonte:** `  for (let i = 0; i < chunks.length; i += 1) {`

**O que faz:** Itera sobre elementos/tentativas necessários em delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 316

**Fonte:** `    const chunk = chunks[i];`

**O que faz:** Declara a constante `chunk` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 317

**Fonte:** `    const result = probe({`

**O que faz:** Declara a constante `result` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 318

**Fonte:** `      label: 'ddmin-i' + String(iteration) + '-part' + String(i + 1),`

**O que faz:** Compõe a operação `label: 'ddmin-i' + String(iteration) + '-part' + String(i + 1),` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 319

**Fonte:** `      files: chunk,`

**O que faz:** Compõe a operação `files: chunk,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 320

**Fonte:** `      workers: selectedWorkers,`

**O que faz:** Compõe a operação `workers: selectedWorkers,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 321

**Fonte:** `      repeats: 2,`

**O que faz:** Compõe a operação `repeats: 2,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 322

**Fonte:** `    });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 323

**Fonte:** `    if (result.leak) {`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 324

**Fonte:** `      candidate = chunk;`

**O que faz:** Substitui o conjunto candidato pelo subconjunto que preservou o leak.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 325

**Fonte:** `      granularity = 2;`

**O que faz:** Atualiza a granularidade que controla quantas partes o próximo ciclo tentará.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 326

**Fonte:** `      reduced = true;`

**O que faz:** Compõe a operação `reduced = true;` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 327

**Fonte:** `      console.log('[background-leak] reduzido por parte para ' + String(candidate.length) + ' arquivo(s).');`

**O que faz:** Emite telemetria de console para tornar delta debugging do conjunto de testes observável no log da CI.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 328

**Fonte:** `      break;`

**O que faz:** Compõe a operação `break;` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 329

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 330

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 331

**Fonte:** `  if (reduced) continue;`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 332

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 333

**Fonte:** `  // Depois: se nenhuma parte sozinha reproduz, tente os complementos.`

**O que faz:** Comentário de manutenção que registra: `Depois: se nenhuma parte sozinha reproduz, tente os complementos.`.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 334

**Fonte:** `  for (let i = 0; i < chunks.length; i += 1) {`

**O que faz:** Itera sobre elementos/tentativas necessários em delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 335

**Fonte:** `    const rest = complement(candidate, chunks[i]);`

**O que faz:** Declara a constante `rest` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 336

**Fonte:** `    if (!rest.length) continue;`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 337

**Fonte:** `    const result = probe({`

**O que faz:** Declara a constante `result` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 338

**Fonte:** `      label: 'ddmin-i' + String(iteration) + '-complement' + String(i + 1),`

**O que faz:** Compõe a operação `label: 'ddmin-i' + String(iteration) + '-complement' + String(i + 1),` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 339

**Fonte:** `      files: rest,`

**O que faz:** Compõe a operação `files: rest,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 340

**Fonte:** `      workers: selectedWorkers,`

**O que faz:** Compõe a operação `workers: selectedWorkers,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 341

**Fonte:** `      repeats: 2,`

**O que faz:** Compõe a operação `repeats: 2,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 342

**Fonte:** `    });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 343

**Fonte:** `    if (result.leak) {`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 344

**Fonte:** `      candidate = rest;`

**O que faz:** Substitui o conjunto candidato pelo subconjunto que preservou o leak.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 345

**Fonte:** `      granularity = Math.max(2, granularity - 1);`

**O que faz:** Atualiza a granularidade que controla quantas partes o próximo ciclo tentará.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 346

**Fonte:** `      reduced = true;`

**O que faz:** Compõe a operação `reduced = true;` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 347

**Fonte:** `      console.log('[background-leak] reduzido por complemento para ' + String(candidate.length) + ' arquivo(s).');`

**O que faz:** Emite telemetria de console para tornar delta debugging do conjunto de testes observável no log da CI.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 348

**Fonte:** `      break;`

**O que faz:** Compõe a operação `break;` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 349

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 350

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 351

**Fonte:** `  if (reduced) continue;`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 352

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 353

**Fonte:** `  // Caso clássico de interação: com granularidade 2, nenhum lado sozinho`

**O que faz:** Comentário de manutenção que registra: `Caso clássico de interação: com granularidade 2, nenhum lado sozinho`.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 354

**Fonte:** `  // reproduz e nenhum complemento reproduz, mas o conjunto completo sim.`

**O que faz:** Comentário de manutenção que registra: `reproduz e nenhum complemento reproduz, mas o conjunto completo sim.`.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 355

**Fonte:** `  // Tente preservar um lado inteiro e reduzir o outro a um pivô.`

**O que faz:** Comentário de manutenção que registra: `Tente preservar um lado inteiro e reduzir o outro a um pivô.`.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 356

**Fonte:** `  if (chunks.length === 2) {`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 357

**Fonte:** `    const cross = tryCrossInteractionNarrowing({`

**O que faz:** Declara a constante `cross` que participa de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 358

**Fonte:** `      left: chunks[0],`

**O que faz:** Compõe a operação `left: chunks[0],` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 359

**Fonte:** `      right: chunks[1],`

**O que faz:** Compõe a operação `right: chunks[1],` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 360

**Fonte:** `      workers: selectedWorkers,`

**O que faz:** Compõe a operação `workers: selectedWorkers,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 361

**Fonte:** `      iteration,`

**O que faz:** Compõe a operação `iteration,` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 362

**Fonte:** `    });`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 363

**Fonte:** `    if (cross && cross.files.length < candidate.length) {`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 364

**Fonte:** `      candidate = cross.files;`

**O que faz:** Substitui o conjunto candidato pelo subconjunto que preservou o leak.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 365

**Fonte:** `      granularity = 2;`

**O que faz:** Atualiza a granularidade que controla quantas partes o próximo ciclo tentará.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 366

**Fonte:** `      console.log(`

**O que faz:** Emite telemetria de console para tornar delta debugging do conjunto de testes observável no log da CI.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 367

**Fonte:** `        '[background-leak] reduzido por interação (' + cross.side + ') para ' +`

**O que faz:** Compõe a operação `'[background-leak] reduzido por interação (' + cross.side + ') para ' +` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 368

**Fonte:** `        String(candidate.length) + ' arquivo(s); pivot=' + cross.pivot`

**O que faz:** Compõe a operação `String(candidate.length) + ' arquivo(s); pivot=' + cross.pivot` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 369

**Fonte:** `      );`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 370

**Fonte:** `      continue;`

**O que faz:** Compõe a operação `continue;` dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 371

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 372

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 373

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 374

**Fonte:** `  if (granularity >= candidate.length) break;`

**O que faz:** Abre uma condição que decide um ramo de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 375

**Fonte:** `  granularity = Math.min(candidate.length, granularity * 2);`

**O que faz:** Atualiza a granularidade que controla quantas partes o próximo ciclo tentará.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 376

**Fonte:** `  console.log('[background-leak] aumentando granularidade para ' + String(granularity));`

**O que faz:** Emite telemetria de console para tornar delta debugging do conjunto de testes observável no log da CI.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 377

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de delta debugging do conjunto de testes.

**Como faz:** O laço parte do universo, testa chunks, depois complementos, tenta narrowing cruzado quando há dois lados e aumenta granularidade se nada reduz o candidato.

**Por que foi implementado dessa forma:** O objetivo é localizar o menor subconjunto que ainda reproduz o warning sem testar todas as combinações possíveis.

**Por que uma implementação ingênua seria pior:** O budget `maxProbes=90` só é checado ao iniciar o `while`; probes internos têm duas tentativas e o narrowing cruzado pode ultrapassar muito esse número (`076-004`).

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — não há teste focal do ddmin/orçamento; `076-004` registra que o teto de 90 não é estrito.

### Linha 378

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 379

**Fonte:** `// 3) Confirmação final para distinguir conjunto mínimo real de race esporádica.`

**O que faz:** Comentário de manutenção que registra: `3) Confirmação final para distinguir conjunto mínimo real de race esporádica.`.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 380

**Fonte:** `const confirmation = probe({`

**O que faz:** Declara a constante `confirmation` que participa de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 381

**Fonte:** `  label: 'final-candidate',`

**O que faz:** Compõe a operação `label: 'final-candidate',` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 382

**Fonte:** `  files: candidate,`

**O que faz:** Compõe a operação `files: candidate,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 383

**Fonte:** `  workers: selectedWorkers,`

**O que faz:** Compõe a operação `workers: selectedWorkers,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 384

**Fonte:** `  repeats: 4,`

**O que faz:** Compõe a operação `repeats: 4,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 385

**Fonte:** `});`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 386

**Fonte:** `const confirmationLeakCount = confirmation.attempts`

**O que faz:** Declara a constante `confirmationLeakCount` que participa de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 387

**Fonte:** `  .filter((attempt) => attempt.forcedWorkerExit).length;`

**O que faz:** Continua a expressão encadeada/condicional que implementa confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 388

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 389

**Fonte:** `const summary = {`

**O que faz:** Declara a constante `summary` que participa de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 390

**Fonte:** `  generatedAt: new Date().toISOString(),`

**O que faz:** Compõe a operação `generatedAt: new Date().toISOString(),` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 391

**Fonte:** `  node: process.version,`

**O que faz:** Compõe a operação `node: process.version,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 392

**Fonte:** `  platform: process.platform,`

**O que faz:** Compõe a operação `platform: process.platform,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 393

**Fonte:** `  arch: process.arch,`

**O que faz:** Compõe a operação `arch: process.arch,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 394

**Fonte:** `  cpuCount: os.cpus().length,`

**O que faz:** Compõe a operação `cpuCount: os.cpus().length,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 395

**Fonte:** `  initialFileCount: allFiles.length,`

**O que faz:** Compõe a operação `initialFileCount: allFiles.length,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 396

**Fonte:** `  selectedWorkers: selectedWorkers === null ? 'default' : selectedWorkers,`

**O que faz:** Compõe a operação `selectedWorkers: selectedWorkers === null ? 'default' : selectedWorkers,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 397

**Fonte:** `  leakingModes: leakingModes.map((entry) => ({`

**O que faz:** Compõe a operação `leakingModes: leakingModes.map((entry) => ({` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 398

**Fonte:** `    workers: entry.workers === null ? 'default' : entry.workers,`

**O que faz:** Compõe a operação `workers: entry.workers === null ? 'default' : entry.workers,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 399

**Fonte:** `    leakCount: entry.leakCount,`

**O que faz:** Compõe a operação `leakCount: entry.leakCount,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 400

**Fonte:** `  })),`

**O que faz:** Compõe a operação `})),` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 401

**Fonte:** `  candidateFileCount: candidate.length,`

**O que faz:** Compõe a operação `candidateFileCount: candidate.length,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 402

**Fonte:** `  candidateFiles: candidate,`

**O que faz:** Compõe a operação `candidateFiles: candidate,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 403

**Fonte:** `  confirmationLeakCount,`

**O que faz:** Compõe a operação `confirmationLeakCount,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 404

**Fonte:** `  confirmationAttempts: confirmation.attempts.length,`

**O que faz:** Compõe a operação `confirmationAttempts: confirmation.attempts.length,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 405

**Fonte:** `  records,`

**O que faz:** Compõe a operação `records,` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 406

**Fonte:** `};`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 407

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 408

**Fonte:** `fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\\n');`

**O que faz:** Persiste evidência diagnóstica em disco de forma síncrona.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 409

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 410

**Fonte:** `console.log('\\n[background-leak] RESULTADO');`

**O que faz:** Emite telemetria de console para tornar confirmação final, summary e código de saída observável no log da CI.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 411

**Fonte:** `console.log('[background-leak] candidateFileCount=' + String(candidate.length));`

**O que faz:** Emite telemetria de console para tornar confirmação final, summary e código de saída observável no log da CI.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 412

**Fonte:** `for (const file of candidate) console.log('[background-leak] candidate=' + file);`

**O que faz:** Itera sobre elementos/tentativas necessários em confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 413

**Fonte:** `console.log('[background-leak] confirmation=' +`

**O que faz:** Emite telemetria de console para tornar confirmação final, summary e código de saída observável no log da CI.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 414

**Fonte:** `  String(confirmationLeakCount) + '/' + String(confirmation.attempts.length));`

**O que faz:** Compõe a operação `String(confirmationLeakCount) + '/' + String(confirmation.attempts.length));` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 415

**Fonte:** `console.log('[background-leak] summary=' +`

**O que faz:** Emite telemetria de console para tornar confirmação final, summary e código de saída observável no log da CI.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 416

**Fonte:** `  path.relative(repoRoot, summaryFile).replace(/\\\\/g, '/'));`

**O que faz:** Compõe a operação `path.relative(repoRoot, summaryFile).replace(/\\/g, '/'));` dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 417

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia que separa unidades lógicas dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 418

**Fonte:** `if (confirmationLeakCount > 0) {`

**O que faz:** Abre uma condição que decide um ramo de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 419

**Fonte:** `  process.exitCode = 2;`

**O que faz:** Define o exit code final sem abortar antes do término normal do script.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 420

**Fonte:** `}`

**O que faz:** Fecha a estrutura sintática imediatamente anterior dentro de confirmação final, summary e código de saída.

**Como faz:** O candidato final é repetido quatro vezes; o script grava ambiente, modos, arquivos candidatos, contagem de confirmações e todos os records, imprime resumo e usa exit code 2 somente se a confirmação reproduzir leak.

**Por que foi implementado dessa forma:** Separar busca de confirmação reduz chance de reportar como causa uma race que desapareceu na fase final e deixa JSON consumível como artifact.

**Por que uma implementação ingênua seria pior:** Falhas comuns da confirmação não alteram exit code se não houver warning; isso mantém o risco de falso verde. Um write de summary que falhe lança exceção sem recuperação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o workflow publica o JSON/logs com `if: always()`, mas não existe teste focal do schema nem do exit code final.

### Linha 421

**Fonte:** `␤ [newline final]`

**O que faz:** Representa o newline final do arquivo auditado.

**Como faz:** A posição 421 existe porque o blob termina em LF e não executa lógica.

**Por que foi implementado dessa forma:** A Bíblia precisa espelhar todas as posições textuais, inclusive o terminador final.

**Por que uma implementação ingênua seria pior:** Ignorar a posição terminal quebra a equivalência documental exigida pelo gate.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — a auditoria documental exige fonte integral e cobertura sequencial de todas as posições.

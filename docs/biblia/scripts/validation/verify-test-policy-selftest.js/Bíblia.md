# Bíblia técnica — scripts/validation/verify-test-policy-selftest.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOVERIFICAÇÃO DOCUMENTAL APROVADA  
> **SHA auditado:** `ac0318e4d90c5014180eb3d3a6ac4784cc70a24a`  
> **Agente responsável:** AGENTE 13  
> **Tipo:** self-test Node.js do gate de política de testes  
> **Linhas textuais:** **109**  
> **Posições documentais:** **110**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

scripts/validation/verify-test-policy-selftest.js impede que verify-test-policy.js se torne um gate sem força real. Ele cria workspaces temporários mínimos, copia a implementação real do verificador para a mesma topologia relativa e a executa como CLI Node; não replica as regex da política dentro do self-test.

O contrato atual tem um controle positivo e três negativos: a baseline válida precisa retornar zero; test.skip, --forceExit em script npm e npm run test:* || true em workflow precisam retornar não-zero e emitir o diagnóstico esperado. A mensagem final de aprovação só é alcançada se os quatro cenários satisfizerem essas condições.

## 2. Dependências, consumidores e efeitos colaterais

- Dependências Node: fs, os, path e child_process.spawnSync.
- Implementação exercitada: scripts/validation/verify-test-policy.js.
- Entrada npm: test:test-policy:infra aponta exatamente para este arquivo.
- Consumidor CI: o job ci-contract executa npm run test:test-policy:infra.
- Gate estático: verify-ci-contract.js exige o wiring e os três marcadores de cenário atuais.
- Efeitos: cria diretórios sob os.tmpdir(), grava fixtures, copia o verificador, abre processos Node síncronos e remove cada sandbox em finally.
- O checkout real não recebe as violações; somente sandboxes efêmeros são mutados.

## 3. Fluxo de execução

1. createSandbox() cria a topologia mínima esperada pelo verificador.
2. A implementação real é copiada para scripts/validation/verify-test-policy.js do sandbox.
3. Baseline: teste Jest permitido, package com test: jest, workflow com npm run test.
4. expectBaselinePasses() exige status zero.
5. expectFailure() aplica uma mutação, exige status não-zero e exige substring diagnóstica específica.
6. O helper cobre test.skip, --forceExit no package e || true no workflow.
7. Cada sandbox é removido em finally.
8. Só depois a aprovação global é impressa.

## 4. Evidência automatizada

| Contrato | Evidência | Classificação |
|---|---|---|
| baseline válida é aceita | execução real + assertion de status zero | ✅ PROVADO DIRETAMENTE |
| test.skip é rejeitado pelo motivo esperado | mutação focal + status + substring | ✅ PROVADO DIRETAMENTE |
| --forceExit em script npm é rejeitado | mutação focal + status + substring | ✅ PROVADO DIRETAMENTE |
| npm run test:* || true em workflow é rejeitado | mutação focal + status + substring | ✅ PROVADO DIRETAMENTE |
| script npm canônico aponta para este arquivo | comparação exata em verify-ci-contract.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workflow chama o self-test | gate estático + workflow | 🟦 GATE ESTÁTICO ESPECÍFICO |
| .only e test.todo | protegidos pelo verificador, sem cenário negativo aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste self-test |
| --passWithNoTests | protegido em vários escopos, sem cenário negativo aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste self-test |
| --forceExit em workflow/JS operacional | cenário atual prova somente package scripts | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesses escopos |
| || true em package scripts | cenário atual prova a regex especial de workflow | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesse escopo |

Durante esta auditoria, os runs recentes do PR estavam sendo cancelados/substituídos pela sequência de commits multiagente; nenhum histórico verde recente foi usado como prova adicional.

## 5. Invariantes

1. O self-test deve executar a implementação real, não uma cópia lógica das regras.
2. Cada cenário nasce de uma baseline nova.
3. A baseline positiva impede um verificador que sempre falha de parecer correto.
4. Cenário negativo só é aprovado com status não-zero e diagnóstico esperado.
5. Uma mutação deve introduzir uma única violação relevante.
6. O checkout real não pode ser alvo das mutações.
7. A cópia precisa manter a topologia relativa do verificador.
8. Cleanup deve ocorrer em sucesso e exceção.
9. A aprovação final não pode anteceder os cenários.
10. Package/workflow devem continuar apontando para esta entrada canônica.
11. Regras novas sem cenário focal precisam continuar documentadas como lacuna.
12. Esta Bíblia fica stale se o blob fonte deixar de ser ac0318e4d90c5014180eb3d3a6ac4784cc70a24a.

## 6. Casos-limite e análise crítica

- A cobertura negativa é representativa, não exaustiva: .only, test.todo, --passWithNoTests e alguns escopos dos tokens já proibidos não são estimulados.
- O CI Contract procura três marcadores do self-test por includes(); isso prova presença textual, não que o literal permaneça em cenário executado.
- Exigir status e substring evita considerar um crash arbitrário como rejeição correta.
- spawnSync não define timeout; não há hang conhecido no verificador atual, mas o harness não impõe teto se a implementação futura bloquear.
- scripts/ci, scripts/maintenance e extension existem na baseline porém ficam vazios, portanto regras para JS operacional não recebem estímulo focal.
- As substrings esperadas fazem parte do contrato prático do self-test; mudança intencional de wording exige atualizar a prova.

## 7. Solicitações ao auditor

- **090-001 — TEST_REQUIRED — OPEN:** ampliar o self-test para .only, test.todo, --passWithNoTests, --forceExit fora de package, || true em package e tokens em JS operacional.
- **090-002 — CONTRACT_REVIEW — OPEN:** revisar a prova textual por includes() em verify-ci-contract.js, pois marcadores inertes poderiam satisfazer o gate estático.

## 8. Fonte integral exata

```js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const verifierRel = 'scripts/validation/verify-test-policy.js';

function createSandbox() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-test-policy-'));
  const verifierDest = path.join(sandbox, verifierRel);
  fs.mkdirSync(path.dirname(verifierDest), { recursive: true });
  fs.copyFileSync(path.join(root, verifierRel), verifierDest);
  fs.mkdirSync(path.join(sandbox, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'scripts', 'ci'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'scripts', 'maintenance'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'extension'), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, 'tests', 'sample.test.js'),
    "test('ok', () => { expect(true).toBe(true); });\n",
    'utf8'
  );
  fs.writeFileSync(
    path.join(sandbox, 'package.json'),
    JSON.stringify({ scripts: { test: 'jest' } }, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(sandbox, '.github', 'workflows', 'ci.yml'),
    "name: test\njobs:\n  test:\n    steps:\n      - run: npm run test\n",
    'utf8'
  );
  return sandbox;
}

function runVerifier(sandbox) {
  return spawnSync(process.execPath, [path.join(sandbox, verifierRel)], {
    cwd: sandbox,
    encoding: 'utf8',
  });
}

function expectBaselinePasses() {
  const sandbox = createSandbox();
  try {
    const result = runVerifier(sandbox);
    if (result.status !== 0) {
      throw new Error('baseline válida foi rejeitada:\n' + String(result.stdout || '') + String(result.stderr || ''));
    }
    console.log('✅ política baseline válida: aceita');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

function expectFailure(name, mutate, expected) {
  const sandbox = createSandbox();
  try {
    mutate(sandbox);
    const result = runVerifier(sandbox);
    const output = String(result.stdout || '') + String(result.stderr || '');
    if (result.status === 0) {
      throw new Error(name + ': política aceitou uma configuração proibida');
    }
    if (!output.includes(expected)) {
      throw new Error(name + ': falhou pelo motivo errado. Esperado: ' + expected + '\nSaída:\n' + output);
    }
    console.log('✅ ' + name + ': rejeitado como esperado');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

expectBaselinePasses();

expectFailure(
  'test.skip',
  (sandbox) => fs.writeFileSync(
    path.join(sandbox, 'tests', 'sample.test.js'),
    "test.skip('não pode', () => {});\n",
    'utf8'
  ),
  'uso proibido de .skip'
);

expectFailure(
  '--forceExit em script npm',
  (sandbox) => fs.writeFileSync(
    path.join(sandbox, 'package.json'),
    JSON.stringify({ scripts: { test: 'jest --forceExit' } }, null, 2) + '\n',
    'utf8'
  ),
  'escape hatch proibido: --forceExit'
);

expectFailure(
  'teste mascarado com || true',
  (sandbox) => fs.writeFileSync(
    path.join(sandbox, '.github', 'workflows', 'ci.yml'),
    "name: test\njobs:\n  test:\n    steps:\n      - run: npm run test:ci || true\n",
    'utf8'
  ),
  'comando de teste mascarado com || true'
);

console.log('✅ Test Policy self-test aprovado.');
```

## 9. Cobertura linha a linha

### Linha 1

**Fonte:** `'use strict';`

**O que faz:** Ativa strict mode no processo Node do self-test.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 2

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 3

**Fonte:** `const fs = require('fs');`

**O que faz:** Importa fs para criar, copiar, escrever e remover sandboxes.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 4

**Fonte:** `const os = require('os');`

**O que faz:** Importa os para resolver o diretório temporário da plataforma.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 5

**Fonte:** `const path = require('path');`

**O que faz:** Importa path para montar caminhos portáveis.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 6

**Fonte:** `const { spawnSync } = require('child_process');`

**O que faz:** Importa spawnSync para executar a implementação real em processo filho.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 7

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 8

**Fonte:** `const root = path.resolve(__dirname, '../..');`

**O que faz:** Resolve a raiz do checkout por __dirname, sem depender de cwd.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — verify-ci-contract.js protege o wiring/marcador correspondente.

### Linha 9

**Fonte:** `const verifierRel = 'scripts/validation/verify-test-policy.js';`

**O que faz:** Define o caminho relativo canônico de verify-test-policy.js.

**Como se encaixa:** pertence ao bloco de **bootstrap** e fixa dependências e caminhos antes das fixtures.

**Por que assim:** o desenho busca resolução portável e identidade única do verificador.

**Risco se alterada:** um path errado faria o self-test testar outro artefato.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — verify-ci-contract.js protege o wiring/marcador correspondente.

### Linha 10

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 11

**Fonte:** `function createSandbox() {`

**O que faz:** Abre createSandbox(), fábrica de workspaces mínimos isolados.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 12

**Fonte:** `  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-test-policy-'));`

**O que faz:** Cria um diretório temporário exclusivo com prefixo manga-test-policy-.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 13

**Fonte:** `  const verifierDest = path.join(sandbox, verifierRel);`

**O que faz:** Calcula o destino da cópia do verificador dentro do sandbox.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 14

**Fonte:** `  fs.mkdirSync(path.dirname(verifierDest), { recursive: true });`

**O que faz:** Cria recursivamente scripts/validation no sandbox.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 15

**Fonte:** `  fs.copyFileSync(path.join(root, verifierRel), verifierDest);`

**O que faz:** Copia o verificador real do checkout para a topologia simulada.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 16

**Fonte:** `  fs.mkdirSync(path.join(sandbox, 'tests'), { recursive: true });`

**O que faz:** Cria tests/, árvore varrida para skip/only/todo.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 17

**Fonte:** `  fs.mkdirSync(path.join(sandbox, '.github', 'workflows'), { recursive: true });`

**O que faz:** Cria .github/workflows/, árvore varrida para tokens proibidos em CI.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 18

**Fonte:** `  fs.mkdirSync(path.join(sandbox, 'scripts', 'ci'), { recursive: true });`

**O que faz:** Cria scripts/ci/, um dos escopos de JavaScript operacional.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 19

**Fonte:** `  fs.mkdirSync(path.join(sandbox, 'scripts', 'maintenance'), { recursive: true });`

**O que faz:** Cria scripts/maintenance/, outro escopo de JavaScript operacional.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 20

**Fonte:** `  fs.mkdirSync(path.join(sandbox, 'extension'), { recursive: true });`

**O que faz:** Cria extension/, terceiro escopo de JavaScript operacional.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 21

**Fonte:** `  fs.writeFileSync(`

**O que faz:** Inicia a escrita da fixture de teste baseline.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 22

**Fonte:** `    path.join(sandbox, 'tests', 'sample.test.js'),`

**O que faz:** Aponta a fixture para tests/sample.test.js.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 23

**Fonte:** `    "test('ok', () => { expect(true).toBe(true); });\n",`

**O que faz:** Define um teste Jest mínimo válido sem marcador proibido.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 24

**Fonte:** `    'utf8'`

**O que faz:** Grava a fixture de teste como UTF-8.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 25

**Fonte:** `  );`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 26

**Fonte:** `  fs.writeFileSync(`

**O que faz:** Inicia a escrita do package.json baseline.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 27

**Fonte:** `    path.join(sandbox, 'package.json'),`

**O que faz:** Aponta para o package.json raiz do sandbox.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 28

**Fonte:** `    JSON.stringify({ scripts: { test: 'jest' } }, null, 2) + '\n',`

**O que faz:** Serializa scripts.test = jest sem escape hatch.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 29

**Fonte:** `    'utf8'`

**O que faz:** Grava o package como UTF-8.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 30

**Fonte:** `  );`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 31

**Fonte:** `  fs.writeFileSync(`

**O que faz:** Inicia a escrita do workflow baseline.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 32

**Fonte:** `    path.join(sandbox, '.github', 'workflows', 'ci.yml'),`

**O que faz:** Aponta para .github/workflows/ci.yml.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 33

**Fonte:** `    "name: test\njobs:\n  test:\n    steps:\n      - run: npm run test\n",`

**O que faz:** Define um step mínimo com npm run test, sem || true.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 34

**Fonte:** `    'utf8'`

**O que faz:** Grava o workflow como UTF-8.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 35

**Fonte:** `  );`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 36

**Fonte:** `  return sandbox;`

**O que faz:** Retorna a raiz pronta do sandbox ao cenário chamador.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 37

**Fonte:** `}`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **sandbox** e monta a topologia mínima sem tocar no checkout.

**Por que assim:** o desenho busca isolamento causal entre cenários.

**Risco se alterada:** fixture incompleta pode transformar falha de política em falha de filesystem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 38

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **runner** e executa a implementação real como CLI.

**Por que assim:** o desenho busca fidelidade a status e streams reais.

**Risco se alterada:** alterar cwd/execução pode criar comportamento diferente da CI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 39

**Fonte:** `function runVerifier(sandbox) {`

**O que faz:** Abre runVerifier(), wrapper comum de execução da CLI.

**Como se encaixa:** pertence ao bloco de **runner** e executa a implementação real como CLI.

**Por que assim:** o desenho busca fidelidade a status e streams reais.

**Risco se alterada:** alterar cwd/execução pode criar comportamento diferente da CI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 40

**Fonte:** `  return spawnSync(process.execPath, [path.join(sandbox, verifierRel)], {`

**O que faz:** Executa a cópia do verificador com o mesmo executável Node do processo atual.

**Como se encaixa:** pertence ao bloco de **runner** e executa a implementação real como CLI.

**Por que assim:** o desenho busca fidelidade a status e streams reais.

**Risco se alterada:** alterar cwd/execução pode criar comportamento diferente da CI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 41

**Fonte:** `    cwd: sandbox,`

**O que faz:** Define cwd como a raiz simulada.

**Como se encaixa:** pertence ao bloco de **runner** e executa a implementação real como CLI.

**Por que assim:** o desenho busca fidelidade a status e streams reais.

**Risco se alterada:** alterar cwd/execução pode criar comportamento diferente da CI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 42

**Fonte:** `    encoding: 'utf8',`

**O que faz:** Solicita stdout/stderr como strings UTF-8.

**Como se encaixa:** pertence ao bloco de **runner** e executa a implementação real como CLI.

**Por que assim:** o desenho busca fidelidade a status e streams reais.

**Risco se alterada:** alterar cwd/execução pode criar comportamento diferente da CI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 43

**Fonte:** `  });`

**O que faz:** Completa o statement multi-linha do bloco atual com o fragmento exato mostrado acima.

**Como se encaixa:** pertence ao bloco de **runner** e executa a implementação real como CLI.

**Por que assim:** o desenho busca fidelidade a status e streams reais.

**Risco se alterada:** alterar cwd/execução pode criar comportamento diferente da CI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 44

**Fonte:** `}`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **runner** e executa a implementação real como CLI.

**Por que assim:** o desenho busca fidelidade a status e streams reais.

**Risco se alterada:** alterar cwd/execução pode criar comportamento diferente da CI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 45

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 46

**Fonte:** `function expectBaselinePasses() {`

**O que faz:** Abre o controle positivo expectBaselinePasses().

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 47

**Fonte:** `  const sandbox = createSandbox();`

**O que faz:** Cria sandbox novo para o controle positivo.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 48

**Fonte:** `  try {`

**O que faz:** Abre a região protegida cujo cleanup é garantido pelo finally.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 49

**Fonte:** `    const result = runVerifier(sandbox);`

**O que faz:** Executa o verificador real na baseline.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 50

**Fonte:** `    if (result.status !== 0) {`

**O que faz:** Exige que a baseline não retorne status diferente de zero.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 51

**Fonte:** `      throw new Error('baseline válida foi rejeitada:\n' + String(result.stdout || '') + String(result.stderr || ''));`

**O que faz:** Falha com stdout/stderr se uma baseline válida for rejeitada.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 52

**Fonte:** `    }`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 53

**Fonte:** `    console.log('✅ política baseline válida: aceita');`

**O que faz:** Registra aceitação da baseline após a assertion.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 54

**Fonte:** `  } finally {`

**O que faz:** Transfere a execução para cleanup incondicional em sucesso ou exceção.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 55

**Fonte:** `    fs.rmSync(sandbox, { recursive: true, force: true });`

**O que faz:** Remove o sandbox positivo recursivamente no finally.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 56

**Fonte:** `  }`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 57

**Fonte:** `}`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **baseline positiva** e demonstra que um caso permitido passa.

**Por que assim:** o desenho busca impedir um verificador sempre-vermelho de parecer correto.

**Risco se alterada:** enfraquecer o status permitiria falso positivo do self-test.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 58

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 59

**Fonte:** `function expectFailure(name, mutate, expected) {`

**O que faz:** Abre expectFailure(name, mutate, expected), helper dos negativos.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 60

**Fonte:** `  const sandbox = createSandbox();`

**O que faz:** Cria sandbox baseline novo para cada violação.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 61

**Fonte:** `  try {`

**O que faz:** Abre a região protegida cujo cleanup é garantido pelo finally.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 62

**Fonte:** `    mutate(sandbox);`

**O que faz:** Aplica a mutação específica antes de executar o verificador.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 63

**Fonte:** `    const result = runVerifier(sandbox);`

**O que faz:** Executa o verificador real contra a fixture mutada.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 64

**Fonte:** `    const output = String(result.stdout || '') + String(result.stderr || '');`

**O que faz:** Concatena stdout e stderr para validar o motivo da falha.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 65

**Fonte:** `    if (result.status === 0) {`

**O que faz:** Reprova o self-test se uma configuração proibida retornar status zero.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 66

**Fonte:** `      throw new Error(name + ': política aceitou uma configuração proibida');`

**O que faz:** Lança erro nomeado quando a política aceita o proibido.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 67

**Fonte:** `    }`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 68

**Fonte:** `    if (!output.includes(expected)) {`

**O que faz:** Exige a substring diagnóstica esperada na saída.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 69

**Fonte:** `      throw new Error(name + ': falhou pelo motivo errado. Esperado: ' + expected + '\nSaída:\n' + output);`

**O que faz:** Falha se o verificador rejeitou pelo motivo errado.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 70

**Fonte:** `    }`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 71

**Fonte:** `    console.log('✅ ' + name + ': rejeitado como esperado');`

**O que faz:** Registra rejeição correta somente após status e mensagem passarem.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 72

**Fonte:** `  } finally {`

**O que faz:** Transfere a execução para cleanup incondicional em sucesso ou exceção.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 73

**Fonte:** `    fs.rmSync(sandbox, { recursive: true, force: true });`

**O que faz:** Remove o sandbox negativo recursivamente no finally.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 74

**Fonte:** `  }`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 75

**Fonte:** `}`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **helper negativo** e exige rejeição e motivo correto.

**Por que assim:** o desenho busca não confundir crash genérico com regra de política funcionando.

**Risco se alterada:** remover status ou substring enfraquece a prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 76

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 77

**Fonte:** `expectBaselinePasses();`

**O que faz:** Executa primeiro a baseline positiva.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 78

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 79

**Fonte:** `expectFailure(`

**O que faz:** Inicia o cenário negativo para test.skip.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 80

**Fonte:** `  'test.skip',`

**O que faz:** Nomeia o cenário como test.skip.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — verify-ci-contract.js protege o wiring/marcador correspondente.

### Linha 81

**Fonte:** `  (sandbox) => fs.writeFileSync(`

**O que faz:** Define a mutação focal do arquivo de teste.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 82

**Fonte:** `    path.join(sandbox, 'tests', 'sample.test.js'),`

**O que faz:** Escolhe tests/sample.test.js como alvo.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 83

**Fonte:** `    "test.skip('não pode', () => {});\n",`

**O que faz:** Substitui o teste válido por test.skip('não pode', ...).

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 84

**Fonte:** `    'utf8'`

**O que faz:** Mantém a fixture mutada em UTF-8.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 85

**Fonte:** `  ),`

**O que faz:** Completa o statement multi-linha do bloco atual com o fragmento exato mostrado acima.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 86

**Fonte:** `  'uso proibido de .skip'`

**O que faz:** Exige o diagnóstico uso proibido de .skip.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 87

**Fonte:** `);`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **caso test.skip** e estimula o scanner de tests/.

**Por que assim:** o desenho busca provar a regra anti-skip no escopo real.

**Risco se alterada:** mudar path/token pode deixar a regra sem prova.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 88

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 89

**Fonte:** `expectFailure(`

**O que faz:** Inicia o cenário negativo para --forceExit em script npm.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 90

**Fonte:** `  '--forceExit em script npm',`

**O que faz:** Nomeia o cenário de --forceExit no package.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — verify-ci-contract.js protege o wiring/marcador correspondente.

### Linha 91

**Fonte:** `  (sandbox) => fs.writeFileSync(`

**O que faz:** Define a mutação focal de package.json.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 92

**Fonte:** `    path.join(sandbox, 'package.json'),`

**O que faz:** Escolhe o package raiz do sandbox como alvo.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 93

**Fonte:** `    JSON.stringify({ scripts: { test: 'jest --forceExit' } }, null, 2) + '\n',`

**O que faz:** Troca o script por jest --forceExit.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 94

**Fonte:** `    'utf8'`

**O que faz:** Mantém o JSON mutado em UTF-8.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 95

**Fonte:** `  ),`

**O que faz:** Completa o statement multi-linha do bloco atual com o fragmento exato mostrado acima.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 96

**Fonte:** `  'escape hatch proibido: --forceExit'`

**O que faz:** Exige o diagnóstico escape hatch proibido: --forceExit.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 97

**Fonte:** `);`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **caso --forceExit** e estimula package.json#scripts.

**Por que assim:** o desenho busca provar bloqueio do escape hatch em scripts npm.

**Risco se alterada:** testar outro escopo não substitui este contrato.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 98

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 99

**Fonte:** `expectFailure(`

**O que faz:** Inicia o cenário negativo de comando de teste mascarado.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 100

**Fonte:** `  'teste mascarado com || true',`

**O que faz:** Nomeia o cenário teste mascarado com || true.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — verify-ci-contract.js protege o wiring/marcador correspondente.

### Linha 101

**Fonte:** `  (sandbox) => fs.writeFileSync(`

**O que faz:** Define a mutação focal do workflow.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 102

**Fonte:** `    path.join(sandbox, '.github', 'workflows', 'ci.yml'),`

**O que faz:** Escolhe .github/workflows/ci.yml como alvo.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 103

**Fonte:** `    "name: test\njobs:\n  test:\n    steps:\n      - run: npm run test:ci || true\n",`

**O que faz:** Troca o step por npm run test:ci || true.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 104

**Fonte:** `    'utf8'`

**O que faz:** Mantém o YAML mutado em UTF-8.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 105

**Fonte:** `  ),`

**O que faz:** Completa o statement multi-linha do bloco atual com o fragmento exato mostrado acima.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 106

**Fonte:** `  'comando de teste mascarado com || true'`

**O que faz:** Exige o diagnóstico comando de teste mascarado com || true.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** ✅ PROVADO DIRETAMENTE — há estímulo controlado e assertion específica ligada à execução do verificador real.

### Linha 107

**Fonte:** `);`

**O que faz:** Fecha a chamada ou bloco iniciado nas posições imediatamente anteriores.

**Como se encaixa:** pertence ao bloco de **caso || true** e estimula o scanner de workflow.

**Por que assim:** o desenho busca provar que comando de teste não pode ser mascarado.

**Risco se alterada:** um token fora do comando test:* não prova a regex atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 108

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente blocos adjacentes sem executar código.

**Como se encaixa:** pertence ao bloco de **fechamento** e só anuncia sucesso após todos os cenários.

**Por que assim:** o desenho busca log final representar aprovação real.

**Risco se alterada:** sucesso antecipado pode enganar quem lê o job.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

### Linha 109

**Fonte:** `console.log('✅ Test Policy self-test aprovado.');`

**O que faz:** Imprime a aprovação global somente depois de todos os cenários.

**Como se encaixa:** pertence ao bloco de **fechamento** e só anuncia sucesso após todos os cenários.

**Por que assim:** o desenho busca log final representar aprovação real.

**Risco se alterada:** sucesso antecipado pode enganar quem lê o job.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do caminho chamado por test:test-policy:infra, sem assertion externa isolada da própria linha.

### Linha 110

**Fonte:** `␤ [newline final]`

**O que faz:** Representa o newline final preservado no blob.

**Como se encaixa:** pertence ao bloco de **fechamento** e só anuncia sucesso após todos os cenários.

**Por que assim:** o desenho busca log final representar aprovação real.

**Risco se alterada:** sucesso antecipado pode enganar quem lê o job.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/textual sem assertion focal própria.

## 10. Conclusão documental

As **110 posições** do blob auditado estão documentadas sequencialmente, incluindo linhas vazias e newline final. A fonte integral foi inserida diretamente do blob ac0318e4d90c5014180eb3d3a6ac4784cc70a24a. Os quatro cenários existentes têm assertions específicas; regras não estimuladas permanecem lacunas e geraram solicitações ao auditor.

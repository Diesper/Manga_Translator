# Bíblia técnica — scripts/validation/verify-publish-contract.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `f5b3f6c69f85f90fe43689de2e44b6ed70cca757`  
> **Agente responsável:** AGENTE 11  
> **Tipo:** gate CLI Node.js de integridade do contrato de publicação  
> **Linhas textuais:** **71**  
> **Posições documentais:** **72**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é um gate estático e somente leitura para a superfície de publicação. Ele não cria releases e não sincroniza versões; ele valida se o workflow de release e o sincronizador de versão continuam referenciando os caminhos e comandos canônicos necessários.

O desenho combina checks positivos (marcadores que precisam existir), checks negativos (paths legados que não podem voltar), uma regex para o trigger de tags e uma lista acumulada de problemas. A falha é agregada e termina o processo com status 1, permitindo que a CI bloqueie drift estrutural antes de uma publicação real.

## 2. Dependências e consumidores

**Dependências diretas:** Node `fs` e `path`; `.github/workflows/publish.yml`; `scripts/release/sync-version.js`; `docs/Documentação.md`; `extension/manifest.json`.

**Consumidores confirmados:**
- `package.json#validate:publish` executa `node scripts/validation/verify-publish-contract.js`;
- `package.json#validate` inclui `validate:publish`;
- `.github/workflows/ci.yml`, job `ci-contract`, executa `npm run validate:publish`;
- `scripts/validation/verify-ci-contract.js` exige o wiring acima e exige que este arquivo continue contendo marcadores selecionados de release;
- `scripts/validation/verify-ci-contract-selftest.js` copia este arquivo para o sandbox geral, mas seus cenários negativos atuais não mutilam especificamente o contrato de publicação.

**Efeitos colaterais:** nenhuma escrita no workspace; somente leituras síncronas e mensagens em stdout/stderr. Em falha usa `process.exit(1)`.

## 3. Fluxo

1. resolve a raiz pelo próprio `__dirname`;
2. monta quatro caminhos obrigatórios;
3. acumula ausências;
4. se `publish.yml` existe, exige oito marcadores, rejeita três paths legados e verifica tags `v*`;
5. se `sync-version.js` existe, exige quatro marcadores e rejeita dois paths legados;
6. imprime todos os problemas e sai 1 se houver qualquer violação;
7. em ausência de violações, imprime mensagem positiva.

## 4. Contratos protegidos

| Área | Regra |
|---|---|
| Workflow | arquivo existe e mantém nome canônico |
| Trigger | `workflow_dispatch:` e tags `v*` |
| Versionamento | `npm run version:check` e `sync-version.js --print-env` |
| Artefato | cópia de `extension/.`, ZIP, docs e SHA256 |
| Paths antigos | `scripts/sync-version.js`, `tests/package.json`, `tests/package-lock.json` proibidos |
| Sincronizador | raiz `../..`, lockfile da raiz, manifesto e docs canônicos |
| Saída | qualquer violação deve produzir exit status 1 |

## 5. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| `validate:publish` aponta para este arquivo | assertion estática em `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| workflow de CI chama `validate:publish` | assertion estática em `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| este verificador retém marcadores de `sync-version.js`, `cp -R extension/.` e `docs/Documentação.md` | loop específico em `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| caminho verde do CLI na CI | job `ci-contract` chama o CLI real | 🟨 EXECUTADO INDIRETAMENTE |
| arquivo obrigatório ausente | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| marcador positivo removido | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| path legado reintroduzido | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| trigger `v*` quebrado | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| marcador de `sync-version.js` removido | nenhum self-test focal do verificador | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mensagem e exit 1 para cada branch negativo | nenhuma assertion focal por subprocesso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

Na consulta feita durante esta auditoria, o run `MangaTranslator CI` do head observado do PR #66 ainda estava **pending**; esse run não foi usado como prova de sucesso.

## 6. Invariantes

1. caminhos derivam da raiz canônica, não de `cwd`;
2. os quatro arquivos mínimos existem;
3. publicação valida versão antes de derivar metadados;
4. release usa `scripts/release/sync-version.js`;
5. extensão é empacotada de `extension/`;
6. docs vêm de `docs/Documentação.md`;
7. ZIP e docs recebem SHA-256;
8. tags `v*` continuam aceitas;
9. sincronizador usa lockfile, manifesto e docs canônicos;
10. workspace legado de `tests/` não reaparece;
11. qualquer problema torna o processo não-zero;
12. o verificador permanece somente leitura.

## 7. Casos-limite e riscos

**Validação textual, não semântica.** `includes` pode aceitar marcador em comentário/string inativa, e também rejeitar refatoração semanticamente equivalente que altere apenas a forma textual.

**Regex de tags sensível ao formato.** A regex exige `tags:` seguido por item de lista `v*` em forma específica. YAML equivalente em outra notação pode ser rejeitado.

**Escopo parcial do workflow.** O gate não exige todos os elementos de uma release, como `permissions: contents: write`, comandos `gh release ...` ou conteúdo das release notes. Portanto “validado” significa “contratos selecionados preservados”.

**Manifesto e docs: apenas existência.** Conteúdo/semântica desses arquivos pertencem a outros gates.

**Testabilidade.** O uso top-level de `process.exit(1)` favorece teste por subprocesso/sandbox; não existe função exportada para teste unitário direto.

## 8. Solicitações ao auditor

### 088-001 — TEST_REQUIRED — OPEN

Não existe self-test focal do CLI cobrindo: ausência dos quatro arquivos, perda dos marcadores positivos, reintrodução dos paths legados, trigger `v*`, perda dos marcadores do sincronizador, mensagens e exit code. Solicita-se self-test separado em sandbox/subprocesso usando a implementação real.

### 088-002 — CONTRACT_REVIEW — OPEN

O gate usa texto bruto (`includes`/regex). Solicita-se decidir explicitamente se falsos positivos por comentário/string e falsos negativos por refatoração equivalente são trade-off aceito; se não forem, fortalecer o gate em mudança funcional separada, com regressões próprias.

## 9. Fonte integral exata

```js
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const publishPath = path.join(root, '.github', 'workflows', 'publish.yml');
const syncPath = path.join(root, 'scripts', 'release', 'sync-version.js');
const docsPath = path.join(root, 'docs', 'Documentação.md');
const manifestPath = path.join(root, 'extension', 'manifest.json');
const problems = [];

for (const [label, file] of [
  ['publish.yml', publishPath],
  ['sync-version.js', syncPath],
  ['Documentação.md', docsPath],
  ['extension/manifest.json', manifestPath],
]) {
  if (!fs.existsSync(file)) problems.push(label + ' ausente');
}

if (fs.existsSync(publishPath)) {
  const source = fs.readFileSync(publishPath, 'utf8');
  const required = [
    'name: Publish Manga Translator',
    'workflow_dispatch:',
    'run: npm run version:check',
    'node scripts/release/sync-version.js --print-env',
    'cp -R extension/. "dist/${RELEASE_BASENAME}/"',
    'zip -qr "${RELEASE_BASENAME}.zip" "${RELEASE_BASENAME}"',
    'cp "docs/Documentação.md" "dist/${DOC_ARTIFACT}"',
    'sha256sum "${RELEASE_BASENAME}.zip" "${DOC_ARTIFACT}" > SHA256SUMS.txt',
  ];
  for (const marker of required) {
    if (!source.includes(marker)) problems.push('publish.yml perdeu contrato: ' + marker);
  }
  const legacyPublishPaths = [
    'scripts/' + 'sync-version.js',
    'tests/' + 'package.json',
    'tests/' + 'package-lock.json',
  ];
  for (const legacy of legacyPublishPaths) {
    if (source.includes(legacy)) problems.push('publish.yml reintroduziu caminho legado: ' + legacy);
  }
  if (!/tags:\s*\n\s*-\s*["']v\*["']/.test(source)) {
    problems.push('publish.yml precisa continuar aceitando tags v*');
  }
}

if (fs.existsSync(syncPath)) {
  const syncSource = fs.readFileSync(syncPath, 'utf8');
  for (const marker of [
    "path.resolve(__dirname, '../..')",
    "path.join(root, 'package-lock.json')",
    "path.join(root, 'extension', 'manifest.json')",
    "path.join(root, 'docs', 'Documentação.md')",
  ]) {
    if (!syncSource.includes(marker)) problems.push('sync-version.js perdeu contrato: ' + marker);
  }
  for (const legacy of ["'tests', 'package.json'", "'tests', 'package-lock.json'"]) {
    if (syncSource.includes(legacy)) problems.push('sync-version.js reintroduziu workspace legado: ' + legacy);
  }
}

if (problems.length) {
  console.error('Contrato de publicação inválido:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log('Contrato de publicação validado: extensão, docs e versionamento apontam para os caminhos canônicos.');
```

## 10. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** `'use strict';`

**Função:** Ativa strict mode para o módulo.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 2

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa a diretiva dos imports.

**Racional técnico:** É separação visual sem efeito de runtime; preserva legibilidade entre fases do gate.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 3

**Fonte:** `const fs = require('fs');`

**Função:** Importa `fs` para testar existência e ler arquivos.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 4

**Fonte:** `const path = require('path');`

**Função:** Importa `path` para resolver caminhos de forma portável.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 5

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa imports da configuração.

**Racional técnico:** É separação visual sem efeito de runtime; preserva legibilidade entre fases do gate.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 6

**Fonte:** `const root = path.resolve(__dirname, '../..');`

**Função:** Ancora a raiz do repositório dois níveis acima de `__dirname`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 7

**Fonte:** `const publishPath = path.join(root, '.github', 'workflows', 'publish.yml');`

**Função:** Resolve o workflow canônico de publicação.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 8

**Fonte:** `const syncPath = path.join(root, 'scripts', 'release', 'sync-version.js');`

**Função:** Resolve o sincronizador canônico sob `scripts/release/`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige marcadores correlatos dentro deste verificador.

### Linha/posição 9

**Fonte:** `const docsPath = path.join(root, 'docs', 'Documentação.md');`

**Função:** Resolve a documentação técnica canônica.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 10

**Fonte:** `const manifestPath = path.join(root, 'extension', 'manifest.json');`

**Função:** Resolve o Manifest V3 canônico.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 11

**Fonte:** `const problems = [];`

**Função:** Cria o acumulador único de violações.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 12

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa configuração da validação de existência.

**Racional técnico:** É separação visual sem efeito de runtime; preserva legibilidade entre fases do gate.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 13

**Fonte:** `for (const [label, file] of [`

**Função:** Inicia o loop dos quatro arquivos mínimos.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 14

**Fonte:** `  ['publish.yml', publishPath],`

**Função:** Inclui `publish.yml` no inventário obrigatório.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 15

**Fonte:** `  ['sync-version.js', syncPath],`

**Função:** Inclui `sync-version.js` no inventário obrigatório.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 16

**Fonte:** `  ['Documentação.md', docsPath],`

**Função:** Inclui `Documentação.md` no inventário obrigatório.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 17

**Fonte:** `  ['extension/manifest.json', manifestPath],`

**Função:** Inclui `extension/manifest.json` no inventário obrigatório.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 18

**Fonte:** `]) {`

**Função:** Fecha a lista e abre o corpo do loop.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 19

**Fonte:** `  if (!fs.existsSync(file)) problems.push(label + ' ausente');`

**Função:** Registra `<label> ausente` sem abortar os demais checks.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 20

**Fonte:** `}`

**Função:** Fecha a validação de existência.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 21

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa a fase de existência da inspeção do workflow.

**Racional técnico:** É separação visual sem efeito de runtime; preserva legibilidade entre fases do gate.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 22

**Fonte:** `if (fs.existsSync(publishPath)) {`

**Função:** Só inspeciona `publish.yml` se ele existe.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 23

**Fonte:** `  const source = fs.readFileSync(publishPath, 'utf8');`

**Função:** Lê `publish.yml` integralmente como UTF-8.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 24

**Fonte:** `  const required = [`

**Função:** Inicia a lista de marcadores positivos do workflow.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 25

**Fonte:** `    'name: Publish Manga Translator',`

**Função:** Exige o nome canônico do workflow.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 26

**Fonte:** `    'workflow_dispatch:',`

**Função:** Exige `workflow_dispatch:` para disparo manual.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 27

**Fonte:** `    'run: npm run version:check',`

**Função:** Exige `npm run version:check` antes da publicação.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 28

**Fonte:** `    'node scripts/release/sync-version.js --print-env',`

**Função:** Exige derivação de env via `sync-version.js --print-env`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige marcadores correlatos dentro deste verificador.

### Linha/posição 29

**Fonte:** `    'cp -R extension/. "dist/${RELEASE_BASENAME}/"',`

**Função:** Exige cópia de `extension/.` para o diretório versionado.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige marcadores correlatos dentro deste verificador.

### Linha/posição 30

**Fonte:** `    'zip -qr "${RELEASE_BASENAME}.zip" "${RELEASE_BASENAME}"',`

**Função:** Exige criação do ZIP da release.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 31

**Fonte:** `    'cp "docs/Documentação.md" "dist/${DOC_ARTIFACT}"',`

**Função:** Exige cópia de `docs/Documentação.md` para o artefato.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige marcadores correlatos dentro deste verificador.

### Linha/posição 32

**Fonte:** `    'sha256sum "${RELEASE_BASENAME}.zip" "${DOC_ARTIFACT}" > SHA256SUMS.txt',`

**Função:** Exige geração de `SHA256SUMS.txt` para ZIP e documentação.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 33

**Fonte:** `  ];`

**Função:** Fecha a lista de marcadores positivos.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 34

**Fonte:** `  for (const marker of required) {`

**Função:** Percorre cada marcador obrigatório.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 35

**Fonte:** `    if (!source.includes(marker)) problems.push('publish.yml perdeu contrato: ' + marker);`

**Função:** Registra marcador ausente via `source.includes`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 36

**Fonte:** `  }`

**Função:** Fecha o loop dos marcadores positivos.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 37

**Fonte:** `  const legacyPublishPaths = [`

**Função:** Inicia a lista de caminhos legados proibidos.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 38

**Fonte:** `    'scripts/' + 'sync-version.js',`

**Função:** Proíbe o antigo `scripts/sync-version.js`; a concatenação evita manter o literal inteiro neste fonte.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 39

**Fonte:** `    'tests/' + 'package.json',`

**Função:** Proíbe `tests/package.json` no workflow.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 40

**Fonte:** `    'tests/' + 'package-lock.json',`

**Função:** Proíbe `tests/package-lock.json` no workflow.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 41

**Fonte:** `  ];`

**Função:** Fecha a lista de paths legados.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 42

**Fonte:** `  for (const legacy of legacyPublishPaths) {`

**Função:** Percorre cada path legado.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 43

**Fonte:** `    if (source.includes(legacy)) problems.push('publish.yml reintroduziu caminho legado: ' + legacy);`

**Função:** Registra regressão quando um path legado reaparece.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 44

**Fonte:** `  }`

**Função:** Fecha o loop de paths legados.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 45

**Fonte:** `  if (!/tags:\s*\n\s*-\s*["']v\*["']/.test(source)) {`

**Função:** Aplica regex ao trigger de tags para exigir item `v*` no formato canônico.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 46

**Fonte:** `    problems.push('publish.yml precisa continuar aceitando tags v*');`

**Função:** Registra perda do trigger de tags `v*`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 47

**Fonte:** `  }`

**Função:** Fecha a condição da regex.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 48

**Fonte:** `}`

**Função:** Fecha a inspeção condicional de `publish.yml`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 49

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa workflow da inspeção do sincronizador.

**Racional técnico:** É separação visual sem efeito de runtime; preserva legibilidade entre fases do gate.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 50

**Fonte:** `if (fs.existsSync(syncPath)) {`

**Função:** Só inspeciona `sync-version.js` se ele existe.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 51

**Fonte:** `  const syncSource = fs.readFileSync(syncPath, 'utf8');`

**Função:** Lê o sincronizador como UTF-8.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 52

**Fonte:** `  for (const marker of [`

**Função:** Inicia o conjunto de marcadores canônicos do sincronizador.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 53

**Fonte:** `    "path.resolve(__dirname, '../..')",`

**Função:** Exige raiz baseada em `__dirname` e `../..`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 54

**Fonte:** `    "path.join(root, 'package-lock.json')",`

**Função:** Exige o `package-lock.json` da raiz.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 55

**Fonte:** `    "path.join(root, 'extension', 'manifest.json')",`

**Função:** Exige o manifesto sob `extension/`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 56

**Fonte:** `    "path.join(root, 'docs', 'Documentação.md')",`

**Função:** Exige `docs/Documentação.md`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 57

**Fonte:** `  ]) {`

**Função:** Fecha a lista inline e abre o loop.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 58

**Fonte:** `    if (!syncSource.includes(marker)) problems.push('sync-version.js perdeu contrato: ' + marker);`

**Função:** Registra marcador canônico ausente do sincronizador.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 59

**Fonte:** `  }`

**Função:** Fecha o loop de marcadores canônicos.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 60

**Fonte:** `  for (const legacy of ["'tests', 'package.json'", "'tests', 'package-lock.json'"]) {`

**Função:** Percorre as duas referências legadas de workspace `tests/`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 61

**Fonte:** `    if (syncSource.includes(legacy)) problems.push('sync-version.js reintroduziu workspace legado: ' + legacy);`

**Função:** Registra reintrodução de `tests/package*.json`.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 62

**Fonte:** `  }`

**Função:** Fecha o loop de paths legados do sincronizador.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 63

**Fonte:** `}`

**Função:** Fecha a inspeção condicional do sincronizador.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 64

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa coleta de problemas da decisão final.

**Racional técnico:** É separação visual sem efeito de runtime; preserva legibilidade entre fases do gate.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 65

**Fonte:** `if (problems.length) {`

**Função:** Decide falha se ao menos um problema foi acumulado.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 66

**Fonte:** `  console.error('Contrato de publicação inválido:');`

**Função:** Imprime cabeçalho de erro no stderr.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 67

**Fonte:** `  for (const problem of problems) console.error('- ' + problem);`

**Função:** Imprime todas as violações acumuladas.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 68

**Fonte:** `  process.exit(1);`

**Função:** Encerra o processo com status 1.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 69

**Fonte:** `}`

**Função:** Fecha o bloco de falha.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 70

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa falha da mensagem positiva.

**Racional técnico:** É separação visual sem efeito de runtime; preserva legibilidade entre fases do gate.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 71

**Fonte:** `console.log('Contrato de publicação validado: extensão, docs e versionamento apontam para os caminhos canônicos.');`

**Função:** Imprime confirmação de contrato válido quando `problems` ficou vazio.

**Racional técnico:** A linha participa do gate fail-closed que preserva caminhos e marcadores canônicos sem alterar os arquivos auditados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o CLI é ligado a `package.json#validate:publish` e ao job `ci-contract`, mas não há self-test focal deste ramo.

### Linha/posição 72

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Representa o newline final POSIX.

**Racional técnico:** Documentar a posição terminal garante cobertura posicional integral do artefato auditado.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

## 11. Autoauditoria

- SHA reconfirmado: `f5b3f6c69f85f90fe43689de2e44b6ed70cca757`.
- Fonte integral embutida sem alteração.
- Cobertura: **72/72 posições**.
- Consumidores/dependências cruzados com package, CI, workflow de publish, sincronizador e CI Contract.
- Evidências classificadas sem promover ocorrência textual a prova direta.
- Lacunas externas registradas em `.state/088.json`; nenhum arquivo externo foi modificado.
- `STATUS.md`, `CHECKLIST.md` e `AUDITORIA.md` permaneceram somente leitura neste escopo.

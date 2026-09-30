# Bíblia técnica — scripts/release/sync-version.js

> **Estado documental:** ✅ CONCLUÍDO — REVALIDADO  
> **SHA auditado:** `9bc8fa5ae3fb127698e6f35988fd6efab7e56c07`  
> **Agente responsável atual:** AGENTE 12  
> **Histórico:** conteúdo base produzido por GPT-5.6-Sol#11 e integralmente revalidado pelo AGENTE 12 sem alterar código/testes  
> **Tipo:** ferramenta Node.js de versionamento/release  
> **Linhas textuais:** **172**  
> **Posições documentais:** **173**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/release/sync-version.js` implementa o contrato de **fonte única de versão** do Manga Translator. A única versão editada manualmente é `package.json#version`; este módulo valida esse SemVer, deriva a forma compatível com o Manifest Chromium, mantém `extension/manifest.json` e o lockfile raiz coerentes, verifica a existência dos artefatos canônicos de documentação/publicação e expõe metadados para o workflow de release.

O arquivo possui três superfícies operacionais:

1. **default / `version:sync`** — muta Manifest e lockfile;
2. **`--check` / `version:check`** — verifica sem escrever e falha CI quando existe drift;
3. **`--print-env`** — escreve seis pares `KEY=value` usados por workflows para nomear tag e artefatos.

A regra arquitetural correspondente está em `docs/Documentação.md:1954-1971`: `package.json` é a fonte manual única; `version:sync` atualiza derivados e `version:check` valida o resultado.

## 2. Chamadores, consumidores e dependências

### Chamadores diretos

- `package.json:34` — `version:sync = node scripts/release/sync-version.js`;
- `package.json:35` — `version:check = node scripts/release/sync-version.js --check`;
- `package.json:38` — o pipeline `validate` começa por `npm run version:check`;
- `.github/workflows/ci.yml:17-30` — job **Version Integrity** executa `version:check` e `--print-env`;
- `.github/workflows/publish.yml:28-33` — valida primeiro e depois redireciona `--print-env` para `$GITHUB_ENV`;
- `tests/unit/background/version-sync.test.js:3-6` — importa `parseNumericSemver` e `deriveVersionInfo`.

### Consumidores dos valores derivados

`publish.yml` consome `RELEASE_TAG`, `DISPLAY_VERSION`, `RELEASE_BASENAME` e `DOC_ARTIFACT` para validar a tag, nomear pasta/ZIP, copiar a documentação e criar/atualizar a GitHub Release. O teste `version-sync.test.js:36-50` protege estaticamente esses marcadores no workflow.

### Gates estruturais

- `scripts/validation/verify-publish-contract.js:13-20` exige a presença do script e artefatos canônicos;
- `verify-publish-contract.js:23-47` protege o uso de `version:check`, `--print-env`, basename e documentação no workflow;
- `verify-publish-contract.js:50-62` protege os caminhos internos canônicos deste script e rejeita referências ao antigo workspace `tests/`;
- `scripts/validation/verify-ci-contract.js:110-115` exige os dois comandos no job `version-integrity`;
- `scripts/validation/verify-repository-structure.js:60-76` exige `scripts/release/sync-version.js`;
- o mesmo gate trata `scripts/sync-version.js` legado como caminho proibido nas verificações estruturais/referências.

### Dependências de runtime

- Node.js CommonJS;
- `fs` e `path`;
- `package.json`;
- `extension/manifest.json`;
- `package-lock.json`;
- existência de `docs/Documentação.md`;
- existência de `.github/workflows/publish.yml`.

Não há dependência de Chrome API, DOM, rede, IndexedDB ou Playwright.

## 3. Contrato de versão

### Entrada canônica

`package.json#version` deve ser estritamente `MAJOR.MINOR.PATCH` numérico. A regex rejeita prefixo `v`, prerelease, build metadata, dois componentes e zero à esquerda fora do valor isolado `0`. Cada componente também precisa estar entre 0 e 65535 e caber como inteiro seguro.

### Derivações

Para `6.5.0`:

- `PACKAGE_VERSION=6.5.0`;
- `MANIFEST_VERSION=6.5`;
- `DISPLAY_VERSION=6.5`;
- `RELEASE_TAG=v6.5.0`;
- `RELEASE_BASENAME=Manga-Translator-v6.5`;
- `DOC_ARTIFACT=Documentação_V6.5.md`.

Para patch não-zero, por exemplo `6.5.1`, a versão Manifest/display preserva três componentes.

### Campos sincronizados

Somente estes campos JSON são alterados pelo algoritmo:

- `extension/manifest.json#version`;
- `package-lock.json#version`;
- `package-lock.json#packages[""].version`.

A função não altera `package.json`: ele é a fonte.

## 4. Modos CLI e precedência

A ordem das branches é material:

1. se `argv` contém `--print-env`, esse modo vence e retorna;
2. senão, se contém `--check`, roda a checagem read-only;
3. sem essas flags, roda sincronização mutável.

Consequência: passar simultaneamente `--print-env --check` executa apenas `--print-env`. Argumentos desconhecidos, isoladamente, não causam erro: caem no modo default e sincronizam.

O workflow oficial reduz o risco de `--print-env` emitir metadados num workspace inconsistente ao executar `version:check` imediatamente antes.

## 5. Estado, side effects e atomicidade

O módulo não mantém estado durável próprio em memória entre execuções. Seus side effects são:

- leitura síncrona de três JSONs;
- probes `existsSync` de docs/workflow;
- potencial reescrita completa de Manifest e lockfile;
- stdout/stderr;
- `process.exitCode = 1` no check inconsistente.

A sincronização é **sequencial, não transacional**: grava Manifest e depois lockfile. Se a primeira escrita funcionar e a segunda falhar, o script pode deixar atualização parcial. A pós-checagem só ocorre depois dos dois writes. Isso é uma lacuna de robustez a ser investigada, não uma prova de bug observado em CI.

## 6. Tratamento de erros

Erros de leitura JSON, parse, permissão e escrita não são encapsulados: propagam como exceções Node. Há mensagens próprias para:

- SemVer em formato inválido;
- componente fora de 0..65535;
- `package-lock.json` sem `packages[""]`;
- sincronização que termina com diferenças remanescentes.

`--check` não lança para drift esperado; imprime lista e define exit code 1.

## 7. Evidência automatizada

| Comportamento | Evidência existente | Classificação |
|---|---|---|
| `6.5.0` deriva o objeto completo esperado | `version-sync.test.js:9-18` | ✅ PROVADO DIRETAMENTE |
| patch não-zero permanece no Manifest/basename | `version-sync.test.js:20-23` | ✅ PROVADO DIRETAMENTE |
| `7.0.0 → 7.0` | `version-sync.test.js:25-27` | ✅ PROVADO DIRETAMENTE |
| formatos não suportados e 65536 são rejeitados | `version-sync.test.js:29-34` | ✅ PROVADO DIRETAMENTE |
| workflow referencia docs/script/nomes derivados e evita nomes hardcoded | `version-sync.test.js:36-50` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| caminhos canônicos internos do script | `verify-publish-contract.js:50-62` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| script existe no layout canônico | `verify-repository-structure.js:60-76` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI contém `version:check` + `--print-env` | `verify-ci-contract.js:110-115` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `checkWorkspace`/coleta/diff no workspace consistente | job Version Integrity executa `version:check` | 🟨 EXECUTADO INDIRETAMENTE |
| `printEnv` no workspace consistente | CI e publish executam `--print-env` | 🟨 EXECUTADO INDIRETAMENTE |
| cada mismatch de `getDifferences` | não há assertions focais | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `syncWorkspace` escreve corretamente em sandbox | não há teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falha da segunda escrita não deixa estado parcial | não há teste/rollback | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| stdout exato de `printEnv` | não há captura/assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branch vermelho de `--check` | não há spawn/sandbox focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| precedência de flags/argumento desconhecido | não há teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Lacunas e solicitações ao auditor

### 078-001 — TEST_REQUIRED — OPEN

**Encontrado:** a suíte atual testa diretamente parser/derivação, mas não exercita em sandbox as funções de I/O e os três modos CLI.

**Arquivo relacionado:** `tests/unit/background/version-sync.test.js`.

**Evidência atual:** assertions diretas nas linhas 9-34; execução real do caminho verde de check/print-env na CI.

**Evidência ausente:** mismatches individuais, docs/workflow ausentes, `packages[""]` ausente, escrita/sync em diretório temporário, pós-checagem, stdout/exit code e precedência CLI.

**Ação solicitada:** criar testes separados usando a implementação real e um root temporário/child process controlado, sem copiar a lógica do script.

**Risco:** regressões em branches de proteção ou sincronização podem ficar invisíveis enquanto derivação pura continua verde.

### 078-002 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** Manifest e lockfile são gravados em duas operações independentes; falha na segunda escrita pode deixar sincronização parcial.

**Arquivo relacionado:** `scripts/release/sync-version.js`.

**Evidência atual:** sequência explícita das linhas 100-101; não há rollback/rename transacional.

**Evidência ausente:** teste com falha de filesystem na segunda escrita e decisão formal sobre atomicidade esperada.

**Ação solicitada:** auditor separado deve decidir se best-effort sequencial é aceitável ou se o contrato exige estratégia transacional/rollback.

**Risco:** interrupção/permissão/erro de disco entre os dois writes pode deixar Manifest e lockfile divergentes.

### 078-003 — CONTRACT_REVIEW — OPEN

**Encontrado:** `--print-env` chama `collectState` e imprime derivações sem executar `getDifferences`; isoladamente, pode produzir ambiente mesmo com Manifest/lock/docs/workflow inconsistentes.

**Arquivo relacionado:** `scripts/release/sync-version.js` e consumidores de workflow.

**Evidência atual:** CI/publish executam `version:check` antes de `--print-env`, reduzindo o risco no caminho oficial.

**Evidência ausente:** teste/contrato que determine se o modo standalone deve ou não recusar workspace inconsistente.

**Ação solicitada:** confirmar intenção; se `--print-env` deva ser auto-validante, tratar em mudança funcional/teste separada.

**Risco:** consumidor futuro pode chamar somente `--print-env` e assumir que os demais arquivos estão sincronizados.

## 9. Invariantes que mudanças futuras devem preservar

1. `package.json#version` permanece a única fonte manual.
2. Formato aceito continua numérico `MAJOR.MINOR.PATCH`.
3. Cada componente permanece dentro do limite aceito pelo contrato.
4. Patch zero continua podendo ser omitido no Manifest; patch não-zero é preservado.
5. Tag usa SemVer completo, mesmo quando Manifest omite `.0`.
6. Basename/doc artifact derivam da versão, sem hardcode numérico.
7. Caminhos apontam à raiz, não ao antigo workspace `tests/`.
8. `--check` não modifica arquivos.
9. Drift em `--check` continua produzindo exit code não-zero.
10. Sync atualiza ambos os campos do lockfile e o Manifest.
11. Ausência de docs/workflow continua visível como diferença.
12. Sync não declara sucesso enquanto `checkWorkspace` ainda encontra diferenças.
13. Importar o módulo não executa `main`.
14. `publish.yml` valida antes de consumir `--print-env`.
15. Esta Bíblia só é válida para o blob `9bc8fa5ae3fb127698e6f35988fd6efab7e56c07`.

## 10. Fonte integral auditada

~~~javascript
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '../..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function parseNumericSemver(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(version || ''));
  if (!match) {
    throw new Error(`package.json#version deve usar SemVer numérico MAJOR.MINOR.PATCH; recebido: ${version}`);
  }

  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0 || part > 65535)) {
    throw new Error(`Cada componente da versão deve estar entre 0 e 65535; recebido: ${version}`);
  }

  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

function deriveVersionInfo(packageVersion) {
  const { major, minor, patch } = parseNumericSemver(packageVersion);
  const manifestVersion = patch === 0
    ? `${major}.${minor}`
    : `${major}.${minor}.${patch}`;

  return {
    packageVersion,
    manifestVersion,
    displayVersion: manifestVersion,
    releaseTag: `v${packageVersion}`,
    releaseBaseName: `Manga-Translator-v${manifestVersion}`,
    documentationArtifact: `Documentação_V${manifestVersion}.md`,
  };
}

function collectState(root = DEFAULT_ROOT) {
  const paths = {
    rootPackage: path.join(root, 'package.json'),
    manifest: path.join(root, 'extension', 'manifest.json'),
    rootLock: path.join(root, 'package-lock.json'),
    canonicalDocs: path.join(root, 'docs', 'Documentação.md'),
    publishWorkflow: path.join(root, '.github', 'workflows', 'publish.yml'),
  };

  const rootPackage = readJson(paths.rootPackage);
  const info = deriveVersionInfo(rootPackage.version);
  const manifest = readJson(paths.manifest);
  const rootLock = readJson(paths.rootLock);

  return { paths, info, manifest, rootLock };
}

function getDifferences(state) {
  const { paths, info, manifest, rootLock } = state;
  const differences = [];

  if (manifest.version !== info.manifestVersion) {
    differences.push(`extension/manifest.json#version: ${manifest.version} -> ${info.manifestVersion}`);
  }
  if (rootLock.version !== info.packageVersion) {
    differences.push(`package-lock.json#version: ${rootLock.version} -> ${info.packageVersion}`);
  }

  const lockRootVersion = rootLock.packages && rootLock.packages[''] && rootLock.packages[''].version;
  if (lockRootVersion !== info.packageVersion) {
    differences.push(`package-lock.json#packages[""].version: ${lockRootVersion} -> ${info.packageVersion}`);
  }
  if (!fs.existsSync(paths.canonicalDocs)) {
    differences.push('docs/Documentação.md ausente');
  }
  if (!fs.existsSync(paths.publishWorkflow)) {
    differences.push('.github/workflows/publish.yml ausente');
  }

  return differences;
}

function syncWorkspace(root = DEFAULT_ROOT) {
  const state = collectState(root);
  const before = getDifferences(state);

  state.manifest.version = state.info.manifestVersion;
  state.rootLock.version = state.info.packageVersion;

  if (!state.rootLock.packages || !state.rootLock.packages['']) {
    throw new Error('package-lock.json não contém packages[""]');
  }
  state.rootLock.packages[''].version = state.info.packageVersion;

  writeJson(state.paths.manifest, state.manifest);
  writeJson(state.paths.rootLock, state.rootLock);

  const after = checkWorkspace(root).differences;
  if (after.length) {
    throw new Error(`Sincronização incompleta: ${after.join('; ')}`);
  }

  return { info: state.info, changed: before };
}

function checkWorkspace(root = DEFAULT_ROOT) {
  const state = collectState(root);
  return { info: state.info, differences: getDifferences(state) };
}

function printEnv(info) {
  const values = {
    PACKAGE_VERSION: info.packageVersion,
    MANIFEST_VERSION: info.manifestVersion,
    DISPLAY_VERSION: info.displayVersion,
    RELEASE_TAG: info.releaseTag,
    RELEASE_BASENAME: info.releaseBaseName,
    DOC_ARTIFACT: info.documentationArtifact,
  };

  for (const [key, value] of Object.entries(values)) {
    process.stdout.write(`${key}=${value}\n`);
  }
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--print-env')) {
    const state = collectState(DEFAULT_ROOT);
    printEnv(state.info);
    return;
  }

  if (argv.includes('--check')) {
    const { info, differences } = checkWorkspace(DEFAULT_ROOT);
    if (differences.length) {
      console.error('❌ Metadados de versão fora de sincronia:');
      differences.forEach((difference) => console.error(`- ${difference}`));
      process.exitCode = 1;
      return;
    }

    console.log(`✅ Versionamento consistente: package ${info.packageVersion} / manifest ${info.manifestVersion}`);
    return;
  }

  const { info, changed } = syncWorkspace(DEFAULT_ROOT);
  if (changed.length) {
    console.log('✅ Metadados sincronizados:');
    changed.forEach((difference) => console.log(`- ${difference}`));
  } else {
    console.log('✅ Metadados já estavam sincronizados.');
  }
  console.log(`Package: ${info.packageVersion} | Manifest: ${info.manifestVersion}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseNumericSemver,
  deriveVersionInfo,
  collectState,
  getDifferences,
  syncWorkspace,
  checkWorkspace,
};
~~~

## 11. Cobertura documental posição por posição

A tabela abaixo cobre **todas as 173 posições documentais**. As posições 1–172 correspondem às linhas textuais do blob; a posição 173 representa explicitamente o newline terminal.

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 1 | U01 | `'use strict';` | Ativa semântica strict para todo o módulo CommonJS. |
| 2 | U01 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Bootstrap CommonJS e raiz canônica**; não produz efeito de runtime. |
| 3 | U01 | `const fs = require('fs');` | Importa `fs`, usado em leitura, existência e escrita de arquivos. |
| 4 | U01 | `const path = require('path');` | Importa `path`, usado para compor caminhos portáveis. |
| 5 | U01 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Bootstrap CommonJS e raiz canônica**; não produz efeito de runtime. |
| 6 | U01 | `const DEFAULT_ROOT = path.resolve(__dirname, '../..');` | Resolve a raiz do repositório subindo dois níveis desde `scripts/release`. |
| 7 | U01 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Bootstrap CommonJS e raiz canônica**; não produz efeito de runtime. |
| 8 | U02 | `function readJson(filePath) {` | Declara helper de leitura JSON parametrizado por caminho. |
| 9 | U02 | `  return JSON.parse(fs.readFileSync(filePath, 'utf8'));` | Lê UTF-8 de forma síncrona e parseia o conteúdo JSON; erros propagam ao chamador. |
| 10 | U02 | `}` | Fecha a estrutura sintática correspondente de **Helpers JSON de leitura e escrita**. |
| 11 | U02 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Helpers JSON de leitura e escrita**; não produz efeito de runtime. |
| 12 | U02 | `function writeJson(filePath, value) {` | Declara helper de escrita JSON. |
| 13 | U02 | `  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');` | Serializa com indentação de 2 espaços, adiciona newline final e grava UTF-8 sincronamente. |
| 14 | U02 | `}` | Fecha a estrutura sintática correspondente de **Helpers JSON de leitura e escrita**. |
| 15 | U03 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Parser SemVer numérico estrito**; não produz efeito de runtime. |
| 16 | U03 | `function parseNumericSemver(version) {` | Declara o parser do SemVer numérico canônico. |
| 17 | U03 | `  const match = /^(0\|[1-9]\d*)\.(0\|[1-9]\d*)\.(0\|[1-9]\d*)$/.exec(String(version \|\| ''));` | Converte a entrada em string e exige exatamente três inteiros decimais sem zeros à esquerda indevidos. |
| 18 | U03 | `  if (!match) {` | Abre o branch de rejeição quando a regex não casa. |
| 19 | U03 | `    throw new Error(\`package.json#version deve usar SemVer numérico MAJOR.MINOR.PATCH; recebido: ${version}\`);` | Lança diagnóstico citando a versão recebida quando o formato não é `MAJOR.MINOR.PATCH`. |
| 20 | U03 | `  }` | Fecha a estrutura sintática correspondente de **Parser SemVer numérico estrito**. |
| 21 | U03 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Parser SemVer numérico estrito**; não produz efeito de runtime. |
| 22 | U03 | `  const parts = match.slice(1).map(Number);` | Extrai os três captures e converte cada componente para `Number`. |
| 23 | U03 | `  if (parts.some((part) => !Number.isSafeInteger(part) \|\| part < 0 \|\| part > 65535)) {` | Rejeita componente não seguro, negativo ou maior que 65535. |
| 24 | U03 | `    throw new Error(\`Cada componente da versão deve estar entre 0 e 65535; recebido: ${version}\`);` | Lança diagnóstico específico do limite numérico aceito. |
| 25 | U03 | `  }` | Fecha a estrutura sintática correspondente de **Parser SemVer numérico estrito**. |
| 26 | U03 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Parser SemVer numérico estrito**; não produz efeito de runtime. |
| 27 | U03 | `  return { major: parts[0], minor: parts[1], patch: parts[2] };` | Retorna objeto nominal `{major, minor, patch}` para as derivações seguintes. |
| 28 | U03 | `}` | Fecha a estrutura sintática correspondente de **Parser SemVer numérico estrito**. |
| 29 | U04 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Derivação dos metadados de versão/release**; não produz efeito de runtime. |
| 30 | U04 | `function deriveVersionInfo(packageVersion) {` | Declara a derivação de todos os metadados a partir da versão do package. |
| 31 | U04 | `  const { major, minor, patch } = parseNumericSemver(packageVersion);` | Valida e decompõe a versão chamando o parser estrito. |
| 32 | U04 | `  const manifestVersion = patch === 0` | Inicia a regra de compactação do Manifest quando `patch` é zero. |
| 33 | U04 | `    ? \`${major}.${minor}\`` | Escolhe `major.minor` para patch zero. |
| 34 | U04 | `    : \`${major}.${minor}.${patch}\`;` | Preserva `major.minor.patch` quando o patch é não-zero. |
| 35 | U04 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Derivação dos metadados de versão/release**; não produz efeito de runtime. |
| 36 | U04 | `  return {` | Inicia o objeto único de metadados derivados. |
| 37 | U04 | `    packageVersion,` | Preserva a versão SemVer canônica para package/tag. |
| 38 | U04 | `    manifestVersion,` | Expõe a versão compatível com Manifest. |
| 39 | U04 | `    displayVersion: manifestVersion,` | Usa a mesma versão do Manifest como versão de display. |
| 40 | U04 | `    releaseTag: \`v${packageVersion}\`,` | Prefixa a versão SemVer completa com `v` para a tag de release. |
| 41 | U04 | `    releaseBaseName: \`Manga-Translator-v${manifestVersion}\`,` | Deriva o basename do pacote ZIP a partir da versão do Manifest/display. |
| 42 | U04 | `    documentationArtifact: \`Documentação_V${manifestVersion}.md\`,` | Deriva o nome versionado da cópia de `Documentação.md` publicada. |
| 43 | U04 | `  };` | Fecha a estrutura sintática correspondente de **Derivação dos metadados de versão/release**. |
| 44 | U04 | `}` | Fecha a estrutura sintática correspondente de **Derivação dos metadados de versão/release**. |
| 45 | U05 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Coleta do estado canônico do workspace**; não produz efeito de runtime. |
| 46 | U05 | `function collectState(root = DEFAULT_ROOT) {` | Declara coleta de estado com raiz injetável e default canônico. |
| 47 | U05 | `  const paths = {` | Inicia o mapa de caminhos do contrato de versão. |
| 48 | U05 | `    rootPackage: path.join(root, 'package.json'),` | Aponta ao `package.json` raiz, fonte manual única. |
| 49 | U05 | `    manifest: path.join(root, 'extension', 'manifest.json'),` | Aponta ao Manifest da extensão. |
| 50 | U05 | `    rootLock: path.join(root, 'package-lock.json'),` | Aponta ao único `package-lock.json` canônico na raiz. |
| 51 | U05 | `    canonicalDocs: path.join(root, 'docs', 'Documentação.md'),` | Aponta à documentação arquitetural canônica. |
| 52 | U05 | `    publishWorkflow: path.join(root, '.github', 'workflows', 'publish.yml'),` | Aponta ao workflow oficial de publicação. |
| 53 | U05 | `  };` | Fecha a estrutura sintática correspondente de **Coleta do estado canônico do workspace**. |
| 54 | U05 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Coleta do estado canônico do workspace**; não produz efeito de runtime. |
| 55 | U05 | `  const rootPackage = readJson(paths.rootPackage);` | Lê o package raiz. |
| 56 | U05 | `  const info = deriveVersionInfo(rootPackage.version);` | Deriva metadados usando exclusivamente `rootPackage.version`. |
| 57 | U05 | `  const manifest = readJson(paths.manifest);` | Lê o Manifest atual para comparação/sincronização. |
| 58 | U05 | `  const rootLock = readJson(paths.rootLock);` | Lê o lockfile raiz para comparação/sincronização. |
| 59 | U05 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Coleta do estado canônico do workspace**; não produz efeito de runtime. |
| 60 | U05 | `  return { paths, info, manifest, rootLock };` | Retorna caminhos, metadados e objetos JSON necessários aos próximos estágios. |
| 61 | U05 | `}` | Fecha a estrutura sintática correspondente de **Coleta do estado canônico do workspace**. |
| 62 | U06 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Detecção de divergências e pré-requisitos**; não produz efeito de runtime. |
| 63 | U06 | `function getDifferences(state) {` | Declara o comparador read-only do estado coletado. |
| 64 | U06 | `  const { paths, info, manifest, rootLock } = state;` | Desestrutura as quatro partes consumidas pela comparação. |
| 65 | U06 | `  const differences = [];` | Inicializa lista acumulativa de divergências. |
| 66 | U06 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Detecção de divergências e pré-requisitos**; não produz efeito de runtime. |
| 67 | U06 | `  if (manifest.version !== info.manifestVersion) {` | Compara a versão atual do Manifest com a derivada. |
| 68 | U06 | `    differences.push(\`extension/manifest.json#version: ${manifest.version} -> ${info.manifestVersion}\`);` | Registra transformação esperada do Manifest quando diverge. |
| 69 | U06 | `  }` | Fecha a estrutura sintática correspondente de **Detecção de divergências e pré-requisitos**. |
| 70 | U06 | `  if (rootLock.version !== info.packageVersion) {` | Compara `package-lock.json#version` com o SemVer do package. |
| 71 | U06 | `    differences.push(\`package-lock.json#version: ${rootLock.version} -> ${info.packageVersion}\`);` | Registra transformação esperada do campo superior do lockfile. |
| 72 | U06 | `  }` | Fecha a estrutura sintática correspondente de **Detecção de divergências e pré-requisitos**. |
| 73 | U06 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Detecção de divergências e pré-requisitos**; não produz efeito de runtime. |
| 74 | U06 | `  const lockRootVersion = rootLock.packages && rootLock.packages[''] && rootLock.packages[''].version;` | Lê defensivamente `package-lock.json#packages[""].version` via short-circuit. |
| 75 | U06 | `  if (lockRootVersion !== info.packageVersion) {` | Compara a versão do pacote raiz embutida no lockfile. |
| 76 | U06 | `    differences.push(\`package-lock.json#packages[""].version: ${lockRootVersion} -> ${info.packageVersion}\`);` | Registra transformação esperada para `packages[""].version`. |
| 77 | U06 | `  }` | Fecha a estrutura sintática correspondente de **Detecção de divergências e pré-requisitos**. |
| 78 | U06 | `  if (!fs.existsSync(paths.canonicalDocs)) {` | Verifica presença física da documentação canônica. |
| 79 | U06 | `    differences.push('docs/Documentação.md ausente');` | Registra ausência da documentação como divergência não reparável pelo sync. |
| 80 | U06 | `  }` | Fecha a estrutura sintática correspondente de **Detecção de divergências e pré-requisitos**. |
| 81 | U06 | `  if (!fs.existsSync(paths.publishWorkflow)) {` | Verifica presença física do workflow de publicação. |
| 82 | U06 | `    differences.push('.github/workflows/publish.yml ausente');` | Registra ausência do workflow como divergência. |
| 83 | U06 | `  }` | Fecha a estrutura sintática correspondente de **Detecção de divergências e pré-requisitos**. |
| 84 | U06 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Detecção de divergências e pré-requisitos**; não produz efeito de runtime. |
| 85 | U06 | `  return differences;` | Retorna todas as divergências acumuladas em vez de somente a primeira. |
| 86 | U06 | `}` | Fecha a estrutura sintática correspondente de **Detecção de divergências e pré-requisitos**. |
| 87 | U07 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Sincronização mutável do Manifest e lockfile**; não produz efeito de runtime. |
| 88 | U07 | `function syncWorkspace(root = DEFAULT_ROOT) {` | Declara o fluxo mutável de sincronização. |
| 89 | U07 | `  const state = collectState(root);` | Coleta estado inicial do workspace. |
| 90 | U07 | `  const before = getDifferences(state);` | Captura as divergências anteriores para relatório do que mudou/faltava. |
| 91 | U07 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Sincronização mutável do Manifest e lockfile**; não produz efeito de runtime. |
| 92 | U07 | `  state.manifest.version = state.info.manifestVersion;` | Atualiza em memória `manifest.version` para a versão derivada. |
| 93 | U07 | `  state.rootLock.version = state.info.packageVersion;` | Atualiza em memória o campo superior do lockfile. |
| 94 | U07 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Sincronização mutável do Manifest e lockfile**; não produz efeito de runtime. |
| 95 | U07 | `  if (!state.rootLock.packages \|\| !state.rootLock.packages['']) {` | Valida que a entrada raiz `packages[""]` existe antes de qualquer write. |
| 96 | U07 | `    throw new Error('package-lock.json não contém packages[""]');` | Abortará com mensagem específica se o lockfile não tiver a estrutura esperada. |
| 97 | U07 | `  }` | Fecha a estrutura sintática correspondente de **Sincronização mutável do Manifest e lockfile**. |
| 98 | U07 | `  state.rootLock.packages[''].version = state.info.packageVersion;` | Atualiza em memória a versão do pacote raiz dentro de `packages[""]`. |
| 99 | U07 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Sincronização mutável do Manifest e lockfile**; não produz efeito de runtime. |
| 100 | U07 | `  writeJson(state.paths.manifest, state.manifest);` | Grava o Manifest completo já atualizado. |
| 101 | U07 | `  writeJson(state.paths.rootLock, state.rootLock);` | Grava o lockfile completo já atualizado. |
| 102 | U07 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Sincronização mutável do Manifest e lockfile**; não produz efeito de runtime. |
| 103 | U07 | `  const after = checkWorkspace(root).differences;` | Reabre/recoleta o workspace e obtém divergências depois dos writes. |
| 104 | U07 | `  if (after.length) {` | Falha se qualquer divergência ainda permanecer. |
| 105 | U07 | `    throw new Error(\`Sincronização incompleta: ${after.join('; ')}\`);` | Lança erro agregado com as diferenças pós-sincronização. |
| 106 | U07 | `  }` | Fecha a estrutura sintática correspondente de **Sincronização mutável do Manifest e lockfile**. |
| 107 | U07 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Sincronização mutável do Manifest e lockfile**; não produz efeito de runtime. |
| 108 | U07 | `  return { info: state.info, changed: before };` | Retorna metadados derivados e a lista de divergências que existia antes do sync. |
| 109 | U07 | `}` | Fecha a estrutura sintática correspondente de **Sincronização mutável do Manifest e lockfile**. |
| 110 | U08 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Checagem read-only do workspace**; não produz efeito de runtime. |
| 111 | U08 | `function checkWorkspace(root = DEFAULT_ROOT) {` | Declara a verificação read-only. |
| 112 | U08 | `  const state = collectState(root);` | Coleta o estado sem mutação. |
| 113 | U08 | `  return { info: state.info, differences: getDifferences(state) };` | Retorna os mesmos metadados mais a lista produzida por `getDifferences`. |
| 114 | U08 | `}` | Fecha a estrutura sintática correspondente de **Checagem read-only do workspace**. |
| 115 | U09 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Exportação de metadados para ambiente**; não produz efeito de runtime. |
| 116 | U09 | `function printEnv(info) {` | Declara impressor dos metadados em formato de ambiente. |
| 117 | U09 | `  const values = {` | Inicia o mapa entre nomes de ambiente e valores derivados. |
| 118 | U09 | `    PACKAGE_VERSION: info.packageVersion,` | Exporta a versão SemVer do package como `PACKAGE_VERSION`. |
| 119 | U09 | `    MANIFEST_VERSION: info.manifestVersion,` | Exporta versão compatível com Manifest. |
| 120 | U09 | `    DISPLAY_VERSION: info.displayVersion,` | Exporta versão de display. |
| 121 | U09 | `    RELEASE_TAG: info.releaseTag,` | Exporta tag de release. |
| 122 | U09 | `    RELEASE_BASENAME: info.releaseBaseName,` | Exporta basename do artefato principal. |
| 123 | U09 | `    DOC_ARTIFACT: info.documentationArtifact,` | Exporta nome do artefato de documentação. |
| 124 | U09 | `  };` | Fecha a estrutura sintática correspondente de **Exportação de metadados para ambiente**. |
| 125 | U09 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Exportação de metadados para ambiente**; não produz efeito de runtime. |
| 126 | U09 | `  for (const [key, value] of Object.entries(values)) {` | Itera os pares de ambiente em ordem de inserção do objeto. |
| 127 | U09 | `    process.stdout.write(\`${key}=${value}\n\`);` | Escreve uma linha `KEY=value` em stdout para cada par. |
| 128 | U09 | `  }` | Fecha a estrutura sintática correspondente de **Exportação de metadados para ambiente**. |
| 129 | U09 | `}` | Fecha a estrutura sintática correspondente de **Exportação de metadados para ambiente**. |
| 130 | U10 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Modo CLI --print-env**; não produz efeito de runtime. |
| 131 | U10 | `function main(argv = process.argv.slice(2)) {` | Declara entrypoint com argv injetável e default sem os argumentos de Node/script. |
| 132 | U10 | `  if (argv.includes('--print-env')) {` | Dá prioridade ao modo `--print-env` se a flag estiver presente em qualquer posição. |
| 133 | U10 | `    const state = collectState(DEFAULT_ROOT);` | Coleta o estado a partir da raiz canônica para obter a versão do package. |
| 134 | U10 | `    printEnv(state.info);` | Emite os seis metadados derivados. |
| 135 | U10 | `    return;` | Retorna para impedir execução dos modos seguintes. |
| 136 | U10 | `  }` | Fecha a estrutura sintática correspondente de **Modo CLI --print-env**. |
| 137 | U11 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Modo CLI --check**; não produz efeito de runtime. |
| 138 | U11 | `  if (argv.includes('--check')) {` | Seleciona o modo read-only `--check` quando `--print-env` não venceu. |
| 139 | U11 | `    const { info, differences } = checkWorkspace(DEFAULT_ROOT);` | Executa a checagem e recebe metadados/diferenças. |
| 140 | U11 | `    if (differences.length) {` | Abre o branch de inconsistência quando existe ao menos uma diferença. |
| 141 | U11 | `      console.error('❌ Metadados de versão fora de sincronia:');` | Imprime cabeçalho de erro em stderr. |
| 142 | U11 | `      differences.forEach((difference) => console.error(\`- ${difference}\`));` | Imprime cada divergência como item separado. |
| 143 | U11 | `      process.exitCode = 1;` | Define código de saída 1 sem terminar o processo imediatamente. |
| 144 | U11 | `      return;` | Retorna após marcar falha. |
| 145 | U11 | `    }` | Fecha a estrutura sintática correspondente de **Modo CLI --check**. |
| 146 | U11 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Modo CLI --check**; não produz efeito de runtime. |
| 147 | U11 | `    console.log(\`✅ Versionamento consistente: package ${info.packageVersion} / manifest ${info.manifestVersion}\`);` | Imprime confirmação e as versões package/Manifest no caminho consistente. |
| 148 | U11 | `    return;` | Retorna após o check verde. |
| 149 | U11 | `  }` | Fecha a estrutura sintática correspondente de **Modo CLI --check**. |
| 150 | U12 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Modo CLI default: sincronizar**; não produz efeito de runtime. |
| 151 | U12 | `  const { info, changed } = syncWorkspace(DEFAULT_ROOT);` | No modo default, executa a sincronização mutável. |
| 152 | U12 | `  if (changed.length) {` | Distingue se havia algo a corrigir antes do sync. |
| 153 | U12 | `    console.log('✅ Metadados sincronizados:');` | Imprime cabeçalho de sincronização quando existiam divergências. |
| 154 | U12 | `    changed.forEach((difference) => console.log(\`- ${difference}\`));` | Lista cada divergência anterior como item corrigido/observado. |
| 155 | U12 | `  } else {` | Abre o caso idempotente em que nada estava divergente. |
| 156 | U12 | `    console.log('✅ Metadados já estavam sincronizados.');` | Informa que o workspace já estava sincronizado. |
| 157 | U12 | `  }` | Fecha a estrutura sintática correspondente de **Modo CLI default: sincronizar**. |
| 158 | U12 | `  console.log(\`Package: ${info.packageVersion} \| Manifest: ${info.manifestVersion}\`);` | Imprime as versões finais do package e Manifest. |
| 159 | U12 | `}` | Fecha a estrutura sintática correspondente de **Modo CLI default: sincronizar**. |
| 160 | U13 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **Guard de execução direta**; não produz efeito de runtime. |
| 161 | U13 | `if (require.main === module) {` | Detecta execução direta do módulo CommonJS. |
| 162 | U13 | `  main();` | Chama o entrypoint apenas quando este arquivo é o programa principal. |
| 163 | U13 | `}` | Fecha a estrutura sintática correspondente de **Guard de execução direta**. |
| 164 | U14 | `␠ [linha vazia]` | Separador visual dentro/entre blocos de **API CommonJS exportada**; não produz efeito de runtime. |
| 165 | U14 | `module.exports = {` | Inicia a superfície pública do módulo. |
| 166 | U14 | `  parseNumericSemver,` | Exporta o parser SemVer para teste/reuso. |
| 167 | U14 | `  deriveVersionInfo,` | Exporta a derivação de metadados. |
| 168 | U14 | `  collectState,` | Exporta a coleta de estado. |
| 169 | U14 | `  getDifferences,` | Exporta o detector de diferenças. |
| 170 | U14 | `  syncWorkspace,` | Exporta a sincronização mutável. |
| 171 | U14 | `  checkWorkspace,` | Exporta a checagem read-only. |
| 172 | U14 | `};` | Fecha o objeto de exports com ponto e vírgula. |
| 173 | U15 | `⏎ [newline final]` | Newline terminal pertencente ao blob auditado; fecha a equivalência física do fonte. |


## 12. Análise por unidade

### U01 — posições 1–7 — Bootstrap CommonJS e raiz canônica

**O que faz:** Ativa strict mode, importa `fs`/`path` e resolve a raiz única do repositório a partir de `scripts/release/`.

**Como faz:** Usa módulos built-in do Node e `path.resolve(__dirname, '../..')`, evitando depender do diretório corrente do shell.

**Por que foi feito assim:** O versionador é chamado por npm, CI e workflow de release; ancorar em `__dirname` mantém os mesmos arquivos-alvo em qualquer cwd.

**Por que uma alternativa ingênua seria pior:** Usar `process.cwd()` faria um comando disparado de subdiretório ler/escrever outro caminho ou falhar de forma dependente do shell.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para o marcador de raiz em `verify-publish-contract.js:50-62`; execução real também ocorre nos jobs de CI.

### U02 — posições 8–14 — Helpers JSON de leitura e escrita

**O que faz:** Centraliza parse síncrono de JSON e escrita formatada com dois espaços mais newline final.

**Como faz:** `readJson` combina `readFileSync(..., 'utf8')` com `JSON.parse`; `writeJson` serializa via `JSON.stringify(value, null, 2) + '\n'` e `writeFileSync`.

**Por que foi feito assim:** As operações de release são curtas e sequenciais; I/O síncrono simplifica a ordem e mantém formatação determinística.

**Por que uma alternativa ingênua seria pior:** I/O assíncrono sem coordenação aumentaria a superfície de corrida; escrever JSON sem newline/formatação criaria churn desnecessário.

**Evidência automatizada:** 🟨 `readJson` é EXECUTADO INDIRETAMENTE pelos comandos `--check`/`--print-env`; ⚠️ `writeJson` não possui teste focal que injete falha ou valide bytes escritos.

### U03 — posições 15–28 — Parser SemVer numérico estrito

**O que faz:** Aceita somente `MAJOR.MINOR.PATCH` decimal canônico, sem zeros à esquerda indevidos, prerelease ou build metadata, e limita cada componente a 0..65535.

**Como faz:** Uma regex captura os três componentes; depois `Number` converte e um segundo guard rejeita inteiro não seguro, negativo ou acima de 65535.

**Por que foi feito assim:** O package usa SemVer completo, mas o Manifest Chromium precisa de componentes numéricos dentro do limite; validar antes evita gerar release inválida.

**Por que uma alternativa ingênua seria pior:** Aceitar `v6.5.0`, `6.5`, prerelease ou componentes enormes deixaria package e Manifest com contratos incompatíveis.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `tests/unit/background/version-sync.test.js:29-34` para formatos inválidos, incluindo `65536.0.0`; o caminho válido é exercitado pelos testes de derivação.

### U04 — posições 29–44 — Derivação dos metadados de versão/release

**O que faz:** Deriva versão do Manifest/display, tag GitHub, basename do ZIP e nome versionado da documentação a partir da versão canônica do package.

**Como faz:** Quando `patch === 0`, reduz o Manifest para `major.minor`; caso contrário preserva três componentes. Os demais nomes são templates sobre a versão canônica/derivada.

**Por que foi feito assim:** Evita hardcodes de versão espalhados por workflow, artefatos e UI de release.

**Por que uma alternativa ingênua seria pior:** Manter nomes/version strings independentes cria drift entre `package.json`, Manifest, tag e artefatos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `version-sync.test.js:9-27`, que valida o objeto de 6.5.0, patch não-zero e major/minor com patch zero.

### U05 — posições 45–61 — Coleta do estado canônico do workspace

**O que faz:** Monta os cinco caminhos relevantes, lê package/Manifest/lockfile e deriva o conjunto de metadados a partir de `package.json#version`.

**Como faz:** Recebe `root` injetável para facilitar uso fora da raiz; apenas package, Manifest e lock são lidos como JSON, enquanto docs/workflow são verificados depois por existência.

**Por que foi feito assim:** Separa descoberta/leitura do estado da comparação e da mutação.

**Por que uma alternativa ingênua seria pior:** Misturar leitura, comparação e escrita em um único bloco impediria reutilizar a mesma semântica em `--check`, `--print-env` e sync.

**Evidência automatizada:** 🟦 os caminhos canônicos são protegidos em `verify-publish-contract.js:50-62`; 🟨 a função é executada indiretamente nos jobs `version-integrity` e publish; não há teste unitário focal do `root` injetável.

### U06 — posições 62–86 — Detecção de divergências e pré-requisitos

**O que faz:** Compara Manifest e dois campos do lockfile com a versão derivada e também exige a presença de `docs/Documentação.md` e `publish.yml`.

**Como faz:** Acumula mensagens textuais em `differences` sem abortar na primeira falha; usa short-circuit para acessar `packages[''].version` com segurança.

**Por que foi feito assim:** Um relatório agregado permite ao `--check` mostrar todas as inconsistências de uma vez.

**Por que uma alternativa ingênua seria pior:** Falhar no primeiro mismatch exigiria ciclos repetidos de correção; acessar `packages['']` sem guard poderia lançar antes de produzir diagnóstico.

**Evidência automatizada:** 🟨 o caminho sem diferenças é executado em CI por `npm run version:check`; ⚠️ não há assertion focal para cada mensagem/mismatch, docs ausente, workflow ausente ou `packages['']` ausente.

### U07 — posições 87–109 — Sincronização mutável do Manifest e lockfile

**O que faz:** Calcula divergências anteriores, atualiza os três campos de versão mutáveis, grava Manifest/lockfile, roda uma checagem pós-escrita e retorna metadados mais lista do que estava divergente.

**Como faz:** Valida `rootLock.packages['']` antes dos writes; depois grava dois JSONs sequencialmente e chama `checkWorkspace` para impedir sucesso quando ainda há diferenças.

**Por que foi feito assim:** O `package.json` continua sendo fonte manual única e o comando default transforma os derivados para o estado esperado.

**Por que uma alternativa ingênua seria pior:** Atualizar apenas Manifest ou apenas lock quebraria a invariável de versão; omitir a pós-checagem poderia declarar sucesso com docs/workflow ausentes ou escrita incompleta.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do fluxo de escrita real em diretório temporário. A documentação canônica prescreve `npm run version:sync`, mas os testes atuais não injetam falhas de filesystem.

### U08 — posições 110–114 — Checagem read-only do workspace

**O que faz:** Reusa `collectState` + `getDifferences` e devolve metadados/diferenças sem modificar arquivos.

**Como faz:** É uma composição deliberadamente pequena usada pelo CLI `--check` e pela pós-validação de `syncWorkspace`.

**Por que foi feito assim:** Uma função read-only compartilhada evita duplicar as regras do gate.

**Por que uma alternativa ingênua seria pior:** Uma implementação separada do `--check` poderia divergir da regra usada após a sincronização.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em `.github/workflows/ci.yml:17-30` e `publish.yml:28-33`; não há assertion unitária sobre o retorno completo.

### U09 — posições 115–129 — Exportação de metadados para ambiente

**O que faz:** Mapeia seis valores derivados para pares `KEY=value` consumíveis por `$GITHUB_ENV`.

**Como faz:** Constrói objeto em ordem estável e escreve cada entrada via `process.stdout.write` com newline.

**Por que foi feito assim:** Mantém `publish.yml` livre de lógica duplicada de derivação de nomes.

**Por que uma alternativa ingênua seria pior:** Reimplementar regras de versão em bash/YAML reintroduziria hardcodes e diferenças de semântica.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em CI/publish; `version-sync.test.js:36-50` prova estaticamente que o workflow chama `--print-env` e usa os nomes derivados, mas não captura stdout da função.

### U10 — posições 130–136 — Modo CLI --print-env

**O que faz:** Dá prioridade a `--print-env`, coleta o estado e emite somente os metadados derivados, retornando sem sincronizar nem executar o branch `--check`.

**Como faz:** Usa `argv.includes('--print-env')`; em caso de presença, chama `collectState(DEFAULT_ROOT)` e `printEnv(state.info)`.

**Por que foi feito assim:** O workflow precisa popular `$GITHUB_ENV` após validar versão.

**Por que uma alternativa ingênua seria pior:** Sincronizar automaticamente durante publicação mascararia repositório inconsistente; porém o modo isolado também não valida diferenças, o que exige o `version:check` anterior no workflow.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em CI/publish; 🟦 `verify-ci-contract.js:110-115` exige a chamada no job `version-integrity`.

### U11 — posições 137–149 — Modo CLI --check

**O que faz:** Executa a verificação read-only, imprime todas as divergências e marca `process.exitCode = 1`; no caso consistente imprime confirmação.

**Como faz:** Não chama `process.exit`, permitindo flush natural do stdout/stderr; retorna após configurar o código de saída em erro.

**Por que foi feito assim:** É apropriado para CI: falha o job sem modificar o workspace.

**Por que uma alternativa ingênua seria pior:** Corrigir automaticamente em CI ocultaria drift; lançar na primeira diferença reduziria o diagnóstico agregado.

**Evidência automatizada:** 🟨 o caminho verde é executado por `package.json#version:check` na CI e publish; ⚠️ o branch vermelho e o texto de todas as diferenças não têm teste focal.

### U12 — posições 150–159 — Modo CLI default: sincronizar

**O que faz:** Sem flags reconhecidas, roda `syncWorkspace`, relata diferenças corrigidas ou estado já consistente e imprime versões finais.

**Como faz:** Usa a lista `changed` capturada antes da escrita para produzir o resumo humano.

**Por que foi feito assim:** Faz `npm run version:sync` ser um comando simples e idempotente no caso já sincronizado.

**Por que uma alternativa ingênua seria pior:** Exigir múltiplos comandos manuais para Manifest/lock aumenta chance de inconsistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do CLI default; a documentação em `Documentação.md:1954-1971` descreve o contrato, mas documentação não é prova executável.

### U13 — posições 160–163 — Guard de execução direta

**O que faz:** Executa `main()` somente quando o arquivo é o entrypoint, preservando importabilidade em Jest/outros módulos.

**Como faz:** Usa o padrão CommonJS `require.main === module`.

**Por que foi feito assim:** Permite testar/exportar funções puras sem disparar escrita/saída CLI durante `require`.

**Por que uma alternativa ingênua seria pior:** Executar `main` ao importar faria `version-sync.test.js` modificar ou checar o workspace apenas por carregar o módulo.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE de forma estrutural pelo próprio teste que faz `require` nas linhas 3-6 e consegue chamar exports sem disparar o CLI.

### U14 — posições 164–172 — API CommonJS exportada

**O que faz:** Expõe parser, derivador, coleta, diff, sync e check para testes/consumidores Node.

**Como faz:** Exporta referências de função sem wrappers.

**Por que foi feito assim:** As funções puras e de orquestração permanecem reutilizáveis e testáveis fora do entrypoint.

**Por que uma alternativa ingênua seria pior:** Esconder tudo em `main` obrigaria testes a spawnar processos para validar até derivação pura.

**Evidência automatizada:** ✅ `parseNumericSemver` e `deriveVersionInfo` são importados/testados diretamente; ⚠️ os demais exports não possuem cobertura focal equivalente no teste atual.

### U15 — posições 173–173 — Newline final

**O que faz:** Representa o newline terminal do arquivo fonte.

**Como faz:** A posição documental 173 existe porque o blob termina com `\n` após a linha 172.

**Por que foi feito assim:** A auditoria byte-a-byte precisa distinguir 172 linhas textuais de 173 posições documentais.

**Por que uma alternativa ingênua seria pior:** Ignorar o terminador tornaria a afirmação de equivalência física ambígua.

**Evidência automatizada:** 🟦 verificado pela leitura integral do blob SHA auditado.


## 13. Auditoria documental do agente

- [x] SHA do fonte relido diretamente do branch;
- [x] fonte integral incorporada sem editar o código auditado;
- [x] 172 linhas textuais + newline final = 173/173 posições;
- [x] cada posição mapeada a uma unidade e papel local;
- [x] parser/derivação separados de I/O e CLI;
- [x] consumidores npm/CI/publish identificados;
- [x] gates estáticos diferenciados de execução indireta;
- [x] assertions diretas limitadas ao que realmente provam;
- [x] lacunas de sync/CLI/atomicidade registradas como solicitações externas;
- [x] nenhum código, teste, fixture, workflow ou configuração funcional foi alterado para fabricar evidência.

**Resultado desta autoauditoria:** ✅ conteúdo documental completo e revalidado para o SHA `9bc8fa5ae3fb127698e6f35988fd6efab7e56c07`. As três `audit_requests` permanecem `OPEN` e não bloqueiam a conclusão documental desta unidade. `AUDITORIA.md`, `STATUS.md` e `CHECKLIST.md` não foram alterados pelo AGENTE 12 por serem arquivos globais fora do seu escopo de escrita nesta execução.

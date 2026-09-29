# Arquitetura do Repositório

## Princípio central

A raiz do repositório é a única interface de desenvolvimento. Instalação, Jest, Playwright, coverage, validações e CI partem dela.

```bash
npm ci
npm test
```

## Diretórios

### `extension/`

Código distribuído da extensão Chromium Manifest V3.

Regras:
- não mover `extension/`;
- não mover `extension/manifest.json`;
- `background.js` continua sendo o service worker;
- qualquer novo `.js` em `extension/` entra no inventário de coverage;
- mudanças funcionais da extensão devem ter testes próprios.

### `tests/`

Somente material de teste:

- `unit/`: Jest unitário;
- `integration/`: Jest de integração;
- `smoke/`: smoke tests;
- `visual/`: runner visual/perceptual;
- `e2e/`: specs Playwright;
- `fixtures/`: fixtures servidas/consumidas pelos testes; `manga-images.js` é a fonte única dos PNGs E2E;
- `setup/`: geração/preparação de fixtures;
- `helpers/`: helpers compartilhados, incluindo `repo-root.js`;
- `mocks/`: mocks Jest.

Não deve conter outro `package.json`, lockfile, config Jest/Playwright ou tooling geral de CI.

### `scripts/ci/`

Runners/gates específicos de CI.

`scripts/ci/data/` contém dados declarativos protegidos:
- `test-baseline.json`;
- `e2e-shard-plan.json`;
- `regression-matrix.json`.

### `scripts/validation/`

Validações estruturais e selftests de infraestrutura. Devem falhar com exit code diferente de zero quando um contrato é violado.

### `scripts/maintenance/`

Diagnósticos pesados e ferramentas de investigação, não lógica funcional da extensão.

### `scripts/release/`

Automação de versão e release. `sync-version.js` usa somente módulos nativos do Node para poder rodar nos jobs que não fazem `npm ci`.

### `docs/`

- `Documentação.md`: contrato técnico canônico;
- `ARQUITETURA_DO_REPOSITORIO.md`: convenções do repositório;
- `PLANO_REESTRUTURACAO.md`: registro da migração;
- `historico/`: documentos de PRs/estados antigos.

## Configurações canônicas

- npm: `/package.json` + `/package-lock.json`;
- Jest: `/jest.config.js`;
- Playwright: `/playwright.config.js` (outputs em `/test-results/`);
- merge de blob reports: `scripts/ci/playwright-merge.config.js` (config auxiliar de merge, não segunda configuração de execução E2E).

## Como adicionar testes

- comportamento isolado: `tests/unit/<área>/`;
- integração entre módulos: `tests/integration/`;
- fluxo real Chromium: `tests/e2e/`;
- invariantes perceptuais: `tests/visual/`;
- smoke rápido: `tests/smoke/`.

Não use `.skip`, `.only`, `--passWithNoTests` ou `--forceExit` para mascarar falhas.

## Paths e cwd

Código de teste que precisa da raiz usa `tests/helpers/repo-root.js`. Não criar novas cópias de `findRoot` e não usar `process.cwd()` como fallback de descoberta do projeto.

## CI

`.github/workflows/ci.yml` preserva os IDs dos jobs e `name: MangaTranslator CI`.

Todos os jobs npm usam a raiz e o lockfile raiz. O gate agregado continua verificando os resultados obrigatórios, e os cinco grupos E2E permanecem definidos em `scripts/ci/data/e2e-shard-plan.json`.

## Coverage

`npm run test:coverage` gera `/coverage/`. `scripts/validation/verify-coverage.js` valida:

- inventário de arquivos da extensão;
- summary e LCOV;
- percentuais mínimos;
- arquivos críticos;
- mínimo de arquivos instrumentados.

Não excluir arquivos para aumentar artificialmente a porcentagem.

## Release

A versão é editada em `package.json#version`.

```bash
npm run version:sync
npm run version:check
```

A publicação continua empacotando somente `extension/` e copiando `docs/Documentação.md`.

## Invariantes de manutenção

1. uma raiz npm;
2. uma configuração Jest canônica;
3. uma configuração Playwright de execução canônica;
4. sem wrappers que apenas redirecionem para `tests/`;
5. sem paths dependentes de cwd;
6. sem mover manifest/entrypoints sem atualizar contratos e validar;
7. títulos/tags/IDs protegidos pela matriz/CI não devem ser renomeados sem atualizar o contrato;
8. documentação e workflow devem mudar junto com qualquer nova estrutura.


## Mapa lógico da Fase 0

A reestruturação segue estes blocos lógicos, preservados como referência para manutenção e rollback:

| Bloco | Responsabilidade | Resultado canônico |
|---|---|---|
| 0-A | higiene da raiz e `.gitignore` | documentos soltos removidos da raiz; outputs/caches ignorados |
| 0-B | documentação | `docs/historico/` separa material histórico de `docs/Documentação.md` |
| 0-C | tooling de CI | `tests/ci/` migra para `scripts/ci/`, `scripts/validation/` e `scripts/maintenance/` |
| 0-D | testes visuais | `tests/visual-v3/` vira `tests/visual/`, mantendo o contrato Passed/Failed/Total |
| 0-E | fixtures E2E | fixtures vão para `tests/fixtures/` e geração para `tests/setup/`; PNGs passam a ter fonte determinística única |
| 0-F | release/versionamento | `scripts/sync-version.js` vira `scripts/release/sync-version.js` e passa a usar o projeto npm da raiz |
| 0-G | layout da extensão | content/shared/popup/options/reader agrupados sem mover `extension/`, `manifest.json` ou `background.js` |

O histórico real desta PR não reescreve commits antigos para forçar artificialmente um commit
separado por cada rótulo 0-A…0-G. O mapa acima descreve a responsabilidade arquitetural de
cada bloco e os commits temáticos permanecem revertíveis sem alterar o estado funcional.

## Gate estrutural

`scripts/validation/verify-repository-structure.js` é executado no job `CI Contract` e impede reintroduções como:

- segundo `package.json`/lockfile;
- `tests/ci/`, `visual-v3/` ou fixtures aninhadas em `e2e/`;
- BAT/PS1;
- `working-directory: tests`, `cd tests` ou `npm --prefix tests`;
- `findRoot` duplicado;
- fallback em `process.cwd()` dentro dos testes;
- ausência dos diretórios/configs canônicos;
- reintrodução dos entrypoints planos removidos pelo bloco 0-G;
- divergência entre Manifest, background, páginas internas e o layout canônico de `extension/`.


## Layout interno da extensão

O bloco 0-G organiza a distribuição sem alterar os entrypoints estáveis do pacote:

```text
extension/
├── manifest.json
├── background.js
├── background/
├── content/
│   ├── content_manga.js
│   ├── cm-gtc-client.js
│   ├── cm-dom-replace.js
│   ├── cm-chapter.js
│   ├── cm-auto-restore.js
│   ├── content_gemini.js
│   ├── inject.js
│   └── gemini/
├── shared/
│   ├── gtc-fingerprint.js
│   ├── gtc-indexeddb.js
│   ├── storage-manager.js
│   └── shared-ui.js
├── popup/
├── options/
└── reader/
```

`extension/`, `extension/manifest.json`, `extension/background.js` e
`extension/background/` continuam estáveis. Mover arquivos entre os demais
subdiretórios exige atualizar Manifest, importScripts/require, HTML,
`chrome.runtime.getURL`, testes e thresholds no mesmo commit.


## Validação de ambiente novo

O workflow `MangaTranslator CI` possui o job `fresh-developer-flow`, executado em
`workflow_dispatch` antes da revisão final. Em um runner efêmero e checkout limpo,
ele instala dependências exclusivamente pela raiz e executa a interface pública de
desenvolvimento na ordem:

`npm ci` → `test:unit` → `test:integration` → `test:smoke` →
`test:visual` → `test:e2e` → `test:coverage` → `test:coverage:verify` →
`npm test`.

Esse job existe para detectar dependências ocultas de diretório atual, arquivos
gerados previamente ou wrappers locais. O `CI Gate` o torna obrigatório quando o
workflow é disparado manualmente.


## Portabilidade Windows

Além dos jobs Linux, a CI possui o gate `windows-portability` em
`windows-latest`. Ele executa instalação limpa, validações estruturais, Jest,
smoke, visual e coverage. A verificação de coverage no Windows protege também a
normalização de caminhos LCOV e impede que a arquitetura dependa silenciosamente
de separadores POSIX ou de um diretório de trabalho específico.

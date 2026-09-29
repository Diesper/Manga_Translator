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
- `fixtures/`: fixtures servidas/consumidas pelos testes;
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
- Playwright: `/playwright.config.js`;
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

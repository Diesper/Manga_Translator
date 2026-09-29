# Plano de Reestruturação do Repositório

## Objetivo

Migrar `Diesper/Manga_Translator` para uma arquitetura padrão e centralizada, sem wrappers de compatibilidade nem projetos npm duplicados.

A execução desta branch segue uma exceção operacional solicitada pelo mantenedor: **nenhum teste automatizado foi executado durante a edição**. A GitHub Actions é a autoridade de validação desta rodada. Isso altera a ordem de validação do plano original, mas não autoriza reduzir gates, baselines ou cobertura.

## Estado anterior

- 2 `package.json` funcionais (raiz + `tests/`).
- lockfile somente em `tests/`.
- 3 configs Jest.
- 2 configs Playwright.
- tooling de CI dentro de `tests/ci/`.
- runners legados e 12 launchers BAT/PS1.
- `visual-v3/` e fixtures dentro de `tests/e2e/`.
- dezenas de cópias de descoberta de raiz com fallback em `process.cwd()`.
- 9 jobs da CI com `working-directory: tests`.
- documentos históricos misturados com documentação vigente.

## Arquitetura alvo aplicada

```text
/
├── package.json
├── package-lock.json
├── jest.config.js
├── playwright.config.js
├── extension/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── smoke/
│   ├── visual/
│   ├── e2e/
│   ├── fixtures/
│   ├── helpers/
│   ├── mocks/
│   └── setup/
├── scripts/
│   ├── ci/data/
│   ├── validation/
│   ├── maintenance/
│   └── release/
└── docs/
    ├── Documentação.md
    ├── ARQUITETURA_DO_REPOSITORIO.md
    └── historico/
```

## Mapa de migração

### Fase 0 — higiene e posicionamento

| Origem | Destino |
|---|---|
| `projeto.md` | `docs/historico/projeto.md` |
| `status.md` | `docs/historico/status.md` |
| docs históricas PR47/PR48/revisões | `docs/historico/` |
| `tests/ci/run-jest-ci.js` | `scripts/ci/run-jest-ci.js` |
| `tests/ci/run-e2e-group.js` | `scripts/ci/run-e2e-group.js` |
| reporter/config de merge | `scripts/ci/` |
| validadores/selftests | `scripts/validation/` |
| diagnósticos | `scripts/maintenance/` |
| JSON de baseline/shards/regressões | `scripts/ci/data/` |
| `scripts/sync-version.js` | `scripts/release/sync-version.js` |
| `tests/visual-v3/` | `tests/visual/` |
| `tests/e2e/fixtures/` | `tests/fixtures/` + `tests/setup/` |

### Centralização

- dependências npm migradas para a raiz;
- lockfile migrado para a raiz mantendo as versões resolvidas já existentes;
- `tests/package.json` e `tests/package-lock.json` removidos;
- Jest consolidado em `/jest.config.js`;
- Playwright principal consolidado em `/playwright.config.js`;
- runners legados `run-all-tests.js` e `run-e2e.js` removidos;
- BAT/PS1 redundantes removidos;
- CI executa npm a partir da raiz;
- coverage passa a `/coverage/`;
- blob reports passam a `/blob-report/`;
- diagnósticos passam a `/.ci-results/`;
- descoberta de raiz centralizada em `tests/helpers/repo-root.js`.

## Decisões D1–D7

| ID | Estado |
|---|---|
| D1 launchers BAT/PS1 | removidos; Node/npm é o caminho oficial |
| D2 prompt interativo E2E | runner interativo removido; `MANGA_E2E_BROWSER_MODE` continua consumido pelos specs |
| D3 `Documentação.md` | mantido com nome/caminho estável |
| D4 PNGs | arquivos versionados removidos; `tests/fixtures/manga-images.js` é a fonte única, compartilhada pelo servidor e pelo materializador |
| D5 layout interno da extensão | **executado no bloco 0-G** após confirmação de baseline completa verde |
| D6 JSON de dados | movidos para `scripts/ci/data/` |
| D7 benchmark temporário | arquivado em `docs/historico/` |

## Acoplamentos C01–C41 — status

- C01–C05: versionamento/release apontam para raiz e `scripts/release/`; documentação canônica permanece estável.
- C06–C15: nome/IDs de jobs e concurrency preservados; caminhos da CI atualizados para raiz; `scripts/` permanece coberto pelo syntax check.
- C16–C21: Jest/coverage centralizados; gate de coverage preservado em script próprio e baseline mantida.
- C22–C23: `extension/background.js` não foi movido.
- C24: descoberta de raiz centralizada; fallbacks `process.cwd()` removidos dos E2E.
- C25–C26: estrutura de unit/integration/helpers/mocks preservada.
- C27: runner visual preserva o formato de resumo e ganhou nomes de arquivo neutros.
- C29–C34: Playwright e fixtures apontam para a raiz; plano de cinco grupos e workers permanece em dados canônicos.
- C35–C38: `extension/manifest.json` e `extension/background.js` permaneceram estáveis; Manifest, content scripts e páginas internas foram atualizados atomicamente para o novo layout 0-G.
- C39–C41: launchers removidos, `.gitignore` ampliado, documentação atualizada.

## Bloco 0-G — extensão

Executado após a confirmação do mantenedor de que a baseline completa estava verde.

Migração aplicada sem divisão de arquivos e sem alteração deliberada de lógica funcional:

- `extension/background.js`, `extension/background/` e `extension/manifest.json` permanecem estáveis;
- content scripts de mangá/Gemini foram agrupados em `extension/content/`;
- módulos Gemini foram movidos para `extension/content/gemini/`;
- GTC, storage e UI compartilhada foram agrupados em `extension/shared/`;
- popup, options e reader receberam diretórios próprios;
- Manifest, importScripts/require, HTML, runtime.getURL, testes, coverage e documentação foram atualizados no mesmo bloco;
- os caminhos planos antigos passam a ser proibidos pelo gate estrutural.

A validação automatizada pós-migração continua delegada à GitHub Actions, conforme a política desta execução.

## Validação delegada à CI

A baseline completa anterior ao bloco 0-G foi confirmada verde pelo mantenedor.
Após a migração 0-G, nenhuma suíte foi executada localmente pelo agente; a
validação pós-movimento permanece delegada à GitHub Actions.

Baselines protegidas:

- Jest: mínimo 108 suítes / 848 testes; 0 skipped; 0 todo.
- Visual: mínimo 224.
- E2E: 21, nos grupos 1/3/4/4/9; 0 flaky.
- Smoke: mínimo 6 arquivos.
- Coverage: mínimo 56 arquivos + thresholds globais/críticos.

A CI deve validar o comportamento após o 0-G. Falha vermelha deve ser tratada como informação de integração a corrigir nos novos caminhos, não como motivo para restaurar a duplicação estrutural ou o layout plano removido.

## Rollback

Os commits foram mantidos em blocos temáticos para permitir revert seletivo sem desfazer toda a migração.


## Endurecimento estrutural adicional

Após a migração principal:
- `scripts/validation/verify-repository-structure.js` passou a bloquear a reintrodução dos caminhos legados;
- o Playwright grava `/test-results/` na raiz;
- a CI chama `npm run lint` em vez de duplicar loops de `node --check` no YAML;
- `playwright-merge.config.js` é permitido apenas como configuração auxiliar de reporter/merge;
- as fixtures PNG possuem uma única definição determinística em `tests/fixtures/manga-images.js`.


## Checklist operacional do PR #65

O acompanhamento item a item desta execução fica em `docs/CHECKLIST_REESTRUTURACAO_PR65.md`.
A checklist deve ser atualizada a cada novo endurecimento ou evidência de CI, sem marcar como concluído o que ainda depende de `workflow_dispatch` ou de validação do novo HEAD.


## Comparação estrutural — Etapa 25

Medições do estado anterior vêm da pré-auditoria do plano; o estado posterior foi conferido na árvore real do PR #65 e, para testes/cobertura, no run verde #1589.

| Métrica | Antes | Depois |
|---|---:|---:|
| `package.json` funcionais | 2 | **1** |
| `package-lock.json` | 1 em `tests/` | **1 na raiz** |
| Configs Jest | 3 | **1** |
| Configs Playwright | 2 | **2** (1 execução + 1 auxiliar de merge, limitada a reporter) |
| Runners/tool runners de teste | 6 | **4** (`run-jest-ci`, `run-e2e-group`, smoke e visual; sem duplicação equivalente) |
| BAT/PS1 | 12 | **0** |
| Scripts npm | 35 (9 + 26) | **34 em um único package.json** |
| Jobs com `working-directory: tests` | 9 | **0** |
| Cópias locais de `findRoot/_findRoot` | ≥ 30 | **0** (helper canônico) |
| Tooling dentro de `tests/ci` + configs/runners antigos | 22 | **0** |
| Documentos soltos na raiz | 2 | **0** |
| Suítes Jest | ≥ 108 | **109** |
| Testes Jest | ≥ 848 | **851** |
| Testes visuais | ≥ 224 | **224** |
| E2E | 21 | **21/21; skipped=0; flaky=0** |
| Smoke | 6 arquivos | **6 arquivos** |
| Coverage statements | ref. 79,44% | **79,55%** |
| Coverage branches | ref. 71,85% | **71,52%** (acima do piso de 71%) |
| Coverage functions | ref. 82,50% | **83,04%** |
| Coverage lines | ref. 79,44% | **79,55%** |
| Arquivos instrumentados | ≥ 56 | **56** |

Observações:
- A segunda config Playwright é somente `scripts/ci/playwright-merge.config.js`; o gate estrutural proíbe nela `testDir`, `outputDir`, workers, retries, projects, webServer e launchOptions, evitando que vire uma segunda configuração de execução.
- A queda de branches em relação ao valor de referência prévio não reduz o gate: o piso protegido continua 71% e o run observado ficou em 71,52%.
- As contagens de Jest, visual, smoke e E2E não foram inferidas por arquivos; foram extraídas do GitHub Actions.


## Acoplamentos C01–C41 — evidência individual

| ID | Status | Evidência atual |
|---|---|---|
| C01 | Tratado | `sync-version.js` usa `package-lock.json` da raiz e `packages[""].version`; não depende mais de `tests/package*.json`. |
| C02 | Tratado | `DEFAULT_ROOT = path.resolve(__dirname, '../..')` após mover para `scripts/release/`. |
| C03 | Tratado | `version-sync.test.js` foi atualizado para o caminho `scripts/release/sync-version.js`; suíte Jest verde. |
| C04 | Tratado | `publish.yml` continua empacotando `extension/.`, copia `docs/Documentação.md` e usa o versionamento sem dependências externas. |
| C05 | Tratado | `docs/Documentação.md` preservou nome e caminho. |
| C06 | Tratado | workflow continua com `name: MangaTranslator CI`; recovery permanece separado. |
| C07 | Tratado | IDs/nome dos 14 jobs históricos foram preservados; jobs novos são aditivos e o contrato verifica dependências do gate. |
| C08 | Tratado | parser `jobBlock()` continua exigindo IDs de job com dois espaços; YAML não foi reformatado para outra estrutura. |
| C09 | Tratado | literais críticos foram migrados junto com paths; shards, Codecov, diagnósticos, gate e nomes de scripts consumidos pela CI continuam protegidos. |
| C10 | Tratado | contrato aponta para configs canônicas da raiz e reporter em `scripts/ci/`, preservando `forbidOnly`, paralelismo, retries e coverage V8. |
| C11 | Tratado | matriz de regressão permanece canônica em `scripts/ci/data/regression-matrix.json`; paths de selftests migrados sem renomear marcadores. |
| C12 | Tratado | jobs sem `npm ci` executam validadores escritos somente com módulos nativos do Node. |
| C13 | Tratado | `npm run lint` percorre `extension`, `tests` e `scripts`; tooling movido continua no syntax-check. |
| C14 | Tratado | cache, coverage, blob, test-results e `.ci-results` apontam para a raiz; `working-directory: tests` foi eliminado. |
| C15 | Tratado | `continue-on-error` permanece somente em uploads/integrações não-gate; passos de teste são bloqueantes. |
| C16 | Tratado | Jest consolidado em `/jest.config.js`, com projects, environments, timeouts e modo coverage. |
| C17 | Tratado | thresholds obsoletos da antiga config não viraram novo gate; o gate efetivo segue `verify-coverage.js` + baseline. |
| C18 | Tratado | inventário total continua em `test:ci`; scripts unit/integration não aplicam indevidamente a baseline total. |
| C19 | Tratado | `test:unit` seleciona apenas projetos unitários; `test:integration` apenas integration; `run-jest-ci` prova união/disjunção. |
| C20 | Tratado | `run-all-tests.js` e `--forceExit` removidos; runner CI reprova aviso de worker forçado. |
| C21 | Tratado | coverage está na raiz, exige 56 arquivos, LCOV + summary e thresholds críticos; run #1589 aprovou 56/56. |
| C22 | Tratado | `extension/background.js` permaneceu no mesmo caminho, preservando o loader textual. |
| C23 | Tratado | service worker segue `background.js`; `importScripts` foi atualizado somente para subpaths internos do 0-G. |
| C24 | Tratado | descoberta de raiz centralizada em `tests/helpers/repo-root.js`; gate proíbe finders locais e `process.cwd()` nos testes. |
| C25 | Tratado | profundidade das categorias de testes foi preservada; referências à extensão foram atualizadas atomicamente no 0-G. |
| C26 | Tratado | `tests/mocks/` e `tests/helpers/` permaneceram em locais canônicos. |
| C27 | Tratado | visual foi migrado para `tests/visual/`; formato `Passed/Failed/Total` e baseline 224 foram preservados. |
| C28 | Não definido | O registro original salta de C27 para C29; não há requisito C28 a migrar. |
| C29 | Tratado | Playwright canônico na raiz: `testDir ./tests/e2e`, output raiz, reporter em `scripts/ci/`, extensão resolvida pela raiz. |
| C30 | Tratado | cinco grupos explícitos 1/3/4/4/9, 21 testes e workers vindos do JSON continuam protegidos pelo contrato. |
| C31 | Tratado | runner interativo antigo removido; `MANGA_E2E_BROWSER_MODE` é consumido pelos três specs E2E. |
| C32 | Tratado | Chromium `--with-deps --no-shell`, Xvfb, blobs e merge-reports foram preservados; nenhum headless experimental substituiu o gate. |
| C33 | Tratado | PNGs versionados removidos; `tests/fixtures/manga-images.js` é a única definição determinística, materializada por `tests/setup/create-test-images.js`. |
| C34 | Tratado | mock server e página/imagens usam `tests/fixtures/`; E2E 21/21 comprova o conjunto integrado. |
| C35 | Tratado | Manifest foi atualizado atomicamente para content/popup/options; gate estrutural verifica a ordem/caminhos do 0-G. |
| C36 | Tratado | `extension/` e `extension/manifest.json` não foram movidos/renomeados. |
| C37 | Tratado | fingerprint foi movido para `extension/shared/` e os usos no content script e service worker foram atualizados. |
| C38 | Tratado | HTML, `runtime.getURL`, executeScript e referências de UI foram migrados para popup/options/reader/content; testes passaram no run verde. |
| C39 | Tratado | wrappers BAT/PS1 foram removidos; Node/npm na raiz é o caminho oficial documentado. |
| C40 | Tratado | `.gitignore` cobre caches Jest, `.ci-results`, blobs agregados, dist e outputs da raiz. |
| C41 | Tratado | textos defasados principais foram atualizados; novo gate de paths já encontrou e corrigiu uma referência pré-0-G residual. |


## Evidência adicional — run #1620

O run GitHub Actions #1620 validou o HEAD `a942823c676a3bd4f7ba9106581c359162e573d3`:

- CI Contract: success;
- Version Integrity / Syntax / Manifest / Smoke / Visual: success;
- Unit + Integration Node 20 e 22: success;
- partição Jest: 96 arquivos unit + 13 integration = 109/109;
- Jest: 109 suítes / 851 testes / skipped=0 / todo=0;
- cinco shards E2E e gate agregado: success;
- Code Coverage: success;
- Windows Portability: success, incluindo validate, Jest, smoke, visual, coverage e normalização de paths;
- CI Gate: success.

Os diagnósticos pesados e o Fresh Developer Flow continuam intencionalmente condicionados a
`workflow_dispatch`/push na `main`; a validação manual final permanece pendente antes da revisão.


## Evidência final de PR — run #1621

O run #1621 validou o HEAD funcional/configuracional `0d19a20a030c16986ca4720d18716f5a413039a7` integralmente:

- Version Integrity incluiu `npm run version:check` e `sync-version.js --print-env`;
- CI Contract e self-tests: success;
- Jest Node 20/22: 109 suítes / 851 testes;
- partição: unit 96 arquivos + integration 13 = 109/109;
- Visual: 224/224;
- Smoke: 6 arquivos;
- E2E: 21/21, cinco grupos, sem skipped/flaky;
- Linux coverage: 56/56 arquivos; 79,55 / 71,52 / 83,04 / 79,55;
- Windows Portability: success; coverage 56/56 e 79,57 / 71,53 / 83,04 / 79,57;
- CI Gate: success;
- branch: 37 commits à frente, 0 atrás da main, mergeable.

A única validação obrigatória ainda pendente do plano é o `workflow_dispatch` final para executar
os três diagnósticos pesados e o Fresh Developer Flow, pois esses jobs são intencionalmente skipped
em `pull_request`.

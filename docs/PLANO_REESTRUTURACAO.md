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

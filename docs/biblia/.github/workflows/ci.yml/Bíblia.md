# Bíblia técnica — .github/workflows/ci.yml

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE  
> **SHA auditado:** `ebee75820db9bfab618bf3c3016065c5bc857ed7`  
> **Agente responsável pela auditoria:** AGENTE 3  
> **Tipo:** workflow GitHub Actions / CI  
> **Linhas textuais:** **558**  
> **Posições documentais:** **558** — o arquivo não possui newline terminal  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Identidade e papel arquitetural

`.github/workflows/ci.yml` é o orquestrador principal de integração contínua do Manga Translator. Ele transforma três classes de evento — pull request, push na `main` e disparo manual — em uma malha de gates independentes: integridade de versão, sintaxe, Manifest, contrato da própria CI, smoke, visual, Jest, coverage, E2E em cinco grupos, diagnósticos de worker/leak, portabilidade Windows e fluxo de desenvolvedor novo.

O desenho não coloca toda a lógica dentro do YAML. A maior parte da política é delegada a scripts canônicos da raiz (`package.json`, `scripts/ci/*`, `scripts/validation/*`, `scripts/maintenance/*`). Isso é importante porque os mesmos entry points podem ser usados localmente e os validadores podem testar a infraestrutura sem duplicar lógica no workflow.

O job `ci-gate` é o agregador. Ele recebe os resultados dos jobs anteriores, exige todos os gates funcionais em qualquer execução não cancelada e torna diagnósticos pesados obrigatórios somente em `workflow_dispatch` e push da `main`. O `fresh-developer-flow` é obrigatório apenas no disparo manual.

## 2. Quem carrega/consome este arquivo

- **GitHub Actions** carrega o YAML em eventos declarados em `on`.
- **`.github/workflows/recover-cancelled-ci.yml`** consome a identidade pública `MangaTranslator CI` via `workflow_run.workflows`; renomear a linha 1 exige alteração coordenada naquele workflow.
- **`scripts/validation/verify-ci-contract.js`** lê este arquivo como texto, extrai blocos de jobs e aplica invariantes estáticos específicos.
- **`scripts/validation/verify-ci-contract-selftest.js`** copia o workflow para sandbox descartável, remove deliberadamente o job `visual` e exige que o contrato falhe pelo motivo correto.
- **`scripts/validation/verify-repository-structure.js`** varre este workflow por referências operacionais legadas proibidas.
- **`package.json`** fornece os comandos npm chamados pelo YAML; o workflow e o package precisam evoluir juntos.
- **`playwright.config.js`**, `scripts/ci/data/e2e-shard-plan.json`, `scripts/ci/run-e2e-group.js` e `scripts/ci/playwright-merge.config.js` implementam a metade E2E.
- **`scripts/ci/run-jest-ci.js`**, `jest.config.js` e os diagnósticos em `scripts/maintenance/` implementam a metade Jest/worker.
- **`publish.yml`** é um workflow separado; a CI valida o contrato de publicação, mas não publica releases.

## 3. Fluxo de dados e efeitos colaterais

Entradas principais: contexto GitHub (`github.event_name`, `github.ref`, `github.sha`), conteúdo do checkout, `package-lock.json`, secret opcional `CODECOV_TOKEN` e resultados `needs.*.result`.

Efeitos colaterais: instalação de dependências npm, download do Chromium, criação de coverage, blobs Playwright, resultados/diagnósticos em `.ci-results`, upload/download de artifacts, envio opcional a Codecov e conclusão de checks do GitHub. O workflow não escreve no repositório nem publica release.

Os jobs são isolados em VMs distintas. Por isso E2E usa artifacts para transportar blob reports dos cinco shards ao agregador; filesystem não é compartilhado entre jobs.

## 4. Concorrência e lifecycle

A chave `ci-${{ github.workflow }}-${{ github.ref }}` serializa/supersede apenas a mesma ref. PRs e branches permitem cancelamento do run anterior; `main` explicitamente não. Essa assimetria preserva custo baixo durante iteração e evidência completa pós-merge.

O recovery separado observa workflows concluídos e pode reexecutar runs cancelados ainda relevantes para HEAD de PR aberto. Isso cria um acoplamento nominal com `name: MangaTranslator CI`.

## 5. Segurança e trust boundaries

1. Código de PR é executado por Jest, Playwright e scripts Node em runners efêmeros. Isso é uma trust boundary: mudanças no próprio PR podem modificar scripts chamados pela CI.
2. `CODECOV_TOKEN` é o único secret explicitamente referenciado neste workflow e fica escopado ao step de detecção/upload. Em contextos onde o secret não é disponibilizado, o upload é pulado de forma explícita.
3. Não existe bloco `permissions:` neste workflow; portanto as permissões do `GITHUB_TOKEN` dependem das configurações/defaults do repositório. Uma política least-privilege explícita reduziria ambiguidade.
4. Actions externas são referenciadas por tags maiores (`@v4`, `@v7` em workflows correlatos) e não por SHA imutável. Isso é mais simples de manter, porém amplia risco de supply-chain comparado a pin por commit.
5. Artifacts podem conter logs/trace/screenshots de falha. Eles não devem incluir secrets nem conteúdo privado inesperado; retenções curtas ajudam minimização.
6. O workflow privilegiado de recovery foi projetado separadamente e não faz checkout de código do gatilho, justamente porque `workflow_run` pode receber token mais privilegiado.

## 6. Dependências operacionais

| Área | Dependência | Contrato relevante |
|---|---|---|
| versão | `scripts/release/sync-version.js` | `version:check` + `--print-env` |
| sintaxe | `scripts/validation/check-js-syntax.js` | entry point `npm run lint` |
| Manifest | `scripts/validation/validate-manifest.js` | `npm run validate:manifest` |
| estrutura | `verify-repository-structure.js` | caminhos canônicos e documentação multiagente |
| anti-skip | `verify-test-policy*.js` | rejeita skip/only/todo/forceExit/passWithNoTests/escape-hatch |
| Jest | `run-jest-ci.js` + `jest.config.js` | inventário, partição unit/integration, worker forçado |
| coverage | `verify-coverage*.js` | LCOV/summary, baseline e arquivos críticos |
| E2E | plano + group runner + Playwright config/reporter | cinco grupos, workers do plano, zero retry CI |
| leak | `diagnose-jest-workers.js` e `diagnose-background-leak.js` | reprodução localizada e artifacts |
| release | `verify-publish-contract.js` | publicação permanece em paths canônicos |

## 7. Evidência automatizada verificada

| Comportamento | Evidência lida | Classificação |
|---|---|---|
| lista dos 16 jobs obrigatórios | `verify-ci-contract.js#requiredJobs` + `jobBlock` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `visual` realmente não pode ser removido sem o gate reclamar | self-test cria sandbox, renomeia o job e exige mensagem `job obrigatório ausente: visual` | ✅ PROVADO DIRETAMENTE para o verificador |
| cancelamento proibido na main | regex exata em `verify-ci-contract.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| gatilhos push/main + PR + manual | regex/markers no mesmo verificador | 🟦 GATE ESTÁTICO ESPECÍFICO |
| cinco grupos E2E explícitos | verificador exige nomes e plano com 5 grupos | 🟦 GATE ESTÁTICO ESPECÍFICO |
| cobertura E2E sem omissão/duplicata | `verify-e2e-shard-plan.js` executa `playwright --list`, compara união e cada grupo | ✅ PROVADO DIRETAMENTE quando esse script roda |
| coverage deve gerar e depois verificar | contrato exige `test:coverage` e `test:coverage:verify` bloqueantes | 🟦 GATE ESTÁTICO ESPECÍFICO |
| política Codecov configurado/ausente | contrato exige notice de ausência e `fail_ci_if_error: true` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Windows executa validate/Jest/smoke/visual/coverage | markers obrigatórios no bloco `windows-portability` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| fluxo de desenvolvedor novo | markers e condição manual protegidos estaticamente | 🟦 GATE ESTÁTICO ESPECÍFICO |
| diagnósticos pesados obrigatórios na main/manual | condições e checks protegidos no verificador | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `ci-gate` avalia falhas sem ressuscitar run cancelado | regex exige `always() && !cancelled()` e proíbe `always()` puro | 🟦 GATE ESTÁTICO ESPECÍFICO |
| runtime completo deste exato SHA | o run PR recente observado para SHA anterior foi cancelado por concorrência; não foi usado como prova de sucesso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este SHA documental |

Importante: a maioria das validações de `verify-ci-contract.js` é **estática por marcador**. Ela prova presença/forma mínima do contrato, não que GitHub Actions executará cada action externa com sucesso. O self-test prova o comportamento do verificador em três mutações negativas (job obrigatório, `forbidOnly`, marcador de regressão), não todas as regras individualmente.

## 8. Análise crítica

1. **Permissões implícitas:** ausência de `permissions:` deixa escopo do token dependente de defaults. Isso não é bug funcional provado, mas é hardening incompleto.
2. **Sem `timeout-minutes` nos jobs:** um comando pendurado pode consumir o limite padrão do GitHub Actions por muito tempo; não há gate específico para tempo máximo.
3. **Actions por tag maior, não SHA:** `actions/checkout@v4`, `setup-node@v4`, artifacts e Codecov são atualizáveis pela tag. Pin por SHA reduziria risco de supply-chain, ao custo de manutenção via dependabot/bot.
4. **Codecov é deliberadamente não bloqueante:** `fail_ci_if_error: true` faz a action produzir falha própria, mas `continue-on-error: true` permite o job continuar; a linha seguinte converte isso em warning. O gate local de coverage é a autoridade real.
5. **Duplicação de carga:** `windows-portability` roda `npm run validate` e depois vários testes novamente; `fresh-developer-flow` também repete suites. Isso aumenta custo, mas verifica entry points/OS/fluxo limpo.
6. **Diagnósticos de leak não rodam em PR comum:** são obrigatórios só na main/manual. Uma regressão pode ser descoberta apenas pós-merge; essa é uma decisão explícita de custo versus feedback.
7. **`e2e` usa `if: always()`:** necessário para agregar artifacts mesmo após shard falhar, mas deve ser mantido alinhado ao comportamento de cancelamento do workflow; o gate final usa `!cancelled()` para não criar falso vermelho em runs superseded.
8. **Contagem exata de cinco blobs:** é forte contra shard ausente, mas acopla workflow ao plano atual de exatamente cinco grupos. Alterar o plano exige mudança coordenada nesta linha e no contrato.
9. **Node 22 só cobre Jest:** outros gates usam Node 20. Compatibilidade de Playwright/validators com Node 22 não é provada por este workflow.
10. **Comentários históricos do leak:** as linhas 392–395 citam evidência de run anterior. Elas podem ficar stale se a causa/limiar mudar; o comportamento executável é somente `MT_BACKGROUND_LEAK_WORKERS: "3"`.

## 9. Casos-limite

- PR recebe commits em sequência: run anterior pode ser cancelado; recovery trata cancelamentos ainda relevantes.
- main recebe merges próximos: runs não são cancelados pela política deste workflow.
- Codecov sem token: upload é pulado, coverage local continua bloqueante.
- Codecov com falha externa: step falha internamente, workflow segue e emite warning.
- shard falha antes de gerar blob: upload pode avisar/continuar, mas o agregador falha na exigência de cinco ZIPs.
- job diagnóstico fica `skipped` em PR: CI Gate não o exige porque `FULL_DIAGNOSTICS_REQUIRED=false`.
- fresh flow fica `skipped` fora de `workflow_dispatch`: CI Gate não o exige.
- workflow cancelado: `ci-gate` não deve ressuscitar por causa de `!cancelled()`.
- teste novo sem tag de shard: `verify-e2e-shard-plan.js` deve detectar “Testes sem grupo”.
- teste duplicado em duas tags: o mesmo verificador falha por duplicação na união.
- Jest termina 0 mas emite aviso de worker forçado: `run-jest-ci.js` examina stderr e reprova.
- Windows normaliza paths de forma diferente: job dedicado executa validate e coverage verifier nesse SO.

## 10. Lacunas de teste

1. ⚠️ Falta self-test que muta especificamente `cancel-in-progress` e comprova a mensagem esperada, embora o gate estático exista.
2. ⚠️ Falta self-test para cada item de `needs` do `ci-gate`; hoje o verificador os percorre, mas o self-test cobre outro tipo de job ausente.
3. ⚠️ Não há teste focal de `actions/checkout@v4`, `setup-node@v4` ou versões das actions de artifact.
4. ⚠️ Não há teste/gate de `permissions:` least-privilege porque o arquivo não declara esse bloco.
5. ⚠️ Não há teste/gate de `timeout-minutes`.
6. ⚠️ Não há prova automatizada de que o secret Codecov nunca é ecoado por action externa; apenas o YAML evita imprimi-lo diretamente.
7. ⚠️ A condição `e2e if: always()` não recebe assertion focal própria.
8. ⚠️ A lista exata dos 18 casos de `jest-worker-diagnostic` não é protegida por comparação completa no contrato; ele protege condição/comando, não cada caso.
9. ⚠️ A lista exata dos 10 casos de `focused-project-leak-diagnostic` também não recebe gate de igualdade.
10. ⚠️ Não há teste que simule resultado `skipped/failure/cancelled` de todos os `needs.*.result` e execute o shell final isoladamente.
11. ⚠️ Node 22 não é exercitado nos E2E, coverage, smoke, visual ou validadores.
12. ⚠️ Não há verificação estática de pin imutável por SHA das actions externas.
13. ⚠️ Os comentários históricos de run #1289 não são validados contra evidência persistente.
14. ⚠️ O run de PR observado para o SHA imediatamente anterior desta documentação terminou cancelado por concorrência; isso não prova sucesso end-to-end do workflow corrente.

## 11. Invariantes

1. O nome `MangaTranslator CI` só pode mudar junto com `recover-cancelled-ci.yml`.
2. Push automático deve continuar restrito à `main`; PR e manual devem continuar habilitados.
3. A main não deve ter runs pós-merge cancelados por commits posteriores.
4. Jobs funcionais não podem receber `continue-on-error: true` para mascarar falhas.
5. `e2e-shard` deve permanecer independente de outros gates funcionais e usar cinco grupos explícitos definidos pelo plano.
6. Workers E2E devem vir do `e2e-shard-plan.json`, não de hardcode no workflow.
7. O agregador E2E deve verificar o plano e exigir todos os cinco blob reports antes do merge.
8. Coverage local (`test:coverage` + verifier) é bloqueante; Codecov externo não substitui esse gate.
9. Diagnósticos de worker/leak devem ser bloqueantes quando obrigatórios e artifacts devem continuar publicáveis em falha.
10. Windows deve continuar executando validação e suites canônicas da raiz.
11. O fluxo manual deve simular instalação limpa e os entry points oficiais.
12. `ci-gate` precisa depender de todos os jobs relevantes, usar `always() && !cancelled()` e aceitar apenas `success` para gates aplicáveis.
13. Jobs deliberadamente skipped em PR só podem ser ignorados pelo gate quando a política do evento disser que são opcionais.
14. Nenhuma mudança pode reintroduzir caminhos legados de workspace `tests/` que os validadores proíbem.
15. Alterações no número/nome dos shards exigem atualização coordenada do plano, workflow e verificadores.
16. Secrets nunca devem ser hardcodedados nem impressos em logs.

## 12. Fonte integral auditada

```yaml
name: MangaTranslator CI

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  # PRs/branches podem cancelar runs substituídos; a main nunca cancela uma
  # verificação pós-merge, garantindo uma execução completa por commit integrado.
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

on:
  push:
    branches:
      - main
  pull_request:
  workflow_dispatch:

jobs:
  version-integrity:
    name: Version Integrity
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
      - name: Verificar fonte única de versão
        run: npm run version:check
      - name: Validar metadados derivados da release
        run: node scripts/release/sync-version.js --print-env

  syntax-check:
    name: JS Syntax Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
      - name: Verificar sintaxe JavaScript
        run: npm run lint

  manifest-validation:
    name: Manifest Validation
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
      - name: Validar manifest.json
        run: npm run validate:manifest

  ci-contract:
    name: CI Contract
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
      - name: Validar estrutura canônica do repositório
        run: node scripts/validation/verify-repository-structure.js
      - name: Validar contrato da própria CI
        run: node scripts/validation/verify-ci-contract.js
      - name: Validar política anti-skip/escape-hatch
        run: npm run validate:test-policy
      - name: Provar que a política anti-skip rejeita violações
        run: npm run test:test-policy:infra
      - name: Validar contrato de publicação
        run: npm run validate:publish
      - name: Provar que o contrato da CI rejeita enfraquecimento
        run: npm run test:ci-contract:infra
      - name: Testar verificador de coverage
        run: node scripts/validation/verify-coverage-selftest.js
      - name: Testar gate E2E contra retries/flaky
        run: node scripts/validation/playwright-gate-reporter-selftest.js
      - name: Testar detecção de worker Jest forçado
        run: node scripts/validation/verify-jest-worker-warning-selftest.js

  smoke:
    name: Smoke Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Rodar testes de fumaça
        run: npm run test:smoke

  visual:
    name: Visual Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Rodar testes visuais perceptuais
        run: npm run test:visual

  unit-and-integration:
    name: Unit + Integration (${{ matrix.node-version }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [20.x, 22.x]
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Rodar Jest com verificação de inventário
        run: npm run test:ci

  coverage:
    name: Code Coverage
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Gerar coverage com Jest/V8
        run: npm run test:coverage
      - name: Verificar integridade e thresholds do coverage
        run: npm run test:coverage:verify
      - name: Detectar configuração do Codecov
        id: codecov
        shell: bash
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
        run: |
          if [ -n "$CODECOV_TOKEN" ]; then
            echo "enabled=true" >> "$GITHUB_OUTPUT"
            echo "Codecov upload: ENABLED"
          else
            echo "enabled=false" >> "$GITHUB_OUTPUT"
            echo "::notice::Codecov upload: SKIPPED — CODECOV_TOKEN not configured"
          fi
      - name: Upload cobertura para Codecov
        id: codecov-upload
        if: steps.codecov.outputs.enabled == 'true'
        uses: codecov/codecov-action@v4
        continue-on-error: true
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          flags: unittests
          name: manga-translator-coverage
          fail_ci_if_error: true
      - name: Reportar falha externa do Codecov
        if: steps.codecov.outputs.enabled == 'true' && steps.codecov-upload.outcome == 'failure'
        run: echo "::warning::Codecov upload FAILED — o gate local de coverage já passou, mas o dashboard externo não foi atualizado."
      - name: Salvar relatório HTML de cobertura
        uses: actions/upload-artifact@v4
        if: always()
        continue-on-error: true
        with:
          name: coverage-report-${{ github.sha }}
          path: coverage/
          retention-days: 30

  e2e-shard:
    name: E2E Shard (${{ matrix.group }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        group: [fifo, attachment, medium-a, medium-b, fast]
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Instalar Chromium sem headless shell redundante
        run: npx playwright install chromium --with-deps --no-shell
      - name: Rodar grupo E2E ${{ matrix.group }}
        run: xvfb-run --auto-servernum -- npm run test:e2e:group -- "${{ matrix.group }}"
        env:
          CI: true
          MANGA_E2E_BROWSER_MODE: stealth
          MANGA_E2E_SHARD: '1'
      - name: Upload blob report do shard
        uses: actions/upload-artifact@v4
        if: ${{ always() && !cancelled() }}
        with:
          name: blob-report-${{ matrix.group }}-${{ github.sha }}
          path: blob-report/
          retention-days: 1
          if-no-files-found: warn
      - name: Upload artefatos de falha do shard
        uses: actions/upload-artifact@v4
        if: failure()
        continue-on-error: true
        with:
          name: playwright-failure-shard-${{ matrix.group }}-${{ github.sha }}
          path: test-results/
          retention-days: 7
          if-no-files-found: ignore


  e2e:
    name: E2E Tests (Playwright)
    if: ${{ always() }}
    needs:
      - e2e-shard
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências para merge dos relatórios
        run: npm ci
      - name: Verificar cobertura exata do plano de 5 shards
        run: npm run test:e2e:plan
      - name: Baixar blob reports dos shards
        uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-report-*-${{ github.sha }}
          merge-multiple: true
      - name: Conferir inventário de blobs
        run: |
          echo "Blob reports recebidos:"
          find all-blob-reports -maxdepth 1 -type f -name '*.zip' -print
          test "$(find all-blob-reports -maxdepth 1 -type f -name '*.zip' | wc -l)" -eq 5
      - name: Mesclar shards e aplicar gate global E2E
        run: npx playwright merge-reports --config=scripts/ci/playwright-merge.config.js ./all-blob-reports
        env:
          CI: true

  jest-worker-diagnostic:
    name: Jest Worker Diagnostic (${{ matrix.case }})
    if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      max-parallel: 4
      matrix:
        case:
          - full-default
          - full-w1
          - full-w2
          - full-w3
          - full-w4
          - project-background
          - project-gtc
          - project-content-scripts
          - project-popup
          - project-reader
          - project-manifest
          - project-shared-ui
          - project-integration
          - combo-content-integration
          - combo-jsdom-projects
          - combo-background-content
          - combo-background-integration
          - combo-background-jsdom
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Executar diagnóstico ${{ matrix.case }}
        run: npm run test:diagnose-workers -- --case=${{ matrix.case }}
      - name: Publicar diagnóstico ${{ matrix.case }}
        if: always()
        uses: actions/upload-artifact@v4
        continue-on-error: true
        with:
          name: jest-worker-diagnostic-${{ matrix.case }}-${{ github.sha }}
          path: |
            .ci-results/jest-worker-diagnostic-${{ matrix.case }}.json
            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.json
            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.log
          retention-days: 7


  focused-project-leak-diagnostic:
    name: Focused Project Leak (${{ matrix.case }})
    if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      max-parallel: 4
      matrix:
        case:
          - project-background
          - project-content-scripts
          - project-shared-ui
          - project-integration
          - project-manifest
          - combo-content-integration
          - combo-jsdom-projects
          - combo-background-content
          - combo-background-integration
          - combo-background-jsdom
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Executar ${{ matrix.case }}
        run: npm run test:diagnose-workers -- --case=${{ matrix.case }}
      - name: Publicar diagnóstico ${{ matrix.case }}
        if: always()
        uses: actions/upload-artifact@v4
        continue-on-error: true
        with:
          name: focused-project-leak-${{ matrix.case }}-${{ github.sha }}
          path: |
            .ci-results/jest-worker-diagnostic-${{ matrix.case }}.json
            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.json
            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.log
          retention-days: 7


  background-leak-bisection:
    name: Background Leak Bisection
    if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Reduzir conjunto de testes de background que mantém worker vivo
        run: npm run test:diagnose-background-leak
        env:
          # Evidência do run #1289: w2 limpo; w3 reproduz worker forçado.
          MT_BACKGROUND_LEAK_WORKERS: "3"
          # O primeiro cluster de 11 arquivos já ficou limpo; reabra o universo
          # completo para localizar qualquer segundo leak de background.
      - name: Publicar bisection do leak de background
        if: always()
        uses: actions/upload-artifact@v4
        continue-on-error: true
        with:
          name: background-leak-bisection-${{ github.sha }}
          path: |
            .ci-results/background-leak-diagnostic.json
            .ci-results/background-leak-diagnostic/
          retention-days: 7


  windows-portability:
    name: Windows Portability
    runs-on: windows-latest
    steps:
      - name: Checkout código
        uses: actions/checkout@v4
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências
        run: npm ci
      - name: Validar contratos e paths
        run: npm run validate
      - name: Jest completo
        run: npm run test:ci
      - name: Smoke
        run: npm run test:smoke
      - name: Visual
        run: npm run test:visual
      - name: Coverage
        run: npm run test:coverage
      - name: Verificar coverage e normalização de paths
        run: npm run test:coverage:verify


  fresh-developer-flow:
    name: Fresh Developer Flow
    if: ${{ github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout limpo
        uses: actions/checkout@v4
        with:
          clean: true
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependências a partir da raiz
        run: npm ci
      - name: Instalar Chromium para o fluxo E2E
        run: npx playwright install chromium --with-deps --no-shell
      - name: Testes unitários
        run: npm run test:unit
      - name: Testes de integração
        run: npm run test:integration
      - name: Smoke
        run: npm run test:smoke
      - name: Visual
        run: npm run test:visual
      - name: E2E completo
        run: xvfb-run --auto-servernum -- npm run test:e2e
        env:
          CI: true
      - name: Coverage
        run: npm run test:coverage
      - name: Verificar integridade do coverage
        run: npm run test:coverage:verify
      - name: Entry point oficial npm test
        run: npm test


  ci-gate:
    name: CI Gate
    # Avalia falhas reais e jobs skipped, mas não ressuscita o gate quando o
    # workflow inteiro foi cancelado por um push mais novo na mesma branch.
    # Isso evita gravar um falso CI Gate vermelho no mesmo SHA compartilhado
    # com a main, sem enfraquecer nenhuma falha real nem o pós-merge da main.
    if: ${{ always() && !cancelled() }}
    runs-on: ubuntu-latest
    needs:
      - version-integrity
      - syntax-check
      - manifest-validation
      - ci-contract
      - smoke
      - visual
      - unit-and-integration
      - coverage
      - e2e-shard
      - e2e
      - jest-worker-diagnostic
      - focused-project-leak-diagnostic
      - background-leak-bisection
      - windows-portability
      - fresh-developer-flow
    steps:
      - name: Exigir execução e sucesso de todos os gates
        env:
          VERSION_INTEGRITY: ${{ needs.version-integrity.result }}
          SYNTAX_CHECK: ${{ needs.syntax-check.result }}
          MANIFEST_VALIDATION: ${{ needs.manifest-validation.result }}
          CI_CONTRACT: ${{ needs.ci-contract.result }}
          SMOKE: ${{ needs.smoke.result }}
          VISUAL: ${{ needs.visual.result }}
          UNIT_INTEGRATION: ${{ needs.unit-and-integration.result }}
          COVERAGE: ${{ needs.coverage.result }}
          E2E_SHARDS: ${{ needs.e2e-shard.result }}
          E2E: ${{ needs.e2e.result }}
          FULL_DIAGNOSTICS_REQUIRED: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}
          JEST_WORKER_DIAGNOSTIC: ${{ needs.jest-worker-diagnostic.result }}
          FOCUSED_PROJECT_LEAK: ${{ needs.focused-project-leak-diagnostic.result }}
          BACKGROUND_LEAK_BISECTION: ${{ needs.background-leak-bisection.result }}
          WINDOWS_PORTABILITY: ${{ needs.windows-portability.result }}
          FRESH_DEVELOPER_FLOW: ${{ needs.fresh-developer-flow.result }}
        run: |
          failed=0
          check() {
            name="$1"
            result="$2"
            if [ "$result" != "success" ]; then
              echo "::error::$name terminou como '$result'; CI Gate exige 'success'."
              failed=1
            else
              echo "✅ $name = success"
            fi
          }
          check "Version Integrity" "$VERSION_INTEGRITY"
          check "JS Syntax Check" "$SYNTAX_CHECK"
          check "Manifest Validation" "$MANIFEST_VALIDATION"
          check "CI Contract" "$CI_CONTRACT"
          check "Smoke Tests" "$SMOKE"
          check "Visual Tests" "$VISUAL"
          check "Unit + Integration" "$UNIT_INTEGRATION"
          check "Code Coverage" "$COVERAGE"
          check "E2E Shards" "$E2E_SHARDS"
          check "E2E Tests" "$E2E"
          check "Windows Portability" "$WINDOWS_PORTABILITY"

          if [ "$FULL_DIAGNOSTICS_REQUIRED" = "true" ]; then
            echo "🔒 Verificação completa pós-merge/manual: diagnósticos pesados são obrigatórios."
            check "Jest Worker Diagnostic" "$JEST_WORKER_DIAGNOSTIC"
            check "Focused Project Leak" "$FOCUSED_PROJECT_LEAK"
            check "Background Leak Bisection" "$BACKGROUND_LEAK_BISECTION"
          else
            echo "ℹ️ Diagnósticos pesados não são obrigatórios neste evento; serão obrigatórios em push para main."
          fi

          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "🔒 workflow_dispatch: fluxo completo de desenvolvedor novo é obrigatório."
            check "Fresh Developer Flow" "$FRESH_DEVELOPER_FLOW"
          else
            echo "ℹ️ Fresh Developer Flow é exercitado no workflow_dispatch pré-revisão."
          fi

          exit "$failed"
```

## 13. Cobertura linha a linha

A seguir, cada uma das 558 posições do arquivo recebe heading próprio e explicação rastreável. As classificações de evidência são conservadoras: presença estática não é promovida a prova de execução runtime.

### Linha 1

**Fonte:** `name: MangaTranslator CI`

**O que faz:** Define o nome público do workflow como `MangaTranslator CI`.

**Como faz:** GitHub Actions usa `name` na UI e em eventos `workflow_run`; `recover-cancelled-ci.yml` referencia exatamente esse nome.

**Por que foi implementado dessa forma:** Mantém uma identidade estável para checks e para o workflow privilegiado de recuperação de execuções canceladas.

**Por que uma implementação ingênua seria pior:** Renomear sem atualizar o recovery rompe silenciosamente o gatilho `workflows: ["MangaTranslator CI"]` e deixa CIs canceladas sem reconciliação automática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 2

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de controle de concorrência do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 3

**Fonte:** `concurrency:`

**O que faz:** Abre a política de concorrência do workflow.

**Como faz:** Agrupa execuções por workflow/ref e define abaixo quando uma execução anterior pode ser cancelada.

**Por que foi implementado dessa forma:** Evita gastar runners em commits superseded de uma mesma branch sem sacrificar verificação pós-merge da main.

**Por que uma implementação ingênua seria pior:** Sem concorrência, cada push rápido mantém runs obsoletos consumindo tempo e podendo confundir o estado do PR.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 4

**Fonte:** `  group: ci-${{ github.workflow }}-${{ github.ref }}`

**O que faz:** Cria uma chave de concorrência por nome do workflow e ref Git.

**Como faz:** Interpola `github.workflow` e `github.ref`, isolando filas de branches/PRs diferentes.

**Por que foi implementado dessa forma:** Permite cancelar apenas runs concorrentes da mesma ref, sem uma fila global que bloquearia branches independentes.

**Por que uma implementação ingênua seria pior:** Uma chave global serializaria todo o repositório; uma chave só por workflow poderia cancelar CI de outro PR.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 5

**Fonte:** `  # PRs/branches podem cancelar runs substituídos; a main nunca cancela uma`

**O que faz:** Comentário que registra a intenção operacional do bloco controle de concorrência: PRs/branches podem cancelar runs substituídos; a main nunca cancela uma

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: comentário editorial; sua intenção foi cruzada com o comportamento vizinho, mas comentários não são executáveis.

### Linha 6

**Fonte:** `  # verificação pós-merge, garantindo uma execução completa por commit integrado.`

**O que faz:** Comentário que registra a intenção operacional do bloco controle de concorrência: verificação pós-merge, garantindo uma execução completa por commit integrado.

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: comentário editorial; sua intenção foi cruzada com o comportamento vizinho, mas comentários não são executáveis.

### Linha 7

**Fonte:** `  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`

**O que faz:** Cancela run anterior apenas quando a ref não é `refs/heads/main`.

**Como faz:** A expressão booleana é falsa na main e verdadeira em refs de PR/branches, preservando toda verificação pós-merge.

**Por que foi implementado dessa forma:** PRs aceitam supersession por commit novo; main precisa de evidência completa por commit integrado.

**Por que uma implementação ingênua seria pior:** `true` incondicional pode cancelar o único pós-merge de um commit; `false` incondicional desperdiça runners em commits obsoletos de PR.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 8

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de gatilhos do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 9

**Fonte:** `on:`

**O que faz:** Abre a declaração de eventos que disparam a CI.

**Como faz:** As chaves filhas definem push da main, pull requests e disparo manual.

**Por que foi implementado dessa forma:** Combina feedback pré-merge, verificação pós-merge e execução manual completa.

**Por que uma implementação ingênua seria pior:** Depender de um único gatilho deixaria lacunas: PR sem validação, main sem pós-merge ou ausência de fluxo manual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 10

**Fonte:** `  push:`

**O que faz:** Habilita evento `push` com filtro definido nas linhas seguintes.

**Como faz:** GitHub cria run quando ocorre push que satisfaz `branches`.

**Por que foi implementado dessa forma:** O projeto quer verificação automática pós-merge da branch principal.

**Por que uma implementação ingênua seria pior:** Push para todas as branches duplicaria o mesmo commit já testado via `pull_request`.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 11

**Fonte:** `    branches:`

**O que faz:** Abre a lista de branches aceitas pelo gatilho `push`.

**Como faz:** A entrada filha limita o evento.

**Por que foi implementado dessa forma:** Centraliza pós-merge automático somente na branch canônica.

**Por que uma implementação ingênua seria pior:** Sem filtro, branches de trabalho gerariam duas classes de CI simultâneas.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 12

**Fonte:** `      - main`

**O que faz:** Restringe `push` à branch `main`.

**Como faz:** Só refs de push com nome `main` satisfazem o filtro.

**Por que foi implementado dessa forma:** Evita duplicação com PR e garante pós-merge do estado integrado.

**Por que uma implementação ingênua seria pior:** Adicionar branches aqui sem necessidade aumenta consumo e pode interagir com diagnósticos pesados condicionados a push.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 13

**Fonte:** `  pull_request:`

**O que faz:** Habilita CI para eventos `pull_request`.

**Como faz:** A chave vazia usa a configuração padrão do evento para atividades suportadas.

**Por que foi implementado dessa forma:** Fornece feedback antes do merge e é o caminho normal dos agentes/PR #66.

**Por que uma implementação ingênua seria pior:** Sem esse evento, regressões só apareceriam depois da integração.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 14

**Fonte:** `  workflow_dispatch:`

**O que faz:** Habilita disparo manual via `workflow_dispatch`.

**Como faz:** GitHub expõe o botão/API de execução manual sem inputs adicionais.

**Por que foi implementado dessa forma:** O fluxo manual é usado para exigir diagnósticos pesados e `fresh-developer-flow` antes de revisão quando desejado.

**Por que uma implementação ingênua seria pior:** Sem ele não haveria modo reprodutível de acionar a verificação completa sob demanda.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 15

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de raiz dos jobs do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 16

**Fonte:** `jobs:`

**O que faz:** Abre o mapa de jobs do workflow.

**Como faz:** Cada chave de dois espaços subsequente define um job independente ou dependente via `needs`.

**Por que foi implementado dessa forma:** Separa responsabilidades e permite paralelismo entre gates independentes.

**Por que uma implementação ingênua seria pior:** Um único job monolítico perde paralelismo, dificulta localizar falhas e força reinstalação/execução sequencial de tudo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 17

**Fonte:** `  version-integrity:`

**O que faz:** Declara o job `version-integrity`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `version-integrity`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade version-integrity de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 18

**Fonte:** `    name: Version Integrity`

**O que faz:** Define o rótulo humano `Version Integrity` dentro de version-integrity.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 19

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa version-integrity em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 20

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de version-integrity.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 21

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de version-integrity.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 22

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 23

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de version-integrity.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 24

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 25

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de version-integrity.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 26

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 27

**Fonte:** `      - name: Verificar fonte única de versão`

**O que faz:** Define o rótulo humano `Verificar fonte única de versão` dentro de version-integrity.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 28

**Fonte:** `        run: npm run version:check`

**O que faz:** Invoca o entry point canônico `npm run version:check`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco version-integrity delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 29

**Fonte:** `      - name: Validar metadados derivados da release`

**O que faz:** Define o rótulo humano `Validar metadados derivados da release` dentro de version-integrity.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 30

**Fonte:** `        run: node scripts/release/sync-version.js --print-env`

**O que faz:** Executa diretamente `node scripts/release/sync-version.js --print-env`.

**Como faz:** Node carrega o script versionado do repositório no workspace corrente.

**Por que foi implementado dessa forma:** Este gate de version-integrity é infraestrutura Node sem necessidade de wrapper npm adicional.

**Por que uma implementação ingênua seria pior:** Inlinear a lógica no YAML dificultaria testes próprios, reutilização local e mensagens de erro estruturadas.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 31

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de syntax-check do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 32

**Fonte:** `  syntax-check:`

**O que faz:** Declara o job `syntax-check`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `syntax-check`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade syntax-check de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 33

**Fonte:** `    name: JS Syntax Check`

**O que faz:** Define o rótulo humano `JS Syntax Check` dentro de syntax-check.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 34

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa syntax-check em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 35

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de syntax-check.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 36

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de syntax-check.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 37

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 38

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de syntax-check.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 39

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 40

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de syntax-check.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 41

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 42

**Fonte:** `      - name: Verificar sintaxe JavaScript`

**O que faz:** Define o rótulo humano `Verificar sintaxe JavaScript` dentro de syntax-check.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 43

**Fonte:** `        run: npm run lint`

**O que faz:** Invoca o entry point canônico `npm run lint`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco syntax-check delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 44

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de manifest-validation do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 45

**Fonte:** `  manifest-validation:`

**O que faz:** Declara o job `manifest-validation`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `manifest-validation`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade manifest-validation de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 46

**Fonte:** `    name: Manifest Validation`

**O que faz:** Define o rótulo humano `Manifest Validation` dentro de manifest-validation.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 47

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa manifest-validation em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 48

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de manifest-validation.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 49

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de manifest-validation.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 50

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 51

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de manifest-validation.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 52

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 53

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de manifest-validation.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 54

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 55

**Fonte:** `      - name: Validar manifest.json`

**O que faz:** Define o rótulo humano `Validar manifest.json` dentro de manifest-validation.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 56

**Fonte:** `        run: npm run validate:manifest`

**O que faz:** Invoca o entry point canônico `npm run validate:manifest`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco manifest-validation delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 57

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de ci-contract do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 58

**Fonte:** `  ci-contract:`

**O que faz:** Declara o job `ci-contract`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `ci-contract`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade ci-contract de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 59

**Fonte:** `    name: CI Contract`

**O que faz:** Define o rótulo humano `CI Contract` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 60

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa ci-contract em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 61

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de ci-contract.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 62

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 63

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 64

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 65

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 66

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de ci-contract.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 67

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 68

**Fonte:** `      - name: Validar estrutura canônica do repositório`

**O que faz:** Define o rótulo humano `Validar estrutura canônica do repositório` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 69

**Fonte:** `        run: node scripts/validation/verify-repository-structure.js`

**O que faz:** Executa diretamente `node scripts/validation/verify-repository-structure.js`.

**Como faz:** Node carrega o script versionado do repositório no workspace corrente.

**Por que foi implementado dessa forma:** Este gate de ci-contract é infraestrutura Node sem necessidade de wrapper npm adicional.

**Por que uma implementação ingênua seria pior:** Inlinear a lógica no YAML dificultaria testes próprios, reutilização local e mensagens de erro estruturadas.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 70

**Fonte:** `      - name: Validar contrato da própria CI`

**O que faz:** Define o rótulo humano `Validar contrato da própria CI` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 71

**Fonte:** `        run: node scripts/validation/verify-ci-contract.js`

**O que faz:** Executa diretamente `node scripts/validation/verify-ci-contract.js`.

**Como faz:** Node carrega o script versionado do repositório no workspace corrente.

**Por que foi implementado dessa forma:** Este gate de ci-contract é infraestrutura Node sem necessidade de wrapper npm adicional.

**Por que uma implementação ingênua seria pior:** Inlinear a lógica no YAML dificultaria testes próprios, reutilização local e mensagens de erro estruturadas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 72

**Fonte:** `      - name: Validar política anti-skip/escape-hatch`

**O que faz:** Define o rótulo humano `Validar política anti-skip/escape-hatch` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 73

**Fonte:** `        run: npm run validate:test-policy`

**O que faz:** Invoca o entry point canônico `npm run validate:test-policy`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco ci-contract delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 74

**Fonte:** `      - name: Provar que a política anti-skip rejeita violações`

**O que faz:** Define o rótulo humano `Provar que a política anti-skip rejeita violações` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 75

**Fonte:** `        run: npm run test:test-policy:infra`

**O que faz:** Invoca o entry point canônico `npm run test:test-policy:infra`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco ci-contract delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 76

**Fonte:** `      - name: Validar contrato de publicação`

**O que faz:** Define o rótulo humano `Validar contrato de publicação` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 77

**Fonte:** `        run: npm run validate:publish`

**O que faz:** Invoca o entry point canônico `npm run validate:publish`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco ci-contract delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 78

**Fonte:** `      - name: Provar que o contrato da CI rejeita enfraquecimento`

**O que faz:** Define o rótulo humano `Provar que o contrato da CI rejeita enfraquecimento` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 79

**Fonte:** `        run: npm run test:ci-contract:infra`

**O que faz:** Invoca o entry point canônico `npm run test:ci-contract:infra`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco ci-contract delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO + ✅ SELF-TEST NEGATIVO: `verify-ci-contract.js` exige o self-test e `verify-ci-contract-selftest.js` muta o workflow para provar que um job obrigatório removido é rejeitado.

### Linha 80

**Fonte:** `      - name: Testar verificador de coverage`

**O que faz:** Define o rótulo humano `Testar verificador de coverage` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 81

**Fonte:** `        run: node scripts/validation/verify-coverage-selftest.js`

**O que faz:** Executa diretamente `node scripts/validation/verify-coverage-selftest.js`.

**Como faz:** Node carrega o script versionado do repositório no workspace corrente.

**Por que foi implementado dessa forma:** Este gate de ci-contract é infraestrutura Node sem necessidade de wrapper npm adicional.

**Por que uma implementação ingênua seria pior:** Inlinear a lógica no YAML dificultaria testes próprios, reutilização local e mensagens de erro estruturadas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 82

**Fonte:** `      - name: Testar gate E2E contra retries/flaky`

**O que faz:** Define o rótulo humano `Testar gate E2E contra retries/flaky` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 83

**Fonte:** `        run: node scripts/validation/playwright-gate-reporter-selftest.js`

**O que faz:** Executa diretamente `node scripts/validation/playwright-gate-reporter-selftest.js`.

**Como faz:** Node carrega o script versionado do repositório no workspace corrente.

**Por que foi implementado dessa forma:** Este gate de ci-contract é infraestrutura Node sem necessidade de wrapper npm adicional.

**Por que uma implementação ingênua seria pior:** Inlinear a lógica no YAML dificultaria testes próprios, reutilização local e mensagens de erro estruturadas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 84

**Fonte:** `      - name: Testar detecção de worker Jest forçado`

**O que faz:** Define o rótulo humano `Testar detecção de worker Jest forçado` dentro de ci-contract.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 85

**Fonte:** `        run: node scripts/validation/verify-jest-worker-warning-selftest.js`

**O que faz:** Executa diretamente `node scripts/validation/verify-jest-worker-warning-selftest.js`.

**Como faz:** Node carrega o script versionado do repositório no workspace corrente.

**Por que foi implementado dessa forma:** Este gate de ci-contract é infraestrutura Node sem necessidade de wrapper npm adicional.

**Por que uma implementação ingênua seria pior:** Inlinear a lógica no YAML dificultaria testes próprios, reutilização local e mensagens de erro estruturadas.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 86

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de smoke do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 87

**Fonte:** `  smoke:`

**O que faz:** Declara o job `smoke`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `smoke`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade smoke de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 88

**Fonte:** `    name: Smoke Tests`

**O que faz:** Define o rótulo humano `Smoke Tests` dentro de smoke.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 89

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa smoke em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 90

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de smoke.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 91

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de smoke.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 92

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 93

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de smoke.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 94

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 95

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de smoke.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 96

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 97

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 98

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 99

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de smoke.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 100

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para smoke.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 101

**Fonte:** `      - name: Rodar testes de fumaça`

**O que faz:** Define o rótulo humano `Rodar testes de fumaça` dentro de smoke.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 102

**Fonte:** `        run: npm run test:smoke`

**O que faz:** Invoca o entry point canônico `npm run test:smoke`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco smoke delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 103

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de visual do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 104

**Fonte:** `  visual:`

**O que faz:** Declara o job `visual`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `visual`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade visual de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 105

**Fonte:** `    name: Visual Tests`

**O que faz:** Define o rótulo humano `Visual Tests` dentro de visual.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 106

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa visual em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 107

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de visual.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 108

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de visual.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 109

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 110

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de visual.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 111

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 112

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de visual.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 113

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 114

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 115

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 116

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de visual.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 117

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para visual.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 118

**Fonte:** `      - name: Rodar testes visuais perceptuais`

**O que faz:** Define o rótulo humano `Rodar testes visuais perceptuais` dentro de visual.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 119

**Fonte:** `        run: npm run test:visual`

**O que faz:** Invoca o entry point canônico `npm run test:visual`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco visual delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 120

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de unit-and-integration do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 121

**Fonte:** `  unit-and-integration:`

**O que faz:** Declara o job `unit-and-integration`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `unit-and-integration`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade unit-and-integration de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 122

**Fonte:** `    name: Unit + Integration (${{ matrix.node-version }})`

**O que faz:** Define o rótulo humano `Unit + Integration (${{ matrix.node-version }})` dentro de unit-and-integration.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 123

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa unit-and-integration em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 124

**Fonte:** `    strategy:`

**O que faz:** Abre a estratégia de matriz/paralelismo de unit-and-integration.

**Como faz:** As propriedades filhas controlam expansão de jobs e comportamento de falha.

**Por que foi implementado dessa forma:** Permite múltiplos casos/versões em jobs separados e observáveis.

**Por que uma implementação ingênua seria pior:** Loopar todos os casos dentro de um único processo reduz paralelismo e isola pior as falhas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 125

**Fonte:** `      fail-fast: false`

**O que faz:** Desabilita cancelamento automático dos irmãos de matriz quando um caso falha.

**Como faz:** GitHub continua lançando/executando as demais combinações.

**Por que foi implementado dessa forma:** Preserva evidência completa de versões, shards ou diagnósticos mesmo quando um elemento falha.

**Por que uma implementação ingênua seria pior:** `fail-fast: true` pode ocultar quais outros shards/casos também estão quebrados e reduzir material de diagnóstico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 126

**Fonte:** `      matrix:`

**O que faz:** Abre a matriz usada por unit-and-integration.

**Como faz:** Cada valor filho expande uma execução independente com contexto `matrix.*`.

**Por que foi implementado dessa forma:** Distribui carga e deixa cada combinação identificável.

**Por que uma implementação ingênua seria pior:** Uma lista serial dentro do step perde isolamento e aumenta tempo de parede.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 127

**Fonte:** `        node-version: [20.x, 22.x]`

**O que faz:** Seleciona Node.js [20.x, 22.x] para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 128

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de unit-and-integration.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 129

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de unit-and-integration.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 130

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 131

**Fonte:** `      - name: Configurar Node.js ${{ matrix.node-version }}`

**O que faz:** Define o rótulo humano `Configurar Node.js ${{ matrix.node-version }}` dentro de unit-and-integration.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 132

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 133

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de unit-and-integration.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 134

**Fonte:** `          node-version: ${{ matrix.node-version }}`

**O que faz:** Seleciona Node.js ${{ matrix.node-version }} para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 135

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 136

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 137

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de unit-and-integration.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 138

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para unit-and-integration.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 139

**Fonte:** `      - name: Rodar Jest com verificação de inventário`

**O que faz:** Define o rótulo humano `Rodar Jest com verificação de inventário` dentro de unit-and-integration.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 140

**Fonte:** `        run: npm run test:ci`

**O que faz:** Invoca o entry point canônico `npm run test:ci`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco unit-and-integration delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 141

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de coverage do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 142

**Fonte:** `  coverage:`

**O que faz:** Declara o job `coverage`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `coverage`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade coverage de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 143

**Fonte:** `    name: Code Coverage`

**O que faz:** Define o rótulo humano `Code Coverage` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 144

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa coverage em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 145

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de coverage.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 146

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 147

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 148

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 149

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 150

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de coverage.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 151

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 152

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 153

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 154

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 155

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para coverage.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 156

**Fonte:** `      - name: Gerar coverage com Jest/V8`

**O que faz:** Define o rótulo humano `Gerar coverage com Jest/V8` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 157

**Fonte:** `        run: npm run test:coverage`

**O que faz:** Invoca o entry point canônico `npm run test:coverage`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco coverage delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; o pipeline também executa o runner/verificador real de coverage, mas a propriedade desta linha é protegida principalmente pelo contrato estático.

### Linha 158

**Fonte:** `      - name: Verificar integridade e thresholds do coverage`

**O que faz:** Define o rótulo humano `Verificar integridade e thresholds do coverage` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 159

**Fonte:** `        run: npm run test:coverage:verify`

**O que faz:** Invoca o entry point canônico `npm run test:coverage:verify`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco coverage delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; o pipeline também executa o runner/verificador real de coverage, mas a propriedade desta linha é protegida principalmente pelo contrato estático.

### Linha 160

**Fonte:** `      - name: Detectar configuração do Codecov`

**O que faz:** Define o rótulo humano `Detectar configuração do Codecov` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 161

**Fonte:** `        id: codecov`

**O que faz:** Atribui id `codecov` ao step para expor seus outputs a steps seguintes.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 162

**Fonte:** `        shell: bash`

**O que faz:** Força Bash para o step.

**Como faz:** GitHub executa o bloco `run` com Bash em vez de depender de inferência.

**Por que foi implementado dessa forma:** O script usa sintaxe POSIX/Bash como `if [ ... ]`, redirecionamento e variáveis.

**Por que uma implementação ingênua seria pior:** Shell diferente pode interpretar quoting/condicionais de forma incompatível.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 163

**Fonte:** `        env:`

**O que faz:** Abre variáveis de ambiente do step em coverage.

**Como faz:** GitHub injeta os pares filhos apenas no processo daquele step.

**Por que foi implementado dessa forma:** Escopa flags, resultados de jobs e segredos ao menor trecho necessário.

**Por que uma implementação ingênua seria pior:** Variáveis globais ampliariam superfície de exposição e poderiam alterar jobs não relacionados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 164

**Fonte:** `          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}`

**O que faz:** Injeta o secret Codecov apenas no step que detecta se upload externo está configurado.

**Como faz:** GitHub resolve `${{ secrets.CODECOV_TOKEN }}`; em PRs sem segredo o valor fica vazio e o script marca upload como desabilitado.

**Por que foi implementado dessa forma:** Permite que a CI funcione sem depender da presença do segredo e evita hardcode de credencial.

**Por que uma implementação ingênua seria pior:** Hardcodar token vazaria segredo; exigir token para todo PR quebraria forks/ambientes sem configuração.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 165

**Fonte:** `        run: |`

**O que faz:** Abre um script shell multilinha do bloco coverage.

**Como faz:** As linhas indentadas seguintes formam um único comando com estado/variáveis locais compartilhados.

**Por que foi implementado dessa forma:** A lógica precisa de condicionais, contagem ou função auxiliar que ficaria ilegível em uma única linha.

**Por que uma implementação ingênua seria pior:** Fragmentar em steps separados perderia variáveis shell locais ou exigiria outputs artificiais.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 166

**Fonte:** `          if [ -n "$CODECOV_TOKEN" ]; then`

**O que faz:** Testa se o token Codecov está não vazio.

**Como faz:** O script Bash usa o secret apenas para derivar um output booleano consumido pelo `if` do upload.

**Por que foi implementado dessa forma:** Separa ausência legítima de credencial de falha real do gate de coverage.

**Por que uma implementação ingênua seria pior:** Tentar upload cegamente produziria falsos vermelhos/ruído em forks; suprimir o log esconderia por que não houve dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 167

**Fonte:** `            echo "enabled=true" >> "$GITHUB_OUTPUT"`

**O que faz:** Escreve `enabled=true` no arquivo especial de outputs do step.

**Como faz:** O script Bash usa o secret apenas para derivar um output booleano consumido pelo `if` do upload.

**Por que foi implementado dessa forma:** Separa ausência legítima de credencial de falha real do gate de coverage.

**Por que uma implementação ingênua seria pior:** Tentar upload cegamente produziria falsos vermelhos/ruído em forks; suprimir o log esconderia por que não houve dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 168

**Fonte:** `            echo "Codecov upload: ENABLED"`

**O que faz:** Registra no log que upload externo está habilitado.

**Como faz:** O script Bash usa o secret apenas para derivar um output booleano consumido pelo `if` do upload.

**Por que foi implementado dessa forma:** Separa ausência legítima de credencial de falha real do gate de coverage.

**Por que uma implementação ingênua seria pior:** Tentar upload cegamente produziria falsos vermelhos/ruído em forks; suprimir o log esconderia por que não houve dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 169

**Fonte:** `          else`

**O que faz:** Abre o ramo sem token.

**Como faz:** O script Bash usa o secret apenas para derivar um output booleano consumido pelo `if` do upload.

**Por que foi implementado dessa forma:** Separa ausência legítima de credencial de falha real do gate de coverage.

**Por que uma implementação ingênua seria pior:** Tentar upload cegamente produziria falsos vermelhos/ruído em forks; suprimir o log esconderia por que não houve dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 170

**Fonte:** `            echo "enabled=false" >> "$GITHUB_OUTPUT"`

**O que faz:** Escreve `enabled=false` para impedir o step de upload.

**Como faz:** O script Bash usa o secret apenas para derivar um output booleano consumido pelo `if` do upload.

**Por que foi implementado dessa forma:** Separa ausência legítima de credencial de falha real do gate de coverage.

**Por que uma implementação ingênua seria pior:** Tentar upload cegamente produziria falsos vermelhos/ruído em forks; suprimir o log esconderia por que não houve dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 171

**Fonte:** `            echo "::notice::Codecov upload: SKIPPED — CODECOV_TOKEN not configured"`

**O que faz:** Emite notice explícito de que Codecov foi pulado por falta de configuração.

**Como faz:** O script Bash usa o secret apenas para derivar um output booleano consumido pelo `if` do upload.

**Por que foi implementado dessa forma:** Separa ausência legítima de credencial de falha real do gate de coverage.

**Por que uma implementação ingênua seria pior:** Tentar upload cegamente produziria falsos vermelhos/ruído em forks; suprimir o log esconderia por que não houve dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 172

**Fonte:** `          fi`

**O que faz:** Fecha a condicional shell.

**Como faz:** O script Bash usa o secret apenas para derivar um output booleano consumido pelo `if` do upload.

**Por que foi implementado dessa forma:** Separa ausência legítima de credencial de falha real do gate de coverage.

**Por que uma implementação ingênua seria pior:** Tentar upload cegamente produziria falsos vermelhos/ruído em forks; suprimir o log esconderia por que não houve dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 173

**Fonte:** `      - name: Upload cobertura para Codecov`

**O que faz:** Define o rótulo humano `Upload cobertura para Codecov` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 174

**Fonte:** `        id: codecov-upload`

**O que faz:** Atribui id ao upload para consultar `outcome` na etapa de warning.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 175

**Fonte:** `        if: steps.codecov.outputs.enabled == 'true'`

**O que faz:** Configura `if` dentro do bloco coverage com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto coverage; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de coverage e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de coverage de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 176

**Fonte:** `        uses: codecov/codecov-action@v4`

**O que faz:** Invoca a integração externa Codecov para enviar `lcov.info`.

**Como faz:** A action recebe token, arquivo, flags/nome e produz outcome usado no aviso posterior.

**Por que foi implementado dessa forma:** Mantém dashboard externo sem tornar disponibilidade do serviço terceiro o gate local de qualidade.

**Por que uma implementação ingênua seria pior:** Depender apenas do Codecov faria um outage externo bloquear ou, no oposto, substituir a verificação local de thresholds.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 177

**Fonte:** `        continue-on-error: true`

**O que faz:** Torna a falha deste step de suporte não bloqueante em coverage.

**Como faz:** GitHub registra `outcome=failure` mas permite que o job continue; steps funcionais de teste não usam esse escape.

**Por que foi implementado dessa forma:** Uploads/dashboard externos não devem ocultar o resultado dos gates locais já executados.

**Por que uma implementação ingênua seria pior:** Aplicar isso ao comando de teste mascararia regressões; removê-lo de artifacts/Codecov faria infraestrutura auxiliar derrubar a CI.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 178

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de coverage.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 179

**Fonte:** `          token: ${{ secrets.CODECOV_TOKEN }}`

**O que faz:** Passa o secret configurado à action Codecov.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 180

**Fonte:** `          files: ./coverage/lcov.info`

**O que faz:** Seleciona o LCOV gerado localmente como payload do Codecov.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 181

**Fonte:** `          flags: unittests`

**O que faz:** Rotula o upload externo com a flag `unittests`.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 182

**Fonte:** `          name: manga-translator-coverage`

**O que faz:** Define o rótulo humano `manga-translator-coverage` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 183

**Fonte:** `          fail_ci_if_error: true`

**O que faz:** Faz a action sinalizar falha própria; `continue-on-error` mantém essa falha não bloqueante e observável via outcome.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 184

**Fonte:** `      - name: Reportar falha externa do Codecov`

**O que faz:** Define o rótulo humano `Reportar falha externa do Codecov` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 185

**Fonte:** `        if: steps.codecov.outputs.enabled == 'true' && steps.codecov-upload.outcome == 'failure'`

**O que faz:** Configura `if` dentro do bloco coverage com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto coverage; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de coverage e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de coverage de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 186

**Fonte:** `        run: echo "::warning::Codecov upload FAILED — o gate local de coverage já passou, mas o dashboard externo não foi atualizado."`

**O que faz:** Configura `run` dentro do bloco coverage com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto coverage; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de coverage e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de coverage de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 187

**Fonte:** `      - name: Salvar relatório HTML de cobertura`

**O que faz:** Define o rótulo humano `Salvar relatório HTML de cobertura` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 188

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica arquivos diagnósticos/coverage como artifact do run.

**Como faz:** A action lê `with.path` e cria artifact nomeado para inspeção posterior.

**Por que foi implementado dessa forma:** Falhas de testes/leaks precisam evidência persistente mesmo após VM efêmera desaparecer.

**Por que uma implementação ingênua seria pior:** Sem upload, logs/trace/report locais somem ao finalizar runner e a triagem perde dados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 189

**Fonte:** `        if: always()`

**O que faz:** Configura `if` dentro do bloco coverage com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto coverage; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de coverage e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de coverage de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 190

**Fonte:** `        continue-on-error: true`

**O que faz:** Torna a falha deste step de suporte não bloqueante em coverage.

**Como faz:** GitHub registra `outcome=failure` mas permite que o job continue; steps funcionais de teste não usam esse escape.

**Por que foi implementado dessa forma:** Uploads/dashboard externos não devem ocultar o resultado dos gates locais já executados.

**Por que uma implementação ingênua seria pior:** Aplicar isso ao comando de teste mascararia regressões; removê-lo de artifacts/Codecov faria infraestrutura auxiliar derrubar a CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 191

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de coverage.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 192

**Fonte:** `          name: coverage-report-${{ github.sha }}`

**O que faz:** Define o rótulo humano `coverage-report-${{ github.sha }}` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 193

**Fonte:** `          path: coverage/`

**O que faz:** Publica toda a árvore de relatório de coverage.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 194

**Fonte:** `          retention-days: 30`

**O que faz:** Mantém o relatório de coverage por 30 dias.

**Como faz:** É um parâmetro declarativo do bloco coverage, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 195

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de e2e-shard do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 196

**Fonte:** `  e2e-shard:`

**O que faz:** Declara o job `e2e-shard`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `e2e-shard`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade e2e-shard de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 197

**Fonte:** `    name: E2E Shard (${{ matrix.group }})`

**O que faz:** Define o rótulo humano `E2E Shard (${{ matrix.group }})` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 198

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa e2e-shard em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 199

**Fonte:** `    strategy:`

**O que faz:** Abre a estratégia de matriz/paralelismo de e2e-shard.

**Como faz:** As propriedades filhas controlam expansão de jobs e comportamento de falha.

**Por que foi implementado dessa forma:** Permite múltiplos casos/versões em jobs separados e observáveis.

**Por que uma implementação ingênua seria pior:** Loopar todos os casos dentro de um único processo reduz paralelismo e isola pior as falhas.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 200

**Fonte:** `      fail-fast: false`

**O que faz:** Desabilita cancelamento automático dos irmãos de matriz quando um caso falha.

**Como faz:** GitHub continua lançando/executando as demais combinações.

**Por que foi implementado dessa forma:** Preserva evidência completa de versões, shards ou diagnósticos mesmo quando um elemento falha.

**Por que uma implementação ingênua seria pior:** `fail-fast: true` pode ocultar quais outros shards/casos também estão quebrados e reduzir material de diagnóstico.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 201

**Fonte:** `      matrix:`

**O que faz:** Abre a matriz usada por e2e-shard.

**Como faz:** Cada valor filho expande uma execução independente com contexto `matrix.*`.

**Por que foi implementado dessa forma:** Distribui carga e deixa cada combinação identificável.

**Por que uma implementação ingênua seria pior:** Uma lista serial dentro do step perde isolamento e aumenta tempo de parede.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 202

**Fonte:** `        group: [fifo, attachment, medium-a, medium-b, fast]`

**O que faz:** Define os cinco grupos E2E explícitos: fifo, attachment, medium-a, medium-b e fast.

**Como faz:** Cada nome alimenta `matrix.group` e o runner consulta `e2e-shard-plan.json` para tag/workers.

**Por que foi implementado dessa forma:** O projeto balanceia shards por perfil real em vez do sharding automático de contagem.

**Por que uma implementação ingênua seria pior:** Usar `--shard=N/M` ignoraria pesos e poderia juntar testes pesados, aumentando duração e flakiness.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 203

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de e2e-shard.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 204

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 205

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 206

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 207

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 208

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de e2e-shard.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 209

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 210

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 211

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 212

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 213

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para e2e-shard.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 214

**Fonte:** `      - name: Instalar Chromium sem headless shell redundante`

**O que faz:** Define o rótulo humano `Instalar Chromium sem headless shell redundante` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 215

**Fonte:** `        run: npx playwright install chromium --with-deps --no-shell`

**O que faz:** Instala Chromium e dependências nativas necessárias ao Playwright.

**Como faz:** `npx playwright install chromium --with-deps --no-shell` baixa o navegador principal e pacotes do SO, omitindo o headless shell redundante.

**Por que foi implementado dessa forma:** Os E2E carregam uma extensão Chromium real e precisam do browser disponível no runner.

**Por que uma implementação ingênua seria pior:** Omitir `--with-deps` quebra em imagens sem bibliotecas; instalar browsers extras aumenta download e duração sem benefício.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 216

**Fonte:** `      - name: Rodar grupo E2E ${{ matrix.group }}`

**O que faz:** Define o rótulo humano `Rodar grupo E2E ${{ matrix.group }}` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 217

**Fonte:** `        run: xvfb-run --auto-servernum -- npm run test:e2e:group -- "${{ matrix.group }}"`

**O que faz:** Executa o E2E sob display virtual X11.

**Como faz:** `xvfb-run --auto-servernum` cria DISPLAY temporário e chama o script npm com o grupo/fluxo selecionado.

**Por que foi implementado dessa forma:** A extensão roda com `headless: false`; Xvfb fornece display em runner Linux sem desktop.

**Por que uma implementação ingênua seria pior:** Rodar diretamente em Linux headless falharia ao abrir Chromium headed; hardcode de display cria colisões.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 218

**Fonte:** `        env:`

**O que faz:** Abre variáveis de ambiente do step em e2e-shard.

**Como faz:** GitHub injeta os pares filhos apenas no processo daquele step.

**Por que foi implementado dessa forma:** Escopa flags, resultados de jobs e segredos ao menor trecho necessário.

**Por que uma implementação ingênua seria pior:** Variáveis globais ampliariam superfície de exposição e poderiam alterar jobs não relacionados.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 219

**Fonte:** `          CI: true`

**O que faz:** Configura `CI` dentro do bloco e2e-shard com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto e2e-shard; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de e2e-shard e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de e2e-shard de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 220

**Fonte:** `          MANGA_E2E_BROWSER_MODE: stealth`

**O que faz:** Configura `MANGA_E2E_BROWSER_MODE` dentro do bloco e2e-shard com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto e2e-shard; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de e2e-shard e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de e2e-shard de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 221

**Fonte:** `          MANGA_E2E_SHARD: '1'`

**O que faz:** Configura `MANGA_E2E_SHARD` dentro do bloco e2e-shard com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto e2e-shard; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de e2e-shard e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de e2e-shard de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 222

**Fonte:** `      - name: Upload blob report do shard`

**O que faz:** Define o rótulo humano `Upload blob report do shard` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 223

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica arquivos diagnósticos/coverage como artifact do run.

**Como faz:** A action lê `with.path` e cria artifact nomeado para inspeção posterior.

**Por que foi implementado dessa forma:** Falhas de testes/leaks precisam evidência persistente mesmo após VM efêmera desaparecer.

**Por que uma implementação ingênua seria pior:** Sem upload, logs/trace/report locais somem ao finalizar runner e a triagem perde dados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 224

**Fonte:** `        if: ${{ always() && !cancelled() }}`

**O que faz:** Aplica condição GitHub Expression ao bloco e2e-shard: ` ${{ always() && !cancelled() }}`.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 225

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de e2e-shard.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 226

**Fonte:** `          name: blob-report-${{ matrix.group }}-${{ github.sha }}`

**O que faz:** Define o rótulo humano `blob-report-${{ matrix.group }}-${{ github.sha }}` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 227

**Fonte:** `          path: blob-report/`

**O que faz:** Publica o blob report produzido pelo reporter Playwright de shard.

**Como faz:** É um parâmetro declarativo do bloco e2e-shard, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 228

**Fonte:** `          retention-days: 1`

**O que faz:** Mantém blobs intermediários E2E por apenas um dia, reduzindo armazenamento.

**Como faz:** É um parâmetro declarativo do bloco e2e-shard, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 229

**Fonte:** `          if-no-files-found: warn`

**O que faz:** Transforma ausência de blob esperado em warning no upload; o job agregador posteriormente exige exatamente cinco ZIPs.

**Como faz:** É um parâmetro declarativo do bloco e2e-shard, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 230

**Fonte:** `      - name: Upload artefatos de falha do shard`

**O que faz:** Define o rótulo humano `Upload artefatos de falha do shard` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 231

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica arquivos diagnósticos/coverage como artifact do run.

**Como faz:** A action lê `with.path` e cria artifact nomeado para inspeção posterior.

**Por que foi implementado dessa forma:** Falhas de testes/leaks precisam evidência persistente mesmo após VM efêmera desaparecer.

**Por que uma implementação ingênua seria pior:** Sem upload, logs/trace/report locais somem ao finalizar runner e a triagem perde dados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 232

**Fonte:** `        if: failure()`

**O que faz:** Configura `if` dentro do bloco e2e-shard com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto e2e-shard; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de e2e-shard e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de e2e-shard de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 233

**Fonte:** `        continue-on-error: true`

**O que faz:** Torna a falha deste step de suporte não bloqueante em e2e-shard.

**Como faz:** GitHub registra `outcome=failure` mas permite que o job continue; steps funcionais de teste não usam esse escape.

**Por que foi implementado dessa forma:** Uploads/dashboard externos não devem ocultar o resultado dos gates locais já executados.

**Por que uma implementação ingênua seria pior:** Aplicar isso ao comando de teste mascararia regressões; removê-lo de artifacts/Codecov faria infraestrutura auxiliar derrubar a CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 234

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de e2e-shard.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 235

**Fonte:** `          name: playwright-failure-shard-${{ matrix.group }}-${{ github.sha }}`

**O que faz:** Define o rótulo humano `playwright-failure-shard-${{ matrix.group }}-${{ github.sha }}` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 236

**Fonte:** `          path: test-results/`

**O que faz:** Publica screenshots/videos/traces de falha do Playwright quando presentes.

**Como faz:** É um parâmetro declarativo do bloco e2e-shard, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 237

**Fonte:** `          retention-days: 7`

**O que faz:** Mantém artifacts de falha/diagnóstico por sete dias para triagem.

**Como faz:** É um parâmetro declarativo do bloco e2e-shard, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 238

**Fonte:** `          if-no-files-found: ignore`

**O que faz:** Não falha upload de artifact de falha quando o diretório não foi criado.

**Como faz:** É um parâmetro declarativo do bloco e2e-shard, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 239

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de e2e agregado do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 240

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de e2e agregado do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 241

**Fonte:** `  e2e:`

**O que faz:** Declara o job `e2e`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `e2e`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade e2e agregado de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 242

**Fonte:** `    name: E2E Tests (Playwright)`

**O que faz:** Define o rótulo humano `E2E Tests (Playwright)` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 243

**Fonte:** `    if: ${{ always() }}`

**O que faz:** Aplica condição GitHub Expression ao bloco e2e agregado: ` ${{ always() }}`.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: permite que o agregador E2E rode mesmo após shard falhar/ser skipped; não há assertion focal do literal `always()` para este job.

### Linha 244

**Fonte:** `    needs:`

**O que faz:** Abre a lista de dependências do job e2e agregado.

**Como faz:** GitHub só considera o job depois de conhecer os resultados de todos os jobs listados.

**Por que foi implementado dessa forma:** O agregador precisa observar resultados prévios e/ou artifacts produzidos por eles.

**Por que uma implementação ingênua seria pior:** Sem dependência, poderia executar cedo demais e não ter resultados/artifacts disponíveis.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 245

**Fonte:** `      - e2e-shard`

**O que faz:** Declara `e2e-shard` como dependência do agregador E2E.

**Como faz:** O job espera todas as combinações da matriz shard terminarem antes de baixar artifacts.

**Por que foi implementado dessa forma:** Garante conjunto de blobs estável para validar inventário e fazer merge.

**Por que uma implementação ingênua seria pior:** Sem `needs`, o agregador correria antes dos shards e falharia por ausência de artifacts.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 246

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa e2e agregado em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 247

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de e2e agregado.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 248

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 249

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 250

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 251

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 252

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de e2e agregado.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 253

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 254

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 255

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 256

**Fonte:** `      - name: Instalar dependências para merge dos relatórios`

**O que faz:** Define o rótulo humano `Instalar dependências para merge dos relatórios` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 257

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para e2e agregado.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 258

**Fonte:** `      - name: Verificar cobertura exata do plano de 5 shards`

**O que faz:** Define o rótulo humano `Verificar cobertura exata do plano de 5 shards` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 259

**Fonte:** `        run: npm run test:e2e:plan`

**O que faz:** Invoca o entry point canônico `npm run test:e2e:plan`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco e2e agregado delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 260

**Fonte:** `      - name: Baixar blob reports dos shards`

**O que faz:** Define o rótulo humano `Baixar blob reports dos shards` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 261

**Fonte:** `        uses: actions/download-artifact@v4`

**O que faz:** Baixa artifacts de blob gerados pelos cinco shards E2E.

**Como faz:** Filtra nomes pelo SHA, agrega todos em `all-blob-reports` e permite merge posterior.

**Por que foi implementado dessa forma:** Shards rodam em VMs isoladas; o job agregador precisa transportar resultados explicitamente.

**Por que uma implementação ingênua seria pior:** Assumir filesystem compartilhado entre jobs é incorreto e faria o merge não encontrar relatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 262

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de e2e agregado.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 263

**Fonte:** `          path: all-blob-reports`

**O que faz:** Escolhe o diretório local onde os blobs de todos os shards serão baixados.

**Como faz:** É um parâmetro declarativo do bloco e2e agregado, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 264

**Fonte:** `          pattern: blob-report-*-${{ github.sha }}`

**O que faz:** Filtra artifacts pelo prefixo e SHA do commit para não misturar resultados de outros commits.

**Como faz:** É um parâmetro declarativo do bloco e2e agregado, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 265

**Fonte:** `          merge-multiple: true`

**O que faz:** Coloca artifacts correspondentes no mesmo diretório para o merge do Playwright.

**Como faz:** É um parâmetro declarativo do bloco e2e agregado, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 266

**Fonte:** `      - name: Conferir inventário de blobs`

**O que faz:** Define o rótulo humano `Conferir inventário de blobs` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 267

**Fonte:** `        run: |`

**O que faz:** Abre um script shell multilinha do bloco e2e agregado.

**Como faz:** As linhas indentadas seguintes formam um único comando com estado/variáveis locais compartilhados.

**Por que foi implementado dessa forma:** A lógica precisa de condicionais, contagem ou função auxiliar que ficaria ilegível em uma única linha.

**Por que uma implementação ingênua seria pior:** Fragmentar em steps separados perderia variáveis shell locais ou exigiria outputs artificiais.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 268

**Fonte:** `          echo "Blob reports recebidos:"`

**O que faz:** Imprime cabeçalho do inventário para facilitar diagnóstico.

**Como faz:** Usa `find`/`wc -l` sobre `all-blob-reports` após merge-multiple.

**Por que foi implementado dessa forma:** Impede que merge parcial pareça sucesso quando algum shard não publicou resultado.

**Por que uma implementação ingênua seria pior:** Mesclar qualquer quantidade disponível poderia aprovar subconjunto incompleto de testes.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 269

**Fonte:** `          find all-blob-reports -maxdepth 1 -type f -name '*.zip' -print`

**O que faz:** Lista ZIPs de blob presentes na raiz agregada.

**Como faz:** Usa `find`/`wc -l` sobre `all-blob-reports` após merge-multiple.

**Por que foi implementado dessa forma:** Impede que merge parcial pareça sucesso quando algum shard não publicou resultado.

**Por que uma implementação ingênua seria pior:** Mesclar qualquer quantidade disponível poderia aprovar subconjunto incompleto de testes.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 270

**Fonte:** `          test "$(find all-blob-reports -maxdepth 1 -type f -name '*.zip' | wc -l)" -eq 5`

**O que faz:** Conta os ZIPs e falha se o total não for exatamente cinco.

**Como faz:** Usa `find`/`wc -l` sobre `all-blob-reports` após merge-multiple.

**Por que foi implementado dessa forma:** Impede que merge parcial pareça sucesso quando algum shard não publicou resultado.

**Por que uma implementação ingênua seria pior:** Mesclar qualquer quantidade disponível poderia aprovar subconjunto incompleto de testes.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 271

**Fonte:** `      - name: Mesclar shards e aplicar gate global E2E`

**O que faz:** Define o rótulo humano `Mesclar shards e aplicar gate global E2E` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 272

**Fonte:** `        run: npx playwright merge-reports --config=scripts/ci/playwright-merge.config.js ./all-blob-reports`

**O que faz:** Configura `run` dentro do bloco e2e agregado com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto e2e agregado; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de e2e agregado e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de e2e agregado de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO; `verify-e2e-shard-plan.js` ainda enumera testes reais via Playwright e prova união exata/sem duplicatas quando executado pelo job.

### Linha 273

**Fonte:** `        env:`

**O que faz:** Abre variáveis de ambiente do step em e2e agregado.

**Como faz:** GitHub injeta os pares filhos apenas no processo daquele step.

**Por que foi implementado dessa forma:** Escopa flags, resultados de jobs e segredos ao menor trecho necessário.

**Por que uma implementação ingênua seria pior:** Variáveis globais ampliariam superfície de exposição e poderiam alterar jobs não relacionados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 274

**Fonte:** `          CI: true`

**O que faz:** Configura `CI` dentro do bloco e2e agregado com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto e2e agregado; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de e2e agregado e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de e2e agregado de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 275

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de jest-worker-diagnostic do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 276

**Fonte:** `  jest-worker-diagnostic:`

**O que faz:** Declara o job `jest-worker-diagnostic`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `jest-worker-diagnostic`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade jest-worker-diagnostic de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 277

**Fonte:** `    name: Jest Worker Diagnostic (${{ matrix.case }})`

**O que faz:** Define o rótulo humano `Jest Worker Diagnostic (${{ matrix.case }})` dentro de jest-worker-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 278

**Fonte:** `    if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}`

**O que faz:** Aplica condição GitHub Expression ao bloco jest-worker-diagnostic: ` ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}`.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 279

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa jest-worker-diagnostic em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 280

**Fonte:** `    strategy:`

**O que faz:** Abre a estratégia de matriz/paralelismo de jest-worker-diagnostic.

**Como faz:** As propriedades filhas controlam expansão de jobs e comportamento de falha.

**Por que foi implementado dessa forma:** Permite múltiplos casos/versões em jobs separados e observáveis.

**Por que uma implementação ingênua seria pior:** Loopar todos os casos dentro de um único processo reduz paralelismo e isola pior as falhas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 281

**Fonte:** `      fail-fast: false`

**O que faz:** Desabilita cancelamento automático dos irmãos de matriz quando um caso falha.

**Como faz:** GitHub continua lançando/executando as demais combinações.

**Por que foi implementado dessa forma:** Preserva evidência completa de versões, shards ou diagnósticos mesmo quando um elemento falha.

**Por que uma implementação ingênua seria pior:** `fail-fast: true` pode ocultar quais outros shards/casos também estão quebrados e reduzir material de diagnóstico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 282

**Fonte:** `      max-parallel: 4`

**O que faz:** Limita a quatro casos diagnósticos em execução simultânea.

**Como faz:** GitHub segura combinações excedentes na fila da matriz.

**Por que foi implementado dessa forma:** Evita saturar recursos/concorrência da organização enquanto ainda coleta diagnósticos em paralelo.

**Por que uma implementação ingênua seria pior:** Sem limite, 10–18 casos podem iniciar juntos e aumentar custo/ruído; serializar tudo aumenta muito o tempo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 283

**Fonte:** `      matrix:`

**O que faz:** Abre a matriz usada por jest-worker-diagnostic.

**Como faz:** Cada valor filho expande uma execução independente com contexto `matrix.*`.

**Por que foi implementado dessa forma:** Distribui carga e deixa cada combinação identificável.

**Por que uma implementação ingênua seria pior:** Uma lista serial dentro do step perde isolamento e aumenta tempo de parede.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 284

**Fonte:** `        case:`

**O que faz:** Abre a lista de casos diagnósticos de jest-worker-diagnostic.

**Como faz:** Cada entrada `- ...` vira um valor de `matrix.case` passado ao script de diagnóstico.

**Por que foi implementado dessa forma:** Isola projetos/combinações e diferentes contagens de workers para localizar leaks.

**Por que uma implementação ingênua seria pior:** Um diagnóstico único do conjunto total indica que existe leak, mas não ajuda a localizar interação ou limiar de workers.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 285

**Fonte:** `          - full-default`

**O que faz:** Adiciona o caso Jest `full-default` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 286

**Fonte:** `          - full-w1`

**O que faz:** Adiciona o caso Jest `full-w1` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 287

**Fonte:** `          - full-w2`

**O que faz:** Adiciona o caso Jest `full-w2` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 288

**Fonte:** `          - full-w3`

**O que faz:** Adiciona o caso Jest `full-w3` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 289

**Fonte:** `          - full-w4`

**O que faz:** Adiciona o caso Jest `full-w4` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 290

**Fonte:** `          - project-background`

**O que faz:** Adiciona o caso Jest `project-background` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 291

**Fonte:** `          - project-gtc`

**O que faz:** Adiciona o caso Jest `project-gtc` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 292

**Fonte:** `          - project-content-scripts`

**O que faz:** Adiciona o caso Jest `project-content-scripts` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 293

**Fonte:** `          - project-popup`

**O que faz:** Adiciona o caso Jest `project-popup` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 294

**Fonte:** `          - project-reader`

**O que faz:** Adiciona o caso Jest `project-reader` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 295

**Fonte:** `          - project-manifest`

**O que faz:** Adiciona o caso Jest `project-manifest` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 296

**Fonte:** `          - project-shared-ui`

**O que faz:** Adiciona o caso Jest `project-shared-ui` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 297

**Fonte:** `          - project-integration`

**O que faz:** Adiciona o caso Jest `project-integration` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 298

**Fonte:** `          - combo-content-integration`

**O que faz:** Adiciona o caso Jest `combo-content-integration` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 299

**Fonte:** `          - combo-jsdom-projects`

**O que faz:** Adiciona o caso Jest `combo-jsdom-projects` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 300

**Fonte:** `          - combo-background-content`

**O que faz:** Adiciona o caso Jest `combo-background-content` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 301

**Fonte:** `          - combo-background-integration`

**O que faz:** Adiciona o caso Jest `combo-background-integration` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 302

**Fonte:** `          - combo-background-jsdom`

**O que faz:** Adiciona o caso Jest `combo-background-jsdom` à matriz diagnóstica.

**Como faz:** O nome é interpolado em `--case=${{ matrix.case }}` e selecionado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Este caso cobre um recorte específico de workers/projetos para localizar a origem do encerramento forçado.

**Por que uma implementação ingênua seria pior:** Remover casos reduz poder de bisseção e pode deixar leak dependente de combinação sem reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 303

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de jest-worker-diagnostic.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 304

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de jest-worker-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 305

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 306

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de jest-worker-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 307

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 308

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de jest-worker-diagnostic.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 309

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 310

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 311

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 312

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de jest-worker-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 313

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para jest-worker-diagnostic.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 314

**Fonte:** `      - name: Executar diagnóstico ${{ matrix.case }}`

**O que faz:** Define o rótulo humano `Executar diagnóstico ${{ matrix.case }}` dentro de jest-worker-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 315

**Fonte:** `        run: npm run test:diagnose-workers -- --case=${{ matrix.case }}`

**O que faz:** Invoca o entry point canônico `npm run test:diagnose-workers -- --case=${{ matrix.case }}`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco jest-worker-diagnostic delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 316

**Fonte:** `      - name: Publicar diagnóstico ${{ matrix.case }}`

**O que faz:** Define o rótulo humano `Publicar diagnóstico ${{ matrix.case }}` dentro de jest-worker-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 317

**Fonte:** `        if: always()`

**O que faz:** Configura `if` dentro do bloco jest-worker-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto jest-worker-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de jest-worker-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de jest-worker-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 318

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica arquivos diagnósticos/coverage como artifact do run.

**Como faz:** A action lê `with.path` e cria artifact nomeado para inspeção posterior.

**Por que foi implementado dessa forma:** Falhas de testes/leaks precisam evidência persistente mesmo após VM efêmera desaparecer.

**Por que uma implementação ingênua seria pior:** Sem upload, logs/trace/report locais somem ao finalizar runner e a triagem perde dados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 319

**Fonte:** `        continue-on-error: true`

**O que faz:** Torna a falha deste step de suporte não bloqueante em jest-worker-diagnostic.

**Como faz:** GitHub registra `outcome=failure` mas permite que o job continue; steps funcionais de teste não usam esse escape.

**Por que foi implementado dessa forma:** Uploads/dashboard externos não devem ocultar o resultado dos gates locais já executados.

**Por que uma implementação ingênua seria pior:** Aplicar isso ao comando de teste mascararia regressões; removê-lo de artifacts/Codecov faria infraestrutura auxiliar derrubar a CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 320

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de jest-worker-diagnostic.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 321

**Fonte:** `          name: jest-worker-diagnostic-${{ matrix.case }}-${{ github.sha }}`

**O que faz:** Define o rótulo humano `jest-worker-diagnostic-${{ matrix.case }}-${{ github.sha }}` dentro de jest-worker-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 322

**Fonte:** `          path: |`

**O que faz:** Configura `path` dentro do bloco jest-worker-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto jest-worker-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de jest-worker-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de jest-worker-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 323

**Fonte:** `            .ci-results/jest-worker-diagnostic-${{ matrix.case }}.json`

**O que faz:** Configura `.ci-results/jest-worker-diagnostic-${{ matrix.case }}.json` dentro do bloco jest-worker-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto jest-worker-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de jest-worker-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de jest-worker-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 324

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.json`

**O que faz:** Configura `.ci-results/jest-worker-diagnostic/${{ matrix.case }}.json` dentro do bloco jest-worker-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto jest-worker-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de jest-worker-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de jest-worker-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 325

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.log`

**O que faz:** Configura `.ci-results/jest-worker-diagnostic/${{ matrix.case }}.log` dentro do bloco jest-worker-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto jest-worker-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de jest-worker-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de jest-worker-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 326

**Fonte:** `          retention-days: 7`

**O que faz:** Mantém artifacts de falha/diagnóstico por sete dias para triagem.

**Como faz:** É um parâmetro declarativo do bloco jest-worker-diagnostic, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 327

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de focused-project-leak-diagnostic do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 328

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de focused-project-leak-diagnostic do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 329

**Fonte:** `  focused-project-leak-diagnostic:`

**O que faz:** Declara o job `focused-project-leak-diagnostic`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `focused-project-leak-diagnostic`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade focused-project-leak-diagnostic de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 330

**Fonte:** `    name: Focused Project Leak (${{ matrix.case }})`

**O que faz:** Define o rótulo humano `Focused Project Leak (${{ matrix.case }})` dentro de focused-project-leak-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 331

**Fonte:** `    if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}`

**O que faz:** Aplica condição GitHub Expression ao bloco focused-project-leak-diagnostic: ` ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}`.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 332

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa focused-project-leak-diagnostic em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 333

**Fonte:** `    strategy:`

**O que faz:** Abre a estratégia de matriz/paralelismo de focused-project-leak-diagnostic.

**Como faz:** As propriedades filhas controlam expansão de jobs e comportamento de falha.

**Por que foi implementado dessa forma:** Permite múltiplos casos/versões em jobs separados e observáveis.

**Por que uma implementação ingênua seria pior:** Loopar todos os casos dentro de um único processo reduz paralelismo e isola pior as falhas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 334

**Fonte:** `      fail-fast: false`

**O que faz:** Desabilita cancelamento automático dos irmãos de matriz quando um caso falha.

**Como faz:** GitHub continua lançando/executando as demais combinações.

**Por que foi implementado dessa forma:** Preserva evidência completa de versões, shards ou diagnósticos mesmo quando um elemento falha.

**Por que uma implementação ingênua seria pior:** `fail-fast: true` pode ocultar quais outros shards/casos também estão quebrados e reduzir material de diagnóstico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 335

**Fonte:** `      max-parallel: 4`

**O que faz:** Limita a quatro casos diagnósticos em execução simultânea.

**Como faz:** GitHub segura combinações excedentes na fila da matriz.

**Por que foi implementado dessa forma:** Evita saturar recursos/concorrência da organização enquanto ainda coleta diagnósticos em paralelo.

**Por que uma implementação ingênua seria pior:** Sem limite, 10–18 casos podem iniciar juntos e aumentar custo/ruído; serializar tudo aumenta muito o tempo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 336

**Fonte:** `      matrix:`

**O que faz:** Abre a matriz usada por focused-project-leak-diagnostic.

**Como faz:** Cada valor filho expande uma execução independente com contexto `matrix.*`.

**Por que foi implementado dessa forma:** Distribui carga e deixa cada combinação identificável.

**Por que uma implementação ingênua seria pior:** Uma lista serial dentro do step perde isolamento e aumenta tempo de parede.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 337

**Fonte:** `        case:`

**O que faz:** Abre a lista de casos diagnósticos de focused-project-leak-diagnostic.

**Como faz:** Cada entrada `- ...` vira um valor de `matrix.case` passado ao script de diagnóstico.

**Por que foi implementado dessa forma:** Isola projetos/combinações e diferentes contagens de workers para localizar leaks.

**Por que uma implementação ingênua seria pior:** Um diagnóstico único do conjunto total indica que existe leak, mas não ajuda a localizar interação ou limiar de workers.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 338

**Fonte:** `          - project-background`

**O que faz:** Adiciona o caso focal `project-background` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 339

**Fonte:** `          - project-content-scripts`

**O que faz:** Adiciona o caso focal `project-content-scripts` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 340

**Fonte:** `          - project-shared-ui`

**O que faz:** Adiciona o caso focal `project-shared-ui` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 341

**Fonte:** `          - project-integration`

**O que faz:** Adiciona o caso focal `project-integration` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 342

**Fonte:** `          - project-manifest`

**O que faz:** Adiciona o caso focal `project-manifest` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 343

**Fonte:** `          - combo-content-integration`

**O que faz:** Adiciona o caso focal `combo-content-integration` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 344

**Fonte:** `          - combo-jsdom-projects`

**O que faz:** Adiciona o caso focal `combo-jsdom-projects` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 345

**Fonte:** `          - combo-background-content`

**O que faz:** Adiciona o caso focal `combo-background-content` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 346

**Fonte:** `          - combo-background-integration`

**O que faz:** Adiciona o caso focal `combo-background-integration` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 347

**Fonte:** `          - combo-background-jsdom`

**O que faz:** Adiciona o caso focal `combo-background-jsdom` ao diagnóstico de leak.

**Como faz:** A matriz passa o identificador ao mesmo diagnosticador Jest, mas limita o conjunto aos casos mais relevantes.

**Por que foi implementado dessa forma:** Mantém investigação pós-merge focada em combinações que historicamente expõem interação.

**Por que uma implementação ingênua seria pior:** Executar só casos isolados pode perder leaks que surgem apenas quando projetos compartilham o processo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 348

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de focused-project-leak-diagnostic.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 349

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de focused-project-leak-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 350

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 351

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de focused-project-leak-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 352

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 353

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de focused-project-leak-diagnostic.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 354

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 355

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 356

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 357

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de focused-project-leak-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 358

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para focused-project-leak-diagnostic.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 359

**Fonte:** `      - name: Executar ${{ matrix.case }}`

**O que faz:** Define o rótulo humano `Executar ${{ matrix.case }}` dentro de focused-project-leak-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 360

**Fonte:** `        run: npm run test:diagnose-workers -- --case=${{ matrix.case }}`

**O que faz:** Invoca o entry point canônico `npm run test:diagnose-workers -- --case=${{ matrix.case }}`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco focused-project-leak-diagnostic delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 361

**Fonte:** `      - name: Publicar diagnóstico ${{ matrix.case }}`

**O que faz:** Define o rótulo humano `Publicar diagnóstico ${{ matrix.case }}` dentro de focused-project-leak-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 362

**Fonte:** `        if: always()`

**O que faz:** Configura `if` dentro do bloco focused-project-leak-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto focused-project-leak-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de focused-project-leak-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de focused-project-leak-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 363

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica arquivos diagnósticos/coverage como artifact do run.

**Como faz:** A action lê `with.path` e cria artifact nomeado para inspeção posterior.

**Por que foi implementado dessa forma:** Falhas de testes/leaks precisam evidência persistente mesmo após VM efêmera desaparecer.

**Por que uma implementação ingênua seria pior:** Sem upload, logs/trace/report locais somem ao finalizar runner e a triagem perde dados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 364

**Fonte:** `        continue-on-error: true`

**O que faz:** Torna a falha deste step de suporte não bloqueante em focused-project-leak-diagnostic.

**Como faz:** GitHub registra `outcome=failure` mas permite que o job continue; steps funcionais de teste não usam esse escape.

**Por que foi implementado dessa forma:** Uploads/dashboard externos não devem ocultar o resultado dos gates locais já executados.

**Por que uma implementação ingênua seria pior:** Aplicar isso ao comando de teste mascararia regressões; removê-lo de artifacts/Codecov faria infraestrutura auxiliar derrubar a CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 365

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de focused-project-leak-diagnostic.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 366

**Fonte:** `          name: focused-project-leak-${{ matrix.case }}-${{ github.sha }}`

**O que faz:** Define o rótulo humano `focused-project-leak-${{ matrix.case }}-${{ github.sha }}` dentro de focused-project-leak-diagnostic.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 367

**Fonte:** `          path: |`

**O que faz:** Configura `path` dentro do bloco focused-project-leak-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto focused-project-leak-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de focused-project-leak-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de focused-project-leak-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 368

**Fonte:** `            .ci-results/jest-worker-diagnostic-${{ matrix.case }}.json`

**O que faz:** Configura `.ci-results/jest-worker-diagnostic-${{ matrix.case }}.json` dentro do bloco focused-project-leak-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto focused-project-leak-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de focused-project-leak-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de focused-project-leak-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 369

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.json`

**O que faz:** Configura `.ci-results/jest-worker-diagnostic/${{ matrix.case }}.json` dentro do bloco focused-project-leak-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto focused-project-leak-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de focused-project-leak-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de focused-project-leak-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 370

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.log`

**O que faz:** Configura `.ci-results/jest-worker-diagnostic/${{ matrix.case }}.log` dentro do bloco focused-project-leak-diagnostic com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto focused-project-leak-diagnostic; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de focused-project-leak-diagnostic e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de focused-project-leak-diagnostic de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 371

**Fonte:** `          retention-days: 7`

**O que faz:** Mantém artifacts de falha/diagnóstico por sete dias para triagem.

**Como faz:** É um parâmetro declarativo do bloco focused-project-leak-diagnostic, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 372

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de background-leak-bisection do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 373

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de background-leak-bisection do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 374

**Fonte:** `  background-leak-bisection:`

**O que faz:** Declara o job `background-leak-bisection`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `background-leak-bisection`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade background-leak-bisection de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 375

**Fonte:** `    name: Background Leak Bisection`

**O que faz:** Define o rótulo humano `Background Leak Bisection` dentro de background-leak-bisection.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 376

**Fonte:** `    if: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}`

**O que faz:** Aplica condição GitHub Expression ao bloco background-leak-bisection: ` ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}`.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 377

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa background-leak-bisection em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 378

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de background-leak-bisection.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 379

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de background-leak-bisection.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 380

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 381

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de background-leak-bisection.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 382

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 383

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de background-leak-bisection.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 384

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 385

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 386

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 387

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de background-leak-bisection.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 388

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para background-leak-bisection.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 389

**Fonte:** `      - name: Reduzir conjunto de testes de background que mantém worker vivo`

**O que faz:** Define o rótulo humano `Reduzir conjunto de testes de background que mantém worker vivo` dentro de background-leak-bisection.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 390

**Fonte:** `        run: npm run test:diagnose-background-leak`

**O que faz:** Invoca o entry point canônico `npm run test:diagnose-background-leak`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco background-leak-bisection delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 391

**Fonte:** `        env:`

**O que faz:** Abre variáveis de ambiente do step em background-leak-bisection.

**Como faz:** GitHub injeta os pares filhos apenas no processo daquele step.

**Por que foi implementado dessa forma:** Escopa flags, resultados de jobs e segredos ao menor trecho necessário.

**Por que uma implementação ingênua seria pior:** Variáveis globais ampliariam superfície de exposição e poderiam alterar jobs não relacionados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 392

**Fonte:** `          # Evidência do run #1289: w2 limpo; w3 reproduz worker forçado.`

**O que faz:** Comentário que registra a intenção operacional do bloco background-leak-bisection: Evidência do run #1289: w2 limpo; w3 reproduz worker forçado.

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: comentário editorial; sua intenção foi cruzada com o comportamento vizinho, mas comentários não são executáveis.

### Linha 393

**Fonte:** `          MT_BACKGROUND_LEAK_WORKERS: "3"`

**O que faz:** Fixa o diagnóstico de background em 3 workers para reproduzir o limiar histórico do leak.

**Como faz:** A variável é lida por `diagnose-background-leak.js`, que usa esse override no sweep/bisseção.

**Por que foi implementado dessa forma:** O comentário registra evidência anterior: w2 limpo, w3 reproduz; fixa um cenário sensível pós-merge.

**Por que uma implementação ingênua seria pior:** Voltar ao default sem evidência pode tornar o diagnóstico não determinístico ou não reproduzir o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 394

**Fonte:** `          # O primeiro cluster de 11 arquivos já ficou limpo; reabra o universo`

**O que faz:** Comentário que registra a intenção operacional do bloco background-leak-bisection: O primeiro cluster de 11 arquivos já ficou limpo; reabra o universo

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: comentário editorial; sua intenção foi cruzada com o comportamento vizinho, mas comentários não são executáveis.

### Linha 395

**Fonte:** `          # completo para localizar qualquer segundo leak de background.`

**O que faz:** Comentário que registra a intenção operacional do bloco background-leak-bisection: completo para localizar qualquer segundo leak de background.

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: comentário editorial; sua intenção foi cruzada com o comportamento vizinho, mas comentários não são executáveis.

### Linha 396

**Fonte:** `      - name: Publicar bisection do leak de background`

**O que faz:** Define o rótulo humano `Publicar bisection do leak de background` dentro de background-leak-bisection.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 397

**Fonte:** `        if: always()`

**O que faz:** Configura `if` dentro do bloco background-leak-bisection com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto background-leak-bisection; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de background-leak-bisection e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de background-leak-bisection de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 398

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica arquivos diagnósticos/coverage como artifact do run.

**Como faz:** A action lê `with.path` e cria artifact nomeado para inspeção posterior.

**Por que foi implementado dessa forma:** Falhas de testes/leaks precisam evidência persistente mesmo após VM efêmera desaparecer.

**Por que uma implementação ingênua seria pior:** Sem upload, logs/trace/report locais somem ao finalizar runner e a triagem perde dados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 399

**Fonte:** `        continue-on-error: true`

**O que faz:** Torna a falha deste step de suporte não bloqueante em background-leak-bisection.

**Como faz:** GitHub registra `outcome=failure` mas permite que o job continue; steps funcionais de teste não usam esse escape.

**Por que foi implementado dessa forma:** Uploads/dashboard externos não devem ocultar o resultado dos gates locais já executados.

**Por que uma implementação ingênua seria pior:** Aplicar isso ao comando de teste mascararia regressões; removê-lo de artifacts/Codecov faria infraestrutura auxiliar derrubar a CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 400

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de background-leak-bisection.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 401

**Fonte:** `          name: background-leak-bisection-${{ github.sha }}`

**O que faz:** Define o rótulo humano `background-leak-bisection-${{ github.sha }}` dentro de background-leak-bisection.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 402

**Fonte:** `          path: |`

**O que faz:** Configura `path` dentro do bloco background-leak-bisection com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto background-leak-bisection; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de background-leak-bisection e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de background-leak-bisection de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 403

**Fonte:** `            .ci-results/background-leak-diagnostic.json`

**O que faz:** Configura `.ci-results/background-leak-diagnostic.json` dentro do bloco background-leak-bisection com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto background-leak-bisection; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de background-leak-bisection e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de background-leak-bisection de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 404

**Fonte:** `            .ci-results/background-leak-diagnostic/`

**O que faz:** Configura `.ci-results/background-leak-diagnostic/` dentro do bloco background-leak-bisection com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto background-leak-bisection; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de background-leak-bisection e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de background-leak-bisection de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 405

**Fonte:** `          retention-days: 7`

**O que faz:** Mantém artifacts de falha/diagnóstico por sete dias para triagem.

**Como faz:** É um parâmetro declarativo do bloco background-leak-bisection, consumido pela action/step pai.

**Por que foi implementado dessa forma:** Mantém artifacts/integrações correlacionados ao commit e com retenção adequada ao valor diagnóstico.

**Por que uma implementação ingênua seria pior:** Parâmetro incorreto pode misturar commits, perder evidência ou aumentar armazenamento desnecessariamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 406

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de windows-portability do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 407

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de windows-portability do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 408

**Fonte:** `  windows-portability:`

**O que faz:** Declara o job `windows-portability`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `windows-portability`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade windows-portability de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 409

**Fonte:** `    name: Windows Portability`

**O que faz:** Define o rótulo humano `Windows Portability` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 410

**Fonte:** `    runs-on: windows-latest`

**O que faz:** Executa o job de portabilidade em runner Windows hospedado.

**Como faz:** GitHub provisiona VM Windows e aplica o shell padrão do runner aos comandos `run`.

**Por que foi implementado dessa forma:** Exercita paths, npm/Jest e scripts em um sistema diferente do Linux dominante na CI.

**Por que uma implementação ingênua seria pior:** Testar apenas Linux deixaria regressões de separador de caminho, quoting e comportamento de processo no Windows escaparem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 411

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de windows-portability.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 412

**Fonte:** `      - name: Checkout código`

**O que faz:** Define o rótulo humano `Checkout código` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 413

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 414

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 415

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 416

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de windows-portability.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 417

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 418

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 419

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 420

**Fonte:** `      - name: Instalar dependências`

**O que faz:** Define o rótulo humano `Instalar dependências` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 421

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para windows-portability.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 422

**Fonte:** `      - name: Validar contratos e paths`

**O que faz:** Define o rótulo humano `Validar contratos e paths` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 423

**Fonte:** `        run: npm run validate`

**O que faz:** Invoca o entry point canônico `npm run validate`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco windows-portability delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 424

**Fonte:** `      - name: Jest completo`

**O que faz:** Define o rótulo humano `Jest completo` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 425

**Fonte:** `        run: npm run test:ci`

**O que faz:** Invoca o entry point canônico `npm run test:ci`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco windows-portability delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 426

**Fonte:** `      - name: Smoke`

**O que faz:** Define o rótulo humano `Smoke` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 427

**Fonte:** `        run: npm run test:smoke`

**O que faz:** Invoca o entry point canônico `npm run test:smoke`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco windows-portability delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 428

**Fonte:** `      - name: Visual`

**O que faz:** Define o rótulo humano `Visual` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 429

**Fonte:** `        run: npm run test:visual`

**O que faz:** Invoca o entry point canônico `npm run test:visual`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco windows-portability delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 430

**Fonte:** `      - name: Coverage`

**O que faz:** Define o rótulo humano `Coverage` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 431

**Fonte:** `        run: npm run test:coverage`

**O que faz:** Invoca o entry point canônico `npm run test:coverage`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco windows-portability delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 432

**Fonte:** `      - name: Verificar coverage e normalização de paths`

**O que faz:** Define o rótulo humano `Verificar coverage e normalização de paths` dentro de windows-portability.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 433

**Fonte:** `        run: npm run test:coverage:verify`

**O que faz:** Invoca o entry point canônico `npm run test:coverage:verify`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco windows-portability delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 434

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de fresh-developer-flow do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 435

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de fresh-developer-flow do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 436

**Fonte:** `  fresh-developer-flow:`

**O que faz:** Declara o job `fresh-developer-flow`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `fresh-developer-flow`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade fresh-developer-flow de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 437

**Fonte:** `    name: Fresh Developer Flow`

**O que faz:** Define o rótulo humano `Fresh Developer Flow` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 438

**Fonte:** `    if: ${{ github.event_name == 'workflow_dispatch' }}`

**O que faz:** Aplica condição GitHub Expression ao bloco fresh-developer-flow: ` ${{ github.event_name == 'workflow_dispatch' }}`.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 439

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa fresh-developer-flow em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 440

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de fresh-developer-flow.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 441

**Fonte:** `      - name: Checkout limpo`

**O que faz:** Define o rótulo humano `Checkout limpo` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 442

**Fonte:** `        uses: actions/checkout@v4`

**O que faz:** Faz checkout do commit/ref que disparou a execução.

**Como faz:** A action oficial materializa o repositório em `$GITHUB_WORKSPACE` para os passos seguintes.

**Por que foi implementado dessa forma:** Todos os validadores e testes leem arquivos relativos à raiz do checkout.

**Por que uma implementação ingênua seria pior:** Sem checkout, scripts locais e package.json não existem no workspace; usar outro SHA testaria código diferente do evento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 443

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de fresh-developer-flow.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 444

**Fonte:** `          clean: true`

**O que faz:** Solicita checkout com limpeza do workspace no fluxo de desenvolvedor novo.

**Como faz:** `actions/checkout` remove arquivos não rastreados/alterações residuais conforme suporte da action.

**Por que foi implementado dessa forma:** Simula clone/checkout limpo e reduz falso sucesso causado por artifacts prévios.

**Por que uma implementação ingênua seria pior:** Reusar resíduos de uma etapa anterior pode esconder dependência não declarada ou arquivo gerado faltante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 445

**Fonte:** `      - name: Configurar Node.js`

**O que faz:** Define o rótulo humano `Configurar Node.js` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 446

**Fonte:** `        uses: actions/setup-node@v4`

**O que faz:** Inicializa uma instalação controlada de Node.js.

**Como faz:** A action oficial resolve a versão declarada em `with` e pode configurar cache npm.

**Por que foi implementado dessa forma:** Evita depender da versão incidental pré-instalada no runner e padroniza o runtime.

**Por que uma implementação ingênua seria pior:** Usar o Node default do runner torna resultados sensíveis a mudanças de imagem e pode esconder incompatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 447

**Fonte:** `        with:`

**O que faz:** Abre parâmetros da action usada no step de fresh-developer-flow.

**Como faz:** As linhas filhas são entregues como inputs tipados/strings à action.

**Por que foi implementado dessa forma:** Mantém configuração declarativa perto da action consumidora.

**Por que uma implementação ingênua seria pior:** Mover esses valores para scripts ad hoc esconderia o contrato e dificultaria validação estática.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 448

**Fonte:** `          node-version: 20.x`

**O que faz:** Seleciona Node.js 20.x para este contexto.

**Como faz:** `setup-node` instala/ativa essa versão antes dos comandos Node/npm.

**Por que foi implementado dessa forma:** Node 20 é o baseline CI; o job matricial também testa 22 para portabilidade entre LTSs suportados.

**Por que uma implementação ingênua seria pior:** Não fixar major permite drift do runner; testar só uma versão reduz sinal sobre compatibilidade.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 449

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache gerenciado do npm via `setup-node`.

**Como faz:** A action deriva chave de cache do lockfile e restaura conteúdo de cache do gerenciador, não `node_modules`.

**Por que foi implementado dessa forma:** Reduz downloads repetidos mantendo `npm ci` como instalação determinística.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` diretamente aumenta risco de artefatos incompatíveis entre Node/OS e viola a semântica limpa do `npm ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 450

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Define o lockfile raiz como fonte da chave de cache npm.

**Como faz:** Mudanças no `package-lock.json` invalidam/restabelecem cache apropriado.

**Por que foi implementado dessa forma:** O repositório foi centralizado em um único lockfile canônico.

**Por que uma implementação ingênua seria pior:** Apontar para lockfile legado de `tests/` criaria cache stale e contradiz a arquitetura centralizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 451

**Fonte:** `      - name: Instalar dependências a partir da raiz`

**O que faz:** Define o rótulo humano `Instalar dependências a partir da raiz` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 452

**Fonte:** `        run: npm ci`

**O que faz:** Instala dependências exatamente conforme `package-lock.json` para fresh-developer-flow.

**Como faz:** npm remove instalação divergente e materializa a árvore lockada.

**Por que foi implementado dessa forma:** Testes que usam Jest/Playwright precisam dependências reproduzíveis.

**Por que uma implementação ingênua seria pior:** `npm install` pode atualizar resolução e produzir resultado diferente do lockfile/CI anterior.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 453

**Fonte:** `      - name: Instalar Chromium para o fluxo E2E`

**O que faz:** Define o rótulo humano `Instalar Chromium para o fluxo E2E` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 454

**Fonte:** `        run: npx playwright install chromium --with-deps --no-shell`

**O que faz:** Instala Chromium e dependências nativas necessárias ao Playwright.

**Como faz:** `npx playwright install chromium --with-deps --no-shell` baixa o navegador principal e pacotes do SO, omitindo o headless shell redundante.

**Por que foi implementado dessa forma:** Os E2E carregam uma extensão Chromium real e precisam do browser disponível no runner.

**Por que uma implementação ingênua seria pior:** Omitir `--with-deps` quebra em imagens sem bibliotecas; instalar browsers extras aumenta download e duração sem benefício.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 455

**Fonte:** `      - name: Testes unitários`

**O que faz:** Define o rótulo humano `Testes unitários` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 456

**Fonte:** `        run: npm run test:unit`

**O que faz:** Invoca o entry point canônico `npm run test:unit`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco fresh-developer-flow delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 457

**Fonte:** `      - name: Testes de integração`

**O que faz:** Define o rótulo humano `Testes de integração` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 458

**Fonte:** `        run: npm run test:integration`

**O que faz:** Invoca o entry point canônico `npm run test:integration`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco fresh-developer-flow delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 459

**Fonte:** `      - name: Smoke`

**O que faz:** Define o rótulo humano `Smoke` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 460

**Fonte:** `        run: npm run test:smoke`

**O que faz:** Invoca o entry point canônico `npm run test:smoke`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco fresh-developer-flow delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 461

**Fonte:** `      - name: Visual`

**O que faz:** Define o rótulo humano `Visual` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 462

**Fonte:** `        run: npm run test:visual`

**O que faz:** Invoca o entry point canônico `npm run test:visual`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco fresh-developer-flow delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 463

**Fonte:** `      - name: E2E completo`

**O que faz:** Define o rótulo humano `E2E completo` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 464

**Fonte:** `        run: xvfb-run --auto-servernum -- npm run test:e2e`

**O que faz:** Executa o E2E sob display virtual X11.

**Como faz:** `xvfb-run --auto-servernum` cria DISPLAY temporário e chama o script npm com o grupo/fluxo selecionado.

**Por que foi implementado dessa forma:** A extensão roda com `headless: false`; Xvfb fornece display em runner Linux sem desktop.

**Por que uma implementação ingênua seria pior:** Rodar diretamente em Linux headless falharia ao abrir Chromium headed; hardcode de display cria colisões.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 465

**Fonte:** `        env:`

**O que faz:** Abre variáveis de ambiente do step em fresh-developer-flow.

**Como faz:** GitHub injeta os pares filhos apenas no processo daquele step.

**Por que foi implementado dessa forma:** Escopa flags, resultados de jobs e segredos ao menor trecho necessário.

**Por que uma implementação ingênua seria pior:** Variáveis globais ampliariam superfície de exposição e poderiam alterar jobs não relacionados.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 466

**Fonte:** `          CI: true`

**O que faz:** Configura `CI` dentro do bloco fresh-developer-flow com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto fresh-developer-flow; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de fresh-developer-flow e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de fresh-developer-flow de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 467

**Fonte:** `      - name: Coverage`

**O que faz:** Define o rótulo humano `Coverage` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 468

**Fonte:** `        run: npm run test:coverage`

**O que faz:** Invoca o entry point canônico `npm run test:coverage`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco fresh-developer-flow delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 469

**Fonte:** `      - name: Verificar integridade do coverage`

**O que faz:** Define o rótulo humano `Verificar integridade do coverage` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 470

**Fonte:** `        run: npm run test:coverage:verify`

**O que faz:** Invoca o entry point canônico `npm run test:coverage:verify`.

**Como faz:** npm resolve o script na raiz de `package.json`, preservando uma única interface para CI, Windows e desenvolvedores.

**Por que foi implementado dessa forma:** O bloco fresh-developer-flow delega lógica ao tooling versionado do repositório em vez de duplicá-la no YAML.

**Por que uma implementação ingênua seria pior:** Copiar o comando interno para o workflow criaria duas fontes de verdade e tornaria refactors de scripts mais propensos a drift.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 471

**Fonte:** `      - name: Entry point oficial npm test`

**O que faz:** Define o rótulo humano `Entry point oficial npm test` dentro de fresh-developer-flow.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 472

**Fonte:** `        run: npm test`

**O que faz:** Configura `run` dentro do bloco fresh-developer-flow com o valor literal desta linha.

**Como faz:** A indentação YAML associa a linha ao contexto fresh-developer-flow; o GitHub Actions interpreta esse campo antes ou durante a execução do job/step.

**Por que foi implementado dessa forma:** O valor participa do contrato operacional específico de fresh-developer-flow e mantém a configuração declarativa no workflow versionado.

**Por que uma implementação ingênua seria pior:** Alterar ou deslocar esta chave sem preservar o contexto pode mudar scheduling, parâmetros, artifacts ou comandos de fresh-developer-flow de forma difícil de perceber em revisão superficial.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 473

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de ci-gate do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 474

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de ci-gate do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: separador textual sem semântica executável.

### Linha 475

**Fonte:** `  ci-gate:`

**O que faz:** Declara o job `ci-gate`.

**Como faz:** GitHub cria uma unidade de execução chamada internamente `ci-gate`; dependências posteriores usam esse identificador.

**Por que foi implementado dessa forma:** O job representa a responsabilidade ci-gate de forma isolada e observável.

**Por que uma implementação ingênua seria pior:** Fundir essa responsabilidade a outro job reduziria paralelismo e tornaria o `ci-gate` menos capaz de distinguir qual contrato falhou.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 476

**Fonte:** `    name: CI Gate`

**O que faz:** Define o rótulo humano `CI Gate` dentro de ci-gate.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 477

**Fonte:** `    # Avalia falhas reais e jobs skipped, mas não ressuscita o gate quando o`

**O que faz:** Comentário que registra a intenção operacional do bloco ci-gate: Avalia falhas reais e jobs skipped, mas não ressuscita o gate quando o

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 478

**Fonte:** `    # workflow inteiro foi cancelado por um push mais novo na mesma branch.`

**O que faz:** Comentário que registra a intenção operacional do bloco ci-gate: workflow inteiro foi cancelado por um push mais novo na mesma branch.

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 479

**Fonte:** `    # Isso evita gravar um falso CI Gate vermelho no mesmo SHA compartilhado`

**O que faz:** Comentário que registra a intenção operacional do bloco ci-gate: Isso evita gravar um falso CI Gate vermelho no mesmo SHA compartilhado

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 480

**Fonte:** `    # com a main, sem enfraquecer nenhuma falha real nem o pós-merge da main.`

**O que faz:** Comentário que registra a intenção operacional do bloco ci-gate: com a main, sem enfraquecer nenhuma falha real nem o pós-merge da main.

**Como faz:** O parser YAML descarta comentários; a regra efetiva é implementada pelas chaves imediatamente próximas.

**Por que foi implementado dessa forma:** A justificativa fica ao lado da configuração sensível para que manutenção futura entenda o motivo do contrato, não apenas o literal.

**Por que uma implementação ingênua seria pior:** Sem essa explicação, uma alteração aparentemente simplificadora pode reintroduzir cancelamento indevido, mascaramento de falha ou custo de diagnóstico sem que o revisor perceba.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 481

**Fonte:** `    if: ${{ always() && !cancelled() }}`

**O que faz:** Aplica condição GitHub Expression ao bloco ci-gate: ` ${{ always() && !cancelled() }}`.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` exige exatamente `always() && !cancelled()` e proíbe `always()` puro no `ci-gate`.

### Linha 482

**Fonte:** `    runs-on: ubuntu-latest`

**O que faz:** Executa ci-gate em runner Linux hospedado Ubuntu.

**Como faz:** GitHub provisiona VM efêmera compatível com shell/bash e ferramentas Linux usadas pelo bloco.

**Por que foi implementado dessa forma:** É o ambiente principal da pipeline e suporta Node, npm, Xvfb e Playwright com dependências do sistema.

**Por que uma implementação ingênua seria pior:** Trocar para runner incompatível sem adaptar comandos pode quebrar `xvfb-run`, `find`, `wc` ou instalação de Chromium.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 483

**Fonte:** `    needs:`

**O que faz:** Abre a lista de dependências do job ci-gate.

**Como faz:** GitHub só considera o job depois de conhecer os resultados de todos os jobs listados.

**Por que foi implementado dessa forma:** O agregador precisa observar resultados prévios e/ou artifacts produzidos por eles.

**Por que uma implementação ingênua seria pior:** Sem dependência, poderia executar cedo demais e não ter resultados/artifacts disponíveis.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 484

**Fonte:** `      - version-integrity`

**O que faz:** Adiciona `version-integrity` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.version-integrity.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 485

**Fonte:** `      - syntax-check`

**O que faz:** Adiciona `syntax-check` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.syntax-check.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 486

**Fonte:** `      - manifest-validation`

**O que faz:** Adiciona `manifest-validation` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.manifest-validation.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 487

**Fonte:** `      - ci-contract`

**O que faz:** Adiciona `ci-contract` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.ci-contract.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 488

**Fonte:** `      - smoke`

**O que faz:** Adiciona `smoke` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.smoke.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 489

**Fonte:** `      - visual`

**O que faz:** Adiciona `visual` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.visual.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 490

**Fonte:** `      - unit-and-integration`

**O que faz:** Adiciona `unit-and-integration` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.unit-and-integration.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 491

**Fonte:** `      - coverage`

**O que faz:** Adiciona `coverage` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.coverage.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 492

**Fonte:** `      - e2e-shard`

**O que faz:** Adiciona `e2e-shard` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.e2e-shard.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 493

**Fonte:** `      - e2e`

**O que faz:** Adiciona `e2e` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.e2e.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 494

**Fonte:** `      - jest-worker-diagnostic`

**O que faz:** Adiciona `jest-worker-diagnostic` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.jest-worker-diagnostic.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 495

**Fonte:** `      - focused-project-leak-diagnostic`

**O que faz:** Adiciona `focused-project-leak-diagnostic` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.focused-project-leak-diagnostic.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 496

**Fonte:** `      - background-leak-bisection`

**O que faz:** Adiciona `background-leak-bisection` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.background-leak-bisection.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 497

**Fonte:** `      - windows-portability`

**O que faz:** Adiciona `windows-portability` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.windows-portability.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 498

**Fonte:** `      - fresh-developer-flow`

**O que faz:** Adiciona `fresh-developer-flow` à lista observada pelo CI Gate.

**Como faz:** O resultado fica acessível em `needs.fresh-developer-flow.result` mesmo quando o gate usa condição `always() && !cancelled()`.

**Por que foi implementado dessa forma:** O agregador precisa conhecer sucesso/falha/skip de cada responsabilidade antes de decidir o resultado final.

**Por que uma implementação ingênua seria pior:** Omitir a dependência permite que o CI Gate termine verde sem considerar aquele job.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 499

**Fonte:** `    steps:`

**O que faz:** Abre a sequência ordenada de steps de ci-gate.

**Como faz:** GitHub executa as entradas da lista de cima para baixo no mesmo job/workspace.

**Por que foi implementado dessa forma:** A ordem garante checkout e setup antes de comandos que dependem do repositório/runtime.

**Por que uma implementação ingênua seria pior:** Reordenar instalação ou checkout depois dos testes faria os comandos falharem ou usarem ambiente incompleto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 500

**Fonte:** `      - name: Exigir execução e sucesso de todos os gates`

**O que faz:** Define o rótulo humano `Exigir execução e sucesso de todos os gates` dentro de ci-gate.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 501

**Fonte:** `        env:`

**O que faz:** Abre variáveis de ambiente do step em ci-gate.

**Como faz:** GitHub injeta os pares filhos apenas no processo daquele step.

**Por que foi implementado dessa forma:** Escopa flags, resultados de jobs e segredos ao menor trecho necessário.

**Por que uma implementação ingênua seria pior:** Variáveis globais ampliariam superfície de exposição e poderiam alterar jobs não relacionados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 502

**Fonte:** `          VERSION_INTEGRITY: ${{ needs.version-integrity.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `VERSION_INTEGRITY`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 503

**Fonte:** `          SYNTAX_CHECK: ${{ needs.syntax-check.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `SYNTAX_CHECK`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 504

**Fonte:** `          MANIFEST_VALIDATION: ${{ needs.manifest-validation.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `MANIFEST_VALIDATION`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 505

**Fonte:** `          CI_CONTRACT: ${{ needs.ci-contract.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `CI_CONTRACT`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 506

**Fonte:** `          SMOKE: ${{ needs.smoke.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `SMOKE`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 507

**Fonte:** `          VISUAL: ${{ needs.visual.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `VISUAL`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 508

**Fonte:** `          UNIT_INTEGRATION: ${{ needs.unit-and-integration.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `UNIT_INTEGRATION`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 509

**Fonte:** `          COVERAGE: ${{ needs.coverage.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `COVERAGE`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 510

**Fonte:** `          E2E_SHARDS: ${{ needs.e2e-shard.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `E2E_SHARDS`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 511

**Fonte:** `          E2E: ${{ needs.e2e.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `E2E`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 512

**Fonte:** `          FULL_DIAGNOSTICS_REQUIRED: ${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}`

**O que faz:** Calcula se diagnósticos pesados são obrigatórios neste evento.

**Como faz:** É verdadeiro em `workflow_dispatch` ou push da main e falso em PR comum.

**Por que foi implementado dessa forma:** Permite que os mesmos jobs estejam em `needs` sem penalizar skips intencionais de PR.

**Por que uma implementação ingênua seria pior:** Sem essa flag, o gate teria de aceitar qualquer `skipped`, o que poderia mascarar omissões indevidas.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 513

**Fonte:** `          JEST_WORKER_DIAGNOSTIC: ${{ needs.jest-worker-diagnostic.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `JEST_WORKER_DIAGNOSTIC`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 514

**Fonte:** `          FOCUSED_PROJECT_LEAK: ${{ needs.focused-project-leak-diagnostic.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `FOCUSED_PROJECT_LEAK`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 515

**Fonte:** `          BACKGROUND_LEAK_BISECTION: ${{ needs.background-leak-bisection.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `BACKGROUND_LEAK_BISECTION`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 516

**Fonte:** `          WINDOWS_PORTABILITY: ${{ needs.windows-portability.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `WINDOWS_PORTABILITY`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 517

**Fonte:** `          FRESH_DEVELOPER_FLOW: ${{ needs.fresh-developer-flow.result }}`

**O que faz:** Mapeia o resultado de um job anterior para a variável shell `FRESH_DEVELOPER_FLOW`.

**Como faz:** GitHub resolve `needs.<job>.result` antes de iniciar o step.

**Por que foi implementado dessa forma:** A função `check` trabalha com strings simples e pode avaliar todos os resultados uniformemente.

**Por que uma implementação ingênua seria pior:** Consultar resultados de forma ad hoc dentro do shell aumentaria repetição e risco de referenciar o job errado.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 518

**Fonte:** `        run: |`

**O que faz:** Abre um script shell multilinha do bloco ci-gate.

**Como faz:** As linhas indentadas seguintes formam um único comando com estado/variáveis locais compartilhados.

**Por que foi implementado dessa forma:** A lógica precisa de condicionais, contagem ou função auxiliar que ficaria ilegível em uma única linha.

**Por que uma implementação ingênua seria pior:** Fragmentar em steps separados perderia variáveis shell locais ou exigiria outputs artificiais.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 519

**Fonte:** `          failed=0`

**O que faz:** Inicializa acumulador de falha do gate em zero.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 520

**Fonte:** `          check() {`

**O que faz:** Declara a função shell `check` reutilizada para cada resultado.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 521

**Fonte:** `            name="$1"`

**O que faz:** Captura o nome humano do gate no primeiro argumento.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 522

**Fonte:** `            result="$2"`

**O que faz:** Captura o resultado GitHub (`success`, `failure`, `skipped`, etc.) no segundo argumento.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 523

**Fonte:** `            if [ "$result" != "success" ]; then`

**O que faz:** Compara o resultado com o único valor aceito, `success`.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 524

**Fonte:** `              echo "::error::$name terminou como '$result'; CI Gate exige 'success'."`

**O que faz:** Emite anotação GitHub `::error::` quando o resultado não é sucesso.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 525

**Fonte:** `              failed=1`

**O que faz:** Marca o acumulador para saída não zero.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 526

**Fonte:** `            else`

**O que faz:** Abre o ramo de sucesso.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 527

**Fonte:** `              echo "✅ $name = success"`

**O que faz:** Registra confirmação legível do gate aprovado.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 528

**Fonte:** `            fi`

**O que faz:** Fecha o `if` interno.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 529

**Fonte:** `          }`

**O que faz:** Fecha a função `check`.

**Como faz:** A função converte resultados declarativos de `needs.*.result` em um único código de saída acumulado.

**Por que foi implementado dessa forma:** Permite avaliar todos os gates e relatar múltiplas falhas numa única passagem, em vez de abortar no primeiro problema.

**Por que uma implementação ingênua seria pior:** Encadear `&&` perderia diagnóstico depois da primeira falha; aceitar `skipped` como sucesso permitiria omissão silenciosa de gates obrigatórios.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 530

**Fonte:** `          check "Version Integrity" "$VERSION_INTEGRITY"`

**O que faz:** Valida o resultado de Version Integrity como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 531

**Fonte:** `          check "JS Syntax Check" "$SYNTAX_CHECK"`

**O que faz:** Valida o resultado de JS Syntax Check como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 532

**Fonte:** `          check "Manifest Validation" "$MANIFEST_VALIDATION"`

**O que faz:** Valida o resultado de Manifest Validation como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 533

**Fonte:** `          check "CI Contract" "$CI_CONTRACT"`

**O que faz:** Valida o resultado de CI Contract como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 534

**Fonte:** `          check "Smoke Tests" "$SMOKE"`

**O que faz:** Valida o resultado de Smoke Tests como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 535

**Fonte:** `          check "Visual Tests" "$VISUAL"`

**O que faz:** Valida o resultado de Visual Tests como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 536

**Fonte:** `          check "Unit + Integration" "$UNIT_INTEGRATION"`

**O que faz:** Valida o resultado de Unit + Integration como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 537

**Fonte:** `          check "Code Coverage" "$COVERAGE"`

**O que faz:** Valida o resultado de Code Coverage como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 538

**Fonte:** `          check "E2E Shards" "$E2E_SHARDS"`

**O que faz:** Valida o resultado de E2E Shards como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 539

**Fonte:** `          check "E2E Tests" "$E2E"`

**O que faz:** Valida o resultado de E2E Tests como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 540

**Fonte:** `          check "Windows Portability" "$WINDOWS_PORTABILITY"`

**O que faz:** Valida o resultado de Windows Portability como obrigatório neste evento.

**Como faz:** Passa o valor capturado de `needs.*.result` à função `check`.

**Por que foi implementado dessa forma:** Esses gates são sempre exigidos pelo agregador em execuções não canceladas.

**Por que uma implementação ingênua seria pior:** Omitir qualquer um permitiria CI Gate verde mesmo com job funcional falho ou skipped.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 541

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de ci-gate do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 542

**Fonte:** `          if [ "$FULL_DIAGNOSTICS_REQUIRED" = "true" ]; then`

**O que faz:** Abre condição que exige diagnósticos pesados apenas em execução manual ou push da main.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 543

**Fonte:** `            echo "🔒 Verificação completa pós-merge/manual: diagnósticos pesados são obrigatórios."`

**O que faz:** Registra no log que a verificação completa está ativa.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 544

**Fonte:** `            check "Jest Worker Diagnostic" "$JEST_WORKER_DIAGNOSTIC"`

**O que faz:** Exige sucesso do diagnóstico geral de workers Jest.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 545

**Fonte:** `            check "Focused Project Leak" "$FOCUSED_PROJECT_LEAK"`

**O que faz:** Exige sucesso do conjunto focal de projetos/leaks.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 546

**Fonte:** `            check "Background Leak Bisection" "$BACKGROUND_LEAK_BISECTION"`

**O que faz:** Exige sucesso da bisseção de leak de background.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 547

**Fonte:** `          else`

**O que faz:** Abre ramo dos eventos em que diagnósticos são deliberadamente opcionais/skipped.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 548

**Fonte:** `            echo "ℹ️ Diagnósticos pesados não são obrigatórios neste evento; serão obrigatórios em push para main."`

**O que faz:** Registra que PR comum não precisa desses diagnósticos e que main os exigirá.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 549

**Fonte:** `          fi`

**O que faz:** Fecha a condição dos diagnósticos.

**Como faz:** A flag `FULL_DIAGNOSTICS_REQUIRED` foi derivada do evento e impede que jobs intencionalmente skipped em PR derrubem o gate.

**Por que foi implementado dessa forma:** Equilibra custo no PR com obrigação forte pós-merge/manual.

**Por que uma implementação ingênua seria pior:** Exigir diagnósticos em todo PR aumentaria muito a carga; ignorá-los também na main permitiria leak regressar sem bloqueio pós-merge.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 550

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de ci-gate do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 551

**Fonte:** `          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then`

**O que faz:** Abre condição específica para `workflow_dispatch`.

**Como faz:** Compara `github.event_name` no shell e só chama `check` quando o job deveria ter rodado.

**Por que foi implementado dessa forma:** Evita tratar `skipped` como falha em PR/push onde o job é intencionalmente condicionado.

**Por que uma implementação ingênua seria pior:** Checar sempre faria todos os runs automáticos falharem por `skipped`; nunca checar removeria a garantia manual.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 552

**Fonte:** `            echo "🔒 workflow_dispatch: fluxo completo de desenvolvedor novo é obrigatório."`

**O que faz:** Registra que o fluxo limpo de novo desenvolvedor é obrigatório no manual.

**Como faz:** Compara `github.event_name` no shell e só chama `check` quando o job deveria ter rodado.

**Por que foi implementado dessa forma:** Evita tratar `skipped` como falha em PR/push onde o job é intencionalmente condicionado.

**Por que uma implementação ingênua seria pior:** Checar sempre faria todos os runs automáticos falharem por `skipped`; nunca checar removeria a garantia manual.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 553

**Fonte:** `            check "Fresh Developer Flow" "$FRESH_DEVELOPER_FLOW"`

**O que faz:** Exige sucesso de `Fresh Developer Flow` no disparo manual.

**Como faz:** Compara `github.event_name` no shell e só chama `check` quando o job deveria ter rodado.

**Por que foi implementado dessa forma:** Evita tratar `skipped` como falha em PR/push onde o job é intencionalmente condicionado.

**Por que uma implementação ingênua seria pior:** Checar sempre faria todos os runs automáticos falharem por `skipped`; nunca checar removeria a garantia manual.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 554

**Fonte:** `          else`

**O que faz:** Abre ramo de eventos automáticos.

**Como faz:** Compara `github.event_name` no shell e só chama `check` quando o job deveria ter rodado.

**Por que foi implementado dessa forma:** Evita tratar `skipped` como falha em PR/push onde o job é intencionalmente condicionado.

**Por que uma implementação ingênua seria pior:** Checar sempre faria todos os runs automáticos falharem por `skipped`; nunca checar removeria a garantia manual.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 555

**Fonte:** `            echo "ℹ️ Fresh Developer Flow é exercitado no workflow_dispatch pré-revisão."`

**O que faz:** Explica que o fluxo completo fica reservado ao `workflow_dispatch`.

**Como faz:** Compara `github.event_name` no shell e só chama `check` quando o job deveria ter rodado.

**Por que foi implementado dessa forma:** Evita tratar `skipped` como falha em PR/push onde o job é intencionalmente condicionado.

**Por que uma implementação ingênua seria pior:** Checar sempre faria todos os runs automáticos falharem por `skipped`; nunca checar removeria a garantia manual.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 556

**Fonte:** `          fi`

**O que faz:** Fecha a condição do fresh flow.

**Como faz:** Compara `github.event_name` no shell e só chama `check` quando o job deveria ter rodado.

**Por que foi implementado dessa forma:** Evita tratar `skipped` como falha em PR/push onde o job é intencionalmente condicionado.

**Por que uma implementação ingênua seria pior:** Checar sempre faria todos os runs automáticos falharem por `skipped`; nunca checar removeria a garantia manual.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 557

**Fonte:** `⟂ linha em branco`

**O que faz:** Linha em branco que separa visualmente o bloco de ci-gate do contexto adjacente.

**Como faz:** YAML ignora a linha vazia; ela só delimita leitura humana e revisão de diff.

**Por que foi implementado dessa forma:** Neste workflow extenso, separação visual reduz o risco de confundir chaves de jobs vizinhos e facilita auditoria manual.

**Por que uma implementação ingênua seria pior:** Removê-la não muda a execução, mas condensar todos os jobs em um bloco contínuo torna revisões e conflitos multiagente mais propensos a erro.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 558

**Fonte:** `          exit "$failed"`

**O que faz:** Termina o shell do gate com o acumulador calculado.

**Como faz:** `exit "$failed"` retorna 0 se todos os requisitos aplicáveis passaram e 1 quando qualquer `check` marcou falha.

**Por que foi implementado dessa forma:** Converte a avaliação agregada em conclusão GitHub do job `CI Gate`.

**Por que uma implementação ingênua seria pior:** Omitir o `exit` faria o shell terminar com o status do último comando informativo e poderia aprovar falhas detectadas anteriormente.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

## 14. Autoauditoria

- SHA da fonte relido do branch: `ebee75820db9bfab618bf3c3016065c5bc857ed7`.
- Fonte integral embutida: 558 linhas/posições, sem newline terminal.
- Headings `Linha N`: 558/558, sequenciais.
- Dependências cruzadas: `package.json`, `verify-ci-contract.js`, self-test do contrato, gate estrutural, Playwright config/plano/runner/merge, Jest runner e diagnósticos.
- Consumidor nominal cruzado: `recover-cancelled-ci.yml` depende de `MangaTranslator CI`.
- Provas diretas foram limitadas a verificadores que realmente executam/mutam a infraestrutura; markers textuais permanecem classificados como gates estáticos.
- Lacunas de runtime/segurança/timeout/pinning permanecem explícitas.
- Nenhum código funcional foi alterado.

**Estado documental desta materialização:** REVISÃO DE QUALIDADE ativa; a conclusão global ainda depende de reconciliar `AUDITORIA.md`, `STATUS.md` e `CHECKLIST.md` sob o mutex compartilhado.

# Bíblia técnica — .github/workflows/ci.yml

> **Estado:** 🟡 READY_FOR_AUDIT — correção de orquestração E2E aplicada; reauditoria independente pendente  
> **SHA auditado:** `fbc108c255d06257b741839bb19fa56b4e6794b2`  
> **Última auditoria independente válida para o SHA anterior:** AGENTE 3  
> **Tipo:** workflow GitHub Actions / CI  
> **Linhas textuais:** **589**  
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
7. **`e2e` usa `if: always() && !cancelled()`:** continua agregando artifacts após falha normal de shard, mas não executa quando o workflow foi cancelado por um commit superseding; isso evita transformar cancelamento legítimo em `failure` por inventário parcial.
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
- workflow cancelado: nem o agregador `e2e` nem `ci-gate` devem ressuscitar a execução; ambos usam `!cancelled()` para evitar falso vermelho em run superseded.
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
7. ⚠️ A condição `e2e if: always() && !cancelled()` não recebe assertion focal própria; o gate atual protege esse literal no `ci-gate`, não possui assertion focal equivalente para o job agregador `e2e`.
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
7. O agregador E2E deve usar `always() && !cancelled()`, verificar o plano e exigir todos os cinco blob reports antes do merge quando a execução não foi cancelada.
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
      - name: Validar governança do protocolo anti-loop da Bíblia
        run: node scripts/validation/verify-bible-protocol-governance.js
      - name: Provar que remoção de gates anti-loop é rejeitada
        run: node scripts/validation/verify-bible-protocol-governance-selftest.js
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
    if: ${{ always() && !cancelled() }}
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


  bible-final-readiness:
    name: Bible Final Readiness
    if: ${{ (github.event_name == 'pull_request' && github.head_ref == 'docs/project-bible') || (github.event_name == 'push' && github.ref == 'refs/heads/main') || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout código com histórico completo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
      - name: Executar gate final da Bíblia e anti-loop
        run: npm run bible:final-readiness


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
      - bible-final-readiness
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
          BIBLE_FINAL_REQUIRED: ${{ (github.event_name == 'pull_request' && github.head_ref == 'docs/project-bible') || (github.event_name == 'push' && github.ref == 'refs/heads/main') || github.event_name == 'workflow_dispatch' }}
          BIBLE_FINAL_READINESS: ${{ needs.bible-final-readiness.result }}
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

          if [ "$BIBLE_FINAL_REQUIRED" = "true" ]; then
            echo "🔒 Bible lifecycle/final readiness é obrigatório para esta revisão."
            check "Bible Final Readiness" "$BIBLE_FINAL_READINESS"
          else
            echo "ℹ️ Bible Final Readiness não se aplica a esta PR."
          fi

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

**O que faz:** Materializa o commit do evento no workspace do job `version-integrity`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `version-integrity` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `version-integrity` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `version-integrity`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `version-integrity` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `version-integrity`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `version-integrity` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `version-integrity` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

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

**O que faz:** Materializa o commit do evento no workspace do job `syntax-check`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `syntax-check` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `syntax-check` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `syntax-check`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `syntax-check` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `syntax-check`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `syntax-check` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `syntax-check` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

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

**O que faz:** Materializa o commit do evento no workspace do job `manifest-validation`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `manifest-validation` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `manifest-validation` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `manifest-validation`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `manifest-validation` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `manifest-validation`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `manifest-validation` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `manifest-validation` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

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

**O que faz:** Materializa o commit do evento no workspace do job `ci-contract`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `ci-contract` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `ci-contract` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `ci-contract`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `ci-contract` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `ci-contract`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `ci-contract` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `ci-contract` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

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

**O que faz:** Declara o job `smoke`, dedicado à suíte rápida de fumaça do repositório.

**Como faz:** A chave `smoke` cria uma unidade de job independente; depois do checkout/setup/`npm ci`, ela executa `npm run test:smoke`, e o `ci-gate` consome `needs.smoke.result`.

**Por que foi implementado dessa forma:** Separar smoke de Jest/visual preserva um sinal rápido e identificável de regressões básicas e permite que ele rode em paralelo com gates mais caros.

**Por que uma implementação ingênua seria pior:** Misturar smoke com outra suíte esconderia qual camada mínima quebrou, reduziria paralelismo e poderia fazer uma falha rápida esperar por testes muito mais lentos.

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

**O que faz:** Materializa o commit do evento no workspace do job `smoke`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `smoke` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `smoke` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `smoke`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `smoke` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `smoke`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `smoke` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `smoke` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 97

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `smoke`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `smoke` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 98

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `smoke` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Declara o job `visual`, responsável pela suíte visual/perceptual executada por `npm run test:visual`.

**Como faz:** A chave cria um job Linux próprio, com checkout, Node 20, cache npm e instalação limpa antes de chamar o runner visual versionado no `package.json`.

**Por que foi implementado dessa forma:** Os testes visuais têm finalidade e runner diferentes do Jest e do Playwright E2E; um job separado mantém sua falha observável e paralelizável.

**Por que uma implementação ingênua seria pior:** Acoplar os visuais ao job Jest ou smoke tornaria logs ambíguos, aumentaria tempo crítico e facilitaria que uma alteração em um runner mascarasse a ausência do outro.

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

**O que faz:** Materializa o commit do evento no workspace do job `visual`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `visual` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `visual` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `visual`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `visual` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `visual`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `visual` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `visual` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 114

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `visual`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `visual` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 115

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `visual` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Impede que uma falha em uma combinação da matriz de `unit-and-integration` cancele automaticamente as demais.

**Como faz:** A estratégia do GitHub continua as outras combinações e preserva seus resultados individuais.

**Por que foi implementado dessa forma:** As versões Node devem ser avaliadas independentemente para distinguir regressão geral de incompatibilidade específica.

**Por que uma implementação ingênua seria pior:** Com fail-fast ativo, o primeiro vermelho poderia cancelar casos ainda úteis e reduzir a informação disponível para triagem.

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

**O que faz:** Seleciona Node.js `[20.x, 22.x]` no job `unit-and-integration`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** A matriz cobre Node 20.x e 22.x para detectar incompatibilidades do Jest/tooling entre LTSs.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `unit-and-integration` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

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

**O que faz:** Materializa o commit do evento no workspace do job `unit-and-integration`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `unit-and-integration` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `unit-and-integration` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `unit-and-integration`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `unit-and-integration` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `${{ matrix.node-version }}` no job `unit-and-integration`.

**Como faz:** O valor é input de `setup-node`; cada expansão da matriz recebe sua própria versão.

**Por que foi implementado dessa forma:** A matriz cobre Node 20.x e 22.x para detectar incompatibilidades do Jest/tooling entre LTSs.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `unit-and-integration` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 135

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `unit-and-integration`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `unit-and-integration` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 136

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `unit-and-integration` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Materializa o commit do evento no workspace do job `coverage`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `coverage` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `coverage` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `coverage`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `coverage` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `coverage`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `coverage` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `coverage` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 152

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `coverage`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `coverage` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 153

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `coverage` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Fixa Bash como shell do step que detecta a disponibilidade do `CODECOV_TOKEN`.

**Como faz:** GitHub executa as linhas 165–172 em Bash, garantindo suporte consistente a `[ -n ... ]`, redirecionamento `>> "$GITHUB_OUTPUT"` e quoting de variáveis.

**Por que foi implementado dessa forma:** A detecção depende de sintaxe shell explícita e produz um output consumido pelo `if` do upload Codecov; fixar Bash elimina ambiguidade sobre o interpretador.

**Por que uma implementação ingênua seria pior:** Deixar o shell implícito pode mudar a semântica entre runners ou futuras imagens; usar sintaxe incompatível poderia marcar Codecov como habilitado/desabilitado incorretamente.

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

**O que faz:** Abre o ramo executado quando `CODECOV_TOKEN` está vazio.

**Como faz:** O `else` é pareado com `if [ -n "$CODECOV_TOKEN" ]`; nele o step grava `enabled=false` e emite um notice explícito de que o upload externo foi pulado.

**Por que foi implementado dessa forma:** Ausência de credencial é uma condição suportada, especialmente em contextos sem secrets; ela deve ser distinguida de falha do coverage local.

**Por que uma implementação ingênua seria pior:** Tratar token ausente como erro quebraria execuções legítimas; seguir como se estivesse habilitado provocaria tentativa externa inútil e diagnóstico enganoso.

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

**O que faz:** Conditiona o upload Codecov à presença do token detectada pelo step `codecov`.

**Como faz:** A expressão lê `steps.codecov.outputs.enabled`; somente a string `true` cria o step de upload.

**Por que foi implementado dessa forma:** Evita chamada externa inválida em forks/ambientes sem secret, mantendo coverage local como gate independente.

**Por que uma implementação ingênua seria pior:** Sem a condição, ausência de token geraria ruído/falha externa; condicionar o coverage local ao token enfraqueceria o gate.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` protege a política Codecov relevante; não é prova de disponibilidade do serviço externo.

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

**O que faz:** Executa o warning somente quando Codecov estava habilitado e o step de upload terminou com `outcome == failure`.

**Como faz:** Combina o output de habilitação com o outcome preservado apesar de `continue-on-error`.

**Por que foi implementado dessa forma:** Distingue indisponibilidade externa de falha dos testes e torna o problema visível sem bloquear qualidade local.

**Por que uma implementação ingênua seria pior:** Um warning incondicional geraria falso alarme; ignorar outcome ocultaria falha do dashboard.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` protege a política Codecov relevante; não é prova de disponibilidade do serviço externo.

### Linha 186

**Fonte:** `        run: echo "::warning::Codecov upload FAILED — o gate local de coverage já passou, mas o dashboard externo não foi atualizado."`

**O que faz:** Emite uma annotation `::warning::` explicando que o upload Codecov falhou depois de o gate local ter passado.

**Como faz:** O comando `echo` usa a sintaxe de workflow command do GitHub Actions para registrar warning no run.

**Por que foi implementado dessa forma:** Preserva observabilidade da integração externa sem converter o serviço terceiro em autoridade de aprovação.

**Por que uma implementação ingênua seria pior:** Silenciar a falha faria o dashboard ficar stale sem pista; usar `exit 1` aqui contrariaria a decisão de manter Codecov não bloqueante.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` protege a política Codecov relevante; não é prova de disponibilidade do serviço externo.

### Linha 187

**Fonte:** `      - name: Salvar relatório HTML de cobertura`

**O que faz:** Define o rótulo humano `Salvar relatório HTML de cobertura` dentro de coverage.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 188

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica o artifact produzido pelo job `coverage`.

**Como faz:** A action lê nome/path/retenção nas linhas filhas e transfere os arquivos para armazenamento do run antes da VM ser destruída.

**Por que foi implementado dessa forma:** Preserva o relatório HTML/local de coverage para inspeção humana.

**Por que uma implementação ingênua seria pior:** Sem upload, resultados gerados no filesystem efêmero desapareceriam no fim do job; tornar o upload bloqueante poderia confundir falha auxiliar com falha do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 189

**Fonte:** `        if: always()`

**O que faz:** Faz o upload do relatório de coverage ser tentado mesmo se um step anterior do job falhar.

**Como faz:** `if: always()` sobrepõe a condição implícita `success()` do step de artifact.

**Por que foi implementado dessa forma:** Artifacts de coverage podem ser úteis justamente para diagnosticar uma falha anterior.

**Por que uma implementação ingênua seria pior:** Deixar a condição padrão perderia o relatório em falhas; aplicar `always()` indiscriminadamente a comandos funcionais poderia mascarar fluxo de controle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: condição de artifact/suporte sem assertion focal específica.

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

**O que faz:** Impede que uma falha em uma combinação da matriz de `e2e-shard` cancele automaticamente as demais.

**Como faz:** A estratégia do GitHub continua as outras combinações e preserva seus resultados individuais.

**Por que foi implementado dessa forma:** Todos os cinco grupos precisam deixar evidência; uma falha em um não deve esconder o estado dos outros quatro.

**Por que uma implementação ingênua seria pior:** Com fail-fast ativo, o primeiro vermelho poderia cancelar casos ainda úteis e reduzir a informação disponível para triagem.

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

**O que faz:** Materializa o commit do evento no workspace do job `e2e-shard`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `e2e-shard` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `e2e-shard` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `e2e-shard`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `e2e-shard` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `e2e-shard`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `e2e-shard` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `e2e-shard` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 210

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `e2e-shard`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `e2e-shard` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 211

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `e2e-shard` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Define `CI=true` para o processo E2E do shard.

**Como faz:** O ambiente chega ao Playwright config, ativando workers/retries/reporters de CI.

**Por que foi implementado dessa forma:** Garante que o shard use zero retries e o reporter blob apropriado ao modo CI/shard.

**Por que uma implementação ingênua seria pior:** Sem `CI`, o Playwright poderia usar configuração local e não produzir a evidência esperada para merge.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: a variável é consumida pelo stack Playwright/runner, mas não há assertion focal para este valor exato no YAML.

### Linha 220

**Fonte:** `          MANGA_E2E_BROWSER_MODE: stealth`

**O que faz:** Seleciona o modo de navegador E2E `stealth` para o runner de grupo.

**Como faz:** A variável é herdada pelo script npm/Playwright e orienta o modo específico usado pelos testes da extensão.

**Por que foi implementado dessa forma:** Mantém o modo de execução esperado pelos cenários E2E atuais sem hardcodá-lo dentro dos testes.

**Por que uma implementação ingênua seria pior:** Omitir ou alterar a flag pode fazer o E2E exercitar um modo diferente daquele balanceado/validado pelo plano.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: a variável é consumida pelo stack Playwright/runner, mas não há assertion focal para este valor exato no YAML.

### Linha 221

**Fonte:** `          MANGA_E2E_SHARD: '1'`

**O que faz:** Marca explicitamente que esta execução Playwright é um shard lógico do plano.

**Como faz:** `MANGA_E2E_SHARD='1'` faz `playwright.config.js` escolher reporter `blob` em vez do gate reporter global.

**Por que foi implementado dessa forma:** Cada VM precisa produzir blob mergeável, enquanto a validação global só deve ocorrer após reunir todos os grupos.

**Por que uma implementação ingênua seria pior:** Usar o reporter global dentro de cada shard validaria subconjuntos isolados e impediria o merge como fonte de verdade.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` exige `MANGA_E2E_SHARD: '1'` no bloco de shards.

### Linha 222

**Fonte:** `      - name: Upload blob report do shard`

**O que faz:** Define o rótulo humano `Upload blob report do shard` dentro de e2e-shard.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no carregamento YAML/execução do bloco; sem assertion focal desta linha isolada.

### Linha 223

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica o artifact produzido pelo job `e2e-shard`.

**Como faz:** A action lê nome/path/retenção nas linhas filhas e transfere os arquivos para armazenamento do run antes da VM ser destruída.

**Por que foi implementado dessa forma:** Transporta blob report ou evidência de falha do shard para agregação/diagnóstico.

**Por que uma implementação ingênua seria pior:** Sem upload, resultados gerados no filesystem efêmero desapareceriam no fim do job; tornar o upload bloqueante poderia confundir falha auxiliar com falha do teste.

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

**O que faz:** Publica o artifact produzido pelo job `e2e-shard`.

**Como faz:** A action lê nome/path/retenção nas linhas filhas e transfere os arquivos para armazenamento do run antes da VM ser destruída.

**Por que foi implementado dessa forma:** Transporta blob report ou evidência de falha do shard para agregação/diagnóstico.

**Por que uma implementação ingênua seria pior:** Sem upload, resultados gerados no filesystem efêmero desapareceriam no fim do job; tornar o upload bloqueante poderia confundir falha auxiliar com falha do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o passo é materializado pelo GitHub Actions quando o job roda, mas não há assertion focal neste repositório que fixe exatamente esta referência de action.

### Linha 232

**Fonte:** `        if: failure()`

**O que faz:** Executa o upload de artifacts detalhados apenas quando o shard termina em falha.

**Como faz:** `failure()` é a função de status do GitHub Actions aplicada ao step.

**Por que foi implementado dessa forma:** Reduz armazenamento em runs verdes e preserva screenshots/videos/traces quando há algo para investigar.

**Por que uma implementação ingênua seria pior:** Upload sempre ativo aumenta custo; upload apenas em sucesso perde justamente os dados de diagnóstico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: condição de artifact/suporte sem assertion focal específica.

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

**O que faz:** Declara o job agregador `e2e`, que valida o plano, reúne os cinco blob reports e aplica o gate global do Playwright.

**Como faz:** O job depende de `e2e-shard`, roda com `if: always() && !cancelled()`, baixa artifacts do mesmo SHA, exige exatamente cinco ZIPs e chama `playwright merge-reports` com a configuração de gate. Falhas normais de shard ainda permitem a agregação; cancelamento do workflow impede o job.

**Por que foi implementado dessa forma:** Os shards executam subconjuntos independentes; uma etapa agregada é necessária para provar cobertura do conjunto e avaliar o resultado combinado sem tratar cada shard como universo completo.

**Por que uma implementação ingênua seria pior:** Considerar cada shard isoladamente poderia deixar um artifact ausente, duplicação entre grupos ou falha de merge sem um único check global que represente o E2E inteiro.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 242

**Fonte:** `    name: E2E Tests (Playwright)`

**O que faz:** Define o rótulo humano `E2E Tests (Playwright)` dentro de e2e agregado.

**Como faz:** GitHub exibe esse texto na lista de jobs/steps, sem alterar o comando executado.

**Por que foi implementado dessa forma:** Rótulos específicos tornam logs e falhas pesquisáveis por responsabilidade.

**Por que uma implementação ingênua seria pior:** Nomes genéricos como “Run tests” escondem qual contrato estava sendo validado e pioram triagem.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 243

**Fonte:** `    if: ${{ always() && !cancelled() }}`

**O que faz:** Aplica condição GitHub Expression ao bloco e2e agregado: ` ${{ always() && !cancelled() }}`; o job continua após falha normal de shard para agregar evidências, mas não ressuscita um workflow cancelado.

**Como faz:** O job/step é marcado para execução ou skip antes de iniciar conforme evento/resultados.

**Por que foi implementado dessa forma:** Distingue gates obrigatórios de PR dos diagnósticos pesados/manual/pós-merge e preserva steps de artifact em falha.

**Por que uma implementação ingênua seria pior:** Executar tudo em todo PR aumenta custo; pular condições críticas pode mascarar falha ou perder artefatos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: permite que o agregador E2E rode após shard falhar/ser skipped, mas não após cancelamento do workflow; ainda não há assertion focal específica desse literal no `verify-ci-contract.js`.

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

**O que faz:** Materializa o commit do evento no workspace do job `e2e`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `e2e` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `e2e` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `e2e`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `e2e` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `e2e`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `e2e` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `e2e` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 254

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `e2e`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `e2e` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 255

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `e2e` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Mescla os cinco blob reports Playwright e executa o reporter de gate global configurado em `scripts/ci/playwright-merge.config.js`.

**Como faz:** `playwright merge-reports` lê `all-blob-reports`, usa a config de merge e produz avaliação unificada.

**Por que foi implementado dessa forma:** A aprovação E2E precisa considerar o inventário completo, retries/flaky e estados terminais após reunir todos os shards.

**Por que uma implementação ingênua seria pior:** Avaliar cada shard isoladamente pode deixar duplicações/omissões ou flakiness global escaparem; concatenar logs não reproduz semântica do reporter.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o contrato exige `merge-reports` + `playwright-merge.config.js`; o reporter global possui self-test separado contra retries/flaky.

### Linha 273

**Fonte:** `        env:`

**O que faz:** Abre variáveis de ambiente do step em e2e agregado.

**Como faz:** GitHub injeta os pares filhos apenas no processo daquele step.

**Por que foi implementado dessa forma:** Escopa flags, resultados de jobs e segredos ao menor trecho necessário.

**Por que uma implementação ingênua seria pior:** Variáveis globais ampliariam superfície de exposição e poderiam alterar jobs não relacionados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 274

**Fonte:** `          CI: true`

**O que faz:** Define `CI=true` durante o merge dos relatórios Playwright.

**Como faz:** O reporter carregado pelo merge lê o ambiente de CI e aplica o comportamento de gate correspondente.

**Por que foi implementado dessa forma:** Mantém a etapa agregada no mesmo modo de política usado pelos shards/CI.

**Por que uma implementação ingênua seria pior:** Sem a flag, reporter/config podem escolher comportamento local e reduzir a força do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: a variável é consumida pelo stack Playwright/runner, mas não há assertion focal para este valor exato no YAML.

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

**O que faz:** Impede que uma falha em uma combinação da matriz de `jest-worker-diagnostic` cancele automaticamente as demais.

**Como faz:** A estratégia do GitHub continua as outras combinações e preserva seus resultados individuais.

**Por que foi implementado dessa forma:** Diagnóstico de leak precisa observar vários recortes mesmo quando um reproduz o problema.

**Por que uma implementação ingênua seria pior:** Com fail-fast ativo, o primeiro vermelho poderia cancelar casos ainda úteis e reduzir a informação disponível para triagem.

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

**O que faz:** Materializa o commit do evento no workspace do job `jest-worker-diagnostic`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `jest-worker-diagnostic` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `jest-worker-diagnostic` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `jest-worker-diagnostic`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `jest-worker-diagnostic` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `jest-worker-diagnostic`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `jest-worker-diagnostic` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `jest-worker-diagnostic` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 310

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `jest-worker-diagnostic`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `jest-worker-diagnostic` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 311

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `jest-worker-diagnostic` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Garante tentativa de publicação do diagnóstico Jest mesmo quando o comando de diagnóstico falha.

**Como faz:** `always()` faz o step de artifact rodar independentemente do status anterior.

**Por que foi implementado dessa forma:** Uma reprodução de leak é uma falha esperada de investigação e precisa deixar logs/JSON disponíveis.

**Por que uma implementação ingênua seria pior:** Condição padrão `success()` descartaria a evidência exatamente quando mais necessária.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: artifacts usam `always()` para sobreviver à falha anterior; não há self-test focal desse literal.

### Linha 318

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica o artifact produzido pelo job `jest-worker-diagnostic`.

**Como faz:** A action lê nome/path/retenção nas linhas filhas e transfere os arquivos para armazenamento do run antes da VM ser destruída.

**Por que foi implementado dessa forma:** Preserva JSON/logs de diagnóstico de worker/leak mesmo quando o comando bloqueante falha.

**Por que uma implementação ingênua seria pior:** Sem upload, resultados gerados no filesystem efêmero desapareceriam no fim do job; tornar o upload bloqueante poderia confundir falha auxiliar com falha do teste.

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

**O que faz:** Abre uma lista multilinha de paths que compõem o artifact do caso Jest.

**Como faz:** YAML literal `|` passa três padrões de arquivo à action de upload.

**Por que foi implementado dessa forma:** Agrupa resumo agregado, resumo por caso e log bruto em um único artifact correlacionado.

**Por que uma implementação ingênua seria pior:** Publicar só um formato pode perder dados estruturados ou contexto textual necessário para depuração.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 323

**Fonte:** `            .ci-results/jest-worker-diagnostic-${{ matrix.case }}.json`

**O que faz:** Inclui o resumo agregado `.ci-results/jest-worker-diagnostic-${{ matrix.case }}.json`.

**Como faz:** O path interpola `matrix.case`, coincidindo com o arquivo escrito pelo diagnosticador quando há filtro.

**Por que foi implementado dessa forma:** Fornece uma visão compacta do caso diretamente na raiz de `.ci-results`.

**Por que uma implementação ingênua seria pior:** Usar nome sem o caso faria matrizes concorrentes procurar/colidir no arquivo errado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 324

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.json`

**O que faz:** Inclui o JSON detalhado do caso dentro de `.ci-results/jest-worker-diagnostic/`.

**Como faz:** O diagnosticador grava metadados como status, worker exit, duração e linhas relevantes nesse arquivo.

**Por que foi implementado dessa forma:** Preserva dados estruturados para inspeção/máquina além do resumo agregado.

**Por que uma implementação ingênua seria pior:** Publicar apenas log textual dificulta comparação automatizada entre casos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 325

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.log`

**O que faz:** Inclui o log bruto do caso Jest no artifact.

**Como faz:** O arquivo `.log` contém stdout/stderr e metadados do processo correspondente à matriz.

**Por que foi implementado dessa forma:** Permite investigar mensagens não preservadas no resumo JSON e confirmar o contexto do worker leak.

**Por que uma implementação ingênua seria pior:** Somente o JSON pode omitir detalhes diagnósticos que depois se tornam relevantes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

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

**O que faz:** Impede que uma falha em uma combinação da matriz de `focused-project-leak-diagnostic` cancele automaticamente as demais.

**Como faz:** A estratégia do GitHub continua as outras combinações e preserva seus resultados individuais.

**Por que foi implementado dessa forma:** Diagnóstico de leak precisa observar vários recortes mesmo quando um reproduz o problema.

**Por que uma implementação ingênua seria pior:** Com fail-fast ativo, o primeiro vermelho poderia cancelar casos ainda úteis e reduzir a informação disponível para triagem.

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

**O que faz:** Materializa o commit do evento no workspace do job `focused-project-leak-diagnostic`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `focused-project-leak-diagnostic` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `focused-project-leak-diagnostic` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `focused-project-leak-diagnostic`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `focused-project-leak-diagnostic` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `focused-project-leak-diagnostic`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `focused-project-leak-diagnostic` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `focused-project-leak-diagnostic` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 355

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `focused-project-leak-diagnostic`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `focused-project-leak-diagnostic` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 356

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `focused-project-leak-diagnostic` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Publica artifacts do diagnóstico focal mesmo quando o caso reproduz leak/falha.

**Como faz:** `always()` ignora o status anterior apenas para o step auxiliar de upload.

**Por que foi implementado dessa forma:** Falha é o evento que demanda evidência persistente.

**Por que uma implementação ingênua seria pior:** Sem `always()`, o job bloquearia corretamente mas perderia logs que explicam por quê.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: artifacts usam `always()` para sobreviver à falha anterior; não há self-test focal desse literal.

### Linha 363

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica o artifact produzido pelo job `focused-project-leak-diagnostic`.

**Como faz:** A action lê nome/path/retenção nas linhas filhas e transfere os arquivos para armazenamento do run antes da VM ser destruída.

**Por que foi implementado dessa forma:** Preserva JSON/logs de diagnóstico de worker/leak mesmo quando o comando bloqueante falha.

**Por que uma implementação ingênua seria pior:** Sem upload, resultados gerados no filesystem efêmero desapareceriam no fim do job; tornar o upload bloqueante poderia confundir falha auxiliar com falha do teste.

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

**O que faz:** Abre a lista multilinha de arquivos do artifact do diagnóstico focal.

**Como faz:** O literal YAML entrega os três paths seguintes ao uploader.

**Por que foi implementado dessa forma:** Mantém o mesmo pacote de evidência do diagnóstico Jest amplo para cada caso focal.

**Por que uma implementação ingênua seria pior:** Uma lista incompleta dificultaria comparar diagnóstico amplo e focal.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 368

**Fonte:** `            .ci-results/jest-worker-diagnostic-${{ matrix.case }}.json`

**O que faz:** Inclui o resumo agregado do caso focal na raiz de `.ci-results`.

**Como faz:** O nome interpola o mesmo `matrix.case` passado ao diagnosticador.

**Por que foi implementado dessa forma:** Correlaciona artifact e execução sem depender do nome da pasta interna.

**Por que uma implementação ingênua seria pior:** Path fixo poderia apontar para resultado de outro caso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 369

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.json`

**O que faz:** Inclui o JSON detalhado do caso focal na subpasta do diagnosticador.

**Como faz:** O uploader coleta o arquivo criado por `diagnose-jest-workers.js`.

**Por que foi implementado dessa forma:** Expõe campos estruturados de leak/status/duração para este recorte.

**Por que uma implementação ingênua seria pior:** Sem ele restaria apenas log bruto, menos adequado a comparação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 370

**Fonte:** `            .ci-results/jest-worker-diagnostic/${{ matrix.case }}.log`

**O que faz:** Inclui o log bruto do caso focal.

**Como faz:** O arquivo contém saída integral do processo Jest do caso.

**Por que foi implementado dessa forma:** Preserva a evidência textual que o JSON resume.

**Por que uma implementação ingênua seria pior:** Descartar o log reduz capacidade de diagnosticar warnings novos ainda não extraídos pelo script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

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

**O que faz:** Materializa o commit do evento no workspace do job `background-leak-bisection`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `background-leak-bisection` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `background-leak-bisection` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `background-leak-bisection`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `background-leak-bisection` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `background-leak-bisection`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `background-leak-bisection` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `background-leak-bisection` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 385

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `background-leak-bisection`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `background-leak-bisection` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 386

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `background-leak-bisection` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Tenta publicar o resultado da bisseção de leak de background independentemente de sucesso/falha do diagnóstico.

**Como faz:** `always()` mantém o step auxiliar vivo após o comando bloqueante.

**Por que foi implementado dessa forma:** O algoritmo de bisseção gera arquivos úteis inclusive quando confirma um leak e retorna não zero.

**Por que uma implementação ingênua seria pior:** Condição padrão descartaria a trilha da bisseção quando o job mais precisa dela.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: artifacts usam `always()` para sobreviver à falha anterior; não há self-test focal desse literal.

### Linha 398

**Fonte:** `        uses: actions/upload-artifact@v4`

**O que faz:** Publica o artifact produzido pelo job `background-leak-bisection`.

**Como faz:** A action lê nome/path/retenção nas linhas filhas e transfere os arquivos para armazenamento do run antes da VM ser destruída.

**Por que foi implementado dessa forma:** Preserva JSON/logs de diagnóstico de worker/leak mesmo quando o comando bloqueante falha.

**Por que uma implementação ingênua seria pior:** Sem upload, resultados gerados no filesystem efêmero desapareceriam no fim do job; tornar o upload bloqueante poderia confundir falha auxiliar com falha do teste.

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

**O que faz:** Abre a lista multilinha de artifacts da bisseção de background.

**Como faz:** A action de upload recebe o JSON agregado e o diretório completo de logs/iterações.

**Por que foi implementado dessa forma:** A bisseção é multi-etapa; preservar só o último resultado perderia como o conjunto foi reduzido.

**Por que uma implementação ingênua seria pior:** Um único log não representa toda a sequência de probes e pode impedir reprodução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 403

**Fonte:** `            .ci-results/background-leak-diagnostic.json`

**O que faz:** Inclui `.ci-results/background-leak-diagnostic.json`, o resumo agregado da bisseção.

**Como faz:** O script de manutenção escreve nesse caminho canônico resultados e metadados.

**Por que foi implementado dessa forma:** Fornece entrada estruturada para entender conclusão global da busca.

**Por que uma implementação ingênua seria pior:** Sem o resumo seria necessário reconstruir estado a partir de dezenas de logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

### Linha 404

**Fonte:** `            .ci-results/background-leak-diagnostic/`

**O que faz:** Inclui todo o diretório `.ci-results/background-leak-diagnostic/`.

**Como faz:** O uploader recursa pelos logs individuais produzidos por cada probe/bisseção.

**Por que foi implementado dessa forma:** Preserva histórico de subsets, workers, status e stdout/stderr.

**Por que uma implementação ingênua seria pior:** Guardar apenas o resumo remove evidência necessária para auditar por que um conjunto foi escolhido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: estes paths correspondem aos arquivos produzidos pelos diagnosticadores reais, mas não há assertion estática focal de cada path no workflow.

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

**O que faz:** Materializa o commit do evento no workspace do job `windows-portability`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `windows-portability` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `windows-portability` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `windows-portability`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `windows-portability` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `windows-portability`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `windows-portability` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `windows-portability` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 418

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `windows-portability`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `windows-portability` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 419

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `windows-portability` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Materializa o commit do evento no workspace do job `fresh-developer-flow`.

**Como faz:** `actions/checkout@v4` popula `$GITHUB_WORKSPACE` com a revisão que disparou este run.

**Por que foi implementado dessa forma:** Sem esse checkout, `fresh-developer-flow` não teria acesso aos arquivos específicos que precisa validar/executar.

**Por que uma implementação ingênua seria pior:** Executar `fresh-developer-flow` sobre outro SHA ou sem checkout quebraria a correspondência entre o check exibido no PR e o código realmente avaliado.

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

**O que faz:** Prepara Node.js para o job `fresh-developer-flow`.

**Como faz:** `actions/setup-node@v4` ativa a versão indicada no `with` imediatamente abaixo e, quando configurado, integra cache npm.

**Por que foi implementado dessa forma:** O tooling chamado por `fresh-developer-flow` é Node/npm; controlar o runtime evita depender da versão incidental da imagem do runner.

**Por que uma implementação ingênua seria pior:** Confiar no Node pré-instalado pode mudar silenciosamente quando a imagem `*-latest` evolui e produzir divergência entre jobs.

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

**O que faz:** Seleciona Node.js `20.x` no job `fresh-developer-flow`.

**Como faz:** O valor é input de `setup-node`; essa versão fica ativa para os steps Node/npm seguintes.

**Por que foi implementado dessa forma:** `fresh-developer-flow` usa Node 20.x como baseline previsível da CI.

**Por que uma implementação ingênua seria pior:** Deixar a versão implícita faria `fresh-developer-flow` depender da imagem do runner; mudar apenas este job para outra major poderia criar resultados inconsistentes com o restante da pipeline.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 449

**Fonte:** `          cache: npm`

**O que faz:** Habilita cache npm no setup do job `fresh-developer-flow`.

**Como faz:** `setup-node` restaura o cache do gerenciador associado ao lockfile; `npm ci` continua criando a árvore de dependências limpa.

**Por que foi implementado dessa forma:** `fresh-developer-flow` instala dependências em todo run e se beneficia de downloads reaproveitados sem reutilizar `node_modules`.

**Por que uma implementação ingênua seria pior:** Cachear `node_modules` seria mais frágil entre SO/Node; desabilitar cache aumenta tempo e tráfego sem fortalecer o lockfile.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o job correspondente é avaliado pelo GitHub Actions; nenhuma assertion focal adicional foi localizada para esta propriedade exata.

### Linha 450

**Fonte:** `          cache-dependency-path: package-lock.json`

**O que faz:** Amarra a chave de cache npm de `fresh-developer-flow` ao `package-lock.json` canônico da raiz.

**Como faz:** Mudanças no lockfile alteram a chave de cache usada por `setup-node`.

**Por que foi implementado dessa forma:** O repositório foi reestruturado para um único package/lockfile raiz; o cache deve seguir essa fonte de dependências.

**Por que uma implementação ingênua seria pior:** Apontar para um lockfile legado ou não declarar o path pode restaurar cache incoerente com a árvore que `npm ci` precisa instalar.

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

**O que faz:** Define `CI=true` no E2E completo do `fresh-developer-flow`.

**Como faz:** A variável faz `playwright.config.js` aplicar zero retries, workers de CI e gate reporter global.

**Por que foi implementado dessa forma:** O fluxo manual deve simular a disciplina real de CI, não um run local permissivo.

**Por que uma implementação ingênua seria pior:** Sem a flag, retries/config local poderiam permitir um fluxo “novo desenvolvedor” diferente da política automatizada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: a variável é consumida pelo stack Playwright/runner, mas não há assertion focal para este valor exato no YAML.

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

**O que faz:** Executa o entry point oficial `npm test` depois das suítes individuais do fresh flow.

**Como faz:** O script raiz encadeia `test:ci`, smoke e visual conforme `package.json`.

**Por que foi implementado dessa forma:** Prova que a interface documentada para um desenvolvedor novo continua funcional, além de testar componentes isolados.

**Por que uma implementação ingênua seria pior:** Rodar apenas comandos internos pode deixar o entry point principal quebrado mesmo com suas partes verdes.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` exige `run: npm test` no `fresh-developer-flow`.

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

**O que faz:** Declara o job final `ci-gate`, responsável por converter os resultados distribuídos da pipeline em um único veredito agregado.

**Como faz:** O job depende de todos os gates relevantes, executa mesmo após falhas/skips por `always()`, mas não após cancelamento por `!cancelled()`, e a função shell `check` aceita somente `success` quando o gate é aplicável.

**Por que foi implementado dessa forma:** Jobs paralelos precisam de um ponto de convergência que diferencie falha real, skip deliberado por evento e cancelamento de run superseded.

**Por que uma implementação ingênua seria pior:** Sem agregador, um check opcional/skipped poderia confundir a política de merge; um agregador ingênuo com `always()` puro criaria falso vermelho em runs cancelados.

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

**O que faz:** Abre o ramo da função `check` usado quando o resultado do job avaliado é exatamente `success`.

**Como faz:** O `else` pertence ao teste `if [ "$result" != "success" ]`; portanto só é alcançado quando a comparação de desigualdade é falsa.

**Por que foi implementado dessa forma:** Mantém logs positivos explícitos para cada gate sem alterar o acumulador `failed`, permitindo auditar quais dependências foram aceitas.

**Por que uma implementação ingênua seria pior:** Omitir o ramo de sucesso reduziria observabilidade; usar uma condição frouxa como “não failure” poderia aceitar `skipped` ou `cancelled` indevidamente.

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

**O que faz:** Encerra a condicional interna da função `check` depois de tratar os ramos falha e sucesso.

**Como faz:** O `fi` fecha o `if [ "$result" != "success" ]`, garantindo que a próxima invocação de `check` comece sem herdar fluxo condicional aberto.

**Por que foi implementado dessa forma:** A função precisa ser sintaticamente fechada e determinística para avaliar cada resultado de `needs` de forma independente.

**Por que uma implementação ingênua seria pior:** Um fechamento ausente torna o script Bash inválido; um fechamento deslocado poderia fazer validações posteriores dependerem do ramo do gate anterior.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `scripts/validation/verify-ci-contract.js` inspeciona este contrato ou o bloco funcional correspondente e falha quando o marcador obrigatório desaparece/enfraquece.

### Linha 529

**Fonte:** `          }`

**O que faz:** Encerra a definição da função shell `check` que normaliza a avaliação dos resultados dos jobs dependentes.

**Como faz:** A chave `}` fecha a função após nome/result, comparação estrita, marcação de `failed` e logging; as linhas seguintes passam a ser chamadas dessa função, não parte de sua definição.

**Por que foi implementado dessa forma:** Encapsular a regra `result === success` evita repetir lógica divergente para cada gate e mantém um único acumulador de falhas.

**Por que uma implementação ingênua seria pior:** Duplicar a comparação em cada linha aumentaria risco de algum gate usar regra diferente; um fechamento incorreto faria chamadas posteriores serem interpretadas no escopo errado ou quebraria o shell.

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

- SHA da fonte relido do branch: `9ce62e2b116e2204d1689edf9d302e6ee0cf8c3a`.
- Fonte integral embutida: 558 linhas/posições, sem newline terminal.
- Headings `Linha N`: 558/558, sequenciais.
- Dependências cruzadas: `package.json`, `verify-ci-contract.js`, self-test do contrato, gate estrutural, Playwright config/plano/runner/merge, Jest runner e diagnósticos.
- Consumidor nominal cruzado: `recover-cancelled-ci.yml` depende de `MangaTranslator CI`.
- Provas diretas foram limitadas a verificadores que realmente executam/mutam a infraestrutura; markers textuais permanecem classificados como gates estáticos.
- Lacunas de runtime/segurança/timeout/pinning permanecem explícitas.
- Nenhum código funcional foi alterado.

**Estado documental desta materialização:** 🟡 READY_FOR_AUDIT; fonte integral e 558/558 posições foram atualizadas para o novo SHA após a correção `e2e: always() && !cancelled()`. A aprovação anterior permanece histórica e uma reauditoria independente é necessária.

## Cobertura documental de linhas/posições — revisão atual

Cobertura canônica da revisão vigente; mapas anteriores permanecem como contexto histórico.

| Linhas/posição | Escopo | Evidência |
|---:|---|---|
| 1–589 | Blob integral atual `fbc108c255d06257b741839bb19fa56b4e6794b2` (589 linhas textuais + terminador final quando aplicável). | fonte integral embutida + SHA Git do source |

A sincronização documental não reaproveita aprovação anterior: esta revisão requer nova auditoria distribuída.

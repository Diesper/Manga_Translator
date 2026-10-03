# Bíblia técnica — `package.json`

> **Schema da Bíblia:** 2
> **Índice:** 63
> **Fonte:** `package.json`
> **SHA da revisão pendente:** `ec3fb5c66cf49e34108eba1ef995eaf3dce1b304`
> **Posições da fonte:** 121
> **Linhas textuais:** 120
> **Status:** COMPLETED
> **Revisão:** READY_FOR_AUDIT — novas PRIMARY e ADVERSARIAL independentes obrigatórias.

## Mudança e invariantes

A revisão divide os comandos de infraestrutura em 27 aliases Bible e dois aliases de performance. Cada alias Bible executa exatamente um self-test histórico real. Os agregadores preservam ordem, conjunto e propagação de falhas: cada `&&` impede sucesso após falha anterior. A CI distribui esses comandos por famílias coerentes nos dois sistemas; os agregadores continuam sequenciais para uso local.

`test:coverage` mantém `node scripts/ci/run-jest-ci.js --coverage`; coverage verify, thresholds, 57 arquivos instrumentados e todas as assertions permanecem integrais. Mutation continua independente e bloqueante. Performance mantém `--runInBand`, projeto integration e os dois arquivos históricos em comandos separados, sem alterar assertions nem limites. `bible:final-readiness` permanece literalmente igual à revisão anterior e usa os agregadores completos. `test:all` e `validate` continuam complementares; esta revisão não muda Node engines nem instala novas dependências.

## Agregadores e aliases granulares

- `test:bible-protocol:infra`: `npm run test:bible-protocol:audit-history && npm run test:bible-protocol:audit-core-git && npm run test:bible-protocol:engine && npm run test:bible-protocol:pipeline && npm run test:bible-protocol:shards && npm run test:bible-protocol:reconcile && npm run test:bible-protocol:correction-plan && npm run test:bible-protocol:coordination`.
- `test:bible-lifecycle:infra`: `npm run test:bible-lifecycle:core && npm run test:bible-lifecycle:human-gate && npm run test:bible-lifecycle:findings && npm run test:bible-lifecycle:finding-events && npm run test:bible-lifecycle:transition && npm run test:bible-lifecycle:human-review && npm run test:bible-lifecycle:audit-result && npm run test:bible-lifecycle:authority-artifacts && npm run test:bible-lifecycle:authority-state && npm run test:bible-lifecycle:authority-findings && npm run test:bible-lifecycle:anti-loop-integration && npm run test:bible-lifecycle:anti-loop-adversarial && npm run test:bible-lifecycle:governance && npm run test:bible-lifecycle:metrics && npm run test:bible-lifecycle:anti-loop-bible`.
- `test:bible-completion:infra`: `npm run test:bible-completion:monotonic && npm run test:bible-completion:human-freeze && npm run test:bible-completion:sha-progress && npm run test:bible-completion:storage`.
- `test:performance:isolated`: `npm run test:performance:core && npm run test:performance:gtc-indexeddb`.

| Alias | Prova real executada |
| --- | --- |
| `test:bible-protocol:audit-history` | `node scripts/validation/verify-bible-audit-results-append-only-selftest.js` |
| `test:bible-protocol:audit-core-git` | `node tests/infra/bible/audit-core-git-selftest.js` |
| `test:bible-protocol:engine` | `node tests/infra/bible/audit-protocol-selftest.js` |
| `test:bible-protocol:pipeline` | `node scripts/validation/verify-bible-audit-pipeline-selftest.js` |
| `test:bible-protocol:shards` | `node scripts/validation/verify-bible-audit-shards-selftest.js` |
| `test:bible-protocol:reconcile` | `node tests/infra/bible/reconcile-audit-results-selftest.js` |
| `test:bible-protocol:correction-plan` | `node tests/infra/bible/bible-correction-work-plan-selftest.js` |
| `test:bible-protocol:coordination` | `node scripts/validation/verify-bible-coordination-selftest.js` |
| `test:bible-lifecycle:core` | `node tests/infra/bible/lifecycle-core-selftest.js` |
| `test:bible-lifecycle:human-gate` | `node tests/infra/bible/human-gate-selftest.js` |
| `test:bible-lifecycle:findings` | `node tests/infra/bible/unverified-findings-selftest.js` |
| `test:bible-lifecycle:finding-events` | `node tests/infra/bible/unverified-finding-events-selftest.js` |
| `test:bible-lifecycle:transition` | `node tests/infra/bible/unit-transition-selftest.js` |
| `test:bible-lifecycle:human-review` | `node tests/infra/bible/human-review-selftest.js` |
| `test:bible-lifecycle:audit-result` | `node tests/infra/bible/audit-result-selftest.js` |
| `test:bible-lifecycle:authority-artifacts` | `node scripts/validation/verify-lifecycle-artifacts-append-only-selftest.js` |
| `test:bible-lifecycle:authority-state` | `node scripts/validation/verify-bible-state-history-append-only-selftest.js` |
| `test:bible-lifecycle:authority-findings` | `node scripts/validation/verify-unverified-findings-append-only-selftest.js` |
| `test:bible-lifecycle:anti-loop-integration` | `node tests/infra/bible/anti-loop-integration-selftest.js` |
| `test:bible-lifecycle:anti-loop-adversarial` | `node tests/infra/bible/anti-loop-adversarial-selftest.js` |
| `test:bible-lifecycle:governance` | `node scripts/validation/verify-bible-protocol-governance-selftest.js` |
| `test:bible-lifecycle:metrics` | `node scripts/validation/bible-lifecycle-metrics-selftest.js` |
| `test:bible-lifecycle:anti-loop-bible` | `node scripts/validation/bible-anti-loop-adversarial-selftest.js` |
| `test:bible-completion:monotonic` | `node scripts/validation/verify-completion-monotonic-selftest.js` |
| `test:bible-completion:human-freeze` | `node scripts/validation/verify-completed-human-freeze-selftest.js` |
| `test:bible-completion:sha-progress` | `node scripts/validation/verify-audit-sha-progress-selftest.js` |
| `test:bible-completion:storage` | `node scripts/validation/verify-bible-storage-selftest.js` |
| `test:performance:core` | `jest --config jest.config.js --runInBand --selectProjects integration --testPathPattern="tests/integration/performance.test.js$"` |
| `test:performance:gtc-indexeddb` | `jest --config jest.config.js --runInBand --selectProjects integration --testPathPattern="tests/integration/ipc/gtc-indexeddb-deep.test.js$"` |

## Evidência e limites

Baseline local da revisão anterior: 109 suites, 877 testes, zero skipped/TODO, 57 arquivos instrumentados, statements/lines 81,26%, branches 72,56%, functions 84,71%. O inventário mecanizado e as hashes dos contratos de coverage ficam em `scripts/ci/data/bible-ci-sharding-baseline.json`. A equivalência dos agregadores compara folhas expandidas na mesma ordem, enquanto o inventário dos workflows compara os mesmos self-tests por OS. A duplicata do governance selftest dentro do Structure é uma execução incondicional do mesmo arquivo no mesmo OS; sua remoção conserva as assertions e não remove execução entre workflows.

Esta documentação e a sincronização mecânica não concedem APPROVED. Auditorias de SOURCE_SHA/BIBLE_SHA anteriores não aprovam esta revisão. A autorização ALLOW_COMPLETED_WORK foi registrada pelo workflow protegido #37106576909; transição e publicação devem usar CAS, locks e histórico canônico. Análise documental anterior preservada em `.coordination/structure-review-history/063-f93139db1f36dce1fb696f0331b0acf08af22220.md`.

## Fonte integral exata

~~~json
{
  "name": "manga-translator",
  "version": "6.5.0",
  "description": "Manga Translator - extensão Chromium para tradução automática de mangás e quadrinhos usando Google Gemini",
  "private": true,
  "scripts": {
    "test": "npm run test:ci && npm run test:smoke && npm run test:visual",
    "test:all": "npm run test && npm run test:e2e && npm run test:coverage && npm run test:coverage:verify",
    "test:unit": "jest --config jest.config.js --selectProjects background gtc content-scripts popup reader manifest shared-ui",
    "test:unit:gtc": "jest --config jest.config.js --selectProjects gtc",
    "test:unit:background": "jest --config jest.config.js --selectProjects background",
    "test:unit:content": "jest --config jest.config.js --selectProjects content-scripts",
    "test:unit:popup": "jest --config jest.config.js --selectProjects popup",
    "test:unit:reader": "jest --config jest.config.js --selectProjects reader",
    "test:unit:inject": "jest --config jest.config.js --selectProjects content-scripts --testPathPattern=tests/unit/inject",
    "test:integration": "jest --config jest.config.js --selectProjects integration",
    "test:smoke": "node tests/smoke/run-smoke.js",
    "test:visual": "node tests/visual/run-all.js",
    "pretest:e2e": "npm run test:images",
    "test:e2e": "playwright test --config=playwright.config.js",
    "pretest:e2e:group": "npm run test:images",
    "test:e2e:group": "node scripts/ci/run-e2e-group.js",
    "test:e2e:plan": "node scripts/validation/verify-e2e-shard-plan.js",
    "test:images": "node tests/setup/create-test-images.js",
    "mock:server": "node tests/fixtures/gemini-mock-server.js",
    "test:ci": "node scripts/ci/run-jest-ci.js",
    "test:coverage": "node scripts/ci/run-jest-ci.js --coverage",
    "test:coverage:verify": "node scripts/validation/verify-coverage.js",
    "test:coverage:infra": "node scripts/validation/verify-coverage-selftest.js",
    "test:watch": "jest --config jest.config.js --watch --selectProjects background gtc content-scripts popup reader manifest shared-ui",
    "test:open-handles": "jest --config jest.config.js --detectOpenHandles --runInBand",
    "test:diagnose-workers": "node scripts/maintenance/diagnose-jest-workers.js",
    "test:diagnose-background-leak": "node scripts/maintenance/diagnose-background-leak.js",
    "version:sync": "node scripts/release/sync-version.js",
    "version:check": "node scripts/release/sync-version.js --check",
    "validate:manifest": "node scripts/validation/validate-manifest.js",
    "lint": "node scripts/validation/check-js-syntax.js",
    "validate": "npm run version:check && npm run validate:manifest && npm run lint && npm run validate:structure && npm run validate:bible-projections && npm run test:bible-coordination:infra && npm run test:bible-audit-pipeline:infra && npm run validate:test-policy && npm run test:test-policy:infra && npm run validate:publish && node scripts/validation/verify-ci-contract.js && npm run test:ci-contract:infra && npm run test:coverage:infra && node scripts/validation/playwright-gate-reporter-selftest.js && node scripts/validation/verify-jest-worker-warning-selftest.js && npm run test:e2e:plan && npm run test:bible-audit-shards:infra && node scripts/validation/verify-bible-protocol-governance.js && npm run test:bible-completion:infra",
    "validate:structure": "node scripts/validation/verify-repository-structure.js",
    "test:ci-contract:infra": "node scripts/validation/verify-ci-contract-selftest.js",
    "validate:test-policy": "node scripts/validation/verify-test-policy.js",
    "test:test-policy:infra": "node scripts/validation/verify-test-policy-selftest.js",
    "validate:publish": "node scripts/validation/verify-publish-contract.js",
    "test:bible-coordination:infra": "node scripts/validation/verify-bible-coordination-selftest.js",
    "validate:bible-projections": "node scripts/validation/generate-bible-projections.js",
    "write:bible-projections": "node scripts/validation/generate-bible-projections.js --write",
    "test:bible-audit-pipeline:infra": "node scripts/validation/verify-bible-audit-pipeline-selftest.js",
    "test:bible-audit-shards:infra": "node scripts/validation/verify-bible-audit-shards-selftest.js",
    "test:bible-protocol:infra": "npm run test:bible-protocol:audit-history && npm run test:bible-protocol:audit-core-git && npm run test:bible-protocol:engine && npm run test:bible-protocol:pipeline && npm run test:bible-protocol:shards && npm run test:bible-protocol:reconcile && npm run test:bible-protocol:correction-plan && npm run test:bible-protocol:coordination",
    "bible:audit:status": "node scripts/bible/commands/audit-protocol.js status",
    "bible:audit:verify": "node scripts/bible/commands/audit-protocol.js verify",
    "bible:audit:summary": "node scripts/bible/commands/audit-summary.js",
    "bible:audit:work-plan": "node scripts/validation/bible-audit-work-plan.js",
    "bible:corrections:work-plan": "node scripts/bible/commands/bible-correction-work-plan.js",
    "bible:reconcile:check": "node scripts/bible/commands/reconcile-audit-results.js --check",
    "bible:reconcile:write": "node scripts/bible/commands/reconcile-audit-results.js --write",
    "bible:lease-gc": "node scripts/bible/commands/audit-lease-gc.js",
    "bible:lease-gc:write": "node scripts/bible/commands/audit-lease-gc.js --write-safe",
    "bible:merge-readiness": "node scripts/validation/verify-bible-merge-readiness.js",
    "bible:final-readiness": "npm run test:bible-protocol:infra && npm run test:bible-lifecycle:infra && npm run bible:lifecycle:verify && npm run bible:lifecycle:metrics:check && npm run bible:lifecycle-artifacts:append-only && npm run bible:state-history:append-only && npm run bible:findings:append-only && npm run bible:audit:append-only && npm run bible:reconcile:check && npm run bible:audit:verify && npm run bible:merge-readiness",
    "test:bible-audit-append-only:infra": "node scripts/validation/verify-bible-audit-results-append-only-selftest.js",
    "bible:audit:append-only": "node scripts/validation/verify-bible-audit-results-append-only.js",
    "test:bible-lifecycle:infra": "npm run test:bible-lifecycle:core && npm run test:bible-lifecycle:human-gate && npm run test:bible-lifecycle:findings && npm run test:bible-lifecycle:finding-events && npm run test:bible-lifecycle:transition && npm run test:bible-lifecycle:human-review && npm run test:bible-lifecycle:audit-result && npm run test:bible-lifecycle:authority-artifacts && npm run test:bible-lifecycle:authority-state && npm run test:bible-lifecycle:authority-findings && npm run test:bible-lifecycle:anti-loop-integration && npm run test:bible-lifecycle:anti-loop-adversarial && npm run test:bible-lifecycle:governance && npm run test:bible-lifecycle:metrics && npm run test:bible-lifecycle:anti-loop-bible",
    "bible:lifecycle:verify": "node scripts/validation/verify-bible-lifecycle.js",
    "bible:transition": "node scripts/bible/commands/unit-transition.js",
    "bible:audit:publish": "node scripts/bible/commands/audit-result.js",
    "bible:finding:create": "node scripts/bible/storage/unverified-findings.js",
    "bible:finding:transition": "node scripts/bible/commands/unverified-finding-transition.js",
    "bible:lifecycle-artifacts:append-only": "node scripts/validation/verify-lifecycle-artifacts-append-only.js",
    "bible:state-history:append-only": "node scripts/validation/verify-bible-state-history-append-only.js",
    "bible:findings:append-only": "node scripts/validation/verify-unverified-findings-append-only.js",
    "bible:lifecycle:metrics": "node scripts/validation/bible-lifecycle-metrics.js",
    "test:bible-anti-loop:adversarial": "node scripts/validation/bible-anti-loop-adversarial-selftest.js",
    "bible:lifecycle:metrics:check": "node scripts/validation/bible-lifecycle-metrics.js --check",
    "test:bible-completion:infra": "npm run test:bible-completion:monotonic && npm run test:bible-completion:human-freeze && npm run test:bible-completion:sha-progress && npm run test:bible-completion:storage",
    "bible:completion:migrate": "node scripts/bible/commands/migrate-completion.js",
    "bible:audit:repair-sha": "node scripts/bible/commands/repair-sha.js",
    "test:production:mutation": "node scripts/validation/verify-production-test-mutation.js",
    "test:performance:isolated": "npm run test:performance:core && npm run test:performance:gtc-indexeddb",
    "test:bible-protocol:audit-history": "node scripts/validation/verify-bible-audit-results-append-only-selftest.js",
    "test:bible-protocol:audit-core-git": "node tests/infra/bible/audit-core-git-selftest.js",
    "test:bible-protocol:engine": "node tests/infra/bible/audit-protocol-selftest.js",
    "test:bible-protocol:pipeline": "node scripts/validation/verify-bible-audit-pipeline-selftest.js",
    "test:bible-protocol:shards": "node scripts/validation/verify-bible-audit-shards-selftest.js",
    "test:bible-protocol:reconcile": "node tests/infra/bible/reconcile-audit-results-selftest.js",
    "test:bible-protocol:correction-plan": "node tests/infra/bible/bible-correction-work-plan-selftest.js",
    "test:bible-protocol:coordination": "node scripts/validation/verify-bible-coordination-selftest.js",
    "test:bible-lifecycle:core": "node tests/infra/bible/lifecycle-core-selftest.js",
    "test:bible-lifecycle:human-gate": "node tests/infra/bible/human-gate-selftest.js",
    "test:bible-lifecycle:findings": "node tests/infra/bible/unverified-findings-selftest.js",
    "test:bible-lifecycle:finding-events": "node tests/infra/bible/unverified-finding-events-selftest.js",
    "test:bible-lifecycle:transition": "node tests/infra/bible/unit-transition-selftest.js",
    "test:bible-lifecycle:human-review": "node tests/infra/bible/human-review-selftest.js",
    "test:bible-lifecycle:audit-result": "node tests/infra/bible/audit-result-selftest.js",
    "test:bible-lifecycle:authority-artifacts": "node scripts/validation/verify-lifecycle-artifacts-append-only-selftest.js",
    "test:bible-lifecycle:authority-state": "node scripts/validation/verify-bible-state-history-append-only-selftest.js",
    "test:bible-lifecycle:authority-findings": "node scripts/validation/verify-unverified-findings-append-only-selftest.js",
    "test:bible-lifecycle:anti-loop-integration": "node tests/infra/bible/anti-loop-integration-selftest.js",
    "test:bible-lifecycle:anti-loop-adversarial": "node tests/infra/bible/anti-loop-adversarial-selftest.js",
    "test:bible-lifecycle:governance": "node scripts/validation/verify-bible-protocol-governance-selftest.js",
    "test:bible-lifecycle:metrics": "node scripts/validation/bible-lifecycle-metrics-selftest.js",
    "test:bible-lifecycle:anti-loop-bible": "node scripts/validation/bible-anti-loop-adversarial-selftest.js",
    "test:bible-completion:monotonic": "node scripts/validation/verify-completion-monotonic-selftest.js",
    "test:bible-completion:human-freeze": "node scripts/validation/verify-completed-human-freeze-selftest.js",
    "test:bible-completion:sha-progress": "node scripts/validation/verify-audit-sha-progress-selftest.js",
    "test:bible-completion:storage": "node scripts/validation/verify-bible-storage-selftest.js",
    "test:performance:core": "jest --config jest.config.js --runInBand --selectProjects integration --testPathPattern=\"tests/integration/performance.test.js$\"",
    "test:performance:gtc-indexeddb": "jest --config jest.config.js --runInBand --selectProjects integration --testPathPattern=\"tests/integration/ipc/gtc-indexeddb-deep.test.js$\""
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "fake-indexeddb": "^6.2.5",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "MIT"
}
~~~

## Cobertura documental de linhas

| Linha | Contrato/documentação da posição |
| --- | --- |
| 1 | Delimitador JSON: fecha/abre estrutura e separa campos; não executa prova nem altera contrato. |
| 2 | Campo JSON `name`: metadado/valor integral preservado na fonte acima. |
| 3 | Campo JSON `version`: metadado/valor integral preservado na fonte acima. |
| 4 | Campo JSON `description`: metadado/valor integral preservado na fonte acima. |
| 5 | Campo JSON `private`: metadado/valor integral preservado na fonte acima. |
| 6 | Campo JSON `scripts`: abre o mapa de comandos npm. |
| 7 | Interface npm preservada `test`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 8 | Interface npm preservada `test:all`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 9 | Interface npm preservada `test:unit`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 10 | Interface npm preservada `test:unit:gtc`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 11 | Interface npm preservada `test:unit:background`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 12 | Interface npm preservada `test:unit:content`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 13 | Interface npm preservada `test:unit:popup`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 14 | Interface npm preservada `test:unit:reader`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 15 | Interface npm preservada `test:unit:inject`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 16 | Interface npm preservada `test:integration`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 17 | Interface npm preservada `test:smoke`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 18 | Interface npm preservada `test:visual`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 19 | Interface npm preservada `pretest:e2e`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 20 | Interface npm preservada `test:e2e`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 21 | Interface npm preservada `pretest:e2e:group`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 22 | Interface npm preservada `test:e2e:group`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 23 | Interface npm preservada `test:e2e:plan`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 24 | Interface npm preservada `test:images`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 25 | Interface npm preservada `mock:server`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 26 | Interface npm preservada `test:ci`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 27 | Coverage integral via runner canônico; não faz merge de shards. |
| 28 | Verifica summary, LCOV, arquivos esperados e mínimos globais/críticos de cobertura. |
| 29 | Interface npm preservada `test:coverage:infra`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 30 | Interface npm preservada `test:watch`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 31 | Interface npm preservada `test:open-handles`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 32 | Interface npm preservada `test:diagnose-workers`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 33 | Interface npm preservada `test:diagnose-background-leak`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 34 | Interface npm preservada `version:sync`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 35 | Interface npm preservada `version:check`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 36 | Interface npm preservada `validate:manifest`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 37 | Interface npm preservada `lint`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 38 | Interface npm preservada `validate`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 39 | Interface npm preservada `validate:structure`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 40 | Interface npm preservada `test:ci-contract:infra`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 41 | Interface npm preservada `validate:test-policy`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 42 | Interface npm preservada `test:test-policy:infra`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 43 | Interface npm preservada `validate:publish`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 44 | Interface npm preservada `test:bible-coordination:infra`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 45 | Interface npm preservada `validate:bible-projections`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 46 | Interface npm preservada `write:bible-projections`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 47 | Interface npm preservada `test:bible-audit-pipeline:infra`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 48 | Interface npm preservada `test:bible-audit-shards:infra`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 49 | Agregador `test:bible-protocol:infra`: composição ordenada completa documentada acima, execução sequencial com `&&`. |
| 50 | Interface npm preservada `bible:audit:status`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 51 | Interface npm preservada `bible:audit:verify`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 52 | Interface npm preservada `bible:audit:summary`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 53 | Interface npm preservada `bible:audit:work-plan`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 54 | Interface npm preservada `bible:corrections:work-plan`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 55 | Interface npm preservada `bible:reconcile:check`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 56 | Interface npm preservada `bible:reconcile:write`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 57 | Interface npm preservada `bible:lease-gc`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 58 | Interface npm preservada `bible:lease-gc:write`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 59 | Interface npm preservada `bible:merge-readiness`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 60 | Gate canônico completo de testes, lifecycle, métricas, históricos append-only, reconciliação e merge readiness. |
| 61 | Interface npm preservada `test:bible-audit-append-only:infra`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 62 | Interface npm preservada `bible:audit:append-only`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 63 | Agregador `test:bible-lifecycle:infra`: composição ordenada completa documentada acima, execução sequencial com `&&`. |
| 64 | Interface npm preservada `bible:lifecycle:verify`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 65 | Interface npm preservada `bible:transition`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 66 | Interface npm preservada `bible:audit:publish`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 67 | Interface npm preservada `bible:finding:create`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 68 | Interface npm preservada `bible:finding:transition`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 69 | Interface npm preservada `bible:lifecycle-artifacts:append-only`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 70 | Interface npm preservada `bible:state-history:append-only`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 71 | Interface npm preservada `bible:findings:append-only`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 72 | Interface npm preservada `bible:lifecycle:metrics`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 73 | Interface npm preservada `test:bible-anti-loop:adversarial`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 74 | Interface npm preservada `bible:lifecycle:metrics:check`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 75 | Agregador `test:bible-completion:infra`: composição ordenada completa documentada acima, execução sequencial com `&&`. |
| 76 | Interface npm preservada `bible:completion:migrate`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 77 | Interface npm preservada `bible:audit:repair-sha`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 78 | Interface npm preservada `test:production:mutation`; conserva literalmente o comando público da baseline, alvo e propagação de erros. |
| 79 | Agregador `test:performance:isolated`: composição ordenada completa documentada acima, execução sequencial com `&&`. |
| 80 | Alias granular `test:bible-protocol:audit-history`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 81 | Alias granular `test:bible-protocol:audit-core-git`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 82 | Alias granular `test:bible-protocol:engine`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 83 | Alias granular `test:bible-protocol:pipeline`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 84 | Alias granular `test:bible-protocol:shards`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 85 | Alias granular `test:bible-protocol:reconcile`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 86 | Alias granular `test:bible-protocol:correction-plan`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 87 | Alias granular `test:bible-protocol:coordination`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 88 | Alias granular `test:bible-lifecycle:core`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 89 | Alias granular `test:bible-lifecycle:human-gate`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 90 | Alias granular `test:bible-lifecycle:findings`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 91 | Alias granular `test:bible-lifecycle:finding-events`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 92 | Alias granular `test:bible-lifecycle:transition`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 93 | Alias granular `test:bible-lifecycle:human-review`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 94 | Alias granular `test:bible-lifecycle:audit-result`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 95 | Alias granular `test:bible-lifecycle:authority-artifacts`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 96 | Alias granular `test:bible-lifecycle:authority-state`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 97 | Alias granular `test:bible-lifecycle:authority-findings`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 98 | Alias granular `test:bible-lifecycle:anti-loop-integration`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 99 | Alias granular `test:bible-lifecycle:anti-loop-adversarial`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 100 | Alias granular `test:bible-lifecycle:governance`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 101 | Alias granular `test:bible-lifecycle:metrics`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 102 | Alias granular `test:bible-lifecycle:anti-loop-bible`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 103 | Alias granular `test:bible-completion:monotonic`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 104 | Alias granular `test:bible-completion:human-freeze`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 105 | Alias granular `test:bible-completion:sha-progress`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 106 | Alias granular `test:bible-completion:storage`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 107 | Alias granular `test:performance:core`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 108 | Alias granular `test:performance:gtc-indexeddb`: executa a prova exata listada acima; erros propagam pelo código de saída. |
| 109 | Delimitador JSON: fecha/abre estrutura e separa campos; não executa prova nem altera contrato. |
| 110 | Campo JSON `devDependencies`: abre dependências de desenvolvimento, preservadas sem atualização. |
| 111 | Campo JSON `@playwright/test`: metadado/valor integral preservado na fonte acima. |
| 112 | Campo JSON `fake-indexeddb`: metadado/valor integral preservado na fonte acima. |
| 113 | Campo JSON `jest`: metadado/valor integral preservado na fonte acima. |
| 114 | Campo JSON `jest-environment-jsdom`: metadado/valor integral preservado na fonte acima. |
| 115 | Delimitador JSON: fecha/abre estrutura e separa campos; não executa prova nem altera contrato. |
| 116 | Campo JSON `engines`: abre o contrato mínimo de runtime, preservado. |
| 117 | Campo JSON `node`: metadado/valor integral preservado na fonte acima. |
| 118 | Delimitador JSON: fecha/abre estrutura e separa campos; não executa prova nem altera contrato. |
| 119 | Campo JSON `license`: metadado/valor integral preservado na fonte acima. |
| 120 | Delimitador JSON: fecha/abre estrutura e separa campos; não executa prova nem altera contrato. |
| 121 | Posição final da newline: termina o arquivo sem comando adicional. |

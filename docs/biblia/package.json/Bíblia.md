# Bíblia técnica — `package.json`

> **Schema da Bíblia:** 2
> **Índice:** 63
> **Fonte:** `package.json`
> **SHA da revisão pendente:** `049fa67c2d7a52782f244b130c7d00d664f9e3ee`
> **Posições da fonte:** 92
> **Status:** COMPLETED
> **Revisão:** READY_FOR_AUDIT — requer auditoria independente.

## Mudança e invariantes

Comandos e infraestrutura saíram dos dados documentais. Scripts npm apontam para scripts/bible e tests/infra/bible; os gates anteriores continuam obrigatórios.

## Evidência e limites

A sincronização abaixo é mecânica. Não concede APPROVED nem reaproveita auditoria de outro SHA. A análise documental anterior está preservada em `.coordination/structure-review-history/063-f93139db1f36dce1fb696f0331b0acf08af22220.md`. A cobertura de linhas deve receber revisão semântica independente.

## Fonte integral exata

~~~js
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
    "test:bible-protocol:infra": "node scripts/validation/verify-bible-audit-results-append-only-selftest.js && node tests/infra/bible/audit-core-git-selftest.js && node tests/infra/bible/audit-protocol-selftest.js && node scripts/validation/verify-bible-audit-pipeline-selftest.js && node scripts/validation/verify-bible-audit-shards-selftest.js && node tests/infra/bible/reconcile-audit-results-selftest.js && node tests/infra/bible/bible-correction-work-plan-selftest.js && node scripts/validation/verify-bible-coordination-selftest.js",
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
    "test:bible-lifecycle:infra": "node tests/infra/bible/lifecycle-core-selftest.js && node tests/infra/bible/human-gate-selftest.js && node tests/infra/bible/unverified-findings-selftest.js && node tests/infra/bible/unverified-finding-events-selftest.js && node tests/infra/bible/unit-transition-selftest.js && node tests/infra/bible/human-review-selftest.js && node tests/infra/bible/audit-result-selftest.js && node scripts/validation/verify-lifecycle-artifacts-append-only-selftest.js && node scripts/validation/verify-bible-state-history-append-only-selftest.js && node scripts/validation/verify-unverified-findings-append-only-selftest.js && node tests/infra/bible/anti-loop-integration-selftest.js && node tests/infra/bible/anti-loop-adversarial-selftest.js && node scripts/validation/verify-bible-protocol-governance-selftest.js && node scripts/validation/bible-lifecycle-metrics-selftest.js && node scripts/validation/bible-anti-loop-adversarial-selftest.js",
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
    "test:bible-completion:infra": "node scripts/validation/verify-completion-monotonic-selftest.js && node scripts/validation/verify-completed-human-freeze-selftest.js && node scripts/validation/verify-audit-sha-progress-selftest.js && node scripts/validation/verify-bible-storage-selftest.js",
    "bible:completion:migrate": "node scripts/bible/commands/migrate-completion.js",
    "bible:audit:repair-sha": "node scripts/bible/commands/repair-sha.js",
    "test:production:mutation": "node scripts/validation/verify-production-test-mutation.js",
    "test:performance:isolated": "jest --config jest.config.js --runInBand --selectProjects integration --testPathPattern=\"performance.test.js|gtc-indexeddb-deep.test.js\""
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

- 1–92: snapshot integral da revisão acima; revisão semântica independente pendente.

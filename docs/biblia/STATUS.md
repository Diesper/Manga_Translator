# Status — Bíblia técnica por arquivo

> Fonte de verdade do progresso. Desde a auditoria de qualidade de 2026-09-29, **CONCLUÍDO significa Bíblia materializada + auditoria aprovada**. Criar um arquivo não basta.

## Objetivo

Criar uma Bíblia independente para cada arquivo do corpus técnico, com fonte integral, análise contextual linha a linha, rastreabilidade conservadora de testes e uma auditoria separada que impeça falsos positivos de qualidade.

## Arquivos de controle

- `docs/biblia/STATUS.md` — estado operacional;
- `docs/biblia/CHECKLIST.md` — somente arquivos auditados/aprovados recebem `[x]`;
- `docs/biblia/AUDITORIA.md` — evidência e veredito da auditoria de qualidade.

## Corpus congelado

- Base: `main` no início da reestruturação do PR #66.
- Total: **233 arquivos**.
- Inclui `extension/`, `tests/`, `scripts/`, `.github/workflows/` e configs canônicas da raiz.
- Exclui `package-lock.json`, binários, dependências, artefatos e documentação.

## Estados

- `⬜ PENDENTE`: Bíblia ainda não materializada.
- `🟠 EM ANDAMENTO`: único arquivo sendo escrito/revisado agora.
- `🟣 REVISÃO DE QUALIDADE`: Bíblia existe, mas a auditoria encontrou falhas e ela não conta como concluída.
- `✅ CONCLUÍDO`: Bíblia existe **e** passou em `AUDITORIA.md`.
- `BLOQUEADO`: depende de evidência indisponível; o bloqueio deve ser descrito.

## Critério obrigatório de CONCLUÍDO

1. identidade/SHA/papel corretos;
2. fonte integral exata;
3. cobertura documental de 100% das linhas/posições;
4. dependências/consumidores/efeitos colaterais verdadeiros;
5. explicação específica, não template que apenas repete a linha;
6. o que faz, como faz, por que assim e risco de alternativa;
7. invariantes/casos-limite;
8. matriz de testes/gates baseada em assertions reais;
9. `⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO` onde não houver prova direta;
10. distinção entre prova direta, gate estático, execução indireta e ausência de prova;
11. referências numéricas de linha corretas;
12. aprovação explícita em `docs/biblia/AUDITORIA.md`.

## Progresso após auditoria de qualidade

- Total: **233**
- Bíblias materializadas: **26**
- ✅ Concluídos auditados: **26**
- 🟠 Em andamento: **1**
- 🟣 Aguardando revisão de qualidade: **0**
- ⬜ Ainda não materializados: **207**
- Cobertura realmente aprovada: **11,16%**
- Cobertura apenas materializada: **11,16%**
- Último aprovado: `extension/background/jobs-dom-ack.js`
- Arquivo atual: `extension/background/jobs-lifecycle.js`
- Bíblia atual: `docs/biblia/extension/background/jobs-lifecycle.js/Bíblia.md`
- Fila normal em produção: `extension/background/jobs-lifecycle.js`

## Auditoria de 2026-09-29

A auditoria rebaixou os arquivos que estavam marcados como concluídos sem satisfazer o padrão atual. Isso não apaga o trabalho já produzido; significa que essas Bíblias precisam ser corrigidas antes de receber `[x]` novamente.

### Aprovados

1. ✅ `extension/manifest.json`
2. ✅ `extension/background.js`
3. ✅ `extension/background/actions/calculate-visual-fingerprint.js`
4. ✅ `extension/background/actions/check-extraction-tab.js`
5. ✅ `extension/background/actions/claim-gemini-job.js`
6. ✅ `extension/background/actions/commit-result.js`
7. ✅ `extension/background/actions/deliver-result-from-tab.js`
8. ✅ `extension/background/actions/deliver-result-url.js`
9. ✅ `extension/background/actions/deliver-result.js`
10. ✅ `extension/background/actions/download-chapter.js`
11. ✅ `extension/background/actions/download-image.js`
12. ✅ `extension/background/actions/export-all.js`
13. ✅ `extension/background/actions/fetch-image-base64.js`
14. ✅ `extension/background/actions/force-send-activation.js`
15. ✅ `extension/background/actions/get-tab-id.js`
16. ✅ `extension/background/actions/log-entry.js`
17. ✅ `extension/background/actions/open-existing-folder.js`
18. ✅ `extension/background/actions/open-manga-root.js`
19. ✅ `extension/background/actions/refresh-job-watchdog.js`
20. ✅ `extension/background/actions/relay-progress.js`
21. ✅ `extension/background/actions/report-error.js`
22. ✅ `extension/background/actions/request-image-data.js`
23. ✅ `extension/background/actions/set-debug-mode.js`
24. ✅ `extension/background/actions/start-batch.js`
25. ✅ `extension/background/actions/stop-batch.js`
26. ✅ `extension/background/jobs-dom-ack.js`

### Revisão obrigatória

Nenhuma. As seis revisões obrigatórias foram concluídas; a produção normal foi retomada em `extension/background/actions/deliver-result.js`.

Detalhes e provas: `docs/biblia/AUDITORIA.md`.

## Fila

| # | Estado | Arquivo | SHA-base | Bíblia individual |
|---:|---|---|---|---|
| 1 | ✅ CONCLUÍDO | `extension/manifest.json` | `841fe70c1833` | `docs/biblia/extension/manifest.json/Bíblia.md` |
| 2 | ✅ CONCLUÍDO | `extension/background.js` | `667c05eb2d7a` | `docs/biblia/extension/background.js/Bíblia.md` |
| 3 | ✅ CONCLUÍDO | `extension/background/actions/calculate-visual-fingerprint.js` | `ea474845cf9c` | `docs/biblia/extension/background/actions/calculate-visual-fingerprint.js/Bíblia.md` |
| 4 | ✅ CONCLUÍDO | `extension/background/actions/check-extraction-tab.js` | `9ee40474d8c5` | `docs/biblia/extension/background/actions/check-extraction-tab.js/Bíblia.md` |
| 5 | ✅ CONCLUÍDO | `extension/background/actions/claim-gemini-job.js` | `f5c4643d2919` | `docs/biblia/extension/background/actions/claim-gemini-job.js/Bíblia.md` |
| 6 | ✅ CONCLUÍDO | `extension/background/actions/commit-result.js` | `32270d1c4ade` | `docs/biblia/extension/background/actions/commit-result.js/Bíblia.md` |
| 7 | ✅ CONCLUÍDO | `extension/background/actions/deliver-result-from-tab.js` | `59543c135966` | `docs/biblia/extension/background/actions/deliver-result-from-tab.js/Bíblia.md` |
| 8 | ✅ CONCLUÍDO | `extension/background/actions/deliver-result-url.js` | `91c50efe4764` | `docs/biblia/extension/background/actions/deliver-result-url.js/Bíblia.md` |
| 9 | ✅ CONCLUÍDO | `extension/background/actions/deliver-result.js` | `3653bd10c2a0` | `docs/biblia/extension/background/actions/deliver-result.js/Bíblia.md` |
| 10 | ✅ CONCLUÍDO | `extension/background/actions/download-chapter.js` | `8636a03c8a20` | `docs/biblia/extension/background/actions/download-chapter.js/Bíblia.md` |
| 11 | ✅ CONCLUÍDO | `extension/background/actions/download-image.js` | `408102f057ab` | `docs/biblia/extension/background/actions/download-image.js/Bíblia.md` |
| 12 | ✅ CONCLUÍDO | `extension/background/actions/export-all.js` | `6160a220094d` | `docs/biblia/extension/background/actions/export-all.js/Bíblia.md` |
| 13 | ✅ CONCLUÍDO | `extension/background/actions/fetch-image-base64.js` | `4a4825c36fdb` | `docs/biblia/extension/background/actions/fetch-image-base64.js/Bíblia.md` |
| 14 | ✅ CONCLUÍDO | `extension/background/actions/force-send-activation.js` | `cbeea5768301` | `docs/biblia/extension/background/actions/force-send-activation.js/Bíblia.md` |
| 15 | ✅ CONCLUÍDO | `extension/background/actions/get-tab-id.js` | `2f3b26304ac1` | `docs/biblia/extension/background/actions/get-tab-id.js/Bíblia.md` |
| 16 | ✅ CONCLUÍDO | `extension/background/actions/log-entry.js` | `d57e1a25531b` | `docs/biblia/extension/background/actions/log-entry.js/Bíblia.md` |
| 17 | ✅ CONCLUÍDO | `extension/background/actions/open-existing-folder.js` | `59ef82cbf960` | `docs/biblia/extension/background/actions/open-existing-folder.js/Bíblia.md` |
| 18 | ✅ CONCLUÍDO | `extension/background/actions/open-manga-root.js` | `71c83df253cd` | `docs/biblia/extension/background/actions/open-manga-root.js/Bíblia.md` |
| 19 | ✅ CONCLUÍDO | `extension/background/actions/refresh-job-watchdog.js` | `25f86a8dba57` | `docs/biblia/extension/background/actions/refresh-job-watchdog.js/Bíblia.md` |
| 20 | ✅ CONCLUÍDO | `extension/background/actions/relay-progress.js` | `24e377893c71` | `docs/biblia/extension/background/actions/relay-progress.js/Bíblia.md` |
| 21 | ✅ CONCLUÍDO | `extension/background/actions/report-error.js` | `ac239ea49544` | `docs/biblia/extension/background/actions/report-error.js/Bíblia.md` |
| 22 | ✅ CONCLUÍDO | `extension/background/actions/request-image-data.js` | `249126232396` | `docs/biblia/extension/background/actions/request-image-data.js/Bíblia.md` |
| 23 | ✅ CONCLUÍDO | `extension/background/actions/set-debug-mode.js` | `92e4149b1bba` | `docs/biblia/extension/background/actions/set-debug-mode.js/Bíblia.md` |
| 24 | ✅ CONCLUÍDO | `extension/background/actions/start-batch.js` | `b0ef70bf1c23` | `docs/biblia/extension/background/actions/start-batch.js/Bíblia.md` |
| 25 | ✅ CONCLUÍDO | `extension/background/actions/stop-batch.js` | `e552d0a91109` | `docs/biblia/extension/background/actions/stop-batch.js/Bíblia.md` |
| 26 | ✅ CONCLUÍDO | `extension/background/jobs-dom-ack.js` | `07b4197a206f` | `docs/biblia/extension/background/jobs-dom-ack.js/Bíblia.md` |
| 27 | 🟠 EM ANDAMENTO | `extension/background/jobs-lifecycle.js` | `e4ab9f6c5472` | `docs/biblia/extension/background/jobs-lifecycle.js/Bíblia.md` |
| 28 | ⬜ PENDENTE | `extension/background/jobs-reconciliation.js` | `f0f2370ba6b7` | `docs/biblia/extension/background/jobs-reconciliation.js/Bíblia.md` |
| 29 | ⬜ PENDENTE | `extension/background/jobs-watchdog.js` | `c17b766d7fbc` | `docs/biblia/extension/background/jobs-watchdog.js/Bíblia.md` |
| 30 | ⬜ PENDENTE | `extension/background/log.js` | `86d5f2f1229b` | `docs/biblia/extension/background/log.js/Bíblia.md` |
| 31 | ⬜ PENDENTE | `extension/background/router.js` | `d9278e9e58e4` | `docs/biblia/extension/background/router.js/Bíblia.md` |
| 32 | ⬜ PENDENTE | `extension/background/state.js` | `7570b545d5e9` | `docs/biblia/extension/background/state.js/Bíblia.md` |
| 33 | ⬜ PENDENTE | `extension/background/tab-identity.js` | `008c9a054ae4` | `docs/biblia/extension/background/tab-identity.js/Bíblia.md` |
| 34 | ⬜ PENDENTE | `extension/content/cm-auto-restore.js` | `d20e7092652e` | `docs/biblia/extension/content/cm-auto-restore.js/Bíblia.md` |
| 35 | ⬜ PENDENTE | `extension/content/cm-chapter.js` | `44b621d570b6` | `docs/biblia/extension/content/cm-chapter.js/Bíblia.md` |
| 36 | ⬜ PENDENTE | `extension/content/cm-dom-replace.js` | `d3fc72032dbd` | `docs/biblia/extension/content/cm-dom-replace.js/Bíblia.md` |
| 37 | ⬜ PENDENTE | `extension/content/cm-gtc-client.js` | `95d062f41b9f` | `docs/biblia/extension/content/cm-gtc-client.js/Bíblia.md` |
| 38 | ⬜ PENDENTE | `extension/content/content_gemini.js` | `55bc83afe31a` | `docs/biblia/extension/content/content_gemini.js/Bíblia.md` |
| 39 | ⬜ PENDENTE | `extension/content/content_manga.js` | `a8b3698019f6` | `docs/biblia/extension/content/content_manga.js/Bíblia.md` |
| 40 | ⬜ PENDENTE | `extension/content/gemini/attachment.js` | `50092e4d7d71` | `docs/biblia/extension/content/gemini/attachment.js/Bíblia.md` |
| 41 | ⬜ PENDENTE | `extension/content/gemini/deletion.js` | `2cec17f19e52` | `docs/biblia/extension/content/gemini/deletion.js/Bíblia.md` |
| 42 | ⬜ PENDENTE | `extension/content/gemini/dom.js` | `d3694ea70cdd` | `docs/biblia/extension/content/gemini/dom.js/Bíblia.md` |
| 43 | ⬜ PENDENTE | `extension/content/gemini/editor.js` | `0adbd4374758` | `docs/biblia/extension/content/gemini/editor.js/Bíblia.md` |
| 44 | ⬜ PENDENTE | `extension/content/gemini/image-quarantine.js` | `ddca93d17ca2` | `docs/biblia/extension/content/gemini/image-quarantine.js/Bíblia.md` |
| 45 | ⬜ PENDENTE | `extension/content/gemini/job-runner.js` | `1b16fd656e82` | `docs/biblia/extension/content/gemini/job-runner.js/Bíblia.md` |
| 46 | ⬜ PENDENTE | `extension/content/gemini/observer.js` | `59c5335e1b4f` | `docs/biblia/extension/content/gemini/observer.js/Bíblia.md` |
| 47 | ⬜ PENDENTE | `extension/content/gemini/result-extractor.js` | `a3efd499a0b0` | `docs/biblia/extension/content/gemini/result-extractor.js/Bíblia.md` |
| 48 | ⬜ PENDENTE | `extension/content/gemini/selectors.js` | `0bf8db6e416a` | `docs/biblia/extension/content/gemini/selectors.js/Bíblia.md` |
| 49 | ⬜ PENDENTE | `extension/content/gemini/temporary-chat.js` | `40fbc8dc6acf` | `docs/biblia/extension/content/gemini/temporary-chat.js/Bíblia.md` |
| 50 | ⬜ PENDENTE | `extension/content/inject.js` | `21f7f6cf9c94` | `docs/biblia/extension/content/inject.js/Bíblia.md` |
| 51 | ⬜ PENDENTE | `extension/options/options.html` | `3ca95e66641d` | `docs/biblia/extension/options/options.html/Bíblia.md` |
| 52 | ⬜ PENDENTE | `extension/options/options.js` | `f69f132c0ef6` | `docs/biblia/extension/options/options.js/Bíblia.md` |
| 53 | ⬜ PENDENTE | `extension/popup/popup.html` | `05972d0fa116` | `docs/biblia/extension/popup/popup.html/Bíblia.md` |
| 54 | ⬜ PENDENTE | `extension/popup/popup.js` | `300cfe9a9c81` | `docs/biblia/extension/popup/popup.js/Bíblia.md` |
| 55 | ⬜ PENDENTE | `extension/reader/reader.html` | `065fc4e201c5` | `docs/biblia/extension/reader/reader.html/Bíblia.md` |
| 56 | ⬜ PENDENTE | `extension/reader/reader.js` | `490bbb184234` | `docs/biblia/extension/reader/reader.js/Bíblia.md` |
| 57 | ⬜ PENDENTE | `extension/shared/gtc-fingerprint.js` | `fa014028d5e2` | `docs/biblia/extension/shared/gtc-fingerprint.js/Bíblia.md` |
| 58 | ⬜ PENDENTE | `extension/shared/gtc-indexeddb.js` | `0c872f23a665` | `docs/biblia/extension/shared/gtc-indexeddb.js/Bíblia.md` |
| 59 | ⬜ PENDENTE | `extension/shared/shared-ui.js` | `b284fb8eb0e8` | `docs/biblia/extension/shared/shared-ui.js/Bíblia.md` |
| 60 | ⬜ PENDENTE | `extension/shared/storage-manager.js` | `d1cd5a2c83ed` | `docs/biblia/extension/shared/storage-manager.js/Bíblia.md` |
| 61 | ⬜ PENDENTE | `.gitignore` | `e48fc70b1acc` | `docs/biblia/.gitignore/Bíblia.md` |
| 62 | ⬜ PENDENTE | `jest.config.js` | `f0b7c55a5c8c` | `docs/biblia/jest.config.js/Bíblia.md` |
| 63 | ⬜ PENDENTE | `package.json` | `33e0b91d1a6f` | `docs/biblia/package.json/Bíblia.md` |
| 64 | ⬜ PENDENTE | `playwright.config.js` | `6a27b774a000` | `docs/biblia/playwright.config.js/Bíblia.md` |
| 65 | ⬜ PENDENTE | `.github/workflows/ci.yml` | `ebee75820db9` | `docs/biblia/.github/workflows/ci.yml/Bíblia.md` |
| 66 | ⬜ PENDENTE | `.github/workflows/publish.yml` | `f673d445a3cc` | `docs/biblia/.github/workflows/publish.yml/Bíblia.md` |
| 67 | ⬜ PENDENTE | `.github/workflows/recover-cancelled-ci.yml` | `4809f824f177` | `docs/biblia/.github/workflows/recover-cancelled-ci.yml/Bíblia.md` |
| 68 | ⬜ PENDENTE | `scripts/ci/data/e2e-shard-plan.json` | `22e8c20df9f4` | `docs/biblia/scripts/ci/data/e2e-shard-plan.json/Bíblia.md` |
| 69 | ⬜ PENDENTE | `scripts/ci/data/regression-matrix.json` | `f9b9e17e5870` | `docs/biblia/scripts/ci/data/regression-matrix.json/Bíblia.md` |
| 70 | ⬜ PENDENTE | `scripts/ci/data/test-baseline.json` | `52a4b3c1500d` | `docs/biblia/scripts/ci/data/test-baseline.json/Bíblia.md` |
| 71 | ⬜ PENDENTE | `scripts/ci/jest-worker-warning.js` | `b1379b6811e5` | `docs/biblia/scripts/ci/jest-worker-warning.js/Bíblia.md` |
| 72 | ⬜ PENDENTE | `scripts/ci/playwright-gate-reporter.js` | `71fb92c1215a` | `docs/biblia/scripts/ci/playwright-gate-reporter.js/Bíblia.md` |
| 73 | ⬜ PENDENTE | `scripts/ci/playwright-merge.config.js` | `59839922aca9` | `docs/biblia/scripts/ci/playwright-merge.config.js/Bíblia.md` |
| 74 | ⬜ PENDENTE | `scripts/ci/run-e2e-group.js` | `e23c7aaa1712` | `docs/biblia/scripts/ci/run-e2e-group.js/Bíblia.md` |
| 75 | ⬜ PENDENTE | `scripts/ci/run-jest-ci.js` | `6d2e36a647aa` | `docs/biblia/scripts/ci/run-jest-ci.js/Bíblia.md` |
| 76 | ⬜ PENDENTE | `scripts/maintenance/diagnose-background-leak.js` | `6b5a15d0d255` | `docs/biblia/scripts/maintenance/diagnose-background-leak.js/Bíblia.md` |
| 77 | ⬜ PENDENTE | `scripts/maintenance/diagnose-jest-workers.js` | `87d25d2b61cc` | `docs/biblia/scripts/maintenance/diagnose-jest-workers.js/Bíblia.md` |
| 78 | ⬜ PENDENTE | `scripts/release/sync-version.js` | `9bc8fa5ae3fb` | `docs/biblia/scripts/release/sync-version.js/Bíblia.md` |
| 79 | ⬜ PENDENTE | `scripts/validation/check-js-syntax.js` | `fbc69cf9f910` | `docs/biblia/scripts/validation/check-js-syntax.js/Bíblia.md` |
| 80 | ⬜ PENDENTE | `scripts/validation/playwright-gate-reporter-selftest.js` | `478d6673dbb6` | `docs/biblia/scripts/validation/playwright-gate-reporter-selftest.js/Bíblia.md` |
| 81 | ⬜ PENDENTE | `scripts/validation/validate-manifest.js` | `93dbb1882c69` | `docs/biblia/scripts/validation/validate-manifest.js/Bíblia.md` |
| 82 | ⬜ PENDENTE | `scripts/validation/verify-ci-contract-selftest.js` | `8d34dee0d632` | `docs/biblia/scripts/validation/verify-ci-contract-selftest.js/Bíblia.md` |
| 83 | ⬜ PENDENTE | `scripts/validation/verify-ci-contract.js` | `636e4bfbaa06` | `docs/biblia/scripts/validation/verify-ci-contract.js/Bíblia.md` |
| 84 | ⬜ PENDENTE | `scripts/validation/verify-coverage-selftest.js` | `ac08dd661f2d` | `docs/biblia/scripts/validation/verify-coverage-selftest.js/Bíblia.md` |
| 85 | ⬜ PENDENTE | `scripts/validation/verify-coverage.js` | `45f920bd2db5` | `docs/biblia/scripts/validation/verify-coverage.js/Bíblia.md` |
| 86 | ⬜ PENDENTE | `scripts/validation/verify-e2e-shard-plan.js` | `ea1149ced744` | `docs/biblia/scripts/validation/verify-e2e-shard-plan.js/Bíblia.md` |
| 87 | ⬜ PENDENTE | `scripts/validation/verify-jest-worker-warning-selftest.js` | `4c8ce078abcf` | `docs/biblia/scripts/validation/verify-jest-worker-warning-selftest.js/Bíblia.md` |
| 88 | ⬜ PENDENTE | `scripts/validation/verify-publish-contract.js` | `f5b3f6c69f85` | `docs/biblia/scripts/validation/verify-publish-contract.js/Bíblia.md` |
| 89 | ⬜ PENDENTE | `scripts/validation/verify-repository-structure.js` | `5151c7706c07` | `docs/biblia/scripts/validation/verify-repository-structure.js/Bíblia.md` |
| 90 | ⬜ PENDENTE | `scripts/validation/verify-test-policy-selftest.js` | `ac0318e4d90c` | `docs/biblia/scripts/validation/verify-test-policy-selftest.js/Bíblia.md` |
| 91 | ⬜ PENDENTE | `scripts/validation/verify-test-policy.js` | `4a8214033534` | `docs/biblia/scripts/validation/verify-test-policy.js/Bíblia.md` |
| 92 | ⬜ PENDENTE | `tests/e2e/cache-and-storage.spec.js` | `b181989a9b89` | `docs/biblia/tests/e2e/cache-and-storage.spec.js/Bíblia.md` |
| 93 | ⬜ PENDENTE | `tests/e2e/reader-offline.spec.js` | `1ab953d0a031` | `docs/biblia/tests/e2e/reader-offline.spec.js/Bíblia.md` |
| 94 | ⬜ PENDENTE | `tests/e2e/translation-flow.spec.js` | `db1da42c48ff` | `docs/biblia/tests/e2e/translation-flow.spec.js/Bíblia.md` |
| 95 | ⬜ PENDENTE | `tests/fixtures/gemini-mock-server.js` | `1cd13486bf3a` | `docs/biblia/tests/fixtures/gemini-mock-server.js/Bíblia.md` |
| 96 | ⬜ PENDENTE | `tests/fixtures/manga-images.js` | `cc4b67fe92fc` | `docs/biblia/tests/fixtures/manga-images.js/Bíblia.md` |
| 97 | ⬜ PENDENTE | `tests/fixtures/manga-page.html` | `71d78eea7edd` | `docs/biblia/tests/fixtures/manga-page.html/Bíblia.md` |
| 98 | ⬜ PENDENTE | `tests/helpers/background-test-utils.js` | `1c38cfc47917` | `docs/biblia/tests/helpers/background-test-utils.js/Bíblia.md` |
| 99 | ⬜ PENDENTE | `tests/helpers/extracted-functions.js` | `ccbf20485608` | `docs/biblia/tests/helpers/extracted-functions.js/Bíblia.md` |
| 100 | ⬜ PENDENTE | `tests/helpers/load-background-module.js` | `b1a20544a10b` | `docs/biblia/tests/helpers/load-background-module.js/Bíblia.md` |
| 101 | ⬜ PENDENTE | `tests/helpers/load-content-gemini-module.js` | `d7b72e8fd5c6` | `docs/biblia/tests/helpers/load-content-gemini-module.js/Bíblia.md` |
| 102 | ⬜ PENDENTE | `tests/helpers/load-content-script.js` | `40d7c59d81a5` | `docs/biblia/tests/helpers/load-content-script.js/Bíblia.md` |
| 103 | ⬜ PENDENTE | `tests/helpers/load-extension-page.js` | `c2325598f10b` | `docs/biblia/tests/helpers/load-extension-page.js/Bíblia.md` |
| 104 | ⬜ PENDENTE | `tests/helpers/repo-root.js` | `b2520d65820e` | `docs/biblia/tests/helpers/repo-root.js/Bíblia.md` |
| 105 | ⬜ PENDENTE | `tests/helpers/track-background-delay-timers.js` | `b7860da7879c` | `docs/biblia/tests/helpers/track-background-delay-timers.js/Bíblia.md` |
| 106 | ⬜ PENDENTE | `tests/integration/banned-images-flow.test.js` | `7624e120e7ff` | `docs/biblia/tests/integration/banned-images-flow.test.js/Bíblia.md` |
| 107 | ⬜ PENDENTE | `tests/integration/chapter-dedup.test.js` | `e62187cd957a` | `docs/biblia/tests/integration/chapter-dedup.test.js/Bíblia.md` |
| 108 | ⬜ PENDENTE | `tests/integration/gtc-end-to-end.test.js` | `9042b3b5370a` | `docs/biblia/tests/integration/gtc-end-to-end.test.js/Bíblia.md` |
| 109 | ⬜ PENDENTE | `tests/integration/ipc/gemini-cors-fallback.test.js` | `1f5a1236139d` | `docs/biblia/tests/integration/ipc/gemini-cors-fallback.test.js/Bíblia.md` |
| 110 | ⬜ PENDENTE | `tests/integration/ipc/gtc-cache-flow.test.js` | `e6eb5c744499` | `docs/biblia/tests/integration/ipc/gtc-cache-flow.test.js/Bíblia.md` |
| 111 | ⬜ PENDENTE | `tests/integration/ipc/gtc-indexeddb-deep.test.js` | `39d0542f9bad` | `docs/biblia/tests/integration/ipc/gtc-indexeddb-deep.test.js/Bíblia.md` |
| 112 | ⬜ PENDENTE | `tests/integration/ipc/image-translation-routing.test.js` | `4f1674c12311` | `docs/biblia/tests/integration/ipc/image-translation-routing.test.js/Bíblia.md` |
| 113 | ⬜ PENDENTE | `tests/integration/options.ui.test.js` | `33c34c89f713` | `docs/biblia/tests/integration/options.ui.test.js/Bíblia.md` |
| 114 | ⬜ PENDENTE | `tests/integration/performance.test.js` | `a2e759feddd0` | `docs/biblia/tests/integration/performance.test.js/Bíblia.md` |
| 115 | ⬜ PENDENTE | `tests/integration/popup-translated-thumbnails.test.js` | `7e4fea854647` | `docs/biblia/tests/integration/popup-translated-thumbnails.test.js/Bíblia.md` |
| 116 | ⬜ PENDENTE | `tests/integration/popup.advanced.ui.test.js` | `dd15edcefd59` | `docs/biblia/tests/integration/popup.advanced.ui.test.js/Bíblia.md` |
| 117 | ⬜ PENDENTE | `tests/integration/popup.ui.test.js` | `57158c9b6e6f` | `docs/biblia/tests/integration/popup.ui.test.js/Bíblia.md` |
| 118 | ⬜ PENDENTE | `tests/integration/reader.ui.test.js` | `810a207f1264` | `docs/biblia/tests/integration/reader.ui.test.js/Bíblia.md` |
| 119 | ⬜ PENDENTE | `tests/mocks/chrome-api.mock.js` | `c1d9a056b777` | `docs/biblia/tests/mocks/chrome-api.mock.js/Bíblia.md` |
| 120 | ⬜ PENDENTE | `tests/mocks/dom-environment.js` | `9c3bc91608aa` | `docs/biblia/tests/mocks/dom-environment.js/Bíblia.md` |
| 121 | ⬜ PENDENTE | `tests/setup/create-test-images.js` | `f35e7896ffb5` | `docs/biblia/tests/setup/create-test-images.js/Bíblia.md` |
| 122 | ⬜ PENDENTE | `tests/smoke/run-smoke.js` | `ea6fa903f7a6` | `docs/biblia/tests/smoke/run-smoke.js/Bíblia.md` |
| 123 | ⬜ PENDENTE | `tests/smoke/smoke-01-batch-lifecycle.js` | `c412ccaac3c0` | `docs/biblia/tests/smoke/smoke-01-batch-lifecycle.js/Bíblia.md` |
| 124 | ⬜ PENDENTE | `tests/smoke/smoke-02-uuid-and-reconcile.js` | `d977f43a4b29` | `docs/biblia/tests/smoke/smoke-02-uuid-and-reconcile.js/Bíblia.md` |
| 125 | ⬜ PENDENTE | `tests/smoke/smoke-03-chapter-persistence.js` | `63f904d8ad55` | `docs/biblia/tests/smoke/smoke-03-chapter-persistence.js/Bíblia.md` |
| 126 | ⬜ PENDENTE | `tests/smoke/smoke-04-storage-manager.js` | `0ba92d74356c` | `docs/biblia/tests/smoke/smoke-04-storage-manager.js/Bíblia.md` |
| 127 | ⬜ PENDENTE | `tests/smoke/smoke-05-perceptual-queries.js` | `bf8409c3df43` | `docs/biblia/tests/smoke/smoke-05-perceptual-queries.js/Bíblia.md` |
| 128 | ⬜ PENDENTE | `tests/smoke/smoke-06-sm-message-routing.js` | `dd32621bee49` | `docs/biblia/tests/smoke/smoke-06-sm-message-routing.js/Bíblia.md` |
| 129 | ⬜ PENDENTE | `tests/unit/background/actions-low-risk.test.js` | `e5d4d54674b5` | `docs/biblia/tests/unit/background/actions-low-risk.test.js/Bíblia.md` |
| 130 | ⬜ PENDENTE | `tests/unit/background/background-strict-load.test.js` | `25a663f527f7` | `docs/biblia/tests/unit/background/background-strict-load.test.js/Bíblia.md` |
| 131 | ⬜ PENDENTE | `tests/unit/background/batch-actions.test.js` | `113344a0e8db` | `docs/biblia/tests/unit/background/batch-actions.test.js/Bíblia.md` |
| 132 | ⬜ PENDENTE | `tests/unit/background/batch-lifecycle-real.test.js` | `1368df4b1fdb` | `docs/biblia/tests/unit/background/batch-lifecycle-real.test.js/Bíblia.md` |
| 133 | ⬜ PENDENTE | `tests/unit/background/calculate-visual-fingerprint-action.test.js` | `f51a0b629ac1` | `docs/biblia/tests/unit/background/calculate-visual-fingerprint-action.test.js/Bíblia.md` |
| 134 | ⬜ PENDENTE | `tests/unit/background/chrome-runtime-mock-lifecycle.test.js` | `1bd33ea5e027` | `docs/biblia/tests/unit/background/chrome-runtime-mock-lifecycle.test.js/Bíblia.md` |
| 135 | ⬜ PENDENTE | `tests/unit/background/claim-gemini-job-action.test.js` | `0cb6cb2f100d` | `docs/biblia/tests/unit/background/claim-gemini-job-action.test.js/Bíblia.md` |
| 136 | ⬜ PENDENTE | `tests/unit/background/commit-result-action.test.js` | `1a185784edd1` | `docs/biblia/tests/unit/background/commit-result-action.test.js/Bíblia.md` |
| 137 | ⬜ PENDENTE | `tests/unit/background/deliver-result-action.test.js` | `654194bf502f` | `docs/biblia/tests/unit/background/deliver-result-action.test.js/Bíblia.md` |
| 138 | ⬜ PENDENTE | `tests/unit/background/deliver-result-from-tab-action.test.js` | `263cb827e304` | `docs/biblia/tests/unit/background/deliver-result-from-tab-action.test.js/Bíblia.md` |
| 139 | ⬜ PENDENTE | `tests/unit/background/deliver-result-url-action.test.js` | `09a0f891434b` | `docs/biblia/tests/unit/background/deliver-result-url-action.test.js/Bíblia.md` |
| 140 | ⬜ PENDENTE | `tests/unit/background/download-chapter-action.test.js` | `ff0ecb6249b2` | `docs/biblia/tests/unit/background/download-chapter-action.test.js/Bíblia.md` |
| 141 | ⬜ PENDENTE | `tests/unit/background/download-image-action.test.js` | `9305ba72e1d6` | `docs/biblia/tests/unit/background/download-image-action.test.js/Bíblia.md` |
| 142 | ⬜ PENDENTE | `tests/unit/background/download-wait.test.js` | `1bb13ac03ab0` | `docs/biblia/tests/unit/background/download-wait.test.js/Bíblia.md` |
| 143 | ⬜ PENDENTE | `tests/unit/background/export-all-action.test.js` | `9ab092d95ac1` | `docs/biblia/tests/unit/background/export-all-action.test.js/Bíblia.md` |
| 144 | ⬜ PENDENTE | `tests/unit/background/export-guard.test.js` | `4a34bd498d62` | `docs/biblia/tests/unit/background/export-guard.test.js/Bíblia.md` |
| 145 | ⬜ PENDENTE | `tests/unit/background/fetch-image-base64-action.test.js` | `1246da7bd399` | `docs/biblia/tests/unit/background/fetch-image-base64-action.test.js/Bíblia.md` |
| 146 | ⬜ PENDENTE | `tests/unit/background/force-send-activation-action.test.js` | `cab687a5e5d5` | `docs/biblia/tests/unit/background/force-send-activation-action.test.js/Bíblia.md` |
| 147 | ⬜ PENDENTE | `tests/unit/background/gtc-runtime-bridge.test.js` | `21c01d044af7` | `docs/biblia/tests/unit/background/gtc-runtime-bridge.test.js/Bíblia.md` |
| 148 | ⬜ PENDENTE | `tests/unit/background/handlers-extra-real.test.js` | `2089f42642fc` | `docs/biblia/tests/unit/background/handlers-extra-real.test.js/Bíblia.md` |
| 149 | ⬜ PENDENTE | `tests/unit/background/helpers-real.test.js` | `668cef7f5922` | `docs/biblia/tests/unit/background/helpers-real.test.js/Bíblia.md` |
| 150 | ⬜ PENDENTE | `tests/unit/background/jobs-dom-ack-staging.test.js` | `5db47daff530` | `docs/biblia/tests/unit/background/jobs-dom-ack-staging.test.js/Bíblia.md` |
| 151 | ⬜ PENDENTE | `tests/unit/background/jobs-lifecycle-batch-status.test.js` | `820f8c87379f` | `docs/biblia/tests/unit/background/jobs-lifecycle-batch-status.test.js/Bíblia.md` |
| 152 | ⬜ PENDENTE | `tests/unit/background/jobs-reconciliation-batch-queue.test.js` | `032df2351f2a` | `docs/biblia/tests/unit/background/jobs-reconciliation-batch-queue.test.js/Bíblia.md` |
| 153 | ⬜ PENDENTE | `tests/unit/background/jobs-watchdog-ordering.test.js` | `2102182a1e31` | `docs/biblia/tests/unit/background/jobs-watchdog-ordering.test.js/Bíblia.md` |
| 154 | ⬜ PENDENTE | `tests/unit/background/lifecycle-alarms-real.test.js` | `1d4c22ba9a78` | `docs/biblia/tests/unit/background/lifecycle-alarms-real.test.js/Bíblia.md` |
| 155 | ⬜ PENDENTE | `tests/unit/background/marker-anchor-real.test.js` | `6a6c977a1a2b` | `docs/biblia/tests/unit/background/marker-anchor-real.test.js/Bíblia.md` |
| 156 | ⬜ PENDENTE | `tests/unit/background/message-handlers-real.test.js` | `1c2815cd1f2f` | `docs/biblia/tests/unit/background/message-handlers-real.test.js/Bíblia.md` |
| 157 | ⬜ PENDENTE | `tests/unit/background/open-existing-folder-action.test.js` | `49b6cd110eba` | `docs/biblia/tests/unit/background/open-existing-folder-action.test.js/Bíblia.md` |
| 158 | ⬜ PENDENTE | `tests/unit/background/open-manga-root-action.test.js` | `fd34ec27189d` | `docs/biblia/tests/unit/background/open-manga-root-action.test.js/Bíblia.md` |
| 159 | ⬜ PENDENTE | `tests/unit/background/plan-missing-handlers-real.test.js` | `9f8c6e4a8825` | `docs/biblia/tests/unit/background/plan-missing-handlers-real.test.js/Bíblia.md` |
| 160 | ⬜ PENDENTE | `tests/unit/background/process-finalize-real.test.js` | `abb1b936fadf` | `docs/biblia/tests/unit/background/process-finalize-real.test.js/Bíblia.md` |
| 161 | ⬜ PENDENTE | `tests/unit/background/refresh-job-watchdog-action.test.js` | `d2acd697b788` | `docs/biblia/tests/unit/background/refresh-job-watchdog-action.test.js/Bíblia.md` |
| 162 | ⬜ PENDENTE | `tests/unit/background/regex-escape.test.js` | `3707482c0137` | `docs/biblia/tests/unit/background/regex-escape.test.js/Bíblia.md` |
| 163 | ⬜ PENDENTE | `tests/unit/background/report-error-action.test.js` | `507406dfbbc2` | `docs/biblia/tests/unit/background/report-error-action.test.js/Bíblia.md` |
| 164 | ⬜ PENDENTE | `tests/unit/background/request-image-data-action.test.js` | `b04cd6cac533` | `docs/biblia/tests/unit/background/request-image-data-action.test.js/Bíblia.md` |
| 165 | ⬜ PENDENTE | `tests/unit/background/routed-actions-legacy.test.js` | `62d534355ac8` | `docs/biblia/tests/unit/background/routed-actions-legacy.test.js/Bíblia.md` |
| 166 | ⬜ PENDENTE | `tests/unit/background/router.test.js` | `d7c33bc525e1` | `docs/biblia/tests/unit/background/router.test.js/Bíblia.md` |
| 167 | ⬜ PENDENTE | `tests/unit/background/single-image-context-menu.test.js` | `c4e122e3fd2a` | `docs/biblia/tests/unit/background/single-image-context-menu.test.js/Bíblia.md` |
| 168 | ⬜ PENDENTE | `tests/unit/background/startup-recovery.test.js` | `649829ac36bb` | `docs/biblia/tests/unit/background/startup-recovery.test.js/Bíblia.md` |
| 169 | ⬜ PENDENTE | `tests/unit/background/state-api.test.js` | `d9c080339202` | `docs/biblia/tests/unit/background/state-api.test.js/Bíblia.md` |
| 170 | ⬜ PENDENTE | `tests/unit/background/tab-identity.test.js` | `1f2dd5251303` | `docs/biblia/tests/unit/background/tab-identity.test.js/Bíblia.md` |
| 171 | ⬜ PENDENTE | `tests/unit/background/tab-replacement-observability.test.js` | `b5aeb216f48e` | `docs/biblia/tests/unit/background/tab-replacement-observability.test.js/Bíblia.md` |
| 172 | ⬜ PENDENTE | `tests/unit/background/test_bg59.test.js` | `ae96b1427174` | `docs/biblia/tests/unit/background/test_bg59.test.js/Bíblia.md` |
| 173 | ⬜ PENDENTE | `tests/unit/background/version-sync.test.js` | `45927901e904` | `docs/biblia/tests/unit/background/version-sync.test.js/Bíblia.md` |
| 174 | ⬜ PENDENTE | `tests/unit/content-gemini/attachment.test.js` | `43d4591bc9ff` | `docs/biblia/tests/unit/content-gemini/attachment.test.js/Bíblia.md` |
| 175 | ⬜ PENDENTE | `tests/unit/content-gemini/claim-bootstrap-keepalive.test.js` | `6e6adc2747b0` | `docs/biblia/tests/unit/content-gemini/claim-bootstrap-keepalive.test.js/Bíblia.md` |
| 176 | ⬜ PENDENTE | `tests/unit/content-gemini/deletion.test.js` | `c570bbdc3407` | `docs/biblia/tests/unit/content-gemini/deletion.test.js/Bíblia.md` |
| 177 | ⬜ PENDENTE | `tests/unit/content-gemini/dom-modules.test.js` | `32441920c27f` | `docs/biblia/tests/unit/content-gemini/dom-modules.test.js/Bíblia.md` |
| 178 | ⬜ PENDENTE | `tests/unit/content-gemini/editor-submit.test.js` | `ccfa4c881543` | `docs/biblia/tests/unit/content-gemini/editor-submit.test.js/Bíblia.md` |
| 179 | ⬜ PENDENTE | `tests/unit/content-gemini/helpers-and-regressions-real.test.js` | `65c66f1a756d` | `docs/biblia/tests/unit/content-gemini/helpers-and-regressions-real.test.js/Bíblia.md` |
| 180 | ⬜ PENDENTE | `tests/unit/content-gemini/image-quarantine.test.js` | `b2c73b79c882` | `docs/biblia/tests/unit/content-gemini/image-quarantine.test.js/Bíblia.md` |
| 181 | ⬜ PENDENTE | `tests/unit/content-gemini/job-runner.test.js` | `feae92421dd9` | `docs/biblia/tests/unit/content-gemini/job-runner.test.js/Bíblia.md` |
| 182 | ⬜ PENDENTE | `tests/unit/content-gemini/manual-assist-hud.test.js` | `14f53ac3c5a9` | `docs/biblia/tests/unit/content-gemini/manual-assist-hud.test.js/Bíblia.md` |
| 183 | ⬜ PENDENTE | `tests/unit/content-gemini/observer.test.js` | `0eff259f673c` | `docs/biblia/tests/unit/content-gemini/observer.test.js/Bíblia.md` |
| 184 | ⬜ PENDENTE | `tests/unit/content-gemini/plan-rpa-edge-cases.test.js` | `81e21c6e245e` | `docs/biblia/tests/unit/content-gemini/plan-rpa-edge-cases.test.js/Bíblia.md` |
| 185 | ⬜ PENDENTE | `tests/unit/content-gemini/resolution-elevation.test.js` | `a8ef465959d2` | `docs/biblia/tests/unit/content-gemini/resolution-elevation.test.js/Bíblia.md` |
| 186 | ⬜ PENDENTE | `tests/unit/content-gemini/result-extractor.test.js` | `611df28380a8` | `docs/biblia/tests/unit/content-gemini/result-extractor.test.js/Bíblia.md` |
| 187 | ⬜ PENDENTE | `tests/unit/content-gemini/rpa-flow.test.js` | `4bcd24983325` | `docs/biblia/tests/unit/content-gemini/rpa-flow.test.js/Bíblia.md` |
| 188 | ⬜ PENDENTE | `tests/unit/content-gemini/safe-background-delete.test.js` | `cf85ff00f7cc` | `docs/biblia/tests/unit/content-gemini/safe-background-delete.test.js/Bíblia.md` |
| 189 | ⬜ PENDENTE | `tests/unit/content-gemini/temp-chat-activator.test.js` | `f9418a4301c9` | `docs/biblia/tests/unit/content-gemini/temp-chat-activator.test.js/Bíblia.md` |
| 190 | ⬜ PENDENTE | `tests/unit/content-gemini/temporary-chat-v2.test.js` | `bdf7146fac7f` | `docs/biblia/tests/unit/content-gemini/temporary-chat-v2.test.js/Bíblia.md` |
| 191 | ⬜ PENDENTE | `tests/unit/content-manga/audio-synthesis-full.test.js` | `e53e43da4f20` | `docs/biblia/tests/unit/content-manga/audio-synthesis-full.test.js/Bíblia.md` |
| 192 | ⬜ PENDENTE | `tests/unit/content-manga/audio-synthesis.test.js` | `f47b6cf91846` | `docs/biblia/tests/unit/content-manga/audio-synthesis.test.js/Bíblia.md` |
| 193 | ⬜ PENDENTE | `tests/unit/content-manga/auto-restore-system.test.js` | `3aa7a39030ab` | `docs/biblia/tests/unit/content-manga/auto-restore-system.test.js/Bíblia.md` |
| 194 | ⬜ PENDENTE | `tests/unit/content-manga/auto-restorer-real.test.js` | `cf792733e62f` | `docs/biblia/tests/unit/content-manga/auto-restorer-real.test.js/Bíblia.md` |
| 195 | ⬜ PENDENTE | `tests/unit/content-manga/button-ui-real.test.js` | `a82baea685c1` | `docs/biblia/tests/unit/content-manga/button-ui-real.test.js/Bíblia.md` |
| 196 | ⬜ PENDENTE | `tests/unit/content-manga/canonical-title-full.test.js` | `1b46903dbe4a` | `docs/biblia/tests/unit/content-manga/canonical-title-full.test.js/Bíblia.md` |
| 197 | ⬜ PENDENTE | `tests/unit/content-manga/canonical-title.test.js` | `bfb01bdfb8de` | `docs/biblia/tests/unit/content-manga/canonical-title.test.js/Bíblia.md` |
| 198 | ⬜ PENDENTE | `tests/unit/content-manga/chapter-id-cache.test.js` | `7bc23a456be6` | `docs/biblia/tests/unit/content-manga/chapter-id-cache.test.js/Bíblia.md` |
| 199 | ⬜ PENDENTE | `tests/unit/content-manga/chapter-id-rejection.test.js` | `783c8abd8602` | `docs/biblia/tests/unit/content-manga/chapter-id-rejection.test.js/Bíblia.md` |
| 200 | ⬜ PENDENTE | `tests/unit/content-manga/close-interval.test.js` | `e9bcb9c92671` | `docs/biblia/tests/unit/content-manga/close-interval.test.js/Bíblia.md` |
| 201 | ⬜ PENDENTE | `tests/unit/content-manga/drawer-real.test.js` | `eeebbd56fe1a` | `docs/biblia/tests/unit/content-manga/drawer-real.test.js/Bíblia.md` |
| 202 | ⬜ PENDENTE | `tests/unit/content-manga/extract-flow-real.test.js` | `1bbc481d426b` | `docs/biblia/tests/unit/content-manga/extract-flow-real.test.js/Bíblia.md` |
| 203 | ⬜ PENDENTE | `tests/unit/content-manga/extraction-and-handlers-real.test.js` | `038961e8228c` | `docs/biblia/tests/unit/content-manga/extraction-and-handlers-real.test.js/Bíblia.md` |
| 204 | ⬜ PENDENTE | `tests/unit/content-manga/floating-button-guard-and-single-click.test.js` | `8e8aacd0fc54` | `docs/biblia/tests/unit/content-manga/floating-button-guard-and-single-click.test.js/Bíblia.md` |
| 205 | ⬜ PENDENTE | `tests/unit/content-manga/get-clean-url.test.js` | `a04fe1e3552d` | `docs/biblia/tests/unit/content-manga/get-clean-url.test.js/Bíblia.md` |
| 206 | ⬜ PENDENTE | `tests/unit/content-manga/get-page-images-filter.test.js` | `d48888d1237e` | `docs/biblia/tests/unit/content-manga/get-page-images-filter.test.js/Bíblia.md` |
| 207 | ⬜ PENDENTE | `tests/unit/content-manga/image-filtering.test.js` | `a187a4c6e681` | `docs/biblia/tests/unit/content-manga/image-filtering.test.js/Bíblia.md` |
| 208 | ⬜ PENDENTE | `tests/unit/content-manga/image-fingerprint.test.js` | `e4e553c77027` | `docs/biblia/tests/unit/content-manga/image-fingerprint.test.js/Bíblia.md` |
| 209 | ⬜ PENDENTE | `tests/unit/content-manga/replacement-and-completion-real.test.js` | `9dcd26cf4a96` | `docs/biblia/tests/unit/content-manga/replacement-and-completion-real.test.js/Bíblia.md` |
| 210 | ⬜ PENDENTE | `tests/unit/content-manga/twin-backdrop-sync.test.js` | `5d2151b3673a` | `docs/biblia/tests/unit/content-manga/twin-backdrop-sync.test.js/Bíblia.md` |
| 211 | ⬜ PENDENTE | `tests/unit/gtc/fingerprint.test.js` | `5255083ff288` | `docs/biblia/tests/unit/gtc/fingerprint.test.js/Bíblia.md` |
| 212 | ⬜ PENDENTE | `tests/unit/gtc/indexeddb.test.js` | `30af6c23b546` | `docs/biblia/tests/unit/gtc/indexeddb.test.js/Bíblia.md` |
| 213 | ⬜ PENDENTE | `tests/unit/inject/inject-anti-hibernation.test.js` | `22cc82c2ea7b` | `docs/biblia/tests/unit/inject/inject-anti-hibernation.test.js/Bíblia.md` |
| 214 | ⬜ PENDENTE | `tests/unit/inject/raf-replacement.test.js` | `8b9e1c19b395` | `docs/biblia/tests/unit/inject/raf-replacement.test.js/Bíblia.md` |
| 215 | ⬜ PENDENTE | `tests/unit/inject/visibility-spoof.test.js` | `e94a89c7a69a` | `docs/biblia/tests/unit/inject/visibility-spoof.test.js/Bíblia.md` |
| 216 | ⬜ PENDENTE | `tests/unit/manifest/surface-reduction.test.js` | `d5bde042b414` | `docs/biblia/tests/unit/manifest/surface-reduction.test.js/Bíblia.md` |
| 217 | ⬜ PENDENTE | `tests/unit/popup/dynamic-button.test.js` | `4f4dea1b4897` | `docs/biblia/tests/unit/popup/dynamic-button.test.js/Bíblia.md` |
| 218 | ⬜ PENDENTE | `tests/unit/popup/log-exporter.test.js` | `3983f9d428ba` | `docs/biblia/tests/unit/popup/log-exporter.test.js/Bíblia.md` |
| 219 | ⬜ PENDENTE | `tests/unit/popup/progress-panel.test.js` | `d93235bdd142` | `docs/biblia/tests/unit/popup/progress-panel.test.js/Bíblia.md` |
| 220 | ⬜ PENDENTE | `tests/unit/popup/resize-and-tabs.test.js` | `d611cadbdfc9` | `docs/biblia/tests/unit/popup/resize-and-tabs.test.js/Bíblia.md` |
| 221 | ⬜ PENDENTE | `tests/unit/popup/version-ui.test.js` | `0fcb923f59ef` | `docs/biblia/tests/unit/popup/version-ui.test.js/Bíblia.md` |
| 222 | ⬜ PENDENTE | `tests/unit/reader/keyboard-nav.test.js` | `0d64775426e2` | `docs/biblia/tests/unit/reader/keyboard-nav.test.js/Bíblia.md` |
| 223 | ⬜ PENDENTE | `tests/unit/reader/page-counter.test.js` | `cec252ffefc2` | `docs/biblia/tests/unit/reader/page-counter.test.js/Bíblia.md` |
| 224 | ⬜ PENDENTE | `tests/unit/shared-ui/redo-confirmation.test.js` | `2b46e876c3f8` | `docs/biblia/tests/unit/shared-ui/redo-confirmation.test.js/Bíblia.md` |
| 225 | ⬜ PENDENTE | `tests/visual/background-fingerprint.visual.js` | `91f5cf4d9ed4` | `docs/biblia/tests/visual/background-fingerprint.visual.js/Bíblia.md` |
| 226 | ⬜ PENDENTE | `tests/visual/content-manga-pipeline.visual.js` | `61bc86351c91` | `docs/biblia/tests/visual/content-manga-pipeline.visual.js/Bíblia.md` |
| 227 | ⬜ PENDENTE | `tests/visual/crop.visual.js` | `432fe488697a` | `docs/biblia/tests/visual/crop.visual.js/Bíblia.md` |
| 228 | ⬜ PENDENTE | `tests/visual/gtc-fingerprint.visual.js` | `fb66d9d8eb41` | `docs/biblia/tests/visual/gtc-fingerprint.visual.js/Bíblia.md` |
| 229 | ⬜ PENDENTE | `tests/visual/gtc-indexeddb.visual.js` | `0f5ca8e043a0` | `docs/biblia/tests/visual/gtc-indexeddb.visual.js/Bíblia.md` |
| 230 | ⬜ PENDENTE | `tests/visual/helpers.js` | `8d740eb3ee27` | `docs/biblia/tests/visual/helpers.js/Bíblia.md` |
| 231 | ⬜ PENDENTE | `tests/visual/integration.visual.js` | `2407ce31e6c1` | `docs/biblia/tests/visual/integration.visual.js/Bíblia.md` |
| 232 | ⬜ PENDENTE | `tests/visual/run-all.js` | `2a5542167543` | `docs/biblia/tests/visual/run-all.js/Bíblia.md` |
| 233 | ⬜ PENDENTE | `tests/visual/runner.js` | `fe34764874ca` | `docs/biblia/tests/visual/runner.js/Bíblia.md` |

## Regra de continuidade

1. Ler `AUDITORIA.md`, `STATUS.md` e `CHECKLIST.md`.
2. Trabalhar somente no único `🟠 EM ANDAMENTO`.
3. Se ele estiver em revisão, corrigir a Bíblia existente; não criar outra.
4. Reauditar contra fonte e assertions reais.
5. Somente após aprovação: mudar para `✅ CONCLUÍDO` e marcar `[x]`.
6. Mover `🟠 EM ANDAMENTO` para o próximo item em revisão; somente quando não restar revisão voltar aos arquivos novos.
7. Publicar no chat o resultado de cada reauditoria/conclusão.

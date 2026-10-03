# Status — Bíblia técnica por arquivo

> View de compatibilidade gerada deterministicamente a partir de .state/*.json, AUDITORIA.md legado e filesystem; resultados distribuídos são reconciliados em lote.

## Snapshot

- total: **233**
- materializadas: **233**
- PENDING: **0**
- IN_PROGRESS: **0**
- READY_FOR_AUDIT: **44**
- CHANGES_REQUIRED: **72**
- HUMAN_LOCKED: **0**
- BLOCKED: **0**
- COMPLETED: **117**
- requests OPEN: **0**
- requests ACCEPTED: **551**
- requests RESOLVED: **71**
- requests REJECTED: **1**
- requests SUPERSEDED: **65**
- snapshot/HEAD: `states-v2`

## Itens

| # | arquivo | status | revisão | qualidade | auditoria | owner | SHA | requests |
|---:|---|---|---|---|---|---|---|---:|
| 001 | extension/manifest.json | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | c830ce3a8baac3d49268e64ae4e8218144f3ef2e | 2 |
| 002 | extension/background.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | 667c05eb2d7adfca16a79d3e706c39a1e9398b72 | 9 |
| 003 | extension/background/actions/calculate-visual-fingerprint.js | COMPLETED | IN_PROGRESS | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED","IN_PROGRESS"]} | CHANGES_REQUIRED | AGENTE 2 | ea474845cf9c6a6784e3ceb75298f0ac8df86e06 | 3 |
| 004 | extension/background/actions/check-extraction-tab.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 18640c20e3ba872c18e81ec4ec7d7357d16fd958 | 2 |
| 005 | extension/background/actions/claim-gemini-job.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_ADVERSARIAL"]} | WAITING_ADVERSARIAL | - | f5c4643d291931f133a791a2deaa6eb94ef4500d | 2 |
| 006 | extension/background/actions/commit-result.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_ADVERSARIAL"]} | WAITING_ADVERSARIAL | - | 32270d1c4ade42b7e6decd5ef124d71745c2a5b0 | 2 |
| 007 | extension/background/actions/deliver-result-from-tab.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 59543c1359669ced02a1d05c251b272abaad6709 | 4 |
| 008 | extension/background/actions/deliver-result-url.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 91c50efe4764f56aac16aec2c91309e06db7d0ac | 3 |
| 009 | extension/background/actions/deliver-result.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 3653bd10c2a0e65c14eb139f906feeafb30411a5 | 3 |
| 010 | extension/background/actions/download-chapter.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 8636a03c8a2038ebbb26103db7f63b578699733e | 2 |
| 011 | extension/background/actions/download-image.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 408102f057ab6a584314e9108b9f4329440204bb | 2 |
| 012 | extension/background/actions/export-all.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 6160a220094dd14b3fef760570dec8ae37a32244 | 2 |
| 013 | extension/background/actions/fetch-image-base64.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 4a4825c36fdbe630e80dd7fba1341bdc7a06aecf | 2 |
| 014 | extension/background/actions/force-send-activation.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | cbeea5768301008e363a087a1daf636deabb9076 | 2 |
| 015 | extension/background/actions/get-tab-id.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 2f3b26304ac12a671927b1abefc2a914d7eaa372 | 0 |
| 016 | extension/background/actions/log-entry.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | d57e1a25531beca36510928564ffd855f607881b | 2 |
| 017 | extension/background/actions/open-existing-folder.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 59ef82cbf960e360eb404fbd969067f017021607 | 1 |
| 018 | extension/background/actions/open-manga-root.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 71c83df253cdac601a118104fc1d7e467f35bfd6 | 2 |
| 019 | extension/background/actions/refresh-job-watchdog.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 25f86a8dba57c25a11a234c8f1ded0c3871d2aaa | 2 |
| 020 | extension/background/actions/relay-progress.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 24e377893c7151ea0579964453bfc63ce0ed77f4 | 2 |
| 021 | extension/background/actions/report-error.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | ac239ea495448dbb09ec1204247fc8c0c48e6289 | 2 |
| 022 | extension/background/actions/request-image-data.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 2491262323966a256d61d741e9c23420acccee2f | 1 |
| 023 | extension/background/actions/set-debug-mode.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 92e4149b1bba2f8d0a4ce3d6881539565801776d | 0 |
| 024 | extension/background/actions/start-batch.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | b0ef70bf1c23f97c3fd8c9a1c82483f712b96dc3 | 2 |
| 025 | extension/background/actions/stop-batch.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | e552d0a911092c5cd7e457fbe262d366c413f0c1 | 1 |
| 026 | extension/background/jobs-dom-ack.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | abbf440fd4cd8db415f991235aab0f59a9dbe58e | 3 |
| 027 | extension/background/jobs-lifecycle.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | e4ab9f6c54725a5a8e3f5f3c0e1cbd7a0e1c87e5 | 5 |
| 028 | extension/background/jobs-reconciliation.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | f0f2370ba6b7523caebf028c9188cebd7189d650 | 3 |
| 029 | extension/background/jobs-watchdog.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | c17b766d7fbc34ea925fb82b19149d3d977de413 | 3 |
| 030 | extension/background/log.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 86d5f2f1229b2c9ae7f980fad1495628a05222ca | 3 |
| 031 | extension/background/router.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | d9278e9e58e4e9583a30c16227bfd833e7203d89 | 3 |
| 032 | extension/background/state.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | 7570b545d5e92496201a7741dee8605cd66fb015 | 4 |
| 033 | extension/background/tab-identity.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | 008c9a054ae417e0f31224617346e24fc9dbc1b4 | 6 |
| 034 | extension/content/cm-auto-restore.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | d20e7092652e484d2299345cfd7eeb3afdd34750 | 4 |
| 035 | extension/content/cm-chapter.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | d20ae2ff4ed59d2c29c3aefc63160182f7ec8111 | 3 |
| 036 | extension/content/cm-dom-replace.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | d3fc72032dbddc81eae8fadc5e4da89b13a3bb79 | 3 |
| 037 | extension/content/cm-gtc-client.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | b7bb841499a9e677f9709f0c634c648ac6a0f65b | 3 |
| 038 | extension/content/content_gemini.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 55bc83afe31a10c53f39799717f2f221b6919029 | 4 |
| 039 | extension/content/content_manga.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | bb7315a7236c0ae2b702dfbd6b7ab70af47f0b91 | 4 |
| 040 | extension/content/gemini/attachment.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 50092e4d7d71994f91236d271d3418507f10eade | 3 |
| 041 | extension/content/gemini/deletion.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 2cec17f19e5293245b5e2f37493f0ef485b7281f | 2 |
| 042 | extension/content/gemini/dom.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | d3694ea70cdd97b64e483884895a458993791714 | 3 |
| 043 | extension/content/gemini/editor.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 0adbd4374758095acd84eda56522a2eb2c64fb1b | 2 |
| 044 | extension/content/gemini/image-quarantine.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | ddca93d17ca2934a9e95dba96a87283be4e9b9a3 | 3 |
| 045 | extension/content/gemini/job-runner.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 1b16fd656e82e64ef2d26977e061f87e469aa3ff | 12 |
| 046 | extension/content/gemini/observer.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 59c5335e1b4fd6b2877988cde9816f1c0b290b35 | 2 |
| 047 | extension/content/gemini/result-extractor.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | a3efd499a0b090f12701533a96f2602bf29bbcbb | 12 |
| 048 | extension/content/gemini/selectors.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 0bf8db6e416a880de9f4dd37bd4cc290e5aaba19 | 2 |
| 049 | extension/content/gemini/temporary-chat.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 40fbc8dc6acf6ae21dc5854aae3f14bfc029e3bc | 2 |
| 050 | extension/content/inject.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 21f7f6cf9c940a6de6e4fd72d4bf7eeb88e7a27c | 12 |
| 051 | extension/options/options.html | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 3ca95e66641d2884fa653f25f7bedbb2a8ac3b2b | 2 |
| 052 | extension/options/options.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | f69f132c0ef653cded49887a60724b84dfa2b6c9 | 3 |
| 053 | extension/popup/popup.html | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 05972d0fa1161a5182e0b11185a390582a720f90 | 0 |
| 054 | extension/popup/popup.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 1192f46e61b11f59199d68b9e0830f442a3852a3 | 4 |
| 055 | extension/reader/reader.html | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 065fc4e201c5661ffafa0de8626940929420ad3f | 2 |
| 056 | extension/reader/reader.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | 490bbb1842348e792cd593c37699a822d81f555b | 0 |
| 057 | extension/shared/gtc-fingerprint.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | fa014028d5e2ec9d9ca5d05c1199e1f6c45a2198 | 0 |
| 058 | extension/shared/gtc-indexeddb.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 0c872f23a665304b46dc2bb43c6468762feb2e31 | 1 |
| 059 | extension/shared/shared-ui.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | b284fb8eb0e8d30f34dc83642f07916d20012bf0 | 1 |
| 060 | extension/shared/storage-manager.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | f4e1e231fa62d22dd50fb20cf0cffbb09da98bee | 3 |
| 061 | .gitignore | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | e48fc70b1acc14aabb245f0db1820bc6c7a2849e | 2 |
| 062 | jest.config.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED","CHANGES_REQUIRED"]} | REAUDIT_REQUIRED | - | f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc | 2 |
| 063 | package.json | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | ec3fb5c66cf49e34108eba1ef995eaf3dce1b304 | 3 |
| 064 | playwright.config.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | 6a27b774a0009db800a70969eaad18716fb5f565 | 4 |
| 065 | .github/workflows/ci.yml | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_PRIMARY | - | 9296c4f00174278e43ea811fe617badbd6ee11eb | 1 |
| 066 | .github/workflows/publish.yml | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | f673d445a3cc022d473f9b59ae1e0c8972ecd013 | 5 |
| 067 | .github/workflows/recover-cancelled-ci.yml | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | 4809f824f177e93686c11270793eb672aee5952b | 3 |
| 068 | scripts/ci/data/e2e-shard-plan.json | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 2df6bf7c323d28595d258249a9c6f4bfa25c6b1f | 3 |
| 069 | scripts/ci/data/regression-matrix.json | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | f9b9e17e5870c0c6dff9394ef944a803414cc4d2 | 3 |
| 070 | scripts/ci/data/test-baseline.json | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 0817d79101c6c3bf6f92fed5f793f0bed8746f3b | 4 |
| 071 | scripts/ci/jest-worker-warning.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | b1379b6811e5513b955ebbbef4450ca4ca1e77da | 1 |
| 072 | scripts/ci/playwright-gate-reporter.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 16bddbd559f0c8def18b3d7923695ca693332391 | 3 |
| 073 | scripts/ci/playwright-merge.config.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 59839922aca9f6f442100b3e6723313ef53d3a54 | 1 |
| 074 | scripts/ci/run-e2e-group.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | e23c7aaa17123e63904799c1b366c48e344ed82a | 4 |
| 075 | scripts/ci/run-jest-ci.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 24aee55099115c73d560a6635fedffbc03f0291e | 4 |
| 076 | scripts/maintenance/diagnose-background-leak.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["WAITING_ADVERSARIAL"]} | WAITING_ADVERSARIAL | - | 6b5a15d0d255d0285cfabc05f3412b81ffb3d3d4 | 5 |
| 077 | scripts/maintenance/diagnose-jest-workers.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["WAITING_ADVERSARIAL"]} | WAITING_ADVERSARIAL | - | 87d25d2b61cc1068059a39a24d3e4d86be78c335 | 3 |
| 078 | scripts/release/sync-version.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["WAITING_ADVERSARIAL"]} | WAITING_ADVERSARIAL | - | 9bc8fa5ae3fb127698e6f35988fd6efab7e56c07 | 3 |
| 079 | scripts/validation/check-js-syntax.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["WAITING_ADVERSARIAL"]} | WAITING_ADVERSARIAL | - | fbc69cf9f910c3666ef390828b1793098b3bfe06 | 2 |
| 080 | scripts/validation/playwright-gate-reporter-selftest.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | c3574843cf1614c9b705e6940e7502bbeb75e5be | 2 |
| 081 | scripts/validation/validate-manifest.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 93dbb1882c69c47482b1b07fdaf3a2a9e9d133b1 | 3 |
| 082 | scripts/validation/verify-ci-contract-selftest.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 48b25e56dcaff1d2460bfbe697759d1921091968 | 3 |
| 083 | scripts/validation/verify-ci-contract.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | c8f392e16693f62aac272036abcc018a5f3ba278 | 2 |
| 084 | scripts/validation/verify-coverage-selftest.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | ac08dd661f2d2410a56a7fd685cd9b55e85901f9 | 4 |
| 085 | scripts/validation/verify-coverage.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 45f920bd2db5ba3a1273438b1814b29aeafc3be4 | 5 |
| 086 | scripts/validation/verify-e2e-shard-plan.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | ea1149ced74425ad27ede90ec409c2548cb5b65d | 3 |
| 087 | scripts/validation/verify-jest-worker-warning-selftest.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 4c8ce078abcf58f66ded7918650b2f54d9fa40cf | 1 |
| 088 | scripts/validation/verify-publish-contract.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | f5b3f6c69f85f90fe43689de2e44b6ed70cca757 | 2 |
| 089 | scripts/validation/verify-repository-structure.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | e80da68ff70c2a26eeada261cd4e5d8cce2649b3 | 5 |
| 090 | scripts/validation/verify-test-policy-selftest.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | ac0318e4d90c5014180eb3d3a6ac4784cc70a24a | 2 |
| 091 | scripts/validation/verify-test-policy.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 4a821403353445023452a0b5055e3a0893beaad2 | 3 |
| 092 | tests/e2e/cache-and-storage.spec.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | b181989a9b89151ca17cbcbeb7db9342b98c9add | 3 |
| 093 | tests/e2e/reader-offline.spec.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | WAITING_ADVERSARIAL | - | 2837775deacca5123fa99232633b4652774abf96 | 3 |
| 094 | tests/e2e/translation-flow.spec.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | db1da42c48ff795c41c7103cd5778e5a5d98e878 | 2 |
| 095 | tests/fixtures/gemini-mock-server.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 1cd13486bf3a6c1a3d5d4b645e5564be108d6ad4 | 4 |
| 096 | tests/fixtures/manga-images.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | cc4b67fe92fc3b44d812d1d13b3a771f29fdf11b | 3 |
| 097 | tests/fixtures/manga-page.html | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 71d78eea7eddb51bc93c74bbb3bf652119551ce4 | 0 |
| 098 | tests/helpers/background-test-utils.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | 1c38cfc47917f2a42788c467b9dbf58648b73e2b | 2 |
| 099 | tests/helpers/extracted-functions.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | ccbf20485608a223c723adf638860cb7151c8886 | 3 |
| 100 | tests/helpers/load-background-module.js | COMPLETED | CHANGES_REQUIRED | {"status":"WITH_CAVEATS","caveats":["CHANGES_REQUIRED"]} | CHANGES_REQUIRED | - | b1a20544a10b3b1410f4b3e9c2be6f53b7ac3113 | 4 |
| 101 | tests/helpers/load-content-gemini-module.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | d7b72e8fd5c69ccb128269f3b59a31df2ca1ffee | 5 |
| 102 | tests/helpers/load-content-script.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 0b52224bd7063db9b6bb683d827217d8f2fda69c | 5 |
| 103 | tests/helpers/load-extension-page.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | c2325598f10b3ef9dd656a4e87db8569748e66b0 | 2 |
| 104 | tests/helpers/repo-root.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | b2520d65820e7b9072602018b0f46609ac967c58 | 1 |
| 105 | tests/helpers/track-background-delay-timers.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | b7860da7879c9bac7714f3ba7d33a7024b586c0d | 1 |
| 106 | tests/integration/banned-images-flow.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 3e750df20bdfb54c56202916191ef04eeafc9e9e | 2 |
| 107 | tests/integration/chapter-dedup.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | WAITING_ADVERSARIAL | - | 9dcc09d00a8f9d16d06cd817191bc5620311f610 | 3 |
| 108 | tests/integration/gtc-end-to-end.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 9042b3b5370afdbce3baf31b01ce3fa9c49b34dc | 3 |
| 109 | tests/integration/ipc/gemini-cors-fallback.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 1f5a1236139d85640cb5fa24590f434859155c62 | 2 |
| 110 | tests/integration/ipc/gtc-cache-flow.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | d2d0685772206873d2dfe5b5a43efd7f5218ad60 | 5 |
| 111 | tests/integration/ipc/gtc-indexeddb-deep.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | b2210cb75cc03b447399b35d71813b7b4c6463a2 | 3 |
| 112 | tests/integration/ipc/image-translation-routing.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 6c47003aae5207d711c667bc805fb71373ae788f | 1 |
| 113 | tests/integration/options.ui.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 33c34c89f7131ade147ea65b5f5015b79917b708 | 2 |
| 114 | tests/integration/performance.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 21bd3ec25d71ea8eeb00108255249025253b3b50 | 3 |
| 115 | tests/integration/popup-translated-thumbnails.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 677347d968d2916dbcba2d7a8ae67ad37f802a74 | 2 |
| 116 | tests/integration/popup.advanced.ui.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | WAITING_PRIMARY | - | a92750646ee1f0b7ff21ee0d83a1ed2c55304402 | 2 |
| 117 | tests/integration/popup.ui.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 57158c9b6e6f88955bf82a292e75624dc2ad8d0c | 3 |
| 118 | tests/integration/reader.ui.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 810a207f1264d78836b6e72c6f701bfc0cbce447 | 1 |
| 119 | tests/mocks/chrome-api.mock.js | COMPLETED | READY_FOR_AUDIT | {"status":"WITH_CAVEATS","caveats":["WAITING_PRIMARY"]} | REAUDIT_REQUIRED | - | af6580a887f1eba1c2798bfff82849e1b34cb260 | 3 |
| 120 | tests/mocks/dom-environment.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 9c3bc91608aa52a2d8324fc645c75fac5e4f7452 | 1 |
| 121 | tests/setup/create-test-images.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | f35e7896ffb5fea9091876544c8351bbba3c86da | 0 |
| 122 | tests/smoke/run-smoke.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | ea6fa903f7a68272a769804a29a97ae967bc1088 | 2 |
| 123 | tests/smoke/smoke-01-batch-lifecycle.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | c412ccaac3c01de93b0a6362747525c48d79a765 | 3 |
| 124 | tests/smoke/smoke-02-uuid-and-reconcile.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | d977f43a4b29653d01b0fd9c395cb04edb9c1a50 | 3 |
| 125 | tests/smoke/smoke-03-chapter-persistence.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 63f904d8ad55e114d130fa2cba395310a997be42 | 2 |
| 126 | tests/smoke/smoke-04-storage-manager.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 500853da2950c31fd5fb4e2a91765a9331c28153 | 3 |
| 127 | tests/smoke/smoke-05-perceptual-queries.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | bf8409c3df43062e5e6af496393412eee0c6a694 | 2 |
| 128 | tests/smoke/smoke-06-sm-message-routing.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | dd32621bee49bfe64bb4a667ecbf68fb516e03dd | 5 |
| 129 | tests/unit/background/actions-low-risk.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | e5d4d54674b5a4a3b00dc15112afb40c874d81c3 | 1 |
| 130 | tests/unit/background/background-strict-load.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 25a663f527f7d3303c51751b4bf3440ea3424b9f | 3 |
| 131 | tests/unit/background/batch-actions.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 113344a0e8dbb334fbd14eeb9e241b165a95cdfb | 3 |
| 132 | tests/unit/background/batch-lifecycle-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | REAUDIT_REQUIRED | - | 1368df4b1fdb85d8ad1f593f78decd16a3175c98 | 1 |
| 133 | tests/unit/background/calculate-visual-fingerprint-action.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | f51a0b629ac17be3eda349333192b9480494a07e | 1 |
| 134 | tests/unit/background/chrome-runtime-mock-lifecycle.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 1bd33ea5e027db04ae17bb78810780474a31856e | 0 |
| 135 | tests/unit/background/claim-gemini-job-action.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | eb90e19aabe77ff8f24355ac56033ab6f3933607 | 2 |
| 136 | tests/unit/background/commit-result-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 1a185784edd118aeee377d7e3f1ed4a9c8375914 | 3 |
| 137 | tests/unit/background/deliver-result-action.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 654194bf502f3a2c4c21feae64e256bb0ecc49eb | 4 |
| 138 | tests/unit/background/deliver-result-from-tab-action.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | REAUDIT_REQUIRED | - | 263cb827e30468c377c5b1eb5863e90bd6cf26b0 | 4 |
| 139 | tests/unit/background/deliver-result-url-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 09a0f891434bccf30dbc6e0d244e8f18a40a17d9 | 4 |
| 140 | tests/unit/background/download-chapter-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | ff0ecb6249b24b8453bc886df4724be27f492e10 | 3 |
| 141 | tests/unit/background/download-image-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 9305ba72e1d62406128ce7a5cd77b945a0b44c83 | 4 |
| 142 | tests/unit/background/download-wait.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 1bb13ac03ab0bcaff68921211679355f9971678c | 1 |
| 143 | tests/unit/background/export-all-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 9ab092d95ac1cef8b2111e76a23422f7159a4fcf | 1 |
| 144 | tests/unit/background/export-guard.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 4a34bd498d62aecdefca112b02d7601346891820 | 1 |
| 145 | tests/unit/background/fetch-image-base64-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 1246da7bd3992499b1a21a4a00dc32b83f9486c3 | 4 |
| 146 | tests/unit/background/force-send-activation-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | cab687a5e5d5dd849b6986aeeca5ac642e5b5a6a | 2 |
| 147 | tests/unit/background/gtc-runtime-bridge.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 21c01d044af7313cae9b571ab715c4e5846b9a30 | 1 |
| 148 | tests/unit/background/handlers-extra-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 2089f42642fc3b16856b0d39ea4f824e6e8dec08 | 3 |
| 149 | tests/unit/background/helpers-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 668cef7f592231856d5071bd35ff6c5c12848a41 | 4 |
| 150 | tests/unit/background/jobs-dom-ack-staging.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | e2b86f0b991c86d2ce7bdb6ce2c4191a44bed45c | 4 |
| 151 | tests/unit/background/jobs-lifecycle-batch-status.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 820f8c87379fe70b236df49d26f78962f5467b83 | 0 |
| 152 | tests/unit/background/jobs-reconciliation-batch-queue.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 032df2351f2a202dff11f227f8c4dc6ac5b80807 | 2 |
| 153 | tests/unit/background/jobs-watchdog-ordering.test.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["WAITING_ADVERSARIAL"]} | WAITING_ADVERSARIAL | - | 2102182a1e313a02cdb511846a4561c3a0f607eb | 1 |
| 154 | tests/unit/background/lifecycle-alarms-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 1d4c22ba9a78ef994906c4dd16617ddb6079942b | 3 |
| 155 | tests/unit/background/marker-anchor-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 6a6c977a1a2bad89a49813153039e17a93945017 | 2 |
| 156 | tests/unit/background/message-handlers-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 1495cd64a92afb7139407eaf7e6055adcbfc1ef3 | 1 |
| 157 | tests/unit/background/open-existing-folder-action.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 49b6cd110ebae43d7a4ed5a29b5a8e8430e5efb3 | 2 |
| 158 | tests/unit/background/open-manga-root-action.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | fd34ec27189d5c4f3bf2bffb51972a26f540a19b | 1 |
| 159 | tests/unit/background/plan-missing-handlers-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 9f8c6e4a88256aae9e2b26cd2121fe8474d736b8 | 0 |
| 160 | tests/unit/background/process-finalize-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | abb1b936fadf0e309933e39b4b705116eb320a1f | 3 |
| 161 | tests/unit/background/refresh-job-watchdog-action.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | d2acd697b78872400a16bfdac3a4866446d2239f | 3 |
| 162 | tests/unit/background/regex-escape.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 3707482c013734dd2fd0e6a3989eee30c5f5406e | 2 |
| 163 | tests/unit/background/report-error-action.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 507406dfbbc285a981b725408eb1e507e18268c8 | 3 |
| 164 | tests/unit/background/request-image-data-action.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | b04cd6cac53339fb479c19b7977acb61339ffdd9 | 2 |
| 165 | tests/unit/background/routed-actions-legacy.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 62d534355ac80b9b1f4e23dac3ce0ec1515ae4c5 | 2 |
| 166 | tests/unit/background/router.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | d7c33bc525e1683acabff44389c5d51471cc7037 | 3 |
| 167 | tests/unit/background/single-image-context-menu.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | c4e122e3fd2a5298b255e647dbc804c903ed17f5 | 3 |
| 168 | tests/unit/background/startup-recovery.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 649829ac36bb9428c9458c615365970349b741a1 | 3 |
| 169 | tests/unit/background/state-api.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | d9c080339202848719ac448d7684d793684aced2 | 3 |
| 170 | tests/unit/background/tab-identity.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 1f2dd52513037f061613d04453a961fbaeddef84 | 3 |
| 171 | tests/unit/background/tab-replacement-observability.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | b5aeb216f48ef28e471233aaa074c86a15561f01 | 3 |
| 172 | tests/unit/background/test_bg59.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | ae96b142717418e4071fd160b6c521412da03090 | 1 |
| 173 | tests/unit/background/version-sync.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 45927901e904e239c9d00cece98495055a8acf1d | 2 |
| 174 | tests/unit/content-gemini/attachment.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 43d4591bc9ff684de97d8010aea428a9f83ea321 | 3 |
| 175 | tests/unit/content-gemini/claim-bootstrap-keepalive.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 6e6adc2747b0974feec368fedb3652da79dc49b5 | 4 |
| 176 | tests/unit/content-gemini/deletion.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | c570bbdc340761412746a1347f297c352e2ff1a4 | 3 |
| 177 | tests/unit/content-gemini/dom-modules.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 32441920c27f69aef629f33fc6175ff5b48b0859 | 3 |
| 178 | tests/unit/content-gemini/editor-submit.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | ccfa4c881543111b13d0bd8f8198f402039b2233 | 3 |
| 179 | tests/unit/content-gemini/helpers-and-regressions-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 65c66f1a756d127909ed6661386e72c19e3a3a2c | 4 |
| 180 | tests/unit/content-gemini/image-quarantine.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | b2c73b79c8824e5507e436a75ec9abc663919c6b | 3 |
| 181 | tests/unit/content-gemini/job-runner.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | b0daca4ce839d8a5114c8c94e116fa155c721f7b | 4 |
| 182 | tests/unit/content-gemini/manual-assist-hud.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 14f53ac3c5a9d6fcf7898b12dab8ef53e6a1997f | 3 |
| 183 | tests/unit/content-gemini/observer.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 0eff259f673c32e44c6d5ccf6f627c0c6d5505cc | 3 |
| 184 | tests/unit/content-gemini/plan-rpa-edge-cases.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 81e21c6e245ec8f75c68db163170266c40561a6c | 3 |
| 185 | tests/unit/content-gemini/resolution-elevation.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | a8ef465959d231766ee41b9397183b7cb6b53e36 | 3 |
| 186 | tests/unit/content-gemini/result-extractor.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 611df28380a88aa8c0b468e7300ee3a17aca0f70 | 3 |
| 187 | tests/unit/content-gemini/rpa-flow.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 4bcd24983325106d82be04e2c547a99df1a74fd5 | 3 |
| 188 | tests/unit/content-gemini/safe-background-delete.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | cf85ff00f7cc7638ef8e0c61bba1ddd45e07648e | 3 |
| 189 | tests/unit/content-gemini/temp-chat-activator.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | f9418a4301c97d91e06d47196729218aaedbdd37 | 3 |
| 190 | tests/unit/content-gemini/temporary-chat-v2.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | bdf7146fac7fa9575b2fa1ab8f16e2d6b4480446 | 3 |
| 191 | tests/unit/content-manga/audio-synthesis-full.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 52ede7cfaffc6f90aa95d6d5e09817eefc2b1e38 | 33 |
| 192 | tests/unit/content-manga/audio-synthesis.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 83326ecdb978258919a7ad39cb10b47f9ac8ecc2 | 2 |
| 193 | tests/unit/content-manga/auto-restore-system.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | 3aa7a39030aba4577f530f575869a6d535d1c3a3 | 3 |
| 194 | tests/unit/content-manga/auto-restorer-real.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | cf792733e62f4b787073f1f7257e2701d29547a6 | 3 |
| 195 | tests/unit/content-manga/button-ui-real.test.js | COMPLETED | COMPLETED | {"status":"VERIFIED","caveats":[]} | APPROVED | - | a82baea685c1b325e8b21a9a914ef405a142ef97 | 3 |
| 196 | tests/unit/content-manga/canonical-title-full.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 12c203636749f69c09448a063be5384bf221e2b8 | 3 |
| 197 | tests/unit/content-manga/canonical-title.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 27ea51de33e3e56ed6535eae1a5dd530f8c06f67 | 3 |
| 198 | tests/unit/content-manga/chapter-id-cache.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 7bc23a456be69aaac252e7acea2b498d61a07520 | 3 |
| 199 | tests/unit/content-manga/chapter-id-rejection.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 783c8abd86029345a97ce44f4eaf5415274bf4b3 | 3 |
| 200 | tests/unit/content-manga/close-interval.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | e9bcb9c9267176fab8ec8229c66514c21ebbc814 | 1 |
| 201 | tests/unit/content-manga/drawer-real.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | eeebbd56fe1a1c788a81b43e222be06309b90f32 | 3 |
| 202 | tests/unit/content-manga/extract-flow-real.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 1bbc481d426bf7471eb655cf514e20d2b323902b | 3 |
| 203 | tests/unit/content-manga/extraction-and-handlers-real.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 038961e8228c7b5f1a87023a739ad5f33288423b | 4 |
| 204 | tests/unit/content-manga/floating-button-guard-and-single-click.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 710e6208befa13f414724bcca5be0f70e744c312 | 3 |
| 205 | tests/unit/content-manga/get-clean-url.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | a04fe1e3552d5b61a91442496a1294e6d8379fbf | 3 |
| 206 | tests/unit/content-manga/get-page-images-filter.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | d48888d1237e2429180c6c5814e8f5b5bcc83f12 | 4 |
| 207 | tests/unit/content-manga/image-filtering.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | a187a4c6e681457067746964c7c714c64542e4a8 | 1 |
| 208 | tests/unit/content-manga/image-fingerprint.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | e4e553c7702701fd17a1d1f3ed2e429ad23934fd | 4 |
| 209 | tests/unit/content-manga/replacement-and-completion-real.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 6db80514d757ea8e6861e65b12f9b4456d75a9f6 | 2 |
| 210 | tests/unit/content-manga/twin-backdrop-sync.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 5d2151b3673af6ca7c4faf39b4a23d039d9aaa64 | 3 |
| 211 | tests/unit/gtc/fingerprint.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 5255083ff2881ad8ed4ad6c6940253031e789658 | 4 |
| 212 | tests/unit/gtc/indexeddb.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 30af6c23b54614bd5ce8842f85eabec81dfb086f | 4 |
| 213 | tests/unit/inject/inject-anti-hibernation.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 22cc82c2ea7bc2b5fb5d588a29af5895648f4fc4 | 4 |
| 214 | tests/unit/inject/raf-replacement.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 8b9e1c19b39563476057be01b3be2805a538572c | 3 |
| 215 | tests/unit/inject/visibility-spoof.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | e94a89c7a69afc8717bf3686171a759902245267 | 3 |
| 216 | tests/unit/manifest/surface-reduction.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | d5bde042b414dc6369a105615ff8b838bdbc503b | 1 |
| 217 | tests/unit/popup/dynamic-button.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 4f4dea1b48976a089fdb9f15a2d2579c34823ae7 | 2 |
| 218 | tests/unit/popup/log-exporter.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 5e4ccdb9c64599f66ff9bb370364b871a7e5f9e6 | 5 |
| 219 | tests/unit/popup/progress-panel.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | REAUDIT_REQUIRED | - | d93235bdd142f5c29a8e4663e25b097953655061 | 4 |
| 220 | tests/unit/popup/resize-and-tabs.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | d611cadbdfc9b73727dcab60368a6dcbe6d8b703 | 3 |
| 221 | tests/unit/popup/version-ui.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 0fcb923f59efbe4705e10dc2c70567ddda939264 | 1 |
| 222 | tests/unit/reader/keyboard-nav.test.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 0d64775426e24655f8fedcfaf0c7051b7996b3ff | 3 |
| 223 | tests/unit/reader/page-counter.test.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | cec252ffefc25ee643b0227926ec6780a59ac272 | 3 |
| 224 | tests/unit/shared-ui/redo-confirmation.test.js | COMPLETED | COMPLETED | {"status":"WITH_CAVEATS","caveats":["REAUDIT_REQUIRED"]} | REAUDIT_REQUIRED | - | 2b46e876c3f87e3c0155f4a38ccb0f1bbc950b98 | 6 |
| 225 | tests/visual/background-fingerprint.visual.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 91f5cf4d9ed4d9f4386184931f93ab32f33c95ca | 3 |
| 226 | tests/visual/content-manga-pipeline.visual.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 61bc86351c914a1d9bb6bb4a13168b4567ac3cf9 | 4 |
| 227 | tests/visual/crop.visual.js | CHANGES_REQUIRED | CHANGES_REQUIRED | - | CHANGES_REQUIRED | - | 432fe488697a98d09e056b89f40b4bf686e8541c | 2 |
| 228 | tests/visual/gtc-fingerprint.visual.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | fb66d9d8eb4125fae1ee9c7f93e52a94cdc5e6e7 | 5 |
| 229 | tests/visual/gtc-indexeddb.visual.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 0f5ca8e043a06219a342d2f32b59017762a953f0 | 6 |
| 230 | tests/visual/helpers.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | 8d740eb3ee276d99c8a82acfb3eada6712e2efed | 3 |
| 231 | tests/visual/integration.visual.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 2407ce31e6c16ef39466550608a529e92392259f | 5 |
| 232 | tests/visual/run-all.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_PRIMARY | - | 2a55421675439c2631778841345c258beaac24a9 | 4 |
| 233 | tests/visual/runner.js | READY_FOR_AUDIT | READY_FOR_AUDIT | - | WAITING_ADVERSARIAL | - | fe34764874cac8961bf6c614f5f6d5f85a599763 | 5 |

# Auditoria de qualidade — Bíblias técnicas

> Este arquivo é a fonte de verdade da **auditoria de qualidade** das Bíblias individuais.
> Uma Bíblia só pode permanecer `✅ CONCLUÍDO` no `STATUS.md` e `[x]` no `CHECKLIST.md` depois de receber `✅ APROVADO` aqui.

## O que esta auditoria prova

A aprovação significa que, para a versão/SHA auditada:

1. o SHA declarado corresponde ao blob real do arquivo-fonte;
2. a cópia integral do fonte dentro da Bíblia é byte-a-byte equivalente, admitindo apenas a representação editorial do newline final;
3. toda linha/posição do fonte possui cobertura documental rastreável;
4. nenhuma linha comentada aponta para uma linha diferente do fonte;
5. explicações são suficientemente específicas ao comportamento real do projeto;
6. referências a testes/gates apontam para arquivos reais;
7. uma assertion só é chamada de prova direta quando realmente verifica aquele comportamento;
8. execução indireta, mocks, gates estáticos e simulações são diferenciados;
9. código sem prova específica recebe aviso conservador;
10. alegações arquiteturais foram cruzadas com consumidores/dependências reais quando materialmente relevantes.

A auditoria **não é uma prova formal de correção matemática do software**. Ela prova fidelidade documental e honestidade da evidência disponível no repositório.

## Reaberturas explícitas de ownership

- **#033** `extension/background/tab-identity.js` — reaberto, sem reserva e sem proprietário; qualquer aprovação anterior é histórica até nova auditoria.
- **#066** `.github/workflows/publish.yml` — reauditoria independente concluída pelo **AGENTE 23** para SHA `f673d445a3cc022d473f9b59ae1e0c8972ecd013`; veredito atual **✅ APROVADO**.

## Estados

- `✅ APROVADO`: passou no padrão atual.
- `🟣 REVISÃO OBRIGATÓRIA`: a Bíblia existe, mas não pode ser considerada concluída sob o padrão atual.
- `⬜ NÃO AUDITADO`: ainda não passou por auditoria.

## Regras que causam reprovação automática

Uma Bíblia é reprovada se qualquer um destes casos ocorrer:

- SHA do fonte incorreto;
- fonte integral divergente;
- linha do código ausente da auditoria;
- explicação genérica que apenas repete a linha sem explicar sua semântica/contexto;
- `✅ PROVADO` atribuído por seção a linhas que a assertion não verifica;
- ocorrência textual de um símbolo tratada como prova;
- simulação tratada como execução do arquivo real;
- lacuna de teste conhecida sem aviso explícito;
- referência numérica de linha comprovadamente errada;
- conclusão afirmando 100% quando a própria Bíblia contém lacuna estrutural não registrada.

## Auditoria 2026-09-29 — arquivos materializados

| # | Arquivo | Integridade fonte | Cobertura de linhas | Evidência/testes | Especificidade | Resultado |
|---:|---|---|---|---|---|---|
| 1 | `extension/manifest.json` | SHA correto; bloco integral exato | 76/76 posições documentadas | categorias diretas/gate/indiretas/lacunas distinguíveis; referências verificadas | específica ao Manifest e aos consumidores | ✅ APROVADO |
| 2 | `extension/background.js` | SHA `667c05eb2d7a...` reconfirmado; bloco integral exato | 1251 linhas + newline final = 1252/1252 posições | evidência classificada por comportamento/unidade; simulação SM separada de prova direta | 32 unidades específicas + papel local por posição; fallback genérico anterior removido | ✅ APROVADO |
| 3 | `extension/background/actions/calculate-visual-fingerprint.js` | SHA `ea474845cf9c...` reconfirmado; bloco integral exato | 129 linhas + newline final = 130/130 posições | prova direta, background integrado, consumidor e simulação visual separados; gaps de erro/capabilities explícitos | 14 unidades específicas + papel local por posição; fallback genérico removido | ✅ APROVADO |
| 4 | `extension/background/actions/check-extraction-tab.js` | SHA correto; bloco integral exato | corrigido para 26/26 posições | hit/miss e roteamento têm evidência real; lacunas de ordem/sender ausente continuam explícitas | específica ao mapping/ownership da aba | ✅ APROVADO |
| 5 | `extension/background/actions/claim-gemini-job.js` | SHA `f5c4643d2919...` reconfirmado; bloco integral exato | 102 linhas + newline final = 103/103 posições | prova da action, router, TabIdentity e consumidor separadas; gaps de ownership/erro explícitos | 13 unidades específicas + papel local por posição | ✅ APROVADO |
| 6 | `extension/background/actions/commit-result.js` | SHA `32270d1c4ade...` reconfirmado; bloco integral exato | 106 linhas + newline final = 107/107 posições | journal/ownership/batch/persistência/finalize mapeados a assertions; retry do consumidor separado | 10 unidades específicas + papel local por posição | ✅ APROVADO |
| 7 | `extension/background/actions/deliver-result-from-tab.js` | SHA `59543c135966...` reconfirmado; bloco integral exato | 103 linhas + newline final = 104/104 posições | sucesso/retry/mapping/ownership/helper separados; mismatches e falhas de API mantidos como gaps | 11 unidades específicas + papel local por posição; fallback genérico removido | ✅ APROVADO |
| 8 | `extension/background/actions/deliver-result-url.js` | SHA `91c50efe4764...` reconfirmado; bloco integral exato | 93 linhas + newline final = 94/94 posições | ownership/batch/URL/mapping ligados a assertions; blob/data e falhas de API mantidos como gaps | 11 unidades específicas + papel local por posição; fallback genérico removido | ✅ APROVADO |
| 9 | `extension/background/actions/deliver-result.js` | SHA `3653bd10c2a0...` conferido; bloco integral exato | 87 linhas + newline final = 88/88 posições | três mismatches, ownership, staging e falhas ligados a assertions; helper/consumer separados | 10 unidades específicas + papel local por posição; gaps explícitos | ✅ APROVADO |
| 10 | `extension/background/actions/download-chapter.js` | SHA `8636a03c8a20...` conferido; bloco integral exato | 34 linhas + newline final = 35/35 posições | action/reuso/download provados; marker e gaps diferenciados | 6 unidades específicas + papel local por posição; lacunas explícitas | ✅ APROVADO |
| 11 | `extension/background/actions/download-image.js` | SHA `408102f057ab...` conferido; bloco integral exato | 31 linhas + newline final = 32/32 posições | happy path/action + helper/integrado separados; erros mantidos como gaps | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 12 | `extension/background/actions/export-all.js` | SHA `6160a220094d...` conferido; bloco integral exato | 40 linhas + newline final = 41/41 posições | action/integrado/helper/mirror distinguidos; best-effort e erros explícitos | 7 unidades específicas + papel local por posição | ✅ APROVADO |
| 13 | `extension/background/actions/fetch-image-base64.js` | SHA `4a4825c36fdb...` conferido; bloco integral exato | 95 linhas + newline final = 96/96 posições | URL/auth/MIME/size/timeout provados; consumer/mirror/gaps separados | 11 unidades específicas + papel local por posição | ✅ APROVADO |
| 14 | `extension/background/actions/force-send-activation.js` | SHA `cbeea5768301...` conferido; bloco integral exato | 70 linhas + newline final = 71/71 posições | branches minimized/aba provados; router/content/uso atual separados; gaps assíncronos explícitos | 7 unidades específicas + papel local por posição | ✅ APROVADO |
| 15 | `extension/background/actions/get-tab-id.js` | SHA `2f3b26304ac1...` conferido; bloco integral exato | 17 linhas + newline final = 18/18 posições | action/router/compatibilidade integrada/consumidores separados | 5 unidades específicas + papel local por posição; gaps explícitos | ✅ APROVADO |
| 16 | `extension/background/actions/log-entry.js` | SHA `d57e1a25531b...` conferido; bloco integral exato | 50 linhas + newline final = 51/51 posições | happy path direto; validator/logger/emissores separados; gaps explícitos | 7 unidades específicas + papel local por posição | ✅ APROVADO |
| 17 | `extension/background/actions/open-existing-folder.js` | SHA `59ef82cbf960...` conferido; bloco integral exato | 38 linhas + newline final = 39/39 posições | anchor/path/marker separados; regex real provada; assimetria exists explícita | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 18 | `extension/background/actions/open-manga-root.js` | SHA `71c83df253cd...` conferido; bloco integral exato | 19 linhas + newline final = 20/20 posições | wiring direto provado; helper e popup separados; gaps explícitos | 5 unidades específicas + papel local por posição | ✅ APROVADO |
| 19 | `extension/background/actions/refresh-job-watchdog.js` | SHA `25f86a8dba57...` conferido; bloco integral exato | 86 linhas + newline final = 87/87 posições | ownership/jobIndex/canonicalização ligados a assertions; consumer/helpers separados; gaps explícitos | 10 unidades específicas + papel local por posição | ✅ APROVADO |
| 20 | `extension/background/actions/relay-progress.js` | SHA `24e377893c71...` conferido; bloco integral exato | 38 linhas + newline final = 39/39 posições | destino explícito/fallback e transição running provados; ACK/erros/lacunas separados | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 21 | `extension/background/actions/report-error.js` | SHA `ac239ea49544...` conferido; bloco integral exato | 71 linhas + newline final = 72/72 posições | payload/ownership/identity/finalização provados; consumer/lifecycle separados; gaps explícitos | 9 unidades específicas + papel local por posição | ✅ APROVADO |
| 22 | `extension/background/actions/request-image-data.js` | SHA `249126232396...` conferido; bloco integral exato | 32 linhas + newline final = 33/33 posições | relay/resposta/lastError provados; consumer/destino/compat separados; gaps explícitos | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 23 | `extension/background/actions/set-debug-mode.js` | SHA `92e4149b1bba...` conferido; bloco integral exato | 39 linhas + newline final = 40/40 posições | persistência/broadcast/validator provados; caller/consumer separados; gaps explícitos | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 24 | `extension/background/actions/start-batch.js` | SHA `b0ef70bf1c23...` conferido; bloco integral exato | 21 linhas + newline final = 22/22 posições | validator/delegação diretos; FIFO/idempotência/orchestrator separados; gaps explícitos | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 25 | `extension/background/actions/stop-batch.js` | SHA `e552d0a91109...` conferido; bloco integral exato | 18 linhas + newline final = 19/19 posições | validator/delegação diretos; cleanup/FIFO/orchestrator separados; ausência de sender ownership explícita | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 26 | `extension/background/jobs-dom-ack.js` | SHA `07b4197a206f...` conferido; bloco integral exato | 89 linhas + newline final = 90/90 posições | ACK/staging/timeout/runtime error provados; simulação smoke separada; riscos de ACK permissivo/ordenação explícitos | 10 unidades específicas + papel local por posição | ✅ APROVADO |
| 27 | `extension/background/jobs-lifecycle.js` | SHA `e4ab9f6c5472...` conferido; bloco integral exato | 746 linhas + newline final = 747/747 posições | scheduler/FIFO/recovery/finalização/tab identity cobertos; integrações e lacunas separadas | 21 unidades específicas + rastreabilidade integral | ✅ APROVADO |
| 28 | `extension/background/jobs-reconciliation.js` | SHA `f0f2370ba6b7...` conferido; bloco integral exato | 111 linhas + newline final = 112/112 posições | canonicalização/recovery/foreign/drop provados; smoke simulado separado; gap de sync vazio explícito | 12 unidades específicas + papel local por posição | ✅ APROVADO |
| 29 | `extension/background/jobs-watchdog.js` | SHA `c17b766d7fbc...` conferido; bloco integral exato | 109 linhas + newline final = 110/110 posições | ordering finalize→cleanup provado; timeout integrado provado; arm/replacement e gaps explícitos | 7 unidades específicas + papel local por posição | ✅ APROVADO |
| 30 | `extension/background/log.js` | SHA `86d5f2f1229b...` conferido; bloco integral exato | 30 linhas + newline final = 31/31 posições | módulo não carregado no runtime atual; implementação inline equivalente/testes separados; risco de drift explícito | 6 unidades específicas + papel local por posição | ✅ APROVADO |
| 31 | `extension/background/router.js` | SHA `d9278e9e58e4...` conferido; bloco integral exato | 168 linhas + newline final = 169/169 posições | aliases/source/gates/sync/async provados; risco substring URL e lacunas explícitos | 15 unidades específicas + papel local por posição | ✅ APROVADO |
| 32 | `extension/background/state.js` | SHA `7570b545d5e9...` conferido; bloco integral exato | 267 linhas + newline final = 268/268 posições | API ativa/exports legados separados; patch/restore/sync diretos; mutate/tab replacement parcialmente provados; gaps explícitos | 17 unidades específicas + papel local por posição | ✅ APROVADO |
| 33 | `extension/background/tab-identity.js` | SHA `008c9a054ae4...` conferido; bloco integral exato | 362 linhas + newline final = 363/363 posições | alias/cycle/TTL/journal/recovery/state+alarm migration provados; concorrência/journal por jobId como gaps | 18 unidades específicas + papel local por posição | ⬜ NÃO AUDITADO — REABERTO |
| 34 | `extension/content/cm-auto-restore.js` | SHA `d20e7092652e...` conferido; bloco integral exato | 123 linhas + newline final = 124/124 posições | restore/observer/config/REG-10 provados no módulo real; fallback IndexedDB e gaps assíncronos explícitos | 12 unidades específicas + papel local por posição | ✅ APROVADO |
| 35 | `extension/content/cm-chapter.js` | SHA `44b621d570b6...` conferido; bloco integral exato | 154 linhas + newline final = 155/155 posições | manager real/fallback legado provados; testes de dedup/cache espelho classificados; divergências e races explícitas | 13 unidades específicas + papel local por posição | ✅ APROVADO |
| 36 | `extension/content/cm-dom-replace.js` | SHA `d3fc72032dbd...` conferido; bloco integral exato | 189 linhas + newline final = 190/190 posições | filtros/limites/twin backdrop/replacement/overlay provados; URL normalization e gaps específicos separados | 11 unidades específicas + papel local por posição | ✅ APROVADO |
| 37 | `extension/content/cm-gtc-client.js` | SHA `95d062f41b9f...` conferido; bloco integral exato | 161 linhas + newline final = 162/162 posições | fingerprint/queries correlacionadas/pipeline real provados; fallback legado/save/regional e simulações separados | 15 unidades específicas + papel local por posição | ✅ APROVADO |
| 38 | `extension/content/content_gemini.js` | SHA `55bc83afe31a...` conferido; bloco integral exato | 461 linhas + newline final = 462/462 posições | claim moderno/fallback legado/keep-alive/deleting_urls/deletion handler provados; DO_SEND_NOW e sanitização focal mantidos como gaps | 18 unidades específicas + papel local por posição | ✅ APROVADO |
| 39 | `extension/content/content_manga.js` | SHA `a8b3698019f6...` reconfirmado; bloco integral exato | 2862 linhas + newline final = 2863/2863 posições; 2863 headings sequenciais | suites `*-real` executam o módulo real; Playwright cobre fluxo MV3; espelhos/simulações separados; gaps de stale state, cancelamento, listeners e payloads malformados explícitos | 18 unidades funcionais + posição terminal; papel local por posição; invariantes e trust boundaries específicos | ✅ APROVADO |
| 40 | `extension/content/gemini/attachment.js` | SHA `50092e4d7d71...` conferido; bloco integral exato | 582 linhas + newline final = 583/583 posições; 583 headings sequenciais | ATT-01..ATT-11 executam o módulo real; job-runner mock separado; E2E do gate negativo classificado como integração; gaps específicos explícitos | 16 unidades específicas + papel local por posição + cobertura Linha N | ✅ APROVADO |
| 42 | `extension/content/gemini/dom.js` | SHA `d3694ea70cdd...` conferido; bloco integral exato | 370 linhas + newline final = 371/371 posições; 371 headings sequenciais | 8 testes focais em `dom-modules.test.js` executam o módulo real; OBS/QUA/SEND usados apenas como evidência indireta; fallbacks sem assertion mantidos como lacunas | 19 unidades específicas + papel local por posição + riscos de ownership/Send/Shadow DOM explícitos | ✅ APROVADO |
| 44 | `extension/content/gemini/image-quarantine.js` | SHA `ddca93d17ca2...` conferido; bloco integral exato | 215 linhas + newline final = 216/216 posições; 216 headings sequenciais | QUA-01..QUA-08 executam o módulo real; RUN-09..11/OBS-15/17 classificados como prova no consumidor; gate de ordem separado; 12 lacunas específicas explícitas | 19 unidades específicas + papel local por posição + riscos de Shadow DOM/hash/encoding/fail-open documentados | ✅ APROVADO |
| 45 | `extension/content/gemini/job-runner.js` | SHA `1b16fd656e82...` conferido; bloco integral exato | 1471 linhas + newline final = 1472/1472 posições; 1472 headings sequenciais; campos `Fonte` 1472/1472 conferidos | RUN-00..RUN-14 e RUN-COV-01/02 executam o módulo real; RPA/E2E e `safe-background-delete` classificados pela força real das assertions; gaps de composer estável, retries, commit final, fallback auxiliar, cleanup e timeout textual explícitos | 54 unidades específicas + papel local por posição + autoauditoria mecânica + invariantes/trust boundaries do pipeline | ✅ APROVADO |
| 69 | `scripts/ci/data/regression-matrix.json` | SHA `f9b9e17e5870...` reconfirmado; bloco integral exato | 231 linhas + newline final = 232/232 posições; 232 headings sequenciais | `verify-ci-contract.js` valida quantidade mínima, IDs únicos, arquivos e markers; self-test negativo remove marker real e exige falha; testes unitários/E2E referenciados foram conferidos sem promover substring a prova comportamental | 23 contratos específicos + consumers/CI/trust boundaries; gaps de conjunto exato de IDs, metadados não validados e semântica textual dos markers persistidos em `.state/069.json` | ✅ APROVADO |
| 75 | `scripts/ci/run-jest-ci.js` | SHA `6d2e36a647aa...` reconfirmado; bloco integral exato | 228 linhas + newline final = 229/229 posições; 229 headings sequenciais | execução real via `test:ci`/`test:coverage`, CI Contract e self-test do detector de worker foram separados por força de evidência; branches negativos sem self-test focal permanecem lacunas explícitas | inventário físico, partição Jest, baseline, coverage e trust boundaries documentados; 4 audit_requests OPEN permanecem em `.state/075.json` | ✅ APROVADO |
| 41 | `extension/content/gemini/deletion.js` | SHA `2cec17f19e52...` reconfirmado; bloco integral exato | 482 linhas + newline final = 483/483 posições; 483 headings sequenciais | `deletion.test.js` carrega implementação real e prova DEL-01..10; `rpa-flow` e producer background complementam integração sem mascarar consumer mockado | fluxo destrutivo, recovery, mutex, storage e trust boundaries documentados; lacunas de recovery stale/scroll lock/storage failures persistidas em `.state/041.json` | ✅ APROVADO |
| 43 | `extension/content/gemini/editor.js` | SHA `0adbd4374758...` reconfirmado; fonte integral exata | 173 linhas + newline final = 174/174 posições; cobertura por faixas sem lacunas | `editor-submit.test.js` carrega o módulo real e prova SEND-01..07; consumer mockado e E2E foram rebaixados corretamente quando indiretos | submit/observer/rerender/fallbacks documentados; gaps de focus/Enter/pointer/cause e parâmetros anômalos persistidos em `.state/043.json` | ✅ APROVADO |
| 46 | `extension/content/gemini/observer.js` | SHA `59c5335e1b4f...` reconfirmado; bloco integral exato | 587 linhas + newline final = 588/588 posições; 588 headings sequenciais | `observer.test.js` prova OBS-01..20 e PR6 na implementação real; E2E ownership/translation complementa sem promover consumers mockados | ownership de model turn, baseline, shadow DOM, timers e cleanup documentados; lacunas de lifecycle/múltiplos waiters persistidas em `.state/046.json` | ✅ APROVADO |
| 48 | `extension/content/gemini/selectors.js` | SHA `0bf8db6e416a...` reconfirmado; bloco integral exato | 130 linhas + newline final = 131/131 posições; 131 headings sequenciais | `dom-modules.test.js` exige seletores críticos e consumers `dom/observer` provam usos reais; alternativas individuais e browser global não foram promovidos a prova direta | centralização/ownership/selectores amplos documentados; duplicação em attachment e chaves sem consumer persistidas em `.state/048.json` | ✅ APROVADO |
| 51 | `extension/options/options.html` | SHA `3ca95e66641d...` reconfirmado; bloco integral exato | 104 linhas + newline final = 105/105 posições; 105 headings sequenciais | `options.ui.test.js` carrega HTML/JS reais e prova os principais contratos; estilos e controles sem assertion focal foram classificados conservadoramente | IDs, ordem de scripts, CSP/layout e acessibilidade documentados; gaps de restore/minimized/auto-restore/atalhos persistidos em `.state/051.json` | ✅ APROVADO |
| 60 | `extension/shared/storage-manager.js` | SHA `d1cd5a2c83ed...` reconfirmado; bloco integral exato | 516 linhas + newline final = 517/517 posições; 517 headings sequenciais | smoke-04 prova round-trip, save/overwrite/delete/migração e E2E prova persistência real; handler copiado foi corretamente rebaixado a simulação/contrato | schema IDB, concorrência, migração e privacidade documentados; riscos HIGH/NORMAL persistidos em `.state/060.json` | ✅ APROVADO |
| 52 | `extension/options/options.js` | SHA `f69f132c0ef6...` reconfirmado; bloco integral exato | 420 linhas + newline final = 421/421 posições; 421 headings sequenciais | `options.ui.test.js` carrega HTML/JS reais e prova prompt, sites, revogação, bloqueio, Refazer e modos/toggles principais; lacunas não foram promovidas | storage/UI/helpers compartilhados documentados; riscos de callbacks sem lastError, render concorrente e índice legado persistidos em `.state/052.json` | ✅ APROVADO |
| 77 | `scripts/maintenance/diagnose-jest-workers.js` | SHA `87d25d2b61cc...` reconfirmado; bloco integral exato | 200 linhas + newline final = 201/201 posições; mapa de cobertura contínuo | helper `hasForcedWorkerExit` possui self-test direto; CI Contract protege paths/comandos; runner matricial em si não possui self-test focal e isso permanece explícito | cases, spawn, artifacts, aggregate e exit policy documentados; 3 audit_requests OPEN preservadas em `.state/077.json` | ✅ APROVADO |
| 79 | `scripts/validation/check-js-syntax.js` | SHA `fbc69cf9f910...` reconfirmado; fonte integral embutida byte-a-byte exata | 30 linhas + newline final = 31/31 posições; mapa 1–31 contínuo | run #36577447500 / job #109437162703 executou o mesmo blob e terminou verde com 218 arquivos; checkout efetivo do job foi o merge ref `c6d75b8...`, cujo blob é o mesmo; branches negativos permanecem sem teste focal | descoberta/`node --check`/exit policy documentados com classificações conservadoras; `079-001` e `079-002` permanecem OPEN em `.state/079.json` | ✅ APROVADO |
| 80 | `scripts/validation/playwright-gate-reporter-selftest.js` | SHA `478d6673dbb6...` reconfirmado; fonte integral embutida exata | 79 linhas + newline final = 80/80 posições; linhas 1–79 documentadas + posição 80 explícita | assertions reais isolam happy path, skipped, flaky por retry, inventário <21 e estados finais; branch `attemptsById.size < total` permanece corretamente como gap | consumers CI/package e matriz de regressão cruzados; `080-001` e `080-002` permanecem OPEN em `.state/080.json` | ✅ APROVADO |
| 81 | `scripts/validation/validate-manifest.js` | SHA `93dbb1882c69...` reconfirmado; fonte integral embutida exata | 18 linhas + newline final = 19/19 posições; cobertura linha/posição contínua | run #2167 teve o job `Manifest Validation` e o step `Validar manifest.json` em `success`; checkout efetivo `ae53a56...` contém o mesmo blob; branches negativos permanecem sem self-test focal | truthiness mínima, limites de schema e wiring da CI documentados sem inflar garantias; `081-001`..`081-003` permanecem OPEN | ✅ APROVADO |
| 55 | `extension/reader/reader.html` | SHA `065fc4e201c5...` reconfirmado; bloco integral exato | 77 linhas + newline final = 78/78 posições; 78 headings sequenciais | `reader.ui.test.js` carrega HTML/JS reais e `reader-offline.spec.js` abre a extensão real, provando estrutura/contador/largura/navegação; CSS cosmético foi rebaixado | contratos de IDs/scripts/layout documentados; lacunas de acessibilidade/viewport/sincronização de offsets persistidas em `.state/055.json` | ✅ APROVADO |
| 54 | `extension/popup/popup.js` | SHA `300cfe9a9c81...` reconfirmado; bloco integral exato | 2020 linhas + newline final = 2021/2021 posições; 2021 headings sequenciais | suítes `popup.ui`, `popup.advanced.ui`, thumbnails, dynamic-button, progress, resize/tabs e log-exporter carregam a implementação real; ramos sem assertion focal permanecem explícitos | composition root, ownership por tabId, storage, settings, downloads, miniaturas e logs documentados; 4 audit_requests OPEN em `.state/054.json` | ✅ APROVADO |

| 74 | `scripts/ci/run-e2e-group.js` | SHA `e23c7aaa1712...` reconfirmado; bloco integral exato | 52 linhas + newline final = 53/53 posições; 11 faixas contíguas 1–53, sem lacunas | `verify-e2e-shard-plan.js` prova diretamente a partição das tags; `verify-ci-contract.js` protege runner/script/workers estaticamente; execução real do runner permanece indireta e branches negativos sem prova focal | runner, spawn, env/cwd/shell, lifecycle do child, assimetria local×CI, caminho do CLI e gaps de robustez documentados; 4 audit_requests persistidos em `.state/074.json` | ✅ APROVADO |
| 76 | `scripts/maintenance/diagnose-background-leak.js` | SHA `6b5a15d0d255...` reconfirmado; bloco integral exato | 420 linhas + newline final = 421/421 posições; 421 headings sequenciais | detector compartilhado possui self-test direto; CI Contract protege o job/comando estaticamente; execução do script na main é indireta; seed/sweep/ddmin/interação/exit codes permanecem sem teste focal | discovery, spawn/logs, workers, ddmin/cross, confirmação e trust boundaries documentados; 5 `audit_requests` persistidos em `.state/076.json`, incluindo falso verde HIGH para falha Jest comum | ✅ APROVADO |
### `image-quarantine.js` — criação e auditoria em 2026-09-29

- SHA `ddca93d17ca2934a9e95dba96a87283be4e9b9a3` e fonte integral reconfirmados;
- 215 linhas + newline final = 216/216 posições, com 216 headings sequenciais;
- QUA-01..QUA-08 executam a implementação real e provam identidade por bytes, quarentena exata, telemetria perceptual, classificação estrutural, Shadow DOM, precedência de model response e rejeição de URL não-data;
- RUN-09..RUN-11 e OBS-15/OBS-17 foram mantidos como prova dos consumidores reais, não promovidos automaticamente a prova de cada linha interna;
- o gate estrutural foi classificado separadamente como prova estática da posição no manifest;
- 12 lacunas foram rotuladas explicitamente, incluindo Web Crypto nativo, vetor SHA conhecido, Data URL não-Base64, falta de atob, branches restantes de seletores e performance do fallback;
- riscos de fail-open no consumidor, custo síncrono do fallback, divergência de encoding sem TextEncoder e limite da identidade exata foram registrados.

**Veredito:** ✅ APROVADO.

| 47 | `extension/content/gemini/result-extractor.js` | SHA `a3efd499a0b0...` conferido; bloco integral exato | 413 linhas + newline final = 414/414 posições; 414 linhas de cobertura sequenciais | EXT-01..EXT-13 executam o módulo real; BGD-04/05/06/08/09/10/12/13/14 exercitam bridge/retry em integração real; action SW e mocks do runner classificados separadamente; lacunas específicas explícitas | 15 unidades específicas + papel local por posição + trust boundaries/riscos de MAIN bridge e rota autenticada documentados | ✅ APROVADO |
| 49 | `extension/content/gemini/temporary-chat.js` | SHA `40fbc8dc6acf...` conferido; bloco integral exato | 213 linhas + newline final = 214/214 posições; 214 headings sequenciais | duas suítes unitárias executam o módulo real; discovery/estado/clique/anti-double-toggle ligados a assertions; job-runner mock e E2E separados como contrato/execução indireta; 16 lacunas específicas explícitas | 9 unidades específicas + papel local por posição; riscos de synthetic events, heurísticas DOM e `verification_failed` sem fallback de exclusão documentados | ✅ APROVADO |
| 50 | `extension/content/inject.js` | SHA `21f7f6cf9c94...` reconfirmado; bloco integral exato | 472 linhas + newline final = 473/473 posições; 473 headings sequenciais; 0 fallbacks genéricos | testes `inject/*` classificados como espelho/gate; runner/result-extractor/rpa como consumers/execução indireta; nenhuma prova direta do MAIN-world inventada; 12 lacunas específicas explícitas | 15 unidades específicas + papel local por posição; riscos de rAF/idle IDs sintéticos, AudioContext sem cleanup, fetch/event trust boundary e submit duplicado documentados | ✅ APROVADO |
| 56 | `extension/reader/reader.js` | SHA `490bbb184234...` reconfirmado; bloco integral byte/texto equivalente | 259 linhas + newline final = 260/260 posições; 260 headings sequenciais | `reader.ui`, `keyboard-nav` e `page-counter` executam a fonte real; `reader-offline.spec.js` prova fluxo MV3/IndexedDB/lazy-load em Chromium; unload, erros de SM_GET_PAGE, RAF e catches continuam como gaps explícitos | 17 unidades específicas + papel local por posição; storage bridge, trust boundaries, virtualização, estado morto e resíduos documentados | ✅ APROVADO |
| 57 | `extension/shared/gtc-fingerprint.js` | SHA `fa014028d5e2...` reconfirmado; bloco integral exato | 770 linhas + newline final = 771/771 posições; 771 headings sequenciais; 0 fallbacks genéricos | unit `gtc/fingerprint.test.js` e suítes visuais carregam o módulo real; consumers SW/content/IDB classificados separadamente; gaps de hex inválido, comprimento, Unicode fallback, region opts e ID fallback explícitos | 16 unidades específicas + papel local por posição; contratos SHA/dHash/Haar/DCT/regional/strict/relaxed e invariantes de compatibilidade documentados | ✅ APROVADO |
| 58 | `extension/shared/gtc-indexeddb.js` | SHA `0c872f23a665...` reconfirmado; bloco integral exato | 1168 linhas + newline final = 1169/1169 posições; 1169 headings sequenciais | unit `gtc/indexeddb.test.js`, smoke-05, integration IPC/performance e suítes visuais lidos nas assertions reais; CRUD/fallback/retry/abort/concurrency/legacy perceptual/crop provados; upgrade histórico, `queryPerceptual` no backend IndexedDB e handler real V2 mantidos como gaps explícitos | 16 lacunas específicas + papel local por posição; schema v4, contratos legado↔correlacionado, trust boundaries, O(n), diferenças memória↔IDB e persistência de Data URLs documentados | ✅ APROVADO |
| 59 | `extension/shared/shared-ui.js` | SHA `b284fb8eb0e8...` reconfirmado; bloco integral exato | 350 linhas + newline final = 351/351 posições; 351 headings sequenciais; fonte integral conferida | `redo-confirmation.test.js` carrega o módulo real; integrações reais de Popup/Options exercitam Refazer/fallback legado; XSS específico prova escape no consumidor; gate de ordem separado; lacunas de restore moderno, erros de API e races explícitas | 12 unidades específicas + papel local por posição; trust boundaries, lifecycle MV3, migração parcial, overlay concorrente e risco sem `chapterId` documentados | ✅ APROVADO |
| 61 | `.gitignore` | SHA `e48fc70b1acc...` reconfirmado; bloco integral exato | 37 linhas + newline final = 38/38 posições; 38 headings sequenciais | gate estrutural prova presença de `.jest-cache*/`, `.ci-results/`, `all-blob-reports/` e `dist/`; produtores Jest/Playwright/CI/publish/fixtures cruzados; demais patterns mantidos como contrato/lacuna sem inventar `git check-ignore` | explicação específica por glob + segurança `.env`, portabilidade, artifacts, fixtures e tradeoffs; comentário editorial stale registrado | ✅ APROVADO |
| 62 | `jest.config.js` | SHA `f0b7c55a5c8c...` reconfirmado; bloco integral exato | 90 linhas + newline final = 91/91 posições; 91 headings sequenciais | `run-jest-ci.js` executa este config via Jest/listTests e prova partição unit/integration; `verify-ci-contract.js` protege provider V8, escopo `extension/**/*.js` e reporters-chave; ambientes/setup/cache/timeout classificados conservadoramente | 8 projetos específicos + cobertura condicional + trust boundary dos mocks + riscos de duas listas nominais, jsdom integrado e threshold externo | ✅ APROVADO |
| 63 | `package.json` | SHA `33e0b91d1a6f...` reconfirmado; bloco integral exato | 55 linhas + newline final = 56/56 posições; 56 headings sequenciais | `run-jest-ci.js` e `verify-ci-contract.js` protegem scripts críticos; `version-sync.test.js` + `sync-version.js` sustentam a fonte única de versão; o self-test anti-skip muta `package.json` em sandbox e exige rejeição de `--forceExit`; aliases sem gate focal permanecem lacunas explícitas | orquestração npm, supply chain, versionamento e consumers documentados; riscos de `test:all` sem `validate`, piso Node 18 não testado na borda, ranges caret/lockfile e hooks E2E contornáveis explicitados | ✅ APROVADO |
| 64 | `playwright.config.js` | SHA `6a27b774a000...` reconfirmado; bloco integral exato | 55 linhas + newline final = 56/56 posições; 56 headings sequenciais; fonte integral conferida | `verify-e2e-shard-plan.js` executa o config real; `verify-ci-contract.js` protege `fullyParallel`, retries CI, `forbidOnly` e reporter; self-test prova o gate de `forbidOnly`; parsing de workers/retries, bloco `use`, mídia e health permanecem conservadoramente como gaps | runner/sharding/reporters/webServer/persistent contexts documentados; riscos `0.5→0` workers, `CI=false`, configuração duplicada, porta 3999, sandbox e artifacts explícitos | ✅ APROVADO |
| 65 | `.github/workflows/ci.yml` | SHA `ebee75820db9...` reconfirmado; bloco integral exato | 558/558 posições; 558 headings sequenciais; arquivo sem newline terminal | `verify-ci-contract.js` protege jobs/gatilhos/concurrency/gate final; self-test negativo prova rejeição de job obrigatório removido; `verify-e2e-shard-plan.js` e `run-jest-ci.js` executam inventários reais; runtime deste SHA não foi promovido indevidamente | 16 jobs específicos + consumers/dependências + trust boundaries + casos-limite; riscos de permissões implícitas, ausência de timeout e actions sem pin SHA documentados | ✅ APROVADO |
| 66 | `.github/workflows/publish.yml` | SHA `f673d445a3cc...` reconfirmado; bloco integral exato | 131 linhas + newline final = 132/132 posições; 24 blocos contíguos com faixas explícitas 1–132, sem lacunas | `verify-publish-contract.js` protege gatilhos/caminhos/ZIP/checksum; `version-sync.test.js` lê o workflow real e prova nomes derivados/anti-hardcode; execução de `gh release`, tag/checkout e races permanece conservadoramente como gap | lifecycle completo da release + trust boundaries de token/ref + montagem ZIP/docs/checksum + três ramos `gh`; riscos `066-001..004` permanecem aceitos e não bloqueantes | ✅ APROVADO — AGENTE 23 |
| 67 | `.github/workflows/recover-cancelled-ci.yml` | SHA `4809f824f177...` reconfirmado; bloco integral exato | 316 linhas + newline final = 317/317 posições; 70 blocos contíguos cobrindo 1–317 sem lacunas/overlap | não há suíte focal do controlador; `ci.yml` foi cruzado como produtor de `MangaTranslator CI`; guards de fork, paginação, cutoff, rerun e polling permanecem conservadoramente como lacunas explícitas; `audit_requests` 067-001..003 registrados | workflow_run privilegiado, permissões, filtro de forks, concorrência global, idempotência, rerun integral, polling por `run_attempt`, timeout e race residual de HEAD documentados | ✅ APROVADO |
| 68 | `scripts/ci/data/e2e-shard-plan.json` | SHA `22e8c20df9f4...` reconfirmado; bloco integral exato | 45 linhas + newline final = 46/46 posições; 46 headings sequenciais | `verify-e2e-shard-plan.js` executa `playwright --list` real por tag e prova cardinalidade, união exata, ausência de omissões e duplicatas; `verify-ci-contract.js` fixa ids/contagens/workers; `version`, `kind` não operacional e `estimatedSeconds` permanecem gaps explícitos | 5 grupos específicos + fluxo workflow→runner→Playwright + trust boundary CI; riscos de tag↔id, schema/version, workers e benchmark stale documentados | ✅ APROVADO |
| 70 | `scripts/ci/data/test-baseline.json` | SHA `52a4b3c1500d...` reconfirmado; bloco integral exato | 67 linhas + newline final = 68/68 posições; 68 headings sequenciais; fonte integral conferida | `playwright-gate-reporter-selftest.js` carrega o consumidor real e prova 21 E2E mínimos, zero skipped e zero flaky/retry; Jest/visual/smoke/coverage classificados conservadoramente; `measuredBaseline` sem consumidor automatizado; gaps de anti-enfraquecimento explícitos | 5 blocos de política + thresholds por arquivo; trust boundary da CI, fallbacks fail-open de coverage, divergência documental de `measuredBaseline` e invariantes de não-redução documentados | ✅ APROVADO |
| 71 | `scripts/ci/jest-worker-warning.js` | SHA `b1379b6811e5...` reconfirmado; bloco integral exato | 9 linhas + newline final = 10/10 posições; 10 headings sequenciais | self-test carrega o módulo real e prova warning positivo, PASS normal e FAIL comum; `verify-ci-contract.js` protege wiring no runner/CI e proíbe `--forceExit`; literal canônico independente, branch não-string e canal stdout permanecem gaps explícitos | helper puro + consumers CI/diagnósticos + trust boundary de output de subprocesso; riscos de drift textual, ANSI, canal e falso positivo documentados | ✅ APROVADO |
| 73 | `scripts/ci/playwright-merge.config.js` | SHA `59839922aca9...` reconfirmado; bloco integral exato | 8 linhas + newline final = 9/9 posições; 9 headings sequenciais | `verify-ci-contract.js` protege o uso de `merge-reports` com esta config; `verify-repository-structure.js` restringe a config a merge/reporter; self-test do reporter prova o módulo dependente, não o wiring desta config; wiring exato permanece lacuna explícita | papel merge-only, resolução por `path.join(__dirname, ...)`, trust boundary da CI e riscos de wiring/denylist documentados | ✅ APROVADO |

### `test-baseline.json` — auditoria aprovada em 2026-09-30

- SHA `52a4b3c1500dca615b6e2ca3d0d7b140ffdb9a3e` reconfirmado contra o blob atual;
- fonte integral conferida e 67 linhas + newline final = 68/68 posições, com 68 headings `Linha N` sequenciais;
- `playwright-gate-reporter-selftest.js` importa o reporter real, que importa este baseline real, e suas assertions provam diretamente `e2e.minTests = 21`, `e2e.maxSkipped = 0` e `e2e.maxFlaky = 0`;
- `run-jest-ci.js`, `tests/visual/runner.js`, `tests/smoke/run-smoke.js`, `verify-e2e-shard-plan.js` e `verify-coverage.js` foram tratados como execução real/indireta dos campos que consomem, sem promover uso do valor a assertion anti-redução;
- `verify-ci-contract.js` valida shape/coerência de mínimos selecionados e relaciona `e2e.minTests` ao plano de shards, mas não congela a maioria dos números exatos;
- `verify-coverage-selftest.js` usa baseline sintético: prova a mecânica de rejeição de thresholds, não os valores reais 78/71/80/78 nem os cinco mapas críticos deste arquivo;
- `measuredBaseline` não possui consumidor de código encontrado; isso contrasta com a formulação ampla de `docs/Documentação.md` de que o arquivo inteiro é “contrato, não estatística informativa”;
- lacunas críticas ficaram explícitas: redução de mínimos sem gate anti-enfraquecimento, remoção de `criticalMinimum` em modo fail-open, thresholds inválidos ignoráveis e ausência de self-tests focais para Jest/visual/smoke.

**Veredito:** ✅ APROVADO.



### `playwright.config.js` — criação e auditoria em 2026-09-30

- SHA `6a27b774a0009db800a70969eaad18716fb5f565` reconfirmado imediatamente antes da aprovação;
- 55 linhas textuais + newline final = 56/56 posições, com 56 headings `Linha N` sequenciais e fonte integral comparada ao blob;
- `verify-e2e-shard-plan.js` foi classificado como execução do config real/inventário, sem promover o literal `testDir` a prova direta;
- `verify-ci-contract.js` e seu self-test sustentam gates estáticos de `fullyParallel`, retries CI, `forbidOnly` e reporter; o self-test do reporter foi separado da seleção do reporter pelo config;
- os três E2E atuais criam `chromium.launchPersistentContext(...)` manualmente, portanto `use.channel`, `launchOptions`, viewport, screenshot, vídeo e preset do projeto não foram falsamente atribuídos aos contexts persistentes;
- lacunas explícitas incluem workers fracionários (`0.5` passa no teste positivo e vira `0` após `Math.floor`), ausência de teto de workers, `CI=false` textual, timeout/outputDir sem gate focal, mídia dos contexts manuais, `reuseExistingServer` e health baseado apenas na porta;
- segurança documentada: `--no-sandbox`/`--disable-setuid-sandbox` reduzem isolamento e devem ficar restritos a teste controlado; extensão MV3 real, mock local e reporters são trust boundaries distintos.

**Veredito:** ✅ APROVADO.
### `temporary-chat.js` — criação e auditoria em 2026-09-29

- SHA `40fbc8dc6acf6ae21dc5854aae3f14bfc029e3bc` e fonte integral reconfirmados;
- 213 linhas + newline final = 214/214 posições, com 214 headings `Linha N` sequenciais;
- `temporary-chat-v2.test.js` e `temp-chat-activator.test.js` importam a implementação real e provam discovery semântico, estados PT/EN, sequência de eventos, `already_active`, `activated_verified`, `state_not_verified`, `unavailable` e anti-double-toggle;
- mocks do job runner foram classificados como contrato do consumidor, e o E2E `temp_chat` como execução indireta, não prova de cada helper interno;
- 16 lacunas foram mantidas explícitas, incluindo Shadow DOM, `aria-pressed`/`data-state`, abort, `control_not_actionable`, actionability/visibilidade e branches de erro;
- a integração `verification_failed` → warning → continuação, sem o mesmo fallback de exclusão usado por `unavailable`, foi registrada como risco de privacidade a ser decidido/testado, sem alteração funcional.

**Veredito:** ✅ APROVADO.

### `reader.js` — criação e auditoria em 2026-09-29

- SHA `490bbb1842348e792cd593c37699a822d81f555b` reconfirmado antes da aprovação;
- fonte integral extraída da Bíblia e comparada ao blob atual: equivalência byte/texto confirmada;
- 259 linhas textuais + newline final = 260/260 posições, com 260 headings `Linha N` sequenciais;
- `reader.ui.test.js`, `keyboard-nav.test.js` e `page-counter.test.js` carregam a implementação real e sustentam UI, largura, close, estados vazios, teclado/fullscreen e lógica do contador;
- `reader-offline.spec.js` executa a extensão MV3 real em Chromium e prova fluxo legado→migração/storage, índices esparsos, lazy load sob demanda, persistência de largura e navegação/contador;
- evidências do background/storage manager foram classificadas como dependência/execução indireta quando não eram assertions focais do reader;
- lacunas explícitas foram mantidas para unload/virtualização de memória, falha/retry de `SM_GET_PAGE`, race assíncrona, coalescência RAF/resize, catches de localStorage/fullscreen, payload malformado e cleanup;
- dívida técnica registrada sem alteração funcional: `currentReadWidth` é escrito mas não lido; `loadedUrls` é criado e nunca usado, com comentário legado de objectURL divergente da implementação Data URL;
- invariantes cobrem separação `arrayPos`/índice persistido, fallback numérico legado, preload sob demanda, retry, contador one-based e preservação de altura no unload.

**Veredito:** ✅ APROVADO.

### `package.json` — auditoria aprovada em 2026-09-30

- SHA `33e0b91d1a6f1790124b700d2ce331f80d2b7095` reconfirmado contra o blob atual;
- fonte integral conferida: 55 linhas textuais + newline final = 56/56 posições, com 56 headings `Linha N` sequenciais;
- `run-jest-ci.js` e `verify-ci-contract.js` foram lidos nas assertions que fixam a partição Jest e os scripts críticos de CI, coverage, E2E e políticas;
- `tests/unit/background/version-sync.test.js` e `scripts/release/sync-version.js` sustentam a interpretação de `package.json#version` como fonte única do versionamento derivado;
- `verify-test-policy-selftest.js` foi aberto e sua mutação de sandbox para `jest --forceExit` foi classificada como prova negativa direta da política;
- atalhos focais, diagnósticos, `private`, licença, ranges exatos e a fronteira Node 18 permanecem classificados conservadoramente como evidência indireta ou lacuna quando não há assertion focal;
- riscos de `test:all` não incluir `validate`, bypass dos hooks npm por CLI Playwright direta, escrita de `version:sync` e dependência do lockfile foram documentados sem alteração funcional.

**Veredito:** ✅ APROVADO.


### `gtc-indexeddb.js` — auditoria aprovada em 2026-09-30

- SHA `0c872f23a665304b46dc2bb43c6468762feb2e31` reconfirmado contra o blob atual e contra a reserva de `GPT-5.6-Sol#K`;
- bloco “Fonte integral auditada” extraído da Bíblia e comparado ao fonte atual: **igualdade exata**;
- fonte com 1168 linhas textuais + newline final = **1169/1169 posições**, e 1169 headings `Linha 0001`→`Linha 1169` sequenciais;
- `tests/unit/gtc/indexeddb.test.js` foi lido nas assertions de normalização, fallback em memória, CRUD, delete por `cleanUrl`, dHash, fake IndexedDB, retry de abertura, abort transacional, abertura concorrente, perceptual exato/scan, crop e handlers;
- `tests/smoke/smoke-05-perceptual-queries.js` prova no backend em memória que consultas correlacionadas rejeitam produto cruzado, rejeitam aspect ratio incompatível e mantêm scan aproximado de B mesmo quando A teve hit exato;
- `tests/integration/ipc/gtc-indexeddb-deep.test.js`, `tests/integration/performance.test.js` e as suítes visuais foram classificadas pelo que realmente afirmam; o teste “50 imagens em menos de 200ms” foi registrado com o limite real da assertion, **<1000ms**, e não pelo título;
- upgrade real v1→v2→v3→v4 com dados preservados **não possui prova focal localizada**;
- a implementação `queryPerceptual` do backend IndexedDB é separada da versão em memória e **não possui teste focal direto localizado**;
- o ramo real do handler `GTC_QUERY_PERCEPTUAL_V2` também permanece **sem teste probatório específico**, embora consumers/mocks confirmem o contrato externo;
- APIs perceptuais legadas continuam expostas por compatibilidade e aceitam listas independentes; a Bíblia diferencia explicitamente esse risco do contrato correlacionado V2;
- normalização sem validação de formato, `queryId`/mode sem validação, `putMany.count` como tamanho do payload, diferenças Map↔structured clone, estado terminal após três opens, ausência de `versionchange` e scan O(n) foram registrados como riscos, sem alteração funcional;
- nenhuma suíte foi declarada como executada nesta sessão; a classificação é baseada em leitura direta das assertions existentes.

**Veredito:** ✅ APROVADO.

| 53 | `extension/popup/popup.html` | SHA `05972d0fa116...` conferido; bloco integral exato | 489 linhas textuais + posição terminal = 490/490 posições; 490 linhas de cobertura sequenciais | `load-extension-page.js` carrega o HTML real e executa dependências + `popup.js`; `popup.ui`, `popup.advanced.ui`, progress, logs, botão dinâmico e thumbnails verificam contratos reais; seletores obsoletos `btn-settings`/`data-tab` foram explicitamente rebaixados | 21 unidades específicas + 81 IDs sem duplicação + todos `data-target` válidos + 67/68 IDs consumidos estaticamente (único ausente é `btn-force-reload` dinâmico); acessibilidade/CSP/layout e lacunas explícitas | ✅ APROVADO |

## Correções já aplicadas pela auditoria

### `content_gemini.js` — criação e auditoria em 2026-09-29

- composition root separado explicitamente da lógica interna de `content/gemini/*.js`;
- keep-alive ligado a assertions diretas de abertura, fechamento e reconexão única;
- claim moderno, retry e fallback legado sem full scan ligados às suites reais;
- gate `deleting_urls` e handler `DELETE_CONVERSATION` ligados a provas reais;
- receiver `DO_SEND_NOW`, sanitização focal e alguns ramos de erro mantidos como lacunas;
- SHA e 462/462 posições conferidos.

**Veredito:** ✅ APROVADO.

### `cm-gtc-client.js` — criação e auditoria em 2026-09-29

- ordem real de carga `gtc-fingerprint → cm-gtc-client → content_manga` confirmada no manifest/harness;
- pipeline real visual-v4 ligado a CALCULATE_VISUAL_FINGERPRINT e queries V2 strict/crop/relaxed;
- consultas perceptuais correlacionadas separadas das APIs legadas de listas independentes;
- simulações visuais inline classificadas como complemento, não prova do módulo;
- fallback legado de storage, save fallback e regional edge cases mantidos como lacunas específicas;
- SHA e 162/162 posições conferidos.

**Veredito:** ✅ APROVADO.

### `cm-dom-replace.js` — criação e auditoria em 2026-09-29

- GET_PAGE_IMAGES real ligado a filtros de banidas, pequenas, traduzidas e limites dinâmicos;
- Twin Backdrop Sync ligado à suíte real de Reddit/backdrop;
- replacement real ligado a limpeza de picture/lazy attrs e overlays vermelho/verde;
- normalização Reddit/Imgur e ramos heurísticos sem assertion focal mantidos como lacunas;
- riscos de lower-case de pathname/query, varredura O(N) por replacement e cleanup efêmero explicitados;
- SHA e 190/190 posições conferidos.

**Veredito:** ✅ APROVADO.

### `cm-chapter.js` — criação e auditoria em 2026-09-29

- wiring real via `load-content-script.js`/manifest e persistência do fallback legado ligados à suíte integrada;
- testes `chapter-id-cache`, `chapter-id-rejection` e `chapter-dedup` classificados como simulações, não prova da fonte;
- divergência entre `canonicalTitle` do teste de dedup e a implementação real explicitada;
- riscos de deduplicação por hostname+título, concorrência de `chapterList`, fallback legado sem fila/await e cache de assets sem prova focal registrados;
- SHA e 155/155 posições conferidos.

**Veredito:** ✅ APROVADO.

### `cm-auto-restore.js` — criação e auditoria em 2026-09-29

- helper de testes confirmado carregando o módulo real na mesma ordem do `manifest.json`;
- restore inicial, observer, novos nós, REG-10, disable global/site e bloqueio por imagem ligados às assertions reais;
- implementação modular efetiva separada da duplicação inline residual em `content_manga.js`;
- gaps de `data-original`, `apply()` async sem await/catch, caminho IndexedDB não-vazio, SPA/map e config explicitados;
- SHA e 124/124 posições conferidos.

**Veredito:** ✅ APROVADO.

### `tab-identity.js` — criação e auditoria em 2026-09-29

- migração completa de job/watchdog/recovery/finalization marker/state/alarms ligada ao TAB-01;
- cadeia, ciclo, TTL/cleanup, recovery idempotente e integração reconciler/lifecycle ligados às assertions reais;
- conflito de job, max hops, fallbacks de alarm/state e concorrência dos índices mantidos como lacunas;
- risco de reutilização de migration journal por `jobId` em rekeys sucessivos explicitado;
- SHA e 363/363 posições conferidos.

**Veredito atual:** ⬜ NÃO AUDITADO — REABERTO por solicitação explícita; a auditoria acima permanece apenas como histórico e deve ser revalidada pelo próximo proprietário.

### `state.js` — criação e auditoria em 2026-09-29

- `patch/get/restore/sync` ligados à suíte direta `state-api.test.js`;
- `replaceGeminiTabReferences`/`mutate` cruzados com `tab-identity.test.js`;
- API efetivamente usada pelo runtime separada de exports residuais `generateId/_markFinalized/reconcileJobs/ensureInitialized`;
- riscos de clones parciais, setters sem persistência, valores numéricos não validados e concorrência sem teste focal explicitados;
- SHA e 268/268 posições conferidos.

**Veredito:** ✅ APROVADO.

### `background/router.js` — criação e auditoria em 2026-09-29

- aliases, sources básicos, gate de origem, validator, sync/async e contextFactory ligados às assertions focais;
- adapter de respostas legadas mantido separado do router;
- classificação Gemini por substring da URL inteira identificada como boundary permissivo;
- ausência de collision guard no registry, canonical action direta, throw de validator e GTC/SM sem prova focal explicitados;
- storage facade e possibilidade de contextFactory sobrescrever sender documentadas;
- SHA e 169/169 posições conferidos.

**Veredito:** ✅ APROVADO.

### `background/log.js` — criação e auditoria em 2026-09-29

- confirmado que o arquivo não é carregado por `background.js` no SHA atual;
- implementação inline duplicada de `log/_flushLog` no background foi diferenciada do módulo extraído;
- testes PERF/retention foram classificados como prova da implementação inline equivalente, não deste arquivo;
- perda de batch em erro de storage, fila presa após falha, concorrência de `_flushLog` e volatilidade MV3 explicitadas;
- risco de drift entre duas implementações registrado;
- SHA e 31/31 posições conferidos.

**Veredito:** ✅ APROVADO.

### `jobs-watchdog.js` — criação e auditoria em 2026-09-29

- ordem `finalizeJob → cleanup extraction tabs` ligada ao teste direto;
- persistência/timeout/cleanup real ligados ao batch-lifecycle integrado;
- naming por jobId e canonicalização pós-write documentados;
- race legada sem jobId após replacement explicitada;
- gaps de arm/clear, erros assíncronos e retorno antecipado do handler explicitados;
- SHA e 110/110 posições conferidos.

**Veredito:** ✅ APROVADO.

### `jobs-reconciliation.js` — criação e auditoria em 2026-09-29

- drop de job foreign e preservação do batch atual ligados ao teste direto;
- canonicalização antes de tabExists ligada ao TAB-12 real;
- recovery antes de liveness e reconstrução do contador documentados;
- smoke simplificado classificado como simulação, não prova do módulo;
- gap de activeJobsCount stale com jobIndex vazio sem sync explicitado;
- SHA e 112/112 posições conferidos.

**Veredito:** ✅ APROVADO.

### `jobs-lifecycle.js` — criação e auditoria em 2026-09-29

- scheduler, FIFO, completion claim e recovery ligados à suíte que importa o módulo real;
- finalização durável/journal e erros tardios ligados aos testes integrados do background;
- alias antes da persistência e tab canonical ligados ao teste direto de lifecycle;
- riscos de concorrência em updateJobState, clamp ausente de maxConcurrentJobs, fallback incompleto de minimized_window e timers MV3 explicitados;
- dependência `delay` identificada como residual/não utilizada;
- SHA e 747/747 posições conferidos.

**Veredito:** ✅ APROVADO.

### `jobs-dom-ack.js` — criação e auditoria em 2026-09-29

- ACK positivo/negativo, timeout, runtime error e canal fechado em staging ligados aos testes diretos;
- modo staging `finalizeOnAck:false` separado da compatibilidade legada;
- `content_manga.js`, actions callers e smoke simulado classificados separadamente;
- riscos de callback sem resposta, `persisted:false` contraditório e corrida `result_received → dom_applied` explicitados;
- garantia local de timer separada do watchdog durável MV3;
- SHA e 90/90 posições conferidos.

**Veredito:** ✅ APROVADO.

### `stop-batch.js` — criação e auditoria em 2026-09-29

- batchId string e rejeição de tipo inválido ligados ao teste direto;
- ausência de sender no repasse ao orchestrator documentada como diferença crítica de START_BATCH;
- semântica de batchId omitido/falsy → currentBatchId global explicitada;
- cleanup de lote ativo, remoção de pendente e promoção FIFO atribuídos ao orchestrator/testes integrados;
- gaps de string vazia/whitespace, source ampla e ownership explicitados;
- SHA e 19/19 posições conferidos.

**Veredito:** ✅ APROVADO.

### `start-batch.js` — criação e auditoria em 2026-09-29

- validação de `images/index` e repasse de `request + sender` ligados ao teste direto;
- reidratação/FIFO/idempotência atribuídos corretamente ao orchestrator `background.js::startBatch`;
- sender tab documentado como fonte preferida de mangaTabId;
- testes integrados de FIFO, idempotência e concorrência classificados separadamente da action;
- gaps de lista vazia, índices, batchId, prompt e source ampla explicitados;
- SHA e 22/22 posições conferidos.

**Veredito:** ✅ APROVADO.

### `set-debug-mode.js` — criação e auditoria em 2026-09-29

- persistência de `debugMode:true`, broadcast multi-tab e rejeição de string ligados às assertions reais;
- caller do popup e consumidor `content_manga` confirmados;
- storage durável diferenciado do broadcast fire-and-forget;
- gaps do caminho `false`, falhas de storage/query/sendMessage e source ampla explicitados;
- SHA e 40/40 posições conferidos.

**Veredito:** ✅ APROVADO.

### `request-image-data.js` — criação e auditoria em 2026-09-29

- relay de mangaTabId/index e preservação da resposta ligados ao teste direto;
- conversão de `chrome.runtime.lastError` para `{error}` ligada a assertion específica;
- consumidor `job-runner`, destino `content_manga` e adaptador legado do background separados da action;
- ausência de validator/ownership e superfície ampla de source explicitadas;
- retries atribuídos corretamente ao consumidor, não à action;
- SHA e 33/33 posições conferidos.

**Veredito:** ✅ APROVADO.

### `report-error.js` — criação e auditoria em 2026-09-29

- validação de `jobId`/erro, ownership e batchId forjado ligados aos testes diretos;
- job persistido documentado como fonte autoritativa mesmo quando `currentBatchId` mudou;
- finalização real sem aba do mangá confirmada em `process-finalize-real.test.js`;
- consumer `job-runner` e lifecycle real diferenciados da prova da action;
- gaps de index/mangaTabId, storage/finalize e truthiness das comparações explicitados;
- SHA e 72/72 posições conferidos.

**Veredito:** ✅ APROVADO.

### `relay-progress.js` — criação e auditoria em 2026-09-29

- relay explícito e fallback `activeMangaTabId` ligados aos testes integrados;
- mutação `gemini_job_<senderTabId>` → `running` ligada à suíte real;
- ACK do router separado da entrega visual fire-and-forget;
- consumers em `content_gemini.js`/`job-runner.js` confirmados;
- gaps de payload, source ampla, sender ausente e falhas de storage/tabs explicitados;
- SHA e 39/39 posições conferidos.

**Veredito:** ✅ APROVADO.

### `refresh-job-watchdog.js` — criação e auditoria em 2026-09-29

- ownership baseada em sender + jobIndex durável documentada;
- ids de manga/index/Gemini enviados pelo request registrados como não-autoritativos;
- consumidor `job-runner` e helper `jobs-watchdog` separados da prova direta da action;
- canonicalização por `TabIdentity` cruzada com a implementação real;
- gaps de validator, job ausente, dependências, aliases e telemetria explicitados;
- SHA e 87/87 posições conferidos.

**Veredito:** ✅ APROVADO.

### `open-manga-root.js` — criação e auditoria em 2026-09-29

- delegação `handleMarkerAndShow(null, resolve)` ligada aos testes diretos da action;
- sucesso e erro do helper são preservados;
- helper real de marker e caller no popup foram verificados separadamente;
- gaps para helper ausente, callback que não chega e source ampla foram explicitados;
- SHA e 20/20 posições conferidos.

**Veredito:** ✅ APROVADO.

### `open-existing-folder.js` — criação e auditoria em 2026-09-29

- branches de anchorId, busca por folderPath e marker documentados separadamente;
- escape de metacaracteres ligado aos testes reais de regex;
- helper de marker separado do wiring da action;
- assimetria entre anchorId (`exists:true`) e busca por path (primeiro resultado sem validar `exists/state`) registrada;
- gaps de payload, APIs Chrome e múltiplos resultados explicitados;
- SHA e 39/39 posições conferidos.

**Veredito:** ✅ APROVADO.

### `log-entry.js` — criação e auditoria em 2026-09-29

- encaminhamento real para o logger central ligado à suíte `actions-low-risk.test.js`;
- validação de tipos foi documentada como código sem prova focal, em vez de receber rótulo verde por herança;
- emissores reais `content_manga.js` e `content_gemini.js` confirmados;
- ACK síncrono foi separado da persistência assíncrona da fila em `background/log.js`;
- gaps de payload, source ampla e falhas de logger/storage explicitados;
- SHA e 51/51 posições conferidos.

**Veredito:** ✅ APROVADO.

### `get-tab-id.js` — criação e auditoria em 2026-09-29

- retorno deriva exclusivamente de `context.sender.tab.id`, sem confiar no payload;
- action real, router isolado e compatibilidade `legacyResponseActions` do background foram diferenciados;
- consumidores reais em `content_gemini.js` e `content_manga.js` confirmados;
- fallback legado do Gemini foi separado do fluxo moderno `CLAIM_GEMINI_JOB`;
- gaps para sender/tab ausentes e source ampla foram explicitados;
- SHA e 18/18 posições conferidos.

**Veredito:** ✅ APROVADO.

### `force-send-activation.js` — criação e auditoria em 2026-09-29

- branches `minimized_window` e ativação por aba ligados às assertions diretas;
- semântica `async:false` confrontada com o router: a resposta `ok:true` ocorre antes dos efeitos assíncronos;
- handler `DO_SEND_NOW` verificado em `content_gemini.js`;
- busca do corpus registrou ausência de caller de produção atual para `FORCE_SEND_ACTIVATION`;
- gaps de IDs, APIs Chrome, timers e erros silenciosos explicitados;
- SHA e 71/71 posições conferidos.

**Veredito:** ✅ APROVADO.

### `fetch-image-base64.js` — criação e auditoria em 2026-09-29

- URL/protocolo, sessão Gemini dupla, MIME, HTTP, tamanho e timeout ligados às assertions reais;
- registrado que 50 MiB é checado após materializar Blob e que FileReader fica fora do timeout de 30 s;
- mirror histórico separado da action real;
- gaps de FileReader/blob/router/redirect/MIME explicitados;
- SHA e 96/96 posições conferidos.

**Veredito:** ✅ APROVADO.

### `export-all.js` — criação e auditoria em 2026-09-29

- guard vazio e prefixos ligados à suíte real;
- `export-guard.test.js` reclassificado como mirror, não prova direta;
- semântica best-effort e `lastCompletedId` documentados;
- gaps para payload/item inválido, falhas, timeout, todos-falham e show;
- SHA e 41/41 posições conferidos.

**Veredito:** ✅ APROVADO.

### `download-image.js` — criação e auditoria em 2026-09-29

- prefixo relativo e filename já prefixado conferidos em testes reais;
- helper `waitForDownload` separado da prova da action;
- gaps explícitos para payload, falha imediata, interrupção/timeout pela action, search vazio/erro e exceções assíncronas;
- SHA e 32/32 posições conferidos.

**Veredito:** ✅ APROVADO.

### `download-chapter.js` — criação e auditoria em 2026-09-29

- aliases `DOWNLOAD_CHAPTER_AND_SHOW`/`OPEN_CHAPTER_FOLDER` confirmados no router;
- reuso de anchor e download normal ligados a assertions diretas;
- helper de marker classificado separadamente da action;
- gaps registrados para `images:{}` via action, anchor inexistente, payload sem validação, falhas de downloads API e eventual rejeição do helper;
- SHA e 35/35 posições conferidos.

**Veredito:** ✅ APROVADO.

### `deliver-result.js` — criação e auditoria em 2026-09-29

- primeira Bíblia criada já sob o padrão pós-reauditoria;
- batch/index/mangaTabId possuem casos diretos separados na suíte da action;
- staging foi separado de commit/finalize e cruzado com `jobs-dom-ack` e `job-runner`;
- `currentBatchId` divergente foi confirmado como não-autoritativo;
- gaps explícitos para formato/tamanho de src, rejeições de dependências, fallbacks nullish, resposta parcial do helper e logs;
- SHA e 88/88 posições conferidos.

**Veredito:** ✅ APROVADO.

### `deliver-result-url.js` — reauditoria aprovada em 2026-09-29

- ownership, identidade, normalização HTTPS, criação da aba, mapping, update e sync foram separados em unidades verificáveis;
- batch mismatch foi mantido como prova direta; index/mangaTabId ficaram explicitamente como gaps;
- `blob:` e `data:image/` deixaram de receber evidência verde por herança;
- foram registrados riscos sem teste: falha de `tabs.create`, `newTab.id`, `updateJobState`, `syncState`, data URL grande e falta de rollback;
- o consumidor real do hash `#manga-translator-extraction` foi confirmado em `content_manga.js`;
- SHA e 94/94 posições foram reconfirmados.

**Veredito:** ✅ APROVADO.

### `deliver-result-from-tab.js` — reauditoria aprovada em 2026-09-29

- sender→mapping, ownership, identidade mapping↔job, staging, retry, cleanup e finalize foram separados em unidades verificáveis;
- prova direta da action foi separada de helper DOM ACK, lifecycle e consumer retry;
- mismatches de batch/index/mangaTabId permaneceram explicitamente sem prova focal;
- foram registrados gaps para ownership negativo, Data URL incompleto/grande, resposta staged parcial, `tabs.remove`/`syncState`/`finalizeJob` falhando e fallbacks nullish;
- foi registrado que `tabs.remove` é best-effort, não awaited, e `lastError` é ignorado;
- SHA e 104/104 posições foram reconfirmados.

**Veredito:** ✅ APROVADO.

### `commit-result.js` — reauditoria aprovada em 2026-09-29

- validação, ownership, journal idempotente, batch, gate de persistência, transição e finalize foram mapeados separadamente;
- RUN-13/RUN-14 do job runner foram classificados como prova do consumidor, não da action;
- foi explicitado que o gate aceita `resultPersisted === true` **ou** `state === 'dom_applied'`;
- gaps registrados: marker inválido/expirado/fromError, falha de storage, batch omitido, fallbacks de ids e rejeições de update/finalize;
- SHA e 107/107 posições foram reconfirmados.

**Veredito:** ✅ APROVADO.

### `claim-gemini-job.js` — reauditoria aprovada em 2026-09-29

- sanitização/allowlist de campos mapeada ao teste que prova ausência de `signedUrl` e `internalOnly`;
- SOURCE_DENIED separado da autorização forte por sender.tab.id + job/index;
- jobId mismatch, aba manual e alias/replacement ligados às assertions específicas;
- tab-identity e consumer tests tratados como evidência de helper/consumidor, não automaticamente como prova da action;
- gaps explícitos para ensureInitialized, sender inválido, whitespace jobId, canonical mismatch, migration/storage failure e logs;
- SHA e 103/103 posições reconfirmados.

**Veredito:** ✅ APROVADO.


### `calculate-visual-fingerprint.js` — reauditoria aprovada em 2026-09-29

- 130/130 posições reconfirmadas contra SHA `ea474845cf9c6a6784e3ceb75298f0ac8df86e06`;
- explicação reorganizada em 14 unidades de comportamento, sem herdar “✅” para delimitadores/declarações;
- `calculate-visual-fingerprint-action.test.js` e `test_bg59.test.js` tratados como prova da implementação real;
- `background-fingerprint.visual.js` reclassificado corretamente como **simulação complementar**;
- lacunas adicionadas para parse inválido, HTTP não-2xx, decode/canvas, API parcial, imagem quadrada, timeout/tamanho e privacidade da URL;
- risco de `allowedSources:any` + fetch HTTP(S), log “visual-v3” stale e ausência de timeout/size guard registrados.

**Veredito:** ✅ APROVADO.


### `background.js` — reauditoria aprovada em 2026-09-29

- 1252 posições agora apontam para **32 unidades estruturais específicas** e possuem papel local concreto;
- evidência passou a ser classificada na unidade/comportamento realmente sustentado pelas assertions;
- o fallback textual genérico anterior e a etiqueta verde repetida por linha foram eliminados;
- `smoke-06-sm-message-routing.js` foi rebaixado corretamente para **simulação complementar**;
- gaps explícitos: bridge SM real, importScripts/order, onReplaced real, `downloadImagesAndShow`, timers longos MV3 e falhas de reconciliação;
- achados: `armFinalizationMarkerCleanup` sem consumidor local e comentário PR0 de replacement desatualizado;
- SHA/fonte/1252 posições reconfirmados.

**Veredito:** ✅ APROVADO para `667c05eb2d7adfca16a79d3e706c39a1e9398b72`.


### `check-extraction-tab.js`

Foram corrigidos dois defeitos objetivos:

- a Bíblia dizia que o argumento da IIFE estava na linha 24; o fonte real mostra a invocação na **linha 25**;
- a posição 26, correspondente ao newline final, não estava documentada; agora está.

Depois dessas correções o arquivo passou na auditoria atual.

### `manifest.json`

A integridade física foi reconfirmada:

- SHA-base confere;
- fonte integral confere;
- 76 posições são cobertas;
- permissões e APIs citadas possuem consumidores reais quando a Bíblia afirma uso;
- ausência de assertions específicas para permissões/atributos não protegidos permanece explicitamente marcada.

### `shared-ui.js` — auditoria aprovada em 2026-09-29

- SHA `b284fb8eb0e8d30f34dc83642f07916d20012bf0` reconfirmado contra o blob do branch;
- fonte integral exata e 351/351 posições documentais sequenciais;
- `redo-confirmation.test.js` executa o módulo real e prova modal próprio, cancelamentos, preferência persistente, purga e mutex da mesma URL;
- integrações de Popup e Options carregam `shared-ui.js` pelo HTML real e provam limpeza de restore legado, imagens/paths, bloqueio e GTC;
- `resize-and-tabs.test.js` prova o vetor concreto de escape de markup no consumidor;
- gate estático de ordem de carregamento e smoke de roteamento foram mantidos separados de prova comportamental;
- lacunas explícitas incluem resposta moderna preenchida de `SM_LIST_RESTORE`, normalização de array, erros de runtime/storage, `skipConfirmation`, ausência de DOM, forma array, callbacks de UI e resposta GTC negativa;
- riscos registrados sem alterar código: overlay concorrente pode deixar Promise pendente; ausência de `chapterId` pode remover o mesmo índice de capítulos não relacionados; migração parcial por capítulo pode esconder restores legados.

**Veredito:** ✅ APROVADO.

### `.gitignore` — auditoria aprovada em 2026-09-29

- SHA `e48fc70b1acc14aabb245f0db1820bc6c7a2849e` reconfirmado;
- fonte integral e 38/38 posições documentais conferidas;
- `verify-repository-structure.js` prova estaticamente quatro regras críticas: `.jest-cache*/`, `.ci-results/`, `all-blob-reports/` e `dist/`;
- `jest.config.js`, `playwright.config.js`, CI, publish e gerador de fixtures confirmam produtores concretos dos principais artefatos;
- regras sem teste de `git check-ignore` foram classificadas como contrato operacional ou lacuna, não como prova direta;
- riscos/documentação crítica: `.env.production` não coberto, regras defensivas `playwright-report/` e `.nyc_output/`, IDEs ignoradas integralmente e comentário “Sistema Operacional e Editores” abrangendo indevidamente CI/build/fixtures.

**Veredito:** ✅ APROVADO.

### `jest.config.js` — auditoria aprovada em 2026-09-29

- SHA `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc` e fonte integral reconfirmados;
- 90 linhas + newline final = 91/91 posições documentadas;
- `run-jest-ci.js` usa o próprio config com `--listTests --selectProjects` e falha em overlap/arquivo fora da união unit/integration;
- `verify-ci-contract.js` exige provider V8, `extension/**/*.js` e reporters lcov/json-summary/text-summary;
- ambientes node/jsdom, setup files, caches e timeouts foram mantidos como execução indireta/lacuna quando não há assertion focal;
- riscos: lista de nomes duplicada entre config/runner, integração sempre jsdom, ausência de reset global de mocks e dependência do verificador externo porque `coverageThreshold` é indefinido.

**Veredito:** ✅ APROVADO.

### `.github/workflows/ci.yml` — auditoria aprovada em 2026-09-30

- SHA `ebee75820db9bfab618bf3c3016065c5bc857ed7` reconfirmado durante a conclusão;
- fonte integral byte/texto equivalente, **558/558** posições e 558 headings sequenciais; o fonte não possui newline terminal;
- `recover-cancelled-ci.yml` foi cruzado como consumidor nominal de `MangaTranslator CI`; `package.json`, Jest runner, Playwright plan/merge e validadores foram cruzados como dependências operacionais;
- `verify-ci-contract.js` foi classificado como gate estático específico; seu self-test negativo prova diretamente que enfraquecimentos selecionados são rejeitados; inventários dinâmicos E2E/Jest foram mantidos separados de prova de runtime do workflow;
- o run observado de SHA anterior estava cancelado por concorrência, portanto nenhum “CI verde” foi inventado para o SHA documental;
- riscos explícitos: permissões de token implícitas, ausência de `timeout-minutes`, actions externas fixadas por major tag em vez de SHA, Codecov deliberadamente não bloqueante e diagnósticos pesados fora do PR comum.

**Veredito:** ✅ APROVADO.

### `diagnose-background-leak.js` — auditoria aprovada em 2026-09-30

- SHA `6b5a15d0d255d0285cfabc05f3412b81ffb3d3d4` reconfirmado contra o blob atual do branch;
- fonte integral da Bíblia comparada ao fonte: equivalência confirmada;
- **420 linhas + newline final = 421/421 posições**, com **421 headings `Linha N` sequenciais**;
- `package.json`, o job `background-leak-bisection`, `verify-ci-contract.js`, o helper `jest-worker-warning.js` e seu self-test foram lidos como consumers/evidências reais;
- o self-test prova diretamente apenas o detector textual de worker forçado; o CI Contract foi mantido como gate estático específico e a execução do script no workflow como evidência indireta;
- seed, parsing/seleção de workers, `spawnSync`, sweep, ddmin, complementos, interação cruzada, budget e exit codes não receberam prova direta inexistente;
- cinco solicitações ao auditor foram persistidas em `.state/076.json`; a mais grave (`076-002`, **HIGH**) registra que falhas comuns de Jest/spawn sem o warning alvo podem ser classificadas em `probe.failures` e ainda terminar em exit 0;
- também foram registrados ausência de timeout, `maxProbes=90` não estrito, exits antecipados sem summary e ausência de self-test focal do algoritmo;
- as lacunas permanecem explicitamente documentadas e **não foram “corrigidas” pelo próprio autor da Bíblia**, preservando independência entre documentação e eventual mudança funcional.

**Veredito:** ✅ APROVADO para o SHA auditado, com `audit_requests` OPEN não bloqueantes.


## Motivos detalhados das revisões obrigatórias

### `background.js` — histórico resolvido

A reprovação anterior foi resolvida pela reauditoria acima. O arquivo está **✅ APROVADO**.

### `calculate-visual-fingerprint.js` — histórico resolvido

A reprovação anterior foi resolvida pela reauditoria acima. O arquivo está **✅ APROVADO**.

### `claim-gemini-job.js` — histórico resolvido

A classificação genérica anterior foi substituída por evidência por comportamento. O arquivo está **✅ APROVADO**.

### `commit-result.js` — histórico resolvido

A evidência vaga anterior foi substituída por classificação por comportamento. O arquivo está **✅ APROVADO**.

### `deliver-result-from-tab.js` — histórico resolvido

A documentação genérica e os rótulos herdados por faixa foram substituídos por evidência por comportamento. O arquivo está **✅ APROVADO**.

### `deliver-result-url.js` — histórico resolvido

Os comentários genéricos e a evidência por faixa foram substituídos por classificação por comportamento. O arquivo está **✅ APROVADO**.


### `e2e-shard-plan.json` — auditoria aprovada em 2026-09-30

- SHA `22e8c20df9f42c0163a2d83c4e7b6f2d31f0dabc` reconfirmado antes da aprovação;
- bloco integral extraído da Bíblia e comparado ao fonte atual: equivalência exata confirmada;
- 45 linhas textuais + newline final = 46/46 posições, com 46 headings `Linha/posição N` sequenciais;
- `verify-e2e-shard-plan.js` foi lido e classificado como prova direta para a partição real: Playwright `--list --grep`, cardinalidade por grupo, união exata, interseção vazia e ausência de testes sem grupo;
- `verify-ci-contract.js` foi lido como gate estático específico para exatamente cinco ids, contagens 1/3/4/4/9 e workers 1/3/2/2/3;
- `run-e2e-group.js`, `playwright.config.js`, `package.json`, workflow CI, baseline e os três specs E2E foram cruzados como consumidores/dependências reais;
- `version: 1`, os valores exatos de `kind`, `estimatedSeconds`, o mapeamento semântico tag↔id e a propagação focal de workers continuam documentados conservadoramente como lacunas onde não há assertion específica;
- não foi confundida simples ocorrência textual com prova direta e o self-test do CI Contract foi explicitamente limitado ao que ele realmente muta.

**Veredito:** ✅ APROVADO.

## Revisões obrigatórias concluídas

As seis Bíblias rebaixadas pela auditoria foram revisadas e aprovadas. A pausa de produção foi encerrada.

A fila normal foi retomada em:

`extension/background/actions/deliver-result.js`.

## Protocolo de reauditoria

Para aprovar uma revisão:

1. buscar novamente o fonte e conferir SHA;
2. comparar bloco integral da Bíblia com o fonte;
3. comparar cada `Linha N` com a linha N real;
4. procurar fallbacks genéricos;
5. abrir os testes citados e ler as assertions;
6. reclassificar toda evidência forte;
7. exigir alerta explícito nos caminhos não provados;
8. verificar consumidores/dependências citados;
9. somente então trocar `🟣 REVISÃO OBRIGATÓRIA` por `✅ APROVADO`;
10. atualizar `STATUS.md` e `CHECKLIST.md`.
| 72 | `scripts/ci/playwright-gate-reporter.js` | SHA `71fb92c1215a...` reconfirmado; bloco integral exato | 82 linhas + newline final = 83/83 posições; 83 headings sequenciais | `playwright-gate-reporter-selftest.js` executa a implementação real e prova happy path, skip, baseline mínimo, estados terminais e failed/timedOut→passed em retry; `verify-ci-contract.js` fornece gates estáticos específicos; branch de resultados ausentes permanece lacuna explícita | lifecycle onBegin/onTestEnd/onEnd, merge global de shards, baseline, trust boundaries e classificação flaky documentados; gaps de `maxSkipped`, IDs/ordem e inputs malformados registrados | ✅ APROVADO |

### `playwright-gate-reporter.js` — auditoria do AGENTE 9

- SHA `71fb92c1215a86cdb309f4599ea8d0b422e9b02e` reconfirmado;
- fonte integral: 82 linhas + newline final = 83/83 posições, com headings sequenciais;
- o self-test executa o reporter real; gates estáticos e integração CI foram classificados separadamente;
- lacunas externas permanecem explícitas em `.state/072.json`; nenhuma prova foi fabricada pelo agente documental.

**Veredito:** ✅ APROVADO.


### `.github/workflows/recover-cancelled-ci.yml` — auditoria aprovada pelo AGENTE 4 em 2026-09-30

- SHA `4809f824f177e93686c11270793eb672aee5952b` reconfirmado contra o blob reservado;
- fonte integral extraída da Bíblia e comparada ao fonte atual: equivalência textual exata confirmada, incluindo newline terminal;
- 316 linhas textuais + newline final = 317/317 posições, cobertas por 70 blocos semânticos contíguos, sem lacunas ou sobreposição;
- o acoplamento com `.github/workflows/ci.yml` foi conferido: o produtor chama-se `MangaTranslator CI` e usa política de cancelamento que motiva a recuperação;
- não foi localizada suíte focal, `actionlint` ou `yamllint` que prove os branches internos deste controlador; nenhuma ocorrência textual foi promovida a prova direta;
- trust boundaries de `workflow_run`, exclusão de forks, permissões, idempotência, seleção por HEAD SHA, cutoff, proteção contra CI concorrente, rerun integral, polling por `run_attempt` e timeout foram documentados;
- riscos residuais ficaram explícitos: snapshot de PR/HEAD pode ficar stale antes do POST, chamadas de API não têm retry/backoff local e o job global de 120 min compete com espera de até 30 min por candidato;
- lacunas externas foram persistidas em `.state/067.json` como `067-001` a `067-003` sem alterar código funcional ou fabricar prova.

**Veredito:** ✅ APROVADO.


### `check-js-syntax.js` — auditoria aprovada em 2026-09-30

- SHA `fbc69cf9f910c3666ef390828b1793098b3bfe06` reconfirmado contra o blob atual;
- fonte integral da Bíblia comparada ao arquivo: igualdade byte-a-byte, com 30 linhas textuais + newline final = 31/31 posições;
- mapa linha por linha cobre 1–31 sem lacunas;
- referências `package.json:37-38` e `.github/workflows/ci.yml:32-43,485,503,531` conferidas no branch atual;
- `verify-ci-contract.js` exige o job `syntax-check`, mas não fixa internamente `npm run lint`, exatamente como a Bíblia registra;
- run #36577447500 / job #109437162703 confirmado como `success`, com `npm run lint`, execução de `node scripts/validation/check-js-syntax.js` e mensagem `Sintaxe JS validada em 218 arquivo(s).`;
- o checkout do job foi `refs/remotes/pull/66/merge` em `c6d75b8aa5c77cfd94d0a291e4f823cc22459575`; esse merge commit contém o mesmo blob `fbc69cf...`, então a evidência verde é válida sem confundir o head do PR com o commit efetivamente executado;
- não existe `tests/unit/validation/check-js-syntax.test.js` no branch; branches de sintaxe inválida, lista vazia, continuidade após falha, filtros negativos e raiz individual ausente continuam corretamente classificados como lacunas;
- `079-001` e `079-002` permanecem OPEN e não bloqueiam a aprovação documental.

**Veredito:** ✅ APROVADO.


### `playwright-gate-reporter-selftest.js` — auditoria aprovada em 2026-09-30

- SHA `478d6673dbb6d751e19f185feaed78764ebe6fde` reconfirmado contra o blob atual;
- fonte integral incorporada na Bíblia é idêntica ao arquivo real;
- 79 linhas textuais estão documentadas individualmente e a posição 80 documenta explicitamente o newline final;
- o self-test importa a implementação real de `scripts/ci/playwright-gate-reporter.js`, e as assertions isolam 21 passed, skipped, failed→passed em retry, timedOut→passed em retry, total=20 e finais failed/timedOut/interrupted;
- `test-baseline.json` confirma `e2e.minTests=21`, `maxSkipped=0` e `maxFlaky=0`;
- o reporter possui a defesa `attemptsById.size < total && result.status === 'passed'`, e a Bíblia corretamente não a promove a prova direta porque o self-test não possui cenário focal correspondente;
- `package.json#validate` e o job `ci-contract` executam o self-test; `verify-ci-contract.js` não contém proteção focal dessa invocação e apenas cruza a matriz genericamente, em linha com `080-002`;
- `REG-E2E-FLAKY-RETRY-GATE` aponta para este arquivo e protege markers, sem ser confundido com prova semântica;
- `080-001` e `080-002` permanecem OPEN e não bloqueiam a aprovação documental.

**Veredito:** ✅ APROVADO.


### `validate-manifest.js` — auditoria aprovada em 2026-09-30

- SHA `93dbb1882c69c47482b1b07fdaf3a2a9e9d133b1` reconfirmado contra o blob atual;
- fonte integral da Bíblia é idêntica ao arquivo real; 18 linhas textuais + newline final = 19/19 posições documentadas;
- `extension/manifest.json` atual possui o mesmo blob `841fe70c183350e4110bc8ff57ab69b157169c36` citado na Bíblia, com `manifest_version: 3`, nome, versão e permissões válidos para o caminho verde;
- `package.json#validate:manifest`, `package.json#validate` e o job `manifest-validation` do workflow foram conferidos no branch atual;
- `verify-ci-contract.js` protege o id `manifest-validation`, mas não fixa o comando `npm run validate:manifest` nem o alias npm, exatamente como documentado em `081-003`;
- o workflow run #2167 (`run_id=36676692062`) terminou globalmente cancelado, porém o job `Manifest Validation` (`109763218316`) e o step `Validar manifest.json` concluíram `success`;
- o job executou o merge ref `ae53a56...`, cujo `scripts/validation/validate-manifest.js` possui o mesmo blob `93dbb188...`, e o log registra `node scripts/validation/validate-manifest.js` seguido de `manifest.json válido: Manga Translator v6.5`;
- os branches negativos e a limitação de truthiness/schema continuam corretamente classificados como lacunas; `081-001`, `081-002` e `081-003` permanecem OPEN.

**Veredito:** ✅ APROVADO.

### #224 `tests/unit/shared-ui/redo-confirmation.test.js` — auditoria independente aprovada pelo AGENTE 23 em 2026-09-30

- SHA do fonte `2b46e876c3f87e3c0155f4a38ccb0f1bbc950b98` reconfirmado contra o blob atual;
- a fonte integral incorporada na Bíblia é equivalente ao arquivo real; a única diferença editorial é a fence não incluir o newline terminal, que está documentado separadamente;
- 242 linhas textuais + newline terminal = **243/243 posições**, cobertas por faixas contíguas sem lacunas;
- os sete casos `test(...)` começam nas linhas **61, 83, 101, 167, 197, 216 e 236**, exatamente como registrado na Bíblia;
- `extension/shared/shared-ui.js` foi reconfirmado no SHA `b284fb8eb0e8d30f34dc83642f07916d20012bf0`; os branches de confirmação, mutex `redoRequestInFlight`, `SM_DELETE_CLEAN_URL`, limpeza local, `GTC_DELETE_BY_CLEAN_URL`, feedback e `finally` estão coerentemente descritos;
- `tests/smoke/smoke-04-storage-manager.js` e `tests/unit/gtc/indexeddb.test.js` provam os backends isoladamente, e a Bíblia **não** promove esses testes a prova ponta a ponta do shared-ui;
- os mocks de `chrome.runtime.sendMessage` desta suíte são corretamente classificados como simulação de sucesso dos backends, preservando como lacunas `224-001` e `224-002`;
- `224-003`, `224-004` e `224-006` permanecem ressalvas explícitas de força de assertion/branches/isolamento do harness;
- requests OPEN não bloqueiam a fidelidade documental da Bíblia, conforme a política do projeto;
- esta entrada **satisfaz o gate documental independente pedido em `224-005`**. O `.state/224.json` e a reserva do arquivo permanecem sob ownership exclusivo do **AGENTE 28**, que deve reconciliar o estado final e liberar sua reserva sem que o auditor sobrescreva esses arquivos.

**Veredito:** ✅ APROVADO.

### `redo-confirmation.test.js` — auditoria independente aprovada pelo AGENTE 23 em 2026-09-30

- **Índice:** #224 — `tests/unit/shared-ui/redo-confirmation.test.js`.
- **SHA auditado:** `2b46e876c3f87e3c0155f4a38ccb0f1bbc950b98`.
- **Integridade:** fonte atual reconfirmada; 242 linhas textuais + newline terminal = **243/243 posições**; bloco ```js``` da Bíblia é **byte a byte idêntico** ao fonte atual.
- **Estrutura executável:** 7 casos `test(...)`, iniciando nas linhas **61, 83, 101, 167, 197, 216 e 236**, exatamente como documentado.
- **Implementação correlata:** `extension/shared/shared-ui.js` no SHA `b284fb8eb0e8d30f34dc83642f07916d20012bf0`; consumidores reais confirmados em `extension/popup/popup.js` e `extension/options/options.js`.
- **Força probatória:** a suíte executa `shared-ui.js` real e prova modal próprio, cancelamentos, preferência persistente, limpeza local e mutex por cleanUrl. Os handlers `SM_DELETE_CLEAN_URL` e `GTC_DELETE_BY_CLEAN_URL` continuam mockados nesta unidade; por isso a Bíblia corretamente **não** reivindica integração ponta a ponta dos backends.
- **Lacunas preservadas:** `224-001`, `224-002`, `224-003`, `224-004` e `224-006` permanecem válidas e **não bloqueiam** a aprovação documental. Em especial, `224-006` é hipótese de robustez sobre cleanup completo dos exports globais e exige medição antes de qualquer mudança.
- **Gate global 224-005:** **SATISFEITO por esta entrada independente**. A ausência de uma aprovação individual de #224 em `AUDITORIA.md` foi resolvida sem alterar o teste, a Bíblia ou o código para fabricar evidência.
- **Coordenação:** no momento desta auditoria, `.state/224.json` permanece `BLOCKED` e a reserva do arquivo pertence ao **AGENTE 28**. A transição do state para `COMPLETED`, liberação da reserva e posterior reconciliação de `STATUS.md`/`CHECKLIST.md` permanecem a cargo do proprietário da unidade, para preservar o mutex de ownership.

**Veredito documental independente:** ✅ **APROVADO — #224 / SHA `2b46e876c3f87e3c0155f4a38ccb0f1bbc950b98`**.

### `jobs-watchdog-ordering.test.js` — auditoria independente do AGENTE 23 em 2026-09-30

- **Índice:** #153 — `tests/unit/background/jobs-watchdog-ordering.test.js`.
- **SHA auditado:** `2102182a1e313a02cdb511846a4561c3a0f607eb`.
- **Fonte:** 86 linhas textuais + newline terminal = **87 posições**; o teste possui um único cenário `WATCHDOG-ORDER-01` iniciado na linha 24.
- **Implementação correlata:** `extension/background/jobs-watchdog.js` no SHA `c17b766d7fbc34ea925fb82b19149d3d977de413`.
- **Propriedade funcional comprovada:** o Promise-gate da suíte demonstra que `finalizeJob(321,77,true)` é aguardado antes da remoção da extraction tab 900 e que a tab 901, pertencente a outro Gemini, não é removida.
- **Solicitação 153-001:** confirmada como válida. No módulo real, `await finalizeJob(...)` precede o cleanup e não está envolvido por `try/catch/finally`; se a Promise rejeitar, o cleanup posterior não é alcançado pelo fluxo normal. Não há teste focal de rejeição.
- **Defeito documental encontrado nesta auditoria:** embora a Bíblia declare **87/87 posições**, a coluna “Função auditada” fica desalinhada a partir da região de criação/assertions do watchdog. Exemplos objetivos:
  - posição 65 é `timeoutMinutes: 5,`, mas a Bíblia a descreve como “Assertion direta: alarme com prefixo watchdog é aceito”;
  - posição 68 é `expect(watchdog.handleAlarm(...)).toBe(true)`, mas a Bíblia a descreve como linha estrutural/fixture;
  - posição 72 é `expect(finalizeJob).toHaveBeenCalledWith(321,77,true)`, mas a Bíblia a descreve como linha estrutural;
  - posições 73–84 seguem com descrições deslocadas em relação ao código real.
- **Consequência:** cobertura numérica 87/87 não basta para aprovação enquanto a rastreabilidade semântica dessas posições estiver incorreta.
- **Coordenação:** o state #153 permanece `IN_PROGRESS` e a reserva pertence ao **AGENTE 15**. Esta auditoria não altera a Bíblia, o state ou o teste; a correção documental deve ser feita pelo proprietário atual e depois reaudited.

**Veredito documental independente:** ❌ **REPROVADO TEMPORARIAMENTE — corrigir a rastreabilidade linha a linha do #153 e reauditar.**

### `publish.yml` — auditoria independente aprovada pelo AGENTE 23 em 2026-09-30

- **Índice:** #066 — `.github/workflows/publish.yml`.
- **SHA auditado:** `f673d445a3cc022d473f9b59ae1e0c8972ecd013`.
- **Integridade:** 131 linhas textuais + newline terminal = **132/132 posições**; bloco `~~~yaml` da Bíblia comparado byte a byte com o fonte atual e confirmado idêntico.
- **Evidência:** gates estáticos de publish/versionamento corretamente classificados; nenhuma execução de `gh release` é promovida artificialmente a prova runtime.
- **Lacunas preservadas:** `066-001` (checkout↔tag), `066-002` (gate CI), `066-003` (concurrency) e `066-004` (harness semântico) continuam `ACCEPTED` e não bloqueiam conclusão documental.
- **Gate 066-005:** satisfeito por esta auditoria independente.

**Veredito documental independente:** ✅ **APROVADO — #066 / SHA `f673d445a3cc022d473f9b59ae1e0c8972ecd013`**.

### `jobs-watchdog-ordering.test.js` — reauditoria independente aprovada em 2026-10-01

- **Índice:** #153 — `tests/unit/background/jobs-watchdog-ordering.test.js`.
- **SHA auditado:** `2102182a1e313a02cdb511846a4561c3a0f607eb`.
- **Integridade da fonte:** 86 linhas textuais + newline terminal = **87 posições**; o SHA do state, do fonte atual e da Bíblia permanece vinculado ao mesmo objeto auditado.
- **Correção da reprovação anterior:** a rastreabilidade das posições 060–087 foi revalidada contra o fonte atual. Em particular, a posição 65 documenta `timeoutMinutes: 5`, a 68 documenta a assertion de `handleAlarm(...).toBe(true)`, a 72 documenta `finalizeJob(321,77,true)` e as posições 73–84 agora descrevem exatamente as assertions/ações correspondentes.
- **Implementação correlata:** `extension/background/jobs-watchdog.js` permanece no SHA `c17b766d7fbc34ea925fb82b19149d3d977de413`.
- **Evidência funcional preservada:** o Promise-gate prova diretamente, no caminho de sucesso, que `finalizeJob` é aguardado antes do cleanup e que apenas a extraction tab pertencente ao Gemini correspondente é removida. Execução registrada anteriormente: workflow `36791191322`, job `110170457309`, cenário `WATCHDOG-ORDER-01` PASS.
- **Solicitação 153-001:** permanece **ACCEPTED**. O caminho em que `finalizeJob` rejeita continua sem teste focal e sem política de cleanup/telemetria comprovada. Essa lacuna é funcional/testável e não é convertida artificialmente em prova pela aprovação documental.
- **Coordenação:** state V2 sem ownership ativo; nenhuma alteração funcional em `jobs-watchdog.js` ou no teste foi necessária para esta reauditoria.

**Veredito documental independente:** ✅ **APROVADO — #153 / SHA `2102182a1e313a02cdb511846a4561c3a0f607eb`**.

#### Retificação de integridade pós-veredito — #153

Após o veredito independente aprovado, o gate V2 detectou uma omissão estrutural remanescente na Bíblia: o documento possuía mapa semântico 87/87 e SHA correto, mas não continha uma seção canônica de **Fonte integral**. A Bíblia foi retificada com o blob exato de `tests/unit/background/jobs-watchdog-ordering.test.js` no mesmo SHA `2102182a1e313a02cdb511846a4561c3a0f607eb`, sem alterar o teste, a implementação correlata, as alegações probatórias ou a solicitação `153-001`. O veredito SHA-bound permanece aplicável ao mesmo objeto auditado.

### `manifest.json` — reauditoria independente SHA-bound em 2026-10-01

- **Índice:** #001 — `extension/manifest.json`.
- **SHA auditado:** `841fe70c183350e4110bc8ff57ab69b157169c36`.
- **Integridade:** 75 linhas textuais + newline final = **76 posições**; state, fonte atual e SHA declarado na Bíblia coincidem. A seção de fonte integral já é validada pelo gate estrutural.
- **Wiring/evidência reconferidos:** `validate-manifest.js` exige JSON válido, campos básicos e MV3; `verify-repository-structure.js` fixa popup/options/background e ordem dos arrays JS; `surface-reduction.test.js` exige `host_permissions === ['<all_urls>']`; o E2E carrega `extension/` como extensão Chromium real e observa o Service Worker.
- **Lacunas preservadas:** `001-001` e `001-002` permanecem **ACCEPTED**. O conjunto exato de `permissions` e os descriptors completos `matches/world/run_at` ainda merecem gates focais; a Bíblia não os promove a prova inexistente.
- **Conclusão:** a documentação é fiel ao objeto atual e separa prova direta, gate estático, execução indireta e ausência de teste.

**Veredito documental independente:** ✅ **APROVADO — #001 / SHA `841fe70c183350e4110bc8ff57ab69b157169c36`**.

### `check-extraction-tab.js` — reauditoria independente SHA-bound em 2026-10-01

- **Índice:** #004 — `extension/background/actions/check-extraction-tab.js`.
- **SHA auditado:** `9ee40474d8c52da5e725ab04a2e325dd69830a51`.
- **Integridade:** 25 linhas textuais + newline final = **26 posições**; fonte integral, state e fonte atual permanecem no mesmo SHA.
- **Evidência direta reconferida:** `actions-low-risk.test.js` carrega a action real e prova o hit nominal; `plan-missing-handlers-real.test.js` prova criação real do mapping por `GEMINI_RESULT_URL` e hit/miss; `routed-actions-legacy.test.js` prova alias/roteamento e formato legado sem wrapper `ok`.
- **Wiring:** `background/router.js` mantém `CHECK_IF_EXTRACTION_TAB → check-extraction-tab`; a action aguarda `ensureInitialized()` antes de ler `state.extractionTabs`.
- **Lacunas preservadas:** `004-001` e `004-002` permanecem **ACCEPTED**. O spread `{ isExtractionTab: true, ...mapping }` continua vulnerável a mapping malformado com discriminador conflitante, e branches defensivos de sender/state/bootstrap seguem sem testes focais.
- **Conclusão:** essas lacunas estão corretamente documentadas e não são mascaradas como comportamento provado.

**Veredito documental independente:** ✅ **APROVADO — #004 / SHA `9ee40474d8c52da5e725ab04a2e325dd69830a51`**.

### `tab-identity.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #033 — `extension/background/tab-identity.js`.
- **SHA auditado:** `008c9a054ae417e0f31224617346e24fc9dbc1b4`.
- **Integridade:** 362 linhas textuais + newline final = **363 posições**; fonte integral e mapa 363/363 foram revalidados pelo gate documental.
- **Teste focal:** `tests/unit/background/tab-identity.test.js` no SHA `1f2dd52513037f061613d04453a961fbaeddef84` prova diretamente migração de registros/alarms/state (TAB-01), alias pré-job (TAB-02), cadeia (TAB-03), ciclo (TAB-04), recovery idempotente (TAB-05), TTL (TAB-09) e reconciler com identidade canônica (TAB-12).
- **Wiring reconferido:** `background.js` cria a facade, recupera migrations/aliases e trata `tabs.onReplaced`; `jobs-lifecycle.js` e `jobs-reconciliation.js` recebem resolução/migração canônicas; `state.js` fornece `replaceGeminiTabReferences`.
- **Lacunas preservadas:** `033-001`…`033-006` permanecem **ACCEPTED**. Em especial, max hops/IDs inválidos, conflito de ownership, fallbacks de alarm/state, concorrência de índices e reutilização de journal por `jobId` continuam sem prova/correção completa. A Bíblia descreve essas limitações explicitamente.
- **Conclusão:** bugs/riscos conhecidos não foram “resolvidos” por documentação; o documento é fiel ao código e às evidências atuais.

**Veredito documental independente:** ✅ **APROVADO — #033 / SHA `008c9a054ae417e0f31224617346e24fc9dbc1b4`**.

### `sync-version.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #078 — `scripts/release/sync-version.js`.
- **SHA auditado:** `9bc8fa5ae3fb127698e6f35988fd6efab7e56c07`.
- **Integridade:** 172 linhas textuais + newline final = **173/173 posições**; state, fonte atual e SHA declarado na Bíblia coincidem, e a fonte integral é validada pelo gate documental V2.
- **Evidência direta:** `tests/unit/background/version-sync.test.js` prova `parseNumericSemver` e `deriveVersionInfo` para 6.5.0, patch não-zero, 7.0.0 e formatos inválidos; o teste também protege marcadores canônicos do workflow de release.
- **Wiring/gates:** `package.json` expõe `version:sync` e `version:check`; o job **Version Integrity** executa `npm run version:check` e depois `--print-env`; `verify-publish-contract.js` e `verify-ci-contract.js` protegem os caminhos/comandos canônicos.
- **Request 078-001:** permanece **ACCEPTED**. Não há teste focal em sandbox/child-process para `collectState/getDifferences/syncWorkspace/checkWorkspace/printEnv`, mismatches individuais, escrita, exit code e precedência CLI.
- **Request 078-002:** permanece **ACCEPTED**. `syncWorkspace` grava Manifest e lockfile sequencialmente, sem transação/rollback; falha na segunda escrita pode deixar estado parcial.
- **Request 078-003:** permanece **ACCEPTED**. `--print-env` não chama `getDifferences` e, isoladamente, pode emitir metadados mesmo com drift; os workflows oficiais mitigam isso executando `version:check` antes.
- **Conclusão:** a Bíblia não transforma essas lacunas em comportamento provado e descreve corretamente CLI, side effects, precedência e limites da evidência atual.

**Veredito documental independente:** ✅ **APROVADO — #078 / SHA `9bc8fa5ae3fb127698e6f35988fd6efab7e56c07`**.

### `verify-ci-contract-selftest.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #082 — `scripts/validation/verify-ci-contract-selftest.js`.
- **SHA auditado:** `8d34dee0d632fde17c0609dac7dfe2a0ef60c927`.
- **Integridade:** 122 linhas textuais + newline final = **123/123 posições**; state, fonte atual e SHA declarado na Bíblia coincidem, com fonte integral validada pelo gate V2.
- **Objeto exercitado:** o self-test executa o `verify-ci-contract.js` real em sandboxes temporários e não replica sua lógica.
- **Cenário 1:** renomeia o job `visual` no workflow e exige falha com `job obrigatório ausente: visual`.
- **Cenário 2:** enfraquece `forbidOnly: isCi` para `false` e exige o diagnóstico específico de `test.only`.
- **Cenário 3:** remove um marker real selecionado da matriz de regressão e exige `marcador obrigatório ausente`.
- **Força da prova:** cada cenário exige status não-zero **e** mensagem esperada; falha incidental não é aceita como sucesso do self-test. Cada sandbox é removido em `finally`.
- **Request 082-001:** permanece **ACCEPTED** — não há meta-self-test focal para falhas do próprio harness, como marker ausente antes da mutação, cópia/spawn e cleanup após erro deliberado.
- **Request 082-002:** permanece **ACCEPTED** — `String.replace` altera apenas a primeira ocorrência e a seleção do marker é dinâmica; falta contrato de unicidade/asserção pós-mutação.
- **Request 082-003:** permanece **ACCEPTED** — o helper normaliza CRLF, mas não há fixture CRLF controlada que prove deterministicamente essa ramificação.
- **Conclusão:** as três lacunas estão explicitamente limitadas à robustez/meta-infra e não são promovidas a evidência inexistente.

**Veredito documental independente:** ✅ **APROVADO — #082 / SHA `8d34dee0d632fde17c0609dac7dfe2a0ef60c927`**.

### `verify-ci-contract.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #083 — `scripts/validation/verify-ci-contract.js`.
- **SHA auditado:** `636e4bfbaa0646cd8259e1f27f09004a92541294`.
- **Integridade:** **508/508 posições**, sem newline terminal; state, fonte atual e SHA declarado na Bíblia coincidem, com fonte integral validada pelo gate V2.
- **Papel confirmado:** o arquivo é um meta-gate estático transversal; lê workflow/configs/package/baseline/matriz/plano/runners, acumula violações em `problems` e falha com exit 1 quando qualquer contrato é quebrado.
- **Prova direta:** `verify-ci-contract-selftest.js` executa este verifier real em sandbox e prova três falhas negativas independentes: job `visual` ausente, `forbidOnly` enfraquecido e marker de regressão removido.
- **Wiring:** `package.json#validate`, o job `ci-contract` e `package.json#test:ci-contract:infra` apontam para o verifier/self-test canônicos.
- **Escopo corretamente limitado:** demais regras sobre triggers/concurrency, diagnósticos, Windows, topology E2E, coverage, Jest, baseline e reporter são classificadas como gates estáticos, não como provas funcionais.
- **Request 083-001:** permanece **ACCEPTED** — os três cenários do self-test não cobrem focalmente dezenas de branches independentes do verifier.
- **Request 083-002:** permanece **ACCEPTED** — `String.includes`/regex e `jobBlock` dependem de representação textual; comentário/dead text ou YAML semanticamente equivalente podem causar falso positivo/negativo conforme o check.
- **Conclusão:** a Bíblia descreve fielmente força, limites, arquitetura e riscos do meta-gate sem transformar presença textual em execução real.

**Veredito documental independente:** ✅ **APROVADO — #083 / SHA `636e4bfbaa0646cd8259e1f27f09004a92541294`**.

### `verify-coverage-selftest.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #084 — `scripts/validation/verify-coverage-selftest.js`.
- **SHA auditado:** `ac08dd661f2d2410a56a7fd685cd9b55e85901f9`.
- **Integridade:** 104 linhas textuais + newline final = **105/105 posições**; state, fonte atual e SHA declarado na Bíblia coincidem, com fonte integral validada pelo gate V2.
- **Implementação real:** o self-test importa `verifyCoverage` de `verify-coverage.js` e executa a função real contra fixtures temporárias; não replica o algoritmo do gate.
- **Seis cenários confirmados:** happy path, LCOV vazio, coverage 0%, arquivo crítico ausente, threshold global abaixo do mínimo e threshold crítico abaixo do mínimo.
- **Força probatória:** `expectCase` compara somente `result.ok`; portanto os cinco negativos provam rejeição global, mas **não** provam que cada falha ocorreu pelo motivo textual/branch pretendido.
- **Fixture:** `coverageEntry` pode produzir `covered/total` aritmeticamente incompatível com `pct`; o verifier atual governa thresholds por `pct` e não reconcilia essas contagens.
- **Request 084-001 (HIGH):** permanece **ACCEPTED** — fortalecer assertions por cenário sobre `problems`, métricas e inventários.
- **Request 084-002:** permanece **ACCEPTED** — vários branches fail-closed/normalização do verifier ainda não possuem fixture focal.
- **Request 084-003:** permanece **ACCEPTED** — o CI Contract protege cinco labels do self-test, mas não pina explicitamente o cenário de threshold crítico.
- **Request 084-004:** permanece **ACCEPTED** — falta decisão/teste sobre consistência interna entre `covered/total` e `pct`.
- **Conclusão:** a Bíblia descreve corretamente o que os seis cenários provam e, principalmente, o que eles **não** provam; as lacunas não foram mascaradas por aprovação documental.

**Veredito documental independente:** ✅ **APROVADO — #084 / SHA `ac08dd661f2d2410a56a7fd685cd9b55e85901f9`**.

### `verify-coverage.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #085 — `scripts/validation/verify-coverage.js`.
- **SHA auditado:** `45f920bd2db5ba3a1273438b1814b29aeafc3be4`.
- **Integridade:** **223 linhas textuais + newline final = 224/224 posições**; state, fonte atual e SHA declarado na Bíblia coincidem. A seção de fonte integral da Bíblia é **byte a byte idêntica** ao arquivo real.
- **Papel confirmado:** `verifyCoverage()` cruza `coverage-summary.json`, `lcov.info`, o corpus físico `extension/**/*.js` e o baseline para bloquear omissões de arquivos, coverage zero, thresholds globais/críticos e piso de arquivos instrumentados.
- **Wiring reconfirmado:** `jest.config.js` usa V8 + `collectCoverageFrom: ['<rootDir>/extension/**/*.js']`; `package.json` expõe `test:coverage:verify`; o workflow de CI executa o verificador após gerar coverage nos jobs canônicos; `verify-ci-contract.js` protege os marcadores principais do gate/self-test.
- **Self-test real:** `verify-coverage-selftest.js` importa a implementação real e cobre happy path, LCOV vazio, coverage 0%, ausência crítica combinada, threshold global e threshold crítico. As limitações de causalidade/assertions são corretamente documentadas, não promovidas a prova inexistente.
- **Request 085-001:** permanece **SUPERSEDED por 084-002** para centralizar a expansão da matriz de branches no self-test.
- **Request 085-002 (HIGH):** permanece **ACCEPTED** — baseline ausente/malformado e thresholds inválidos ainda podem enfraquecer ou tornar assimétrica a política do gate em execução isolada.
- **Request 085-003:** permanece **ACCEPTED** — o caso “arquivo crítico ausente” não isola causalmente a guarda crítica explícita.
- **Request 085-004:** permanece **ACCEPTED** — `parseLcovFiles` carece de testes focais para absoluto/relativo/tests, CRLF, barras Windows, dedup e ordenação.
- **Request 085-005:** permanece **ACCEPTED** — retornos precoces não incluem `lcovFiles`, enquanto o retorno normal inclui; o contrato de shape ainda precisa decisão explícita.
- **Conclusão:** a Bíblia descreve fielmente a implementação atual e separa comportamento provado, execução indireta, gates estáticos e lacunas reais sem fabricar evidência.

**Veredito documental independente:** ✅ **APROVADO — #085 / SHA `45f920bd2db5ba3a1273438b1814b29aeafc3be4`**.

### `verify-e2e-shard-plan.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #086 — `scripts/validation/verify-e2e-shard-plan.js`.
- **SHA auditado:** `ea1149ced74425ad27ede90ec409c2548cb5b65d`.
- **Integridade:** **155 linhas textuais + newline final = 156/156 posições**; state, fonte atual e SHA declarado na Bíblia coincidem. A fonte integral embutida é **byte a byte idêntica** ao arquivo real.
- **Papel confirmado:** o gate executa `playwright test --list --reporter=json` para o inventário completo e para cada tag do plano, constrói chaves compostas de teste e exige partição exata sem omissões ou duplicações.
- **Plano atual:** cinco grupos, somando 21 testes esperados; o baseline E2E protege mínimo 21. O verificador local aceita no mínimo 5 grupos, enquanto `verify-ci-contract.js` congela exatamente os cinco grupos/IDs/contagens/workers desta fase.
- **Wiring:** `package.json#test:e2e:plan` aponta para este arquivo; `validate` inclui o gate; o job agregado de E2E executa `npm run test:e2e:plan` antes da consolidação dos shards.
- **Request 086-001 (HIGH):** permanece **ACCEPTED** — não existe `verify-e2e-shard-plan-selftest.js`; branches negativos de schema, inventário, overlap, omissão, contagem e saída Playwright não possuem mutation/self-test focal.
- **Request 086-002:** permanece **ACCEPTED** — `spawnSync` possui `maxBuffer`, mas não timeout nem branch específica para `result.error`; hang/spawn error/maxBuffer carecem de política/teste controlado.
- **Request 086-003:** permanece **ACCEPTED** — `version`, `estimatedSeconds`, domínio de `kind` e a divisão “>=5 local / exatamente 5 global” continuam parcialmente fora do schema deste gate.
- **Conclusão:** a Bíblia é fiel à implementação e não transforma a execução nominal do gate em prova inexistente dos branches negativos.

**Veredito documental independente:** ✅ **APROVADO — #086 / SHA `ea1149ced74425ad27ede90ec409c2548cb5b65d`**.

### `verify-jest-worker-warning-selftest.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #087 — `scripts/validation/verify-jest-worker-warning-selftest.js`.
- **SHA auditado:** `4c8ce078abcf58f66ded7918650b2f54d9fa40cf`.
- **Integridade:** **10 linhas textuais + newline final = 11/11 posições**; state, fonte atual e SHA declarado na Bíblia coincidem. A seção de fonte integral é **byte a byte idêntica** ao arquivo real.
- **Implementação real:** o self-test importa `FORCED_WORKER_EXIT` e `hasForcedWorkerExit` diretamente de `scripts/ci/jest-worker-warning.js`, sem mock ou cópia local.
- **Prova comportamental:** exige `true` quando a string contém a assinatura compartilhada e `false` para PASS saudável e FAIL funcional comum.
- **Wiring reconfirmado:** `package.json#validate`, workflow CI, `verify-ci-contract.js` e `REG-WORKER-WARNING-GATE` mantêm este self-test no fluxo oficial; o runner Jest também continua chamando `hasForcedWorkerExit(jestStderr)`.
- **Request 087-001:** permanece **ACCEPTED** — o caso positivo monta o input com a própria constante `FORCED_WORKER_EXIT`; isso prova consistência interna, mas não aderência independente ao literal real emitido pela versão Jest suportada.
- **Conclusão:** a Bíblia classifica corretamente o que é prova direta, gate estático, execução indireta e lacuna; nenhuma evidência externa foi fabricada.

**Veredito documental independente:** ✅ **APROVADO — #087 / SHA `4c8ce078abcf58f66ded7918650b2f54d9fa40cf`**.

### `verify-publish-contract.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #088 — `scripts/validation/verify-publish-contract.js`.
- **SHA auditado:** `f5b3f6c69f85f90fe43689de2e44b6ed70cca757`.
- **Integridade:** **71 linhas textuais + newline final = 72/72 posições**; state, fonte atual e SHA declarado na Bíblia coincidem. A fonte integral é **byte a byte idêntica** ao source.
- **Papel confirmado:** o CLI protege a existência dos artefatos canônicos de publicação, oito marcadores do workflow, ausência de três paths legados, trigger de tags `v*`, quatro marcadores de `sync-version.js` e ausência de dois paths legados do antigo workspace.
- **Wiring:** `package.json#validate:publish` aponta para este arquivo; `validate` o inclui; o job `ci-contract` executa `npm run validate:publish`; `verify-ci-contract.js` protege o wiring e marcadores essenciais do verificador.
- **Request 088-001:** permanece **ACCEPTED** — não existe self-test focal em sandbox/subprocesso que force arquivo ausente, marker removido, path legado, trigger quebrado, agregação de problemas e exit status.
- **Request 088-002:** permanece **ACCEPTED** — o gate é deliberadamente textual hoje (`includes`/regex); comentários/strings inativas podem satisfazer markers e YAML semanticamente equivalente pode ser rejeitado pela forma textual.
- **Conclusão:** a Bíblia descreve fielmente o gate atual e seus limites sem promover o caminho verde a prova dos branches negativos.

**Veredito documental independente:** ✅ **APROVADO — #088 / SHA `f5b3f6c69f85f90fe43689de2e44b6ed70cca757`**.

### `verify-test-policy-selftest.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #090 — `scripts/validation/verify-test-policy-selftest.js`.
- **SHA auditado:** `ac0318e4d90c5014180eb3d3a6ac4784cc70a24a`.
- **Integridade:** **109 linhas textuais + newline final = 110/110 posições**; state, fonte atual e SHA da Bíblia coincidem. A fonte integral é **byte a byte idêntica** ao source.
- **Implementação real:** cada sandbox copia `scripts/validation/verify-test-policy.js` atual e o executa via Node; o self-test não replica as regex do gate.
- **Cenários provados:** baseline válida; `test.skip`; `--forceExit` em script npm; e comando de teste mascarado com `|| true` no workflow. Os negativos exigem status não-zero e diagnóstico esperado.
- **Wiring:** `package.json#test:test-policy:infra`, job `ci-contract` e `verify-ci-contract.js` mantêm o self-test no fluxo oficial.
- **Request 090-001:** permanece **ACCEPTED** — ainda faltam mutações focais para `.only`, `test.todo`, `--passWithNoTests`, outros escopos de `--forceExit`/`|| true` e tokens proibidos em scripts/extension.
- **Request 090-002:** permanece **SUPERSEDED por 083-002**, que centraliza a fragilidade geral de gates textuais do CI Contract.
- **Conclusão:** a Bíblia representa corretamente a força e as limitações do self-test atual.

**Veredito documental independente:** ✅ **APROVADO — #090 / SHA `ac0318e4d90c5014180eb3d3a6ac4784cc70a24a`**.

### `verify-test-policy.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #091 — `scripts/validation/verify-test-policy.js`.
- **SHA auditado:** `4a821403353445023452a0b5055e3a0893beaad2`.
- **Integridade:** **85 linhas textuais + newline final = 86/86 posições**; state, source e SHA da Bíblia coincidem. A fonte integral é **byte a byte idêntica** ao arquivo atual, e o mapa por faixas cobre todas as posições 1–86 sem lacunas.
- **Papel confirmado:** o gate varre testes, scripts npm, workflows e JS operacional para bloquear formas textuais conhecidas de skip/focus/todo e escape hatches como `--forceExit`, `--passWithNoTests` e masking por `|| true`.
- **Prova direta correlata:** `verify-test-policy-selftest.js` executa esta implementação real em sandbox e cobre baseline, `test.skip`, `--forceExit` em script npm e `npm run test:* || true` em workflow.
- **Request 091-001:** permanece **SUPERSEDED por 090-001**, que centraliza a expansão da matriz negativa do self-test.
- **Request 091-002 (HIGH):** permanece **ACCEPTED** — aliases/chains semanticamente equivalentes como `xit`, `xdescribe`, `fit`, `fdescribe` e `test.concurrent.skip/only` não são cobertos pelos regexes atuais.
- **Request 091-003:** permanece **ACCEPTED** — masking em workflow só é detectado para `npm run test:<...> || true`; formas diretas como `npm test || true` ou `npx jest || true` ficam fora da regra.
- **Conclusão:** a Bíblia é fiel ao alcance textual real do gate e não apresenta a política como semanticamente completa.

**Veredito documental independente:** ✅ **APROVADO — #091 / SHA `4a821403353445023452a0b5055e3a0893beaad2`**.

### `cache-and-storage.spec.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #092 — `tests/e2e/cache-and-storage.spec.js`.
- **SHA auditado:** `b181989a9b89151ca17cbcbeb7db9342b98c9add`.
- **Integridade:** **367 linhas textuais + newline final = 368/368 posições**; state, source e SHA da Bíblia coincidem. A fonte integral é **byte a byte idêntica** ao arquivo atual e o mapa por faixas cobre todas as posições.
- **Evidência runtime SHA-bound:** a run **36577447500** executou o commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`; o blob de `tests/e2e/cache-and-storage.spec.js` nesse commit é exatamente `b181989a9b89151ca17cbcbeb7db9342b98c9add`.
- **Quatro cenários confirmados nos logs:** os dois casos `@e2e-medium-a` e os dois `@e2e-medium-b` aparecem nominalmente; ambos os shards terminaram `4 passed`. O gate agregado terminou **21 passed, skipped=0, flaky=0, failed=0**.
- **Request 092-001 (HIGH):** permanece **ACCEPTED** — `resetExtensionState` trata falhas de IndexedDB de forma best-effort e não prova pós-condição de bancos vazios, permitindo risco de contaminação entre testes no persistent context.
- **Request 092-002:** permanece **ACCEPTED** — o branch visível/headed/ui de `getBrowserModeConfig` não é exercitado pela CI stealth atual.
- **Request 092-003:** permanece **ACCEPTED** — `userDataDir` é criado em `os.tmpdir()` e não há remoção explícita comprovada após fechar o persistent context.
- **Conclusão:** a Bíblia representa corretamente tanto a evidência E2E forte do caminho nominal quanto os riscos de isolamento, modo visível e limpeza de recursos.

**Veredito documental independente:** ✅ **APROVADO — #092 / SHA `b181989a9b89151ca17cbcbeb7db9342b98c9add`**.

### `reader-offline.spec.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #093 — `tests/e2e/reader-offline.spec.js`.
- **SHA auditado:** `1ab953d0a031f77cb458befd31650e9ba9c4c052`.
- **Integridade:** **276 linhas textuais + newline final = 277/277 posições**; state, source e SHA da Bíblia coincidem. A fonte integral é **byte a byte idêntica** ao arquivo atual e a tabela documental cobre todas as posições 1–277.
- **Evidência runtime SHA-bound:** a run **36577447500** executou o commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`; o blob deste arquivo nesse commit é exatamente `1ab953d0a031f77cb458befd31650e9ba9c4c052`.
- **Três cenários confirmados:** renderização/ordem e contador, persistência do slider e navegação por teclado aparecem nominalmente no shard `fast`; o job terminou **9 passed**.
- **Request 093-001 (HIGH):** permanece **ACCEPTED** — o reset IndexedDB é fail-open em erros de transaction/exceções e não prova stores vazios antes do seed.
- **Request 093-002 (HIGH):** permanece **ACCEPTED** — a UI final não isola causalmente a migração para o storage novo; fallback legado pode produzir a mesma saída sem assertion direta de IndexedDB/remoção ou flag do legado.
- **Request 093-003:** permanece **ACCEPTED** — o profile `userDataDir` não tem remoção explícita comprovada no teardown.
- **Conclusão:** a Bíblia representa corretamente a força da prova E2E e não confunde compatibilidade de UI com prova da migração interna.

**Veredito documental independente:** ✅ **APROVADO — #093 / SHA `1ab953d0a031f77cb458befd31650e9ba9c4c052`**.

### `translation-flow.spec.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #094 — `tests/e2e/translation-flow.spec.js`.
- **SHA auditado:** `db1da42c48ff795c41c7103cd5778e5a5d98e878`.
- **Integridade:** **904 linhas textuais + newline final = 905/905 posições**; state, source e SHA declarado na Bíblia coincidem. A fonte integral é **byte a byte idêntica** ao arquivo atual e a cobertura documental possui todas as posições 1–905.
- **Evidência runtime SHA-bound:** a run **36577447500** executou o commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`; o blob deste arquivo nesse commit é exatamente `db1da42c48ff795c41c7103cd5778e5a5d98e878`.
- **Cobertura por shards confirmada nos logs:** FIFO = 1 cenário; attachment = 3; medium-a = 2 deste arquivo; medium-b = 2; fast = 6. Os cinco jobs concluíram com sucesso e o gate agregado da mesma run permaneceu verde.
- **Request 094-001:** permanece **ACCEPTED** — cada teste cria um `userDataDir` externo e o `afterEach` fecha apenas o persistent context; não há remoção explícita do diretório, apesar do import de `fs`.
- **Request 094-002:** permanece **ACCEPTED** — `resetExtensionState` e `readStorage` resolvem callbacks de `chrome.storage.local` sem verificar `chrome.runtime.lastError`, podendo transformar falha de setup/leitura em timeout ou assertion secundária.
- **Conclusão:** a Bíblia representa corretamente a evidência E2E forte do caminho nominal e preserva os riscos reais de cleanup e diagnóstico de storage.

**Veredito documental independente:** ✅ **APROVADO — #094 / SHA `db1da42c48ff795c41c7103cd5778e5a5d98e878`**.

### `gemini-mock-server.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #095 — `tests/fixtures/gemini-mock-server.js`.
- **SHA auditado:** `1cd13486bf3a6c1a3d5d4b645e5564be108d6ad4`.
- **Integridade:** **632 linhas textuais + newline final = 633/633 posições**; state, source e SHA da Bíblia coincidem. A fonte integral é **byte a byte idêntica** ao arquivo atual e o mapa documental cobre todas as posições.
- **Wiring real:** `playwright.config.js` inicia este arquivo como `webServer` na porta 3999. A run **36577447500** usou o commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`, cujo blob deste fixture é exatamente `1cd13486bf3a6c1a3d5d4b645e5564be108d6ad4`.
- **Superfície exercitada:** os E2E reais cobrem os caminhos centrais de attachment, FIFO/barreira, fast result, Shadow DOM, ignore-submit, ownership de resultado e serving de imagens; a Bíblia não promove rotas auxiliares sem assertion focal a prova direta.
- **Request 095-001:** permanece **ACCEPTED** — `attachmentFailAttempts`, `attachmentDelayMs`, OPTIONS, `/health`, 405, cleanup de desconexão, fallback de `manga-page.html`, default de resultado e 404 não possuem contract spec focal.
- **Request 095-002:** permanece **ACCEPTED** — `ATTACHMENT_BARRIERS` retém IDs concluídos; `release` limpa `waiters`, mas não remove a entrada do Map.
- **Request 095-003:** permanece **SUPERSEDED por 064-003** — identidade/health do serviço reutilizado em `reuseExistingServer:true` já está centralizada no contrato do Playwright config.
- **Request 095-004:** permanece **ACCEPTED** — `new URL(...)` e `decodeURIComponent(...)` não possuem tratamento local para input malformado; a política fail-fast versus 4xx segue sem teste focal.
- **Conclusão:** a Bíblia descreve fielmente o mock server atual, separando rotas exercitadas, caminhos indiretos e branches sem prova específica.

**Veredito documental independente:** ✅ **APROVADO — #095 / SHA `1cd13486bf3a6c1a3d5d4b645e5564be108d6ad4`**.

### `verify-repository-structure.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #089 — `scripts/validation/verify-repository-structure.js`.
- **Auditor:** AGENTE 3.
- **SHA auditado:** `04d0337a168e14994bd855a455f11dd61fcabcb6`.
- **Integridade:** source/state/Bíblia/claim coincidem no mesmo SHA; fonte integral exata; 379 linhas textuais + LF final = **380/380 posições**; união das faixas 1–380 sem gaps, overlaps ou posições fora do source.
- **Falha documental 1 — semântica de exceções:** a Bíblia afirma que o gate “acumula problemas em vez de falhar no primeiro erro” e que ao final “imprime todos os problemas e sai 1”. Isso não é universalmente verdadeiro: há `fs.readdirSync`, `fs.readFileSync` e `JSON.parse` sem `try/catch` no caminho principal (por exemplo, Manifest na linha 144 e package.json na linha 343). I/O/JSON inválido pode lançar antes do epílogo 371–379, sem acumular/imprimir a lista completa.
- **Falha documental 2 — faixa semanticamente incorreta:** a faixa “Posições 346–363 — portabilidade dos testes” atribui 346–350 ao scan de testes, mas essas posições ainda são a continuação do loop de scripts npm iniciado em 343–345. O scan de JavaScript de testes começa em 352. A cobertura matemática é integral, porém o mapeamento semântico da faixa não é fiel.
- **Falha documental 3 — consumer relevante omitido:** `scripts/validation/verify-ci-contract.js` lê diretamente `verify-repository-structure.js` e exige os marcadores `legacyReferenceMarkers` e `referência operacional legada`. Esse consumer não aparece na seção “Dependências, consumidores e wiring”.
- **Assertions/evidência revalidadas:** `verify-bible-coordination-selftest.js` executa a implementação real de `validateBibleCoordination` em sandboxes e prova states, locks, audit claims, SHA, fonte integral, coverage e projeções. Isso sustenta a classificação do módulo de coordenação, mas não corrige as três falhas documentais acima.
- **Audit requests:** 089-001 e 089-002 foram **RESOLVED** pela delegação atual a `bible-coordination.js` e self-test dedicado; 089-004 foi **SUPERSEDED** porque o parser/checagem exata de `ESTADO: ATIVA` que originava o falso negativo não existe mais no verifier atual. 089-003 (ausência de self-test focal do verifier completo) e 089-005 (presença sem validação de tipo file/dir) permanecem **ACCEPTED** e não são, por si sós, o motivo da reprovação documental.
- **Execução real correlata:** run #3461 chegou a executar o gate; falhou por um claim residual alheio em #095 (`audit claim exige READY_FOR_AUDIT: #95/COMPLETED`). Essa falha global não foi usada como prova contra #089.
- **Passagens:** 0–15 executadas; releitura final preservou o mesmo source SHA e os três findings materiais sobreviveram à tentativa formal de refutação e à segunda auditoria da própria conclusão.

**Veredito:** 🟣 CHANGES_REQUIRED

### `manga-page.html` — auditoria independente SHA-bound pelo AGENTE 1 em 2026-10-01

- **Índice:** #097 — `tests/fixtures/manga-page.html`.
- **SHA auditado:** `71d78eea7eddb51bc93c74bbb3bf652119551ce4`.
- **Integridade:** **100 linhas textuais + newline final = 101/101 posições**; state, source, audit claim e SHA declarado na Bíblia coincidem. A fonte integral embutida é byte a byte idêntica ao arquivo real.
- **Cobertura:** 16 faixas cobrem posições 1–101 de forma contígua, sem gaps, overlap ou posição fora do source.
- **Wiring/consumers:** `gemini-mock-server.js` serve o arquivo em `/` e `/manga-page.html`; `manga-images.js` fornece `page_001/page_002` 800×1200, avatar 48×48 e banner 960×120; `translation-flow.spec.js` e `cache-and-storage.spec.js` são consumers E2E diretos; `reader-offline.spec.js` reutiliza a URL como metadado.
- **Assertions reais:** o cenário E2E principal exige dimensões naturais válidas, visibilidade simultânea, exatamente duas traduções, `data-translated=true` e Data URLs nas duas páginas, além de avatar/banner não traduzidos; a suíte de persistência exige `restoreIndex` para `page_001/page_002` nos índices 0/1.
- **Evidência runtime:** na run `36815953158`, os shards `medium-a` e `medium-b` que exercitam estes contratos concluíram com sucesso, e o gate E2E agregado terminou **21 passed, skipped=0, flaky=0, failed=0**. O run global teve falhas não focais em CI Contract/Windows Portability, portanto isso não é apresentado como CI global verde.
- **Classificação:** provas comportamentais centrais são diretas; serving/Map estático e cosmética permanecem classificados conservadoramente, sem transformar ocorrência textual ou CSS não assertado em prova forte.
- **Audit requests:** nenhuma request é necessária para corrigir a Bíblia atual; limitações cosméticas/auxiliares já estão honestamente registradas e não contradizem o contrato documentado.
- **Conclusão:** não foi encontrada falha documental bloqueante após tentativa formal de reprovação, releitura do source e segunda verificação independente dos pontos críticos.

**Veredito documental independente:** ✅ **APROVADO — #097 / SHA `71d78eea7eddb51bc93c74bbb3bf652119551ce4`**.

### `background-test-utils.js` — auditoria independente SHA-bound em 2026-10-01

- **Índice:** #098 — `tests/helpers/background-test-utils.js`.
- **Auditor:** AGENTE 5.
- **SHA auditado:** `1c38cfc47917f2a42788c467b9dbf58648b73e2b`.
- **Integridade:** **60 linhas textuais + newline final = 61/61 posições**; state, source, claim e SHA declarado na Bíblia coincidem. A fonte integral embutida é **byte a byte idêntica** ao arquivo atual e a tabela cobre exatamente as posições 1–61, sem gaps ou posições extras.
- **Papel confirmado:** harness CommonJS compartilhado que resolve o path absoluto do `extension/background.js`, fornece `delay`/`flush`/`waitFor`, exige exatamente um listener de background e adapta `sendResponse`/retorno do listener para Promise.
- **Consumers reconfirmados:** exatamente nove imports reais no corpus atual: `test_bg59`, `marker-anchor-real`, `helpers-real`, `routed-actions-legacy`, `single-image-context-menu`, `lifecycle-alarms-real`, `message-handlers-real`, `process-finalize-real` e `plan-missing-handlers-real`. `delay` e `getBackgroundListener` não são importados externamente nesses consumers.
- **Assertions revalidadas:** `helpers-real.test.js` usa o valor retornado por `waitFor` em assertions posteriores; `test_bg59.test.js` exige `keepAlive === true` e payload específico; `plan-missing-handlers-real.test.js` BG-43 exige `keepAlive === false` e `response === { ok: true }`. Isso sustenta somente os caminhos concretos descritos pela Bíblia, não os branches negativos ausentes.
- **Evidência runtime SHA-bound:** o commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f` contém exatamente o mesmo blob do helper e os mesmos blobs dos nove consumers. A run **36577447500** terminou com sucesso; jobs `109437162616` (Unit + Integration 20.x) e `109437162789` (Windows Portability) listam PASS nominal para as nove suítes e resumo 109/109 suites, 851/851 testes.
- **Request 098-001:** permanece **ACCEPTED** — falta suíte focal para delay, rounds/limites de flush, timeout/erro/opções de waitFor, cardinalidade de listeners e combinações de settlement.
- **Request 098-002:** permanece **ACCEPTED** — `sendResponse` síncrono pode capturar `keepAlive=false` antes do retorno final do listener; `undefined` sem response não aciona o fallback estrito e pode deixar a Promise pendente.
- **Nota de lifecycle:** a Bíblia preserva rótulos autorais `OPEN` nas seções dessas solicitações; o estado operacional canônico atual é o `.state/098.json`, onde ambas estão `ACCEPTED`. As lacunas em si permanecem descritas corretamente e não são promovidas a prova.
- **Conclusão:** após tentativa formal de reprovação, releitura do source e segunda auditoria independente dos pontos críticos, não foi encontrada falha documental bloqueante.

**Veredito documental independente:** ✅ **APROVADO — #098 / SHA `1c38cfc47917f2a42788c467b9dbf58648b73e2b`**.

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
| 33 | `extension/background/tab-identity.js` | SHA `008c9a054ae4...` conferido; bloco integral exato | 362 linhas + newline final = 363/363 posições | alias/cycle/TTL/journal/recovery/state+alarm migration provados; concorrência/journal por jobId como gaps | 18 unidades específicas + papel local por posição | ✅ APROVADO |
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

| 74 | `scripts/ci/run-e2e-group.js` | SHA `e23c7aaa1712...` reconfirmado; bloco integral exato | 52 linhas + newline final = 53/53 posições; 11 faixas contíguas 1–53, sem lacunas | `verify-e2e-shard-plan.js` prova diretamente a partição das tags; `verify-ci-contract.js` protege runner/script/workers estaticamente; execução real do runner permanece indireta e branches negativos sem prova focal | runner, spawn, env/cwd/shell, lifecycle do child, assimetria local×CI, caminho do CLI e gaps de robustez documentados; 4 audit_requests persistidos em `.state/074.json` | ✅ APROVADO |
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
| 66 | `.github/workflows/publish.yml` | SHA `f673d445a3cc...` reconfirmado; bloco integral exato | 131 linhas + newline final = 132/132 posições; 24 blocos contíguos com faixas explícitas 1–132, sem lacunas | `verify-publish-contract.js` protege gatilhos/caminhos/ZIP/checksum; `version-sync.test.js` lê o workflow real e prova nomes derivados/anti-hardcode; execução de `gh release`, tag/checkout e races permanece conservadoramente como gap | lifecycle completo da release + trust boundaries de token/ref + montagem ZIP/docs/checksum + três ramos `gh`; riscos de mismatch checkout↔tag, `--clobber`, ausência de gate CI e concorrência registrados | ✅ APROVADO |
| 68 | `scripts/ci/data/e2e-shard-plan.json` | SHA `22e8c20df9f4...` reconfirmado; bloco integral exato | 45 linhas + newline final = 46/46 posições; 46 headings sequenciais | `verify-e2e-shard-plan.js` executa `playwright --list` real por tag e prova cardinalidade, união exata, ausência de omissões e duplicatas; `verify-ci-contract.js` fixa ids/contagens/workers; `version`, `kind` não operacional e `estimatedSeconds` permanecem gaps explícitos | 5 grupos específicos + fluxo workflow→runner→Playwright + trust boundary CI; riscos de tag↔id, schema/version, workers e benchmark stale documentados | ✅ APROVADO |
| 70 | `scripts/ci/data/test-baseline.json` | SHA `52a4b3c1500d...` reconfirmado; bloco integral exato | 67 linhas + newline final = 68/68 posições; 68 headings sequenciais; fonte integral conferida | `playwright-gate-reporter-selftest.js` carrega o consumidor real e prova 21 E2E mínimos, zero skipped e zero flaky/retry; Jest/visual/smoke/coverage classificados conservadoramente; `measuredBaseline` sem consumidor automatizado; gaps de anti-enfraquecimento explícitos | 5 blocos de política + thresholds por arquivo; trust boundary da CI, fallbacks fail-open de coverage, divergência documental de `measuredBaseline` e invariantes de não-redução documentados | ✅ APROVADO |
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

**Veredito:** ✅ APROVADO.

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

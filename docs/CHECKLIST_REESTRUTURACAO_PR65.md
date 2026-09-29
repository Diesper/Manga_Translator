# Checklist de execução — PR #65

> Branch: `refactor/standardize-project-structure`  
> Plano-base: `TAREFA_REESTRUTURACAO_ATUALIZADA(1).md`  
> Última auditoria antes deste checklist: HEAD `e720890cf34dc9437ee91f3b8172953497d69870`  
> Evidência CI: workflow **MangaTranslator CI** run **#1589** / id `36521561968` — sucesso.

## Estrutura

- [x] Projeto npm centralizado na raiz (`package.json` + `package-lock.json` únicos).
- [x] Jest centralizado em `/jest.config.js`.
- [x] Playwright de execução centralizado em `/playwright.config.js`.
- [x] Tooling movido para `scripts/{ci,validation,maintenance,release}`.
- [x] `tests/ci/` removido.
- [x] `tests/visual-v3/` migrado para `tests/visual/`.
- [x] Fixtures E2E migradas para `tests/fixtures/` e `tests/setup/`.
- [x] BAT/PS1 removidos.
- [x] `working-directory: tests`, `npm --prefix tests` e projeto npm secundário eliminados.
- [x] Descoberta de raiz centralizada em `tests/helpers/repo-root.js`.
- [x] Layout interno 0-G de `extension/` aplicado sem mover `extension/`, `manifest.json` ou `background.js`.
- [x] Documentação histórica movida para `docs/historico/`.
- [x] Mapa lógico 0-A…0-G registrado em `docs/ARQUITETURA_DO_REPOSITORIO.md`.
- [x] README alinhado ao layout 0-G (`extension/content/cm-*` e `extension/shared/gtc-*`).
- [x] Gate estrutural agora varre arquivos operacionais e rejeita referências aos caminhos legados removidos (equivalente automatizado ao `git grep` final do plano).
- [x] O novo gate detectou e foi usado para corrigir referência documental obsoleta em `extension/content/content_gemini.js` (`extension/gemini/*` → `extension/content/gemini/*`).
- [ ] ⚠️ Histórico da Fase 0 não está literalmente dividido em um commit por bloco 0-A…0-G; o resultado estrutural está aplicado, mas reescrever commits antigos agora aumentaria o risco sem alterar o estado final.

## Baselines comprovadas pela CI do PR

- [x] Jest: **109 suítes / 851 testes**, 0 skipped, 0 todo.
- [x] Visual: **224/224**.
- [x] Smoke: **6 arquivos**, todos aprovados.
- [x] E2E: **21/21**, 0 skipped, 0 flaky, grupos 1/3/4/4/9.
- [x] Coverage: **56 arquivos** instrumentados.
- [x] Coverage global: **79,55 / 71,52 / 83,04 / 79,55** (statements/branches/functions/lines), acima dos mínimos.
- [x] Node 20 e Node 22 aprovados no gate Unit + Integration.

## Contrato e anti-falso-positivo

- [x] `verify-ci-contract.js` passa no PR.
- [x] Selftests de coverage, reporter E2E e worker-warning presentes.
- [x] Implementado self-test negativo do contrato em `scripts/validation/verify-ci-contract-selftest.js`.
- [x] O self-test negativo cobre três enfraquecimentos: job obrigatório removido, `forbidOnly` desativado e marcador da matriz de regressão removido.
- [x] Corrigida a mutação do cenário de matriz: o marcador agora é realmente removido, em vez de permanecer como prefixo da string substituta.
- [x] Criado `verify-test-policy.js` e `validate:test-policy` para bloquear `.skip`, `.only`, `test.todo`, `--forceExit`, `--passWithNoTests` e `|| true` em comandos de teste.
- [x] O job `CI Contract` executa a política em todo run e o contrato protege sua presença.
- [x] Adicionado self-test negativo da política: baseline válida passa e violações de `test.skip`, `--forceExit` e `|| true` precisam falhar.
- [x] Adicionado `validate:publish` para proteger `publish.yml`, `extension/`, `docs/Documentação.md` e `scripts/release/sync-version.js`.
- [x] Corrigido falso negativo do `validate:publish`: o regex de `tags: - "v*"` agora interpreta whitespace/newline de verdade, em vez de procurar barras invertidas literais.
- [x] Run #1620 confirmou o CI Contract e todos os self-tests negativos no HEAD `a942823`.

## Integrações

- [x] `npm run version:check` aprovado pelo job Version Integrity.
- [x] `Version Integrity` agora também executa `node scripts/release/sync-version.js --print-env`; o contrato protege essa etapa.
- [x] `version-sync.test.js` está incluído na suíte Jest verde.
- [x] `publish.yml` continua apontando para `extension/` e documentação canônica.
- [x] Nome `MangaTranslator CI` e IDs principais de jobs preservados.
- [x] `recover-cancelled-ci.yml` confirmado byte-for-byte idêntico à `main`.
- [x] Coverage e blob reports foram exercitados em run real.
- [x] Artefatos reais do run #1589 conferidos: 5 blob reports + relatório de coverage publicados e não expirados.
- [x] Corrigido o writer do diagnóstico Jest para gravar o resumo agregado em `/.ci-results/` (antes ainda apontava para `tests/.ci-results/`).
- [x] O contrato da CI agora protege explicitamente o caminho raiz dos diagnósticos Jest.
- [ ] Executar os diagnósticos pesados via `workflow_dispatch` na branch para validar `.ci-results/` e uploads reais; no run de PR eles ficaram **skipped** por design.
- [ ] Confirmar artefatos dos três diagnósticos pesados após o `workflow_dispatch`.

## Compatibilidade Windows/Linux

- [x] Adicionado gate `Windows Portability` em `windows-latest`.
- [x] O gate Windows executa `npm ci`, `validate`, Jest completo, smoke, visual e coverage + verificação de paths.
- [x] `CI Gate` exige sucesso do Windows em todo run normal.
- [x] O primeiro run Windows chegou até `validate` e confirmou estrutura, política de testes, publicação e CI Contract antes de expor incompatibilidade CRLF no self-test.
- [x] Self-test do CI Contract normaliza CRLF/LF no sandbox, tornando a mutação negativa portátil.
- [x] Run #1620: `Windows Portability` verde — `npm ci`, `validate`, Jest completo, smoke, visual, coverage e verificação de paths/LCOV.

## Interface de desenvolvedor novo

- [x] Jobs da CI executam `npm ci` a partir da raiz.
- [x] `test:ci`, `test:smoke`, `test:visual`, `test:e2e`/shards e `test:coverage` funcionam a partir da raiz na CI.
- [x] Criado job `fresh-developer-flow` para `workflow_dispatch`, em runner limpo, executando `npm ci` → unit → integration → smoke → visual → e2e → coverage → `npm test` na raiz.
- [x] `CI Gate` exige `fresh-developer-flow=success` em `workflow_dispatch`.
- [ ] Confirmar o `fresh-developer-flow` no disparo manual final.
- [x] Implementada prova de inventário no `run-jest-ci.js`: `test:unit` e `test:integration` precisam ser disjuntos e sua união precisa cobrir exatamente todos os arquivos `.test.js` do gate total.
- [x] O contrato protege os seletores canônicos de `test:unit` e `test:integration`.
- [x] Run #1620: partição Jest comprovada — `unitFiles=96`, `integrationFiles=13`, união `109/109`; 109 suítes e 851 testes.

## Comparação antes × depois

- [x] Etapa 25 registrada em `docs/PLANO_REESTRUTURACAO.md` com métricas estruturais reais da árvore do PR e números da CI.
- [x] 2 → 1 package.json; 3 → 1 configs Jest; 12 → 0 BAT/PS1; 9 → 0 jobs com working-directory em tests; ≥30 → 0 finders locais.
- [x] Baselines funcionais permaneceram acima dos mínimos protegidos.

## Acoplamentos frágeis

- [x] C01–C41 detalhados individualmente em `docs/PLANO_REESTRUTURACAO.md`, com C28 explicitamente marcado como inexistente no registro original.
- [x] C31 confirmado por leitura: os três specs E2E consomem `MANGA_E2E_BROWSER_MODE`.
- [x] C01/C02/C04 confirmados por leitura do `sync-version.js` e `publish.yml`.

## Eficiência da CI sem perda de gates

- [x] `push` automático restrito à `main`; branches com PR usam `pull_request` e deixam de disparar duas suítes idênticas por commit.
- [x] `workflow_dispatch` permanece disponível para validação manual de qualquer branch.
- [x] Contrato protege `push: main`, `pull_request` e `workflow_dispatch`.

## Estado da PR

- [x] PR #65 permanece aberta e mergeable.
- [x] `main` estava em `8d470f4`, o mesmo base do PR, na última auditoria.
- [x] CI do HEAD anterior `e720890cf34dc9437ee91f3b8172953497d69870` ficou verde.
- [x] Run #1620 do HEAD `a942823` ficou completamente verde, incluindo `CI Gate`.
- [ ] CI do novo HEAD após o último endurecimento (`--print-env` + documentação Fase 0) precisa ficar verde.
- [ ] Não fazer merge automático.

export type Sev = "CRÍTICO" | "ALTO" | "MÉDIO" | "BAIXO" | "INFO";

export const meta = {
  repo: "Diesper/Manga_Translator",
  commit: "8d470f4 (merge PR #62)",
  version: "manifest 6.5 / package 6.5.0",
  prodFiles: 56,
  prodLoc: 19038,
  testFiles: 145,
  jestSuites: 109,
  jestTests: 851,
  jestFailed: 0,
  jestSkipped: 0,
  jestTimeSec: 428,
  visualTests: 224,
  smokeFiles: 6,
  e2eSpecs: 3,
  coverage: { statements: 79.54, branches: 71.58, functions: 83.04, lines: 79.54 },
};

export const commands = [
  { cmd: "tests/: npx jest --config jest.coverage.config.js --coverage --ci", result: "109 suítes / 851 testes passaram, 0 falhas, 0 skipped, 427s, exit 0", status: "ok" },
  { cmd: "tests/: node ci/verify-coverage.js", result: "Aprovado — 56/56 arquivos instrumentados; 79.54/71.58/83.04/79.54", status: "ok" },
  { cmd: "tests/: npm run test:smoke", result: "6 arquivos, todos passaram", status: "ok" },
  { cmd: "tests/: npm run test:visual-v3", result: "Total 224, todos passaram", status: "ok" },
  { cmd: "npm run version:check", result: "Consistente: package 6.5.0 / manifest 6.5", status: "ok" },
  { cmd: "MUTAÇÃO: cm-chapter.js canonicalTitle → identidade; jest canonical-title|chapter-dedup", result: "3 suítes / 36 testes CONTINUARAM PASSANDO (produção não é exercitada)", status: "mut" },
  { cmd: "tests/: npm run test:e2e (Playwright + Chromium)", result: "NÃO EXECUTADO — sem Chromium no sandbox; análise estática apenas", status: "skip" },
  { cmd: "lint / typecheck", result: "NÃO EXISTEM no projeto (só `node --check` no CI)", status: "skip" },
];

export const problems: { sev: Sev; file: string; line: string; problem: string; evidence: string; fix: string; kind: string }[] = [
  {
    sev: "ALTO", kind: "Bug confirmado (teste)",
    file: "tests/helpers/extracted-functions.js", line: "18-38 vs extension/cm-chapter.js:5-14",
    problem: "canonicalTitle testada é uma CÓPIA divergente da produção. A cópia remove prefixos 'Cap 5:' e sufixos '| Site'; a produção NÃO faz isso.",
    evidence: "prod('Cap 5: Naruto')='cap 5: naruto' vs copy='naruto'. Mutação: produção zerada → 36 testes (canonical-title*.test.js, chapter-dedup.test.js) continuam verdes.",
    fix: "Apagar extracted-functions.js; importar window.MangaTranslatorChapter.canonicalTitle de extension/cm-chapter.js (já exposto) nos 5 arquivos que usam a cópia.",
  },
  {
    sev: "ALTO", kind: "Bug confirmado",
    file: "extension/background.js", line: "48-80 (importScripts) + background/router.js:79",
    problem: "background/log.js nunca é carregado no service worker. O router cai no fallback `function(){}` → eventos SOURCE_DENIED, ACTION_NOT_FOUND e ACTION_ERROR internos do router NUNCA são logados em produção.",
    evidence: "grep: nenhum importScripts/require de background/log.js; coverage log.js = 0%.",
    fix: "Adicionar importScripts('background/log.js') antes de router.js OU passar `log` explicitamente para createMessageRouter e usá-lo nos passos 3/4/7.",
  },
  {
    sev: "ALTO", kind: "Risco provável (segurança)",
    file: "extension/popup.js", line: "657-661 e 930",
    problem: "innerHTML com `img.src`/`url` sem escapeHTML. Uma página hostil pode servir <img src=\"data:image/svg+xml,...\"> (400×500, passa o filtro) contendo aspas — URLs data: NÃO percent-codificam aspas — e injetar markup no popup (iframe/links/overlay). CSP MV3 bloqueia script inline, mas não a injeção de HTML.",
    evidence: "new URL('data:image/svg+xml,<svg .../>\"><iframe src=https://x>').href preserva as aspas; content script envia img.src cru (cm-dom-replace.js:85).",
    fix: "Construir <img> via createElement + img.src = value (ou escapeHTML(img.src) e validar protocolo http(s)/data:image). Adicionar teste com src contendo aspas.",
  },
  {
    sev: "MÉDIO", kind: "Risco provável (segurança)",
    file: "extension/background/router.js", line: "47-58",
    problem: "identifySource usa substring: sender.tab.url.includes('gemini.google.com')/('127.0.0.1'). Uma aba em https://evil.com/?r=gemini.google.com ou gemini.google.com.evil.com é classificada como 'gemini' e passa em allowedSources:['gemini'].",
    evidence: "Executado: identifySource({tab:{url:'https://evil.com/?r=gemini.google.com'}}) === 'gemini'. Teste router.test.js:48-51 só cobre happy path.",
    fix: "Parsear com new URL() e comparar hostname === 'gemini.google.com' (e 127.0.0.1 apenas se build de teste). Testes negativos de lookalike.",
  },
  {
    sev: "MÉDIO", kind: "Risco (superfície)",
    file: "extension/manifest.json", line: "46-51, 55-58",
    problem: "Scaffolding de teste embarcado em produção: inject.js (MAIN world, document_start) e todo o pipeline Gemini rodam em http://127.0.0.1/*. Qualquer servidor local (dev server, painel de roteador via 127.0.0.1) recebe o RPA do Gemini e é tratado como origem 'gemini'.",
    evidence: "manifest.json matches; jobs-lifecycle.js:254 e router.js:51 tratam 127.0.0.1 como Gemini.",
    fix: "Gerar manifest de teste (script) com o match extra; manter o manifest publicado só com gemini.google.com. surface-reduction.test.js deveria falhar se 127.0.0.1 estiver no manifest de release.",
  },
  {
    sev: "MÉDIO", kind: "Bug confirmado (teste)",
    file: "tests/smoke/smoke-01-batch-lifecycle.js", line: "26-50",
    problem: "Smoke reimplementa assertJobOwnership localmente e afirma comportamento OPOSTO ao de produção: 'Mensagem legada sem jobId deve ser aceita' (owns=true). Produção (jobs-lifecycle.js:219) retorna owns:false sem jobId.",
    evidence: "smoke-01 e smoke-02 não fazem require de nenhum arquivo de extension/.",
    fix: "Reescrever smoke-01/02 usando loadBackgroundModule ou createLifecycle real; ou remover do gate (baseline smoke.minFiles=6 protege arquivos, não conteúdo).",
  },
  {
    sev: "MÉDIO", kind: "Bug confirmado (teste)",
    file: "tests/unit/inject/*.test.js (3 arquivos)", line: "inject-anti-hibernation.test.js:34-60, 209-238; raf-replacement.test.js:1-40",
    problem: "Nenhum teste executa inject.js. Eles 'simulam a lógica do guard', criam 'implementação espelho' do rAF e fazem grep no texto-fonte (expect(source).toContain).",
    evidence: "Coverage medido: extension/inject.js = 0% statements / 0% functions.",
    fix: "Carregar inject.js em jsdom com sessionStorage 'mangatranslator_tab'='true' e testar MANGA_TRANSLATOR_SET_PROMPT / FETCH_IMAGE / TRIGGER_SEND com efeitos observáveis.",
  },
  {
    sev: "MÉDIO", kind: "Código morto / divergente",
    file: "extension/background/state.js", line: "159-216",
    problem: "state.js contém reconcileJobs() e ensureInitialized() próprios que nunca são chamados (background.js usa jobs-reconciliation.js). A versão morta referencia self.processNextJob, que não existe no escopo global do SW.",
    evidence: "grep: nenhuma referência a MangaTranslatorState.reconcileJobs/ensureInitialized fora de state.js; coverage 160-216 = 0.",
    fix: "Remover o bloco; manter apenas get/patch/mutate/syncState/index*.",
  },
  {
    sev: "BAIXO", kind: "Melhoria (robustez)",
    file: "background/actions/download-image.js:9, open-existing-folder.js:10, download-chapter.js:9",
    line: "sem validate()",
    problem: "request.filename.startsWith / folderPath.replace / Object.keys(request.images) lançam TypeError se o campo faltar. O router captura e responde INTERNAL_ERROR, mas o erro é genérico e sem log útil (ver problema do log.js).",
    evidence: "Ações registradas com allowedSources:['any'] e sem validate.",
    fix: "Adicionar validate() como em fetch-image-base64.js e testes de payload inválido.",
  },
  {
    sev: "BAIXO", kind: "Melhoria (performance)",
    file: "extension/background.js", line: "406-424 (_flushLog)",
    problem: "Cada log faz get+set de até 500 entradas em storage.local; exceção dentro do loop descarta o lote em voo silenciosamente (catch vazio).",
    evidence: "Código lido; sem teste que injete falha em storage.set durante flush.",
    fix: "Debounce (ex.: 250ms) e re-enfileirar batch em caso de erro.",
  },
  {
    sev: "INFO", kind: "Observação (coverage)",
    file: "tests/helpers/load-background-module.js", line: "94-118",
    problem: "11 arquivos de teste carregam background.js via new Function(). O V8 coverage não atribui esse código a extension/background.js, então os 58.67% reportados SUBESTIMAM a cobertura real (ex.: waitForDownload 798-817 aparece não coberto apesar de download-wait.test.js).",
    evidence: "Tabela de coverage vs. download-wait.test.js:4-21.",
    fix: "Usar vm.Script com filename=backgroundPath (V8 atribui pelo nome do script) ou executar via require + jest.isolateModules.",
  },
];

export const testQuality = [
  { test: "unit/background/message-handlers-real.test.js (6)", code: "background.js real via loadBackgroundModule + router + ações", mocks: "chrome.* stateful (mock com estado)", assertion: "Respostas e efeitos no tabs/downloads mock", grade: "REAL E ÚTIL", why: "Dispara chrome.runtime.onMessage real e valida payload de resposta e mensagens encaminhadas." },
  { test: "unit/background/batch-lifecycle-real.test.js, process-finalize-real, startup-recovery", code: "jobs-lifecycle.js, state.js, reconciliation", mocks: "chrome.* stateful", assertion: "Estado persistido em mt_state, alarms, tabs criadas/removidas", grade: "REAL E ÚTIL", why: "Mutações em processNextJob/finalizeJob alterariam o snapshot verificado." },
  { test: "unit/background/router.test.js", code: "router.js real", mocks: "sender fake", assertion: "identifySource/allowedSources/validate", grade: "PARCIALMENTE ÚTIL", why: "Só happy path de identifySource; não detectaria o bug de substring (lookalike hosts)." },
  { test: "unit/content-manga/*-real.test.js (10 via loadContentScript)", code: "content_manga.js + cm-*.js reais em jsdom", mocks: "chrome.*; naturalWidth definido", assertion: "DOM (botão, gaveta, substituição de img), storage", grade: "REAL E ÚTIL", why: "Executa o IIFE completo; mudanças de comportamento do listener seriam detectadas." },
  { test: "unit/content-manga/canonical-title*.test.js, audio-synthesis*.test.js, integration/chapter-dedup.test.js (5 arquivos, 36+ testes)", code: "NENHUM — cópia em tests/helpers/extracted-functions.js", mocks: "—", assertion: "Sobre a cópia", grade: "ENGANOSO / NÃO TESTA PRODUÇÃO", why: "Mutação real em cm-chapter.js manteve 36 testes verdes. A cópia já divergiu da produção." },
  { test: "unit/inject/*.test.js (3 arquivos)", code: "NENHUM — simulação + grep de texto-fonte", mocks: "—", assertion: "toContain no source; lógica reimplementada", grade: "NÃO TESTA PRODUÇÃO", why: "inject.js com 0% de coverage. Um bug no listener MANGA_TRANSLATOR_SET_PROMPT passaria." },
  { test: "unit/popup/*, integration/popup*.ui.test.js", code: "popup.js + shared-ui.js reais via load-extension-page", mocks: "chrome.tabs.sendMessage respondendo GET_PAGE_IMAGES", assertion: "DOM do popup, mensagens enviadas", grade: "REAL E ÚTIL (happy path)", why: "Sem caso com src contendo aspas/HTML — não detectaria a injeção em popup.js:657." },
  { test: "unit/gtc/*, visual-v3/* (224)", code: "gtc-fingerprint.js e gtc-indexeddb.js reais (fake-indexeddb)", mocks: "IndexedDB fake", assertion: "Hashes, matching perceptual, persistência", grade: "REAL E ÚTIL", why: "Compara valores de hash e resultados de query — regressões numéricas quebrariam." },
  { test: "smoke-01, smoke-02", code: "NENHUM (reimplementações locais)", mocks: "chrome fake local", assertion: "Sobre o código do próprio smoke", grade: "ENGANOSO", why: "smoke-01 afirma owns=true sem jobId; produção retorna false." },
  { test: "smoke-03..06", code: "storage-manager.js / gtc-* reais", mocks: "fake-indexeddb; smoke-06 duplica o switch SM_ do background", assertion: "Dados persistidos e lidos", grade: "PARCIALMENTE ÚTIL", why: "Exercitam storage real, mas o roteamento SM_ testado é uma cópia do handler." },
  { test: "unit/manifest/surface-reduction.test.js", code: "manifest.json", mocks: "—", assertion: "Permissões/ausência de WAR", grade: "PARCIALMENTE ÚTIL", why: "Não protege contra o match http://127.0.0.1/* nem contra permissões extras." },
  { test: "e2e/*.spec.js (Playwright, 21 testes)", code: "Extensão real via --load-extension + mock Gemini em 127.0.0.1:3999", mocks: "Servidor Gemini fake", assertion: "Imagens substituídas, FIFO, leitor offline", grade: "REAL (E2E verdadeiro) — NÃO EXECUTADO aqui", why: "launchPersistentContext, serviceworker real, popup real." },
];

export const coverageGaps = [
  { file: "extension/inject.js", fn: "todo o arquivo (472 linhas)", state: "0%", risk: "Ponte MAIN world ↔ content script; prompt/submit/fetch autenticado sem nenhum teste executável." },
  { file: "extension/background/log.js", fn: "todo o arquivo", state: "0% (código morto)", risk: "Router loga em no-op em produção." },
  { file: "extension/storage-manager.js", fn: "54-149, 177-260, 288-408, 457-489", state: "42% stmts / 31% funcs no Jest", risk: "Persistência de páginas traduzidas; migração legada, exclusão de capítulo, stats — só smoke cobre parte." },
  { file: "extension/background.js", fn: "659-700 onStartup; 711-728 onReplaced; 746-790 alarme watchdog legado; 870-903 handleMarkerAndShow", state: "não atribuído/0", risk: "Recuperação após reinício do SW e timeout de job." },
  { file: "extension/content_manga.js", fn: "323-676 generateImageFingerprint + lookup GTC; 1682-1811 auto-restore", state: "0", risk: "Pipeline de cache visual do content script nunca executado em unit." },
  { file: "extension/cm-gtc-client.js", fn: "67-93 (fallback SW), 127-153", state: "42% branches", risk: "Fallback quando o SW não responde." },
  { file: "extension/reader.js", fn: "70-98 (teclado/zoom), 210-250 (preload/observer)", state: "37.5% funcs", risk: "Leitor offline: IntersectionObserver e carregamento sob demanda." },
  { file: "extension/background/state.js", fn: "159-216", state: "0 (morto)", risk: "Confusão de manutenção; duas implementações de reconcile." },
  { file: "extension/gemini/editor.js", fn: "branches", state: "47.6% branches", risk: "Fallbacks de submit no Gemini." },
  { file: "router.js identifySource", fn: "hosts lookalike", state: "sem teste negativo", risk: "Autorização de ações 'gemini'." },
];

export const matrix = [
  { code: "background/router.js", happy: "✅", error: "⚠️", edge: "❌", integ: "✅", e2e: "✅" },
  { code: "background/jobs-lifecycle.js", happy: "✅", error: "✅", edge: "⚠️", integ: "✅", e2e: "✅" },
  { code: "background.js (onStartup/alarms legado/downloads)", happy: "⚠️", error: "❌", edge: "❌", integ: "⚠️", e2e: "?" },
  { code: "actions/fetch-image-base64.js", happy: "✅", error: "✅", edge: "✅", integ: "✅", e2e: "?" },
  { code: "actions/download-*.js / open-*.js", happy: "✅", error: "❌", edge: "❌", integ: "⚠️", e2e: "?" },
  { code: "content_manga.js (listener, botão, substituição)", happy: "✅", error: "⚠️", edge: "⚠️", integ: "✅", e2e: "✅" },
  { code: "content_manga.js (fingerprint/GTC lookup)", happy: "❌", error: "❌", edge: "❌", integ: "❌", e2e: "⚠️" },
  { code: "cm-chapter.js canonicalTitle", happy: "❌ (cópia)", error: "❌", edge: "❌", integ: "⚠️", e2e: "?" },
  { code: "inject.js", happy: "❌", error: "❌", edge: "❌", integ: "❌", e2e: "⚠️" },
  { code: "popup.js (grid, banidos, capítulos)", happy: "✅", error: "⚠️", edge: "❌ (HTML hostil)", integ: "✅", e2e: "✅" },
  { code: "storage-manager.js", happy: "⚠️", error: "❌", edge: "❌", integ: "⚠️ (smoke)", e2e: "✅" },
  { code: "gtc-fingerprint.js / gtc-indexeddb.js", happy: "✅", error: "✅", edge: "✅", integ: "✅", e2e: "✅" },
  { code: "reader.js", happy: "⚠️", error: "❌", edge: "❌", integ: "⚠️", e2e: "✅" },
];

export const recommended = [
  { prio: "CRÍTICA", code: "popup.js:657/930", scenario: "src com aspas/markup (data: SVG) não deve gerar nós extras no popup", type: "integração (jsdom)", why: "HTML injection no popup" },
  { prio: "CRÍTICA", code: "router.js identifySource", scenario: "hosts lookalike → 'content', não 'gemini'", type: "unitário", why: "Autorização de deliver/claim" },
  { prio: "CRÍTICA", code: "background.js importScripts", scenario: "SOURCE_DENIED gera entrada em translatorLog", type: "integração", why: "Log de segurança silencioso" },
  { prio: "ALTA", code: "cm-chapter.js canonicalTitle", scenario: "substituir cópia por produção; casos reais", type: "unitário", why: "Agrupamento de capítulos" },
  { prio: "ALTA", code: "inject.js", scenario: "SET_PROMPT preenche editor; FETCH_IMAGE devolve dataUrl/erro; guard de sessionStorage", type: "unitário jsdom", why: "0% coverage" },
  { prio: "ALTA", code: "storage-manager.js", scenario: "migração legada, deleteChapter, quota/erro IDB", type: "unitário (fake-indexeddb) no Jest", why: "Perda de dados" },
  { prio: "ALTA", code: "background.js onStartup/alarme legado", scenario: "watchdog_<tabId> legado finaliza job e fecha abas órfãs", type: "integração", why: "Recuperação" },
  { prio: "MÉDIA", code: "download-image/open-existing-folder/download-chapter", scenario: "payload sem filename/folderPath/images → erro estruturado", type: "unitário", why: "Robustez" },
  { prio: "MÉDIA", code: "content_manga.js generateImageFingerprint", scenario: "canvas tainted → fallback SW; SW falha → sha url-based", type: "unitário jsdom", why: "Cache visual" },
  { prio: "MÉDIA", code: "manifest.json", scenario: "release não contém 127.0.0.1", type: "unitário", why: "Superfície" },
  { prio: "BAIXA", code: "_flushLog", scenario: "storage.set falha → lote não é perdido", type: "unitário", why: "Observabilidade" },
  { prio: "BAIXA", code: "reader.js", scenario: "capítulo inexistente, SM_GET_PAGE falha", type: "integração", why: "UX" },
];

export const ciFindings = [
  "Positivo: sem `continue-on-error` em jobs funcionais, sem `|| true`; verify-ci-contract.js valida o próprio workflow; baseline exige ≥848 testes, 0 skipped/todo; gate E2E rejeita retries/flaky; matriz Node 20/22.",
  "Falsa segurança #1: smoke.minFiles=6 protege a QUANTIDADE de arquivos, mas smoke-01/02 não tocam produção — o gate 'Smoke Tests' fica verde sem testar nada da extensão.",
  "Falsa segurança #2: coverage global 79.5% inclui 36+ testes sobre cópias (extracted-functions) e 0% em inject.js/log.js; os thresholds críticos de background.js (55%) foram calibrados sobre cobertura subatribuída (new Function).",
  "Falsa segurança #3: o job 'syntax-check' é o único 'lint' — não há ESLint nem typecheck; erros como uso de variável indefinida (ex.: self.processNextJob em state.js) não são detectados.",
  "Diferença CI × local: `npm test` na raiz roda smoke+jest(--runInBand --forceExit)+visual, mas NÃO E2E (só com --e2e). No CI, E2E roda em 5 shards com xvfb e MANGA_E2E_BROWSER_MODE=stealth.",
  "`--forceExit` local em run-all-tests.js pode mascarar handles abertos (timers/IDB) que só apareceriam no CI (test:ci não usa forceExit).",
  "recover-cancelled-ci.yml usa workflow_run com actions:write; possui guarda de repositório de origem (ok), mas re-executa runs cancelados automaticamente — um run cancelado por push rápido pode ser re-executado em código já obsoleto.",
];

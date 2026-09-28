export type Severity = 'CRÍTICA' | 'ALTA' | 'MÉDIA' | 'BAIXA' | 'INFO';
export type Kind = 'bug confirmado' | 'risco provável' | 'melhoria' | 'hipótese';

export interface Finding {
  id: string;
  severity: Severity;
  kind: Kind;
  file: string;
  lines: string;
  title: string;
  description: string;
  scenario: string;
  impact: string;
  evidence: string;
  fix: string;
}

export const findings: Finding[] = [
  {
    id: 'SEC-01',
    severity: 'ALTA',
    kind: 'bug confirmado',
    file: 'extension/popup.js',
    lines: '657-661, 930',
    title: 'HTML injection no popup via `img.src` não escapado',
    description:
      '`card.innerHTML = `<img src="${img.src}" ...>`` interpola a URL da imagem sem `escapeHTML`, ao contrário de outros trechos do mesmo arquivo (1152, 1918) que escapam. O valor vem de `cm-dom-replace.js:85` (`src: img.src`), lido do DOM de páginas arbitrárias (`<all_urls>`).',
    scenario:
      'Página maliciosa contém `<img src=\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"/>" onerror="x\'>`. Para esquemas opacos (`data:`), o parser WHATWG NÃO percent-encoda `"` (provado em Node: `new URL(...).href.includes(\'"\') === true`). O `img.src` chega ao popup contendo aspas literais e quebra o atributo.',
    impact:
      'Injeção de markup arbitrário no popup da extensão. Execução de script inline é bloqueada pela CSP padrão do MV3, mas é possível inserir UI falsa, links de phishing e `<img>` para hosts externos. Também contamina `card.dataset.src` usado no fluxo de banimento.',
    evidence:
      'popup.js:657-661 sem escape; shared-ui.js:8-16 define escapeHTML disponível; cm-dom-replace.js:85 usa `img.src`; PoC Node confirma preservação de aspas em data: URL. A parte de dimensões via SVG data: URL não foi reproduzida em browser (hipótese plausível).',
    fix:
      'Construir o card com `document.createElement("img")` + `img.src = value` (atribuição de propriedade, sem parsing HTML), ou aplicar `escapeHTML(img.src)`. Adicionalmente, filtrar `data:`/`blob:` em `getScanEligibleImages` (como já é feito em content_manga.js:411).',
  },
  {
    id: 'SEC-02',
    severity: 'ALTA',
    kind: 'risco provável',
    file: 'extension/manifest.json',
    lines: '43-73',
    title: 'Fixture de teste `http://127.0.0.1/*` embarcada no manifest de produção',
    description:
      'Os content scripts do Gemini (incluindo `inject.js` em `world: MAIN`, `run_at: document_start`) são injetados em qualquer página servida em `http://127.0.0.1` (qualquer porta, já que o match pattern omite a porta). Isso existe apenas para o mock server dos E2E (`tests/e2e/fixtures/gemini-mock-server.js`).',
    scenario:
      'Usuário desenvolvedor abre qualquer servidor local (Vite, Jupyter, painel do roteador em 127.0.0.1). A extensão injeta `inject.js` que sobrescreve `document.visibilityState`, `document.hidden`, `requestAnimationFrame`, suprime `visibilitychange/blur/pagehide` e registra listeners `MANGA_TRANSLATOR_*` no MAIN world.',
    impact:
      'Quebra de comportamento de aplicações locais (timers, visibilidade), superfície de ataque no MAIN world exposta a qualquer código local, e `identifySource` (`router.js:50-51`) classifica essas abas como origem "gemini" (confiável), habilitando ações `deliver-result`, `commit-result`, `claim-gemini-job`.',
    evidence:
      'manifest.json:45-46 e 55-56; router.js:47-58; inject-anti-hibernation.test.js:28 chega a afirmar `expect(source).not.toContain("hostname.includes(\'127.0.0.1\')")` mostrando consciência do problema no inject, mas o manifest continua injetando.',
    fix:
      'Remover `http://127.0.0.1/*` do manifest de produção e gerar um manifest de teste (`tests/e2e/fixtures/manifest.e2e.json`) copiado para um diretório temporário pelo `run-e2e.js`. Alternativa: usar `--host-resolver-rules` no Playwright para mapear `gemini.google.com` ao mock server via HTTPS local.',
  },
  {
    id: 'SEC-03',
    severity: 'MÉDIA',
    kind: 'risco provável',
    file: 'extension/background/router.js',
    lines: '47-58',
    title: '`identifySource` usa substring (`includes`) para classificar origem confiável',
    description:
      '`sender.tab.url.includes("gemini.google.com") || sender.tab.url.includes("127.0.0.1")` classifica como "gemini". Uma aba em `https://evil.example/?ref=gemini.google.com` ou `https://gemini.google.com.evil.example/` também é "gemini".',
    scenario:
      'Como `content_manga.js` roda em `<all_urls>`, ele envia mensagens a partir de qualquer URL. Uma página cuja URL contenha a substring obtém privilégio de origem "gemini" para as ações que restringem `allowedSources: ["gemini"]`.',
    impact:
      'A exploração prática exige que o content script da extensão (código confiável) envie mensagens privilegiadas — logo o impacto direto é limitado. Porém `fetch-image-base64.js:63` precisou de uma segunda verificação estrita (`/^https:\\/\\/gemini\\.google\\.com\\//`) justamente por isso, e as outras ações "gemini" não têm essa defesa.',
    evidence: 'router.js:49-54; fetch-image-base64.js:62-65 (defesa duplicada com regex estrita).',
    fix:
      'Usar `new URL(sender.tab.url)` e comparar `origin === "https://gemini.google.com"` (mais `sender.id === chrome.runtime.id`). Centralizar no router para eliminar a re-verificação por ação.',
  },
  {
    id: 'SEC-04',
    severity: 'MÉDIA',
    kind: 'melhoria',
    file: 'extension/background.js',
    lines: '170-219, 223-232',
    title: 'Famílias `SM_*` e `GTC_*` contornam o modelo `allowedSources` do router',
    description:
      'O router valida origem/payload para ações registradas, mas `handleStorageManagerMessage` e `handleGtcRuntimeMessage` são despachados diretamente sem nenhuma verificação de `sender`. Inclui operações destrutivas: `GTC_CLEAR_ALL` (gtc-indexeddb.js:1130), `GTC_DELETE_BY_CLEAN_URL` (1118), `SM_DELETE_CLEAN_URL` (background.js:208).',
    scenario:
      'Qualquer contexto capaz de enviar `chrome.runtime.sendMessage` (content script em qualquer site) pode limpar todo o cache de traduções. Não há `externally_connectable`, então páginas web não alcançam diretamente — mas a arquitetura declarada (allowedSources) é inconsistente.',
    impact: 'Perda de dados do cache perceptual/IndexedDB por bug em qualquer content script; inconsistência de trust boundary.',
    evidence: 'background.js:171 (apenas `indexOf("SM_") !== 0`), gtc-indexeddb.js:992-1140 sem referência a `sender`.',
    fix:
      'Migrar `SM_*`/`GTC_*` para `registerAction` com `meta.allowedSources` e `validate`, ou aplicar `identifySource` antes de delegar (ex.: `GTC_CLEAR_ALL` só de "popup").',
  },
  {
    id: 'TST-01',
    severity: 'CRÍTICA',
    kind: 'bug confirmado',
    file: 'tests/helpers/extracted-functions.js',
    lines: '18-38 vs extension/cm-chapter.js:5-14',
    title: '`canonicalTitle` de teste diverge da produção — 4 arquivos testam comportamento que não existe',
    description:
      'O helper re-implementa `canonicalTitle` com duas regex extras (prefixo textual `(?:[A-Za-z]+\\.?\\s+)?` e remoção de sufixo `\\s+[-|–—]\\s+.+$`) ausentes na produção. O cabeçalho promete "a suíte detectará divergências" — nada compara as duas versões.',
    scenario:
      'Execução real (Node): "Cap 5: One Piece" → TESTE "one piece" / PROD "cap 5: one piece"; "One Piece Cap 1050 | Ler Mangá" → TESTE "one piece cap 1050" / PROD "one piece cap 1050 ler mangá"; "Ch. 12 Naruto - MangaSite" → TESTE "naruto" / PROD "ch. 12 naruto - mangasite".',
    impact:
      'Testes `canonical-title.test.js`, `canonical-title-full.test.js:64-66` ("remove Cap 5:") passam verdes enquanto a produção NÃO remove o prefixo. Dedup de capítulos por título (cm-chapter.js:95) se comporta diferente do que os testes documentam. Qualquer regressão real em `cm-chapter.js` é invisível.',
    evidence:
      'Divergência provada por execução; arquivos afetados: unit/content-manga/canonical-title.test.js, canonical-title-full.test.js, audio-synthesis*.test.js, integration/chapter-dedup.test.js:32 (cópia inline própria), unit/content-manga/chapter-id-rejection.test.js:37.',
    fix:
      'Apagar `extracted-functions.js`. Carregar `cm-chapter.js` real via `require` (ele expõe `rootScope.MangaTranslatorChapter.canonicalTitle`, linha 148-149) e reescrever as asserções conforme o comportamento real — ou corrigir a produção se o comportamento desejado é o do teste (decisão de produto).',
  },
  {
    id: 'TST-02',
    severity: 'CRÍTICA',
    kind: 'bug confirmado',
    file: 'extension/inject.js',
    lines: '1-472 (0% cobertura)',
    title: '`inject.js` (MAIN world) tem 0% de cobertura apesar de 3 arquivos de teste "inject/"',
    description:
      'Coverage V8 medido: 0/471 linhas. `visibility-spoof.test.js` e `raf-replacement.test.js` testam stubs definidos dentro do próprio teste ("STUB ORIGINAL (v3.0)"). `inject-anti-hibernation.test.js:17` declara "sem carregar o inject.js" e faz 16 asserções de `expect(source).toContain(...)` sobre o texto do arquivo.',
    scenario:
      'Mutação: inverter `if (!isTranslatorTab)` para `if (isTranslatorTab)` em inject.js. A string continua presente → `toContain` passa. Remover o listener `MANGA_TRANSLATOR_FETCH_IMAGE` → nenhum teste falha.',
    impact:
      'O script mais sensível (roda no contexto da página, sobrescreve APIs nativas, faz `fetch` com `credentials: include`) não tem nenhuma verificação comportamental.',
    evidence: 'coverage-summary.json: inject.js statements 0%; inject-anti-hibernation.test.js:26-28, 210-228.',
    fix:
      'Carregar inject.js em jsdom com `window.location` em `gemini.google.com`, disparar `CustomEvent("MANGA_TRANSLATOR_FETCH_IMAGE")` com `fetch` stubado e afirmar o evento de resultado; verificar `document.visibilityState === "visible"` após load; verificar que em host não-translator não patcha.',
  },
  {
    id: 'TST-03',
    severity: 'ALTA',
    kind: 'bug confirmado',
    file: 'tests/unit/** (13 arquivos)',
    lines: '—',
    title: '13 arquivos de teste não importam nenhum código de produção',
    description:
      'Lista: background/{chrome-runtime-mock-lifecycle, export-guard, startup-recovery, tab-replacement-observability, version-sync}.test.js; content-manga/{close-interval, get-clean-url, get-page-images-filter, image-filtering, image-fingerprint}.test.js; inject/{raf-replacement, visibility-spoof}.test.js; popup/version-ui.test.js. Dois deles testam o próprio mock do Chrome.',
    scenario:
      '`export-guard.test.js:42-68` define `createExportAllHandler` localmente e o testa; a action real `background/actions/export-all.js` não é tocada por esse arquivo. `image-filtering.test.js:24-29` testa `filterBySize` local com limiares fixos 300×400, enquanto a produção (`cm-dom-replace.js:75-78`) aceita limiares configuráveis.',
    impact: 'Inflam o contador `minTests: 848` do baseline sem capacidade de detectar regressão. ~70 testes de "falsa cobertura".',
    evidence: 'grep de `extension/` e helpers de carga: nenhum match nesses arquivos. Nota: `version-sync`/`version-ui` verificam consistência de versão via fs e são legítimos como testes de contrato.',
    fix: 'Remover ou converter para testes que carreguem o módulo real (ver seção G).',
  },
  {
    id: 'COV-01',
    severity: 'ALTA',
    kind: 'bug confirmado',
    file: 'tests/helpers/load-background-module.js',
    lines: '92-113',
    title: 'Loader via `new Function` provavelmente subnotifica a cobertura de background.js',
    description:
      'O helper concatena o fonte de background.js e o executa com `new Function(...)`. O V8 coverage atribui esse código a um script anônimo, não a `extension/background.js`. `download-wait.test.js:39` chama `bg.waitForDownload(42, …)` real, porém o lcov do run completo mostra `background.js:798-817` (waitForDownload) com 0 hits.',
    scenario: 'Toda suíte que usa `loadBackgroundModule` (download-wait, process-finalize-real, marker-anchor-real, helpers-real…) exercita código real mas não conta para o gate de coverage.',
    impact:
      'O baseline `criticalMinimum` de background.js (55%) protege um número artificialmente baixo; as métricas globais não refletem o teste real. Não é uma "falsa cobertura", é o oposto — mas impede que o gate detecte perda de testes nesses módulos.',
    evidence: 'lcov.info (run completo): DA:798-817 = 0 em background.js; download-wait.test.js:4,12,39 executa a função real.',
    fix:
      'Substituir `new Function` por `vm.Script(source, { filename: backgroundPath })` + `runInThisContext`, o que preserva o nome do arquivo para o V8 coverage. Mecanismo PROVADO com NODE_V8_COVERAGE em experimento sintético: código via `new Function` aparece como script anônimo (url ""), código via `vm.Script{filename}` é atribuído ao arquivo. Somado ao lcov do run completo (waitForDownload executado por download-wait.test.js:39 mas com 0 hits), o achado é confirmado.',
  },
  {
    id: 'COV-02',
    severity: 'MÉDIA',
    kind: 'bug confirmado',
    file: 'extension/background.js',
    lines: '170-219, 659-790, 798-903, 982-1069',
    title: 'Regiões críticas de background.js sem cobertura (58,67% medido)',
    description:
      '`handleStorageManagerMessage` (170-219), `isContextMenuPageEnabled` e fluxo de menu de contexto (659-790), `waitForDownload`/`downloadImagesAndShow`/`handleMarkerAndShow` (798-903), `startBatch` legado (982-1069), `stopBatch` (1092-1103, 1183-1193).',
    scenario: 'Regressão no fluxo de download de capítulo ou no menu de contexto passa sem falha no Jest; só E2E poderia pegar (e E2E não cobre downloads).',
    impact: 'Perda silenciosa de funcionalidades secundárias (exportar, abrir pasta).',
    evidence: 'lcov.info + coverage-summary.json gerados neste run.',
    fix: 'Ver testes propostos BG-DL-01..03 e BG-SM-01 na seção G.',
  },
  {
    id: 'COV-03',
    severity: 'MÉDIA',
    kind: 'bug confirmado',
    file: 'extension/storage-manager.js',
    lines: '54-149, 177-236, 270-408',
    title: 'storage-manager.js com 42% no Jest; depende de smoke tests fora do gate de coverage',
    description:
      'Abertura/upgrade do IndexedDB, transações de página/asset e restauração ficam fora do Jest. Os smoke tests (`tests/smoke/smoke-04-storage-manager.js`) exercitam o módulo real com fake-indexeddb, mas rodam via `node`, sem coverage e sem asserções estruturadas do Jest.',
    scenario: 'Mudança no schema (SM_DB_VERSION) quebrando migração não é detectada pelo gate de coverage.',
    impact: 'Perda de páginas traduzidas salvas.',
    evidence: 'coverage-summary.json: 42.24% statements; smoke-04 requer `../../extension/storage-manager.js`.',
    fix: 'Portar smoke-04 para `tests/integration/storage-manager.test.js` com fake-indexeddb (já é dependência).',
  },
  {
    id: 'BUG-01',
    severity: 'BAIXA',
    kind: 'melhoria',
    file: 'extension/background/log.js',
    lines: '1-30',
    title: '`background/log.js` nunca é carregado (0% cobertura) — possível código morto',
    description: 'O arquivo não aparece na lista de `importScripts` de background.js:47-78 nem nos `require` do fallback Node.',
    scenario: '—',
    impact: 'Confusão de manutenção; router.js:61 consulta `scope.MangaTranslatorLog` que pode nunca existir por essa via.',
    evidence: 'grep importScripts/require em background.js não inclui log.js; coverage 0%.',
    fix: 'Remover o arquivo ou incluí-lo no bootstrap e testar.',
  },
  {
    id: 'CI-01',
    severity: 'MÉDIA',
    kind: 'melhoria',
    file: '.github/workflows/ci.yml',
    lines: '28-50',
    title: 'Sem lint e sem typecheck no CI; "syntax-check" é apenas `node --check`',
    description: 'Não há ESLint, TypeScript, nem JSDoc typecheck. O projeto é JS puro sem análise estática.',
    scenario: 'Variável não declarada em branch raro, uso de `chrome.runtime.lastError` sem checagem, etc., só aparecem em runtime.',
    impact: 'Bugs triviais escapam para produção.',
    evidence: 'ci.yml:38-50; ausência de eslint.config.*, tsconfig.json, jsconfig.json no repo.',
    fix: 'Adicionar `eslint` com `eslint-plugin-no-unsanitized` (detectaria SEC-01) e `// @ts-check` + `tsc --noEmit --allowJs --checkJs` gradual.',
  },
  {
    id: 'CI-02',
    severity: 'BAIXA',
    kind: 'melhoria',
    file: 'tests/ci/test-baseline.json',
    lines: '2-7',
    title: 'Baseline conta testes que não tocam produção',
    description: 'O gate `minTests: 848` trata igualmente testes reais e stubs. Remover os ~70 testes-stub identificados faria o gate falhar, criando incentivo perverso para mantê-los.',
    scenario: 'PR que remove `image-filtering.test.js` (stub) falha no CI.',
    impact: 'Dificulta limpeza da suíte.',
    evidence: 'run-jest-ci.js compara `numTotalTests` com o baseline sem ponderação.',
    fix: 'Ao remover stubs, recalcular baseline no mesmo PR; considerar gate por cobertura de arquivo ao invés de contagem bruta.',
  },
];

export interface TestEval {
  file: string;
  type: string;
  prod: string;
  mocks: string;
  verdict: 'REAL E ÚTIL' | 'PARCIALMENTE ÚTIL' | 'FRÁGIL' | 'ENGANOSO' | 'NÃO TESTA PRODUÇÃO' | 'DESABILITADO';
  reason: string;
}

export const testEvals: TestEval[] = [
  { file: 'unit/background/router.test.js', type: 'unitário', prod: 'background/router.js (require real)', mocks: 'chrome mock stateful, log jest.fn', verdict: 'REAL E ÚTIL', reason: 'Despacha pelo `onMessage` real; cobre SOURCE_DENIED, validate, async keepAlive. Mutação em `allowedSources.includes` faria falhar.' },
  { file: 'unit/background/fetch-image-base64-action.test.js', type: 'unitário', prod: 'router.js + actions/fetch-image-base64.js', mocks: 'global.fetch, FileReader', verdict: 'REAL E ÚTIL', reason: 'Testa validate (protocolo/host), gating por sender URL, content-type, HTTP !ok e timeout 30s com fake timers. Cobre 97,8%.' },
  { file: 'unit/background/claim-gemini-job-action.test.js', type: 'unitário', prod: 'actions/claim-gemini-job.js', mocks: 'storage via mock stateful, tabIdentity', verdict: 'REAL E ÚTIL', reason: 'Ownership por sender.tab.id, jobId divergente, alias migration. Branches 64% — faltam caminhos sem tabIdentity.' },
  { file: 'unit/background/batch-lifecycle-real.test.js', type: 'integração', prod: 'background.js via loadBackgroundModule', mocks: 'chrome.* stateful', verdict: 'REAL E ÚTIL', reason: 'Exercita processNextJob/finalizeJob reais; porém a cobertura não é atribuída a background.js (COV-01).' },
  { file: 'unit/background/download-wait.test.js', type: 'unitário', prod: 'background.js waitForDownload real', mocks: 'downloads mock', verdict: 'REAL E ÚTIL', reason: 'Chama função real; complete/interrupted/ID diferente. Coverage não atribuída (COV-01).' },
  { file: 'unit/background/export-guard.test.js', type: 'mock-heavy', prod: 'NENHUM', mocks: 'handler definido no teste', verdict: 'NÃO TESTA PRODUÇÃO', reason: '`createExportAllHandler` (linhas 42-68) é uma cópia local; `actions/export-all.js` não é importado.' },
  { file: 'unit/background/startup-recovery.test.js', type: 'mock-heavy', prod: 'NENHUM', mocks: 'handler local', verdict: 'NÃO TESTA PRODUÇÃO', reason: '`createStopBatchHandler` definido no teste (linha 35).' },
  { file: 'unit/background/chrome-runtime-mock-lifecycle.test.js', type: 'outro', prod: 'NENHUM (testa o mock)', mocks: '—', verdict: 'NÃO TESTA PRODUÇÃO', reason: 'Teste de infraestrutura do mock. Legítimo como self-test, mas não é cobertura de produto.' },
  { file: 'unit/background/tab-replacement-observability.test.js', type: 'outro', prod: 'NENHUM (testa o mock)', mocks: '—', verdict: 'NÃO TESTA PRODUÇÃO', reason: 'Verifica `_simulateReplacement` do ChromeTabsMock.' },
  { file: 'unit/background/version-sync.test.js / unit/popup/version-ui.test.js', type: 'contrato', prod: 'package.json, manifest.json, popup.html (fs)', mocks: '—', verdict: 'PARCIALMENTE ÚTIL', reason: 'Verificam consistência de versão. Útil, mas não é teste comportamental.' },
  { file: 'unit/content-manga/canonical-title*.test.js', type: 'unitário', prod: 'NENHUM (extracted-functions.js)', mocks: '—', verdict: 'ENGANOSO', reason: 'Afirmam remoção de "Cap 5:" que a produção não faz (TST-01). Passam verdes com comportamento inexistente.' },
  { file: 'unit/content-manga/audio-synthesis*.test.js', type: 'unitário', prod: 'NENHUM (extracted-functions.js)', mocks: 'AudioContext factory', verdict: 'NÃO TESTA PRODUÇÃO', reason: 'Testa `playErrorSound` do helper; a real está em content_manga.js:1140 dentro da closure.' },
  { file: 'integration/chapter-dedup.test.js', type: 'integração', prod: 'NENHUM (reimplementa getOrCreateChapterId)', mocks: 'storage mock', verdict: 'ENGANOSO', reason: 'Linhas 32-81 re-implementam canonicalTitle + lógica de dedup; cm-chapter.js real não é carregado. Nome sugere integração.' },
  { file: 'unit/content-manga/image-filtering.test.js', type: 'stub', prod: 'NENHUM', mocks: '—', verdict: 'NÃO TESTA PRODUÇÃO', reason: '`filterBySize` local (linhas 24-29), documentado como "STUB ORIGINAL (v3.0)".' },
  { file: 'unit/content-manga/get-page-images-filter.test.js', type: 'stub', prod: 'NENHUM', mocks: '—', verdict: 'NÃO TESTA PRODUÇÃO', reason: 'Nenhum require de produção; lógica de filtro duplicada.' },
  { file: 'unit/content-manga/get-clean-url.test.js / image-fingerprint.test.js / auto-restore-system.test.js', type: 'unitário', prod: 'getCleanUrl copiado inline', mocks: '—', verdict: 'ENGANOSO', reason: 'Definem `function getCleanUrl` próprio (linhas 21/33/29). `cm-dom-replace.js` exporta a real e não é usada nesses arquivos.' },
  { file: 'unit/content-manga/close-interval.test.js', type: 'stub', prod: 'NENHUM', mocks: 'fake timers', verdict: 'NÃO TESTA PRODUÇÃO', reason: 'Simula um countdown genérico; não carrega content_manga.js.' },
  { file: 'unit/content-manga/*-real.test.js (extract-flow, drawer, button-ui, replacement-and-completion, extraction-and-handlers)', type: 'integração jsdom', prod: 'content_manga.js + cm-*.js via loadContentScript', mocks: 'chrome.* stateful, jsdom', verdict: 'REAL E ÚTIL', reason: 'Loader carrega módulos reais na ordem do manifest; mensagens passam pelo listener real. Responsáveis pelos 75% de content_manga.js.' },
  { file: 'unit/inject/visibility-spoof.test.js / raf-replacement.test.js', type: 'stub', prod: 'NENHUM', mocks: '—', verdict: 'NÃO TESTA PRODUÇÃO', reason: 'Testam `Object.defineProperty` do jsdom e um scheduler local. inject.js = 0% cobertura.' },
  { file: 'unit/inject/inject-anti-hibernation.test.js', type: 'source-grep', prod: 'inject.js como TEXTO', mocks: '—', verdict: 'FRÁGIL', reason: '16 asserções `expect(source).toContain(...)`. Detecta remoção de string, não de comportamento; quebra em refatoração cosmética.' },
  { file: 'unit/content-gemini/*.test.js (17 arquivos)', type: 'unitário/integração jsdom', prod: 'gemini/*.js + content_gemini.js reais', mocks: 'DOM do Gemini simulado, chrome mock', verdict: 'REAL E ÚTIL', reason: 'job-runner 89,9%, observer 94%, result-extractor 94%. Simulam DOM realista do Gemini; timeouts reais com fake timers.' },
  { file: 'unit/gtc/fingerprint.test.js / indexeddb.test.js', type: 'unitário', prod: 'gtc-fingerprint.js, gtc-indexeddb.js', mocks: 'fake-indexeddb', verdict: 'REAL E ÚTIL', reason: 'Hashes calculados de verdade sobre pixels sintéticos; 97,5% fingerprint.' },
  { file: 'unit/manifest/surface-reduction.test.js', type: 'contrato', prod: 'manifest.json', mocks: '—', verdict: 'PARCIALMENTE ÚTIL', reason: 'Trava permissões, mas NÃO falha para `http://127.0.0.1/*` (SEC-02).' },
  { file: 'integration/popup*.ui.test.js / options.ui.test.js / reader.ui.test.js', type: 'integração jsdom', prod: 'popup.js/options.js/reader.js via loadExtensionPage', mocks: 'chrome mock, tabs', verdict: 'REAL E ÚTIL', reason: 'Carregam HTML+JS reais; popup.js 82%. Não cobrem o card de imagem com src malicioso (SEC-01).' },
  { file: 'e2e/*.spec.js (16 test() / 21 casos com parametrização)', type: 'E2E real', prod: 'extensão completa carregada no Chromium', mocks: 'Gemini mock server em 127.0.0.1', verdict: 'REAL E ÚTIL', reason: '`--load-extension`, aguarda service worker, interage com popup/content/background. Depende do SEC-02 para funcionar.' },
  { file: 'smoke/smoke-0*.js', type: 'smoke', prod: 'storage-manager.js, gtc-*.js reais', mocks: 'fake-indexeddb', verdict: 'PARCIALMENTE ÚTIL', reason: 'Código real, mas fora do Jest/coverage; asserções via assert nativo.' },
];

export interface CoverageRow {
  file: string;
  stmts: number;
  branches: number;
  funcs: number;
  lines: number;
  uncovered: number;
  note: string;
}

export const coverageRows: CoverageRow[] = [
  { file: 'inject.js', stmts: 0, branches: 100, funcs: 0, lines: 0, uncovered: 471, note: 'Nenhum teste carrega o arquivo (TST-02)' },
  { file: 'background/log.js', stmts: 0, branches: 100, funcs: 0, lines: 0, uncovered: 30, note: 'Não importado pelo bootstrap (BUG-01)' },
  { file: 'storage-manager.js', stmts: 42.24, branches: 45.45, funcs: 31.03, lines: 42.24, uncovered: 298, note: 'Só smoke fora do Jest (COV-03)' },
  { file: 'background.js', stmts: 58.67, branches: 63.71, funcs: 75.75, lines: 58.67, uncovered: 517, note: 'Subnotificado por new Function (COV-01) + regiões reais descobertas (COV-02)' },
  { file: 'cm-gtc-client.js', stmts: 67.7, branches: 42.69, funcs: 80, lines: 67.7, uncovered: 52, note: 'Branches de fallback de cache' },
  { file: 'background/state.js', stmts: 71.16, branches: 83.87, funcs: 86.66, lines: 71.16, uncovered: 77, note: 'reconcileJobs parcialmente' },
  { file: 'gtc-indexeddb.js', stmts: 71.74, branches: 65.73, funcs: 81.13, lines: 71.74, uncovered: 330, note: 'Handlers GTC_* de erro' },
  { file: 'reader.js', stmts: 72.86, branches: 79.54, funcs: 37.5, lines: 72.86, uncovered: 70, note: 'Funções de navegação não chamadas' },
  { file: 'content_manga.js', stmts: 75.07, branches: 69.36, funcs: 78.75, lines: 75.07, uncovered: 713, note: 'Fingerprint/cache perceptual (323-676), auto-restore (1682-1811), extractAndSendImages (2167-2448)' },
  { file: 'popup.js', stmts: 82.11, branches: 74.49, funcs: 87.5, lines: 82.11, uncovered: 361, note: 'Banidos (932-940), capítulos (1229-1299)' },
  { file: 'gemini/job-runner.js', stmts: 89.87, branches: 65.66, funcs: 84.48, lines: 89.87, uncovered: 149, note: 'Branches de erro do RPA' },
  { file: 'background/jobs-lifecycle.js', stmts: 89, branches: 73.99, funcs: 96.55, lines: 89, uncovered: 82, note: 'abortInvalidatedLaunch' },
  { file: 'background/router.js', stmts: 89.28, branches: 82.75, funcs: 76.92, lines: 89.28, uncovered: 18, note: 'ACTION_NOT_FOUND, sync throw' },
  { file: 'gtc-fingerprint.js', stmts: 97.53, branches: 90.45, funcs: 100, lines: 97.53, uncovered: 19, note: 'OK' },
  { file: 'background/actions/* (23 arquivos)', stmts: 92, branches: 78, funcs: 96, lines: 92, uncovered: 80, note: 'Média; todos ≥76% statements' },
];

export interface MatrixRow {
  module: string;
  happy: string;
  error: string;
  edge: string;
  integration: string;
  e2e: string;
}

export const matrix: MatrixRow[] = [
  { module: 'background/router.js', happy: '✅', error: '✅', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'actions/fetch-image-base64.js', happy: '✅', error: '✅', edge: '✅', integration: '⚠️', e2e: '❌' },
  { module: 'actions/claim-gemini-job.js', happy: '✅', error: '✅', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'background.js (startBatch/stopBatch/downloads/contextMenu)', happy: '⚠️', error: '❌', edge: '❌', integration: '⚠️', e2e: '⚠️' },
  { module: 'background/state.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'background/jobs-lifecycle.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'storage-manager.js', happy: '⚠️ (smoke)', error: '❌', edge: '❌', integration: '❌', e2e: '⚠️' },
  { module: 'gtc-indexeddb.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'gtc-fingerprint.js', happy: '✅', error: '✅', edge: '✅', integration: '✅', e2e: '⚠️' },
  { module: 'content_manga.js (scan/replace/UI)', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'content_manga.js (fingerprint/cache perceptual)', happy: '❌', error: '❌', edge: '❌', integration: '❌', e2e: '⚠️' },
  { module: 'cm-chapter.js canonicalTitle', happy: '❌ (teste diverge)', error: '❌', edge: '❌', integration: '❌', e2e: '⚠️' },
  { module: 'cm-dom-replace.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'gemini/job-runner.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'gemini/result-extractor.js', happy: '✅', error: '✅', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'inject.js', happy: '❌', error: '❌', edge: '❌', integration: '❌', e2e: '⚠️ (implícito)' },
  { module: 'popup.js', happy: '✅', error: '⚠️', edge: '❌ (src malicioso)', integration: '✅', e2e: '✅' },
  { module: 'options.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '❌' },
  { module: 'reader.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '✅' },
  { module: 'shared-ui.js', happy: '✅', error: '⚠️', edge: '⚠️', integration: '✅', e2e: '⚠️' },
];

export interface Gap {
  priority: 'CRÍTICA' | 'ALTA' | 'MÉDIA' | 'BAIXA';
  code: string;
  scenario: string;
  type: string;
  reason: string;
}

export const gaps: Gap[] = [
  { priority: 'CRÍTICA', code: 'popup.js:657 renderImageGrid', scenario: 'img.src contendo `"` (data: URL) não quebra o atributo nem injeta elementos', type: 'integração jsdom', reason: 'SEC-01; regressão = HTML injection' },
  { priority: 'CRÍTICA', code: 'cm-chapter.js:5 canonicalTitle', scenario: 'Testes contra a função REAL exportada em MangaTranslatorChapter', type: 'unitário', reason: 'TST-01; hoje zero testes reais' },
  { priority: 'CRÍTICA', code: 'inject.js listeners MANGA_TRANSLATOR_*', scenario: 'FETCH_IMAGE responde com dataUrl/erro; não patcha em host não-translator; visibilityState spoof', type: 'unitário jsdom', reason: 'TST-02; 0% cobertura em código MAIN world' },
  { priority: 'CRÍTICA', code: 'manifest.json content_scripts', scenario: 'Nenhum match de `127.0.0.1` / `localhost` / `http:` no manifest de produção', type: 'contrato', reason: 'SEC-02' },
  { priority: 'ALTA', code: 'router.js:47 identifySource', scenario: 'URL `https://evil.test/?q=gemini.google.com` deve ser "content", não "gemini"', type: 'unitário', reason: 'SEC-03; teste atual só cobre URLs bem formadas' },
  { priority: 'ALTA', code: 'background.js:170 handleStorageManagerMessage', scenario: 'SM_SAVE_PAGE/SM_GET_PAGE round-trip; SM_DELETE_CLEAN_URL; erro do storage → resposta {ok:false}', type: 'integração', reason: '0 linhas cobertas; caminho de persistência de páginas' },
  { priority: 'ALTA', code: 'background.js:819 downloadImagesAndShow', scenario: 'lista vazia; download interrompido; timeout; ordenação de índices', type: 'unitário', reason: 'Descoberto; export-guard.test.js testa cópia' },
  { priority: 'ALTA', code: 'gtc-indexeddb.js:1130 GTC_CLEAR_ALL', scenario: 'Rejeitar quando sender não é popup (após correção SEC-04)', type: 'unitário', reason: 'Operação destrutiva sem gate' },
  { priority: 'ALTA', code: 'content_manga.js:323-676 cache perceptual', scenario: 'generateImageFingerprint com canvas tainted (SecurityError) → fallback FETCH_IMAGE_AS_BASE64; queryGlobalTranslationCache sem resposta', type: 'integração jsdom', reason: '350 linhas descobertas do fluxo de cache' },
  { priority: 'MÉDIA', code: 'storage-manager.js openDb/upgrade', scenario: 'onupgradeneeded cria 4 stores; versão antiga migra; onblocked', type: 'integração fake-indexeddb', reason: 'COV-03' },
  { priority: 'MÉDIA', code: 'background.js:659 isContextMenuPageEnabled + onClicked', scenario: 'Site habilitado/desabilitado; clique em imagem única envia mensagem correta à aba', type: 'unitário', reason: 'PR #62 recente sem cobertura no legado' },
  { priority: 'MÉDIA', code: 'state.js restoreState/mutate', scenario: 'mt_state corrompido (não-objeto, arrays inválidos) não derruba o worker; mutações concorrentes preservam ordem', type: 'unitário', reason: 'Branches 83% mas caminhos de dado inválido ausentes' },
  { priority: 'MÉDIA', code: 'reader.js navegação', scenario: 'Teclas ←/→/Home/End; capítulo inexistente; imagens 0', type: 'integração jsdom', reason: 'funcs 37,5%' },
  { priority: 'BAIXA', code: 'background/log.js', scenario: 'Decidir remoção ou integração', type: '—', reason: 'BUG-01' },
  { priority: 'BAIXA', code: 'cm-gtc-client.js', scenario: 'Branches de fallback quando runtime não responde', type: 'unitário', reason: 'branches 42%' },
];

export const commands = [
  { cmd: 'git clone --depth 50 https://github.com/Diesper/Manga_Translator', result: 'OK — HEAD 8d470f4 (merge PR #62)', status: 'ok' },
  { cmd: 'cd tests && npm ci', result: 'OK — jest 29, jest-environment-jsdom, fake-indexeddb, @playwright/test', status: 'ok' },
  { cmd: 'node ci/run-jest-ci.js --coverage (= npm run test:coverage)', result: 'Test Suites: 1 failed, 108 passed, 109 total · Tests: 845 passed, 845 total · skipped 0 · todo 0 · Time 172,6s · EXIT=1 (suíte actions-low-risk.test.js morta por SIGKILL — OOM do sandbox; gate minTests 848 não atingido por isso)', status: 'warn' },
  { cmd: 'npx jest unit/background/actions-low-risk.test.js', result: 'Test Suites: 1 passed · Tests: 6 passed (total real da suíte = 851 ≥ 848)', status: 'ok' },
  { cmd: 'Coverage V8 (tests/coverage/coverage-summary.json)', result: 'Statements 79,55% · Branches 71,53% · Functions 83,04% · Lines 79,55% · 56 arquivos instrumentados (acima do baseline mínimo 78/71/80/78)', status: 'ok' },
  { cmd: 'npm run test:e2e (Playwright + Chromium + extensão)', result: 'NÃO EXECUTADO — análise estática apenas (sem Chromium/xvfb no sandbox)', status: 'skip' },
  { cmd: 'npm run test:visual-v3 (224 testes perceptuais)', result: 'NÃO EXECUTADO — análise estática apenas', status: 'skip' },
  { cmd: 'npm run test:smoke', result: 'NÃO EXECUTADO — análise estática apenas (confirmado que requer módulos reais)', status: 'skip' },
  { cmd: 'lint / typecheck', result: 'NÃO EXISTE no projeto', status: 'skip' },
  { cmd: 'PoC: new URL("data:image/png;base64,x\\" onload=\\"1").href', result: 'contém `"` literal → confirma vetor SEC-01', status: 'ok' },
  { cmd: 'PoC: canonicalTitle teste vs produção (cm-chapter.js via vm)', result: '3 de 4 entradas divergem → confirma TST-01', status: 'ok' },
];

export const fileTree = {
  production: [
    'extension/manifest.json (MV3, 8 permissions, <all_urls>)',
    'extension/background.js (1251) + background/{router,state,tab-identity,jobs-*,log}.js + background/actions/*.js (23)',
    'extension/content_manga.js (2862) + cm-{gtc-client,dom-replace,chapter,auto-restore}.js + gtc-fingerprint.js',
    'extension/content_gemini.js (461) + gemini/{selectors,dom,image-quarantine,observer,editor,attachment,temporary-chat,result-extractor,deletion,job-runner}.js',
    'extension/inject.js (472, MAIN world)',
    'extension/popup.{html,js} (2020) · options.{html,js} · reader.{html,js} · shared-ui.js',
    'extension/gtc-indexeddb.js (1168) · storage-manager.js (516)',
  ],
  tests: [
    'tests/unit/** — 96 arquivos .test.js (background 45, content-gemini 17, content-manga 19, gtc 2, inject 3, popup 5, reader 2, shared-ui 1, manifest 1)',
    'tests/integration/** — 13 arquivos',
    'tests/e2e/*.spec.js — 3 specs Playwright (16 test(), 21 casos)',
    'tests/smoke/smoke-0[1-6].js — Node puro + fake-indexeddb',
    'tests/visual-v3/*.visual-v3.js — runner próprio (224 testes perceptuais)',
    'tests/helpers/* (7) · tests/mocks/* (2)',
  ],
  config: ['tests/jest.config.js (8 projects)', 'tests/jest.coverage.config.js (V8, todo extension/**)', 'tests/playwright.config.js', 'tests/ci/test-baseline.json', 'tests/package.json'],
  ci: ['.github/workflows/ci.yml (10 jobs)', '.github/workflows/publish.yml', '.github/workflows/recover-cancelled-ci.yml', 'tests/ci/*.js (14 scripts de gate)'],
  build: ['scripts/sync-version.js', 'run*.bat/.ps1 (Windows helpers)'],
  docs: ['README.md', 'projeto.md', 'status.md', 'docs/*.md (13)'],
  irrelevant: ['tests/e2e/fixtures/manga-images/*.png (fixtures)', 'tests/package-lock.json', 'tests/.jest-cache*'],
};

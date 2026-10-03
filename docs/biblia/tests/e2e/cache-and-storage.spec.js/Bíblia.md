# Bíblia técnica — tests/e2e/cache-and-storage.spec.js

> **Estado documental:** 🟡 CORRIGIDA após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** b181989a9b89151ca17cbcbeb7db9342b98c9add  
> **Agente responsável:** AGENTE 15  
> **Tipo:** suíte E2E Playwright da extensão Chromium MV3  
> **Linhas textuais:** 367  
> **Posições documentais:** 368, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

tests/e2e/cache-and-storage.spec.js é a suíte E2E que valida, em Chromium real com a extensão carregada como Manifest V3, quatro contratos de cache/persistência que atravessam content script, service worker, chrome.storage.local, IndexedDB, mock do Gemini e DOM da página de mangá.

Ela não testa funções isoladas por mocks de módulo. O arquivo cria um browser context persistente, carrega a extensão real pelo diretório extension/, usa o servidor HTTP real de fixtures na porta 3999 e aciona o fluxo do usuário clicando no painel do Manga Translator. A evidência final é observada por efeitos reais no DOM, no chrome.storage.local, nos bancos IndexedDB e no conjunto de abas abertas.

Os quatro cenários cobertos são:

1. duas páginas traduzidas são persistidas no StorageManager, com Data URLs recuperáveis e restore index associado às URLs originais;
2. uma segunda tradução das mesmas imagens em host espelho usa o GTC e não cria novas abas Gemini;
3. reload da mesma página reaplica automaticamente o restoreMap sem reabrir Gemini;
4. debugMode=true preserva as abas Gemini depois da tradução.

## 2. Topologia de execução e dependências

### Dependências Node/Playwright

- @playwright/test: test, expect e chromium;
- os: cria o diretório de perfil persistente sob o diretório temporário do SO;
- path: resolve extension/ e o userDataDir;
- ../helpers/repo-root: sobe a árvore até encontrar extension/manifest.json;
- fs é importado na linha 2, mas não é usado no restante do arquivo auditado.

### Superfícies reais da extensão carregadas

O manifest MV3 injeta no site de mangá:

- shared/gtc-fingerprint.js;
- content/cm-gtc-client.js;
- content/cm-dom-replace.js;
- content/cm-chapter.js;
- content/cm-auto-restore.js;
- content/content_manga.js.

No service worker, background.js importa:

- shared/gtc-indexeddb.js;
- shared/storage-manager.js.

Isso é material para este teste porque resetExtensionState limpa o banco GTC manga_translator_gtc, limpa stores do MangaTranslatorStorageManager e os próprios cenários consultam MangaTranslatorStorageManager diretamente pelo service worker.

### Fixture HTTP

playwright.config.js inicia tests/fixtures/gemini-mock-server.js na porta 3999.

O servidor fornece:

- /manga-page.html;
- /manga-images/page_001.png e page_002.png;
- /gemini e /app/mock-chat;
- /gemini-result-image.

tests/fixtures/manga-page.html contém duas imagens de mangá 800x1200 que devem ser traduzidas e duas imagens extras que não devem entrar no lote: avatar 48x48 e banner 960x120.

### Sharding

O arquivo distribui seus quatro testes em dois tags:

- @e2e-medium-a: testes das linhas 222 e 265;
- @e2e-medium-b: testes das linhas 307 e 340.

scripts/ci/data/e2e-shard-plan.json declara quatro testes em medium-a e quatro em medium-b contando também testes de outros specs. scripts/validation/verify-e2e-shard-plan.js executa Playwright --list/--grep e exige cobertura exata do plano.

## 3. Lifecycle do browser e isolamento

O describe usa mode: serial porque todos os testes daquela execução reutilizam o mesmo chromium.launchPersistentContext criado em beforeAll. O contexto recebe um userDataDir único baseado em Date.now() e carrega somente a extensão auditada.

Na CI, .github/workflows/ci.yml define MANGA_E2E_BROWSER_MODE=stealth. Para esse valor:

- showBrowser=false;
- slowMo=0;
- o argumento --headless=new é inserido;
- a opção Playwright headless continua false, porque o headless efetivo é controlado pelo argumento Chromium para preservar suporte à extensão.

beforeEach recupera o service worker e chama resetExtensionState. O reset faz duas classes de limpeza:

1. chrome.storage.local.clear seguido por um seed determinístico de domínio, prompt, URL do Gemini, flags, logs, chapterList e mt_state;
2. limpeza best-effort de dois bancos IndexedDB: o GTC e o StorageManager.

afterAll fecha o persistent context.

### Limite de isolamento importante

A limpeza IndexedDB não é fail-closed. O código:

- resolve em req.onerror;
- resolve em tx.onerror;
- engole exceções com catch (_e) {}.

Por isso um erro real de limpeza pode deixar cache/restore antigo e ainda permitir que o teste prossiga. Como o contexto é persistente dentro do describe, isso cria risco de contaminação e possível falso positivo. A solicitação 092-001 registra a necessidade de tratamento separado.

## 4. Helpers locais

### getBrowserModeConfig — linhas 7–16

Normaliza MANGA_E2E_BROWSER_MODE. Somente show, visible, headed e ui ativam modo visível e slowMo=350. Todo outro valor, inclusive stealth, cai no modo stealth com slowMo=0.

A CI observada força stealth. Portanto o caminho stealth está executado pelo run real; o caminho visível não possui prova automatizada específica localizada.

### getExtensionPath — linhas 18–20

Usa findRepoRoot(__dirname) e concatena extension. Isso torna o carregamento independente do cwd do processo.

### getBackgroundWorker — linhas 22–26

Prefere um service worker já registrado; caso contrário aguarda evento serviceworker até 15 segundos. O run real prova que o helper obteve um worker utilizável, mas não instrumenta qual branch foi escolhido em cada chamada.

### resetExtensionState — linhas 28–98

Primeiro limpa e resemeia chrome.storage.local. Depois tenta limpar:

- store translations do banco manga_translator_gtc;
- stores chapters, chapterPages, restoreEntries e assets do MangaTranslatorStorageManager, se existirem.

O objetivo é fazer cada teste começar de estado lógico vazio. O tratamento de erro é deliberadamente tolerante no estado atual e não prova que a limpeza ocorreu.

### readStorage — linhas 100–104

Wrapper Promise para chrome.storage.local.get. É usado para ler todo o storage no teste de persistência e translatorLog no teste de GTC.

### removeGeminiTabs — linhas 106–132

Consulta todas as abas e remove somente aquelas cujo URL:

- tem hostname localhost ou 127.0.0.1;
- usa porta 3999;
- aponta para /gemini, /gemini/, /app ou /app/*.

URLs inválidas são ignoradas pelo catch. O helper é usado antes das verificações de cache/restore para estabelecer contagem zero.

### countGeminiTabs — linhas 134–154

Replica o mesmo predicado, mas retorna contagem. Os testes usam esse helper como assertion de que GTC/restore não abriram novas abas, ou de que debugMode preservou abas.

### waitForTranslationOnPage — linhas 156–165

Faz polling por até 45 segundos até encontrar exatamente duas imagens com data-translated=true. Essa quantidade corresponde às duas páginas válidas da fixture e exclui avatar/banner.

### waitForRestoreMap — linhas 167–183

Faz polling por até 15 segundos. Localiza o capítulo no chapterList pela URL e consulta MangaTranslatorStorageManager.getRestoreIndex(chapter.id). A condição de sucesso é exatamente duas entradas.

## 5. Cenário 1 — persistência real de páginas

Linhas 222–263.

Fluxo:

1. abre http://localhost:3999/manga-page.html;
2. espera networkidle e visibilidade de #manga-main-content;
3. clica no painel para iniciar a tradução;
4. espera duas imagens traduzidas no DOM;
5. lê chrome.storage.local e localiza o capítulo pela URL;
6. usa a implementação real MangaTranslatorStorageManager no service worker;
7. recupera page 0, page 1 e restore index;
8. exige Data URL PNG nas duas páginas;
9. exige restore index contendo as duas URLs originais com índices 0 e 1;
10. fecha a página.

### Assertions diretas

- chapter existe;
- smData existe;
- page0 inicia com data:image/png;base64,;
- page1 inicia com data:image/png;base64,;
- restoreIndex contém page_001.png -> index 0;
- restoreIndex contém page_002.png -> index 1.

Essa prova é mais forte que uma inspeção textual: ela atravessa o fluxo real de tradução e consulta os dados persistidos pela extensão.

## 6. Cenário 2 — GTC entre hosts espelho

Linhas 265–305.

Fluxo:

1. traduz a fixture em localhost;
2. remove abas Gemini remanescentes e exige contagem zero;
3. abre a mesma fixture em 127.0.0.1;
4. clica para traduzir novamente;
5. exige duas imagens traduzidas em até 15 segundos;
6. exige que nenhuma nova aba Gemini tenha aparecido;
7. lê translatorLog;
8. exige ação GTC_BATCH_HIT;
9. fecha as duas páginas.

O uso de dois hosts com bytes de imagem equivalentes evita que o teste esteja provando apenas cache por URL literal. O contrato observado é compatível com hit de cache visual compartilhado.

## 7. Cenário 3 — restauração após reload

Linhas 307–338.

Fluxo:

1. traduz a fixture em localhost;
2. espera duas entradas reais no restore index;
3. remove abas Gemini e confirma zero;
4. recarrega a página;
5. sem clicar novamente, espera duas imagens com data-translated=true;
6. confirma novamente zero abas Gemini.

A combinação de espera explícita pelo restore index antes do reload e ausência de novas abas Gemini diferencia restauração local de uma nova rodada de tradução.

## 8. Cenário 4 — debug mode preserva abas

Linhas 340–366.

Antes da tradução, escreve debugMode=true no chrome.storage.local. Depois executa o fluxo normal e faz polling de countGeminiTabs até obter pelo menos 2.

O finally sempre:

- reacquire o service worker;
- remove abas Gemini;
- fecha a página.

A assertion prova o contrato mínimo “abas preservadas em debug”: pelo menos duas superfícies Gemini continuam abertas após processar as duas imagens.

## 9. Evidência automatizada observada

Foi localizado o GitHub Actions run 36577447500, de 2026-09-29, no qual o blob de tests/e2e/cache-and-storage.spec.js é exatamente b181989a9b89151ca17cbcbeb7db9342b98c9add.

### Shard medium-a

Job 109437162358:

- Running 4 tests using 2 workers;
- coletou o teste da linha 222;
- coletou o teste da linha 265;
- terminou 4 passed (40.7s).

### Shard medium-b

Job 109437162771:

- Running 4 tests using 2 workers;
- coletou o teste da linha 307;
- coletou o teste da linha 340;
- terminou 4 passed (41.6s).

### Gate global

Job 109437798789:

- verificou o plano de 5 shards;
- reportou 21 testes com cobertura exata sem omissões ou duplicatas;
- o relatório mesclado enumerou os quatro testes deste arquivo;
- terminou 21 passed (53.6s);
- Gate E2E aprovado: 21 teste(s), skipped=0, flaky=0, failed=0.

Portanto existe execução real e bem-sucedida do mesmo blob auditado, sem retry/flaky/skipped no gate global observado.

## 10. Matriz de força da evidência

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| arquivo é coletado pelos shards medium-a e medium-b | logs dos jobs 109437162358 e 109437162771 | ✅ PROVADO DIRETAMENTE |
| quatro testes deste arquivo foram executados e passaram | logs dos dois shards + merge global | ✅ PROVADO DIRETAMENTE |
| nenhuma execução final E2E ficou skipped/flaky/failed no run observado | gate global do job 109437798789 | ✅ PROVADO DIRETAMENTE |
| plano cobre exatamente 21 testes sem omissão/duplicata | verify-e2e-shard-plan no job global | 🟦 GATE ESTÁTICO ESPECÍFICO + execução real |
| CI executa shards com MANGA_E2E_BROWSER_MODE=stealth | ci.yml linhas 196–221 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| modo stealth deste helper funciona no ambiente observado | beforeAll do blob + shards verdes | 🟨 EXECUTADO INDIRETAMENTE |
| modo show/visible/headed/ui e slowMo=350 | nenhuma execução automatizada localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| persistência de 2 Data URLs e restore index 0/1 | assertions linhas 239 e 254–260 em teste que passou | ✅ PROVADO DIRETAMENTE |
| host espelho usa GTC sem nova aba Gemini | assertions linhas 277, 293, 296 e 301 em teste que passou | ✅ PROVADO DIRETAMENTE |
| reload reaplica restoreMap sem nova aba Gemini | assertions linhas 318, 320, 332 e 335 em teste que passou | ✅ PROVADO DIRETAMENTE |
| debugMode preserva abas Gemini | assertion linhas 357–360 em teste que passou | ✅ PROVADO DIRETAMENTE |
| cleanup de IndexedDB sempre zera os bancos | não há assertion pós-cleanup; erros são engolidos | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branch de URL inválida em remove/count Gemini | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branch de espera por serviceworker vs worker existente | execução existe, mas branch não é instrumentado | 🟨 EXECUTADO INDIRETAMENTE |
| diretório temporário do persistent profile é removido do disco | não existe fs.rm/rmSync nem assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 11. Solicitações ao auditor

### 092-001 — TEST_RELIABILITY — ACCEPTED — HIGH

**Encontrado:** resetExtensionState trata falhas de limpeza dos bancos IndexedDB como sucesso. req.onerror e tx.onerror resolvem a Promise e os dois blocos externos possuem catch vazio.

**Arquivo auditado/relacionado:** tests/e2e/cache-and-storage.spec.js.

**Evidência atual:** linhas 56–97 mostram o cleanup best-effort; o describe reutiliza persistent context.

**Evidência ausente:** assertion de que stores realmente ficaram vazias e teste que injete falha de open/transaction/clear.

**Por que é necessário:** uma falha silenciosa pode preservar GTC/restore de um teste anterior. Isso pode fazer um cenário seguinte passar por cache já existente, mascarando uma regressão na etapa que deveria produzir o cache naquele próprio cenário.

**Ação esperada do auditor:** decidir se cleanup deve ser fail-closed. Se sim, alterar o teste em mudança separada para rejeitar erros de limpeza e/ou verificar bancos vazios antes do cenário.

**Evidência esperada:** teste/harness que provoque falha de limpeza e confirme falha explícita, mais assertion de stores vazios no caminho normal.

**Possível regressão:** falso verde por contaminação entre casos E2E.

**Severidade:** HIGH.

### 092-002 — TEST_REQUIRED — ACCEPTED — NORMAL

**Encontrado:** o branch visível de getBrowserModeConfig aceita show, visible, headed e ui, define slowMo=350 e não injeta --headless=new, mas a CI força stealth.

**Arquivo auditado/relacionado:** tests/e2e/cache-and-storage.spec.js.

**Evidência atual:** CI prova somente stealth; linhas 7–16 e 202 contêm o branch alternativo.

**Evidência ausente:** execução automatizada que cubra pelo menos um alias visível e confirme configuração resultante.

**Por que é necessário:** esse modo é útil para diagnóstico local; uma regressão pode permanecer invisível enquanto CI continua verde em stealth.

**Ação esperada do auditor:** adicionar, se considerado necessário, teste focal do parser/config ou job manual controlado sem alterar o contrato documentado.

**Evidência esperada:** assertions de mode, showBrowser, slowMo e presença/ausência de --headless=new.

**Possível regressão:** modo visual de depuração deixa de abrir como esperado sem falha na CI.

**Severidade:** NORMAL.

### 092-003 — RESOURCE_CLEANUP — ACCEPTED — NORMAL

**Encontrado:** beforeAll cria userDataDir em os.tmpdir() e afterAll fecha browserContext, mas não remove explicitamente esse diretório. O módulo fs é importado, porém não é usado.

**Arquivo auditado/relacionado:** tests/e2e/cache-and-storage.spec.js.

**Evidência atual:** linhas 2, 193–208 e 213–215; não existe remoção do caminho no restante do blob.

**Evidência ausente:** prova de que Playwright/Chromium remova automaticamente um userDataDir fornecido pelo chamador, ou cleanup explícito validado.

**Por que é necessário:** execuções repetidas locais ou em agentes persistentes podem acumular perfis temporários.

**Ação esperada do auditor:** confirmar o comportamento do Playwright para userDataDir externo. Se não houver remoção automática garantida, adicionar cleanup robusto em alteração separada.

**Evidência esperada:** teste que confirme ausência do diretório após teardown ou documentação oficial inequívoca do lifecycle.

**Possível regressão:** consumo progressivo de disco/arquivos temporários.

**Severidade:** NORMAL.

## 12. Fonte integral auditada

```js
const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findRepoRoot } = require('../helpers/repo-root');

function getBrowserModeConfig() {
    const rawMode = String(process.env.MANGA_E2E_BROWSER_MODE || 'stealth').trim().toLowerCase();
    const showBrowser = ['show', 'visible', 'headed', 'ui'].includes(rawMode);

    return {
        mode: showBrowser ? 'show' : 'stealth',
        showBrowser,
        slowMo: showBrowser ? 350 : 0,
    };
}

function getExtensionPath(startDir) {
    return path.join(findRepoRoot(startDir), 'extension');
}

async function getBackgroundWorker(context) {
    const existingWorker = context.serviceWorkers()[0];
    if (existingWorker) return existingWorker;
    return context.waitForEvent('serviceworker', { timeout: 15000 });
}

async function resetExtensionState(backgroundWorker) {
    await backgroundWorker.evaluate(() => {
        return new Promise(resolve => {
            chrome.storage.local.clear(() => {
                chrome.storage.local.set({
                    enabledDomains: ['localhost', '127.0.0.1'],
                    debugMode: false,
                    maxConcurrentJobs: 1,
                    geminiBaseUrl: 'http://127.0.0.1:3999/gemini/',
                    defaultPrompt: 'Teste E2E controlado do fluxo MV3.',
                    translatorLog: [],
                    deleting_urls: [],
                    chapterList: [],
                    mt_state: {
                        jobQueue: [],
                        isProcessing: false,
                        stopRequested: false,
                        activeMangaTabId: null,
                        extractionTabs: {},
                        totalJobs: 0,
                        completedJobs: 0,
                        activeJobsCount: 0,
                    },
                }, resolve);
            });
        });
    });

    await backgroundWorker.evaluate(async () => {
        if (!self.indexedDB || typeof self.indexedDB.open !== 'function') return;

        if (typeof self.indexedDB.databases === 'function') {
            try {
                const databases = await self.indexedDB.databases();
                if (databases.some(db => db.name === 'manga_translator_gtc')) {
                    await new Promise(resolve => {
                        const req = self.indexedDB.open('manga_translator_gtc');
                        req.onerror = () => resolve();
                        req.onsuccess = () => {
                            const db = req.result;
                            if (!db.objectStoreNames.contains('translations')) {
                                db.close();
                                resolve();
                                return;
                            }
                            const tx = db.transaction('translations', 'readwrite');
                            tx.objectStore('translations').clear();
                            tx.oncomplete = () => { db.close(); resolve(); };
                            tx.onerror = () => { db.close(); resolve(); };
                        };
                    });
                }
            } catch (_e) {}
        }

        if (self.MangaTranslatorStorageManager && typeof self.MangaTranslatorStorageManager.openStorageDb === 'function') {
            try {
                const db = await self.MangaTranslatorStorageManager.openStorageDb();
                const storeNames = ['chapters', 'chapterPages', 'restoreEntries', 'assets'].filter(name => db.objectStoreNames.contains(name));
                if (storeNames.length > 0) {
                    await new Promise(resolve => {
                        const tx = db.transaction(storeNames, 'readwrite');
                        storeNames.forEach(name => tx.objectStore(name).clear());
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => resolve();
                    });
                }
            } catch (_e) {}
        }
    });
}

async function readStorage(backgroundWorker, keys) {
    return backgroundWorker.evaluate(async requestedKeys => {
        return new Promise(resolve => chrome.storage.local.get(requestedKeys, resolve));
    }, keys);
}

async function removeGeminiTabs(backgroundWorker) {
    await backgroundWorker.evaluate(async () => {
        const tabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
        const geminiIds = tabs
            .filter(tab => {
                try {
                    const url = new URL(tab.url || '');
                    const isLoopbackMock =
                        (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
                        url.port === '3999';
                    const isGeminiSurface =
                        url.pathname === '/gemini' ||
                        url.pathname === '/gemini/' ||
                        url.pathname === '/app' ||
                        url.pathname.startsWith('/app/');
                    return isLoopbackMock && isGeminiSurface;
                } catch (_error) {
                    return false;
                }
            })
            .map(tab => tab.id);

        if (geminiIds.length > 0) {
            await new Promise(resolve => chrome.tabs.remove(geminiIds, resolve));
        }
    });
}

async function countGeminiTabs(backgroundWorker) {
    return backgroundWorker.evaluate(async () => {
        const tabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
        return tabs.filter(tab => {
            try {
                const url = new URL(tab.url || '');
                const isLoopbackMock =
                    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
                    url.port === '3999';
                const isGeminiSurface =
                    url.pathname === '/gemini' ||
                    url.pathname === '/gemini/' ||
                    url.pathname === '/app' ||
                    url.pathname.startsWith('/app/');
                return isLoopbackMock && isGeminiSurface;
            } catch (_error) {
                return false;
            }
        }).length;
    });
}

async function waitForTranslationOnPage(page) {
    await expect.poll(async () => {
        return page.evaluate(() => {
            return Array.from(document.querySelectorAll('img[data-translated="true"]')).length;
        });
    }, {
        timeout: 45000,
        message: 'Esperava imagens traduzidas no DOM da página',
    }).toBe(2);
}

async function waitForRestoreMap(backgroundWorker, chapterUrl) {
    await expect.poll(async () => {
        return backgroundWorker.evaluate(async (url) => {
            const storage = await new Promise(resolve => chrome.storage.local.get(['chapterList'], resolve));
            const chapter = (storage.chapterList || []).find(item => item.url === url);
            if (!chapter) return 0;
            if (self.MangaTranslatorStorageManager) {
                const map = await self.MangaTranslatorStorageManager.getRestoreIndex(chapter.id);
                return Object.keys(map || {}).length;
            }
            return 0;
        }, chapterUrl);
    }, {
        timeout: 15000,
        message: 'Esperava restoreMap persistido para o capitulo antes do reload',
    }).toBe(2);
}

let browserContext;
let backgroundWorker;

test.describe('E2E-23/E2E-24/E2E-25: E2E - cache e persistencia do content_manga', () => {
    // Este arquivo reutiliza um persistent context no beforeAll; preserve ordem.
    test.describe.configure({ mode: 'serial' });
    test.beforeAll(async () => {
        const pathToExtension = getExtensionPath(__dirname);
        const userDataDir = path.join(os.tmpdir(), `pw-manga-cache-${Date.now()}`);
        const browserMode = getBrowserModeConfig();
        const launchArgs = [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ];

        if (!browserMode.showBrowser) launchArgs.unshift('--headless=new');

        browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            slowMo: browserMode.slowMo,
            args: launchArgs,
        });

        backgroundWorker = await getBackgroundWorker(browserContext);
    });

    test.afterAll(async () => {
        if (browserContext) await browserContext.close();
    });

    test.beforeEach(async () => {
        backgroundWorker = await getBackgroundWorker(browserContext);
        await resetExtensionState(backgroundWorker);
    });

    test('salva as paginas traduzidas no storage do capitulo real', { tag: '@e2e-medium-a' }, async () => {
        const page = await browserContext.newPage();

        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        const mainContent = page.locator('#manga-main-content');
        await expect(mainContent).toBeVisible({ timeout: 10000 });

        await mainContent.click();
        await waitForTranslationOnPage(page);

        backgroundWorker = await getBackgroundWorker(browserContext);
        const storage = await readStorage(backgroundWorker, null);
        const chapterList = storage.chapterList || [];
        const chapter = chapterList.find(item => item.url === 'http://localhost:3999/manga-page.html');

        expect(chapter).toBeTruthy();

        // Na arquitetura atual, as páginas e o mapa de restauração são persistidos no StorageManager (IndexedDB)
        const smData = await backgroundWorker.evaluate(async (chapterId) => {
            const sm = self.MangaTranslatorStorageManager;
            if (!sm) return null;
            const page0 = await sm.getPageDataUrl(chapterId, 0);
            const page1 = await sm.getPageDataUrl(chapterId, 1);
            const restoreIndex = await sm.getRestoreIndex(chapterId);
            return {
                pages: { 0: page0, 1: page1 },
                restoreIndex,
            };
        }, chapter.id);

        expect(smData).toBeTruthy();
        expect(smData.pages[0]).toMatch(/^data:image\/png;base64,/);
        expect(smData.pages[1]).toMatch(/^data:image\/png;base64,/);
        expect(smData.restoreIndex).toEqual(expect.objectContaining({
            'http://localhost:3999/manga-images/page_001.png': expect.objectContaining({ index: 0 }),
            'http://localhost:3999/manga-images/page_002.png': expect.objectContaining({ index: 1 }),
        }));

        await page.close();
    });

    test('segunda traducao em host espelho usa o GTC sem abrir novas abas Gemini', { tag: '@e2e-medium-a' }, async () => {
        const firstPage = await browserContext.newPage();

        await firstPage.goto('http://localhost:3999/manga-page.html');
        await firstPage.waitForLoadState('networkidle');
        await expect(firstPage.locator('#manga-main-content')).toBeVisible({ timeout: 10000 });

        await firstPage.locator('#manga-main-content').click();
        await waitForTranslationOnPage(firstPage);

        backgroundWorker = await getBackgroundWorker(browserContext);
        await removeGeminiTabs(backgroundWorker);
        expect(await countGeminiTabs(backgroundWorker)).toBe(0);

        const mirrorPage = await browserContext.newPage();
        await mirrorPage.goto('http://127.0.0.1:3999/manga-page.html');
        await mirrorPage.waitForLoadState('networkidle');
        await expect(mirrorPage.locator('#manga-main-content')).toBeVisible({ timeout: 10000 });

        await mirrorPage.locator('#manga-main-content').click();

        await expect.poll(async () => {
            return mirrorPage.evaluate(() => {
                return Array.from(document.querySelectorAll('img[data-translated="true"]')).length;
            });
        }, {
            timeout: 15000,
            message: 'Esperava reaplicacao das 2 imagens via cache GTC no host espelho',
        }).toBe(2);

        backgroundWorker = await getBackgroundWorker(browserContext);
        expect(await countGeminiTabs(backgroundWorker)).toBe(0);

        const storage = await readStorage(backgroundWorker, ['translatorLog']);
        const logActions = (storage.translatorLog || []).map(entry => entry.action);

        expect(logActions).toContain('GTC_BATCH_HIT');

        await firstPage.close();
        await mirrorPage.close();
    });

    test('reload da mesma pagina reaplica restoreMap sem abrir novas abas Gemini', { tag: '@e2e-medium-b' }, async () => {
        const page = await browserContext.newPage();

        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#manga-main-content')).toBeVisible({ timeout: 10000 });

        await page.locator('#manga-main-content').click();
        await waitForTranslationOnPage(page);

        backgroundWorker = await getBackgroundWorker(browserContext);
        await waitForRestoreMap(backgroundWorker, 'http://localhost:3999/manga-page.html');
        await removeGeminiTabs(backgroundWorker);
        expect(await countGeminiTabs(backgroundWorker)).toBe(0);

        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.locator('#manga-main-content')).toBeVisible({ timeout: 10000 });

        await expect.poll(async () => {
            return page.evaluate(() => {
                return Array.from(document.querySelectorAll('img[data-translated="true"]')).length;
            });
        }, {
            timeout: 15000,
            message: 'Esperava reaplicacao automatica via restoreMap apos reload',
        }).toBe(2);

        backgroundWorker = await getBackgroundWorker(browserContext);
        expect(await countGeminiTabs(backgroundWorker)).toBe(0);

        await page.close();
    });

    test('debug mode mantem abas Gemini abertas apos traduzir', { tag: '@e2e-medium-b' }, async () => {
        const page = await browserContext.newPage();

        try {
            backgroundWorker = await getBackgroundWorker(browserContext);
            await backgroundWorker.evaluate(() => {
                return new Promise(resolve => chrome.storage.local.set({ debugMode: true }, resolve));
            });

            await page.goto('http://localhost:3999/manga-page.html');
            await page.waitForLoadState('networkidle');
            await expect(page.locator('#manga-main-content')).toBeVisible({ timeout: 10000 });

            await page.locator('#manga-main-content').click();
            await waitForTranslationOnPage(page);

            backgroundWorker = await getBackgroundWorker(browserContext);
            await expect.poll(async () => countGeminiTabs(backgroundWorker), {
                timeout: 10000,
                message: 'Esperava abas Gemini preservadas com debugMode=true',
            }).toBeGreaterThanOrEqual(2);
        } finally {
            backgroundWorker = await getBackgroundWorker(browserContext);
            await removeGeminiTabs(backgroundWorker);
            await page.close();
        }
    });
});
```

## 13. Mapa de cobertura linha a linha por faixas contíguas

Todas as 368 posições estão cobertas abaixo, sem lacunas.

| Linhas | Papel específico | Evidência |
|---:|---|---|
| 1–5 | importa Playwright, fs, os, path e findRepoRoot; fs permanece sem uso posterior | 🟨 executado; observação estrutural para fs |
| 6 | separador | estrutural |
| 7–16 | normaliza modo de browser; stealth produz showBrowser=false e slowMo=0; aliases visíveis produzem slowMo=350 | stealth 🟨; branch visível ⚠️ |
| 17 | separador | estrutural |
| 18–20 | resolve extension/ a partir do root encontrado por helper | 🟨 executado no beforeAll |
| 21 | separador | estrutural |
| 22–26 | obtém service worker existente ou aguarda evento por até 15s | 🟨 helper executado; branch exato não instrumentado |
| 27 | separador | estrutural |
| 28–54 | limpa chrome.storage.local e semeia configuração determinística, logs, chapterList e mt_state | 🟨 executado antes de cada teste; conteúdo não tem assertion pós-seed dedicada |
| 55 | separador | estrutural |
| 56–81 | tenta limpar store translations do banco manga_translator_gtc; erros são convertidos em continuidade | ⚠️ cleanup sem prova fail-closed; 092-001 |
| 82 | separador | estrutural |
| 83–96 | abre StorageManager e limpa chapters/chapterPages/restoreEntries/assets existentes; tx.onerror e catch não falham o teste | ⚠️ cleanup sem prova fail-closed; 092-001 |
| 97–98 | fecha evaluate e helper reset | estrutural |
| 99 | separador | estrutural |
| 100–104 | wrapper chrome.storage.local.get usado pelos cenários 1 e 2 | ✅ executado em testes passantes |
| 105 | separador | estrutural |
| 106–121 | consulta abas e filtra superfícies mock Gemini por host, porta e pathname | ✅ usado por cenários passantes |
| 122–124 | URL inválida retorna false | ⚠️ branch sem caso focal |
| 125–132 | extrai IDs e remove abas encontradas | ✅ usado; branch zero/positivo depende do estado observado |
| 133 | separador | estrutural |
| 134–148 | conta abas usando o mesmo predicado Gemini | ✅ assertions de 0 e >=2 passaram |
| 149–151 | URL inválida é ignorada | ⚠️ branch sem caso focal |
| 152–154 | retorna tamanho filtrado e fecha helper | ✅ contagem observada por assertions |
| 155 | separador | estrutural |
| 156–165 | polling do DOM até exatamente duas img[data-translated=true], timeout 45s | ✅ assertion direta em quatro fluxos |
| 166 | separador | estrutural |
| 167–178 | polling do chapterList + StorageManager.getRestoreIndex | ✅ executado no cenário de reload |
| 179–183 | exige exatamente duas entradas em até 15s | ✅ assertion direta |
| 184 | separador | estrutural |
| 185–186 | slots compartilhados para context e service worker | 🟨 usados pelo lifecycle |
| 187 | separador | estrutural |
| 188–190 | declara suíte e força modo serial devido ao persistent context | 🟦 configuração coletada pelo Playwright |
| 191–200 | beforeAll resolve extensão, cria userDataDir e argumentos de carga da extensão | ✅ setup necessário aos shards passantes |
| 201–208 | stealth injeta --headless=new e abre persistent context com slowMo calculado | stealth 🟨 executado; visual ⚠️ |
| 209–211 | obtém service worker inicial | 🟨 execução necessária para prosseguir |
| 212 | separador | estrutural |
| 213–215 | afterAll fecha browserContext | ✅ teardown do run observado; diretório externo sem remoção explícita, 092-003 |
| 216 | separador | estrutural |
| 217–220 | beforeEach reacquire worker e chama resetExtensionState | ✅ executado antes dos quatro casos |
| 221 | separador | estrutural |
| 222–229 | cenário 1 abre fixture, espera rede e exige painel visível | ✅ teste da linha 222 passou |
| 230–239 | clica, espera duas traduções, lê storage e exige capítulo | ✅ assertions diretas |
| 240–252 | consulta StorageManager real para páginas 0/1 e restore index | ✅ implementação real atravessada pelo teste |
| 253–260 | exige smData, dois Data URLs PNG e mapeamento URL→índice 0/1 | ✅ PROVADO DIRETAMENTE |
| 261–263 | fecha página e cenário 1 | ✅ caminho verde observado |
| 264 | separador | estrutural |
| 265–277 | cenário 2 traduz localhost, remove Gemini e exige contagem zero | ✅ teste da linha 265 passou |
| 278–284 | abre host espelho 127.0.0.1 e aciona tradução | ✅ caminho executado |
| 285–293 | polling exige duas traduções no espelho em até 15s | ✅ PROVADO DIRETAMENTE |
| 294–301 | exige zero novas abas e presença de GTC_BATCH_HIT no log | ✅ PROVADO DIRETAMENTE |
| 302–305 | fecha ambas páginas e cenário 2 | ✅ caminho verde observado |
| 306 | separador | estrutural |
| 307–320 | cenário 3 traduz, espera restore index, remove Gemini e exige zero | ✅ teste da linha 307 passou |
| 321–323 | reload networkidle e painel visível | ✅ executado |
| 324–332 | polling exige restauração automática de duas imagens | ✅ PROVADO DIRETAMENTE |
| 333–335 | exige que reload não tenha aberto Gemini | ✅ PROVADO DIRETAMENTE |
| 336–338 | fecha página e cenário 3 | ✅ caminho verde observado |
| 339 | separador | estrutural |
| 340–347 | cenário 4 abre página e ativa debugMode=true no storage | ✅ teste da linha 340 passou |
| 348–354 | abre fixture, aciona tradução e espera duas imagens traduzidas | ✅ executado |
| 355–360 | polling exige pelo menos duas abas Gemini preservadas | ✅ PROVADO DIRETAMENTE |
| 361–365 | finally reacquire worker, remove Gemini e fecha página | ✅ teardown do cenário passante |
| 366–367 | fecha teste e describe | estrutural |
| 368 | newline final | 🟦 integridade do blob |

## 14. Unidades semânticas

### U01 — 1–26 — bootstrap e descoberta do service worker

Define dependências, modo do browser, caminho da extensão e aquisição do worker. O ponto crítico é que o teste controla seu próprio persistent context em vez de usar o page fixture padrão do Playwright.

### U02 — 28–98 — isolamento de estado

Reseta storage pequeno e bancos IndexedDB. É a fundação de independência dos testes, mas hoje usa semântica best-effort para IndexedDB; por isso a Bíblia não promove “reset garantido” a prova.

### U03 — 100–154 — inspeção de storage e abas

Fornece primitives para ler chrome.storage.local, remover superfícies Gemini e contar superfícies Gemini. O mesmo predicado de URL é usado na remoção e na contagem.

### U04 — 156–183 — sincronização por estado observável

Substitui sleeps cegos por expect.poll. A tradução espera exatamente duas imagens; restore espera exatamente duas entradas.

### U05 — 185–220 — lifecycle serial

Um context persistente por execução do describe, teardown no final e reset antes de cada teste.

### U06 — 222–263 — persistência StorageManager

Prova que o fluxo completo produz capítulo, Data URLs e restore index no IndexedDB da extensão.

### U07 — 265–305 — GTC cross-host

Prova reaproveitamento de resultado entre localhost e 127.0.0.1 sem nova ida ao Gemini mock, corroborado pelo log GTC_BATCH_HIT.

### U08 — 307–338 — auto-restore

Prova que reload reaplica dados persistidos localmente sem nova tradução.

### U09 — 340–366 — debug retention

Prova que debugMode altera o lifecycle das abas Gemini, mantendo pelo menos duas abertas após a tradução.

### U10 — 367–368 — fechamento e integridade textual

Encerra a suíte e preserva newline final do blob.

## 15. Invariantes e limites

Invariantes observáveis do arquivo:

1. os quatro casos reais são serializados dentro do describe;
2. cada caso começa chamando resetExtensionState;
3. a fixture válida deve resultar em exatamente duas imagens traduzidas;
4. persistência exige duas páginas PNG e duas entradas de restore index;
5. cache GTC e restore são considerados válidos somente quando não abrem novas abas Gemini;
6. debugMode=true exige abas Gemini remanescentes;
7. os testes são divididos entre medium-a e medium-b e participaram do gate global sem skip/flaky/failure no run observado.

O arquivo não prova:

- comportamento em Firefox/WebKit;
- hosts/portas reais de gemini.google.com neste mock específico;
- modo visual show/visible/headed/ui;
- que todo erro de cleanup de IndexedDB falha o teste — hoje não falha;
- ausência de acúmulo do userDataDir após fechamento;
- igualdade byte-a-byte do resultado traduzido com uma imagem esperada; ele prova formato Data URL, associação e fluxo de persistência;
- performance além dos timeouts usados;
- comportamento sob quota de storage cheia, IndexedDB corrompido ou erro de permissão.

## 16. Autoauditoria do AGENTE 15

- [x] reserva criada com semântica CREATE ONLY;
- [x] reserva relida e ownership confirmado como AGENTE 15;
- [x] .state/092.json criado somente após ownership;
- [x] SHA do fonte reconfirmado antes da materialização;
- [x] fonte integral incorporada a partir do blob atual;
- [x] 367 linhas textuais + newline = 368 posições cobertas sem lacunas;
- [x] fixtures, manifest, helper de root, StorageManager, GTC IndexedDB, config Playwright, shard plan e CI cruzados;
- [x] execução real do mesmo blob localizada;
- [x] quatro testes confirmados nos logs dos shards;
- [x] gate global confirmado com 21 passed, skipped=0, flaky=0, failed=0;
- [x] branches não provados não foram promovidos a prova direta;
- [x] três necessidades externas foram registradas como audit_requests;
- [x] nenhum código, teste, fixture, workflow ou configuração foi alterado para fabricar evidência.

**Resultado:** a substância técnica permanece vinculada ao blob b181989a9b89151ca17cbcbeb7db9342b98c9add. As solicitações 092-001, 092-002 e 092-003 estão ACCEPTED no state canônico; permanecem como lacunas reconhecidas, não como requests OPEN.

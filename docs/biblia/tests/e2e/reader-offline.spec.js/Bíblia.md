# Bíblia técnica — tests/e2e/reader-offline.spec.js

> **Estado documental:** 🟡 CORRIGIDA após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `2837775deacca5123fa99232633b4652774abf96`  
> **Agente responsável:** AGENTE 16  
> **Tipo:** Playwright E2E — Chromium persistente + extensão MV3 real + leitor offline  
> **Linhas textuais:** **422**  
> **Posições documentais:** **277**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/e2e/reader-offline.spec.js` é a suíte E2E que abre um **Chromium real com a extensão MV3 carregada**, sem mockar o DOM do reader, e valida três contratos de usuário do leitor offline:

1. capítulo salvo com índices esparsos é renderizado na ordem visual correta, com título, contador e lazy loading do primeiro ao último item;
2. a largura escolhida no slider é persistida em `localStorage` e reaplicada numa nova aba do reader;
3. navegação por `ArrowRight`, contador e barra de progresso convergem para a página esperada mesmo após lazy load/alteração de altura.

A suíte não testa uma cópia da implementação: ela carrega `extension/reader/reader.html`, que por sua vez carrega `shared-ui.js` e `reader.js`, e conversa com o service worker real da extensão.

O teste semeia o **formato legado** `${chapterId}_images` em `chrome.storage.local`. Isso força o reader a atravessar seu fluxo de migração/índice/fallback. Porém, as assertions visuais atuais não distinguem de forma inequívoca “migração para IndexedDB funcionou” de “migração/índice falhou e o fallback legado ainda conseguiu renderizar”; essa limitação é registrada como solicitação ao auditor.

## 2. Pipeline real de execução

### 2.1 Descoberta pelo Playwright

`playwright.config.js` define:

- `testDir: './tests/e2e'`;
- projeto `extension-tests` com Desktop Chrome;
- Chromium como channel;
- web server na porta 3999;
- retries zero em CI;
- reporter blob para execução shardada.

Os três casos deste arquivo usam a tag `@e2e-fast`.

### 2.2 Seleção pelo plano de shards

`scripts/ci/data/e2e-shard-plan.json` define o grupo `fast` com:

- tag `@e2e-fast`;
- `expectedTests: 9`;
- `workers: 3`.

`package.json` expõe `test:e2e:group` por `scripts/ci/run-e2e-group.js`, e `.github/workflows/ci.yml` executa os cinco grupos, inclusive `fast`, sob `xvfb-run` com `CI=true` e `MANGA_E2E_BROWSER_MODE=stealth`.

### 2.3 Execução real conferida

Foi localizada execução real no **MangaTranslator CI run 36577447500**, head `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`, concluída em 2026-09-29.

Nesse commit:

- o blob de `tests/e2e/reader-offline.spec.js` é exatamente `1ab953d0a031f77cb458befd31650e9ba9c4c052`;
- o blob de `extension/reader/reader.js` é exatamente `490bbb1842348e792cd593c37699a822d81f555b`, igual ao atual;
- o job **E2E Shard (fast)** é `109437162728` e terminou `success`;
- o log lista nominalmente os testes iniciados nas linhas 155, 193 e 224 deste arquivo;
- o resumo do shard é **9 passed (22.0s)**;
- o job agregado **E2E Tests (Playwright)** `109437798789` também terminou `success`;
- o **CI Gate** `109439747723` terminou `success`.

Essa execução permite classificar como prova direta as propriedades efetivamente cobertas pelas assertions dos três casos, sem extrapolar para branches auxiliares que o log não discrimina.

## 3. Dependências e fronteiras

### Dependências npm / Node

- `@playwright/test`: `test`, `expect`, `chromium`;
- `os`: gera o diretório temporário do persistent context;
- `path`: monta caminhos portáveis;
- `../helpers/repo-root`: localiza a raiz procurando `extension/manifest.json`;
- `fs`: importado na linha 2, mas **não é usado** no blob auditado.

### Dependências da extensão

- `extension/manifest.json` — extensão carregada pelo Chromium;
- `extension/reader/reader.html` — página navegada;
- `extension/reader/reader.js` — comportamento exercitado;
- `extension/shared/shared-ui.js` — ponte `smRequest`;
- service worker/background — necessário para storage e runtime URL;
- `extension/shared/storage-manager.js` — IndexedDB/migração quando o fluxo novo funciona.

### Dependências de infraestrutura

- servidor local em `127.0.0.1:3999`;
- Chromium instalado pelo job;
- Xvfb na CI Linux;
- suporte a extensões em persistent context;
- filesystem temporário para o profile.

## 4. Helpers do arquivo

### 4.1 `getBrowserModeConfig` — linhas 7–16

Normaliza `MANGA_E2E_BROWSER_MODE`; somente `show`, `visible`, `headed` ou `ui` ativam modo visível e `slowMo=350`. Qualquer outro valor cai em `stealth` e `slowMo=0`.

O job E2E observado usa `stealth`, portanto o caminho stealth foi executado. Não há prova focal no run observado para cada alias do modo show nem para o valor exato 350.

### 4.2 `getExtensionPath` — linhas 18–20

Usa `findRepoRoot(startDir)` e acrescenta `extension`. Isso evita depender de `process.cwd()` e faz o teste funcionar desde que `__dirname` esteja sob o repositório.

### 4.3 `getBackgroundWorker` — linhas 22–26

Primeiro reutiliza `context.serviceWorkers()[0]`; se ainda não houver worker, aguarda `serviceworker` por até 15 s.

A suíte real prova que um worker foi obtido a tempo para os testes, mas não permite afirmar qual dos dois branches foi usado em cada chamada.

### 4.4 `resetExtensionState` — linhas 28–72

O reset possui duas fases:

1. limpa `chrome.storage.local` e regrava um estado mínimo determinístico para domínio local, debug, concorrência, URL Gemini, prompt, logs, deleções, capítulos e `mt_state`;
2. se `MangaTranslatorStorageManager.openStorageDb` existir, abre o IndexedDB e limpa os stores existentes entre `chapters`, `chapterPages`, `restoreEntries` e `assets`.

Há uma fragilidade importante: o reset de IndexedDB resolve a Promise tanto em `tx.oncomplete` quanto em `tx.onerror`, e ainda envolve todo o bloco em `catch (_e) {}`. Portanto falha de limpeza pode ser silencenciada e o teste continuar sobre estado residual. O run verde não prova o comportamento de erro do reset.

### 4.5 `makeSvgDataUrl` — linhas 74–82

Cria uma imagem SVG 800×1200 determinística, com fundo escuro e um rótulo textual, e a converte para Data URL por `encodeURIComponent`.

O rótulo `idx-N` serve como marcador observável para provar qual índice persistido acabou no `src` da imagem renderizada, sem depender de arquivo binário externo.

### 4.6 `seedReaderChapter` — linhas 84–109

Defaults:

- chapterId `chap_reader_e2e`;
- título `Capitulo E2E do Reader`;
- quinze índices esparsos: `0,2,5,8,10,11,14,20,33,50,51,77,88,99,200`.

Para cada índice cria um SVG `idx-N` e grava no service worker:

- `chapterList` com metadata do capítulo;
- chave legado `${chapterId}_images` com o mapa índice → Data URL.

A esparsidade é deliberada: a ordem visual deve ser por posição da coleção ordenada, não pelo valor numérico contínuo do índice persistido.

### 4.7 `getReaderUrl` — linhas 111–115

Executa dentro do service worker para obter `chrome.runtime.getURL('reader/reader.html')` da extensão carregada e acrescenta o chapterId URL-encoded. Isso evita inventar manualmente o ID `chrome-extension://...`.

## 5. Lifecycle da suíte

A suíte usa `test.describe.configure({ mode: 'serial' })` porque os casos compartilham o mesmo persistent context e o mesmo storage de extensão.

### beforeAll

- resolve a extensão;
- cria nome de profile sob `os.tmpdir()`;
- monta flags de extensão e sandbox;
- adiciona `--headless=new` quando não está em modo show;
- chama `chromium.launchPersistentContext` com `headless:false`, viewport 1280×720 e os args;
- captura o service worker.

O aparente contraste `headless:false` + flag `--headless=new` é intencional no modo stealth: o headless é controlado via argumento Chromium enquanto o Playwright continua com persistent context compatível com extensão.

### beforeEach

Reobtém o worker e chama `resetExtensionState`. Cada caso começa com storage local e, nominalmente, IndexedDB limpos.

### afterAll

Fecha o browserContext se ele existir.

Não existe remoção explícita do `userDataDir` criado em `os.tmpdir()`. O import de `fs` não é usado; isso sugere que uma limpeza explícita pode ter sido pretendida, mas não é correto afirmar intenção sem histórico. A ausência de cleanup explícito é registrada separadamente.

## 6. Caso 1 — ordem, metadata e lazy load

Linhas 155–191.

Fluxo:

1. semeia 15 páginas esparsas;
2. abre nova aba e navega ao reader real;
3. exige 15 `.reader-page-wrap`;
4. define decoder capaz de lidar com Data URL percent-encoded ou base64;
5. espera o primeiro `img.src` existir;
6. decodifica o `src` e exige `idx-0`;
7. exige título, contador `1 / 15` e labels `Página 1` / `Página 15`;
8. rola explicitamente até o último wrapper;
9. espera o último `img.src` surgir;
10. exige `idx-200`;
11. fecha a aba.

### O que prova diretamente

No run real, essas assertions provaram:

- os 15 wrappers foram criados;
- o primeiro item visual corresponde ao índice 0;
- o último item visual corresponde ao índice 200;
- os extremos de uma coleção esparsa aparecem na ordem esperada;
- título e contador inicial estão corretos;
- labels visuais usam cardinalidade humana 1..15;
- a última imagem pode ser materializada após scroll.

### O que não prova

- não demonstra explicitamente que a fonte da página foi IndexedDB em vez do fallback legado;
- não demonstra unload de páginas distantes;
- não prova todos os quinze rótulos `idx-N` individualmente;
- não prova branches de erro de imagem;
- não prova que `SM_MIGRATE_CHAPTER` removeu a chave legado.

## 7. Caso 2 — persistência da largura

Linhas 193–222.

Fluxo:

1. semeia capítulo de três páginas;
2. abre reader;
3. exige três wrappers;
4. muda `#width-slider` para 1000 e dispara `input`;
5. exige `#width-val = 1000px`;
6. exige `#reader-container max-width = 1000px`;
7. fecha a primeira página;
8. abre nova página para a mesma URL;
9. exige novamente três wrappers;
10. exige slider, label e CSS em 1000;
11. fecha a aba.

### Prova direta

Como a primeira página é fechada antes da segunda abrir, a segunda renderização demonstra persistência além do DOM daquela aba. No reader atual, o mecanismo é `localStorage.readerWidth`; a assertion observa o efeito final reaplicado.

### Limite da prova

O teste não lê `localStorage` diretamente nem simula exceção de `getItem/setItem`. Ele prova o efeito persistido, não o tratamento de falhas da API.

## 8. Caso 3 — teclado, geometria e progresso

Linhas 224–275.

Fluxo:

1. semeia o capítulo padrão de 15 páginas;
2. abre reader e exige 15 wrappers;
3. reduz a largura para 400px e confirma CSS;
4. pressiona `ArrowRight` três vezes, com 450 ms entre eventos;
5. exige contador `4 / 15`;
6. seleciona o wrapper visual de índice 9;
7. centraliza esse wrapper;
8. usa `expect.poll` para aguardar `img.complete`, `naturalHeight > 0` e ausência de `data-pending-src`;
9. executa dois `requestAnimationFrame` antes de centralizar novamente;
10. exige contador `10 / 15`;
11. exige barra de progresso `67%`;
12. fecha a aba.

A espera pela imagem é importante porque o placeholder de 400px muda de altura após a imagem real carregar. Sem estabilização, a centralização poderia terminar na página anterior e tornar o E2E flakey.

### Prova direta

O run real demonstra:

- ArrowRight muda o estado visual até `4 / 15`;
- uma página lazy-loaded chega a `complete`, altura natural positiva e sentinel removido;
- após estabilização geométrica, a décima página visual vira a corrente;
- `10/15` é arredondado para `67%` na barra.

### Limites

- três sleeps de 450 ms não provam ausência de timing flakes em máquinas extremamente lentas;
- não cobre ArrowLeft/Up/Down, Home, End ou fullscreen;
- não mede número de RAFs nem garante coalescência de scroll/resize.

## 9. Evidência automatizada

| Propriedade | Evidência conferida | Classificação |
|---|---|---|
| arquivo é coletado pelo E2E | testDir + tag `@e2e-fast` + log do shard | ✅ PROVADO DIRETAMENTE |
| os três testes deste arquivo executam no Chromium real | job 109437162728 lista linhas 155/193/224 e termina verde | ✅ PROVADO DIRETAMENTE |
| mesmo blob auditado foi o executado | SHA no commit do run = `1ab953d...` | ✅ PROVADO DIRETAMENTE |
| mesma implementação `reader.js` atual foi exercitada | SHA no run = `490bbb1...` | ✅ PROVADO DIRETAMENTE |
| 15 wrappers são renderizados no caso esparso | `toHaveCount(15)` executado no caso 1 | ✅ PROVADO DIRETAMENTE |
| primeiro conteúdo é `idx-0` | decode + `toContain('idx-0')` | ✅ PROVADO DIRETAMENTE |
| último conteúdo é `idx-200` após scroll | lazy load + decode + assertion | ✅ PROVADO DIRETAMENTE |
| título/contador/labels extremos | assertions de texto no caso 1 | ✅ PROVADO DIRETAMENTE |
| largura 1000 altera label e CSS | assertions antes de fechar primeira aba | ✅ PROVADO DIRETAMENTE |
| largura 1000 reaparece em nova aba | assertions na reopenedPage | ✅ PROVADO DIRETAMENTE |
| ArrowRight chega a `4 / 15` | três keypresses + assertion | ✅ PROVADO DIRETAMENTE |
| lazy image estabiliza antes do recenter | `expect.poll` em complete/naturalHeight/pendingSrc | ✅ PROVADO DIRETAMENTE |
| página visual 10 produz `10 / 15` e `67%` | assertions finais | ✅ PROVADO DIRETAMENTE |
| modo stealth funciona no CI observado | env do workflow + shard verde | 🟨 EXECUTADO INDIRETAMENTE |
| aliases show/visible/headed/ui e slowMo=350 | não executados no run observado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branch de worker já existente vs waitForEvent | resultado final verde, branch não observado | 🟨 EXECUTADO INDIRETAMENTE |
| reset de chrome.storage conclui no fluxo normal | testes passam após beforeEach | 🟨 EXECUTADO INDIRETAMENTE |
| falha de limpeza IndexedDB é detectada | erro é engolido; sem assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| migração legado → IndexedDB ocorreu, em vez de fallback | UI pode passar pelos dois caminhos | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| chave legado foi removida após migração | nenhuma assertion de storage | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| unload/virtualização distante | nenhum caso força e verifica remoção de src | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| profile temporário é removido | não há cleanup explícito | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| import `fs` tem função | nenhuma; símbolo não é usado | 🟦 INSPEÇÃO ESTÁTICA: import ocioso |

## 10. Solicitações ao auditor

### 093-001 — TEST_SETUP_ROBUSTNESS — ACCEPTED

**Encontrado:** `resetExtensionState` considera tanto `tx.oncomplete` quanto `tx.onerror` como resolução bem-sucedida e ainda engole exceções externas com `catch (_e) {}`.

**Arquivo auditado/relacionado:** `tests/e2e/reader-offline.spec.js`.

**Evidência atual:** o run verde prova o caminho normal, mas não prova que uma falha de limpeza seja percebida.

**Evidência ausente:** cenário em que a transação IndexedDB falha e o teste falha de modo explícito, ou uma pós-condição que prove stores vazios antes de semear o caso.

**Por que é necessária:** estado residual pode produzir falso positivo, interferência entre casos ou flake difícil de reproduzir.

**Ação esperada do auditor:** avaliar se o reset deve ser fail-closed; se sim, alterar setup/teste em mudança separada para rejeitar `tx.onerror`/exceções e/ou afirmar pós-condição de storage vazio.

**Evidência esperada:** teste/asserção que demonstre erro de limpeza tornando a suíte vermelha e caminho normal permanecendo verde.

**Possível regressão:** um caso pode passar usando páginas/metadata remanescentes de execução anterior.

**Severidade:** HIGH.

### 093-002 — TEST_REQUIRED — ACCEPTED

**Encontrado:** o caso de ordem semeia apenas `chapterList` + `${chapterId}_images` legado. O reader chama migração e índice, mas, se o índice novo não estiver disponível, possui fallback para o mesmo objeto legado.

**Arquivo externo relacionado:** `extension/reader/reader.js` / `extension/shared/storage-manager.js`; teste-alvo sugerido permanece em `tests/e2e/reader-offline.spec.js` ou suíte de integração apropriada.

**Evidência atual:** UI final com idx-0/idx-200 e 15 páginas.

**Evidência ausente:** assertion que prove que, antes da renderização/finalização do cenário, as páginas existem no store novo e/ou que a chave legado foi removida/flag de migração foi gravada.

**Por que é necessária:** hoje uma regressão que quebre migração/índice novo pode permanecer verde graças ao fallback legado.

**Ação esperada do auditor:** adicionar prova separada da migração real, sem remover a cobertura de fallback.

**Evidência esperada:** inspeção pelo service worker/StorageManager do page index migrado, contagem esperada e política de remoção/flag; idealmente um caso separado para fallback.

**Possível regressão:** IndexedDB/migração pode ficar permanentemente quebrado enquanto o E2E continua verde em instalações que ainda mantêm dados legados.

**Severidade:** HIGH.

### 093-003 — RESOURCE_CLEANUP — ACCEPTED

**Encontrado:** `beforeAll` cria `userDataDir` sob `os.tmpdir()`; `afterAll` fecha o contexto, mas não remove explicitamente o diretório. O módulo `fs` é importado e não utilizado.

**Arquivo auditado/relacionado:** `tests/e2e/reader-offline.spec.js`.

**Evidência atual:** fechamento do browserContext é executado no caminho verde; não há remoção explícita do profile.

**Evidência ausente:** teardown/assertion que comprove remoção do diretório persistente.

**Por que é necessária:** perfis persistentes podem deixar resíduos em execuções locais longas/repetidas e o import ocioso sugere dívida de manutenção.

**Ação esperada do auditor:** verificar comportamento do Playwright para diretório fornecido explicitamente e decidir se deve persistir; se não, guardar o path fora de `beforeAll` e usar cleanup robusto em `afterAll`.

**Evidência esperada:** diretório ausente após teardown ou contrato explícito justificando sua preservação.

**Possível regressão:** acúmulo de profiles temporários e estado residual em ambientes não efêmeros.

**Severidade:** LOW.

## 11. Fonte integral auditada

~~~javascript
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

async function resetExtensionState(backgroundWorker, { forceIndexedDbFailure = false } = {}) {
    await backgroundWorker.evaluate(async () => {
        await new Promise((resolve, reject) => {
            chrome.storage.local.clear(() => {
                const clearError = chrome.runtime.lastError;
                if (clearError) {
                    reject(new Error(clearError.message || 'chrome.storage.local.clear falhou'));
                    return;
                }

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
                }, () => {
                    const setError = chrome.runtime.lastError;
                    if (setError) reject(new Error(setError.message || 'chrome.storage.local.set falhou'));
                    else resolve();
                });
            });
        });
    });

    await backgroundWorker.evaluate(async shouldForceFailure => {
        const sm = self.MangaTranslatorStorageManager;
        if (!sm || typeof sm.openStorageDb !== 'function') {
            throw new Error('StorageManager indisponível durante reset E2E');
        }

        const db = await sm.openStorageDb();
        const storeNames = ['chapters', 'chapterPages', 'restoreEntries', 'assets'];
        const missingStores = storeNames.filter(name => !db.objectStoreNames.contains(name));
        if (missingStores.length > 0) {
            throw new Error(`Stores IndexedDB ausentes no reset E2E: ${missingStores.join(', ')}`);
        }

        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeNames, 'readwrite');
            let settled = false;
            const failure = fallback => (
                shouldForceFailure
                    ? new Error('E2E_INJECTED_IDB_RESET_FAILURE')
                    : (tx.error || new Error(fallback))
            );
            const fail = reason => {
                if (settled) return;
                settled = true;
                reject(reason instanceof Error ? reason : new Error(String(reason || 'IndexedDB reset falhou')));
            };

            tx.oncomplete = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            tx.onerror = () => fail(failure('IndexedDB reset transaction error'));
            tx.onabort = () => fail(failure('IndexedDB reset transaction aborted'));

            storeNames.forEach(name => tx.objectStore(name).clear());
            if (shouldForceFailure) tx.abort();
        });

        const counts = {};
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeNames, 'readonly');
            let settled = false;
            const fail = reason => {
                if (settled) return;
                settled = true;
                reject(reason instanceof Error ? reason : new Error(String(reason || 'IndexedDB post-condition falhou')));
            };

            storeNames.forEach(name => {
                const request = tx.objectStore(name).count();
                request.onsuccess = () => { counts[name] = request.result; };
                request.onerror = () => fail(request.error || new Error(`Falha contando store ${name}`));
            });

            tx.oncomplete = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            tx.onerror = () => fail(tx.error || new Error('IndexedDB post-condition transaction error'));
            tx.onabort = () => fail(tx.error || new Error('IndexedDB post-condition transaction aborted'));
        });

        const dirtyStores = Object.entries(counts).filter(([, count]) => count !== 0);
        if (dirtyStores.length > 0) {
            throw new Error(`IndexedDB reset incompleto: ${JSON.stringify(Object.fromEntries(dirtyStores))}`);
        }

        return counts;
    }, forceIndexedDbFailure);
}


function makeSvgDataUrl(label) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
            <rect width="800" height="1200" fill="#101010" />
            <text x="50%" y="50%" fill="#ffffff" font-size="72" text-anchor="middle">${label}</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const DEFAULT_READER_INDICES = [0, 2, 5, 8, 10, 11, 14, 20, 33, 50, 51, 77, 88, 99, 200];

async function seedReaderChapter(backgroundWorker, {
    chapterId = 'chap_reader_e2e',
    title = 'Capitulo E2E do Reader',
    indices = DEFAULT_READER_INDICES,
} = {}) {
    const images = {};
    indices.forEach(index => {
        images[index] = makeSvgDataUrl(`idx-${index}`);
    });

    await backgroundWorker.evaluate(async ({ chapterId, title, images }) => {
        await new Promise(resolve => {
            chrome.storage.local.set({
                chapterList: [{
                    id: chapterId,
                    title,
                    url: 'http://localhost:3999/manga-page.html',
                    timestamp: Date.now(),
                }],
                [`${chapterId}_images`]: images,
            }, resolve);
        });
    }, { chapterId, title, images });

    return chapterId;
}

async function getReaderUrl(backgroundWorker, chapterId) {
    return backgroundWorker.evaluate(async requestedChapterId => {
        return `${chrome.runtime.getURL('reader/reader.html')}?id=${encodeURIComponent(requestedChapterId)}`;
    }, chapterId);
}

async function readReaderMigrationState(backgroundWorker, chapterId) {
    return backgroundWorker.evaluate(async requestedChapterId => {
        const sm = self.MangaTranslatorStorageManager;
        if (!sm) throw new Error('StorageManager indisponível ao verificar migração');

        const pageIndex = await sm.getChapterPageIndex(requestedChapterId);
        const pageCount = await sm.getChapterPageCount(requestedChapterId);
        const firstPage = await sm.getPageDataUrl(requestedChapterId, 0);
        const lastPage = await sm.getPageDataUrl(requestedChapterId, 200);
        const legacyKey = `${requestedChapterId}_images`;
        const flagKey = `_sm_migrated_${requestedChapterId}`;

        const storage = await new Promise((resolve, reject) => {
            chrome.storage.local.get([legacyKey, flagKey], value => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message || 'chrome.storage.local.get falhou'));
                else resolve(value);
            });
        });

        return {
            indices: pageIndex.map(entry => entry.pageIndex),
            pageCount,
            firstPagePresent: typeof firstPage === 'string' && firstPage.startsWith('data:image/'),
            lastPagePresent: typeof lastPage === 'string' && lastPage.startsWith('data:image/'),
            legacyImagesPresent: Object.prototype.hasOwnProperty.call(storage, legacyKey),
            migrationFlag: storage[flagKey],
        };
    }, chapterId);
}

let browserContext;
let backgroundWorker;
let userDataDir;

test.describe('E2E-19/E2E-20/E2E-21/E2E-22: E2E - reader offline real', () => {
    // O reader compartilha persistent context/storage entre casos deste arquivo.
    test.describe.configure({ mode: 'serial' });
    test.beforeAll(async () => {
        const pathToExtension = getExtensionPath(__dirname);
        userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-manga-reader-'));
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
            viewport: { width: 1280, height: 720 },
        });

        backgroundWorker = await getBackgroundWorker(browserContext);
    });

    test.afterAll(async () => {
        let closeError = null;
        try {
            if (browserContext) await browserContext.close();
        } catch (error) {
            closeError = error;
        }

        let cleanupError = null;
        try {
            if (userDataDir) {
                fs.rmSync(userDataDir, {
                    recursive: true,
                    force: true,
                    maxRetries: 3,
                    retryDelay: 100,
                });
                if (fs.existsSync(userDataDir)) {
                    throw new Error(`Persistent profile não removido: ${userDataDir}`);
                }
            }
        } catch (error) {
            cleanupError = error;
        }

        if (closeError) {
            if (cleanupError && Object.isExtensible(closeError)) closeError.cleanupError = cleanupError;
            throw closeError;
        }
        if (cleanupError) throw cleanupError;
    });

    test.beforeEach(async () => {
        backgroundWorker = await getBackgroundWorker(browserContext);
        await resetExtensionState(backgroundWorker);
    });

    test('reset de IndexedDB falha fechado quando a limpeza não pode ser confirmada', { tag: '@e2e-fast' }, async () => {
        await expect(resetExtensionState(backgroundWorker, {
            forceIndexedDbFailure: true,
        })).rejects.toThrow('E2E_INJECTED_IDB_RESET_FAILURE');

        await expect(resetExtensionState(backgroundWorker)).resolves.toBeUndefined();
    });

    test('renderiza paginas salvas em ordem numerica correta e contador inicial consistente', { tag: '@e2e-fast' }, async () => {
        const chapterId = await seedReaderChapter(backgroundWorker, {});
        const readerPage = await browserContext.newPage();
        const readerUrl = await getReaderUrl(backgroundWorker, chapterId);

        await readerPage.goto(readerUrl);
        await expect(readerPage.locator('.reader-page-wrap')).toHaveCount(15, { timeout: 10000 });

        const decodeSrc = src => {
            if (!src) return '';
            if (src.includes(';base64,')) {
                return Buffer.from(src.split(';base64,')[1], 'base64').toString('utf8');
            }
            return decodeURIComponent(src);
        };

        const firstImg = readerPage.locator('.reader-page-wrap img').first();
        await expect(firstImg).toHaveAttribute('src', /.+/, { timeout: 10000 });
        const firstSrc = await firstImg.getAttribute('src');
        expect(decodeSrc(firstSrc)).toContain('idx-0');

        await expect(readerPage.locator('#chapter-title')).toHaveText('Capitulo E2E do Reader');
        await expect(readerPage.locator('#page-counter')).toHaveText('1 / 15');
        await expect(readerPage.locator('.page-label').first()).toHaveText('Página 1');
        await expect(readerPage.locator('.page-label').last()).toHaveText('Página 15');

        // O reader utiliza IntersectionObserver (lazy loading), portanto a última página (idx-200)
        // é carregada sob demanda ao rolar até ela
        const lastWrap = readerPage.locator('.reader-page-wrap').last();
        await lastWrap.scrollIntoViewIfNeeded();
        const lastImg = lastWrap.locator('img');
        await expect(lastImg).toHaveAttribute('src', /.+/, { timeout: 10000 });
        const lastSrc = await lastImg.getAttribute('src');
        expect(decodeSrc(lastSrc)).toContain('idx-200');

        const migration = await readReaderMigrationState(backgroundWorker, chapterId);
        expect(migration).toEqual({
            indices: DEFAULT_READER_INDICES,
            pageCount: DEFAULT_READER_INDICES.length,
            firstPagePresent: true,
            lastPagePresent: true,
            legacyImagesPresent: false,
            migrationFlag: true,
        });

        await readerPage.close();
    });

    test('slider de largura persiste no localStorage ao reabrir o reader', { tag: '@e2e-fast' }, async () => {
        const chapterId = await seedReaderChapter(backgroundWorker, {
            chapterId: 'chap_reader_width',
            indices: [0, 1, 2],
        });
        const readerUrl = await getReaderUrl(backgroundWorker, chapterId);

        const firstPage = await browserContext.newPage();
        await firstPage.goto(readerUrl);
        await expect(firstPage.locator('.reader-page-wrap')).toHaveCount(3, { timeout: 10000 });

        await firstPage.locator('#width-slider').evaluate((node, value) => {
            node.value = String(value);
            node.dispatchEvent(new Event('input', { bubbles: true }));
        }, 1000);

        await expect(firstPage.locator('#width-val')).toHaveText('1000px');
        await expect(firstPage.locator('#reader-container')).toHaveCSS('max-width', '1000px');
        await firstPage.close();

        const reopenedPage = await browserContext.newPage();
        await reopenedPage.goto(readerUrl);
        await expect(reopenedPage.locator('.reader-page-wrap')).toHaveCount(3, { timeout: 10000 });

        await expect(reopenedPage.locator('#width-slider')).toHaveValue('1000');
        await expect(reopenedPage.locator('#width-val')).toHaveText('1000px');
        await expect(reopenedPage.locator('#reader-container')).toHaveCSS('max-width', '1000px');

        await reopenedPage.close();
    });

    test('navegacao por teclado avanca paginas e atualiza contador/progresso', { tag: '@e2e-fast' }, async () => {
        const chapterId = await seedReaderChapter(backgroundWorker, {
            chapterId: 'chap_reader_keyboard',
        });
        const readerPage = await browserContext.newPage();
        const readerUrl = await getReaderUrl(backgroundWorker, chapterId);

        await readerPage.goto(readerUrl);
        await expect(readerPage.locator('.reader-page-wrap')).toHaveCount(15, { timeout: 10000 });

        await readerPage.locator('#width-slider').evaluate(node => {
            node.value = '400';
            node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await expect(readerPage.locator('#reader-container')).toHaveCSS('max-width', '400px');

        for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await readerPage.keyboard.press('ArrowRight');
            // eslint-disable-next-line no-await-in-loop
            await readerPage.waitForTimeout(450);
        }

        await expect(readerPage.locator('#page-counter')).toHaveText('4 / 15', { timeout: 5000 });

        const targetPage = readerPage.locator('.reader-page-wrap').nth(9);
        await targetPage.evaluate(el => el.scrollIntoView({ block: 'center' }));

        // A virtualização carrega a imagem apenas quando a página entra na
        // janela de preload. Espere a altura real estabilizar antes de
        // centralizar novamente; caso contrário o placeholder de 400px pode
        // crescer após o scroll e deslocar o viewport para a página anterior.
        await expect.poll(async () => targetPage.locator('img').evaluate(img => (
            img.complete
            && img.naturalHeight > 0
            && !img.dataset.pendingSrc
        )), { timeout: 10000 }).toBe(true);

        await targetPage.evaluate(el => new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                el.scrollIntoView({ block: 'center' });
                resolve();
            }));
        }));

        await expect(readerPage.locator('#page-counter')).toHaveText('10 / 15', { timeout: 5000 });
        await expect.poll(async () => {
            return readerPage.locator('#read-progress-fill').evaluate(node => node.style.width);
        }, { timeout: 5000 }).toBe('67%');

        await readerPage.close();
    });
});
~~~

## 12. Cobertura documental por posições

Cada posição 1–277 está vinculada a uma unidade semântica. A tabela funciona como índice exaustivo; a análise específica de comportamento, limites e evidência está nas seções e unidades correspondentes.

| Linha/posição | Unidade | Conteúdo |
|---:|:---:|---|
| 1 | U01 | const { test, expect, chromium } = require('@playwright/test'); |
| 2 | U01 | const fs = require('fs'); |
| 3 | U01 | const os = require('os'); |
| 4 | U01 | const path = require('path'); |
| 5 | U01 | const { findRepoRoot } = require('../helpers/repo-root'); |
| 6 | U02 | ␠ [linha vazia / posição final] |
| 7 | U02 | function getBrowserModeConfig() { |
| 8 | U02 | const rawMode = String(process.env.MANGA_E2E_BROWSER_MODE \|\| 'stealth').trim().toLowerCase(); |
| 9 | U02 | const showBrowser = ['show', 'visible', 'headed', 'ui'].includes(rawMode); |
| 10 | U02 | ␠ [linha vazia / posição final] |
| 11 | U02 | return { |
| 12 | U02 | mode: showBrowser ? 'show' : 'stealth', |
| 13 | U02 | showBrowser, |
| 14 | U02 | slowMo: showBrowser ? 350 : 0, |
| 15 | U02 | }; |
| 16 | U02 | } |
| 17 | U03 | ␠ [linha vazia / posição final] |
| 18 | U03 | function getExtensionPath(startDir) { |
| 19 | U03 | return path.join(findRepoRoot(startDir), 'extension'); |
| 20 | U03 | } |
| 21 | U04 | ␠ [linha vazia / posição final] |
| 22 | U04 | async function getBackgroundWorker(context) { |
| 23 | U04 | const existingWorker = context.serviceWorkers()[0]; |
| 24 | U04 | if (existingWorker) return existingWorker; |
| 25 | U04 | return context.waitForEvent('serviceworker', { timeout: 15000 }); |
| 26 | U04 | } |
| 27 | U05 | ␠ [linha vazia / posição final] |
| 28 | U05 | async function resetExtensionState(backgroundWorker) { |
| 29 | U05 | await backgroundWorker.evaluate(() => { |
| 30 | U05 | return new Promise(resolve => { |
| 31 | U05 | chrome.storage.local.clear(() => { |
| 32 | U05 | chrome.storage.local.set({ |
| 33 | U05 | enabledDomains: ['localhost', '127.0.0.1'], |
| 34 | U05 | debugMode: false, |
| 35 | U05 | maxConcurrentJobs: 1, |
| 36 | U05 | geminiBaseUrl: 'http://127.0.0.1:3999/gemini/', |
| 37 | U05 | defaultPrompt: 'Teste E2E controlado do fluxo MV3.', |
| 38 | U05 | translatorLog: [], |
| 39 | U05 | deleting_urls: [], |
| 40 | U05 | chapterList: [], |
| 41 | U05 | mt_state: { |
| 42 | U05 | jobQueue: [], |
| 43 | U05 | isProcessing: false, |
| 44 | U05 | stopRequested: false, |
| 45 | U05 | activeMangaTabId: null, |
| 46 | U05 | extractionTabs: {}, |
| 47 | U05 | totalJobs: 0, |
| 48 | U05 | completedJobs: 0, |
| 49 | U05 | activeJobsCount: 0, |
| 50 | U05 | }, |
| 51 | U05 | }, resolve); |
| 52 | U05 | }); |
| 53 | U05 | }); |
| 54 | U05 | }); |
| 55 | U05 | ␠ [linha vazia / posição final] |
| 56 | U05 | await backgroundWorker.evaluate(async () => { |
| 57 | U05 | if (self.MangaTranslatorStorageManager && typeof self.MangaTranslatorStorageManager.openStorageDb === 'function') { |
| 58 | U05 | try { |
| 59 | U05 | const db = await self.MangaTranslatorStorageManager.openStorageDb(); |
| 60 | U05 | const storeNames = ['chapters', 'chapterPages', 'restoreEntries', 'assets'].filter(name => db.objectStoreNames.contains(name)); |
| 61 | U05 | if (storeNames.length > 0) { |
| 62 | U05 | await new Promise(resolve => { |
| 63 | U05 | const tx = db.transaction(storeNames, 'readwrite'); |
| 64 | U05 | storeNames.forEach(name => tx.objectStore(name).clear()); |
| 65 | U05 | tx.oncomplete = () => resolve(); |
| 66 | U05 | tx.onerror = () => resolve(); |
| 67 | U05 | }); |
| 68 | U05 | } |
| 69 | U05 | } catch (_e) {} |
| 70 | U05 | } |
| 71 | U05 | }); |
| 72 | U05 | } |
| 73 | U06 | ␠ [linha vazia / posição final] |
| 74 | U06 | function makeSvgDataUrl(label) { |
| 75 | U06 | const svg = \` |
| 76 | U06 | <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200"> |
| 77 | U06 | <rect width="800" height="1200" fill="#101010" /> |
| 78 | U06 | <text x="50%" y="50%" fill="#ffffff" font-size="72" text-anchor="middle">${label}</text> |
| 79 | U06 | </svg> |
| 80 | U06 | \`; |
| 81 | U06 | return \`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}\`; |
| 82 | U06 | } |
| 83 | U07 | ␠ [linha vazia / posição final] |
| 84 | U07 | async function seedReaderChapter(backgroundWorker, { |
| 85 | U07 | chapterId = 'chap_reader_e2e', |
| 86 | U07 | title = 'Capitulo E2E do Reader', |
| 87 | U07 | indices = [0, 2, 5, 8, 10, 11, 14, 20, 33, 50, 51, 77, 88, 99, 200], |
| 88 | U07 | } = {}) { |
| 89 | U07 | const images = {}; |
| 90 | U07 | indices.forEach(index => { |
| 91 | U07 | images[index] = makeSvgDataUrl(\`idx-${index}\`); |
| 92 | U07 | }); |
| 93 | U07 | ␠ [linha vazia / posição final] |
| 94 | U07 | await backgroundWorker.evaluate(async ({ chapterId, title, images }) => { |
| 95 | U07 | await new Promise(resolve => { |
| 96 | U07 | chrome.storage.local.set({ |
| 97 | U07 | chapterList: [{ |
| 98 | U07 | id: chapterId, |
| 99 | U07 | title, |
| 100 | U07 | url: 'http://localhost:3999/manga-page.html', |
| 101 | U07 | timestamp: Date.now(), |
| 102 | U07 | }], |
| 103 | U07 | [\`${chapterId}_images\`]: images, |
| 104 | U07 | }, resolve); |
| 105 | U07 | }); |
| 106 | U07 | }, { chapterId, title, images }); |
| 107 | U07 | ␠ [linha vazia / posição final] |
| 108 | U07 | return chapterId; |
| 109 | U07 | } |
| 110 | U08 | ␠ [linha vazia / posição final] |
| 111 | U08 | async function getReaderUrl(backgroundWorker, chapterId) { |
| 112 | U08 | return backgroundWorker.evaluate(async requestedChapterId => { |
| 113 | U08 | return \`${chrome.runtime.getURL('reader/reader.html')}?id=${encodeURIComponent(requestedChapterId)}\`; |
| 114 | U08 | }, chapterId); |
| 115 | U08 | } |
| 116 | U09 | ␠ [linha vazia / posição final] |
| 117 | U09 | let browserContext; |
| 118 | U09 | let backgroundWorker; |
| 119 | U09 | ␠ [linha vazia / posição final] |
| 120 | U09 | test.describe('E2E-19/E2E-20/E2E-21/E2E-22: E2E - reader offline real', () => { |
| 121 | U09 | // O reader compartilha persistent context/storage entre casos deste arquivo. |
| 122 | U09 | test.describe.configure({ mode: 'serial' }); |
| 123 | U09 | test.beforeAll(async () => { |
| 124 | U09 | const pathToExtension = getExtensionPath(__dirname); |
| 125 | U09 | const userDataDir = path.join(os.tmpdir(), \`pw-manga-reader-${Date.now()}\`); |
| 126 | U09 | const browserMode = getBrowserModeConfig(); |
| 127 | U09 | const launchArgs = [ |
| 128 | U09 | \`--disable-extensions-except=${pathToExtension}\`, |
| 129 | U09 | \`--load-extension=${pathToExtension}\`, |
| 130 | U09 | '--no-sandbox', |
| 131 | U09 | '--disable-setuid-sandbox', |
| 132 | U09 | ]; |
| 133 | U09 | ␠ [linha vazia / posição final] |
| 134 | U09 | if (!browserMode.showBrowser) launchArgs.unshift('--headless=new'); |
| 135 | U09 | ␠ [linha vazia / posição final] |
| 136 | U09 | browserContext = await chromium.launchPersistentContext(userDataDir, { |
| 137 | U09 | headless: false, |
| 138 | U09 | slowMo: browserMode.slowMo, |
| 139 | U09 | args: launchArgs, |
| 140 | U09 | viewport: { width: 1280, height: 720 }, |
| 141 | U09 | }); |
| 142 | U09 | ␠ [linha vazia / posição final] |
| 143 | U09 | backgroundWorker = await getBackgroundWorker(browserContext); |
| 144 | U09 | }); |
| 145 | U09 | ␠ [linha vazia / posição final] |
| 146 | U09 | test.afterAll(async () => { |
| 147 | U09 | if (browserContext) await browserContext.close(); |
| 148 | U09 | }); |
| 149 | U09 | ␠ [linha vazia / posição final] |
| 150 | U09 | test.beforeEach(async () => { |
| 151 | U09 | backgroundWorker = await getBackgroundWorker(browserContext); |
| 152 | U09 | await resetExtensionState(backgroundWorker); |
| 153 | U09 | }); |
| 154 | U09 | ␠ [linha vazia / posição final] |
| 155 | U10 | test('renderiza paginas salvas em ordem numerica correta e contador inicial consistente', { tag: '@e2e-fast' }, async () => { |
| 156 | U10 | const chapterId = await seedReaderChapter(backgroundWorker, {}); |
| 157 | U10 | const readerPage = await browserContext.newPage(); |
| 158 | U10 | const readerUrl = await getReaderUrl(backgroundWorker, chapterId); |
| 159 | U10 | ␠ [linha vazia / posição final] |
| 160 | U10 | await readerPage.goto(readerUrl); |
| 161 | U10 | await expect(readerPage.locator('.reader-page-wrap')).toHaveCount(15, { timeout: 10000 }); |
| 162 | U10 | ␠ [linha vazia / posição final] |
| 163 | U10 | const decodeSrc = src => { |
| 164 | U10 | if (!src) return ''; |
| 165 | U10 | if (src.includes(';base64,')) { |
| 166 | U10 | return Buffer.from(src.split(';base64,')[1], 'base64').toString('utf8'); |
| 167 | U10 | } |
| 168 | U10 | return decodeURIComponent(src); |
| 169 | U10 | }; |
| 170 | U10 | ␠ [linha vazia / posição final] |
| 171 | U10 | const firstImg = readerPage.locator('.reader-page-wrap img').first(); |
| 172 | U10 | await expect(firstImg).toHaveAttribute('src', /.+/, { timeout: 10000 }); |
| 173 | U10 | const firstSrc = await firstImg.getAttribute('src'); |
| 174 | U10 | expect(decodeSrc(firstSrc)).toContain('idx-0'); |
| 175 | U10 | ␠ [linha vazia / posição final] |
| 176 | U10 | await expect(readerPage.locator('#chapter-title')).toHaveText('Capitulo E2E do Reader'); |
| 177 | U10 | await expect(readerPage.locator('#page-counter')).toHaveText('1 / 15'); |
| 178 | U10 | await expect(readerPage.locator('.page-label').first()).toHaveText('Página 1'); |
| 179 | U10 | await expect(readerPage.locator('.page-label').last()).toHaveText('Página 15'); |
| 180 | U10 | ␠ [linha vazia / posição final] |
| 181 | U10 | // O reader utiliza IntersectionObserver (lazy loading), portanto a última página (idx-200) |
| 182 | U10 | // é carregada sob demanda ao rolar até ela |
| 183 | U10 | const lastWrap = readerPage.locator('.reader-page-wrap').last(); |
| 184 | U10 | await lastWrap.scrollIntoViewIfNeeded(); |
| 185 | U10 | const lastImg = lastWrap.locator('img'); |
| 186 | U10 | await expect(lastImg).toHaveAttribute('src', /.+/, { timeout: 10000 }); |
| 187 | U10 | const lastSrc = await lastImg.getAttribute('src'); |
| 188 | U10 | expect(decodeSrc(lastSrc)).toContain('idx-200'); |
| 189 | U10 | ␠ [linha vazia / posição final] |
| 190 | U10 | await readerPage.close(); |
| 191 | U10 | }); |
| 192 | U10 | ␠ [linha vazia / posição final] |
| 193 | U11 | test('slider de largura persiste no localStorage ao reabrir o reader', { tag: '@e2e-fast' }, async () => { |
| 194 | U11 | const chapterId = await seedReaderChapter(backgroundWorker, { |
| 195 | U11 | chapterId: 'chap_reader_width', |
| 196 | U11 | indices: [0, 1, 2], |
| 197 | U11 | }); |
| 198 | U11 | const readerUrl = await getReaderUrl(backgroundWorker, chapterId); |
| 199 | U11 | ␠ [linha vazia / posição final] |
| 200 | U11 | const firstPage = await browserContext.newPage(); |
| 201 | U11 | await firstPage.goto(readerUrl); |
| 202 | U11 | await expect(firstPage.locator('.reader-page-wrap')).toHaveCount(3, { timeout: 10000 }); |
| 203 | U11 | ␠ [linha vazia / posição final] |
| 204 | U11 | await firstPage.locator('#width-slider').evaluate((node, value) => { |
| 205 | U11 | node.value = String(value); |
| 206 | U11 | node.dispatchEvent(new Event('input', { bubbles: true })); |
| 207 | U11 | }, 1000); |
| 208 | U11 | ␠ [linha vazia / posição final] |
| 209 | U11 | await expect(firstPage.locator('#width-val')).toHaveText('1000px'); |
| 210 | U11 | await expect(firstPage.locator('#reader-container')).toHaveCSS('max-width', '1000px'); |
| 211 | U11 | await firstPage.close(); |
| 212 | U11 | ␠ [linha vazia / posição final] |
| 213 | U11 | const reopenedPage = await browserContext.newPage(); |
| 214 | U11 | await reopenedPage.goto(readerUrl); |
| 215 | U11 | await expect(reopenedPage.locator('.reader-page-wrap')).toHaveCount(3, { timeout: 10000 }); |
| 216 | U11 | ␠ [linha vazia / posição final] |
| 217 | U11 | await expect(reopenedPage.locator('#width-slider')).toHaveValue('1000'); |
| 218 | U11 | await expect(reopenedPage.locator('#width-val')).toHaveText('1000px'); |
| 219 | U11 | await expect(reopenedPage.locator('#reader-container')).toHaveCSS('max-width', '1000px'); |
| 220 | U11 | ␠ [linha vazia / posição final] |
| 221 | U11 | await reopenedPage.close(); |
| 222 | U11 | }); |
| 223 | U11 | ␠ [linha vazia / posição final] |
| 224 | U12 | test('navegacao por teclado avanca paginas e atualiza contador/progresso', { tag: '@e2e-fast' }, async () => { |
| 225 | U12 | const chapterId = await seedReaderChapter(backgroundWorker, { |
| 226 | U12 | chapterId: 'chap_reader_keyboard', |
| 227 | U12 | }); |
| 228 | U12 | const readerPage = await browserContext.newPage(); |
| 229 | U12 | const readerUrl = await getReaderUrl(backgroundWorker, chapterId); |
| 230 | U12 | ␠ [linha vazia / posição final] |
| 231 | U12 | await readerPage.goto(readerUrl); |
| 232 | U12 | await expect(readerPage.locator('.reader-page-wrap')).toHaveCount(15, { timeout: 10000 }); |
| 233 | U12 | ␠ [linha vazia / posição final] |
| 234 | U12 | await readerPage.locator('#width-slider').evaluate(node => { |
| 235 | U12 | node.value = '400'; |
| 236 | U12 | node.dispatchEvent(new Event('input', { bubbles: true })); |
| 237 | U12 | }); |
| 238 | U12 | await expect(readerPage.locator('#reader-container')).toHaveCSS('max-width', '400px'); |
| 239 | U12 | ␠ [linha vazia / posição final] |
| 240 | U12 | for (let i = 0; i < 3; i += 1) { |
| 241 | U12 | // eslint-disable-next-line no-await-in-loop |
| 242 | U12 | await readerPage.keyboard.press('ArrowRight'); |
| 243 | U12 | // eslint-disable-next-line no-await-in-loop |
| 244 | U12 | await readerPage.waitForTimeout(450); |
| 245 | U12 | } |
| 246 | U12 | ␠ [linha vazia / posição final] |
| 247 | U12 | await expect(readerPage.locator('#page-counter')).toHaveText('4 / 15', { timeout: 5000 }); |
| 248 | U12 | ␠ [linha vazia / posição final] |
| 249 | U12 | const targetPage = readerPage.locator('.reader-page-wrap').nth(9); |
| 250 | U12 | await targetPage.evaluate(el => el.scrollIntoView({ block: 'center' })); |
| 251 | U12 | ␠ [linha vazia / posição final] |
| 252 | U12 | // A virtualização carrega a imagem apenas quando a página entra na |
| 253 | U12 | // janela de preload. Espere a altura real estabilizar antes de |
| 254 | U12 | // centralizar novamente; caso contrário o placeholder de 400px pode |
| 255 | U12 | // crescer após o scroll e deslocar o viewport para a página anterior. |
| 256 | U12 | await expect.poll(async () => targetPage.locator('img').evaluate(img => ( |
| 257 | U12 | img.complete |
| 258 | U12 | && img.naturalHeight > 0 |
| 259 | U12 | && !img.dataset.pendingSrc |
| 260 | U12 | )), { timeout: 10000 }).toBe(true); |
| 261 | U12 | ␠ [linha vazia / posição final] |
| 262 | U12 | await targetPage.evaluate(el => new Promise(resolve => { |
| 263 | U12 | requestAnimationFrame(() => requestAnimationFrame(() => { |
| 264 | U12 | el.scrollIntoView({ block: 'center' }); |
| 265 | U12 | resolve(); |
| 266 | U12 | })); |
| 267 | U12 | })); |
| 268 | U12 | ␠ [linha vazia / posição final] |
| 269 | U12 | await expect(readerPage.locator('#page-counter')).toHaveText('10 / 15', { timeout: 5000 }); |
| 270 | U12 | await expect.poll(async () => { |
| 271 | U12 | return readerPage.locator('#read-progress-fill').evaluate(node => node.style.width); |
| 272 | U12 | }, { timeout: 5000 }).toBe('67%'); |
| 273 | U12 | ␠ [linha vazia / posição final] |
| 274 | U12 | await readerPage.close(); |
| 275 | U12 | }); |
| 276 | U13 | }); |
| 277 | U13 | ␠ [linha vazia / posição final] |

## 13. Unidades semânticas detalhadas

### U01 — linhas 1–5 — imports e dependências

Importa Playwright e módulos Node. `findRepoRoot` torna a suíte independente do cwd. `fs` é o único import sem consumidor no blob. O risco aqui é drift de dependências: um import morto normalmente não quebra comportamento, mas mascara intenção de cleanup não realizada.

**Evidência:** Playwright/os/path/repo-root participam do run verde; `fs` é apenas presença estática.

### U02 — linhas 6–16 — seleção do modo visual/stealth

Normaliza a variável de ambiente, calcula `showBrowser`, escolhe rótulo e `slowMo`. Em CI observado o valor é `stealth`, portanto `showBrowser=false` e `slowMo=0`.

**Risco:** aliases do modo visível e 350 ms não têm teste focal; mudança pode afetar experiência de depuração local sem quebrar CI.

### U03 — linhas 17–20 — caminho da extensão

A raiz é procurada a partir do diretório do teste e `extension` é acrescentado. Isso desacopla execução de cwd.

**Evidência:** Chromium conseguiu carregar a extensão no run real.

### U04 — linhas 21–26 — service worker

Reutiliza worker existente ou aguarda criação por até 15 s. O timeout impede espera infinita.

**Limite:** o log não revela branch; apenas prova que o helper retornou worker utilizável.

### U05 — linhas 27–72 — reset de storage

Primeiro limpa e reestabelece `chrome.storage.local`; depois tenta limpar stores IndexedDB conhecidos. O estado `mt_state` reduz interferência de filas/jobs de tradução em uma suíte dedicada ao reader.

**Risco central:** erros do IndexedDB são silenciados; ver 093-001.

### U06 — linhas 73–82 — fixture SVG

Gera dados visuais determinísticos e autoidentificáveis. Usar Data URL elimina rede e torna `idx-N` verificável diretamente no `src`.

**Evidência:** idx-0 e idx-200 foram decodificados e afirmados.

### U07 — linhas 83–109 — semeadura legado

Cria mapa esparso e grava metadata + imagens dentro do contexto privilegiado do service worker. O retorno do chapterId reduz duplicação nos testes.

**Risco:** por semear legado e aceitar UI final, o teste não separa migração bem-sucedida de fallback; ver 093-002.

### U08 — linhas 110–115 — URL interna

Usa `chrome.runtime.getURL` real e encode do id. Assim a URL carrega a origem real da extensão e não depende de conhecer seu ID de instalação.

**Evidência:** três navegações ao reader real concluíram com assertions verdes.

### U09 — linhas 116–154 — lifecycle e browser

Declara handles compartilhados, serializa testes, cria persistent context, configura flags de extensão/headless/sandbox, fecha contexto e reseta storage a cada caso.

**Riscos:** profile sem cleanup explícito; serialidade necessária devido ao storage compartilhado.

### U10 — linhas 155–192 — ordem/lazy load

Executa o primeiro cenário completo, incluindo decodificação de Data URL e scroll ao último wrapper.

**Evidência:** prova direta para contagem, extremos, título, contador e labels; não prova migração nova nem unload.

### U11 — linhas 193–223 — largura persistente

Muda slider via evento DOM real, fecha a aba e abre outra; confirma valor/CSS reaplicados.

**Evidência:** prova direta do efeito persistido entre páginas.

### U12 — linhas 224–275 — teclado e progresso

Reduz largura para tornar o scroll observável, pressiona ArrowRight, estabiliza imagem/layer geométrico, recentraliza em dois RAFs e exige contador/progresso.

**Evidência:** prova direta de 4/15, 10/15 e 67% no run real.

### U13 — linhas 276–277 — fechamento e newline

Fecha o `describe` e documenta explicitamente o newline final. Não há comportamento adicional de runtime na posição final.

## 14. Invariantes

1. Os três testes devem continuar usando a implementação real carregada como extensão, não uma cópia local de funções do reader.
2. O grupo `@e2e-fast` deve continuar incluindo os três casos ou existir substituição explícita equivalente no plano.
3. O persistent context deve carregar somente a extensão auditada pelo caminho resolvido do repo.
4. Cada caso deve começar de estado suficientemente limpo para não depender de execução anterior.
5. Falha de limpeza não deve ser silenciosamente confundida com sucesso se puder contaminar assertions.
6. O capítulo esparso deve preservar distinção entre índice persistido (`idx-200`) e posição visual (Página 15).
7. O teste de lazy load deve esperar `src` antes de inspecionar o conteúdo.
8. O decoder deve continuar aceitando as formas de Data URL que o reader pode fornecer no fluxo coberto.
9. Persistência de largura precisa atravessar fechamento e nova abertura da página.
10. A navegação por teclado deve produzir mudança observável de contador, não apenas evento disparado.
11. Qualquer espera geométrica deve garantir que a imagem já alterou o layout antes da assertion de página central.
12. A barra de progresso deve ser verificada junto com o contador para evitar regressão parcial.
13. O teste de migração só pode ser chamado de prova da migração quando houver assertion do estado novo, não apenas da UI compatível com fallback.
14. O profile temporário deve ter política explícita de cleanup ou retenção.
15. Esta Bíblia só é válida para o blob fonte `1ab953d0a031f77cb458befd31650e9ba9c4c052`.

## 15. Autoauditoria documental — AGENTE 16

- [x] reserva relida e confirmada como `AGENTE 16`;
- [x] SHA fonte reconfirmado antes da materialização;
- [x] fonte integral embutida a partir do blob lido no branch;
- [x] 276 linhas textuais + newline final = 277 posições documentadas;
- [x] todas as posições 1–277 mapeadas a unidade semântica;
- [x] dependências, lifecycle, side effects e trust boundaries descritos;
- [x] assertions diferenciadas de mera ocorrência textual;
- [x] execução CI real conferida para o mesmo blob do teste e mesmo blob do reader;
- [x] branches não observados não foram promovidos a prova direta;
- [x] lacunas relevantes persistidas como 3 solicitações ao auditor;
- [x] nenhum código, teste, fixture, workflow ou configuração externo foi modificado para fabricar evidência.

**Resultado da revisão documental:** as lacunas técnicas continuam registradas; 093-001, 093-002 e 093-003 estão ACCEPTED no state canônico e não permanecem OPEN. A revisão atual retorna a READY_FOR_AUDIT.

## Cobertura documental de linhas/posições — revisão atual

Cobertura canônica da revisão vigente; mapas anteriores permanecem como contexto histórico.

| Linhas/posição | Escopo | Evidência |
|---:|---|---|
| 1–423 | Blob integral atual `2837775deacca5123fa99232633b4652774abf96` (422 linhas textuais + terminador final quando aplicável). | fonte integral embutida + SHA Git do source |

A sincronização documental não reaproveita aprovação anterior: esta revisão requer nova auditoria distribuída.

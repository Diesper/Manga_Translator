# Bíblia técnica — tests/e2e/translation-flow.spec.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA TÉCNICA APROVADA  
> **SHA auditado:** db1da42c48ff795c41c7103cd5778e5a5d98e878  
> **Agente responsável:** AGENTE 2  
> **Tipo:** Playwright E2E / extensão Chromium Manifest V3 / regressões de tradução  
> **Linhas textuais:** **904**  
> **Posições documentais:** **905**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/e2e/translation-flow.spec.js` é o principal E2E de fluxo completo da tradução. Em vez de testar funções isoladas, ele carrega a extensão unpacked em um Chromium persistente, executa os content scripts reais sobre fixtures HTTP locais, usa o Service Worker MV3 real para storage/tabs/scheduler e usa o Gemini mock para controlar attachment, geração, DOM de resultado, exclusão e falhas.

O fluxo observado pelo teste é:

`manga fixture`
→ content scripts de `content_manga.js`
→ START_BATCH / scheduler no background MV3
→ aba Gemini mock
→ módulos `content/gemini/*` + `content_gemini.js`
→ resultado mock
→ background converte/entrega imagem
→ content_manga substitui a página
→ DOM final usa `data:image/png;base64,...`
→ state/logs confirmam drenagem, ownership e ordem.

A suite não substitui o runtime por stubs internos. As simulações ficam na **fronteira externa**: páginas HTTP/DOM e respostas Gemini são controladas pelo servidor de fixture, enquanto a extensão, service worker, storage, tabs, IPC e content scripts são reais.

## 2. Inventário executável

O arquivo declara **9 blocos sintáticos `test(...)`**, mas loops parametrizados produzem **14 casos Playwright**:

| Família | Casos gerados | Tag | Propriedade principal |
|---|---:|---|---|
| fluxo completo 2 páginas | 1 | `@e2e-medium-b` | tradução real, filtro de imagens e drenagem |
| attachment gate nos 3 modos | 3 | `@e2e-attachment` | anexo não confirmado bloqueia prompt/submit |
| FIFO A→G | 1 | `@e2e-fifo` | sete batches preservam fila/ownership/resultados |
| execução minimized/background-delete | 2 | `@e2e-medium-b` / `@e2e-medium-a` | fluxo sem ghost mousemove + DELETE_OK |
| resposta imediata | 1 | `@e2e-fast` | observer não perde resultado no mesmo task lógico |
| shadow DOM / wrapper assistant | 1 | `@e2e-fast` | resultado atual é aceito sem intervenção |
| submit ignorado | 1 | `@e2e-medium-a` | falha antes da espera longa e libera lote |
| ownership nos 3 modos | 3 | `@e2e-fast` | clone/orphan rejeitados; model turn aceito |
| aba Gemini manual | 1 | `@e2e-fast` | zero automação/keepalive; DOM intacto |

Contribuição deste arquivo ao plano global:

- `@e2e-fifo`: **1**
- `@e2e-attachment`: **3**
- `@e2e-medium-a`: **2**
- `@e2e-medium-b`: **2**
- `@e2e-fast`: **6**
- total deste spec: **14**

O plano global atual protege 21 E2E distribuídos como 1/3/4/4/9; portanto os sete casos restantes pertencem aos outros specs. `verify-e2e-shard-plan.js` executa `playwright --list` e também `--grep <tag>`, exigindo que cada grupo tenha exatamente o `expectedTests` configurado.

## 3. Harness e isolamento

### Persistent context por teste

Cada caso recebe um `userDataDir` exclusivo sob `os.tmpdir()`, formado por timestamp + sufixo aleatório. O Chromium é lançado via `launchPersistentContext` com apenas a Manga Translator habilitada/carregada. Isso dá ao teste:

- Service Worker MV3 real;
- `chrome.storage.local` real;
- `chrome.tabs` e messaging reais;
- profiles independentes entre workers paralelos;
- content scripts injetados pelo manifest real.

`test.describe.configure({mode:'parallel'})` é compatível com esse desenho porque o estado da extensão não é compartilhado entre profiles.

### Modo stealth/show

`MANGA_E2E_BROWSER_MODE` aceita `show|visible|headed|ui` como modo visível. Fora desses aliases, cai em `stealth`; o código mantém `headless:false` na opção Playwright e adiciona `--headless=new` diretamente aos argumentos Chromium. Esse detalhe é deliberado no harness atual e não deve ser simplificado sem revalidar carregamento de extensão.

### Service Worker MV3

`getBackgroundWorker()` lida com três situações:

1. worker já residente;
2. primeiro worker ainda não observado — aguarda evento;
3. extensionId conhecido, mas worker suspenso — abre popup, envia `GET_TAB_ID`, espera reativação e fecha a página auxiliar.

Esse caminho evita depender de movimento de mouse/foco físico para manter o background vivo.

## 4. Reset e observabilidade de estado

`resetExtensionState()` limpa `chrome.storage.local` e grava baseline determinístico. Entre os defaults importantes:

- `enabledDomains: ['localhost']`;
- `maxConcurrentJobs: 1`;
- `geminiExecutionMode: 'temp_chat'`;
- Gemini local em `127.0.0.1:3999`;
- logs/listas vazios;
- scheduler zerado em `mt_state`.

Os cenários podem aplicar overrides sem reimplementar o baseline.

`readStorage()` consulta estado pelo Service Worker, preservando a boundary de APIs Chrome. As assertions usam principalmente `mt_state` e `translatorLog`.

## 5. Fixture de mangá

`tests/fixtures/manga-page.html` fornece quatro imagens relevantes:

- duas páginas 800×1200, testids `manga-image-0` e `manga-image-1`, elegíveis;
- avatar 48×48, inelegível;
- banner 960×120, inelegível pela geometria.

O primeiro cenário prova simultaneamente:

- botão/controle aparece;
- as duas páginas estão visíveis;
- exatamente as páginas elegíveis recebem `data-translated=true`;
- seus `src` viram Data URL PNG;
- cada resultado difere do original e do outro resultado;
- avatar/banner continuam originais e sem marca de tradução;
- scheduler termina sem jobs ativos/fila;
- UI volta a indicar `TRADUZIR 2`.

A assertion de Data URL é importante: o resultado mock é servido como PNG HTTP, mas o runtime real converte e entrega Base64 ao mangá. Portanto esperar `translated_result.png` diretamente no DOM seria testar o contrato errado.

## 6. Gemini mock e controles determinísticos

O servidor `tests/fixtures/gemini-mock-server.js` aceita flags que este spec usa para criar regressões precisas:

- `attachmentFails=1`: nunca confirma anexo;
- `attachmentBarrierId=...`: bloqueia o primeiro attachment numa barreira HTTP;
- `generationDelayMs=0` / `resultImageDelayMs=0`: remove latência artificial;
- `fastResult=1`: resultado aparece no mesmo task lógico do submit;
- `shadowResult=1`: imagem gerada fica em shadow root aberto;
- `relaxedResultContainer=1`: usa wrapper assistant alternativo;
- `ignoreSubmit=1`: o mock ignora o submit;
- `cloneInputIntoUserTurn=1`: injeta clone no user turn;
- `orphanImageBeforeResult=1`: injeta IMG grande sem owner model.

A barreira FIFO usa endpoints `/__test/attachment-barrier/<id>/{arrive,status,release}`. Isso substitui um sleep arbitrário por sincronização causal: A precisa alcançar e permanecer na barreira antes de B–G serem enfileirados.

## 7. Cenário principal — fluxo completo

O primeiro caso é uma prova end-to-end forte porque suas assertions cobrem saída visível e estado interno durável.

**Provas diretas:**

- trigger visível;
- texto de tradução presente;
- ambas páginas originais simultaneamente no viewport;
- duas imagens traduzidas;
- `data-translated=true` em ambas;
- `src` final Base64 PNG;
- resultados diferem dos originais e entre si;
- avatar/banner não são traduzidos;
- `completedJobs=2`;
- `activeJobsCount=0`;
- `isProcessing=false`;
- `stopRequested=false`;
- `jobQueue.length=0`;
- UI final mostra `TRADUZIR 2`.

A prova não compara pixels exatos dos resultados com fixtures esperadas; ela valida identidade/distinção/formato e o fluxo de entrega.

## 8. Attachment gate nos três modos

Para `temp_chat`, `minimized_window` e `background_delete`, o mock recusa attachment e o teste exige:

- `GEMINI_ATTACHMENT_NOT_CONFIRMED`;
- presença de `ATTACHMENT_STARTED`, `ATTACHMENT_REJECTED`, `SUBMIT_BLOCKED_ATTACHMENT`;
- ausência de `ATTACHMENT_CONFIRMED`;
- ordem estrita STARTED → REJECTED → BLOCKED;
- ausência de `GEMINI_SUBMIT_ATTEMPT`;
- ausência de `PROMPT_INJECTED`;
- zero imagens traduzidas.

Em `minimized_window` há prova adicional de que o fallback não fecha a janela/tab que contém o mangá.

Isso é uma prova de segurança negativa relevante: não basta observar uma falha de attachment; o teste prova que **nenhum submit/prompt é emitido depois da falha**.

## 9. FIFO A→G

O cenário FIFO cria sete tabs independentes, cada uma com uma única página elegível.

Sequência probatória:

1. inicia A e espera que A se torne batch ativo;
2. espera A parar na barreira de attachment;
3. inicia B–G um por um;
4. após cada start, espera a posição FIFO exata aparecer em `pendingBatches`;
5. captura todos os batchIds;
6. prova current A + pending B–G, inclusive `mangaTabId`;
7. libera a barreira;
8. espera uma tradução em cada tab A–G;
9. espera a fila drenar;
10. valida logs de queue positions 1–6;
11. valida ordem de `BATCH_PROMOTED` B–G;
12. valida `BATCH_DONE` A–G;
13. prova ausência de mismatch/stale/foreign accounting.

O estado final mantém `currentBatchId` igual ao último batch concluído, enquanto `completedJobs/totalJobs` são 1/1 porque o snapshot exposto é do batch corrente/final, não acumulador dos sete batches. A Bíblia não interpreta esses contadores como “sete jobs globais”.

## 10. Modos minimized/background-delete

Os dois casos parametrizados reduzem a fixture a uma página elegível e provam:

- tradução final;
- `activeJobsCount=0`;
- `isProcessing=false`;
- fila vazia;
- log `BATCH_DONE`;
- log `DELETE_OK`.

O objetivo aqui não é concorrência; é provar que esses modos concluem sem depender de “ghost mousemove”/foco físico e realizam cleanup de conversa.

## 11. Resposta rápida

`fastResult=1` faz o mock criar a imagem no mesmo task lógico do submit. O teste prova uma imagem traduzida e estado final `completedJobs=1`, zero jobs ativos e `jobIndex=[]`.

A regressão protegida é temporal: se o observer fosse instalado apenas depois do click/submit, o resultado poderia nascer antes da observação e ser perdido.

## 12. Shadow DOM / wrapper assistant

Com `shadowResult=1&relaxedResultContainer=1`, o resultado legítimo fica dentro de shadow DOM e de um container assistant alternativo.

O teste exige:

- uma imagem traduzida;
- `GEMINI_RESULT_ACCEPTED` com `reason='new_model_turn'`;
- ausência de `GEMINI_MANUAL_INTERVENTION_REQUIRED`.

Assim, a prova não é somente “algo apareceu”: ela verifica a decisão semântica registrada pelo extractor.

## 13. Submit ignorado

Com `ignoreSubmit=1`, o mock deixa o editor sem geração. O teste mede o tempo desde o click e exige `GEMINI_SUBMISSION_NOT_CONFIRMED` em menos de 35 s, depois estado drenado e zero imagens traduzidas.

A propriedade protegida é evitar cair na antiga espera longa de geração (~4 min) quando o submit nem chegou a ser confirmado.

## 14. Ownership do resultado

Nos três modos, o mock insere antes do resultado real:

- clone da imagem do input dentro de user turn;
- IMG grande órfã, sem owner model.

O teste só considera sucesso depois que o mangá recebe uma tradução real e exige logs:

- rejeição `user_turn`;
- rejeição `missing_model_owner`;
- aceite `new_model_turn`.

Isso prova que “imagem nova/grande” isoladamente não basta; ownership/turn semântico participa da decisão.

## 15. Aba Gemini manual inerte

O cenário abre diretamente uma aba Gemini mock sem job. Antes disso, instrumenta conexões runtime de nome `gemini-keep-alive`.

Após 1,5 s, prova:

- status ainda “Aguardando entrada”;
- nenhum attachment;
- prompt vazio;
- result-zone vazio;
- contador de keepalive continua zero;
- log contém `JOB_NOT_FOUND`.

A prova de ausência é bounded no E2E (1,5 s). O projeto também possui testes unitários do bootstrap/keepalive; portanto este cenário funciona como validação de integração do manifest/content script com a aba manual, não como única prova temporal de toda a política.

## 16. Integração com shards/CI

`.github/workflows/ci.yml` executa cinco jobs de shard com matriz:

`fifo, attachment, medium-a, medium-b, fast`

Cada grupo chama `npm run test:e2e:group -- <grupo>`, que delega a `scripts/ci/run-e2e-group.js`. O runner usa `--grep <tag>`, define `MANGA_E2E_SHARD=1` e aplica workers específicos do plano.

Depois, o job agregado baixa exatamente cinco blob reports, exige contagem exata de cinco zips e executa `playwright merge-reports` com o reporter global de gate.

`verify-e2e-shard-plan.js` é um gate adicional que enumera o Playwright com `--list`, garante grupos/tags únicos, compara número real de testes por tag com `expectedTests` e protege a cobertura do plano.

## 17. Regressões registradas na matriz

A regression-matrix atual aponta diretamente para este spec em cinco contratos:

1. `REG-E2E-FIFO-MULTIBATCH` — A→G não pode misturar state/result stale nem quebrar FIFO.
2. `REG-E2E-MODES-NO-GHOST` — minimized/background-delete não dependem de ghost mousemove/foco.
3. `REG-E2E-ATTACHMENT-GATE` — prompt não pode ser enviado sem attachment confirmado.
4. `REG-E2E-RESULT-OWNERSHIP` — clone de input/IMG órfã não podem ser confundidos com output do modelo.
5. `REG-E2E-MANUAL-INERT` — aba Gemini manual não pode iniciar automação/keepalive sem job.

`verify-ci-contract.js` verifica existência do arquivo e presença textual dos markers declarados. Isso é **🟦 gate estático específico de regressão**. A prova comportamental continua sendo a execução Playwright e suas assertions.

## 18. Classificação de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| fluxo real manga → background → Gemini → manga | persistent Chromium + extensão unpacked + mock HTTP | ✅ PROVADO DIRETAMENTE E2E |
| filtro de páginas vs avatar/banner | assertions de src/atributo nos quatro alvos | ✅ PROVADO DIRETAMENTE |
| Data URL final | matcher de `src` nas duas páginas | ✅ PROVADO DIRETAMENTE |
| lote principal drenado | poll de `mt_state` exato | ✅ PROVADO DIRETAMENTE |
| attachment bloqueia prompt/submit | logs positivos/negativos + zero tradução nos 3 modos | ✅ PROVADO DIRETAMENTE |
| FIFO A→G | state + barrier + 7 resultados + logs ordenados | ✅ PROVADO DIRETAMENTE |
| ausência de stale/cross-batch | lista negativa de actions | ✅ PROVADO DIRETAMENTE |
| minimized/background-delete sem ghost | tradução + state + DELETE_OK | ✅ PROVADO DIRETAMENTE |
| resposta instantânea não perdida | fastResult + tradução + state final | ✅ PROVADO DIRETAMENTE |
| shadow DOM/assistant wrapper | tradução + reason new_model_turn + sem manual intervention | ✅ PROVADO DIRETAMENTE |
| submit ignorado falha cedo | log + elapsed <35s + state + zero tradução | ✅ PROVADO DIRETAMENTE |
| ownership de resultado nos 3 modos | reasons de reject/accept | ✅ PROVADO DIRETAMENTE |
| aba manual inerte | DOM + keepalive=0 + JOB_NOT_FOUND | ✅ PROVADO DIRETAMENTE no intervalo observado |
| grupos/tags e contagens globais | verify-e2e-shard-plan | 🟦 GATE ESTÁTICO/DESCOBERTA ESPECÍFICA |
| markers de cinco regressões | regression-matrix + verify-ci-contract | 🟦 GATE ESTÁTICO ESPECÍFICO |
| caminho de wake de SW por popup | helper existe e pode ser usado conforme lifecycle; não é forçado deterministicamente | 🟨 EXECUTADO CONDICIONALMENTE |
| erro de chrome.storage no reset/read | nenhuma injeção/assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| remoção física de user-data-dir | não existe no arquivo | ⚠️ SEM PROVA / CLEANUP AUSENTE EXPLICITAMENTE |

## 19. Riscos, lacunas e observações

### 19.1 Profiles temporários sem remoção explícita

O harness cria `pw-manga-* ` dentro de `os.tmpdir()`, mas guarda somente `browserContext`, não o caminho, e o `afterEach` fecha o contexto sem chamar `fs.rm`/equivalente. O import `fs` está atualmente sem uso.

A Bíblia não presume que Playwright necessariamente deixe ou apague esses diretórios em toda plataforma; o achado objetivo é: **não existe cleanup explícito no spec**. Deve-se verificar o comportamento real do launcher e decidir se remoção explícita é necessária.

### 19.2 Falha de storage do harness não é propagada explicitamente

`resetExtensionState` e `readStorage` usam callbacks de `chrome.storage.local` sem checar `chrome.runtime.lastError`. Em erro de storage, o setup pode resolver e só falhar posteriormente por timeout/assertion secundária, piorando diagnóstico.

### 19.3 Comentário “divisão 11/10”

O comentário antes de `regressionScenarios` menciona “equilibra a divisão 11/10 feita pelo Playwright”. O estado atual usa plano explícito de cinco tags/shards (1/3/4/4/9). O comentário é histórico e não descreve o mecanismo de distribuição atual; não afeta runtime.

### 19.4 Prova negativa manual é temporalmente limitada

O cenário manual espera 1,5 s antes de provar ausência de automação/keepalive. Isso é adequado como integração curta, mas não prova matematicamente ausência para qualquer atraso arbitrário. Testes unitários de bootstrap/keepalive fornecem a prova comportamental mais focal da política.

### 19.5 Resultado não é comparado pixel a pixel

O fluxo principal verifica Base64, mudança em relação aos originais e distinção entre as duas saídas, mas não calcula hash/pixels contra a fixture traduzida esperada. Isso é suficiente para contrato de entrega/roteamento atual, mas não é prova de conteúdo visual exato.

## 20. Solicitações ao auditor

### 094-001 — CLEANUP_REVIEW — OPEN

**Arquivo alvo:** `tests/e2e/translation-flow.spec.js`

**Achado:** cada teste cria um `userDataDir` único sob `os.tmpdir()`; o caminho não é retido fora do `beforeEach` e o `afterEach` fecha apenas o BrowserContext. Não existe `fs.rm`/cleanup explícito, e o import `fs` está sem uso.

**Evidência atual:** inspeção integral das 904 linhas; únicas referências a `fs` são o import, e não há `rmSync`, `rm`, `rmdir` ou cleanup do caminho.

**Evidência ausente:** confirmação multiplataforma de que o Playwright/Chromium remove sempre o diretório fornecido a `launchPersistentContext` ou teste/checagem de que profiles não acumulam.

**Por que importa:** execução repetida/local ou CI de longa duração pode deixar profiles temporários e consumir disco, caso o launcher não os remova.

**Ação solicitada:** verificar comportamento real em Windows/Linux; se os diretórios persistirem, adicionar cleanup robusto em alteração separada, preservando artefatos necessários em caso de falha.

**Regressão possível:** acúmulo de diretórios `pw-manga-*` e pressão de disco.

**Severidade:** NORMAL.

### 094-002 — HARNESS_ROBUSTNESS — OPEN

**Arquivo alvo:** `tests/e2e/translation-flow.spec.js`

**Achado:** `resetExtensionState` resolve após `chrome.storage.local.clear/set` sem verificar `chrome.runtime.lastError`; `readStorage` também resolve diretamente o resultado de `get`.

**Evidência atual:** inspeção direta dos helpers; em contraste, o helper FIFO de `chrome.tabs.sendMessage` trata explicitamente `chrome.runtime.lastError`.

**Evidência ausente:** teste com falha injetada de storage e assertion de que o harness aborta com erro causal, em vez de prosseguir para timeout/assertion secundária.

**Por que importa:** erro de preparação pode aparecer como falha funcional do produto, dificultando triagem de flakiness/infra.

**Ação solicitada:** avaliar tratamento explícito de `runtime.lastError` em clear/set/get e adicionar prova focal do comportamento decidido em mudança separada.

**Regressão possível:** falso diagnóstico e timeout longo quando storage de teste falha.

**Severidade:** NORMAL.

## 21. Invariantes

1. Cada teste deve continuar usando profile isolado.
2. A extensão deve continuar sendo carregada unpacked pelo manifest real.
3. O Service Worker deve ser reacquirível após suspensão MV3.
4. O storage deve ser resetado antes de cada caso.
5. O mock deve permanecer na fronteira externa; não substituir internals da extensão.
6. O fluxo principal deve provar Data URL final, não nome de arquivo do mock.
7. Avatar/banner não podem ser traduzidos pela detecção de páginas.
8. Attachment não confirmado nunca pode avançar para prompt/submit.
9. O gate de attachment deve continuar coberto nos três modos.
10. FIFO A→G deve ser sincronizado por evento/barreira, não sleep arbitrário.
11. B–G só são iniciados após A ser comprovadamente ativo/bloqueado.
12. Queue positions devem permanecer 1–6.
13. Promoções devem respeitar B→G e conclusões A→G.
14. Nenhum lote posterior pode invalidar resultado de anterior.
15. Mismatches/stale/foreign accounting continuam proibidos.
16. minimized/background-delete não podem depender de input físico fantasma.
17. Os modos que apagam conversa devem registrar cleanup seguro.
18. Resultado instantâneo deve ser capturado.
19. Resultado válido em shadow DOM/assistant wrapper deve ser aceito automaticamente.
20. Submit não confirmado deve falhar antes da janela longa de geração.
21. Clone de user turn e IMG órfã não podem ganhar ownership de resultado.
22. `new_model_turn` legítimo deve ser aceito.
23. Aba Gemini manual sem job não deve abrir keepalive nem alterar DOM.
24. Tags devem permanecer coerentes com o plano de shards.
25. O conjunto global deve continuar passando pelo gate agregado de 21 E2E, 0 skipped e 0 flaky.
26. Alterações de mocks que enfraqueçam os cenários precisam ser tratadas como alteração do contrato de teste.
27. O SHA desta Bíblia só é válido enquanto o fonte for `db1da42c48ff795c41c7103cd5778e5a5d98e878`.

## 22. Fonte integral

~~~javascript
/**
 * translation-flow.spec.js
 *
 * E2E real do fluxo MV3:
 * - content_manga.js seleciona imagens validas e dispara START_BATCH
 * - background.js orquestra a fila e abre abas do Gemini
 * - content_gemini.js roda na aba mockada do Gemini e devolve a imagem traduzida
 * - content_manga.js substitui o DOM com data:image/... e conclui o lote
 *
 * Observacao importante:
 * A assercao final verifica `data:image/...` no mangá, nao `translated_result.png`.
 * Isso reflete o comportamento real da extensao: o background converte a imagem
 * gerada em base64 antes de enviar `UPDATE_IMAGE` para a aba do mangá.
 */

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

let extensionId = null;

function rememberExtensionId(worker) {
    if (!worker) return worker;
    try {
        const parsed = new URL(worker.url());
        if (parsed.protocol === 'chrome-extension:' && parsed.hostname) {
            extensionId = parsed.hostname;
        }
    } catch (_error) {}
    return worker;
}

async function getBackgroundWorker(context) {
    const existingWorker = context.serviceWorkers()[0];
    if (existingWorker) return rememberExtensionId(existingWorker);

    if (!extensionId) {
        return rememberExtensionId(
            await context.waitForEvent('serviceworker', { timeout: 15000 })
        );
    }

    let wakePage = null;
    try {
        const workerPromise = context.waitForEvent('serviceworker', { timeout: 15000 })
            .catch(() => null);
        wakePage = await context.newPage();
        await wakePage.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
        });
        await wakePage.evaluate(() => new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'GET_TAB_ID' }, () => resolve());
        }));

        const worker = context.serviceWorkers()[0] || await workerPromise;
        if (!worker) throw new Error('Service Worker MV3 não acordou após mensagem da extensão');
        return rememberExtensionId(worker);
    } finally {
        if (wakePage) await wakePage.close().catch(() => {});
    }
}

async function resetExtensionState(backgroundWorker, overrides = {}) {
    await backgroundWorker.evaluate((stateOverrides) => {
        return new Promise(resolve => {
            chrome.storage.local.clear(() => {
                chrome.storage.local.set({
                    enabledDomains: ['localhost'],
                    debugMode: false,
                    maxConcurrentJobs: 1,
                    geminiBaseUrl: 'http://127.0.0.1:3999/gemini/',
                    geminiExecutionMode: 'temp_chat',
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
                    ...(stateOverrides || {}),
                }, resolve);
            });
        });
    }, overrides);
}

async function readStorage(backgroundWorker, keys) {
    return backgroundWorker.evaluate(async requestedKeys => {
        return new Promise(resolve => chrome.storage.local.get(requestedKeys, resolve));
    }, keys);
}

async function areBothOriginalPagesVisible(page) {
    return page.evaluate(() => {
        const targets = [
            document.querySelector('[data-testid="manga-image-0"]'),
            document.querySelector('[data-testid="manga-image-1"]'),
        ];

        return targets.every(img => {
            if (!img) return false;
            const rect = img.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= window.innerHeight;
        });
    });
}

let browserContext;
let backgroundWorker;

test.describe('E2E-01/E2E-02/E2E-03/E2E-04/E2E-05/E2E-06/E2E-07/E2E-08/E2E-09/E2E-10/E2E-11/E2E-12/E2E-13/E2E-14/E2E-15/E2E-15b/E2E-16/E2E-16b/E2E-17/E2E-18: Automacao UI: Fluxo de Traducao em Massa (E2E)', () => {
    // Cada teste cria um persistent context/profile exclusivo no beforeEach.
    // Pode ser distribuído entre workers/shards sem compartilhar storage/SW.
    test.describe.configure({ mode: 'parallel' });
    test.beforeEach(async () => {
        const pathToExtension = getExtensionPath(__dirname);
        const userDataDir = path.join(
            os.tmpdir(),
            `pw-manga-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        const browserMode = getBrowserModeConfig();
        const launchArgs = [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ];

        if (!browserMode.showBrowser) launchArgs.unshift('--headless=new');

        console.log(`[E2E] Browser mode: ${browserMode.mode}`);

        browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            slowMo: browserMode.slowMo,
            args: launchArgs,
        });

        backgroundWorker = await getBackgroundWorker(browserContext);
        await resetExtensionState(backgroundWorker);
    });

    test.afterEach(async () => {
        if (browserContext) {
            await browserContext.close();
            browserContext = null;
            backgroundWorker = null;
        }
    });

    test('Deve traduzir as paginas validas de ponta a ponta e encerrar o lote corretamente', { tag: '@e2e-medium-b' }, async () => {
        const page = await browserContext.newPage();

        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.waitForFunction(() => {
            const pageImages = Array.from(document.querySelectorAll('img')).filter(img =>
                img.src && img.src.includes('page_')
            );

            return pageImages.length >= 2 &&
                pageImages.every(img => img.naturalWidth >= 300 && img.naturalHeight >= 400);
        }, { timeout: 15000 });

        const triggerBtn = page.locator('#manga-translator-trigger');
        const mainContent = page.locator('#manga-main-content');
        const pageOne = page.getByTestId('manga-image-0');
        const pageTwo = page.getByTestId('manga-image-1');
        const avatar = page.getByTestId('small-image');
        const banner = page.getByTestId('banner-image');

        await expect(triggerBtn).toBeVisible({ timeout: 10000 });
        await expect(mainContent).toContainText('TRADUZIR P', { timeout: 10000 });
        await expect.poll(async () => areBothOriginalPagesVisible(page), {
            timeout: 10000,
            message: 'Esperava ver as duas paginas originais ao mesmo tempo no viewport',
        }).toBe(true);

        const pageOneSrcBefore = await pageOne.getAttribute('src');
        const pageTwoSrcBefore = await pageTwo.getAttribute('src');

        await mainContent.click();

        await expect.poll(async () => {
            return page.evaluate(() => {
                return Array.from(document.querySelectorAll('img[data-translated="true"]')).length;
            });
        }, {
            timeout: 45000,
            message: 'Esperava 2 imagens traduzidas no DOM do mangá',
        }).toBe(2);

        await expect(pageOne).toHaveAttribute('data-translated', 'true');
        await expect(pageTwo).toHaveAttribute('data-translated', 'true');
        await expect(pageOne).toHaveAttribute('src', /^data:image\/png;base64,/);
        await expect(pageTwo).toHaveAttribute('src', /^data:image\/png;base64,/);

        const pageOneSrcAfter = await pageOne.getAttribute('src');
        const pageTwoSrcAfter = await pageTwo.getAttribute('src');

        expect(pageOneSrcAfter).not.toBe(pageOneSrcBefore);
        expect(pageTwoSrcAfter).not.toBe(pageTwoSrcBefore);
        expect(pageOneSrcAfter).not.toBe(pageTwoSrcAfter);
        expect(await avatar.getAttribute('src')).toContain('/manga-images/avatar.png');
        expect(await banner.getAttribute('src')).toContain('/manga-images/banner.png');
        expect(await avatar.getAttribute('data-translated')).toBeNull();
        expect(await banner.getAttribute('data-translated')).toBeNull();

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};

            return {
                completedJobs: state.completedJobs || 0,
                activeJobsCount: state.activeJobsCount || 0,
                isProcessing: !!state.isProcessing,
                stopRequested: !!state.stopRequested,
                queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,
            };
        }, {
            timeout: 30000,
            message: 'Esperava fila vazia e lote finalizado no service worker',
        }).toEqual({
            completedJobs: 2,
            activeJobsCount: 0,
            isProcessing: false,
            stopRequested: false,
            queueLength: 0,
        });

        await expect(mainContent).toContainText('TRADUZIR 2', { timeout: 10000 });

        await page.close();
    });

    const regressionScenarios = [
        {
            mode: 'temp_chat',
            basePath: '/gemini/',
            label: 'conversa temporária',
        },
        {
            mode: 'minimized_window',
            basePath: '/gemini/',
            label: 'janela minimizada',
        },
        {
            mode: 'background_delete',
            basePath: '/app/mock-chat',
            label: 'background com exclusão segura',
        },
    ];

    // Registro intencional antes do FIFO: mantém exatamente os mesmos cenários
    // e assertions, mas equilibra a divisão 11/10 feita pelo Playwright.
    for (const scenario of regressionScenarios) {
        test(`REG attachment gate: ${scenario.label} nunca envia texto quando a imagem não confirma`, { tag: '@e2e-attachment' }, async () => {
            test.setTimeout(90000);

            const joiner = scenario.basePath.includes('?') ? '&' : '?';
            await resetExtensionState(backgroundWorker, {
                geminiExecutionMode: scenario.mode,
                geminiBaseUrl:
                    `http://127.0.0.1:3999${scenario.basePath}${joiner}attachmentFails=1`,
            });

            const page = await browserContext.newPage();
            await page.goto('http://localhost:3999/manga-page.html');
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => {
                document.querySelector('[data-testid="manga-image-1"]')?.remove();
            });

            const mainContent = page.locator('#manga-main-content');
            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
            await mainContent.click();

            await expect.poll(async () => {
                backgroundWorker = await getBackgroundWorker(browserContext);
                const storage = await readStorage(backgroundWorker, ['translatorLog']);
                const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
                return logs.some(entry =>
                    entry && entry.action === 'GEMINI_ATTACHMENT_NOT_CONFIRMED'
                );
            }, {
                timeout: 70000,
                message: `Esperava gate de attachment no modo ${scenario.mode}`,
            }).toBe(true);

            if (scenario.mode === 'minimized_window') {
                expect(
                    page.isClosed(),
                    'O fallback minimizado não pode fechar a janela que contém o mangá'
                ).toBe(false);
                await expect(page).toHaveURL('http://localhost:3999/manga-page.html');
                await expect(mainContent).toBeVisible();
            }

            const storage = await readStorage(backgroundWorker, ['translatorLog']);
            const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
            const attachmentActions = logs
                .filter(entry => entry && typeof entry.action === 'string')
                .map(entry => entry.action);

            expect(attachmentActions).toContain('ATTACHMENT_STARTED');
            expect(attachmentActions).toContain('ATTACHMENT_REJECTED');
            expect(attachmentActions).toContain('SUBMIT_BLOCKED_ATTACHMENT');
            expect(attachmentActions).not.toContain('ATTACHMENT_CONFIRMED');

            const startedAt = attachmentActions.indexOf('ATTACHMENT_STARTED');
            const rejectedAt = attachmentActions.indexOf('ATTACHMENT_REJECTED');
            const blockedAt = attachmentActions.indexOf('SUBMIT_BLOCKED_ATTACHMENT');
            expect(startedAt).toBeGreaterThanOrEqual(0);
            expect(rejectedAt).toBeGreaterThan(startedAt);
            expect(blockedAt).toBeGreaterThan(rejectedAt);

            expect(logs.some(entry => entry && entry.action === 'GEMINI_SUBMIT_ATTEMPT')).toBe(false);
            expect(logs.some(entry => entry && entry.action === 'PROMPT_INJECTED')).toBe(false);
            expect(await page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            )).toBe(0);

            await page.close();
        });
    }

    test('E2E FIFO N-lotes: A→B→C→D→E→F→G preserva resultados e ordem sem stale', { tag: '@e2e-fifo' }, async () => {
        test.setTimeout(180000);
        const barrierId = `fifo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const barrierBaseUrl =
            `http://127.0.0.1:3999/__test/attachment-barrier/${encodeURIComponent(barrierId)}`;
        await resetExtensionState(backgroundWorker, {
            maxConcurrentJobs: 1,
            geminiExecutionMode: 'temp_chat',
            // A primeira tentativa de attachment é bloqueada por uma barreira
            // explícita. O teste só a libera depois de provar que B-G entraram
            // na fila. Assim não existe mais dependência de um sleep de 2500 ms.
            // As latências artificiais de geração/download também são removidas
            // somente deste teste; os defaults permanecem nos demais E2E.
            geminiBaseUrl:
                `http://127.0.0.1:3999/gemini/?attachmentBarrierId=${encodeURIComponent(barrierId)}` +
                '&generationDelayMs=0&resultImageDelayMs=0',
        });

        const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const pages = [];

        for (const label of labels) {
            // eslint-disable-next-line no-await-in-loop
            const page = await browserContext.newPage();
            // eslint-disable-next-line no-await-in-loop
            await page.goto(`http://localhost:3999/manga-page.html?fifo=${label}`);
            // eslint-disable-next-line no-await-in-loop
            await page.waitForLoadState('networkidle');
            // eslint-disable-next-line no-await-in-loop
            await page.waitForFunction(() => {
                const image = document.querySelector('[data-testid="manga-image-0"]');
                return image && image.naturalWidth >= 300 && image.naturalHeight >= 400;
            }, { timeout: 15000 });
            // Cada aba representa um lote de uma única página.
            // eslint-disable-next-line no-await-in-loop
            await page.evaluate(() => {
                document.querySelector('[data-testid="manga-image-1"]')?.remove();
            });
            pages.push(page);
        }

        const tabIds = await backgroundWorker.evaluate(async labelsToFind => {
            return new Promise(resolve => {
                chrome.tabs.query({}, tabs => {
                    const result = {};
                    labelsToFind.forEach(label => {
                        const match = (tabs || []).find(tab =>
                            String(tab.url || '').includes(`manga-page.html?fifo=${label}`)
                        );
                        result[label] = match ? match.id : null;
                    });
                    resolve(result);
                });
            });
        }, labels);
        labels.forEach(label => expect(tabIds[label]).not.toBeNull());

        const startReaderBatch = async label => {
            return backgroundWorker.evaluate(async tabId => {
                return new Promise(resolve => {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'START_TRANSLATION_FROM_POPUP',
                        indices: [0],
                    }, response => {
                        const error = chrome.runtime.lastError;
                        resolve(error ? { ok: false, error: error.message } : (response || null));
                    });
                });
            }, tabIds[label]);
        };

        expect(await startReaderBatch('A')).toEqual(expect.objectContaining({ ok: true }));

        await expect.poll(async () => {
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return Boolean(
                state.currentBatchId &&
                state.activeMangaTabId === tabIds.A &&
                state.isProcessing
            );
        }, {
            timeout: 15000,
            message: 'Lote A deveria assumir o scheduler antes da fila B-G',
        }).toBe(true);

        await expect.poll(async () => {
            const response = await fetch(`${barrierBaseUrl}/status`);
            if (!response.ok) return false;
            const barrier = await response.json();
            return barrier.arrivals === 1 &&
                barrier.waiting === 1 &&
                barrier.released === false;
        }, {
            timeout: 15000,
            message: 'Lote A deveria alcançar a barreira de attachment antes de enfileirar B-G',
        }).toBe(true);

        let stateData = await readStorage(backgroundWorker, ['mt_state']);
        const batchIds = [stateData.mt_state.currentBatchId];

        for (let index = 1; index < labels.length; index++) {
            const label = labels[index];
            // eslint-disable-next-line no-await-in-loop
            expect(await startReaderBatch(label)).toEqual(expect.objectContaining({ ok: true }));

            // Aguarda este content script terminar hashing/seleção e efetivamente
            // registrar seu START_BATCH no fim da fila.
            // eslint-disable-next-line no-await-in-loop
            await expect.poll(async () => {
                const storage = await readStorage(backgroundWorker, ['mt_state']);
                const pending = storage.mt_state?.pendingBatches || [];
                return pending.length >= index &&
                    pending[index - 1]?.mangaTabId === tabIds[label];
            }, {
                timeout: 15000,
                message: `Lote ${label} deveria ocupar a posição FIFO ${index}`,
            }).toBe(true);

            // eslint-disable-next-line no-await-in-loop
            stateData = await readStorage(backgroundWorker, ['mt_state']);
            batchIds.push(stateData.mt_state.pendingBatches[index - 1].batchId);
        }

        stateData = await readStorage(backgroundWorker, ['mt_state']);
        expect(stateData.mt_state.currentBatchId).toBe(batchIds[0]);
        expect(stateData.mt_state.pendingBatches.map(batch => batch.batchId))
            .toEqual(batchIds.slice(1));
        expect(stateData.mt_state.pendingBatches.map(batch => batch.mangaTabId))
            .toEqual(labels.slice(1).map(label => tabIds[label]));

        const releaseResponse = await fetch(`${barrierBaseUrl}/release`, {
            method: 'POST',
        });
        expect(releaseResponse.ok).toBe(true);
        const releasedBarrier = await releaseResponse.json();
        expect(releasedBarrier).toEqual(expect.objectContaining({
            ok: true,
            arrivals: 1,
            waiting: 0,
            released: true,
        }));

        for (let index = 0; index < pages.length; index++) {
            // eslint-disable-next-line no-await-in-loop
            await expect.poll(async () => pages[index].evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            ), {
                timeout: 150000,
                message: `Lote ${labels[index]} deveria receber seu resultado sem ser invalidado pelos lotes seguintes`,
            }).toBe(1);
        }

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return {
                currentBatchId: state.currentBatchId || null,
                completedJobs: state.completedJobs || 0,
                totalJobs: state.totalJobs || 0,
                activeJobsCount: state.activeJobsCount || 0,
                isProcessing: !!state.isProcessing,
                queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,
                pendingIds: Array.isArray(state.pendingBatches)
                    ? state.pendingBatches.map(batch => batch.batchId)
                    : null,
                jobIndexLength: Array.isArray(state.jobIndex) ? state.jobIndex.length : -1,
            };
        }, {
            timeout: 150000,
            message: 'Todos os sete lotes deveriam drenar a fila FIFO completamente',
        }).toEqual({
            currentBatchId: batchIds[batchIds.length - 1],
            completedJobs: 1,
            totalJobs: 1,
            activeJobsCount: 0,
            isProcessing: false,
            queueLength: 0,
            pendingIds: [],
            jobIndexLength: 0,
        });

        const storage = await readStorage(backgroundWorker, ['translatorLog']);
        const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
        const schedulerLogs = logs.filter(entry => entry?.source === 'bg');
        const queuedLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_QUEUED');
        const promotedLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_PROMOTED');
        const doneLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_DONE');

        expect(queuedLogs.map(entry => entry.extra?.queuePosition)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(promotedLogs.map(entry => entry.extra?.batchId)).toEqual(
            batchIds.slice(1).map(id => id.slice(0, 8))
        );
        expect(doneLogs.map(entry => entry.extra?.batchId)).toEqual(
            batchIds.map(id => id.slice(0, 8))
        );
        expect(logs.some(entry => entry && [
            'RESULT_JOB_IDENTITY_MISMATCH',
            'RESULT_COMMIT_REJECTED',
            'STALE_UPDATE',
            'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
        ].includes(entry.action))).toBe(false);

        for (const page of pages) {
            // eslint-disable-next-line no-await-in-loop
            await page.close();
        }
    });

    for (const scenario of [
        {
            mode: 'minimized_window',
            baseUrl: 'http://127.0.0.1:3999/gemini/',
            label: 'janela minimizada',
        },
        {
            mode: 'background_delete',
            baseUrl: 'http://127.0.0.1:3999/app/mock-chat',
            label: 'background com exclusão segura',
        },
    ]) {
        test(`Executa o lote em ${scenario.label} sem depender de ghost mousemove`, { tag: scenario.mode === 'background_delete' ? '@e2e-medium-a' : '@e2e-medium-b' }, async () => {
            await resetExtensionState(backgroundWorker, {
                geminiExecutionMode: scenario.mode,
                geminiBaseUrl: scenario.baseUrl,
            });

            const page = await browserContext.newPage();
            await page.goto('http://localhost:3999/manga-page.html');
            await page.waitForLoadState('networkidle');

            // Estes cenários validam o modo de execução/anti-throttling, não
            // concorrência. Deixamos uma única página elegível para reduzir
            // ruído de cleanup entre janelas e tornar o gate determinístico.
            await page.evaluate(() => {
                const second = document.querySelector('[data-testid="manga-image-1"]');
                if (second) second.remove();
            });

            const mainContent = page.locator('#manga-main-content');
            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
            await mainContent.click();

            await expect.poll(async () => {
                return page.evaluate(() =>
                    document.querySelectorAll('img[data-translated="true"]').length
                );
            }, {
                timeout: 60000,
                message: `Esperava tradução completa no modo ${scenario.mode}`,
            }).toBe(1);

            await expect.poll(async () => {
                backgroundWorker = await getBackgroundWorker(browserContext);
                const storage = await readStorage(backgroundWorker, [
                    'mt_state',
                    'translatorLog',
                ]);
                const state = storage.mt_state || {};
                const logs = Array.isArray(storage.translatorLog)
                    ? storage.translatorLog
                    : [];

                return {
                    activeJobsCount: state.activeJobsCount || 0,
                    isProcessing: !!state.isProcessing,
                    queueLength: Array.isArray(state.jobQueue)
                        ? state.jobQueue.length
                        : -1,
                    batchDone: logs.some(entry =>
                        entry && entry.action === 'BATCH_DONE'
                    ),
                };
            }, {
                timeout: 45000,
                message: `Esperava lote finalizado no modo ${scenario.mode}`,
            }).toEqual({
                activeJobsCount: 0,
                isProcessing: false,
                queueLength: 0,
                batchDone: true,
            });

            if (scenario.mode === 'background_delete' || scenario.mode === 'minimized_window') {
                await expect.poll(async () => {
                    const storage = await readStorage(backgroundWorker, ['translatorLog']);
                    const logs = Array.isArray(storage.translatorLog)
                        ? storage.translatorLog
                        : [];
                    return logs.some(entry =>
                        entry && entry.action === 'DELETE_OK'
                    );
                }, {
                    timeout: 15000,
                    message: `Esperava exclusão segura confirmada no log para ${scenario.mode}`,
                }).toBe(true);
            }

            await page.close();
        });
    }


    test('E2E resposta rápida: resultado no mesmo instante lógico do submit não é perdido', { tag: '@e2e-fast' }, async () => {
        await resetExtensionState(backgroundWorker, {
            geminiExecutionMode: 'temp_chat',
            geminiBaseUrl: 'http://127.0.0.1:3999/gemini/?fastResult=1',
        });

        const page = await browserContext.newPage();
        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.evaluate(() => {
            const second = document.querySelector('[data-testid="manga-image-1"]');
            if (second) second.remove();
        });

        const mainContent = page.locator('#manga-main-content');
        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
        await mainContent.click();

        await expect.poll(async () => {
            return page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            );
        }, {
            timeout: 30000,
            message: 'Observer V3 deveria capturar resultado instantâneo',
        }).toBe(1);

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return {
                completedJobs: state.completedJobs || 0,
                activeJobsCount: state.activeJobsCount || 0,
                jobIndex: Array.isArray(state.jobIndex) ? state.jobIndex : [],
            };
        }, {
            timeout: 30000,
            message: 'Esperava finalização completa após resposta instantânea',
        }).toEqual({
            completedJobs: 1,
            activeJobsCount: 0,
            jobIndex: [],
        });

        await page.close();
    });

    test('E2E resultado atual do Gemini: shadow DOM + wrapper assistant é detectado sem intervenção manual', { tag: '@e2e-fast' }, async () => {
        await resetExtensionState(backgroundWorker, {
            geminiExecutionMode: 'temp_chat',
            geminiBaseUrl:
                'http://127.0.0.1:3999/gemini/?shadowResult=1&relaxedResultContainer=1',
        });

        const page = await browserContext.newPage();
        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.evaluate(() => {
            document.querySelector('[data-testid="manga-image-1"]')?.remove();
        });

        const mainContent = page.locator('#manga-main-content');
        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
        await mainContent.click();

        await expect.poll(async () => page.evaluate(() =>
            document.querySelectorAll('img[data-translated="true"]').length
        ), {
            timeout: 45000,
            message: 'Resultado em shadow DOM deveria ser detectado automaticamente',
        }).toBe(1);

        const storage = await readStorage(backgroundWorker, ['translatorLog']);
        const logs = Array.isArray(storage.translatorLog)
            ? storage.translatorLog
            : [];

        expect(logs.some(entry =>
            entry && entry.action === 'GEMINI_RESULT_ACCEPTED' &&
            entry.extra?.reason === 'new_model_turn'
        )).toBe(true);
        expect(logs.some(entry =>
            entry && entry.action === 'GEMINI_MANUAL_INTERVENTION_REQUIRED'
        )).toBe(false);

        await page.close();
    });


    test('E2E submit ignorado: falha cedo sem entrar em espera de geração de 4 minutos', { tag: '@e2e-medium-a' }, async () => {
        await resetExtensionState(backgroundWorker, {
            geminiExecutionMode: 'temp_chat',
            geminiBaseUrl: 'http://127.0.0.1:3999/gemini/?ignoreSubmit=1',
        });

        const page = await browserContext.newPage();
        await page.goto('http://localhost:3999/manga-page.html');
        await page.waitForLoadState('networkidle');

        await page.evaluate(() => {
            const second = document.querySelector('[data-testid="manga-image-1"]');
            if (second) second.remove();
        });

        const mainContent = page.locator('#manga-main-content');
        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });

        const startedAt = Date.now();
        await mainContent.click();

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['translatorLog']);
            const logs = Array.isArray(storage.translatorLog)
                ? storage.translatorLog
                : [];
            return logs.some(entry =>
                entry && entry.action === 'GEMINI_SUBMISSION_NOT_CONFIRMED'
            );
        }, {
            timeout: 35000,
            message: 'Esperava GEMINI_SUBMISSION_NOT_CONFIRMED em timeout curto',
        }).toBe(true);

        expect(Date.now() - startedAt).toBeLessThan(35000);

        await expect.poll(async () => {
            backgroundWorker = await getBackgroundWorker(browserContext);
            const storage = await readStorage(backgroundWorker, ['mt_state']);
            const state = storage.mt_state || {};
            return {
                activeJobsCount: state.activeJobsCount || 0,
                isProcessing: !!state.isProcessing,
                queueLength: Array.isArray(state.jobQueue)
                    ? state.jobQueue.length
                    : -1,
            };
        }, {
            timeout: 15000,
            message: 'Job com submit não confirmado deveria liberar o lote cedo',
        }).toEqual({
            activeJobsCount: 0,
            isProcessing: false,
            queueLength: 0,
        });

        expect(
            await page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            )
        ).toBe(0);

        await page.close();
    });


    for (const scenario of regressionScenarios) {
        test(`REG result ownership: ${scenario.label} ignora clone do input e IMG órfã`, { tag: '@e2e-fast' }, async () => {
            const joiner = scenario.basePath.includes('?') ? '&' : '?';
            await resetExtensionState(backgroundWorker, {
                geminiExecutionMode: scenario.mode,
                geminiBaseUrl:
                    `http://127.0.0.1:3999${scenario.basePath}${joiner}cloneInputIntoUserTurn=1&orphanImageBeforeResult=1`,
            });

            const page = await browserContext.newPage();
            await page.goto('http://localhost:3999/manga-page.html');
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => {
                document.querySelector('[data-testid="manga-image-1"]')?.remove();
            });

            const mainContent = page.locator('#manga-main-content');
            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });
            await mainContent.click();

            await expect.poll(async () => page.evaluate(() =>
                document.querySelectorAll('img[data-translated="true"]').length
            ), {
                timeout: 60000,
                message: `Esperava resultado real do model turn em ${scenario.mode}`,
            }).toBe(1);

            const storage = await readStorage(backgroundWorker, ['translatorLog']);
            const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];
            expect(logs.some(entry =>
                entry && entry.action === 'GEMINI_RESULT_REJECTED' &&
                entry.extra?.reason === 'user_turn'
            )).toBe(true);
            expect(logs.some(entry =>
                entry && entry.action === 'GEMINI_RESULT_REJECTED' &&
                entry.extra?.reason === 'missing_model_owner'
            )).toBe(true);
            expect(logs.some(entry =>
                entry && entry.action === 'GEMINI_RESULT_ACCEPTED' &&
                entry.extra?.reason === 'new_model_turn'
            )).toBe(true);

            await page.close();
        });
    }

    test('E2E aba Gemini manual: zero automação, zero keepalive e DOM intacto', { tag: '@e2e-fast' }, async () => {
        await backgroundWorker.evaluate(() => {
            chrome.storage.local.set({ __e2e_keepalive_count: 0 });
            chrome.runtime.onConnect.addListener(port => {
                if (!port || port.name !== 'gemini-keep-alive') return;
                chrome.storage.local.get(['__e2e_keepalive_count'], data => {
                    const count = Number(data.__e2e_keepalive_count) || 0;
                    chrome.storage.local.set({
                        __e2e_keepalive_count: count + 1,
                    });
                });
            });
        });

        const manual = await browserContext.newPage();
        await manual.goto('http://127.0.0.1:3999/gemini/?manual=1');
        await manual.waitForLoadState('networkidle');
        await manual.waitForTimeout(1500);

        await expect(manual.locator('#mock-status')).toHaveText('Aguardando entrada');
        await expect(manual.locator('#attachment-label')).toHaveText('Nenhuma imagem anexada');
        await expect(manual.locator('.prompt-box')).toHaveText('');
        await expect(manual.locator('#result-zone')).toBeEmpty();

        backgroundWorker = await getBackgroundWorker(browserContext);
        const storage = await readStorage(backgroundWorker, [
            '__e2e_keepalive_count',
            'translatorLog',
        ]);
        expect(storage.__e2e_keepalive_count || 0).toBe(0);

        const logs = Array.isArray(storage.translatorLog)
            ? storage.translatorLog
            : [];
        expect(logs.some(entry =>
            entry && entry.action === 'JOB_NOT_FOUND'
        )).toBe(true);

        await manual.close();
    });

});
~~~

O blob auditado contém newline final. A posição documental **905** representa explicitamente esse terminador após a linha textual 904.

## 23. Cobertura documental linha a linha

### Linha 1

**Fonte:** `/**`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: 

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 2

**Fonte:** ` * translation-flow.spec.js`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: translation-flow.spec.js

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 3

**Fonte:** ` *`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: 

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 4

**Fonte:** ` * E2E real do fluxo MV3:`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: E2E real do fluxo MV3:

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 5

**Fonte:** ` * - content_manga.js seleciona imagens validas e dispara START_BATCH`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: - content_manga.js seleciona imagens validas e dispara START_BATCH

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 6

**Fonte:** ` * - background.js orquestra a fila e abre abas do Gemini`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: - background.js orquestra a fila e abre abas do Gemini

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 7

**Fonte:** ` * - content_gemini.js roda na aba mockada do Gemini e devolve a imagem traduzida`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: - content_gemini.js roda na aba mockada do Gemini e devolve a imagem traduzida

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 8

**Fonte:** ` * - content_manga.js substitui o DOM com data:image/... e conclui o lote`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: - content_manga.js substitui o DOM com data:image/... e conclui o lote

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 9

**Fonte:** ` *`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: 

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 10

**Fonte:** ` * Observacao importante:`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: Observacao importante:

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 11

**Fonte:** ` * A assercao final verifica \`data:image/...\` no mangá, nao \`translated_result.png\`.`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: A assercao final verifica `data:image/...` no mangá, nao `translated_result.png`.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 12

**Fonte:** ` * Isso reflete o comportamento real da extensao: o background converte a imagem`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: Isso reflete o comportamento real da extensao: o background converte a imagem

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 13

**Fonte:** ` * gerada em base64 antes de enviar \`UPDATE_IMAGE\` para a aba do mangá.`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: gerada em base64 antes de enviar `UPDATE_IMAGE` para a aba do mangá.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 14

**Fonte:** ` */`

**Contexto:** Cabeçalho contratual do E2E e explicação do fluxo MV3 observado.

**O que faz:** Comentário/documentação local: /

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 15

**Fonte:** `(linha vazia)`

**Contexto:** Dependências Node/Playwright e helper de descoberta da raiz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 16

**Fonte:** `const { test, expect, chromium } = require('@playwright/test');`

**Contexto:** Dependências Node/Playwright e helper de descoberta da raiz.

**O que faz:** Importa `test`, `expect` e `chromium` do Playwright.

**Como faz:** Usa CommonJS para obter runner/assertions e launcher de Chromium.

**Por que existe assim:** O arquivo precisa controlar um persistent context com a extensão MV3 carregada e produzir assertions E2E.

**Risco/regressão:** Mudança de API/versão do Playwright pode afetar launcher, tags ou matchers.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 17

**Fonte:** `const fs = require('fs');`

**Contexto:** Dependências Node/Playwright e helper de descoberta da raiz.

**O que faz:** Importa o módulo Node `fs`.

**Como faz:** Cria binding CommonJS local.

**Por que existe assim:** No SHA auditado o binding não é utilizado depois desta linha.

**Risco/regressão:** É import morto; não quebra o teste, mas aumenta ruído e pode sugerir cleanup de profile que hoje não existe.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 18

**Fonte:** `const os = require('os');`

**Contexto:** Dependências Node/Playwright e helper de descoberta da raiz.

**O que faz:** Importa `os` para localizar o diretório temporário do sistema.

**Como faz:** `os.tmpdir()` alimenta o caminho do profile exclusivo de cada teste.

**Por que existe assim:** Evita compartilhar user-data-dir entre workers/cenários.

**Risco/regressão:** Profiles não removidos explicitamente podem acumular no diretório temporário.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 19

**Fonte:** `const path = require('path');`

**Contexto:** Dependências Node/Playwright e helper de descoberta da raiz.

**O que faz:** Importa utilitários de caminhos do Node.

**Como faz:** `path.join` compõe extension path e user-data-dir.

**Por que existe assim:** Mantém construção de caminhos portável entre Linux e Windows.

**Risco/regressão:** Baixo; paths incorretos impedem o Chromium de carregar a extensão.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 20

**Fonte:** `const { findRepoRoot } = require('../helpers/repo-root');`

**Contexto:** Dependências Node/Playwright e helper de descoberta da raiz.

**O que faz:** Importa o helper que encontra a raiz canônica do repositório.

**Como faz:** Resolve `../helpers/repo-root` e usa a presença de `extension/manifest.json` como âncora.

**Por que existe assim:** Permite executar o E2E a partir de caminhos/working directories diferentes.

**Risco/regressão:** Falha de descoberta impede localizar a extensão.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 21

**Fonte:** `(linha vazia)`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 22

**Fonte:** `function getBrowserModeConfig() {`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Declara o normalizador do modo de browser E2E.

**Como faz:** Lê `MANGA_E2E_BROWSER_MODE` e mapeia aliases visuais versus stealth.

**Por que existe assim:** Suporta CI headless por flag Chromium e investigação local visual com slowMo.

**Risco/regressão:** Alias não reconhecido cai em stealth.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 23

**Fonte:** `    const rawMode = String(process.env.MANGA_E2E_BROWSER_MODE || 'stealth').trim().toLowerCase();`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Lê e normaliza a variável `MANGA_E2E_BROWSER_MODE`.

**Como faz:** Converte para string, aplica trim/lowercase e usa `stealth` por padrão.

**Por que existe assim:** Evita diferenças de capitalização/espaços e garante default determinístico.

**Risco/regressão:** Valor inesperado é tratado como stealth.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 24

**Fonte:** `    const showBrowser = ['show', 'visible', 'headed', 'ui'].includes(rawMode);`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Classifica se o navegador deve ser exibido.

**Como faz:** Aceita `show`, `visible`, `headed` e `ui` como aliases visuais.

**Por que existe assim:** Mantém uma interface simples para debugging humano.

**Risco/regressão:** Novos aliases precisam ser adicionados explicitamente.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 25

**Fonte:** `(linha vazia)`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 26

**Fonte:** `    return {`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 27

**Fonte:** `        mode: showBrowser ? 'show' : 'stealth',`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Executa a instrução `mode: showBrowser ? 'show' : 'stealth',` no contexto `Helper de modo visual/stealth do Chromium.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 28

**Fonte:** `        showBrowser,`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Executa a instrução `showBrowser,` no contexto `Helper de modo visual/stealth do Chromium.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 29

**Fonte:** `        slowMo: showBrowser ? 350 : 0,`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Define atraso de interação apenas no modo visual.

**Como faz:** Usa 350 ms quando `showBrowser`, senão zero.

**Por que existe assim:** Facilita observar o fluxo sem penalizar CI stealth.

**Risco/regressão:** Não é garantia de sincronização; assertions devem continuar baseadas em eventos/polls.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 30

**Fonte:** `    };`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 31

**Fonte:** `}`

**Contexto:** Helper de modo visual/stealth do Chromium.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 32

**Fonte:** `(linha vazia)`

**Contexto:** Resolução do diretório da extensão carregada.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 33

**Fonte:** `function getExtensionPath(startDir) {`

**Contexto:** Resolução do diretório da extensão carregada.

**O que faz:** Declara helper para obter o diretório `extension/`.

**Como faz:** Parte da raiz descoberta a partir do diretório do spec.

**Por que existe assim:** O Chromium exige caminho absoluto/coerente para `--load-extension`.

**Risco/regressão:** Se a estrutura canônica mudar, o helper precisa acompanhar.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 34

**Fonte:** `    return path.join(findRepoRoot(startDir), 'extension');`

**Contexto:** Resolução do diretório da extensão carregada.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 35

**Fonte:** `}`

**Contexto:** Resolução do diretório da extensão carregada.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 36

**Fonte:** `(linha vazia)`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 37

**Fonte:** `let extensionId = null;`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Cria cache por processo do ID da extensão.

**Como faz:** Inicializa como nulo e é preenchido a partir da URL do Service Worker.

**Por que existe assim:** Permite acordar o worker depois que ele some da lista de service workers.

**Risco/regressão:** Persiste entre testes no mesmo worker process; assume ID estável para a mesma extensão.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 38

**Fonte:** `(linha vazia)`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 39

**Fonte:** `function rememberExtensionId(worker) {`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Declara helper que memoriza o hostname `chrome-extension://` do worker.

**Como faz:** Analisa `worker.url()` com `URL` e guarda hostname quando protocolo/host são válidos.

**Por que existe assim:** O ID é necessário para abrir o popup e despertar um worker MV3 suspenso.

**Risco/regressão:** Erros de parse são silenciosamente ignorados; o cache pode permanecer nulo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 40

**Fonte:** `    if (!worker) return worker;`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 41

**Fonte:** `    try {`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 42

**Fonte:** `        const parsed = new URL(worker.url());`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Parseia a URL do Service Worker.

**Como faz:** Usa a implementação global `URL` sobre `worker.url()`.

**Por que existe assim:** Extrai protocolo e hostname sem parsing manual.

**Risco/regressão:** URL inválida cai no catch vazio e não atualiza o cache.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 43

**Fonte:** `        if (parsed.protocol === 'chrome-extension:' && parsed.hostname) {`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Valida que a URL pertence à extensão e possui hostname.

**Como faz:** Exige protocolo `chrome-extension:` e hostname truthy.

**Por que existe assim:** Evita memorizar IDs derivados de worker/origem errada.

**Risco/regressão:** Se o runtime mudar o formato da URL, o ID não será cacheado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 44

**Fonte:** `            extensionId = parsed.hostname;`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Executa a instrução `extensionId = parsed.hostname;` no contexto `Cache/descoberta do extensionId a partir do Service Worker.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 45

**Fonte:** `        }`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 46

**Fonte:** `    } catch (_error) {}`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 47

**Fonte:** `    return worker;`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 48

**Fonte:** `}`

**Contexto:** Cache/descoberta do extensionId a partir do Service Worker.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 49

**Fonte:** `(linha vazia)`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 50

**Fonte:** `async function getBackgroundWorker(context) {`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Declara o resolvedor/reativador do Service Worker de background.

**Como faz:** Tenta worker residente, espera primeiro startup ou acorda via popup quando já conhece o extensionId.

**Por que existe assim:** MV3 pode suspender o service worker entre etapas de E2E.

**Risco/regressão:** Acordar o worker depende de popup acessível e mensagem runtime funcionando.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 51

**Fonte:** `    const existingWorker = context.serviceWorkers()[0];`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Consulta o primeiro Service Worker atualmente residente.

**Como faz:** Usa a API do BrowserContext do Playwright.

**Por que existe assim:** Evita abrir popup/wait quando o worker já está ativo.

**Risco/regressão:** Assume que o primeiro worker do contexto é o da extensão.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 52

**Fonte:** `    if (existingWorker) return rememberExtensionId(existingWorker);`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 53

**Fonte:** `(linha vazia)`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 54

**Fonte:** `    if (!extensionId) {`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 55

**Fonte:** `        return rememberExtensionId(`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 56

**Fonte:** `            await context.waitForEvent('serviceworker', { timeout: 15000 })`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Espera evento de criação/reativação de Service Worker.

**Como faz:** Usa timeout de 15 s; no caminho de wake a Promise é convertida em null se expirar.

**Por que existe assim:** Sincroniza com lifecycle assíncrono do MV3 sem sleep fixo.

**Risco/regressão:** Timeout pode ser insuficiente em ambiente extremamente lento; no wake path há fallback para lista atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 57

**Fonte:** `        );`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 58

**Fonte:** `    }`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 59

**Fonte:** `(linha vazia)`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 60

**Fonte:** `    let wakePage = null;`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Declara dado intermediário usado no contexto `Aquisição e reativação do Service Worker MV3.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 61

**Fonte:** `    try {`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 62

**Fonte:** `        const workerPromise = context.waitForEvent('serviceworker', { timeout: 15000 })`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Espera evento de criação/reativação de Service Worker.

**Como faz:** Usa timeout de 15 s; no caminho de wake a Promise é convertida em null se expirar.

**Por que existe assim:** Sincroniza com lifecycle assíncrono do MV3 sem sleep fixo.

**Risco/regressão:** Timeout pode ser insuficiente em ambiente extremamente lento; no wake path há fallback para lista atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 63

**Fonte:** `            .catch(() => null);`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Executa a instrução `.catch(() => null);` no contexto `Aquisição e reativação do Service Worker MV3.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 64

**Fonte:** `        wakePage = await context.newPage();`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Executa a instrução `wakePage = await context.newPage();` no contexto `Aquisição e reativação do Service Worker MV3.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 65

**Fonte:** `        await wakePage.goto(\`chrome-extension://${extensionId}/popup/popup.html\`, {`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Navega uma página auxiliar para o popup da extensão.

**Como faz:** Constrói URL com o `extensionId` cacheado e espera DOMContentLoaded.

**Por que existe assim:** Abrir superfície da extensão ajuda a despertar o Service Worker suspenso.

**Risco/regressão:** Popup indisponível impede o wake path.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 66

**Fonte:** `            waitUntil: 'domcontentloaded',`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Executa a instrução `waitUntil: 'domcontentloaded',` no contexto `Aquisição e reativação do Service Worker MV3.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 67

**Fonte:** `            timeout: 10000,`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Executa a instrução `timeout: 10000,` no contexto `Aquisição e reativação do Service Worker MV3.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 68

**Fonte:** `        });`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 69

**Fonte:** `        await wakePage.evaluate(() => new Promise(resolve => {`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Aguarda operação assíncrona no contexto `Aquisição e reativação do Service Worker MV3.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 70

**Fonte:** `            chrome.runtime.sendMessage({ action: 'GET_TAB_ID' }, () => resolve());`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Envia mensagem runtime mínima para acordar/ativar o background.

**Como faz:** Executa `chrome.runtime.sendMessage({action:'GET_TAB_ID'})` no popup.

**Por que existe assim:** Força atividade real da extensão em vez de depender de mouse/foco fantasma.

**Risco/regressão:** Callback ignora `runtime.lastError`; falha só será percebida se o worker não surgir.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 71

**Fonte:** `        }));`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 72

**Fonte:** `(linha vazia)`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 73

**Fonte:** `        const worker = context.serviceWorkers()[0] || await workerPromise;`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Consulta o primeiro Service Worker atualmente residente.

**Como faz:** Usa a API do BrowserContext do Playwright.

**Por que existe assim:** Evita abrir popup/wait quando o worker já está ativo.

**Risco/regressão:** Assume que o primeiro worker do contexto é o da extensão.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 74

**Fonte:** `        if (!worker) throw new Error('Service Worker MV3 não acordou após mensagem da extensão');`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Falha explicitamente quando o wake path não produz worker.

**Como faz:** Lança `Error` após consultar worker residente e Promise do evento.

**Por que existe assim:** Evita continuar o teste sem background válido.

**Risco/regressão:** Produz falha diagnóstica correta, mas sem detalhe do motivo do wake ter falhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 75

**Fonte:** `        return rememberExtensionId(worker);`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 76

**Fonte:** `    } finally {`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 77

**Fonte:** `        if (wakePage) await wakePage.close().catch(() => {});`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Fecha a página auxiliar usada para acordar o worker.

**Como faz:** Executa no `finally` e suprime erro de close.

**Por que existe assim:** Evita deixar popup auxiliar interferir nos cenários.

**Risco/regressão:** Falha de close é silenciosa; o BrowserContext final ainda é fechado no afterEach.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 78

**Fonte:** `    }`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 79

**Fonte:** `}`

**Contexto:** Aquisição e reativação do Service Worker MV3.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 80

**Fonte:** `(linha vazia)`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 81

**Fonte:** `async function resetExtensionState(backgroundWorker, overrides = {}) {`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Declara reset de estado persistido da extensão.

**Como faz:** Executa dentro do Service Worker e substitui `chrome.storage.local` por baseline conhecido + overrides.

**Por que existe assim:** Cada teste precisa iniciar isolado apesar do persistent context.

**Risco/regressão:** Callbacks não verificam `chrome.runtime.lastError`; falha de storage pode virar timeout posterior.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 82

**Fonte:** `    await backgroundWorker.evaluate((stateOverrides) => {`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa lógica no Service Worker real da extensão.

**Como faz:** Usa Playwright Worker.evaluate para acessar APIs Chrome privilegiadas.

**Por que existe assim:** Permite preparar/ler estado e enviar mensagens usando o runtime real.

**Risco/regressão:** Se o worker suspender, é necessário reacquirí-lo por `getBackgroundWorker`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 83

**Fonte:** `        return new Promise(resolve => {`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 84

**Fonte:** `            chrome.storage.local.clear(() => {`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Limpa todo o storage local do profile de teste.

**Como faz:** Encadeia `clear` e, no callback, realiza `set` do baseline.

**Por que existe assim:** Elimina estado residual de bootstrap/lotes/logs dentro do mesmo profile.

**Risco/regressão:** Erro do clear não é checado explicitamente.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 85

**Fonte:** `                chrome.storage.local.set({`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Grava baseline/override controlado no storage local.

**Como faz:** Passa um objeto com defaults do tradutor e resolve a Promise no callback.

**Por que existe assim:** Configura domínio, modo Gemini, concorrência e estado de lote determinísticos.

**Risco/regressão:** Erro do set não é checado; o teste pode seguir com configuração incompleta.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 86

**Fonte:** `                    enabledDomains: ['localhost'],`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Habilita `localhost` para o content script de mangá.

**Como faz:** Define array de domínios no storage de teste.

**Por que existe assim:** A fixture roda em localhost:3999 e precisa ser considerada site habilitado.

**Risco/regressão:** Mudança no contrato de domínio pode impedir o botão/fluxo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 87

**Fonte:** `                    debugMode: false,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `debugMode: false,` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 88

**Fonte:** `                    maxConcurrentJobs: 1,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Fixa concorrência do pipeline em 1.

**Como faz:** Persiste `maxConcurrentJobs: 1` no baseline.

**Por que existe assim:** Torna scheduler e FIFO determinísticos.

**Risco/regressão:** Não cobre concorrência >1 neste arquivo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 89

**Fonte:** `                    geminiBaseUrl: 'http://127.0.0.1:3999/gemini/',`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 90

**Fonte:** `                    geminiExecutionMode: 'temp_chat',`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 91

**Fonte:** `                    defaultPrompt: 'Teste E2E controlado do fluxo MV3.',`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `defaultPrompt: 'Teste E2E controlado do fluxo MV3.',` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 92

**Fonte:** `                    translatorLog: [],`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Zera o log persistido do tradutor.

**Como faz:** Grava array vazio no reset.

**Por que existe assim:** As assertions de ações precisam observar somente eventos do cenário atual.

**Risco/regressão:** Sem reset, logs stale poderiam gerar falso positivo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 93

**Fonte:** `                    deleting_urls: [],`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `deleting_urls: [],` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 94

**Fonte:** `                    chapterList: [],`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `chapterList: [],` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 95

**Fonte:** `                    mt_state: {`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Inicia snapshot controlado do scheduler/lote.

**Como faz:** Cria objeto com fila, flags e contadores zerados.

**Por que existe assim:** Evita estado de lote anterior contaminar o E2E.

**Risco/regressão:** Novos campos de estado não incluídos dependem dos defaults do runtime.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 96

**Fonte:** `                        jobQueue: [],`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `jobQueue: [],` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 97

**Fonte:** `                        isProcessing: false,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `isProcessing: false,` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 98

**Fonte:** `                        stopRequested: false,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `stopRequested: false,` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 99

**Fonte:** `                        activeMangaTabId: null,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `activeMangaTabId: null,` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 100

**Fonte:** `                        extractionTabs: {},`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `extractionTabs: {},` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 101

**Fonte:** `                        totalJobs: 0,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `totalJobs: 0,` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 102

**Fonte:** `                        completedJobs: 0,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `completedJobs: 0,` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 103

**Fonte:** `                        activeJobsCount: 0,`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `activeJobsCount: 0,` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 104

**Fonte:** `                    },`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 105

**Fonte:** `                    ...(stateOverrides || {}),`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Executa a instrução `...(stateOverrides || {}),` no contexto `Reset determinístico do chrome.storage.local antes de cada cenário.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 106

**Fonte:** `                }, resolve);`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 107

**Fonte:** `            });`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 108

**Fonte:** `        });`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 109

**Fonte:** `    }, overrides);`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 110

**Fonte:** `}`

**Contexto:** Reset determinístico do chrome.storage.local antes de cada cenário.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 111

**Fonte:** `(linha vazia)`

**Contexto:** Leitura controlada de storage pelo contexto do Service Worker.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 112

**Fonte:** `async function readStorage(backgroundWorker, keys) {`

**Contexto:** Leitura controlada de storage pelo contexto do Service Worker.

**O que faz:** Declara leitor de storage via Service Worker.

**Como faz:** Executa `chrome.storage.local.get` no contexto da extensão e devolve o objeto ao Node.

**Por que existe assim:** Permite assertions sobre estado/logs duráveis sem expor APIs Chrome à página web.

**Risco/regressão:** Não verifica `runtime.lastError`, podendo mascarar falha de leitura como dados ausentes.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 113

**Fonte:** `    return backgroundWorker.evaluate(async requestedKeys => {`

**Contexto:** Leitura controlada de storage pelo contexto do Service Worker.

**O que faz:** Executa lógica no Service Worker real da extensão.

**Como faz:** Usa Playwright Worker.evaluate para acessar APIs Chrome privilegiadas.

**Por que existe assim:** Permite preparar/ler estado e enviar mensagens usando o runtime real.

**Risco/regressão:** Se o worker suspender, é necessário reacquirí-lo por `getBackgroundWorker`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 114

**Fonte:** `        return new Promise(resolve => chrome.storage.local.get(requestedKeys, resolve));`

**Contexto:** Leitura controlada de storage pelo contexto do Service Worker.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 115

**Fonte:** `    }, keys);`

**Contexto:** Leitura controlada de storage pelo contexto do Service Worker.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 116

**Fonte:** `}`

**Contexto:** Leitura controlada de storage pelo contexto do Service Worker.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 117

**Fonte:** `(linha vazia)`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 118

**Fonte:** `async function areBothOriginalPagesVisible(page) {`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Declara helper que verifica se ambas páginas originais estão integralmente no viewport.

**Como faz:** Consulta os dois testids e compara seus retângulos com `window.innerHeight`.

**Por que existe assim:** Protege a premissa de que o clique/fluxo não depende de scroll para detectar páginas iniciais.

**Risco/regressão:** É específico à fixture e ao viewport/layout atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 119

**Fonte:** `    return page.evaluate(() => {`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 120

**Fonte:** `        const targets = [`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Declara dado intermediário usado no contexto `Helper de visibilidade simultânea das duas páginas originais.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 121

**Fonte:** `            document.querySelector('[data-testid="manga-image-0"]'),`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Executa a instrução `document.querySelector('[data-testid="manga-image-0"]'),` no contexto `Helper de visibilidade simultânea das duas páginas originais.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 122

**Fonte:** `            document.querySelector('[data-testid="manga-image-1"]'),`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Executa a instrução `document.querySelector('[data-testid="manga-image-1"]'),` no contexto `Helper de visibilidade simultânea das duas páginas originais.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 123

**Fonte:** `        ];`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Executa a instrução `];` no contexto `Helper de visibilidade simultânea das duas páginas originais.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 124

**Fonte:** `(linha vazia)`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 125

**Fonte:** `        return targets.every(img => {`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 126

**Fonte:** `            if (!img) return false;`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 127

**Fonte:** `            const rect = img.getBoundingClientRect();`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Declara dado intermediário usado no contexto `Helper de visibilidade simultânea das duas páginas originais.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 128

**Fonte:** `            return rect.top >= 0 && rect.bottom <= window.innerHeight;`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 129

**Fonte:** `        });`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 130

**Fonte:** `    });`

**Contexto:** Helper de visibilidade simultânea das duas páginas originais.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 131

**Fonte:** `}`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — helper exercitado pelos cenários que o invocam; a propriedade desta linha não possui assertion isolada.

### Linha 132

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 133

**Fonte:** `let browserContext;`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Declara dado intermediário usado no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 134

**Fonte:** `let backgroundWorker;`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Declara dado intermediário usado no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 135

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 136

**Fonte:** `test.describe('E2E-01/E2E-02/E2E-03/E2E-04/E2E-05/E2E-06/E2E-07/E2E-08/E2E-09/E2E-10/E2E-11/E2E-12/E2E-13/E2E-14/E2E-15/E2E-15b/E2E-16/E2E-16b/E2E-17/E2E-18: Automacao UI: Fluxo de Traducao em Massa (E2E)', () => {`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 137

**Fonte:** `    // Cada teste cria um persistent context/profile exclusivo no beforeEach.`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Comentário/documentação local: Cada teste cria um persistent context/profile exclusivo no beforeEach.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 138

**Fonte:** `    // Pode ser distribuído entre workers/shards sem compartilhar storage/SW.`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Comentário/documentação local: Pode ser distribuído entre workers/shards sem compartilhar storage/SW.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 139

**Fonte:** `    test.describe.configure({ mode: 'parallel' });`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Habilita execução paralela dos testes deste describe.

**Como faz:** Configura `mode: 'parallel'`.

**Por que existe assim:** Permite distribuir os E2E por workers/shards, apoiado em profiles exclusivos.

**Risco/regressão:** Qualquer estado global externo ao profile/mock compartilhado precisa ser isolado/determinístico.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 140

**Fonte:** `    test.beforeEach(async () => {`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Inicia setup isolado antes de cada teste gerado.

**Como faz:** Cria extension path, profile temporário, args Chromium, persistent context, worker e storage baseline.

**Por que existe assim:** Evita compartilhamento de storage/SW entre cenários.

**Risco/regressão:** O profile temporário não é removido explicitamente depois do close.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 141

**Fonte:** `        const pathToExtension = getExtensionPath(__dirname);`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Declara dado intermediário usado no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 142

**Fonte:** `        const userDataDir = path.join(`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Declara dado intermediário usado no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 143

**Fonte:** `            os.tmpdir(),`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `os.tmpdir(),` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 144

**Fonte:** `            \`pw-manga-${Date.now()}-${Math.random().toString(36).slice(2)}\``

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Gera nome único para o user-data-dir do Chromium.

**Como faz:** Combina timestamp e sufixo aleatório dentro de `os.tmpdir()`.

**Por que existe assim:** Impede colisão de profile entre workers paralelos.

**Risco/regressão:** Diretórios podem acumular porque não há `fs.rm*` no afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 145

**Fonte:** `        );`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 146

**Fonte:** `        const browserMode = getBrowserModeConfig();`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Declara dado intermediário usado no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 147

**Fonte:** `        const launchArgs = [`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Declara dado intermediário usado no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 148

**Fonte:** `            \`--disable-extensions-except=${pathToExtension}\`,`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Restringe extensões carregadas à Manga Translator.

**Como faz:** Passa o path do projeto como argumento Chromium.

**Por que existe assim:** Reduz interferência de extensões externas e permite MV3 unpacked.

**Risco/regressão:** Path inválido impede carregamento.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 149

**Fonte:** `            \`--load-extension=${pathToExtension}\`,`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Carrega a extensão unpacked no Chromium.

**Como faz:** Passa `--load-extension=<path>`.

**Por que existe assim:** O E2E precisa executar manifest/background/content scripts reais.

**Risco/regressão:** Mudanças de suporte do Chromium a extensões em headless podem afetar CI.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 150

**Fonte:** `            '--no-sandbox',`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `'--no-sandbox',` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 151

**Fonte:** `            '--disable-setuid-sandbox',`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `'--disable-setuid-sandbox',` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 152

**Fonte:** `        ];`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `];` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 153

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 154

**Fonte:** `        if (!browserMode.showBrowser) launchArgs.unshift('--headless=new');`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Ativa o headless moderno por argumento Chromium no modo stealth.

**Como faz:** Insere a flag no início de `launchArgs` embora a opção Playwright permaneça `headless:false`.

**Por que existe assim:** Mantém compatibilidade com carregamento de extensão no modo usado pelo projeto.

**Risco/regressão:** É combinação dependente do comportamento atual do Chromium/Playwright.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 155

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 156

**Fonte:** `        console.log(\`[E2E] Browser mode: ${browserMode.mode}\`);`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `console.log('[E2E] Browser mode: ${browserMode.mode}');` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 157

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 158

**Fonte:** `        browserContext = await chromium.launchPersistentContext(userDataDir, {`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Lança Chromium com profile persistente exclusivo e a extensão real.

**Como faz:** Usa `chromium.launchPersistentContext(userDataDir, ...)` com args e slowMo configurados.

**Por que existe assim:** Extensões MV3 requerem um contexto persistente para service worker e storage reais.

**Risco/regressão:** Processo/profile pesado; cleanup depende de fechar contexto e de eventual remoção do diretório.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 159

**Fonte:** `            headless: false,`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `headless: false,` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 160

**Fonte:** `            slowMo: browserMode.slowMo,`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Define atraso de interação apenas no modo visual.

**Como faz:** Usa 350 ms quando `showBrowser`, senão zero.

**Por que existe assim:** Facilita observar o fluxo sem penalizar CI stealth.

**Risco/regressão:** Não é garantia de sincronização; assertions devem continuar baseadas em eventos/polls.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 161

**Fonte:** `            args: launchArgs,`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `args: launchArgs,` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 162

**Fonte:** `        });`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 163

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 164

**Fonte:** `        backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 165

**Fonte:** `        await resetExtensionState(backgroundWorker);`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Aguarda operação assíncrona no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 166

**Fonte:** `    });`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 167

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 168

**Fonte:** `    test.afterEach(async () => {`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Registra cleanup após cada teste.

**Como faz:** Fecha o BrowserContext e zera referências globais.

**Por que existe assim:** Encerra páginas, worker e processo/contexto associados ao cenário.

**Risco/regressão:** Não remove explicitamente `userDataDir` do filesystem.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 169

**Fonte:** `        if (browserContext) {`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 170

**Fonte:** `            await browserContext.close();`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Fecha o persistent BrowserContext do cenário.

**Como faz:** Aguarda `close()` antes de zerar referências.

**Por que existe assim:** Libera browser/pages/SW e isola o próximo teste.

**Risco/regressão:** Não há try/finally adicional nem remoção explícita do diretório temporário.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 171

**Fonte:** `            browserContext = null;`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `browserContext = null;` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 172

**Fonte:** `            backgroundWorker = null;`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Executa a instrução `backgroundWorker = null;` no contexto `Harness Playwright: describe paralelo, persistent context isolado e cleanup.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 173

**Fonte:** `        }`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 174

**Fonte:** `    });`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 175

**Fonte:** `(linha vazia)`

**Contexto:** Harness Playwright: describe paralelo, persistent context isolado e cleanup.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 176

**Fonte:** `    test('Deve traduzir as paginas validas de ponta a ponta e encerrar o lote corretamente', { tag: '@e2e-medium-b' }, async () => {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Registra um caso Playwright: test('Deve traduzir as paginas validas de ponta a ponta e encerrar o lote corretamente', { tag: '@e2e-medium-b' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 177

**Fonte:** `        const page = await browserContext.newPage();`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 178

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 179

**Fonte:** `        await page.goto('http://localhost:3999/manga-page.html');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 180

**Fonte:** `        await page.waitForLoadState('networkidle');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 181

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 182

**Fonte:** `        await page.waitForFunction(() => {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda uma precondição DOM real dentro da página.

**Como faz:** Executa predicate no browser até true ou timeout.

**Por que existe assim:** Evita sleeps fixos e garante imagem/content script pronto.

**Risco/regressão:** Predicate incorreto pode bloquear até timeout.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 183

**Fonte:** `            const pageImages = Array.from(document.querySelectorAll('img')).filter(img =>`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 184

**Fonte:** `                img.src && img.src.includes('page_')`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `img.src && img.src.includes('page_')` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 185

**Fonte:** `            );`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 186

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 187

**Fonte:** `            return pageImages.length >= 2 &&`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 188

**Fonte:** `                pageImages.every(img => img.naturalWidth >= 300 && img.naturalHeight >= 400);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `pageImages.every(img => img.naturalWidth >= 300 && img.naturalHeight >= 400);` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 189

**Fonte:** `        }, { timeout: 15000 });`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 190

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 191

**Fonte:** `        const triggerBtn = page.locator('#manga-translator-trigger');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 192

**Fonte:** `        const mainContent = page.locator('#manga-main-content');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 193

**Fonte:** `        const pageOne = page.getByTestId('manga-image-0');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 194

**Fonte:** `        const pageTwo = page.getByTestId('manga-image-1');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 195

**Fonte:** `        const avatar = page.getByTestId('small-image');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 196

**Fonte:** `        const banner = page.getByTestId('banner-image');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 197

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 198

**Fonte:** `        await expect(triggerBtn).toBeVisible({ timeout: 10000 });`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda operação assíncrona no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 199

**Fonte:** `        await expect(mainContent).toContainText('TRADUZIR P', { timeout: 10000 });`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda operação assíncrona no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 200

**Fonte:** `        await expect.poll(async () => areBothOriginalPagesVisible(page), {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda operação assíncrona no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 201

**Fonte:** `            timeout: 10000,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `timeout: 10000,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 202

**Fonte:** `            message: 'Esperava ver as duas paginas originais ao mesmo tempo no viewport',`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `message: 'Esperava ver as duas paginas originais ao mesmo tempo no viewport',` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 203

**Fonte:** `        }).toBe(true);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 204

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 205

**Fonte:** `        const pageOneSrcBefore = await pageOne.getAttribute('src');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 206

**Fonte:** `        const pageTwoSrcBefore = await pageTwo.getAttribute('src');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 207

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 208

**Fonte:** `        await mainContent.click();`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Dispara a ação de tradução pelo controle real injetado no mangá.

**Como faz:** Executa click Playwright no conteúdo principal do botão/painel.

**Por que existe assim:** Inicia o fluxo pelo mesmo canal de UI usado pelo usuário, não por chamada interna direta.

**Risco/regressão:** Se o seletor apontar para elemento errado, o lote não inicia.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 209

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 210

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda operação assíncrona no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 211

**Fonte:** `            return page.evaluate(() => {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 212

**Fonte:** `                return Array.from(document.querySelectorAll('img[data-translated="true"]')).length;`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 213

**Fonte:** `            });`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 214

**Fonte:** `        }, {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 215

**Fonte:** `            timeout: 45000,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `timeout: 45000,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 216

**Fonte:** `            message: 'Esperava 2 imagens traduzidas no DOM do mangá',`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `message: 'Esperava 2 imagens traduzidas no DOM do mangá',` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 217

**Fonte:** `        }).toBe(2);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 218

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 219

**Fonte:** `        await expect(pageOne).toHaveAttribute('data-translated', 'true');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Prova marca explícita de tradução na página elegível.

**Como faz:** Matcher exige `data-translated='true'`.

**Por que existe assim:** Demonstra que o replace do content_manga concluiu para a imagem alvo.

**Risco/regressão:** Deve ser combinado com src e estado para evitar prova parcial.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 220

**Fonte:** `        await expect(pageTwo).toHaveAttribute('data-translated', 'true');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Prova marca explícita de tradução na página elegível.

**Como faz:** Matcher exige `data-translated='true'`.

**Por que existe assim:** Demonstra que o replace do content_manga concluiu para a imagem alvo.

**Risco/regressão:** Deve ser combinado com src e estado para evitar prova parcial.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 221

**Fonte:** `        await expect(pageOne).toHaveAttribute('src', /^data:image\/png;base64,/);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Prova que a imagem final no mangá virou Data URL PNG.

**Como faz:** Matcher verifica regex `^data:image/png;base64,` no atributo `src`.

**Por que existe assim:** Confirma contrato real: background converte resultado em base64 antes de `UPDATE_IMAGE`.

**Risco/regressão:** Não compara bytes exatos do PNG com fixture esperada.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 222

**Fonte:** `        await expect(pageTwo).toHaveAttribute('src', /^data:image\/png;base64,/);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Prova que a imagem final no mangá virou Data URL PNG.

**Como faz:** Matcher verifica regex `^data:image/png;base64,` no atributo `src`.

**Por que existe assim:** Confirma contrato real: background converte resultado em base64 antes de `UPDATE_IMAGE`.

**Risco/regressão:** Não compara bytes exatos do PNG com fixture esperada.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 223

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 224

**Fonte:** `        const pageOneSrcAfter = await pageOne.getAttribute('src');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 225

**Fonte:** `        const pageTwoSrcAfter = await pageTwo.getAttribute('src');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 226

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 227

**Fonte:** `        expect(pageOneSrcAfter).not.toBe(pageOneSrcBefore);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `expect(pageOneSrcAfter).not.toBe(pageOneSrcBefore);` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 228

**Fonte:** `        expect(pageTwoSrcAfter).not.toBe(pageTwoSrcBefore);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `expect(pageTwoSrcAfter).not.toBe(pageTwoSrcBefore);` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 229

**Fonte:** `        expect(pageOneSrcAfter).not.toBe(pageTwoSrcAfter);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `expect(pageOneSrcAfter).not.toBe(pageTwoSrcAfter);` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 230

**Fonte:** `        expect(await avatar.getAttribute('src')).toContain('/manga-images/avatar.png');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `expect(await avatar.getAttribute('src')).toContain('/manga-images/avatar.png');` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 231

**Fonte:** `        expect(await banner.getAttribute('src')).toContain('/manga-images/banner.png');`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `expect(await banner.getAttribute('src')).toContain('/manga-images/banner.png');` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 232

**Fonte:** `        expect(await avatar.getAttribute('data-translated')).toBeNull();`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Prova ausência do atributo/valor indevido no alvo negativo.

**Como faz:** Matcher exige `null`.

**Por que existe assim:** Distingue imagens extras não elegíveis das páginas de mangá traduzidas.

**Risco/regressão:** Só cobre os extras presentes na fixture atual.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 233

**Fonte:** `        expect(await banner.getAttribute('data-translated')).toBeNull();`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Prova ausência do atributo/valor indevido no alvo negativo.

**Como faz:** Matcher exige `null`.

**Por que existe assim:** Distingue imagens extras não elegíveis das páginas de mangá traduzidas.

**Risco/regressão:** Só cobre os extras presentes na fixture atual.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 234

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 235

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda operação assíncrona no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 236

**Fonte:** `            backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 237

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 238

**Fonte:** `            const state = storage.mt_state || {};`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 239

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 240

**Fonte:** `            return {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 241

**Fonte:** `                completedJobs: state.completedJobs || 0,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `completedJobs: state.completedJobs || 0,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 242

**Fonte:** `                activeJobsCount: state.activeJobsCount || 0,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `activeJobsCount: state.activeJobsCount || 0,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 243

**Fonte:** `                isProcessing: !!state.isProcessing,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `isProcessing: !!state.isProcessing,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 244

**Fonte:** `                stopRequested: !!state.stopRequested,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `stopRequested: !!state.stopRequested,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 245

**Fonte:** `                queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 246

**Fonte:** `            };`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 247

**Fonte:** `        }, {`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 248

**Fonte:** `            timeout: 30000,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `timeout: 30000,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 249

**Fonte:** `            message: 'Esperava fila vazia e lote finalizado no service worker',`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `message: 'Esperava fila vazia e lote finalizado no service worker',` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 250

**Fonte:** `        }).toEqual({`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 251

**Fonte:** `            completedJobs: 2,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `completedJobs: 2,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 252

**Fonte:** `            activeJobsCount: 0,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `activeJobsCount: 0,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 253

**Fonte:** `            isProcessing: false,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `isProcessing: false,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 254

**Fonte:** `            stopRequested: false,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `stopRequested: false,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 255

**Fonte:** `            queueLength: 0,`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Executa a instrução `queueLength: 0,` no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 256

**Fonte:** `        });`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 257

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 258

**Fonte:** `        await expect(mainContent).toContainText('TRADUZIR 2', { timeout: 10000 });`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Aguarda operação assíncrona no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 259

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 260

**Fonte:** `        await page.close();`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 261

**Fonte:** `    });`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 262

**Fonte:** `(linha vazia)`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 263

**Fonte:** `    const regressionScenarios = [`

**Contexto:** Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.

**O que faz:** Declara dado intermediário usado no contexto `Cenário E2E principal: duas páginas válidas traduzidas, extras preservados e lote drenado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 264

**Fonte:** `        {`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 265

**Fonte:** `            mode: 'temp_chat',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `mode: 'temp_chat',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 266

**Fonte:** `            basePath: '/gemini/',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `basePath: '/gemini/',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 267

**Fonte:** `            label: 'conversa temporária',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `label: 'conversa temporária',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 268

**Fonte:** `        },`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 269

**Fonte:** `        {`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 270

**Fonte:** `            mode: 'minimized_window',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `mode: 'minimized_window',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 271

**Fonte:** `            basePath: '/gemini/',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `basePath: '/gemini/',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 272

**Fonte:** `            label: 'janela minimizada',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `label: 'janela minimizada',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 273

**Fonte:** `        },`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 274

**Fonte:** `        {`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 275

**Fonte:** `            mode: 'background_delete',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `mode: 'background_delete',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 276

**Fonte:** `            basePath: '/app/mock-chat',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `basePath: '/app/mock-chat',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 277

**Fonte:** `            label: 'background com exclusão segura',`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `label: 'background com exclusão segura',` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 278

**Fonte:** `        },`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 279

**Fonte:** `    ];`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Executa a instrução `];` no contexto `Tabela de modos reutilizada pelas regressões de attachment/ownership.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 280

**Fonte:** `(linha vazia)`

**Contexto:** Tabela de modos reutilizada pelas regressões de attachment/ownership.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 281

**Fonte:** `    // Registro intencional antes do FIFO: mantém exatamente os mesmos cenários`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Comentário/documentação local: Registro intencional antes do FIFO: mantém exatamente os mesmos cenários

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 282

**Fonte:** `    // e assertions, mas equilibra a divisão 11/10 feita pelo Playwright.`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Comentário/documentação local: e assertions, mas equilibra a divisão 11/10 feita pelo Playwright.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 283

**Fonte:** `    for (const scenario of regressionScenarios) {`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Itera sobre coleção controlada do cenário.

**Como faz:** Executa cada modo/label/página sequencialmente conforme o array definido.

**Por que existe assim:** Reusa o mesmo contrato para múltiplas variantes sem duplicar corpo do teste.

**Risco/regressão:** A ordem é intencional no FIFO; em loops de cenários, cada item gera caso separado ou etapa equivalente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 284

**Fonte:** `        test(\`REG attachment gate: ${scenario.label} nunca envia texto quando a imagem não confirma\`, { tag: '@e2e-attachment' }, async () => {`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Registra um caso Playwright: test(`REG attachment gate: ${scenario.label} nunca envia texto quando a imagem não confirma`, { tag: '@e2e-attachment' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 285

**Fonte:** `            test.setTimeout(90000);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aumenta o timeout somente deste cenário pesado.

**Como faz:** Configura limite explícito em milissegundos.

**Por que existe assim:** FIFO/attachment têm múltiplas etapas reais e precisam de janela maior que o default.

**Risco/regressão:** Timeout alto pode alongar diagnóstico de hang, mas não substitui polls determinísticos.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 286

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 287

**Fonte:** `            const joiner = scenario.basePath.includes('?') ? '&' : '?';`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Declara dado intermediário usado no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 288

**Fonte:** `            await resetExtensionState(backgroundWorker, {`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 289

**Fonte:** `                geminiExecutionMode: scenario.mode,`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 290

**Fonte:** `                geminiBaseUrl:`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 291

**Fonte:** `                    \`http://127.0.0.1:3999${scenario.basePath}${joiner}attachmentFails=1\`,`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Configura o mock para nunca confirmar o attachment.

**Como faz:** Adiciona flag de query ao Gemini local.

**Por que existe assim:** Força caminho de segurança que deve bloquear prompt/submit.

**Risco/regressão:** Depende do contrato do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 292

**Fonte:** `            });`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 293

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 294

**Fonte:** `            const page = await browserContext.newPage();`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 295

**Fonte:** `            await page.goto('http://localhost:3999/manga-page.html');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 296

**Fonte:** `            await page.waitForLoadState('networkidle');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 297

**Fonte:** `            await page.evaluate(() => {`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 298

**Fonte:** `                document.querySelector('[data-testid="manga-image-1"]')?.remove();`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `document.querySelector('[data-testid="manga-image-1"]')?.remove();` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 299

**Fonte:** `            });`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 300

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 301

**Fonte:** `            const mainContent = page.locator('#manga-main-content');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 302

**Fonte:** `            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 303

**Fonte:** `            await mainContent.click();`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Dispara a ação de tradução pelo controle real injetado no mangá.

**Como faz:** Executa click Playwright no conteúdo principal do botão/painel.

**Por que existe assim:** Inicia o fluxo pelo mesmo canal de UI usado pelo usuário, não por chamada interna direta.

**Risco/regressão:** Se o seletor apontar para elemento errado, o lote não inicia.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 304

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 305

**Fonte:** `            await expect.poll(async () => {`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 306

**Fonte:** `                backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 307

**Fonte:** `                const storage = await readStorage(backgroundWorker, ['translatorLog']);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Declara dado intermediário usado no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 308

**Fonte:** `                const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Declara dado intermediário usado no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 309

**Fonte:** `                return logs.some(entry =>`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 310

**Fonte:** `                    entry && entry.action === 'GEMINI_ATTACHMENT_NOT_CONFIRMED'`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 311

**Fonte:** `                );`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 312

**Fonte:** `            }, {`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 313

**Fonte:** `                timeout: 70000,`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `timeout: 70000,` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 314

**Fonte:** `                message: \`Esperava gate de attachment no modo ${scenario.mode}\`,`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `message: 'Esperava gate de attachment no modo ${scenario.mode}',` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 315

**Fonte:** `            }).toBe(true);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 316

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 317

**Fonte:** `            if (scenario.mode === 'minimized_window') {`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 318

**Fonte:** `                expect(`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `expect(` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 319

**Fonte:** `                    page.isClosed(),`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `page.isClosed(),` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 320

**Fonte:** `                    'O fallback minimizado não pode fechar a janela que contém o mangá'`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `'O fallback minimizado não pode fechar a janela que contém o mangá'` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 321

**Fonte:** `                ).toBe(false);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `).toBe(false);` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 322

**Fonte:** `                await expect(page).toHaveURL('http://localhost:3999/manga-page.html');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 323

**Fonte:** `                await expect(mainContent).toBeVisible();`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 324

**Fonte:** `            }`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 325

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 326

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['translatorLog']);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Declara dado intermediário usado no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 327

**Fonte:** `            const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Declara dado intermediário usado no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 328

**Fonte:** `            const attachmentActions = logs`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Declara dado intermediário usado no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 329

**Fonte:** `                .filter(entry => entry && typeof entry.action === 'string')`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `.filter(entry => entry && typeof entry.action === 'string')` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 330

**Fonte:** `                .map(entry => entry.action);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `.map(entry => entry.action);` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 331

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 332

**Fonte:** `            expect(attachmentActions).toContain('ATTACHMENT_STARTED');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 333

**Fonte:** `            expect(attachmentActions).toContain('ATTACHMENT_REJECTED');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 334

**Fonte:** `            expect(attachmentActions).toContain('SUBMIT_BLOCKED_ATTACHMENT');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 335

**Fonte:** `            expect(attachmentActions).not.toContain('ATTACHMENT_CONFIRMED');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 336

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 337

**Fonte:** `            const startedAt = attachmentActions.indexOf('ATTACHMENT_STARTED');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 338

**Fonte:** `            const rejectedAt = attachmentActions.indexOf('ATTACHMENT_REJECTED');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 339

**Fonte:** `            const blockedAt = attachmentActions.indexOf('SUBMIT_BLOCKED_ATTACHMENT');`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 340

**Fonte:** `            expect(startedAt).toBeGreaterThanOrEqual(0);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `expect(startedAt).toBeGreaterThanOrEqual(0);` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 341

**Fonte:** `            expect(rejectedAt).toBeGreaterThan(startedAt);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `expect(rejectedAt).toBeGreaterThan(startedAt);` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 342

**Fonte:** `            expect(blockedAt).toBeGreaterThan(rejectedAt);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `expect(blockedAt).toBeGreaterThan(rejectedAt);` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 343

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 344

**Fonte:** `            expect(logs.some(entry => entry && entry.action === 'GEMINI_SUBMIT_ATTEMPT')).toBe(false);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 345

**Fonte:** `            expect(logs.some(entry => entry && entry.action === 'PROMPT_INJECTED')).toBe(false);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Verifica evento do gate de attachment/submission.

**Como faz:** Pesquisa ações persistidas no `translatorLog`.

**Por que existe assim:** Demonstra que failure de attachment bloqueia o envio e respeita ordem de estados.

**Risco/regressão:** Logs são parte do contrato observável deste E2E.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 346

**Fonte:** `            expect(await page.evaluate(() =>`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 347

**Fonte:** `                document.querySelectorAll('img[data-translated="true"]').length`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 348

**Fonte:** `            )).toBe(0);`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Executa a instrução `)).toBe(0);` no contexto `Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 349

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 350

**Fonte:** `            await page.close();`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 351

**Fonte:** `        });`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 352

**Fonte:** `    }`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 353

**Fonte:** `(linha vazia)`

**Contexto:** Regressão de attachment: bloqueia prompt/submit quando o anexo não é confirmado.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 354

**Fonte:** `    test('E2E FIFO N-lotes: A→B→C→D→E→F→G preserva resultados e ordem sem stale', { tag: '@e2e-fifo' }, async () => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Registra um caso Playwright: test('E2E FIFO N-lotes: A→B→C→D→E→F→G preserva resultados e ordem sem stale', { tag: '@e2e-fifo' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 355

**Fonte:** `        test.setTimeout(180000);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aumenta o timeout somente deste cenário pesado.

**Como faz:** Configura limite explícito em milissegundos.

**Por que existe assim:** FIFO/attachment têm múltiplas etapas reais e precisam de janela maior que o default.

**Risco/regressão:** Timeout alto pode alongar diagnóstico de hang, mas não substitui polls determinísticos.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 356

**Fonte:** `        const barrierId = \`fifo-${Date.now()}-${Math.random().toString(16).slice(2)}\`;`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 357

**Fonte:** `        const barrierBaseUrl =`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 358

**Fonte:** `            \`http://127.0.0.1:3999/__test/attachment-barrier/${encodeURIComponent(barrierId)}\`;`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `'http://127.0.0.1:3999/__test/attachment-barrier/${encodeURIComponent(barrierId)}';` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 359

**Fonte:** `        await resetExtensionState(backgroundWorker, {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 360

**Fonte:** `            maxConcurrentJobs: 1,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Fixa concorrência do pipeline em 1.

**Como faz:** Persiste `maxConcurrentJobs: 1` no baseline.

**Por que existe assim:** Torna scheduler e FIFO determinísticos.

**Risco/regressão:** Não cobre concorrência >1 neste arquivo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 361

**Fonte:** `            geminiExecutionMode: 'temp_chat',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 362

**Fonte:** `            // A primeira tentativa de attachment é bloqueada por uma barreira`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: A primeira tentativa de attachment é bloqueada por uma barreira

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 363

**Fonte:** `            // explícita. O teste só a libera depois de provar que B-G entraram`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: explícita. O teste só a libera depois de provar que B-G entraram

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 364

**Fonte:** `            // na fila. Assim não existe mais dependência de um sleep de 2500 ms.`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: na fila. Assim não existe mais dependência de um sleep de 2500 ms.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 365

**Fonte:** `            // As latências artificiais de geração/download também são removidas`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: As latências artificiais de geração/download também são removidas

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 366

**Fonte:** `            // somente deste teste; os defaults permanecem nos demais E2E.`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: somente deste teste; os defaults permanecem nos demais E2E.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 367

**Fonte:** `            geminiBaseUrl:`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 368

**Fonte:** `                \`http://127.0.0.1:3999/gemini/?attachmentBarrierId=${encodeURIComponent(barrierId)}\` +`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Propaga identificador único da barreira de attachment ao mock Gemini.

**Como faz:** Inclui query param codificado na URL base.

**Por que existe assim:** Prende somente o primeiro lote do cenário FIFO até a liberação explícita.

**Risco/regressão:** Colisão de ID poderia cruzar cenários; timestamp+random reduz isso.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 369

**Fonte:** `                '&generationDelayMs=0&resultImageDelayMs=0',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Remove latência artificial do mock apenas no FIFO.

**Como faz:** Define query params de geração/resultado como zero.

**Por que existe assim:** A barreira já fornece sincronização determinística e o teste A→G seria desnecessariamente lento com delays default.

**Risco/regressão:** Não altera os defaults dos demais E2E.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 370

**Fonte:** `        });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 371

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 372

**Fonte:** `        const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 373

**Fonte:** `        const pages = [];`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 374

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 375

**Fonte:** `        for (const label of labels) {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Itera sobre coleção controlada do cenário.

**Como faz:** Executa cada modo/label/página sequencialmente conforme o array definido.

**Por que existe assim:** Reusa o mesmo contrato para múltiplas variantes sem duplicar corpo do teste.

**Risco/regressão:** A ordem é intencional no FIFO; em loops de cenários, cada item gera caso separado ou etapa equivalente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 376

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 377

**Fonte:** `            const page = await browserContext.newPage();`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 378

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 379

**Fonte:** `            await page.goto(\`http://localhost:3999/manga-page.html?fifo=${label}\`);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 380

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 381

**Fonte:** `            await page.waitForLoadState('networkidle');`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 382

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 383

**Fonte:** `            await page.waitForFunction(() => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda uma precondição DOM real dentro da página.

**Como faz:** Executa predicate no browser até true ou timeout.

**Por que existe assim:** Evita sleeps fixos e garante imagem/content script pronto.

**Risco/regressão:** Predicate incorreto pode bloquear até timeout.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 384

**Fonte:** `                const image = document.querySelector('[data-testid="manga-image-0"]');`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 385

**Fonte:** `                return image && image.naturalWidth >= 300 && image.naturalHeight >= 400;`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 386

**Fonte:** `            }, { timeout: 15000 });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 387

**Fonte:** `            // Cada aba representa um lote de uma única página.`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: Cada aba representa um lote de uma única página.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 388

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 389

**Fonte:** `            await page.evaluate(() => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 390

**Fonte:** `                document.querySelector('[data-testid="manga-image-1"]')?.remove();`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `document.querySelector('[data-testid="manga-image-1"]')?.remove();` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 391

**Fonte:** `            });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 392

**Fonte:** `            pages.push(page);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `pages.push(page);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 393

**Fonte:** `        }`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 394

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 395

**Fonte:** `        const tabIds = await backgroundWorker.evaluate(async labelsToFind => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa lógica no Service Worker real da extensão.

**Como faz:** Usa Playwright Worker.evaluate para acessar APIs Chrome privilegiadas.

**Por que existe assim:** Permite preparar/ler estado e enviar mensagens usando o runtime real.

**Risco/regressão:** Se o worker suspender, é necessário reacquirí-lo por `getBackgroundWorker`.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 396

**Fonte:** `            return new Promise(resolve => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 397

**Fonte:** `                chrome.tabs.query({}, tabs => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Enumera tabs reais do profile para mapear A–G a IDs Chrome.

**Como faz:** Executa `chrome.tabs.query` no Service Worker.

**Por que existe assim:** O scheduler trabalha com `mangaTabId`, então o teste precisa correlacionar páginas e batches.

**Risco/regressão:** URLs precisam ser únicas pelo query `?fifo=<label>`.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 398

**Fonte:** `                    const result = {};`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 399

**Fonte:** `                    labelsToFind.forEach(label => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 400

**Fonte:** `                        const match = (tabs || []).find(tab =>`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 401

**Fonte:** `                            String(tab.url || '').includes(\`manga-page.html?fifo=${label}\`)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `String(tab.url || '').includes('manga-page.html?fifo=${label}')` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 402

**Fonte:** `                        );`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 403

**Fonte:** `                        result[label] = match ? match.id : null;`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `result[label] = match ? match.id : null;` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 404

**Fonte:** `                    });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 405

**Fonte:** `                    resolve(result);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `resolve(result);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 406

**Fonte:** `                });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 407

**Fonte:** `            });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 408

**Fonte:** `        }, labels);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 409

**Fonte:** `        labels.forEach(label => expect(tabIds[label]).not.toBeNull());`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Prova ausência do atributo/valor indevido no alvo negativo.

**Como faz:** Matcher exige `null`.

**Por que existe assim:** Distingue imagens extras não elegíveis das páginas de mangá traduzidas.

**Risco/regressão:** Só cobre os extras presentes na fixture atual.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 410

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 411

**Fonte:** `        const startReaderBatch = async label => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 412

**Fonte:** `            return backgroundWorker.evaluate(async tabId => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa lógica no Service Worker real da extensão.

**Como faz:** Usa Playwright Worker.evaluate para acessar APIs Chrome privilegiadas.

**Por que existe assim:** Permite preparar/ler estado e enviar mensagens usando o runtime real.

**Risco/regressão:** Se o worker suspender, é necessário reacquirí-lo por `getBackgroundWorker`.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 413

**Fonte:** `                return new Promise(resolve => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 414

**Fonte:** `                    chrome.tabs.sendMessage(tabId, {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Dispara tradução de uma aba específica pelo IPC real.

**Como faz:** Envia `START_TRANSLATION_FROM_POPUP` com índice 0 ao content script.

**Por que existe assim:** Permite iniciar sete lotes sem depender de sete cliques visuais e preserva o canal real de extensão.

**Risco/regressão:** Erro runtime é convertido em `{ok:false,error}` e a assertion subsequente deve falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 415

**Fonte:** `                        action: 'START_TRANSLATION_FROM_POPUP',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `action: 'START_TRANSLATION_FROM_POPUP',` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 416

**Fonte:** `                        indices: [0],`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `indices: [0],` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 417

**Fonte:** `                    }, response => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 418

**Fonte:** `                        const error = chrome.runtime.lastError;`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Captura erro do envio de mensagem Chrome.

**Como faz:** Lê `chrome.runtime.lastError` dentro do callback.

**Por que existe assim:** Evita que falha de IPC seja silenciosamente confundida com resposta vazia.

**Risco/regressão:** Apenas este helper de mensagem faz tratamento explícito; storage reset/read não fazem.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 419

**Fonte:** `                        resolve(error ? { ok: false, error: error.message } : (response || null));`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `resolve(error ? { ok: false, error: error.message } : (response || null));` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 420

**Fonte:** `                    });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 421

**Fonte:** `                });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 422

**Fonte:** `            }, tabIds[label]);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 423

**Fonte:** `        };`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 424

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 425

**Fonte:** `        expect(await startReaderBatch('A')).toEqual(expect.objectContaining({ ok: true }));`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(await startReaderBatch('A')).toEqual(expect.objectContaining({ ok: true }));` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 426

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 427

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 428

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 429

**Fonte:** `            const state = storage.mt_state || {};`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 430

**Fonte:** `            return Boolean(`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 431

**Fonte:** `                state.currentBatchId &&`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `state.currentBatchId &&` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 432

**Fonte:** `                state.activeMangaTabId === tabIds.A &&`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `state.activeMangaTabId === tabIds.A &&` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 433

**Fonte:** `                state.isProcessing`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `state.isProcessing` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 434

**Fonte:** `            );`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 435

**Fonte:** `        }, {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 436

**Fonte:** `            timeout: 15000,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `timeout: 15000,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 437

**Fonte:** `            message: 'Lote A deveria assumir o scheduler antes da fila B-G',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `message: 'Lote A deveria assumir o scheduler antes da fila B-G',` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 438

**Fonte:** `        }).toBe(true);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 439

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 440

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 441

**Fonte:** `            const response = await fetch(\`${barrierBaseUrl}/status\`);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta/aciona a barreira determinística do mock HTTP.

**Como faz:** Usa endpoint local de status/release/arrive conforme a etapa.

**Por que existe assim:** Coordena o primeiro attachment sem `sleep`, permitindo provar que B–G entram na fila antes de A prosseguir.

**Risco/regressão:** Compartilhamento do mock server exige barrierId único por teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 442

**Fonte:** `            if (!response.ok) return false;`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 443

**Fonte:** `            const barrier = await response.json();`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 444

**Fonte:** `            return barrier.arrivals === 1 &&`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 445

**Fonte:** `                barrier.waiting === 1 &&`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `barrier.waiting === 1 &&` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 446

**Fonte:** `                barrier.released === false;`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `barrier.released === false;` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 447

**Fonte:** `        }, {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 448

**Fonte:** `            timeout: 15000,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `timeout: 15000,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 449

**Fonte:** `            message: 'Lote A deveria alcançar a barreira de attachment antes de enfileirar B-G',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `message: 'Lote A deveria alcançar a barreira de attachment antes de enfileirar B-G',` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 450

**Fonte:** `        }).toBe(true);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 451

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 452

**Fonte:** `        let stateData = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 453

**Fonte:** `        const batchIds = [stateData.mt_state.currentBatchId];`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 454

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 455

**Fonte:** `        for (let index = 1; index < labels.length; index++) {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Itera sobre coleção controlada do cenário.

**Como faz:** Executa cada modo/label/página sequencialmente conforme o array definido.

**Por que existe assim:** Reusa o mesmo contrato para múltiplas variantes sem duplicar corpo do teste.

**Risco/regressão:** A ordem é intencional no FIFO; em loops de cenários, cada item gera caso separado ou etapa equivalente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 456

**Fonte:** `            const label = labels[index];`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 457

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 458

**Fonte:** `            expect(await startReaderBatch(label)).toEqual(expect.objectContaining({ ok: true }));`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(await startReaderBatch(label)).toEqual(expect.objectContaining({ ok: true }));` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 459

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 460

**Fonte:** `            // Aguarda este content script terminar hashing/seleção e efetivamente`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: Aguarda este content script terminar hashing/seleção e efetivamente

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 461

**Fonte:** `            // registrar seu START_BATCH no fim da fila.`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: registrar seu START_BATCH no fim da fila.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 462

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 463

**Fonte:** `            await expect.poll(async () => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 464

**Fonte:** `                const storage = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 465

**Fonte:** `                const pending = storage.mt_state?.pendingBatches || [];`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 466

**Fonte:** `                return pending.length >= index &&`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 467

**Fonte:** `                    pending[index - 1]?.mangaTabId === tabIds[label];`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `pending[index - 1]?.mangaTabId === tabIds[label];` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 468

**Fonte:** `            }, {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 469

**Fonte:** `                timeout: 15000,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `timeout: 15000,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 470

**Fonte:** `                message: \`Lote ${label} deveria ocupar a posição FIFO ${index}\`,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `message: 'Lote ${label} deveria ocupar a posição FIFO ${index}',` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 471

**Fonte:** `            }).toBe(true);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 472

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 473

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 474

**Fonte:** `            stateData = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `stateData = await readStorage(backgroundWorker, ['mt_state']);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 475

**Fonte:** `            batchIds.push(stateData.mt_state.pendingBatches[index - 1].batchId);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `batchIds.push(stateData.mt_state.pendingBatches[index - 1].batchId);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 476

**Fonte:** `        }`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 477

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 478

**Fonte:** `        stateData = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `stateData = await readStorage(backgroundWorker, ['mt_state']);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 479

**Fonte:** `        expect(stateData.mt_state.currentBatchId).toBe(batchIds[0]);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(stateData.mt_state.currentBatchId).toBe(batchIds[0]);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 480

**Fonte:** `        expect(stateData.mt_state.pendingBatches.map(batch => batch.batchId))`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(stateData.mt_state.pendingBatches.map(batch => batch.batchId))` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 481

**Fonte:** `            .toEqual(batchIds.slice(1));`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `.toEqual(batchIds.slice(1));` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 482

**Fonte:** `        expect(stateData.mt_state.pendingBatches.map(batch => batch.mangaTabId))`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(stateData.mt_state.pendingBatches.map(batch => batch.mangaTabId))` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 483

**Fonte:** `            .toEqual(labels.slice(1).map(label => tabIds[label]));`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `.toEqual(labels.slice(1).map(label => tabIds[label]));` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 484

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 485

**Fonte:** `        const releaseResponse = await fetch(\`${barrierBaseUrl}/release\`, {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta/aciona a barreira determinística do mock HTTP.

**Como faz:** Usa endpoint local de status/release/arrive conforme a etapa.

**Por que existe assim:** Coordena o primeiro attachment sem `sleep`, permitindo provar que B–G entram na fila antes de A prosseguir.

**Risco/regressão:** Compartilhamento do mock server exige barrierId único por teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 486

**Fonte:** `            method: 'POST',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `method: 'POST',` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 487

**Fonte:** `        });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 488

**Fonte:** `        expect(releaseResponse.ok).toBe(true);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(releaseResponse.ok).toBe(true);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 489

**Fonte:** `        const releasedBarrier = await releaseResponse.json();`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 490

**Fonte:** `        expect(releasedBarrier).toEqual(expect.objectContaining({`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 491

**Fonte:** `            ok: true,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `ok: true,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 492

**Fonte:** `            arrivals: 1,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `arrivals: 1,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 493

**Fonte:** `            waiting: 0,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `waiting: 0,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 494

**Fonte:** `            released: true,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `released: true,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 495

**Fonte:** `        }));`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 496

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 497

**Fonte:** `        for (let index = 0; index < pages.length; index++) {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Itera sobre coleção controlada do cenário.

**Como faz:** Executa cada modo/label/página sequencialmente conforme o array definido.

**Por que existe assim:** Reusa o mesmo contrato para múltiplas variantes sem duplicar corpo do teste.

**Risco/regressão:** A ordem é intencional no FIFO; em loops de cenários, cada item gera caso separado ou etapa equivalente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 498

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 499

**Fonte:** `            await expect.poll(async () => pages[index].evaluate(() =>`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 500

**Fonte:** `                document.querySelectorAll('img[data-translated="true"]').length`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 501

**Fonte:** `            ), {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 502

**Fonte:** `                timeout: 150000,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `timeout: 150000,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 503

**Fonte:** `                message: \`Lote ${labels[index]} deveria receber seu resultado sem ser invalidado pelos lotes seguintes\`,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `message: 'Lote ${labels[index]} deveria receber seu resultado sem ser invalidado pelos lotes seguintes',` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 504

**Fonte:** `            }).toBe(1);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 505

**Fonte:** `        }`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 506

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 507

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Aguarda operação assíncrona no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 508

**Fonte:** `            backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 509

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 510

**Fonte:** `            const state = storage.mt_state || {};`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 511

**Fonte:** `            return {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 512

**Fonte:** `                currentBatchId: state.currentBatchId || null,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `currentBatchId: state.currentBatchId || null,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 513

**Fonte:** `                completedJobs: state.completedJobs || 0,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `completedJobs: state.completedJobs || 0,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 514

**Fonte:** `                totalJobs: state.totalJobs || 0,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `totalJobs: state.totalJobs || 0,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 515

**Fonte:** `                activeJobsCount: state.activeJobsCount || 0,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `activeJobsCount: state.activeJobsCount || 0,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 516

**Fonte:** `                isProcessing: !!state.isProcessing,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `isProcessing: !!state.isProcessing,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 517

**Fonte:** `                queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `queueLength: Array.isArray(state.jobQueue) ? state.jobQueue.length : -1,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 518

**Fonte:** `                pendingIds: Array.isArray(state.pendingBatches)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `pendingIds: Array.isArray(state.pendingBatches)` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 519

**Fonte:** `                    ? state.pendingBatches.map(batch => batch.batchId)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `? state.pendingBatches.map(batch => batch.batchId)` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 520

**Fonte:** `                    : null,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `: null,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 521

**Fonte:** `                jobIndexLength: Array.isArray(state.jobIndex) ? state.jobIndex.length : -1,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `jobIndexLength: Array.isArray(state.jobIndex) ? state.jobIndex.length : -1,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 522

**Fonte:** `            };`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 523

**Fonte:** `        }, {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 524

**Fonte:** `            timeout: 150000,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `timeout: 150000,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 525

**Fonte:** `            message: 'Todos os sete lotes deveriam drenar a fila FIFO completamente',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `message: 'Todos os sete lotes deveriam drenar a fila FIFO completamente',` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 526

**Fonte:** `        }).toEqual({`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 527

**Fonte:** `            currentBatchId: batchIds[batchIds.length - 1],`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `currentBatchId: batchIds[batchIds.length - 1],` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 528

**Fonte:** `            completedJobs: 1,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `completedJobs: 1,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 529

**Fonte:** `            totalJobs: 1,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `totalJobs: 1,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 530

**Fonte:** `            activeJobsCount: 0,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `activeJobsCount: 0,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 531

**Fonte:** `            isProcessing: false,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `isProcessing: false,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 532

**Fonte:** `            queueLength: 0,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `queueLength: 0,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 533

**Fonte:** `            pendingIds: [],`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `pendingIds: [],` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 534

**Fonte:** `            jobIndexLength: 0,`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `jobIndexLength: 0,` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 535

**Fonte:** `        });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 536

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 537

**Fonte:** `        const storage = await readStorage(backgroundWorker, ['translatorLog']);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 538

**Fonte:** `        const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 539

**Fonte:** `        const schedulerLogs = logs.filter(entry => entry?.source === 'bg');`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Declara dado intermediário usado no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 540

**Fonte:** `        const queuedLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_QUEUED');`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 541

**Fonte:** `        const promotedLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_PROMOTED');`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 542

**Fonte:** `        const doneLogs = schedulerLogs.filter(entry => entry?.action === 'BATCH_DONE');`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 543

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 544

**Fonte:** `        expect(queuedLogs.map(entry => entry.extra?.queuePosition)).toEqual([1, 2, 3, 4, 5, 6]);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(queuedLogs.map(entry => entry.extra?.queuePosition)).toEqual([1, 2, 3, 4, 5, 6]);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 545

**Fonte:** `        expect(promotedLogs.map(entry => entry.extra?.batchId)).toEqual(`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(promotedLogs.map(entry => entry.extra?.batchId)).toEqual(` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 546

**Fonte:** `            batchIds.slice(1).map(id => id.slice(0, 8))`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `batchIds.slice(1).map(id => id.slice(0, 8))` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 547

**Fonte:** `        );`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 548

**Fonte:** `        expect(doneLogs.map(entry => entry.extra?.batchId)).toEqual(`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(doneLogs.map(entry => entry.extra?.batchId)).toEqual(` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 549

**Fonte:** `            batchIds.map(id => id.slice(0, 8))`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `batchIds.map(id => id.slice(0, 8))` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 550

**Fonte:** `        );`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 551

**Fonte:** `        expect(logs.some(entry => entry && [`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `expect(logs.some(entry => entry && [` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 552

**Fonte:** `            'RESULT_JOB_IDENTITY_MISMATCH',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 553

**Fonte:** `            'RESULT_COMMIT_REJECTED',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 554

**Fonte:** `            'STALE_UPDATE',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 555

**Fonte:** `            'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 556

**Fonte:** `        ].includes(entry.action))).toBe(false);`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Executa a instrução `].includes(entry.action))).toBe(false);` no contexto `Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 557

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 558

**Fonte:** `        for (const page of pages) {`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Itera sobre coleção controlada do cenário.

**Como faz:** Executa cada modo/label/página sequencialmente conforme o array definido.

**Por que existe assim:** Reusa o mesmo contrato para múltiplas variantes sem duplicar corpo do teste.

**Risco/regressão:** A ordem é intencional no FIFO; em loops de cenários, cada item gera caso separado ou etapa equivalente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 559

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Comentário/documentação local: eslint-disable-next-line no-await-in-loop

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 560

**Fonte:** `            await page.close();`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 561

**Fonte:** `        }`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 562

**Fonte:** `    });`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 563

**Fonte:** `(linha vazia)`

**Contexto:** Regressão FIFO A→G: sete lotes, barreira determinística, ordem e ausência de stale.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 564

**Fonte:** `    for (const scenario of [`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Itera sobre coleção controlada do cenário.

**Como faz:** Executa cada modo/label/página sequencialmente conforme o array definido.

**Por que existe assim:** Reusa o mesmo contrato para múltiplas variantes sem duplicar corpo do teste.

**Risco/regressão:** A ordem é intencional no FIFO; em loops de cenários, cada item gera caso separado ou etapa equivalente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 565

**Fonte:** `        {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 566

**Fonte:** `            mode: 'minimized_window',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `mode: 'minimized_window',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 567

**Fonte:** `            baseUrl: 'http://127.0.0.1:3999/gemini/',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `baseUrl: 'http://127.0.0.1:3999/gemini/',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 568

**Fonte:** `            label: 'janela minimizada',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `label: 'janela minimizada',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 569

**Fonte:** `        },`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 570

**Fonte:** `        {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 571

**Fonte:** `            mode: 'background_delete',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `mode: 'background_delete',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 572

**Fonte:** `            baseUrl: 'http://127.0.0.1:3999/app/mock-chat',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `baseUrl: 'http://127.0.0.1:3999/app/mock-chat',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 573

**Fonte:** `            label: 'background com exclusão segura',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `label: 'background com exclusão segura',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 574

**Fonte:** `        },`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 575

**Fonte:** `    ]) {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 576

**Fonte:** `        test(\`Executa o lote em ${scenario.label} sem depender de ghost mousemove\`, { tag: scenario.mode === 'background_delete' ? '@e2e-medium-a' : '@e2e-medium-b' }, async () => {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Registra um caso Playwright: test(`Executa o lote em ${scenario.label} sem depender de ghost mousemove`, { tag: scenario.mode === 'background_delete' ? '@e2e-medium-a' : '@e2e-medium-b' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 577

**Fonte:** `            await resetExtensionState(backgroundWorker, {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aguarda operação assíncrona no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 578

**Fonte:** `                geminiExecutionMode: scenario.mode,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 579

**Fonte:** `                geminiBaseUrl: scenario.baseUrl,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 580

**Fonte:** `            });`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 581

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 582

**Fonte:** `            const page = await browserContext.newPage();`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 583

**Fonte:** `            await page.goto('http://localhost:3999/manga-page.html');`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 584

**Fonte:** `            await page.waitForLoadState('networkidle');`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 585

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 586

**Fonte:** `            // Estes cenários validam o modo de execução/anti-throttling, não`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Comentário/documentação local: Estes cenários validam o modo de execução/anti-throttling, não

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 587

**Fonte:** `            // concorrência. Deixamos uma única página elegível para reduzir`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Comentário/documentação local: concorrência. Deixamos uma única página elegível para reduzir

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 588

**Fonte:** `            // ruído de cleanup entre janelas e tornar o gate determinístico.`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Comentário/documentação local: ruído de cleanup entre janelas e tornar o gate determinístico.

**Como faz:** É ignorado pelo runtime e serve como contrato humano próximo ao código.

**Por que existe assim:** Explica intenção, premissa ou razão de desenho do E2E no ponto em que ela importa.

**Risco/regressão:** Se ficar desatualizado pode induzir manutenção incorreta, embora não mude a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 589

**Fonte:** `            await page.evaluate(() => {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 590

**Fonte:** `                const second = document.querySelector('[data-testid="manga-image-1"]');`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Declara dado intermediário usado no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 591

**Fonte:** `                if (second) second.remove();`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 592

**Fonte:** `            });`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 593

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 594

**Fonte:** `            const mainContent = page.locator('#manga-main-content');`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 595

**Fonte:** `            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aguarda operação assíncrona no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 596

**Fonte:** `            await mainContent.click();`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Dispara a ação de tradução pelo controle real injetado no mangá.

**Como faz:** Executa click Playwright no conteúdo principal do botão/painel.

**Por que existe assim:** Inicia o fluxo pelo mesmo canal de UI usado pelo usuário, não por chamada interna direta.

**Risco/regressão:** Se o seletor apontar para elemento errado, o lote não inicia.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 597

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 598

**Fonte:** `            await expect.poll(async () => {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aguarda operação assíncrona no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 599

**Fonte:** `                return page.evaluate(() =>`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 600

**Fonte:** `                    document.querySelectorAll('img[data-translated="true"]').length`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 601

**Fonte:** `                );`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 602

**Fonte:** `            }, {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 603

**Fonte:** `                timeout: 60000,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `timeout: 60000,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 604

**Fonte:** `                message: \`Esperava tradução completa no modo ${scenario.mode}\`,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `message: 'Esperava tradução completa no modo ${scenario.mode}',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 605

**Fonte:** `            }).toBe(1);`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 606

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 607

**Fonte:** `            await expect.poll(async () => {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aguarda operação assíncrona no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 608

**Fonte:** `                backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 609

**Fonte:** `                const storage = await readStorage(backgroundWorker, [`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Declara dado intermediário usado no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 610

**Fonte:** `                    'mt_state',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `'mt_state',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 611

**Fonte:** `                    'translatorLog',`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `'translatorLog',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 612

**Fonte:** `                ]);`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `]);` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 613

**Fonte:** `                const state = storage.mt_state || {};`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Declara dado intermediário usado no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 614

**Fonte:** `                const logs = Array.isArray(storage.translatorLog)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Declara dado intermediário usado no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 615

**Fonte:** `                    ? storage.translatorLog`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `? storage.translatorLog` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 616

**Fonte:** `                    : [];`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `: [];` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 617

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 618

**Fonte:** `                return {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 619

**Fonte:** `                    activeJobsCount: state.activeJobsCount || 0,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `activeJobsCount: state.activeJobsCount || 0,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 620

**Fonte:** `                    isProcessing: !!state.isProcessing,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `isProcessing: !!state.isProcessing,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 621

**Fonte:** `                    queueLength: Array.isArray(state.jobQueue)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `queueLength: Array.isArray(state.jobQueue)` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 622

**Fonte:** `                        ? state.jobQueue.length`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `? state.jobQueue.length` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 623

**Fonte:** `                        : -1,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `: -1,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 624

**Fonte:** `                    batchDone: logs.some(entry =>`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `batchDone: logs.some(entry =>` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 625

**Fonte:** `                        entry && entry.action === 'BATCH_DONE'`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Consulta evento de scheduler/ownership no `translatorLog`.

**Como faz:** Filtra ou compara `action` e metadados gravados pelo background.

**Por que existe assim:** Usa observabilidade real para provar ordem FIFO e ausência de stale/cross-batch.

**Risco/regressão:** Mudança de schema/nome de log requer migração do teste mesmo se comportamento equivalente permanecer.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 626

**Fonte:** `                    ),`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `),` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 627

**Fonte:** `                };`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 628

**Fonte:** `            }, {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 629

**Fonte:** `                timeout: 45000,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `timeout: 45000,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 630

**Fonte:** `                message: \`Esperava lote finalizado no modo ${scenario.mode}\`,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `message: 'Esperava lote finalizado no modo ${scenario.mode}',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 631

**Fonte:** `            }).toEqual({`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 632

**Fonte:** `                activeJobsCount: 0,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `activeJobsCount: 0,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 633

**Fonte:** `                isProcessing: false,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `isProcessing: false,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 634

**Fonte:** `                queueLength: 0,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `queueLength: 0,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 635

**Fonte:** `                batchDone: true,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `batchDone: true,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 636

**Fonte:** `            });`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 637

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 638

**Fonte:** `            if (scenario.mode === 'background_delete' || scenario.mode === 'minimized_window') {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 639

**Fonte:** `                await expect.poll(async () => {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Aguarda operação assíncrona no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 640

**Fonte:** `                    const storage = await readStorage(backgroundWorker, ['translatorLog']);`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Declara dado intermediário usado no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 641

**Fonte:** `                    const logs = Array.isArray(storage.translatorLog)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Declara dado intermediário usado no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 642

**Fonte:** `                        ? storage.translatorLog`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `? storage.translatorLog` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 643

**Fonte:** `                        : [];`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `: [];` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 644

**Fonte:** `                    return logs.some(entry =>`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 645

**Fonte:** `                        entry && entry.action === 'DELETE_OK'`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Verifica conclusão da exclusão segura da conversa/janela do modo.

**Como faz:** Faz poll até `translatorLog` conter `DELETE_OK`.

**Por que existe assim:** Tradução concluída não basta; o modo também deve fechar/excluir sua conversa com segurança.

**Risco/regressão:** Contrato depende da emissão consistente do log.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 646

**Fonte:** `                    );`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 647

**Fonte:** `                }, {`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 648

**Fonte:** `                    timeout: 15000,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `timeout: 15000,` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 649

**Fonte:** `                    message: \`Esperava exclusão segura confirmada no log para ${scenario.mode}\`,`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Executa a instrução `message: 'Esperava exclusão segura confirmada no log para ${scenario.mode}',` no contexto `Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 650

**Fonte:** `                }).toBe(true);`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 651

**Fonte:** `            }`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 652

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 653

**Fonte:** `            await page.close();`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 654

**Fonte:** `        });`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 655

**Fonte:** `    }`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 656

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 657

**Fonte:** `(linha vazia)`

**Contexto:** Modos minimized_window/background_delete sem ghost mousemove e com deleção segura.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 658

**Fonte:** `    test('E2E resposta rápida: resultado no mesmo instante lógico do submit não é perdido', { tag: '@e2e-fast' }, async () => {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Registra um caso Playwright: test('E2E resposta rápida: resultado no mesmo instante lógico do submit não é perdido', { tag: '@e2e-fast' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 659

**Fonte:** `        await resetExtensionState(backgroundWorker, {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Aguarda operação assíncrona no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 660

**Fonte:** `            geminiExecutionMode: 'temp_chat',`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 661

**Fonte:** `            geminiBaseUrl: 'http://127.0.0.1:3999/gemini/?fastResult=1',`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 662

**Fonte:** `        });`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 663

**Fonte:** `(linha vazia)`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 664

**Fonte:** `        const page = await browserContext.newPage();`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 665

**Fonte:** `        await page.goto('http://localhost:3999/manga-page.html');`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 666

**Fonte:** `        await page.waitForLoadState('networkidle');`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 667

**Fonte:** `(linha vazia)`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 668

**Fonte:** `        await page.evaluate(() => {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 669

**Fonte:** `            const second = document.querySelector('[data-testid="manga-image-1"]');`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Declara dado intermediário usado no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 670

**Fonte:** `            if (second) second.remove();`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 671

**Fonte:** `        });`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 672

**Fonte:** `(linha vazia)`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 673

**Fonte:** `        const mainContent = page.locator('#manga-main-content');`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 674

**Fonte:** `        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Aguarda operação assíncrona no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 675

**Fonte:** `        await mainContent.click();`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Dispara a ação de tradução pelo controle real injetado no mangá.

**Como faz:** Executa click Playwright no conteúdo principal do botão/painel.

**Por que existe assim:** Inicia o fluxo pelo mesmo canal de UI usado pelo usuário, não por chamada interna direta.

**Risco/regressão:** Se o seletor apontar para elemento errado, o lote não inicia.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 676

**Fonte:** `(linha vazia)`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 677

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Aguarda operação assíncrona no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 678

**Fonte:** `            return page.evaluate(() =>`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 679

**Fonte:** `                document.querySelectorAll('img[data-translated="true"]').length`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 680

**Fonte:** `            );`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 681

**Fonte:** `        }, {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 682

**Fonte:** `            timeout: 30000,`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `timeout: 30000,` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 683

**Fonte:** `            message: 'Observer V3 deveria capturar resultado instantâneo',`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `message: 'Observer V3 deveria capturar resultado instantâneo',` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 684

**Fonte:** `        }).toBe(1);`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 685

**Fonte:** `(linha vazia)`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 686

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Aguarda operação assíncrona no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 687

**Fonte:** `            backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 688

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Declara dado intermediário usado no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 689

**Fonte:** `            const state = storage.mt_state || {};`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Declara dado intermediário usado no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 690

**Fonte:** `            return {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 691

**Fonte:** `                completedJobs: state.completedJobs || 0,`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `completedJobs: state.completedJobs || 0,` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 692

**Fonte:** `                activeJobsCount: state.activeJobsCount || 0,`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `activeJobsCount: state.activeJobsCount || 0,` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 693

**Fonte:** `                jobIndex: Array.isArray(state.jobIndex) ? state.jobIndex : [],`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `jobIndex: Array.isArray(state.jobIndex) ? state.jobIndex : [],` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 694

**Fonte:** `            };`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 695

**Fonte:** `        }, {`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 696

**Fonte:** `            timeout: 30000,`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `timeout: 30000,` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 697

**Fonte:** `            message: 'Esperava finalização completa após resposta instantânea',`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `message: 'Esperava finalização completa após resposta instantânea',` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 698

**Fonte:** `        }).toEqual({`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 699

**Fonte:** `            completedJobs: 1,`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `completedJobs: 1,` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 700

**Fonte:** `            activeJobsCount: 0,`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `activeJobsCount: 0,` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 701

**Fonte:** `            jobIndex: [],`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Executa a instrução `jobIndex: [],` no contexto `Resultado rápido no mesmo instante lógico do submit.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 702

**Fonte:** `        });`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 703

**Fonte:** `(linha vazia)`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 704

**Fonte:** `        await page.close();`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 705

**Fonte:** `    });`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 706

**Fonte:** `(linha vazia)`

**Contexto:** Resultado rápido no mesmo instante lógico do submit.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 707

**Fonte:** `    test('E2E resultado atual do Gemini: shadow DOM + wrapper assistant é detectado sem intervenção manual', { tag: '@e2e-fast' }, async () => {`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Registra um caso Playwright: test('E2E resultado atual do Gemini: shadow DOM + wrapper assistant é detectado sem intervenção manual', { tag: '@e2e-fast' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 708

**Fonte:** `        await resetExtensionState(backgroundWorker, {`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Aguarda operação assíncrona no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 709

**Fonte:** `            geminiExecutionMode: 'temp_chat',`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 710

**Fonte:** `            geminiBaseUrl:`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 711

**Fonte:** `                'http://127.0.0.1:3999/gemini/?shadowResult=1&relaxedResultContainer=1',`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Configura resultado no shadow DOM e container assistant alternativo.

**Como faz:** Ativa flags de query do mock.

**Por que existe assim:** Exercita DOM contemporâneo/relaxado sem intervenção manual.

**Risco/regressão:** Mock precisa acompanhar formas relevantes do Gemini real.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 712

**Fonte:** `        });`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 713

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 714

**Fonte:** `        const page = await browserContext.newPage();`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 715

**Fonte:** `        await page.goto('http://localhost:3999/manga-page.html');`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 716

**Fonte:** `        await page.waitForLoadState('networkidle');`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 717

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 718

**Fonte:** `        await page.evaluate(() => {`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 719

**Fonte:** `            document.querySelector('[data-testid="manga-image-1"]')?.remove();`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `document.querySelector('[data-testid="manga-image-1"]')?.remove();` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 720

**Fonte:** `        });`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 721

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 722

**Fonte:** `        const mainContent = page.locator('#manga-main-content');`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 723

**Fonte:** `        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Aguarda operação assíncrona no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 724

**Fonte:** `        await mainContent.click();`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Dispara a ação de tradução pelo controle real injetado no mangá.

**Como faz:** Executa click Playwright no conteúdo principal do botão/painel.

**Por que existe assim:** Inicia o fluxo pelo mesmo canal de UI usado pelo usuário, não por chamada interna direta.

**Risco/regressão:** Se o seletor apontar para elemento errado, o lote não inicia.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 725

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 726

**Fonte:** `        await expect.poll(async () => page.evaluate(() =>`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 727

**Fonte:** `            document.querySelectorAll('img[data-translated="true"]').length`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 728

**Fonte:** `        ), {`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 729

**Fonte:** `            timeout: 45000,`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `timeout: 45000,` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 730

**Fonte:** `            message: 'Resultado em shadow DOM deveria ser detectado automaticamente',`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `message: 'Resultado em shadow DOM deveria ser detectado automaticamente',` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 731

**Fonte:** `        }).toBe(1);`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 732

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 733

**Fonte:** `        const storage = await readStorage(backgroundWorker, ['translatorLog']);`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Declara dado intermediário usado no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 734

**Fonte:** `        const logs = Array.isArray(storage.translatorLog)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Declara dado intermediário usado no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 735

**Fonte:** `            ? storage.translatorLog`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `? storage.translatorLog` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 736

**Fonte:** `            : [];`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `: [];` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 737

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 738

**Fonte:** `        expect(logs.some(entry =>`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `expect(logs.some(entry =>` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 739

**Fonte:** `            entry && entry.action === 'GEMINI_RESULT_ACCEPTED' &&`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 740

**Fonte:** `            entry.extra?.reason === 'new_model_turn'`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 741

**Fonte:** `        )).toBe(true);`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `)).toBe(true);` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 742

**Fonte:** `        expect(logs.some(entry =>`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `expect(logs.some(entry =>` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 743

**Fonte:** `            entry && entry.action === 'GEMINI_MANUAL_INTERVENTION_REQUIRED'`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Verifica que o caminho automático não pediu intervenção manual.

**Como faz:** Exige ausência desse action no log.

**Por que existe assim:** Resultado shadow/assistant deve ser detectado automaticamente.

**Risco/regressão:** Ausência é avaliada no snapshot após sucesso observado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 744

**Fonte:** `        )).toBe(false);`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Executa a instrução `)).toBe(false);` no contexto `Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 745

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 746

**Fonte:** `        await page.close();`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 747

**Fonte:** `    });`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 748

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 749

**Fonte:** `(linha vazia)`

**Contexto:** Resultado em shadow DOM/wrapper assistant aceito sem intervenção manual.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 750

**Fonte:** `    test('E2E submit ignorado: falha cedo sem entrar em espera de geração de 4 minutos', { tag: '@e2e-medium-a' }, async () => {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Registra um caso Playwright: test('E2E submit ignorado: falha cedo sem entrar em espera de geração de 4 minutos', { tag: '@e2e-medium-a' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 751

**Fonte:** `        await resetExtensionState(backgroundWorker, {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Aguarda operação assíncrona no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 752

**Fonte:** `            geminiExecutionMode: 'temp_chat',`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 753

**Fonte:** `            geminiBaseUrl: 'http://127.0.0.1:3999/gemini/?ignoreSubmit=1',`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 754

**Fonte:** `        });`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 755

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 756

**Fonte:** `        const page = await browserContext.newPage();`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 757

**Fonte:** `        await page.goto('http://localhost:3999/manga-page.html');`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 758

**Fonte:** `        await page.waitForLoadState('networkidle');`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 759

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 760

**Fonte:** `        await page.evaluate(() => {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 761

**Fonte:** `            const second = document.querySelector('[data-testid="manga-image-1"]');`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Declara dado intermediário usado no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 762

**Fonte:** `            if (second) second.remove();`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Aplica guarda condicional do harness/cenário.

**Como faz:** Executa o bloco somente quando a condição corrente é verdadeira.

**Por que existe assim:** Trata modo, existência de recurso ou fallback sem duplicação.

**Risco/regressão:** Condição ampla/estreita demais pode deixar caminho sem exercício.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 763

**Fonte:** `        });`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 764

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 765

**Fonte:** `        const mainContent = page.locator('#manga-main-content');`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 766

**Fonte:** `        await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Aguarda operação assíncrona no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 767

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 768

**Fonte:** `        const startedAt = Date.now();`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Declara dado intermediário usado no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 769

**Fonte:** `        await mainContent.click();`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Dispara a ação de tradução pelo controle real injetado no mangá.

**Como faz:** Executa click Playwright no conteúdo principal do botão/painel.

**Por que existe assim:** Inicia o fluxo pelo mesmo canal de UI usado pelo usuário, não por chamada interna direta.

**Risco/regressão:** Se o seletor apontar para elemento errado, o lote não inicia.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 770

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 771

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Aguarda operação assíncrona no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 772

**Fonte:** `            backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 773

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['translatorLog']);`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Declara dado intermediário usado no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 774

**Fonte:** `            const logs = Array.isArray(storage.translatorLog)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Declara dado intermediário usado no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 775

**Fonte:** `                ? storage.translatorLog`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `? storage.translatorLog` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 776

**Fonte:** `                : [];`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `: [];` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 777

**Fonte:** `            return logs.some(entry =>`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 778

**Fonte:** `                entry && entry.action === 'GEMINI_SUBMISSION_NOT_CONFIRMED'`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Busca diagnóstico de submit não confirmado.

**Como faz:** Faz poll sobre `translatorLog` até o action aparecer.

**Por que existe assim:** Prova falha precoce em vez de aguardar geração por minutos.

**Risco/regressão:** Se log atrasar além de 35 s o teste falha mesmo que cleanup final ocorra.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 779

**Fonte:** `            );`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 780

**Fonte:** `        }, {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 781

**Fonte:** `            timeout: 35000,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `timeout: 35000,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 782

**Fonte:** `            message: 'Esperava GEMINI_SUBMISSION_NOT_CONFIRMED em timeout curto',`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Busca diagnóstico de submit não confirmado.

**Como faz:** Faz poll sobre `translatorLog` até o action aparecer.

**Por que existe assim:** Prova falha precoce em vez de aguardar geração por minutos.

**Risco/regressão:** Se log atrasar além de 35 s o teste falha mesmo que cleanup final ocorra.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 783

**Fonte:** `        }).toBe(true);`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 784

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 785

**Fonte:** `        expect(Date.now() - startedAt).toBeLessThan(35000);`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Mede duração de parede entre click e detecção da falha.

**Como faz:** Subtrai timestamp inicial e exige menos de 35 s.

**Por que existe assim:** Protege especificamente contra regressão para espera de geração de ~4 min.

**Risco/regressão:** É sensível a CI muito congestionada; limite é deliberadamente menor que o timeout longo antigo.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 786

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 787

**Fonte:** `        await expect.poll(async () => {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Aguarda operação assíncrona no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 788

**Fonte:** `            backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 789

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['mt_state']);`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Declara dado intermediário usado no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 790

**Fonte:** `            const state = storage.mt_state || {};`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Declara dado intermediário usado no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 791

**Fonte:** `            return {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Retorna valor calculado ao caller/poll.

**Como faz:** Encerra o callback/helper com o resultado desta etapa.

**Por que existe assim:** Permite que Playwright/Node compare o estado observado.

**Risco/regressão:** Forma do retorno é contrato com o caller imediatamente externo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 792

**Fonte:** `                activeJobsCount: state.activeJobsCount || 0,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `activeJobsCount: state.activeJobsCount || 0,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 793

**Fonte:** `                isProcessing: !!state.isProcessing,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `isProcessing: !!state.isProcessing,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 794

**Fonte:** `                queueLength: Array.isArray(state.jobQueue)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `queueLength: Array.isArray(state.jobQueue)` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 795

**Fonte:** `                    ? state.jobQueue.length`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `? state.jobQueue.length` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 796

**Fonte:** `                    : -1,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `: -1,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 797

**Fonte:** `            };`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 798

**Fonte:** `        }, {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 799

**Fonte:** `            timeout: 15000,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `timeout: 15000,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 800

**Fonte:** `            message: 'Job com submit não confirmado deveria liberar o lote cedo',`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `message: 'Job com submit não confirmado deveria liberar o lote cedo',` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 801

**Fonte:** `        }).toEqual({`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 802

**Fonte:** `            activeJobsCount: 0,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `activeJobsCount: 0,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 803

**Fonte:** `            isProcessing: false,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `isProcessing: false,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 804

**Fonte:** `            queueLength: 0,`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `queueLength: 0,` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 805

**Fonte:** `        });`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 806

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 807

**Fonte:** `        expect(`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `expect(` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 808

**Fonte:** `            await page.evaluate(() =>`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 809

**Fonte:** `                document.querySelectorAll('img[data-translated="true"]').length`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 810

**Fonte:** `            )`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 811

**Fonte:** `        ).toBe(0);`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Executa a instrução `).toBe(0);` no contexto `Submit ignorado: falha cedo, drena lote e não traduz.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 812

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 813

**Fonte:** `        await page.close();`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 814

**Fonte:** `    });`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 815

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 816

**Fonte:** `(linha vazia)`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 817

**Fonte:** `    for (const scenario of regressionScenarios) {`

**Contexto:** Submit ignorado: falha cedo, drena lote e não traduz.

**O que faz:** Itera sobre coleção controlada do cenário.

**Como faz:** Executa cada modo/label/página sequencialmente conforme o array definido.

**Por que existe assim:** Reusa o mesmo contrato para múltiplas variantes sem duplicar corpo do teste.

**Risco/regressão:** A ordem é intencional no FIFO; em loops de cenários, cada item gera caso separado ou etapa equivalente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 818

**Fonte:** `        test(\`REG result ownership: ${scenario.label} ignora clone do input e IMG órfã\`, { tag: '@e2e-fast' }, async () => {`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Registra um caso Playwright: test(`REG result ownership: ${scenario.label} ignora clone do input e IMG órfã`, { tag: '@e2e-fast' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 819

**Fonte:** `            const joiner = scenario.basePath.includes('?') ? '&' : '?';`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Declara dado intermediário usado no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 820

**Fonte:** `            await resetExtensionState(backgroundWorker, {`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Aguarda operação assíncrona no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 821

**Fonte:** `                geminiExecutionMode: scenario.mode,`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Seleciona o modo de execução Gemini do cenário.

**Como faz:** Persiste `temp_chat`, `minimized_window` ou `background_delete`.

**Por que existe assim:** Exercita caminhos operacionais distintos do runtime.

**Risco/regressão:** Novo modo não fica coberto automaticamente.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 822

**Fonte:** `                geminiBaseUrl:`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Define/override a origem Gemini mock usada pelo cenário.

**Como faz:** Persiste URL local 127.0.0.1:3999 com flags específicas quando necessário.

**Por que existe assim:** Permite controlar attachments, timing, DOM e falhas sem rede externa.

**Risco/regressão:** Contrato depende das rotas/params do mock server.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 823

**Fonte:** `                    \`http://127.0.0.1:3999${scenario.basePath}${joiner}cloneInputIntoUserTurn=1&orphanImageBeforeResult=1\`,`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Injeta candidatos falsos antes do resultado real.

**Como faz:** Mock cria clone no user turn e IMG grande sem owner model.

**Por que existe assim:** Prova ownership semântico do result extractor, não apenas tamanho/novidade de IMG.

**Risco/regressão:** Se o mock divergir do DOM real, a regressão pode perder representatividade.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 824

**Fonte:** `            });`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 825

**Fonte:** `(linha vazia)`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 826

**Fonte:** `            const page = await browserContext.newPage();`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 827

**Fonte:** `            await page.goto('http://localhost:3999/manga-page.html');`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 828

**Fonte:** `            await page.waitForLoadState('networkidle');`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 829

**Fonte:** `            await page.evaluate(() => {`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 830

**Fonte:** `                document.querySelector('[data-testid="manga-image-1"]')?.remove();`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `document.querySelector('[data-testid="manga-image-1"]')?.remove();` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 831

**Fonte:** `            });`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 832

**Fonte:** `(linha vazia)`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 833

**Fonte:** `            const mainContent = page.locator('#manga-main-content');`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Cria locator Playwright para elemento estável da fixture/UI da extensão.

**Como faz:** Usa seletor CSS ou `data-testid`.

**Por que existe assim:** Permite assertions e ações auto-waiting sobre alvos específicos.

**Risco/regressão:** Mudança de fixture/ID exige atualizar o teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 834

**Fonte:** `            await expect(mainContent).toContainText('TRADUZIR', { timeout: 10000 });`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Aguarda operação assíncrona no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 835

**Fonte:** `            await mainContent.click();`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Dispara a ação de tradução pelo controle real injetado no mangá.

**Como faz:** Executa click Playwright no conteúdo principal do botão/painel.

**Por que existe assim:** Inicia o fluxo pelo mesmo canal de UI usado pelo usuário, não por chamada interna direta.

**Risco/regressão:** Se o seletor apontar para elemento errado, o lote não inicia.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 836

**Fonte:** `(linha vazia)`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 837

**Fonte:** `            await expect.poll(async () => page.evaluate(() =>`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa lógica controlada dentro da página web.

**Como faz:** Serializa callback para o contexto do browser.

**Por que existe assim:** Permite consultar/mutar fixture DOM sem simular internals da extensão.

**Risco/regressão:** Mutação deve continuar limitada à fixture do cenário para não fabricar prova do runtime.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 838

**Fonte:** `                document.querySelectorAll('img[data-translated="true"]').length`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Conta imagens que o content script marcou como traduzidas.

**Como faz:** Consulta DOM da página manga por `data-translated="true"`.

**Por que existe assim:** É indicador observável de entrega/replace concluído no consumidor final.

**Risco/regressão:** Marca pode existir sem validar conteúdo pixel-a-pixel; outras assertions verificam src/ownership/logs.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 839

**Fonte:** `            ), {`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 840

**Fonte:** `                timeout: 60000,`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `timeout: 60000,` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 841

**Fonte:** `                message: \`Esperava resultado real do model turn em ${scenario.mode}\`,`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `message: 'Esperava resultado real do model turn em ${scenario.mode}',` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 842

**Fonte:** `            }).toBe(1);`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 843

**Fonte:** `(linha vazia)`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 844

**Fonte:** `            const storage = await readStorage(backgroundWorker, ['translatorLog']);`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Declara dado intermediário usado no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 845

**Fonte:** `            const logs = Array.isArray(storage.translatorLog) ? storage.translatorLog : [];`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Declara dado intermediário usado no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 846

**Fonte:** `            expect(logs.some(entry =>`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `expect(logs.some(entry =>` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 847

**Fonte:** `                entry && entry.action === 'GEMINI_RESULT_REJECTED' &&`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 848

**Fonte:** `                entry.extra?.reason === 'user_turn'`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 849

**Fonte:** `            )).toBe(true);`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `)).toBe(true);` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 850

**Fonte:** `            expect(logs.some(entry =>`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `expect(logs.some(entry =>` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 851

**Fonte:** `                entry && entry.action === 'GEMINI_RESULT_REJECTED' &&`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 852

**Fonte:** `                entry.extra?.reason === 'missing_model_owner'`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 853

**Fonte:** `            )).toBe(true);`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `)).toBe(true);` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 854

**Fonte:** `            expect(logs.some(entry =>`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `expect(logs.some(entry =>` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 855

**Fonte:** `                entry && entry.action === 'GEMINI_RESULT_ACCEPTED' &&`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 856

**Fonte:** `                entry.extra?.reason === 'new_model_turn'`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Verifica decisão de ownership do extractor de resultado.

**Como faz:** Pesquisa action + `extra.reason` no log real.

**Por que existe assim:** Distingue falsos candidatos (user turn/orphan) do novo model turn legítimo.

**Risco/regressão:** Reason strings são contrato sensível a refactor.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 857

**Fonte:** `            )).toBe(true);`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Executa a instrução `)).toBe(true);` no contexto `Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 858

**Fonte:** `(linha vazia)`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 859

**Fonte:** `            await page.close();`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 860

**Fonte:** `        });`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 861

**Fonte:** `    }`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 862

**Fonte:** `(linha vazia)`

**Contexto:** Ownership do resultado: rejeita clone do input e IMG órfã nos três modos.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 863

**Fonte:** `    test('E2E aba Gemini manual: zero automação, zero keepalive e DOM intacto', { tag: '@e2e-fast' }, async () => {`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Registra um caso Playwright: test('E2E aba Gemini manual: zero automação, zero keepalive e DOM intacto', { tag: '@e2e-fast' }, async () => {

**Como faz:** Associa título, tag de shard e callback assíncrono ao runner.

**Por que existe assim:** Transforma o contrato de regressão em item enumerável/executável pela CI.

**Risco/regressão:** Alterar tag/título pode quebrar plano de shard ou markers da regression-matrix.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E; 🟦 o inventário/tag também é verificado pelo gate `verify-e2e-shard-plan.js`.

### Linha 864

**Fonte:** `        await backgroundWorker.evaluate(() => {`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa lógica no Service Worker real da extensão.

**Como faz:** Usa Playwright Worker.evaluate para acessar APIs Chrome privilegiadas.

**Por que existe assim:** Permite preparar/ler estado e enviar mensagens usando o runtime real.

**Risco/regressão:** Se o worker suspender, é necessário reacquirí-lo por `getBackgroundWorker`.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 865

**Fonte:** `            chrome.storage.local.set({ __e2e_keepalive_count: 0 });`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Grava baseline/override controlado no storage local.

**Como faz:** Passa um objeto com defaults do tradutor e resolve a Promise no callback.

**Por que existe assim:** Configura domínio, modo Gemini, concorrência e estado de lote determinísticos.

**Risco/regressão:** Erro do set não é checado; o teste pode seguir com configuração incompleta.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 866

**Fonte:** `            chrome.runtime.onConnect.addListener(port => {`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 867

**Fonte:** `                if (!port || port.name !== 'gemini-keep-alive') return;`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Filtra exclusivamente o port de keepalive do Gemini.

**Como faz:** Compara `port.name` antes de incrementar contador.

**Por que existe assim:** Ignora outras conexões runtime que não representam automação Gemini.

**Risco/regressão:** Renomear o port exige atualizar este E2E.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 868

**Fonte:** `                chrome.storage.local.get(['__e2e_keepalive_count'], data => {`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Instrumenta/consulta quantidade de conexões `gemini-keep-alive` no cenário manual.

**Como faz:** Persiste contador no storage e incrementa em listener `runtime.onConnect`.

**Por que existe assim:** Prova ausência de keepalive quando uma aba Gemini é aberta sem job.

**Risco/regressão:** Listener vive até o profile ser encerrado; profile isolado evita contaminar outros testes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 869

**Fonte:** `                    const count = Number(data.__e2e_keepalive_count) || 0;`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Instrumenta/consulta quantidade de conexões `gemini-keep-alive` no cenário manual.

**Como faz:** Persiste contador no storage e incrementa em listener `runtime.onConnect`.

**Por que existe assim:** Prova ausência de keepalive quando uma aba Gemini é aberta sem job.

**Risco/regressão:** Listener vive até o profile ser encerrado; profile isolado evita contaminar outros testes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 870

**Fonte:** `                    chrome.storage.local.set({`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Grava baseline/override controlado no storage local.

**Como faz:** Passa um objeto com defaults do tradutor e resolve a Promise no callback.

**Por que existe assim:** Configura domínio, modo Gemini, concorrência e estado de lote determinísticos.

**Risco/regressão:** Erro do set não é checado; o teste pode seguir com configuração incompleta.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 871

**Fonte:** `                        __e2e_keepalive_count: count + 1,`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Instrumenta/consulta quantidade de conexões `gemini-keep-alive` no cenário manual.

**Como faz:** Persiste contador no storage e incrementa em listener `runtime.onConnect`.

**Por que existe assim:** Prova ausência de keepalive quando uma aba Gemini é aberta sem job.

**Risco/regressão:** Listener vive até o profile ser encerrado; profile isolado evita contaminar outros testes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 872

**Fonte:** `                    });`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 873

**Fonte:** `                });`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 874

**Fonte:** `            });`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 875

**Fonte:** `        });`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 876

**Fonte:** `(linha vazia)`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 877

**Fonte:** `        const manual = await browserContext.newPage();`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Abre uma nova aba dentro do profile com a extensão carregada.

**Como faz:** Usa o BrowserContext persistente do cenário.

**Por que existe assim:** Representa página de mangá/Gemini real dentro do mesmo perfil MV3.

**Risco/regressão:** Página precisa ser fechada ou será encerrada pelo afterEach.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 878

**Fonte:** `        await manual.goto('http://127.0.0.1:3999/gemini/?manual=1');`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Navega para uma fixture/URL controlada do cenário.

**Como faz:** Usa Playwright `goto` com localhost/127.0.0.1 ou URL chrome-extension conforme contexto.

**Por que existe assim:** Aciona content scripts e lifecycle reais sobre o mock local.

**Risco/regressão:** Servidor mock/rota indisponível faz o cenário falhar.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 879

**Fonte:** `        await manual.waitForLoadState('networkidle');`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Aguarda estabilização inicial de rede da página fixture.

**Como faz:** Usa estado Playwright `networkidle`.

**Por que existe assim:** Reduz corrida antes de manipular DOM/content scripts.

**Risco/regressão:** Não substitui waits específicos posteriores para imagens/estado da extensão.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 880

**Fonte:** `        await manual.waitForTimeout(1500);`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Aguarda operação assíncrona no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Suspende o callback até a Promise resolver/rejeitar.

**Por que existe assim:** Preserva ordenação entre preparação, ação e observação do E2E.

**Risco/regressão:** Rejeição aborta o teste e aciona cleanup do runner.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 881

**Fonte:** `(linha vazia)`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 882

**Fonte:** `        await expect(manual.locator('#mock-status')).toHaveText('Aguardando entrada');`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Valida texto inicial do mock Gemini manual.

**Como faz:** Matcher exige estado/attachment label inalterados.

**Por que existe assim:** Evidencia que nenhum job automático interagiu com a aba.

**Risco/regressão:** É prova observacional do DOM mock atual.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 883

**Fonte:** `        await expect(manual.locator('#attachment-label')).toHaveText('Nenhuma imagem anexada');`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Valida texto inicial do mock Gemini manual.

**Como faz:** Matcher exige estado/attachment label inalterados.

**Por que existe assim:** Evidencia que nenhum job automático interagiu com a aba.

**Risco/regressão:** É prova observacional do DOM mock atual.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 884

**Fonte:** `        await expect(manual.locator('.prompt-box')).toHaveText('');`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Valida que prompt/resultado permanecem vazios na aba manual.

**Como faz:** Usa locator e matcher de conteúdo vazio.

**Por que existe assim:** Prova ausência de upload/prompt/geração sem job.

**Risco/regressão:** Cobre os containers definidos pelo mock.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 885

**Fonte:** `        await expect(manual.locator('#result-zone')).toBeEmpty();`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Valida que prompt/resultado permanecem vazios na aba manual.

**Como faz:** Usa locator e matcher de conteúdo vazio.

**Por que existe assim:** Prova ausência de upload/prompt/geração sem job.

**Risco/regressão:** Cobre os containers definidos pelo mock.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 886

**Fonte:** `(linha vazia)`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 887

**Fonte:** `        backgroundWorker = await getBackgroundWorker(browserContext);`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa a instrução `backgroundWorker = await getBackgroundWorker(browserContext);` no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 888

**Fonte:** `        const storage = await readStorage(backgroundWorker, [`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Declara dado intermediário usado no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 889

**Fonte:** `            '__e2e_keepalive_count',`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Instrumenta/consulta quantidade de conexões `gemini-keep-alive` no cenário manual.

**Como faz:** Persiste contador no storage e incrementa em listener `runtime.onConnect`.

**Por que existe assim:** Prova ausência de keepalive quando uma aba Gemini é aberta sem job.

**Risco/regressão:** Listener vive até o profile ser encerrado; profile isolado evita contaminar outros testes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 890

**Fonte:** `            'translatorLog',`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa a instrução `'translatorLog',` no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 891

**Fonte:** `        ]);`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa a instrução `]);` no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 892

**Fonte:** `        expect(storage.__e2e_keepalive_count || 0).toBe(0);`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Instrumenta/consulta quantidade de conexões `gemini-keep-alive` no cenário manual.

**Como faz:** Persiste contador no storage e incrementa em listener `runtime.onConnect`.

**Por que existe assim:** Prova ausência de keepalive quando uma aba Gemini é aberta sem job.

**Risco/regressão:** Listener vive até o profile ser encerrado; profile isolado evita contaminar outros testes.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 893

**Fonte:** `(linha vazia)`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 894

**Fonte:** `        const logs = Array.isArray(storage.translatorLog)`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Declara dado intermediário usado no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Calcula/captura valor sem mutar APIs externas por si só.

**Por que existe assim:** Nomeia estado necessário à próxima ação/assertion.

**Risco/regressão:** Valor incorreto pode deslocar a prova para alvo errado; a maioria é validada por etapas posteriores.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 895

**Fonte:** `            ? storage.translatorLog`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa a instrução `? storage.translatorLog` no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 896

**Fonte:** `            : [];`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa a instrução `: [];` no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 897

**Fonte:** `        expect(logs.some(entry =>`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa a instrução `expect(logs.some(entry =>` no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 898

**Fonte:** `            entry && entry.action === 'JOB_NOT_FOUND'`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Exige observabilidade de bootstrap sem job na aba manual.

**Como faz:** Pesquisa `JOB_NOT_FOUND` no translatorLog.

**Por que existe assim:** Demonstra que o content script reconheceu ausência de ownership em vez de automatizar a aba.

**Risco/regressão:** Se política futura tornar esse caso silencioso, contrato/teste precisa ser revisto.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 899

**Fonte:** `        )).toBe(true);`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Executa a instrução `)).toBe(true);` no contexto `Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.`.

**Como faz:** Integra a sequência síncrona/assíncrona do harness Playwright e do runtime MV3.

**Por que existe assim:** Contribui para preparar, acionar, observar ou limpar o comportamento E2E correspondente.

**Risco/regressão:** Sua validade depende das premissas e assertions do bloco em que está inserida.

**Evidência:** ✅ PRODUZ/COMPÕE PROVA DIRETA — esta linha participa de uma assertion Playwright/Jest-style sobre o fluxo real.

### Linha 900

**Fonte:** `(linha vazia)`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 901

**Fonte:** `        await manual.close();`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Fecha a página criada pelo cenário.

**Como faz:** Aguarda método `close` do Playwright.

**Por que existe assim:** Reduz recursos antes do afterEach fechar o contexto inteiro.

**Risco/regressão:** Se não executar por falha anterior, afterEach ainda fecha o BrowserContext.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 902

**Fonte:** `    });`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Linha 903

**Fonte:** `(linha vazia)`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos lógicos sem produzir bytecode operacional relevante.

**Por que existe assim:** Melhora legibilidade entre etapas do harness e cenários.

**Risco/regressão:** Sem efeito funcional; alteração afeta apenas apresentação.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — linha editorial/comentário; não é uma assertion.

### Linha 904

**Fonte:** `});`

**Contexto:** Aba Gemini manual: prova inércia, zero keepalive e DOM intacto sem job.

**O que faz:** Delimitador estrutural do bloco atual.

**Como faz:** Fecha/abre expressão, função, array ou chamada adjacente.

**Por que existe assim:** Mantém escopo e ordem sintática do cenário.

**Risco/regressão:** Sem semântica isolada; alteração incorreta quebra parse/estrutura.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE PELO E2E — setup/ação/controle necessário ao cenário, mas sem assertion focal nesta linha isolada.

### Posição 905 — newline final

**Fonte:** terminador LF após a linha 904.

**Contexto:** identidade textual do blob auditado.

**O que faz:** finaliza o arquivo com newline canônico.

**Como faz:** o conteúdo retornado pelo GitHub termina em `\n`.

**Por que existe assim:** compatibilidade editorial/CLI e consistência do arquivo texto.

**Risco/regressão:** não muda o comportamento Playwright, mas participa da identidade exata do snapshot documentado.

**Evidência:** 🟦 GATE ESTÁTICO DA INSPEÇÃO DO BLOB — não é propriedade funcional do fluxo.

## 24. Autoauditoria documental

- SHA relido imediatamente antes da escrita: **confirmado**.
- Fonte integral incorporada: **sim**.
- 904/904 linhas textuais documentadas individualmente: **sim**.
- newline final documentado como posição 905: **sim**.
- fixtures de mangá e Gemini inspecionadas: **sim**.
- manifest MV3 e ordem de content scripts inspecionados: **sim**.
- plano de shards, runner e workflow de merge inspecionados: **sim**.
- regression-matrix inspecionada: **sim**.
- assertions diretas separadas de setup/execução indireta/gates estáticos: **sim**.
- achados externos registrados sem modificar código/testes/workflow/fixture: **sim**.
- solicitações ao auditor: **2 OPEN**.

### Conclusão

A documentação cobre o arquivo integralmente e descreve o que os E2E realmente provam, sem transformar mera execução ou marker textual em prova semântica. Os dois riscos de harness identificados permanecem como solicitações OPEN e não foram “corrigidos” durante a auditoria.

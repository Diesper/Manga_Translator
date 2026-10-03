# Bíblia técnica — tests/visual/content-manga-pipeline.visual.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `61bc86351c914a1d9bb6bb4a13168b4567ac3cf9`  
> **Agente responsável:** AGENTE 3  
> **Índice do corpus:** 226  
> **Tipo:** suíte visual/custom-runner com mirrors de pipeline e uso real dos módulos GTC compartilhados  
> **Linhas textuais:** 767  
> **Posições documentais:** 768, contando o newline terminal  
> **Testes declarados neste arquivo:** 36  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural real

Este arquivo participa de `npm run test:visual` e é carregado por `tests/visual/run-all.js`. Ele executa 36 casos por meio do runner customizado `tests/visual/runner.js`.

O arquivo mistura **dois tipos de objeto testado**, que precisam permanecer separados documentalmente:

1. **implementação real compartilhada** — carrega diretamente `extension/shared/gtc-fingerprint.js` e `extension/shared/gtc-indexeddb.js`, usando suas APIs reais de hash, repositório in-memory e runtime handler;
2. **mirrors/stubs locais** — reimplementa dentro do próprio arquivo `getCleanUrl`, `generateImageFingerprint`, uma versão de `runCachePipeline`, `confirmWithRegionalHashes` e a escrita de campos em `dataset`.

Portanto, sucesso desta suíte é prova direta das funções locais e das APIs compartilhadas realmente importadas, **não é automaticamente prova direta do pipeline atual de `content_manga.js`/módulos content**.

Essa distinção é especialmente importante porque existe drift concreto entre os mirrors deste arquivo e a implementação atual.

## 2. Wiring, execução e gate

### 2.1 Caminho de execução

- `package.json`: `test:visual = node tests/visual/run-all.js`;
- `tests/visual/run-all.js`: faz `require('./content-manga-pipeline.visual.js')`;
- depois aguarda `getAsyncQueue()` do runner e chama `printSummary()`;
- `tests/visual/runner.js`: agrega pass/fail/skip e aplica `scripts/ci/data/test-baseline.json#visual`;
- baseline observado: `minTests = 224`, `maxSkipped = 0`;
- `.github/workflows/ci.yml`: job **Visual Tests** executa `npm run test:visual`, e o gate final exige o sucesso desse job.

**Classificação do wiring:** 🟦 GATE ESTÁTICO ESPECÍFICO.

### 2.2 Execução real observada do mesmo blob

O commit `e720890cf34dc9437ee91f3b8172953497d69870` contém este mesmo blob SHA `61bc86351c914a1d9bb6bb4a13168b4567ac3cf9`.

No GitHub Actions run `36521561968`:

- job `109255348156` — **Visual Tests** — terminou `success`;
- o log mostra `npm run test:visual` e `node tests/visual/run-all.js`;
- aparecem explicitamente as suites `getCleanUrl`, `generateImageFingerprint` e as suites `Pipeline 5 fases` deste arquivo;
- resumo global: **Passed: 224 / Total: 224**.

**Classificação:** 🟨 EXECUTADO INDIRETAMENTE para o arquivo como unidade dentro da suíte global. As assertions individuais continuam sendo prova direta apenas do objeto realmente executado por cada caso.

## 3. Dependências reais

### 3.1 Produção importada diretamente

- `extension/shared/gtc-fingerprint.js` → `globalThis.MangaTranslatorGtcFingerprint`;
- `extension/shared/gtc-indexeddb.js` → `globalThis.MangaTranslatorGtcIndexedDb`.

Esses módulos são código real e não cópias criadas pelo teste.

O arquivo usa diretamente, entre outras APIs:

- `createFingerprintFromDescriptor`;
- `calculateDHash`;
- `calculateWHash`;
- `calculatePHash`;
- `calculateRegionalHashes`;
- `matchRegionalHashes`;
- `normalizeHash`;
- `createGtcRuntimeHandler`;
- `createInMemoryRepository`;
- `repository.put`;
- `repository.getManyByPerceptual`.

### 3.2 Infraestrutura de testes

- `tests/visual/runner.js`: `describe`, `it`, `ita`, `expect`;
- `tests/visual/helpers.js`: geradores de pixels e `isValidHex`.

### 3.3 Produção que o arquivo alega espelhar, mas não importa

A produção atual distribui a lógica entre:

- `extension/content/cm-dom-replace.js` → `getCleanUrl`;
- `extension/content/cm-gtc-client.js` → fingerprint, queries, save e confirmação regional;
- `extension/content/content_manga.js` → orquestração do pipeline e persistência dos hashes no `dataset`.

Isso torna essencial não promover os mirrors deste teste a evidência direta dessas implementações.

## 4. Achado central — o “pipeline de 5 fases” é um mirror desatualizado

As linhas 130–213 declaram e implementam `runCachePipeline` como pipeline local de cinco fases:

1. fingerprint;
2. SHA-256;
3. dHash;
4. perceptual wHash+pHash;
5. decisão cache/Gemini.

A produção atual possui superfícies adicionais que o mirror não modela, incluindo:

- `wHashCrop` e `pHashCrop`;
- fingerprint `visual-v4`;
- `GTC_QUERY_BY_PERCEPTUAL_CROP`;
- `GTC_QUERY_BY_PERCEPTUAL_RELAXED`;
- `GTC_QUERY_PERCEPTUAL_V2`/consulta perceptual correlacionada;
- campos crop no `dataset`.

O próprio `tests/visual/run-all.js` anuncia atualmente **“Pipeline 6 fases”** e **visual-v4 / Crop**, enquanto este arquivo continua descrevendo e exercitando **“Pipeline 5 fases”**.

### Consequência probatória

As assertions das linhas 408–598 provam a máquina local `runCachePipeline` e, via stub, partes reais do handler GTC. Elas **não provam diretamente** que a orquestração atual de `content_manga.js` mantém a mesma decisão.

**Classificação para pipeline de produção:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO por este arquivo.

## 5. Drift crítico — `confirmWithRegionalHashes`

O mirror nas linhas 674–680 implementa:

- falta `queryRegional`, `entryRegional` ou API → `true`;
- falta `matchRegionalHashes` → `true`.

E as linhas 682–689 possuem assertions que exigem explicitamente `true` quando dados regionais estão ausentes.

A implementação real atual de `extension/content/cm-gtc-client.js` faz o oposto no caso de dados/API ausentes:

- falta `queryRegional`, `entryRegional` ou API → `false`;
- somente a ausência do método `matchRegionalHashes` retorna `true`.

O `content_manga.js` também contém a justificativa de que ausência de dados regionais **não é confirmação**.

Portanto, a suíte contém prova direta de uma semântica local que contradiz a produção atual.

**Classificação da equivalência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO e drift comprovado.

## 6. Drift de `getCleanUrl`

O mirror das linhas 39–47:

- retorna `null` para valor vazio e `data:`;
- não rejeita explicitamente `blob:`;
- usa base fixa `https://example.com` para URL relativa.

A implementação atual de `extension/content/cm-dom-replace.js`:

- rejeita `data:` **e** `blob:`;
- usa `window.location.origin/href`, `document.baseURI` ou fallback interno como base.

Assim, as sete assertions de `getCleanUrl` provam o helper local, mas não cobrem a semântica completa do módulo real.

## 7. Drift de fingerprint e metadados visual-v4

O mirror `generateImageFingerprint` retorna seis campos:

- `sha256`;
- `dHash`;
- `wHash`;
- `pHash`;
- `regionalHashes`;
- `fingerprintVersion`.

A implementação real atual em `cm-gtc-client.js` também trabalha com:

- `wHashCrop`;
- `pHashCrop`;

e promove a versão para `visual-v4` quando esses hashes crop existem.

A própria assertion “retorna todos os 6 campos esperados” registra uma expectativa antiga. Ela não é prova do contrato real atual.

## 8. Dataset — simulação, não DOM real

As linhas 723–755 constroem um objeto `dataset = {}` e simulam as atribuições que a produção faria.

Isso comprova:

- serialização de `regionalHashes`;
- tamanhos/formato dos hashes produzidos pelo mirror/API compartilhada;
- round-trip de JSON nas linhas 757–766.

Não comprova que `content_manga.js` escreveu os campos em um elemento DOM real.

Além disso, a produção atual escreve `origWHashCrop` e `origPHashCrop`, campos ausentes na simulação do teste.

**Classificação para persistência DOM real:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO por este arquivo.

## 9. Matriz de evidência por superfície

| Superfície | O que este arquivo realmente executa | Classificação |
|---|---|---|
| `gtc-fingerprint.js` — cálculos de hashes usados pelos casos | implementação real importada | ✅ PROVADO DIRETAMENTE nos vetores cobertos |
| `gtc-indexeddb.js` — repositório in-memory, handler e lookup/save usados | implementação real importada | ✅ PROVADO DIRETAMENTE nos cenários cobertos |
| wiring `run-all.js → #226` | require explícito | 🟦 GATE ESTÁTICO ESPECÍFICO |
| execução do mesmo blob no run 36521561968 | suíte global visual passou 224/224 | 🟨 EXECUTADO INDIRETAMENTE |
| `getCleanUrl` local | função definida no próprio teste | ✅ PROVADO DIRETAMENTE — mirror |
| `cm-dom-replace.js#getCleanUrl` | não é importado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO por #226 |
| `generateImageFingerprint` local | função definida no próprio teste | ✅ PROVADO DIRETAMENTE — mirror |
| `cm-gtc-client.js#generateImageFingerprint` | não é chamado pelo mirror | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO por #226 |
| pipeline SHA/dHash/perceptual/Gemini local | `runCachePipeline` local | ✅ PROVADO DIRETAMENTE — mirror |
| pipeline atual de `content_manga.js` | não é carregado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO por #226 |
| `GTC_SAVE` / lookup perceptual | handler real de `gtc-indexeddb.js` | ✅ PROVADO DIRETAMENTE nos inputs cobertos |
| wrapper real `saveGlobalTranslationCacheEntry` de `cm-gtc-client.js` | não é carregado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO por #226 |
| confirmação regional local | função local | ✅ PROVADO DIRETAMENTE — semântica local obsoleta |
| confirmação regional real | semântica difere | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO e drift |
| gravação de hashes em DOM dataset real | objeto simples simulado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Inventário dos 36 casos

| Linha | Runner | Suite | Caso |
|---:|---|---|---|
| 257 | `it` | getCleanUrl | remove query string |
| 262 | `it` | getCleanUrl | remove fragment |
| 267 | `it` | getCleanUrl | preserva path |
| 272 | `it` | getCleanUrl | retorna null para data: URL |
| 276 | `it` | getCleanUrl | retorna null para string vazia |
| 280 | `it` | getCleanUrl | retorna null para null |
| 284 | `it` | getCleanUrl | lida com URL relativa usando origin como base |
| 297 | `ita` | generateImageFingerprint | retorna todos os 6 campos esperados |
| 308 | `ita` | generateImageFingerprint | sha256 é string de 64 chars hex |
| 314 | `ita` | generateImageFingerprint | wHash é string de 64 chars hex |
| 320 | `ita` | generateImageFingerprint | pHash é string de 64 chars hex |
| 326 | `ita` | generateImageFingerprint | fingerprintVersion = "visual-v3" quando wHash presente |
| 332 | `ita` | generateImageFingerprint | CORS fallback: usa SW quando canvas é bloqueado (_forceCors=true) |
| 358 | `ita` | generateImageFingerprint | CORS fallback: dados do SW são usados nos campos corretos |
| 386 | `ita` | generateImageFingerprint | CORS fallback: SW falhando → fingerprintVersion = "visual-v1" (graceful) |
| 397 | `ita` | generateImageFingerprint | data: URL → cleanUrl null → sha256 usa URL como discriminador |
| 410 | `ita` | Pipeline 5 fases — Fase 2: SHA-256 hit | imagem em cache SHA-256 → cacheHits, não vai para Gemini |
| 431 | `ita` | Pipeline 5 fases — Fase 2: SHA-256 hit | N imagens — todas em cache SHA-256 → geminiQueue vazia |
| 454 | `ita` | Pipeline 5 fases — Fase 3: dHash hit | miss SHA-256, hit dHash → cache hit com source=dhash |
| 483 | `ita` | Pipeline 5 fases — Fase 4: wHash+pHash perceptual hit (cross-language) | [CROSS-LANGUAGE] miss SHA-256 e dHash, hit perceptual → cache hit com source=perceptual |
| 523 | `ita` | Pipeline 5 fases — Fase 5: Gemini queue (miss total) | imagem totalmente nova → vai para geminiQueue |
| 534 | `ita` | Pipeline 5 fases — Fase 5: Gemini queue (miss total) | mix: 1 cache hit + 1 gemini → correto em lote |
| 571 | `ita` | Pipeline 5 fases — Fase 5: Gemini queue (miss total) | imagens com _skip=true são ignoradas no pipeline |
| 585 | `ita` | Pipeline 5 fases — Fase 5: Gemini queue (miss total) | cache vazio: N imagens → todas na geminiQueue |
| 616 | `ita` | saveGlobalTranslationCacheEntry — campos visual-v3 | salva wHash, pHash, regionalHashes corretamente |
| 636 | `ita` | saveGlobalTranslationCacheEntry — campos visual-v3 | salva entrada com fingerprintVersion="visual-v3" |
| 646 | `ita` | saveGlobalTranslationCacheEntry — campos visual-v3 | salva entrada visual-v2 (sem wHash) sem erros |
| 655 | `ita` | saveGlobalTranslationCacheEntry — campos visual-v3 | reject: hash vazio retorna saved:false |
| 661 | `ita` | saveGlobalTranslationCacheEntry — campos visual-v3 | reject: translatedDataUrl ausente retorna saved:false |
| 682 | `it` | confirmWithRegionalHashes | retorna true quando queryRegional é null (sem dados → aceitar) |
| 686 | `it` | confirmWithRegionalHashes | retorna true quando entryRegional é null |
| 691 | `it` | confirmWithRegionalHashes | retorna true para hashes regionais idênticos |
| 697 | `it` | confirmWithRegionalHashes | retorna false para hashes regionais completamente diferentes |
| 705 | `it` | confirmWithRegionalHashes | [CROSS-LANGUAGE] página EN e PT passam confirmação regional |
| 723 | `ita` | Hashes no dataset da imagem (img.dataset.*) | todos os hashes são salvos nos campos corretos do dataset |
| 757 | `it` | Hashes no dataset da imagem (img.dataset.*) | JSON.stringify + JSON.parse de regionalHashes é round-trip perfeito |

## 11. Cobertura documental por intervalos

| Linhas/posição | Unidade | Análise |
|---|---|---|
| 1–22 | cabeçalho e promessa de cobertura | Declara pipeline “5 fases” e extrações do content; hoje essa promessa está parcialmente obsoleta. |
| 23–31 | bootstrap/imports | Carrega módulos GTC reais, runner e helpers; captura APIs globais. |
| 32–50 | `getCleanUrl` + `normalizeHash` | `getCleanUrl` é mirror; `normalizeHash` é referência direta ao módulo IDB real. |
| 51–128 | `generateImageFingerprint` | Mirror testável por buffers; usa API real de fingerprint, mas não DOM/canvas real de `cm-gtc-client`; falta crop/visual-v4. |
| 129–213 | `runCachePipeline` | Máquina local de cinco fases; consulta handler real via stub, mas não executa a orquestração atual do content script. |
| 214–228 | `makeChromeSendMessageStub` | Adapta `createGtcRuntimeHandler` real a Promise; qualquer action não tratada retorna `ok:false`. |
| 229–250 | `makeImgEl` | Fixture sintética de pixels/estado; não é `HTMLImageElement` real. |
| 251–288 | suite `getCleanUrl` | 7 assertions do mirror. |
| 289–403 | suite `generateImageFingerprint` | 9 assertions do mirror + API de fingerprint real; inclui CORS simulado por flag. |
| 404–450 | pipeline SHA-256 | 2 testes de hit e lote usando repo GTC real in-memory. |
| 451–479 | pipeline dHash | 1 teste de fallback dHash local. |
| 480–519 | pipeline perceptual | 1 teste cross-language local com lookup perceptual real do repositório. |
| 520–598 | decisão Gemini | 4 testes da máquina local para miss/mix/skip/lote. |
| 599–666 | `GTC_SAVE` | 5 testes do handler/repositório real para metadados v2/v3 e rejeições mínimas. |
| 667–714 | confirmação regional | 5 testes; dois codificam semântica oposta à produção atual para dados ausentes. |
| 715–767 | dataset | 2 testes de simulação/serialização; não inclui crop fields atuais. |
| 768 | newline terminal | posição documental final. |

Esses intervalos são contíguos e cobrem 100% das 768 posições documentais.

## 12. Invariantes que a suíte local estabelece

Para **o código local do teste e módulos compartilhados realmente importados**, os casos estabelecem:

1. URLs absolutas perdem query/fragment no mirror;
2. o fingerprint local sempre expõe os seis campos antigos;
3. SHA-256, wHash e pHash possuem o formato esperado nos vetores cobertos;
4. fallback CORS simulado aceita resposta de fingerprint do stub;
5. hit SHA vence os fallbacks locais;
6. dHash é consultado após miss de SHA;
7. perceptual é consultado após miss de SHA/dHash;
8. miss total entra na fila Gemini;
9. `_skip` remove a imagem da decisão;
10. o handler GTC real salva metadados e rejeita hash/tradução ausentes;
11. hashes regionais reais podem ser calculados/serializados;
12. o mirror regional aceita ausência de dados — propriedade que **não deve ser atribuída à produção atual**.

## 13. Casos-limite e riscos

### Risco principal: falso verde arquitetural

O teste pode continuar 100% verde enquanto a produção muda, porque as decisões centrais são copiadas no próprio teste. O drift já existe; portanto o risco não é hipotético.

### CORS

`_forceCors` é um marcador de fixture, não um canvas que realmente lança `SecurityError`. O caso prova a branch do mirror, não o comportamento do DOM/browser.

### URL relativa

A base fixa do mirror não reproduz o ambiente de página real.

### Hash perceptual cross-language

O teste usa geradores sintéticos de `helpers.js` e o repositório GTC real. É evidência útil do matcher/IDB, mas não prova aquisição real de pixels no content script.

### Suite-wide gate

O baseline de 224 testes é global. Um teste deste arquivo poderia teoricamente ser removido e compensado por outro teste visual novo sem o piso global detectar especificamente a perda de cobertura desta suíte.

## 14. Solicitações ao auditor

### 226-001 — MIRROR_DRIFT — OPEN — HIGH

**Encontrado:** o arquivo testa uma cópia local chamada “Pipeline de cache em 5 fases”, enquanto a produção atual utiliza módulos extraídos, visual-v4/crop e consultas perceptuais adicionais/correlacionadas; `run-all.js` já anuncia “Pipeline 6 fases”.

**Contexto:** linhas 4, 18, 130–213 e suites 408–598.

**Arquivo auditado:** `tests/visual/content-manga-pipeline.visual.js`.

**Arquivos relacionados:** `extension/content/content_manga.js`, `extension/content/cm-gtc-client.js`, `extension/content/cm-dom-replace.js`.

**Evidência atual:** o mirror é executado e ficou verde no run 36521561968; módulos compartilhados GTC são reais, mas a orquestração do content não é carregada.

**Evidência ausente:** execução do pipeline atual real ou gate de equivalência que compare o mirror com a produção para SHA/dHash/perceptual/crop/relaxed/correlated/Gemini.

**Por que é insuficiente:** um mirror verde não detecta drift da implementação original; drift visual-v4 já é observável.

**Ação solicitada:** migrar os cenários para APIs reais exportadas/harness real do content, ou criar equivalence gate explícito. Fazer isso em alteração de testes autorizada separada.

**Evidência esperada:** os mesmos vetores provocam decisões equivalentes na implementação real atual, incluindo superfícies visual-v4/crop e fallbacks adicionais.

**Possível regressão:** pipeline real pode quebrar/alterar precedência e a suíte continuar verde.

**Impacto:** validade da principal suíte visual que reivindica cobrir o pipeline.

**Severidade:** HIGH.

### 226-002 — SEMANTIC_DRIFT — OPEN — HIGH

**Encontrado:** `confirmWithRegionalHashes` local retorna `true` quando dados regionais estão ausentes; `cm-gtc-client.js` real retorna `false`.

**Contexto:** linhas 674–689 contêm implementação e assertions explícitas da semântica obsoleta.

**Arquivo auditado:** `tests/visual/content-manga-pipeline.visual.js`.

**Arquivo relacionado:** `extension/content/cm-gtc-client.js`.

**Evidência atual:** comparação direta das fontes atuais; produção aplica regra fail-closed para ausência de evidência regional.

**Evidência ausente:** teste que chame a função real com `null`/dados ausentes.

**Por que é insuficiente:** atualmente o teste prova exatamente o comportamento oposto ao produto.

**Ação solicitada:** substituir o mirror por chamada à API real ou alinhar o contrato após decisão explícita do auditor; adicionar regressão focal da ausência de hashes.

**Evidência esperada:** assertion executando `MangaTranslatorGtcClient.confirmWithRegionalHashes` real e esperando o contrato aprovado.

**Possível regressão:** falso positivo perceptual pode ser aceito/rejeitado de forma diferente do que a suíte comunica.

**Impacto:** segurança da decisão de cache perceptual borderline.

**Severidade:** HIGH.

### 226-003 — MIRROR_DRIFT — OPEN — NORMAL

**Encontrado:** `getCleanUrl` local não rejeita `blob:` e resolve URL relativa contra base fixa; a produção em `cm-dom-replace.js` rejeita `blob:` e usa o contexto real da página.

**Contexto:** linhas 38–47 e 255–288.

**Arquivo auditado:** `tests/visual/content-manga-pipeline.visual.js`.

**Arquivo relacionado:** `extension/content/cm-dom-replace.js`.

**Evidência atual:** sete assertions exercitam somente o helper local.

**Evidência ausente:** `blob:`, bases reais diferentes e chamada da função real.

**Ação solicitada:** reaproveitar `MangaTranslatorDomReplace.getCleanUrl` em harness real ou adicionar equivalence gate/teste focal da API real.

**Evidência esperada:** assertions da função de produção para data/blob/query/fragment/URL relativa com base controlada.

**Possível regressão:** suite verde pode documentar normalização diferente da usada pelo content script.

**Impacto:** chaves limpas usadas em restore/cache/deduplicação.

**Severidade:** NORMAL.

### 226-004 — TEST_COVERAGE_GAP — OPEN — NORMAL

**Encontrado:** o mirror de fingerprint e a simulação de `dataset` não cobrem `wHashCrop`, `pHashCrop`, `origWHashCrop`, `origPHashCrop` nem `visual-v4`, presentes na produção atual.

**Contexto:** linhas 53–128, assertion de “6 campos”, e linhas 723–755.

**Arquivo auditado:** `tests/visual/content-manga-pipeline.visual.js`.

**Arquivos relacionados:** `extension/content/cm-gtc-client.js`, `extension/content/content_manga.js`.

**Evidência atual:** visual-v3 antigo é coberto; produção atual produz/persiste metadados crop adicionais.

**Evidência ausente:** assertions de cálculo, propagação, persistência e decisão visual-v4/crop no pipeline real.

**Ação solicitada:** adicionar cobertura real dos campos crop/visual-v4 ou mover estes cenários para suíte que execute os módulos atuais.

**Evidência esperada:** assertions diretas sobre hashes crop e `fingerprintVersion=visual-v4`, inclusive dataset/payload GTC.

**Possível regressão:** crop hashes podem deixar de ser calculados/persistidos sem falhar este arquivo.

**Impacto:** matching perceptual visual-v4.

**Severidade:** NORMAL.

## 15. Fonte integral auditada

Abaixo está o blob integral correspondente ao SHA `61bc86351c914a1d9bb6bb4a13168b4567ac3cf9`:

```javascript
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// test_content_manga_pipeline.js
// Testes para o pipeline de cache em 5 fases do content_manga.js
//
// Como o content_manga.js depende de DOM e chrome.*, extraímos e testamos
// as funções lógicas de forma isolada usando stubs:
//   - Stub de chrome.runtime.sendMessage
//   - Stub de canvas (sem DOM)
//   - Stub de img element (dataset, src, naturalWidth/Height)
//
// Cobre:
//   - generateImageFingerprint (local canvas + CORS fallback via SW)
//   - queryGlobalTranslationCache (SHA-256)
//   - queryGlobalTranslationCacheByDHash (dHash)
//   - queryGlobalTranslationCacheByPerceptual (wHash+pHash)
//   - saveGlobalTranslationCacheEntry (campos visual-v3)
//   - extractAndSendImages — lógica de decisão das 5 fases
//   - confirmWithRegionalHashes
//   - getCleanUrl
// ─────────────────────────────────────────────────────────────────────────────

globalThis.self = globalThis;
require('../../extension/shared/gtc-fingerprint.js');
require('../../extension/shared/gtc-indexeddb.js');

const { describe, it, ita, beforeEach, expect } = require('./runner.js');
const { solidColor, horizontalGradient, checkerboard, mangaPage, noise, brightnessShifted, isValidHex } = require('./helpers.js');

const fp  = globalThis.MangaTranslatorGtcFingerprint;
const idb = globalThis.MangaTranslatorGtcIndexedDb;

// ─────────────────────────────────────────────────────────────────────────────
// ── Extração inline das funções do content_manga.js ──────────────────────────
// Extraímos as funções independentes de DOM para testá-las diretamente.
// ─────────────────────────────────────────────────────────────────────────────

/** getCleanUrl — extraída literalmente do content_manga.js */
function getCleanUrl(urlStr) {
    if (!urlStr || urlStr.startsWith('data:')) return null;
    try {
        const u = new URL(urlStr, 'https://example.com');
        return u.origin + u.pathname;
    } catch(e) {
        return urlStr.split('?')[0].split('#')[0];
    }
}

/** normalizeHash inline */
const normalizeHash = idb.normalizeHash;

/**
 * generateImageFingerprint — versão testável sem DOM.
 * Aceita um stub de imgEl com:
 *   { src, naturalWidth, naturalHeight, _pixelData }
 * e um stub de sendRuntimeMessageAsync.
 */
async function generateImageFingerprint(imgEl, sendRuntimeMessageAsyncStub, gtcFpApi) {
    const fpApi = gtcFpApi || fp;
    const cleanUrl   = getCleanUrl(imgEl.src) || '';
    const imgWidth   = imgEl.naturalWidth  || 0;
    const imgHeight  = imgEl.naturalHeight || 0;
    let pixelSample  = 'nopixels';
    let dHash        = null;
    let wHash        = null;
    let pHash        = null;
    let regionalHashes = null;

    try {
        if (!imgEl._forceCors && imgEl._pixelData) {
            // Simula canvas local (não CORS bloqueado)
            const px8 = imgEl._pixelData.slice(0, 8*8*4);
            if (px8.length < 8*8*4) throw new Error('Imagem pequena demais');

            pixelSample = Array.from(px8).map(b => b.toString(16).padStart(2,'0')).join('');

            if (fpApi.calculateDHash) {
                const d9x8 = imgEl._pixelData9x8 || new Uint8ClampedArray(9*8*4).fill(128);
                dHash = fpApi.calculateDHash(d9x8);
            }

            if (fpApi.calculateWHash) {
                const d32 = imgEl._pixelData32 || new Uint8ClampedArray(32*32*4).fill(128);
                wHash = fpApi.calculateWHash(d32);
            }
            if (fpApi.calculatePHash) {
                const d32 = imgEl._pixelData32 || new Uint8ClampedArray(32*32*4).fill(128);
                pHash = fpApi.calculatePHash(d32);
            }

            if (fpApi.calculateRegionalHashes) {
                const d48 = imgEl._pixelData48 || new Uint8ClampedArray(48*48*4).fill(128);
                regionalHashes = fpApi.calculateRegionalHashes(d48);
            }
        } else {
            throw new Error('CORS simulado');
        }
    } catch (corsErr) {
        if (imgEl.src && !imgEl.src.startsWith('data:') && !imgEl.src.startsWith('blob:')) {
            try {
                const fpResp = await sendRuntimeMessageAsyncStub({
                    action: 'CALCULATE_VISUAL_FINGERPRINT', url: imgEl.src,
                });
                if (fpResp && fpResp.ok) {
                    if (fpResp.pixelSample)    pixelSample    = fpResp.pixelSample;
                    if (fpResp.dHash)          dHash          = fpResp.dHash;
                    if (fpResp.wHash)          wHash          = fpResp.wHash;
                    if (fpResp.pHash)          pHash          = fpResp.pHash;
                    if (fpResp.regionalHashes) regionalHashes = fpResp.regionalHashes;
                }
            } catch (_e) {}
        }
    }

    let sha256 = null;
    if (fpApi.createFingerprintFromDescriptor) {
        sha256 = await fpApi.createFingerprintFromDescriptor({
            width: imgWidth, height: imgHeight, cleanUrl, pixelSample,
            hasVisualPixels: pixelSample !== 'nopixels',
        });
    }

    let fingerprintVersion = 'visual-v1';
    if (wHash || pHash) fingerprintVersion = 'visual-v3';
    else if (dHash)     fingerprintVersion = 'visual-v2';

    return { sha256, dHash, wHash, pHash, regionalHashes, fingerprintVersion };
}

/**
 * Pipeline de cache em 5 fases — extraído do content_manga.js para teste isolado.
 *
 * @param {Array} imgEls          Array de stubs de imgEl
 * @param {object} sendMsgStub    sendRuntimeMessageAsync stub
 * @returns {{ cacheHits: number[], geminiQueue: number[], decisions: object[] }}
 */
async function runCachePipeline(imgEls, sendMsgStub) {
    // Fase 1: fingerprints em paralelo
    const fingerprintResults = await Promise.all(
        imgEls.map(async (imgEl, i) => {
            if (imgEl._skip || imgEl._translated) return { i, sha256: null, skip: true };
            const fp = await generateImageFingerprint(imgEl, sendMsgStub);
            return { i, ...fp };
        })
    );

    // Fase 2: Lookup SHA-256
    const sha256Keys = fingerprintResults.filter(r => r.sha256).map(r => r.sha256);
    const gtcBySha256Resp = await sendMsgStub({ action: 'GTC_QUERY_MANY', hashes: sha256Keys });
    const gtcBySha256 = (gtcBySha256Resp?.ok && gtcBySha256Resp.entriesByHash) || {};

    // Fase 3: Lookup dHash (misses do SHA-256)
    const sha256Misses = fingerprintResults.filter(r => r.sha256 && !gtcBySha256[r.sha256]);
    const dHashKeys    = [...new Set(sha256Misses.filter(r => r.dHash).map(r => r.dHash))];
    let gtcByDHash = {};
    if (dHashKeys.length > 0) {
        const resp = await sendMsgStub({ action: 'GTC_QUERY_BY_DHASH', dHashes: dHashKeys });
        gtcByDHash = (resp?.ok && resp.entriesByDHash) || {};
    }

    // Fase 4: Lookup perceptual (misses do dHash)
    const dHashMisses = sha256Misses.filter(r => !(r.dHash && gtcByDHash[r.dHash]));
    const wHashKeys   = [...new Set(dHashMisses.filter(r => r.wHash).map(r => r.wHash))];
    const pHashKeys   = [...new Set(dHashMisses.filter(r => r.pHash).map(r => r.pHash))];
    let gtcByPerceptual = {};
    if (wHashKeys.length > 0 || pHashKeys.length > 0) {
        const resp = await sendMsgStub({
            action: 'GTC_QUERY_BY_PERCEPTUAL', wHashes: wHashKeys, pHashes: pHashKeys,
        });
        gtcByPerceptual = (resp?.ok && resp.entriesByPerceptual) || {};
    }

    // Fase 5: Decisão
    const cacheHits  = [];
    const geminiQueue = [];
    const decisions  = [];

    for (const r of fingerprintResults) {
        if (r.skip) continue;

        const sha256Hit = r.sha256 ? gtcBySha256[r.sha256] : null;
        if (sha256Hit) {
            cacheHits.push(r.i);
            decisions.push({ i: r.i, source: 'sha256', url: sha256Hit });
            continue;
        }

        const dHashHit = r.dHash ? gtcByDHash[r.dHash] : null;
        if (dHashHit) {
            cacheHits.push(r.i);
            decisions.push({ i: r.i, source: 'dhash', url: dHashHit });
            continue;
        }

        // Perceptual: chave composta ou simples
        const compositeKey = (r.wHash && r.pHash) ? `${r.wHash}:${r.pHash}` : null;
        let percHit = null;
        if (compositeKey && gtcByPerceptual[compositeKey]) percHit = gtcByPerceptual[compositeKey];
        if (!percHit && r.wHash && gtcByPerceptual[r.wHash]) percHit = gtcByPerceptual[r.wHash];
        if (!percHit && r.pHash && gtcByPerceptual[r.pHash]) percHit = gtcByPerceptual[r.pHash];

        if (percHit?.translatedDataUrl) {
            cacheHits.push(r.i);
            decisions.push({ i: r.i, source: 'perceptual', url: percHit.translatedDataUrl, confidence: percHit.confidence });
            continue;
        }

        geminiQueue.push(r.i);
        decisions.push({ i: r.i, source: 'gemini' });
    }

    return { cacheHits, geminiQueue, decisions, fingerprintResults };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fábrica de stub de chrome.runtime.sendMessage com IndexedDB em memória
// ─────────────────────────────────────────────────────────────────────────────

function makeChromeSendMessageStub(repo) {
    const handler = idb.createGtcRuntimeHandler({ repository: repo, fingerprintApi: fp });

    return function sendRuntimeMessageAsyncStub(message) {
        return new Promise((resolve) => {
            const handled = handler(message, {}, resolve);
            if (!handled) resolve({ ok: false, action: message.action });
        });
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fábricas de stub de imgEl
// ─────────────────────────────────────────────────────────────────────────────

function makeImgEl(overrides = {}) {
    const pixData = overrides._pixelData || solidColor(32, 32, 128, 128, 128);
    return {
        src:           overrides.src           ?? 'https://cdn.site.com/page1.jpg',
        naturalWidth:  overrides.naturalWidth  ?? 800,
        naturalHeight: overrides.naturalHeight ?? 1200,
        _pixelData:    new Uint8ClampedArray(Array.from({ length: 8*8*4 }, (_, i) => pixData[i] || 128)),
        _pixelData9x8: new Uint8ClampedArray(9*8*4).fill(128),
        _pixelData32:  pixData.length >= 32*32*4 ? pixData : new Uint8ClampedArray(32*32*4).fill(128),
        _pixelData48:  pixData.length >= 48*48*4 ? pixData : new Uint8ClampedArray(48*48*4).fill(128),
        _forceCors:    overrides._forceCors    ?? false,
        _skip:         overrides._skip         ?? false,
        _translated:   overrides._translated   ?? false,
        dataset:       {},
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — getCleanUrl
// ─────────────────────────────────────────────────────────────────────────────
describe('getCleanUrl', () => {

    it('remove query string', () => {
        expect(getCleanUrl('https://cdn.site.com/p1.jpg?token=abc123&ts=999'))
            .toBe('https://cdn.site.com/p1.jpg');
    });

    it('remove fragment', () => {
        expect(getCleanUrl('https://cdn.site.com/p1.jpg#section'))
            .toBe('https://cdn.site.com/p1.jpg');
    });

    it('preserva path', () => {
        expect(getCleanUrl('https://cdn.site.com/manga/ch1/page1.jpg'))
            .toBe('https://cdn.site.com/manga/ch1/page1.jpg');
    });

    it('retorna null para data: URL', () => {
        expect(getCleanUrl('data:image/png;base64,ABC')).toBeNull();
    });

    it('retorna null para string vazia', () => {
        expect(getCleanUrl('')).toBeNull();
    });

    it('retorna null para null', () => {
        expect(getCleanUrl(null)).toBeNull();
    });

    it('lida com URL relativa usando origin como base', () => {
        const result = getCleanUrl('/manga/page1.jpg');
        expect(result).toContain('/manga/page1.jpg');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — generateImageFingerprint
// ─────────────────────────────────────────────────────────────────────────────
describe('generateImageFingerprint', () => {

    const noopSend = async () => ({ ok: false });

    ita('retorna todos os 6 campos esperados', async () => {
        const imgEl = makeImgEl({ _pixelData32: solidColor(32, 32, 100, 150, 200) });
        const r = await generateImageFingerprint(imgEl, noopSend);
        expect(r).toHaveProperty('sha256');
        expect(r).toHaveProperty('dHash');
        expect(r).toHaveProperty('wHash');
        expect(r).toHaveProperty('pHash');
        expect(r).toHaveProperty('regionalHashes');
        expect(r).toHaveProperty('fingerprintVersion');
    });

    ita('sha256 é string de 64 chars hex', async () => {
        const imgEl = makeImgEl();
        const r = await generateImageFingerprint(imgEl, noopSend);
        expect(isValidHex(r.sha256, 64)).toBeTruthy();
    });

    ita('wHash é string de 64 chars hex', async () => {
        const imgEl = makeImgEl({ _pixelData32: mangaPage(32, 32, 'EN') });
        const r = await generateImageFingerprint(imgEl, noopSend);
        expect(isValidHex(r.wHash, 64)).toBeTruthy();
    });

    ita('pHash é string de 64 chars hex', async () => {
        const imgEl = makeImgEl({ _pixelData32: mangaPage(32, 32, 'EN') });
        const r = await generateImageFingerprint(imgEl, noopSend);
        expect(isValidHex(r.pHash, 64)).toBeTruthy();
    });

    ita('fingerprintVersion = "visual-v3" quando wHash presente', async () => {
        const imgEl = makeImgEl();
        const r = await generateImageFingerprint(imgEl, noopSend);
        expect(r.fingerprintVersion).toBe('visual-v3');
    });

    ita('CORS fallback: usa SW quando canvas é bloqueado (_forceCors=true)', async () => {
        let swCalled = false;
        const swStub = async (msg) => {
            if (msg.action === 'CALCULATE_VISUAL_FINGERPRINT') {
                swCalled = true;
                const d32 = mangaPage(32, 32, 'EN');
                return {
                    ok: true,
                    pixelSample: 'aa'.repeat(256),
                    dHash:    fp.calculateDHash(new Uint8ClampedArray(9*8*4).fill(100)),
                    wHash:    fp.calculateWHash(d32),
                    pHash:    fp.calculatePHash(d32),
                    regionalHashes: fp.calculateRegionalHashes(new Uint8ClampedArray(48*48*4).fill(100)),
                };
            }
            return { ok: false };
        };

        const imgEl = makeImgEl({ _forceCors: true, src: 'https://cdn.crossorigin.com/p1.jpg' });
        const r = await generateImageFingerprint(imgEl, swStub);

        expect(swCalled).toBe(true);
        expect(r.wHash).not.toBeNull();
        expect(r.pHash).not.toBeNull();
    });

    ita('CORS fallback: dados do SW são usados nos campos corretos', async () => {
        const d32 = mangaPage(32, 32, 'PT');
        const expectedWHash = fp.calculateWHash(d32);
        const expectedPHash = fp.calculatePHash(d32);

        const swStub = async (msg) => {
            if (msg.action === 'CALCULATE_VISUAL_FINGERPRINT') {
                return {
                    ok: true,
                    pixelSample: 'bb'.repeat(256),
                    dHash: 'ddhash12ddhash12',
                    wHash: expectedWHash,
                    pHash: expectedPHash,
                    regionalHashes: { topLeft: 'a'.repeat(16), topRight: 'b'.repeat(16),
                                      bottomLeft: 'c'.repeat(16), bottomRight: 'd'.repeat(16) },
                };
            }
            return { ok: false };
        };

        const imgEl = makeImgEl({ _forceCors: true, src: 'https://cross.cdn.net/img.jpg' });
        const r = await generateImageFingerprint(imgEl, swStub);

        expect(r.wHash).toBe(expectedWHash);
        expect(r.pHash).toBe(expectedPHash);
        expect(r.dHash).toBe('ddhash12ddhash12');
    });

    ita('CORS fallback: SW falhando → fingerprintVersion = "visual-v1" (graceful)', async () => {
        const swStub = async () => ({ ok: false, error: 'fetch failed' });
        const imgEl  = makeImgEl({ _forceCors: true, src: 'https://broken.cdn.net/img.jpg' });
        const r = await generateImageFingerprint(imgEl, swStub);

        // Não lança — degradação graciosa
        expect(r.fingerprintVersion).toBe('visual-v1');
        expect(r.wHash).toBeNull();
        expect(r.pHash).toBeNull();
    });

    ita('data: URL → cleanUrl null → sha256 usa URL como discriminador', async () => {
        const imgEl = makeImgEl({ src: 'data:image/png;base64,ABC123' });
        // Não lança — limpa cleanUrl
        const r = await generateImageFingerprint(imgEl, noopSend);
        expect(r).toHaveProperty('sha256');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — Pipeline de 5 fases — casos de teste
// ─────────────────────────────────────────────────────────────────────────────
describe('Pipeline 5 fases — Fase 2: SHA-256 hit', () => {

    ita('imagem em cache SHA-256 → cacheHits, não vai para Gemini', async () => {
        const repo = idb.createInMemoryRepository();
        const send = makeChromeSendMessageStub(repo);

        // Pré-popula cache com SHA-256
        const imgEl = makeImgEl({ src: 'https://site.com/p1.jpg' });
        const fp0   = await generateImageFingerprint(imgEl, send);

        await repo.put({
            hash: fp0.sha256, translatedDataUrl: 'data:cached_sha256',
            wHash: null, pHash: null, dHash: null,
        });

        const { cacheHits, geminiQueue, decisions } = await runCachePipeline([imgEl], send);

        expect(cacheHits).toContain(0);
        expect(geminiQueue).not.toContain(0);
        expect(decisions[0].source).toBe('sha256');
        expect(decisions[0].url).toBe('data:cached_sha256');
    });

    ita('N imagens — todas em cache SHA-256 → geminiQueue vazia', async () => {
        const repo = idb.createInMemoryRepository();
        const send = makeChromeSendMessageStub(repo);

        const imgs = [
            makeImgEl({ src: 'https://s.com/p1.jpg', _pixelData32: solidColor(32,32,10,10,10) }),
            makeImgEl({ src: 'https://s.com/p2.jpg', _pixelData32: solidColor(32,32,20,20,20) }),
            makeImgEl({ src: 'https://s.com/p3.jpg', _pixelData32: solidColor(32,32,30,30,30) }),
        ];

        for (const img of imgs) {
            const fp0 = await generateImageFingerprint(img, send);
            await repo.put({ hash: fp0.sha256, translatedDataUrl: `data:cached_${fp0.sha256.slice(0,8)}`, wHash: null, pHash: null });
        }

        const { cacheHits, geminiQueue } = await runCachePipeline(imgs, send);
        expect(cacheHits.length).toBe(3);
        expect(geminiQueue.length).toBe(0);
    });
});

describe('Pipeline 5 fases — Fase 3: dHash hit', () => {

    ita('miss SHA-256, hit dHash → cache hit com source=dhash', async () => {
        const repo = idb.createInMemoryRepository();
        const send = makeChromeSendMessageStub(repo);

        const imgEl = makeImgEl({
            src: 'https://cdn.new-mirror.com/page1.jpg', // URL diferente do original
            _pixelData32: horizontalGradient(32, 32),
        });
        const fp0 = await generateImageFingerprint(imgEl, send);

        // Salva apenas com dHash (simula entrada visual-v2)
        await repo.put({
            hash: 'sha_diferente_do_fingerprintado',
            translatedDataUrl: 'data:cached_dhash',
            dHash: fp0.dHash,
            wHash: null,
            pHash: null,
        });

        const { cacheHits, geminiQueue, decisions } = await runCachePipeline([imgEl], send);

        expect(cacheHits).toContain(0);
        expect(geminiQueue).not.toContain(0);
        expect(decisions[0].source).toBe('dhash');
    });
});

describe('Pipeline 5 fases — Fase 4: wHash+pHash perceptual hit (cross-language)', () => {

    ita('[CROSS-LANGUAGE] miss SHA-256 e dHash, hit perceptual → cache hit com source=perceptual', async () => {
        const repo = idb.createInMemoryRepository();
        const send = makeChromeSendMessageStub(repo);

        // Save EN translation — use fake dHash so PT lookup cannot hit via dHash
        const imgEN = makeImgEl({ src: 'https://cdn.en.com/ch1/p1.jpg', _pixelData32: mangaPage(32, 32, 'EN') });
        const fpEN  = await generateImageFingerprint(imgEN, send);

        // Store with a unique dHash that won't match any PT dHash
        await repo.put({
            hash:              'sha_en_xling_unique',   // won't match PT SHA-256
            translatedDataUrl: 'data:translated_from_en',
            dHash:             'aaaa0000ffff1111',      // fake — won't match PT dHash
            wHash:             fpEN.wHash,              // real EN wHash
            pHash:             fpEN.pHash,
            fingerprintVersion: 'visual-v3',
        });

        // PT: same art (same wHash approx) but different SHA-256 and different dHash
        const imgPT = makeImgEl({
            src: 'https://cdn.pt.com/ch1/p1.jpg',
            _pixelData32: mangaPage(32, 32, 'PT'),
            _pixelData9x8: solidColor(9, 8, 77, 77, 77), // distinct → dHash won't be 'aaaa0000ffff1111'
        });

        const { cacheHits, geminiQueue, decisions } = await runCachePipeline([imgPT], send);

        console.log('      Cross-language pipeline: cacheHits=' + cacheHits.length + ', gemini=' + geminiQueue.length);
        if (decisions.length > 0) {
            console.log('      Decisão: source=' + decisions[0].source + ', confidence=' + (decisions[0].confidence?.toFixed(3)));
        }

        expect(cacheHits).toContain(0);
        expect(geminiQueue).not.toContain(0);
        expect(decisions[0].source).toBe('perceptual');
    });
});

describe('Pipeline 5 fases — Fase 5: Gemini queue (miss total)', () => {

    ita('imagem totalmente nova → vai para geminiQueue', async () => {
        const repo = idb.createInMemoryRepository(); // cache vazio
        const send = makeChromeSendMessageStub(repo);

        const imgEl = makeImgEl({ src: 'https://new.cdn.com/fresh_page.jpg' });
        const { cacheHits, geminiQueue } = await runCachePipeline([imgEl], send);

        expect(cacheHits).not.toContain(0);
        expect(geminiQueue).toContain(0);
    });

    ita('mix: 1 cache hit + 1 gemini → correto em lote', async () => {
        const repo = idb.createInMemoryRepository();
        const send = makeChromeSendMessageStub(repo);

        // CRITICAL: _pixelData controls the 8x8 pixelSample used in SHA-256.
        // Both images must have DIFFERENT _pixelData so their sha256 differs.
        // Use explicit pixel buffers with distinct values.
        const px0 = solidColor(8, 8,  50,  50,  50); // dark grey → distinct sha256
        const px1 = solidColor(8, 8, 200, 200, 200); // light grey → different sha256

        const img0 = makeImgEl({
            src: 'https://s.com/page0.jpg',
            _pixelData:   px0,                         // distinct 8x8 sample
            _pixelData32: horizontalGradient(32, 32),
        });
        const img1 = makeImgEl({
            src: 'https://s.com/page1.jpg',
            _pixelData:   px1,                         // different 8x8 sample → different sha256
            _pixelData32: checkerboard(32, 32, 2),
        });

        const fp0 = await generateImageFingerprint(img0, send);
        // Save WITHOUT wHash/pHash so img1 gets no perceptual hit
        await repo.put({
            hash: fp0.sha256,
            translatedDataUrl: 'data:cached',
            wHash: null, pHash: null, dHash: null,
        });

        const { cacheHits, geminiQueue } = await runCachePipeline([img0, img1], send);

        expect(cacheHits).toContain(0);    // img0: SHA-256 cache hit
        expect(geminiQueue).toContain(1);  // img1: no entry → Gemini
        expect(cacheHits.length).toBe(1);
        expect(geminiQueue.length).toBe(1);
    });

    ita('imagens com _skip=true são ignoradas no pipeline', async () => {
        const repo = idb.createInMemoryRepository();
        const send = makeChromeSendMessageStub(repo);

        const img0 = makeImgEl({ src: 'https://s.com/p0.jpg', _skip: true });
        const img1 = makeImgEl({ src: 'https://s.com/p1.jpg' });

        const { cacheHits, geminiQueue, decisions } = await runCachePipeline([img0, img1], send);

        // img0 ignorada; img1 vai para Gemini (cache vazio)
        expect(decisions.some(d => d.i === 0)).toBe(false);
        expect(geminiQueue).toContain(1);
    });

    ita('cache vazio: N imagens → todas na geminiQueue', async () => {
        const repo = idb.createInMemoryRepository();
        const send = makeChromeSendMessageStub(repo);

        const imgs = Array.from({ length: 5 }, (_, i) =>
            makeImgEl({ src: `https://s.com/p${i}.jpg` })
        );

        const { cacheHits, geminiQueue } = await runCachePipeline(imgs, send);

        expect(cacheHits.length).toBe(0);
        expect(geminiQueue.length).toBe(5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — saveGlobalTranslationCacheEntry — campos visual-v3
// ─────────────────────────────────────────────────────────────────────────────
describe('saveGlobalTranslationCacheEntry — campos visual-v3', () => {

    async function saveEntry(repo, hash, translatedUrl, metadata) {
        const send = makeChromeSendMessageStub(repo);
        const r = await send({
            action: 'GTC_SAVE',
            hash,
            translatedDataUrl: translatedUrl,
            ...metadata,
        });
        return r;
    }

    ita('salva wHash, pHash, regionalHashes corretamente', async () => {
        const repo = idb.createInMemoryRepository();
        const d32  = mangaPage(32, 32, 'EN');
        const wH   = fp.calculateWHash(d32);
        const pH   = fp.calculatePHash(d32);
        const rH   = fp.calculateRegionalHashes(new Uint8ClampedArray(48*48*4).fill(128));

        const r = await saveEntry(repo, 'test_save_v3', 'data:v3', {
            wHash: wH, pHash: pH, regionalHashes: rH,
            fingerprintVersion: 'visual-v3',
        });

        expect(r.ok).toBe(true);
        expect(r.saved).toBe(true);

        // Verifica que pode ser encontrado via lookup perceptual
        const found = await repo.getManyByPerceptual([wH], [pH], fp);
        expect(Object.values(found).length).toBeGreaterThan(0);
    });

    ita('salva entrada com fingerprintVersion="visual-v3"', async () => {
        const repo = idb.createInMemoryRepository();
        const r = await saveEntry(repo, 'fp_version_test', 'data:fpv', {
            fingerprintVersion: 'visual-v3',
            wHash: fp.calculateWHash(solidColor(32,32,100,100,100)),
            pHash: fp.calculatePHash(solidColor(32,32,100,100,100)),
        });
        expect(r.ok).toBe(true);
    });

    ita('salva entrada visual-v2 (sem wHash) sem erros', async () => {
        const repo = idb.createInMemoryRepository();
        const r = await saveEntry(repo, 'v2_compat', 'data:v2', {
            dHash: 'ddhash_v2',
            fingerprintVersion: 'visual-v2',
        });
        expect(r.ok).toBe(true);
    });

    ita('reject: hash vazio retorna saved:false', async () => {
        const repo = idb.createInMemoryRepository();
        const r = await saveEntry(repo, '', 'data:x', {});
        expect(r.saved).toBe(false);
    });

    ita('reject: translatedDataUrl ausente retorna saved:false', async () => {
        const repo = idb.createInMemoryRepository();
        const r = await saveEntry(repo, 'hash_notranslation', null, {});
        expect(r.saved).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — confirmWithRegionalHashes (validação de matches borderline)
// ─────────────────────────────────────────────────────────────────────────────
describe('confirmWithRegionalHashes', () => {

    /** Extração inline da lógica do content_manga.js */
    function confirmWithRegionalHashes(queryRegional, entryRegional) {
        if (!queryRegional || !entryRegional || !fp) return true;
        if (typeof fp.matchRegionalHashes !== 'function') return true;
        const result = fp.matchRegionalHashes(queryRegional, entryRegional,
            { threshold: 8, minMatches: 3 });
        return result.match;
    }

    it('retorna true quando queryRegional é null (sem dados → aceitar)', () => {
        expect(confirmWithRegionalHashes(null, null)).toBe(true);
    });

    it('retorna true quando entryRegional é null', () => {
        const r = fp.calculateRegionalHashes(new Uint8ClampedArray(48*48*4).fill(100));
        expect(confirmWithRegionalHashes(r, null)).toBe(true);
    });

    it('retorna true para hashes regionais idênticos', () => {
        const data = mangaPage(48, 48, 'EN');
        const r = fp.calculateRegionalHashes(data);
        expect(confirmWithRegionalHashes(r, r)).toBe(true);
    });

    it('retorna false para hashes regionais completamente diferentes', () => {
        const r1 = fp.calculateRegionalHashes(new Uint8ClampedArray(48*48*4).fill(0));
        const r2 = fp.calculateRegionalHashes(new Uint8ClampedArray(48*48*4).fill(255));
        // Depende dos hashes gerados — se Hamming > 8 em todos os cantos, retorna false
        const result = confirmWithRegionalHashes(r1, r2);
        expect(typeof result).toBe('boolean');
    });

    it('[CROSS-LANGUAGE] página EN e PT passam confirmação regional', () => {
        const dataEN = mangaPage(48, 48, 'EN');
        const dataPT = mangaPage(48, 48, 'PT');
        const rEN = fp.calculateRegionalHashes(dataEN);
        const rPT = fp.calculateRegionalHashes(dataPT);
        const confirmed = confirmWithRegionalHashes(rEN, rPT);
        // Arte dos cantos é igual → confirmação deve passar
        expect(confirmed).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Consistência dos hashes salvos no dataset (img.dataset.*)
// Simula que os hashes são escritos no dataset durante a fase 5
// e lidos corretamente no handler UPDATE_IMAGE
// ─────────────────────────────────────────────────────────────────────────────
describe('Hashes no dataset da imagem (img.dataset.*)', () => {

    ita('todos os hashes são salvos nos campos corretos do dataset', async () => {
        const noopSend = async () => ({ ok: false });
        const d32 = mangaPage(32, 32, 'EN');
        const d48 = new Uint8ClampedArray(48*48*4);
        for (let i = 0; i < d48.length; i++) d48[i] = d32[i % d32.length];

        const imgEl = makeImgEl({ _pixelData32: d32, _pixelData48: d48 });
        const fpResult = await generateImageFingerprint(imgEl, noopSend);

        // Simula o que a Fase 5 faz: salva hashes no dataset
        const dataset = {};
        if (fpResult.sha256)         dataset.origHash           = fpResult.sha256;
        if (fpResult.dHash)          dataset.origDHash          = fpResult.dHash;
        if (fpResult.wHash)          dataset.origWHash          = fpResult.wHash;
        if (fpResult.pHash)          dataset.origPHash          = fpResult.pHash;
        if (fpResult.regionalHashes) dataset.origRegionalHashes = JSON.stringify(fpResult.regionalHashes);
        if (fpResult.fingerprintVersion) dataset.origFpVersion  = fpResult.fingerprintVersion;

        // Verifica campos
        expect(dataset.origHash).toHaveLength(64);
        expect(dataset.origDHash).toHaveLength(16);
        expect(dataset.origWHash).toHaveLength(64);
        expect(dataset.origPHash).toHaveLength(64);
        expect(typeof dataset.origRegionalHashes).toBe('string');
        expect(dataset.origFpVersion).toBe('visual-v3');

        // Verifica que JSON.parse restaura corretamente
        const parsedRegional = JSON.parse(dataset.origRegionalHashes);
        expect(isValidHex(parsedRegional.topLeft,     16)).toBeTruthy();
        expect(isValidHex(parsedRegional.topRight,    16)).toBeTruthy();
        expect(isValidHex(parsedRegional.bottomLeft,  16)).toBeTruthy();
        expect(isValidHex(parsedRegional.bottomRight, 16)).toBeTruthy();
    });

    it('JSON.stringify + JSON.parse de regionalHashes é round-trip perfeito', () => {
        const data = mangaPage(48, 48, 'EN');
        const regional = fp.calculateRegionalHashes(data);
        const serialized = JSON.stringify(regional);
        const deserialized = JSON.parse(serialized);
        expect(deserialized.topLeft).toBe(regional.topLeft);
        expect(deserialized.topRight).toBe(regional.topRight);
        expect(deserialized.bottomLeft).toBe(regional.bottomLeft);
        expect(deserialized.bottomRight).toBe(regional.bottomRight);
    });
});
```

## 16. Autoauditoria do AGENTE 3

- [x] reserva #226 criada com CREATE ONLY;
- [x] reserva relida e proprietário confirmado como AGENTE 3;
- [x] SHA da fonte reconfirmado antes da documentação;
- [x] fonte integral incorporada;
- [x] 767 linhas textuais + newline terminal = 768 posições;
- [x] mapa de intervalos cobre 1–768 sem lacuna;
- [x] 36 casos inventariados;
- [x] módulos reais e mirrors explicitamente separados;
- [x] wiring do runner/CI verificado;
- [x] execução histórica do mesmo blob localizada;
- [x] drift de produção não foi “corrigido” para fabricar evidência;
- [x] necessidades externas registradas como solicitações ao auditor;
- [x] nenhum arquivo de produção, teste, fixture, workflow ou config foi modificado.

**Resultado:** a Bíblia documenta fielmente o que #226 realmente prova e o que ele apenas simula. O arquivo é executável e historicamente verde, mas possui drift relevante frente ao pipeline atual; isso fica registrado sem bloquear a conclusão documental.

# Bíblia técnica — `extension/content/gemini/result-extractor.js`

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA
> **SHA auditado:** `a3efd499a0b090f12701533a96f2602bf29bbcbb`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#I`  
> **Tipo:** JavaScript — content-script helper Gemini / extração de imagem e fallback de transporte  
> **Linhas textuais:** **413**  
> **Posições documentais:** **414** contando newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`result-extractor.js` é o boundary que transforma o resultado visual detectado na aba Gemini em uma **Data URL entregável ao restante do pipeline**. Ele não detecta qual imagem é resultado — isso pertence ao observer/job runner — e não persiste o resultado — isso pertence ao orquestrador/background. Seu trabalho é escolher, em ordem explícita, uma rota de extração compatível com o tipo da URL e com o modo de execução.

O módulo existe porque uma única estratégia é insuficiente: canvas pode ser bloqueado por taint/CORS; Blob URL só é útil no contexto que a criou; assets Google podem exigir sessão da aba Gemini; fetch no MAIN world pode ter credenciais/semântica diferentes do isolated world; e o Service Worker tem um action dedicado com validação de origem, host, MIME, tamanho e timeout.

A separação em fábrica mantém o módulo testável: `content_gemini.js` cria uma instância com `chrome.runtime`, `window`, `document`, `fetch`, logger e metadata reais. O `job-runner.js` recebe essa instância como dependência e chama `extractOrAuxiliaryFallback` somente depois de ter uma URL de resultado.

## 2. Carregamento, dependências e consumidores

- **Manifest:** `extension/manifest.json` carrega este arquivo em `document_idle` na aba Gemini, depois de `temporary-chat.js` e antes de `deletion.js`, `job-runner.js` e `content_gemini.js`.
- **Composition root:** `extension/content/content_gemini.js` lê `globalThis.MangaTranslatorGeminiResultExtractor` e, nas linhas 199–207 atuais, cria a instância com `sendLog`, `getUrlLogMetadata`, `sleep`, `chrome.runtime`, `window`, `document` e `fetch`.
- **Injeção no runner:** o mesmo bootstrap passa `resultExtractor` para `GeminiJobRunner.createGeminiJobRunner` na linha 232 atual.
- **Consumidor crítico:** `extension/content/gemini/job-runner.js` chama `extractOrAuxiliaryFallback` nas linhas 1309–1341 atuais, com `maxAttempts:4`, delay de 1000 ms e contexto `jobIdPrefix/batchIdPrefix/index`.
- **Fallback auxiliar:** o callback do runner registra `GEMINI_RESULT_URL`; se o background não confirmar `extractionRegistered:true`, o runner lança `AUXILIARY_REGISTRATION_FAILED`.
- **Compatibilidade:** `content_gemini.js` reexporta wrappers de `imageElementToDataUrl`, bridges, `extractImageInGeminiTab`, `extractResultImage`, retry e classificador.
- **Background:** as duas rotas SW usam `FETCH_IMAGE_AS_BASE64`, mapeada pelo router para `background/actions/fetch-image-base64.js`.
- **Action real:** `fetch-image-base64.js` aceita apenas HTTP(S), limita resposta a MIME `image/*`, 50 MB e 30 s; quando `geminiSession:true`, exige host `googleusercontent.com`/subdomínio e sender da aba `https://gemini.google.com/`.
- **Teste direto principal:** `tests/unit/content-gemini/result-extractor.test.js` usa `require(RESULT_EXTRACTOR_PATH)` dentro de `jest.isolateModules`, portanto executa a implementação real deste arquivo.
- **Integração real do bridge/fluxo:** `tests/unit/content-gemini/safe-background-delete.test.js` carrega os módulos Gemini reais via `loadContentGeminiModule()` e chama wrappers que delegam à instância real deste extractor; BGD-04/05/06/08/09/10/12/13/14 exercitam bridge MAIN, correlação, timeout, cadeia, logs e retry.
- **Teste do boundary SW:** `tests/unit/background/fetch-image-base64-action.test.js` executa router + action reais; prova as restrições do lado background, não a lógica interna deste módulo.

## 3. Fluxo de dados e ordem de extração

| Entrada / condição | Ordem efetiva | Resultado esperado |
|---|---|---|
| `data:image/*` | retorno direto | mesma Data URL |
| `blob:*` | `fetchImpl` → `response.blob()` → FileReader | Data URL |
| asset HTTPS `googleusercontent.com/.../gg-dl/` ou `rd-gg-dl` | canvas → SW com `geminiSession:true` → MAIN fetch | primeira Data URL bem-sucedida |
| qualquer URL em `background_delete` | canvas → MAIN fetch; se não for asset gerado, tentativa SW com `geminiSession:true` | sucesso direto ou erro/retry |
| HTTP comum em outros modos | SW legado sem `geminiSession` | Data URL ou erro |
| falha da cadeia completa | repetir até `maxAttempts` | sucesso ou último erro |
| falha após retries | diagnóstico → callback auxiliar | `kind:'auxiliary'` ou relançamento |

O retry envolve **a cadeia completa**, não apenas o último fetch. Isso é importante porque falhas de CORS/sessão podem ser transitórias e porque uma imagem inicialmente incompleta pode tornar-se desenhável no canvas numa tentativa seguinte.

## 4. Estado, lifecycle e MV3

O módulo não grava `chrome.storage` e não mantém registry global por job. O estado temporário está em Promises/closures: `settled`, `timer`, `reader`, `lastError` e parâmetros da instância. Recarregar/navegar a aba Gemini destrói esse estado.

O Service Worker MV3 pode ser suspenso entre operações. `chrome.runtime.sendMessage` é usado como boundary assíncrono; se o callback receber `runtime.lastError`, a rota rejeita e o retry/fallback decide o próximo passo. A durabilidade de job e a persistência final ficam fora deste arquivo.

O bridge MAIN-world não depende da vida do Service Worker: usa eventos DOM entre o isolated world e `inject.js`. Cada solicitação instala listener temporário, cria timeout e usa `requestId` para ignorar respostas de outras solicitações.

## 5. Segurança, privacidade e trust boundaries

### 5.1 Service Worker

A flag `geminiSession:true` é privilegiada porque faz o action real usar `credentials:'include'`. Este módulo **não valida o host por conta própria**; a validação está deliberadamente no background, que exige googleusercontent e sender Gemini. Isso evita que um content script reutilize a rota autenticada para origem arbitrária.

A rota `fetchImageThroughBackground` não envia a flag e, no action real, usa credenciais omitidas.

### 5.2 MAIN-world bridge

`fetchImageThroughGeminiPage` coloca `{requestId, url}` em um `CustomEvent` no `window`. A resposta é aceita quando o evento `MANGA_TRANSLATOR_FETCH_IMAGE_RESULT` traz o mesmo `requestId` e um `dataUrl` truthy.

Esse é um boundary de confiança: o contexto da página pode observar eventos DOM. O produtor canônico em `extension/content/inject.js` faz `fetch(..., {credentials:'include', cache:'no-store'})`, exige `response.ok`, converte o body em Blob e rejeita MIME que não comece com `image/` antes de emitir a resposta. Porém, o consumidor deste arquivo só verifica `requestId` + `dataUrl` truthy. O `requestId` evita mistura acidental entre requisições concorrentes — inclusive há teste BGD-08 para ID incorreto — mas **não é autenticação criptográfica**. Uma página capaz de observar a solicitação também pode conhecer o ID e tentar emitir um evento de resposta forjado; esse evento alternativo não passa necessariamente pela validação de MIME do produtor canônico.

### 5.3 Logs

O logger de produção sanitiza URLs/base64 em `content_gemini.js`. Este arquivo reduz ainda mais o diagnóstico de erro para `errorName`, `failureKind` e `messageLength`. A URL bruta é passada às rotas de extração, mas não é escrita diretamente pelos logs deste módulo.

## 6. Concorrência, cleanup e idempotência

O bridge MAIN-world é idempotente por Promise: `settled` impede dupla conclusão por timeout + resposta tardia. `finish` cancela o timer e remove o listener.

Requisições simultâneas usam listeners independentes e filtram `requestId`. O mecanismo reduz cross-talk, mas não possui registry central nem detecção de colisão de IDs. Como o ID combina relógio e `Math.random`, colisões são improváveis, não impossíveis.

O fallback auxiliar é chamado no máximo uma vez por invocação de `extractOrAuxiliaryFallback`, depois de o loop de retries terminar. O callback pertence ao runner; este módulo não cria abas nem marca jobs como entregues, preservando ownership da persistência no orquestrador.

## 7. Evidência automatizada realmente lida

`tests/unit/content-gemini/result-extractor.test.js` importa **o arquivo real** nas linhas 5–15 atuais. As assertions relevantes são:

| Teste | Linhas atuais do teste | O que a assertion prova | Classificação |
|---|---:|---|---|
| EXT-01 | 110–130 | Data URL retorna idêntica; nenhum evento e nenhum SW | ✅ PROVADO DIRETAMENTE |
| EXT-02 | 132–154 | `background_delete` com canvas válido retorna PNG e não chama SW | ✅ PROVADO DIRETAMENTE |
| EXT-03 | 156–180 | falha de canvas escala para MAIN e para antes do SW | ✅ PROVADO DIRETAMENTE |
| EXT-04 | 182–209 | canvas + MAIN falhos chegam ao SW com `geminiSession:true` e retornam sessão | ✅ PROVADO DIRETAMENTE |
| EXT-05 | 211–239 | HTTP comum em modo não-background usa SW legado sem `geminiSession` | ✅ PROVADO DIRETAMENTE |
| EXT-06 | 241–269 | Blob usa fetch local + FileReader; SW fica intocado | ✅ PROVADO DIRETAMENTE |
| EXT-07 | 271–330 | duas passagens completas, sleep entre elas e fallback auxiliar somente no fim | ✅ PROVADO DIRETAMENTE |
| EXT-08 | 332–355 | sucesso direto produz `kind:'extracted'` e não chama auxiliar | ✅ PROVADO DIRETAMENTE |
| EXT-09 | 357–373 | sem callback auxiliar, o erro terminal é relançado | ✅ PROVADO DIRETAMENTE |
| EXT-10 | 375–402 | asset `gg-dl` usa sessão SW em três execution modes | ✅ PROVADO DIRETAMENTE |
| EXT-11 | 404–421 | `rd-gg-dl`: MAIN só vem depois da falha da sessão autenticada | ✅ PROVADO DIRETAMENTE |
| EXT-12 | 423–446 | HTTP comum em `temp_chat` preserva SW legado sem sessão | ✅ PROVADO DIRETAMENTE |
| EXT-13 | 448–488 | logs de estágio/retry/diagnóstico preservam jobIdPrefix/batchIdPrefix/index | ✅ PROVADO DIRETAMENTE |
| BGD-04 | safe-background-delete 66–80 | wrapper real do bridge resolve a Data URL correlacionada pelo requestId correto | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| BGD-05 | 82–96 | erro retornado pelo MAIN world é propagado pelo wrapper real | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| BGD-06 | 98–112 | imagem nula faz canvas falhar e a cadeia real obtém resultado pelo MAIN bridge | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| BGD-08 | 124–141 | resposta com outro requestId é ignorada; a resposta correta posterior vence | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| BGD-09 | 143–148 | ausência de resposta produz timeout com mensagem esperada | ✅ PROVADO DIRETAMENTE PARA O TIMEOUT; remoção do listener não recebe assertion específica |
| BGD-10 | 150–174 | após erro do MAIN, a rota real envia FETCH_IMAGE_AS_BASE64 com geminiSession:true | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| BGD-12 | 191–222 | falhas de canvas/MAIN/SW produzem estágios e classes de falha esperadas | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| BGD-13 | 224–256 | retry real repete a cadeia e recupera falha transitória na segunda chamada SW | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| BGD-14 | 258–283 | retries diretos são repetidos antes do erro terminal | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| resolution-elevation | 249–313 | pipeline real eleva URL para =s0 antes de FETCH_IMAGE_AS_BASE64 e entrega Data URL | 🟨 EXECUTADO INDIRETAMENTE NO FLUXO, com assertions de boundary |
| action `FETCH_IMAGE_AS_BASE64` | teste separado do background | host/sender autenticado, MIME, 50 MB, timeout, HTTP e protocolos | ✅ PROVADO DIRETAMENTE **DO ACTION**, evidência complementar ao boundary deste arquivo |
| `job-runner.test.js` | usa mock de `resultExtractor` | contrato do consumidor | 🟨 EXECUTADO POR CONTRATO/MOCK; não prova internals deste módulo |
| ordem no manifest | lista estática de scripts | arquivo carregado antes do runner/bootstrap | 🟦 GATE ESTÁTICO/ESTRUTURAL |

## 8. Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para imagem ausente/incompleta em `imageElementToDataUrl`, `document` ausente e `canvas.getContext('2d') === null`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `canvas.toDataURL` lançar separadamente de `drawImage`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para bridge MAIN-world sem `window`/listener/dispatch/CustomEvent.
- ✅ O timeout do bridge é provado por BGD-09; permanece ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para resposta tardia depois do timeout e para assertion direta de remoção efetiva do listener.
- ✅ BGD-08 prova que evento com `requestId` incorreto é ignorado antes de uma resposta correta; permanece ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para duas requisições concorrentes reais disputando eventos.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para colisão de `requestId` em duas extrações concorrentes.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para resposta MAIN-world com `dataUrl` truthy porém não-imagem/malformada.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para runtime ausente, `runtime.lastError`, `sendMessage` lançar e resposta sem `dataUrl`.
- 🟨 BGD-12 prova concretamente `http`, `network` e um caso `unknown` dentro do fluxo real; ainda ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** exaustivo para todas as classes de `getExtractionFailureKind`, especialmente `canvas_or_cors` e `timeout` via essa função.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para FileReader ausente, construtor que lança, `onerror` e `readAsDataURL` que lança.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para Blob fetch com resposta anômala/não-imagem; o ramo não valida `response.ok` nem MIME.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para URLs inválidas, HTTP não-HTTPS e googleusercontent sem `gg-dl` em `isGeneratedGeminiAsset`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** de integração real entre `result-extractor.js` e `fetch-image-base64.js` no caso **background_delete + host não-Google + canvas/MAIN falhos**.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `maxAttempts=0`/negativo, `sleep` rejeitando ou delay inválido.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `sendLog` ou `getUrlLogMetadata` lançar e alterar o fluxo da extração.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para callback auxiliar lançar/rejeitar e para preservação exata do erro nesse caso.

## 9. Análise crítica e riscos

### 9.1 Assimetria real em `background_delete` para host não-Google

No ramo não-gerado de `extractImageInGeminiTab`, depois de falhar canvas + MAIN, as linhas 246–252 chamam `fetchGeminiImageThroughExtension`, que sempre envia `geminiSession:true`. O action real `fetch-image-base64.js` rejeita `geminiSession:true` quando o host não é googleusercontent.

Consequência: para uma URL como `https://example.test/result.png` em `background_delete`, se canvas e MAIN falharem, a última rota direta não equivale ao fetch legado sem sessão; o background real tende a rejeitar por host. EXT-07 usa runtime mock e não reproduz essa validação. Isso pode ser intencional para não enviar credenciais a host arbitrário, mas existe uma lacuna entre o comentário “cadeia histórica” e o comportamento integrado real. Deve haver teste de integração específico antes de qualquer refactor.

### 9.2 Bridge MAIN-world não autentica resposta

BGD-08 prova corretamente que um `requestId` diferente é ignorado. O produtor canônico em `inject.js` também valida HTTP e MIME antes de converter a resposta. Mesmo assim, o `requestId` continua sendo **correlação**, não autenticação: ele é exposto no evento de solicitação e o consumidor aceita qualquer `detail.dataUrl` truthy com o ID esperado. Uma implementação mais defensiva validaria ao menos o esquema/prefixo/tamanho no lado consumidor e reduziria a confiança em eventos que não possam ser vinculados ao produtor canônico.

### 9.3 Telemetria pode interferir no caminho feliz

`logExtractionStage` chama `getUrlLogMetadata` e `sendLog` sem boundary de exceção. Se um logger injetado lançar, uma extração que já obteve Data URL pode ser convertida em falha/retry. O mesmo vale para os logs de diagnóstico/fallback. Observabilidade idealmente não deveria quebrar a entrega.

### 9.4 Blob path é permissivo

O ramo `blob:` não verifica `response.ok` (nem sempre significativo para blob URLs), MIME nem se o resultado de FileReader é realmente `data:image/*`. Em produção normal o observer já restringe candidatos, mas este helper exportado pode ser chamado isoladamente.

### 9.5 Taxonomia por mensagem é heurística

`getExtractionFailureKind` depende de substrings. Serve para telemetria, não para controle de segurança. Alterações de locale/mensagem do browser podem mover erro de categoria conhecida para `unknown`.

## 10. Invariantes

1. Data URL de imagem já materializada não deve acionar canvas, MAIN ou Service Worker.
2. Blob URL deve permanecer local ao contexto da aba enquanto possível.
3. Asset gerado `gg-dl/rd-gg-dl` só pode pedir sessão autenticada para host googleusercontent validado pelo background.
4. O módulo nunca deve adicionar credenciais a fetch arbitrário por conta própria.
5. MAIN-world e SW são fallbacks explícitos; sucesso anterior deve encerrar a cadeia imediatamente.
6. Retry deve repetir a cadeia completa e manter o último erro.
7. Fallback auxiliar só pode ocorrer depois do esgotamento das rotas diretas configuradas.
8. Ausência de callback auxiliar deve relançar o erro terminal, nunca fabricar sucesso.
9. `kind:'auxiliary'` nunca deve carregar uma Data URL fingindo persistência concluída.
10. Listener e timeout do bridge MAIN-world devem ser removidos/cancelados no primeiro settle.
11. Respostas MAIN-world de outra requisição devem ser ignoradas por `requestId`.
12. `runtime.lastError` deve continuar sendo lido dentro do callback de `sendMessage`.
13. Logs não devem incluir URL/Base64/conteúdo sensível bruto; apenas metadata sanitizada/correlação.
14. O módulo deve continuar sem ownership de job/batch/deletion; esses conceitos entram apenas como metadata/callback.
15. A API global e a API CommonJS devem apontar para a mesma fábrica.
16. Alterações na ordem de rotas exigem atualizar testes EXT e a documentação arquitetural.
17. Qualquer mudança no boundary `geminiSession:true` deve preservar a validação de host + sender no background.
18. Observabilidade/logging não deveria transformar sucesso de extração em falha; se isso for corrigido no futuro, criar teste de regressão.

## 11. Unidades documentais

| Unidade | Linhas | Responsabilidade |
|---|---:|---|
| U01 | 1–15 | Contrato de alto nível e ordem de extração |
| U02 | 16–31 | IIFE e injeção de dependências/runtime |
| U03 | 32–52 | Canvas → Data URL |
| U04 | 53–109 | Bridge MAIN-world por CustomEvent |
| U05 | 110–133 | Bridge runtime → Service Worker |
| U06 | 134–150 | Rotas SW autenticada e legada |
| U07 | 151–159 | Classificação sanitizada de falhas |
| U08 | 160–182 | Telemetria de estágio |
| U09 | 183–207 | Blob → FileReader → Data URL |
| U10 | 208–255 | Cadeia direta no contexto Gemini |
| U11 | 256–264 | Reconhecimento estrito de asset gerado |
| U12 | 265–285 | Dispatcher por tipo de URL/modo |
| U13 | 286–326 | Retry da cadeia completa |
| U14 | 327–393 | Fallback auxiliar terminal |
| U15 | 394–414 | API pública e publicação global/CommonJS |

## 12. Fonte integral auditada

```javascript
'use strict';
// gemini/result-extractor.js — cadeia modular de extração do resultado Gemini.
//
// Ordem de extração:
//   data URL -> retorno direto
//   blob URL -> fetch local -> FileReader
//   asset gerado do Google, qualquer modo -> canvas -> SW sessão -> MAIN fetch
//   outros HTTP em background_delete -> cadeia histórica sem reordenação
//   demais HTTP -> SW fetch legado
//   retry da cadeia completa
//   auxiliary fallback somente depois de todas as rotas diretas falharem.
//
// O módulo não conhece job/batch/deletion. O último fallback é injetado por
// callback para manter a entrega idempotente no orquestrador.

(function(scope) {
  function createResultExtractor({
    sendLog = function() {},
    getUrlLogMetadata = () => ({}),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    runtime = scope.chrome && scope.chrome.runtime ? scope.chrome.runtime : null,
    pageWindow = scope.window || null,
    pageDocument = scope.document || null,
    fetchImpl = (...args) => scope.fetch(...args),
    FileReaderImpl = scope.FileReader || null,
    CustomEventImpl = scope.CustomEvent || null,
    setTimeoutFn = scope.setTimeout ? scope.setTimeout.bind(scope) : setTimeout,
    clearTimeoutFn = scope.clearTimeout ? scope.clearTimeout.bind(scope) : clearTimeout,
    now = () => Date.now(),
    random = () => Math.random(),
  } = {}) {
    function imageElementToDataUrl(image) {
      if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
        return Promise.reject(new Error('Imagem renderizada ainda não está pronta'));
      }
      if (!pageDocument || typeof pageDocument.createElement !== 'function') {
        return Promise.reject(new Error('document indisponível'));
      }

      try {
        const canvas = pageDocument.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D indisponível');
        context.drawImage(image, 0, 0);
        return Promise.resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    function fetchImageThroughGeminiPage(url, timeoutMs = 20_000) {
      if (
        !pageWindow ||
        typeof pageWindow.addEventListener !== 'function' ||
        typeof pageWindow.removeEventListener !== 'function' ||
        typeof pageWindow.dispatchEvent !== 'function' ||
        typeof CustomEventImpl !== 'function'
      ) {
        return Promise.reject(new Error('Bridge MAIN-world indisponível'));
      }

      return new Promise((resolve, reject) => {
        const requestId = `mt-image-${now()}-${random().toString(36).slice(2)}`;
        let settled = false;
        let timer = null;

        const finish = (error, dataUrl) => {
          if (settled) return;
          settled = true;
          if (timer !== null) {
            try { clearTimeoutFn(timer); } catch (_e) {}
            timer = null;
          }
          try {
            pageWindow.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', onResult);
          } catch (_e) {}

          if (error) reject(error);
          else resolve(dataUrl);
        };

        const onResult = event => {
          const detail = event && event.detail ? event.detail : {};
          if (detail.requestId !== requestId) return;

          if (detail.dataUrl) {
            finish(null, detail.dataUrl);
          } else {
            finish(new Error(detail.error || 'Página Gemini não retornou a imagem'));
          }
        };

        try {
          pageWindow.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', onResult);
          timer = setTimeoutFn(
            () => finish(new Error('Tempo limite ao extrair imagem na página Gemini')),
            timeoutMs
          );
          pageWindow.dispatchEvent(new CustomEventImpl('MANGA_TRANSLATOR_FETCH_IMAGE', {
            detail: { requestId, url },
          }));
        } catch (error) {
          finish(error);
        }
      });
    }

    function sendRuntimeMessageForDataUrl(message, fallbackError) {
      if (!runtime || typeof runtime.sendMessage !== 'function') {
        return Promise.reject(new Error('Service Worker indisponível'));
      }

      return new Promise((resolve, reject) => {
        try {
          runtime.sendMessage(message, response => {
            if (runtime.lastError) {
              reject(new Error(runtime.lastError.message || fallbackError));
              return;
            }
            if (response && response.dataUrl) {
              resolve(response.dataUrl);
              return;
            }
            reject(new Error((response && response.error) || fallbackError));
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    function fetchGeminiImageThroughExtension(url) {
      return sendRuntimeMessageForDataUrl({
        action: 'FETCH_IMAGE_AS_BASE64',
        url,
        // Preserva o comportamento atual: somente esta rota privilegiada pede
        // sessão Gemini ao SW, e o router continua validando o host.
        geminiSession: true,
      }, 'Service Worker não retornou a imagem');
    }

    function fetchImageThroughBackground(url) {
      return sendRuntimeMessageForDataUrl({
        action: 'FETCH_IMAGE_AS_BASE64',
        url,
      }, 'Falha base64 background');
    }

    function getExtractionFailureKind(error) {
      const message = String(error && error.message || '').toLowerCase();
      if (/taint|cors|security|cross-origin/.test(message)) return 'canvas_or_cors';
      if (/failed to fetch|network|load failed/.test(message)) return 'network';
      if (/tempo limite|timeout|abort/.test(message)) return 'timeout';
      if (/http \d{3}/.test(message)) return 'http';
      return 'unknown';
    }

    function logExtractionStage(level, stage, url, attempt, error = null, logContext = {}) {
      const extra = {
        ...getUrlLogMetadata(url),
        ...(logContext || {}),
        stage,
        attempt,
      };
      if (error) {
        extra.errorName = error.name || 'Error';
        extra.failureKind = getExtractionFailureKind(error);
        extra.messageLength = String(error.message || '').length;
      }

      sendLog(
        level,
        'GEMINI_EXTRACT_STAGE',
        error
          ? `Etapa ${stage} falhou durante a extração.`
          : `Etapa ${stage} concluiu a extração.`,
        extra
      );
    }

    function blobToDataUrl(blob) {
      if (typeof FileReaderImpl !== 'function') {
        return Promise.reject(new Error('FileReader indisponível'));
      }

      return new Promise((resolve, reject) => {
        let reader;
        try {
          reader = new FileReaderImpl();
        } catch (error) {
          reject(error);
          return;
        }

        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Falha ao ler blob'));

        try {
          reader.readAsDataURL(blob);
        } catch (error) {
          reject(error);
        }
      });
    }

    async function extractImageInGeminiTab(image, url, attempt = 0, logContext = {}) {
      try {
        const dataUrl = await imageElementToDataUrl(image);
        logExtractionStage('info', 'canvas', url, attempt, null, logContext);
        return dataUrl;
      } catch (canvasError) {
        logExtractionStage('warn', 'canvas', url, attempt, canvasError, logContext);
      }

      if (isGeneratedGeminiAsset(url)) {
        // A sessão do SW foi a rota predominante nos testes manuais. O fetch
        // da página fica como último recurso; canvas e retries são preservados.
        try {
          const dataUrl = await fetchGeminiImageThroughExtension(url);
          logExtractionStage('info', 'service_worker_session', url, attempt, null, logContext);
          return dataUrl;
        } catch (serviceWorkerError) {
          logExtractionStage('warn', 'service_worker_session', url, attempt, serviceWorkerError, logContext);
        }

        try {
          const dataUrl = await fetchImageThroughGeminiPage(url);
          logExtractionStage('info', 'gemini_page_fetch_last_resort', url, attempt, null, logContext);
          return dataUrl;
        } catch (pageFetchError) {
          logExtractionStage('warn', 'gemini_page_fetch_last_resort', url, attempt, pageFetchError, logContext);
          throw pageFetchError;
        }
      }

      try {
        const dataUrl = await fetchImageThroughGeminiPage(url);
        logExtractionStage('info', 'gemini_page_fetch', url, attempt, null, logContext);
        return dataUrl;
      } catch (pageFetchError) {
        logExtractionStage('warn', 'gemini_page_fetch', url, attempt, pageFetchError, logContext);
      }

      try {
        const dataUrl = await fetchGeminiImageThroughExtension(url);
        logExtractionStage('info', 'service_worker_session', url, attempt, null, logContext);
        return dataUrl;
      } catch (serviceWorkerError) {
        logExtractionStage('warn', 'service_worker_session', url, attempt, serviceWorkerError, logContext);
        throw serviceWorkerError;
      }
    }

    function isGeneratedGeminiAsset(url) {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' &&
          (parsed.hostname === 'googleusercontent.com' || parsed.hostname.endsWith('.googleusercontent.com')) &&
          /\/(?:rd-)?gg-dl\//.test(parsed.pathname);
      } catch (_e) { return false; }
    }

    async function extractResultImage(resultImageElement, resultUrl, executionMode, attempt = 0, logContext = {}) {
      const url = String(resultUrl || '');

      if (url.startsWith('data:image/')) {
        return url;
      }

      if (url.startsWith('blob:')) {
        const response = await fetchImpl(url);
        const blob = await response.blob();
        return blobToDataUrl(blob);
      }

      if (executionMode === 'background_delete' || isGeneratedGeminiAsset(url)) {
        return extractImageInGeminiTab(resultImageElement, url, attempt, logContext);
      }

      // Preserva a rota histórica para URLs que não são assets gerados do Gemini.
      return fetchImageThroughBackground(url);
    }

    async function extractResultImageWithRetry(
      resultImageElement,
      resultUrl,
      executionMode,
      maxAttempts = 4,
      retryDelayMs = 1000,
      logContext = {}
    ) {
      let lastError = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempt > 0) {
          sendLog(
            'warn',
            'GEMINI_EXTRACT_RETRY_ALL',
            'Repetindo toda a cadeia de extração por possível instabilidade.',
            {
              ...getUrlLogMetadata(resultUrl),
              ...(logContext || {}),
              attempt,
            }
          );
          await sleep(retryDelayMs);
        }

        try {
          return await extractResultImage(
            resultImageElement,
            resultUrl,
            executionMode,
            attempt,
            logContext
          );
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('Todas as tentativas de extração falharam');
    }

    async function extractOrAuxiliaryFallback({
      resultImageElement,
      resultUrl,
      executionMode,
      maxAttempts = 4,
      retryDelayMs = 1000,
      onAuxiliaryFallback = null,
      logContext = {},
    } = {}) {
      try {
        const dataUrl = await extractResultImageWithRetry(
          resultImageElement,
          resultUrl,
          executionMode,
          maxAttempts,
          retryDelayMs,
          logContext
        );
        return {
          kind: 'extracted',
          dataUrl,
          error: null,
        };
      } catch (error) {
        sendLog(
          'warn',
          'GEMINI_EXTRACT_DIAGNOSTIC',
          'Todas as rotas sem aba auxiliar falharam; diagnóstico registrado.',
          {
            ...getUrlLogMetadata(resultUrl),
            ...(logContext || {}),
            attempts: maxAttempts,
            finalErrorName: error && error.name ? error.name : 'Error',
            finalFailureKind: getExtractionFailureKind(error),
            finalMessageLength: String(error && error.message || '').length,
          }
        );

        sendLog(
          'warn',
          'GEMINI_AUXILIARY_FALLBACK',
          'Último recurso: usando aba auxiliar. Este não é o comportamento padrão e deve ser investigado.',
          {
            ...getUrlLogMetadata(resultUrl),
            ...(logContext || {}),
            reason: 'all_direct_paths_failed',
          }
        );

        if (typeof onAuxiliaryFallback !== 'function') {
          throw error;
        }

        const fallbackResult = await onAuxiliaryFallback({
          url: resultUrl,
          error,
        });

        return {
          kind: 'auxiliary',
          dataUrl: null,
          error,
          fallbackResult,
        };
      }
    }

    return {
      imageElementToDataUrl,
      fetchImageThroughGeminiPage,
      fetchGeminiImageThroughExtension,
      fetchImageThroughBackground,
      getExtractionFailureKind,
      logExtractionStage,
      blobToDataUrl,
      extractImageInGeminiTab,
      extractResultImage,
      extractResultImageWithRetry,
      extractOrAuxiliaryFallback,
    };
  }

  const api = { createResultExtractor };

  scope.MangaTranslatorGeminiResultExtractor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

## 13. Cobertura documental linha a linha

A tabela abaixo cobre **todas as 414 posições**, inclusive linhas vazias e o newline final. “Linha” refere-se à posição no blob SHA `a3efd499a0b090f12701533a96f2602bf29bbcbb`.

| Linha | Unidade | Fonte | O que faz / como / por que / risco de alternativa ingênua |
|---:|---|---|---|
| 1 | U01 | <code>'use strict';</code> | Ativa modo estrito do JavaScript; evita criação silenciosa de globais e torna falhas de atribuição visíveis. |
| 2 | U01 | <code>// gemini/result-extractor.js — cadeia modular de extração do resultado Gemini.</code> | Comentário de U01 que documenta o contrato/intenção local: “gemini/result-extractor.js — cadeia modular de extração do resultado Gemini.”. Ele orienta manutenção, mas não é uma validação executável. |
| 3 | U01 | <code>//</code> | Comentário de U01 que documenta o contrato/intenção local: “”. Ele orienta manutenção, mas não é uma validação executável. |
| 4 | U01 | <code>// Ordem de extração:</code> | Comentário de U01 que documenta o contrato/intenção local: “Ordem de extração:”. Ele orienta manutenção, mas não é uma validação executável. |
| 5 | U01 | <code>//   data URL -&gt; retorno direto</code> | Comentário de U01 que documenta o contrato/intenção local: “data URL -&gt; retorno direto”. Ele orienta manutenção, mas não é uma validação executável. |
| 6 | U01 | <code>//   blob URL -&gt; fetch local -&gt; FileReader</code> | Comentário de U01 que documenta o contrato/intenção local: “blob URL -&gt; fetch local -&gt; FileReader”. Ele orienta manutenção, mas não é uma validação executável. |
| 7 | U01 | <code>//   asset gerado do Google, qualquer modo -&gt; canvas -&gt; SW sessão -&gt; MAIN fetch</code> | Comentário de U01 que documenta o contrato/intenção local: “asset gerado do Google, qualquer modo -&gt; canvas -&gt; SW sessão -&gt; MAIN fetch”. Ele orienta manutenção, mas não é uma validação executável. |
| 8 | U01 | <code>//   outros HTTP em background_delete -&gt; cadeia histórica sem reordenação</code> | Comentário de U01 que documenta o contrato/intenção local: “outros HTTP em background_delete -&gt; cadeia histórica sem reordenação”. Ele orienta manutenção, mas não é uma validação executável. |
| 9 | U01 | <code>//   demais HTTP -&gt; SW fetch legado</code> | Comentário de U01 que documenta o contrato/intenção local: “demais HTTP -&gt; SW fetch legado”. Ele orienta manutenção, mas não é uma validação executável. |
| 10 | U01 | <code>//   retry da cadeia completa</code> | Comentário de U01 que documenta o contrato/intenção local: “retry da cadeia completa”. Ele orienta manutenção, mas não é uma validação executável. |
| 11 | U01 | <code>//   auxiliary fallback somente depois de todas as rotas diretas falharem.</code> | Comentário de U01 que documenta o contrato/intenção local: “auxiliary fallback somente depois de todas as rotas diretas falharem.”. Ele orienta manutenção, mas não é uma validação executável. |
| 12 | U01 | <code>//</code> | Comentário de U01 que documenta o contrato/intenção local: “”. Ele orienta manutenção, mas não é uma validação executável. |
| 13 | U01 | <code>// O módulo não conhece job/batch/deletion. O último fallback é injetado por</code> | Comentário de U01 que documenta o contrato/intenção local: “O módulo não conhece job/batch/deletion. O último fallback é injetado por”. Ele orienta manutenção, mas não é uma validação executável. |
| 14 | U01 | <code>// callback para manter a entrega idempotente no orquestrador.</code> | Comentário de U01 que documenta o contrato/intenção local: “callback para manter a entrega idempotente no orquestrador.”. Ele orienta manutenção, mas não é uma validação executável. |
| 15 | U01 | ␠ [linha vazia] | Separador visual de U01 — Contrato de alto nível e ordem de extração; não altera estado nem fluxo. |
| 16 | U02 | <code>(function(scope) {</code> | Abre IIFE para publicar a API apenas no `scope` escolhido (`self` no browser/worker ou `globalThis` em teste). |
| 17 | U02 | <code>  function createResultExtractor({</code> | Declara a fábrica `createResultExtractor`, que cria uma instância com dependências injetáveis e sem estado global de job. |
| 18 | U02 | <code>    sendLog = function() {},</code> | Injeta `sendLog`; o default no-op permite usar o módulo sem telemetria em testes/helpers. |
| 19 | U02 | <code>    getUrlLogMetadata = () =&gt; ({}),</code> | Injeta sanitizador de metadados de URL; produção fornece `content_gemini.getUrlLogMetadata`. |
| 20 | U02 | <code>    sleep = ms =&gt; new Promise(resolve =&gt; setTimeout(resolve, ms)),</code> | Injeta `sleep`; por padrão usa Promise + setTimeout e torna retries controláveis em teste. |
| 21 | U02 | <code>    runtime = scope.chrome &amp;&amp; scope.chrome.runtime ? scope.chrome.runtime : null,</code> | Resolve `chrome.runtime` do scope ou `null`, permitindo detectar explicitamente ausência do Service Worker. |
| 22 | U02 | <code>    pageWindow = scope.window &#124;&#124; null,</code> | Resolve `window` da página ou `null`; é a superfície DOM usada pelo bridge MAIN-world. |
| 23 | U02 | <code>    pageDocument = scope.document &#124;&#124; null,</code> | Resolve `document` da página ou `null`; canvas é criado somente por esta dependência. |
| 24 | U02 | <code>    fetchImpl = (...args) =&gt; scope.fetch(...args),</code> | Injeta fetch local; a função default delega ao `scope.fetch` no momento da chamada. |
| 25 | U02 | <code>    FileReaderImpl = scope.FileReader &#124;&#124; null,</code> | Injeta FileReader para conversão de Blob; `null` provoca falha explícita e testável. |
| 26 | U02 | <code>    CustomEventImpl = scope.CustomEvent &#124;&#124; null,</code> | Injeta CustomEvent usado no handshake com `inject.js` no MAIN world. |
| 27 | U02 | <code>    setTimeoutFn = scope.setTimeout ? scope.setTimeout.bind(scope) : setTimeout,</code> | Injeta scheduler com binding do scope para timeout do bridge MAIN-world. |
| 28 | U02 | <code>    clearTimeoutFn = scope.clearTimeout ? scope.clearTimeout.bind(scope) : clearTimeout,</code> | Injeta cancelador pareado para cleanup do timeout. |
| 29 | U02 | <code>    now = () =&gt; Date.now(),</code> | Injeta relógio para compor IDs de requisição reproduzíveis em teste. |
| 30 | U02 | <code>    random = () =&gt; Math.random(),</code> | Injeta aleatoriedade usada junto do relógio no requestId; reduz colisões entre requisições concorrentes. |
| 31 | U02 | <code>  } = {}) {</code> | Fecha a assinatura da fábrica e habilita chamada sem argumentos. |
| 32 | U03 | <code>    function imageElementToDataUrl(image) {</code> | Inicia helper que tenta capturar a imagem já renderizada diretamente por canvas. |
| 33 | U03 | <code>      if (!image &#124;&#124; !image.complete &#124;&#124; !image.naturalWidth &#124;&#124; !image.naturalHeight) {</code> | Fail-fast: exige elemento, `complete` e dimensões naturais não zero antes de desenhar. |
| 34 | U03 | <code>        return Promise.reject(new Error('Imagem renderizada ainda não está pronta'));</code> | Rejeita em vez de inventar sucesso quando a imagem ainda não está pronta. |
| 35 | U03 | <code>      }</code> | Fecha a estrutura sintática atual de U03 sem introduzir novo efeito além do contrato da unidade. |
| 36 | U03 | <code>      if (!pageDocument &#124;&#124; typeof pageDocument.createElement !== 'function') {</code> | Valida a capacidade mínima do document antes de criar canvas. |
| 37 | U03 | <code>        return Promise.reject(new Error('document indisponível'));</code> | Produz erro específico quando o ambiente não oferece DOM de criação de elementos. |
| 38 | U03 | <code>      }</code> | Fecha a estrutura sintática atual de U03 sem introduzir novo efeito além do contrato da unidade. |
| 39 | U03 | ␠ [linha vazia] | Separador visual de U03 — Canvas → Data URL; não altera estado nem fluxo. |
| 40 | U03 | <code>      try {</code> | Abre boundary de exceção em U03; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 41 | U03 | <code>        const canvas = pageDocument.createElement('canvas');</code> | Cria canvas efêmero; não o anexa ao DOM nem mantém referência após a conversão. |
| 42 | U03 | <code>        canvas.width = image.naturalWidth;</code> | Copia a largura natural para evitar downscale pelo layout/CSS. |
| 43 | U03 | <code>        canvas.height = image.naturalHeight;</code> | Copia a altura natural pelo mesmo motivo, preservando resolução do asset renderizado. |
| 44 | U03 | <code>        const context = canvas.getContext('2d');</code> | Solicita contexto 2D, requisito para copiar pixels da imagem. |
| 45 | U03 | <code>        if (!context) throw new Error('Canvas 2D indisponível');</code> | Converte ausência de contexto 2D em erro explícito, permitindo escalar para outra rota. |
| 46 | U03 | <code>        context.drawImage(image, 0, 0);</code> | Desenha a imagem inteira no canvas; aqui podem surgir SecurityError/taint por CORS. |
| 47 | U03 | <code>        return Promise.resolve(canvas.toDataURL('image/png'));</code> | Serializa os pixels em PNG Data URL e normaliza o retorno como Promise resolvida. |
| 48 | U03 | <code>      } catch (error) {</code> | Captura a exceção da operação anterior em U03, permitindo extrai pixels já renderizados sem IPC quando o canvas é permitido sem encerrar o módulo abruptamente. |
| 49 | U03 | <code>        return Promise.reject(error);</code> | Propaga exatamente o erro de canvas/toDataURL para classificação e fallback posteriores. |
| 50 | U03 | <code>      }</code> | Fecha a estrutura sintática atual de U03 sem introduzir novo efeito além do contrato da unidade. |
| 51 | U03 | <code>    }</code> | Fecha a estrutura sintática atual de U03 sem introduzir novo efeito além do contrato da unidade. |
| 52 | U03 | ␠ [linha vazia] | Separador visual de U03 — Canvas → Data URL; não altera estado nem fluxo. |
| 53 | U04 | <code>    function fetchImageThroughGeminiPage(url, timeoutMs = 20_000) {</code> | Declara bridge assíncrono para pedir fetch ao script MAIN-world; timeout padrão de 20 s. |
| 54 | U04 | <code>      if (</code> | Guarda de U04; restringe a execução do bloco seguinte à condição expressa nesta linha, preservando pede ao script MAIN-world que faça o fetch no contexto da página, correlacionando request/response. |
| 55 | U04 | <code>        !pageWindow &#124;&#124;</code> | Exige objeto `pageWindow`; sem janela não existe canal de eventos DOM. |
| 56 | U04 | <code>        typeof pageWindow.addEventListener !== 'function' &#124;&#124;</code> | Exige capacidade de instalar listener para receber a resposta correlacionada. |
| 57 | U04 | <code>        typeof pageWindow.removeEventListener !== 'function' &#124;&#124;</code> | Exige remoção de listener, condição necessária para cleanup após settle. |
| 58 | U04 | <code>        typeof pageWindow.dispatchEvent !== 'function' &#124;&#124;</code> | Exige dispatch de evento para emitir a solicitação. |
| 59 | U04 | <code>        typeof CustomEventImpl !== 'function'</code> | Exige construtor CustomEvent para transportar `requestId` e URL. |
| 60 | U04 | <code>      ) {</code> | Fecha a condição composta que valida todas as primitivas do bridge; somente se qualquer requisito falhar o ramo retorna `Bridge MAIN-world indisponível`. |
| 61 | U04 | <code>        return Promise.reject(new Error('Bridge MAIN-world indisponível'));</code> | Falha fechado quando qualquer primitiva do bridge está ausente. |
| 62 | U04 | <code>      }</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 63 | U04 | ␠ [linha vazia] | Separador visual de U04 — Bridge MAIN-world por CustomEvent; não altera estado nem fluxo. |
| 64 | U04 | <code>      return new Promise((resolve, reject) =&gt; {</code> | Cria Promise única que representa a resposta/erro/timeout do bridge. |
| 65 | U04 | <code>        const requestId = `mt-image-${now()}-${random().toString(36).slice(2)}`;</code> | Gera requestId com timestamp + sufixo aleatório; é o único correlacionador entre request e response. |
| 66 | U04 | <code>        let settled = false;</code> | `settled` impede resolução/rejeição duplicada sob corrida entre resposta e timeout. |
| 67 | U04 | <code>        let timer = null;</code> | Guarda handle do timeout para cancelá-lo no primeiro resultado terminal. |
| 68 | U04 | ␠ [linha vazia] | Separador visual de U04 — Bridge MAIN-world por CustomEvent; não altera estado nem fluxo. |
| 69 | U04 | <code>        const finish = (error, dataUrl) =&gt; {</code> | Centraliza settle + cleanup; todos os caminhos terminais convergem aqui. |
| 70 | U04 | <code>          if (settled) return;</code> | Guard idempotente: resultado tardio ou timeout concorrente não altera Promise já finalizada. |
| 71 | U04 | <code>          settled = true;</code> | Marca terminal antes do cleanup, evitando reentrância durante remoção/cancelamento. |
| 72 | U04 | <code>          if (timer !== null) {</code> | Só tenta cancelar se o timer realmente foi instalado. |
| 73 | U04 | <code>            try { clearTimeoutFn(timer); } catch (_e) {}</code> | Cancela timeout e ignora falha de cleanup para não substituir o resultado principal. |
| 74 | U04 | <code>            timer = null;</code> | Zera referência do timer, evitando tentativa dupla de cancelamento. |
| 75 | U04 | <code>          }</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 76 | U04 | <code>          try {</code> | Abre boundary de exceção em U04; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 77 | U04 | <code>            pageWindow.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', onResult);</code> | Remove o listener específico do evento de resultado para não vazar closures/requisições. |
| 78 | U04 | <code>          } catch (_e) {}</code> | Falha de remoção é best-effort e não altera o resultado da extração. |
| 79 | U04 | ␠ [linha vazia] | Separador visual de U04 — Bridge MAIN-world por CustomEvent; não altera estado nem fluxo. |
| 80 | U04 | <code>          if (error) reject(error);</code> | Quando recebeu erro, rejeita a Promise original com esse erro. |
| 81 | U04 | <code>          else resolve(dataUrl);</code> | Quando recebeu Data URL, resolve a Promise do bridge. |
| 82 | U04 | <code>        };</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 83 | U04 | ␠ [linha vazia] | Separador visual de U04 — Bridge MAIN-world por CustomEvent; não altera estado nem fluxo. |
| 84 | U04 | <code>        const onResult = event =&gt; {</code> | Handler do evento de retorno; roda para todos os eventos homônimos do window. |
| 85 | U04 | <code>          const detail = event &amp;&amp; event.detail ? event.detail : {};</code> | Normaliza `event.detail` ausente para objeto vazio antes da correlação. |
| 86 | U04 | <code>          if (detail.requestId !== requestId) return;</code> | Ignora respostas destinadas a outra requisição concorrente. |
| 87 | U04 | ␠ [linha vazia] | Separador visual de U04 — Bridge MAIN-world por CustomEvent; não altera estado nem fluxo. |
| 88 | U04 | <code>          if (detail.dataUrl) {</code> | Aceita qualquer `detail.dataUrl` truthy; não valida prefixo/MIME neste boundary. |
| 89 | U04 | <code>            finish(null, detail.dataUrl);</code> | Finaliza com sucesso mantendo o `dataUrl` fornecido pelo MAIN world. |
| 90 | U04 | <code>          } else {</code> | Seleciona o ramo de erro quando a resposta correlacionada não contém `dataUrl` truthy. |
| 91 | U04 | <code>            finish(new Error(detail.error &#124;&#124; 'Página Gemini não retornou a imagem'));</code> | Sem dataUrl, transforma mensagem remota em Error, com fallback textual previsível. |
| 92 | U04 | <code>          }</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 93 | U04 | <code>        };</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 94 | U04 | ␠ [linha vazia] | Separador visual de U04 — Bridge MAIN-world por CustomEvent; não altera estado nem fluxo. |
| 95 | U04 | <code>        try {</code> | Abre boundary de exceção em U04; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 96 | U04 | <code>          pageWindow.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', onResult);</code> | Instala listener antes de emitir a solicitação, evitando perder resposta síncrona do MAIN world. |
| 97 | U04 | <code>          timer = setTimeoutFn(</code> | Agenda timeout após o listener; o handle será cancelado por `finish`. |
| 98 | U04 | <code>            () =&gt; finish(new Error('Tempo limite ao extrair imagem na página Gemini')),</code> | Timeout sintetiza erro específico de extração na página Gemini. |
| 99 | U04 | <code>            timeoutMs</code> | Usa o `timeoutMs` da chamada, 20 s por padrão. |
| 100 | U04 | <code>          );</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 101 | U04 | <code>          pageWindow.dispatchEvent(new CustomEventImpl('MANGA_TRANSLATOR_FETCH_IMAGE', {</code> | Emite evento `MANGA_TRANSLATOR_FETCH_IMAGE` que o script MAIN-world deve consumir. |
| 102 | U04 | <code>            detail: { requestId, url },</code> | Payload contém requestId e URL completa; isso cria uma fronteira de confiança com o contexto da página. |
| 103 | U04 | <code>          }));</code> | Fecha a construção do `CustomEvent` e a chamada de `dispatchEvent`, completando a emissão atômica da solicitação MAIN-world. |
| 104 | U04 | <code>        } catch (error) {</code> | Captura a exceção da operação anterior em U04, permitindo pede ao script MAIN-world que faça o fetch no contexto da página, correlacionando request/response sem encerrar o módulo abruptamente. |
| 105 | U04 | <code>          finish(error);</code> | Qualquer exceção síncrona de listener/timer/dispatch converge em `finish`, garantindo cleanup. |
| 106 | U04 | <code>        }</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 107 | U04 | <code>      });</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 108 | U04 | <code>    }</code> | Fecha a estrutura sintática atual de U04 sem introduzir novo efeito além do contrato da unidade. |
| 109 | U04 | ␠ [linha vazia] | Separador visual de U04 — Bridge MAIN-world por CustomEvent; não altera estado nem fluxo. |
| 110 | U05 | <code>    function sendRuntimeMessageForDataUrl(message, fallbackError) {</code> | Declara adaptador Promise para mensagens que precisam retornar `dataUrl` pelo Service Worker. |
| 111 | U05 | <code>      if (!runtime &#124;&#124; typeof runtime.sendMessage !== 'function') {</code> | Verifica explicitamente se o runtime e `sendMessage` existem. |
| 112 | U05 | <code>        return Promise.reject(new Error('Service Worker indisponível'));</code> | Rejeita com erro operacional quando o Service Worker/runtime está indisponível. |
| 113 | U05 | <code>      }</code> | Fecha a estrutura sintática atual de U05 sem introduzir novo efeito além do contrato da unidade. |
| 114 | U05 | ␠ [linha vazia] | Separador visual de U05 — Bridge runtime → Service Worker; não altera estado nem fluxo. |
| 115 | U05 | <code>      return new Promise((resolve, reject) =&gt; {</code> | Retorna deste ponto de U05 o resultado produzido pela rota atual, encerrando esse ramo sem executar alternativas posteriores. |
| 116 | U05 | <code>        try {</code> | Abre boundary de exceção em U05; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 117 | U05 | <code>          runtime.sendMessage(message, response =&gt; {</code> | Envia a mensagem e processa a resposta no callback Chrome. |
| 118 | U05 | <code>            if (runtime.lastError) {</code> | Lê `runtime.lastError` dentro do callback, janela correta exigida pela API Chrome. |
| 119 | U05 | <code>              reject(new Error(runtime.lastError.message &#124;&#124; fallbackError));</code> | Preserva mensagem do runtime quando disponível; caso contrário usa erro específico da rota. |
| 120 | U05 | <code>              return;</code> | Retorna após rejeitar para impedir avaliação da resposta como sucesso. |
| 121 | U05 | <code>            }</code> | Fecha a estrutura sintática atual de U05 sem introduzir novo efeito além do contrato da unidade. |
| 122 | U05 | <code>            if (response &amp;&amp; response.dataUrl) {</code> | Só considera sucesso quando a resposta existe e traz `dataUrl` truthy. |
| 123 | U05 | <code>              resolve(response.dataUrl);</code> | Resolve com o payload convertido retornado pelo background. |
| 124 | U05 | <code>              return;</code> | Retorna imediatamente após resolver com Data URL para impedir que a mesma resposta seja rejeitada pelo fallback logo abaixo. |
| 125 | U05 | <code>            }</code> | Fecha a estrutura sintática atual de U05 sem introduzir novo efeito além do contrato da unidade. |
| 126 | U05 | <code>            reject(new Error((response &amp;&amp; response.error) &#124;&#124; fallbackError));</code> | Sem dataUrl, rejeita com `response.error` ou fallbackError; não silencía resposta inválida. |
| 127 | U05 | <code>          });</code> | Fecha a estrutura sintática atual de U05 sem introduzir novo efeito além do contrato da unidade. |
| 128 | U05 | <code>        } catch (error) {</code> | Captura exceção síncrona de `sendMessage`/mock e a transforma em rejeição. |
| 129 | U05 | <code>          reject(error);</code> | Rejeita a Promise com a exceção síncrona capturada em torno de `runtime.sendMessage`. |
| 130 | U05 | <code>        }</code> | Fecha a estrutura sintática atual de U05 sem introduzir novo efeito além do contrato da unidade. |
| 131 | U05 | <code>      });</code> | Fecha a estrutura sintática atual de U05 sem introduzir novo efeito além do contrato da unidade. |
| 132 | U05 | <code>    }</code> | Fecha a estrutura sintática atual de U05 sem introduzir novo efeito além do contrato da unidade. |
| 133 | U05 | ␠ [linha vazia] | Separador visual de U05 — Bridge runtime → Service Worker; não altera estado nem fluxo. |
| 134 | U06 | <code>    function fetchGeminiImageThroughExtension(url) {</code> | Define rota privilegiada destinada a usar sessão/cookies Gemini no Service Worker. |
| 135 | U06 | <code>      return sendRuntimeMessageForDataUrl({</code> | Retorna deste ponto de U06 o resultado produzido pela rota atual, encerrando esse ramo sem executar alternativas posteriores. |
| 136 | U06 | <code>        action: 'FETCH_IMAGE_AS_BASE64',</code> | Seleciona a action roteada pelo background para converter imagem em Base64. |
| 137 | U06 | <code>        url,</code> | Repassa a URL ao boundary validado pelo action `fetch-image-base64`. |
| 138 | U06 | <code>        // Preserva o comportamento atual: somente esta rota privilegiada pede</code> | Comentário documenta que somente esta rota solicita sessão autenticada. |
| 139 | U06 | <code>        // sessão Gemini ao SW, e o router continua validando o host.</code> | Comentário registra a dependência de validação de host no router/action, não neste módulo. |
| 140 | U06 | <code>        geminiSession: true,</code> | `geminiSession:true` pede `credentials:'include'`; o background real só aceita hosts googleusercontent e sender Gemini. |
| 141 | U06 | <code>      }, 'Service Worker não retornou a imagem');</code> | Define mensagem de erro caso a action não devolva Data URL. |
| 142 | U06 | <code>    }</code> | Fecha a estrutura sintática atual de U06 sem introduzir novo efeito além do contrato da unidade. |
| 143 | U06 | ␠ [linha vazia] | Separador visual de U06 — Rotas SW autenticada e legada; não altera estado nem fluxo. |
| 144 | U06 | <code>    function fetchImageThroughBackground(url) {</code> | Define rota histórica pelo mesmo action, mas sem solicitar credenciais Gemini. |
| 145 | U06 | <code>      return sendRuntimeMessageForDataUrl({</code> | Retorna deste ponto de U06 o resultado produzido pela rota atual, encerrando esse ramo sem executar alternativas posteriores. |
| 146 | U06 | <code>        action: 'FETCH_IMAGE_AS_BASE64',</code> | Usa a mesma action de conversão Base64. |
| 147 | U06 | <code>        url,</code> | Repassa URL sem flag de sessão; o action fará fetch com `credentials:'omit'`. |
| 148 | U06 | <code>      }, 'Falha base64 background');</code> | Define erro específico da rota legada sem sessão. |
| 149 | U06 | <code>    }</code> | Fecha a estrutura sintática atual de U06 sem introduzir novo efeito além do contrato da unidade. |
| 150 | U06 | ␠ [linha vazia] | Separador visual de U06 — Rotas SW autenticada e legada; não altera estado nem fluxo. |
| 151 | U07 | <code>    function getExtractionFailureKind(error) {</code> | Declara classificador de falhas usado apenas em telemetria/diagnóstico. |
| 152 | U07 | <code>      const message = String(error &amp;&amp; error.message &#124;&#124; '').toLowerCase();</code> | Normaliza a mensagem para minúsculas sem depender da classe concreta do erro. |
| 153 | U07 | <code>      if (/taint&#124;cors&#124;security&#124;cross-origin/.test(message)) return 'canvas_or_cors';</code> | Agrupa taint/CORS/security/cross-origin como `canvas_or_cors`. |
| 154 | U07 | <code>      if (/failed to fetch&#124;network&#124;load failed/.test(message)) return 'network';</code> | Agrupa falhas textuais de rede/fetch como `network`. |
| 155 | U07 | <code>      if (/tempo limite&#124;timeout&#124;abort/.test(message)) return 'timeout';</code> | Agrupa timeout/abort/"tempo limite" como `timeout`. |
| 156 | U07 | <code>      if (/http \d{3}/.test(message)) return 'http';</code> | Reconhece mensagens que contenham status HTTP de três dígitos como `http`. |
| 157 | U07 | <code>      return 'unknown';</code> | Qualquer erro fora dos padrões vira `unknown`, evitando classificação especulativa. |
| 158 | U07 | <code>    }</code> | Fecha a estrutura sintática atual de U07 sem introduzir novo efeito além do contrato da unidade. |
| 159 | U07 | ␠ [linha vazia] | Separador visual de U07 — Classificação sanitizada de falhas; não altera estado nem fluxo. |
| 160 | U08 | <code>    function logExtractionStage(level, stage, url, attempt, error = null, logContext = {}) {</code> | Declara emissor de log por estágio com erro opcional e contexto de job. |
| 161 | U08 | <code>      const extra = {</code> | Monta objeto `extra` sem inserir URL bruta diretamente. |
| 162 | U08 | <code>        ...getUrlLogMetadata(url),</code> | Mescla apenas metadados derivados da URL fornecidos pelo caller. |
| 163 | U08 | <code>        ...(logContext &#124;&#124; {}),</code> | Mescla jobIdPrefix/batchIdPrefix/index ou outro contexto de correlação. |
| 164 | U08 | <code>        stage,</code> | Registra o nome canônico do estágio (`canvas`, `service_worker_session`, etc.). |
| 165 | U08 | <code>        attempt,</code> | Registra número da tentativa da cadeia completa. |
| 166 | U08 | <code>      };</code> | Fecha a estrutura sintática atual de U08 sem introduzir novo efeito além do contrato da unidade. |
| 167 | U08 | <code>      if (error) {</code> | Só adiciona detalhes de falha quando houve erro. |
| 168 | U08 | <code>        extra.errorName = error.name &#124;&#124; 'Error';</code> | Registra nome/classe do erro, com fallback `Error`. |
| 169 | U08 | <code>        extra.failureKind = getExtractionFailureKind(error);</code> | Classifica a falha por heurística de mensagem. |
| 170 | U08 | <code>        extra.messageLength = String(error.message &#124;&#124; '').length;</code> | Registra apenas comprimento da mensagem, reduzindo risco de vazar URL/token/conteúdo textual. |
| 171 | U08 | <code>      }</code> | Fecha a estrutura sintática atual de U08 sem introduzir novo efeito além do contrato da unidade. |
| 172 | U08 | ␠ [linha vazia] | Separador visual de U08 — Telemetria de estágio; não altera estado nem fluxo. |
| 173 | U08 | <code>      sendLog(</code> | Entrega o evento ao logger injetado; exceções do logger não são capturadas por este helper. |
| 174 | U08 | <code>        level,</code> | Encaminha a severidade recebida por `logExtractionStage` ao logger, preservando distinção info/warn entre sucesso e falha. |
| 175 | U08 | <code>        'GEMINI_EXTRACT_STAGE',</code> | Usa action_name estável `GEMINI_EXTRACT_STAGE` para consulta e testes. |
| 176 | U08 | <code>        error</code> | Seleciona mensagem conforme sucesso ou falha. |
| 177 | U08 | <code>          ? `Etapa ${stage} falhou durante a extração.`</code> | Mensagem de telemetria específica de falha; inclui o nome do estágio sem anexar a mensagem bruta do erro. |
| 178 | U08 | <code>          : `Etapa ${stage} concluiu a extração.`,</code> | Mensagem de telemetria específica de sucesso; usa o mesmo action name e payload estruturado do ramo de falha. |
| 179 | U08 | <code>        extra</code> | Anexa o objeto extra correlacionado ao log. |
| 180 | U08 | <code>      );</code> | Fecha a estrutura sintática atual de U08 sem introduzir novo efeito além do contrato da unidade. |
| 181 | U08 | <code>    }</code> | Fecha a estrutura sintática atual de U08 sem introduzir novo efeito além do contrato da unidade. |
| 182 | U08 | ␠ [linha vazia] | Separador visual de U08 — Telemetria de estágio; não altera estado nem fluxo. |
| 183 | U09 | <code>    function blobToDataUrl(blob) {</code> | Declara conversor de Blob em Data URL baseado em FileReader. |
| 184 | U09 | <code>      if (typeof FileReaderImpl !== 'function') {</code> | Verifica construtor antes de criar reader. |
| 185 | U09 | <code>        return Promise.reject(new Error('FileReader indisponível'));</code> | Falha explicitamente em runtimes sem FileReader. |
| 186 | U09 | <code>      }</code> | Fecha a estrutura sintática atual de U09 sem introduzir novo efeito além do contrato da unidade. |
| 187 | U09 | ␠ [linha vazia] | Separador visual de U09 — Blob → FileReader → Data URL; não altera estado nem fluxo. |
| 188 | U09 | <code>      return new Promise((resolve, reject) =&gt; {</code> | Encapsula ciclo de eventos FileReader em Promise. |
| 189 | U09 | <code>        let reader;</code> | Declara referência somente depois da construção bem-sucedida. |
| 190 | U09 | <code>        try {</code> | Abre boundary de exceção em U09; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 191 | U09 | <code>          reader = new FileReaderImpl();</code> | Instancia a implementação injetada/real de FileReader. |
| 192 | U09 | <code>        } catch (error) {</code> | Captura a exceção da operação anterior em U09, permitindo converte Blob local em Data URL sem passar pelo Service Worker sem encerrar o módulo abruptamente. |
| 193 | U09 | <code>          reject(error);</code> | Rejeita se o construtor lançar. |
| 194 | U09 | <code>          return;</code> | Retorna para não instalar handlers num reader inexistente. |
| 195 | U09 | <code>        }</code> | Fecha a estrutura sintática atual de U09 sem introduzir novo efeito além do contrato da unidade. |
| 196 | U09 | ␠ [linha vazia] | Separador visual de U09 — Blob → FileReader → Data URL; não altera estado nem fluxo. |
| 197 | U09 | <code>        reader.onloadend = () =&gt; resolve(reader.result);</code> | No `loadend`, resolve com `reader.result`; não revalida prefixo/MIME. |
| 198 | U09 | <code>        reader.onerror = () =&gt; reject(reader.error &#124;&#124; new Error('Falha ao ler blob'));</code> | No `error`, rejeita com erro do reader ou fallback local. |
| 199 | U09 | ␠ [linha vazia] | Separador visual de U09 — Blob → FileReader → Data URL; não altera estado nem fluxo. |
| 200 | U09 | <code>        try {</code> | Abre boundary de exceção em U09; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 201 | U09 | <code>          reader.readAsDataURL(blob);</code> | Inicia leitura do Blob como Data URL. |
| 202 | U09 | <code>        } catch (error) {</code> | Captura a exceção da operação anterior em U09, permitindo converte Blob local em Data URL sem passar pelo Service Worker sem encerrar o módulo abruptamente. |
| 203 | U09 | <code>          reject(error);</code> | Converte exceção síncrona de `readAsDataURL` em rejeição. |
| 204 | U09 | <code>        }</code> | Fecha a estrutura sintática atual de U09 sem introduzir novo efeito além do contrato da unidade. |
| 205 | U09 | <code>      });</code> | Fecha a estrutura sintática atual de U09 sem introduzir novo efeito além do contrato da unidade. |
| 206 | U09 | <code>    }</code> | Fecha a estrutura sintática atual de U09 sem introduzir novo efeito além do contrato da unidade. |
| 207 | U09 | ␠ [linha vazia] | Separador visual de U09 — Blob → FileReader → Data URL; não altera estado nem fluxo. |
| 208 | U10 | <code>    async function extractImageInGeminiTab(image, url, attempt = 0, logContext = {}) {</code> | Declara cadeia direta usada quando o modo/URL exige operar no contexto Gemini. |
| 209 | U10 | <code>      try {</code> | Abre boundary de exceção em U10; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 210 | U10 | <code>        const dataUrl = await imageElementToDataUrl(image);</code> | Primeira tentativa sempre é canvas sobre o elemento renderizado. |
| 211 | U10 | <code>        logExtractionStage('info', 'canvas', url, attempt, null, logContext);</code> | Loga sucesso do canvas antes de retornar. |
| 212 | U10 | <code>        return dataUrl;</code> | Retorna imediatamente no primeiro sucesso, evitando IPC desnecessário. |
| 213 | U10 | <code>      } catch (canvasError) {</code> | Captura falha de canvas para permitir escalonamento. |
| 214 | U10 | <code>        logExtractionStage('warn', 'canvas', url, attempt, canvasError, logContext);</code> | Registra falha classificada do canvas, preservando tentativa e contexto. |
| 215 | U10 | <code>      }</code> | Fecha a estrutura sintática atual de U10 sem introduzir novo efeito além do contrato da unidade. |
| 216 | U10 | ␠ [linha vazia] | Separador visual de U10 — Cadeia direta no contexto Gemini; não altera estado nem fluxo. |
| 217 | U10 | <code>      if (isGeneratedGeminiAsset(url)) {</code> | Se a URL é asset gerado reconhecido, entra na ordem especial autenticada. |
| 218 | U10 | <code>        // A sessão do SW foi a rota predominante nos testes manuais. O fetch</code> | Comentário explica evidência operacional que motivou priorizar a sessão SW. |
| 219 | U10 | <code>        // da página fica como último recurso; canvas e retries são preservados.</code> | Comentário fixa MAIN fetch como último recurso para assets gerados. |
| 220 | U10 | <code>        try {</code> | Abre boundary de exceção em U10; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 221 | U10 | <code>          const dataUrl = await fetchGeminiImageThroughExtension(url);</code> | Tenta fetch via Service Worker com sessão Gemini. |
| 222 | U10 | <code>          logExtractionStage('info', 'service_worker_session', url, attempt, null, logContext);</code> | Loga sucesso com estágio distinto `service_worker_session`. |
| 223 | U10 | <code>          return dataUrl;</code> | Retorna Data URL autenticada ao caller. |
| 224 | U10 | <code>        } catch (serviceWorkerError) {</code> | Captura falha da sessão para escalar sem abortar a cadeia. |
| 225 | U10 | <code>          logExtractionStage('warn', 'service_worker_session', url, attempt, serviceWorkerError, logContext);</code> | Loga falha da rota autenticada. |
| 226 | U10 | <code>        }</code> | Fecha a estrutura sintática atual de U10 sem introduzir novo efeito além do contrato da unidade. |
| 227 | U10 | ␠ [linha vazia] | Separador visual de U10 — Cadeia direta no contexto Gemini; não altera estado nem fluxo. |
| 228 | U10 | <code>        try {</code> | Abre boundary de exceção em U10; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 229 | U10 | <code>          const dataUrl = await fetchImageThroughGeminiPage(url);</code> | Após falha da sessão, tenta fetch pelo MAIN world da página. |
| 230 | U10 | <code>          logExtractionStage('info', 'gemini_page_fetch_last_resort', url, attempt, null, logContext);</code> | Distingue esse estágio como `gemini_page_fetch_last_resort`. |
| 231 | U10 | <code>          return dataUrl;</code> | Retorna o resultado do último recurso quando bem-sucedido. |
| 232 | U10 | <code>        } catch (pageFetchError) {</code> | Captura a falha final da subcadeia de asset gerado. |
| 233 | U10 | <code>          logExtractionStage('warn', 'gemini_page_fetch_last_resort', url, attempt, pageFetchError, logContext);</code> | Registra a falha terminal desse estágio. |
| 234 | U10 | <code>          throw pageFetchError;</code> | Relança o erro do MAIN fetch para o retry externo preservar a causa mais recente. |
| 235 | U10 | <code>        }</code> | Fecha a estrutura sintática atual de U10 sem introduzir novo efeito além do contrato da unidade. |
| 236 | U10 | <code>      }</code> | Fecha a estrutura sintática atual de U10 sem introduzir novo efeito além do contrato da unidade. |
| 237 | U10 | ␠ [linha vazia] | Separador visual de U10 — Cadeia direta no contexto Gemini; não altera estado nem fluxo. |
| 238 | U10 | <code>      try {</code> | Abre boundary de exceção em U10; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 239 | U10 | <code>        const dataUrl = await fetchImageThroughGeminiPage(url);</code> | Para URLs não reconhecidas como asset gerado, tenta MAIN-world antes do SW. |
| 240 | U10 | <code>        logExtractionStage('info', 'gemini_page_fetch', url, attempt, null, logContext);</code> | Loga sucesso desse fetch de página como estágio normal. |
| 241 | U10 | <code>        return dataUrl;</code> | Retorna imediatamente quando MAIN-world consegue extrair. |
| 242 | U10 | <code>      } catch (pageFetchError) {</code> | Captura falha da página e continua a cadeia. |
| 243 | U10 | <code>        logExtractionStage('warn', 'gemini_page_fetch', url, attempt, pageFetchError, logContext);</code> | Registra a falha de MAIN-world antes de tentar SW. |
| 244 | U10 | <code>      }</code> | Fecha a estrutura sintática atual de U10 sem introduzir novo efeito além do contrato da unidade. |
| 245 | U10 | ␠ [linha vazia] | Separador visual de U10 — Cadeia direta no contexto Gemini; não altera estado nem fluxo. |
| 246 | U10 | <code>      try {</code> | Abre boundary de exceção em U10; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 247 | U10 | <code>        const dataUrl = await fetchGeminiImageThroughExtension(url);</code> | Última rota da cadeia não-gerada chama o helper de sessão Gemini. |
| 248 | U10 | <code>        logExtractionStage('info', 'service_worker_session', url, attempt, null, logContext);</code> | Registra sucesso como `service_worker_session` se o background aceitar. |
| 249 | U10 | <code>        return dataUrl;</code> | Retorna Data URL do Service Worker. |
| 250 | U10 | <code>      } catch (serviceWorkerError) {</code> | Captura falha dessa última rota. |
| 251 | U10 | <code>        logExtractionStage('warn', 'service_worker_session', url, attempt, serviceWorkerError, logContext);</code> | Registra falha terminal do SW. |
| 252 | U10 | <code>        throw serviceWorkerError;</code> | Relança para o retry externo; não há fallback legada sem sessão dentro desta função. |
| 253 | U10 | <code>      }</code> | Fecha a estrutura sintática atual de U10 sem introduzir novo efeito além do contrato da unidade. |
| 254 | U10 | <code>    }</code> | Fecha a estrutura sintática atual de U10 sem introduzir novo efeito além do contrato da unidade. |
| 255 | U10 | ␠ [linha vazia] | Separador visual de U10 — Cadeia direta no contexto Gemini; não altera estado nem fluxo. |
| 256 | U11 | <code>    function isGeneratedGeminiAsset(url) {</code> | Declara predicate de asset gerado para escolher a ordem autenticada. |
| 257 | U11 | <code>      try {</code> | Abre boundary de exceção em U11; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 258 | U11 | <code>        const parsed = new URL(url);</code> | Usa parser URL nativo, evitando matching de host por substring. |
| 259 | U11 | <code>        return parsed.protocol === 'https:' &amp;&amp;</code> | Exige HTTPS. |
| 260 | U11 | <code>          (parsed.hostname === 'googleusercontent.com' &#124;&#124; parsed.hostname.endsWith('.googleusercontent.com')) &amp;&amp;</code> | Exige host exato `googleusercontent.com` ou subdomínio por boundary de ponto. |
| 261 | U11 | <code>          /\/(?:rd-)?gg-dl\//.test(parsed.pathname);</code> | Exige path `/gg-dl/` ou `/rd-gg-dl/`, reduzindo escopo da rota especial. |
| 262 | U11 | <code>      } catch (_e) { return false; }</code> | URL inválida nunca é tratada como asset gerado; retorna false. |
| 263 | U11 | <code>    }</code> | Fecha a estrutura sintática atual de U11 sem introduzir novo efeito além do contrato da unidade. |
| 264 | U11 | ␠ [linha vazia] | Separador visual de U11 — Reconhecimento estrito de asset gerado; não altera estado nem fluxo. |
| 265 | U12 | <code>    async function extractResultImage(resultImageElement, resultUrl, executionMode, attempt = 0, logContext = {}) {</code> | Declara dispatcher principal de uma tentativa de extração. |
| 266 | U12 | <code>      const url = String(resultUrl &#124;&#124; '');</code> | Normaliza `resultUrl` ausente para string vazia. |
| 267 | U12 | ␠ [linha vazia] | Separador visual de U12 — Dispatcher por tipo de URL/modo; não altera estado nem fluxo. |
| 268 | U12 | <code>      if (url.startsWith('data:image/')) {</code> | Data URL de imagem já pronta usa caminho zero-copy. |
| 269 | U12 | <code>        return url;</code> | Retorna a Data URL original sem canvas, fetch ou IPC. |
| 270 | U12 | <code>      }</code> | Fecha a estrutura sintática atual de U12 sem introduzir novo efeito além do contrato da unidade. |
| 271 | U12 | ␠ [linha vazia] | Separador visual de U12 — Dispatcher por tipo de URL/modo; não altera estado nem fluxo. |
| 272 | U12 | <code>      if (url.startsWith('blob:')) {</code> | Blob URL usa caminho local no content script. |
| 273 | U12 | <code>        const response = await fetchImpl(url);</code> | Busca o blob no próprio contexto da aba via fetch injetado. |
| 274 | U12 | <code>        const blob = await response.blob();</code> | Materializa o corpo como Blob. |
| 275 | U12 | <code>        return blobToDataUrl(blob);</code> | Converte o Blob para Data URL via FileReader. |
| 276 | U12 | <code>      }</code> | Fecha a estrutura sintática atual de U12 sem introduzir novo efeito além do contrato da unidade. |
| 277 | U12 | ␠ [linha vazia] | Separador visual de U12 — Dispatcher por tipo de URL/modo; não altera estado nem fluxo. |
| 278 | U12 | <code>      if (executionMode === 'background_delete' &#124;&#124; isGeneratedGeminiAsset(url)) {</code> | `background_delete` ou asset gerado força a cadeia de `extractImageInGeminiTab`. |
| 279 | U12 | <code>        return extractImageInGeminiTab(resultImageElement, url, attempt, logContext);</code> | Propaga imagem, URL, número de tentativa e contexto de log para a cadeia direta. |
| 280 | U12 | <code>      }</code> | Fecha a estrutura sintática atual de U12 sem introduzir novo efeito além do contrato da unidade. |
| 281 | U12 | ␠ [linha vazia] | Separador visual de U12 — Dispatcher por tipo de URL/modo; não altera estado nem fluxo. |
| 282 | U12 | <code>      // Preserva a rota histórica para URLs que não são assets gerados do Gemini.</code> | Comentário documenta preservação da rota histórica para HTTP comum fora desses casos. |
| 283 | U12 | <code>      return fetchImageThroughBackground(url);</code> | HTTP comum em outros modos vai direto ao Service Worker sem sessão. |
| 284 | U12 | <code>    }</code> | Fecha a estrutura sintática atual de U12 sem introduzir novo efeito além do contrato da unidade. |
| 285 | U12 | ␠ [linha vazia] | Separador visual de U12 — Dispatcher por tipo de URL/modo; não altera estado nem fluxo. |
| 286 | U13 | <code>    async function extractResultImageWithRetry(</code> | Declara wrapper de retry sobre a cadeia completa, não apenas sobre um fetch isolado. |
| 287 | U13 | <code>      resultImageElement,</code> | Parâmetro do retry: elemento IMG já selecionado pelo observer; será reutilizado por canvas em cada tentativa. |
| 288 | U13 | <code>      resultUrl,</code> | Parâmetro do retry: URL candidata original/elevada; determina data/blob/http e a classificação de asset gerado. |
| 289 | U13 | <code>      executionMode,</code> | Parâmetro do retry: modo de execução; influencia a escolha entre cadeia Gemini e fetch legado. |
| 290 | U13 | <code>      maxAttempts = 4,</code> | Padrão máximo de quatro tentativas; caller de produção também passa 4 explicitamente. |
| 291 | U13 | <code>      retryDelayMs = 1000,</code> | Delay padrão de 1 s entre tentativas subsequentes. |
| 292 | U13 | <code>      logContext = {}</code> | Recebe contexto opcional de correlação para propagar jobIdPrefix/batchIdPrefix/index por todas as tentativas. |
| 293 | U13 | <code>    ) {</code> | Fecha a lista de parâmetros de `extractResultImageWithRetry` e abre seu corpo assíncrono. |
| 294 | U13 | <code>      let lastError = null;</code> | Mantém a última exceção para relançá-la se todas as tentativas falharem. |
| 295 | U13 | ␠ [linha vazia] | Separador visual de U13 — Retry da cadeia completa; não altera estado nem fluxo. |
| 296 | U13 | <code>      for (let attempt = 0; attempt &lt; maxAttempts; attempt += 1) {</code> | Executa tentativas de 0 até `maxAttempts - 1`. |
| 297 | U13 | <code>        if (attempt &gt; 0) {</code> | Não dorme nem loga retry antes da primeira tentativa. |
| 298 | U13 | <code>          sendLog(</code> | Emite log de retry antes das passagens 2+. |
| 299 | U13 | <code>            'warn',</code> | Define severidade `warn` para anunciar uma repetição da cadeia; retry é esperado mas operacionalmente relevante. |
| 300 | U13 | <code>            'GEMINI_EXTRACT_RETRY_ALL',</code> | Usa action estável `GEMINI_EXTRACT_RETRY_ALL`. |
| 301 | U13 | <code>            'Repetindo toda a cadeia de extração por possível instabilidade.',</code> | Mensagem explicita que toda a cadeia será repetida por instabilidade. |
| 302 | U13 | <code>            {</code> | Delimitador estrutural de U13; organiza o bloco que repete toda a cadeia, preservando o último erro e atrasando tentativas subsequentes. |
| 303 | U13 | <code>              ...getUrlLogMetadata(resultUrl),</code> | Inclui metadados sanitizados da URL no retry. |
| 304 | U13 | <code>              ...(logContext &#124;&#124; {}),</code> | Inclui correlação do job sem exigir conhecimento de job/batch no módulo. |
| 305 | U13 | <code>              attempt,</code> | Registra o índice da tentativa que está prestes a executar. |
| 306 | U13 | <code>            }</code> | Fecha a estrutura sintática atual de U13 sem introduzir novo efeito além do contrato da unidade. |
| 307 | U13 | <code>          );</code> | Fecha a estrutura sintática atual de U13 sem introduzir novo efeito além do contrato da unidade. |
| 308 | U13 | <code>          await sleep(retryDelayMs);</code> | Aguarda delay injetável; se `sleep` rejeitar, o wrapper aborta sem capturar essa falha. |
| 309 | U13 | <code>        }</code> | Fecha a estrutura sintática atual de U13 sem introduzir novo efeito além do contrato da unidade. |
| 310 | U13 | ␠ [linha vazia] | Separador visual de U13 — Retry da cadeia completa; não altera estado nem fluxo. |
| 311 | U13 | <code>        try {</code> | Abre boundary de exceção em U13; falhas da operação seguinte são convertidas no caminho de fallback/erro definido pela unidade. |
| 312 | U13 | <code>          return await extractResultImage(</code> | Repete `extractResultImage` inteiro e retorna no primeiro sucesso. |
| 313 | U13 | <code>            resultImageElement,</code> | Repassa o mesmo elemento de resultado para cada nova execução da cadeia completa. |
| 314 | U13 | <code>            resultUrl,</code> | Repassa a mesma URL de resultado, evitando que o retry altere silenciosamente o recurso alvo. |
| 315 | U13 | <code>            executionMode,</code> | Repassa o mesmo executionMode para que retries mantenham semântica idêntica à primeira tentativa. |
| 316 | U13 | <code>            attempt,</code> | Passa o número da tentativa para logs internos. |
| 317 | U13 | <code>            logContext</code> | Preserva contexto de correlação em todos os estágios. |
| 318 | U13 | <code>          );</code> | Fecha a estrutura sintática atual de U13 sem introduzir novo efeito além do contrato da unidade. |
| 319 | U13 | <code>        } catch (error) {</code> | Captura somente falhas da cadeia de extração. |
| 320 | U13 | <code>          lastError = error;</code> | Substitui `lastError` pela causa mais recente. |
| 321 | U13 | <code>        }</code> | Fecha a estrutura sintática atual de U13 sem introduzir novo efeito além do contrato da unidade. |
| 322 | U13 | <code>      }</code> | Fecha a estrutura sintática atual de U13 sem introduzir novo efeito além do contrato da unidade. |
| 323 | U13 | ␠ [linha vazia] | Separador visual de U13 — Retry da cadeia completa; não altera estado nem fluxo. |
| 324 | U13 | <code>      throw lastError &#124;&#124; new Error('Todas as tentativas de extração falharam');</code> | Depois do loop, relança o último erro; se não houve tentativa (ex.: maxAttempts=0), cria erro genérico. |
| 325 | U13 | <code>    }</code> | Fecha a estrutura sintática atual de U13 sem introduzir novo efeito além do contrato da unidade. |
| 326 | U13 | ␠ [linha vazia] | Separador visual de U13 — Retry da cadeia completa; não altera estado nem fluxo. |
| 327 | U14 | <code>    async function extractOrAuxiliaryFallback({</code> | Declara API de alto nível que adiciona fallback auxiliar somente após retries. |
| 328 | U14 | <code>      resultImageElement,</code> | Argumento de alto nível: elemento IMG usado pelas rotas de canvas durante a tentativa direta. |
| 329 | U14 | <code>      resultUrl,</code> | Argumento de alto nível: URL que será extraída ou entregue ao fallback auxiliar se necessário. |
| 330 | U14 | <code>      executionMode,</code> | Argumento de alto nível: modo de execução que governa a rota inicial do dispatcher. |
| 331 | U14 | <code>      maxAttempts = 4,</code> | Mantém padrão de quatro tentativas também nesta camada pública. |
| 332 | U14 | <code>      retryDelayMs = 1000,</code> | Mantém delay padrão de 1 s. |
| 333 | U14 | <code>      onAuxiliaryFallback = null,</code> | Fallback auxiliar é opcional e injetado pelo orquestrador; módulo não conhece criação de abas. |
| 334 | U14 | <code>      logContext = {},</code> | Contexto de log permanece opcional e desacoplado do modelo de job. |
| 335 | U14 | <code>    } = {}) {</code> | Fecha a desestruturação opcional de argumentos de `extractOrAuxiliaryFallback`; chamada sem objeto continua válida. |
| 336 | U14 | <code>      try {</code> | Inicia tentativa da rota direta/retry. |
| 337 | U14 | <code>        const dataUrl = await extractResultImageWithRetry(</code> | Espera o wrapper de retry concluir. |
| 338 | U14 | <code>          resultImageElement,</code> | Encaminha o elemento ao wrapper de retry; o fallback auxiliar não depende dele, apenas da URL. |
| 339 | U14 | <code>          resultUrl,</code> | Encaminha a URL ao retry e preserva o mesmo valor para diagnóstico/fallback. |
| 340 | U14 | <code>          executionMode,</code> | Encaminha o executionMode para todas as tentativas diretas. |
| 341 | U14 | <code>          maxAttempts,</code> | Encaminha limite configurado de tentativas; produção usa quatro. |
| 342 | U14 | <code>          retryDelayMs,</code> | Encaminha delay entre tentativas; produção usa 1000 ms. |
| 343 | U14 | <code>          logContext</code> | Encaminha o contexto de correlação ao wrapper de retry para preservar telemetria por job. |
| 344 | U14 | <code>        );</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 345 | U14 | <code>        return {</code> | Em sucesso, devolve objeto discriminado `kind:'extracted'`. |
| 346 | U14 | <code>          kind: 'extracted',</code> | Tag explícita permite ao job-runner distinguir extração local de transferência auxiliar. |
| 347 | U14 | <code>          dataUrl,</code> | Inclui Data URL extraída. |
| 348 | U14 | <code>          error: null,</code> | Define `error:null` para contrato uniforme. |
| 349 | U14 | <code>        };</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 350 | U14 | <code>      } catch (error) {</code> | Somente entra aqui quando todas as rotas/retries lançaram. |
| 351 | U14 | <code>        sendLog(</code> | Registra diagnóstico agregado antes de considerar o fallback auxiliar. |
| 352 | U14 | <code>          'warn',</code> | Define severidade `warn` do diagnóstico terminal após esgotar todas as rotas diretas. |
| 353 | U14 | <code>          'GEMINI_EXTRACT_DIAGNOSTIC',</code> | Usa action `GEMINI_EXTRACT_DIAGNOSTIC`. |
| 354 | U14 | <code>          'Todas as rotas sem aba auxiliar falharam; diagnóstico registrado.',</code> | Mensagem deixa explícito que rotas sem aba auxiliar foram esgotadas. |
| 355 | U14 | <code>          {</code> | Delimitador estrutural de U14; organiza o bloco que só transfere ao fallback auxiliar depois de esgotar tentativas diretas e registrar diagnóstico. |
| 356 | U14 | <code>            ...getUrlLogMetadata(resultUrl),</code> | Inclui apenas metadados derivados da URL. |
| 357 | U14 | <code>            ...(logContext &#124;&#124; {}),</code> | Inclui correlação de job/batch/index. |
| 358 | U14 | <code>            attempts: maxAttempts,</code> | Registra quantidade configurada de tentativas. |
| 359 | U14 | <code>            finalErrorName: error &amp;&amp; error.name ? error.name : 'Error',</code> | Registra classe/nome da falha final. |
| 360 | U14 | <code>            finalFailureKind: getExtractionFailureKind(error),</code> | Classifica a falha final com a mesma heurística dos estágios. |
| 361 | U14 | <code>            finalMessageLength: String(error &amp;&amp; error.message &#124;&#124; '').length,</code> | Registra tamanho da mensagem, não seu conteúdo integral. |
| 362 | U14 | <code>          }</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 363 | U14 | <code>        );</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 364 | U14 | ␠ [linha vazia] | Separador visual de U14 — Fallback auxiliar terminal; não altera estado nem fluxo. |
| 365 | U14 | <code>        sendLog(</code> | Emite segundo evento anunciando uso do último recurso. |
| 366 | U14 | <code>          'warn',</code> | Define severidade `warn` do evento que anuncia entrada no fallback auxiliar. |
| 367 | U14 | <code>          'GEMINI_AUXILIARY_FALLBACK',</code> | Usa action `GEMINI_AUXILIARY_FALLBACK`. |
| 368 | U14 | <code>          'Último recurso: usando aba auxiliar. Este não é o comportamento padrão e deve ser investigado.',</code> | Mensagem trata aba auxiliar como exceção operacional a investigar, não caminho normal. |
| 369 | U14 | <code>          {</code> | Delimitador estrutural de U14; organiza o bloco que só transfere ao fallback auxiliar depois de esgotar tentativas diretas e registrar diagnóstico. |
| 370 | U14 | <code>            ...getUrlLogMetadata(resultUrl),</code> | Mantém metadados sanitizados também nesse evento. |
| 371 | U14 | <code>            ...(logContext &#124;&#124; {}),</code> | Mantém correlação do job. |
| 372 | U14 | <code>            reason: 'all_direct_paths_failed',</code> | Registra motivo estável `all_direct_paths_failed`. |
| 373 | U14 | <code>          }</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 374 | U14 | <code>        );</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 375 | U14 | ␠ [linha vazia] | Separador visual de U14 — Fallback auxiliar terminal; não altera estado nem fluxo. |
| 376 | U14 | <code>        if (typeof onAuxiliaryFallback !== 'function') {</code> | Se não há callback, não finge que o fallback existe. |
| 377 | U14 | <code>          throw error;</code> | Relança o erro terminal original para o caller. |
| 378 | U14 | <code>        }</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 379 | U14 | ␠ [linha vazia] | Separador visual de U14 — Fallback auxiliar terminal; não altera estado nem fluxo. |
| 380 | U14 | <code>        const fallbackResult = await onAuxiliaryFallback({</code> | Invoca callback do job-runner somente após logs e esgotamento das rotas diretas. |
| 381 | U14 | <code>          url: resultUrl,</code> | Entrega URL original/elevada ao orquestrador para registrar a extração auxiliar. |
| 382 | U14 | <code>          error,</code> | Entrega a causa final para diagnóstico/decisão do callback. |
| 383 | U14 | <code>        });</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 384 | U14 | ␠ [linha vazia] | Separador visual de U14 — Fallback auxiliar terminal; não altera estado nem fluxo. |
| 385 | U14 | <code>        return {</code> | Retorna contrato discriminado de transferência auxiliar. |
| 386 | U14 | <code>          kind: 'auxiliary',</code> | Tag `auxiliary` sinaliza que a persistência final ocorrerá fora desta chamada. |
| 387 | U14 | <code>          dataUrl: null,</code> | `dataUrl:null` evita confundir registro de fallback com imagem já extraída. |
| 388 | U14 | <code>          error,</code> | Preserva o erro direto que motivou o fallback. |
| 389 | U14 | <code>          fallbackResult,</code> | Inclui retorno do callback (em produção, resposta de registro do background). |
| 390 | U14 | <code>        };</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 391 | U14 | <code>      }</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 392 | U14 | <code>    }</code> | Fecha a estrutura sintática atual de U14 sem introduzir novo efeito além do contrato da unidade. |
| 393 | U14 | ␠ [linha vazia] | Separador visual de U14 — Fallback auxiliar terminal; não altera estado nem fluxo. |
| 394 | U15 | <code>    return {</code> | Retorna a API da instância; todos os helpers compartilham as dependências injetadas desta fábrica. |
| 395 | U15 | <code>      imageElementToDataUrl,</code> | Expõe conversão canvas para uso direto/compatibilidade no composition root. |
| 396 | U15 | <code>      fetchImageThroughGeminiPage,</code> | Expõe o bridge MAIN-world. |
| 397 | U15 | <code>      fetchGeminiImageThroughExtension,</code> | Expõe a rota SW com sessão Gemini. |
| 398 | U15 | <code>      fetchImageThroughBackground,</code> | Expõe a rota SW legada sem sessão. |
| 399 | U15 | <code>      getExtractionFailureKind,</code> | Expõe classificador de falhas para diagnóstico e API de compatibilidade. |
| 400 | U15 | <code>      logExtractionStage,</code> | Expõe emissor de estágio; útil para composição/testes, mas mantém risco de logger lançar. |
| 401 | U15 | <code>      blobToDataUrl,</code> | Expõe conversor FileReader de Blob. |
| 402 | U15 | <code>      extractImageInGeminiTab,</code> | Expõe cadeia direta no contexto Gemini. |
| 403 | U15 | <code>      extractResultImage,</code> | Expõe dispatcher por tipo/modo. |
| 404 | U15 | <code>      extractResultImageWithRetry,</code> | Expõe retry completo. |
| 405 | U15 | <code>      extractOrAuxiliaryFallback,</code> | Expõe operação terminal com fallback auxiliar. |
| 406 | U15 | <code>    };</code> | Fecha a estrutura sintática atual de U15 sem introduzir novo efeito além do contrato da unidade. |
| 407 | U15 | <code>  }</code> | Fecha a fábrica `createResultExtractor`. |
| 408 | U15 | ␠ [linha vazia] | Separador visual de U15 — API pública e publicação global/CommonJS; não altera estado nem fluxo. |
| 409 | U15 | <code>  const api = { createResultExtractor };</code> | Cria API de módulo contendo apenas a fábrica; instâncias são criadas pelo bootstrap. |
| 410 | U15 | ␠ [linha vazia] | Separador visual de U15 — API pública e publicação global/CommonJS; não altera estado nem fluxo. |
| 411 | U15 | <code>  scope.MangaTranslatorGeminiResultExtractor = api;</code> | Publica a fábrica em `MangaTranslatorGeminiResultExtractor` para o content script carregado pelo manifest. |
| 412 | U15 | <code>  if (typeof module !== 'undefined' &amp;&amp; module.exports) module.exports = api;</code> | No Node/Jest, exporta a mesma API via CommonJS, permitindo testes do módulo real. |
| 413 | U15 | <code>})(typeof self !== 'undefined' ? self : globalThis);</code> | Executa a IIFE contra `self` quando existe, senão `globalThis`, cobrindo browser e Node. |
| 414 | U15 | ␠ [linha vazia] | Representa o newline final do arquivo; não executa código, mas faz parte da posição documental auditada. |

## 14. Checklist de conclusão desta Bíblia

- [x] SHA do fonte conferido antes da escrita.
- [x] Fonte integral copiada sem omissões.
- [x] 414/414 posições documentadas.
- [x] Loader, composition root, consumer e action SW investigados.
- [x] Teste direto real lido; EXT-01…EXT-13 classificados por assertions.
- [x] Evidência do action background separada da evidência deste módulo.
- [x] Simulação/mock do job runner não confundida com prova interna.
- [x] Lacunas de teste explicitadas.
- [x] Segurança/privacidade/trust boundaries analisados.
- [x] MV3/lifecycle, retries, cleanup e concorrência analisados.
- [x] Invariantes registradas.
- [x] Riscos e possível assimetria de integração documentados sem alterar código funcional.

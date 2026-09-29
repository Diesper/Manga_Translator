# Bíblia técnica — `extension/content/gemini/observer.js`

> **Estado:** 🟠 EM ANDAMENTO — `GPT-5.6-Sol#H`  
> **SHA auditado:** `59c5335e1b4fd6b2877988cde9816f1c0b290b35`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#H`  
> **Tipo:** JavaScript de content script / módulo Gemini orientado a eventos  
> **Linhas textuais:** **587**  
> **Posições documentais:** **588** contando newline final

## 1. Papel arquitetural

`observer.js` é a máquina de observação do fluxo Gemini. Ele não envia prompt, não faz upload, não busca imagem pela rede e não conversa diretamente com APIs Chrome. Seu papel é transformar mudanças observáveis da UI do Gemini em dois contratos assíncronos: **“o submit foi realmente confirmado”** e **“um resultado pertencente ao model turn atual foi encontrado”**.

O módulo funciona dentro da aba Gemini, portanto sua fronteira de confiança é um DOM de SPA mutável e parcialmente controlado por markup externo. A arquitetura usa sinais redundantes — consumo do editor, Stop visível, Send passando a busy, novo response container, erros visíveis, MutationObserver, eventos de carga e inspeção periódica — sem aceitar um único click como prova de envio.

## 2. Dependências e consumidores reais

### Dependências

- `MangaTranslatorGeminiSelectors.SELECTORS`: fornece seletores de Send, Stop, erro, user turn e response estrita.
- `MangaTranslatorGeminiDom`: faz travessia profunda/Shadow DOM, visibilidade, enablement, ownership estrutural e normalização de fonte de imagem.
- `MangaTranslatorGeminiImageQuarantine`: barreira adicional contra preview/anexo/composer; é opcional no carregamento deste arquivo, mas normalmente injetada pelo pipeline real.
- APIs web: `URL`, `MutationObserver`, `queueMicrotask`, timers e eventos `load/error`.

### Consumidores

- `extension/content/gemini/job-runner.js` cria o observer antes do submit, passa `ignoreImages`, `imageQuarantine` e `onStateChange`, espera `waitForResult`, permite seleção manual via `acceptResult` e chama `stop()` no `finally`.
- `extension/content/gemini/editor.js` usa `waitForSubmission` como **fonte de verdade**, recusando tratar click/Enter/fallback MAIN como confirmação por si só.
- `extension/content/content_gemini.js` injeta a API global no JobRunner durante o composition root.
- Suites `observer.test.js` e `editor-submit.test.js` carregam a implementação real; `rpa-flow.test.js` e E2E exercitam o observer dentro do pipeline maior.

## 3. Máquina de estado e ownership

O estado é monotônico em três dimensões críticas:

1. **submission**: começa não confirmado e só vira confirmado uma vez;
2. **generation**: registra início/atividade e um sinal de término da UI;
3. **terminal**: resultado, erro ou stop levam `done=true`; resultado/erro liquidam waiters e stop faz cleanup físico.

Ownership é construído por baseline + contexto estrutural. Respostas já existentes, URLs de imagem já vistas e erros visíveis pré-existentes são congelados na criação. Um resultado automático exige novo model turn estrito ou, excepcionalmente, um asset HTTPS `gg-dl/rd-gg-dl` após geração ter sido observada. Turnos do usuário, attachment previews e composer são barreiras explícitas.

## 4. Estratégia contra races e DOM dinâmico

- O observer deve ser iniciado **antes** do submit; OBS-11 e o E2E de resposta rápida verificam que uma resposta no mesmo instante lógico não é perdida.
- MutationObserver recebe coalescing por microtask para evitar inspeções redundantes.
- Open Shadow DOM é descoberto dinamicamente e passa a ser observado.
- Eventos capture de `load/error` forçam nova inspeção de mídia cujo tamanho/complete mudou sem uma mutation suficiente.
- Polling de 1250 ms funciona como rede de segurança, não como sinal primário.
- `stop()` remove observers, listeners, timers e registry para impedir callback tardio de um job antigo.

## 5. Segurança, privacidade e trust boundaries

O DOM do Gemini é tratado como entrada não confiável para ownership. O módulo reduz spoofing por:

- seletores de model response estritos;
- bloqueio de user turn e input area;
- quarentena estrutural de anexos/previews;
- baseline de URLs e nós anteriores;
- fallback órfão limitado a HTTPS `googleusercontent.com` com caminho de asset gerado e geração previamente observada;
- validação de readiness para blob/data;
- não emitir URL completa nos eventos de estado de resultado; `urlKind` contém apenas o esquema.

A URL real ainda é devolvida ao JobRunner porque o pipeline precisa extraí-la. A validação byte-a-byte/perceptual do resultado ocorre posteriormente no JobRunner/ImageQuarantine; este arquivo é a camada de **ownership DOM**, não a prova final de que bytes diferem do input.

## 6. MV3 e lifecycle

Este arquivo não roda no Service Worker MV3; ele roda no contexto da página Gemini. Portanto suspensão do worker não apaga diretamente seu estado, mas navegação/fechamento da aba destrói o contexto. Registry e flags são memória efêmera da aba, não journal durável. O background mantém durabilidade do job separadamente.

Timers de página podem sofrer throttling quando a aba está em background; por isso o JobRunner controla anti-throttling/keep-alive fora deste módulo. O polling de 1250 ms não deve ser confundido com garantia de tempo real.

## 7. Evidência automatizada conferida

| Comportamento | Evidência lida | Classificação |
|---|---|---|
| Stop oculto não ativa geração | OBS-01 | ✅ PROVADO DIRETAMENTE |
| Stop visível confirma submit | OBS-02 | ✅ PROVADO DIRETAMENTE |
| Novo response recebe ownership | OBS-03 | ✅ PROVADO DIRETAMENTE |
| Response baseline não muda ownership | OBS-04 | ✅ PROVADO DIRETAMENTE |
| Imagem baseline é ignorada | OBS-05 | ✅ PROVADO DIRETAMENTE |
| Nova imagem no novo response resolve resultado | OBS-06 | ✅ PROVADO DIRETAMENTE |
| Erro oculto versus erro novo visível | OBS-07/08 | ✅ PROVADO DIRETAMENTE |
| cleanup idempotente / sem resultado pós-cleanup | OBS-09/10 | ✅ PROVADO DIRETAMENTE |
| resposta instantânea após start | OBS-11 + E2E resposta rápida | ✅ PROVADO DIRETAMENTE / E2E |
| geração ativa sem resultado prematuro | OBS-12 | ✅ PROVADO DIRETAMENTE |
| transição Send enabled→disabled | OBS-13 | ✅ PROVADO DIRETAMENTE |
| coalescing de mutations | teste `coalescing` | ✅ PROVADO DIRETAMENTE |
| Shadow DOM e resultado remoto carregado depois | OBS-14/20 | ✅ PROVADO DIRETAMENTE |
| bloqueio de user turn | OBS-15 + E2E ownership | ✅ PROVADO DIRETAMENTE / E2E |
| fallback gg-dl após geração | OBS-16 | ✅ PROVADO DIRETAMENTE |
| attachment preview reconstruído | OBS-17 | ✅ PROVADO DIRETAMENTE |
| autoria explícita dentro de wrapper user | OBS-18 | ✅ PROVADO DIRETAMENTE |
| wrapper estrito aninhado / rd-gg-dl | OBS-19 | ✅ PROVADO DIRETAMENTE |
| seleção manual usa a mesma Promise | PR6 | ✅ PROVADO DIRETAMENTE |
| editor consumido / submit não confirmado / fallback MAIN | SEND-01..07 | ✅ PROVADO DIRETAMENTE ENTRE MÓDULOS REAIS |
| erro UI chega a GEMINI_ERROR | CG-27/35 em `rpa-flow.test.js` | ✅ PROVADO NO FLUXO INTEGRADO |
| timeout do observer vira result_timeout | CG-36 | ✅ PROVADO NO FLUXO INTEGRADO |
| resultado em shadow assistant sem intervenção | E2E translation-flow | ✅ PROVADO END-TO-END |
| rejeição user_turn + missing_model_owner e aceitação new_model_turn | E2E ownership | ✅ PROVADO END-TO-END |
| JobRunner reage a generation_started/acceptResult | RUN-05/RUN-08 | 🟨 CONSUMIDOR PROVADO COM OBSERVER MOCKADO |
| resolution-elevation carrega observer | `resolution-elevation.test.js` | 🟨 EXECUTADO INDIRETAMENTE; propriedade testada é de outro módulo |

Nenhuma ocorrência textual foi tratada como prova. Em particular, os testes de JobRunner que fornecem `observerApi.createGeminiObserver: jest.fn(...)` provam o **contrato do consumidor**, não a implementação deste arquivo.

## 8. Lacunas de teste e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falha de carregamento de `selectors.js`, `dom.js` ou ausência de `SELECTORS`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para execução sem ImageQuarantine disponível; a defesa estrutural extra desaparece nesse caso.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `jobId` ausente, root ausente e MutationObserver ausente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `getEditor()` lançar durante o baseline inicial; esse primeiro lookup não está dentro de try/catch.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para substituir um observer anterior com o mesmo `jobId`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para registry pré-existente truthy mas não-objeto.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para URL malformada, HTTP ou hostname visualmente parecido com googleusercontent no helper de asset gerado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para erro repetido com exatamente o mesmo texto do baseline; atualmente ele é ignorado mesmo se representar nova ocorrência.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para DOM que recicla o mesmo nó de response do baseline para uma nova resposta; identity-based baseline pode causar falso negativo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para resultado legítimo reutilizar exatamente uma URL presente no baseline/ignoreImages.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para exceção em `onStateChange`, `clearTimeoutFn`, `responseObserver.observe` ou `state.observer.observe`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para múltiplos waiters simultâneos de submit ou resultado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para deduplicação de `result_candidate_rejected` por WeakMap ao longo de várias inspeções.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para marker textual `gemini-result-image`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para periodicidade exata de 1250 ms ou recuperação se `inspect()` lançar dentro do timer.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `queueMicrotaskFn` lançar; nesse caso `inspectionScheduled` pode permanecer true.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para rejeição de waiter causada especificamente por `stop()`.
- ⚠️ O estado `generationFinished` pode ser marcado quando geração foi observada por response criado e não existe Stop visível, mesmo sem ter observado Stop anteriormente. Hoje esse campo é telemetria/estado, não gate de resultado.
- ⚠️ `fail()` e `setResult()` marcam `done`, mas não desconectam fisicamente observers/listeners; o cleanup completo depende de `stop()` do consumidor. JobRunner faz isso no `finally`, mas um consumidor futuro que não pare a instância pode reter recursos até o contexto morrer.
- ⚠️ `getState()` devolve a referência mutável real; código externo pode corromper invariantes se escrever nela.
- ⚠️ Shadow roots fechados não podem ser atravessados por esta abordagem.

## 9. Casos-limite relevantes

- editor ausente ou substituído durante a geração;
- botão Send já disabled no baseline;
- Stop oculto por CSS/aria;
- resposta antiga mutada depois do start;
- novo model turn dentro de ancestral que também casa com user selector;
- preview do anexo reconstruído com novo blob URL;
- imagem remota inicialmente sem dimensões e concluída depois;
- blob/data ainda incompleto;
- asset gg-dl órfão antes versus depois de evidência de geração;
- erro invisível, vazio ou repetido;
- múltiplas mutations no mesmo turno;
- shadow root inserido após start;
- timeout de submit, timeout de resultado e stop concorrendo com callbacks;
- chamada repetida de stop.

## 10. Invariantes

1. Um `jobId` não pode manter dois observers ativos no mesmo registry.
2. Submission nunca pode ser confirmado somente porque Send nasceu disabled.
3. Click/Enter/fallback MAIN não são prova; a UI observada é a fonte de verdade.
4. Resposta/model image do baseline nunca recebe ownership do job novo.
5. Turno do usuário, composer e attachment preview não podem virar resultado automático.
6. Exceção de wrapper user só vale quando o candidato prova autoria explícita de modelo.
7. Fallback sem owner exige asset HTTPS googleusercontent gg-dl/rd-gg-dl **e** geração observada.
8. Blob/data automático precisa estar materialmente carregado antes da aceitação.
9. Evento de resultado não deve expor URL completa em telemetria.
10. Erro visível novo encerra waiters antes de continuar procurando resultado.
11. Coalescing deve impedir tempestade de inspeções por mutations equivalentes.
12. Open Shadow DOM e eventos de load devem continuar observáveis.
13. Stop deve ser idempotente e remover observers, listeners, timers e registry.
14. Resultado manual e automático devem compartilhar `setResult`/a mesma Promise.
15. Timeout de submit deve ser curto e distinguível do timeout terminal de resultado.
16. Um caller que recebe resultado/erro continua responsável por executar `stop()` para cleanup físico completo.

## 11. Fonte integral auditada

```javascript
'use strict';
// gemini/observer.js — Observer orientado a eventos por job Gemini.
//
// Este módulo não envia mensagens nem clica na UI. Ele observa transições
// verificáveis e expõe Promises para confirmação de submit e resultado.

(function(scope) {
  let selectorsApi = scope.MangaTranslatorGeminiSelectors || null;
  let domApi = scope.MangaTranslatorGeminiDom || null;
  let quarantineApi = scope.MangaTranslatorGeminiImageQuarantine || null;

  if (typeof require === 'function') {
    if (!selectorsApi) {
      try { selectorsApi = require('./selectors.js'); } catch (_e) {}
    }
    if (!domApi) {
      try { domApi = require('./dom.js'); } catch (_e) {}
    }
    if (!quarantineApi) {
      try { quarantineApi = require('./image-quarantine.js'); } catch (_e) {}
    }
  }

  if (!selectorsApi || !selectorsApi.SELECTORS) {
    throw new Error('MangaTranslatorGeminiSelectors indisponível');
  }
  if (!domApi) {
    throw new Error('MangaTranslatorGeminiDom indisponível');
  }

  const { SELECTORS } = selectorsApi;

  function createError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function safeQueryAll(root, selector) {
    if (!root || !selector) return [];
    return domApi.findAllDeep(root.body || root.documentElement || root, element =>
      element.nodeType === 1 && element.matches?.(selector)
    );
  }

  function isGeneratedGeminiUrl(src) {
    try {
      const url = new URL(src);
      return url.protocol === 'https:' &&
        (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com')) &&
        /\/(?:rd-)?gg-dl\//.test(url.pathname);
    } catch (_e) { return false; }
  }

  function createGeminiObserver({
    jobId,
    root = typeof document !== 'undefined' ? document : null,
    editor = null,
    getEditor = null,
    ignoreImages = new Set(),
    imageQuarantine = null,
    onStateChange = null,
    MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    queueMicrotaskFn = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : callback => Promise.resolve().then(callback),
  } = {}) {
    if (!jobId) throw new Error('jobId é obrigatório');
    if (!root) throw new Error('root é obrigatório');
    if (!MutationObserverImpl) throw new Error('MutationObserver indisponível');

    const quarantine = imageQuarantine || quarantineApi?.createImageQuarantine?.({ dom: domApi });

    const registryOwner = root.defaultView || root.ownerDocument?.defaultView || scope;
    registryOwner.__mtGeminiObservers = registryOwner.__mtGeminiObservers || {};

    const existing = registryOwner.__mtGeminiObservers[jobId];
    if (existing && typeof existing.stop === 'function') {
      try { existing.stop(); } catch (_e) {}
    }

    const initialResponses = new Set(safeQueryAll(root, SELECTORS.MODEL_RESPONSE_STRICT));
    const initialImageSources = new Set();
    safeQueryAll(root, 'img').forEach(img => {
      const src = domApi.getImageSource(img);
      if (src) initialImageSources.add(src);
    });
    for (const src of ignoreImages || []) {
      if (src) initialImageSources.add(src);
    }

    const initialErrors = new Set();
    safeQueryAll(root, SELECTORS.ERROR).forEach(element => {
      if (!domApi.isElementVisible(element)) return;
      const text = String(element.innerText || element.textContent || '').trim();
      if (text) initialErrors.add(text);
    });

    const initialEditor = typeof getEditor === 'function' ? getEditor() : editor;
    const initialEditorText = String(initialEditor?.textContent || '').trim();
    const initialSendControls = safeQueryAll(root, SELECTORS.SEND)
      .filter(domApi.isElementVisible);
    const initialSendEnabled = initialSendControls.some(domApi.isControlEnabled);

    const state = {
      jobId,
      initialResponseCount: initialResponses.size,
      initialImageSources,
      responseContainer: null,
      ready: false,
      submissionConfirmed: false,
      submissionReason: null,
      generationActiveObserved: false,
      generationStarted: false,
      generationFinished: false,
      sendEnabledObserved: initialSendEnabled,
      resultImage: null,
      resultUrl: null,
      error: null,
      done: false,
      cleanedUp: false,
      observer: null,
      responseObserver: null,
      shadowRoots: new Set(),
      inspectionTimer: null,
      timers: new Set(),
      inspectionScheduled: false,
      inspectCount: 0,
    };

    const submissionWaiters = new Set();
    const resultWaiters = new Set();

    function emitState(type, extra = {}) {
      if (typeof onStateChange !== 'function') return;
      try {
        onStateChange(type, {
          jobId,
          ...extra,
          submissionConfirmed: state.submissionConfirmed,
          generationActiveObserved: state.generationActiveObserved,
          responseContainer: state.responseContainer,
          resultUrl: state.resultUrl,
          error: state.error,
        });
      } catch (_e) {}
    }

    function removeTimer(timer) {
      if (timer === null || timer === undefined) return;
      state.timers.delete(timer);
      try { clearTimeoutFn(timer); } catch (_e) {}
    }

    function settleWaiters(waiters, mode, payload) {
      for (const waiter of Array.from(waiters)) {
        waiters.delete(waiter);
        removeTimer(waiter.timer);
        try {
          if (mode === 'resolve') waiter.resolve(payload);
          else waiter.reject(payload);
        } catch (_e) {}
      }
    }

    function confirmSubmission(reason) {
      if (state.cleanedUp || state.done || state.submissionConfirmed) return false;
      state.submissionConfirmed = true;
      state.submissionReason = reason;
      emitState('submission_confirmed', { reason });
      settleWaiters(submissionWaiters, 'resolve', {
        confirmed: true,
        reason,
      });
      return true;
    }

    function markGenerationActive(reason) {
      if (state.cleanedUp || state.done) return;
      const wasObserved = state.generationActiveObserved;
      state.generationActiveObserved = true;
      state.generationStarted = true;
      if (!wasObserved) emitState('generation_started', { reason });
      if (!state.submissionConfirmed) confirmSubmission(reason === 'stop_visible' ? 'stop_visible' : 'generation_started');
    }

    function fail(errorText) {
      if (state.cleanedUp || state.done || state.error) return;
      state.error = String(errorText || 'Erro desconhecido do Gemini');
      state.done = true;
      const error = createError('GEMINI_UI_ERROR', state.error);
      emitState('ui_error', { error: state.error });
      settleWaiters(submissionWaiters, 'reject', error);
      settleWaiters(resultWaiters, 'reject', error);
    }

    function setResult(image, url) {
      if (state.cleanedUp || state.done || !url) return false;
      state.resultImage = image || null;
      state.resultUrl = url;
      state.done = true;
      emitState('result_image', { urlKind: String(url).split(':', 1)[0] || 'unknown' });
      settleWaiters(resultWaiters, 'resolve', {
        image: state.resultImage,
        url: state.resultUrl,
      });
      return true;
    }

    function hasExplicitModelOwnership(element) {
      if (!element || element.nodeType !== 1) return false;
      const tag = String(element.tagName || '').toLowerCase();
      if (tag === 'model-response' || tag === 'bard-model-response') return true;

      const author = String(element.getAttribute?.('data-message-author') || '').toLowerCase();
      if (author === 'model' || author === 'assistant') return true;

      const role = String(element.getAttribute?.('data-turn-role') || '').toLowerCase();
      if (role === 'model' || role === 'assistant') return true;

      const testId = String(
        element.getAttribute?.('data-test-id') ||
        element.getAttribute?.('data-testid') ||
        ''
      ).toLowerCase();
      if (testId.includes('model-response')) return true;

      return tag === 'message-content' && element.classList?.contains('model');
    }

    function isBlockedByUserTurn(element) {
      const userTurn = domApi.getUserTurnContainer?.(element);
      if (!userTurn) return false;
      if (userTurn === element) return true;

      // O Gemini pode envolver um model turn real em um wrapper que também
      // casa com USER_TURN. Só atravessamos esse ancestral quando o próprio
      // candidato traz autoria explícita de modelo; wrappers genéricos
      // continuam rejeitados para não capturar imagens do usuário.
      return !hasExplicitModelOwnership(element);
    }

    function acquireResponseContainer() {
      if (state.responseContainer && state.responseContainer.isConnected !== false) {
        return state.responseContainer;
      }

      const responses = safeQueryAll(root, SELECTORS.MODEL_RESPONSE_STRICT);
      const candidates = responses.filter(element =>
        !initialResponses.has(element) &&
        !isBlockedByUserTurn(element) && !domApi.isInsideInputArea(element)
      );
      if (!candidates.length) return null;

      const container = candidates[candidates.length - 1];
      state.responseContainer = container;
      state.generationStarted = true;
      emitState('response_container', { responseIndex: responses.length - 1 });
      markGenerationActive('response_created');
      confirmSubmission('response_created');

      if (state.responseObserver) {
        try { state.responseObserver.disconnect(); } catch (_e) {}
      }
      state.responseObserver = new MutationObserverImpl(scheduleInspect);
      try {
        state.responseObserver.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['src', 'srcset', 'data-src', 'aria-hidden', 'style', 'class'],
        });
      } catch (_e) {}

      return container;
    }

    function inspectEditor() {
      if (state.submissionConfirmed || !initialEditorText) return;
      let current = null;
      try {
        current = typeof getEditor === 'function' ? getEditor() : editor;
      } catch (_e) {}
      if (!current) return;
      const currentText = String(current.textContent || '').trim();
      if (currentText.length === 0) confirmSubmission('editor_consumed');
    }

    function inspectControls() {
      const visibleStop = domApi.findVisibleStopButton(root);
      if (visibleStop) {
        markGenerationActive('stop_visible');
      } else if (
        state.generationActiveObserved &&
        state.responseContainer &&
        state.responseContainer.isConnected !== false
      ) {
        if (!state.generationFinished) {
          state.generationFinished = true;
          emitState('generation_finished');
        }
      }

      const sendControls = safeQueryAll(root, SELECTORS.SEND)
        .filter(domApi.isElementVisible);
      const hasEnabledSend = sendControls.some(domApi.isControlEnabled);
      if (hasEnabledSend) state.sendEnabledObserved = true;

      // "Send busy" só é evidência de submit quando houve transição real.
      // Um botão que já nasceu disabled no baseline NÃO confirma envio.
      const transitionedToBusy =
        state.sendEnabledObserved &&
        sendControls.length > 0 &&
        sendControls.every(element => !domApi.isControlEnabled(element));

      if (transitionedToBusy) {
        confirmSubmission('send_busy');
        markGenerationActive('send_busy');
      }
    }

    function inspectErrors() {
      const errors = safeQueryAll(root, SELECTORS.ERROR);
      for (const element of errors) {
        if (!domApi.isElementVisible(element)) continue;
        const text = String(element.innerText || element.textContent || '').trim();
        if (!text || initialErrors.has(text)) continue;
        fail(text);
        return;
      }
    }

    function strongImageUrl(src) {
      return src.startsWith('blob:') ||
        src.startsWith('data:image/') ||
        isGeneratedGeminiUrl(src) ||
        src.includes('gemini-result-image');
    }

    function isCandidateImage(image) {
      const src = domApi.getImageSource(image);
      if (!src || state.initialImageSources.has(src) || domApi.isIgnoredGeminiImageSource(src)) {
        return false;
      }

      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (strongImageUrl(src)) return true;
      if (image.complete === false && width <= 0 && height <= 0) return false;
      return width > 0 && height > 0;
    }

    const candidateDiagnostics = new WeakMap();
    function sourceType(src) {
      return src.startsWith('blob:') ? 'blob' : src.startsWith('data:image/') ? 'data' :
        isGeneratedGeminiUrl(src) ? 'generated_google_asset' : 'remote';
    }
    function rejectCandidate(image, reason, src) {
      const signature = reason + '|' + src;
      if (candidateDiagnostics.get(image) === signature) return;
      candidateDiagnostics.set(image, signature);
      emitState('result_candidate_rejected', { reason, sourceType: sourceType(src) });
    }
    function inspectResult() {
      acquireResponseContainer();
      if (!state.submissionConfirmed) return;
      const images = safeQueryAll(root, 'img');
      for (let index = images.length - 1; index >= 0; index -= 1) {
        const image = images[index];
        if (!isCandidateImage(image) || image.isConnected === false) continue;
        const src = domApi.getImageSource(image);
        const structuralReason = quarantine?.classifyStructuralInput?.(image);
        if (structuralReason) { rejectCandidate(image, structuralReason, src); continue; }
        const owner = domApi.getStrictModelResponseContainer(image);
        if (owner && initialResponses.has(owner)) { rejectCandidate(image, 'old_model_turn', src); continue; }
        const belongsToNewModelTurn = Boolean(owner && !initialResponses.has(owner));
        // Não aceitar blob/data órfão, nem tratar um message-content genérico
        // como prova de autoria. Só asset gerado e geração observada podem
        // usar o fallback sem um wrapper de autoria forte.
        const trustedFallback = !owner && isGeneratedGeminiUrl(src) && state.generationActiveObserved;
        if (!belongsToNewModelTurn && !trustedFallback) {
          rejectCandidate(image, 'missing_model_owner', src); continue;
        }
        if ((src.startsWith('blob:') || src.startsWith('data:image/')) &&
            (image.complete === false || Number(image.naturalWidth || 0) <= 0 || Number(image.naturalHeight || 0) <= 0)) {
          rejectCandidate(image, 'pending_model_media', src); continue;
        }
        emitState('result_candidate_accepted', {
          reason: belongsToNewModelTurn ? 'new_model_turn' : 'generated_asset_after_generation',
          sourceType: sourceType(src), ownerTag: owner?.tagName?.toLowerCase() || null,
        });
        if (setResult(image, src)) return;
      }
    }

    const imageEventRoots = new Set();
    const observationOptions = {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'disabled', 'aria-disabled', 'aria-hidden', 'style', 'class'],
    };
    function observeShadowRoots() {
      if (!state.observer) return;
      const searchRoot = root.body || root.documentElement || root;
      const targets = [searchRoot];
      for (const host of domApi.findAllDeep(searchRoot, element => Boolean(element.shadowRoot))) {
        if (!state.shadowRoots.has(host.shadowRoot)) {
          state.observer.observe(host.shadowRoot, observationOptions);
          state.shadowRoots.add(host.shadowRoot);
        }
        targets.push(host.shadowRoot);
      }
      for (const target of targets) {
        if (imageEventRoots.has(target)) continue;
        target.addEventListener?.('load', scheduleInspect, true);
        target.addEventListener?.('error', scheduleInspect, true);
        imageEventRoots.add(target);
      }
    }
    function schedulePeriodicInspection() {
      if (state.done || state.cleanedUp) return;
      state.inspectionTimer = setTimeoutFn(() => {
        state.timers.delete(state.inspectionTimer);
        state.inspectionTimer = null;
        inspect();
        schedulePeriodicInspection();
      }, 1250);
      state.timers.add(state.inspectionTimer);
    }

    function inspect() {
      if (state.cleanedUp || state.done) return;
      state.inspectCount += 1;
      observeShadowRoots();

      inspectEditor();
      if (state.cleanedUp || state.done) return;

      acquireResponseContainer();
      inspectControls();
      if (state.cleanedUp || state.done) return;

      inspectErrors();
      if (state.cleanedUp || state.done) return;

      inspectResult();
    }

    function scheduleInspect() {
      if (state.cleanedUp || state.done || state.inspectionScheduled) return;
      state.inspectionScheduled = true;
      queueMicrotaskFn(() => {
        state.inspectionScheduled = false;
        if (state.cleanedUp || state.done) return;
        inspect();
      });
    }

    function start() {
      if (state.cleanedUp || state.ready) return api;
      const observeRoot = root.body || root.documentElement || root;
      state.observer = new MutationObserverImpl(scheduleInspect);
      state.observer.observe(observeRoot, observationOptions);
      observeShadowRoots();
      state.ready = true;
      registryOwner.__mtGeminiObservers[jobId] = api;
      emitState('ready', { initialResponseCount: state.initialResponseCount });
      inspect();
      schedulePeriodicInspection();
      return api;
    }

    function waitForSubmission(timeoutMs = 5000) {
      if (state.submissionConfirmed) {
        return Promise.resolve({
          confirmed: true,
          reason: state.submissionReason,
        });
      }
      if (state.error) {
        return Promise.reject(createError('GEMINI_UI_ERROR', state.error));
      }
      if (state.cleanedUp || state.done) {
        return Promise.reject(createError('OBSERVER_STOPPED', 'Observer já finalizado'));
      }

      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: null };
        waiter.timer = setTimeoutFn(() => {
          submissionWaiters.delete(waiter);
          state.timers.delete(waiter.timer);
          reject(createError('GEMINI_SUBMISSION_NOT_CONFIRMED', 'Envio não foi confirmado pela UI'));
        }, timeoutMs);
        state.timers.add(waiter.timer);
        submissionWaiters.add(waiter);
      });
    }

    function waitForResult(timeoutMs = 4 * 60 * 1000) {
      if (state.resultUrl) {
        return Promise.resolve({
          image: state.resultImage,
          url: state.resultUrl,
        });
      }
      if (state.error) {
        return Promise.reject(createError('GEMINI_UI_ERROR', state.error));
      }
      if (state.cleanedUp || state.done) {
        return Promise.reject(createError('OBSERVER_STOPPED', 'Observer já finalizado'));
      }

      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: null };
        waiter.timer = setTimeoutFn(() => {
          resultWaiters.delete(waiter);
          state.timers.delete(waiter.timer);
          reject(createError('GEMINI_RESULT_TIMEOUT', 'Tempo limite aguardando resultado do Gemini'));
        }, timeoutMs);
        state.timers.add(waiter.timer);
        resultWaiters.add(waiter);
      });
    }

    function stop() {
      if (state.cleanedUp) return false;
      state.cleanedUp = true;
      state.done = true;

      if (state.observer) {
        try { state.observer.disconnect(); } catch (_e) {}
        state.observer = null;
      }
      if (state.responseObserver) {
        try { state.responseObserver.disconnect(); } catch (_e) {}
        state.responseObserver = null;
      }

      for (const target of imageEventRoots) {
        target.removeEventListener?.('load', scheduleInspect, true);
        target.removeEventListener?.('error', scheduleInspect, true);
      }
      imageEventRoots.clear();
      state.shadowRoots.clear();
      for (const timer of Array.from(state.timers)) removeTimer(timer);
      const stopped = createError('OBSERVER_STOPPED', 'Observer interrompido');
      settleWaiters(submissionWaiters, 'reject', stopped);
      settleWaiters(resultWaiters, 'reject', stopped);

      if (registryOwner.__mtGeminiObservers?.[jobId] === api) {
        delete registryOwner.__mtGeminiObservers[jobId];
      }
      emitState('cleanup');
      return true;
    }

    function getState() {
      return state;
    }

    function acceptResult(image, url) {
      return setResult(image || null, url);
    }

    const api = {
      start,
      stop,
      inspect,
      scheduleInspect,
      waitForSubmission,
      waitForResult,
      acceptResult,
      getState,
    };

    return api;
  }

  const api = { createGeminiObserver };
  scope.MangaTranslatorGeminiObserver = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
```

## 12. Rastreabilidade 588/588

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | <code>'use strict';</code> | Ativa semântica estrita para este script. |
| 002 | U01 | <code>// gemini/observer.js — Observer orientado a eventos por job Gemini.</code> | Comentário de projeto que explicita a intenção de Cabeçalho, strict mode e escopo IIFE: gemini/observer.js — Observer orientado a eventos por job Gemini. |
| 003 | U01 | <code>//</code> | Comentário de projeto que explicita a intenção de Cabeçalho, strict mode e escopo IIFE:  |
| 004 | U01 | <code>// Este módulo não envia mensagens nem clica na UI. Ele observa transições</code> | Comentário de projeto que explicita a intenção de Cabeçalho, strict mode e escopo IIFE: Este módulo não envia mensagens nem clica na UI. Ele observa transições |
| 005 | U01 | <code>// verificáveis e expõe Promises para confirmação de submit e resultado.</code> | Comentário de projeto que explicita a intenção de Cabeçalho, strict mode e escopo IIFE: verificáveis e expõe Promises para confirmação de submit e resultado. |
| 006 | U01 | ␠ [linha vazia] | Separação visual dentro de U01 (Cabeçalho, strict mode e escopo IIFE), mantendo legibilidade sem alterar execução. |
| 007 | U01 | <code>(function(scope) {</code> | Abre a IIFE e recebe o escopo global usado para injeção/exportação. |
| 008 | U02 | <code>  let selectorsApi = scope.MangaTranslatorGeminiSelectors &#124;&#124; null;</code> | Declara `selectorsApi` para sustentar Aquisição de dependências e fail-fast seletivo; a expressão completa é `let selectorsApi = scope.MangaTranslatorGeminiSelectors &#124;&#124; null;`. |
| 009 | U02 | <code>  let domApi = scope.MangaTranslatorGeminiDom &#124;&#124; null;</code> | Declara `domApi` para sustentar Aquisição de dependências e fail-fast seletivo; a expressão completa é `let domApi = scope.MangaTranslatorGeminiDom &#124;&#124; null;`. |
| 010 | U02 | <code>  let quarantineApi = scope.MangaTranslatorGeminiImageQuarantine &#124;&#124; null;</code> | Declara `quarantineApi` para sustentar Aquisição de dependências e fail-fast seletivo; a expressão completa é `let quarantineApi = scope.MangaTranslatorGeminiImageQuarantine &#124;&#124; null;`. |
| 011 | U02 | ␠ [linha vazia] | Separação visual dentro de U02 (Aquisição de dependências e fail-fast seletivo), mantendo legibilidade sem alterar execução. |
| 012 | U02 | <code>  if (typeof require === 'function') {</code> | Abre uma guarda decisória de Aquisição de dependências e fail-fast seletivo; a condição exata é `if (typeof require === 'function')`. |
| 013 | U02 | <code>    if (!selectorsApi) {</code> | Abre uma guarda decisória de Aquisição de dependências e fail-fast seletivo; a condição exata é `if (!selectorsApi)`. |
| 014 | U02 | <code>      try { selectorsApi = require('./selectors.js'); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Aquisição de dependências e fail-fast seletivo pode falhar por DOM/API externa ao módulo. |
| 015 | U02 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U02, preservando o escopo de Aquisição de dependências e fail-fast seletivo. |
| 016 | U02 | <code>    if (!domApi) {</code> | Abre uma guarda decisória de Aquisição de dependências e fail-fast seletivo; a condição exata é `if (!domApi)`. |
| 017 | U02 | <code>      try { domApi = require('./dom.js'); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Aquisição de dependências e fail-fast seletivo pode falhar por DOM/API externa ao módulo. |
| 018 | U02 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U02, preservando o escopo de Aquisição de dependências e fail-fast seletivo. |
| 019 | U02 | <code>    if (!quarantineApi) {</code> | Abre uma guarda decisória de Aquisição de dependências e fail-fast seletivo; a condição exata é `if (!quarantineApi)`. |
| 020 | U02 | <code>      try { quarantineApi = require('./image-quarantine.js'); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Aquisição de dependências e fail-fast seletivo pode falhar por DOM/API externa ao módulo. |
| 021 | U02 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U02, preservando o escopo de Aquisição de dependências e fail-fast seletivo. |
| 022 | U02 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U02, preservando o escopo de Aquisição de dependências e fail-fast seletivo. |
| 023 | U02 | ␠ [linha vazia] | Separação visual dentro de U02 (Aquisição de dependências e fail-fast seletivo), mantendo legibilidade sem alterar execução. |
| 024 | U02 | <code>  if (!selectorsApi &#124;&#124; !selectorsApi.SELECTORS) {</code> | Abre uma guarda decisória de Aquisição de dependências e fail-fast seletivo; a condição exata é `if (!selectorsApi &#124;&#124; !selectorsApi.SELECTORS)`. |
| 025 | U02 | <code>    throw new Error('MangaTranslatorGeminiSelectors indisponível');</code> | Participa diretamente de Aquisição de dependências e fail-fast seletivo; esta linha executa/configura `throw new Error('MangaTranslatorGeminiSelectors indisponível');` no ponto exato da sequência descrita pela unidade U02. |
| 026 | U02 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U02, preservando o escopo de Aquisição de dependências e fail-fast seletivo. |
| 027 | U02 | <code>  if (!domApi) {</code> | Abre uma guarda decisória de Aquisição de dependências e fail-fast seletivo; a condição exata é `if (!domApi)`. |
| 028 | U02 | <code>    throw new Error('MangaTranslatorGeminiDom indisponível');</code> | Participa diretamente de Aquisição de dependências e fail-fast seletivo; esta linha executa/configura `throw new Error('MangaTranslatorGeminiDom indisponível');` no ponto exato da sequência descrita pela unidade U02. |
| 029 | U02 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U02, preservando o escopo de Aquisição de dependências e fail-fast seletivo. |
| 030 | U03 | ␠ [linha vazia] | Separação visual dentro de U03 (Alias de seletores e erros tipados), mantendo legibilidade sem alterar execução. |
| 031 | U03 | <code>  const { SELECTORS } = selectorsApi;</code> | Declara `{ SELECTORS }` para sustentar Alias de seletores e erros tipados; a expressão completa é `const { SELECTORS } = selectorsApi;`. |
| 032 | U03 | ␠ [linha vazia] | Separação visual dentro de U03 (Alias de seletores e erros tipados), mantendo legibilidade sem alterar execução. |
| 033 | U03 | <code>  function createError(code, message) {</code> | Abre a função `createError` responsável por alias de seletores e erros tipados. |
| 034 | U03 | <code>    const error = new Error(message &#124;&#124; code);</code> | Declara `error` para sustentar Alias de seletores e erros tipados; a expressão completa é `const error = new Error(message &#124;&#124; code);`. |
| 035 | U03 | <code>    error.code = code;</code> | Atualiza estado usado por Alias de seletores e erros tipados: `error.code = code;`. |
| 036 | U03 | <code>    return error;</code> | Retorna o valor/estado `error;` como saída desta decisão de Alias de seletores e erros tipados. |
| 037 | U03 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U03, preservando o escopo de Alias de seletores e erros tipados. |
| 038 | U04 | ␠ [linha vazia] | Separação visual dentro de U04 (Consulta profunda segura), mantendo legibilidade sem alterar execução. |
| 039 | U04 | <code>  function safeQueryAll(root, selector) {</code> | Abre a função `safeQueryAll` responsável por consulta profunda segura. |
| 040 | U04 | <code>    if (!root &#124;&#124; !selector) return [];</code> | Abre uma guarda decisória de Consulta profunda segura; a condição exata é `if (!root &#124;&#124; !selector) return [];`. |
| 041 | U04 | <code>    return domApi.findAllDeep(root.body &#124;&#124; root.documentElement &#124;&#124; root, element =&gt;</code> | Retorna o valor/estado `domApi.findAllDeep(root.body &#124;&#124; root.documentElement &#124;&#124; root, element =>` como saída desta decisão de Consulta profunda segura. |
| 042 | U04 | <code>      element.nodeType === 1 &amp;&amp; element.matches?.(selector)</code> | Atualiza estado usado por Consulta profunda segura: `element.nodeType === 1 && element.matches?.(selector)`. |
| 043 | U04 | <code>    );</code> | Fecha a estrutura iniciada nesta unidade U04, preservando o escopo de Consulta profunda segura. |
| 044 | U04 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U04, preservando o escopo de Consulta profunda segura. |
| 045 | U05 | ␠ [linha vazia] | Separação visual dentro de U05 (Reconhecimento restrito de URL de asset gerado), mantendo legibilidade sem alterar execução. |
| 046 | U05 | <code>  function isGeneratedGeminiUrl(src) {</code> | Abre a função `isGeneratedGeminiUrl` responsável por reconhecimento restrito de url de asset gerado. |
| 047 | U05 | <code>    try {</code> | Inicia região protegida porque esta etapa de Reconhecimento restrito de URL de asset gerado pode falhar por DOM/API externa ao módulo. |
| 048 | U05 | <code>      const url = new URL(src);</code> | Declara `url` para sustentar Reconhecimento restrito de URL de asset gerado; a expressão completa é `const url = new URL(src);`. |
| 049 | U05 | <code>      return url.protocol === 'https:' &amp;&amp;</code> | Retorna o valor/estado `url.protocol === 'https:' &&` como saída desta decisão de Reconhecimento restrito de URL de asset gerado. |
| 050 | U05 | <code>        (url.hostname === 'googleusercontent.com' &#124;&#124; url.hostname.endsWith('.googleusercontent.com')) &amp;&amp;</code> | Participa diretamente de Reconhecimento restrito de URL de asset gerado; esta linha executa/configura `(url.hostname === 'googleusercontent.com' &#124;&#124; url.hostname.endsWith('.googleusercontent.com')) &&` no ponto exato da sequência descrita pela unidade U05. |
| 051 | U05 | <code>        /\/(?:rd-)?gg-dl\//.test(url.pathname);</code> | Participa diretamente de Reconhecimento restrito de URL de asset gerado; esta linha executa/configura `/\/(?:rd-)?gg-dl\//.test(url.pathname);` no ponto exato da sequência descrita pela unidade U05. |
| 052 | U05 | <code>    } catch (_e) { return false; }</code> | Captura falha da etapa anterior de Reconhecimento restrito de URL de asset gerado; o módulo deliberadamente mantém operação best-effort quando indicado pelo código. |
| 053 | U05 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U05, preservando o escopo de Reconhecimento restrito de URL de asset gerado. |
| 054 | U06 | ␠ [linha vazia] | Separação visual dentro de U06 (Contrato de criação, injeções e pré-condições), mantendo legibilidade sem alterar execução. |
| 055 | U06 | <code>  function createGeminiObserver({</code> | Abre a função `createGeminiObserver` responsável por contrato de criação, injeções e pré-condições. |
| 056 | U06 | <code>    jobId,</code> | Participa diretamente de Contrato de criação, injeções e pré-condições; esta linha executa/configura `jobId,` no ponto exato da sequência descrita pela unidade U06. |
| 057 | U06 | <code>    root = typeof document !== 'undefined' ? document : null,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `root = typeof document !== 'undefined' ? document : null,`. |
| 058 | U06 | <code>    editor = null,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `editor = null,`. |
| 059 | U06 | <code>    getEditor = null,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `getEditor = null,`. |
| 060 | U06 | <code>    ignoreImages = new Set(),</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `ignoreImages = new Set(),`. |
| 061 | U06 | <code>    imageQuarantine = null,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `imageQuarantine = null,`. |
| 062 | U06 | <code>    onStateChange = null,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `onStateChange = null,`. |
| 063 | U06 | <code>    MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null,`. |
| 064 | U06 | <code>    setTimeoutFn = setTimeout,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `setTimeoutFn = setTimeout,`. |
| 065 | U06 | <code>    clearTimeoutFn = clearTimeout,</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `clearTimeoutFn = clearTimeout,`. |
| 066 | U06 | <code>    queueMicrotaskFn = typeof queueMicrotask === 'function'</code> | Atualiza estado usado por Contrato de criação, injeções e pré-condições: `queueMicrotaskFn = typeof queueMicrotask === 'function'`. |
| 067 | U06 | <code>      ? queueMicrotask</code> | Participa diretamente de Contrato de criação, injeções e pré-condições; esta linha executa/configura `? queueMicrotask` no ponto exato da sequência descrita pela unidade U06. |
| 068 | U06 | <code>      : callback =&gt; Promise.resolve().then(callback),</code> | Participa diretamente de Contrato de criação, injeções e pré-condições; esta linha executa/configura `: callback => Promise.resolve().then(callback),` no ponto exato da sequência descrita pela unidade U06. |
| 069 | U06 | <code>  } = {}) {</code> | Participa diretamente de Contrato de criação, injeções e pré-condições; esta linha executa/configura `} = {}) {` no ponto exato da sequência descrita pela unidade U06. |
| 070 | U06 | <code>    if (!jobId) throw new Error('jobId é obrigatório');</code> | Abre uma guarda decisória de Contrato de criação, injeções e pré-condições; a condição exata é `if (!jobId) throw new Error('jobId é obrigatório');`. |
| 071 | U06 | <code>    if (!root) throw new Error('root é obrigatório');</code> | Abre uma guarda decisória de Contrato de criação, injeções e pré-condições; a condição exata é `if (!root) throw new Error('root é obrigatório');`. |
| 072 | U06 | <code>    if (!MutationObserverImpl) throw new Error('MutationObserver indisponível');</code> | Abre uma guarda decisória de Contrato de criação, injeções e pré-condições; a condição exata é `if (!MutationObserverImpl) throw new Error('MutationObserver indisponível');`. |
| 073 | U06 | ␠ [linha vazia] | Separação visual dentro de U06 (Contrato de criação, injeções e pré-condições), mantendo legibilidade sem alterar execução. |
| 074 | U07 | <code>    const quarantine = imageQuarantine &#124;&#124; quarantineApi?.createImageQuarantine?.({ dom: domApi });</code> | Declara `quarantine` para sustentar Quarentena e exclusividade por job; a expressão completa é `const quarantine = imageQuarantine &#124;&#124; quarantineApi?.createImageQuarantine?.({ dom: domApi });`. |
| 075 | U07 | ␠ [linha vazia] | Separação visual dentro de U07 (Quarentena e exclusividade por job), mantendo legibilidade sem alterar execução. |
| 076 | U07 | <code>    const registryOwner = root.defaultView &#124;&#124; root.ownerDocument?.defaultView &#124;&#124; scope;</code> | Declara `registryOwner` para sustentar Quarentena e exclusividade por job; a expressão completa é `const registryOwner = root.defaultView &#124;&#124; root.ownerDocument?.defaultView &#124;&#124; scope;`. |
| 077 | U07 | <code>    registryOwner.__mtGeminiObservers = registryOwner.__mtGeminiObservers &#124;&#124; {};</code> | Atualiza estado usado por Quarentena e exclusividade por job: `registryOwner.__mtGeminiObservers = registryOwner.__mtGeminiObservers &#124;&#124; {};`. |
| 078 | U07 | ␠ [linha vazia] | Separação visual dentro de U07 (Quarentena e exclusividade por job), mantendo legibilidade sem alterar execução. |
| 079 | U07 | <code>    const existing = registryOwner.__mtGeminiObservers[jobId];</code> | Declara `existing` para sustentar Quarentena e exclusividade por job; a expressão completa é `const existing = registryOwner.__mtGeminiObservers[jobId];`. |
| 080 | U07 | <code>    if (existing &amp;&amp; typeof existing.stop === 'function') {</code> | Abre uma guarda decisória de Quarentena e exclusividade por job; a condição exata é `if (existing && typeof existing.stop === 'function')`. |
| 081 | U07 | <code>      try { existing.stop(); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Quarentena e exclusividade por job pode falhar por DOM/API externa ao módulo. |
| 082 | U07 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U07, preservando o escopo de Quarentena e exclusividade por job. |
| 083 | U08 | ␠ [linha vazia] | Separação visual dentro de U08 (Baseline de respostas, imagens e erros), mantendo legibilidade sem alterar execução. |
| 084 | U08 | <code>    const initialResponses = new Set(safeQueryAll(root, SELECTORS.MODEL_RESPONSE_STRICT));</code> | Declara `initialResponses` para sustentar Baseline de respostas, imagens e erros; a expressão completa é `const initialResponses = new Set(safeQueryAll(root, SELECTORS.MODEL_RESPONSE_STRICT));`. |
| 085 | U08 | <code>    const initialImageSources = new Set();</code> | Declara `initialImageSources` para sustentar Baseline de respostas, imagens e erros; a expressão completa é `const initialImageSources = new Set();`. |
| 086 | U08 | <code>    safeQueryAll(root, 'img').forEach(img =&gt; {</code> | Participa diretamente de Baseline de respostas, imagens e erros; esta linha executa/configura `safeQueryAll(root, 'img').forEach(img => {` no ponto exato da sequência descrita pela unidade U08. |
| 087 | U08 | <code>      const src = domApi.getImageSource(img);</code> | Declara `src` para sustentar Baseline de respostas, imagens e erros; a expressão completa é `const src = domApi.getImageSource(img);`. |
| 088 | U08 | <code>      if (src) initialImageSources.add(src);</code> | Abre uma guarda decisória de Baseline de respostas, imagens e erros; a condição exata é `if (src) initialImageSources.add(src);`. |
| 089 | U08 | <code>    });</code> | Participa diretamente de Baseline de respostas, imagens e erros; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U08. |
| 090 | U08 | <code>    for (const src of ignoreImages &#124;&#124; []) {</code> | Itera a coleção necessária a Baseline de respostas, imagens e erros; o cabeçalho do laço é `for (const src of ignoreImages &#124;&#124; []) {`. |
| 091 | U08 | <code>      if (src) initialImageSources.add(src);</code> | Abre uma guarda decisória de Baseline de respostas, imagens e erros; a condição exata é `if (src) initialImageSources.add(src);`. |
| 092 | U08 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U08, preservando o escopo de Baseline de respostas, imagens e erros. |
| 093 | U08 | ␠ [linha vazia] | Separação visual dentro de U08 (Baseline de respostas, imagens e erros), mantendo legibilidade sem alterar execução. |
| 094 | U08 | <code>    const initialErrors = new Set();</code> | Declara `initialErrors` para sustentar Baseline de respostas, imagens e erros; a expressão completa é `const initialErrors = new Set();`. |
| 095 | U08 | <code>    safeQueryAll(root, SELECTORS.ERROR).forEach(element =&gt; {</code> | Participa diretamente de Baseline de respostas, imagens e erros; esta linha executa/configura `safeQueryAll(root, SELECTORS.ERROR).forEach(element => {` no ponto exato da sequência descrita pela unidade U08. |
| 096 | U08 | <code>      if (!domApi.isElementVisible(element)) return;</code> | Abre uma guarda decisória de Baseline de respostas, imagens e erros; a condição exata é `if (!domApi.isElementVisible(element)) return;`. |
| 097 | U08 | <code>      const text = String(element.innerText &#124;&#124; element.textContent &#124;&#124; '').trim();</code> | Declara `text` para sustentar Baseline de respostas, imagens e erros; a expressão completa é `const text = String(element.innerText &#124;&#124; element.textContent &#124;&#124; '').trim();`. |
| 098 | U08 | <code>      if (text) initialErrors.add(text);</code> | Abre uma guarda decisória de Baseline de respostas, imagens e erros; a condição exata é `if (text) initialErrors.add(text);`. |
| 099 | U08 | <code>    });</code> | Participa diretamente de Baseline de respostas, imagens e erros; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U08. |
| 100 | U09 | ␠ [linha vazia] | Separação visual dentro de U09 (Baseline do editor e botão Send), mantendo legibilidade sem alterar execução. |
| 101 | U09 | <code>    const initialEditor = typeof getEditor === 'function' ? getEditor() : editor;</code> | Declara `initialEditor` para sustentar Baseline do editor e botão Send; a expressão completa é `const initialEditor = typeof getEditor === 'function' ? getEditor() : editor;`. |
| 102 | U09 | <code>    const initialEditorText = String(initialEditor?.textContent &#124;&#124; '').trim();</code> | Declara `initialEditorText` para sustentar Baseline do editor e botão Send; a expressão completa é `const initialEditorText = String(initialEditor?.textContent &#124;&#124; '').trim();`. |
| 103 | U09 | <code>    const initialSendControls = safeQueryAll(root, SELECTORS.SEND)</code> | Declara `initialSendControls` para sustentar Baseline do editor e botão Send; a expressão completa é `const initialSendControls = safeQueryAll(root, SELECTORS.SEND)`. |
| 104 | U09 | <code>      .filter(domApi.isElementVisible);</code> | Participa diretamente de Baseline do editor e botão Send; esta linha executa/configura `.filter(domApi.isElementVisible);` no ponto exato da sequência descrita pela unidade U09. |
| 105 | U09 | <code>    const initialSendEnabled = initialSendControls.some(domApi.isControlEnabled);</code> | Declara `initialSendEnabled` para sustentar Baseline do editor e botão Send; a expressão completa é `const initialSendEnabled = initialSendControls.some(domApi.isControlEnabled);`. |
| 106 | U10 | ␠ [linha vazia] | Separação visual dentro de U10 (Estado observável e conjuntos de waiters), mantendo legibilidade sem alterar execução. |
| 107 | U10 | <code>    const state = {</code> | Declara `state` para sustentar Estado observável e conjuntos de waiters; a expressão completa é `const state = {`. |
| 108 | U10 | <code>      jobId,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `jobId,` no ponto exato da sequência descrita pela unidade U10. |
| 109 | U10 | <code>      initialResponseCount: initialResponses.size,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `initialResponseCount: initialResponses.size,` no ponto exato da sequência descrita pela unidade U10. |
| 110 | U10 | <code>      initialImageSources,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `initialImageSources,` no ponto exato da sequência descrita pela unidade U10. |
| 111 | U10 | <code>      responseContainer: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `responseContainer: null,` no ponto exato da sequência descrita pela unidade U10. |
| 112 | U10 | <code>      ready: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `ready: false,` no ponto exato da sequência descrita pela unidade U10. |
| 113 | U10 | <code>      submissionConfirmed: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `submissionConfirmed: false,` no ponto exato da sequência descrita pela unidade U10. |
| 114 | U10 | <code>      submissionReason: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `submissionReason: null,` no ponto exato da sequência descrita pela unidade U10. |
| 115 | U10 | <code>      generationActiveObserved: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `generationActiveObserved: false,` no ponto exato da sequência descrita pela unidade U10. |
| 116 | U10 | <code>      generationStarted: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `generationStarted: false,` no ponto exato da sequência descrita pela unidade U10. |
| 117 | U10 | <code>      generationFinished: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `generationFinished: false,` no ponto exato da sequência descrita pela unidade U10. |
| 118 | U10 | <code>      sendEnabledObserved: initialSendEnabled,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `sendEnabledObserved: initialSendEnabled,` no ponto exato da sequência descrita pela unidade U10. |
| 119 | U10 | <code>      resultImage: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `resultImage: null,` no ponto exato da sequência descrita pela unidade U10. |
| 120 | U10 | <code>      resultUrl: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `resultUrl: null,` no ponto exato da sequência descrita pela unidade U10. |
| 121 | U10 | <code>      error: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `error: null,` no ponto exato da sequência descrita pela unidade U10. |
| 122 | U10 | <code>      done: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `done: false,` no ponto exato da sequência descrita pela unidade U10. |
| 123 | U10 | <code>      cleanedUp: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `cleanedUp: false,` no ponto exato da sequência descrita pela unidade U10. |
| 124 | U10 | <code>      observer: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `observer: null,` no ponto exato da sequência descrita pela unidade U10. |
| 125 | U10 | <code>      responseObserver: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `responseObserver: null,` no ponto exato da sequência descrita pela unidade U10. |
| 126 | U10 | <code>      shadowRoots: new Set(),</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `shadowRoots: new Set(),` no ponto exato da sequência descrita pela unidade U10. |
| 127 | U10 | <code>      inspectionTimer: null,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `inspectionTimer: null,` no ponto exato da sequência descrita pela unidade U10. |
| 128 | U10 | <code>      timers: new Set(),</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `timers: new Set(),` no ponto exato da sequência descrita pela unidade U10. |
| 129 | U10 | <code>      inspectionScheduled: false,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `inspectionScheduled: false,` no ponto exato da sequência descrita pela unidade U10. |
| 130 | U10 | <code>      inspectCount: 0,</code> | Participa diretamente de Estado observável e conjuntos de waiters; esta linha executa/configura `inspectCount: 0,` no ponto exato da sequência descrita pela unidade U10. |
| 131 | U10 | <code>    };</code> | Fecha a estrutura iniciada nesta unidade U10, preservando o escopo de Estado observável e conjuntos de waiters. |
| 132 | U10 | ␠ [linha vazia] | Separação visual dentro de U10 (Estado observável e conjuntos de waiters), mantendo legibilidade sem alterar execução. |
| 133 | U10 | <code>    const submissionWaiters = new Set();</code> | Declara `submissionWaiters` para sustentar Estado observável e conjuntos de waiters; a expressão completa é `const submissionWaiters = new Set();`. |
| 134 | U10 | <code>    const resultWaiters = new Set();</code> | Declara `resultWaiters` para sustentar Estado observável e conjuntos de waiters; a expressão completa é `const resultWaiters = new Set();`. |
| 135 | U11 | ␠ [linha vazia] | Separação visual dentro de U11 (Emissão de estado tolerante a falhas), mantendo legibilidade sem alterar execução. |
| 136 | U11 | <code>    function emitState(type, extra = {}) {</code> | Abre a função `emitState` responsável por emissão de estado tolerante a falhas. |
| 137 | U11 | <code>      if (typeof onStateChange !== 'function') return;</code> | Abre uma guarda decisória de Emissão de estado tolerante a falhas; a condição exata é `if (typeof onStateChange !== 'function') return;`. |
| 138 | U11 | <code>      try {</code> | Inicia região protegida porque esta etapa de Emissão de estado tolerante a falhas pode falhar por DOM/API externa ao módulo. |
| 139 | U11 | <code>        onStateChange(type, {</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `onStateChange(type, {` no ponto exato da sequência descrita pela unidade U11. |
| 140 | U11 | <code>          jobId,</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `jobId,` no ponto exato da sequência descrita pela unidade U11. |
| 141 | U11 | <code>          ...extra,</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `...extra,` no ponto exato da sequência descrita pela unidade U11. |
| 142 | U11 | <code>          submissionConfirmed: state.submissionConfirmed,</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `submissionConfirmed: state.submissionConfirmed,` no ponto exato da sequência descrita pela unidade U11. |
| 143 | U11 | <code>          generationActiveObserved: state.generationActiveObserved,</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `generationActiveObserved: state.generationActiveObserved,` no ponto exato da sequência descrita pela unidade U11. |
| 144 | U11 | <code>          responseContainer: state.responseContainer,</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `responseContainer: state.responseContainer,` no ponto exato da sequência descrita pela unidade U11. |
| 145 | U11 | <code>          resultUrl: state.resultUrl,</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `resultUrl: state.resultUrl,` no ponto exato da sequência descrita pela unidade U11. |
| 146 | U11 | <code>          error: state.error,</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `error: state.error,` no ponto exato da sequência descrita pela unidade U11. |
| 147 | U11 | <code>        });</code> | Participa diretamente de Emissão de estado tolerante a falhas; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U11. |
| 148 | U11 | <code>      } catch (_e) {}</code> | Captura falha da etapa anterior de Emissão de estado tolerante a falhas; o módulo deliberadamente mantém operação best-effort quando indicado pelo código. |
| 149 | U11 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U11, preservando o escopo de Emissão de estado tolerante a falhas. |
| 150 | U12 | ␠ [linha vazia] | Separação visual dentro de U12 (Remoção idempotente de timer), mantendo legibilidade sem alterar execução. |
| 151 | U12 | <code>    function removeTimer(timer) {</code> | Abre a função `removeTimer` responsável por remoção idempotente de timer. |
| 152 | U12 | <code>      if (timer === null &#124;&#124; timer === undefined) return;</code> | Abre uma guarda decisória de Remoção idempotente de timer; a condição exata é `if (timer === null &#124;&#124; timer === undefined) return;`. |
| 153 | U12 | <code>      state.timers.delete(timer);</code> | Atualiza estado usado por Remoção idempotente de timer: `state.timers.delete(timer);`. |
| 154 | U12 | <code>      try { clearTimeoutFn(timer); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Remoção idempotente de timer pode falhar por DOM/API externa ao módulo. |
| 155 | U12 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U12, preservando o escopo de Remoção idempotente de timer. |
| 156 | U13 | ␠ [linha vazia] | Separação visual dentro de U13 (Liquidação coletiva de waiters), mantendo legibilidade sem alterar execução. |
| 157 | U13 | <code>    function settleWaiters(waiters, mode, payload) {</code> | Abre a função `settleWaiters` responsável por liquidação coletiva de waiters. |
| 158 | U13 | <code>      for (const waiter of Array.from(waiters)) {</code> | Itera a coleção necessária a Liquidação coletiva de waiters; o cabeçalho do laço é `for (const waiter of Array.from(waiters)) {`. |
| 159 | U13 | <code>        waiters.delete(waiter);</code> | Participa diretamente de Liquidação coletiva de waiters; esta linha executa/configura `waiters.delete(waiter);` no ponto exato da sequência descrita pela unidade U13. |
| 160 | U13 | <code>        removeTimer(waiter.timer);</code> | Participa diretamente de Liquidação coletiva de waiters; esta linha executa/configura `removeTimer(waiter.timer);` no ponto exato da sequência descrita pela unidade U13. |
| 161 | U13 | <code>        try {</code> | Inicia região protegida porque esta etapa de Liquidação coletiva de waiters pode falhar por DOM/API externa ao módulo. |
| 162 | U13 | <code>          if (mode === 'resolve') waiter.resolve(payload);</code> | Abre uma guarda decisória de Liquidação coletiva de waiters; a condição exata é `if (mode === 'resolve') waiter.resolve(payload);`. |
| 163 | U13 | <code>          else waiter.reject(payload);</code> | Participa diretamente de Liquidação coletiva de waiters; esta linha executa/configura `else waiter.reject(payload);` no ponto exato da sequência descrita pela unidade U13. |
| 164 | U13 | <code>        } catch (_e) {}</code> | Captura falha da etapa anterior de Liquidação coletiva de waiters; o módulo deliberadamente mantém operação best-effort quando indicado pelo código. |
| 165 | U13 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U13, preservando o escopo de Liquidação coletiva de waiters. |
| 166 | U13 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U13, preservando o escopo de Liquidação coletiva de waiters. |
| 167 | U14 | ␠ [linha vazia] | Separação visual dentro de U14 (Confirmação monotônica de submission), mantendo legibilidade sem alterar execução. |
| 168 | U14 | <code>    function confirmSubmission(reason) {</code> | Abre a função `confirmSubmission` responsável por confirmação monotônica de submission. |
| 169 | U14 | <code>      if (state.cleanedUp &#124;&#124; state.done &#124;&#124; state.submissionConfirmed) return false;</code> | Abre uma guarda decisória de Confirmação monotônica de submission; a condição exata é `if (state.cleanedUp &#124;&#124; state.done &#124;&#124; state.submissionConfirmed) return false;`. |
| 170 | U14 | <code>      state.submissionConfirmed = true;</code> | Atualiza estado usado por Confirmação monotônica de submission: `state.submissionConfirmed = true;`. |
| 171 | U14 | <code>      state.submissionReason = reason;</code> | Atualiza estado usado por Confirmação monotônica de submission: `state.submissionReason = reason;`. |
| 172 | U14 | <code>      emitState('submission_confirmed', { reason });</code> | Participa diretamente de Confirmação monotônica de submission; esta linha executa/configura `emitState('submission_confirmed', { reason });` no ponto exato da sequência descrita pela unidade U14. |
| 173 | U14 | <code>      settleWaiters(submissionWaiters, 'resolve', {</code> | Participa diretamente de Confirmação monotônica de submission; esta linha executa/configura `settleWaiters(submissionWaiters, 'resolve', {` no ponto exato da sequência descrita pela unidade U14. |
| 174 | U14 | <code>        confirmed: true,</code> | Participa diretamente de Confirmação monotônica de submission; esta linha executa/configura `confirmed: true,` no ponto exato da sequência descrita pela unidade U14. |
| 175 | U14 | <code>        reason,</code> | Participa diretamente de Confirmação monotônica de submission; esta linha executa/configura `reason,` no ponto exato da sequência descrita pela unidade U14. |
| 176 | U14 | <code>      });</code> | Participa diretamente de Confirmação monotônica de submission; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U14. |
| 177 | U14 | <code>      return true;</code> | Retorna o valor/estado `true;` como saída desta decisão de Confirmação monotônica de submission. |
| 178 | U14 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U14, preservando o escopo de Confirmação monotônica de submission. |
| 179 | U15 | ␠ [linha vazia] | Separação visual dentro de U15 (Marca de geração ativa), mantendo legibilidade sem alterar execução. |
| 180 | U15 | <code>    function markGenerationActive(reason) {</code> | Abre a função `markGenerationActive` responsável por marca de geração ativa. |
| 181 | U15 | <code>      if (state.cleanedUp &#124;&#124; state.done) return;</code> | Abre uma guarda decisória de Marca de geração ativa; a condição exata é `if (state.cleanedUp &#124;&#124; state.done) return;`. |
| 182 | U15 | <code>      const wasObserved = state.generationActiveObserved;</code> | Declara `wasObserved` para sustentar Marca de geração ativa; a expressão completa é `const wasObserved = state.generationActiveObserved;`. |
| 183 | U15 | <code>      state.generationActiveObserved = true;</code> | Atualiza estado usado por Marca de geração ativa: `state.generationActiveObserved = true;`. |
| 184 | U15 | <code>      state.generationStarted = true;</code> | Atualiza estado usado por Marca de geração ativa: `state.generationStarted = true;`. |
| 185 | U15 | <code>      if (!wasObserved) emitState('generation_started', { reason });</code> | Abre uma guarda decisória de Marca de geração ativa; a condição exata é `if (!wasObserved) emitState('generation_started',  reason });`. |
| 186 | U15 | <code>      if (!state.submissionConfirmed) confirmSubmission(reason === 'stop_visible' ? 'stop_visible' : 'generation_started');</code> | Abre uma guarda decisória de Marca de geração ativa; a condição exata é `if (!state.submissionConfirmed) confirmSubmission(reason === 'stop_visible' ? 'stop_visible' : 'generation_started');`. |
| 187 | U15 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U15, preservando o escopo de Marca de geração ativa. |
| 188 | U16 | ␠ [linha vazia] | Separação visual dentro de U16 (Falha terminal por erro visível da UI), mantendo legibilidade sem alterar execução. |
| 189 | U16 | <code>    function fail(errorText) {</code> | Abre a função `fail` responsável por falha terminal por erro visível da ui. |
| 190 | U16 | <code>      if (state.cleanedUp &#124;&#124; state.done &#124;&#124; state.error) return;</code> | Abre uma guarda decisória de Falha terminal por erro visível da UI; a condição exata é `if (state.cleanedUp &#124;&#124; state.done &#124;&#124; state.error) return;`. |
| 191 | U16 | <code>      state.error = String(errorText &#124;&#124; 'Erro desconhecido do Gemini');</code> | Atualiza estado usado por Falha terminal por erro visível da UI: `state.error = String(errorText &#124;&#124; 'Erro desconhecido do Gemini');`. |
| 192 | U16 | <code>      state.done = true;</code> | Atualiza estado usado por Falha terminal por erro visível da UI: `state.done = true;`. |
| 193 | U16 | <code>      const error = createError('GEMINI_UI_ERROR', state.error);</code> | Declara `error` para sustentar Falha terminal por erro visível da UI; a expressão completa é `const error = createError('GEMINI_UI_ERROR', state.error);`. |
| 194 | U16 | <code>      emitState('ui_error', { error: state.error });</code> | Participa diretamente de Falha terminal por erro visível da UI; esta linha executa/configura `emitState('ui_error', { error: state.error });` no ponto exato da sequência descrita pela unidade U16. |
| 195 | U16 | <code>      settleWaiters(submissionWaiters, 'reject', error);</code> | Participa diretamente de Falha terminal por erro visível da UI; esta linha executa/configura `settleWaiters(submissionWaiters, 'reject', error);` no ponto exato da sequência descrita pela unidade U16. |
| 196 | U16 | <code>      settleWaiters(resultWaiters, 'reject', error);</code> | Participa diretamente de Falha terminal por erro visível da UI; esta linha executa/configura `settleWaiters(resultWaiters, 'reject', error);` no ponto exato da sequência descrita pela unidade U16. |
| 197 | U16 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U16, preservando o escopo de Falha terminal por erro visível da UI. |
| 198 | U17 | ␠ [linha vazia] | Separação visual dentro de U17 (Resultado terminal e resolução de waiters), mantendo legibilidade sem alterar execução. |
| 199 | U17 | <code>    function setResult(image, url) {</code> | Abre a função `setResult` responsável por resultado terminal e resolução de waiters. |
| 200 | U17 | <code>      if (state.cleanedUp &#124;&#124; state.done &#124;&#124; !url) return false;</code> | Abre uma guarda decisória de Resultado terminal e resolução de waiters; a condição exata é `if (state.cleanedUp &#124;&#124; state.done &#124;&#124; !url) return false;`. |
| 201 | U17 | <code>      state.resultImage = image &#124;&#124; null;</code> | Atualiza estado usado por Resultado terminal e resolução de waiters: `state.resultImage = image &#124;&#124; null;`. |
| 202 | U17 | <code>      state.resultUrl = url;</code> | Atualiza estado usado por Resultado terminal e resolução de waiters: `state.resultUrl = url;`. |
| 203 | U17 | <code>      state.done = true;</code> | Atualiza estado usado por Resultado terminal e resolução de waiters: `state.done = true;`. |
| 204 | U17 | <code>      emitState('result_image', { urlKind: String(url).split(':', 1)[0] &#124;&#124; 'unknown' });</code> | Participa diretamente de Resultado terminal e resolução de waiters; esta linha executa/configura `emitState('result_image', { urlKind: String(url).split(':', 1)[0] &#124;&#124; 'unknown' });` no ponto exato da sequência descrita pela unidade U17. |
| 205 | U17 | <code>      settleWaiters(resultWaiters, 'resolve', {</code> | Participa diretamente de Resultado terminal e resolução de waiters; esta linha executa/configura `settleWaiters(resultWaiters, 'resolve', {` no ponto exato da sequência descrita pela unidade U17. |
| 206 | U17 | <code>        image: state.resultImage,</code> | Participa diretamente de Resultado terminal e resolução de waiters; esta linha executa/configura `image: state.resultImage,` no ponto exato da sequência descrita pela unidade U17. |
| 207 | U17 | <code>        url: state.resultUrl,</code> | Participa diretamente de Resultado terminal e resolução de waiters; esta linha executa/configura `url: state.resultUrl,` no ponto exato da sequência descrita pela unidade U17. |
| 208 | U17 | <code>      });</code> | Participa diretamente de Resultado terminal e resolução de waiters; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U17. |
| 209 | U17 | <code>      return true;</code> | Retorna o valor/estado `true;` como saída desta decisão de Resultado terminal e resolução de waiters. |
| 210 | U17 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U17, preservando o escopo de Resultado terminal e resolução de waiters. |
| 211 | U18 | ␠ [linha vazia] | Separação visual dentro de U18 (Detecção de autoria explícita de modelo), mantendo legibilidade sem alterar execução. |
| 212 | U18 | <code>    function hasExplicitModelOwnership(element) {</code> | Abre a função `hasExplicitModelOwnership` responsável por detecção de autoria explícita de modelo. |
| 213 | U18 | <code>      if (!element &#124;&#124; element.nodeType !== 1) return false;</code> | Abre uma guarda decisória de Detecção de autoria explícita de modelo; a condição exata é `if (!element &#124;&#124; element.nodeType !== 1) return false;`. |
| 214 | U18 | <code>      const tag = String(element.tagName &#124;&#124; '').toLowerCase();</code> | Declara `tag` para sustentar Detecção de autoria explícita de modelo; a expressão completa é `const tag = String(element.tagName &#124;&#124; '').toLowerCase();`. |
| 215 | U18 | <code>      if (tag === 'model-response' &#124;&#124; tag === 'bard-model-response') return true;</code> | Abre uma guarda decisória de Detecção de autoria explícita de modelo; a condição exata é `if (tag === 'model-response' &#124;&#124; tag === 'bard-model-response') return true;`. |
| 216 | U18 | ␠ [linha vazia] | Separação visual dentro de U18 (Detecção de autoria explícita de modelo), mantendo legibilidade sem alterar execução. |
| 217 | U18 | <code>      const author = String(element.getAttribute?.('data-message-author') &#124;&#124; '').toLowerCase();</code> | Declara `author` para sustentar Detecção de autoria explícita de modelo; a expressão completa é `const author = String(element.getAttribute?.('data-message-author') &#124;&#124; '').toLowerCase();`. |
| 218 | U18 | <code>      if (author === 'model' &#124;&#124; author === 'assistant') return true;</code> | Abre uma guarda decisória de Detecção de autoria explícita de modelo; a condição exata é `if (author === 'model' &#124;&#124; author === 'assistant') return true;`. |
| 219 | U18 | ␠ [linha vazia] | Separação visual dentro de U18 (Detecção de autoria explícita de modelo), mantendo legibilidade sem alterar execução. |
| 220 | U18 | <code>      const role = String(element.getAttribute?.('data-turn-role') &#124;&#124; '').toLowerCase();</code> | Declara `role` para sustentar Detecção de autoria explícita de modelo; a expressão completa é `const role = String(element.getAttribute?.('data-turn-role') &#124;&#124; '').toLowerCase();`. |
| 221 | U18 | <code>      if (role === 'model' &#124;&#124; role === 'assistant') return true;</code> | Abre uma guarda decisória de Detecção de autoria explícita de modelo; a condição exata é `if (role === 'model' &#124;&#124; role === 'assistant') return true;`. |
| 222 | U18 | ␠ [linha vazia] | Separação visual dentro de U18 (Detecção de autoria explícita de modelo), mantendo legibilidade sem alterar execução. |
| 223 | U18 | <code>      const testId = String(</code> | Declara `testId` para sustentar Detecção de autoria explícita de modelo; a expressão completa é `const testId = String(`. |
| 224 | U18 | <code>        element.getAttribute?.('data-test-id') &#124;&#124;</code> | Participa diretamente de Detecção de autoria explícita de modelo; esta linha executa/configura `element.getAttribute?.('data-test-id') &#124;&#124;` no ponto exato da sequência descrita pela unidade U18. |
| 225 | U18 | <code>        element.getAttribute?.('data-testid') &#124;&#124;</code> | Participa diretamente de Detecção de autoria explícita de modelo; esta linha executa/configura `element.getAttribute?.('data-testid') &#124;&#124;` no ponto exato da sequência descrita pela unidade U18. |
| 226 | U18 | <code>        ''</code> | Participa diretamente de Detecção de autoria explícita de modelo; esta linha executa/configura `''` no ponto exato da sequência descrita pela unidade U18. |
| 227 | U18 | <code>      ).toLowerCase();</code> | Participa diretamente de Detecção de autoria explícita de modelo; esta linha executa/configura `).toLowerCase();` no ponto exato da sequência descrita pela unidade U18. |
| 228 | U18 | <code>      if (testId.includes('model-response')) return true;</code> | Abre uma guarda decisória de Detecção de autoria explícita de modelo; a condição exata é `if (testId.includes('model-response')) return true;`. |
| 229 | U18 | ␠ [linha vazia] | Separação visual dentro de U18 (Detecção de autoria explícita de modelo), mantendo legibilidade sem alterar execução. |
| 230 | U18 | <code>      return tag === 'message-content' &amp;&amp; element.classList?.contains('model');</code> | Retorna o valor/estado `tag === 'message-content' && element.classList?.contains('model');` como saída desta decisão de Detecção de autoria explícita de modelo. |
| 231 | U18 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U18, preservando o escopo de Detecção de autoria explícita de modelo. |
| 232 | U19 | ␠ [linha vazia] | Separação visual dentro de U19 (Barreira contra turnos de usuário), mantendo legibilidade sem alterar execução. |
| 233 | U19 | <code>    function isBlockedByUserTurn(element) {</code> | Abre a função `isBlockedByUserTurn` responsável por barreira contra turnos de usuário. |
| 234 | U19 | <code>      const userTurn = domApi.getUserTurnContainer?.(element);</code> | Declara `userTurn` para sustentar Barreira contra turnos de usuário; a expressão completa é `const userTurn = domApi.getUserTurnContainer?.(element);`. |
| 235 | U19 | <code>      if (!userTurn) return false;</code> | Abre uma guarda decisória de Barreira contra turnos de usuário; a condição exata é `if (!userTurn) return false;`. |
| 236 | U19 | <code>      if (userTurn === element) return true;</code> | Abre uma guarda decisória de Barreira contra turnos de usuário; a condição exata é `if (userTurn === element) return true;`. |
| 237 | U19 | ␠ [linha vazia] | Separação visual dentro de U19 (Barreira contra turnos de usuário), mantendo legibilidade sem alterar execução. |
| 238 | U19 | <code>      // O Gemini pode envolver um model turn real em um wrapper que também</code> | Comentário de projeto que explicita a intenção de Barreira contra turnos de usuário: O Gemini pode envolver um model turn real em um wrapper que também |
| 239 | U19 | <code>      // casa com USER_TURN. Só atravessamos esse ancestral quando o próprio</code> | Comentário de projeto que explicita a intenção de Barreira contra turnos de usuário: casa com USER_TURN. Só atravessamos esse ancestral quando o próprio |
| 240 | U19 | <code>      // candidato traz autoria explícita de modelo; wrappers genéricos</code> | Comentário de projeto que explicita a intenção de Barreira contra turnos de usuário: candidato traz autoria explícita de modelo; wrappers genéricos |
| 241 | U19 | <code>      // continuam rejeitados para não capturar imagens do usuário.</code> | Comentário de projeto que explicita a intenção de Barreira contra turnos de usuário: continuam rejeitados para não capturar imagens do usuário. |
| 242 | U19 | <code>      return !hasExplicitModelOwnership(element);</code> | Retorna o valor/estado `!hasExplicitModelOwnership(element);` como saída desta decisão de Barreira contra turnos de usuário. |
| 243 | U19 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U19, preservando o escopo de Barreira contra turnos de usuário. |
| 244 | U20 | ␠ [linha vazia] | Separação visual dentro de U20 (Aquisição do novo container de resposta), mantendo legibilidade sem alterar execução. |
| 245 | U20 | <code>    function acquireResponseContainer() {</code> | Abre a função `acquireResponseContainer` responsável por aquisição do novo container de resposta. |
| 246 | U20 | <code>      if (state.responseContainer &amp;&amp; state.responseContainer.isConnected !== false) {</code> | Abre uma guarda decisória de Aquisição do novo container de resposta; a condição exata é `if (state.responseContainer && state.responseContainer.isConnected !== false)`. |
| 247 | U20 | <code>        return state.responseContainer;</code> | Retorna o valor/estado `state.responseContainer;` como saída desta decisão de Aquisição do novo container de resposta. |
| 248 | U20 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U20, preservando o escopo de Aquisição do novo container de resposta. |
| 249 | U20 | ␠ [linha vazia] | Separação visual dentro de U20 (Aquisição do novo container de resposta), mantendo legibilidade sem alterar execução. |
| 250 | U20 | <code>      const responses = safeQueryAll(root, SELECTORS.MODEL_RESPONSE_STRICT);</code> | Declara `responses` para sustentar Aquisição do novo container de resposta; a expressão completa é `const responses = safeQueryAll(root, SELECTORS.MODEL_RESPONSE_STRICT);`. |
| 251 | U20 | <code>      const candidates = responses.filter(element =&gt;</code> | Declara `candidates` para sustentar Aquisição do novo container de resposta; a expressão completa é `const candidates = responses.filter(element =>`. |
| 252 | U20 | <code>        !initialResponses.has(element) &amp;&amp;</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `!initialResponses.has(element) &&` no ponto exato da sequência descrita pela unidade U20. |
| 253 | U20 | <code>        !isBlockedByUserTurn(element) &amp;&amp; !domApi.isInsideInputArea(element)</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `!isBlockedByUserTurn(element) && !domApi.isInsideInputArea(element)` no ponto exato da sequência descrita pela unidade U20. |
| 254 | U20 | <code>      );</code> | Fecha a estrutura iniciada nesta unidade U20, preservando o escopo de Aquisição do novo container de resposta. |
| 255 | U20 | <code>      if (!candidates.length) return null;</code> | Abre uma guarda decisória de Aquisição do novo container de resposta; a condição exata é `if (!candidates.length) return null;`. |
| 256 | U20 | ␠ [linha vazia] | Separação visual dentro de U20 (Aquisição do novo container de resposta), mantendo legibilidade sem alterar execução. |
| 257 | U20 | <code>      const container = candidates[candidates.length - 1];</code> | Declara `container` para sustentar Aquisição do novo container de resposta; a expressão completa é `const container = candidates[candidates.length - 1];`. |
| 258 | U20 | <code>      state.responseContainer = container;</code> | Atualiza estado usado por Aquisição do novo container de resposta: `state.responseContainer = container;`. |
| 259 | U20 | <code>      state.generationStarted = true;</code> | Atualiza estado usado por Aquisição do novo container de resposta: `state.generationStarted = true;`. |
| 260 | U20 | <code>      emitState('response_container', { responseIndex: responses.length - 1 });</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `emitState('response_container', { responseIndex: responses.length - 1 });` no ponto exato da sequência descrita pela unidade U20. |
| 261 | U20 | <code>      markGenerationActive('response_created');</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `markGenerationActive('response_created');` no ponto exato da sequência descrita pela unidade U20. |
| 262 | U20 | <code>      confirmSubmission('response_created');</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `confirmSubmission('response_created');` no ponto exato da sequência descrita pela unidade U20. |
| 263 | U20 | ␠ [linha vazia] | Separação visual dentro de U20 (Aquisição do novo container de resposta), mantendo legibilidade sem alterar execução. |
| 264 | U20 | <code>      if (state.responseObserver) {</code> | Abre uma guarda decisória de Aquisição do novo container de resposta; a condição exata é `if (state.responseObserver)`. |
| 265 | U20 | <code>        try { state.responseObserver.disconnect(); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Aquisição do novo container de resposta pode falhar por DOM/API externa ao módulo. |
| 266 | U20 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U20, preservando o escopo de Aquisição do novo container de resposta. |
| 267 | U20 | <code>      state.responseObserver = new MutationObserverImpl(scheduleInspect);</code> | Atualiza estado usado por Aquisição do novo container de resposta: `state.responseObserver = new MutationObserverImpl(scheduleInspect);`. |
| 268 | U20 | <code>      try {</code> | Inicia região protegida porque esta etapa de Aquisição do novo container de resposta pode falhar por DOM/API externa ao módulo. |
| 269 | U20 | <code>        state.responseObserver.observe(container, {</code> | Atualiza estado usado por Aquisição do novo container de resposta: `state.responseObserver.observe(container, {`. |
| 270 | U20 | <code>          childList: true,</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `childList: true,` no ponto exato da sequência descrita pela unidade U20. |
| 271 | U20 | <code>          subtree: true,</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `subtree: true,` no ponto exato da sequência descrita pela unidade U20. |
| 272 | U20 | <code>          characterData: true,</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `characterData: true,` no ponto exato da sequência descrita pela unidade U20. |
| 273 | U20 | <code>          attributes: true,</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `attributes: true,` no ponto exato da sequência descrita pela unidade U20. |
| 274 | U20 | <code>          attributeFilter: ['src', 'srcset', 'data-src', 'aria-hidden', 'style', 'class'],</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `attributeFilter: ['src', 'srcset', 'data-src', 'aria-hidden', 'style', 'class'],` no ponto exato da sequência descrita pela unidade U20. |
| 275 | U20 | <code>        });</code> | Participa diretamente de Aquisição do novo container de resposta; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U20. |
| 276 | U20 | <code>      } catch (_e) {}</code> | Captura falha da etapa anterior de Aquisição do novo container de resposta; o módulo deliberadamente mantém operação best-effort quando indicado pelo código. |
| 277 | U20 | ␠ [linha vazia] | Separação visual dentro de U20 (Aquisição do novo container de resposta), mantendo legibilidade sem alterar execução. |
| 278 | U20 | <code>      return container;</code> | Retorna o valor/estado `container;` como saída desta decisão de Aquisição do novo container de resposta. |
| 279 | U20 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U20, preservando o escopo de Aquisição do novo container de resposta. |
| 280 | U21 | ␠ [linha vazia] | Separação visual dentro de U21 (Confirmação por consumo do editor), mantendo legibilidade sem alterar execução. |
| 281 | U21 | <code>    function inspectEditor() {</code> | Abre a função `inspectEditor` responsável por confirmação por consumo do editor. |
| 282 | U21 | <code>      if (state.submissionConfirmed &#124;&#124; !initialEditorText) return;</code> | Abre uma guarda decisória de Confirmação por consumo do editor; a condição exata é `if (state.submissionConfirmed &#124;&#124; !initialEditorText) return;`. |
| 283 | U21 | <code>      let current = null;</code> | Declara `current` para sustentar Confirmação por consumo do editor; a expressão completa é `let current = null;`. |
| 284 | U21 | <code>      try {</code> | Inicia região protegida porque esta etapa de Confirmação por consumo do editor pode falhar por DOM/API externa ao módulo. |
| 285 | U21 | <code>        current = typeof getEditor === 'function' ? getEditor() : editor;</code> | Atualiza estado usado por Confirmação por consumo do editor: `current = typeof getEditor === 'function' ? getEditor() : editor;`. |
| 286 | U21 | <code>      } catch (_e) {}</code> | Captura falha da etapa anterior de Confirmação por consumo do editor; o módulo deliberadamente mantém operação best-effort quando indicado pelo código. |
| 287 | U21 | <code>      if (!current) return;</code> | Abre uma guarda decisória de Confirmação por consumo do editor; a condição exata é `if (!current) return;`. |
| 288 | U21 | <code>      const currentText = String(current.textContent &#124;&#124; '').trim();</code> | Declara `currentText` para sustentar Confirmação por consumo do editor; a expressão completa é `const currentText = String(current.textContent &#124;&#124; '').trim();`. |
| 289 | U21 | <code>      if (currentText.length === 0) confirmSubmission('editor_consumed');</code> | Abre uma guarda decisória de Confirmação por consumo do editor; a condição exata é `if (currentText.length === 0) confirmSubmission('editor_consumed');`. |
| 290 | U21 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U21, preservando o escopo de Confirmação por consumo do editor. |
| 291 | U22 | ␠ [linha vazia] | Separação visual dentro de U22 (Sinais de Stop, término e Send busy), mantendo legibilidade sem alterar execução. |
| 292 | U22 | <code>    function inspectControls() {</code> | Abre a função `inspectControls` responsável por sinais de stop, término e send busy. |
| 293 | U22 | <code>      const visibleStop = domApi.findVisibleStopButton(root);</code> | Declara `visibleStop` para sustentar Sinais de Stop, término e Send busy; a expressão completa é `const visibleStop = domApi.findVisibleStopButton(root);`. |
| 294 | U22 | <code>      if (visibleStop) {</code> | Abre uma guarda decisória de Sinais de Stop, término e Send busy; a condição exata é `if (visibleStop)`. |
| 295 | U22 | <code>        markGenerationActive('stop_visible');</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `markGenerationActive('stop_visible');` no ponto exato da sequência descrita pela unidade U22. |
| 296 | U22 | <code>      } else if (</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `} else if (` no ponto exato da sequência descrita pela unidade U22. |
| 297 | U22 | <code>        state.generationActiveObserved &amp;&amp;</code> | Atualiza estado usado por Sinais de Stop, término e Send busy: `state.generationActiveObserved &&`. |
| 298 | U22 | <code>        state.responseContainer &amp;&amp;</code> | Atualiza estado usado por Sinais de Stop, término e Send busy: `state.responseContainer &&`. |
| 299 | U22 | <code>        state.responseContainer.isConnected !== false</code> | Atualiza estado usado por Sinais de Stop, término e Send busy: `state.responseContainer.isConnected !== false`. |
| 300 | U22 | <code>      ) {</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `) {` no ponto exato da sequência descrita pela unidade U22. |
| 301 | U22 | <code>        if (!state.generationFinished) {</code> | Abre uma guarda decisória de Sinais de Stop, término e Send busy; a condição exata é `if (!state.generationFinished)`. |
| 302 | U22 | <code>          state.generationFinished = true;</code> | Atualiza estado usado por Sinais de Stop, término e Send busy: `state.generationFinished = true;`. |
| 303 | U22 | <code>          emitState('generation_finished');</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `emitState('generation_finished');` no ponto exato da sequência descrita pela unidade U22. |
| 304 | U22 | <code>        }</code> | Fecha a estrutura iniciada nesta unidade U22, preservando o escopo de Sinais de Stop, término e Send busy. |
| 305 | U22 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U22, preservando o escopo de Sinais de Stop, término e Send busy. |
| 306 | U22 | ␠ [linha vazia] | Separação visual dentro de U22 (Sinais de Stop, término e Send busy), mantendo legibilidade sem alterar execução. |
| 307 | U22 | <code>      const sendControls = safeQueryAll(root, SELECTORS.SEND)</code> | Declara `sendControls` para sustentar Sinais de Stop, término e Send busy; a expressão completa é `const sendControls = safeQueryAll(root, SELECTORS.SEND)`. |
| 308 | U22 | <code>        .filter(domApi.isElementVisible);</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `.filter(domApi.isElementVisible);` no ponto exato da sequência descrita pela unidade U22. |
| 309 | U22 | <code>      const hasEnabledSend = sendControls.some(domApi.isControlEnabled);</code> | Declara `hasEnabledSend` para sustentar Sinais de Stop, término e Send busy; a expressão completa é `const hasEnabledSend = sendControls.some(domApi.isControlEnabled);`. |
| 310 | U22 | <code>      if (hasEnabledSend) state.sendEnabledObserved = true;</code> | Abre uma guarda decisória de Sinais de Stop, término e Send busy; a condição exata é `if (hasEnabledSend) state.sendEnabledObserved = true;`. |
| 311 | U22 | ␠ [linha vazia] | Separação visual dentro de U22 (Sinais de Stop, término e Send busy), mantendo legibilidade sem alterar execução. |
| 312 | U22 | <code>      // "Send busy" só é evidência de submit quando houve transição real.</code> | Comentário de projeto que explicita a intenção de Sinais de Stop, término e Send busy: "Send busy" só é evidência de submit quando houve transição real. |
| 313 | U22 | <code>      // Um botão que já nasceu disabled no baseline NÃO confirma envio.</code> | Comentário de projeto que explicita a intenção de Sinais de Stop, término e Send busy: Um botão que já nasceu disabled no baseline NÃO confirma envio. |
| 314 | U22 | <code>      const transitionedToBusy =</code> | Declara `transitionedToBusy` para sustentar Sinais de Stop, término e Send busy; a expressão completa é `const transitionedToBusy =`. |
| 315 | U22 | <code>        state.sendEnabledObserved &amp;&amp;</code> | Atualiza estado usado por Sinais de Stop, término e Send busy: `state.sendEnabledObserved &&`. |
| 316 | U22 | <code>        sendControls.length &gt; 0 &amp;&amp;</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `sendControls.length > 0 &&` no ponto exato da sequência descrita pela unidade U22. |
| 317 | U22 | <code>        sendControls.every(element =&gt; !domApi.isControlEnabled(element));</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `sendControls.every(element => !domApi.isControlEnabled(element));` no ponto exato da sequência descrita pela unidade U22. |
| 318 | U22 | ␠ [linha vazia] | Separação visual dentro de U22 (Sinais de Stop, término e Send busy), mantendo legibilidade sem alterar execução. |
| 319 | U22 | <code>      if (transitionedToBusy) {</code> | Abre uma guarda decisória de Sinais de Stop, término e Send busy; a condição exata é `if (transitionedToBusy)`. |
| 320 | U22 | <code>        confirmSubmission('send_busy');</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `confirmSubmission('send_busy');` no ponto exato da sequência descrita pela unidade U22. |
| 321 | U22 | <code>        markGenerationActive('send_busy');</code> | Participa diretamente de Sinais de Stop, término e Send busy; esta linha executa/configura `markGenerationActive('send_busy');` no ponto exato da sequência descrita pela unidade U22. |
| 322 | U22 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U22, preservando o escopo de Sinais de Stop, término e Send busy. |
| 323 | U22 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U22, preservando o escopo de Sinais de Stop, término e Send busy. |
| 324 | U23 | ␠ [linha vazia] | Separação visual dentro de U23 (Detecção diferencial de erros), mantendo legibilidade sem alterar execução. |
| 325 | U23 | <code>    function inspectErrors() {</code> | Abre a função `inspectErrors` responsável por detecção diferencial de erros. |
| 326 | U23 | <code>      const errors = safeQueryAll(root, SELECTORS.ERROR);</code> | Declara `errors` para sustentar Detecção diferencial de erros; a expressão completa é `const errors = safeQueryAll(root, SELECTORS.ERROR);`. |
| 327 | U23 | <code>      for (const element of errors) {</code> | Itera a coleção necessária a Detecção diferencial de erros; o cabeçalho do laço é `for (const element of errors) {`. |
| 328 | U23 | <code>        if (!domApi.isElementVisible(element)) continue;</code> | Abre uma guarda decisória de Detecção diferencial de erros; a condição exata é `if (!domApi.isElementVisible(element)) continue;`. |
| 329 | U23 | <code>        const text = String(element.innerText &#124;&#124; element.textContent &#124;&#124; '').trim();</code> | Declara `text` para sustentar Detecção diferencial de erros; a expressão completa é `const text = String(element.innerText &#124;&#124; element.textContent &#124;&#124; '').trim();`. |
| 330 | U23 | <code>        if (!text &#124;&#124; initialErrors.has(text)) continue;</code> | Abre uma guarda decisória de Detecção diferencial de erros; a condição exata é `if (!text &#124;&#124; initialErrors.has(text)) continue;`. |
| 331 | U23 | <code>        fail(text);</code> | Participa diretamente de Detecção diferencial de erros; esta linha executa/configura `fail(text);` no ponto exato da sequência descrita pela unidade U23. |
| 332 | U23 | <code>        return;</code> | Retorna o valor/estado `;` como saída desta decisão de Detecção diferencial de erros. |
| 333 | U23 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U23, preservando o escopo de Detecção diferencial de erros. |
| 334 | U23 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U23, preservando o escopo de Detecção diferencial de erros. |
| 335 | U24 | ␠ [linha vazia] | Separação visual dentro de U24 (Força semântica da URL de imagem), mantendo legibilidade sem alterar execução. |
| 336 | U24 | <code>    function strongImageUrl(src) {</code> | Abre a função `strongImageUrl` responsável por força semântica da url de imagem. |
| 337 | U24 | <code>      return src.startsWith('blob:') &#124;&#124;</code> | Retorna o valor/estado `src.startsWith('blob:') &#124;&#124;` como saída desta decisão de Força semântica da URL de imagem. |
| 338 | U24 | <code>        src.startsWith('data:image/') &#124;&#124;</code> | Participa diretamente de Força semântica da URL de imagem; esta linha executa/configura `src.startsWith('data:image/') &#124;&#124;` no ponto exato da sequência descrita pela unidade U24. |
| 339 | U24 | <code>        isGeneratedGeminiUrl(src) &#124;&#124;</code> | Participa diretamente de Força semântica da URL de imagem; esta linha executa/configura `isGeneratedGeminiUrl(src) &#124;&#124;` no ponto exato da sequência descrita pela unidade U24. |
| 340 | U24 | <code>        src.includes('gemini-result-image');</code> | Participa diretamente de Força semântica da URL de imagem; esta linha executa/configura `src.includes('gemini-result-image');` no ponto exato da sequência descrita pela unidade U24. |
| 341 | U24 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U24, preservando o escopo de Força semântica da URL de imagem. |
| 342 | U25 | ␠ [linha vazia] | Separação visual dentro de U25 (Filtro de candidato de imagem), mantendo legibilidade sem alterar execução. |
| 343 | U25 | <code>    function isCandidateImage(image) {</code> | Abre a função `isCandidateImage` responsável por filtro de candidato de imagem. |
| 344 | U25 | <code>      const src = domApi.getImageSource(image);</code> | Declara `src` para sustentar Filtro de candidato de imagem; a expressão completa é `const src = domApi.getImageSource(image);`. |
| 345 | U25 | <code>      if (!src &#124;&#124; state.initialImageSources.has(src) &#124;&#124; domApi.isIgnoredGeminiImageSource(src)) {</code> | Abre uma guarda decisória de Filtro de candidato de imagem; a condição exata é `if (!src &#124;&#124; state.initialImageSources.has(src) &#124;&#124; domApi.isIgnoredGeminiImageSource(src))`. |
| 346 | U25 | <code>        return false;</code> | Retorna o valor/estado `false;` como saída desta decisão de Filtro de candidato de imagem. |
| 347 | U25 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U25, preservando o escopo de Filtro de candidato de imagem. |
| 348 | U25 | ␠ [linha vazia] | Separação visual dentro de U25 (Filtro de candidato de imagem), mantendo legibilidade sem alterar execução. |
| 349 | U25 | <code>      const width = Number(image.naturalWidth &#124;&#124; image.width &#124;&#124; 0);</code> | Declara `width` para sustentar Filtro de candidato de imagem; a expressão completa é `const width = Number(image.naturalWidth &#124;&#124; image.width &#124;&#124; 0);`. |
| 350 | U25 | <code>      const height = Number(image.naturalHeight &#124;&#124; image.height &#124;&#124; 0);</code> | Declara `height` para sustentar Filtro de candidato de imagem; a expressão completa é `const height = Number(image.naturalHeight &#124;&#124; image.height &#124;&#124; 0);`. |
| 351 | U25 | <code>      if (strongImageUrl(src)) return true;</code> | Abre uma guarda decisória de Filtro de candidato de imagem; a condição exata é `if (strongImageUrl(src)) return true;`. |
| 352 | U25 | <code>      if (image.complete === false &amp;&amp; width &lt;= 0 &amp;&amp; height &lt;= 0) return false;</code> | Abre uma guarda decisória de Filtro de candidato de imagem; a condição exata é `if (image.complete === false && width <= 0 && height <= 0) return false;`. |
| 353 | U25 | <code>      return width &gt; 0 &amp;&amp; height &gt; 0;</code> | Retorna o valor/estado `width > 0 && height > 0;` como saída desta decisão de Filtro de candidato de imagem. |
| 354 | U25 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U25, preservando o escopo de Filtro de candidato de imagem. |
| 355 | U26 | ␠ [linha vazia] | Separação visual dentro de U26 (Diagnóstico deduplicado de rejeição), mantendo legibilidade sem alterar execução. |
| 356 | U26 | <code>    const candidateDiagnostics = new WeakMap();</code> | Declara `candidateDiagnostics` para sustentar Diagnóstico deduplicado de rejeição; a expressão completa é `const candidateDiagnostics = new WeakMap();`. |
| 357 | U26 | <code>    function sourceType(src) {</code> | Abre a função `sourceType` responsável por diagnóstico deduplicado de rejeição. |
| 358 | U26 | <code>      return src.startsWith('blob:') ? 'blob' : src.startsWith('data:image/') ? 'data' :</code> | Retorna o valor/estado `src.startsWith('blob:') ? 'blob' : src.startsWith('data:image/') ? 'data' :` como saída desta decisão de Diagnóstico deduplicado de rejeição. |
| 359 | U26 | <code>        isGeneratedGeminiUrl(src) ? 'generated_google_asset' : 'remote';</code> | Participa diretamente de Diagnóstico deduplicado de rejeição; esta linha executa/configura `isGeneratedGeminiUrl(src) ? 'generated_google_asset' : 'remote';` no ponto exato da sequência descrita pela unidade U26. |
| 360 | U26 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U26, preservando o escopo de Diagnóstico deduplicado de rejeição. |
| 361 | U26 | <code>    function rejectCandidate(image, reason, src) {</code> | Abre a função `rejectCandidate` responsável por diagnóstico deduplicado de rejeição. |
| 362 | U26 | <code>      const signature = reason + '&#124;' + src;</code> | Declara `signature` para sustentar Diagnóstico deduplicado de rejeição; a expressão completa é `const signature = reason + '&#124;' + src;`. |
| 363 | U26 | <code>      if (candidateDiagnostics.get(image) === signature) return;</code> | Abre uma guarda decisória de Diagnóstico deduplicado de rejeição; a condição exata é `if (candidateDiagnostics.get(image) === signature) return;`. |
| 364 | U26 | <code>      candidateDiagnostics.set(image, signature);</code> | Participa diretamente de Diagnóstico deduplicado de rejeição; esta linha executa/configura `candidateDiagnostics.set(image, signature);` no ponto exato da sequência descrita pela unidade U26. |
| 365 | U26 | <code>      emitState('result_candidate_rejected', { reason, sourceType: sourceType(src) });</code> | Participa diretamente de Diagnóstico deduplicado de rejeição; esta linha executa/configura `emitState('result_candidate_rejected', { reason, sourceType: sourceType(src) });` no ponto exato da sequência descrita pela unidade U26. |
| 366 | U27 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U27, preservando o escopo de Seleção segura do resultado. |
| 367 | U27 | <code>    function inspectResult() {</code> | Abre a função `inspectResult` responsável por seleção segura do resultado. |
| 368 | U27 | <code>      acquireResponseContainer();</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `acquireResponseContainer();` no ponto exato da sequência descrita pela unidade U27. |
| 369 | U27 | <code>      if (!state.submissionConfirmed) return;</code> | Abre uma guarda decisória de Seleção segura do resultado; a condição exata é `if (!state.submissionConfirmed) return;`. |
| 370 | U27 | <code>      const images = safeQueryAll(root, 'img');</code> | Declara `images` para sustentar Seleção segura do resultado; a expressão completa é `const images = safeQueryAll(root, 'img');`. |
| 371 | U27 | <code>      for (let index = images.length - 1; index &gt;= 0; index -= 1) {</code> | Itera a coleção necessária a Seleção segura do resultado; o cabeçalho do laço é `for (let index = images.length - 1; index >= 0; index -= 1) {`. |
| 372 | U27 | <code>        const image = images[index];</code> | Declara `image` para sustentar Seleção segura do resultado; a expressão completa é `const image = images[index];`. |
| 373 | U27 | <code>        if (!isCandidateImage(image) &#124;&#124; image.isConnected === false) continue;</code> | Abre uma guarda decisória de Seleção segura do resultado; a condição exata é `if (!isCandidateImage(image) &#124;&#124; image.isConnected === false) continue;`. |
| 374 | U27 | <code>        const src = domApi.getImageSource(image);</code> | Declara `src` para sustentar Seleção segura do resultado; a expressão completa é `const src = domApi.getImageSource(image);`. |
| 375 | U27 | <code>        const structuralReason = quarantine?.classifyStructuralInput?.(image);</code> | Declara `structuralReason` para sustentar Seleção segura do resultado; a expressão completa é `const structuralReason = quarantine?.classifyStructuralInput?.(image);`. |
| 376 | U27 | <code>        if (structuralReason) { rejectCandidate(image, structuralReason, src); continue; }</code> | Abre uma guarda decisória de Seleção segura do resultado; a condição exata é `if (structuralReason)  rejectCandidate(image, structuralReason, src); continue; }`. |
| 377 | U27 | <code>        const owner = domApi.getStrictModelResponseContainer(image);</code> | Declara `owner` para sustentar Seleção segura do resultado; a expressão completa é `const owner = domApi.getStrictModelResponseContainer(image);`. |
| 378 | U27 | <code>        if (owner &amp;&amp; initialResponses.has(owner)) { rejectCandidate(image, 'old_model_turn', src); continue; }</code> | Abre uma guarda decisória de Seleção segura do resultado; a condição exata é `if (owner && initialResponses.has(owner))  rejectCandidate(image, 'old_model_turn', src); continue; }`. |
| 379 | U27 | <code>        const belongsToNewModelTurn = Boolean(owner &amp;&amp; !initialResponses.has(owner));</code> | Declara `belongsToNewModelTurn` para sustentar Seleção segura do resultado; a expressão completa é `const belongsToNewModelTurn = Boolean(owner && !initialResponses.has(owner));`. |
| 380 | U27 | <code>        // Não aceitar blob/data órfão, nem tratar um message-content genérico</code> | Comentário de projeto que explicita a intenção de Seleção segura do resultado: Não aceitar blob/data órfão, nem tratar um message-content genérico |
| 381 | U27 | <code>        // como prova de autoria. Só asset gerado e geração observada podem</code> | Comentário de projeto que explicita a intenção de Seleção segura do resultado: como prova de autoria. Só asset gerado e geração observada podem |
| 382 | U27 | <code>        // usar o fallback sem um wrapper de autoria forte.</code> | Comentário de projeto que explicita a intenção de Seleção segura do resultado: usar o fallback sem um wrapper de autoria forte. |
| 383 | U27 | <code>        const trustedFallback = !owner &amp;&amp; isGeneratedGeminiUrl(src) &amp;&amp; state.generationActiveObserved;</code> | Declara `trustedFallback` para sustentar Seleção segura do resultado; a expressão completa é `const trustedFallback = !owner && isGeneratedGeminiUrl(src) && state.generationActiveObserved;`. |
| 384 | U27 | <code>        if (!belongsToNewModelTurn &amp;&amp; !trustedFallback) {</code> | Abre uma guarda decisória de Seleção segura do resultado; a condição exata é `if (!belongsToNewModelTurn && !trustedFallback)`. |
| 385 | U27 | <code>          rejectCandidate(image, 'missing_model_owner', src); continue;</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `rejectCandidate(image, 'missing_model_owner', src); continue;` no ponto exato da sequência descrita pela unidade U27. |
| 386 | U27 | <code>        }</code> | Fecha a estrutura iniciada nesta unidade U27, preservando o escopo de Seleção segura do resultado. |
| 387 | U27 | <code>        if ((src.startsWith('blob:') &#124;&#124; src.startsWith('data:image/')) &amp;&amp;</code> | Abre uma guarda decisória de Seleção segura do resultado; a condição exata é `if ((src.startsWith('blob:') &#124;&#124; src.startsWith('data:image/')) &&`. |
| 388 | U27 | <code>            (image.complete === false &#124;&#124; Number(image.naturalWidth &#124;&#124; 0) &lt;= 0 &#124;&#124; Number(image.naturalHeight &#124;&#124; 0) &lt;= 0)) {</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `(image.complete === false &#124;&#124; Number(image.naturalWidth &#124;&#124; 0) <= 0 &#124;&#124; Number(image.naturalHeight &#124;&#124; 0) <= 0)) {` no ponto exato da sequência descrita pela unidade U27. |
| 389 | U27 | <code>          rejectCandidate(image, 'pending_model_media', src); continue;</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `rejectCandidate(image, 'pending_model_media', src); continue;` no ponto exato da sequência descrita pela unidade U27. |
| 390 | U27 | <code>        }</code> | Fecha a estrutura iniciada nesta unidade U27, preservando o escopo de Seleção segura do resultado. |
| 391 | U27 | <code>        emitState('result_candidate_accepted', {</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `emitState('result_candidate_accepted', {` no ponto exato da sequência descrita pela unidade U27. |
| 392 | U27 | <code>          reason: belongsToNewModelTurn ? 'new_model_turn' : 'generated_asset_after_generation',</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `reason: belongsToNewModelTurn ? 'new_model_turn' : 'generated_asset_after_generation',` no ponto exato da sequência descrita pela unidade U27. |
| 393 | U27 | <code>          sourceType: sourceType(src), ownerTag: owner?.tagName?.toLowerCase() &#124;&#124; null,</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `sourceType: sourceType(src), ownerTag: owner?.tagName?.toLowerCase() &#124;&#124; null,` no ponto exato da sequência descrita pela unidade U27. |
| 394 | U27 | <code>        });</code> | Participa diretamente de Seleção segura do resultado; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U27. |
| 395 | U27 | <code>        if (setResult(image, src)) return;</code> | Abre uma guarda decisória de Seleção segura do resultado; a condição exata é `if (setResult(image, src)) return;`. |
| 396 | U27 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U27, preservando o escopo de Seleção segura do resultado. |
| 397 | U27 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U27, preservando o escopo de Seleção segura do resultado. |
| 398 | U28 | ␠ [linha vazia] | Separação visual dentro de U28 (Observação de DOM, Shadow DOM e eventos de mídia), mantendo legibilidade sem alterar execução. |
| 399 | U28 | <code>    const imageEventRoots = new Set();</code> | Declara `imageEventRoots` para sustentar Observação de DOM, Shadow DOM e eventos de mídia; a expressão completa é `const imageEventRoots = new Set();`. |
| 400 | U28 | <code>    const observationOptions = {</code> | Declara `observationOptions` para sustentar Observação de DOM, Shadow DOM e eventos de mídia; a expressão completa é `const observationOptions = {`. |
| 401 | U28 | <code>      childList: true, subtree: true, characterData: true, attributes: true,</code> | Participa diretamente de Observação de DOM, Shadow DOM e eventos de mídia; esta linha executa/configura `childList: true, subtree: true, characterData: true, attributes: true,` no ponto exato da sequência descrita pela unidade U28. |
| 402 | U28 | <code>      attributeFilter: ['src', 'srcset', 'data-src', 'disabled', 'aria-disabled', 'aria-hidden', 'style', 'class'],</code> | Participa diretamente de Observação de DOM, Shadow DOM e eventos de mídia; esta linha executa/configura `attributeFilter: ['src', 'srcset', 'data-src', 'disabled', 'aria-disabled', 'aria-hidden', 'style', 'class'],` no ponto exato da sequência descrita pela unidade U28. |
| 403 | U28 | <code>    };</code> | Fecha a estrutura iniciada nesta unidade U28, preservando o escopo de Observação de DOM, Shadow DOM e eventos de mídia. |
| 404 | U28 | <code>    function observeShadowRoots() {</code> | Abre a função `observeShadowRoots` responsável por observação de dom, shadow dom e eventos de mídia. |
| 405 | U28 | <code>      if (!state.observer) return;</code> | Abre uma guarda decisória de Observação de DOM, Shadow DOM e eventos de mídia; a condição exata é `if (!state.observer) return;`. |
| 406 | U28 | <code>      const searchRoot = root.body &#124;&#124; root.documentElement &#124;&#124; root;</code> | Declara `searchRoot` para sustentar Observação de DOM, Shadow DOM e eventos de mídia; a expressão completa é `const searchRoot = root.body &#124;&#124; root.documentElement &#124;&#124; root;`. |
| 407 | U28 | <code>      const targets = [searchRoot];</code> | Declara `targets` para sustentar Observação de DOM, Shadow DOM e eventos de mídia; a expressão completa é `const targets = [searchRoot];`. |
| 408 | U28 | <code>      for (const host of domApi.findAllDeep(searchRoot, element =&gt; Boolean(element.shadowRoot))) {</code> | Itera a coleção necessária a Observação de DOM, Shadow DOM e eventos de mídia; o cabeçalho do laço é `for (const host of domApi.findAllDeep(searchRoot, element => Boolean(element.shadowRoot))) {`. |
| 409 | U28 | <code>        if (!state.shadowRoots.has(host.shadowRoot)) {</code> | Abre uma guarda decisória de Observação de DOM, Shadow DOM e eventos de mídia; a condição exata é `if (!state.shadowRoots.has(host.shadowRoot))`. |
| 410 | U28 | <code>          state.observer.observe(host.shadowRoot, observationOptions);</code> | Atualiza estado usado por Observação de DOM, Shadow DOM e eventos de mídia: `state.observer.observe(host.shadowRoot, observationOptions);`. |
| 411 | U28 | <code>          state.shadowRoots.add(host.shadowRoot);</code> | Atualiza estado usado por Observação de DOM, Shadow DOM e eventos de mídia: `state.shadowRoots.add(host.shadowRoot);`. |
| 412 | U28 | <code>        }</code> | Fecha a estrutura iniciada nesta unidade U28, preservando o escopo de Observação de DOM, Shadow DOM e eventos de mídia. |
| 413 | U28 | <code>        targets.push(host.shadowRoot);</code> | Participa diretamente de Observação de DOM, Shadow DOM e eventos de mídia; esta linha executa/configura `targets.push(host.shadowRoot);` no ponto exato da sequência descrita pela unidade U28. |
| 414 | U28 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U28, preservando o escopo de Observação de DOM, Shadow DOM e eventos de mídia. |
| 415 | U28 | <code>      for (const target of targets) {</code> | Itera a coleção necessária a Observação de DOM, Shadow DOM e eventos de mídia; o cabeçalho do laço é `for (const target of targets) {`. |
| 416 | U28 | <code>        if (imageEventRoots.has(target)) continue;</code> | Abre uma guarda decisória de Observação de DOM, Shadow DOM e eventos de mídia; a condição exata é `if (imageEventRoots.has(target)) continue;`. |
| 417 | U28 | <code>        target.addEventListener?.('load', scheduleInspect, true);</code> | Participa diretamente de Observação de DOM, Shadow DOM e eventos de mídia; esta linha executa/configura `target.addEventListener?.('load', scheduleInspect, true);` no ponto exato da sequência descrita pela unidade U28. |
| 418 | U28 | <code>        target.addEventListener?.('error', scheduleInspect, true);</code> | Participa diretamente de Observação de DOM, Shadow DOM e eventos de mídia; esta linha executa/configura `target.addEventListener?.('error', scheduleInspect, true);` no ponto exato da sequência descrita pela unidade U28. |
| 419 | U28 | <code>        imageEventRoots.add(target);</code> | Participa diretamente de Observação de DOM, Shadow DOM e eventos de mídia; esta linha executa/configura `imageEventRoots.add(target);` no ponto exato da sequência descrita pela unidade U28. |
| 420 | U28 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U28, preservando o escopo de Observação de DOM, Shadow DOM e eventos de mídia. |
| 421 | U28 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U28, preservando o escopo de Observação de DOM, Shadow DOM e eventos de mídia. |
| 422 | U29 | <code>    function schedulePeriodicInspection() {</code> | Abre a função `schedulePeriodicInspection` responsável por inspeção periódica de segurança. |
| 423 | U29 | <code>      if (state.done &#124;&#124; state.cleanedUp) return;</code> | Abre uma guarda decisória de Inspeção periódica de segurança; a condição exata é `if (state.done &#124;&#124; state.cleanedUp) return;`. |
| 424 | U29 | <code>      state.inspectionTimer = setTimeoutFn(() =&gt; {</code> | Atualiza estado usado por Inspeção periódica de segurança: `state.inspectionTimer = setTimeoutFn(() => {`. |
| 425 | U29 | <code>        state.timers.delete(state.inspectionTimer);</code> | Atualiza estado usado por Inspeção periódica de segurança: `state.timers.delete(state.inspectionTimer);`. |
| 426 | U29 | <code>        state.inspectionTimer = null;</code> | Atualiza estado usado por Inspeção periódica de segurança: `state.inspectionTimer = null;`. |
| 427 | U29 | <code>        inspect();</code> | Participa diretamente de Inspeção periódica de segurança; esta linha executa/configura `inspect();` no ponto exato da sequência descrita pela unidade U29. |
| 428 | U29 | <code>        schedulePeriodicInspection();</code> | Participa diretamente de Inspeção periódica de segurança; esta linha executa/configura `schedulePeriodicInspection();` no ponto exato da sequência descrita pela unidade U29. |
| 429 | U29 | <code>      }, 1250);</code> | Participa diretamente de Inspeção periódica de segurança; esta linha executa/configura `}, 1250);` no ponto exato da sequência descrita pela unidade U29. |
| 430 | U29 | <code>      state.timers.add(state.inspectionTimer);</code> | Atualiza estado usado por Inspeção periódica de segurança: `state.timers.add(state.inspectionTimer);`. |
| 431 | U29 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U29, preservando o escopo de Inspeção periódica de segurança. |
| 432 | U30 | ␠ [linha vazia] | Separação visual dentro de U30 (Pipeline ordenado de inspeção), mantendo legibilidade sem alterar execução. |
| 433 | U30 | <code>    function inspect() {</code> | Abre a função `inspect` responsável por pipeline ordenado de inspeção. |
| 434 | U30 | <code>      if (state.cleanedUp &#124;&#124; state.done) return;</code> | Abre uma guarda decisória de Pipeline ordenado de inspeção; a condição exata é `if (state.cleanedUp &#124;&#124; state.done) return;`. |
| 435 | U30 | <code>      state.inspectCount += 1;</code> | Atualiza estado usado por Pipeline ordenado de inspeção: `state.inspectCount += 1;`. |
| 436 | U30 | <code>      observeShadowRoots();</code> | Participa diretamente de Pipeline ordenado de inspeção; esta linha executa/configura `observeShadowRoots();` no ponto exato da sequência descrita pela unidade U30. |
| 437 | U30 | ␠ [linha vazia] | Separação visual dentro de U30 (Pipeline ordenado de inspeção), mantendo legibilidade sem alterar execução. |
| 438 | U30 | <code>      inspectEditor();</code> | Participa diretamente de Pipeline ordenado de inspeção; esta linha executa/configura `inspectEditor();` no ponto exato da sequência descrita pela unidade U30. |
| 439 | U30 | <code>      if (state.cleanedUp &#124;&#124; state.done) return;</code> | Abre uma guarda decisória de Pipeline ordenado de inspeção; a condição exata é `if (state.cleanedUp &#124;&#124; state.done) return;`. |
| 440 | U30 | ␠ [linha vazia] | Separação visual dentro de U30 (Pipeline ordenado de inspeção), mantendo legibilidade sem alterar execução. |
| 441 | U30 | <code>      acquireResponseContainer();</code> | Participa diretamente de Pipeline ordenado de inspeção; esta linha executa/configura `acquireResponseContainer();` no ponto exato da sequência descrita pela unidade U30. |
| 442 | U30 | <code>      inspectControls();</code> | Participa diretamente de Pipeline ordenado de inspeção; esta linha executa/configura `inspectControls();` no ponto exato da sequência descrita pela unidade U30. |
| 443 | U30 | <code>      if (state.cleanedUp &#124;&#124; state.done) return;</code> | Abre uma guarda decisória de Pipeline ordenado de inspeção; a condição exata é `if (state.cleanedUp &#124;&#124; state.done) return;`. |
| 444 | U30 | ␠ [linha vazia] | Separação visual dentro de U30 (Pipeline ordenado de inspeção), mantendo legibilidade sem alterar execução. |
| 445 | U30 | <code>      inspectErrors();</code> | Participa diretamente de Pipeline ordenado de inspeção; esta linha executa/configura `inspectErrors();` no ponto exato da sequência descrita pela unidade U30. |
| 446 | U30 | <code>      if (state.cleanedUp &#124;&#124; state.done) return;</code> | Abre uma guarda decisória de Pipeline ordenado de inspeção; a condição exata é `if (state.cleanedUp &#124;&#124; state.done) return;`. |
| 447 | U30 | ␠ [linha vazia] | Separação visual dentro de U30 (Pipeline ordenado de inspeção), mantendo legibilidade sem alterar execução. |
| 448 | U30 | <code>      inspectResult();</code> | Participa diretamente de Pipeline ordenado de inspeção; esta linha executa/configura `inspectResult();` no ponto exato da sequência descrita pela unidade U30. |
| 449 | U30 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U30, preservando o escopo de Pipeline ordenado de inspeção. |
| 450 | U31 | ␠ [linha vazia] | Separação visual dentro de U31 (Coalescing por microtask), mantendo legibilidade sem alterar execução. |
| 451 | U31 | <code>    function scheduleInspect() {</code> | Abre a função `scheduleInspect` responsável por coalescing por microtask. |
| 452 | U31 | <code>      if (state.cleanedUp &#124;&#124; state.done &#124;&#124; state.inspectionScheduled) return;</code> | Abre uma guarda decisória de Coalescing por microtask; a condição exata é `if (state.cleanedUp &#124;&#124; state.done &#124;&#124; state.inspectionScheduled) return;`. |
| 453 | U31 | <code>      state.inspectionScheduled = true;</code> | Atualiza estado usado por Coalescing por microtask: `state.inspectionScheduled = true;`. |
| 454 | U31 | <code>      queueMicrotaskFn(() =&gt; {</code> | Participa diretamente de Coalescing por microtask; esta linha executa/configura `queueMicrotaskFn(() => {` no ponto exato da sequência descrita pela unidade U31. |
| 455 | U31 | <code>        state.inspectionScheduled = false;</code> | Atualiza estado usado por Coalescing por microtask: `state.inspectionScheduled = false;`. |
| 456 | U31 | <code>        if (state.cleanedUp &#124;&#124; state.done) return;</code> | Abre uma guarda decisória de Coalescing por microtask; a condição exata é `if (state.cleanedUp &#124;&#124; state.done) return;`. |
| 457 | U31 | <code>        inspect();</code> | Participa diretamente de Coalescing por microtask; esta linha executa/configura `inspect();` no ponto exato da sequência descrita pela unidade U31. |
| 458 | U31 | <code>      });</code> | Participa diretamente de Coalescing por microtask; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U31. |
| 459 | U31 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U31, preservando o escopo de Coalescing por microtask. |
| 460 | U32 | ␠ [linha vazia] | Separação visual dentro de U32 (Start e registro do observer), mantendo legibilidade sem alterar execução. |
| 461 | U32 | <code>    function start() {</code> | Abre a função `start` responsável por start e registro do observer. |
| 462 | U32 | <code>      if (state.cleanedUp &#124;&#124; state.ready) return api;</code> | Abre uma guarda decisória de Start e registro do observer; a condição exata é `if (state.cleanedUp &#124;&#124; state.ready) return api;`. |
| 463 | U32 | <code>      const observeRoot = root.body &#124;&#124; root.documentElement &#124;&#124; root;</code> | Declara `observeRoot` para sustentar Start e registro do observer; a expressão completa é `const observeRoot = root.body &#124;&#124; root.documentElement &#124;&#124; root;`. |
| 464 | U32 | <code>      state.observer = new MutationObserverImpl(scheduleInspect);</code> | Atualiza estado usado por Start e registro do observer: `state.observer = new MutationObserverImpl(scheduleInspect);`. |
| 465 | U32 | <code>      state.observer.observe(observeRoot, observationOptions);</code> | Atualiza estado usado por Start e registro do observer: `state.observer.observe(observeRoot, observationOptions);`. |
| 466 | U32 | <code>      observeShadowRoots();</code> | Participa diretamente de Start e registro do observer; esta linha executa/configura `observeShadowRoots();` no ponto exato da sequência descrita pela unidade U32. |
| 467 | U32 | <code>      state.ready = true;</code> | Atualiza estado usado por Start e registro do observer: `state.ready = true;`. |
| 468 | U32 | <code>      registryOwner.__mtGeminiObservers[jobId] = api;</code> | Atualiza estado usado por Start e registro do observer: `registryOwner.__mtGeminiObservers[jobId] = api;`. |
| 469 | U32 | <code>      emitState('ready', { initialResponseCount: state.initialResponseCount });</code> | Participa diretamente de Start e registro do observer; esta linha executa/configura `emitState('ready', { initialResponseCount: state.initialResponseCount });` no ponto exato da sequência descrita pela unidade U32. |
| 470 | U32 | <code>      inspect();</code> | Participa diretamente de Start e registro do observer; esta linha executa/configura `inspect();` no ponto exato da sequência descrita pela unidade U32. |
| 471 | U32 | <code>      schedulePeriodicInspection();</code> | Participa diretamente de Start e registro do observer; esta linha executa/configura `schedulePeriodicInspection();` no ponto exato da sequência descrita pela unidade U32. |
| 472 | U32 | <code>      return api;</code> | Retorna o valor/estado `api;` como saída desta decisão de Start e registro do observer. |
| 473 | U32 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U32, preservando o escopo de Start e registro do observer. |
| 474 | U33 | ␠ [linha vazia] | Separação visual dentro de U33 (Promise de confirmação do submit), mantendo legibilidade sem alterar execução. |
| 475 | U33 | <code>    function waitForSubmission(timeoutMs = 5000) {</code> | Abre a função `waitForSubmission` responsável por promise de confirmação do submit. |
| 476 | U33 | <code>      if (state.submissionConfirmed) {</code> | Abre uma guarda decisória de Promise de confirmação do submit; a condição exata é `if (state.submissionConfirmed)`. |
| 477 | U33 | <code>        return Promise.resolve({</code> | Retorna o valor/estado `Promise.resolve({` como saída desta decisão de Promise de confirmação do submit. |
| 478 | U33 | <code>          confirmed: true,</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `confirmed: true,` no ponto exato da sequência descrita pela unidade U33. |
| 479 | U33 | <code>          reason: state.submissionReason,</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `reason: state.submissionReason,` no ponto exato da sequência descrita pela unidade U33. |
| 480 | U33 | <code>        });</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U33. |
| 481 | U33 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U33, preservando o escopo de Promise de confirmação do submit. |
| 482 | U33 | <code>      if (state.error) {</code> | Abre uma guarda decisória de Promise de confirmação do submit; a condição exata é `if (state.error)`. |
| 483 | U33 | <code>        return Promise.reject(createError('GEMINI_UI_ERROR', state.error));</code> | Retorna o valor/estado `Promise.reject(createError('GEMINI_UI_ERROR', state.error));` como saída desta decisão de Promise de confirmação do submit. |
| 484 | U33 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U33, preservando o escopo de Promise de confirmação do submit. |
| 485 | U33 | <code>      if (state.cleanedUp &#124;&#124; state.done) {</code> | Abre uma guarda decisória de Promise de confirmação do submit; a condição exata é `if (state.cleanedUp &#124;&#124; state.done)`. |
| 486 | U33 | <code>        return Promise.reject(createError('OBSERVER_STOPPED', 'Observer já finalizado'));</code> | Retorna o valor/estado `Promise.reject(createError('OBSERVER_STOPPED', 'Observer já finalizado'));` como saída desta decisão de Promise de confirmação do submit. |
| 487 | U33 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U33, preservando o escopo de Promise de confirmação do submit. |
| 488 | U33 | ␠ [linha vazia] | Separação visual dentro de U33 (Promise de confirmação do submit), mantendo legibilidade sem alterar execução. |
| 489 | U33 | <code>      return new Promise((resolve, reject) =&gt; {</code> | Retorna o valor/estado `new Promise((resolve, reject) => {` como saída desta decisão de Promise de confirmação do submit. |
| 490 | U33 | <code>        const waiter = { resolve, reject, timer: null };</code> | Declara `waiter` para sustentar Promise de confirmação do submit; a expressão completa é `const waiter = { resolve, reject, timer: null };`. |
| 491 | U33 | <code>        waiter.timer = setTimeoutFn(() =&gt; {</code> | Atualiza estado usado por Promise de confirmação do submit: `waiter.timer = setTimeoutFn(() => {`. |
| 492 | U33 | <code>          submissionWaiters.delete(waiter);</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `submissionWaiters.delete(waiter);` no ponto exato da sequência descrita pela unidade U33. |
| 493 | U33 | <code>          state.timers.delete(waiter.timer);</code> | Atualiza estado usado por Promise de confirmação do submit: `state.timers.delete(waiter.timer);`. |
| 494 | U33 | <code>          reject(createError('GEMINI_SUBMISSION_NOT_CONFIRMED', 'Envio não foi confirmado pela UI'));</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `reject(createError('GEMINI_SUBMISSION_NOT_CONFIRMED', 'Envio não foi confirmado pela UI'));` no ponto exato da sequência descrita pela unidade U33. |
| 495 | U33 | <code>        }, timeoutMs);</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `}, timeoutMs);` no ponto exato da sequência descrita pela unidade U33. |
| 496 | U33 | <code>        state.timers.add(waiter.timer);</code> | Atualiza estado usado por Promise de confirmação do submit: `state.timers.add(waiter.timer);`. |
| 497 | U33 | <code>        submissionWaiters.add(waiter);</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `submissionWaiters.add(waiter);` no ponto exato da sequência descrita pela unidade U33. |
| 498 | U33 | <code>      });</code> | Participa diretamente de Promise de confirmação do submit; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U33. |
| 499 | U33 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U33, preservando o escopo de Promise de confirmação do submit. |
| 500 | U34 | ␠ [linha vazia] | Separação visual dentro de U34 (Promise de resultado terminal), mantendo legibilidade sem alterar execução. |
| 501 | U34 | <code>    function waitForResult(timeoutMs = 4 * 60 * 1000) {</code> | Abre a função `waitForResult` responsável por promise de resultado terminal. |
| 502 | U34 | <code>      if (state.resultUrl) {</code> | Abre uma guarda decisória de Promise de resultado terminal; a condição exata é `if (state.resultUrl)`. |
| 503 | U34 | <code>        return Promise.resolve({</code> | Retorna o valor/estado `Promise.resolve({` como saída desta decisão de Promise de resultado terminal. |
| 504 | U34 | <code>          image: state.resultImage,</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `image: state.resultImage,` no ponto exato da sequência descrita pela unidade U34. |
| 505 | U34 | <code>          url: state.resultUrl,</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `url: state.resultUrl,` no ponto exato da sequência descrita pela unidade U34. |
| 506 | U34 | <code>        });</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U34. |
| 507 | U34 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U34, preservando o escopo de Promise de resultado terminal. |
| 508 | U34 | <code>      if (state.error) {</code> | Abre uma guarda decisória de Promise de resultado terminal; a condição exata é `if (state.error)`. |
| 509 | U34 | <code>        return Promise.reject(createError('GEMINI_UI_ERROR', state.error));</code> | Retorna o valor/estado `Promise.reject(createError('GEMINI_UI_ERROR', state.error));` como saída desta decisão de Promise de resultado terminal. |
| 510 | U34 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U34, preservando o escopo de Promise de resultado terminal. |
| 511 | U34 | <code>      if (state.cleanedUp &#124;&#124; state.done) {</code> | Abre uma guarda decisória de Promise de resultado terminal; a condição exata é `if (state.cleanedUp &#124;&#124; state.done)`. |
| 512 | U34 | <code>        return Promise.reject(createError('OBSERVER_STOPPED', 'Observer já finalizado'));</code> | Retorna o valor/estado `Promise.reject(createError('OBSERVER_STOPPED', 'Observer já finalizado'));` como saída desta decisão de Promise de resultado terminal. |
| 513 | U34 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U34, preservando o escopo de Promise de resultado terminal. |
| 514 | U34 | ␠ [linha vazia] | Separação visual dentro de U34 (Promise de resultado terminal), mantendo legibilidade sem alterar execução. |
| 515 | U34 | <code>      return new Promise((resolve, reject) =&gt; {</code> | Retorna o valor/estado `new Promise((resolve, reject) => {` como saída desta decisão de Promise de resultado terminal. |
| 516 | U34 | <code>        const waiter = { resolve, reject, timer: null };</code> | Declara `waiter` para sustentar Promise de resultado terminal; a expressão completa é `const waiter = { resolve, reject, timer: null };`. |
| 517 | U34 | <code>        waiter.timer = setTimeoutFn(() =&gt; {</code> | Atualiza estado usado por Promise de resultado terminal: `waiter.timer = setTimeoutFn(() => {`. |
| 518 | U34 | <code>          resultWaiters.delete(waiter);</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `resultWaiters.delete(waiter);` no ponto exato da sequência descrita pela unidade U34. |
| 519 | U34 | <code>          state.timers.delete(waiter.timer);</code> | Atualiza estado usado por Promise de resultado terminal: `state.timers.delete(waiter.timer);`. |
| 520 | U34 | <code>          reject(createError('GEMINI_RESULT_TIMEOUT', 'Tempo limite aguardando resultado do Gemini'));</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `reject(createError('GEMINI_RESULT_TIMEOUT', 'Tempo limite aguardando resultado do Gemini'));` no ponto exato da sequência descrita pela unidade U34. |
| 521 | U34 | <code>        }, timeoutMs);</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `}, timeoutMs);` no ponto exato da sequência descrita pela unidade U34. |
| 522 | U34 | <code>        state.timers.add(waiter.timer);</code> | Atualiza estado usado por Promise de resultado terminal: `state.timers.add(waiter.timer);`. |
| 523 | U34 | <code>        resultWaiters.add(waiter);</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `resultWaiters.add(waiter);` no ponto exato da sequência descrita pela unidade U34. |
| 524 | U34 | <code>      });</code> | Participa diretamente de Promise de resultado terminal; esta linha executa/configura `});` no ponto exato da sequência descrita pela unidade U34. |
| 525 | U34 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U34, preservando o escopo de Promise de resultado terminal. |
| 526 | U35 | ␠ [linha vazia] | Separação visual dentro de U35 (Stop e cleanup completo), mantendo legibilidade sem alterar execução. |
| 527 | U35 | <code>    function stop() {</code> | Abre a função `stop` responsável por stop e cleanup completo. |
| 528 | U35 | <code>      if (state.cleanedUp) return false;</code> | Abre uma guarda decisória de Stop e cleanup completo; a condição exata é `if (state.cleanedUp) return false;`. |
| 529 | U35 | <code>      state.cleanedUp = true;</code> | Atualiza estado usado por Stop e cleanup completo: `state.cleanedUp = true;`. |
| 530 | U35 | <code>      state.done = true;</code> | Atualiza estado usado por Stop e cleanup completo: `state.done = true;`. |
| 531 | U35 | ␠ [linha vazia] | Separação visual dentro de U35 (Stop e cleanup completo), mantendo legibilidade sem alterar execução. |
| 532 | U35 | <code>      if (state.observer) {</code> | Abre uma guarda decisória de Stop e cleanup completo; a condição exata é `if (state.observer)`. |
| 533 | U35 | <code>        try { state.observer.disconnect(); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Stop e cleanup completo pode falhar por DOM/API externa ao módulo. |
| 534 | U35 | <code>        state.observer = null;</code> | Atualiza estado usado por Stop e cleanup completo: `state.observer = null;`. |
| 535 | U35 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U35, preservando o escopo de Stop e cleanup completo. |
| 536 | U35 | <code>      if (state.responseObserver) {</code> | Abre uma guarda decisória de Stop e cleanup completo; a condição exata é `if (state.responseObserver)`. |
| 537 | U35 | <code>        try { state.responseObserver.disconnect(); } catch (_e) {}</code> | Inicia região protegida porque esta etapa de Stop e cleanup completo pode falhar por DOM/API externa ao módulo. |
| 538 | U35 | <code>        state.responseObserver = null;</code> | Atualiza estado usado por Stop e cleanup completo: `state.responseObserver = null;`. |
| 539 | U35 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U35, preservando o escopo de Stop e cleanup completo. |
| 540 | U35 | ␠ [linha vazia] | Separação visual dentro de U35 (Stop e cleanup completo), mantendo legibilidade sem alterar execução. |
| 541 | U35 | <code>      for (const target of imageEventRoots) {</code> | Itera a coleção necessária a Stop e cleanup completo; o cabeçalho do laço é `for (const target of imageEventRoots) {`. |
| 542 | U35 | <code>        target.removeEventListener?.('load', scheduleInspect, true);</code> | Participa diretamente de Stop e cleanup completo; esta linha executa/configura `target.removeEventListener?.('load', scheduleInspect, true);` no ponto exato da sequência descrita pela unidade U35. |
| 543 | U35 | <code>        target.removeEventListener?.('error', scheduleInspect, true);</code> | Participa diretamente de Stop e cleanup completo; esta linha executa/configura `target.removeEventListener?.('error', scheduleInspect, true);` no ponto exato da sequência descrita pela unidade U35. |
| 544 | U35 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U35, preservando o escopo de Stop e cleanup completo. |
| 545 | U35 | <code>      imageEventRoots.clear();</code> | Participa diretamente de Stop e cleanup completo; esta linha executa/configura `imageEventRoots.clear();` no ponto exato da sequência descrita pela unidade U35. |
| 546 | U35 | <code>      state.shadowRoots.clear();</code> | Atualiza estado usado por Stop e cleanup completo: `state.shadowRoots.clear();`. |
| 547 | U35 | <code>      for (const timer of Array.from(state.timers)) removeTimer(timer);</code> | Itera a coleção necessária a Stop e cleanup completo; o cabeçalho do laço é `for (const timer of Array.from(state.timers)) removeTimer(timer);`. |
| 548 | U35 | <code>      const stopped = createError('OBSERVER_STOPPED', 'Observer interrompido');</code> | Declara `stopped` para sustentar Stop e cleanup completo; a expressão completa é `const stopped = createError('OBSERVER_STOPPED', 'Observer interrompido');`. |
| 549 | U35 | <code>      settleWaiters(submissionWaiters, 'reject', stopped);</code> | Participa diretamente de Stop e cleanup completo; esta linha executa/configura `settleWaiters(submissionWaiters, 'reject', stopped);` no ponto exato da sequência descrita pela unidade U35. |
| 550 | U35 | <code>      settleWaiters(resultWaiters, 'reject', stopped);</code> | Participa diretamente de Stop e cleanup completo; esta linha executa/configura `settleWaiters(resultWaiters, 'reject', stopped);` no ponto exato da sequência descrita pela unidade U35. |
| 551 | U35 | ␠ [linha vazia] | Separação visual dentro de U35 (Stop e cleanup completo), mantendo legibilidade sem alterar execução. |
| 552 | U35 | <code>      if (registryOwner.__mtGeminiObservers?.[jobId] === api) {</code> | Abre uma guarda decisória de Stop e cleanup completo; a condição exata é `if (registryOwner.__mtGeminiObservers?.[jobId] === api)`. |
| 553 | U35 | <code>        delete registryOwner.__mtGeminiObservers[jobId];</code> | Remove a referência `registryOwner.__mtGeminiObservers[jobId]` como parte do cleanup/ownership. |
| 554 | U35 | <code>      }</code> | Fecha a estrutura iniciada nesta unidade U35, preservando o escopo de Stop e cleanup completo. |
| 555 | U35 | <code>      emitState('cleanup');</code> | Participa diretamente de Stop e cleanup completo; esta linha executa/configura `emitState('cleanup');` no ponto exato da sequência descrita pela unidade U35. |
| 556 | U35 | <code>      return true;</code> | Retorna o valor/estado `true;` como saída desta decisão de Stop e cleanup completo. |
| 557 | U35 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U35, preservando o escopo de Stop e cleanup completo. |
| 558 | U36 | ␠ [linha vazia] | Separação visual dentro de U36 (Introspecção e aceitação manual), mantendo legibilidade sem alterar execução. |
| 559 | U36 | <code>    function getState() {</code> | Abre a função `getState` responsável por introspecção e aceitação manual. |
| 560 | U36 | <code>      return state;</code> | Retorna o valor/estado `state;` como saída desta decisão de Introspecção e aceitação manual. |
| 561 | U36 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U36, preservando o escopo de Introspecção e aceitação manual. |
| 562 | U36 | ␠ [linha vazia] | Separação visual dentro de U36 (Introspecção e aceitação manual), mantendo legibilidade sem alterar execução. |
| 563 | U36 | <code>    function acceptResult(image, url) {</code> | Abre a função `acceptResult` responsável por introspecção e aceitação manual. |
| 564 | U36 | <code>      return setResult(image &#124;&#124; null, url);</code> | Retorna o valor/estado `setResult(image &#124;&#124; null, url);` como saída desta decisão de Introspecção e aceitação manual. |
| 565 | U36 | <code>    }</code> | Fecha a estrutura iniciada nesta unidade U36, preservando o escopo de Introspecção e aceitação manual. |
| 566 | U37 | ␠ [linha vazia] | Separação visual dentro de U37 (API da instância), mantendo legibilidade sem alterar execução. |
| 567 | U37 | <code>    const api = {</code> | Declara `api` para sustentar API da instância; a expressão completa é `const api = {`. |
| 568 | U37 | <code>      start,</code> | Participa diretamente de API da instância; esta linha executa/configura `start,` no ponto exato da sequência descrita pela unidade U37. |
| 569 | U37 | <code>      stop,</code> | Participa diretamente de API da instância; esta linha executa/configura `stop,` no ponto exato da sequência descrita pela unidade U37. |
| 570 | U37 | <code>      inspect,</code> | Participa diretamente de API da instância; esta linha executa/configura `inspect,` no ponto exato da sequência descrita pela unidade U37. |
| 571 | U37 | <code>      scheduleInspect,</code> | Participa diretamente de API da instância; esta linha executa/configura `scheduleInspect,` no ponto exato da sequência descrita pela unidade U37. |
| 572 | U37 | <code>      waitForSubmission,</code> | Participa diretamente de API da instância; esta linha executa/configura `waitForSubmission,` no ponto exato da sequência descrita pela unidade U37. |
| 573 | U37 | <code>      waitForResult,</code> | Participa diretamente de API da instância; esta linha executa/configura `waitForResult,` no ponto exato da sequência descrita pela unidade U37. |
| 574 | U37 | <code>      acceptResult,</code> | Participa diretamente de API da instância; esta linha executa/configura `acceptResult,` no ponto exato da sequência descrita pela unidade U37. |
| 575 | U37 | <code>      getState,</code> | Participa diretamente de API da instância; esta linha executa/configura `getState,` no ponto exato da sequência descrita pela unidade U37. |
| 576 | U37 | <code>    };</code> | Fecha a estrutura iniciada nesta unidade U37, preservando o escopo de API da instância. |
| 577 | U37 | ␠ [linha vazia] | Separação visual dentro de U37 (API da instância), mantendo legibilidade sem alterar execução. |
| 578 | U37 | <code>    return api;</code> | Retorna o valor/estado `api;` como saída desta decisão de API da instância. |
| 579 | U37 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U37, preservando o escopo de API da instância. |
| 580 | U38 | ␠ [linha vazia] | Separação visual dentro de U38 (Export global e CommonJS), mantendo legibilidade sem alterar execução. |
| 581 | U38 | <code>  const api = { createGeminiObserver };</code> | Declara `api` para sustentar Export global e CommonJS; a expressão completa é `const api = { createGeminiObserver };`. |
| 582 | U38 | <code>  scope.MangaTranslatorGeminiObserver = api;</code> | Atualiza estado usado por Export global e CommonJS: `scope.MangaTranslatorGeminiObserver = api;`. |
| 583 | U38 | ␠ [linha vazia] | Separação visual dentro de U38 (Export global e CommonJS), mantendo legibilidade sem alterar execução. |
| 584 | U38 | <code>  if (typeof module !== 'undefined' &amp;&amp; module.exports) {</code> | Abre uma guarda decisória de Export global e CommonJS; a condição exata é `if (typeof module !== 'undefined' && module.exports)`. |
| 585 | U38 | <code>    module.exports = api;</code> | Atualiza estado usado por Export global e CommonJS: `module.exports = api;`. |
| 586 | U38 | <code>  }</code> | Fecha a estrutura iniciada nesta unidade U38, preservando o escopo de Export global e CommonJS. |
| 587 | U38 | <code>})(typeof self !== 'undefined' ? self : globalThis);</code> | Participa diretamente de Export global e CommonJS; esta linha executa/configura `})(typeof self !== 'undefined' ? self : globalThis);` no ponto exato da sequência descrita pela unidade U38. |
| 588 | U38 | ⏎ [newline final] | Newline terminal: preserva a forma textual auditada do arquivo. |

## 13. Unidades semânticas

### U01 — linhas 1–7: Cabeçalho, strict mode e escopo IIFE

**O que faz.** Declara strict mode, registra a finalidade do módulo e abre a IIFE que recebe o escopo global.

**Como faz.** O módulo evita símbolos soltos no global e trabalha por injeção via `scope`, compatível com browser e CommonJS.

**Por que foi implementado assim.** O content script Gemini carrega vários módulos no mesmo contexto; encapsular símbolos reduz colisões e permite exportação controlada.

**Por que uma implementação ingênua seria pior.** Sem encapsulamento, helpers internos poderiam colidir com outros scripts; sem strict mode, falhas de atribuição poderiam ser silenciosas.

**Evidência.** 🟨 Exercitado por todas as suítes que `require()` o módulo e pelo fluxo browser, mas sem assertion dedicada ao strict mode/IIFE.

### U02 — linhas 8–29: Aquisição de dependências e fail-fast seletivo

**O que faz.** Obtém Selectors, DOM e ImageQuarantine do global; em CommonJS tenta `require()` dos módulos locais; exige Selectors+DOM antes de prosseguir.

**Como faz.** Cada `require` é best-effort e preserva API já injetada. Selectors precisa expor `SELECTORS`; DOM precisa existir. Quarantine é opcional e pode ficar nula.

**Por que foi implementado assim.** No browser a ordem de injeção fornece APIs globais; no Jest o CommonJS permite carregar o módulo real isoladamente.

**Por que uma implementação ingênua seria pior.** Falhar silenciosamente para Selectors/DOM produziria falsos diagnósticos no meio da observação. Tornar quarantine obrigatória, por outro lado, quebraria compatibilidade onde a defesa estrutural extra não está disponível.

**Evidência.** 🟨 O carregamento CommonJS é exercitado diretamente; ⚠️ não há teste probatório específico para cada falha de `require`, ausência de Selectors/DOM ou quarantine ausente.

### U03 — linhas 30–37: Alias de seletores e erros tipados

**O que faz.** Extrai `SELECTORS` e define helper que cria `Error` com `code` estável.

**Como faz.** `createError` usa a mensagem fornecida ou o próprio código e grava `error.code`.

**Por que foi implementado assim.** Editor e JobRunner distinguem timeout, erro de UI e stop por código, sem depender apenas do texto localizado.

**Por que uma implementação ingênua seria pior.** Usar somente mensagens tornaria o controle de fluxo frágil a tradução/edição textual.

**Evidência.** ✅ Códigos `GEMINI_UI_ERROR`, `GEMINI_SUBMISSION_NOT_CONFIRMED`, `GEMINI_RESULT_TIMEOUT` e `OBSERVER_STOPPED` aparecem em assertions diretas/integradas; ⚠️ o helper isolado não tem teste próprio.

### U04 — linhas 38–44: Consulta profunda segura

**O que faz.** Converte seletor CSS em busca profunda por elementos, delegando travessia a `domApi.findAllDeep`.

**Como faz.** Escolhe `body`, `documentElement` ou o root e aceita somente nós de elemento que casem via `matches?.`.

**Por que foi implementado assim.** Gemini usa Shadow DOM e wrappers variáveis; `querySelectorAll` raso perderia respostas/controles.

**Por que uma implementação ingênua seria pior.** Busca apenas no light DOM falharia em UI encapsulada; assumir `matches` em todo nó causaria erro.

**Evidência.** ✅ OBS-14 e cenários E2E de Shadow DOM exercitam a busca profunda por resposta/imagem.

### U05 — linhas 45–53: Reconhecimento restrito de URL de asset gerado

**O que faz.** Aceita como asset Gemini gerado somente HTTPS em `googleusercontent.com`/subdomínio com caminho `gg-dl` ou `rd-gg-dl`.

**Como faz.** Parseia via `new URL`, valida protocolo, hostname e regex de pathname; URL inválida retorna falso.

**Por que foi implementado assim.** O fallback sem owner estrutural precisa de um sinal de origem muito mais forte que uma imagem remota arbitrária.

**Por que uma implementação ingênua seria pior.** Aceitar qualquer URL Google, qualquer host contendo a palavra ou HTTP permitiria falso positivo/spoofing.

**Evidência.** ✅ OBS-16 e OBS-19 provam formatos `gg-dl`/`rd-gg-dl`; ⚠️ faltam asserts específicos para esquema HTTP, hostname parecido e URL malformada.

### U06 — linhas 54–73: Contrato de criação, injeções e pré-condições

**O que faz.** Define todas as dependências configuráveis do observer e valida `jobId`, `root` e `MutationObserver`.

**Como faz.** Possui defaults browser para document, MutationObserver, timers e microtask; permite substituição controlada em testes.

**Por que foi implementado assim.** Injeção torna temporização/DOM testáveis sem alterar o contrato de produção.

**Por que uma implementação ingênua seria pior.** Hardcode de globais dificultaria testes determinísticos; aceitar observer sem job/root impediria ownership e observação confiável.

**Evidência.** 🟨 Defaults são exercitados pelos testes; ⚠️ faltam testes diretos para os três throws de pré-condição e para fallback de `queueMicrotask`.

### U07 — linhas 74–82: Quarentena e exclusividade por job

**O que faz.** Cria/recebe ImageQuarantine, escolhe o dono do registry e encerra observer anterior com o mesmo `jobId`.

**Como faz.** Usa `defaultView`, `ownerDocument.defaultView` ou `scope`; registry `__mtGeminiObservers` é memória do contexto da página.

**Por que foi implementado assim.** Um job deve possuir no máximo um observer vivo por contexto, evitando callbacks/timers concorrentes do mesmo id.

**Por que uma implementação ingênua seria pior.** Dois observers do mesmo job poderiam resolver Promises diferentes, duplicar logs e confundir ownership.

**Evidência.** ✅ OBS-09 prova registro/remoção; ⚠️ não há teste específico para substituição de observer existente nem registry truthy não-objeto.

### U08 — linhas 83–99: Baseline de respostas, imagens e erros

**O que faz.** Congela os elementos/resursos existentes antes do submit para distinguir estado anterior de novas transições.

**Como faz.** Guarda nós de resposta estrita, URLs de imagem (incluindo `ignoreImages`) e textos de erros visíveis.

**Por que foi implementado assim.** A página Gemini contém histórico, previews e assets antigos; o observer precisa atribuir somente novidades ao job atual.

**Por que uma implementação ingênua seria pior.** Sem baseline, qualquer resposta antiga, preview ou alerta persistente poderia ser entregue como resultado/erro do job atual.

**Evidência.** ✅ OBS-04, OBS-05 e OBS-07 provam rejeição de resposta/imagem/erro de baseline.

### U09 — linhas 100–105: Baseline do editor e botão Send

**O que faz.** Captura texto inicial do editor e se havia algum controle Send visível/habilitado.

**Como faz.** `getEditor` prevalece sobre editor fixo; controles são filtrados por visibilidade e avaliados por `isControlEnabled`.

**Por que foi implementado assim.** Confirmação por editor consumido ou transição enabled→disabled deve provar uma mudança, não um estado inicial.

**Por que uma implementação ingênua seria pior.** Interpretar botão já disabled como submit geraria falso positivo imediato.

**Evidência.** ✅ OBS-13 e SEND-01/SEND-02 cobrem transições do editor/Send. ⚠️ getEditor que lança durante baseline não tem teste.

### U10 — linhas 106–134: Estado observável e conjuntos de waiters

**O que faz.** Centraliza estado do job, handles de observers/timers, ownership de resposta e filas de Promises de submit/resultado.

**Como faz.** Um único objeto mutável armazena flags e referências; `Set` evita duplicação e facilita cleanup em massa.

**Por que foi implementado assim.** Eventos de DOM, timers, microtasks e consumidores assíncronos precisam convergir para uma máquina de estado única.

**Por que uma implementação ingênua seria pior.** Estado espalhado em closures independentes favoreceria races e cleanup incompleto.

**Evidência.** ✅ Diversas assertions de `getState()` e OBS-09 validam flags, observers e timers; ⚠️ `getState` expõe o objeto mutável sem encapsulamento.

### U11 — linhas 135–149: Emissão de estado tolerante a falhas

**O que faz.** Notifica `onStateChange` com snapshot mínimo do job e ignora exceção do callback.

**Como faz.** Mescla `extra` com campos críticos de estado; não deixa telemetria quebrar o pipeline.

**Por que foi implementado assim.** JobRunner usa eventos para logs/HUD/watchdog, mas observação não pode depender da confiabilidade do logger/UI auxiliar.

**Por que uma implementação ingênua seria pior.** Propagar exceção de callback poderia abortar detecção de resultado por falha de telemetria.

**Evidência.** ✅ OBS-15/17/18 e E2E verificam eventos de candidatos; 🟨 JobRunner consome `generation_started`. ⚠️ callback que lança não tem teste específico.

### U12 — linhas 150–155: Remoção idempotente de timer

**O que faz.** Retira timer do registry e tenta cancelá-lo.

**Como faz.** Ignora null/undefined e captura erro de `clearTimeoutFn`.

**Por que foi implementado assim.** Waiters e inspeção periódica compartilham o mesmo conjunto de handles; cleanup deve ser robusto.

**Por que uma implementação ingênua seria pior.** Esquecer handles deixaria callbacks tardios após stop; propagar erro de clear impediria limpeza dos demais recursos.

**Evidência.** ✅ OBS-09 confirma `timers.size === 0` após stop; ⚠️ erro de clearTimeout não é injetado em teste.

### U13 — linhas 156–166: Liquidação coletiva de waiters

**O que faz.** Resolve ou rejeita todos os waiters de um conjunto, removendo seus timers.

**Como faz.** Itera snapshot de `Set`, deleta antes de liquidar e captura exceções de callbacks.

**Por que foi implementado assim.** Resultado, erro ou stop devem encerrar todas as esperas pendentes sem timer órfão.

**Por que uma implementação ingênua seria pior.** Liquidar apenas um waiter causaria Promises penduradas e vazamento de timer.

**Evidência.** ✅ Resultado e erro liquidam waiters em OBS-06/08; ⚠️ múltiplos waiters simultâneos e callback de waiter que lança não têm prova específica.

### U14 — linhas 167–178: Confirmação monotônica de submission

**O que faz.** Marca submit uma única vez, registra razão, emite evento e resolve waiters.

**Como faz.** Guarda contra cleanedUp/done/já confirmado; payload contém `confirmed:true` e razão.

**Por que foi implementado assim.** Vários sinais podem aparecer quase juntos; o primeiro deve estabilizar a confirmação.

**Por que uma implementação ingênua seria pior.** Reconfirmar mudaria a razão observada e poderia disparar efeitos múltiplos.

**Evidência.** ✅ OBS-02/03/13 e SEND-01/04 provam razões distintas; SEND-02/03/05/07 provam ausência de confirmação sem transição.

### U15 — linhas 179–187: Marca de geração ativa

**O que faz.** Registra geração iniciada, emite apenas na primeira observação e usa o sinal para confirmar submission.

**Como faz.** `generationActiveObserved` e `generationStarted` tornam-se verdade; razão `stop_visible` é preservada, demais viram `generation_started` para confirmação.

**Por que foi implementado assim.** Stop, resposta criada ou Send busy são sinais independentes de que Gemini começou a processar.

**Por que uma implementação ingênua seria pior.** Emitir `generation_started` repetidamente renovaria watchdog/logs desnecessariamente.

**Evidência.** ✅ OBS-02 e OBS-12; 🟨 RUN-08 usa observer mock para provar que o consumidor renova watchdog apenas uma vez.

### U16 — linhas 188–197: Falha terminal por erro visível da UI

**O que faz.** Converte novo erro do Gemini em estado terminal e rejeita submit/result waiters com `GEMINI_UI_ERROR`.

**Como faz.** Normaliza texto, marca `done`, emite `ui_error` e reutiliza o mesmo Error tipado.

**Por que foi implementado assim.** Erro explícito da UI deve vencer espera por resultado e falhar cedo.

**Por que uma implementação ingênua seria pior.** Ignorar alerta novo levaria a timeout de minutos e diagnóstico incorreto.

**Evidência.** ✅ OBS-08 e CG-27/35 provam erro visível novo e propagação integrada; OBS-07 prova erro oculto ignorado.

### U17 — linhas 198–210: Resultado terminal e resolução de waiters

**O que faz.** Registra imagem/URL, marca done, emite telemetria sem URL completa e resolve waiters.

**Como faz.** Recusa estado já encerrado/cleanedUp ou URL vazia; evento expõe apenas esquema (`urlKind`).

**Por que foi implementado assim.** A URL real é necessária ao pipeline, mas telemetria deve minimizar vazamento do recurso.

**Por que uma implementação ingênua seria pior.** Logar URL inteira pode expor token/path; aceitar resultado depois de done permitiria sobrescrever ownership.

**Evidência.** ✅ OBS-06 e PR6 provam resultado automático/manual; ⚠️ falta teste direto de segunda chamada após done e URL vazia.

### U18 — linhas 211–231: Detecção de autoria explícita de modelo

**O que faz.** Reconhece wrappers que comprovam autoria model/assistant por tag, atributos, test id ou classe.

**Como faz.** Normaliza tags/atributos para lowercase e exige padrões explícitos.

**Por que foi implementado assim.** Gemini muda markup; múltiplas assinaturas fortes preservam compatibilidade sem aceitar wrappers genéricos.

**Por que uma implementação ingênua seria pior.** Tratar qualquer `message-content` como modelo permitiria capturar conteúdo do usuário.

**Evidência.** ✅ OBS-18/19 e E2E de wrapper assistant exercitam autoria explícita; ⚠️ cada variante de atributo não possui caso isolado.

### U19 — linhas 232–243: Barreira contra turnos de usuário

**O que faz.** Rejeita candidato dentro de user turn, exceto quando o próprio candidato traz autoria explícita de modelo.

**Como faz.** Consulta `getUserTurnContainer`; aceita exceção para wrapper de modelo real aninhado em ancestral que também casa com USER_TURN.

**Por que foi implementado assim.** Markup amplo pode classificar ancestral da conversa como user; a exceção evita falso negativo sem abrir ownership genérico.

**Por que uma implementação ingênua seria pior.** Bloquear todo ancestral user quebraria wrappers reais; atravessar qualquer ancestral capturaria imagens do usuário.

**Evidência.** ✅ OBS-15 rejeita user turn; OBS-18 prova exceção com autoria explícita.

### U20 — linhas 244–279: Aquisição do novo container de resposta

**O que faz.** Seleciona a resposta estrita mais recente que não existia no baseline nem pertence ao usuário/composer e instala observer dedicado nela.

**Como faz.** Reutiliza container conectado; filtra candidatos; escolhe o último; marca geração/submission; desconecta observer anterior e observa mutações relevantes.

**Por que foi implementado assim.** O container cria vínculo estrutural entre job atual e assets de resposta, além de acelerar inspeção de alterações internas.

**Por que uma implementação ingênua seria pior.** Escolher primeira resposta ou resposta baseline entrega histórico; manter observers antigos duplica callbacks.

**Evidência.** ✅ OBS-03/04/11/14/18/19 provam aquisição, baseline, resposta instantânea e Shadow DOM. ⚠️ exceção em `observe(container)` é engolida sem teste.

### U21 — linhas 280–290: Confirmação por consumo do editor

**O que faz.** Confirma submit quando havia texto inicial e o editor atual passa a vazio.

**Como faz.** Refaz lookup via getEditor quando disponível, tolera erro e compara `textContent.trim()`.

**Por que foi implementado assim.** Consumo do prompt é um sinal da UI de que o envio ocorreu, independente de click/Enter.

**Por que uma implementação ingênua seria pior.** Usar apenas evento de click confunde tentativa com aceitação pelo Gemini.

**Evidência.** ✅ SEND-01 e SEND-06 provam `editor_consumed`; ⚠️ troca de editor para nó com texto diferente mas não vazio não é sinalizada.

### U22 — linhas 291–323: Sinais de Stop, término e Send busy

**O que faz.** Detecta geração ativa por Stop visível ou Send passando de habilitado para busy; registra término quando Stop desaparece após geração e container existe.

**Como faz.** Usa helpers de visibilidade/enable; `sendEnabledObserved` impede baseline disabled de confirmar.

**Por que foi implementado assim.** Sinais redundantes cobrem variações do Gemini e reduzem dependência de um único seletor.

**Por que uma implementação ingênua seria pior.** Stop oculto ou botão disabled no baseline como evidência causaria falsos submits.

**Evidência.** ✅ OBS-01/02/12/13 e SEND-04. ⚠️ `generationFinished` pode virar true sem Stop jamais ter sido visto quando resposta já existe; não há teste que valide semântica de término além do estado observado em OBS-12.

### U23 — linhas 324–334: Detecção diferencial de erros

**O que faz.** Percorre erros visíveis e falha somente para texto novo não presente no baseline.

**Como faz.** Ignora invisíveis, vazios e textos já existentes.

**Por que foi implementado assim.** Alertas históricos não pertencem ao job corrente.

**Por que uma implementação ingênua seria pior.** Falhar em erro baseline abortaria job válido; ignorar visibilidade aceitaria elementos ocultos de templates.

**Evidência.** ✅ OBS-07/08 e CG-27/35.

### U24 — linhas 335–341: Força semântica da URL de imagem

**O que faz.** Classifica blob, data:image, asset Google gerado ou marker interno como fonte forte.

**Como faz.** Combina prefixos e `isGeneratedGeminiUrl`.

**Por que foi implementado assim.** Essas fontes podem ser candidatas antes de dimensões remotas comuns, embora ownership continue obrigatório em `inspectResult`.

**Por que uma implementação ingênua seria pior.** Tratar qualquer data: ou URL remota como forte aumentaria falso positivo.

**Evidência.** ✅ Blob/manual, gg-dl e rd-gg-dl aparecem em testes; ⚠️ marker `gemini-result-image` não tem assertion específica localizada.

### U25 — linhas 342–354: Filtro de candidato de imagem

**O que faz.** Elimina URL vazia/baseline/asset ignorado e exige força ou dimensões carregadas.

**Como faz.** Lê fonte canônica pelo DOM helper; fontes fortes passam cedo, remotas comuns precisam estar completas com largura/altura positivas.

**Por que foi implementado assim.** Favicons, avatars, previews e imagens ainda não carregadas não devem vencer a seleção.

**Por que uma implementação ingênua seria pior.** Selecionar primeiro `<img>` novo é insuficiente numa SPA rica em imagens auxiliares.

**Evidência.** ✅ OBS-05/06/20 e cenários de ownership E2E. ⚠️ cada classe de `isIgnoredGeminiImageSource` pertence a dom.js e não é reprovada aqui isoladamente.

### U26 — linhas 355–365: Diagnóstico deduplicado de rejeição

**O que faz.** Classifica tipo de fonte e emite uma rejeição por combinação elemento+razão+src.

**Como faz.** WeakMap evita reter elemento após GC e evita spam repetido durante polling/mutations.

**Por que foi implementado assim.** Inspeção ocorre por mutation, load e timer; sem deduplicação o mesmo falso candidato inundaria logs.

**Por que uma implementação ingênua seria pior.** Set global por URL impediria diagnosticar elementos distintos e reteria strings indefinidamente.

**Evidência.** ✅ OBS-15/17 e E2E verificam razões; ⚠️ deduplicação em múltiplas inspeções não tem assertion de contagem.

### U27 — linhas 366–397: Seleção segura do resultado

**O que faz.** Varre imagens do fim para o início e aceita apenas candidato conectado, fora da quarentena e associado a novo model turn ou fallback gg-dl após geração.

**Como faz.** Aplica em sequência candidate filter, quarentena estrutural, owner estrito, baseline de owner, fallback restrito e readiness especial para blob/data.

**Por que foi implementado assim.** Ownership e exclusão de input são requisitos de segurança; o fallback cobre asset gerado órfão sem relaxar para URL genérica.

**Por que uma implementação ingênua seria pior.** Confiar em posição DOM, URL ou dimensões isoladamente pode devolver o próprio anexo, imagem do usuário ou asset decorativo.

**Evidência.** ✅ OBS-06/15/16/17/18/19/20, PR6 e E2E de ownership/shadow. Esta é a região mais diretamente provada do módulo.

### U28 — linhas 398–421: Observação de DOM, Shadow DOM e eventos de mídia

**O que faz.** Define atributos observados, descobre shadow roots abertos e registra listeners capture de load/error uma vez por root.

**Como faz.** Um MutationObserver compartilhado observa root principal e novos shadow roots; `imageEventRoots` evita listener duplicado.

**Por que foi implementado assim.** Mudanças de src/estado e conclusão de carregamento podem não coincidir com childList; Shadow DOM exige inscrição explícita.

**Por que uma implementação ingênua seria pior.** Observar só document ou só mutations perde imagens carregadas tardiamente dentro de shadow root.

**Evidência.** ✅ OBS-14/20 e OBS-10; ⚠️ shadow root fechado é inerentemente inacessível e não possui fallback.

### U29 — linhas 422–431: Inspeção periódica de segurança

**O que faz.** Agenda re-inspeção a cada 1250 ms enquanto observer não encerrou.

**Como faz.** Registra o handle em `state.timers`, remove quando dispara, roda `inspect` e agenda o próximo ciclo.

**Por que foi implementado assim.** Polling moderado cobre transições que a SPA ou Shadow DOM não expõem por mutation/listener previsível.

**Por que uma implementação ingênua seria pior.** Loop agressivo degradaria CPU; depender só de events pode perder estado.

**Evidência.** 🟨 CG-36 depende da espera temporal do fluxo, mas ⚠️ não há teste que prove exatamente cadência 1250 ms, re-agendamento ou comportamento se `inspect()` lançar.

### U30 — linhas 432–449: Pipeline ordenado de inspeção

**O que faz.** Executa Shadow discovery, editor, response/controls, erros e resultado em ordem com guards após etapas terminais.

**Como faz.** Incrementa contador e interrompe após cleanedUp/done para evitar side effects pós-terminal.

**Por que foi implementado assim.** A ordem permite confirmar submit antes de validar resultado e faz erro terminal impedir entrega subsequente na mesma inspeção.

**Por que uma implementação ingênua seria pior.** Resultado antes de submission poderia aceitar imagem sem transição do job; continuar após erro poderia resolver waiter contraditoriamente.

**Evidência.** ✅ OBS-10 e múltiplos cenários diretos exercitam sequência; ⚠️ precedência erro-versus-resultado na mesma mutação não tem teste dedicado.

### U31 — linhas 450–459: Coalescing por microtask

**O que faz.** Transforma várias notificações próximas em uma única inspeção pendente.

**Como faz.** Flag `inspectionScheduled` bloqueia duplicatas até a microtask limpar a flag e chamar inspect.

**Por que foi implementado assim.** MutationObserver e load podem disparar em rajadas; coalescing reduz trabalho DOM repetido.

**Por que uma implementação ingênua seria pior.** Inspecionar por mutation individual amplifica custo em respostas grandes.

**Evidência.** ✅ teste `coalescing` limita aumento de `inspectCount`; ⚠️ queueMicrotask que lança deixaria a flag presa e não é testado.

### U32 — linhas 460–473: Start e registro do observer

**O que faz.** Instala MutationObserver no root, descobre shadows, marca ready, publica registry, emite ready, inspeciona imediatamente e inicia polling.

**Como faz.** É idempotente para cleanedUp/ready e retorna a própria API fluente.

**Por que foi implementado assim.** Inspeção imediata evita perder resposta que apareça no mesmo instante lógico do submit.

**Por que uma implementação ingênua seria pior.** Registrar depois de esperar poderia perder resposta rápida; start duplicado adicionaria listeners/observers.

**Evidência.** ✅ OBS-09/11 e E2E resposta rápida. ⚠️ exceção síncrona de `observer.observe` não tem cleanup/teste.

### U33 — linhas 474–499: Promise de confirmação do submit

**O que faz.** Resolve imediatamente se confirmado, rejeita erro/stop terminal ou registra waiter com timeout curto.

**Como faz.** Timeout remove waiter e handle antes de rejeitar `GEMINI_SUBMISSION_NOT_CONFIRMED`.

**Por que foi implementado assim.** Editor precisa distinguir tentativa de envio de transição realmente confirmada e falhar cedo.

**Por que uma implementação ingênua seria pior.** Esperar geração de quatro minutos após click ignorado atrasaria fila e mascararia erro de submit.

**Evidência.** ✅ SEND-01..07 e E2E `submit ignorado`; códigos e timeout curto são verificados.

### U34 — linhas 500–525: Promise de resultado terminal

**O que faz.** Entrega resultado já disponível, propaga erro/stop ou espera com timeout default de quatro minutos.

**Como faz.** Waiter possui timer independente; timeout rejeita `GEMINI_RESULT_TIMEOUT` sem inventar resultado.

**Por que foi implementado assim.** Geração de imagem é assíncrona e pode demorar; caller precisa de limite terminal explícito.

**Por que uma implementação ingênua seria pior.** Promise sem timeout poderia bloquear job para sempre; timeout sem código impediria tratamento específico.

**Evidência.** ✅ OBS-06/11/14/16/18/19/20/PR6 resolvem; CG-36 prova timeout integrado e JobRunner converte em status `result_timeout`.

### U35 — linhas 526–557: Stop e cleanup completo

**O que faz.** Marca terminal, desconecta observers, remove listeners/timers, rejeita waiters, limpa registry e emite cleanup de forma idempotente.

**Como faz.** Cada recurso é checado e falhas de disconnect são toleradas; registry só é deletado se ainda aponta para esta API.

**Por que foi implementado assim.** Tabs/jobs podem terminar por sucesso, erro, timeout ou navegação; callbacks tardios não devem agir após ownership acabar.

**Por que uma implementação ingênua seria pior.** Cleanup parcial deixa timers/listeners vivos, duplica eventos entre jobs e pode vazar observer antigo.

**Evidência.** ✅ OBS-09 prova idempotência e recursos zerados; OBS-10 prova ausência de resultado pós-cleanup. ⚠️ rejeição de waiter especificamente causada por `stop()` não tem assertion dedicada.

### U36 — linhas 558–565: Introspecção e aceitação manual

**O que faz.** Expõe estado interno e permite que seleção manual use o mesmo caminho terminal `setResult`.

**Como faz.** `getState` retorna referência ao objeto; `acceptResult` delega imagem opcional+URL.

**Por que foi implementado assim.** Testes/diagnóstico precisam observar estado; HUD manual deve resolver a mesma Promise do fluxo automático.

**Por que uma implementação ingênua seria pior.** Canal manual paralelo criaria semântica divergente e races.

**Evidência.** ✅ PR6 prova Promise compartilhada; RUN-05 prova contrato do consumidor com observer mock. ⚠️ estado mutável exposto pode ser alterado externamente.

### U37 — linhas 566–579: API da instância

**O que faz.** Agrupa start/stop/inspect/scheduling/waits/manual/state e retorna a API do observer.

**Como faz.** Closures mantêm acesso ao estado privado por instância.

**Por que foi implementado assim.** Editor e JobRunner recebem capacidades explícitas sem acessar helpers internos.

**Por que uma implementação ingênua seria pior.** Exportar todos os helpers aumentaria superfície de acoplamento.

**Evidência.** ✅ Métodos principais são chamados por testes e consumidores; `scheduleInspect` público não possui consumer relevante além dos callbacks internos.

### U38 — linhas 580–588: Export global e CommonJS

**O que faz.** Publica factory como `MangaTranslatorGeminiObserver`, exporta em CommonJS e fecha IIFE escolhendo `self` ou `globalThis`.

**Como faz.** Browser usa global compartilhado; Jest/Node recebe `module.exports`.

**Por que foi implementado assim.** O mesmo arquivo precisa funcionar como módulo carregado pelo manifest e como implementação real em testes.

**Por que uma implementação ingênua seria pior.** Manter duas versões browser/teste permitiria divergência funcional.

**Evidência.** ✅ observer/editor/rpa tests exigem CommonJS real; E2E exercita carregamento browser. 🟦 A ordem de script no manifest/harness sustenta disponibilidade global.

## 14. Auditoria interna antes da conclusão

- [x] SHA do fonte conferido contra a reserva.
- [x] Fonte integral materializada.
- [x] 588/588 posições mapeadas sem lacunas.
- [x] Dependências reais conferidas em selectors/dom/image-quarantine.
- [x] Consumidores reais conferidos em editor/job-runner/content_gemini.
- [x] `observer.test.js` lido até as assertions dos 21 cenários.
- [x] `editor-submit.test.js` lido até as assertions SEND-01..07.
- [x] `rpa-flow.test.js` conferido para erro UI e timeout.
- [x] E2E conferido para resposta rápida, Shadow DOM e ownership.
- [x] Teste com observer mockado classificado como evidência de consumidor, não prova desta implementação.
- [x] Lacunas e riscos registrados conservadoramente.
- [x] Nenhum código funcional foi alterado.

**Estado desta Bíblia neste commit:** materializada e pronta para reconciliação/auditoria global; ainda não deve contar como concluída até STATUS/CHECKLIST/AUDITORIA serem atualizados sob o mutex global.

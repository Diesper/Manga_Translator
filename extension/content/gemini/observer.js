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

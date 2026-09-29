'use strict';
// gemini/attachment.js — Upload de imagem com confirmação observável.
//
// Regra central: disparar paste/change/drop significa apenas TENTATIVA.
// Attachment só é confirmado quando surge (ou muda) evidência visual/DOM
// posterior ao baseline capturado antes do upload.

(function(scope) {
  let domApi = scope.MangaTranslatorGeminiDom || null;
  if (!domApi && typeof require === 'function') {
    try { domApi = require('./dom.js'); } catch (_e) {}
  }
  if (!domApi) throw new Error('MangaTranslatorGeminiDom indisponível');

  function getSearchRoot(root) {
    return root && (root.body || root.documentElement || root);
  }

  function closestComposed(element, selector) {
    for (let current = element; current; current = current.parentElement || current.getRootNode?.().host) {
      if (current.matches?.(selector)) return current;
    }
    return null;
  }
  const COMPOSER = 'rich-textarea, .input-area, .chat-input-container, .chat-input, input-area, [contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"]';
  const USER_OR_MODEL = 'model-response, bard-model-response, [data-message-author], [data-turn-role], .user-query-container, .user-message, .model-response-container';
  const ATTACHMENT = 'file-preview, attachment-card, [data-test-id*="attachment"], [data-testid*="attachment"], [data-test-id*="preview"], [data-testid*="preview"], .file-preview, .attachment-preview, .image-preview, .attachment-container';
  function isAttachmentContext(element) {
    if (closestComposed(element, USER_OR_MODEL)) return false;
    return Boolean(closestComposed(element, COMPOSER) || closestComposed(element, ATTACHMENT));
  }
  function findFileInputsDeep(root) {
    return domApi.findAllDeep(root, element => {
      if (String(element.tagName || '').toUpperCase() !== 'INPUT' ||
          String(element.type || element.getAttribute?.('type') || '').toLowerCase() !== 'file' ||
          element.disabled || closestComposed(element, USER_OR_MODEL)) return false;
      const accept = String(element.accept || element.getAttribute?.('accept') || '').trim().toLowerCase();
      return !accept || accept.includes('image/') || accept.includes('*/*') ||
        /\.(?:png|jpe?g|webp|gif|bmp|avif)(?:\s*,|$)/.test(accept);
    }).sort((a, b) => Number(Boolean(closestComposed(b, COMPOSER))) - Number(Boolean(closestComposed(a, COMPOSER))));
  }
  function evidenceReady(evidence) {
    const img = evidence?.img;
    if (!img || !domApi.getImageSource(img) || img.complete === false ||
        Number(img.naturalWidth || 0) <= 0 || Number(img.naturalHeight || 0) <= 0) return false;
    const attachmentRoot = closestComposed(evidence.el, ATTACHMENT) || evidence.el;
    return !domApi.findAllDeep(attachmentRoot, element =>
      element.matches?.('[aria-busy="true"], [role="progressbar"], mat-progress-spinner')
    ).length;
  }

  function listAttachmentEvidence(root) {
    const searchRoot = getSearchRoot(root);
    if (!searchRoot) return [];

    const evidence = [];
    const seen = new Set();

    const containers = domApi.findAllDeep(searchRoot, element => {
      const tag = String(element.tagName || '').toLowerCase();
      const tid = String(
        element.getAttribute?.('data-test-id') ||
        element.getAttribute?.('data-testid') ||
        ''
      ).toLowerCase();
      const className = typeof element.className === 'string'
        ? element.className.toLowerCase()
        : '';

      return tag === 'file-preview' ||
        tag === 'attachment-card' ||
        tid.includes('attachment') ||
        tid.includes('preview') ||
        className.includes('file-preview') ||
        className.includes('attachment-preview') ||
        className.includes('image-preview') ||
        className.includes('attachment-container');
    });

    for (const container of containers) {
      if (!isAttachmentContext(container)) continue;
      let rect = null;
      try { rect = container.getBoundingClientRect(); } catch (_e) {}
      if (!rect || rect.width <= 20 || rect.height <= 20) continue;

      const img = domApi.findAllDeep(container, element => String(element.tagName || '').toUpperCase() === 'IMG')[0] || null;
      evidence.push({
        el: container,
        img,
        type: 'container',
        selector: String(container.tagName || '').toLowerCase(),
      });
      seen.add(container);
    }

    const images = domApi.findAllDeep(searchRoot, element =>
      String(element.tagName || '').toUpperCase() === 'IMG'
    );

    for (const img of images) {
      if (seen.has(img) || !isAttachmentContext(img)) continue;
      const src = domApi.getImageSource(img);

      if (src.startsWith('blob:') || (src.startsWith('data:image/') && src.length > 500)) {
        evidence.push({
          el: img,
          img,
          type: 'blob-img',
          selector: src.startsWith('blob:') ? 'img[src^="blob:"]' : 'img[src^="data:image/"]',
        });
        seen.add(img);
        continue;
      }

      const parentArea = img.closest
        ? img.closest('rich-textarea, .input-area, .chat-input, input-area')
        : null;

      if (parentArea && !domApi.isIgnoredGeminiImageSource(src)) {
        const width = Number(img.naturalWidth || img.width || 0);
        const height = Number(img.naturalHeight || img.height || 0);
        if (width > 20 && height > 20) {
          evidence.push({
            el: img,
            img,
            type: 'input-img',
            selector: 'input-area img',
          });
          seen.add(img);
        }
      }
    }

    return evidence;
  }

  function evidenceSignature(evidence) {
    if (!evidence || !evidence.el) return '';
    const element = evidence.el;
    const image = evidence.img || (
      element.querySelector ? element.querySelector('img') : null
    );

    const imageSource = image ? domApi.getImageSource(image) : '';
    const dataTestId = String(
      element.getAttribute?.('data-test-id') ||
      element.getAttribute?.('data-testid') ||
      ''
    );
    const childCount = Number(element.childElementCount || 0);

    // A assinatura ignora classe/style/dimensões: esses valores podem mudar
    // apenas por animação, layout tardio ou carregamento de uma preview antiga.
    // Confirmação exige mudança estrutural ou de identidade da mídia.
    return [
      evidence.type || '',
      evidence.selector || '',
      dataTestId,
      childCount,
      imageSource,
    ].join('|');
  }

  function captureAttachmentBaseline(root) {
    const signatures = new Map();
    for (const evidence of listAttachmentEvidence(root)) {
      signatures.set(evidence.el, evidenceSignature(evidence));
    }
    return { signatures };
  }

  function isEvidenceNewOrChanged(evidence, baseline) {
    if (!baseline || !(baseline.signatures instanceof Map)) return true;
    if (!baseline.signatures.has(evidence.el)) return true;
    return baseline.signatures.get(evidence.el) !== evidenceSignature(evidence);
  }

  function findAttachmentThumbnailDeep(root, baseline = null) {
    const evidence = listAttachmentEvidence(root);
    if (!baseline) return evidence[0] || null;
    return evidence.find(item => isEvidenceNewOrChanged(item, baseline)) || null;
  }

  function buildDataTransfer(file) {
    const DataTransferImpl = scope.DataTransfer;
    if (typeof DataTransferImpl === 'function') {
      try {
        const transfer = new DataTransferImpl();
        transfer.items.add(file);
        return transfer;
      } catch (_e) {}
    }

    // Fallback testável para runtimes sem DataTransfer. Ele continua útil para
    // eventos sintéticos; assignment em input.files pode rejeitá-lo e é tratado
    // como uma tentativa falha, nunca como sucesso.
    const files = [file];
    const items = [];
    items.add = item => {
      if (!files.includes(item)) files.push(item);
      return item;
    };
    return { files, items };
  }

  function createClipboardEvent(transfer) {
    if (typeof scope.ClipboardEvent === 'function') {
      try {
        return new scope.ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clipboardData: transfer,
        });
      } catch (_e) {}
    }

    const event = new scope.Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    try {
      Object.defineProperty(event, 'clipboardData', {
        value: transfer,
        configurable: true,
      });
    } catch (_e) {}
    return event;
  }

  function createDropEvent(transfer) {
    if (typeof scope.DragEvent === 'function') {
      try {
        return new scope.DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: transfer,
        });
      } catch (_e) {}
    }

    const event = new scope.Event('drop', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    try {
      Object.defineProperty(event, 'dataTransfer', {
        value: transfer,
        configurable: true,
      });
    } catch (_e) {}
    return event;
  }

  function focusForAttachment({ editor, editorRoot, windowRef = scope.window || scope }) {
    let attempted = false;

    for (const element of new Set([editor, editorRoot].filter(Boolean))) {
      try {
        element.focus?.({ preventScroll: true });
        attempted = true;
      } catch (_e) {
        try { element.focus?.(); attempted = true; } catch (_e2) {}
      }

      for (const type of ['focus', 'focusin']) {
        try {
          const FocusEventImpl = scope.FocusEvent || scope.Event;
          element.dispatchEvent(new FocusEventImpl(type, {
            bubbles: true,
            composed: true,
          }));
          attempted = true;
        } catch (_e) {}
      }
    }

    try {
      windowRef?.dispatchEvent?.(new scope.Event('focus'));
      attempted = true;
    } catch (_e) {}

    return attempted;
  }

  function dispatchPaste({ editor, editorRoot, root, transfer }) {
    let attempted = false;
    const targets = [editor || editorRoot];

    for (const target of targets) {
      if (!target || typeof target.dispatchEvent !== 'function') continue;
      try {
        target.dispatchEvent(createClipboardEvent(transfer));
        attempted = true;
      } catch (_e) {}
    }
    return attempted;
  }

  function assignFileInputs({ root, transfer }) {
    let attempted = false;
    const searchRoot = getSearchRoot(root);

    for (const input of findFileInputsDeep(searchRoot).slice(0, 1)) {
      try {
        input.files = transfer.files;
        input.dispatchEvent(new scope.Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new scope.Event('change', { bubbles: true, composed: true }));
        attempted = true;
      } catch (_e) {}
    }

    return attempted;
  }

  function dispatchDrop({ editorRoot, transfer }) {
    if (!editorRoot || typeof editorRoot.dispatchEvent !== 'function') return false;
    try {
      editorRoot.dispatchEvent(createDropEvent(transfer));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function dispatchAttachmentAttempt({
    editor,
    editorRoot,
    root,
    transfer,
    includeDrop = true,
  }) {
    const methods = [];
    let attempted = false;

    if (dispatchPaste({ editor, editorRoot, root, transfer })) {
      attempted = true;
      methods.push('paste');
    }
    if (assignFileInputs({ root, transfer })) {
      attempted = true;
      methods.push('file_input');
    }
    if (includeDrop && dispatchDrop({ editorRoot, transfer })) {
      attempted = true;
      methods.push('drop');
    }

    return { attempted, methods };
  }

  function createAttachmentConfirmation({
    root,
    baseline = captureAttachmentBaseline(root),
    timeoutMs = 15000,
    MutationObserverImpl = scope.MutationObserver,
    setTimeoutFn = scope.setTimeout?.bind(scope) || setTimeout,
    clearTimeoutFn = scope.clearTimeout?.bind(scope) || clearTimeout,
  } = {}) {
    if (!root || typeof MutationObserverImpl !== 'function') {
      const promise = Promise.resolve({ confirmed: false, evidence: null });
      return {
        promise,
        inspect: () => null,
        stop: () => false,
      };
    }

    let settled = false;
    let observer = null;
    let timer = null;
    let resolvePromise = null;
    let observedEvidence = null;
    let pollTimer = null;
    const eventRoots = new Set();

    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    const finish = result => {
      if (settled) return false;
      settled = true;
      if (observer) {
        try { observer.disconnect(); } catch (_e) {}
        observer = null;
      }
      if (timer !== null) {
        try { clearTimeoutFn(timer); } catch (_e) {}
        timer = null;
      }
      for (const target of eventRoots) {
        target.removeEventListener?.('load', inspect, true);
        target.removeEventListener?.('error', inspect, true);
      }
      eventRoots.clear();
      if (pollTimer !== null) clearTimeoutFn(pollTimer);
      resolvePromise({ ...result, signalObserved: Boolean(observedEvidence) });
      return true;
    };

    const inspect = () => {
      if (settled) return null;
      const candidates = listAttachmentEvidence(root).filter(item => isEvidenceNewOrChanged(item, baseline));
      const evidence = candidates.find(evidenceReady) || candidates[0];
      if (!evidence) return null;
      observedEvidence = evidence;
      if (evidenceReady(evidence)) finish({ confirmed: true, evidence });
      return evidence;
    };

    const observeRoot = getSearchRoot(root);
    observer = new MutationObserverImpl(inspect);
    observer.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'src',
        'data-src',
        'class',
        'style',
        'aria-hidden',
        'data-test-id',
        'data-testid',
      ],
    });

    for (const target of [observeRoot, ...domApi.findAllDeep(observeRoot, element => Boolean(element.shadowRoot)).map(element => element.shadowRoot)]) {
      if (target !== observeRoot) observer.observe(target, { childList: true, subtree: true, attributes: true });
      target.addEventListener?.('load', inspect, true);
      target.addEventListener?.('error', inspect, true);
      eventRoots.add(target);
    }

    timer = setTimeoutFn(
      () => finish({ confirmed: false, evidence: null }),
      timeoutMs
    );

    const poll = () => {
      if (settled) return;
      inspect();
      if (!settled) pollTimer = setTimeoutFn(poll, 500);
    };
    pollTimer = setTimeoutFn(poll, 500);

    // O baseline foi capturado antes; esta inspeção imediata só aceita algo
    // novo/alterado, nunca um thumbnail antigo.
    inspect();

    return {
      promise,
      inspect,
      hasSignal: () => Boolean(observedEvidence),
      stop() {
        return finish({ confirmed: false, evidence: null });
      },
    };
  }

  function waitForAttachment(options = {}) {
    return createAttachmentConfirmation(options).promise;
  }

  async function attachFile({
    file,
    editor,
    editorRoot = editor,
    getEditor = null,
    getEditorRoot = null,
    dispatchMethodFn = null,
    onAttempt = null,
    root = scope.document,
    timeoutMs = 15000,
    retryAfterMs = 2500,
    maxDispatches = 3,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    MutationObserverImpl = scope.MutationObserver,
    setTimeoutFn = scope.setTimeout?.bind(scope) || setTimeout,
    clearTimeoutFn = scope.clearTimeout?.bind(scope) || clearTimeout,
  } = {}) {
    if (!file || !editor || !root || typeof MutationObserverImpl !== 'function') {
      return {
        confirmed: false,
        attempted: false,
        evidence: null,
        methodsAttempted: [],
      };
    }

    const baseline = captureAttachmentBaseline(root);
    const confirmation = createAttachmentConfirmation({
      root,
      baseline,
      timeoutMs,
      MutationObserverImpl,
      setTimeoutFn,
      clearTimeoutFn,
    });

    focusForAttachment({ editor, editorRoot });

    const transfer = buildDataTransfer(file);
    const methodsAttempted = new Set();

    let attempted = false;
    const methods = [
      ['file_input', () => assignFileInputs({ root, transfer })],
      ['drop', () => dispatchDrop({ editorRoot, transfer })],
      ['paste', () => dispatchPaste({ editor, editorRoot, root, transfer })],
    ];
    let dispatchCount = 0;
    for (const [method, dispatch] of methods) {
      if (dispatchCount >= maxDispatches) break;
      confirmation.inspect();
      // Uma preview pendente é sinal de upload em andamento, não autorização
      // para repetir a imagem por outro mecanismo.
      if (confirmation.hasSignal()) break;
      const currentEditor = typeof getEditor === 'function' ? getEditor() : editor;
      const currentRoot = typeof getEditorRoot === 'function' ? getEditorRoot() : editorRoot;
      if (!currentEditor || !currentRoot || currentEditor.isConnected === false || currentRoot.isConnected === false) {
        onAttempt?.({ method, attempted: false, reason: 'editor_disconnected' });
        continue;
      }
      editor = currentEditor;
      editorRoot = currentRoot;
      focusForAttachment({ editor, editorRoot });
      let dispatched = false;
      let reason = null;
      try {
        const result = typeof dispatchMethodFn === 'function' ? await dispatchMethodFn(method) : dispatch();
        dispatched = typeof result === 'object' ? result?.attempted === true : result === true;
        reason = typeof result === 'object' ? result?.reason || null : null;
      } catch (_e) { reason = 'dispatch_failed'; }
      onAttempt?.({ method, attempted: dispatched, reason, world: dispatchMethodFn ? 'MAIN' : 'ISOLATED' });
      if (!dispatched) continue;
      attempted = true;
      dispatchCount += 1;
      methodsAttempted.add(method);
      confirmation.inspect();
      const early = await Promise.race([
        confirmation.promise.then(result => ({ kind: 'result', result })),
        sleep(retryAfterMs).then(() => ({ kind: 'next' })),
      ]);
      if (early.kind === 'result') {
        return { ...early.result, attempted, methodsAttempted: Array.from(methodsAttempted) };
      }
      confirmation.inspect();
      if (confirmation.hasSignal()) break;
    }

    const result = await confirmation.promise;
    return {
      ...result,
      attempted,
      methodsAttempted: Array.from(methodsAttempted),
    };
  }

  const api = {
    findFileInputsDeep,
    listAttachmentEvidence,
    captureAttachmentBaseline,
    findAttachmentThumbnailDeep,
    buildDataTransfer,
    focusForAttachment,
    dispatchPaste,
    assignFileInputs,
    dispatchDrop,
    dispatchAttachmentAttempt,
    createAttachmentConfirmation,
    waitForAttachment,
    attachFile,
  };

  scope.MangaTranslatorGeminiAttachment = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

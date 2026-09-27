'use strict';
// gemini/job-runner.js — orquestração de um job Gemini já reivindicado.
//
// Este módulo recebe dependências explicitamente. Ele não faz claim e não abre
// automação por conta própria: content_gemini.js continua responsável por
// bootstrap/claim/keepalive/message handlers.

(function(scope) {
  let imageQuarantineApi = scope.MangaTranslatorGeminiImageQuarantine || null;
  if (!imageQuarantineApi && typeof require === 'function') {
    try { imageQuarantineApi = require('./image-quarantine.js'); } catch (_e) {}
  }

  function createGeminiJobRunner({
    root = scope.document || null,
    pageWindow = scope.window || null,
    runtime = scope.chrome?.runtime || null,
    storage = scope.chrome?.storage?.local || null,
    domApi = scope.MangaTranslatorGeminiDom,
    imageQuarantine = imageQuarantineApi?.createImageQuarantine?.({ dom: domApi }),
    observerApi = scope.MangaTranslatorGeminiObserver,
    editorApi = scope.MangaTranslatorGeminiEditor,
    attachmentApi = scope.MangaTranslatorGeminiAttachment,
    temporaryChatApi = scope.MangaTranslatorGeminiTemporaryChat,
    resultExtractor = null,
    deletionController = null,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    sendLog = function() {},
    getUrlLogMetadata = () => ({}),
    debugConsole = function() {},
    reportProgress = function() {},
    openKeepAlive = function() {},
    closeKeepAlive = function() {},
    FileImpl = scope.File,
    DataUrlAtob = scope.atob ? scope.atob.bind(scope) : null,
    setIntervalFn = scope.setInterval ? scope.setInterval.bind(scope) : setInterval,
    clearIntervalFn = scope.clearInterval ? scope.clearInterval.bind(scope) : clearInterval,
  } = {}) {
    if (!root || !pageWindow || !runtime || !storage) {
      throw new Error('JobRunner requer document/window/runtime/storage');
    }
    if (!domApi || !imageQuarantine || !observerApi || !editorApi || !attachmentApi || !temporaryChatApi) {
      throw new Error('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');
    }
    if (!resultExtractor || !deletionController) {
      throw new Error('JobRunner requer resultExtractor e deletionController');
    }

    let activeObserver = null;

    function getAntiThrottleModeForExecutionMode(executionMode) {
      return executionMode === 'minimized_window' || executionMode === 'background_delete'
        ? 'balanced'
        : 'minimal';
    }

    function setAntiThrottleMode(mode) {
      const normalized = ['minimal', 'balanced', 'legacy'].includes(mode)
        ? mode
        : 'minimal';
      const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;
      if (typeof CustomEventImpl !== 'function' || typeof pageWindow.dispatchEvent !== 'function') {
        return normalized;
      }

      try {
        pageWindow.dispatchEvent(new CustomEventImpl(
          'MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE',
          { detail: { mode: normalized } }
        ));
      } catch (_e) {}
      return normalized;
    }

    function storageGet(keys) {
      return new Promise(resolve => {
        try {
          storage.get(keys, data => resolve(data || {}));
        } catch (_e) {
          resolve({});
        }
      });
    }

    function selectLiveComposer() {
      const all = domApi.findAllDeep(root.body || root.documentElement || root, element =>
        element.matches?.('[contenteditable="true"]') && element.isConnected !== false &&
        domApi.isElementVisible(element) && element.getAttribute('aria-disabled') !== 'true' &&
        !element.closest?.('[data-message-author], [data-turn-role], model-response, .user-query-container')
      );
      const editable = all.find(element => element.closest?.('rich-textarea, .input-area, .chat-input-container, input-area')) || all[0];
      if (!editable) return null;
      let composer = editable;
      for (let current = editable; current; current = current.parentElement || current.getRootNode?.().host) {
        if (current.matches?.('rich-textarea, .input-area, .chat-input-container, input-area')) { composer = current; break; }
      }
      if ([editable, composer].some(element => element.disabled === true || element.getAttribute?.('aria-disabled') === 'true')) return null;
      return { editor: editable, composer };
    }

    async function waitForStableComposer(timeoutMs = 12_000) {
      const started = Date.now();
      let previousEditor = null, previousComposer = null, stableSince = 0;
      while (Date.now() - started < timeoutMs) {
        const current = selectLiveComposer();
        if (current && current.editor === previousEditor && current.composer === previousComposer) {
          if (Date.now() - stableSince >= 750 && Date.now() - started >= 1500) return current;
        } else {
          previousEditor = current?.editor || null;
          previousComposer = current?.composer || null;
          stableSince = Date.now();
        }
        await sleep(250);
      }
      const error = new Error('Editor editável do Gemini não estabilizou em 12s; envio bloqueado.');
      error.code = 'GEMINI_COMPOSER_NOT_READY';
      throw error;
    }

    function attachmentSnapshot() {
      const current = selectLiveComposer();
      const searchRoot = root.body || root.documentElement || root;
      return {
        editorConnected: current?.editor.isConnected === true,
        composerTag: current?.composer.tagName?.toLowerCase() || null,
        fileInputs: domApi.findAllDeep(searchRoot, element => element.matches?.('input[type="file"]')).length,
        imageInputs: attachmentApi.findFileInputsDeep(searchRoot).length,
        previewCount: attachmentApi.listAttachmentEvidence(root).length,
      };
    }

    function dataURLtoFile(dataurl, filename) {
      const raw = String(dataurl || '');
      const commaIndex = raw.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('dataURL malformada: sem vírgula separadora');
      }

      const header = raw.slice(0, commaIndex);
      const mimeMatch = header.match(/:(.*?);/);
      if (!mimeMatch || !mimeMatch[1]) {
        throw new Error('dataURL malformada: MIME não encontrado');
      }
      if (typeof DataUrlAtob !== 'function' || typeof FileImpl !== 'function') {
        throw new Error('APIs de arquivo indisponíveis');
      }

      const binary = DataUrlAtob(raw.slice(commaIndex + 1));
      let length = binary.length;
      const bytes = new Uint8Array(length);
      while (length--) bytes[length] = binary.charCodeAt(length);
      return new FileImpl([bytes], filename, { type: mimeMatch[1] });
    }

    function waitForElement(selector, timeout = 20_000) {
      const existing = root.querySelector(selector);
      if (existing) return Promise.resolve(existing);

      const MutationObserverImpl = scope.MutationObserver || pageWindow.MutationObserver;
      if (typeof MutationObserverImpl !== 'function') {
        return Promise.resolve(null);
      }

      return new Promise(resolve => {
        let timer = null;
        let observer = null;
        let settled = false;

        const finish = element => {
          if (settled) return;
          settled = true;
          if (timer !== null) {
            try { scope.clearTimeout(timer); } catch (_e) {}
          }
          if (observer) {
            try { observer.disconnect(); } catch (_e) {}
          }
          resolve(element || null);
        };

        timer = scope.setTimeout(
          () => finish(root.querySelector(selector)),
          timeout
        );

        observer = new MutationObserverImpl(() => {
          const element = root.querySelector(selector);
          if (element) finish(element);
        });

        const observeRoot = root.body || root.documentElement;
        if (!observeRoot) {
          finish(null);
          return;
        }
        observer.observe(observeRoot, { childList: true, subtree: true });
      });
    }

    function getImageSource(image) {
      return domApi.getImageSource(image);
    }

    function isIgnoredGeminiImageSource(src) {
      return domApi.isIgnoredGeminiImageSource(src);
    }

    function isModelResponseImage(image) {
      return domApi.isModelResponseImage(image);
    }

    function tryClickModelImageCards() {
      const selectors = [
        'model-response button[aria-label*="imagem" i]',
        'model-response button[aria-label*="image" i]',
        'model-response .image-card',
        'model-response [data-test-id*="image"]',
        'model-response [data-test-id*="generated-image"]',
        'model-response img',
        '[data-message-author="model"] button[aria-label*="imagem" i]',
        '[data-message-author="model"] [data-test-id*="image"]',
        '[data-message-author="model"] img',
      ];

      for (const selector of selectors) {
        const element = root.querySelector(selector);
        if (!element) continue;
        const target = element.closest?.('button, [role="button"]') || element;
        try {
          target.click();
          return true;
        } catch (_e) {}
      }
      return false;
    }

    function isLikelyGeneratedImage(image, ignoreImages = new Set()) {
      if (imageQuarantine.isStructurallyInput(image)) return false;
      const src = getImageSource(image);
      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;

      if (isModelResponseImage(image)) return true;

      if (
        src.includes('gemini-result-image') ||
        src.includes('googleusercontent.com/gg-dl/') ||
        src.startsWith('blob:https://gemini.google.com/') ||
        src.startsWith('blob:http://127.0.0.1/')
      ) {
        return true;
      }

      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;

      if (
        src.includes('googleusercontent.com') &&
        !isIgnoredGeminiImageSource(src) &&
        width <= 0 &&
        height <= 0
      ) {
        return true;
      }

      if (width <= 0 || height <= 0) return false;
      if (image.complete === false && height <= 0) return false;

      const maxSide = Math.max(width, height);
      const minSide = Math.min(width, height);
      const area = width * height;
      return maxSide >= 256 && minSide >= 40 && area >= 12_000;
    }

    function isManualSelectableImage(image, ignoreImages = new Set()) {
      if (imageQuarantine.isStructurallyInput(image)) return false;
      const src = getImageSource(image);
      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      return width > 0 && height > 0 && Math.max(width, height) >= 40;
    }

    function findGeneratedResultImages(ignoreImages = new Set()) {
      const images = domApi.findAllDeep(
        root.body || root.documentElement,
        element => String(element.tagName || '').toUpperCase() === 'IMG'
      );

      images.forEach(image => {
        if (image.getAttribute?.('loading') === 'lazy') {
          image.removeAttribute('loading');
          image.setAttribute('loading', 'eager');
        }
        if (image.dataset?.src) image.src = image.dataset.src;
      });

      return images.filter(image => isLikelyGeneratedImage(image, ignoreImages));
    }

    function setManualGeminiResultUrl(url, source = 'manual') {
      pageWindow.__mangaTranslatorManualGeminiResultUrl = url;

      const observer = activeObserver || pageWindow.__mangaTranslatorActiveGeminiObserver;
      if (observer && typeof observer.acceptResult === 'function') {
        observer.acceptResult(null, url);
      }

      const status = root.getElementById('mt-gemini-assist-status');
      if (status) {
        status.textContent = 'Imagem marcada. A extensão vai usar esse resultado.';
      }

      sendLog(
        'info',
        'GEMINI_MANUAL_RESULT',
        'Imagem marcada manualmente no Gemini',
        { source, ...getUrlLogMetadata(url) }
      );
    }

    function removeGeminiManualPanel() {
      const existing = root.getElementById('mt-gemini-assist');
      if (existing) existing.remove();

      if (pageWindow.__mangaTranslatorManualPickHandler) {
        root.removeEventListener(
          'click',
          pageWindow.__mangaTranslatorManualPickHandler,
          true
        );
        pageWindow.__mangaTranslatorManualPickHandler = null;
      }

      root.querySelectorAll('[data-mt-gemini-pickable="true"]').forEach(image => {
        image.style.outline = '';
        image.style.outlineOffset = '';
        image.removeAttribute('data-mt-gemini-pickable');
      });
    }

    function createGeminiManualPanel(job, getIgnoreImages) {
      removeGeminiManualPanel();
      pageWindow.__mangaTranslatorManualGeminiResultUrl = '';

      const panel = root.createElement('div');
      panel.id = 'mt-gemini-assist';
      panel.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'width:260px',
        'background:#111',
        'color:#fff',
        'border:1px solid #333',
        'border-radius:8px',
        'box-shadow:0 10px 28px rgba(0,0,0,0.45)',
        'font-family:Arial,sans-serif',
        'font-size:12px',
        'padding:12px',
        'line-height:1.35',
      ].join(';');

      panel.innerHTML = [
        '<div style="font-weight:700;margin-bottom:4px;">Manga Translator</div>',
        '<div id="mt-gemini-assist-description" style="color:#aaa;margin-bottom:8px;"></div>',
        '<div style="display:flex;gap:6px;margin-bottom:8px;">',
        '<button id="mt-gemini-use-last" style="flex:1;background:#FF4444;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Usar última</button>',
        '<button id="mt-gemini-pick" style="flex:1;background:#2b5f9c;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Selecionar</button>',
        '</div>',
        '<div id="mt-gemini-assist-status" style="color:#888;">Aguardando imagem gerada.</div>',
      ].join('');

      const imageNumber = Number.isFinite(Number(job.index))
        ? Number(job.index) + 1
        : 1;
      panel.querySelector('#mt-gemini-assist-description').textContent =
        `Imagem ${imageNumber}: marque o resultado correto se a detecção automática não pegar.`;

      panel.addEventListener('click', event => event.stopPropagation());
      root.documentElement.appendChild(panel);

      panel.querySelector('#mt-gemini-use-last').addEventListener('click', () => {
        const images = findGeneratedResultImages(getIgnoreImages());
        const candidate = images[images.length - 1];
        if (candidate) {
          setManualGeminiResultUrl(getImageSource(candidate), 'last-button');
        } else {
          panel.querySelector('#mt-gemini-assist-status').textContent =
            'Ainda não encontrei uma imagem candidata.';
        }
      });

      panel.querySelector('#mt-gemini-pick').addEventListener('click', () => {
        const status = panel.querySelector('#mt-gemini-assist-status');
        status.textContent = 'Clique diretamente na imagem correta gerada pelo Gemini.';

        root.querySelectorAll('img').forEach(image => {
          if (!isManualSelectableImage(image, getIgnoreImages())) return;
          image.dataset.mtGeminiPickable = 'true';
          image.style.outline = '3px solid #FF4444';
          image.style.outlineOffset = '2px';
        });

        if (pageWindow.__mangaTranslatorManualPickHandler) {
          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
        }

        pageWindow.__mangaTranslatorManualPickHandler = event => {
          const image = event.target?.closest?.('img');
          if (!image || !isManualSelectableImage(image, getIgnoreImages())) return;

          event.preventDefault();
          event.stopPropagation();
          setManualGeminiResultUrl(getImageSource(image), 'image-click');

          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
          pageWindow.__mangaTranslatorManualPickHandler = null;

          root.querySelectorAll('[data-mt-gemini-pickable="true"]').forEach(candidate => {
            candidate.style.outline = '';
            candidate.style.outlineOffset = '';
            candidate.removeAttribute('data-mt-gemini-pickable');
          });
        };

        root.addEventListener(
          'click',
          pageWindow.__mangaTranslatorManualPickHandler,
          true
        );
      });

      return panel;
    }

    function setPromptInEditor(currentEditable, currentEditor, actualPrompt) {
      if (!currentEditable) return false;

      const prompt = String(actualPrompt || '');
      const existing = String(currentEditable.textContent || '').trim();
      if (existing === prompt.trim()) return true;

      try { currentEditable.focus?.(); } catch (_e) {}
      if (currentEditor && currentEditor !== currentEditable) {
        try { currentEditor.focus?.(); } catch (_e) {}
      }

      const FocusEventImpl = scope.FocusEvent || scope.Event;
      try {
        currentEditable.dispatchEvent(new FocusEventImpl('focus', {
          bubbles: true,
          composed: true,
        }));
        currentEditable.dispatchEvent(new FocusEventImpl('focusin', {
          bubbles: true,
          composed: true,
        }));
      } catch (_e) {}

      const quill = currentEditable.__quill ||
        currentEditor?.__quill ||
        (pageWindow.Quill &&
          typeof pageWindow.Quill.find === 'function' &&
          (pageWindow.Quill.find(currentEditable) || pageWindow.Quill.find(currentEditor)));

      if (quill) {
        try {
          if (typeof quill.setText === 'function') quill.setText(prompt, 'user');
          if (typeof quill.update === 'function') quill.update('user');
        } catch (_e) {}
      }

      const paragraph = root.createElement('p');
      paragraph.textContent = prompt;
      if (typeof currentEditable.replaceChildren === 'function') {
        currentEditable.replaceChildren(paragraph);
      } else {
        while (currentEditable.firstChild) {
          currentEditable.removeChild(currentEditable.firstChild);
        }
        currentEditable.appendChild(paragraph);
      }

      const InputEventImpl = scope.InputEvent || scope.Event;
      try {
        currentEditable.dispatchEvent(new InputEventImpl('beforeinput', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: 'insertText',
          data: prompt,
        }));
        currentEditable.dispatchEvent(new InputEventImpl('input', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: 'insertText',
          data: prompt,
        }));
        currentEditable.dispatchEvent(new scope.Event('input', {
          bubbles: true,
          composed: true,
        }));
        currentEditable.dispatchEvent(new scope.Event('change', {
          bubbles: true,
          composed: true,
        }));
      } catch (_e) {}

      if (currentEditor && 'value' in currentEditor) {
        try { currentEditor.value = prompt; } catch (_e) {}
        try {
          currentEditor.dispatchEvent(new scope.Event('input', {
            bubbles: true,
            composed: true,
          }));
        } catch (_e) {}
      }

      return String(currentEditable.textContent || '').trim().length >= 5;
    }

    async function shouldKeepConversationForDebug(delivery, executionMode) {
      if (
        executionMode !== 'background_delete' ||
        !delivery ||
        delivery.action !== 'GEMINI_ERROR'
      ) {
        return false;
      }
      const data = await storageGet(['debugMode']);
      return data.debugMode === true;
    }

    function sendRuntimeMessage(message) {
      return new Promise(resolve => {
        try {
          runtime.sendMessage(message, response => {
            if (runtime.lastError) resolve(null);
            else resolve(response || null);
          });
        } catch (_e) {
          resolve(null);
        }
      });
    }

    async function requestImageData(job) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await sendRuntimeMessage({
          action: 'REQUEST_IMAGE_DATA',
          mangaTabId: job.mangaTabId,
          index: job.index,
        });
        if (response?.srcData) return response;
        await sleep(1000);
      }
      return null;
    }

    function assertStage(condition, errorMessage, step, successMessage = '') {
      if (!condition) {
        const fullError = `[ERRO CRÍTICO - ETAPA ${step}] ${errorMessage}`;
        debugConsole('error', fullError);
        sendLog(
          'error',
          `TEST_FAIL_STEP_${step}`,
          errorMessage,
          { path: pageWindow.location.pathname }
        );
        throw new Error(fullError);
      }

      sendLog(
        'success',
        `TEST_PASS_STEP_${step}`,
        successMessage || `Etapa ${step} com sucesso`,
        { path: pageWindow.location.pathname }
      );
    }

    async function run(job) {
      if (!job) throw new Error('Job Gemini é obrigatório');

      setAntiThrottleMode('minimal');
      const myTabId = job.geminiTabId;
      let watchdogRefreshRequested = false;
      const recoveryResult = await deletionController.recoverPending({
        tabId: myTabId,
        sendDelivery: async delivery => {
          runtime.sendMessage(delivery);
        },
      });
      if (recoveryResult.handled) {
        return { status: 'recovery_handled', deleted: recoveryResult.deleted };
      }

      openKeepAlive();

      debugConsole('log', '[MangaTranslator Gemini] Job confirmado por claim:', {
        jobId: String(job.jobId || '').slice(0, 8),
        index: job.index,
        geminiTabId: myTabId,
      });

      let scrollInterval = null;
      let executionMode = job.executionMode || null;
      let inputImageHash = null;

      const startScrollAssist = () => {
        scrollInterval = setIntervalFn(() => {
          try {
            pageWindow.scrollTo(0, root.body.scrollHeight);
            const images = root.querySelectorAll('img');
            if (images.length > 0) {
              images[images.length - 1].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }
          } catch (_e) {}
        }, 2000);
      };

      const stopScrollAssist = () => {
        if (scrollInterval !== null) {
          try { clearIntervalFn(scrollInterval); } catch (_e) {}
          scrollInterval = null;
        }
      };

      async function deliverWithSecureDeletion(delivery, shouldDeleteConversation) {
        if (executionMode !== 'background_delete' && executionMode !== 'minimized_window') {
          if (shouldDeleteConversation) {
            deletionController.deleteCurrentConversation().catch(() => {});
          }
          runtime.sendMessage(delivery);
          return true;
        }

        if (await shouldKeepConversationForDebug(delivery, executionMode)) {
          sendLog(
            'info',
            'DEBUG_KEEP_CONVERSATION',
            'Modo debug: conversa preservada após erro de extração.',
            {}
          );
          runtime.sendMessage(delivery);
          return true;
        }

        stopScrollAssist();
        sendLog('info', 'GEMINI_DELETE_BEFORE_DELIVERY', 'Aguardando exclusão antes de finalizar o job', {
          executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
        });
        const deletion = await deletionController.deleteOrScheduleRecovery({
          tabId: myTabId,
          delivery,
        });

        if (deletion.deleted) {
          runtime.sendMessage(delivery);
          return true;
        }
        return false;
      }

      startScrollAssist();

      try {
        reportProgress('📡 OBTENDO IMAGEM...', job.mangaTabId);
        debugConsole(
          'log',
          '[MangaTranslator Gemini] Obtendo imagem da aba do mangá...',
          { index: job.index }
        );
        sendLog('info', 'GEMINI_STEP_1', 'Obtendo imagem', { index: job.index });

        const imageResponse = await requestImageData(job);
        assertStage(
          imageResponse && imageResponse.srcData,
          'Sem resposta da aba do mangá.',
          1,
          'Resposta inicial carregada com sucesso.'
        );
        assertStage(
          String(imageResponse.srcData).startsWith('data:image/'),
          'Os dados não são imagem válida.',
          1,
          'Base64 validada.'
        );
        job.srcData = imageResponse.srcData;
        try {
          inputImageHash = await imageQuarantine.computeExactHash(job.srcData);
          sendLog(
            'info',
            'GEMINI_INPUT_QUARANTINE_READY',
            'Assinatura exata da imagem de entrada calculada',
            { algorithm: 'SHA-256' }
          );
        } catch (hashError) {
          sendLog(
            'warn',
            'GEMINI_QUARANTINE_HASH_UNAVAILABLE',
            'Não foi possível calcular a assinatura inicial; o filtro estrutural permanece ativo',
            { messageLength: String(hashError?.message || '').length }
          );
        }

        reportProgress('⏳ AGUARDANDO INTERFACE...', job.mangaTabId);
        debugConsole('log', '[MangaTranslator Gemini] Aguardando interface do Gemini...');

        const editor = await waitForElement(
          'rich-textarea, .ql-editor, [contenteditable="true"]',
          20_000
        );
        assertStage(editor !== null, 'Editor não carregou.', 2, 'Editor alvo detectado');
        assertStage(
          editor.disabled !== true && editor.getAttribute?.('aria-disabled') !== 'true',
          'Editor do Gemini está desabilitado.',
          2,
          'Editor habilitado'
        );

        try {
          editor.focus?.({ preventScroll: true });
          const FocusEventImpl = scope.FocusEvent || scope.Event;
          editor.dispatchEvent(new FocusEventImpl('focus', {
            bubbles: true,
            composed: true,
          }));
          editor.dispatchEvent(new FocusEventImpl('focusin', {
            bubbles: true,
            composed: true,
          }));
          pageWindow.dispatchEvent(new scope.Event('focus'));
        } catch (_e) {}

        if (!executionMode) {
          const data = await storageGet(['geminiExecutionMode']);
          executionMode = data.geminiExecutionMode || 'temp_chat';
        }

        const steadyAntiThrottleMode = getAntiThrottleModeForExecutionMode(executionMode);
        setAntiThrottleMode(steadyAntiThrottleMode);

        let tempChatResult = { success: false };
        if (executionMode === 'temp_chat') {
          reportProgress('🔒 ATIVANDO CONVERSA TEMPORÁRIA...', job.mangaTabId);
          debugConsole('log', '[MangaTranslator Gemini] Ativando conversa temporária...');
          sendLog(
            'info',
            'GEMINI_STEP_TEMP_CHAT',
            'Ativando conversa temporária no Gemini',
            {}
          );

          try {
            const tempStatus = await temporaryChatApi.ensureActive({
              root,
              timeoutMs: 12_000,
              sleep,
            });

            tempChatResult = {
              success:
                tempStatus.status === 'already_active' ||
                tempStatus.status === 'activated_verified',
              alreadyActive: tempStatus.status === 'already_active',
              activated: tempStatus.status === 'activated_verified',
              notFound: tempStatus.status === 'unavailable',
              verificationFailed: tempStatus.status === 'verification_failed',
              status: tempStatus.status,
            };

            sendLog(
              'info',
              'GEMINI_TEMP_CHAT_STATUS',
              'Status da conversa temporária',
              { status: tempStatus.status }
            );

            if (
              tempStatus.status === 'activated_verified' ||
              tempStatus.status === 'already_active'
            ) {
              await sleep(1500);
            } else if (tempStatus.status === 'verification_failed') {
              sendLog(
                'warn',
                'GEMINI_TEMP_CHAT_VERIFY_FAILED',
                'Clique não confirmou ativação da conversa temporária',
                {}
              );
            }
          } catch (error) {
            debugConsole(
              'warn',
              '[MangaTranslator Gemini] Aviso ao ativar conversa temporária:',
              error && error.message
            );
            sendLog(
              'warn',
              'GEMINI_TEMP_CHAT_ERR',
              `Aviso ao ativar conversa temporária: ${error.message}`,
              {}
            );
          }
        }

        // O aparecimento do wrapper não comprova que o editor esteja hidratado.
        // A seleção é renovada entre métodos; nunca reutiliza nó desconectado.
        let stableComposer = await waitForStableComposer();
        const liveEditor = stableComposer.composer;
        const liveEditable = stableComposer.editor;
        reportProgress('📎 ANEXANDO IMAGEM...', job.mangaTabId);
        const file = dataURLtoFile(job.srcData, 'manga_page.png');
        assertStage(file.size > 0, 'Imagem gerada vazia.', 3, 'PNG verificado no buffer');
        let attachmentResult;
        try {
          // Variante 01 mantém a aba/janela no contexto original.
          sendLog('info', 'GEMINI_ATTACHMENT_CONTEXT', 'Contexto antes do upload', {
            variant: 'MT-UNICO-01', executionMode, ...attachmentSnapshot(),
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
          });
          attachmentResult = await attachmentApi.attachFile({
            file, editor: stableComposer.editor, editorRoot: stableComposer.composer, root,
            getEditor: () => selectLiveComposer()?.editor || null,
            getEditorRoot: () => selectLiveComposer()?.composer || null,
            timeoutMs: 20_000, retryAfterMs: 3500, maxDispatches: 3, sleep,
            // Eventos de upload continuam no content script.
            onAttempt: detail => sendLog('info', 'GEMINI_ATTACHMENT_METHOD', 'Método de upload observado', {
              variant: 'MT-UNICO-01', executionMode, ...detail, ...attachmentSnapshot(),
              jobIdPrefix: String(job.jobId || '').slice(0, 8),
            }),
          });
        } finally {
          // Nenhum contexto físico foi alterado nesta variante.
        }
        const uploadMeta = {
          variant: 'MT-UNICO-01', executionMode,
          methodsAttempted: attachmentResult.methodsAttempted,
          signalObserved: attachmentResult.signalObserved,
          evidenceType: attachmentResult.evidence?.type || null,
          ...attachmentSnapshot(),
        };
        if (!attachmentResult.confirmed) {
          sendLog('error', 'GEMINI_ATTACHMENT_NOT_CONFIRMED', 'Anexo não confirmou em 20s; prompt não enviado', uploadMeta);
          const attachmentError = new Error('Anexo não confirmado em 20s; prompt não enviado.');
          attachmentError.code = 'GEMINI_ATTACHMENT_NOT_CONFIRMED';
          throw attachmentError;
        }
        sendLog('success', 'GEMINI_STEP_3_OK', 'Anexo confirmado antes do prompt', uploadMeta);
        await sleep(1000);

        reportProgress('📤 ENVIANDO PROMPT...', job.mangaTabId);
        debugConsole('log', '[MangaTranslator Gemini] Injetando prompt e enviando...');

        const fallbackPrompt =
          'Crie uma imagem traduzindo todas as falas desta imagem para o Português. Mantenha o sentido original e apenas altere ou modifique o texto na imagem.';
        const actualPrompt =
          job.prompt && String(job.prompt).trim().length > 0
            ? job.prompt
            : fallbackPrompt;

        if (actualPrompt === fallbackPrompt && !job.prompt?.trim?.()) {
          sendLog(
            'error',
            'PROMPT_FALLBACK',
            'Prompt falhou ou está vazio. Usando emergência!',
            { fallbackLength: fallbackPrompt.length }
          );
        }

        const activeEditor =
          root.querySelector('rich-textarea, .ql-editor, [contenteditable="true"]') ||
          liveEditor;
        const activeEditable =
          root.querySelector(
            'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
          ) ||
          domApi.getEditableElement(activeEditor) ||
          liveEditable;

        const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;
        pageWindow.dispatchEvent(new CustomEventImpl(
          'MANGA_TRANSLATOR_SET_PROMPT',
          { detail: { prompt: actualPrompt } }
        ));
        await sleep(200);

        setPromptInEditor(activeEditable, activeEditor, actualPrompt);

        const promptLength = String(activeEditable.textContent || '').trim().length;
        assertStage(
          promptLength >= 5,
          `O prompt não foi inserido. Comprimento: ${promptLength}`,
          4,
          'Prompt injetado com sucesso.'
        );
        sendLog(
          'success',
          'PROMPT_INJECTED',
          'Prompt confirmado no DOM',
          { promptLen: promptLength }
        );
        await sleep(1000);

        const ignoreImages = new Set(
          Array.from(root.querySelectorAll('img'))
            .map(image => getImageSource(image))
            .filter(Boolean)
        );

        activeObserver = observerApi.createGeminiObserver({
          jobId: job.jobId,
          root,
          editor: activeEditable,
          getEditor: () =>
            root.querySelector(
              'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
            ) || activeEditable,
          ignoreImages,
          imageQuarantine,
          onStateChange: (type, detail) => {
            if (type === 'result_candidate_rejected' || type === 'result_candidate_accepted') {
              sendLog('info', type === 'result_candidate_rejected' ? 'GEMINI_RESULT_REJECTED' : 'GEMINI_RESULT_ACCEPTED',
                type === 'result_candidate_rejected' ? 'Candidato descartado pelo contexto da imagem' : 'Resposta do modelo validada', {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                  reason: detail?.reason, sourceType: detail?.sourceType,
                  ownerTag: detail?.ownerTag || null,
                });
            }
            if (type === 'generation_started') {
              sendLog(
                'info',
                'GEMINI_GENERATION_ACTIVE',
                'Geração observada na UI',
                { executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8), reason: detail && detail.reason }
              );
              if (!watchdogRefreshRequested) {
                watchdogRefreshRequested = true;
                const refreshMetadata = {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                };
                const reportRefresh = (response, error) => {
                  const ok = !error && response?.ok === true && response.refreshed === true;
                  sendLog(ok ? 'success' : 'warn',
                    ok ? 'GEMINI_WATCHDOG_REFRESH_CONFIRMED' : 'GEMINI_WATCHDOG_REFRESH_FAILED',
                    ok ? 'Watchdog reiniciado após o início da geração' : 'Não foi possível reiniciar o watchdog',
                    refreshMetadata);
                };
                sendLog('info', 'GEMINI_WATCHDOG_REFRESH_REQUESTED',
                  'Solicitando novo prazo de 5 min a partir do início da geração', refreshMetadata);
                try {
                  runtime.sendMessage({
                    action: 'REFRESH_JOB_WATCHDOG', jobId: job.jobId,
                  }, response => reportRefresh(response, runtime.lastError));
                } catch (error) {
                  reportRefresh(null, error);
                }
              }
            }
          },
        }).start();

        pageWindow.__mangaTranslatorActiveGeminiObserver = activeObserver;
        sendLog(
          'info',
          'GEMINI_OBSERVER_READY',
          'Observer instalado antes do submit',
          { jobIdPrefix: String(job.jobId || '').slice(0, 8) }
        );

        let submission;
        try {
          submission = await editorApi.submitWithConfirmation({
            observer: activeObserver,
            getEditor: () =>
              root.querySelector(
                'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
              ) || activeEditable,
            getSendButton: () => domApi.findSendButton(root.body),
            maxAttempts: 2,
            confirmationTimeoutMs: 5000,
            sleep,
            onAttempt: attempt => {
              sendLog(
                'info',
                'GEMINI_SUBMIT_ATTEMPT',
                'Tentativa de submit iniciada',
                { attempt }
              );

              if (attempt === 2) {
                // Retry local; não ativa aba/janela nem dispara DO_SEND_NOW.
                setAntiThrottleMode('legacy');
                sendLog('warn', 'GEMINI_SEND_RETRY_BACKGROUND', 'Nova tentativa de envio em segundo plano', {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                });
              }
            },
            mainWorldFallback: async () => {
              pageWindow.dispatchEvent(new CustomEventImpl(
                'MANGA_TRANSLATOR_TRIGGER_SEND'
              ));
              sendLog(
                'warn',
                'GEMINI_SEND_FALLBACK',
                'Fallback MAIN-world tentado; aguardando confirmação observável',
                {}
              );
              return true;
            },
          });
        } catch (submitError) {
          if (submitError?.code === 'GEMINI_SUBMISSION_NOT_CONFIRMED') {
            sendLog(
              'error',
              'GEMINI_SUBMISSION_NOT_CONFIRMED',
              'Nenhuma transição da UI confirmou o envio após duas tentativas',
              {}
            );
            const error = new Error('GEMINI_SUBMISSION_NOT_CONFIRMED');
            error.code = 'GEMINI_SUBMISSION_NOT_CONFIRMED';
            throw error;
          }
          throw submitError;
        }

        setAntiThrottleMode(steadyAntiThrottleMode);
        sendLog(
          'success',
          'GEMINI_SEND_SUCCESS',
          'Envio confirmado por transição observável da UI',
          { attempt: submission.attempt, reason: submission.reason }
        );
        debugConsole(
          'log',
          '[MangaTranslator Gemini] Envio confirmado pelo Observer V2.',
          { attempt: submission.attempt, reason: submission.reason }
        );
        assertStage(
          submission && submission.confirmed,
          'Envio não foi confirmado pela interface.',
          4,
          'Submit confirmado pela UI'
        );

        reportProgress('🧠 GEMINI PROCESSANDO...', job.mangaTabId);
        createGeminiManualPanel(job, () => ignoreImages);

        const shouldDeleteConversation =
          executionMode === 'minimized_window' ||
          executionMode === 'background_delete' ||
          (
            executionMode === 'temp_chat' &&
            tempChatResult.notFound &&
            !tempChatResult.alreadyActive
          );

        const configuredTimeout = Number(scope.__MT_GEMINI_GENERATION_TIMEOUT_MS__);
        const waitTimeoutMs =
          Number.isFinite(configuredTimeout) && configuredTimeout > 0
            ? configuredTimeout
            : 4 * 60 * 1000;

        const waitStartedAt = Date.now();
        const progressTimer = setIntervalFn(() => {
          const elapsedSeconds = Math.floor((Date.now() - waitStartedAt) / 1000);
          reportProgress(
            `🧠 GEMINI PROCESSANDO (${elapsedSeconds}s)...`,
            job.mangaTabId
          );
        }, 5000);

        let resultUrl = null;
        let resultImageElement = null;

        try {
          const observedResult = await activeObserver.waitForResult(waitTimeoutMs);
          resultUrl = observedResult && observedResult.url;
          resultImageElement = observedResult && observedResult.image;
        } catch (waitError) {
          if (waitError?.code === 'GEMINI_UI_ERROR') {
            sendLog(
              'error',
              'GEMINI_ERROR',
              'Erro visível da UI detectado pelo Observer V2',
              { messageLength: String(waitError.message || '').length }
            );
            await deliverWithSecureDeletion({
              action: 'GEMINI_ERROR',
              mangaTabId: job.mangaTabId,
              index: job.index,
              error:
                `Retornou erro interface: ${String(waitError.message || 'Erro da interface do Gemini')}`,
              jobId: job.jobId,
              batchId: job.batchId,
            }, shouldDeleteConversation);
            return { status: 'ui_error' };
          }

          if (waitError?.code === 'GEMINI_RESULT_TIMEOUT') {
            sendLog(
              'error',
              'GEMINI_TIMEOUT',
              'Timeout de geração aguardando Observer V2',
              {}
            );
            await deliverWithSecureDeletion({
              action: 'GEMINI_ERROR',
              mangaTabId: job.mangaTabId,
              index: job.index,
              error: 'Tempo limite (4 min)',
              jobId: job.jobId,
              batchId: job.batchId,
            }, shouldDeleteConversation);
            return { status: 'result_timeout' };
          }

          throw waitError;
        } finally {
          clearIntervalFn(progressTimer);
        }

        assertStage(
          resultUrl &&
            (
              resultUrl.startsWith('http') ||
              resultUrl.startsWith('blob') ||
              resultUrl.startsWith('data:image/')
            ),
          'URL Imagem inválida',
          5,
          'Mídia extraída blob'
        );

        sendLog(
          'success',
          'GEMINI_IMG_FOUND',
          'Imagem gerada!',
          getUrlLogMetadata(resultUrl)
        );
        reportProgress('📥 EXTRAINDO IMAGEM...', job.mangaTabId);

        if (
          resultUrl.includes('googleusercontent.com') &&
          /=s\d+/.test(resultUrl)
        ) {
          resultUrl = resultUrl.replace(/=s\d+[^?#]*/, '=s0');
        }

        const extraction = await resultExtractor.extractOrAuxiliaryFallback({
          resultImageElement,
          resultUrl,
          executionMode,
          maxAttempts: 4,
          retryDelayMs: 1000,
          onAuxiliaryFallback: async ({ url }) => {
            return deliverWithSecureDeletion({
              action: 'GEMINI_RESULT_URL',
              mangaTabId: job.mangaTabId,
              index: job.index,
              url,
              jobId: job.jobId,
              batchId: job.batchId,
            }, shouldDeleteConversation);
          },
        });

        if (extraction.kind === 'extracted' && extraction.dataUrl) {
          try {
            const quarantineResult = await imageQuarantine.assessExtractedResult({
              element: resultImageElement,
              candidateDataUrl: extraction.dataUrl,
              inputDataUrl: job.srcData,
              inputHash: inputImageHash,
            });
            if (quarantineResult.quarantined) {
              sendLog(
                'error',
                'GEMINI_RESULT_MATCHES_INPUT',
                'Resultado bloqueado pela quarentena de imagem',
                { reason: quarantineResult.reason, exactMatch: quarantineResult.exactMatch === true }
              );
              const quarantineError = new Error('O resultado do Gemini é idêntico à imagem de entrada.');
              quarantineError.code = 'GEMINI_RESULT_MATCHES_INPUT';
              quarantineError.alreadyLogged = true;
              throw quarantineError;
            }
          } catch (quarantineError) {
            if (quarantineError?.code === 'GEMINI_RESULT_MATCHES_INPUT') throw quarantineError;
            sendLog(
              'warn',
              'GEMINI_QUARANTINE_HASH_UNAVAILABLE',
              'A comparação exata do resultado falhou; o fluxo continuará com os filtros estruturais',
              { messageLength: String(quarantineError?.message || '').length }
            );
          }

          await deliverWithSecureDeletion({
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: job.mangaTabId,
            index: job.index,
            src: extraction.dataUrl,
            jobId: job.jobId,
            batchId: job.batchId,
          }, shouldDeleteConversation);
        }

        return {
          status: extraction.kind === 'extracted'
            ? 'delivered_extracted'
            : 'delivered_auxiliary',
        };
      } catch (error) {
        if (!error?.alreadyLogged) {
          sendLog(
            'error',
            error?.code || 'GEMINI_ERROR',
            'Job Gemini encerrado com erro',
            {
              executionMode,
              index: job.index,
              messageLength: String(error?.message || '').length,
            }
          );
        }
        runtime.sendMessage({
          action: 'GEMINI_ERROR',
          mangaTabId: job.mangaTabId,
          index: job.index,
          error: error.message,
          jobId: job.jobId,
          batchId: job.batchId,
        });
        return { status: 'error', error };
      } finally {
        setAntiThrottleMode('minimal');

        if (activeObserver) {
          try { activeObserver.stop(); } catch (_e) {}
          activeObserver = null;
        }

        if (pageWindow.__mangaTranslatorActiveGeminiObserver) {
          delete pageWindow.__mangaTranslatorActiveGeminiObserver;
        }

        stopScrollAssist();
        closeKeepAlive();
        removeGeminiManualPanel();

        if (pageWindow.__mangaTranslatorManualPickHandler) {
          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
          delete pageWindow.__mangaTranslatorManualPickHandler;
        }

        root.querySelectorAll('img').forEach(image => {
          if (image.style.outline?.includes('#FF4444')) {
            image.style.outline = '';
            image.style.outlineOffset = '';
          }
        });
      }
    }

    function getActiveObserver() {
      return activeObserver;
    }

    return {
      run,
      dataURLtoFile,
      waitForElement,
      tryClickModelImageCards,
      isLikelyGeneratedImage,
      isManualSelectableImage,
      findGeneratedResultImages,
      setManualGeminiResultUrl,
      removeGeminiManualPanel,
      createGeminiManualPanel,
      setPromptInEditor,
      shouldKeepConversationForDebug,
      requestImageData,
      getAntiThrottleModeForExecutionMode,
      setAntiThrottleMode,
      getActiveObserver,
    };
  }

  const api = { createGeminiJobRunner };
  scope.MangaTranslatorGeminiJobRunner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

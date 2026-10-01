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

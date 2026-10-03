'use strict';
// background/jobs-dom-ack.js -- Entrega resultado ao leitor e só libera após ACK/persistência.

(function(scope) {
  function createDomAckDelivery({ updateJobState, finalizeJob, log, timeoutMs = 30_000 }) {
    function deliver({
      mangaTabId, index, src, jobId, batchId, geminiTabId,
      finalizeOnAck = true,
    }) {
      return new Promise(resolve => {
        Promise.resolve(updateJobState(geminiTabId, { state: 'result_received' })).catch(() => {});
        let settled = false;
        let timer = null;

        const settle = async (ok, reason, response = null) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);

          if (ok) {
            try {
              await updateJobState(geminiTabId, {
                state: 'dom_applied',
                resultPersisted: true,
                resultPersistedAt: Date.now(),
              });
            } catch (_e) {}
          } else {
            log('warn', 'bg', 'DOM_APPLY_FAIL',
              `Resultado não confirmado pela aba do mangá: ${reason}`,
              { index, reason, jobId: String(jobId || '').slice(0, 8), batchId: String(batchId || '').slice(0, 8) });
          }

          if (finalizeOnAck) {
            try {
              await finalizeJob(geminiTabId, mangaTabId, !ok);
            } catch (_e) {}
          }

          resolve({
            ok,
            reason,
            persisted: ok && response?.persisted !== false,
            domApplied: response?.domApplied !== false,
          });
        };

        timer = setTimeout(() => {
          void settle(false, 'ack_timeout');
        }, timeoutMs);
        if (timer && typeof timer.unref === 'function') timer.unref();

        try {
          chrome.tabs.sendMessage(mangaTabId, {
            action: 'UPDATE_IMAGE',
            index,
            newSrc: src,
            jobId,
            batchId,
            expectAck: true,
          }, response => {
            const error = chrome.runtime.lastError;
            if (error) {
              const legacyNoAck = /message channel closed/i.test(error.message || '');
              const legacyAccepted = legacyNoAck && finalizeOnAck;
              void settle(
                legacyAccepted,
                legacyNoAck
                  ? (legacyAccepted ? 'legacy_no_ack' : 'ack_required_for_staging')
                  : (error.message || 'send_failed'),
                response
              );
            } else if (response && response.ok === false) {
              void settle(false, response.reason || 'rejected_by_page', response);
            } else {
              void settle(true, 'ack', response);
            }
          });
        } catch (error) {
          void settle(false, error && error.message ? error.message : 'send_exception');
        }
      });
    }

    return { deliver };
  }

  scope.MangaTranslatorJobsDomAck = { createDomAckDelivery };
})(typeof self !== 'undefined' ? self : globalThis);

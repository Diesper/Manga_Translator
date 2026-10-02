'use strict';
// background/jobs-dom-ack.js -- Entrega resultado ao leitor e só libera após ACK/persistência.

(function(scope) {
  function createDomAckDelivery({ updateJobState, finalizeJob, log, timeoutMs = 30_000 }) {
    const safeLog = (...args) => {
      if (typeof log !== 'function') return;
      try { log(...args); } catch (_error) {
        // Telemetria não pode quebrar o protocolo de ACK.
      }
    };

    function deliver({
      mangaTabId, index, src, jobId, batchId, geminiTabId,
      finalizeOnAck = true,
    }) {
      return new Promise(resolve => {
        let settled = false;
        let timer = null;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(result);
        };

        const settle = async (ok, reason, response = null, { legacyAccepted = false } = {}) => {
          if (settled) return;

          const persisted = response?.persisted === true;
          const domApplied = response?.domApplied !== false;
          let effectiveOk = ok === true;
          let effectiveReason = reason;

          if (effectiveOk && !legacyAccepted && !persisted) {
            effectiveOk = false;
            effectiveReason = 'persistence_not_confirmed';
          }

          if (effectiveOk && persisted) {
            try {
              await updateJobState(geminiTabId, {
                state: 'dom_applied',
                resultPersisted: true,
                resultPersistedAt: Date.now(),
              });
            } catch (error) {
              effectiveOk = false;
              effectiveReason = 'state_update_failed';
              safeLog('error', 'bg', 'DOM_ACK_STATE_UPDATE_FAILED',
                'ACK de persistência recebido, mas o estado durável do job não pôde ser atualizado.', {
                  index,
                  jobId: String(jobId || '').slice(0, 8),
                  errorName: error && error.name ? error.name : 'Error',
                });
            }
          }

          if (!effectiveOk) {
            safeLog('warn', 'bg', 'DOM_APPLY_FAIL',
              `Resultado não confirmado pela aba do mangá: ${effectiveReason}`,
              {
                index,
                reason: effectiveReason,
                jobId: String(jobId || '').slice(0, 8),
                batchId: String(batchId || '').slice(0, 8),
              });
          }

          if (finalizeOnAck && effectiveReason !== 'state_update_failed') {
            try {
              await finalizeJob(geminiTabId, mangaTabId, !effectiveOk);
            } catch (error) {
              safeLog('error', 'bg', 'DOM_ACK_FINALIZE_FAILED',
                'Falha ao finalizar job após conclusão do handshake DOM.', {
                  index,
                  jobId: String(jobId || '').slice(0, 8),
                  errorName: error && error.name ? error.name : 'Error',
                });
              finish({
                ok: false,
                reason: 'finalize_failed',
                persisted,
                domApplied,
              });
              return;
            }
          }

          finish({
            ok: effectiveOk,
            reason: effectiveReason,
            persisted: effectiveOk && persisted,
            domApplied,
          });
        };

        timer = setTimeout(() => {
          void settle(false, 'ack_timeout');
        }, timeoutMs);
        if (timer && typeof timer.unref === 'function') timer.unref();

        const start = async () => {
          try {
            await updateJobState(geminiTabId, { state: 'result_received' });
          } catch (error) {
            safeLog('warn', 'bg', 'DOM_RESULT_RECEIVED_STATE_FAILED',
              'Não foi possível registrar result_received antes do ACK.', {
                index,
                jobId: String(jobId || '').slice(0, 8),
                errorName: error && error.name ? error.name : 'Error',
              });
          }

          if (settled) return;

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
                  response,
                  { legacyAccepted }
                );
                return;
              }

              if (!response || response.ok !== true) {
                void settle(false, response?.reason || 'ack_missing', response);
                return;
              }

              if (response.persisted !== true) {
                void settle(false, response.reason || 'persistence_not_confirmed', response);
                return;
              }

              void settle(true, 'ack', response);
            });
          } catch (error) {
            void settle(false, error && error.message ? error.message : 'send_exception');
          }
        };

        void start();
      });
    }

    return { deliver };
  }

  scope.MangaTranslatorJobsDomAck = { createDomAckDelivery };
})(typeof self !== 'undefined' ? self : globalThis);

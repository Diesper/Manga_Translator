'use strict';
// background/actions/report-error.js -- Reporta erro somente do job realmente pertencente ao remetente.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'report-error',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      if (typeof request.error !== 'string' || request.error.trim().length === 0 || request.error.length > 4096) {
        return { code: 'INVALID_PAYLOAD', message: 'erro inválido' };
      }
      return null;
    },

    async execute(request, context) {
      await context.ensureInitialized();
      const { mangaTabId, index, error, jobId, batchId } = request;

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'Erro Gemini descartado: aba remetente não é dona de um job ativo.', {
            jobId: String(jobId || '').slice(0, 8),
          });
        return { ok: false, reason: 'sender_mismatch' };
      }

      const job = ownership.job;
      const identityMismatch =
        (batchId && job.batchId && batchId !== job.batchId) ||
        (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) ||
        (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId);

      if (identityMismatch) {
        context.log('warn', 'bg', 'ERROR_JOB_IDENTITY_MISMATCH',
          'Erro rejeitado porque a identidade recebida não corresponde ao job persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      const debug = await context.storage.get(['debugMode']);
      chrome.tabs.sendMessage(job.mangaTabId ?? mangaTabId, {
        action: 'SHOW_ERROR_INTEGRATED',
        errorMsg: error,
        imgIndex: job.index ?? index,
        isDebug: Boolean(debug.debugMode),
        jobId,
        batchId: job.batchId ?? batchId,
      }, () => { if (chrome.runtime.lastError) {} });

      await context.finalizeJob(
        ownership.tabId,
        job.mangaTabId ?? mangaTabId,
        true
      );
      return {};
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

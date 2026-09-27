'use strict';
// background/actions/deliver-result-url.js -- Abre aba temporária preservando a identidade real do job.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'deliver-result-url',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      if (typeof request.url !== 'string' || request.url.length === 0 ||
          !/^(https?:|blob:|data:image\/)/i.test(request.url)) {
        return { code: 'INVALID_PAYLOAD', message: 'url de resultado inválida' };
      }
      return null;
    },

    async execute(request, context) {
      const { mangaTabId, index, url, jobId, batchId } = request;
      await context.ensureInitialized();

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'URL de resultado descartada: aba remetente não é dona de um job ativo.', {
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
        context.log('error', 'bg', 'AUX_URL_JOB_IDENTITY_MISMATCH',
          'Fallback por URL rejeitado: identidade não corresponde ao job persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      const newTab = await new Promise(resolve => {
        chrome.tabs.create({ url, active: false }, resolve);
      });

      context.state.extractionTabs[newTab.id] = {
        mangaTabId: job.mangaTabId ?? mangaTabId,
        index: job.index ?? index,
        geminiTabId: ownership.tabId,
        jobId,
        batchId: job.batchId ?? batchId,
      };
      await context.updateJobState(ownership.tabId, {
        state: 'awaiting_auxiliary_extraction',
        auxiliaryTabId: newTab.id,
      });
      await context.syncState();

      context.log('info', 'bg', 'AUXILIARY_EXTRACTION_REGISTERED',
        'Aba auxiliar registrada sem finalizar o job Gemini.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(job.batchId || batchId || '').slice(0, 8),
          extractionTabId: newTab.id,
        });

      return { extractionRegistered: true };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

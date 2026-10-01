'use strict';
// background/actions/deliver-result.js -- Valida o job e faz staging durável no leitor.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'deliver-result',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.src !== 'string' || request.src.length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'src da imagem é obrigatório' };
      }
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      return null;
    },

    async execute(request, context) {
      await context.ensureInitialized();
      const { mangaTabId, index, src, jobId, batchId } = request;

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'Resultado Gemini descartado: aba remetente não é dona de um job ativo.', {
            jobId: String(jobId || '').slice(0, 8),
            batchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'sender_mismatch' };
      }

      const job = ownership.job;
      const identityMismatch =
        (batchId && job.batchId && batchId !== job.batchId) ||
        (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) ||
        (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId);

      if (identityMismatch) {
        context.log('error', 'bg', 'RESULT_JOB_IDENTITY_MISMATCH',
          'Resultado rejeitado porque jobId/batch/index/origem não correspondem ao registro persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
            expectedIndex: job.index,
            receivedIndex: index,
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      const geminiTabId = ownership.tabId;
      const staged = await context.deliverResultToManga({
        mangaTabId: job.mangaTabId ?? mangaTabId,
        index: job.index ?? index,
        src,
        jobId,
        batchId: job.batchId ?? batchId,
        geminiTabId,
        finalizeOnAck: false,
      });

      if (!staged?.ok || staged.persisted === false) {
        context.log('error', 'bg', 'RESULT_STAGE_FAILED',
          'Resultado não recebeu confirmação de aplicação/persistência no leitor.', {
            jobId: String(jobId || '').slice(0, 8),
            batchId: String(job.batchId || batchId || '').slice(0, 8),
            reason: staged?.reason || 'unknown',
          });
        return { ok: false, reason: staged?.reason || 'stage_failed' };
      }

      context.log('success', 'bg', 'RESULT_STAGED_DURABLY',
        'Resultado aplicado e persistido antes da exclusão/finalização do Gemini.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(job.batchId || batchId || '').slice(0, 8),
          index: job.index ?? index,
        });

      return { staged: true, persisted: true };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

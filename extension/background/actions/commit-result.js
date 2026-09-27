'use strict';
// background/actions/commit-result.js -- Finaliza um resultado somente após persistência confirmada.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'commit-result',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      return null;
    },

    async execute(request, context) {
      await context.ensureInitialized();

      const { jobId, batchId } = request;
      const senderTabId = context.sender && context.sender.tab ? context.sender.tab.id : null;

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'RESULT_COMMIT_REJECTED',
          'Commit de resultado rejeitado: job não pertence ao remetente ou não está mais ativo.', {
            jobId: String(jobId || '').slice(0, 8),
            batchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_not_live' };
      }

      const job = ownership.job;
      if (batchId && job.batchId && batchId !== job.batchId) {
        context.log('warn', 'bg', 'RESULT_COMMIT_REJECTED',
          'Commit de resultado rejeitado: batch não corresponde ao job persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      if (job.resultPersisted !== true && job.state !== 'dom_applied') {
        context.log('error', 'bg', 'RESULT_COMMIT_BEFORE_PERSIST',
          'Commit recusado porque o resultado ainda não possui ACK de persistência.', {
            jobId: String(jobId || '').slice(0, 8),
            batchId: String(job.batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'result_not_persisted' };
      }

      const geminiTabId = ownership.tabId ?? senderTabId ?? job.geminiTabId;
      await context.updateJobState(geminiTabId, {
        state: 'result_committed',
        resultCommittedAt: Date.now(),
      });

      context.log('success', 'bg', 'RESULT_COMMIT_ACCEPTED',
        'Resultado persistido confirmado; job liberado para finalização segura.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(job.batchId || '').slice(0, 8),
        });

      await context.finalizeJob(
        geminiTabId,
        job.mangaTabId ?? request.mangaTabId,
        false
      );

      return { committed: true };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

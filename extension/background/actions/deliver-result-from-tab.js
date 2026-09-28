'use strict';
// background/actions/deliver-result-from-tab.js -- Entrega resultado da aba auxiliar sem depender de currentBatchId.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'deliver-result-from-tab',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      if (typeof request.src !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(request.src)) {
        return { code: 'INVALID_PAYLOAD', message: 'src de resultado inválido' };
      }
      return null;
    },

    async execute(request, context) {
      await context.ensureInitialized();
      const senderTabId = context.sender && context.sender.tab ? context.sender.tab.id : null;
      const mapping = senderTabId !== null && context.state.extractionTabs[senderTabId];

      if (!mapping || mapping.jobId !== request.jobId) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'Resultado de aba temporária descartado: mapeamento ou job incompatível.', {
            jobId: String(request.jobId || '').slice(0, 8),
          });
        return { ok: false, reason: 'sender_mismatch' };
      }

      const { mangaTabId, index, geminiTabId, jobId, batchId } = mapping;
      const ownership = await new Promise(resolve => {
        context.assertJobOwnership({ tab: { id: geminiTabId } }, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'Resultado de aba temporária descartado: job do Gemini não está mais ativo.', {
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
        context.log('error', 'bg', 'AUX_RESULT_JOB_IDENTITY_MISMATCH',
          'Resultado auxiliar rejeitado: identidade não corresponde ao job persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      const staged = await context.deliverResultToManga({
        mangaTabId: job.mangaTabId ?? mangaTabId,
        index: job.index ?? index,
        src: request.src,
        jobId,
        batchId: job.batchId ?? batchId,
        geminiTabId: ownership.tabId,
        finalizeOnAck: false,
      });

      if (!staged?.ok || staged.persisted === false) {
        context.log('error', 'bg', 'AUX_RESULT_STAGE_FAILED',
          'Resultado da aba auxiliar não recebeu ACK de persistência; aba mantida para retry.', {
            jobId: String(jobId || '').slice(0, 8),
            reason: staged?.reason || 'unknown',
          });
        return { ok: false, reason: staged?.reason || 'stage_failed' };
      }

      if (senderTabId !== null) {
        chrome.tabs.remove(senderTabId, () => { if (chrome.runtime.lastError) {} });
        delete context.state.extractionTabs[senderTabId];
      }
      await context.syncState();

      context.log('success', 'bg', 'AUX_RESULT_STAGED_DURABLY',
        'Resultado auxiliar foi persistido; job agora pode ser finalizado com segurança.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(job.batchId || batchId || '').slice(0, 8),
        });

      await context.finalizeJob(
        ownership.tabId,
        job.mangaTabId ?? mangaTabId,
        false
      );

      return { staged: true, persisted: true, committed: true };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

'use strict';
// background/jobs-reconciliation.js -- Rebuilds active job accounting after worker suspension.

(function(scope) {
  function createReconciler({
    state,
    tabExists,
    log,
    syncState,
    processNextJob,
    recoverPendingFinalization,
    recoverPersistedResult,
    resolveCanonicalTabId = async tabId => tabId,
    migrateTabIdentity = async (_oldTabId, newTabId) => newTabId,
  }) {
    async function reconcile() {
      if (!Array.isArray(state.jobIndex) || state.jobIndex.length === 0) {
        state.activeJobsCount = 0;
        return { alive: 0, dropped: 0 };
      }

      const alive = [];
      const dropped = [];
      const foreign = [];
      let recovered = 0;
      for (const entry of state.jobIndex) {
        if (!entry) continue;
        const originalTabId = entry.geminiTabId;
        const canonicalTabId = await resolveCanonicalTabId(originalTabId);
        let canonicalEntry = canonicalTabId === originalTabId
          ? entry
          : { ...entry, geminiTabId: canonicalTabId };

        if (canonicalTabId !== originalTabId) {
          await migrateTabIdentity(originalTabId, canonicalTabId, { jobId: entry.jobId || null });
          canonicalEntry = { ...canonicalEntry, geminiTabId: canonicalTabId };
        }

        // Uma marca de finalização significa que o resultado já foi aceito;
        // ela vence a verificação da aba para não ressuscitar um slot pendente.
        if (typeof recoverPendingFinalization === 'function' && await recoverPendingFinalization(canonicalEntry)) {
          recovered += 1;
          continue;
        }
        if (typeof recoverPersistedResult === 'function' && await recoverPersistedResult(canonicalEntry)) {
          recovered += 1;
          continue;
        }

        const belongsToForeignBatch = Boolean(
          state.currentBatchId &&
          canonicalEntry.batchId &&
          canonicalEntry.batchId !== state.currentBatchId
        );
        if (belongsToForeignBatch) {
          foreign.push(canonicalEntry);
          dropped.push(canonicalEntry);
          try {
            chrome.tabs.remove(canonicalTabId, () => { void chrome.runtime.lastError; });
          } catch (_e) {}
          continue;
        }

        if (await tabExists(canonicalTabId)) alive.push(canonicalEntry);
        else dropped.push(canonicalEntry);
      }

      if (dropped.length) {
        const keys = dropped.flatMap(entry => [
          `gemini_job_${entry.geminiTabId}`,
          `wd_data_${entry.geminiTabId}`,
        ]);
        dropped.forEach(entry => chrome.alarms.clear(`watchdog_${entry.jobId || entry.geminiTabId}`, () => {}));
        try { await chrome.storage.local.remove(keys); } catch (_error) {}
        log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s)/obsoleto(s) descartado(s) após reinício do worker`, {
          dropped: dropped.map(entry => entry.geminiTabId),
          foreignBatchJobs: foreign.map(entry => entry.geminiTabId),
        });
        if (foreign.length) {
          log('warn', 'bg', 'JOB_RECONCILE_FOREIGN_BATCH_DROP',
            'Jobs de lotes anteriores foram descartados para não contaminar o lote corrente.', {
              currentBatchId: String(state.currentBatchId || '').slice(0, 8),
              jobs: foreign.map(entry => ({
                geminiTabId: entry.geminiTabId,
                batchId: String(entry.batchId || '').slice(0, 8),
                jobId: String(entry.jobId || '').slice(0, 8),
              })),
            });
        }
      }

      state.jobIndex = alive;
      state.activeJobsCount = alive.length;
      if (alive.length && !state.activeMangaTabId) state.activeMangaTabId = alive[0].mangaTabId || null;
      return { alive: alive.length, dropped: dropped.length, recovered, foreign: foreign.length };
    }

    async function reconcileAndContinue() {
      const result = await reconcile();
      if (result.dropped || result.alive || result.recovered) {
        await syncState();
        if (result.dropped || result.recovered) processNextJob();
      }
      return result;
    }

    return { reconcile, reconcileAndContinue };
  }

  scope.MangaTranslatorJobsReconciliation = { createReconciler };
})(typeof self !== 'undefined' ? self : globalThis);

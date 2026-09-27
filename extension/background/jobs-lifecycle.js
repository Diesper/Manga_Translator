'use strict';
// background/jobs-lifecycle.js -- Abertura, finalização e contabilidade dos jobs.
// Este módulo recebe todas as dependências explícitas para não criar outro estado
// em memória além do snapshot mantido pelo background/state.js.

(function(scope) {
  function createLifecycle(deps) {
    const {
      state, log, syncState, sendProgress, armWatchdog, clearWatchdog,
      indexAddJob, indexRemoveJob, indexJobsOfBatch, delay, generateId,
      markFinalized, isFinalized, finalizedMarkerTtlMinutes,
      resolveCanonicalTabId = async tabId => tabId,
      migrateTabIdentity = async (_oldTabId, newTabId) => newTabId,
    } = deps;

    const markerKey = tabId => `gemini_finalized_${tabId}`;
    const markerAlarm = tabId => `finalization_marker_${tabId}`;

    function clonePendingBatches(value) {
      return Array.isArray(value)
        ? value.map(batch => ({
            ...batch,
            images: Array.isArray(batch?.images)
              ? batch.images.map(image => ({ ...image }))
              : [],
          }))
        : [];
    }

    function activateBatchSnapshot(snapshot, batch) {
      snapshot.currentBatchId = batch.batchId;
      snapshot.stopRequested = false;
      snapshot.jobQueue = (Array.isArray(batch.images) ? batch.images : []).map(image => ({
        mangaTabId: batch.mangaTabId,
        index: image.index,
        prompt: batch.prompt || '',
        batchId: batch.batchId,
      }));
      snapshot.completedJobs = 0;
      snapshot.activeJobsCount = 0;
      snapshot.totalJobs = snapshot.jobQueue.length;
      snapshot.activeMangaTabId = batch.mangaTabId || null;
      snapshot.isProcessing = true;
      snapshot.completionClaimedBatchId = null;
      return snapshot;
    }

    async function promotePendingBatchIfIdle() {
      let promoted = null;
      const transition = snapshot => {
        const pending = clonePendingBatches(snapshot.pendingBatches);
        const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : [];
        const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : [];
        const idle = !snapshot.stopRequested &&
          !snapshot.currentBatchId &&
          !snapshot.isProcessing &&
          queued.length === 0 &&
          Number(snapshot.activeJobsCount) === 0 &&
          indexed.length === 0;

        if (!idle || pending.length === 0) return snapshot;

        promoted = pending.shift();
        snapshot.pendingBatches = pending;
        activateBatchSnapshot(snapshot, promoted);
        return snapshot;
      };

      if (typeof state.mutate === 'function') {
        await state.mutate(transition);
      } else {
        transition(state);
        await syncState();
      }

      if (promoted) {
        log('info', 'bg', 'BATCH_PROMOTED',
          'Próximo lote da fila FIFO foi promovido para execução.', {
            batchId: String(promoted.batchId || '').slice(0, 8),
            pendingCount: Array.isArray(state.pendingBatches) ? state.pendingBatches.length : 0,
            totalJobs: Array.isArray(promoted.images) ? promoted.images.length : 0,
          });
        sendProgress(promoted.mangaTabId, '▶️ INICIANDO LOTE DA FILA...');
      }

      return promoted;
    }

    // chrome.storage não oferece transação entre a marca e o snapshot. O índice
    // persistido funciona como journal: enquanto accountingApplied é falso, o
    // job fica no índice. Se o worker cair nesse intervalo, a reconciliação o
    // encontra e aplica a transição exatamente uma vez.
    async function applyFinalizationAccounting(geminiTabId, job, marker, { recovery = false } = {}) {
      let skippedForeignBatchAccounting = false;
      const transition = snapshot => {
        const indexed = Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : [];
        const belongsToJob = entry => entry && entry.geminiTabId === geminiTabId &&
          (!job.jobId || !entry.jobId || entry.jobId === job.jobId);
        const wasIndexed = indexed.some(belongsToJob);
        // Em recovery, um índice já removido prova que o snapshot com a
        // contabilidade foi salvo antes da suspensão; repetir seria duplicar.
        if (recovery && !wasIndexed) return snapshot;
        snapshot.jobIndex = indexed.filter(entry => !belongsToJob(entry));

        const jobBatchId = job.batchId || null;
        const belongsToCurrentBatch = !jobBatchId ||
          !snapshot.currentBatchId ||
          jobBatchId === snapshot.currentBatchId;

        if (belongsToCurrentBatch) {
          if (!marker.fromError) snapshot.completedJobs = (Number(snapshot.completedJobs) || 0) + 1;
          snapshot.activeJobsCount = Math.max(0, (Number(snapshot.activeJobsCount) || 0) - 1);
        } else {
          skippedForeignBatchAccounting = true;
        }
        return snapshot;
      };

      if (typeof state.mutate === 'function') {
        await state.mutate(transition);
        if (skippedForeignBatchAccounting) {
          log('warn', 'bg', 'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
            'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', {
              jobId: String(job.jobId || '').slice(0, 8),
              jobBatchId: String(job.batchId || '').slice(0, 8),
              currentBatchId: String(state.currentBatchId || '').slice(0, 8),
            });
        }
        return;
      }

      // Ponte para versões que ainda usam a fachada de estado do background.
      const wasIndexed = indexJobsOfBatch(null).some(entry => entry && entry.geminiTabId === geminiTabId &&
        (!job.jobId || !entry.jobId || entry.jobId === job.jobId));
      if (recovery && !wasIndexed) return;
      indexRemoveJob(geminiTabId);
      const belongsToCurrentBatch = !job.batchId || !state.currentBatchId || job.batchId === state.currentBatchId;
      if (belongsToCurrentBatch) {
        if (!marker.fromError) state.completedJobs = (Number(state.completedJobs) || 0) + 1;
        state.activeJobsCount = Math.max(0, (Number(state.activeJobsCount) || 0) - 1);
      } else {
        log('warn', 'bg', 'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
          'Finalização tardia removeu o job, mas não alterou os contadores do lote atual.', {
            jobId: String(job.jobId || '').slice(0, 8),
            jobBatchId: String(job.batchId || '').slice(0, 8),
            currentBatchId: String(state.currentBatchId || '').slice(0, 8),
          });
      }
      await syncState();
    }

    async function recoverPendingFinalization(entry) {
      if (!entry || entry.geminiTabId === null || entry.geminiTabId === undefined) return false;
      const geminiTabId = entry.geminiTabId;
      const key = markerKey(geminiTabId);
      const jobKey = `gemini_job_${geminiTabId}`;
      const data = await chrome.storage.local.get([key, jobKey]);
      const marker = data && data[key];
      if (!marker || marker.expiresAt <= Date.now()) return false;
      const job = (data && data[jobKey]) || entry;
      if (marker.jobId && job.jobId && marker.jobId !== job.jobId) return false;

      markFinalized(geminiTabId);
      if (!marker.accountingApplied) {
        await applyFinalizationAccounting(geminiTabId, job, marker, { recovery: true });
        await chrome.storage.local.set({ [key]: { ...marker, accountingApplied: true, accountingRecoveredAt: Date.now() } });
      }
      clearWatchdog(geminiTabId, job.jobId || entry.jobId);
      await chrome.storage.local.remove([jobKey, `wd_data_${geminiTabId}`]);
      return true;
    }

    async function recoverPersistedResult(entry) {
      if (!entry || entry.geminiTabId === null || entry.geminiTabId === undefined) return false;
      const canonicalTabId = await resolveCanonicalTabId(entry.geminiTabId);
      const jobKey = `gemini_job_${canonicalTabId}`;
      const data = await chrome.storage.local.get([jobKey]);
      const job = data && data[jobKey];

      if (!job || (job.resultPersisted !== true && job.state !== 'dom_applied' && job.state !== 'result_committed')) {
        return false;
      }

      log('warn', 'bg', 'JOB_RECONCILE_PERSISTED_RESULT',
        'Job reidratado já possui resultado persistido; pulando nova geração e finalizando com segurança.', {
          jobId: String(job.jobId || entry.jobId || '').slice(0, 8),
          batchId: String(job.batchId || entry.batchId || '').slice(0, 8),
          geminiTabId: canonicalTabId,
          state: job.state || null,
        });

      await finalizeJob(
        canonicalTabId,
        job.mangaTabId || entry.mangaTabId || null,
        false
      );
      return true;
    }

    async function updateJobState(geminiTabId, patch = {}) {
      if (geminiTabId === null || geminiTabId === undefined) return null;
      const canonicalTabId = await resolveCanonicalTabId(geminiTabId);
      const jobKey = `gemini_job_${canonicalTabId}`;
      const data = await chrome.storage.local.get([jobKey]);
      const job = data && data[jobKey];
      if (!job) return null;
      const next = { ...job, ...patch, geminiTabId: canonicalTabId, canonicalTabId, updatedAt: Date.now() };
      await chrome.storage.local.set({ [jobKey]: next });
      return next;
    }

    async function assertJobOwnership(sender, jobId) {
      const senderTabId = sender && sender.tab ? sender.tab.id : null;
      if (!jobId || senderTabId === null) return { owns: false, tabId: senderTabId, job: null };

      // Caminho comum sem replacement: uma leitura apenas, preservando a
      // latência original. Só consultamos aliases se a chave física não existe.
      let tabId = senderTabId;
      let data = await chrome.storage.local.get([`gemini_job_${tabId}`]);
      let job = data && data[`gemini_job_${tabId}`];
      if (job) return { owns: job.jobId === jobId, tabId, job };

      tabId = await resolveCanonicalTabId(senderTabId);
      if (tabId !== senderTabId) {
        data = await chrome.storage.local.get([`gemini_job_${tabId}`]);
        job = data && data[`gemini_job_${tabId}`];
        if (job) return { owns: job.jobId === jobId, tabId, job };
      }

      // Durante a pequena janela entre TAB_REPLACED e o término do rekey, o
      // sender já é a aba nova enquanto o índice ainda aponta para a antiga.
      const indexed = indexJobsOfBatch(null).find(entry => entry && entry.jobId === jobId);
      if (indexed) {
        const indexedCanonical = await resolveCanonicalTabId(indexed.geminiTabId);
        if (indexedCanonical === senderTabId) {
          tabId = await migrateTabIdentity(indexed.geminiTabId, senderTabId, { jobId });
          data = await chrome.storage.local.get([`gemini_job_${tabId}`]);
          job = data && data[`gemini_job_${tabId}`];
        }
      }
      return { owns: Boolean(job && job.jobId === jobId), tabId, job: job || null };
    }

    function buildGeminiJobUrl(baseUrl, jobIndex, jobId) {
      try {
        const parsed = new URL(baseUrl);
        parsed.searchParams.set('mangatranslator', 'true');
        parsed.searchParams.set('jobId', jobId);
        if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
          parsed.searchParams.set('jobIndex', String(jobIndex));
        }
        return parsed.toString();
      } catch (_error) {
        return baseUrl;
      }
    }

    async function refreshMaxConcurrency() {
      const data = await chrome.storage.local.get('maxConcurrentJobs');
      state._cachedMaxCon = parseInt(data && data.maxConcurrentJobs, 10) || 1;
      return state._cachedMaxCon;
    }

    async function openGeminiTab(url, executionMode) {
      if (executionMode === 'minimized_window') {
        let createdWindowId = null;
        try {
          const window = await chrome.windows.create({ url, focused: false, state: 'minimized' });
          createdWindowId = window.id;
          await chrome.windows.update(window.id, { state: 'minimized', focused: false });
          const actualWindow = await chrome.windows.get(window.id);
          log(actualWindow.state === 'minimized' ? 'info' : 'warn', 'bg', 'GEMINI_WINDOW_STATE',
            'Estado físico da janela do job', { state: actualWindow.state, focused: actualWindow.focused });
          if (actualWindow.state !== 'minimized') throw new Error('Janela não permaneceu minimizada');
          let tab = (window.tabs && window.tabs[0]) || null;
          if (!tab) tab = (await chrome.tabs.query({ windowId: window.id }))[0];
          if (tab) return { tab, windowId: window.id, dedicatedWindow: true };
        } catch (_error) {
          if (createdWindowId !== null) {
            try { await chrome.windows.remove(createdWindowId); } catch (_e) {}
          }
          log('warn', 'bg', 'GEMINI_WINDOW_MINIMIZE_FAILED', 'Janela minimizada indisponível; usando aba inativa', {});
        }
      }
      const tab = await chrome.tabs.create({ url, active: false });
      return { tab, windowId: tab.windowId, dedicatedWindow: false };
    }

    function launchWasInvalidated(batchId) {
      return Boolean(
        state.stopRequested ||
        (batchId && state.currentBatchId && batchId !== state.currentBatchId)
      );
    }

    async function abortInvalidatedLaunch({
      batchId,
      jobId,
      geminiTabId,
      opened,
      indexed = false,
      phase = 'unknown',
    }) {
      if (!launchWasInvalidated(batchId)) return false;

      if (indexed && (geminiTabId || geminiTabId === 0)) {
        indexRemoveJob(geminiTabId);
      }
      if (geminiTabId || geminiTabId === 0) {
        try { clearWatchdog(geminiTabId, jobId); } catch (_e) {}
        try {
          await chrome.storage.local.remove([
            `gemini_job_${geminiTabId}`,
            `wd_data_${geminiTabId}`,
          ]);
        } catch (_e) {}
      }

      const closeTab = tabId => {
        if (tabId === null || tabId === undefined) return;
        try {
          chrome.tabs.remove(tabId, () => { void chrome.runtime.lastError; });
        } catch (_e) {}
      };
      if (opened?.dedicatedWindow === true && opened.windowId !== null && opened.windowId !== undefined) {
        try {
          chrome.windows.remove(opened.windowId, () => { void chrome.runtime.lastError; });
        } catch (_e) {
          closeTab(geminiTabId);
        }
      } else {
        closeTab(geminiTabId);
      }

      if (!batchId || !state.currentBatchId || state.currentBatchId === batchId) {
        state.activeJobsCount = Math.max(0, (Number(state.activeJobsCount) || 0) - 1);
      }
      await syncState();
      log('warn', 'bg', 'JOB_START_ABORTED',
        'Abertura de job cancelada porque o lote foi interrompido ou substituído durante o lançamento.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(batchId || '').slice(0, 8),
          geminiTabId,
          phase,
          stopRequested: Boolean(state.stopRequested),
          currentBatchId: String(state.currentBatchId || '').slice(0, 8),
        });
      return true;
    }

    async function processNextJob() {
      if (!state.stopRequested && !state.currentBatchId &&
          state.jobQueue.length === 0 && state.activeJobsCount === 0 &&
          Array.isArray(state.pendingBatches) && state.pendingBatches.length > 0) {
        const promoted = await promotePendingBatchIfIdle();
        if (promoted) {
          await refreshMaxConcurrency();
          return processNextJob();
        }
      }

      if (state.stopRequested || (state.jobQueue.length === 0 && state.activeJobsCount === 0)) {
        const stillOpen = !state.stopRequested ? indexJobsOfBatch(state.currentBatchId).length : 0;
        if (stillOpen > 0) {
          state.activeJobsCount = Math.max(state.activeJobsCount, stillOpen);
          await syncState();
          return;
        }

        if (!state.stopRequested && state.jobQueue.length === 0 && state.activeJobsCount === 0) {
          let completion = null;
          let promotedAfterCompletion = null;

          const claimCompletion = snapshot => {
            const batchId = snapshot.currentBatchId || null;
            const queued = Array.isArray(snapshot.jobQueue) ? snapshot.jobQueue : [];
            if (!batchId || snapshot.stopRequested || queued.length > 0 ||
                Number(snapshot.activeJobsCount) > 0 ||
                snapshot.completionClaimedBatchId === batchId) {
              return snapshot;
            }

            const completed = Number(snapshot.completedJobs) || 0;
            const total = Number(snapshot.totalJobs) || 0;
            completion = {
              batchId,
              mangaTabId: snapshot.activeMangaTabId || null,
              completed,
              total,
              hasErrors: completed < total,
            };
            snapshot.completionClaimedBatchId = batchId;

            const pending = clonePendingBatches(snapshot.pendingBatches);
            if (pending.length > 0) {
              promotedAfterCompletion = pending.shift();
              snapshot.pendingBatches = pending;
              activateBatchSnapshot(snapshot, promotedAfterCompletion);
            } else {
              snapshot.isProcessing = false;
              snapshot.activeMangaTabId = null;
            }
            return snapshot;
          };

          if (typeof state.mutate === 'function') {
            await state.mutate(claimCompletion);
          } else {
            claimCompletion(state);
            await syncState();
          }

          if (completion) {
            if (completion.mangaTabId) {
              chrome.tabs.sendMessage(completion.mangaTabId, {
                action: 'BATCH_COMPLETE',
                batchId: completion.batchId,
                hasErrors: completion.hasErrors,
              }, () => { void chrome.runtime.lastError; });
            }
            log(completion.hasErrors ? 'warn' : 'success', 'bg', 'BATCH_DONE',
              completion.hasErrors
                ? 'Lote encerrado com falhas; traduções não concluídas.'
                : 'Lote finalizado com sucesso!',
              {
                batchId: String(completion.batchId).slice(0, 8),
                completed: completion.completed,
                total: completion.total,
                hasErrors: completion.hasErrors,
              });
          }

          if (promotedAfterCompletion) {
            log('info', 'bg', 'BATCH_PROMOTED',
              'Próximo lote da fila FIFO foi promovido após a conclusão do lote anterior.', {
                previousBatchId: String(completion?.batchId || '').slice(0, 8),
                batchId: String(promotedAfterCompletion.batchId || '').slice(0, 8),
                pendingCount: Array.isArray(state.pendingBatches) ? state.pendingBatches.length : 0,
                totalJobs: Array.isArray(promotedAfterCompletion.images)
                  ? promotedAfterCompletion.images.length
                  : 0,
              });
            sendProgress(promotedAfterCompletion.mangaTabId, '▶️ INICIANDO LOTE DA FILA...');
            await refreshMaxConcurrency();
            return processNextJob();
          }
        }
        return;
      }
      if (state.stopRequested || state.jobQueue.length === 0 || state.activeJobsCount >= state._cachedMaxCon) return;

      const job = state.jobQueue.shift();
      if (!job) return;
      state.activeJobsCount += 1;
      const { mangaTabId, index, prompt } = job;
      const jobId = generateId();
      const batchId = job.batchId || state.currentBatchId;
      state.activeMangaTabId = mangaTabId;
      await syncState();
      log('info', 'bg', 'JOB_START', 'Iniciando imagem', { index, completedJobs: state.completedJobs, totalJobs: state.totalJobs });
      sendProgress(mangaTabId, `🔄 ABRINDO GEMINI (${state.completedJobs + 1}/${state.totalJobs})...`);

      try {
        const settings = await chrome.storage.local.get(['geminiBaseUrl', 'geminiExecutionMode']);
        let baseUrl = settings.geminiBaseUrl || 'https://gemini.google.com/app';
        if (baseUrl === 'https://gemini.google.com/' || baseUrl === 'https://gemini.google.com') baseUrl = 'https://gemini.google.com/app';
        const executionMode = settings.geminiExecutionMode || 'temp_chat';
        const opened = await openGeminiTab(buildGeminiJobUrl(baseUrl, index, jobId), executionMode);
        if (!opened.tab) throw new Error('Não foi possível obter a aba do Gemini');
        const openedTabId = opened.tab.id;
        let canonicalTabId = await resolveCanonicalTabId(openedTabId);
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: false, phase: 'after_tab_create',
        })) return processNextJob();

        let record = {
          jobId, batchId, mangaTabId, index, prompt,
          geminiTabId: canonicalTabId,
          canonicalTabId,
          replacementCount: canonicalTabId === openedTabId ? 0 : 1,
          windowId: opened.windowId,
          dedicatedWindow: opened.dedicatedWindow === true,
          executionMode,
          state: 'opening',
          attempt: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await chrome.storage.local.set({ [`gemini_job_${canonicalTabId}`]: record });
        indexAddJob({ geminiTabId: canonicalTabId, jobId, batchId, mangaTabId, index });
        await syncState();
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: true, phase: 'after_job_persist',
        })) return processNextJob();

        // Fecha a corrida nas duas ordens:
        // 1) replacement antes da persistência -> alias já existe e migramos;
        // 2) replacement depois da persistência -> listener migra os registros.
        // O recheck só ocorre DEPOIS de job + índice existirem, de modo que um
        // listener concorrente sempre veja tudo ou o recheck repare o que faltou.
        const latestCanonicalTabId = await resolveCanonicalTabId(openedTabId);
        if (latestCanonicalTabId !== canonicalTabId) {
          canonicalTabId = await migrateTabIdentity(canonicalTabId, latestCanonicalTabId, { jobId });
          const migrated = await chrome.storage.local.get([`gemini_job_${canonicalTabId}`]);
          record = migrated[`gemini_job_${canonicalTabId}`] || { ...record, geminiTabId: canonicalTabId, canonicalTabId };
        }

        canonicalTabId = await resolveCanonicalTabId(openedTabId);
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: true, phase: 'after_tab_identity',
        })) return processNextJob();

        log('info', 'bg', 'TAB_CREATED_FOR_JOB', 'Aba Gemini associada ao job', {
          oldTabId: openedTabId,
          newTabId: canonicalTabId,
          jobIdPrefix: String(jobId).slice(0, 8),
          index,
        });
        await armWatchdog(mangaTabId, index, canonicalTabId, jobId);
        if (await abortInvalidatedLaunch({
          batchId, jobId, geminiTabId: canonicalTabId, opened,
          indexed: true, phase: 'after_watchdog_arm',
        })) return processNextJob();
        return processNextJob();
      } catch (error) {
        state.activeJobsCount = Math.max(0, state.activeJobsCount - 1);
        const message = error && error.message ? error.message : 'Falha ao abrir Gemini';
        log('error', 'bg', 'JOB_ERROR', 'Erro ao abrir Gemini', { index, error: message });
        chrome.tabs.sendMessage(mangaTabId, { action: 'SHOW_ERROR_INTEGRATED', errorMsg: `Erro ao abrir: ${message}`, imgIndex: index, isDebug: false }, () => { void chrome.runtime.lastError; });
        await syncState();
        return processNextJob();
      }
    }

    async function finalizeJob(geminiTabId, mangaTabId, fromError = false) {
      if (isFinalized(geminiTabId)) return false;

      // Leitura direta primeiro: no caminho normal isso mantém exatamente uma
      // ida ao storage. Se a chave física já foi movida, então resolvemos alias.
      let jobKey = `gemini_job_${geminiTabId}`;
      let key = markerKey(geminiTabId);
      let data = await chrome.storage.local.get([jobKey, key, 'geminiExecutionMode', 'debugMode']);
      if (!data[jobKey]) {
        const canonicalTabId = await resolveCanonicalTabId(geminiTabId);
        if (canonicalTabId !== geminiTabId) {
          geminiTabId = canonicalTabId;
          if (isFinalized(geminiTabId)) return false;
          jobKey = `gemini_job_${geminiTabId}`;
          key = markerKey(geminiTabId);
          data = await chrome.storage.local.get([jobKey, key, 'geminiExecutionMode', 'debugMode']);
        }
      }
      const job = data[jobKey] || {};
      const prior = data[key];
      if (prior && prior.expiresAt > Date.now() && (!job.jobId || prior.jobId === job.jobId)) {
        markFinalized(geminiTabId);
        return false;
      }
      markFinalized(geminiTabId);
      const marker = { jobId: job.jobId || null, fromError: Boolean(fromError), finalizedAt: Date.now(), expiresAt: Date.now() + finalizedMarkerTtlMinutes * 60_000, accountingApplied: false };
      // A marca é escrita antes de qualquer efeito. No restart, a reconciliação
      // pode finalizar a contabilidade pendente usando este registro.
      await chrome.storage.local.set({ [key]: marker });
      chrome.alarms.create(markerAlarm(geminiTabId), { delayInMinutes: finalizedMarkerTtlMinutes });
      await applyFinalizationAccounting(geminiTabId, job, marker);
      await chrome.storage.local.set({ [key]: { ...marker, accountingApplied: true } });
      clearWatchdog(geminiTabId, job.jobId);
      await chrome.storage.local.remove(jobKey);

      if (data.debugMode === true) { processNextJob(); return true; }
      const executionMode = job.executionMode || data.geminiExecutionMode || 'temp_chat';
      const closeGeminiSurface = tab => {
        if (job.dedicatedWindow === true && tab?.windowId) {
          chrome.windows.remove(tab.windowId, () => { void chrome.runtime.lastError; });
          return;
        }
        chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; });
      };
      if (executionMode === 'temp_chat') {
        setTimeout(() => chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; }), 600);
        processNextJob();
        return true;
      }
      chrome.tabs.get(geminiTabId, async tab => {
        if (chrome.runtime.lastError || !tab) {
          chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; });
          processNextJob();
          return;
        }
        const shouldDeleteConversation = executionMode === 'minimized_window' || executionMode === 'background_delete';
        if (!shouldDeleteConversation) {
          chrome.tabs.remove(geminiTabId, () => { void chrome.runtime.lastError; });
          processNextJob();
          return;
        }
        // Resultado já foi persistido no leitor. Agora a conversa pode ser
        // excluída sem risco de perder os bytes traduzidos.
        const activeUrl = tab.url || '';
        if (fromError && !/\/app\/[^/?#]+/.test(activeUrl)) {
          log('info', 'bg', 'DELETE_SKIPPED_NO_CONVERSATION', 'Job falhou antes de criar conversa; não há ID para apagar', {});
          closeGeminiSurface(tab);
          processNextJob();
          return;
        }
        const stored = await chrome.storage.local.get(['deleting_urls']);
        const deletingUrls = Array.isArray(stored.deleting_urls) ? stored.deleting_urls : [];
        if (activeUrl && !deletingUrls.includes(activeUrl)) deletingUrls.push(activeUrl);
        await chrome.storage.local.set({ deleting_urls: deletingUrls });
        chrome.tabs.sendMessage(geminiTabId, { action: 'DELETE_CONVERSATION' }, response => {
          const deleteError = chrome.runtime.lastError;
          log(deleteError || response?.ok === false ? 'warn' : 'success', 'bg',
            deleteError || response?.ok === false ? 'POST_PERSIST_DELETE_DEFERRED' : 'POST_PERSIST_DELETE_OK',
            deleteError || response?.ok === false
              ? 'Resultado já persistido; exclusão da conversa não confirmou imediatamente.'
              : 'Conversa excluída depois da persistência confirmada do resultado.',
            { jobId: String(job.jobId || '').slice(0, 8), batchId: String(job.batchId || '').slice(0, 8) });
        });
        processNextJob();
        setTimeout(() => {
          chrome.storage.local.get(['deleting_urls']).then(next => {
            const urls = (next.deleting_urls || []).filter(url => url !== activeUrl);
            return chrome.storage.local.set({ deleting_urls: urls });
          }).catch(() => {});
          closeGeminiSurface(tab);
        }, 18_000);
      });
      return true;
    }

    return { updateJobState, assertJobOwnership, refreshMaxConcurrency, processNextJob, finalizeJob, recoverPendingFinalization, recoverPersistedResult };
  }
  scope.MangaTranslatorJobsLifecycle = { createLifecycle };
})(typeof self !== 'undefined' ? self : globalThis);

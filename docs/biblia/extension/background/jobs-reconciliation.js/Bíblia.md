# Bíblia técnica — `extension/background/jobs-reconciliation.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `f0f2370ba6b7523caebf028c9188cebd7189d650`  
> **Linhas textuais:** **111**  
> **Posições documentais:** **112** contando newline final  
> **Teste direto:** `tests/unit/background/jobs-reconciliation-batch-queue.test.js` — `032df2351f2a202dff11f227f8c4dc6ac5b80807`

## Papel arquitetural

`jobs-reconciliation.js` reconstrói a verdade operacional dos jobs depois que o Service Worker MV3 foi suspenso/recriado. Ele parte de `state.jobIndex`, canonicaliza tabs, executa recoveries duráveis antes de olhar existência física, descarta jobs estrangeiros/órfãos e recalcula `activeJobsCount`.

O background injeta `tabExists`, `TabIdentity`, `recoverPendingFinalization`, `recoverPersistedResult`, `syncState` e `processNextJob`. Assim este arquivo orquestra decisões, mas não implementa os journals de finalização nem a migração física de storage.

## Ordem de autoridade

A ordem é deliberada e crítica:

1. canonicalizar/migrar tabId;
2. recuperar finalização já iniciada;
3. recuperar resultado já persistido;
4. rejeitar job de batch estrangeiro;
5. somente então verificar se a tab ainda existe.

Essa ordem evita classificar como órfão um job cujo tabId foi substituído e evita ressuscitar slots de resultados que já tinham sido persistidos/finalizados antes do crash.

## Canonicalização de tabs

Cada entrada usa `resolveCanonicalTabId(originalTabId)`. Se mudar, `migrateTabIdentity` roda antes de recovery/tabExists. O teste `TAB-12` importa o reconciler real e prova que uma entrada em tab 100 com alias para 200 é migrada e mantida alive em 200.

## Recovery antes da liveness

`recoverPendingFinalization` tem prioridade máxima: um marker de finalização significa que o resultado já foi aceito e a reconciliação deve terminar accounting/cleanup, não contar a aba como ativa.

`recoverPersistedResult` vem em seguida e finaliza jobs que já possuem resultado durável. Entradas recuperadas incrementam `recovered` e não entram em `alive` nem `dropped`.

## Isolamento entre batches

Se há `currentBatchId` e uma entrada tem `batchId` diferente, ela é foreign. O reconciler a adiciona a `dropped`, tenta fechar a tab canônica e depois remove job/watchdog. Isso impede um job tardio de A de ocupar slot quando B já foi promovido.

`RECON-FIFO-01` prova diretamente esse comportamento: job A é removido, job B permanece e `activeJobsCount` vira 1. `RECON-FIFO-02` prova que, sem currentBatchId, um job restaurado não é inventado como foreign.

## Jobs órfãos

Depois de recoveries e filtro de batch, `tabExists(canonicalTabId)` decide se a entrada permanece. Jobs sem tab entram em `dropped`. Para todo dropped, o módulo limpa `gemini_job_*`, `wd_data_*` e o watchdog correspondente.

Falhas de `chrome.storage.local.remove` são absorvidas, mas falha/throw de `chrome.alarms.clear` não está dentro de try individual; no background real a API callback não costuma lançar.

## Reconstrução do estado

No final, `state.jobIndex = alive` e `state.activeJobsCount = alive.length`. `activeMangaTabId` só é preenchido pelo primeiro job alive quando está falsy.

Isso deliberadamente prefere a realidade do índice/tabs ao contador restaurado, que pode estar stale depois de suspensão.

## reconcileAndContinue

O wrapper chama `reconcile()`. Se houve `dropped`, `alive` ou `recovered`, sincroniza estado. Só chama `processNextJob()` quando drop/recovery pode ter liberado slots ou concluído jobs; `alive` sozinho não causa scheduling por esse wrapper.

No bootstrap real, `background.js::ensureInitialized` usa `jobsReconciler.reconcile()` diretamente e possui sua própria lógica de sync/continue, portanto `reconcileAndContinue()` não é atualmente chamado pelo background.

## Lacuna de persistência com índice vazio

Quando `jobIndex` está vazio, `reconcile()` define `state.activeJobsCount = 0` e retorna `{alive:0,dropped:0}`. `reconcileAndContinue()` não entra no bloco de `syncState()` porque todos os contadores do resultado são zero.

Consequência: um `activeJobsCount` stale restaurado pode ser corrigido apenas em memória e continuar persistido até outra mutação futura. O bootstrap real também só sincroniza após reconcile quando `dropped/alive/recovered > 0`. Não há teste focal para esse cenário de storage stale sem outras mudanças.

## Segurança e consistência

- Jobs de batch antigo não podem consumir capacidade do batch atual.
- Tab identity é resolvida antes de liveness, evitando apagar job válido por replacement.
- Recoveries duráveis prevalecem sobre presença física da tab.
- Logs de foreign batch truncam batchId/jobId para oito caracteres.
- O módulo não aceita mensagens externas; é helper interno do background.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `jobs-reconciliation-batch-queue.test.js` | ✅ PROVADO DIRETAMENTE | Importa o módulo real; prova drop de job estrangeiro sem afetar batch atual e ausência de foreign quando não há currentBatchId. |
| `tab-identity.test.js` — TAB-12 | ✅ PROVADO DIRETAMENTE | Importa o reconciler real; prova canonicalização/migração antes da classificação de órfão. |
| `process-finalize-real.test.js` — P0 restart | ✅ PROVADO NO BACKGROUND INTEGRADO | Startup real passa pelo reconciler/recovery e termina journal de finalização exatamente uma vez. |
| `smoke-02-uuid-and-reconcile.js` | 🟨 SIMULAÇÃO COMPLEMENTAR | Reimplementa uma versão simplificada de reconcile; não importa `jobs-reconciliation.js`. |
| `background.js` | 🟨 CONSUMIDOR REAL | Injeta TabIdentity, lifecycle recoveries, sync e tabExists na factory. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para jobIndex vazio + activeJobsCount persistido stale e ausência de `syncState`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `recoverPendingFinalization` retornar true no módulo isolado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `recoverPersistedResult` retornar true no módulo isolado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para qualquer recovery lançar; uma rejeição interromperia toda a reconciliação.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `resolveCanonicalTabId`/`migrateTabIdentity` rejeitando.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `tabExists` rejeitando em vez de resolver false.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `chrome.storage.local.remove` falhar; erro é engolido e jobIndex ainda é atualizado em memória.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `chrome.tabs.remove` falhar no job foreign; falha é engolida e o job é mesmo assim removido do índice.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `activeMangaTabId` truthy mas stale enquanto o primeiro alive pertence a outra mangaTabId; o código só preenche quando falsy.
- ⚠️ Entradas nulas são simplesmente ignoradas e desaparecem do índice final sem log específico.
- ⚠️ `reconcileAndContinue()` é exportado, mas não há consumidor runtime atual localizado no background.

## Invariantes

1. Canonicalização deve ocorrer antes de tabExists.
2. Marker/finalização pendente deve vencer a verificação física da aba.
3. Resultado já persistido não pode voltar a consumir slot.
4. Job de batch diferente do currentBatchId deve ser descartado sem alterar jobs do batch atual.
5. Sem currentBatchId, batchId diferente não deve ser classificado como foreign.
6. `activeJobsCount` após reconcile deve ser exatamente `alive.length`.
7. Jobs dropped devem sair de `jobIndex` mesmo se cleanup de storage falhar.
8. Recovery bem-sucedido não deve permanecer em `alive`.
9. O reconciler não deve recriar jobs; apenas recuperar, preservar ou descartar.

## Fonte integral

~~~javascript
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
~~~

## Rastreabilidade 112/112

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/jobs-reconciliation.js -- Rebuilds active job accounting after worker suspension. | Comentário arquitetural: background/jobs-reconciliation.js -- Rebuilds active job accounting after worker suspension.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U01 | (function(scope) { | Passo operacional de U01: (function(scope) { |
| 005 | U02 |   function createReconciler({ | Abre factory e injeta estado/helpers de reconciliação. |
| 006 | U02 |     state, | Passo operacional de U02: state, |
| 007 | U02 |     tabExists, | Consulta existência da tab canônica para separar alive de órfão. |
| 008 | U02 |     log, | Passo operacional de U02: log, |
| 009 | U02 |     syncState, | Passo operacional de U02: syncState, |
| 010 | U02 |     processNextJob, | Retoma scheduler quando drop/recovery liberou trabalho/slot. |
| 011 | U02 |     recoverPendingFinalization, | Dá prioridade a journal de finalização já iniciado. |
| 012 | U02 |     recoverPersistedResult, | Dá segunda prioridade a resultado já persistido. |
| 013 | U02 |     resolveCanonicalTabId = async tabId => tabId, | Resolve alias/tab replacement antes de qualquer decisão de vida. |
| 014 | U02 |     migrateTabIdentity = async (_oldTabId, newTabId) => newTabId, | Migra storage/índice quando canonical difere da tab original. |
| 015 | U02 |   }) { | Passo operacional de U02: }) { |
| 016 | U03 |     async function reconcile() { | Abre reconstrução do estado ativo a partir do jobIndex. |
| 017 | U03 |       if (!Array.isArray(state.jobIndex) \|\| state.jobIndex.length === 0) { | Trata índice ausente/vazio como zero jobs vivos. |
| 018 | U03 |         state.activeJobsCount = 0; | Zera contador em memória quando não há índice. |
| 019 | U03 |         return { alive: 0, dropped: 0 }; | Retorna resumo mínimo do caminho vazio. |
| 020 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 021 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 022 | U04 |       const alive = []; | Inicializa coleção de jobs preservados. |
| 023 | U04 |       const dropped = []; | Inicializa coleção de jobs descartados. |
| 024 | U04 |       const foreign = []; | Inicializa coleção de jobs pertencentes a batch anterior. |
| 025 | U04 |       let recovered = 0; | Conta recoveries que não devem voltar ao índice ativo. |
| 026 | U04 |       for (const entry of state.jobIndex) { | Percorre cada entrada persistida do índice. |
| 027 | U04 |         if (!entry) continue; | Ignora entradas nulas/corrompidas sem abortar toda a reconciliação. |
| 028 | U04 |         const originalTabId = entry.geminiTabId; | Captura tabId originalmente persistido. |
| 029 | U04 |         const canonicalTabId = await resolveCanonicalTabId(originalTabId); | Captura tabId originalmente persistido. |
| 030 | U04 |         let canonicalEntry = canonicalTabId === originalTabId | Captura tabId originalmente persistido. |
| 031 | U04 |           ? entry | Passo operacional de U04: ? entry |
| 032 | U04 |           : { ...entry, geminiTabId: canonicalTabId }; | Passo operacional de U04: : { ...entry, geminiTabId: canonicalTabId }; |
| 033 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 034 | U04 |         if (canonicalTabId !== originalTabId) { | Captura tabId originalmente persistido. |
| 035 | U04 |           await migrateTabIdentity(originalTabId, canonicalTabId, { jobId: entry.jobId \|\| null }); | Captura tabId originalmente persistido. |
| 036 | U04 |           canonicalEntry = { ...canonicalEntry, geminiTabId: canonicalTabId }; | Produz versão da entrada apontando para tab canônica. |
| 037 | U04 |         } | Fecha estrutura sintática da unidade U04. |
| 038 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 039 | U05 |         // Uma marca de finalização significa que o resultado já foi aceito; | Comentário arquitetural: Uma marca de finalização significa que o resultado já foi aceito;. |
| 040 | U05 |         // ela vence a verificação da aba para não ressuscitar um slot pendente. | Comentário arquitetural: ela vence a verificação da aba para não ressuscitar um slot pendente.. |
| 041 | U05 |         if (typeof recoverPendingFinalization === 'function' && await recoverPendingFinalization(canonicalEntry)) { | Produz versão da entrada apontando para tab canônica. |
| 042 | U05 |           recovered += 1; | Conta entrada recuperada e evita classificá-la como alive/dropped. |
| 043 | U05 |           continue; | Passo operacional de U05: continue; |
| 044 | U05 |         } | Fecha estrutura sintática da unidade U05. |
| 045 | U05 |         if (typeof recoverPersistedResult === 'function' && await recoverPersistedResult(canonicalEntry)) { | Produz versão da entrada apontando para tab canônica. |
| 046 | U05 |           recovered += 1; | Conta entrada recuperada e evita classificá-la como alive/dropped. |
| 047 | U05 |           continue; | Passo operacional de U05: continue; |
| 048 | U06 |         } | Fecha estrutura sintática da unidade U06. |
| 049 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 050 | U06 |         const belongsToForeignBatch = Boolean( | Detecta job de batch diferente do currentBatchId. |
| 051 | U06 |           state.currentBatchId && | Relaciona decisão ao batch atualmente ativo. |
| 052 | U06 |           canonicalEntry.batchId && | Produz versão da entrada apontando para tab canônica. |
| 053 | U06 |           canonicalEntry.batchId !== state.currentBatchId | Produz versão da entrada apontando para tab canônica. |
| 054 | U06 |         ); | Fecha estrutura sintática da unidade U06. |
| 055 | U06 |         if (belongsToForeignBatch) { | Detecta job de batch diferente do currentBatchId. |
| 056 | U06 |           foreign.push(canonicalEntry); | Produz versão da entrada apontando para tab canônica. |
| 057 | U06 |           dropped.push(canonicalEntry); | Produz versão da entrada apontando para tab canônica. |
| 058 | U06 |           try { | Passo operacional de U06: try { |
| 059 | U06 |             chrome.tabs.remove(canonicalTabId, () => { void chrome.runtime.lastError; }); | Fecha tab estrangeira para impedir slot/atividade residual. |
| 060 | U06 |           } catch (_e) {} | Passo operacional de U06: } catch (_e) {} |
| 061 | U06 |           continue; | Passo operacional de U06: continue; |
| 062 | U06 |         } | Fecha estrutura sintática da unidade U06. |
| 063 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 064 | U07 |         if (await tabExists(canonicalTabId)) alive.push(canonicalEntry); | Produz versão da entrada apontando para tab canônica. |
| 065 | U07 |         else dropped.push(canonicalEntry); | Produz versão da entrada apontando para tab canônica. |
| 066 | U07 |       } | Fecha estrutura sintática da unidade U07. |
| 067 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 068 | U08 |       if (dropped.length) { | Executa cleanup apenas quando há jobs descartados. |
| 069 | U08 |         const keys = dropped.flatMap(entry => [ | Constrói lista de chaves gemini_job/wd_data a remover. |
| 070 | U08 |           `gemini_job_${entry.geminiTabId}`, | Passo operacional de U08: `gemini_job_${entry.geminiTabId}`, |
| 071 | U08 |           `wd_data_${entry.geminiTabId}`, | Passo operacional de U08: `wd_data_${entry.geminiTabId}`, |
| 072 | U08 |         ]); | Fecha estrutura sintática da unidade U08. |
| 073 | U08 |         dropped.forEach(entry => chrome.alarms.clear(`watchdog_${entry.jobId \|\| entry.geminiTabId}`, () => {})); | Limpa watchdog de cada job descartado. |
| 074 | U08 |         try { await chrome.storage.local.remove(keys); } catch (_error) {} | Remove artefatos duráveis dos jobs descartados. |
| 075 | U08 |         log('warn', 'bg', 'JOB_RECONCILE_DROP', `${dropped.length} job(s) órfão(s)/obsoleto(s) descartado(s) após reinício do worker`, { | Registra descarte geral de órfãos/obsoletos. |
| 076 | U08 |           dropped: dropped.map(entry => entry.geminiTabId), | Passo operacional de U08: dropped: dropped.map(entry => entry.geminiTabId), |
| 077 | U08 |           foreignBatchJobs: foreign.map(entry => entry.geminiTabId), | Loga tabs estrangeiras separadamente. |
| 078 | U08 |         }); | Fecha estrutura sintática da unidade U08. |
| 079 | U08 |         if (foreign.length) { | Emite log especializado quando havia batch estrangeiro. |
| 080 | U08 |           log('warn', 'bg', 'JOB_RECONCILE_FOREIGN_BATCH_DROP', | Registra isolamento entre batches. |
| 081 | U08 |             'Jobs de lotes anteriores foram descartados para não contaminar o lote corrente.', { | Passo operacional de U08: 'Jobs de lotes anteriores foram descartados para não contaminar o lote corrente.', { |
| 082 | U08 |               currentBatchId: String(state.currentBatchId \|\| '').slice(0, 8), | Relaciona decisão ao batch atualmente ativo. |
| 083 | U08 |               jobs: foreign.map(entry => ({ | Passo operacional de U08: jobs: foreign.map(entry => ({ |
| 084 | U08 |                 geminiTabId: entry.geminiTabId, | Passo operacional de U08: geminiTabId: entry.geminiTabId, |
| 085 | U08 |                 batchId: String(entry.batchId \|\| '').slice(0, 8), | Passo operacional de U08: batchId: String(entry.batchId // '').slice(0, 8), |
| 086 | U08 |                 jobId: String(entry.jobId \|\| '').slice(0, 8), | Passo operacional de U08: jobId: String(entry.jobId // '').slice(0, 8), |
| 087 | U08 |               })), | Fecha estrutura sintática da unidade U08. |
| 088 | U08 |             }); | Fecha estrutura sintática da unidade U08. |
| 089 | U09 |         } | Fecha estrutura sintática da unidade U09. |
| 090 | U09 |       } | Fecha estrutura sintática da unidade U09. |
| 091 | U09 | ␠ [linha vazia] | Separador visual da unidade U09. |
| 092 | U09 |       state.jobIndex = alive; | Substitui índice runtime apenas pelos jobs preservados. |
| 093 | U09 |       state.activeJobsCount = alive.length; | Reconstrói contador de slots pela realidade das tabs. |
| 094 | U09 |       if (alive.length && !state.activeMangaTabId) state.activeMangaTabId = alive[0].mangaTabId \|\| null; | Preenche mangaTabId a partir do primeiro alive apenas se ainda estiver vazio. |
| 095 | U09 |       return { alive: alive.length, dropped: dropped.length, recovered, foreign: foreign.length }; | Retorna resumo completo da reconciliação. |
| 096 | U09 |     } | Fecha estrutura sintática da unidade U09. |
| 097 | U10 | ␠ [linha vazia] | Separador visual da unidade U10. |
| 098 | U10 |     async function reconcileAndContinue() { | Abre wrapper que persiste mudanças e retoma scheduler. |
| 099 | U10 |       const result = await reconcile(); | Executa reconciliação antes de qualquer continuação. |
| 100 | U10 |       if (result.dropped \|\| result.alive \|\| result.recovered) { | Decide se há algo a sincronizar. |
| 101 | U10 |         await syncState(); | Persiste o snapshot reconciliado. |
| 102 | U10 |         if (result.dropped \|\| result.recovered) processNextJob(); | Retoma scheduler quando drop/recovery liberou trabalho/slot. |
| 103 | U10 |       } | Fecha estrutura sintática da unidade U10. |
| 104 | U10 |       return result; | Propaga estatísticas da reconciliação. |
| 105 | U10 |     } | Fecha estrutura sintática da unidade U10. |
| 106 | U10 | ␠ [linha vazia] | Separador visual da unidade U10. |
| 107 | U11 |     return { reconcile, reconcileAndContinue }; | Expõe as duas APIs públicas. |
| 108 | U11 |   } | Fecha estrutura sintática da unidade U11. |
| 109 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 110 | U11 |   scope.MangaTranslatorJobsReconciliation = { createReconciler }; | Publica a factory no namespace global do background. |
| 111 | U11 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE compatível com worker/Jest. |
| 112 | U12 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho e IIFE
Declara objetivo do módulo e abre escopo global isolado.

### U02 — Factory e dependências
Recebe estado, liveness, recovery, identity, sync e scheduler.

### U03 — Índice vazio
Zera activeJobsCount em memória e termina cedo.

### U04 — Canonicalização e migração
Resolve replacements e migra entrada antes de qualquer decisão.

### U05 — Recoveries prioritários
Tenta journal de finalização e resultado persistido antes de liveness.

### U06 — Isolamento de batch estrangeiro
Descarta jobs de batches antigos quando existe batch atual.

### U07 — Classificação alive/dropped
Usa tabExists sobre a identidade canônica.

### U08 — Cleanup de dropped e logs
Limpa storage/watchdog e registra descartes/foreign batches.

### U09 — Reconstrução dos contadores
Reescreve índice, contador e manga ativa a partir dos alive.

### U10 — reconcileAndContinue
Opcionalmente sincroniza e retoma scheduler.

### U11 — Exports e fechamento
Publica as APIs da factory.

### U12 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 111 linhas + newline = 112/112;
- [x] canonicalização/recovery/foreign/drop reconstruídos na ordem real;
- [x] testes diretos separados de integração e smoke simulado;
- [x] lacuna de sync no índice vazio explicitada;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `f0f2370ba6b7523caebf028c9188cebd7189d650`.

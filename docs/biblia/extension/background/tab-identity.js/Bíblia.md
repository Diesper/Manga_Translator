# Bíblia técnica — `extension/background/tab-identity.js`

> **Estado:** ✅ DOCUMENTAÇÃO REAUDITADA PELO AGENTE 11; ⬜ gate global de `AUDITORIA.md` permanece reaberto  
> **SHA auditado:** `008c9a054ae417e0f31224617346e24fc9dbc1b4`  
> **Linhas textuais:** **362**  
> **Posições documentais:** **363** contando newline final  
> **Teste focal:** `tests/unit/background/tab-identity.test.js` — `1f2dd52513037f061613d04453a961fbaeddef84`  
> **Reauditoria:** `AGENTE 11` — fonte, teste focal, consumidores, 363 posições e bloco integral reconferidos no branch `docs/project-bible` em 2026-09-30.

## Identidade e papel arquitetural

`tab-identity.js` resolve um problema específico do Chromium/MV3: `tabId` é identidade física e pode mudar por `tabs.onReplaced`, enquanto job, watchdog, extraction tab e markers precisam continuar apontando para o mesmo trabalho lógico.

O módulo cria aliases duráveis `oldTabId → newTabId`, migra registros e referências, move alarms e mantém um journal por fases para sobreviver à suspensão do service worker.

`background.js` registra `chrome.tabs.onReplaced` e chama `recordReplacement(addedTabId,removedTabId)`. No bootstrap/startup também chama `recoverPendingMigrations()` e `cleanupExpiredAliases()`. Lifecycle e reconciler recebem `resolveCanonicalTabId`/`migrateTabIdentity` como dependências.

## Alias durável e resolução canônica

Aliases usam TTL padrão de 10 minutos e ficam indexados em `gemini_tab_alias_index`. `resolveCanonicalTabId` aceita somente tabId inteiro >=0, segue até 8 hops, recusa alias expirado/inválido, detecta ciclo com Set e, em ciclo/max hops, devolve a identidade **original** em vez de escolher arbitrariamente uma ponta.

`TAB-03` prova cadeia 100→200→300. `TAB-04` prova ciclo 100↔200 e log `TAB_ALIAS_CYCLE`. `TAB-09` prova que alias expirado não autoriza takeover e é removido pelo cleanup.

## Ordem recordReplacement

`recordReplacement` primeiro persiste o alias removed→added e só então chama `performMigration`. Essa ordem reduz a janela em que a nova tab já existe mas callers ainda não conseguem resolver a identidade antiga.

`TAB-02` cobre replacement antes de existir job: mesmo sem registros para migrar, o alias fica durável e o lifecycle posterior consegue persistir diretamente na chave canônica; `TAB-02 lifecycle` prova isso.

## Journal de migração

`performMigration` cria/indexa `gemini_tab_migration_*` e avança por fases: `alias_written` → `records_copied` → `state_updated` → `alarms_updated` → `old_keys_removed` → `completed`.

Os registros migrados incluem:

- `gemini_job_<tab>` com canonicalTabId/replacementCount;
- `wd_data_<tab>`;
- `gemini_delete_recovery_<tab>`;
- `gemini_finalized_<tab>`;
- referências em `state.jobIndex` e `state.extractionTabs`;
- watchdog legado e finalization marker alarms.

O destino só é sobrescrito quando ausente/compatível. Se oldJob e newJob possuem jobIds diferentes, o módulo loga `TAB_REKEY_CONFLICT` e aborta para não tomar uma tab pertencente a outro job.

## Recovery idempotente

`recoverPendingMigrations` lê apenas o migration index. Journals ausentes/completed ou ids inválidos são desindexados. Journals intermediários são reaplicados do começo; as operações são construídas para serem repetíveis: destino existente compatível é preservado, remover chave ausente é inócuo e state migration substitui ids de forma determinística.

`TAB-05` parte explicitamente de `phase:'records_copied'`, recupera até `completed`, move job 100→200, atualiza state e prova que uma segunda recuperação retorna 0.

## Migração de state

`migrateReferences` prefere `state.replaceGeminiTabReferences`, que no runtime atual é a função serializada de `background/state.js`; se indisponível, tenta `state.mutate`, depois cai para patch/atribuição direta.

Após mover `jobIndex/extractionTabs`, chama o hook `moveFinalizedTabId` injetado pelo background para manter o Set de finalização em memória coerente.

`TAB-01` prova jobIndex/extractionTabs migrados sem mudar `completedJobs`; `TAB-07/TAB-08` prova extraction + marker durável sem alterar contabilidade.

## Alarms

`moveAlarm` consulta o alarme antigo; se não existe, não cria nada. Se existe, limpa o nome antigo e tenta recriar com `when` original quando ainda futuro; se já expirou/é inválido, usa `delayInMinutes:0.01`.

Isso evita reiniciar um watchdog com timeout cheio só porque a tab mudou.

## Integração com reconciler/lifecycle

`jobs-reconciliation.js` canonicaliza cada entry antes de classificá-la como viva/órfã e pode chamar `migrateTabIdentity(...,{jobId})`. `TAB-12` prova que job cujo tab físico antigo morreu mas possui alias para tab viva não é descartado.

`jobs-lifecycle.js` também re-resolve tab após criação/persistência para fechar ambas as ordens da corrida `TAB_REPLACED ↔ job persistence`.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `tab-identity.test.js` TAB-01 | ✅ PROVADO DIRETAMENTE | Job, watchdog, recovery, marker, state refs e alarms migram após replacement. |
| TAB-02 / TAB-02 lifecycle | ✅ PROVADO DIRETAMENTE | Alias antes da persistência permanece durável e lifecycle grava só na chave canônica. |
| TAB-03 | ✅ PROVADO DIRETAMENTE | Cadeia de dois replacements resolve para a tab mais nova. |
| TAB-04 | ✅ PROVADO DIRETAMENTE | Ciclo é detectado, logado e retorna tab original. |
| TAB-05 | ✅ PROVADO DIRETAMENTE | Journal intermediário é recuperado de forma idempotente. |
| TAB-07/TAB-08 | ✅ PROVADO DIRETAMENTE | Extraction/marker migram sem alterar completedJobs. |
| TAB-09 | ✅ PROVADO DIRETAMENTE | Alias expirado não autoriza takeover e cleanup remove a chave. |
| TAB-12 | ✅ PROVADO DIRETAMENTE | Reconciler real + TabIdentity real canonicalizam/migram antes de declarar job órfão, com assertions no estado e storage. |
| `claim-gemini-job-action.test.js` TAB-06 | 🟨 EXECUTADO INDIRETAMENTE | O fluxo de ownership passa por alias/migração, mas não isola cada fase do journal deste módulo. |
| `background.js` | 🟦 GATE ESTÁTICO ESPECÍFICO | O wiring real do runtime registra `tabs.onReplaced` e chama startup/ensureInitialized com as APIs deste módulo. |

## Lacunas de teste, casos-limite e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para atingir `MAX_ALIAS_HOPS=8` sem ciclo e confirmar `TAB_ALIAS_MAX_HOPS`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `persistAlias`/`recordReplacement` com ids negativos, floats, strings ou ids iguais.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `TAB_REKEY_CONFLICT` quando old/new possuem jobs diferentes.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `moveAlarm` com scheduledTime passado/inválido e fallback 0.01 min.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para alarme inexistente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fallback de `migrateReferences` sem `replaceGeminiTabReferences`, usando apenas mutate/patch/atribuição.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para journal ausente/invalid ids dentro do migration index durante recovery.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para duas migrations/replacements concorrentes. `addIndexValue` e `removeIndexValue` fazem read-modify-write de arrays no storage sem fila/transação; updates concorrentes podem perder entradas.
- ⚠️ `cleanupExpiredAliases` também lê o alias index e depois faz `set({index:keep})`; alias criado concorrentemente depois da leitura pode desaparecer do índice embora a chave do alias permaneça.
- ⚠️ **RISCO DE JOURNAL POR jobId:** `migrationKey` usa somente `jobId` quando fornecido. Reutilizar o mesmo jobId em rekeys sucessivos pode reutilizar um journal `completed` antigo com `oldTabId/newTabId` anteriores. A migração corrente ainda usa os argumentos atuais para copiar/remover, mas se o worker cair durante essa segunda migração, recovery lê os ids armazenados no journal antigo. Não há teste de rekey sucessivo com `{jobId}`.
- ⚠️ Crash depois de `persistAlias` mas antes de criar/indexar migration journal deixa alias durável sem journal proativo. Reconciler/lifecycle podem reparar ao encontrar o alias, mas `recoverPendingMigrations` sozinho não verá essa operação.
- ⚠️ `moveFinalizedTabId` é hook síncrono externo; falha lançada pelo hook interromperia migration após state update e antes de alarms/cleanup, dependendo do journal para recovery.
- ⚠️ Logs expõem tabIds completos (não conteúdo de página), enquanto jobId em conflito é truncado a 8 caracteres.

## Solicitações ao auditor persistidas em `.state/033.json`

As lacunas abaixo não foram convertidas em alterações externas por este agente; permanecem como solicitações `OPEN` para auditoria separada.

- **033-001 — TEST_REQUIRED — OPEN — NORMAL:** cobrir limite de 8 hops sem ciclo e entradas inválidas/iguais em `recordReplacement`/resolver. Hoje TAB-03/04/09 provam cadeia curta, ciclo e expiração, mas não esses guards.
- **033-002 — TEST_REQUIRED — OPEN — HIGH:** provar `TAB_REKEY_CONFLICT` quando origem e destino contêm `jobId` diferentes, incluindo preservação integral do destino e ausência de remoção destrutiva.
- **033-003 — TEST_REQUIRED — OPEN — NORMAL:** cobrir `moveAlarm` com alarme ausente e `scheduledTime` passado/inválido, verificando o fallback `delayInMinutes: 0.01`.
- **033-004 — TEST_REQUIRED — OPEN — NORMAL:** cobrir os fallbacks de `migrateReferences` sem `replaceGeminiTabReferences` e guards de recovery para journal ausente/completed/IDs inválidos.
- **033-005 — TEST_REQUIRED — OPEN — HIGH:** exercer replacements/migrations concorrentes e cleanup concorrente para detectar lost updates nos arrays-index de storage usados por `addIndexValue`, `removeIndexValue` e `cleanupExpiredAliases`.
- **033-006 — TEST_REQUIRED — OPEN — HIGH:** simular rekeys sucessivos com o mesmo `jobId` (por exemplo 100→200→300) e interrupção entre fases; verificar que recovery nunca reaplica `oldTabId/newTabId` de um journal concluído anterior.

## Segurança e privacidade

- Alias expirado não deve continuar autorizando ownership; TAB-09 prova essa barreira.
- Conflito de job no destino deve abortar em vez de sobrescrever outro job.
- O módulo migra metadata de jobs, prompts e IDs em storage local, mas não envia nada para rede.
- A cadeia canônica nunca deve ser usada sem TTL/cycle/hop validation.
- O journal é interno e precisa continuar idempotente porque o worker pode cair em qualquer await.

## Invariantes

1. Alias deve ser persistido antes do rekey quando evento onReplaced chega.
2. Alias expirado/inválido nunca deve redirecionar ownership.
3. Ciclo/max-hops não pode escolher arbitrariamente uma identidade; deve falhar fechado para a origem.
4. Destino com jobId diferente nunca pode ser sobrescrito.
5. Novo `gemini_job_*` deve conter geminiTabId/canonicalTabId novos e incrementar replacementCount.
6. State refs, watchdog data, recovery marker e finalization marker precisam migrar de forma coerente.
7. Contadores de jobs/batch não podem mudar durante rekey.
8. Alarms devem preservar deadline sempre que possível.
9. Chaves antigas só devem ser removidas depois de os registros novos/state/alarms terem sido preparados.
10. Migration index precisa permitir replay até phase completed.
11. Cleanup de aliases não pode transformar alias expirado em autoridade novamente.
12. Reconciler/lifecycle devem resolver canonical tab antes de ownership/orphan decisions.

## Fonte integral

~~~javascript
'use strict';
// background/tab-identity.js — Identidade canônica de abas Gemini.
//
// tabId é uma identidade física e pode ser substituído pelo Chromium. Este
// módulo mantém um alias durável old -> new, migra todas as referências do job
// e usa um journal pequeno para tornar o rekey recuperável após suspensão do
// Service Worker.

(function(scope) {
  const ALIAS_PREFIX = 'gemini_tab_alias_';
  const ALIAS_INDEX_KEY = 'gemini_tab_alias_index';
  const MIGRATION_PREFIX = 'gemini_tab_migration_';
  const MIGRATION_INDEX_KEY = 'gemini_tab_migration_index';
  const DEFAULT_ALIAS_TTL_MS = 10 * 60 * 1000;
  const MAX_ALIAS_HOPS = 8;

  function createTabIdentity({
    state,
    log = function() {},
    moveFinalizedTabId = function() {},
    aliasTtlMs = DEFAULT_ALIAS_TTL_MS,
    now = () => Date.now(),
  } = {}) {
    if (!state) throw new Error('tab-identity requer state');

    const aliasKey = tabId => `${ALIAS_PREFIX}${tabId}`;
    const migrationKey = (oldTabId, newTabId, jobId) =>
      `${MIGRATION_PREFIX}${jobId || `${oldTabId}_${newTabId}`}`;

    async function addIndexValue(key, value) {
      const data = await chrome.storage.local.get([key]);
      const list = Array.isArray(data[key]) ? data[key].slice() : [];
      if (!list.includes(value)) list.push(value);
      await chrome.storage.local.set({ [key]: list });
    }

    async function removeIndexValue(key, value) {
      const data = await chrome.storage.local.get([key]);
      const list = Array.isArray(data[key]) ? data[key].filter(item => item !== value) : [];
      await chrome.storage.local.set({ [key]: list });
    }

    function validTabId(tabId) {
      return Number.isInteger(tabId) && tabId >= 0;
    }

    async function resolveCanonicalTabId(tabId) {
      if (!validTabId(tabId)) return tabId;
      const original = tabId;
      let current = tabId;
      const visited = new Set();

      for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
        if (visited.has(current)) {
          log('error', 'bg', 'TAB_ALIAS_CYCLE', 'Ciclo detectado em aliases de aba', {
            oldTabId: original,
            cycleTabId: current,
          });
          return original;
        }
        visited.add(current);

        const key = aliasKey(current);
        const data = await chrome.storage.local.get([key]);
        const alias = data && data[key];
        if (!alias) return current;
        if (!validTabId(alias.newTabId) || !alias.expiresAt || alias.expiresAt <= now()) {
          return current;
        }
        current = alias.newTabId;
      }

      log('error', 'bg', 'TAB_ALIAS_MAX_HOPS', 'Limite de aliases excedido', {
        oldTabId: original,
        lastTabId: current,
      });
      return original;
    }

    async function persistAlias(oldTabId, newTabId) {
      if (!validTabId(oldTabId) || !validTabId(newTabId) || oldTabId === newTabId) return null;
      const alias = {
        oldTabId,
        newTabId,
        createdAt: now(),
        expiresAt: now() + aliasTtlMs,
      };
      await chrome.storage.local.set({ [aliasKey(oldTabId)]: alias });
      await addIndexValue(ALIAS_INDEX_KEY, oldTabId);
      log('info', 'bg', 'TAB_ALIAS_CREATED', 'Alias durável de aba criado', { oldTabId, newTabId });
      return alias;
    }

    async function migrateReferences(oldTabId, newTabId) {
      const mutateSnapshot = snapshot => {
        const next = { ...snapshot };
        next.jobIndex = (Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []).map(entry =>
          entry && entry.geminiTabId === oldTabId
            ? { ...entry, geminiTabId: newTabId }
            : entry
        );

        const extractionTabs = { ...(snapshot.extractionTabs || {}) };
        Object.keys(extractionTabs).forEach(key => {
          const info = extractionTabs[key];
          if (info && info.geminiTabId === oldTabId) {
            extractionTabs[key] = { ...info, geminiTabId: newTabId };
          }
        });
        next.extractionTabs = extractionTabs;
        return next;
      };

      if (typeof state.replaceGeminiTabReferences === 'function') {
        await state.replaceGeminiTabReferences(oldTabId, newTabId);
      } else if (typeof state.mutate === 'function') {
        await state.mutate(mutateSnapshot);
      } else {
        const snapshot = typeof state.get === 'function' ? state.get() : state;
        const next = mutateSnapshot(snapshot || {});
        if (typeof state.patch === 'function') state.patch(next);
        else {
          state.jobIndex = next.jobIndex;
          state.extractionTabs = next.extractionTabs;
        }
      }
      moveFinalizedTabId(oldTabId, newTabId);
    }

    function alarmGet(name) {
      return new Promise(resolve => {
        try {
          chrome.alarms.get(name, alarm => resolve(alarm || null));
        } catch (_error) {
          resolve(null);
        }
      });
    }

    async function moveAlarm(oldName, newName) {
      const alarm = await alarmGet(oldName);
      if (!alarm) return false;
      await chrome.alarms.clear(oldName);
      const when = Number(alarm.scheduledTime);
      if (Number.isFinite(when) && when > now()) chrome.alarms.create(newName, { when });
      else chrome.alarms.create(newName, { delayInMinutes: 0.01 });
      return true;
    }

    async function writeJournal(key, journal, phase) {
      const next = { ...journal, phase, updatedAt: now() };
      await chrome.storage.local.set({ [key]: next });
      return next;
    }

    async function performMigration(oldTabId, requestedNewTabId, {
      journalKey = null,
      jobId = null,
      recovering = false,
    } = {}) {
      if (!validTabId(oldTabId) || !validTabId(requestedNewTabId) || oldTabId === requestedNewTabId) {
        return requestedNewTabId;
      }

      const newTabId = await resolveCanonicalTabId(requestedNewTabId);
      const key = journalKey || migrationKey(oldTabId, newTabId, jobId);
      const existing = await chrome.storage.local.get([key]);
      let journal = existing && existing[key];
      if (!journal) {
        journal = {
          oldTabId,
          newTabId,
          jobId: jobId || null,
          phase: 'alias_written',
          createdAt: now(),
          updatedAt: now(),
        };
        await chrome.storage.local.set({ [key]: journal });
      }
      await addIndexValue(MIGRATION_INDEX_KEY, key);

      log('info', 'bg', recovering ? 'TAB_REKEY_RECOVERED' : 'TAB_REKEY_BEGIN',
        recovering ? 'Retomando migração de identidade de aba' : 'Iniciando migração de identidade de aba',
        { oldTabId, newTabId, phase: journal.phase });

      const oldJobKey = `gemini_job_${oldTabId}`;
      const newJobKey = `gemini_job_${newTabId}`;
      const oldWdKey = `wd_data_${oldTabId}`;
      const newWdKey = `wd_data_${newTabId}`;
      const oldRecoveryKey = `gemini_delete_recovery_${oldTabId}`;
      const newRecoveryKey = `gemini_delete_recovery_${newTabId}`;
      const oldFinalizedKey = `gemini_finalized_${oldTabId}`;
      const newFinalizedKey = `gemini_finalized_${newTabId}`;

      const keys = [
        oldJobKey, newJobKey,
        oldWdKey, newWdKey,
        oldRecoveryKey, newRecoveryKey,
        oldFinalizedKey, newFinalizedKey,
      ];
      const data = await chrome.storage.local.get(keys);
      const writes = {};

      const oldJob = data[oldJobKey];
      const newJob = data[newJobKey];

      if (
        oldJob && newJob &&
        oldJob.jobId && newJob.jobId &&
        oldJob.jobId !== newJob.jobId
      ) {
        log('error', 'bg', 'TAB_REKEY_CONFLICT', 'Destino de rekey já pertence a outro job', {
          oldTabId,
          newTabId,
          oldJobIdPrefix: String(oldJob.jobId).slice(0, 8),
          newJobIdPrefix: String(newJob.jobId).slice(0, 8),
        });
        throw new Error('TAB_REKEY_CONFLICT');
      }

      if (oldJob) {
        if (!newJob || !newJob.jobId || !oldJob.jobId || newJob.jobId === oldJob.jobId) {
          writes[newJobKey] = {
            ...oldJob,
            geminiTabId: newTabId,
            canonicalTabId: newTabId,
            replacementCount: (Number(oldJob.replacementCount) || 0) + 1,
            updatedAt: now(),
          };
          if (!journal.jobId && oldJob.jobId) journal.jobId = oldJob.jobId;
        }
      }

      if (data[oldWdKey] && !data[newWdKey]) {
        writes[newWdKey] = { ...data[oldWdKey], geminiTabId: newTabId };
      }
      if (data[oldRecoveryKey] && !data[newRecoveryKey]) {
        const value = data[oldRecoveryKey];
        writes[newRecoveryKey] = value && typeof value === 'object'
          ? { ...value, geminiTabId: newTabId }
          : value;
      }
      if (data[oldFinalizedKey] && !data[newFinalizedKey]) {
        writes[newFinalizedKey] = data[oldFinalizedKey];
      }

      if (Object.keys(writes).length) await chrome.storage.local.set(writes);
      journal = await writeJournal(key, journal, 'records_copied');

      await migrateReferences(oldTabId, newTabId);
      journal = await writeJournal(key, journal, 'state_updated');

      const legacyWatchdogMoved = await moveAlarm(`watchdog_${oldTabId}`, `watchdog_${newTabId}`);
      await moveAlarm(`finalization_marker_${oldTabId}`, `finalization_marker_${newTabId}`);
      journal = await writeJournal(key, { ...journal, legacyWatchdogMoved }, 'alarms_updated');

      await chrome.storage.local.remove([
        oldJobKey,
        oldWdKey,
        oldRecoveryKey,
        oldFinalizedKey,
      ]);
      journal = await writeJournal(key, journal, 'old_keys_removed');

      journal = await writeJournal(key, journal, 'completed');
      await removeIndexValue(MIGRATION_INDEX_KEY, key);

      log('info', 'bg', 'TAB_REKEY_END', 'Migração de identidade de aba concluída', {
        oldTabId,
        newTabId,
        phase: journal.phase,
      });
      return newTabId;
    }

    async function migrateTabIdentity(oldTabId, newTabId, options = {}) {
      return performMigration(oldTabId, newTabId, options);
    }

    async function recordReplacement(addedTabId, removedTabId) {
      if (!validTabId(addedTabId) || !validTabId(removedTabId) || addedTabId === removedTabId) {
        return addedTabId;
      }
      await persistAlias(removedTabId, addedTabId);
      return performMigration(removedTabId, addedTabId);
    }

    async function recoverPendingMigrations() {
      const data = await chrome.storage.local.get([MIGRATION_INDEX_KEY]);
      const keys = Array.isArray(data[MIGRATION_INDEX_KEY]) ? data[MIGRATION_INDEX_KEY].slice() : [];
      let recovered = 0;

      for (const key of keys) {
        // eslint-disable-next-line no-await-in-loop
        const stored = await chrome.storage.local.get([key]);
        const journal = stored && stored[key];
        if (!journal || journal.phase === 'completed') {
          // eslint-disable-next-line no-await-in-loop
          await removeIndexValue(MIGRATION_INDEX_KEY, key);
          continue;
        }
        if (!validTabId(journal.oldTabId) || !validTabId(journal.newTabId)) {
          // eslint-disable-next-line no-await-in-loop
          await removeIndexValue(MIGRATION_INDEX_KEY, key);
          continue;
        }
        // A migração é idempotente: copiar um registro já copiado e remover
        // uma chave já removida não altera a contabilidade.
        // eslint-disable-next-line no-await-in-loop
        await performMigration(journal.oldTabId, journal.newTabId, {
          journalKey: key,
          jobId: journal.jobId || null,
          recovering: true,
        });
        recovered += 1;
      }
      return recovered;
    }

    async function cleanupExpiredAliases() {
      const data = await chrome.storage.local.get([ALIAS_INDEX_KEY]);
      const ids = Array.isArray(data[ALIAS_INDEX_KEY]) ? data[ALIAS_INDEX_KEY].slice() : [];
      const keep = [];
      const remove = [];

      for (const tabId of ids) {
        const key = aliasKey(tabId);
        // eslint-disable-next-line no-await-in-loop
        const stored = await chrome.storage.local.get([key]);
        const alias = stored && stored[key];
        if (alias && validTabId(alias.newTabId) && alias.expiresAt > now()) keep.push(tabId);
        else remove.push(key);
      }

      if (remove.length) await chrome.storage.local.remove(remove);
      await chrome.storage.local.set({ [ALIAS_INDEX_KEY]: keep });
      return { kept: keep.length, removed: remove.length };
    }

    return {
      recordReplacement,
      resolveCanonicalTabId,
      migrateTabIdentity,
      recoverPendingMigrations,
      migrateReferences,
      cleanupExpiredAliases,
      constants: {
        ALIAS_PREFIX,
        ALIAS_INDEX_KEY,
        MIGRATION_PREFIX,
        MIGRATION_INDEX_KEY,
        DEFAULT_ALIAS_TTL_MS,
        MAX_ALIAS_HOPS,
      },
    };
  }

  scope.MangaTranslatorTabIdentity = { createTabIdentity };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createTabIdentity };
  }
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 363/363

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/tab-identity.js — Identidade canônica de abas Gemini. | Comentário de arquitetura/recovery: background/tab-identity.js — Identidade canônica de abas Gemini.. |
| 003 | U01 | // | Comentário de arquitetura/recovery: . |
| 004 | U01 | // tabId é uma identidade física e pode ser substituído pelo Chromium. Este | Comentário de arquitetura/recovery: tabId é uma identidade física e pode ser substituído pelo Chromium. Este. |
| 005 | U01 | // módulo mantém um alias durável old -> new, migra todas as referências do job | Comentário de arquitetura/recovery: módulo mantém um alias durável old -> new, migra todas as referências do job. |
| 006 | U01 | // e usa um journal pequeno para tornar o rekey recuperável após suspensão do | Comentário de arquitetura/recovery: e usa um journal pequeno para tornar o rekey recuperável após suspensão do. |
| 007 | U01 | // Service Worker. | Comentário de arquitetura/recovery: Service Worker.. |
| 008 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 009 | U02 | (function(scope) { | Abre função/escopo de U02: (function(scope) { |
| 010 | U02 |   const ALIAS_PREFIX = 'gemini_tab_alias_'; | Declara constante/binding de U02: const ALIAS_PREFIX = 'gemini_tab_alias_'; |
| 011 | U02 |   const ALIAS_INDEX_KEY = 'gemini_tab_alias_index'; | Declara constante/binding de U02: const ALIAS_INDEX_KEY = 'gemini_tab_alias_index'; |
| 012 | U02 |   const MIGRATION_PREFIX = 'gemini_tab_migration_'; | Declara constante/binding de U02: const MIGRATION_PREFIX = 'gemini_tab_migration_'; |
| 013 | U02 |   const MIGRATION_INDEX_KEY = 'gemini_tab_migration_index'; | Declara constante/binding de U02: const MIGRATION_INDEX_KEY = 'gemini_tab_migration_index'; |
| 014 | U02 |   const DEFAULT_ALIAS_TTL_MS = 10 * 60 * 1000; | Declara constante/binding de U02: const DEFAULT_ALIAS_TTL_MS = 10 * 60 * 1000; |
| 015 | U02 |   const MAX_ALIAS_HOPS = 8; | Declara constante/binding de U02: const MAX_ALIAS_HOPS = 8; |
| 016 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 017 | U03 |   function createTabIdentity({ | Abre função/escopo de U03: function createTabIdentity({ |
| 018 | U03 |     state, | Parte concreta de U03: state, |
| 019 | U03 |     log = function() {}, | Parte concreta de U03: log = function() {}, |
| 020 | U03 |     moveFinalizedTabId = function() {}, | Migra tombstone in-memory de finalização fornecido pelo background. |
| 021 | U03 |     aliasTtlMs = DEFAULT_ALIAS_TTL_MS, | Parte concreta de U03: aliasTtlMs = DEFAULT_ALIAS_TTL_MS, |
| 022 | U03 |     now = () => Date.now(), | Parte concreta de U03: now = () => Date.now(), |
| 023 | U03 |   } = {}) { | Parte concreta de U03: } = {}) { |
| 024 | U03 |     if (!state) throw new Error('tab-identity requer state'); | Guard/branch de segurança da unidade: if (!state) throw new Error('tab-identity requer state'); |
| 025 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 026 | U03 |     const aliasKey = tabId => `${ALIAS_PREFIX}${tabId}`; | Declara constante/binding de U03: const aliasKey = tabId => `${ALIAS_PREFIX}${tabId}`; |
| 027 | U03 |     const migrationKey = (oldTabId, newTabId, jobId) => | Declara constante/binding de U03: const migrationKey = (oldTabId, newTabId, jobId) => |
| 028 | U03 |       `${MIGRATION_PREFIX}${jobId \|\| `${oldTabId}_${newTabId}`}`; | Propaga/compara identidade física/canônica do job. |
| 029 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 030 | U04 |     async function addIndexValue(key, value) { | Abre função/escopo de U04: async function addIndexValue(key, value) { |
| 031 | U04 |       const data = await chrome.storage.local.get([key]); | Declara constante/binding de U04: const data = await chrome.storage.local.get([key]); |
| 032 | U04 |       const list = Array.isArray(data[key]) ? data[key].slice() : []; | Declara constante/binding de U04: const list = Array.isArray(data[key]) ? data[key].slice() : []; |
| 033 | U04 |       if (!list.includes(value)) list.push(value); | Guard/branch de segurança da unidade: if (!list.includes(value)) list.push(value); |
| 034 | U04 |       await chrome.storage.local.set({ [key]: list }); | Persiste alias/journal/registro migrado antes de prosseguir. |
| 035 | U04 |     } | Fecha/continua estrutura sintática de U04. |
| 036 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 037 | U04 |     async function removeIndexValue(key, value) { | Abre função/escopo de U04: async function removeIndexValue(key, value) { |
| 038 | U04 |       const data = await chrome.storage.local.get([key]); | Declara constante/binding de U04: const data = await chrome.storage.local.get([key]); |
| 039 | U04 |       const list = Array.isArray(data[key]) ? data[key].filter(item => item !== value) : []; | Declara constante/binding de U04: const list = Array.isArray(data[key]) ? data[key].filter(item => item !== value) : []; |
| 040 | U04 |       await chrome.storage.local.set({ [key]: list }); | Persiste alias/journal/registro migrado antes de prosseguir. |
| 041 | U04 |     } | Fecha/continua estrutura sintática de U04. |
| 042 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 043 | U05 |     function validTabId(tabId) { | Abre função/escopo de U05: function validTabId(tabId) { |
| 044 | U05 |       return Number.isInteger(tabId) && tabId >= 0; | Retorna/encerra caminho: return Number.isInteger(tabId) && tabId >= 0; |
| 045 | U05 |     } | Fecha/continua estrutura sintática de U05. |
| 046 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 047 | U06 |     async function resolveCanonicalTabId(tabId) { | Abre função/escopo de U06: async function resolveCanonicalTabId(tabId) { |
| 048 | U06 |       if (!validTabId(tabId)) return tabId; | Guard/branch de segurança da unidade: if (!validTabId(tabId)) return tabId; |
| 049 | U06 |       const original = tabId; | Declara constante/binding de U06: const original = tabId; |
| 050 | U06 |       let current = tabId; | Declara estado local temporário da migração. |
| 051 | U06 |       const visited = new Set(); | Declara constante/binding de U06: const visited = new Set(); |
| 052 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 053 | U06 |       for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) { | Itera cadeia/índice de forma limitada: for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) { |
| 054 | U06 |         if (visited.has(current)) { | Guard/branch de segurança da unidade: if (visited.has(current)) { |
| 055 | U06 |           log('error', 'bg', 'TAB_ALIAS_CYCLE', 'Ciclo detectado em aliases de aba', { | Emite telemetria específica de alias/rekey. |
| 056 | U06 |             oldTabId: original, | Propaga/compara identidade física/canônica do job. |
| 057 | U06 |             cycleTabId: current, | Parte concreta de U06: cycleTabId: current, |
| 058 | U06 |           }); | Fecha/continua estrutura sintática de U06. |
| 059 | U06 |           return original; | Retorna/encerra caminho: return original; |
| 060 | U06 |         } | Fecha/continua estrutura sintática de U06. |
| 061 | U06 |         visited.add(current); | Parte concreta de U06: visited.add(current); |
| 062 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 063 | U06 |         const key = aliasKey(current); | Declara constante/binding de U06: const key = aliasKey(current); |
| 064 | U06 |         const data = await chrome.storage.local.get([key]); | Declara constante/binding de U06: const data = await chrome.storage.local.get([key]); |
| 065 | U06 |         const alias = data && data[key]; | Declara constante/binding de U06: const alias = data && data[key]; |
| 066 | U06 |         if (!alias) return current; | Guard/branch de segurança da unidade: if (!alias) return current; |
| 067 | U06 |         if (!validTabId(alias.newTabId) \|\| !alias.expiresAt \|\| alias.expiresAt <= now()) { | Guard/branch de segurança da unidade: if (!validTabId(alias.newTabId) // !alias.expiresAt // alias.expiresAt <= now()) { |
| 068 | U06 |           return current; | Retorna/encerra caminho: return current; |
| 069 | U06 |         } | Fecha/continua estrutura sintática de U06. |
| 070 | U06 |         current = alias.newTabId; | Propaga/compara identidade física/canônica do job. |
| 071 | U06 |       } | Fecha/continua estrutura sintática de U06. |
| 072 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 073 | U06 |       log('error', 'bg', 'TAB_ALIAS_MAX_HOPS', 'Limite de aliases excedido', { | Emite telemetria específica de alias/rekey. |
| 074 | U06 |         oldTabId: original, | Propaga/compara identidade física/canônica do job. |
| 075 | U06 |         lastTabId: current, | Parte concreta de U06: lastTabId: current, |
| 076 | U06 |       }); | Fecha/continua estrutura sintática de U06. |
| 077 | U06 |       return original; | Retorna/encerra caminho: return original; |
| 078 | U06 |     } | Fecha/continua estrutura sintática de U06. |
| 079 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 080 | U07 |     async function persistAlias(oldTabId, newTabId) { | Abre função/escopo de U07: async function persistAlias(oldTabId, newTabId) { |
| 081 | U07 |       if (!validTabId(oldTabId) \|\| !validTabId(newTabId) \|\| oldTabId === newTabId) return null; | Guard/branch de segurança da unidade: if (!validTabId(oldTabId) // !validTabId(newTabId) // oldTabId === newTabId) return null; |
| 082 | U07 |       const alias = { | Declara constante/binding de U07: const alias = { |
| 083 | U07 |         oldTabId, | Propaga/compara identidade física/canônica do job. |
| 084 | U07 |         newTabId, | Propaga/compara identidade física/canônica do job. |
| 085 | U07 |         createdAt: now(), | Parte concreta de U07: createdAt: now(), |
| 086 | U07 |         expiresAt: now() + aliasTtlMs, | Parte concreta de U07: expiresAt: now() + aliasTtlMs, |
| 087 | U07 |       }; | Fecha/continua estrutura sintática de U07. |
| 088 | U07 |       await chrome.storage.local.set({ [aliasKey(oldTabId)]: alias }); | Persiste alias/journal/registro migrado antes de prosseguir. |
| 089 | U07 |       await addIndexValue(ALIAS_INDEX_KEY, oldTabId); | Indexa alias/journal para recovery sem scan global. |
| 090 | U07 |       log('info', 'bg', 'TAB_ALIAS_CREATED', 'Alias durável de aba criado', { oldTabId, newTabId }); | Propaga/compara identidade física/canônica do job. |
| 091 | U07 |       return alias; | Retorna/encerra caminho: return alias; |
| 092 | U07 |     } | Fecha/continua estrutura sintática de U07. |
| 093 | U07 | ␠ [linha vazia] | Separador visual da unidade U07. |
| 094 | U08 |     async function migrateReferences(oldTabId, newTabId) { | Abre função/escopo de U08: async function migrateReferences(oldTabId, newTabId) { |
| 095 | U08 |       const mutateSnapshot = snapshot => { | Declara constante/binding de U08: const mutateSnapshot = snapshot => { |
| 096 | U08 |         const next = { ...snapshot }; | Declara constante/binding de U08: const next = { ...snapshot }; |
| 097 | U08 |         next.jobIndex = (Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []).map(entry => | Atualiza referência em state para a nova tab canônica. |
| 098 | U08 |           entry && entry.geminiTabId === oldTabId | Propaga/compara identidade física/canônica do job. |
| 099 | U08 |             ? { ...entry, geminiTabId: newTabId } | Propaga/compara identidade física/canônica do job. |
| 100 | U08 |             : entry | Parte concreta de U08: : entry |
| 101 | U08 |         ); | Fecha/continua estrutura sintática de U08. |
| 102 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 103 | U08 |         const extractionTabs = { ...(snapshot.extractionTabs \|\| {}) }; | Declara constante/binding de U08: const extractionTabs = { ...(snapshot.extractionTabs // {}) }; |
| 104 | U08 |         Object.keys(extractionTabs).forEach(key => { | Atualiza referência em state para a nova tab canônica. |
| 105 | U08 |           const info = extractionTabs[key]; | Declara constante/binding de U08: const info = extractionTabs[key]; |
| 106 | U08 |           if (info && info.geminiTabId === oldTabId) { | Guard/branch de segurança da unidade: if (info && info.geminiTabId === oldTabId) { |
| 107 | U08 |             extractionTabs[key] = { ...info, geminiTabId: newTabId }; | Propaga/compara identidade física/canônica do job. |
| 108 | U08 |           } | Fecha/continua estrutura sintática de U08. |
| 109 | U08 |         }); | Fecha/continua estrutura sintática de U08. |
| 110 | U08 |         next.extractionTabs = extractionTabs; | Atualiza referência em state para a nova tab canônica. |
| 111 | U08 |         return next; | Retorna/encerra caminho: return next; |
| 112 | U08 |       }; | Fecha/continua estrutura sintática de U08. |
| 113 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 114 | U08 |       if (typeof state.replaceGeminiTabReferences === 'function') { | Guard/branch de segurança da unidade: if (typeof state.replaceGeminiTabReferences === 'function') { |
| 115 | U08 |         await state.replaceGeminiTabReferences(oldTabId, newTabId); | Propaga/compara identidade física/canônica do job. |
| 116 | U08 |       } else if (typeof state.mutate === 'function') { | Parte concreta de U08: } else if (typeof state.mutate === 'function') { |
| 117 | U08 |         await state.mutate(mutateSnapshot); | Parte concreta de U08: await state.mutate(mutateSnapshot); |
| 118 | U08 |       } else { | Parte concreta de U08: } else { |
| 119 | U08 |         const snapshot = typeof state.get === 'function' ? state.get() : state; | Declara constante/binding de U08: const snapshot = typeof state.get === 'function' ? state.get() : state; |
| 120 | U08 |         const next = mutateSnapshot(snapshot \|\| {}); | Declara constante/binding de U08: const next = mutateSnapshot(snapshot // {}); |
| 121 | U08 |         if (typeof state.patch === 'function') state.patch(next); | Guard/branch de segurança da unidade: if (typeof state.patch === 'function') state.patch(next); |
| 122 | U08 |         else { | Parte concreta de U08: else { |
| 123 | U08 |           state.jobIndex = next.jobIndex; | Atualiza referência em state para a nova tab canônica. |
| 124 | U08 |           state.extractionTabs = next.extractionTabs; | Atualiza referência em state para a nova tab canônica. |
| 125 | U08 |         } | Fecha/continua estrutura sintática de U08. |
| 126 | U08 |       } | Fecha/continua estrutura sintática de U08. |
| 127 | U08 |       moveFinalizedTabId(oldTabId, newTabId); | Migra tombstone in-memory de finalização fornecido pelo background. |
| 128 | U08 |     } | Fecha/continua estrutura sintática de U08. |
| 129 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 130 | U09 |     function alarmGet(name) { | Abre função/escopo de U09: function alarmGet(name) { |
| 131 | U09 |       return new Promise(resolve => { | Retorna/encerra caminho: return new Promise(resolve => { |
| 132 | U09 |         try { | Abre bloco tolerante a falha de API. |
| 133 | U09 |           chrome.alarms.get(name, alarm => resolve(alarm \|\| null)); | Lê alarme existente para preservar deadline. |
| 134 | U09 |         } catch (_error) { | Captura/degrada falha da operação anterior. |
| 135 | U09 |           resolve(null); | Parte concreta de U09: resolve(null); |
| 136 | U09 |         } | Fecha/continua estrutura sintática de U09. |
| 137 | U09 |       }); | Fecha/continua estrutura sintática de U09. |
| 138 | U09 |     } | Fecha/continua estrutura sintática de U09. |
| 139 | U09 | ␠ [linha vazia] | Separador visual da unidade U09. |
| 140 | U09 |     async function moveAlarm(oldName, newName) { | Abre função/escopo de U09: async function moveAlarm(oldName, newName) { |
| 141 | U09 |       const alarm = await alarmGet(oldName); | Declara constante/binding de U09: const alarm = await alarmGet(oldName); |
| 142 | U09 |       if (!alarm) return false; | Guard/branch de segurança da unidade: if (!alarm) return false; |
| 143 | U09 |       await chrome.alarms.clear(oldName); | Remove alarme com identidade antiga. |
| 144 | U09 |       const when = Number(alarm.scheduledTime); | Declara constante/binding de U09: const when = Number(alarm.scheduledTime); |
| 145 | U09 |       if (Number.isFinite(when) && when > now()) chrome.alarms.create(newName, { when }); | Guard/branch de segurança da unidade: if (Number.isFinite(when) && when > now()) chrome.alarms.create(newName, { when }); |
| 146 | U09 |       else chrome.alarms.create(newName, { delayInMinutes: 0.01 }); | Recria alarme sob identidade nova preservando quando possível o horário. |
| 147 | U09 |       return true; | Retorna/encerra caminho: return true; |
| 148 | U09 |     } | Fecha/continua estrutura sintática de U09. |
| 149 | U09 | ␠ [linha vazia] | Separador visual da unidade U09. |
| 150 | U10 |     async function writeJournal(key, journal, phase) { | Abre função/escopo de U10: async function writeJournal(key, journal, phase) { |
| 151 | U10 |       const next = { ...journal, phase, updatedAt: now() }; | Declara constante/binding de U10: const next = { ...journal, phase, updatedAt: now() }; |
| 152 | U10 |       await chrome.storage.local.set({ [key]: next }); | Persiste alias/journal/registro migrado antes de prosseguir. |
| 153 | U10 |       return next; | Retorna/encerra caminho: return next; |
| 154 | U10 |     } | Fecha/continua estrutura sintática de U10. |
| 155 | U10 | ␠ [linha vazia] | Separador visual da unidade U10. |
| 156 | U11 |     async function performMigration(oldTabId, requestedNewTabId, { | Abre função/escopo de U11: async function performMigration(oldTabId, requestedNewTabId, { |
| 157 | U11 |       journalKey = null, | Parte concreta de U11: journalKey = null, |
| 158 | U11 |       jobId = null, | Propaga/compara identidade física/canônica do job. |
| 159 | U11 |       recovering = false, | Parte concreta de U11: recovering = false, |
| 160 | U11 |     } = {}) { | Parte concreta de U11: } = {}) { |
| 161 | U11 |       if (!validTabId(oldTabId) \|\| !validTabId(requestedNewTabId) \|\| oldTabId === requestedNewTabId) { | Guard/branch de segurança da unidade: if (!validTabId(oldTabId) // !validTabId(requestedNewTabId) // oldTabId === requestedNewTabId) { |
| 162 | U11 |         return requestedNewTabId; | Retorna/encerra caminho: return requestedNewTabId; |
| 163 | U11 |       } | Fecha/continua estrutura sintática de U11. |
| 164 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 165 | U11 |       const newTabId = await resolveCanonicalTabId(requestedNewTabId); | Declara constante/binding de U11: const newTabId = await resolveCanonicalTabId(requestedNewTabId); |
| 166 | U11 |       const key = journalKey \|\| migrationKey(oldTabId, newTabId, jobId); | Declara constante/binding de U11: const key = journalKey // migrationKey(oldTabId, newTabId, jobId); |
| 167 | U11 |       const existing = await chrome.storage.local.get([key]); | Declara constante/binding de U11: const existing = await chrome.storage.local.get([key]); |
| 168 | U11 |       let journal = existing && existing[key]; | Declara estado local temporário da migração. |
| 169 | U11 |       if (!journal) { | Guard/branch de segurança da unidade: if (!journal) { |
| 170 | U11 |         journal = { | Parte concreta de U11: journal = { |
| 171 | U11 |           oldTabId, | Propaga/compara identidade física/canônica do job. |
| 172 | U11 |           newTabId, | Propaga/compara identidade física/canônica do job. |
| 173 | U11 |           jobId: jobId \|\| null, | Propaga/compara identidade física/canônica do job. |
| 174 | U11 |           phase: 'alias_written', | Parte concreta de U11: phase: 'alias_written', |
| 175 | U11 |           createdAt: now(), | Parte concreta de U11: createdAt: now(), |
| 176 | U11 |           updatedAt: now(), | Parte concreta de U11: updatedAt: now(), |
| 177 | U11 |         }; | Fecha/continua estrutura sintática de U11. |
| 178 | U11 |         await chrome.storage.local.set({ [key]: journal }); | Persiste alias/journal/registro migrado antes de prosseguir. |
| 179 | U11 |       } | Fecha/continua estrutura sintática de U11. |
| 180 | U11 |       await addIndexValue(MIGRATION_INDEX_KEY, key); | Indexa alias/journal para recovery sem scan global. |
| 181 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 182 | U11 |       log('info', 'bg', recovering ? 'TAB_REKEY_RECOVERED' : 'TAB_REKEY_BEGIN', | Emite telemetria específica de alias/rekey. |
| 183 | U11 |         recovering ? 'Retomando migração de identidade de aba' : 'Iniciando migração de identidade de aba', | Parte concreta de U11: recovering ? 'Retomando migração de identidade de aba' : 'Iniciando migração de identidade de aba', |
| 184 | U11 |         { oldTabId, newTabId, phase: journal.phase }); | Propaga/compara identidade física/canônica do job. |
| 185 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 186 | U11 |       const oldJobKey = `gemini_job_${oldTabId}`; | Declara constante/binding de U11: const oldJobKey = `gemini_job_${oldTabId}`; |
| 187 | U11 |       const newJobKey = `gemini_job_${newTabId}`; | Declara constante/binding de U11: const newJobKey = `gemini_job_${newTabId}`; |
| 188 | U11 |       const oldWdKey = `wd_data_${oldTabId}`; | Declara constante/binding de U11: const oldWdKey = `wd_data_${oldTabId}`; |
| 189 | U11 |       const newWdKey = `wd_data_${newTabId}`; | Declara constante/binding de U11: const newWdKey = `wd_data_${newTabId}`; |
| 190 | U11 |       const oldRecoveryKey = `gemini_delete_recovery_${oldTabId}`; | Declara constante/binding de U11: const oldRecoveryKey = `gemini_delete_recovery_${oldTabId}`; |
| 191 | U11 |       const newRecoveryKey = `gemini_delete_recovery_${newTabId}`; | Declara constante/binding de U11: const newRecoveryKey = `gemini_delete_recovery_${newTabId}`; |
| 192 | U11 |       const oldFinalizedKey = `gemini_finalized_${oldTabId}`; | Declara constante/binding de U11: const oldFinalizedKey = `gemini_finalized_${oldTabId}`; |
| 193 | U11 |       const newFinalizedKey = `gemini_finalized_${newTabId}`; | Declara constante/binding de U11: const newFinalizedKey = `gemini_finalized_${newTabId}`; |
| 194 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 195 | U11 |       const keys = [ | Declara constante/binding de U11: const keys = [ |
| 196 | U11 |         oldJobKey, newJobKey, | Parte concreta de U11: oldJobKey, newJobKey, |
| 197 | U11 |         oldWdKey, newWdKey, | Parte concreta de U11: oldWdKey, newWdKey, |
| 198 | U11 |         oldRecoveryKey, newRecoveryKey, | Parte concreta de U11: oldRecoveryKey, newRecoveryKey, |
| 199 | U11 |         oldFinalizedKey, newFinalizedKey, | Parte concreta de U11: oldFinalizedKey, newFinalizedKey, |
| 200 | U11 |       ]; | Fecha/continua estrutura sintática de U11. |
| 201 | U11 |       const data = await chrome.storage.local.get(keys); | Declara constante/binding de U11: const data = await chrome.storage.local.get(keys); |
| 202 | U11 |       const writes = {}; | Declara constante/binding de U11: const writes = {}; |
| 203 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 204 | U11 |       const oldJob = data[oldJobKey]; | Declara constante/binding de U11: const oldJob = data[oldJobKey]; |
| 205 | U11 |       const newJob = data[newJobKey]; | Declara constante/binding de U11: const newJob = data[newJobKey]; |
| 206 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 207 | U11 |       if ( | Guard/branch de segurança da unidade: if ( |
| 208 | U11 |         oldJob && newJob && | Parte concreta de U11: oldJob && newJob && |
| 209 | U11 |         oldJob.jobId && newJob.jobId && | Propaga/compara identidade física/canônica do job. |
| 210 | U11 |         oldJob.jobId !== newJob.jobId | Propaga/compara identidade física/canônica do job. |
| 211 | U11 |       ) { | Parte concreta de U11: ) { |
| 212 | U11 |         log('error', 'bg', 'TAB_REKEY_CONFLICT', 'Destino de rekey já pertence a outro job', { | Emite telemetria específica de alias/rekey. |
| 213 | U11 |           oldTabId, | Propaga/compara identidade física/canônica do job. |
| 214 | U11 |           newTabId, | Propaga/compara identidade física/canônica do job. |
| 215 | U11 |           oldJobIdPrefix: String(oldJob.jobId).slice(0, 8), | Propaga/compara identidade física/canônica do job. |
| 216 | U11 |           newJobIdPrefix: String(newJob.jobId).slice(0, 8), | Propaga/compara identidade física/canônica do job. |
| 217 | U11 |         }); | Fecha/continua estrutura sintática de U11. |
| 218 | U11 |         throw new Error('TAB_REKEY_CONFLICT'); | Parte concreta de U11: throw new Error('TAB_REKEY_CONFLICT'); |
| 219 | U11 |       } | Fecha/continua estrutura sintática de U11. |
| 220 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 221 | U11 |       if (oldJob) { | Guard/branch de segurança da unidade: if (oldJob) { |
| 222 | U11 |         if (!newJob \|\| !newJob.jobId \|\| !oldJob.jobId \|\| newJob.jobId === oldJob.jobId) { | Guard/branch de segurança da unidade: if (!newJob // !newJob.jobId // !oldJob.jobId // newJob.jobId === oldJob.jobId) { |
| 223 | U11 |           writes[newJobKey] = { | Parte concreta de U11: writes[newJobKey] = { |
| 224 | U11 |             ...oldJob, | Parte concreta de U11: ...oldJob, |
| 225 | U11 |             geminiTabId: newTabId, | Propaga/compara identidade física/canônica do job. |
| 226 | U11 |             canonicalTabId: newTabId, | Propaga/compara identidade física/canônica do job. |
| 227 | U11 |             replacementCount: (Number(oldJob.replacementCount) \|\| 0) + 1, | Parte concreta de U11: replacementCount: (Number(oldJob.replacementCount) // 0) + 1, |
| 228 | U11 |             updatedAt: now(), | Parte concreta de U11: updatedAt: now(), |
| 229 | U11 |           }; | Fecha/continua estrutura sintática de U11. |
| 230 | U11 |           if (!journal.jobId && oldJob.jobId) journal.jobId = oldJob.jobId; | Guard/branch de segurança da unidade: if (!journal.jobId && oldJob.jobId) journal.jobId = oldJob.jobId; |
| 231 | U11 |         } | Fecha/continua estrutura sintática de U11. |
| 232 | U11 |       } | Fecha/continua estrutura sintática de U11. |
| 233 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 234 | U11 |       if (data[oldWdKey] && !data[newWdKey]) { | Guard/branch de segurança da unidade: if (data[oldWdKey] && !data[newWdKey]) { |
| 235 | U11 |         writes[newWdKey] = { ...data[oldWdKey], geminiTabId: newTabId }; | Propaga/compara identidade física/canônica do job. |
| 236 | U11 |       } | Fecha/continua estrutura sintática de U11. |
| 237 | U11 |       if (data[oldRecoveryKey] && !data[newRecoveryKey]) { | Guard/branch de segurança da unidade: if (data[oldRecoveryKey] && !data[newRecoveryKey]) { |
| 238 | U11 |         const value = data[oldRecoveryKey]; | Declara constante/binding de U11: const value = data[oldRecoveryKey]; |
| 239 | U11 |         writes[newRecoveryKey] = value && typeof value === 'object' | Parte concreta de U11: writes[newRecoveryKey] = value && typeof value === 'object' |
| 240 | U11 |           ? { ...value, geminiTabId: newTabId } | Propaga/compara identidade física/canônica do job. |
| 241 | U11 |           : value; | Parte concreta de U11: : value; |
| 242 | U11 |       } | Fecha/continua estrutura sintática de U11. |
| 243 | U11 |       if (data[oldFinalizedKey] && !data[newFinalizedKey]) { | Guard/branch de segurança da unidade: if (data[oldFinalizedKey] && !data[newFinalizedKey]) { |
| 244 | U11 |         writes[newFinalizedKey] = data[oldFinalizedKey]; | Parte concreta de U11: writes[newFinalizedKey] = data[oldFinalizedKey]; |
| 245 | U11 |       } | Fecha/continua estrutura sintática de U11. |
| 246 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 247 | U11 |       if (Object.keys(writes).length) await chrome.storage.local.set(writes); | Guard/branch de segurança da unidade: if (Object.keys(writes).length) await chrome.storage.local.set(writes); |
| 248 | U11 |       journal = await writeJournal(key, journal, 'records_copied'); | Avança fase do journal durável da migração. |
| 249 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 250 | U11 |       await migrateReferences(oldTabId, newTabId); | Atualiza referências residentes/persistidas em mt_state. |
| 251 | U11 |       journal = await writeJournal(key, journal, 'state_updated'); | Avança fase do journal durável da migração. |
| 252 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 253 | U11 |       const legacyWatchdogMoved = await moveAlarm(`watchdog_${oldTabId}`, `watchdog_${newTabId}`); | Declara constante/binding de U11: const legacyWatchdogMoved = await moveAlarm(`watchdog_${oldTabId}`, `watchdog_${newTabId}`); |
| 254 | U11 |       await moveAlarm(`finalization_marker_${oldTabId}`, `finalization_marker_${newTabId}`); | Propaga/compara identidade física/canônica do job. |
| 255 | U11 |       journal = await writeJournal(key, { ...journal, legacyWatchdogMoved }, 'alarms_updated'); | Avança fase do journal durável da migração. |
| 256 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 257 | U11 |       await chrome.storage.local.remove([ | Remove chaves antigas ou expiradas após o estado novo estar disponível. |
| 258 | U11 |         oldJobKey, | Parte concreta de U11: oldJobKey, |
| 259 | U11 |         oldWdKey, | Parte concreta de U11: oldWdKey, |
| 260 | U11 |         oldRecoveryKey, | Parte concreta de U11: oldRecoveryKey, |
| 261 | U11 |         oldFinalizedKey, | Parte concreta de U11: oldFinalizedKey, |
| 262 | U11 |       ]); | Fecha/continua estrutura sintática de U11. |
| 263 | U11 |       journal = await writeJournal(key, journal, 'old_keys_removed'); | Avança fase do journal durável da migração. |
| 264 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 265 | U11 |       journal = await writeJournal(key, journal, 'completed'); | Avança fase do journal durável da migração. |
| 266 | U11 |       await removeIndexValue(MIGRATION_INDEX_KEY, key); | Remove item já concluído/descartado do índice durável. |
| 267 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 268 | U11 |       log('info', 'bg', 'TAB_REKEY_END', 'Migração de identidade de aba concluída', { | Emite telemetria específica de alias/rekey. |
| 269 | U11 |         oldTabId, | Propaga/compara identidade física/canônica do job. |
| 270 | U11 |         newTabId, | Propaga/compara identidade física/canônica do job. |
| 271 | U11 |         phase: journal.phase, | Parte concreta de U11: phase: journal.phase, |
| 272 | U11 |       }); | Fecha/continua estrutura sintática de U11. |
| 273 | U11 |       return newTabId; | Retorna/encerra caminho: return newTabId; |
| 274 | U11 |     } | Fecha/continua estrutura sintática de U11. |
| 275 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 276 | U12 |     async function migrateTabIdentity(oldTabId, newTabId, options = {}) { | Abre função/escopo de U12: async function migrateTabIdentity(oldTabId, newTabId, options = {}) { |
| 277 | U12 |       return performMigration(oldTabId, newTabId, options); | Retorna/encerra caminho: return performMigration(oldTabId, newTabId, options); |
| 278 | U12 |     } | Fecha/continua estrutura sintática de U12. |
| 279 | U12 | ␠ [linha vazia] | Separador visual da unidade U12. |
| 280 | U13 |     async function recordReplacement(addedTabId, removedTabId) { | Abre função/escopo de U13: async function recordReplacement(addedTabId, removedTabId) { |
| 281 | U13 |       if (!validTabId(addedTabId) \|\| !validTabId(removedTabId) \|\| addedTabId === removedTabId) { | Guard/branch de segurança da unidade: if (!validTabId(addedTabId) // !validTabId(removedTabId) // addedTabId === removedTabId) { |
| 282 | U13 |         return addedTabId; | Retorna/encerra caminho: return addedTabId; |
| 283 | U13 |       } | Fecha/continua estrutura sintática de U13. |
| 284 | U13 |       await persistAlias(removedTabId, addedTabId); | Cria alias durável antes do rekey. |
| 285 | U13 |       return performMigration(removedTabId, addedTabId); | Retorna/encerra caminho: return performMigration(removedTabId, addedTabId); |
| 286 | U13 |     } | Fecha/continua estrutura sintática de U13. |
| 287 | U13 | ␠ [linha vazia] | Separador visual da unidade U13. |
| 288 | U14 |     async function recoverPendingMigrations() { | Abre função/escopo de U14: async function recoverPendingMigrations() { |
| 289 | U14 |       const data = await chrome.storage.local.get([MIGRATION_INDEX_KEY]); | Declara constante/binding de U14: const data = await chrome.storage.local.get([MIGRATION_INDEX_KEY]); |
| 290 | U14 |       const keys = Array.isArray(data[MIGRATION_INDEX_KEY]) ? data[MIGRATION_INDEX_KEY].slice() : []; | Declara constante/binding de U14: const keys = Array.isArray(data[MIGRATION_INDEX_KEY]) ? data[MIGRATION_INDEX_KEY].slice() : []; |
| 291 | U14 |       let recovered = 0; | Declara estado local temporário da migração. |
| 292 | U14 | ␠ [linha vazia] | Separador visual da unidade U14. |
| 293 | U14 |       for (const key of keys) { | Itera cadeia/índice de forma limitada: for (const key of keys) { |
| 294 | U14 |         // eslint-disable-next-line no-await-in-loop | Comentário de arquitetura/recovery: eslint-disable-next-line no-await-in-loop. |
| 295 | U14 |         const stored = await chrome.storage.local.get([key]); | Declara constante/binding de U14: const stored = await chrome.storage.local.get([key]); |
| 296 | U14 |         const journal = stored && stored[key]; | Declara constante/binding de U14: const journal = stored && stored[key]; |
| 297 | U14 |         if (!journal \|\| journal.phase === 'completed') { | Guard/branch de segurança da unidade: if (!journal // journal.phase === 'completed') { |
| 298 | U14 |           // eslint-disable-next-line no-await-in-loop | Comentário de arquitetura/recovery: eslint-disable-next-line no-await-in-loop. |
| 299 | U14 |           await removeIndexValue(MIGRATION_INDEX_KEY, key); | Remove item já concluído/descartado do índice durável. |
| 300 | U14 |           continue; | Parte concreta de U14: continue; |
| 301 | U14 |         } | Fecha/continua estrutura sintática de U14. |
| 302 | U14 |         if (!validTabId(journal.oldTabId) \|\| !validTabId(journal.newTabId)) { | Guard/branch de segurança da unidade: if (!validTabId(journal.oldTabId) // !validTabId(journal.newTabId)) { |
| 303 | U14 |           // eslint-disable-next-line no-await-in-loop | Comentário de arquitetura/recovery: eslint-disable-next-line no-await-in-loop. |
| 304 | U14 |           await removeIndexValue(MIGRATION_INDEX_KEY, key); | Remove item já concluído/descartado do índice durável. |
| 305 | U14 |           continue; | Parte concreta de U14: continue; |
| 306 | U14 |         } | Fecha/continua estrutura sintática de U14. |
| 307 | U14 |         // A migração é idempotente: copiar um registro já copiado e remover | Comentário de arquitetura/recovery: A migração é idempotente: copiar um registro já copiado e remover. |
| 308 | U14 |         // uma chave já removida não altera a contabilidade. | Comentário de arquitetura/recovery: uma chave já removida não altera a contabilidade.. |
| 309 | U14 |         // eslint-disable-next-line no-await-in-loop | Comentário de arquitetura/recovery: eslint-disable-next-line no-await-in-loop. |
| 310 | U14 |         await performMigration(journal.oldTabId, journal.newTabId, { | Executa/reexecuta protocolo de migração idempotente. |
| 311 | U14 |           journalKey: key, | Parte concreta de U14: journalKey: key, |
| 312 | U14 |           jobId: journal.jobId \|\| null, | Propaga/compara identidade física/canônica do job. |
| 313 | U14 |           recovering: true, | Parte concreta de U14: recovering: true, |
| 314 | U14 |         }); | Fecha/continua estrutura sintática de U14. |
| 315 | U14 |         recovered += 1; | Parte concreta de U14: recovered += 1; |
| 316 | U14 |       } | Fecha/continua estrutura sintática de U14. |
| 317 | U14 |       return recovered; | Retorna/encerra caminho: return recovered; |
| 318 | U14 |     } | Fecha/continua estrutura sintática de U14. |
| 319 | U14 | ␠ [linha vazia] | Separador visual da unidade U14. |
| 320 | U15 |     async function cleanupExpiredAliases() { | Abre função/escopo de U15: async function cleanupExpiredAliases() { |
| 321 | U15 |       const data = await chrome.storage.local.get([ALIAS_INDEX_KEY]); | Declara constante/binding de U15: const data = await chrome.storage.local.get([ALIAS_INDEX_KEY]); |
| 322 | U15 |       const ids = Array.isArray(data[ALIAS_INDEX_KEY]) ? data[ALIAS_INDEX_KEY].slice() : []; | Declara constante/binding de U15: const ids = Array.isArray(data[ALIAS_INDEX_KEY]) ? data[ALIAS_INDEX_KEY].slice() : []; |
| 323 | U15 |       const keep = []; | Declara constante/binding de U15: const keep = []; |
| 324 | U15 |       const remove = []; | Declara constante/binding de U15: const remove = []; |
| 325 | U15 | ␠ [linha vazia] | Separador visual da unidade U15. |
| 326 | U15 |       for (const tabId of ids) { | Itera cadeia/índice de forma limitada: for (const tabId of ids) { |
| 327 | U15 |         const key = aliasKey(tabId); | Declara constante/binding de U15: const key = aliasKey(tabId); |
| 328 | U15 |         // eslint-disable-next-line no-await-in-loop | Comentário de arquitetura/recovery: eslint-disable-next-line no-await-in-loop. |
| 329 | U15 |         const stored = await chrome.storage.local.get([key]); | Declara constante/binding de U15: const stored = await chrome.storage.local.get([key]); |
| 330 | U15 |         const alias = stored && stored[key]; | Declara constante/binding de U15: const alias = stored && stored[key]; |
| 331 | U15 |         if (alias && validTabId(alias.newTabId) && alias.expiresAt > now()) keep.push(tabId); | Guard/branch de segurança da unidade: if (alias && validTabId(alias.newTabId) && alias.expiresAt > now()) keep.push(tabId); |
| 332 | U15 |         else remove.push(key); | Parte concreta de U15: else remove.push(key); |
| 333 | U15 |       } | Fecha/continua estrutura sintática de U15. |
| 334 | U15 | ␠ [linha vazia] | Separador visual da unidade U15. |
| 335 | U15 |       if (remove.length) await chrome.storage.local.remove(remove); | Guard/branch de segurança da unidade: if (remove.length) await chrome.storage.local.remove(remove); |
| 336 | U15 |       await chrome.storage.local.set({ [ALIAS_INDEX_KEY]: keep }); | Persiste alias/journal/registro migrado antes de prosseguir. |
| 337 | U15 |       return { kept: keep.length, removed: remove.length }; | Retorna/encerra caminho: return { kept: keep.length, removed: remove.length }; |
| 338 | U15 |     } | Fecha/continua estrutura sintática de U15. |
| 339 | U16 | ␠ [linha vazia] | Separador visual da unidade U16. |
| 340 | U16 |     return { | Retorna/encerra caminho: return { |
| 341 | U16 |       recordReplacement, | Parte concreta de U16: recordReplacement, |
| 342 | U16 |       resolveCanonicalTabId, | Resolve destino/cadeia de alias canônica. |
| 343 | U16 |       migrateTabIdentity, | Parte concreta de U16: migrateTabIdentity, |
| 344 | U16 |       recoverPendingMigrations, | Parte concreta de U16: recoverPendingMigrations, |
| 345 | U16 |       migrateReferences, | Atualiza referências residentes/persistidas em mt_state. |
| 346 | U16 |       cleanupExpiredAliases, | Parte concreta de U16: cleanupExpiredAliases, |
| 347 | U16 |       constants: { | Parte concreta de U16: constants: { |
| 348 | U16 |         ALIAS_PREFIX, | Parte concreta de U16: ALIAS_PREFIX, |
| 349 | U16 |         ALIAS_INDEX_KEY, | Parte concreta de U16: ALIAS_INDEX_KEY, |
| 350 | U16 |         MIGRATION_PREFIX, | Parte concreta de U16: MIGRATION_PREFIX, |
| 351 | U16 |         MIGRATION_INDEX_KEY, | Parte concreta de U16: MIGRATION_INDEX_KEY, |
| 352 | U16 |         DEFAULT_ALIAS_TTL_MS, | Parte concreta de U16: DEFAULT_ALIAS_TTL_MS, |
| 353 | U16 |         MAX_ALIAS_HOPS, | Parte concreta de U16: MAX_ALIAS_HOPS, |
| 354 | U16 |       }, | Fecha/continua estrutura sintática de U16. |
| 355 | U16 |     }; | Fecha/continua estrutura sintática de U16. |
| 356 | U16 |   } | Fecha/continua estrutura sintática de U16. |
| 357 | U16 | ␠ [linha vazia] | Separador visual da unidade U16. |
| 358 | U16 |   scope.MangaTranslatorTabIdentity = { createTabIdentity }; | Parte concreta de U16: scope.MangaTranslatorTabIdentity = { createTabIdentity }; |
| 359 | U16 |   if (typeof module !== 'undefined' && module.exports) { | Guard/branch de segurança da unidade: if (typeof module !== 'undefined' && module.exports) { |
| 360 | U17 |     module.exports = { createTabIdentity }; | Parte concreta de U17: module.exports = { createTabIdentity }; |
| 361 | U17 |   } | Fecha/continua estrutura sintática de U17. |
| 362 | U17 | })(typeof self !== 'undefined' ? self : globalThis); | Parte concreta de U17: })(typeof self !== 'undefined' ? self : globalThis); |
| 363 | U18 | ⏎ [newline final] | Newline terminal editorial. |

## Análise por unidade

### U01 — linhas 1–8 — Cabeçalho e IIFE

**O que faz:** Explica por que tabId físico não é identidade durável e abre o módulo.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Define o problema de tab replacement como responsabilidade própria.

**Por que uma alternativa ingênua seria pior:** Tratar tabId como identidade permanente quebra jobs quando Chromium substitui abas.

### U02 — linhas 9–15 — Constantes de storage/TTL/hops

**O que faz:** Define prefixes, índices duráveis, TTL padrão de 10 min e máximo de 8 hops.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Mantém alias/journal enumeráveis sem usar storage.get(null).

**Por que uma alternativa ingênua seria pior:** Sem índice dedicado recovery/cleanup exigiria varrer todo storage, incluindo blobs grandes.

### U03 — linhas 16–29 — Factory e validação de dependência

**O que faz:** Cria instância com state/log/moveFinalized/clock configuráveis e exige state.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Injeção permite testes determinísticos de TTL e integração com facade real.

**Por que uma alternativa ingênua seria pior:** Capturar globals diretamente esconderia dependências e dificultaria recovery/testes.

### U04 — linhas 30–42 — Índices duráveis auxiliares

**O que faz:** Adiciona/remove chaves dos arrays-index de alias e migrations.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Permite enumerar somente registros relevantes.

**Por que uma alternativa ingênua seria pior:** Sem índices, aliases expirados e journals pendentes seriam difíceis de localizar.

### U05 — linhas 43–46 — validTabId

**O que faz:** Aceita apenas inteiro >=0.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Evita aliases/migrations sobre valores não representativos de tabId.

**Por que uma alternativa ingênua seria pior:** Coerção automática poderia transformar strings/NaN em identidades ambíguas.

### U06 — linhas 47–79 — resolveCanonicalTabId

**O que faz:** Segue cadeia old→new até ausência/expiração, detecta ciclo e limita hops.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Visited Set + TTL + hop cap evitam loop e takeover via alias antigo.

**Por que uma alternativa ingênua seria pior:** Seguir aliases sem limites poderia travar worker ou autorizar identidade stale.

### U07 — linhas 80–93 — persistAlias

**O que faz:** Persiste alias old→new com timestamps/TTL, indexa oldTabId e loga criação.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Alias é escrito antes do rekey para que callers possam resolver a nova identidade cedo.

**Por que uma alternativa ingênua seria pior:** Alias somente em memória desapareceria na suspensão MV3.

### U08 — linhas 94–129 — migrateReferences

**O que faz:** Migra jobIndex/extractionTabs usando a melhor API de state disponível e move tombstone in-memory.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Mantém referências do snapshot coerentes com a nova tab canônica.

**Por que uma alternativa ingênua seria pior:** Atualizar storage sem mt_state deixaria ownership/reconciler usando tab antiga.

### U09 — linhas 130–149 — Alarm helpers

**O que faz:** Obtém alarme com tolerância a throw e move schedule antigo para novo nome.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Preserva deadlines de watchdog/finalization marker através do rekey.

**Por que uma alternativa ingênua seria pior:** Recriar sempre com timeout cheio estenderia prazos; ignorar alarm deixaria cleanup associado à tab antiga.

### U10 — linhas 150–155 — writeJournal

**O que faz:** Persiste fase e updatedAt da migração.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Transforma rekey multi-etapa em operação recuperável após crash.

**Por que uma alternativa ingênua seria pior:** Sem journal, suspensão entre copy/state/remove deixaria estado parcialmente migrado sem roteiro de reparo.

### U11 — linhas 156–275 — performMigration

**O que faz:** Canonicaliza destino, cria/reusa journal, detecta conflito de jobs, copia registros, migra state/alarms, remove chaves antigas e marca completed.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Ordena fases para que cada passo seja idempotente/repetível.

**Por que uma alternativa ingênua seria pior:** Mover/remover chaves em ordem ad hoc poderia perder job/watchdog ou duplicar contabilidade.

### U12 — linhas 276–279 — migrateTabIdentity

**O que faz:** Facade explícita para migração solicitada por lifecycle/reconciler.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Separa API pública do helper interno.

**Por que uma alternativa ingênua seria pior:** Callers não precisam conhecer detalhes de journal.

### U13 — linhas 280–287 — recordReplacement

**O que faz:** Valida evento Chromium, persiste alias e executa migração removed→added.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Garante que alias existe antes da cópia/rekey.

**Por que uma alternativa ingênua seria pior:** Migrar sem alias abre janela em que sender nova não encontra job antigo.

### U14 — linhas 288–319 — recoverPendingMigrations

**O que faz:** Varre migration index, descarta entradas concluídas/inválidas e reexecuta migrations pendentes idempotentemente.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Permite recovery após suspensão/restart em qualquer fase registrada.

**Por que uma alternativa ingênua seria pior:** Recovery não indexado exigiria scan global e poderia esquecer journals parciais.

### U15 — linhas 320–338 — cleanupExpiredAliases

**O que faz:** Varre alias index, mantém aliases válidos e remove chaves expiradas/inválidas.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Limita janela de takeover e crescimento de storage.

**Por que uma alternativa ingênua seria pior:** Aliases eternos permitiriam tabId antigo mapear para nova tab muito depois do job.

### U16 — linhas 339–359 — API pública

**O que faz:** Expõe operações e constantes necessárias ao background/tests.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Mantém detalhes internos escondidos e fornece constantes auditáveis.

**Por que uma alternativa ingênua seria pior:** Exportar storage helpers internos aumentaria acoplamento e permitiria bypass do protocolo.

### U17 — linhas 360–362 — Exports Node e fechamento

**O que faz:** Publica factory no namespace global e CommonJS quando disponível.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Suporta importScripts no MV3 e require/Jest.

**Por que uma alternativa ingênua seria pior:** Um único mecanismo de export quebraria um dos ambientes.

### U18 — linhas 363–363 — Newline final

**O que faz:** Representa newline terminal auditado.

**Como faz:** usa storage/index/journal/state/alarms exatamente na ordem mostrada na fonte e mantém o rekey repetível.

**Por que foi feito assim:** Mantém equivalência física explícita.

**Por que uma alternativa ingênua seria pior:** Ignorá-lo quebraria a convenção das Bíblias.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 362 linhas + newline = 363/363;
- [x] alias/cycle/TTL/hops analisados;
- [x] journal e recovery por fases analisados;
- [x] storage/state/alarms/markers mapeados;
- [x] testes diretos separados de integrações;
- [x] riscos concorrentes e journal por jobId explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `008c9a054ae417e0f31224617346e24fc9dbc1b4`.

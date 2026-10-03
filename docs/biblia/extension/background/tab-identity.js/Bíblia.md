# Bíblia técnica — `extension/background/tab-identity.js`

> **Estado:** ✅ DOCUMENTAÇÃO REAUDITADA PELO AGENTE 23; evidências e lacunas reconferidas no estado atual  
> **SHA auditado:** `008c9a054ae417e0f31224617346e24fc9dbc1b4`  
> **Linhas textuais:** **362**  
> **Posições documentais:** **363** contando newline final  
> **Teste focal:** `tests/unit/background/tab-identity.test.js` — `1f2dd52513037f061613d04453a961fbaeddef84`  
> **Reauditoria:** `AGENTE 23` — fonte, teste focal, consumers, bloco integral e 363 posições reconferidos no branch `docs/project-bible` em 2026-09-30.

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

| Posição | Unidade | Fonte | Papel local específico |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode para que erros de escopo e atribuições inválidas não sejam silenciosamente tolerados. |
| 002 | U01 | // background/tab-identity.js — Identidade canônica de abas Gemini. | Nomeia o módulo e fixa seu domínio: identidade canônica de abas Gemini. |
| 003 | U01 | // | Mantém a continuidade do comentário introdutório sem efeito de runtime. |
| 004 | U01 | // tabId é uma identidade física e pode ser substituído pelo Chromium. Este | Documenta a premissa de que tabId é identidade física e pode ser substituído pelo Chromium. |
| 005 | U01 | // módulo mantém um alias durável old -> new, migra todas as referências do job | Explica que alias durável old→new e migração de referências preservam a identidade lógica do job. |
| 006 | U01 | // e usa um journal pequeno para tornar o rekey recuperável após suspensão do | Introduz o journal como mecanismo para retomar um rekey interrompido. |
| 007 | U01 | // Service Worker. | Relaciona o journal à suspensão/restart do Service Worker MV3. |
| 008 | U01 | ␠ [linha vazia] | Separa contrato arquitetural do módulo de namespace, TTL e limite de aliases; não executa código. |
| 009 | U02 | (function(scope) { | Abre a IIFE e recebe o scope onde a factory será publicada para browser/worker ou Node. |
| 010 | U02 |   const ALIAS_PREFIX = 'gemini_tab_alias_'; | Em namespace, TTL e limite de aliases, `ALIAS_PREFIX` padroniza as chaves individuais de alias. |
| 011 | U02 |   const ALIAS_INDEX_KEY = 'gemini_tab_alias_index'; | Em namespace, TTL e limite de aliases, `ALIAS_INDEX_KEY` nomeia o índice que permite localizar aliases sem scan global. |
| 012 | U02 |   const MIGRATION_PREFIX = 'gemini_tab_migration_'; | Em namespace, TTL e limite de aliases, `MIGRATION_PREFIX` padroniza as chaves de journals de rekey. |
| 013 | U02 |   const MIGRATION_INDEX_KEY = 'gemini_tab_migration_index'; | Em namespace, TTL e limite de aliases, `MIGRATION_INDEX_KEY` nomeia o índice usado pelo recovery no startup. |
| 014 | U02 |   const DEFAULT_ALIAS_TTL_MS = 10 * 60 * 1000; | Em namespace, TTL e limite de aliases, `DEFAULT_ALIAS_TTL_MS` limita a autoridade de um alias antigo a dez minutos por padrão. |
| 015 | U02 |   const MAX_ALIAS_HOPS = 8; | Em namespace, TTL e limite de aliases, `MAX_ALIAS_HOPS` limita a resolução de cadeias a oito saltos. |
| 016 | U03 | ␠ [linha vazia] | Separa namespace, TTL e limite de aliases de configuração de createTabIdentity; não executa código. |
| 017 | U03 |   function createTabIdentity({ | Declara `createTabIdentity` como a unidade executável responsável por configuração de createTabIdentity. |
| 018 | U03 |     state, | Em configuração de createTabIdentity, o campo `state` injeta a facade obrigatória usada para migrar referências do background. |
| 019 | U03 |     log = function() {}, | Em configuração de createTabIdentity, atualiza `log` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 020 | U03 |     moveFinalizedTabId = function() {}, | Em configuração de createTabIdentity, atualiza `moveFinalizedTabId` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 021 | U03 |     aliasTtlMs = DEFAULT_ALIAS_TTL_MS, | Em configuração de createTabIdentity, atualiza `aliasTtlMs` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 022 | U03 |     now = () => Date.now(), | Em configuração de createTabIdentity, atualiza `now` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 023 | U03 |   } = {}) { | Em configuração de createTabIdentity, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 024 | U03 |     if (!state) throw new Error('tab-identity requer state'); | Impede criar a identidade sem `state`, porque uma migração sem essa facade deixaria referências incoerentes. |
| 025 | U03 | ␠ [linha vazia] | Separa configuração de createTabIdentity de derivação das chaves de alias/journal; não executa código. |
| 026 | U03 |     const aliasKey = tabId => `${ALIAS_PREFIX}${tabId}`; | Em derivação das chaves de alias/journal, define `aliasKey` como valor intermediário necessário para esta etapa antes de qualquer efeito posterior. |
| 027 | U03 |     const migrationKey = (oldTabId, newTabId, jobId) => | Em derivação das chaves de alias/journal, define `migrationKey` como valor intermediário necessário para esta etapa antes de qualquer efeito posterior. |
| 028 | U03 |       `${MIGRATION_PREFIX}${jobId \|\| `${oldTabId}_${newTabId}`}`; | Usa jobId como chave estável quando existe; sem jobId, distingue o journal pelo par oldTabId_newTabId. |
| 029 | U03 | ␠ [linha vazia] | Separa derivação das chaves de alias/journal de addIndexValue; não executa código. |
| 030 | U04 |     async function addIndexValue(key, value) { | Declara `addIndexValue` como a unidade executável responsável por addIndexValue. |
| 031 | U04 |       const data = await chrome.storage.local.get([key]); | Em addIndexValue, `data` recebe o snapshot de storage necessário à etapa corrente. |
| 032 | U04 |       const list = Array.isArray(data[key]) ? data[key].slice() : []; | Em addIndexValue, define `list` como valor intermediário necessário para esta etapa antes de qualquer efeito posterior. |
| 033 | U04 |       if (!list.includes(value)) list.push(value); | Evita duplicar a mesma chave/ID no array-índice antes de persistir. |
| 034 | U04 |       await chrome.storage.local.set({ [key]: list }); | Em addIndexValue, persiste o novo estado antes de avançar, tornando a etapa observável/recuperável após suspensão. |
| 035 | U04 |     } | Encerra o bloco sintático de addIndexValue depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 036 | U04 | ␠ [linha vazia] | Separa addIndexValue de removeIndexValue; não executa código. |
| 037 | U04 |     async function removeIndexValue(key, value) { | Declara `removeIndexValue` como a unidade executável responsável por removeIndexValue. |
| 038 | U04 |       const data = await chrome.storage.local.get([key]); | Em removeIndexValue, `data` recebe o snapshot de storage necessário à etapa corrente. |
| 039 | U04 |       const list = Array.isArray(data[key]) ? data[key].filter(item => item !== value) : []; | Em removeIndexValue, define `list` como valor intermediário necessário para esta etapa antes de qualquer efeito posterior. |
| 040 | U04 |       await chrome.storage.local.set({ [key]: list }); | Em removeIndexValue, persiste o novo estado antes de avançar, tornando a etapa observável/recuperável após suspensão. |
| 041 | U04 |     } | Encerra o bloco sintático de removeIndexValue depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 042 | U04 | ␠ [linha vazia] | Separa removeIndexValue de validTabId; não executa código. |
| 043 | U05 |     function validTabId(tabId) { | Declara `validTabId` como a unidade executável responsável por validTabId. |
| 044 | U05 |       return Number.isInteger(tabId) && tabId >= 0; | Define formalmente tabId válido como inteiro não negativo. |
| 045 | U05 |     } | Encerra o bloco sintático de validTabId depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 046 | U05 | ␠ [linha vazia] | Separa validTabId de resolveCanonicalTabId; não executa código. |
| 047 | U06 |     async function resolveCanonicalTabId(tabId) { | Declara `resolveCanonicalTabId` como a unidade executável responsável por resolveCanonicalTabId. |
| 048 | U06 |       if (!validTabId(tabId)) return tabId; | Mantém tabId inválido inalterado e evita consultar storage como se ele concedesse ownership. |
| 049 | U06 |       const original = tabId; | Em resolveCanonicalTabId, `original` preserva o tabId solicitado para retorno fail-closed. |
| 050 | U06 |       let current = tabId; | Em resolveCanonicalTabId, `current` mantém o cursor do hop atualmente resolvido. |
| 051 | U06 |       const visited = new Set(); | Em resolveCanonicalTabId, `visited` registra tabIds já percorridos para detectar ciclos. |
| 052 | U06 | ␠ [linha vazia] | Separa resolveCanonicalTabId de resolveCanonicalTabId; não executa código. |
| 053 | U06 |       for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) { | Itera sequencialmente as entradas de resolveCanonicalTabId para classificar/processar cada identidade de forma determinística. |
| 054 | U06 |         if (visited.has(current)) { | Detecta que o cursor já foi visitado, caracterizando ciclo antes de seguir outro alias. |
| 055 | U06 |           log('error', 'bg', 'TAB_ALIAS_CYCLE', 'Ciclo detectado em aliases de aba', { | Emite `TAB_ALIAS_CYCLE` com metadados suficientes para diagnosticar a cadeia corrompida. |
| 056 | U06 |             oldTabId: original, | Em resolveCanonicalTabId, o campo `oldTabId` registra a identidade física de origem da migração. |
| 057 | U06 |             cycleTabId: current, | Em resolveCanonicalTabId, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 058 | U06 |           }); | Encerra o bloco sintático de resolveCanonicalTabId depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 059 | U06 |           return original; | Em ciclo, devolve a origem para falhar fechado sem escolher arbitrariamente uma ponta. |
| 060 | U06 |         } | Encerra o bloco sintático de resolveCanonicalTabId depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 061 | U06 |         visited.add(current); | Marca o cursor atual como visitado antes de consultar seu próximo alias, permitindo detectar retorno ao mesmo tabId. |
| 062 | U06 | ␠ [linha vazia] | Separa resolveCanonicalTabId de resolveCanonicalTabId; não executa código. |
| 063 | U06 |         const key = aliasKey(current); | Em resolveCanonicalTabId, `key` guarda a chave de storage/journal usada na operação corrente. |
| 064 | U06 |         const data = await chrome.storage.local.get([key]); | Em resolveCanonicalTabId, `data` recebe o snapshot de storage necessário à etapa corrente. |
| 065 | U06 |         const alias = data && data[key]; | Em resolveCanonicalTabId, `alias` representa o redirecionamento persistido do tabId corrente. |
| 066 | U06 |         if (!alias) return current; | Encerra a resolução quando não existe alias para o cursor: ele já é a identidade conhecida mais recente. |
| 067 | U06 |         if (!validTabId(alias.newTabId) \|\| !alias.expiresAt \|\| alias.expiresAt <= now()) { | Recusa redirecionar por alias com destino inválido, sem expiração ou já expirado. |
| 068 | U06 |           return current; | Ao encontrar alias inválido/expirado, mantém o cursor atual como limite seguro da resolução. |
| 069 | U06 |         } | Encerra o bloco sintático de resolveCanonicalTabId depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 070 | U06 |         current = alias.newTabId; | Em resolveCanonicalTabId, atualiza `current` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 071 | U06 |       } | Encerra o bloco sintático de resolveCanonicalTabId depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 072 | U06 | ␠ [linha vazia] | Separa resolveCanonicalTabId de resolveCanonicalTabId; não executa código. |
| 073 | U06 |       log('error', 'bg', 'TAB_ALIAS_MAX_HOPS', 'Limite de aliases excedido', { | Emite `TAB_ALIAS_MAX_HOPS` quando a cadeia consome todos os oito saltos permitidos. |
| 074 | U06 |         oldTabId: original, | Em resolveCanonicalTabId, o campo `oldTabId` registra a identidade física de origem da migração. |
| 075 | U06 |         lastTabId: current, | Em resolveCanonicalTabId, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 076 | U06 |       }); | Encerra o bloco sintático de resolveCanonicalTabId depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 077 | U06 |       return original; | Após exceder oito hops, devolve a origem em vez do último cursor parcial. |
| 078 | U06 |     } | Encerra o bloco sintático de resolveCanonicalTabId depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 079 | U06 | ␠ [linha vazia] | Separa resolveCanonicalTabId de persistAlias; não executa código. |
| 080 | U07 |     async function persistAlias(oldTabId, newTabId) { | Declara `persistAlias` como a unidade executável responsável por persistAlias. |
| 081 | U07 |       if (!validTabId(oldTabId) \|\| !validTabId(newTabId) \|\| oldTabId === newTabId) return null; | Bloqueia persistência de alias para IDs inválidos ou iguais, impedindo autoridade degenerada. |
| 082 | U07 |       const alias = { | Em persistAlias, `alias` representa o redirecionamento persistido do tabId corrente. |
| 083 | U07 |         oldTabId, | Em persistAlias, o campo `oldTabId` registra a identidade física de origem da migração. |
| 084 | U07 |         newTabId, | Em persistAlias, o campo `newTabId` registra a identidade física/canônica de destino. |
| 085 | U07 |         createdAt: now(), | Em persistAlias, o campo `createdAt` registra quando o objeto durável foi criado. |
| 086 | U07 |         expiresAt: now() + aliasTtlMs, | Em persistAlias, o campo `expiresAt` define até quando o alias continua autorizado a redirecionar. |
| 087 | U07 |       }; | Encerra o bloco sintático de persistAlias depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 088 | U07 |       await chrome.storage.local.set({ [aliasKey(oldTabId)]: alias }); | Em persistAlias, persiste o novo estado antes de avançar, tornando a etapa observável/recuperável após suspensão. |
| 089 | U07 |       await addIndexValue(ALIAS_INDEX_KEY, oldTabId); | Indexa a chave/ID recém-persistida para que recovery ou cleanup possa encontrá-la sem scan global. |
| 090 | U07 |       log('info', 'bg', 'TAB_ALIAS_CREATED', 'Alias durável de aba criado', { oldTabId, newTabId }); | Emite `TAB_ALIAS_CREATED` somente após o alias individual e seu índice terem sido persistidos. |
| 091 | U07 |       return alias; | Entrega ao caller o alias que já foi persistido e indexado. |
| 092 | U07 |     } | Encerra o bloco sintático de persistAlias depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 093 | U07 | ␠ [linha vazia] | Separa persistAlias de migrateReferences; não executa código. |
| 094 | U08 |     async function migrateReferences(oldTabId, newTabId) { | Declara `migrateReferences` como a unidade executável responsável por migrateReferences. |
| 095 | U08 |       const mutateSnapshot = snapshot => { | Em migrateReferences, `mutateSnapshot` define a transformação de jobIndex/extractionTabs usada pelos fallbacks de state. |
| 096 | U08 |         const next = { ...snapshot }; | Em migrateReferences, `next` carrega a versão transformada do snapshot/journal sem mutar a entrada original. |
| 097 | U08 |         next.jobIndex = (Array.isArray(snapshot.jobIndex) ? snapshot.jobIndex : []).map(entry => | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 098 | U08 |           entry && entry.geminiTabId === oldTabId | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 099 | U08 |             ? { ...entry, geminiTabId: newTabId } | Reescreve a referência física copiada para o novo tabId canônico. |
| 100 | U08 |             : entry | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 101 | U08 |         ); | Encerra o bloco sintático de migrateReferences depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 102 | U08 | ␠ [linha vazia] | Separa migrateReferences de migrateReferences; não executa código. |
| 103 | U08 |         const extractionTabs = { ...(snapshot.extractionTabs \|\| {}) }; | Em migrateReferences, `extractionTabs` clona o mapa de extraction tabs antes da substituição de referências. |
| 104 | U08 |         Object.keys(extractionTabs).forEach(key => { | Percorre todas as extraction tabs para substituir somente referências que ainda apontam à origem. |
| 105 | U08 |           const info = extractionTabs[key]; | Em migrateReferences, `info` aponta para o registro de extraction tab que está sendo inspecionado. |
| 106 | U08 |           if (info && info.geminiTabId === oldTabId) { | Seleciona somente extraction tabs ainda ligadas ao tabId antigo para serem copiadas com o destino. |
| 107 | U08 |             extractionTabs[key] = { ...info, geminiTabId: newTabId }; | Reescreve a referência física copiada para o novo tabId canônico. |
| 108 | U08 |           } | Encerra o bloco sintático de migrateReferences depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 109 | U08 |         }); | Encerra o bloco sintático de migrateReferences depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 110 | U08 |         next.extractionTabs = extractionTabs; | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 111 | U08 |         return next; | Entrega o snapshot transformado à API de state escolhida. |
| 112 | U08 |       }; | Encerra o bloco sintático de migrateReferences depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 113 | U08 | ␠ [linha vazia] | Separa migrateReferences de migrateReferences; não executa código. |
| 114 | U08 |       if (typeof state.replaceGeminiTabReferences === 'function') { | Prefere a API especializada de state, garantindo a via runtime mais forte antes dos fallbacks. |
| 115 | U08 |         await state.replaceGeminiTabReferences(oldTabId, newTabId); | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 116 | U08 |       } else if (typeof state.mutate === 'function') { | Em migrateReferences, aplica esta condição para decidir se a etapa pode avançar sem violar a integridade do rekey. |
| 117 | U08 |         await state.mutate(mutateSnapshot); | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 118 | U08 |       } else { | Seleciona a compatibilidade com facades antigas quando `replaceGeminiTabReferences` e `mutate` não existem. |
| 119 | U08 |         const snapshot = typeof state.get === 'function' ? state.get() : state; | Em migrateReferences, define `snapshot` como valor intermediário necessário para esta etapa antes de qualquer efeito posterior. |
| 120 | U08 |         const next = mutateSnapshot(snapshot \|\| {}); | Em migrateReferences, `next` carrega a versão transformada do snapshot/journal sem mutar a entrada original. |
| 121 | U08 |         if (typeof state.patch === 'function') state.patch(next); | Usa `state.patch` quando a facade antiga não oferece replace/mutate, antes de cair em atribuição direta. |
| 122 | U08 |         else { | Cai em atribuição direta de `jobIndex/extractionTabs` somente quando `state.patch` também não existe. |
| 123 | U08 |           state.jobIndex = next.jobIndex; | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 124 | U08 |           state.extractionTabs = next.extractionTabs; | Em migrateReferences, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 125 | U08 |         } | Encerra o bloco sintático de migrateReferences depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 126 | U08 |       } | Encerra o bloco sintático de migrateReferences depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 127 | U08 |       moveFinalizedTabId(oldTabId, newTabId); | Move o tombstone in-memory de finalização depois de atualizar as referências da facade state. |
| 128 | U08 |     } | Encerra o bloco sintático de migrateReferences depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 129 | U08 | ␠ [linha vazia] | Separa migrateReferences de alarmGet; não executa código. |
| 130 | U09 |     function alarmGet(name) { | Declara `alarmGet` como a unidade executável responsável por alarmGet. |
| 131 | U09 |       return new Promise(resolve => { | Converte `chrome.alarms.get` callback-based em Promise que resolve com alarme ou null. |
| 132 | U09 |         try { | Em alarmGet, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 133 | U09 |           chrome.alarms.get(name, alarm => resolve(alarm \|\| null)); | Consulta o alarme antigo e normaliza ausência para null dentro do adaptador assíncrono. |
| 134 | U09 |         } catch (_error) { | Em alarmGet, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 135 | U09 |           resolve(null); | Em alarmGet, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 136 | U09 |         } | Encerra o bloco sintático de alarmGet depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 137 | U09 |       }); | Encerra o bloco sintático de alarmGet depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 138 | U09 |     } | Encerra o bloco sintático de alarmGet depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 139 | U09 | ␠ [linha vazia] | Separa alarmGet de moveAlarm; não executa código. |
| 140 | U09 |     async function moveAlarm(oldName, newName) { | Declara `moveAlarm` como a unidade executável responsável por moveAlarm. |
| 141 | U09 |       const alarm = await alarmGet(oldName); | Em moveAlarm, `alarm` representa o alarme antigo que pode ser transferido. |
| 142 | U09 |       if (!alarm) return false; | Se o alarme antigo não existe/não pôde ser lido, retorna false e não fabrica um alarme novo. |
| 143 | U09 |       await chrome.alarms.clear(oldName); | Remove o nome de alarme ligado ao tabId antigo antes de recriá-lo no destino. |
| 144 | U09 |       const when = Number(alarm.scheduledTime); | Em moveAlarm, `when` normaliza scheduledTime para decidir entre preservar deadline e usar fallback curto. |
| 145 | U09 |       if (Number.isFinite(when) && when > now()) chrome.alarms.create(newName, { when }); | Preserva o deadline absoluto somente quando scheduledTime é finito e ainda futuro. |
| 146 | U09 |       else chrome.alarms.create(newName, { delayInMinutes: 0.01 }); | Quando o deadline não é reutilizável, reativa o alarme com fallback curto de 0,01 minuto. |
| 147 | U09 |       return true; | Indica que o alarme antigo existia e foi processado/movido. |
| 148 | U09 |     } | Encerra o bloco sintático de moveAlarm depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 149 | U09 | ␠ [linha vazia] | Separa moveAlarm de writeJournal; não executa código. |
| 150 | U10 |     async function writeJournal(key, journal, phase) { | Declara `writeJournal` como a unidade executável responsável por writeJournal. |
| 151 | U10 |       const next = { ...journal, phase, updatedAt: now() }; | Em writeJournal, `next` carrega a versão transformada do snapshot/journal sem mutar a entrada original. |
| 152 | U10 |       await chrome.storage.local.set({ [key]: next }); | Em writeJournal, persiste o novo estado antes de avançar, tornando a etapa observável/recuperável após suspensão. |
| 153 | U10 |       return next; | Retorna o journal exatamente na versão recém-persistida para a fase seguinte. |
| 154 | U10 |     } | Encerra o bloco sintático de writeJournal depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 155 | U10 | ␠ [linha vazia] | Separa writeJournal de preparação e indexação do journal em performMigration; não executa código. |
| 156 | U11 |     async function performMigration(oldTabId, requestedNewTabId, { | Declara `performMigration` como a unidade executável responsável por preparação e indexação do journal em performMigration. |
| 157 | U11 |       journalKey = null, | Em preparação e indexação do journal em performMigration, atualiza `journalKey` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 158 | U11 |       jobId = null, | Em preparação e indexação do journal em performMigration, atualiza `jobId` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 159 | U11 |       recovering = false, | Em preparação e indexação do journal em performMigration, atualiza `recovering` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 160 | U11 |     } = {}) { | Em preparação e indexação do journal em performMigration, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 161 | U11 |       if (!validTabId(oldTabId) \|\| !validTabId(requestedNewTabId) \|\| oldTabId === requestedNewTabId) { | Aborta cedo para IDs inválidos ou iguais antes de tocar journal, storage, state ou alarms. |
| 162 | U11 |         return requestedNewTabId; | No guard de entrada, devolve o destino pedido sem criar efeitos colaterais. |
| 163 | U11 |       } | Encerra o bloco sintático de preparação e indexação do journal em performMigration depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 164 | U11 | ␠ [linha vazia] | Separa preparação e indexação do journal em performMigration de preparação e indexação do journal em performMigration; não executa código. |
| 165 | U11 |       const newTabId = await resolveCanonicalTabId(requestedNewTabId); | Em preparação e indexação do journal em performMigration, `newTabId` armazena o destino já canonicalizado antes de migrar registros. |
| 166 | U11 |       const key = journalKey \|\| migrationKey(oldTabId, newTabId, jobId); | Em preparação e indexação do journal em performMigration, `key` guarda a chave de storage/journal usada na operação corrente. |
| 167 | U11 |       const existing = await chrome.storage.local.get([key]); | Em preparação e indexação do journal em performMigration, `existing` recebe eventual journal já persistido para permitir replay idempotente. |
| 168 | U11 |       let journal = existing && existing[key]; | Em preparação e indexação do journal em performMigration, `journal` mantém o checkpoint durável da migração. |
| 169 | U11 |       if (!journal) { | Cria journal inicial apenas se a chave ainda não tinha checkpoint persistido. |
| 170 | U11 |         journal = { | Em preparação e indexação do journal em performMigration, atualiza `journal` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 171 | U11 |           oldTabId, | Em preparação e indexação do journal em performMigration, o campo `oldTabId` registra a identidade física de origem da migração. |
| 172 | U11 |           newTabId, | Em preparação e indexação do journal em performMigration, o campo `newTabId` registra a identidade física/canônica de destino. |
| 173 | U11 |           jobId: jobId \|\| null, | Em preparação e indexação do journal em performMigration, o campo `jobId` correlaciona a migração ao job lógico quando disponível. |
| 174 | U11 |           phase: 'alias_written', | Em preparação e indexação do journal em performMigration, o campo `phase` registra o checkpoint atual do protocolo. |
| 175 | U11 |           createdAt: now(), | Em preparação e indexação do journal em performMigration, o campo `createdAt` registra quando o objeto durável foi criado. |
| 176 | U11 |           updatedAt: now(), | Em preparação e indexação do journal em performMigration, o campo `updatedAt` registra quando o checkpoint/job foi atualizado. |
| 177 | U11 |         }; | Encerra o bloco sintático de preparação e indexação do journal em performMigration depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 178 | U11 |         await chrome.storage.local.set({ [key]: journal }); | Em preparação e indexação do journal em performMigration, persiste o novo estado antes de avançar, tornando a etapa observável/recuperável após suspensão. |
| 179 | U11 |       } | Encerra o bloco sintático de preparação e indexação do journal em performMigration depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 180 | U11 |       await addIndexValue(MIGRATION_INDEX_KEY, key); | Indexa a chave/ID recém-persistida para que recovery ou cleanup possa encontrá-la sem scan global. |
| 181 | U11 | ␠ [linha vazia] | Separa preparação e indexação do journal em performMigration de telemetria de begin/recovery; não executa código. |
| 182 | U11 |       log('info', 'bg', recovering ? 'TAB_REKEY_RECOVERED' : 'TAB_REKEY_BEGIN', | Em telemetria de begin/recovery, registra telemetria distinguindo início normal de retomada por recovery. |
| 183 | U11 |         recovering ? 'Retomando migração de identidade de aba' : 'Iniciando migração de identidade de aba', | Em telemetria de begin/recovery, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 184 | U11 |         { oldTabId, newTabId, phase: journal.phase }); | Em telemetria de begin/recovery, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 185 | U11 | ␠ [linha vazia] | Separa telemetria de begin/recovery de derivação e leitura das chaves origem/destino; não executa código. |
| 186 | U11 |       const oldJobKey = `gemini_job_${oldTabId}`; | Em derivação e leitura das chaves origem/destino, `oldJobKey` nomeia o registro de job ligado ao tabId antigo. |
| 187 | U11 |       const newJobKey = `gemini_job_${newTabId}`; | Em derivação e leitura das chaves origem/destino, `newJobKey` nomeia o registro de job ligado ao destino canônico. |
| 188 | U11 |       const oldWdKey = `wd_data_${oldTabId}`; | Em derivação e leitura das chaves origem/destino, `oldWdKey` nomeia watchdog data da origem. |
| 189 | U11 |       const newWdKey = `wd_data_${newTabId}`; | Em derivação e leitura das chaves origem/destino, `newWdKey` nomeia watchdog data do destino. |
| 190 | U11 |       const oldRecoveryKey = `gemini_delete_recovery_${oldTabId}`; | Em derivação e leitura das chaves origem/destino, `oldRecoveryKey` nomeia o marker de recovery de deleção da origem. |
| 191 | U11 |       const newRecoveryKey = `gemini_delete_recovery_${newTabId}`; | Em derivação e leitura das chaves origem/destino, `newRecoveryKey` nomeia o marker de recovery de deleção do destino. |
| 192 | U11 |       const oldFinalizedKey = `gemini_finalized_${oldTabId}`; | Em derivação e leitura das chaves origem/destino, `oldFinalizedKey` nomeia o marker durável de finalização da origem. |
| 193 | U11 |       const newFinalizedKey = `gemini_finalized_${newTabId}`; | Em derivação e leitura das chaves origem/destino, `newFinalizedKey` nomeia o marker durável de finalização do destino. |
| 194 | U11 | ␠ [linha vazia] | Separa derivação e leitura das chaves origem/destino de derivação e leitura das chaves origem/destino; não executa código. |
| 195 | U11 |       const keys = [ | Em derivação e leitura das chaves origem/destino, `keys` agrupa as chaves origem/destino para leitura em lote. |
| 196 | U11 |         oldJobKey, newJobKey, | Em derivação e leitura das chaves origem/destino, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 197 | U11 |         oldWdKey, newWdKey, | Em derivação e leitura das chaves origem/destino, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 198 | U11 |         oldRecoveryKey, newRecoveryKey, | Em derivação e leitura das chaves origem/destino, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 199 | U11 |         oldFinalizedKey, newFinalizedKey, | Em derivação e leitura das chaves origem/destino, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 200 | U11 |       ]; | Encerra o bloco sintático de derivação e leitura das chaves origem/destino depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 201 | U11 |       const data = await chrome.storage.local.get(keys); | Em derivação e leitura das chaves origem/destino, `data` recebe o snapshot de storage necessário à etapa corrente. |
| 202 | U11 |       const writes = {}; | Em derivação e leitura das chaves origem/destino, `writes` acumula apenas gravações compatíveis antes do set em lote. |
| 203 | U11 | ␠ [linha vazia] | Separa derivação e leitura das chaves origem/destino de derivação e leitura das chaves origem/destino; não executa código. |
| 204 | U11 |       const oldJob = data[oldJobKey]; | Em derivação e leitura das chaves origem/destino, `oldJob` referencia o job persistido na origem. |
| 205 | U11 |       const newJob = data[newJobKey]; | Em derivação e leitura das chaves origem/destino, `newJob` referencia eventual job já existente no destino. |
| 206 | U11 | ␠ [linha vazia] | Separa derivação e leitura das chaves origem/destino de proteção TAB_REKEY_CONFLICT; não executa código. |
| 207 | U11 |       if ( | Inicia o guard que impede takeover quando origem e destino pertencem a jobs diferentes. |
| 208 | U11 |         oldJob && newJob && | Exige presença simultânea de jobs em origem e destino para que o guard de conflito seja aplicável. |
| 209 | U11 |         oldJob.jobId && newJob.jobId && | Exige jobIds definidos nos dois registros antes de compará-los como ownership lógico. |
| 210 | U11 |         oldJob.jobId !== newJob.jobId | Caracteriza conflito somente quando os jobIds definidos são diferentes. |
| 211 | U11 |       ) { | Em proteção TAB_REKEY_CONFLICT, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 212 | U11 |         log('error', 'bg', 'TAB_REKEY_CONFLICT', 'Destino de rekey já pertence a outro job', { | Emite `TAB_REKEY_CONFLICT` antes da exceção que bloqueia takeover destrutivo do destino. |
| 213 | U11 |           oldTabId, | Em proteção TAB_REKEY_CONFLICT, o campo `oldTabId` registra a identidade física de origem da migração. |
| 214 | U11 |           newTabId, | Em proteção TAB_REKEY_CONFLICT, o campo `newTabId` registra a identidade física/canônica de destino. |
| 215 | U11 |           oldJobIdPrefix: String(oldJob.jobId).slice(0, 8), | Em proteção TAB_REKEY_CONFLICT, o campo `oldJobIdPrefix` expõe só um prefixo do jobId de origem no diagnóstico de conflito. |
| 216 | U11 |           newJobIdPrefix: String(newJob.jobId).slice(0, 8), | Em proteção TAB_REKEY_CONFLICT, o campo `newJobIdPrefix` expõe só um prefixo do jobId de destino no diagnóstico de conflito. |
| 217 | U11 |         }); | Encerra o bloco sintático de proteção TAB_REKEY_CONFLICT depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 218 | U11 |         throw new Error('TAB_REKEY_CONFLICT'); | Interrompe o rekey antes de qualquer remoção da origem quando o destino pertence a outro job. |
| 219 | U11 |       } | Encerra o bloco sintático de proteção TAB_REKEY_CONFLICT depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 220 | U11 | ␠ [linha vazia] | Separa proteção TAB_REKEY_CONFLICT de cópia compatível de job/watchdog/recovery/finalized; não executa código. |
| 221 | U11 |       if (oldJob) { | Só prepara cópia do registro principal se realmente existe job persistido na origem. |
| 222 | U11 |         if (!newJob \|\| !newJob.jobId \|\| !oldJob.jobId \|\| newJob.jobId === oldJob.jobId) { | Autoriza escrever no destino apenas quando ele está vazio/sem jobId ou pertence ao mesmo job lógico. |
| 223 | U11 |           writes[newJobKey] = { | Em cópia compatível de job/watchdog/recovery/finalized, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 224 | U11 |             ...oldJob, | Preserva todos os campos do job antigo antes de sobrescrever os campos que dependem da identidade da aba. |
| 225 | U11 |             geminiTabId: newTabId, | Em cópia compatível de job/watchdog/recovery/finalized, o campo `geminiTabId` reescreve a referência física para o destino canônico. |
| 226 | U11 |             canonicalTabId: newTabId, | Em cópia compatível de job/watchdog/recovery/finalized, o campo `canonicalTabId` fixa explicitamente o destino canônico no job copiado. |
| 227 | U11 |             replacementCount: (Number(oldJob.replacementCount) \|\| 0) + 1, | Em cópia compatível de job/watchdog/recovery/finalized, o campo `replacementCount` incrementa a contagem de substituições físicas da aba. |
| 228 | U11 |             updatedAt: now(), | Em cópia compatível de job/watchdog/recovery/finalized, o campo `updatedAt` registra quando o checkpoint/job foi atualizado. |
| 229 | U11 |           }; | Encerra o bloco sintático de cópia compatível de job/watchdog/recovery/finalized depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 230 | U11 |           if (!journal.jobId && oldJob.jobId) journal.jobId = oldJob.jobId; | Preenche jobId do journal a partir do job antigo somente quando o journal ainda não o conhece. |
| 231 | U11 |         } | Encerra o bloco sintático de cópia compatível de job/watchdog/recovery/finalized depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 232 | U11 |       } | Encerra o bloco sintático de cópia compatível de job/watchdog/recovery/finalized depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 233 | U11 | ␠ [linha vazia] | Separa cópia compatível de job/watchdog/recovery/finalized de cópia compatível de job/watchdog/recovery/finalized; não executa código. |
| 234 | U11 |       if (data[oldWdKey] && !data[newWdKey]) { | Copia watchdog data apenas se existe na origem e o destino ainda não possui valor. |
| 235 | U11 |         writes[newWdKey] = { ...data[oldWdKey], geminiTabId: newTabId }; | Preserva o watchdog data antigo e troca somente o `geminiTabId` pelo destino. |
| 236 | U11 |       } | Encerra o bloco sintático de cópia compatível de job/watchdog/recovery/finalized depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 237 | U11 |       if (data[oldRecoveryKey] && !data[newRecoveryKey]) { | Copia recovery marker somente se a origem possui valor e a chave de destino está livre. |
| 238 | U11 |         const value = data[oldRecoveryKey]; | Em cópia compatível de job/watchdog/recovery/finalized, `value` preserva o formato original do recovery marker antes de copiá-lo. |
| 239 | U11 |         writes[newRecoveryKey] = value && typeof value === 'object' | Em cópia compatível de job/watchdog/recovery/finalized, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 240 | U11 |           ? { ...value, geminiTabId: newTabId } | Clona o recovery marker em formato objeto e atualiza seu `geminiTabId` sem perder os demais campos. |
| 241 | U11 |           : value; | Em cópia compatível de job/watchdog/recovery/finalized, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 242 | U11 |       } | Encerra o bloco sintático de cópia compatível de job/watchdog/recovery/finalized depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 243 | U11 |       if (data[oldFinalizedKey] && !data[newFinalizedKey]) { | Copia finalization marker apenas se não houver marker pré-existente no destino. |
| 244 | U11 |         writes[newFinalizedKey] = data[oldFinalizedKey]; | Preserva integralmente o finalization marker já contabilizado ao copiá-lo para a chave nova. |
| 245 | U11 |       } | Encerra o bloco sintático de cópia compatível de job/watchdog/recovery/finalized depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 246 | U11 | ␠ [linha vazia] | Separa cópia compatível de job/watchdog/recovery/finalized de checkpointing, migração de state/alarms e remoção da origem; não executa código. |
| 247 | U11 |       if (Object.keys(writes).length) await chrome.storage.local.set(writes); | Evita chamada `storage.set` vazia; persiste apenas quando houve registros compatíveis a copiar. |
| 248 | U11 |       journal = await writeJournal(key, journal, 'records_copied'); | Em checkpointing, migração de state/alarms e remoção da origem, atualiza `journal` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 249 | U11 | ␠ [linha vazia] | Separa checkpointing, migração de state/alarms e remoção da origem de checkpointing, migração de state/alarms e remoção da origem; não executa código. |
| 250 | U11 |       await migrateReferences(oldTabId, newTabId); | Atualiza jobIndex/extractionTabs e o marcador in-memory para que state acompanhe o tabId canônico. |
| 251 | U11 |       journal = await writeJournal(key, journal, 'state_updated'); | Em checkpointing, migração de state/alarms e remoção da origem, atualiza `journal` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 252 | U11 | ␠ [linha vazia] | Separa checkpointing, migração de state/alarms e remoção da origem de checkpointing, migração de state/alarms e remoção da origem; não executa código. |
| 253 | U11 |       const legacyWatchdogMoved = await moveAlarm(`watchdog_${oldTabId}`, `watchdog_${newTabId}`); | Em checkpointing, migração de state/alarms e remoção da origem, `legacyWatchdogMoved` registra se havia watchdog antigo efetivamente transferido. |
| 254 | U11 |       await moveAlarm(`finalization_marker_${oldTabId}`, `finalization_marker_${newTabId}`); | Transfere o alarme associado à identidade antiga para o novo tabId sem reiniciar arbitrariamente o deadline. |
| 255 | U11 |       journal = await writeJournal(key, { ...journal, legacyWatchdogMoved }, 'alarms_updated'); | Em checkpointing, migração de state/alarms e remoção da origem, atualiza `journal` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 256 | U11 | ␠ [linha vazia] | Separa checkpointing, migração de state/alarms e remoção da origem de checkpointing, migração de state/alarms e remoção da origem; não executa código. |
| 257 | U11 |       await chrome.storage.local.remove([ | Em checkpointing, migração de state/alarms e remoção da origem, remove apenas dados já considerados obsoletos depois de o estado substituto estar preparado. |
| 258 | U11 |         oldJobKey, | Em checkpointing, migração de state/alarms e remoção da origem, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 259 | U11 |         oldWdKey, | Em checkpointing, migração de state/alarms e remoção da origem, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 260 | U11 |         oldRecoveryKey, | Em checkpointing, migração de state/alarms e remoção da origem, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 261 | U11 |         oldFinalizedKey, | Em checkpointing, migração de state/alarms e remoção da origem, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 262 | U11 |       ]); | Encerra o bloco sintático de checkpointing, migração de state/alarms e remoção da origem depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 263 | U11 |       journal = await writeJournal(key, journal, 'old_keys_removed'); | Em checkpointing, migração de state/alarms e remoção da origem, atualiza `journal` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 264 | U11 | ␠ [linha vazia] | Separa checkpointing, migração de state/alarms e remoção da origem de checkpointing, migração de state/alarms e remoção da origem; não executa código. |
| 265 | U11 |       journal = await writeJournal(key, journal, 'completed'); | Em checkpointing, migração de state/alarms e remoção da origem, atualiza `journal` para refletir o resultado acumulado desta fase antes do próximo checkpoint. |
| 266 | U11 |       await removeIndexValue(MIGRATION_INDEX_KEY, key); | Desindexa a entrada já concluída/descartada para que startups futuros não a reprocessem. |
| 267 | U11 | ␠ [linha vazia] | Separa checkpointing, migração de state/alarms e remoção da origem de conclusão e telemetria TAB_REKEY_END; não executa código. |
| 268 | U11 |       log('info', 'bg', 'TAB_REKEY_END', 'Migração de identidade de aba concluída', { | Emite `TAB_REKEY_END` apenas depois de o journal chegar a completed e sair do índice. |
| 269 | U11 |         oldTabId, | Em conclusão e telemetria TAB_REKEY_END, o campo `oldTabId` registra a identidade física de origem da migração. |
| 270 | U11 |         newTabId, | Em conclusão e telemetria TAB_REKEY_END, o campo `newTabId` registra a identidade física/canônica de destino. |
| 271 | U11 |         phase: journal.phase, | Em conclusão e telemetria TAB_REKEY_END, o campo `phase` registra o checkpoint atual do protocolo. |
| 272 | U11 |       }); | Encerra o bloco sintático de conclusão e telemetria TAB_REKEY_END depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 273 | U11 |       return newTabId; | Entrega ao caller o destino canonicalizado depois de completar e desindexar o journal. |
| 274 | U11 |     } | Encerra o bloco sintático de conclusão e telemetria TAB_REKEY_END depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 275 | U11 | ␠ [linha vazia] | Separa conclusão e telemetria TAB_REKEY_END de migrateTabIdentity; não executa código. |
| 276 | U12 |     async function migrateTabIdentity(oldTabId, newTabId, options = {}) { | Declara `migrateTabIdentity` como a unidade executável responsável por migrateTabIdentity. |
| 277 | U12 |       return performMigration(oldTabId, newTabId, options); | Delega a fachada pública diretamente ao protocolo recuperável `performMigration`. |
| 278 | U12 |     } | Encerra o bloco sintático de migrateTabIdentity depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 279 | U12 | ␠ [linha vazia] | Separa migrateTabIdentity de recordReplacement; não executa código. |
| 280 | U13 |     async function recordReplacement(addedTabId, removedTabId) { | Declara `recordReplacement` como a unidade executável responsável por recordReplacement. |
| 281 | U13 |       if (!validTabId(addedTabId) \|\| !validTabId(removedTabId) \|\| addedTabId === removedTabId) { | Ignora replacement com IDs inválidos ou iguais antes de criar alias/journal. |
| 282 | U13 |         return addedTabId; | No replacement degenerado, devolve addedTabId e encerra sem persistência. |
| 283 | U13 |       } | Encerra o bloco sintático de recordReplacement depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 284 | U13 |       await persistAlias(removedTabId, addedTabId); | Persiste o redirecionamento removed→added antes de iniciar o rekey dos demais registros. |
| 285 | U13 |       return performMigration(removedTabId, addedTabId); | Executa a migração removed→added somente depois de o alias ter sido persistido. |
| 286 | U13 |     } | Encerra o bloco sintático de recordReplacement depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 287 | U13 | ␠ [linha vazia] | Separa recordReplacement de recoverPendingMigrations; não executa código. |
| 288 | U14 |     async function recoverPendingMigrations() { | Declara `recoverPendingMigrations` como a unidade executável responsável por recoverPendingMigrations. |
| 289 | U14 |       const data = await chrome.storage.local.get([MIGRATION_INDEX_KEY]); | Em recoverPendingMigrations, `data` recebe o snapshot de storage necessário à etapa corrente. |
| 290 | U14 |       const keys = Array.isArray(data[MIGRATION_INDEX_KEY]) ? data[MIGRATION_INDEX_KEY].slice() : []; | Em recoverPendingMigrations, `keys` agrupa as chaves origem/destino para leitura em lote. |
| 291 | U14 |       let recovered = 0; | Em recoverPendingMigrations, `recovered` conta somente migrations que foram realmente retomadas. |
| 292 | U14 | ␠ [linha vazia] | Separa recoverPendingMigrations de recoverPendingMigrations; não executa código. |
| 293 | U14 |       for (const key of keys) { | Itera sequencialmente as entradas de recoverPendingMigrations para classificar/processar cada identidade de forma determinística. |
| 294 | U14 |         // eslint-disable-next-line no-await-in-loop | Autoriza explicitamente o await sequencial nesta iteração porque recoverPendingMigrations precisa processar cada entrada sem interleaving acidental. |
| 295 | U14 |         const stored = await chrome.storage.local.get([key]); | Em recoverPendingMigrations, define `stored` como valor intermediário necessário para esta etapa antes de qualquer efeito posterior. |
| 296 | U14 |         const journal = stored && stored[key]; | Em recoverPendingMigrations, `journal` mantém o checkpoint durável da migração. |
| 297 | U14 |         if (!journal \|\| journal.phase === 'completed') { | Desindexa journal ausente ou já completed em vez de tentar replay desnecessário. |
| 298 | U14 |           // eslint-disable-next-line no-await-in-loop | Autoriza explicitamente o await sequencial nesta iteração porque recoverPendingMigrations precisa processar cada entrada sem interleaving acidental. |
| 299 | U14 |           await removeIndexValue(MIGRATION_INDEX_KEY, key); | Desindexa a entrada já concluída/descartada para que startups futuros não a reprocessem. |
| 300 | U14 |           continue; | Pula o replay da entrada já saneada/desindexada e avança para a próxima journal key. |
| 301 | U14 |         } | Encerra o bloco sintático de recoverPendingMigrations depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 302 | U14 |         if (!validTabId(journal.oldTabId) \|\| !validTabId(journal.newTabId)) { | Desindexa journal cujos IDs não satisfazem `validTabId`, evitando loop eterno de recovery. |
| 303 | U14 |           // eslint-disable-next-line no-await-in-loop | Autoriza explicitamente o await sequencial nesta iteração porque recoverPendingMigrations precisa processar cada entrada sem interleaving acidental. |
| 304 | U14 |           await removeIndexValue(MIGRATION_INDEX_KEY, key); | Desindexa a entrada já concluída/descartada para que startups futuros não a reprocessem. |
| 305 | U14 |           continue; | Pula o replay da entrada já saneada/desindexada e avança para a próxima journal key. |
| 306 | U14 |         } | Encerra o bloco sintático de recoverPendingMigrations depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 307 | U14 |         // A migração é idempotente: copiar um registro já copiado e remover | Documenta a premissa que autoriza replay: copiar novamente um registro já copiado deve ser inócuo. |
| 308 | U14 |         // uma chave já removida não altera a contabilidade. | Completa a premissa de idempotência: remover chave já ausente não deve alterar a contabilidade. |
| 309 | U14 |         // eslint-disable-next-line no-await-in-loop | Autoriza explicitamente o await sequencial nesta iteração porque recoverPendingMigrations precisa processar cada entrada sem interleaving acidental. |
| 310 | U14 |         await performMigration(journal.oldTabId, journal.newTabId, { | Executa/reexecuta o protocolo de rekey com journal, preservando a ordem recuperável das fases. |
| 311 | U14 |           journalKey: key, | Em recoverPendingMigrations, o campo `journalKey` permite ao recovery reutilizar exatamente o journal já indexado. |
| 312 | U14 |           jobId: journal.jobId \|\| null, | Em recoverPendingMigrations, o campo `jobId` correlaciona a migração ao job lógico quando disponível. |
| 313 | U14 |           recovering: true, | Em recoverPendingMigrations, o campo `recovering` distingue replay de uma migração iniciada normalmente. |
| 314 | U14 |         }); | Encerra o bloco sintático de recoverPendingMigrations depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 315 | U14 |         recovered += 1; | Incrementa a métrica de recovery somente após uma migração pendente terminar sem erro. |
| 316 | U14 |       } | Encerra o bloco sintático de recoverPendingMigrations depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 317 | U14 |       return recovered; | Informa quantas migrations pendentes foram efetivamente retomadas nesta passagem. |
| 318 | U14 |     } | Encerra o bloco sintático de recoverPendingMigrations depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 319 | U14 | ␠ [linha vazia] | Separa recoverPendingMigrations de cleanupExpiredAliases; não executa código. |
| 320 | U15 |     async function cleanupExpiredAliases() { | Declara `cleanupExpiredAliases` como a unidade executável responsável por cleanupExpiredAliases. |
| 321 | U15 |       const data = await chrome.storage.local.get([ALIAS_INDEX_KEY]); | Em cleanupExpiredAliases, `data` recebe o snapshot de storage necessário à etapa corrente. |
| 322 | U15 |       const ids = Array.isArray(data[ALIAS_INDEX_KEY]) ? data[ALIAS_INDEX_KEY].slice() : []; | Em cleanupExpiredAliases, `ids` clona o índice de tabIds que serão avaliados pelo cleanup. |
| 323 | U15 |       const keep = []; | Em cleanupExpiredAliases, `keep` acumula aliases ainda válidos que permanecerão indexados. |
| 324 | U15 |       const remove = []; | Em cleanupExpiredAliases, `remove` acumula chaves inválidas/expiradas que serão apagadas. |
| 325 | U15 | ␠ [linha vazia] | Separa cleanupExpiredAliases de cleanupExpiredAliases; não executa código. |
| 326 | U15 |       for (const tabId of ids) { | Itera sequencialmente as entradas de cleanupExpiredAliases para classificar/processar cada identidade de forma determinística. |
| 327 | U15 |         const key = aliasKey(tabId); | Em cleanupExpiredAliases, `key` guarda a chave de storage/journal usada na operação corrente. |
| 328 | U15 |         // eslint-disable-next-line no-await-in-loop | Autoriza explicitamente o await sequencial nesta iteração porque cleanupExpiredAliases precisa processar cada entrada sem interleaving acidental. |
| 329 | U15 |         const stored = await chrome.storage.local.get([key]); | Em cleanupExpiredAliases, define `stored` como valor intermediário necessário para esta etapa antes de qualquer efeito posterior. |
| 330 | U15 |         const alias = stored && stored[key]; | Em cleanupExpiredAliases, `alias` representa o redirecionamento persistido do tabId corrente. |
| 331 | U15 |         if (alias && validTabId(alias.newTabId) && alias.expiresAt > now()) keep.push(tabId); | Mantém no índice somente alias existente, destino válido e TTL ainda vigente. |
| 332 | U15 |         else remove.push(key); | Classifica alias ausente/inválido/expirado para remoção do storage. |
| 333 | U15 |       } | Encerra o bloco sintático de cleanupExpiredAliases depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 334 | U15 | ␠ [linha vazia] | Separa cleanupExpiredAliases de cleanupExpiredAliases; não executa código. |
| 335 | U15 |       if (remove.length) await chrome.storage.local.remove(remove); | Remove chaves obsoletas em lote apenas quando a lista de remoção não está vazia. |
| 336 | U15 |       await chrome.storage.local.set({ [ALIAS_INDEX_KEY]: keep }); | Em cleanupExpiredAliases, persiste o novo estado antes de avançar, tornando a etapa observável/recuperável após suspensão. |
| 337 | U15 |       return { kept: keep.length, removed: remove.length }; | Expõe métricas do garbage collection: aliases mantidos e removidos. |
| 338 | U15 |     } | Encerra o bloco sintático de cleanupExpiredAliases depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 339 | U16 | ␠ [linha vazia] | Separa cleanupExpiredAliases de API retornada por createTabIdentity; não executa código. |
| 340 | U16 |     return { | Inicia o objeto de API pública devolvido por `createTabIdentity`. |
| 341 | U16 |       recordReplacement, | Expõe `recordReplacement` para o listener real de `tabs.onReplaced`. |
| 342 | U16 |       resolveCanonicalTabId, | Expõe o resolver para lifecycle, reconciler e ações de ownership. |
| 343 | U16 |       migrateTabIdentity, | Expõe a fachada de rekey explícito com suporte a opções/jobId. |
| 344 | U16 |       recoverPendingMigrations, | Expõe recovery de journals para bootstrap/startup. |
| 345 | U16 |       migrateReferences, | Atualiza jobIndex/extractionTabs e o marcador in-memory para que state acompanhe o tabId canônico. |
| 346 | U16 |       cleanupExpiredAliases, | Expõe garbage collection de aliases para manutenção no startup. |
| 347 | U16 |       constants: { | Em API retornada por createTabIdentity, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 348 | U16 |         ALIAS_PREFIX, | Expõe o prefixo das chaves individuais de alias para inspeção/testes. |
| 349 | U16 |         ALIAS_INDEX_KEY, | Expõe a chave do índice de aliases para inspeção/testes. |
| 350 | U16 |         MIGRATION_PREFIX, | Expõe o prefixo dos journals de migração para inspeção/testes. |
| 351 | U16 |         MIGRATION_INDEX_KEY, | Expõe a chave do migration index para inspeção/testes. |
| 352 | U16 |         DEFAULT_ALIAS_TTL_MS, | Expõe o TTL padrão adotado pela factory quando não há override. |
| 353 | U16 |         MAX_ALIAS_HOPS, | Expõe o limite de oito hops usado pelo resolver. |
| 354 | U16 |       }, | Em API retornada por createTabIdentity, este fragmento completa a operação corrente e mantém a ordem necessária para que o rekey permaneça recuperável. |
| 355 | U16 |     }; | Encerra o bloco sintático de API retornada por createTabIdentity depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 356 | U16 |   } | Encerra o bloco sintático de API retornada por createTabIdentity depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 357 | U16 | ␠ [linha vazia] | Separa API retornada por createTabIdentity de exports global/CommonJS e fechamento da IIFE; não executa código. |
| 358 | U16 |   scope.MangaTranslatorTabIdentity = { createTabIdentity }; | Publica a factory no namespace global consumido pelo Service Worker. |
| 359 | U16 |   if (typeof module !== 'undefined' && module.exports) { | Só usa `module.exports` quando o ambiente CommonJS está presente, preservando execução no browser. |
| 360 | U17 |     module.exports = { createTabIdentity }; | Exporta a mesma factory para Jest/Node carregar exatamente a implementação de runtime. |
| 361 | U17 |   } | Encerra o bloco sintático de exports global/CommonJS e fechamento da IIFE depois de consolidar a decisão/efeito descrito nas linhas imediatamente anteriores. |
| 362 | U17 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha/invoca a IIFE usando `self` no worker/browser e `globalThis` como fallback em Node. |
| 363 | U18 | ⏎ [newline final] | Registra explicitamente o LF terminal; não executa código, mas completa a equivalência física 363/363. |
## Análise por unidade

### U01 — linhas 1–8 — Cabeçalho e IIFE

**O que faz:** Explica por que tabId físico não é identidade durável e abre o módulo.

**Como faz:** Combina strict mode com o comentário de contrato que liga replacement físico, alias durável e journal recuperável ao ciclo de vida MV3.

**Por que foi feito assim:** Define o problema de tab replacement como responsabilidade própria.

**Por que uma alternativa ingênua seria pior:** Tratar tabId como identidade permanente quebra jobs quando Chromium substitui abas.

### U02 — linhas 9–15 — Constantes de storage/TTL/hops

**O que faz:** Define prefixes, índices duráveis, TTL padrão de 10 min e máximo de 8 hops.

**Como faz:** Isola o módulo em IIFE e separa chaves individuais/índices, com TTL de 10 minutos e limite de oito hops.

**Por que foi feito assim:** Mantém alias/journal enumeráveis sem usar storage.get(null).

**Por que uma alternativa ingênua seria pior:** Sem índice dedicado recovery/cleanup exigiria varrer todo storage, incluindo blobs grandes.

### U03 — linhas 16–29 — Factory e validação de dependência

**O que faz:** Cria instância com state/log/moveFinalized/clock configuráveis e exige state.

**Como faz:** Injeta state/log/hook/TTL/clock, exige state e deriva chaves de alias/journal; com jobId, a chave do journal passa a ser baseada no job lógico.

**Por que foi feito assim:** Injeção permite testes determinísticos de TTL e integração com facade real.

**Por que uma alternativa ingênua seria pior:** Capturar globals diretamente esconderia dependências e dificultaria recovery/testes.

### U04 — linhas 30–42 — Índices duráveis auxiliares

**O que faz:** Adiciona/remove chaves dos arrays-index de alias e migrations.

**Como faz:** Executa read-modify-write dos arrays-índice no storage, evitando duplicata na inclusão e filtrando a entrada na remoção.

**Por que foi feito assim:** Permite enumerar somente registros relevantes.

**Por que uma alternativa ingênua seria pior:** Sem índices, aliases expirados e journals pendentes seriam difíceis de localizar.

### U05 — linhas 43–46 — validTabId

**O que faz:** Aceita apenas inteiro >=0.

**Como faz:** Usa `Number.isInteger(tabId) && tabId >= 0` como predicado único antes de aceitar identidade em alias/recovery.

**Por que foi feito assim:** Evita aliases/migrations sobre valores não representativos de tabId.

**Por que uma alternativa ingênua seria pior:** Coerção automática poderia transformar strings/NaN em identidades ambíguas.

### U06 — linhas 47–79 — resolveCanonicalTabId

**O que faz:** Segue cadeia old→new até ausência/expiração, detecta ciclo e limita hops.

**Como faz:** Segue um alias por vez, registra visitados, valida destino+TTL em cada hop e devolve a origem em ciclo ou excesso de oito saltos.

**Por que foi feito assim:** Visited Set + TTL + hop cap evitam loop e takeover via alias antigo.

**Por que uma alternativa ingênua seria pior:** Seguir aliases sem limites poderia travar worker ou autorizar identidade stale.

### U07 — linhas 80–93 — persistAlias

**O que faz:** Persiste alias old→new com timestamps/TTL, indexa oldTabId e loga criação.

**Como faz:** Monta old/new/createdAt/expiresAt, grava a chave individual, indexa oldTabId e só então emite `TAB_ALIAS_CREATED`.

**Por que foi feito assim:** Alias é escrito antes do rekey para que callers possam resolver a nova identidade cedo.

**Por que uma alternativa ingênua seria pior:** Alias somente em memória desapareceria na suspensão MV3.

### U08 — linhas 94–129 — migrateReferences

**O que faz:** Migra jobIndex/extractionTabs usando a melhor API de state disponível e move tombstone in-memory.

**Como faz:** Reconstrói jobIndex/extractionTabs e escolhe, em ordem, `replaceGeminiTabReferences`, `mutate`, `patch` ou atribuição direta; depois move o tombstone in-memory.

**Por que foi feito assim:** Mantém referências do snapshot coerentes com a nova tab canônica.

**Por que uma alternativa ingênua seria pior:** Atualizar storage sem mt_state deixaria ownership/reconciler usando tab antiga.

### U09 — linhas 130–149 — Alarm helpers

**O que faz:** Obtém alarme com tolerância a throw e move schedule antigo para novo nome.

**Como faz:** Lê o alarme com adaptador Promise tolerante a throw, remove o nome antigo e recria com `when` futuro ou fallback `delayInMinutes:0.01`.

**Por que foi feito assim:** Preserva deadlines de watchdog/finalization marker através do rekey.

**Por que uma alternativa ingênua seria pior:** Recriar sempre com timeout cheio estenderia prazos; ignorar alarm deixaria cleanup associado à tab antiga.

### U10 — linhas 150–155 — writeJournal

**O que faz:** Persiste fase e updatedAt da migração.

**Como faz:** Clona o journal, troca a fase, atualiza `updatedAt`, persiste na mesma chave e retorna a versão efetivamente gravada.

**Por que foi feito assim:** Transforma rekey multi-etapa em operação recuperável após crash.

**Por que uma alternativa ingênua seria pior:** Sem journal, suspensão entre copy/state/remove deixaria estado parcialmente migrado sem roteiro de reparo.

### U11 — linhas 156–275 — performMigration

**O que faz:** Canonicaliza destino, cria/reusa journal, detecta conflito de jobs, copia registros, migra state/alarms, remove chaves antigas e marca completed.

**Como faz:** Canonicaliza o destino, cria/reusa journal, protege conflito de jobId, copia registros, checkpointa state/alarms, remove origem, marca completed e desindexa.

**Por que foi feito assim:** Ordena fases para que cada passo seja idempotente/repetível.

**Por que uma alternativa ingênua seria pior:** Mover/remover chaves em ordem ad hoc poderia perder job/watchdog ou duplicar contabilidade.

### U12 — linhas 276–279 — migrateTabIdentity

**O que faz:** Facade explícita para migração solicitada por lifecycle/reconciler.

**Como faz:** Repassa oldTabId/newTabId/options diretamente a `performMigration`, sem duplicar qualquer regra de journal.

**Por que foi feito assim:** Separa API pública do helper interno.

**Por que uma alternativa ingênua seria pior:** Callers não precisam conhecer detalhes de journal.

### U13 — linhas 280–287 — recordReplacement

**O que faz:** Valida evento Chromium, persiste alias e executa migração removed→added.

**Como faz:** Valida added/removed, persiste primeiro `removed→added` e somente depois migra registros/referências da origem ao destino.

**Por que foi feito assim:** Garante que alias existe antes da cópia/rekey.

**Por que uma alternativa ingênua seria pior:** Migrar sem alias abre janela em que sender nova não encontra job antigo.

### U14 — linhas 288–319 — recoverPendingMigrations

**O que faz:** Varre migration index, descarta entradas concluídas/inválidas e reexecuta migrations pendentes idempotentemente.

**Como faz:** Varre o migration index sequencialmente, desindexa journals inúteis/inválidos e reaplica `performMigration` com a mesma journalKey em modo recovering.

**Por que foi feito assim:** Permite recovery após suspensão/restart em qualquer fase registrada.

**Por que uma alternativa ingênua seria pior:** Recovery não indexado exigiria scan global e poderia esquecer journals parciais.

### U15 — linhas 320–338 — cleanupExpiredAliases

**O que faz:** Varre alias index, mantém aliases válidos e remove chaves expiradas/inválidas.

**Como faz:** Classifica cada alias indexado por existência, tabId de destino e TTL; remove chaves obsoletas e regrava o índice apenas com `keep`.

**Por que foi feito assim:** Limita janela de takeover e crescimento de storage.

**Por que uma alternativa ingênua seria pior:** Aliases eternos permitiriam tabId antigo mapear para nova tab muito depois do job.

### U16 — linhas 339–359 — API pública

**O que faz:** Expõe operações e constantes necessárias ao background/tests.

**Como faz:** Retorna somente operações públicas e constantes auditáveis e publica a factory em `scope.MangaTranslatorTabIdentity` para o background.

**Por que foi feito assim:** Mantém detalhes internos escondidos e fornece constantes auditáveis.

**Por que uma alternativa ingênua seria pior:** Exportar storage helpers internos aumentaria acoplamento e permitiria bypass do protocolo.

### U17 — linhas 360–362 — Exports Node e fechamento

**O que faz:** Publica factory no namespace global e CommonJS quando disponível.

**Como faz:** Exporta a mesma factory via CommonJS quando disponível e fecha a IIFE com `self`/`globalThis`, permitindo browser e Jest usarem o mesmo código.

**Por que foi feito assim:** Suporta importScripts no MV3 e require/Jest.

**Por que uma alternativa ingênua seria pior:** Um único mecanismo de export quebraria um dos ambientes.

### U18 — linhas 363–363 — Newline final

**O que faz:** Representa newline terminal auditado.

**Como faz:** Conta o LF depois da linha 362 como posição física 363 e confirma que o bloco integral preserva esse terminador.

**Por que foi feito assim:** Mantém equivalência física explícita.

**Por que uma alternativa ingênua seria pior:** Ignorá-lo quebraria a convenção das Bíblias.

## Auditoria final — AGENTE 23

- [x] reserva exclusiva reconfirmada para `AGENTE 23`;
- [x] SHA da fonte reconfirmado: `008c9a054ae417e0f31224617346e24fc9dbc1b4`;
- [x] 362 linhas textuais + newline final = 363/363 posições;
- [x] bloco em **Fonte integral** comparado exatamente com a fonte atual;
- [x] rastreabilidade regenerada com 363 papéis locais contextualizados por função/fase;
- [x] teste focal real reconfirmado no SHA `1f2dd52513037f061613d04453a961fbaeddef84`;
- [x] TAB-01/02/03/04/05/07-08/09/12 mantidos somente no nível suportado pelas assertions reais;
- [x] wiring de `background.js`, `jobs-lifecycle.js`, `jobs-reconciliation.js` e `state.js` reconferido;
- [x] lacunas externas não foram corrigidas para fabricar evidência;
- [x] solicitações 033-001..033-006 permanecem OPEN e coerentes com as lacunas observadas;
- [x] nenhum arquivo fora da Bíblia/reserva/state de #033 foi modificado.

**Veredito documental local:** ✅ **APROVADO** para `008c9a054ae417e0f31224617346e24fc9dbc1b4`.

> `STATUS.md`, `CHECKLIST.md` e `AUDITORIA.md` são visões agregadas e permanecem fora do escopo de escrita deste agente.

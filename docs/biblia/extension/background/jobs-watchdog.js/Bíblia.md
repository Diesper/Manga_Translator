# Bíblia técnica — `extension/background/jobs-watchdog.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `c17b766d7fbc34ea925fb82b19149d3d977de413`  
> **Linhas textuais:** **109**  
> **Posições documentais:** **110** contando newline final  
> **Teste direto:** `tests/unit/background/jobs-watchdog-ordering.test.js` — `2102182a1e313a02cdb511846a4561c3a0f607eb`

## Papel arquitetural

`jobs-watchdog.js` transforma deadline de job em estado durável: grava `wd_data_<tabId>`, cria `chrome.alarms` e, no timeout, notifica a aba do mangá, finaliza o job como erro e só então remove abas auxiliares de extração ligadas ao Gemini expirado.

Ao contrário de `setTimeout`, `chrome.alarms` é apropriado para Service Worker MV3 porque o alarme pode reativar o worker. A metadata no storage permite reconstruir o contexto mesmo depois que variáveis em memória desapareceram.

## Nome de alarme e compatibilidade

`alarmNameFor` prefere `watchdog_<jobId>`. Isso é importante porque jobId permanece estável quando o Chrome substitui a tab. O fallback `watchdog_<geminiTabId>` existe para compatibilidade legada.

## Arm/rearm

`arm()` canonicaliza o tabId, limpa alarme anterior, persiste `wd_data` e **só então** cria o novo alarme. Essa ordem garante que, se o alarme disparar, a metadata já deveria existir.

Depois do write, resolve novamente o tabId solicitado. Isso fecha a race em que `tabs.onReplaced` ocorreu depois da primeira canonicalização, mas antes da gravação de `wd_data`. Se mudou, copia metadata para a chave nova, remove a antiga e retorna o tabId mais recente.

O deadline não é reiniciado durante essa migração: o alarme já criado permanece. No fluxo moderno isso é seguro porque o nome usa jobId, que não depende da tab.

### Risco legado sem jobId

Se `arm()` for chamado **sem jobId** e ocorrer replacement exatamente depois do alarm create, o nome do alarme permanece `watchdog_<tabAntiga>`, enquanto `wd_data` é migrado para `<tabNova>`. Se o índice também já foi migrado, `handleAlarm` pode não localizar a chave nova a partir do sufixo antigo. O runtime atual passa jobId tanto no scheduler quanto no REFRESH_JOB_WATCHDOG, mas não há teste focal do fallback legado nessa race.

## Clear

`clear(geminiTabId,jobId)` limpa o alarme e somente no callback remove `wd_data_<geminiTabId>`. É cleanup best-effort; não retorna Promise nem aguarda remoção do storage.

## Alarm routing

`handleAlarm()` retorna false para nomes fora de `watchdog_*`. Para watchdog, extrai o sufixo e tenta resolver pelo `jobIndex` tanto por jobId quanto por geminiTabId. Depois consulta somente chaves específicas de storage, evitando `storage.get(null)` e a carga de assets/Base64 não relacionados.

Se storage não contém metadata mas o índice contém o job, reconstrói um watchdog mínimo a partir do índice. Isso dá resiliência contra perda parcial de `wd_data`.

## Timeout e canonicalização

Antes de finalizar, o tabId bruto é canonicalizado novamente. O log `JOB_TIMEOUT` registra tab canônica e, quando houve replacement, também a tab antiga em `replacedTabId`.

A UI recebe `SHOW_ERROR_INTEGRATED` somente se há `mangaTabId`. Falha de envio é ignorada para que a contabilidade do job não fique presa.

## Ordem finalização → extraction cleanup

O código executa `await finalizeJob(tabId, mangaTabId, true)` **antes** de fechar extraction tabs. O teste direto WATCHDOG-ORDER-01 bloqueia artificialmente `finalizeJob` e prova que a aba auxiliar continua viva até a Promise liberar.

Essa ordem é importante porque `finalizeJob` grava marker/accounting durável. Remover recursos auxiliares primeiro poderia destruir contexto antes de a finalização estar segura.

## Integração real

`batch-lifecycle-real.test.js` cria um lote real, observa `wd_data`, dispara `watchdog_<jobId>` e prova que a aba do mangá recebe erro integrado, a tab Gemini fecha, `gemini_job`/`wd_data` somem e `activeJobsCount` cai para zero.

`background.js` registra um listener de `chrome.alarms` que inicializa o worker e chama `jobsWatchdog.handleAlarm(alarm)` antes do bloco legado de fallback. Para qualquer nome `watchdog_*`, este módulo retorna true imediatamente e assume o tratamento.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `jobs-watchdog-ordering.test.js` | ✅ PROVADO DIRETAMENTE | Importa o módulo real e prova que finalizeJob termina antes da remoção da extraction tab correta. |
| `batch-lifecycle-real.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | Arm real persiste wd_data; alarme real notifica UI, finaliza/limpa job e reduz activeJobsCount. |
| `tab-identity.test.js` | 🟨 PROVA DA DEPENDÊNCIA | Prova migração de `wd_data` pelo TabIdentity, mas não a segunda canonicalização dentro de `arm()`. |
| `refresh-job-watchdog-action.test.js` | 🟨 CONSUMIDOR INDIRETO | Prova que a action chama armWatchdog com jobId/identidade persistida; não executa internamente este módulo. |
| `background.js` | 🟨 CONSUMIDOR REAL | Injeta índice/extraction/finalize/identity e roteia alarmes para handleAlarm. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `arm()` isolado: ordem clear → storage.set → alarms.create.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para replacement ocorrer exatamente entre persistência e segunda canonicalização de `arm()`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para race legada sem jobId, em que o nome do alarme pode continuar ligado à tab antiga enquanto wd_data migra.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falha/rejeição de `storage.local.set/get/remove` durante arm/migração.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `chrome.alarms.clear/create` falhar ou callback de clear não chegar.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para metadata ausente e fallback pelo índice no timeout.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para alarme cujo job não existe nem no storage nem no índice; é ignorado silenciosamente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `resolveCanonicalTabId` rejeitar durante timeout.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `finalizeJob` rejeitar; como o callback de storage é async e não há catch, extraction cleanup não ocorreria e pode haver rejeição não tratada.
- ⚠️ `clear()` não aguarda a remoção de wd_data; caller não recebe confirmação de cleanup.
- ⚠️ `handleAlarm()` retorna true antes de o callback assíncrono de storage/finalização terminar; a ordem interna é correta, mas o caller externo não pode awaitar sua conclusão.

## Segurança e privacidade

- `wd_data` persiste apenas ids/índice, não bytes de imagem nem prompt.
- O sufixo moderno do alarme usa jobId; logs de timeout não expõem jobId.
- Mensagem de erro é enviada apenas à mangaTabId registrada no watchdog/índice.
- Extraction tabs são removidas somente quando apontam para a tab Gemini canônica expirada.

## Invariantes

1. Metadata wd_data deve existir antes do alarm create no arm normal.
2. Alarm moderno deve usar jobId estável quando disponível.
3. Replacement não deve reiniciar o deadline.
4. Timeout deve canonicalizar tab antes de finalizar.
5. Falha de notificação da UI não pode impedir finalização.
6. `finalizeJob(..., true)` deve terminar antes de remover extraction tabs.
7. Extraction tabs de outros jobs não podem ser removidas.
8. Handler não deve usar `storage.get(null)` para resolver watchdog.
9. Um alarme não-watchdog deve retornar false imediatamente.

## Fonte integral

~~~javascript
'use strict';
// background/jobs-watchdog.js -- Persisted watchdog lifecycle and alarm routing.

(function(scope) {
  function createWatchdog({
    getJobIndex,
    getExtractionTabs,
    finalizeJob,
    log,
    timeoutMinutes,
    resolveCanonicalTabId = async tabId => tabId,
  }) {
    const alarmNameFor = (geminiTabId, jobId) => `watchdog_${jobId || geminiTabId}`;

    async function arm(mangaTabId, index, geminiTabId, jobId) {
      const requestedTabId = geminiTabId;
      let canonicalTabId = await resolveCanonicalTabId(requestedTabId);
      const alarmName = alarmNameFor(canonicalTabId, jobId);

      await new Promise(resolve => chrome.alarms.clear(alarmName, resolve));
      await chrome.storage.local.set({
        [`wd_data_${canonicalTabId}`]: {
          mangaTabId,
          index,
          geminiTabId: canonicalTabId,
          jobId,
        },
      });
      chrome.alarms.create(alarmName, { delayInMinutes: timeoutMinutes });

      // Se onReplaced ocorreu depois da resolução inicial mas antes do write,
      // o listener pode ter migrado cedo demais. Re-resolver após o write fecha
      // essa janela sem reiniciar o deadline do watchdog.
      const latestTabId = await resolveCanonicalTabId(requestedTabId);
      if (latestTabId !== canonicalTabId) {
        const oldKey = `wd_data_${canonicalTabId}`;
        const newKey = `wd_data_${latestTabId}`;
        const data = await chrome.storage.local.get([oldKey, newKey]);
        if (data[oldKey] && !data[newKey]) {
          await chrome.storage.local.set({
            [newKey]: { ...data[oldKey], geminiTabId: latestTabId },
          });
        }
        await chrome.storage.local.remove(oldKey);
        canonicalTabId = latestTabId;
      }
      return canonicalTabId;
    }

    function clear(geminiTabId, jobId) {
      chrome.alarms.clear(alarmNameFor(geminiTabId, jobId), () => {
        chrome.storage.local.remove(`wd_data_${geminiTabId}`);
      });
    }

    function handleAlarm(alarm) {
      if (!alarm.name.startsWith('watchdog_')) return false;
      const suffix = alarm.name.slice('watchdog_'.length);
      const indexed = getJobIndex().find(job => job &&
        (String(job.jobId) === suffix || String(job.geminiTabId) === suffix));
      const keys = indexed ? [`wd_data_${indexed.geminiTabId}`] : [];
      if (!keys.includes(`wd_data_${suffix}`)) keys.push(`wd_data_${suffix}`);

      chrome.storage.local.get(keys, async data => {
        const key = keys.find(candidate => data && data[candidate]);
        const watchdog = key ? data[key] : (indexed && {
          geminiTabId: indexed.geminiTabId,
          mangaTabId: indexed.mangaTabId,
          index: indexed.index,
          jobId: indexed.jobId,
        });
        if (!watchdog) return;
        if (key) chrome.storage.local.remove(key);

        const rawTabId = watchdog.geminiTabId || (indexed && indexed.geminiTabId);
        if (rawTabId === undefined || rawTabId === null) return;
        const tabId = await resolveCanonicalTabId(rawTabId);
        log('warn', 'bg', 'JOB_TIMEOUT', `Timeout de ${timeoutMinutes} min no index ${watchdog.index}`, {
          geminiTabId: tabId,
          replacedTabId: rawTabId === tabId ? null : rawTabId,
        });
        if (watchdog.mangaTabId) {
          chrome.tabs.sendMessage(watchdog.mangaTabId, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: `LIMITE DE TEMPO (${timeoutMinutes} min)`,
            imgIndex: watchdog.index,
            isDebug: false,
          }, () => { if (chrome.runtime.lastError) {} });
        }
        await finalizeJob(tabId, watchdog.mangaTabId, true);

        const extractionTabs = getExtractionTabs();
        Object.keys(extractionTabs)
          .filter(tabIdKey => extractionTabs[tabIdKey] &&
            String(extractionTabs[tabIdKey].geminiTabId) === String(tabId))
          .forEach(tabIdKey => {
            const extractionTabId = Number(tabIdKey);
            chrome.tabs.remove(extractionTabId, () => { if (chrome.runtime.lastError) {} });
            delete extractionTabs[extractionTabId];
          });
      });
      return true;
    }

    return { arm, clear, handleAlarm };
  }

  scope.MangaTranslatorJobsWatchdog = { createWatchdog };
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## Rastreabilidade 110/110

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/jobs-watchdog.js -- Persisted watchdog lifecycle and alarm routing. | Comentário arquitetural: background/jobs-watchdog.js -- Persisted watchdog lifecycle and alarm routing.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U01 | (function(scope) { | Passo operacional de U01: (function(scope) { |
| 005 | U02 |   function createWatchdog({ | Abre factory com índice, extraction tabs, finalização, log, timeout e identidade canônica. |
| 006 | U02 |     getJobIndex, | Passo operacional de U02: getJobIndex, |
| 007 | U02 |     getExtractionTabs, | Obtém mapeamento atual de abas auxiliares. |
| 008 | U02 |     finalizeJob, | Finaliza job como erro antes de remover extraction tabs. |
| 009 | U02 |     log, | Passo operacional de U02: log, |
| 010 | U02 |     timeoutMinutes, | Passo operacional de U02: timeoutMinutes, |
| 011 | U02 |     resolveCanonicalTabId = async tabId => tabId, | Canonicaliza tabId contra replacements. |
| 012 | U02 |   }) { | Passo operacional de U02: }) { |
| 013 | U02 |     const alarmNameFor = (geminiTabId, jobId) => `watchdog_${jobId \|\| geminiTabId}`; | Gera nome estável por jobId quando disponível, com fallback para tabId legado. |
| 014 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 015 | U03 |     async function arm(mangaTabId, index, geminiTabId, jobId) { | Abre rearme/persistência do watchdog. |
| 016 | U03 |       const requestedTabId = geminiTabId; | Preserva o tabId originalmente solicitado para re-resolver depois. |
| 017 | U03 |       let canonicalTabId = await resolveCanonicalTabId(requestedTabId); | Preserva o tabId originalmente solicitado para re-resolver depois. |
| 018 | U03 |       const alarmName = alarmNameFor(canonicalTabId, jobId); | Gera nome estável por jobId quando disponível, com fallback para tabId legado. |
| 019 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 020 | U03 |       await new Promise(resolve => chrome.alarms.clear(alarmName, resolve)); | Limpa alarme anterior antes de rearmar/cleanup. |
| 021 | U03 |       await chrome.storage.local.set({ | Persiste metadata wd_data antes/ao migrar. |
| 022 | U03 |         [`wd_data_${canonicalTabId}`]: { | Opera chave durável de metadata do watchdog. |
| 023 | U03 |           mangaTabId, | Persiste/usa aba leitora associada ao job. |
| 024 | U03 |           index, | Persiste/usa índice da imagem para diagnóstico/UI. |
| 025 | U03 |           geminiTabId: canonicalTabId, | Persiste/usa identidade Gemini canônica. |
| 026 | U03 |           jobId, | Persiste/usa UUID do job como chave estável de watchdog. |
| 027 | U03 |         }, | Fecha estrutura sintática da unidade U03. |
| 028 | U03 |       }); | Fecha estrutura sintática da unidade U03. |
| 029 | U03 |       chrome.alarms.create(alarmName, { delayInMinutes: timeoutMinutes }); | Cria alarme durável com delay configurado. |
| 030 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 031 | U03 |       // Se onReplaced ocorreu depois da resolução inicial mas antes do write, | Comentário arquitetural: Se onReplaced ocorreu depois da resolução inicial mas antes do write,. |
| 032 | U03 |       // o listener pode ter migrado cedo demais. Re-resolver após o write fecha | Comentário arquitetural: o listener pode ter migrado cedo demais. Re-resolver após o write fecha. |
| 033 | U03 |       // essa janela sem reiniciar o deadline do watchdog. | Comentário arquitetural: essa janela sem reiniciar o deadline do watchdog.. |
| 034 | U03 |       const latestTabId = await resolveCanonicalTabId(requestedTabId); | Preserva o tabId originalmente solicitado para re-resolver depois. |
| 035 | U03 |       if (latestTabId !== canonicalTabId) { | Re-resolve tab após write para fechar race com tabs.onReplaced. |
| 036 | U03 |         const oldKey = `wd_data_${canonicalTabId}`; | Calcula chave wd_data da identidade anterior. |
| 037 | U03 |         const newKey = `wd_data_${latestTabId}`; | Re-resolve tab após write para fechar race com tabs.onReplaced. |
| 038 | U03 |         const data = await chrome.storage.local.get([oldKey, newKey]); | Calcula chave wd_data da identidade anterior. |
| 039 | U03 |         if (data[oldKey] && !data[newKey]) { | Calcula chave wd_data da identidade anterior. |
| 040 | U03 |           await chrome.storage.local.set({ | Persiste metadata wd_data antes/ao migrar. |
| 041 | U03 |             [newKey]: { ...data[oldKey], geminiTabId: latestTabId }, | Persiste/usa identidade Gemini canônica. |
| 042 | U03 |           }); | Fecha estrutura sintática da unidade U03. |
| 043 | U03 |         } | Fecha estrutura sintática da unidade U03. |
| 044 | U03 |         await chrome.storage.local.remove(oldKey); | Calcula chave wd_data da identidade anterior. |
| 045 | U03 |         canonicalTabId = latestTabId; | Re-resolve tab após write para fechar race com tabs.onReplaced. |
| 046 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 047 | U03 |       return canonicalTabId; | Retorna tabId efetivamente canônico ao caller. |
| 048 | U03 |     } | Fecha estrutura sintática da unidade U03. |
| 049 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 050 | U04 |     function clear(geminiTabId, jobId) { | Persiste/usa identidade Gemini canônica. |
| 051 | U04 |       chrome.alarms.clear(alarmNameFor(geminiTabId, jobId), () => { | Gera nome estável por jobId quando disponível, com fallback para tabId legado. |
| 052 | U04 |         chrome.storage.local.remove(`wd_data_${geminiTabId}`); | Persiste/usa identidade Gemini canônica. |
| 053 | U04 |       }); | Fecha estrutura sintática da unidade U04. |
| 054 | U04 |     } | Fecha estrutura sintática da unidade U04. |
| 055 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 056 | U05 |     function handleAlarm(alarm) { | Abre roteador para alarmes watchdog_*. |
| 057 | U05 |       if (!alarm.name.startsWith('watchdog_')) return false; | Recusa alarmes que não pertencem a este módulo. |
| 058 | U05 |       const suffix = alarm.name.slice('watchdog_'.length); | Extrai jobId/tabId do nome do alarme. |
| 059 | U05 |       const indexed = getJobIndex().find(job => job && | Persiste/usa índice da imagem para diagnóstico/UI. |
| 060 | U05 |         (String(job.jobId) === suffix \|\| String(job.geminiTabId) === suffix)); | Persiste/usa identidade Gemini canônica. |
| 061 | U05 |       const keys = indexed ? [`wd_data_${indexed.geminiTabId}`] : []; | Persiste/usa índice da imagem para diagnóstico/UI. |
| 062 | U05 |       if (!keys.includes(`wd_data_${suffix}`)) keys.push(`wd_data_${suffix}`); | Opera chave durável de metadata do watchdog. |
| 063 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 064 | U05 |       chrome.storage.local.get(keys, async data => { | Lê possíveis chaves de watchdog para migração/timeout. |
| 065 | U05 |         const key = keys.find(candidate => data && data[candidate]); | Escolhe a primeira chave realmente presente no storage. |
| 066 | U05 |         const watchdog = key ? data[key] : (indexed && { | Persiste/usa índice da imagem para diagnóstico/UI. |
| 067 | U05 |           geminiTabId: indexed.geminiTabId, | Persiste/usa índice da imagem para diagnóstico/UI. |
| 068 | U05 |           mangaTabId: indexed.mangaTabId, | Persiste/usa aba leitora associada ao job. |
| 069 | U05 |           index: indexed.index, | Persiste/usa índice da imagem para diagnóstico/UI. |
| 070 | U05 |           jobId: indexed.jobId, | Persiste/usa índice da imagem para diagnóstico/UI. |
| 071 | U05 |         }); | Fecha estrutura sintática da unidade U05. |
| 072 | U05 |         if (!watchdog) return; | Abandona timeout sem metadata recuperável. |
| 073 | U05 |         if (key) chrome.storage.local.remove(key); | Remove metadata encontrada para tornar o timeout one-shot. |
| 074 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 075 | U05 |         const rawTabId = watchdog.geminiTabId \|\| (indexed && indexed.geminiTabId); | Persiste/usa índice da imagem para diagnóstico/UI. |
| 076 | U05 |         if (rawTabId === undefined \|\| rawTabId === null) return; | Obtém tabId bruto do watchdog/índice. |
| 077 | U05 |         const tabId = await resolveCanonicalTabId(rawTabId); | Canonicaliza tabId contra replacements. |
| 078 | U05 |         log('warn', 'bg', 'JOB_TIMEOUT', `Timeout de ${timeoutMinutes} min no index ${watchdog.index}`, { | Persiste/usa índice da imagem para diagnóstico/UI. |
| 079 | U05 |           geminiTabId: tabId, | Persiste/usa identidade Gemini canônica. |
| 080 | U05 |           replacedTabId: rawTabId === tabId ? null : rawTabId, | Obtém tabId bruto do watchdog/índice. |
| 081 | U05 |         }); | Fecha estrutura sintática da unidade U05. |
| 082 | U05 |         if (watchdog.mangaTabId) { | Persiste/usa aba leitora associada ao job. |
| 083 | U05 |           chrome.tabs.sendMessage(watchdog.mangaTabId, { | Persiste/usa aba leitora associada ao job. |
| 084 | U05 |             action: 'SHOW_ERROR_INTEGRATED', | Envia erro visual de timeout à página de mangá. |
| 085 | U05 |             errorMsg: `LIMITE DE TEMPO (${timeoutMinutes} min)`, | Mensagem ao usuário inclui timeout configurado. |
| 086 | U05 |             imgIndex: watchdog.index, | Persiste/usa índice da imagem para diagnóstico/UI. |
| 087 | U05 |             isDebug: false, | Passo operacional de U05: isDebug: false, |
| 088 | U05 |           }, () => { if (chrome.runtime.lastError) {} }); | Passo operacional de U05: }, () => { if (chrome.runtime.lastError) {} }); |
| 089 | U05 |         } | Fecha estrutura sintática da unidade U05. |
| 090 | U05 |         await finalizeJob(tabId, watchdog.mangaTabId, true); | Persiste/usa aba leitora associada ao job. |
| 091 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 092 | U05 |         const extractionTabs = getExtractionTabs(); | Obtém mapeamento atual de abas auxiliares. |
| 093 | U05 |         Object.keys(extractionTabs) | Percorre ids de extraction tabs. |
| 094 | U05 |           .filter(tabIdKey => extractionTabs[tabIdKey] && | Passo operacional de U05: .filter(tabIdKey => extractionTabs[tabIdKey] && |
| 095 | U05 |             String(extractionTabs[tabIdKey].geminiTabId) === String(tabId)) | Persiste/usa identidade Gemini canônica. |
| 096 | U05 |           .forEach(tabIdKey => { | Passo operacional de U05: .forEach(tabIdKey => { |
| 097 | U05 |             const extractionTabId = Number(tabIdKey); | Converte chave textual para id numérico da tab. |
| 098 | U05 |             chrome.tabs.remove(extractionTabId, () => { if (chrome.runtime.lastError) {} }); | Fecha aba auxiliar do job expirado. |
| 099 | U05 |             delete extractionTabs[extractionTabId]; | Remove mapping da aba auxiliar fechada. |
| 100 | U05 |           }); | Fecha estrutura sintática da unidade U05. |
| 101 | U05 |       }); | Fecha estrutura sintática da unidade U05. |
| 102 | U05 |       return true; | Indica ao listener externo que o alarme foi reconhecido. |
| 103 | U05 |     } | Fecha estrutura sintática da unidade U05. |
| 104 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 105 | U06 |     return { arm, clear, handleAlarm }; | Exporta API do watchdog. |
| 106 | U06 |   } | Fecha estrutura sintática da unidade U06. |
| 107 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 108 | U06 |   scope.MangaTranslatorJobsWatchdog = { createWatchdog }; | Publica factory global para background.js. |
| 109 | U06 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE compatível com worker/Jest. |
| 110 | U07 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho e IIFE
Strict mode e objetivo de watchdog persistido.

### U02 — Factory e nome do alarme
Injeta dependências e define naming jobId/tabId.

### U03 — Arm persistido e race de replacement
Limpa, persiste, cria alarme e re-resolve tab sem reiniciar deadline.

### U04 — Clear watchdog
Limpa alarme e metadata associada.

### U05 — Roteamento de alarmes e timeout
Resolve metadata, canonicaliza, notifica, finaliza e limpa extraction tabs.

### U06 — Exports e fechamento
Publica arm/clear/handleAlarm.

### U07 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 109 linhas + newline = 110/110;
- [x] ordering finalize → extraction cleanup ligado a teste direto;
- [x] integração real de timeout ligada a batch-lifecycle-real;
- [x] replacement/jobId/legacy separados;
- [x] lacunas de arm/clear/erros assíncronos explicitadas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `c17b766d7fbc34ea925fb82b19149d3d977de413`.

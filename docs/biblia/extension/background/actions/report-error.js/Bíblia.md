# Bíblia técnica — `extension/background/actions/report-error.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `ac239ea495448dbb09ec1204247fc8c0c48e6289`  
> **Linhas textuais:** **71**  
> **Posições documentais:** **72** contando newline final  
> **Teste direto:** `tests/unit/background/report-error-action.test.js` — `507406dfbbc285a981b725408eb1e507e18268c8`

## Papel arquitetural

`report-error.js` recebe `GEMINI_ERROR` do lado Gemini, valida o envelope, confirma que o sender realmente possui o job persistido, rejeita identidades contraditórias, notifica a aba do mangá e finaliza o job como erro.

Ela foi desenhada para erros tardios: a decisão não depende de `currentBatchId`. Um job antigo ainda pode ser finalizado corretamente se o sender continuar sendo o dono daquele job persistido.

## Validação de payload

`jobId` precisa ser string não vazia. `error` precisa ser string não vazia e ter no máximo 4096 caracteres. A suíte direta prova jobId ausente, error só com espaços e error com 4097 caracteres.

`batchId`, `index` e `mangaTabId` não são obrigatórios no validator; eles funcionam como checagens adicionais de identidade quando presentes em forma comparável.

## Ownership como fronteira de confiança

Embora `allowedSources:['any']`, a action não confia na categoria de source como autoridade final. `context.assertJobOwnership(context.sender, jobId, ...)` localiza o job ligado à aba remetente, incluindo reconciliação/canonicalização de tab replacement no lifecycle real.

Se ownership falha, a action loga `SENDER_MISMATCH` e retorna `{ok:false, reason:'sender_mismatch'}` sem notificar a UI e sem finalizar.

## Identidade persistida versus payload

Depois da ownership, `ownership.job` vira a fonte autoritativa. A action rejeita divergências quando consegue comparar:

- `batchId`: somente se recebido e persistido forem truthy;
- `index`: somente se ambos forem inteiros;
- `mangaTabId`: somente se ambos forem truthy.

Isso permite que campos opcionais sejam omitidos, mas também significa que tipos inesperados podem deixar de participar da checagem. O jobId + ownership continua sendo a barreira principal.

## Notificação de erro

A mensagem para a aba do mangá usa preferencialmente os dados persistidos: `job.mangaTabId`, `job.index` e `job.batchId`, com fallback para os valores recebidos apenas quando os persistidos são nullish.

`debugMode` é lido do storage e convertido com `Boolean(...)`. O envio usa `SHOW_ERROR_INTEGRATED`. `chrome.runtime.lastError` é consumido, portanto a finalização prossegue mesmo que a aba do mangá não receba a mensagem.

## Finalização

`context.finalizeJob(ownership.tabId, targetMangaTabId, true)` roda depois da tentativa de notificação. `fromError=true` informa ao lifecycle que este encerramento é por falha.

`process-finalize-real.test.js` prova o cenário crítico em que a aba do mangá não está disponível: `GEMINI_ERROR` ainda finaliza o job persistido, libera o slot e remove o job/superfície Gemini.

## Consumidor real

`job-runner.js` envia `GEMINI_ERROR` em erros de UI, timeout e no catch geral do pipeline, sempre com jobId e normalmente com batchId/index/mangaTabId derivados do job reivindicado.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `report-error-action.test.js` | ✅ PROVADO DIRETAMENTE | Happy path, currentBatchId diferente, sender mismatch, batchId forjado e validação de jobId/error. |
| `process-finalize-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | Mesmo sem aba do mangá, GEMINI_ERROR finaliza o job real e libera recursos/slot. |
| `jobs-lifecycle.js` | 🟨 DEPENDÊNCIA REAL | Implementa ownership por sender/jobId, alias de aba e finalização idempotente/persistida. |
| `job-runner.js` | 🟨 CONSUMIDOR REAL | Emite GEMINI_ERROR em UI error, timeout e exceções gerais. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `jobId` não-string truthy ou error não-string; o validator cobre por código, mas a suíte só testa casos selecionados.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `error` com exatamente 4096 caracteres.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para mismatch de `index` e mismatch de `mangaTabId`; a suíte prova apenas batchId divergente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para campos opcionais com tipos inesperados que fazem a comparação ser ignorada.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `storage.get(['debugMode'])` rejeitando.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `finalizeJob` rejeitando depois de a UI já ter recebido SHOW_ERROR_INTEGRATED.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `context.log` ausente/lançando nos caminhos de rejeição.
- ⚠️ O erro de `tabs.sendMessage` não impede a finalização; isso protege contabilidade, mas a UI pode não mostrar o diagnóstico.
- ⚠️ `allowedSources:['any']` amplia a superfície de chamada; segurança depende de `assertJobOwnership` + jobId.
- ⚠️ `mangaTabId`/`batchId` usam truthiness na checagem de identidade; valor `0` ou string vazia não participa da comparação.

## Segurança e privacidade

- O sender real, não um tabId arbitrário do payload, é usado para ownership.
- O job persistido prevalece sobre ids recebidos ao escolher destino/index/batch.
- Logs de mismatch truncam jobId/batchId para prefixos de oito caracteres.
- A mensagem de erro completa, limitada a 4096 caracteres, é encaminhada à aba do mangá; não é gravada aqui em storage.
- Não há exposição de conteúdo de imagem nesta action.

## Invariantes

1. Payload inválido deve falhar antes de `ensureInitialized`.
2. Ownership deve ser verificada antes de qualquer UI/finalização.
3. Sender mismatch nunca deve chamar `finalizeJob`.
4. Identidade persistida deve prevalecer sobre payload contraditório.
5. `currentBatchId` atual não pode impedir a finalização do job persistido correto.
6. Falha ao notificar a aba do mangá não pode deixar o job preso.
7. `finalizeJob` recebe `ownership.tabId` e `fromError=true`.
8. `error` não pode exceder 4096 caracteres.

## Fonte integral

~~~javascript
'use strict';
// background/actions/report-error.js -- Reporta erro somente do job realmente pertencente ao remetente.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'report-error',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      if (typeof request.error !== 'string' || request.error.trim().length === 0 || request.error.length > 4096) {
        return { code: 'INVALID_PAYLOAD', message: 'erro inválido' };
      }
      return null;
    },

    async execute(request, context) {
      await context.ensureInitialized();
      const { mangaTabId, index, error, jobId, batchId } = request;

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'Erro Gemini descartado: aba remetente não é dona de um job ativo.', {
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
        context.log('warn', 'bg', 'ERROR_JOB_IDENTITY_MISMATCH',
          'Erro rejeitado porque a identidade recebida não corresponde ao job persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      const debug = await context.storage.get(['debugMode']);
      chrome.tabs.sendMessage(job.mangaTabId ?? mangaTabId, {
        action: 'SHOW_ERROR_INTEGRATED',
        errorMsg: error,
        imgIndex: job.index ?? index,
        isDebug: Boolean(debug.debugMode),
        jobId,
        batchId: job.batchId ?? batchId,
      }, () => { if (chrome.runtime.lastError) {} });

      await context.finalizeJob(
        ownership.tabId,
        job.mangaTabId ?? mangaTabId,
        true
      );
      return {};
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## Rastreabilidade 72/72

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/report-error.js -- Reporta erro somente do job realmente pertencente ao remetente. | Comentário de intenção: background/actions/report-error.js -- Reporta erro somente do job realmente pertencente ao remetente.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |     name: 'report-error', | Nome canônico do alias GEMINI_ERROR. |
| 007 | U02 |     meta: { allowedSources: ['any'] }, | Permite qualquer source, deixando ownership decidir autoridade real. |
| 008 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 009 | U03 |     validate(request) { | Abre validação síncrona antes de reidratar estado. |
| 010 | U03 |       if (typeof request.jobId !== 'string' \|\| request.jobId.trim().length === 0) { | Exige jobId string não vazia. |
| 011 | U03 |         return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' }; | Retorna INVALID_PAYLOAD para jobId inválido. |
| 012 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 013 | U03 |       if (typeof request.error !== 'string' \|\| request.error.trim().length === 0 \|\| request.error.length > 4096) { | Exige error string não vazia e com no máximo 4096 caracteres. |
| 014 | U03 |         return { code: 'INVALID_PAYLOAD', message: 'erro inválido' }; | Retorna INVALID_PAYLOAD para mensagem de erro inválida. |
| 015 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 016 | U03 |       return null; | Indica payload válido. |
| 017 | U03 |     }, | Fecha estrutura sintática da unidade U03. |
| 018 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 019 | U04 |     async execute(request, context) { | Abre executor assíncrono. |
| 020 | U04 |       await context.ensureInitialized(); | Reidrata o estado persistido antes da ownership/finalização. |
| 021 | U04 |       const { mangaTabId, index, error, jobId, batchId } = request; | Extrai campos recebidos; jobId/error são obrigatórios, os demais refinam identidade. |
| 022 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 023 | U04 |       const ownership = await new Promise(resolve => { | Abre bridge Promise sobre assertJobOwnership callback-style. |
| 024 | U04 |         context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => { | Valida que sender/jobId correspondem a um job real persistido. |
| 025 | U04 |           resolve({ owns, tabId, job }); | Converte callback de ownership em resultado awaitable. |
| 026 | U04 |         }); | Fecha estrutura sintática da unidade U04. |
| 027 | U04 |       }); | Fecha estrutura sintática da unidade U04. |
| 028 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 029 | U04 |       if (!ownership.owns \|\| !ownership.job) { | Bloqueia sender que não possui o job ou job inexistente. |
| 030 | U05 |         context.log('warn', 'bg', 'SENDER_MISMATCH', | Registra evento de sender/job incompatível. |
| 031 | U05 |           'Erro Gemini descartado: aba remetente não é dona de um job ativo.', { | Mensagem operacional de descarte. |
| 032 | U05 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo curto do jobId. |
| 033 | U05 |           }); | Fecha estrutura sintática da unidade U05. |
| 034 | U05 |         return { ok: false, reason: 'sender_mismatch' }; | Retorna falha sem notificar mangá nem finalizar. |
| 035 | U05 |       } | Fecha estrutura sintática da unidade U05. |
| 036 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 037 | U05 |       const job = ownership.job; | Passa a tratar o job persistido como fonte autoritativa. |
| 038 | U05 |       const identityMismatch = | Combina divergências opcionais de batch/index/mangaTabId. |
| 039 | U05 |         (batchId && job.batchId && batchId !== job.batchId) \|\| | Compara batchId somente quando ambos são truthy. |
| 040 | U06 |         (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) \|\| | Compara index somente quando ambos são inteiros. |
| 041 | U06 |         (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId); | Compara mangaTabId somente quando ambos são truthy. |
| 042 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 043 | U06 |       if (identityMismatch) { | Bloqueia payload que contradiz a identidade persistida. |
| 044 | U06 |         context.log('warn', 'bg', 'ERROR_JOB_IDENTITY_MISMATCH', | Registra tentativa/erro de identidade divergente. |
| 045 | U06 |           'Erro rejeitado porque a identidade recebida não corresponde ao job persistido.', { | Explica que o job persistido prevalece sobre o payload. |
| 046 | U06 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo curto do jobId. |
| 047 | U06 |             expectedBatchId: String(job.batchId \|\| '').slice(0, 8), | Loga prefixo do batch esperado. |
| 048 | U06 |             receivedBatchId: String(batchId \|\| '').slice(0, 8), | Loga prefixo do batch recebido. |
| 049 | U06 |           }); | Fecha estrutura sintática da unidade U06. |
| 050 | U06 |         return { ok: false, reason: 'job_identity_mismatch' }; | Retorna falha sem efeitos de UI/finalização. |
| 051 | U06 |       } | Fecha estrutura sintática da unidade U06. |
| 052 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 053 | U06 |       const debug = await context.storage.get(['debugMode']); | Lê debugMode para parametrizar a UI de erro. |
| 054 | U06 |       chrome.tabs.sendMessage(job.mangaTabId ?? mangaTabId, { | Notifica a aba de mangá sobre o erro integrado. |
| 055 | U06 |         action: 'SHOW_ERROR_INTEGRATED', | Nome da mensagem enviada ao content_manga. |
| 056 | U06 |         errorMsg: error, | Encaminha a string de erro validada. |
| 057 | U06 |         imgIndex: job.index ?? index, | Prefere index persistido ao valor recebido. |
| 058 | U07 |         isDebug: Boolean(debug.debugMode), | Normaliza debugMode para boolean. |
| 059 | U07 |         jobId, | Encaminha o jobId validado para correlação. |
| 060 | U07 |         batchId: job.batchId ?? batchId, | Prefere batchId persistido. |
| 061 | U07 |       }, () => { if (chrome.runtime.lastError) {} }); | Consome falha assíncrona de sendMessage sem bloquear finalização. |
| 062 | U07 | ␠ [linha vazia] | Separador visual da unidade U07. |
| 063 | U07 |       await context.finalizeJob( | Finaliza o job real depois de solicitar a notificação visual. |
| 064 | U07 |         ownership.tabId, | Usa o tabId resolvido pela ownership, possivelmente canônico. |
| 065 | U07 |         job.mangaTabId ?? mangaTabId, | Prefere mangaTabId persistido; fallback só se o job não o possuir. |
| 066 | U07 |         true | Passa fromError=true para a finalização. |
| 067 | U07 |       ); | Fecha estrutura sintática da unidade U07. |
| 068 | U07 |       return {}; | Conclui; o router transforma em ok:true. |
| 069 | U08 |     }, | Fecha estrutura sintática da unidade U08. |
| 070 | U08 |   }); | Fecha estrutura sintática da unidade U08. |
| 071 | U08 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 072 | U09 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e objetivo de aceitar erro apenas do job pertencente ao remetente.

### U02 — Registro e metadados
Registra GEMINI_ERROR com source ampla, compensada por ownership explícita.

### U03 — Validação do payload
Valida jobId e limita a mensagem de erro.

### U04 — Reidratação e ownership
Reidrata estado e transforma assertJobOwnership callback-style em Promise.

### U05 — Rejeição por sender mismatch
Bloqueia spoof/stale sender antes de qualquer efeito destrutivo.

### U06 — Validação de identidade persistida
Compara batch/index/manga quando ambos os lados permitem comparação.

### U07 — Notificação e finalização
Mostra erro usando identidade persistida e finaliza o job mesmo se o relay visual falhar.

### U08 — Fechamento
Fecha action/IIFE.

### U09 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 71 linhas + newline = 72/72;
- [x] ownership e identity mismatch ligados às assertions reais;
- [x] currentBatchId divergente analisado;
- [x] consumer e lifecycle separados da prova direta;
- [x] limites do error e lacunas de campos opcionais explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `ac239ea495448dbb09ec1204247fc8c0c48e6289`.

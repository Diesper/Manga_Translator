# Bíblia técnica — `extension/background/actions/commit-result.js`

> **Estado:** ✅ REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `32270d1c4ade42b7e6decd5ef124d71745c2a5b0`  
> **Tipo:** action assíncrona — fase 2 do protocolo stage → commit.  
> **Linhas textuais:** **106**.  
> **Posições documentais:** **107** incluindo newline final.  
> **Teste direto principal:** `tests/unit/background/commit-result-action.test.js` — `1a185784edd118aeee377d7e3f1ed4a9c8375914`.

## 1. Papel arquitetural

`commit-result` é a fase que libera/finaliza o job depois que o resultado já recebeu ACK de aplicação/persistência no leitor. A fase anterior, `deliver-result`, faz staging com `finalizeOnAck:false`.

O desenho é de duas fases: staging envia a imagem uma vez; commit pode ser repetido; se o job já foi finalizado e a resposta IPC se perdeu, o journal `gemini_finalized_<tabId>` reconhece o retry sem executar a finalização novamente.

## 2. Fluxo

1. Valida jobId.
2. Reidrata o background.
3. Confirma ownership.
4. Se o job já sumiu, tenta o journal durável.
5. Com job vivo, valida batch.
6. Exige sinal de persistência/aplicação.
7. Persiste `result_committed`.
8. Loga a aceitação.
9. Finaliza com `fromError=false`.
10. Responde `committed:true`.

## 3. Segurança e trust boundary

`allowedSources:any` não é autorização. A barreira real é `assertJobOwnership(sender, jobId)`. O batch do request é confirmação adicional e o destino de finalização prefere `job.mangaTabId` persistido.

Logs usam prefixos de jobId/batchId e não carregam imagem, Base64 ou resultado binário.

## 4. Idempotência e MV3

O journal cobre o caso em que `finalizeJob` terminou, removeu o job vivo e a resposta ao content script se perdeu. Marker válido exige TTL vigente, o mesmo jobId e `fromError === false`; uma finalização por erro jamais pode ser reinterpretada como commit bem-sucedido.

## 5. Matriz de evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `tests/unit/background/commit-result-action.test.js` | ✅ PROVADO DIRETAMENTE | Validação, ownership negativo, batch forjado, commit prematuro, transição `result_committed`, finalize no sucesso e journal idempotente. |
| `tests/unit/background/process-finalize-real.test.js` — `abb1b936fadf0e309933e39b4b705116eb320a1f` | ✅ PROVADO DIRETAMENTE DO LIFECYCLE/FACADE | Finalização real, proteção duplicada, marker durável, restart e cleanup; prova o helper chamado pela action, não cada linha da action. |
| `tests/unit/content-gemini/job-runner.test.js` RUN-13/RUN-14 — `feae92421dd98e682caf3f970ba7ff86b8b6aa4a` | 🟨 PROVA DO CONSUMIDOR | Staging falho não envia commit; commit é retentado três vezes sem reenviar a imagem. As respostas runtime são mockadas, logo não provam a implementação interna desta action. |

## 6. Lacunas de teste

### Marker inválido/expirado
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `expiresAt` expirado, jobId diferente ou `fromError:true`.

### Falha do journal
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `storage.get` rejeitando e para o log `RESULT_COMMIT_JOURNAL_LOOKUP_FAILED`.

### Persistência assimétrica
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para os dois casos assimétricos: flag `resultPersisted` verdadeira com state antigo, ou flag falsa/ausente com state `dom_applied`. O código aceita ambos porque a rejeição exige as duas condições negativas simultaneamente.

### Batch omitido
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para request sem batchId quando o job persistido possui batchId.

### Fallbacks de tabId/mangaTabId
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para ausência de `ownership.tabId`, fallback a sender/job e para `job.mangaTabId` nullish usando request.

### Dependências rejeitando
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para rejeição de `ensureInitialized`, `updateJobState` ou `finalizeJob`.

### Log de sucesso
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `RESULT_COMMIT_ACCEPTED` e os campos/truncamento de metadata.

## 7. Análise crítica

1. **Gate de persistência é OR-semântico:** `resultPersisted === true` ou `state === 'dom_applied'` basta. Isso pode ser compatibilidade deliberada, mas precisa de teste explícito.
2. **Journal é fail-closed:** erro/marker inválido não produz falso sucesso.
3. **Storage é opcional no retry sem ownership:** sem `context.storage.get`, o fluxo simplesmente termina em `job_not_live`.
4. **Falha depois do update:** se `updateJobState` gravar `result_committed` e `finalizeJob` rejeitar, o router responderá erro com o job já em estado de commit; recovery/lifecycle precisa reconciliar esse estado, mas a action não possui teste focal disso.
5. **`fromError=false` é essencial:** evita contabilizar uma finalização por erro como commit válido.

## 8. Invariantes

1. jobId inválido falha antes de efeitos.
2. Ownership precede batch, persistência e finalização.
3. Sem ownership, só marker durável válido transforma retry em sucesso.
4. Marker expirado, jobId diferente ou `fromError:true` nunca autoriza `alreadyCommitted`.
5. Batch explicitamente divergente falha.
6. Commit prematuro não chama update nem finalize.
7. `result_committed` é persistido antes de `finalizeJob`.
8. geminiTabId prefere ownership/tab metadata e nunca vem do payload.
9. mangaTabId persistido prevalece sobre request.
10. `finalizeJob` recebe `fromError=false`.
11. Retry `alreadyCommitted` não repete finalize.
12. Logs não carregam imagem/result payload.
13. Stage e commit permanecem fases distintas enquanto o consumidor retenta commit sem reenviar imagem.

## 9. Fonte integral

~~~javascript
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
        // O commit pode ter sido aplicado e a resposta IPC ter se perdido. A
        // marca de finalização é o journal durável que torna o retry idempotente.
        const markerTabId = ownership.tabId ?? senderTabId;
        if (markerTabId !== null && markerTabId !== undefined && context.storage?.get) {
          try {
            const markerKey = `gemini_finalized_${markerTabId}`;
            const markerData = await context.storage.get([markerKey]);
            const marker = markerData && markerData[markerKey];
            if (marker &&
                marker.expiresAt > Date.now() &&
                marker.jobId === jobId &&
                marker.fromError === false) {
              context.log('info', 'bg', 'RESULT_COMMIT_ALREADY_FINALIZED',
                'Retry de commit reconhecido por marcador durável; não há trabalho a repetir.', {
                  jobId: String(jobId || '').slice(0, 8),
                  batchId: String(batchId || '').slice(0, 8),
                });
              return { committed: true, alreadyCommitted: true };
            }
          } catch (error) {
            context.log('warn', 'bg', 'RESULT_COMMIT_JOURNAL_LOOKUP_FAILED',
              'Consulta do journal falhou; commit sem ownership continuará rejeitado.', {
                jobId: String(jobId || '').slice(0, 8),
                errorName: error && error.name ? error.name : 'Error',
              });
          }
        }

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
~~~

## 10. Rastreabilidade 107/107

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode para a action. |
| 002 | U01 | // background/actions/commit-result.js -- Finaliza um resultado somente após persistência confirmada. | Comentário local de U01: “background/actions/commit-result.js -- Finaliza um resultado somente após persistência confirmada.”; registra intenção sem executar. |
| 003 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho, registro e política de origem); não altera estado ou fluxo. |
| 004 | U01 | (function(scope) { | Completa a expressão de U01 com `(function(scope) {`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 005 | U01 |   scope.MangaTranslatorRouter.registerAction({ | Registra esta definição no MangaTranslatorRouter. |
| 006 | U01 |     name: 'commit-result', | Define o nome canônico resolvido de GEMINI_RESULT_COMMIT. |
| 007 | U01 |     meta: { allowedSources: ['any'] }, | Permite qualquer classe de origem no router; ownership interno continua sendo a autorização forte. |
| 008 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho, registro e política de origem); não altera estado ou fluxo. |
| 009 | U02 |     validate(request) { | Abre o validator executado antes do executor assíncrono. |
| 010 | U02 |       if (typeof request.jobId !== 'string' \|\| request.jobId.trim().length === 0) { | Rejeita jobId não-string ou vazio depois de trim. |
| 011 | U02 |         return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' }; | Retorna erro estável de payload para jobId inválido. |
| 012 | U02 |       } | Fecha a estrutura sintática da unidade U02. |
| 013 | U02 |       return null; | Indica ao router que a validação passou. |
| 014 | U02 |     }, | Fecha a estrutura sintática da unidade U02. |
| 015 | U02 | ␠ [linha vazia] | Separador visual de U02 (Validação de jobId); não altera estado ou fluxo. |
| 016 | U03 |     async execute(request, context) { | Abre o executor assíncrono do commit. |
| 017 | U03 |       await context.ensureInitialized(); | Reidrata/reconcilia o background antes de ownership/journal. |
| 018 | U03 | ␠ [linha vazia] | Separador visual de U03 (Inicialização e ownership); não altera estado ou fluxo. |
| 019 | U03 |       const { jobId, batchId } = request; | Extrai as identidades usadas para ownership, batch e logs. |
| 020 | U03 |       const senderTabId = context.sender && context.sender.tab ? context.sender.tab.id : null; | Captura sender.tab.id como fallback para localizar marker/finalização. |
| 021 | U03 | ␠ [linha vazia] | Separador visual de U03 (Inicialização e ownership); não altera estado ou fluxo. |
| 022 | U03 |       const ownership = await new Promise(resolve => { | Adapta assertJobOwnership callback-based para fluxo `await`. |
| 023 | U03 |         context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => { | Consulta ownership com sender real e jobId validado. |
| 024 | U03 |           resolve({ owns, tabId, job }); | Materializa owns/tabId/job para as decisões seguintes. |
| 025 | U03 |         }); | Fecha a estrutura sintática da unidade U03. |
| 026 | U03 |       }); | Fecha a estrutura sintática da unidade U03. |
| 027 | U03 | ␠ [linha vazia] | Separador visual de U03 (Inicialização e ownership); não altera estado ou fluxo. |
| 028 | U03 |       if (!ownership.owns \|\| !ownership.job) { | Entra no caminho de journal/rejeição quando o job não está vivo ou não pertence ao sender. |
| 029 | U04 |         // O commit pode ter sido aplicado e a resposta IPC ter se perdido. A | Comentário local de U04: “O commit pode ter sido aplicado e a resposta IPC ter se perdido. A”; registra intenção sem executar. |
| 030 | U04 |         // marca de finalização é o journal durável que torna o retry idempotente. | Comentário local de U04: “marca de finalização é o journal durável que torna o retry idempotente.”; registra intenção sem executar. |
| 031 | U04 |         const markerTabId = ownership.tabId ?? senderTabId; | Escolhe tabId do ownership quando disponível; senderTabId é fallback. |
| 032 | U04 |         if (markerTabId !== null && markerTabId !== undefined && context.storage?.get) { | Só tenta journal quando há tabId válido e storage.get disponível. |
| 033 | U04 |           try { | Protege a consulta do journal; falha de storage não vira falso sucesso. |
| 034 | U04 |             const markerKey = `gemini_finalized_${markerTabId}`; | Constrói `gemini_finalized_<tabId>` para lookup idempotente. |
| 035 | U04 |             const markerData = await context.storage.get([markerKey]); | Busca somente a chave do marcador relevante. |
| 036 | U04 |             const marker = markerData && markerData[markerKey]; | Extrai o marker retornado antes das três validações. |
| 037 | U04 |             if (marker && | Inicia a conjunção que autoriza retry já finalizado. |
| 038 | U04 |                 marker.expiresAt > Date.now() && | Exige marker ainda dentro do TTL. |
| 039 | U04 |                 marker.jobId === jobId && | Exige que o journal pertença ao mesmo jobId. |
| 040 | U04 |                 marker.fromError === false) { | Exige finalização de sucesso; marker originado de erro não conta como commit. |
| 041 | U04 |               context.log('info', 'bg', 'RESULT_COMMIT_ALREADY_FINALIZED', | Registra que o retry foi reconhecido pelo journal. |
| 042 | U04 |                 'Retry de commit reconhecido por marcador durável; não há trabalho a repetir.', { | Completa a expressão de U04 com `'Retry de commit reconhecido por marcador durável; não há trabalho a repetir.', {`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 043 | U04 |                   jobId: String(jobId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do jobId. |
| 044 | U04 |                   batchId: String(batchId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do batchId. |
| 045 | U04 |                 }); | Fecha a estrutura sintática da unidade U04. |
| 046 | U04 |               return { committed: true, alreadyCommitted: true }; | Responde idempotentemente sem executar update/finalize novamente. |
| 047 | U04 |             } | Fecha a estrutura sintática da unidade U04. |
| 048 | U04 |           } catch (error) { | Captura erro do lookup e mantém política fail-closed. |
| 049 | U04 |             context.log('warn', 'bg', 'RESULT_COMMIT_JOURNAL_LOOKUP_FAILED', | Registra falha de leitura do journal sem convertê-la em sucesso. |
| 050 | U04 |               'Consulta do journal falhou; commit sem ownership continuará rejeitado.', { | Completa a expressão de U04 com `'Consulta do journal falhou; commit sem ownership continuará rejeitado.', {`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 051 | U04 |                 jobId: String(jobId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do jobId. |
| 052 | U04 |                 errorName: error && error.name ? error.name : 'Error', | Loga apenas o nome da exceção do journal. |
| 053 | U04 |               }); | Fecha a estrutura sintática da unidade U04. |
| 054 | U04 |           } | Fecha a estrutura sintática da unidade U04. |
| 055 | U04 |         } | Fecha a estrutura sintática da unidade U04. |
| 056 | U04 | ␠ [linha vazia] | Separador visual de U04 (Retry idempotente pelo journal durável); não altera estado ou fluxo. |
| 057 | U04 |         context.log('warn', 'bg', 'RESULT_COMMIT_REJECTED', | Emite evento de rejeição para job não-vivo ou batch divergente. |
| 058 | U04 |           'Commit de resultado rejeitado: job não pertence ao remetente ou não está mais ativo.', { | Completa a expressão de U04 com `'Commit de resultado rejeitado: job não pertence ao remetente ou não está mais ativo.', {`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 059 | U04 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do jobId. |
| 060 | U04 |             batchId: String(batchId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do batchId. |
| 061 | U04 |           }); | Fecha a estrutura sintática da unidade U04. |
| 062 | U05 |         return { ok: false, reason: 'job_not_live' }; | Retorna falha quando nem ownership nem journal válido sustentam o commit. |
| 063 | U05 |       } | Fecha a estrutura sintática da unidade U05. |
| 064 | U05 | ␠ [linha vazia] | Separador visual de U05 (Rejeição sem ownership e mismatch de batch); não altera estado ou fluxo. |
| 065 | U05 |       const job = ownership.job; | Adota o job persistido/owned como autoridade. |
| 066 | U05 |       if (batchId && job.batchId && batchId !== job.batchId) { | Rejeita batch explicitamente divergente quando ambos possuem valor. |
| 067 | U05 |         context.log('warn', 'bg', 'RESULT_COMMIT_REJECTED', | Emite evento de rejeição para job não-vivo ou batch divergente. |
| 068 | U05 |           'Commit de resultado rejeitado: batch não corresponde ao job persistido.', { | Completa a expressão de U05 com `'Commit de resultado rejeitado: batch não corresponde ao job persistido.', {`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 069 | U05 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do jobId. |
| 070 | U05 |             expectedBatchId: String(job.batchId \|\| '').slice(0, 8), | Registra prefixo do batch persistido esperado. |
| 071 | U05 |             receivedBatchId: String(batchId \|\| '').slice(0, 8), | Registra prefixo do batch recebido. |
| 072 | U05 |           }); | Fecha a estrutura sintática da unidade U05. |
| 073 | U05 |         return { ok: false, reason: 'job_identity_mismatch' }; | Retorna razão específica sem alterar estado/finalizar. |
| 074 | U05 |       } | Fecha a estrutura sintática da unidade U05. |
| 075 | U05 | ␠ [linha vazia] | Separador visual de U05 (Rejeição sem ownership e mismatch de batch); não altera estado ou fluxo. |
| 076 | U06 |       if (job.resultPersisted !== true && job.state !== 'dom_applied') { | Aplica o gate OR-semântico: rejeita só quando flag não é true e state não é dom_applied. |
| 077 | U06 |         context.log('error', 'bg', 'RESULT_COMMIT_BEFORE_PERSIST', | Registra tentativa de commit antes do gate de persistência. |
| 078 | U06 |           'Commit recusado porque o resultado ainda não possui ACK de persistência.', { | Completa a expressão de U06 com `'Commit recusado porque o resultado ainda não possui ACK de persistência.', {`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 079 | U06 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do jobId. |
| 080 | U06 |             batchId: String(job.batchId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do batchId. |
| 081 | U06 |           }); | Fecha a estrutura sintática da unidade U06. |
| 082 | U06 |         return { ok: false, reason: 'result_not_persisted' }; | Retorna falha prematura sem update/finalize. |
| 083 | U06 |       } | Fecha a estrutura sintática da unidade U06. |
| 084 | U06 | ␠ [linha vazia] | Separador visual de U06 (Gate de persistência); não altera estado ou fluxo. |
| 085 | U06 |       const geminiTabId = ownership.tabId ?? senderTabId ?? job.geminiTabId; | Escolhe tabId na ordem ownership → sender → job. |
| 086 | U06 |       await context.updateJobState(geminiTabId, { | Persiste a transição de commit antes do cleanup. |
| 087 | U07 |         state: 'result_committed', | Define o estado durável `result_committed`. |
| 088 | U07 |         resultCommittedAt: Date.now(), | Anexa timestamp da aceitação do commit. |
| 089 | U07 |       }); | Fecha a estrutura sintática da unidade U07. |
| 090 | U07 | ␠ [linha vazia] | Separador visual de U07 (Transição para result_committed); não altera estado ou fluxo. |
| 091 | U07 |       context.log('success', 'bg', 'RESULT_COMMIT_ACCEPTED', | Registra sucesso depois da transição persistida. |
| 092 | U07 |         'Resultado persistido confirmado; job liberado para finalização segura.', { | Completa a expressão de U07 com `'Resultado persistido confirmado; job liberado para finalização segura.', {`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 093 | U08 |           jobId: String(jobId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do jobId. |
| 094 | U08 |           batchId: String(job.batchId \|\| '').slice(0, 8), | Loga apenas os oito primeiros caracteres do batchId. |
| 095 | U08 |         }); | Fecha a estrutura sintática da unidade U08. |
| 096 | U08 | ␠ [linha vazia] | Separador visual de U08 (Observabilidade do commit aceito); não altera estado ou fluxo. |
| 097 | U08 |       await context.finalizeJob( | Aguarda a finalização segura antes de responder. |
| 098 | U08 |         geminiTabId, | Completa a expressão de U08 com `geminiTabId,`, fornecendo parte concreta da condição/objeto/chamada adjacente. |
| 099 | U08 |         job.mangaTabId ?? request.mangaTabId, | Prefere mangaTabId persistido; request é fallback nullish. |
| 100 | U09 |         false | Passa `fromError=false`, contabilizando a finalização como sucesso. |
| 101 | U09 |       ); | Fecha a estrutura sintática da unidade U09. |
| 102 | U09 | ␠ [linha vazia] | Separador visual de U09 (Finalização e resposta); não altera estado ou fluxo. |
| 103 | U09 |       return { committed: true }; | Retorna o contrato final; o router acrescenta `ok:true`. |
| 104 | U09 |     }, | Fecha a estrutura sintática da unidade U09. |
| 105 | U09 |   }); | Fecha a estrutura sintática da unidade U09. |
| 106 | U10 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha a IIFE usando self no worker e globalThis no harness. |
| 107 | U10 | ⏎ [newline final] | Preserva o newline terminal do blob; posição editorial sem efeito runtime. |

## 11. Análise por unidade

### U01 — linhas/posição 1–8: Cabeçalho, registro e política de origem

**O que faz:** Registra a segunda fase do protocolo de entrega: commit depois da confirmação de persistência.

**Como faz:** A IIFE publica `commit-result` no router e usa `allowedSources:['any']`; a autorização efetiva fica no ownership do job.

**Por que desta forma:** O commit pode ser repetido após wake-up/perda de resposta e não deve depender apenas da classificação heurística do sender.

**Por que uma implementação ingênua seria pior:** Finalizar já no staging ou confiar somente na origem quebraria a separação stage→commit e permitiria autorização fraca.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE para estrutura; a action real é carregada e despachada pela suíte direta. ⚠️ A necessidade de `allowedSources:any` não possui teste focal.

### U02 — linhas/posição 9–15: Validação de jobId

**O que faz:** Rejeita jobId que não seja string ou seja vazio depois de `trim()`.

**Como faz:** `validate()` retorna `INVALID_PAYLOAD`; o router encerra antes de `execute()`.

**Por que desta forma:** jobId é a identidade mínima para ownership, journal e retry.

**Por que uma implementação ingênua seria pior:** Commit sem identidade poderia consultar/finalizar estado ambíguo.

**Evidência:** ✅ PROVADO DIRETAMENTE — o teste `validação exige jobId` verifica o erro. ⚠️ Tipos não-string, vazio explícito e whitespace-only não têm casos separados.

### U03 — linhas/posição 16–28: Inicialização e ownership

**O que faz:** Reidrata o background, captura tabId do sender e espera o resultado de `assertJobOwnership`.

**Como faz:** `ensureInitialized()` é awaited; o callback de ownership é adaptado para Promise contendo `owns`, `tabId` e `job`.

**Por que desta forma:** Em MV3, memória pode ter desaparecido; commit só deve prosseguir depois de reconciliar o job e provar ownership.

**Por que uma implementação ingênua seria pior:** Prosseguir fora do callback cria race; confiar em jobId/batch do payload sem sender permite commit de aba errada.

**Evidência:** ✅ PROVADO DIRETAMENTE para sucesso e rejeição de ownership. ⚠️ Ordem/rejeição de `ensureInitialized()` não tem assertion focal.

### U04 — linhas/posição 29–61: Retry idempotente pelo journal durável

**O que faz:** Quando não existe job vivo/owned, tenta reconhecer um commit já finalizado usando `gemini_finalized_<tabId>`.

**Como faz:** Escolhe `ownership.tabId ?? senderTabId`, lê uma única chave e só aceita marker não expirado, com mesmo jobId e `fromError === false`; nesse caso retorna `alreadyCommitted:true` sem finalizar outra vez.

**Por que desta forma:** A finalização pode ter ocorrido e apenas a resposta IPC ter se perdido; o journal sobrevive ao desaparecimento do job e à suspensão do worker.

**Por que uma implementação ingênua seria pior:** Rejeitar todo retry causaria repetição indefinida; executar `finalizeJob` outra vez pode duplicar contabilidade e cleanup.

**Evidência:** ✅ PROVADO DIRETAMENTE — marker válido retorna committed/alreadyCommitted, gera `RESULT_COMMIT_ALREADY_FINALIZED` e não chama finalize. ⚠️ Marker expirado, `fromError:true`, jobId diferente e lookup com erro não têm casos focais.

### U05 — linhas/posição 62–75: Rejeição sem ownership e mismatch de batch

**O que faz:** Sem journal válido rejeita job não-vivo; com job vivo rejeita batchId explicitamente divergente.

**Como faz:** Emite `RESULT_COMMIT_REJECTED` e retorna `job_not_live` ou `job_identity_mismatch`.

**Por que desta forma:** Evita transformar ausência de prova em sucesso e bloqueia mensagem stale/forjada de outro lote.

**Por que uma implementação ingênua seria pior:** Aceitar batch divergente poderia finalizar job do lote errado.

**Evidência:** ✅ PROVADO DIRETAMENTE — suíte cobre remetente sem ownership e batch forjado. ⚠️ BatchId omitido não tem caso focal.

### U06 — linhas/posição 76–86: Gate de persistência

**O que faz:** Recusa commit apenas quando a flag `resultPersisted` não é `true` E o state não é `dom_applied`.

**Como faz:** A condição usa `&&`; quando ambos falham, loga `RESULT_COMMIT_BEFORE_PERSIST` e retorna `result_not_persisted` sem update/finalize.

**Por que desta forma:** Cleanup só pode ocorrer depois do ACK de aplicação/persistência; o state funciona como sinal compatível adicional.

**Por que uma implementação ingênua seria pior:** Finalizar antes da persistência pode perder resultado e apagar a conversa Gemini cedo demais.

**Evidência:** ✅ PROVADO DIRETAMENTE — dois estados prematuros não chamam update/finalize. ⚠️ Não há casos assimétricos: flag true + state antigo, ou flag false/undefined + state `dom_applied`; ambos são aceitos pelo código atual.

### U07 — linhas/posição 87–92: Transição para result_committed

**O que faz:** Resolve o geminiTabId efetivo e persiste `result_committed` com timestamp antes do cleanup.

**Como faz:** Prioridade de tabId: ownership → sender → job; `updateJobState()` é awaited.

**Por que desta forma:** Persistir a transição antes de remover/finalizar deixa estado observável para recovery.

**Por que uma implementação ingênua seria pior:** Finalizar primeiro pode remover o registro antes que o commit seja registrado.

**Evidência:** ✅ PROVADO DIRETAMENTE — sucesso exige `updateJobState(321,{state:'result_committed',...})`. ⚠️ Fallbacks de tabId e timestamp exato não têm testes focais.

### U08 — linhas/posição 93–99: Observabilidade do commit aceito

**O que faz:** Registra `RESULT_COMMIT_ACCEPTED` com prefixos de job/batch depois da transição persistida.

**Como faz:** Usa nível success e IDs truncados; não inclui imagem ou resultado binário.

**Por que desta forma:** Distingue commit aceito de staging e de rejeições sem vazar payload pesado.

**Por que uma implementação ingênua seria pior:** Sem evento específico, diagnóstico de cleanup fica ambíguo; logar payload amplia risco/volume.

**Evidência:** 🟨 EXECUTADO NO CAMINHO DE SUCESSO, mas ⚠️ não existe assertion focal do log/metadata.

### U09 — linhas/posição 100–105: Finalização e resposta

**O que faz:** Finaliza o job como sucesso e só depois retorna `committed:true`.

**Como faz:** `finalizeJob` recebe geminiTabId, `job.mangaTabId ?? request.mangaTabId` e `false` para `fromError`.

**Por que desta forma:** O caller só recebe commit depois que a finalização assíncrona foi aguardada; o destino persistido tem precedência.

**Por que uma implementação ingênua seria pior:** Fire-and-forget pode responder sucesso antes de falha do cleanup; priorizar mangaTabId do request permitiria redirecionamento.

**Evidência:** ✅ PROVADO DIRETAMENTE — sucesso exige `finalizeJob(321,77,false)` e resposta committed. ⚠️ Fallback de mangaTabId e rejeição de finalize não têm casos focais.

### U10 — linhas/posição 106–107: Fechamento e newline

**O que faz:** Fecha a IIFE e contabiliza o newline final do blob.

**Como faz:** Usa `self` no worker e `globalThis` no fallback de teste; a posição 107 é editorial.

**Por que desta forma:** Mantém compatibilidade de carregamento e equivalência física da auditoria.

**Por que uma implementação ingênua seria pior:** Omitir o newline reduziria a cobertura real; mudar unilateralmente para ES module quebraria loaders atuais.

**Evidência:** 🟨 O carregamento é exercitado pelo teste direto; 🟦 o newline é gate documental.

## 12. Revisão final

- [x] SHA/fonte integral;
- [x] 106 linhas + newline = 107/107;
- [x] journal/ownership/batch/persistência/finalize separados;
- [x] prova direta separada do consumer mock;
- [x] semântica OR do gate explicitada;
- [x] lacunas de marker/fallback/error registradas;
- [x] invariantes MV3/idempotência definidos;
- [x] nenhum código funcional alterado.

**Veredito documental:** aprovada para `32270d1c4ade42b7e6decd5ef124d71745c2a5b0`.

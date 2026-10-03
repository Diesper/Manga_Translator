# Bíblia técnica — `extension/background/actions/deliver-result-from-tab.js`

> **Estado:** 🟡 CORRIGIDO APÓS REAUDIT — READY_FOR_AUDIT da revisão documental atual.  
> **SHA auditado:** `59543c1359669ced02a1d05c251b272abaad6709`  
> **Tipo:** action assíncrona — ingestão de resultado de aba auxiliar.  
> **Linhas textuais:** **103**.  
> **Posições documentais:** **104** contando newline final.  
> **Teste direto principal:** `tests/unit/background/deliver-result-from-tab-action.test.js` — `263cb827e30468c377c5b1eb5863e90bd6cf26b0`.

## 1. Papel arquitetural

Esta action recebe a imagem já extraída por uma aba auxiliar, mas **não confia nos campos de identidade enviados por essa aba**. O vínculo autoritativo vem de `sender.tab.id → state.extractionTabs[senderTabId]`, depois é cruzado novamente com o job Gemini vivo via `assertJobOwnership`.

O arquivo foi desenhado para aceitar um resultado legítimo mesmo quando `state.currentBatchId` já aponta para outro lote. O que importa é a identidade persistida do job ao qual aquela aba auxiliar pertence.

## 2. Protocolo real

1. Valida jobId e prefixo de Data URL de imagem.
2. Reidrata o background.
3. Liga o sender real ao mapping de `extractionTabs`.
4. Confirma que o job Gemini do mapping ainda está vivo/owned.
5. Compara batch/index/mangaTabId mapping↔job.
6. Faz staging no leitor com `finalizeOnAck:false`.
7. Se staging falha, preserva aba/mapping/job para retry.
8. Se staging é aceito, remove a aba auxiliar, remove mapping e sincroniza estado.
9. Finaliza o job como sucesso.
10. Responde staged/persisted/committed.

## 3. Trust boundary e minimização

Apesar de `allowedSources:['any']`, uma origem não obtém autoridade simplesmente enviando `geminiTabId`, `mangaTabId`, `index` ou `batchId`: a action ignora esses campos do request para identidade. Somente `request.jobId` é comparado com o mapping do sender e `request.src` é usado como resultado.

`src` precisa começar com um Data URL `data:image/...;base64,`, mas a validação é apenas estrutural: não há decodificação/validação do Base64, limite de bytes nem allowlist restrita de MIME. Isso é uma lacuna de robustez/DoS, não evidência de quebra funcional já observada.

## 4. Relação com o helper de ACK

`jobs-dom-ack.js` com `finalizeOnAck:false` envia `UPDATE_IMAGE`, persiste `state:'dom_applied'`/`resultPersisted:true` quando considera o ACK positivo e **não** chama finalize. A action então executa seu próprio cleanup da aba auxiliar e finalização.

O helper retorna sempre um objeto com `ok` e `persisted`; portanto o ramo normal não depende de um objeto parcial. Mesmo assim, o teste focal da action não cobre um mock `{ok:true}` sem `persisted`, e a condição local aceitaria esse objeto.

## 5. Consumidor e retry

`content_manga.js` envia `IMAGE_READY_FROM_NEW_TAB` com os dados recebidos de `CHECK_IF_EXTRACTION_TAB`. Se o ACK do background não confirmar persistência, ele redefine `imageDelivered=false` e agenda nova tentativa; após ACK persistido encerra a extração.

### Wiring runtime da action

- `extension/background/router.js` define o alias `IMAGE_READY_FROM_NEW_TAB: 'deliver-result-from-tab'`; essa é a prova primária da relação alias→nome canônico.
- `extension/background.js` carrega `background/actions/deliver-result-from-tab.js` no bootstrap real, tanto no caminho `importScripts` quanto no harness Node/`require`.
- O dispatcher/router então resolve `IMAGE_READY_FROM_NEW_TAB` para esta action registrada como `deliver-result-from-tab`.
- `tests/unit/background/message-handlers-real.test.js` atravessa o background real com `IMAGE_READY_FROM_NEW_TAB`, servindo como prova integrada do wiring; isso é distinto da prova focal do comportamento interno desta action.

`tests/unit/content-manga/extraction-and-handlers-real.test.js` prova esse retry do consumidor com runtime responder mockado. Isso complementa, mas não substitui, a prova direta da action.

## 6. Matriz de evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `deliver-result-from-tab-action.test.js` | ✅ PROVADO DIRETAMENTE | Payload inválido antes de reidratar, mapping/jobId mismatch, sucesso completo, independência de `currentBatchId`, falha de staging preservando aba/mapping e finalize somente após sucesso. |
| `jobs-dom-ack-staging.test.js` — `5db47daff53026aa778944c999d7dc922f35ecad` | ✅ PROVADO DIRETAMENTE DO HELPER | `finalizeOnAck:false`, persistência `dom_applied/resultPersisted`, ACK negativo, timeout e runtime error sem finalize. |
| `process-finalize-real.test.js` — `abb1b936fadf0e309933e39b4b705116eb320a1f` | ✅ PROVADO DIRETAMENTE DO LIFECYCLE DE FINALIZE | Exercita `finalizeJob` real, marcador durável, contabilidade/cleanup e restart; **não executa esta action nem o staging e não prova a ordem staging→finalize**. |
| `extraction-and-handlers-real.test.js` — `038961e8228c7b5f1a87023a739ad5f33288423b` | 🟨 PROVA DO CONSUMIDOR | ACK persistido encerra; ACK não confirmado repete exatamente a entrega. A resposta do background é mockada. |

## 7. Lacunas de teste e riscos

### Ownership negativo
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `ownership.owns=false`/`ownership.job=null` depois de um mapping válido.

### Mismatches individuais
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para batchId divergente, index divergente e mangaTabId divergente. O teste de jobId forjado falha antes e não prova `identityMismatch`.

### Data URL incompleto/grande
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** e sem limite funcional para Base64 vazio/malformado, MIME incomum ou payload muito grande.

### Staged parcial
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `null/undefined`, `{ok:true,persisted:false}` isolado e `{ok:true}` sem campo `persisted`. O helper real oferece shape completo, mas a action depende desse contrato implícito.

### Remoção da aba auxiliar
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `chrome.runtime.lastError`, exceção síncrona de `tabs.remove` ou aba que permanece aberta. O código inicia a remoção, ignora `lastError` e continua apagando mapping/finalizando.

### sync/finalize rejeitando
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `syncState()` ou `finalizeJob()` rejeitando.

### Fallbacks nullish
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para job sem mangaTabId/index/batchId usando valores do mapping.

### Logs
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `AUX_RESULT_JOB_IDENTITY_MISMATCH`, `AUX_RESULT_STAGED_DURABLY` e metadata truncada.

## 8. Análise crítica

1. **A action não depende de `currentBatchId` global**, e isso é explicitamente provado.
2. **O request não controla destino/índice/batch:** essas identidades vêm do mapping e depois do job persistido.
3. **A remoção da aba é best-effort e não awaited.** Se `tabs.remove` falhar, o mapping já será removido e o job poderá ser finalizado, deixando uma aba auxiliar órfã.
4. **A regex de `src` é só um gate de prefixo**, não uma validação de Base64/tamanho.
5. **O helper de ACK é a garantia efetiva de persistência.** A action aceita o contrato do helper e faz cleanup somente depois dele.
6. **Falha de staging preserva retry:** essa é a propriedade mais importante para evitar perda de resultado.

## 9. Invariantes

1. Payload inválido falha antes de `ensureInitialized`.
2. sender.tab.id, não campos de tab do payload, ancora a aba auxiliar.
3. Mapping ausente ou jobId divergente nunca chega ao delivery.
4. Mapping válido ainda precisa de ownership vivo do job Gemini.
5. `currentBatchId` global não invalida um job auxiliar real por si só.
6. Batch/index/mangaTabId divergentes entre mapping e job devem falhar.
7. Valores persistidos do job prevalecem sobre mapping nos argumentos de staging/finalize.
8. Staging usa `finalizeOnAck:false`.
9. Falha/ACK não persistido não remove aba, mapping nem finaliza job.
10. Cleanup do mapping acontece somente depois de staging aceito.
11. Estado do mapping é sincronizado antes do finalize.
12. Finalização usa `fromError=false`.
13. Resposta positiva só ocorre depois de `finalizeJob` awaited.
14. Logs não devem incluir o Data URL/Base64.

## 10. Fonte integral

~~~javascript
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
~~~

## 11. Rastreabilidade 104/104

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode para a action. |
| 002 | U01 | // background/actions/deliver-result-from-tab.js -- Entrega resultado da aba auxiliar sem depender de currentBatchId. | Comentário de U01: “background/actions/deliver-result-from-tab.js -- Entrega resultado da aba auxiliar sem depender de currentBatchId.”; registra intenção sem executar. |
| 003 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho e intenção); não altera estado, IPC ou controle. |
| 004 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`, fornecendo argumento, propriedade ou condição das linhas contíguas. |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a definição no MangaTranslatorRouter. |
| 006 | U02 |     name: 'deliver-result-from-tab', | Declara somente o **nome canônico da action** `deliver-result-from-tab`; o alias `IMAGE_READY_FROM_NEW_TAB` é mapeado externamente em `extension/background/router.js`. |
| 007 | U02 |     meta: { allowedSources: ['any'] }, | Permite qualquer source classificada pelo router; a autorização forte usa senderTabId + mapping + ownership. |
| 008 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro, origem e validação do payload); não altera estado, IPC ou controle. |
| 009 | U02 |     validate(request) { | Abre a validação executada antes de reidratar/tocar estado. |
| 010 | U02 |       if (typeof request.jobId !== 'string' \|\| request.jobId.trim().length === 0) { | Exige jobId string com conteúdo não-whitespace. |
| 011 | U02 |         return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' }; | Retorna INVALID_PAYLOAD estável para jobId inválido. |
| 012 | U02 |       } | Fecha a estrutura sintática da unidade U02. |
| 013 | U02 |       if (typeof request.src !== 'string' \|\| !/^data:image\/[a-z0-9.+-]+;base64,/i.test(request.src)) { | Exige string cujo prefixo corresponde a Data URL de imagem Base64. |
| 014 | U02 |         return { code: 'INVALID_PAYLOAD', message: 'src de resultado inválido' }; | Retorna INVALID_PAYLOAD antes de qualquer efeito quando src não passa a regex. |
| 015 | U02 |       } | Fecha a estrutura sintática da unidade U02. |
| 016 | U02 |       return null; | Indica ao router que a validação terminou sem erro. |
| 017 | U02 |     }, | Fecha a estrutura sintática da unidade U02. |
| 018 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro, origem e validação do payload); não altera estado, IPC ou controle. |
| 019 | U03 |     async execute(request, context) { | Abre o executor assíncrono da entrega auxiliar. |
| 020 | U03 |       await context.ensureInitialized(); | Reidrata/reconcilia o background antes de consultar mapping/job. |
| 021 | U03 |       const senderTabId = context.sender && context.sender.tab ? context.sender.tab.id : null; | Extrai tabId do sender runtime; nenhum tabId do payload é usado como autoridade. |
| 022 | U03 |       const mapping = senderTabId !== null && context.state.extractionTabs[senderTabId]; | Busca `extractionTabs[senderTabId]`; sem sender válido o resultado é falsy. |
| 023 | U03 | ␠ [linha vazia] | Separador visual de U03 (Reidratação e vínculo sender → extraction mapping); não altera estado, IPC ou controle. |
| 024 | U03 |       if (!mapping \|\| mapping.jobId !== request.jobId) { | Exige mapping existente e mesmo jobId do request. |
| 025 | U03 |         context.log('warn', 'bg', 'SENDER_MISMATCH', | Registra rejeição de origem/ownership auxiliar incompatível. |
| 026 | U03 |           'Resultado de aba temporária descartado: mapeamento ou job incompatível.', { | Descreve a rejeição específica do vínculo sender→mapping. |
| 027 | U03 |             jobId: String(request.jobId \|\| '').slice(0, 8), | Loga somente prefixo de oito caracteres do jobId solicitado. |
| 028 | U03 |           }); | Fecha a estrutura sintática da unidade U03. |
| 029 | U03 |         return { ok: false, reason: 'sender_mismatch' }; | Falha fechada sem delivery, cleanup ou finalize. |
| 030 | U03 |       } | Fecha a estrutura sintática da unidade U03. |
| 031 | U03 | ␠ [linha vazia] | Separador visual de U03 (Reidratação e vínculo sender → extraction mapping); não altera estado, IPC ou controle. |
| 032 | U04 |       const { mangaTabId, index, geminiTabId, jobId, batchId } = mapping; | Extrai do mapping interno as identidades usadas no restante do fluxo. |
| 033 | U04 |       const ownership = await new Promise(resolve => { | Adapta `assertJobOwnership` callback-based para `await`. |
| 034 | U04 |         context.assertJobOwnership({ tab: { id: geminiTabId } }, jobId, (owns, tabId, job) => { | Valida o job usando o geminiTabId e jobId do mapping, não os do request. |
| 035 | U04 |           resolve({ owns, tabId, job }); | Materializa o resultado de ownership para as guardas seguintes. |
| 036 | U04 |         }); | Fecha a estrutura sintática da unidade U04. |
| 037 | U04 |       }); | Fecha a estrutura sintática da unidade U04. |
| 038 | U04 | ␠ [linha vazia] | Separador visual de U04 (Ownership do job Gemini); não altera estado, IPC ou controle. |
| 039 | U04 |       if (!ownership.owns \|\| !ownership.job) { | Rejeita mapping stale cujo job Gemini não está mais vivo/owned. |
| 040 | U04 |         context.log('warn', 'bg', 'SENDER_MISMATCH', | Registra rejeição de origem/ownership auxiliar incompatível. |
| 041 | U04 |           'Resultado de aba temporária descartado: job do Gemini não está mais ativo.', { | Explica no log a rejeição por job inativo. |
| 042 | U04 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId interno. |
| 043 | U04 |           }); | Fecha a estrutura sintática da unidade U04. |
| 044 | U04 |         return { ok: false, reason: 'sender_mismatch' }; | Falha fechada sem delivery, cleanup ou finalize. |
| 045 | U04 |       } | Fecha a estrutura sintática da unidade U04. |
| 046 | U05 | ␠ [linha vazia] | Separador visual de U05 (Reconciliação de identidade com o job persistido); não altera estado, IPC ou controle. |
| 047 | U05 |       const job = ownership.job; | Adota o job persistido/owned como autoridade final. |
| 048 | U05 |       const identityMismatch = | Inicia a composição das três verificações de identidade mapping↔job. |
| 049 | U05 |         (batchId && job.batchId && batchId !== job.batchId) \|\| | Compara batchId apenas quando mapping e job possuem valor truthy. |
| 050 | U05 |         (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) \|\| | Compara index somente quando ambos os lados são inteiros. |
| 051 | U05 |         (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId); | Compara mangaTabId quando ambos são truthy. |
| 052 | U05 | ␠ [linha vazia] | Separador visual de U05 (Reconciliação de identidade com o job persistido); não altera estado, IPC ou controle. |
| 053 | U05 |       if (identityMismatch) { | Entra na rejeição se qualquer dimensão de identidade divergir. |
| 054 | U05 |         context.log('error', 'bg', 'AUX_RESULT_JOB_IDENTITY_MISMATCH', | Registra mismatch mapping↔job persistido. |
| 055 | U05 |           'Resultado auxiliar rejeitado: identidade não corresponde ao job persistido.', { | Descreve o erro de identidade persistida. |
| 056 | U05 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId interno. |
| 057 | U05 |             expectedBatchId: String(job.batchId \|\| '').slice(0, 8), | Loga prefixo do batchId esperado pelo job. |
| 058 | U05 |             receivedBatchId: String(batchId \|\| '').slice(0, 8), | Loga prefixo do batchId recebido do mapping. |
| 059 | U05 |           }); | Fecha a estrutura sintática da unidade U05. |
| 060 | U05 |         return { ok: false, reason: 'job_identity_mismatch' }; | Retorna razão específica sem staged delivery/cleanup. |
| 061 | U05 |       } | Fecha a estrutura sintática da unidade U05. |
| 062 | U05 | ␠ [linha vazia] | Separador visual de U05 (Reconciliação de identidade com o job persistido); não altera estado, IPC ou controle. |
| 063 | U06 |       const staged = await context.deliverResultToManga({ | Inicia staging durável no leitor e aguarda o ACK do helper. |
| 064 | U06 |         mangaTabId: job.mangaTabId ?? mangaTabId, | Prefere mangaTabId persistido; mapping é apenas fallback nullish. |
| 065 | U06 |         index: job.index ?? index, | Prefere index persistido; mapping é fallback nullish. |
| 066 | U06 |         src: request.src, | Entrega exatamente o Data URL validado; não usa URL externa. |
| 067 | U06 |         jobId, | Propaga o jobId do mapping já validado. |
| 068 | U06 |         batchId: job.batchId ?? batchId, | Prefere batchId persistido ao mapping. |
| 069 | U06 |         geminiTabId: ownership.tabId, | Usa o tabId confirmado pelo ownership para atualização de estado. |
| 070 | U06 |         finalizeOnAck: false, | Impede o helper de finalizar automaticamente; esta action controla o cleanup/finalize depois. |
| 071 | U06 |       }); | Fecha a estrutura sintática da unidade U06. |
| 072 | U06 | ␠ [linha vazia] | Separador visual de U06 (Staging durável no leitor); não altera estado, IPC ou controle. |
| 073 | U07 |       if (!staged?.ok \|\| staged.persisted === false) { | Rejeita staging sem `ok` truthy ou com persistência explicitamente falsa. |
| 074 | U07 |         context.log('error', 'bg', 'AUX_RESULT_STAGE_FAILED', | Registra falha de ACK/persistência para orientar retry. |
| 075 | U07 |           'Resultado da aba auxiliar não recebeu ACK de persistência; aba mantida para retry.', { | Explica que a aba auxiliar será preservada para retry. |
| 076 | U07 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId interno. |
| 077 | U07 |             reason: staged?.reason \|\| 'unknown', | Propaga a razão do helper no log/resposta, com fallback seguro. |
| 078 | U07 |           }); | Fecha a estrutura sintática da unidade U07. |
| 079 | U07 |         return { ok: false, reason: staged?.reason \|\| 'stage_failed' }; | Propaga a razão do helper no log/resposta, com fallback seguro. |
| 080 | U07 |       } | Fecha a estrutura sintática da unidade U07. |
| 081 | U07 | ␠ [linha vazia] | Separador visual de U07 (Falha de staging e retry); não altera estado, IPC ou controle. |
| 082 | U08 |       if (senderTabId !== null) { | Executa cleanup tab-scoped quando há senderTabId. |
| 083 | U08 |         chrome.tabs.remove(senderTabId, () => { if (chrome.runtime.lastError) {} }); | Solicita remoção da aba auxiliar; callback apenas consome `lastError` e não espera confirmação. |
| 084 | U08 |         delete context.state.extractionTabs[senderTabId]; | Remove o mapping auxiliar da cópia de estado depois do staging aceito. |
| 085 | U08 |       } | Fecha a estrutura sintática da unidade U08. |
| 086 | U08 |       await context.syncState(); | Persiste a remoção do mapping antes do log/finalização. |
| 087 | U08 | ␠ [linha vazia] | Separador visual de U08 (Cleanup da aba auxiliar e persistência do mapping); não altera estado, IPC ou controle. |
| 088 | U09 |       context.log('success', 'bg', 'AUX_RESULT_STAGED_DURABLY', | Registra que o staging foi considerado durável e o job está pronto para finalize. |
| 089 | U09 |         'Resultado auxiliar foi persistido; job agora pode ser finalizado com segurança.', { | Mensagem de sucesso sem incluir a imagem/Base64. |
| 090 | U09 |           jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId interno. |
| 091 | U09 |           batchId: String(job.batchId \|\| batchId \|\| '').slice(0, 8), | Loga prefixo do batch persistido, com fallback ao mapping. |
| 092 | U09 |         }); | Fecha a estrutura sintática da unidade U09. |
| 093 | U09 | ␠ [linha vazia] | Separador visual de U09 (Telemetria do staging durável); não altera estado, IPC ou controle. |
| 094 | U10 |       await context.finalizeJob( | Aguarda a finalização segura do job depois do cleanup/sync. |
| 095 | U10 |         ownership.tabId, | Passa ao finalize o tabId confirmado pelo ownership. |
| 096 | U10 |         job.mangaTabId ?? mangaTabId, | Finaliza no mangaTabId persistido, usando mapping apenas como fallback. |
| 097 | U10 |         false | Marca a finalização como sucesso (`fromError=false`). |
| 098 | U10 |       ); | Fecha a estrutura sintática da unidade U10. |
| 099 | U10 | ␠ [linha vazia] | Separador visual de U10 (Finalização do job e resposta); não altera estado, IPC ou controle. |
| 100 | U10 |       return { staged: true, persisted: true, committed: true }; | Responde que staging, persistência e commit concluíram com sucesso. |
| 101 | U10 |     }, | Fecha a estrutura sintática da unidade U10. |
| 102 | U10 |   }); | Fecha a estrutura sintática da unidade U10. |
| 103 | U10 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha a IIFE usando `self` no worker e `globalThis` no harness. |
| 104 | U11 | ⏎ [newline final] | Preserva o newline terminal do blob; posição editorial sem efeito runtime. |

## 12. Análise por unidade

### U01 — linhas/posição 1–3: Cabeçalho e intenção

**O que faz:** Ativa strict mode e declara que esta action recebe o resultado produzido por uma aba auxiliar de extração.

**Como faz:** A diretiva precede a IIFE; o comentário destaca que a validação não depende de `currentBatchId` global.

**Por que desta forma:** Aba auxiliar pode terminar depois que outro batch virou o lote corrente; sua identidade correta está no mapping/job persistido.

**Por que uma implementação ingênua seria pior:** Usar `currentBatchId` global como autoridade descartaria resultados legítimos de batch anterior ainda vivo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento da action real; a independência de currentBatchId é provada em U03/U05 pelo teste direto.

### U02 — linhas/posição 4–18: Registro, origem e validação do payload

**O que faz:** Registra `deliver-result-from-tab`, aceita qualquer source classificada pelo router, exige jobId e um Data URL de imagem com prefixo Base64.

**Como faz:** `validate()` checa jobId string não vazia e regex `data:image/<mime>;base64,` antes de qualquer reidratação.

**Por que desta forma:** A action precisa rejeitar payload obviamente inválido antes de tocar estado; a autorização forte vem do mapping da própria sender tab, não do payload.

**Por que uma implementação ingênua seria pior:** Confiar em mangaTabId/index/geminiTabId enviados pelo caller permitiria forjar identidade; aceitar URL remota faria o background tratar origem não persistida como resultado pronto.

**Evidência:** ✅ PROVADO DIRETAMENTE — testes rejeitam jobId ausente e `src` HTTP antes de `ensureInitialized`. ⚠️ A regex só valida o prefixo: payload Base64 vazio/malformado, MIME extremo e tamanho máximo não têm testes nem limite funcional.

### U03 — linhas/posição 19–31: Reidratação e vínculo sender → extraction mapping

**O que faz:** Reidrata o background e exige que `sender.tab.id` tenha um entry em `state.extractionTabs` com o mesmo jobId do request.

**Como faz:** O senderTabId vem do contexto runtime; mapping é lido por essa chave; ausência ou jobId divergente loga `SENDER_MISMATCH` e falha fechada.

**Por que desta forma:** O mapping foi criado pelo fluxo interno e contém mangaTabId/index/geminiTabId/batchId confiáveis; isso impede usar os campos homônimos do payload como autoridade.

**Por que uma implementação ingênua seria pior:** Aceitar request.geminiTabId/mangaTabId/index permitiria uma aba arbitrária redirecionar resultado para outro job.

**Evidência:** ✅ PROVADO DIRETAMENTE — `rejeita job diferente do mapeamento...` verifica zero remove/sync/finalize e `sender_mismatch`. ✅ O teste de currentBatchId mostra que a decisão usa mapping/job real, não lote global. ⚠️ Sender sem tab/id inválido e mapping ausente isoladamente não têm casos focais.

### U04 — linhas/posição 32–45: Ownership do job Gemini

**O que faz:** Extrai a identidade do mapping e exige que o job Gemini indicado ainda esteja vivo e pertencente à aba Gemini persistida.

**Como faz:** `assertJobOwnership` é chamado com sender sintético `{tab:{id:geminiTabId}}` e jobId do mapping; callback é convertido para Promise; falha retorna `sender_mismatch`.

**Por que desta forma:** Mapping auxiliar sozinho pode ficar stale; cruzá-lo com o job vivo impede resultado tardio depois de cancelamento/finalização.

**Por que uma implementação ingênua seria pior:** Confiar apenas em extractionTabs permitiria aba auxiliar antiga gravar resultado depois que o job foi removido ou substituído.

**Evidência:** 🟨 O caminho de ownership positivo é executado pelos testes de sucesso/retry. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `ownership.owns=false`, `ownership.job=null` e para rejeição/erro do helper.

### U05 — linhas/posição 46–62: Reconciliação de identidade com o job persistido

**O que faz:** Compara batchId, index e mangaTabId do mapping contra o job retornado pelo ownership e rejeita qualquer divergência aplicável.

**Como faz:** `identityMismatch` é OR de três guardas: batch quando ambos truthy, index quando ambos inteiros, mangaTabId quando ambos truthy; mismatch loga IDs de batch e retorna `job_identity_mismatch`.

**Por que desta forma:** Mesmo mapping com jobId correto pode estar stale/corrompido; o job persistido é a autoridade final para destino/posição/lote.

**Por que uma implementação ingênua seria pior:** Pular essas comparações permitiria entregar imagem no índice ou leitor errado; usar currentBatchId seria uma comparação contra a entidade errada.

**Evidência:** ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para mismatch de batch, index ou mangaTabId. O teste de jobId forjado falha antes, em U03, e não prova esta unidade. Também não há casos para campos ausentes/falsy que desativam cada comparação.

### U06 — linhas/posição 63–72: Staging durável no leitor

**O que faz:** Entrega a imagem ao leitor usando valores do job persistido como prioridade e desabilita finalização automática no helper.

**Como faz:** `deliverResultToManga` recebe mangaTabId/index/batch do job com fallback ao mapping, `src` validado, jobId, ownership.tabId e `finalizeOnAck:false`.

**Por que desta forma:** A action quer controlar cleanup da aba auxiliar e só finalizar depois do ACK de persistência; valores persistidos prevalecem sobre mapping possivelmente antigo.

**Por que uma implementação ingênua seria pior:** `finalizeOnAck:true` poderia finalizar antes de remover/sincronizar extractionTabs; priorizar payload/mapping sobre job vivo aumenta risco de destino stale.

**Evidência:** ✅ PROVADO DIRETAMENTE — sucesso exige `finalizeOnAck:false`, geminiTabId 17 e jobId correto. `jobs-dom-ack-staging.test.js` prova que esse modo grava `dom_applied/resultPersisted` e não finaliza o job. ⚠️ Fallbacks nullish de mangaTabId/index/batch não têm casos focais.

### U07 — linhas/posição 73–81: Falha de staging e retry

**O que faz:** Mantém aba auxiliar/mapping/job vivos quando o helper não confirma sucesso/persistência.

**Como faz:** Rejeita se `staged.ok` não é truthy ou se `staged.persisted === false`; loga razão e retorna erro sem cleanup/finalize.

**Por que desta forma:** O content script auxiliar possui retry de entrega; remover a aba antes de persistência confirmada perderia a única cópia disponível.

**Por que uma implementação ingênua seria pior:** Tratar ACK negativo como sucesso causaria perda silenciosa; finalizar o job bloquearia retry.

**Evidência:** ✅ PROVADO DIRETAMENTE — `falha de persistência mantém aba auxiliar e job vivos para retry`. 🟨 O consumer `extraction-and-handlers-real.test.js` prova que ACK não confirmado repete `IMAGE_READY_FROM_NEW_TAB`. ⚠️ Não há teste focal para `staged=null/undefined`, `{ok:true,persisted:false}` separado nem `{ok:true}` sem campo persisted.

### U08 — linhas/posição 82–87: Cleanup da aba auxiliar e persistência do mapping

**O que faz:** Após staging aceito, solicita remoção da aba auxiliar, remove seu mapping em memória e sincroniza estado.

**Como faz:** `chrome.tabs.remove` é fire-and-forget; `lastError` é lido e ignorado; o entry é deletado e `syncState()` é awaited.

**Por que desta forma:** A aba auxiliar não é mais necessária depois que o leitor persistiu o resultado; remover o mapping evita reentrega posterior.

**Por que uma implementação ingênua seria pior:** Manter mapping/aba permitiria retries duplicados após sucesso; porém ignorar falha de remoção pode deixar uma aba órfã ainda aberta.

**Evidência:** ✅ PROVADO DIRETAMENTE — sucesso verifica `tabs.remove(82)`, deletion do mapping e depois finalização; o teste não afirma explicitamente a ordem de `syncState`. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `chrome.runtime.lastError`, exceção síncrona de remove ou rejeição de `syncState`. A remoção não é awaited.

### U09 — linhas/posição 88–93: Telemetria do staging durável

**O que faz:** Registra `AUX_RESULT_STAGED_DURABLY` com prefixos de job/batch depois de sincronizar o mapping.

**Como faz:** Log success usa jobId e batch persistido/fallback truncados a oito caracteres.

**Por que desta forma:** Separa claramente staging confirmado de falhas/retries sem logar o Data URL.

**Por que uma implementação ingênua seria pior:** Logar `src` exporia Base64 e ampliaria muito o volume; omitir evento dificulta diagnóstico de transição.

**Evidência:** 🟨 EXECUTADO no caminho de sucesso, mas ⚠️ não há assertion focal para o evento ou metadata.

### U10 — linhas/posição 94–103: Finalização do job e resposta

**O que faz:** Finaliza o job Gemini como sucesso somente depois do staging/cleanup/sync e responde que o resultado foi staged, persisted e committed.

**Como faz:** `finalizeJob(ownership.tabId, job.mangaTabId ?? mangaTabId, false)` é awaited; depois retorna três flags true; a IIFE fecha com self/globalThis.

**Por que desta forma:** Garante que a resposta positiva represente o protocolo completo e que `fromError=false` aplique contabilidade de sucesso.

**Por que uma implementação ingênua seria pior:** Responder antes de finalize permite caller encerrar enquanto cleanup falha; usar request.mangaTabId poderia redirecionar finalização.

**Evidência:** ✅ o teste focal prova que sucesso chama `finalizeJob(17,33,false)` e retorna `{staged:true,persisted:true,committed:true}`. A **ordem** `await deliverResultToManga(...)` → cleanup/sync → `await finalizeJob(...)` é prova direta da leitura do source; o teste focal não possui assertion explícita de invocation order. `process-finalize-real.test.js` prova somente o lifecycle interno de `finalizeJob`. ⚠️ Rejeição de finalizeJob e fallback mangaTabId não têm testes focais.

### U11 — linhas/posição 104–104: Newline final

**O que faz:** Documenta a posição editorial do newline terminal.

**Como faz:** É contada separadamente das 103 linhas textuais.

**Por que desta forma:** Mantém equivalência física exigida pela auditoria.

**Por que uma implementação ingênua seria pior:** Ignorar o newline produziria falso 100% documental.

**Evidência:** 🟦 GATE DOCUMENTAL.

## 13. Revisão final

- [x] SHA/fonte integral reconfirmados;
- [x] 103 linhas + newline = 104/104 posições;
- [x] 11 unidades estruturais sem gaps;
- [x] comentários genéricos da versão anterior eliminados;
- [x] evidência da action/helper/lifecycle/consumidor separada;
- [x] mismatches sem teste mantidos como lacunas, não como prova verde;
- [x] risco de remoção best-effort e validação superficial de Data URL registrado;
- [x] nenhum código funcional alterado.

**Veredito documental:** aprovada para `59543c1359669ced02a1d05c251b272abaad6709`.

> **Correção pós-REAUDIT:** alias, loader e consumer estão separados por responsabilidade; a ordem staging→finalize é tratada como fato do source atual, não como propriedade automatizada por `process-finalize-real.test.js`.

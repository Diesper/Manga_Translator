# Bíblia técnica — `extension/background/actions/deliver-result.js`

> **Estado:** ✅ CRIADO, REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `3653bd10c2a0e65c14eb139f906feeafb30411a5`  
> **Tipo:** action assíncrona — fase de staging durável do resultado Gemini.  
> **Linhas textuais:** **87**.  
> **Posições documentais:** **88** incluindo newline final.  
> **Teste direto principal:** `tests/unit/background/deliver-result-action.test.js` — `654194bf502f3a2c4c21feae64e256bb0ecc49eb`.

## 1. Papel arquitetural

`deliver-result.js` recebe a imagem extraída diretamente do Gemini e executa **somente a fase de staging durável no leitor**. Ele não finaliza o job. Depois de receber `{staged:true,persisted:true}`, o `job-runner.js` envia `GEMINI_RESULT_COMMIT`, que é tratado por `commit-result.js`.

Essa separação é essencial para que o commit possa ser repetido sem reenviar a imagem se a resposta final do background se perder.

## 2. Fluxo

1. Valida src e jobId.
2. Reidrata o background.
3. Confirma ownership pelo sender real.
4. Compara batch/index/mangaTabId com o job persistido.
5. Faz staging via `deliverResultToManga(... finalizeOnAck:false)`.
6. Em ACK/persistência falha, responde erro.
7. Em sucesso, loga staging durável e responde staged/persisted.
8. A finalização fica para `GEMINI_RESULT_COMMIT`.

## 3. Segurança e autoridade

`allowedSources:['any']` não autoriza o resultado. A barreira real é `assertJobOwnership(context.sender,jobId)` mais a comparação de **três dimensões** de identidade: batchId, index e mangaTabId.

A suíte direta prova separadamente os três mismatches e impede a chamada a `deliverResultToManga` em todos eles.

`src`, porém, só precisa ser string não vazia. A action não exige `data:image/`, MIME conhecido nem limite de tamanho. O consumer normal produz Data URL validado, mas isso é contrato do produtor, não validação desta fronteira.

## 4. Protocolo stage → commit

`jobs-dom-ack.js` com `finalizeOnAck:false` envia `UPDATE_IMAGE`, grava `state:'dom_applied'` e `resultPersisted:true` quando o ACK é aceito e não chama finalize.

`job-runner.js::stageAndCommitResult` exige resposta staged, depois cria `GEMINI_RESULT_COMMIT`. RUN-13 prova que staging falho **nunca envia commit**; RUN-14 prova que commit pode repetir três vezes **sem reenviar `GEMINI_IMAGE_EXTRACTED`**.

## 5. Independência de currentBatchId

A action não usa `state.currentBatchId` para invalidar o resultado. Um job persistido/owned de lote anterior continua válido enquanto sua própria identidade for consistente. Isso é explicitamente testado.

## 6. Matriz de evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `deliver-result-action.test.js` | ✅ PROVADO DIRETAMENTE | Validação mínima, ensureInitialized, ownership negativo, independência de currentBatchId, mismatches de batch/index/mangaTabId, argumentos de staging e falhas `ok:false`/`persisted:false`/null. |
| `jobs-dom-ack-staging.test.js` — `5db47daff53026aa778944c999d7dc922f35ecad` | ✅ PROVADO DIRETAMENTE DO HELPER | `finalizeOnAck:false`, persistência do estado, ACK negativo, timeout, runtime error e ausência de finalize durante staging. |
| `job-runner.test.js` RUN-13/RUN-14 — `feae92421dd98e682caf3f970ba7ff86b8b6aa4a` | ✅ PROVA DO CONSUMIDOR | Staging falho não envia commit; commit pós-persistência retrya sem reenviar a imagem. Runtime do background é mockado nesses casos, então não prova internamente a action. |

## 7. Lacunas de teste

### Formato/tamanho de src
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para string não vazia que não seja imagem/Data URL e sem limite funcional de tamanho.

### Falhas das dependências
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `ensureInitialized()` rejeitando, `assertJobOwnership` não chamando callback/rejeitando por wrapper ou `deliverResultToManga()` rejeitando Promise.

### Fallbacks nullish
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para job sem mangaTabId/index/batchId usando os valores do request.

### Resposta parcial do helper
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `{ok:true}` sem campo `persisted`. A action aceitaria; o helper real sempre inclui `persisted`.

### Logs
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `SENDER_MISMATCH`, `RESULT_STAGE_FAILED` e `RESULT_STAGED_DURABLY`. O log de identity mismatch é diretamente assertado.

### Campos falsy nas guardas
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para batchId/mangaTabId falsy que desativam comparação; index usa `Number.isInteger` e portanto cobre zero conceitualmente, mas não há caso com zero.

## 8. Análise crítica

1. **Os três eixos de identidade têm testes diretos**, algo melhor que nas actions auxiliares anteriores.
2. **`currentBatchId` não é autoridade**, o que evita descartar jobs antigos ainda vivos.
3. **src é a principal validação fraca:** qualquer string não vazia atravessa esta action se ownership/identidade forem válidos.
4. **A action não finaliza.** Isso não é omissão; é o contrato do protocolo de duas fases.
5. **Falha de staging é fail-closed:** sem ACK/persistência, o consumer recebe erro e não entra em commit.
6. **O helper real fornece `persisted` explicitamente**, mas a guarda local aceita um objeto parcial `{ok:true}`; vale um teste contratual para evitar drift.

## 9. Invariantes

1. src ausente e jobId inválido falham antes de efeitos.
2. Ownership usa sender real, não tabId do payload.
3. Sender sem job vivo nunca chama staging.
4. Batch, index e mangaTabId divergentes devem falhar individualmente.
5. `currentBatchId` global não invalida job real.
6. Metadados persistidos do job prevalecem sobre request quando presentes.
7. Staging deve usar `ownership.tabId` como geminiTabId.
8. Staging deve usar `finalizeOnAck:false`.
9. ACK/persistência falha nunca retorna staged=true.
10. Esta action não chama finalizeJob.
11. Resposta positiva precisa indicar `staged:true,persisted:true`.
12. Commit é uma mensagem/fase separada e pode retryar sem reenviar imagem.
13. Logs não devem incluir o `src`/Base64.

## 10. Fonte integral

~~~javascript
'use strict';
// background/actions/deliver-result.js -- Valida o job e faz staging durável no leitor.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'deliver-result',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.src !== 'string' || request.src.length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'src da imagem é obrigatório' };
      }
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      return null;
    },

    async execute(request, context) {
      await context.ensureInitialized();
      const { mangaTabId, index, src, jobId, batchId } = request;

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'Resultado Gemini descartado: aba remetente não é dona de um job ativo.', {
            jobId: String(jobId || '').slice(0, 8),
            batchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'sender_mismatch' };
      }

      const job = ownership.job;
      const identityMismatch =
        (batchId && job.batchId && batchId !== job.batchId) ||
        (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) ||
        (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId);

      if (identityMismatch) {
        context.log('error', 'bg', 'RESULT_JOB_IDENTITY_MISMATCH',
          'Resultado rejeitado porque jobId/batch/index/origem não correspondem ao registro persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
            expectedIndex: job.index,
            receivedIndex: index,
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      const geminiTabId = ownership.tabId;
      const staged = await context.deliverResultToManga({
        mangaTabId: job.mangaTabId ?? mangaTabId,
        index: job.index ?? index,
        src,
        jobId,
        batchId: job.batchId ?? batchId,
        geminiTabId,
        finalizeOnAck: false,
      });

      if (!staged?.ok || staged.persisted === false) {
        context.log('error', 'bg', 'RESULT_STAGE_FAILED',
          'Resultado não recebeu confirmação de aplicação/persistência no leitor.', {
            jobId: String(jobId || '').slice(0, 8),
            batchId: String(job.batchId || batchId || '').slice(0, 8),
            reason: staged?.reason || 'unknown',
          });
        return { ok: false, reason: staged?.reason || 'stage_failed' };
      }

      context.log('success', 'bg', 'RESULT_STAGED_DURABLY',
        'Resultado aplicado e persistido antes da exclusão/finalização do Gemini.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(job.batchId || batchId || '').slice(0, 8),
          index: job.index ?? index,
        });

      return { staged: true, persisted: true };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## 11. Rastreabilidade 88/88

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode para a action. |
| 002 | U01 | // background/actions/deliver-result.js -- Valida o job e faz staging durável no leitor. | Comentário de U01: “background/actions/deliver-result.js -- Valida o job e faz staging durável no leitor.”; registra intenção sem executar. |
| 003 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho e intenção); sem efeito runtime. |
| 004 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`, fornecendo argumento, propriedade ou condição adjacente. |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a definição no MangaTranslatorRouter. |
| 006 | U02 |     name: 'deliver-result', | Define o nome canônico do alias `GEMINI_IMAGE_EXTRACTED`. |
| 007 | U02 |     meta: { allowedSources: ['any'] }, | Permite qualquer source classificada; ownership do job continua obrigatório. |
| 008 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro e validação mínima); sem efeito runtime. |
| 009 | U02 |     validate(request) { | Abre a validação pré-efeitos. |
| 010 | U02 |       if (typeof request.src !== 'string' \|\| request.src.length === 0) { | Exige src string não vazia, sem ainda validar formato de imagem. |
| 011 | U02 |         return { code: 'INVALID_PAYLOAD', message: 'src da imagem é obrigatório' }; | Retorna INVALID_PAYLOAD para src ausente/vazio. |
| 012 | U02 |       } | Fecha a estrutura sintática da unidade U02. |
| 013 | U02 |       if (typeof request.jobId !== 'string' \|\| request.jobId.trim().length === 0) { | Exige jobId string não vazio após trim. |
| 014 | U02 |         return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' }; | Retorna INVALID_PAYLOAD para jobId ausente/inválido. |
| 015 | U02 |       } | Fecha a estrutura sintática da unidade U02. |
| 016 | U02 |       return null; | Indica que o payload passou a validação local. |
| 017 | U02 |     }, | Fecha a estrutura sintática da unidade U02. |
| 018 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro e validação mínima); sem efeito runtime. |
| 019 | U03 |     async execute(request, context) { | Abre o executor assíncrono de staging. |
| 020 | U03 |       await context.ensureInitialized(); | Reidrata/reconcilia o background antes de ownership. |
| 021 | U03 |       const { mangaTabId, index, src, jobId, batchId } = request; | Extrai payload; metadados de identidade ainda serão cruzados com o job persistido. |
| 022 | U03 | ␠ [linha vazia] | Separador visual de U03 (Reidratação e ownership); sem efeito runtime. |
| 023 | U03 |       const ownership = await new Promise(resolve => { | Adapta `assertJobOwnership` callback-based para await. |
| 024 | U03 |         context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => { | Valida ownership usando sender real e jobId. |
| 025 | U03 |           resolve({ owns, tabId, job }); | Materializa ownership/tab/job para as guardas seguintes. |
| 026 | U03 |         }); | Fecha a estrutura sintática da unidade U03. |
| 027 | U03 |       }); | Fecha a estrutura sintática da unidade U03. |
| 028 | U03 | ␠ [linha vazia] | Separador visual de U03 (Reidratação e ownership); sem efeito runtime. |
| 029 | U04 |       if (!ownership.owns \|\| !ownership.job) { | Rejeita sender sem job vivo/owned. |
| 030 | U04 |         context.log('warn', 'bg', 'SENDER_MISMATCH', | Registra rejeição de ownership. |
| 031 | U04 |           'Resultado Gemini descartado: aba remetente não é dona de um job ativo.', { | Explica no log que o sender não possui job ativo. |
| 032 | U04 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId. |
| 033 | U04 |             batchId: String(batchId \|\| '').slice(0, 8), | Loga somente prefixo do batch recebido. |
| 034 | U04 |           }); | Fecha a estrutura sintática da unidade U04. |
| 035 | U04 |         return { ok: false, reason: 'sender_mismatch' }; | Retorna falha sem chamar o delivery. |
| 036 | U04 |       } | Fecha a estrutura sintática da unidade U04. |
| 037 | U04 | ␠ [linha vazia] | Separador visual de U04 (Rejeição de sender sem job vivo); sem efeito runtime. |
| 038 | U05 |       const job = ownership.job; | Adota o job persistido como autoridade. |
| 039 | U05 |       const identityMismatch = | Inicia as três comparações request↔job. |
| 040 | U05 |         (batchId && job.batchId && batchId !== job.batchId) \|\| | Compara batchId quando ambos possuem valor. |
| 041 | U05 |         (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) \|\| | Compara index quando ambos são inteiros. |
| 042 | U05 |         (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId); | Compara mangaTabId quando ambos são truthy. |
| 043 | U05 | ␠ [linha vazia] | Separador visual de U05 (Validação completa de identidade); sem efeito runtime. |
| 044 | U05 |       if (identityMismatch) { | Rejeita quando qualquer dimensão diverge. |
| 045 | U05 |         context.log('error', 'bg', 'RESULT_JOB_IDENTITY_MISMATCH', | Registra mismatch de identidade. |
| 046 | U05 |           'Resultado rejeitado porque jobId/batch/index/origem não correspondem ao registro persistido.', { | Explica as dimensões protegidas pela guarda. |
| 047 | U05 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId. |
| 048 | U05 |             expectedBatchId: String(job.batchId \|\| '').slice(0, 8), | Loga prefixo do batch persistido esperado. |
| 049 | U05 |             receivedBatchId: String(batchId \|\| '').slice(0, 8), | Loga prefixo do batch recebido. |
| 050 | U05 |             expectedIndex: job.index, | Loga index persistido esperado. |
| 051 | U05 |             receivedIndex: index, | Loga index recebido. |
| 052 | U05 |           }); | Fecha a estrutura sintática da unidade U05. |
| 053 | U05 |         return { ok: false, reason: 'job_identity_mismatch' }; | Retorna falha antes do staging. |
| 054 | U05 |       } | Fecha a estrutura sintática da unidade U05. |
| 055 | U05 | ␠ [linha vazia] | Separador visual de U05 (Validação completa de identidade); sem efeito runtime. |
| 056 | U06 |       const geminiTabId = ownership.tabId; | Adota o tabId confirmado por ownership para atualizar estado do job. |
| 057 | U06 |       const staged = await context.deliverResultToManga({ | Inicia staging durável e aguarda o helper de DOM ACK. |
| 058 | U06 |         mangaTabId: job.mangaTabId ?? mangaTabId, | Prefere mangaTabId persistido; request é fallback nullish. |
| 059 | U06 |         index: job.index ?? index, | Prefere index persistido; request é fallback nullish. |
| 060 | U06 |         src, | Entrega o src validado como string pelo validator. |
| 061 | U06 |         jobId, | Propaga o jobId já validado/owned. |
| 062 | U06 |         batchId: job.batchId ?? batchId, | Prefere batchId persistido; request é fallback nullish. |
| 063 | U06 |         geminiTabId, | Propaga o tabId confirmado por ownership. |
| 064 | U06 |         finalizeOnAck: false, | Mantém staging e commit como fases separadas. |
| 065 | U06 |       }); | Fecha a estrutura sintática da unidade U06. |
| 066 | U06 | ␠ [linha vazia] | Separador visual de U06 (Staging durável via DOM ACK); sem efeito runtime. |
| 067 | U07 |       if (!staged?.ok \|\| staged.persisted === false) { | Rejeita ACK sem ok truthy ou persistência explicitamente falsa. |
| 068 | U07 |         context.log('error', 'bg', 'RESULT_STAGE_FAILED', | Registra falha de staging. |
| 069 | U07 |           'Resultado não recebeu confirmação de aplicação/persistência no leitor.', { | Explica que o leitor não confirmou aplicação/persistência. |
| 070 | U07 |             jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId. |
| 071 | U07 |             batchId: String(job.batchId \|\| batchId \|\| '').slice(0, 8), | Loga prefixo do batch persistido/fallback. |
| 072 | U07 |             reason: staged?.reason \|\| 'unknown', | Propaga razão do helper, com fallback `unknown`/`stage_failed`. |
| 073 | U07 |           }); | Fecha a estrutura sintática da unidade U07. |
| 074 | U07 |         return { ok: false, reason: staged?.reason \|\| 'stage_failed' }; | Propaga razão do helper, com fallback `unknown`/`stage_failed`. |
| 075 | U07 |       } | Fecha a estrutura sintática da unidade U07. |
| 076 | U07 | ␠ [linha vazia] | Separador visual de U07 (Falha de staging/persistência); sem efeito runtime. |
| 077 | U08 |       context.log('success', 'bg', 'RESULT_STAGED_DURABLY', | Registra sucesso de staging antes de qualquer finalização. |
| 078 | U08 |         'Resultado aplicado e persistido antes da exclusão/finalização do Gemini.', { | Descreve a garantia alcançada sem afirmar finalização do Gemini. |
| 079 | U08 |           jobId: String(jobId \|\| '').slice(0, 8), | Loga somente prefixo do jobId. |
| 080 | U08 |           batchId: String(job.batchId \|\| batchId \|\| '').slice(0, 8), | Loga prefixo do batch persistido/fallback. |
| 081 | U08 |           index: job.index ?? index, | Prefere index persistido; request é fallback nullish. |
| 082 | U08 |         }); | Fecha a estrutura sintática da unidade U08. |
| 083 | U08 | ␠ [linha vazia] | Separador visual de U08 (Telemetria de staging e resposta); sem efeito runtime. |
| 084 | U08 |       return { staged: true, persisted: true }; | Retorna ao consumer o sinal para iniciar a fase de commit. |
| 085 | U09 |     }, | Fecha a estrutura sintática da unidade U09. |
| 086 | U09 |   }); | Fecha a estrutura sintática da unidade U09. |
| 087 | U09 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE usando self no worker e globalThis no harness. |
| 088 | U10 | ⏎ [newline final] | Preserva o newline terminal; posição editorial sem efeito runtime. |

## 12. Análise por unidade

### U01 — linhas/posição 1–3: Cabeçalho e intenção

**O que faz:** Ativa strict mode e declara o objetivo: validar o job e fazer staging durável do resultado no leitor.

**Como faz:** Diretiva e comentário antecedem a IIFE.

**Por que desta forma:** A action é a primeira fase de um protocolo em duas fases; sua responsabilidade termina no staging.

**Por que uma implementação ingênua seria pior:** Misturar staging e finalização faria retries de commit reenviar a imagem e aumentaria risco de perda/duplicidade.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento da action real.

### U02 — linhas/posição 4–18: Registro e validação mínima

**O que faz:** Registra `deliver-result`, aceita qualquer source classificada pelo router e exige `src` string não vazia + jobId string não vazia.

**Como faz:** `validate()` roda antes do executor; não valida esquema/MIME/tamanho de `src`.

**Por que desta forma:** Bloqueia payload ausente e deixa ownership/identidade para o executor.

**Por que uma implementação ingênua seria pior:** Sem jobId não existe ownership; sem src não existe resultado a entregar. Por outro lado, validação permissiva de src depende do produtor correto.

**Evidência:** ✅ PROVADO DIRETAMENTE — testes rejeitam src ausente e jobId ausente. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para src não vazio porém inválido/não-imagem e sem limite de tamanho.

### U03 — linhas/posição 19–28: Reidratação e ownership

**O que faz:** Reidrata o background, extrai o request e exige ownership do job pelo sender real.

**Como faz:** `ensureInitialized()` é awaited; `assertJobOwnership(context.sender,jobId,...)` é convertido para Promise.

**Por que desta forma:** MV3 pode acordar sem memória; ownership precisa usar estado reconciliado e sender fornecido pelo runtime.

**Por que uma implementação ingênua seria pior:** Confiar em geminiTabId/jobId do payload permitiria outra aba entregar resultado para job alheio.

**Evidência:** ✅ PROVADO DIRETAMENTE — sucesso verifica `ensureInitialized` uma vez; sender sem ownership retorna `sender_mismatch` e não chama delivery. ⚠️ Rejeição de ensureInitialized/ownership helper não tem teste focal.

### U04 — linhas/posição 29–37: Rejeição de sender sem job vivo

**O que faz:** Recusa a entrega quando ownership é falso ou o job não existe.

**Como faz:** Loga `SENDER_MISMATCH` com prefixos de job/batch e retorna `sender_mismatch`.

**Por que desta forma:** Impede resultado de aba errada ou job já encerrado.

**Por que uma implementação ingênua seria pior:** Fazer staging antes dessa guarda permitiria sobrescrever página de outro job.

**Evidência:** ✅ PROVADO DIRETAMENTE — `não entrega job de outro remetente` exige zero `deliverResultToManga`.

### U05 — linhas/posição 38–55: Validação completa de identidade

**O que faz:** Compara batchId, index e mangaTabId do request contra o job persistido; qualquer divergência aplicável bloqueia staging.

**Como faz:** `identityMismatch` agrega três guardas; o log inclui batch e index esperados/recebidos.

**Por que desta forma:** Ownership por jobId não deve permitir payload stale/forjado alterar lote, posição ou aba do leitor.

**Por que uma implementação ingênua seria pior:** Validar apenas batch ou apenas jobId deixaria outras dimensões de identidade manipuláveis.

**Evidência:** ✅ PROVADO DIRETAMENTE — `test.each` cobre **batch**, **index** e **mangaTabId** separadamente, exige `job_identity_mismatch`, zero delivery e log `RESULT_JOB_IDENTITY_MISMATCH`.

### U06 — linhas/posição 56–66: Staging durável via DOM ACK

**O que faz:** Entrega o resultado ao leitor usando metadados persistidos do job e `finalizeOnAck:false`.

**Como faz:** `deliverResultToManga` recebe mangaTabId/index/batch do job com fallback ao request, src, jobId, ownership.tabId e modo staging.

**Por que desta forma:** O helper deve confirmar aplicação/persistência sem finalizar; a fase de commit acontece em mensagem separada.

**Por que uma implementação ingênua seria pior:** `finalizeOnAck:true` eliminaria a janela de retry seguro do commit e acoplaria envio da imagem à contabilidade final.

**Evidência:** ✅ PROVADO DIRETAMENTE — sucesso verifica argumentos e `finalizeOnAck:false`. ✅ `jobs-dom-ack-staging.test.js` prova que esse modo grava `dom_applied/resultPersisted` e não chama finalize. ⚠️ Fallbacks nullish não têm testes focais.

### U07 — linhas/posição 67–76: Falha de staging/persistência

**O que faz:** Transforma ACK ausente/negativo ou persistência explicitamente falsa em erro sem marcar staging concluído.

**Como faz:** Guarda `!staged?.ok || staged.persisted === false`; loga `RESULT_STAGE_FAILED` e propaga `reason` com fallback.

**Por que desta forma:** O consumidor não pode avançar ao commit se o leitor não confirmou o resultado.

**Por que uma implementação ingênua seria pior:** Aceitar ACK falho poderia finalizar/excluir Gemini sem resultado persistido no leitor.

**Evidência:** ✅ PROVADO DIRETAMENTE — suíte cobre `{ok:false}`, `{ok:true,persisted:false}` e `null`. ⚠️ `{ok:true}` sem campo `persisted` é aceito localmente e não tem teste; o helper real sempre retorna `persisted`.

### U08 — linhas/posição 77–84: Telemetria de staging e resposta

**O que faz:** Loga `RESULT_STAGED_DURABLY` e retorna `{staged:true,persisted:true}` sem finalizar o job.

**Como faz:** Metadata usa prefixos de job/batch e index persistido/fallback; a resposta é o sinal para o consumer iniciar `GEMINI_RESULT_COMMIT`.

**Por que desta forma:** Separa explicitamente “imagem persistida” de “job finalizado”.

**Por que uma implementação ingênua seria pior:** Retornar committed aqui confundiria o protocolo; logar src/Base64 aumentaria exposição e volume.

**Evidência:** ✅ PROVADO DIRETAMENTE para a resposta. 🟨 O log de sucesso não tem assertion focal. ✅ RUN-13/RUN-14 do consumer provam que commit só vem depois de staging e pode retryar sem reenviar imagem.

### U09 — linhas/posição 85–87: Fechamento da action

**O que faz:** Fecha executor, registro e IIFE usando self/globalThis.

**Como faz:** Delimitadores encerram as estruturas globais clássicas.

**Por que desta forma:** Mantém compatibilidade com o service worker e o harness Jest atual.

**Por que uma implementação ingênua seria pior:** Migração parcial para módulos quebraria o bootstrap sem ajustar importScripts/require.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento da action real.

### U10 — linhas/posição 88–88: Newline final

**O que faz:** Documenta o newline terminal do blob.

**Como faz:** Posição editorial separada das 87 linhas textuais.

**Por que desta forma:** Mantém equivalência física exigida pela auditoria.

**Por que uma implementação ingênua seria pior:** Ignorar a posição produziria falso 100% documental.

**Evidência:** 🟦 GATE DOCUMENTAL.

## 13. Auditoria final

- [x] SHA do fonte conferido;
- [x] fonte integral incorporada;
- [x] 87 linhas + newline = 88/88 posições;
- [x] 10 unidades específicas sem gaps;
- [x] assertions dos três mismatches lidas diretamente;
- [x] helper DOM ACK e consumer stage→commit diferenciados;
- [x] lacunas de src/dependências/fallbacks explicitadas;
- [x] nenhuma afirmação de cobertura automatizada total;
- [x] nenhum código funcional alterado.

**Veredito documental:** ✅ APROVADO para `3653bd10c2a0e65c14eb139f906feeafb30411a5`.

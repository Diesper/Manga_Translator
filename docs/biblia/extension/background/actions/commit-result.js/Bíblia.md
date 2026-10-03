# Bíblia técnica — `extension/background/actions/commit-result.js`

> **Estado documental:** correção validada; decisão distribuída final pendente  
> **SHA auditado:** `32270d1c4ade42b7e6decd5ef124d71745c2a5b0`  
> **Tipo:** action assíncrona — fase de commit após staging/persistência  
> **Linhas textuais:** **106**  
> **Posições documentais:** **107**, contando o LF final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`commit-result` finaliza/libera um job somente depois de existir evidência de aplicação/persistência. O protocolo separa staging de commit: a entrega pode ter acontecido antes; esta action confirma ownership, valida identidade/batch e então avança o lifecycle.

Se a finalização já ocorreu e apenas a resposta IPC se perdeu, um marker durável `gemini_finalized_<tabId>` pode reconhecer o retry sem repetir a finalização.

## 2. Validação e inicialização

`validate()` exige `jobId` string não-vazia após `trim()`. O router executa essa validação antes de `execute()`.

`execute()` começa com `await context.ensureInitialized()`. A regressão focal prova causalmente que uma rejeição nessa etapa impede a consulta de ownership.

## 3. Ownership e adaptação callback→Promise

A action adapta `context.assertJobOwnership(sender, jobId, callback)` para uma Promise e só continua quando o callback entrega `{ owns, tabId, job }`.

Na produção, `background.js` implementa essa fachada chamando o callback tanto no `.then` quanto no `.catch` de `jobsLifecycle.assertJobOwnership`. Não existe SLA/timeout local definido para essa dependência; esta Bíblia não afirma latência bounded que o source não implementa.

## 4. Retry idempotente pelo journal

Quando ownership falha ou o job vivo já sumiu, a action tenta `gemini_finalized_<ownership.tabId ?? senderTabId>` se `storage.get` estiver disponível.

Um marker só autoriza `alreadyCommitted:true` quando:

- `expiresAt > Date.now()`;
- `marker.jobId === request.jobId`;
- `marker.fromError === false`.

O self-test atual cobre marker válido, expirado, `fromError:true`, `jobId` divergente, ausência de storage e `storage.get` rejeitando. Lookup failure é fail-closed: gera `RESULT_COMMIT_JOURNAL_LOOKUP_FAILED` e termina em `job_not_live`.

## 5. Batch e gate de persistência

Com job vivo, `batchId` explicitamente divergente é rejeitado. Batch omitido não cria mismatch artificial.

O gate é deliberadamente **OR-semântico**. A condição de rejeição é:

`job.resultPersisted !== true && job.state !== 'dom_applied'`.

Logo o commit é aceito quando **qualquer** um dos sinais positivos existe. O self-test prova as combinações assimétricas que antes faltavam:

- `resultPersisted:true` + state antigo → aceita;
- `resultPersisted:false` + `state:'dom_applied'` → aceita;
- `resultPersisted:undefined` + `state:'dom_applied'` → aceita;
- ambos negativos → rejeita sem update/finalize.

## 6. Ordering e await

O `geminiTabId` efetivo segue `ownership.tabId ?? senderTabId ?? job.geminiTabId`.

`updateJobState(geminiTabId,{state:'result_committed',...})` é **awaited antes** de `finalizeJob(...)`. Depois, `finalizeJob` também é awaited antes de retornar `{ committed:true }`.

O self-test atual usa duas Promises controladas e prova causalmente:

1. `finalizeJob` não inicia enquanto `updateJobState` está pendente;
2. após liberar update, finalize inicia;
3. a resposta continua pendente enquanto finalize está pendente;
4. somente depois de finalize resolver a action retorna sucesso.

Isso corrige a overclassification apontada pela auditoria adversarial: ordering/await agora são prova causal, não apenas duas chamadas observadas.

## 7. Falhas parciais e recuperação

- `ensureInitialized` rejeitando → ownership não é consultado;
- `updateJobState` rejeitando → `finalizeJob` não é chamado;
- `finalizeJob` rejeitando → a rejeição propaga **depois** de `result_committed` poder ter sido persistido.

Esse terceiro caso é um estado intermediário real, não escondido pela documentação. O lifecycle/recovery externo reconhece estados persistidos e retries podem reexecutar o commit; esta action não oferece transação atômica entre storage e finalização.

## 8. Fallbacks de IDs

O self-test prova a ordem do `geminiTabId`: ownership → sender → job. Também prova que `job.mangaTabId` persistido prevalece sobre `request.mangaTabId`, usando o request apenas quando o valor persistido é nullish.

`finalizeJob` sempre recebe `fromError=false` neste caminho.

## 9. Evidência executável

Self-test: `docs/biblia/.coordination/commit-result-selftest.js` — SHA `5f979bfb77a8641112408a80513cbc7b332d5727`.
Workflow: `.github/workflows/commit-result-selftest.yml` — SHA `7262c6e4b54d7602b28780d62d36a40764b6469b`.

A run `36943806115`, job `110641150397`, executou exatamente os blobs atuais:

- self-test causal: **PASS**;
- projeto Jest `background`: **45/45 suites, 225/225 testes**;
- `--runInBand --detectOpenHandles` habilitado;
- workflow: **success**.

## 10. Audit requests históricas

### 006-001 — RESOLVED

A matriz assimétrica de persistência e os journals negativo/expirado/fromError/jobId divergente/lookup failure agora possuem prova focal direta.

### 006-002 — RESOLVED

`ensureInitialized`, `updateJobState` e `finalizeJob` rejeitando possuem casos focais; ordering/await e fallbacks de `geminiTabId`/`mangaTabId` também estão cobertos.

## 11. Findings PRIMARY + ADVERSARIAL da revisão anterior

Os auditores independentes apontaram:

1. descrições stale nas posições 092/098 após remapeamento U08/U09;
2. status stale `REAUDITADO/APROVÁVEL` para um `BIBLE_SHA` ainda não auditado;
3. ordering/await classificados como prova direta sem assertions causais.

Esta revisão elimina a tabela remapeada conflitante, usa faixas semânticas contíguas e ancora ordering/await no self-test controlado. Ela não declara `DONE`, `COMPLETED`, `aprovada` ou `100/100`; exige nova PRIMARY + ADVERSARIAL independente.

## 12. Limites honestos

- Não há transação atômica entre `updateJobState` e `finalizeJob`; falha tardia pode deixar `result_committed` persistido antes do retry/recovery.
- `assertJobOwnership` é callback-based e não possui deadline local nesta action; a fachada de produção chama o callback em resolve/reject, mas a Bíblia não inventa timeout inexistente.
- `allowedSources:['any']` não é autorização; ownership do job continua sendo a barreira real.
- O journal só é consultado quando o job não está owned/live; ele não substitui o gate normal de persistência.

## 13. Fonte integral exata

```javascript
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
```

## 14. Cobertura integral por posições

- **1–8:** strict mode, identidade, IIFE, registro e metadata.
- **9–15:** validação de `jobId`.
- **16–27:** inicialização, sender e adaptação de ownership callback→Promise.
- **28–64:** caminho sem ownership, journal idempotente, lookup failure e rejeição `job_not_live`.
- **65–75:** job vivo e validação de batch.
- **76–84:** gate OR-semântico de persistência.
- **85–90:** resolução do geminiTabId e transição awaited para `result_committed`.
- **91–96:** observabilidade `RESULT_COMMIT_ACCEPTED`.
- **97–105:** `finalizeJob` awaited, fallbacks de mangaTabId e retorno.
- **106:** fechamento da IIFE com `self` se definido, senão `globalThis`.
- **107:** posição vazia correspondente ao LF final.

**Cobertura: 107/107 posições, sem gap ou overlap.**

## 15. Autoauditoria documental

- Source SHA: `32270d1c4ade42b7e6decd5ef124d71745c2a5b0`.
- Fonte integral inserida diretamente do blob atual.
- As referências stale U07/U08/U09 foram removidas em favor de fronteiras semânticas atuais.
- Ordering/await possuem prova causal no self-test da revisão.
- Requests 006-001/002 foram corrigidas e validadas pela run `36943806115`.
- A decisão distribuída permanece pendente até nova PRIMARY + ADVERSARIAL independentes.

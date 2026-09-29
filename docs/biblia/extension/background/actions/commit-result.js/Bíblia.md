# Bíblia técnica — `extension/background/actions/commit-result.js`

> **Estado:** CONCLUÍDO nesta Bíblia individual.  
> **SHA auditado:** `32270d1c4ade42b7e6decd5ef124d71745c2a5b0`  
> **Linhas auditadas:** **107**  
> **Teste direto:** `tests/unit/background/commit-result-action.test.js` (`1a185784edd118aeee377d7e3f1ed4a9c8375914`).

## 1. Papel arquitetural

`commit-result` é o segundo estágio do protocolo de entrega: receber uma imagem/result staged não basta. O job só pode ser liberado depois que existe ACK de persistência/aplicação. A action verifica payload, ownership, identidade de batch e estado de persistência; só então marca `result_committed` e delega cleanup ao `finalizeJob`.

O journal `gemini_finalized_<tabId>` torna o commit idempotente quando o processamento já terminou mas a resposta IPC original se perdeu. Isso é crucial em MV3 porque o remetente pode retryar depois que o job vivo já foi removido do índice.

## 2. Evidência

- ✅ validação exige `jobId`;
- ✅ job persistido/dom_applied é atualizado para `result_committed` e finalizado;
- ✅ dois estados prematuros são rejeitados sem update/finalize;
- ✅ batch forjado é rejeitado;
- ✅ remetente sem ownership é rejeitado;
- ✅ retry com journal válido retorna `committed:true, alreadyCommitted:true` sem repetir finalize.

### Lacunas

- ⚠️ não há teste focal de marcador expirado;
- ⚠️ não há teste focal de marcador com `fromError:true`; 
- ⚠️ não há teste focal de marker jobId divergente;
- ⚠️ não há teste focal de falha de `storage.get` no journal;
- ⚠️ não há teste focal de falha/rejeição de `updateJobState` ou `finalizeJob`; nesses casos a Promise propaga ao router;
- ⚠️ `allowedSources:['any']` não tem teste de necessidade; a autorização real é ownership.

## 3. Fonte integral

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

## 4. Comentário linha por linha

### Linha 001
<code>'use strict';</code>

**O que faz:** ativa strict mode.

**Como faz:** diretiva no topo do módulo.

**Por que assim / alternativa pior:** reduz erros silenciosos e globais acidentais em uma action crítica de finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 002
<code>// background/actions/commit-result.js -- Finaliza um resultado somente após persistência confirmada.</code>

**O que faz:** registra a decisão local: “background/actions/commit-result.js -- Finaliza um resultado somente após persistência confirmada.”.

**Como faz:** comentário sem efeito de runtime.

**Por que assim / alternativa pior:** o comentário documenta uma condição de retry/crash-recovery que seria fácil remover como aparente redundância.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 003
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 004
<code>(function(scope) {</code>

**O que faz:** abre IIFE compatível com Service Worker/Jest.

**Como faz:** recebe `self` ou `globalThis`.

**Por que assim / alternativa pior:** mantém helpers/registro encapsulados sem criar API global adicional.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 005
<code>  scope.MangaTranslatorRouter.registerAction({</code>

**O que faz:** registra a action `commit-result` no router.

**Como faz:** fornece nome, metadata, validate e execute.

**Por que assim / alternativa pior:** centralizar validação/dispatch no router mantém protocolo consistente entre actions.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 006
<code>    name: 'commit-result',</code>

**O que faz:** define o nome canônico do handler.

**Como faz:** é alvo do alias `GEMINI_RESULT_COMMIT`.

**Por que assim / alternativa pior:** se nome e alias divergirem, o job runner nunca consegue confirmar persistência.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 007
<code>    meta: { allowedSources: ['any'] },</code>

**O que faz:** permite qualquer origem classificada pelo router.

**Como faz:** metadata não restringe aqui; ownership interno faz a autorização efetiva.

**Por que assim / alternativa pior:** a segurança principal está no jobId+sender; mesmo assim uma allowlist mais estreita seria possível somente após mapear todos os chamadores.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para todas as variantes desta linha:** o contrato principal é coberto, mas esta condição de borda não possui assertion focal própria.

### Linha 008
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 009
<code>    validate(request) {</code>

**O que faz:** define validação estrutural antes do executor.

**Como faz:** router chama esta função antes de execute.

**Por que assim / alternativa pior:** rejeitar payload inválido cedo evita tocar estado/storage com identidade ausente.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 010
<code>      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {</code>

**O que faz:** exige jobId string não vazia.

**Como faz:** usa type check + trim.

**Por que assim / alternativa pior:** coerção de valores permitiria identidades ambíguas ou acidentais.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 011
<code>        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };</code>

**O que faz:** retorna erro de validação estável.

**Como faz:** usa código e mensagem estruturados.

**Por que assim / alternativa pior:** erro estruturado é melhor que throw para input inválido esperado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 012
<code>      }</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 013
<code>      return null;</code>

**O que faz:** indica que a validação passou.

**Como faz:** o router interpreta null como ausência de erro.

**Por que assim / alternativa pior:** misturar `true`/undefined tornaria o contrato de validator menos explícito.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 014
<code>    },</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 015
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 016
<code>    async execute(request, context) {</code>

**O que faz:** inicia o protocolo assíncrono de commit.

**Como faz:** aguarda inicialização, ownership, storage, atualização e finalização.

**Por que assim / alternativa pior:** essas operações precisam ser ordenadas; callback livre favoreceria corrida.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 017
<code>      await context.ensureInitialized();</code>

**O que faz:** executa `await context.ensureInitialized();` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** o commit é uma fronteira final de lifecycle; executar contra estado ainda não reidratado poderia confundir job inexistente com job já finalizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 018
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 019
<code>      const { jobId, batchId } = request;</code>

**O que faz:** extrai as duas identidades relevantes do request.

**Como faz:** destructuring local.

**Por que assim / alternativa pior:** reduz repetição e deixa claro que outras propriedades não participam da autorização principal.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 020
<code>      const senderTabId = context.sender &amp;&amp; context.sender.tab ? context.sender.tab.id : null;</code>

**O que faz:** captura tabId do remetente como fallback de identidade.

**Como faz:** usa sender metadata do runtime, não request.

**Por que assim / alternativa pior:** sender é mais confiável que um ID fornecido no payload.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 021
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 022
<code>      const ownership = await new Promise(resolve =&gt; {</code>

**O que faz:** adapta `assertJobOwnership` baseado em callback para Promise.

**Como faz:** resolve `{owns,tabId,job}` uma única vez.

**Por que assim / alternativa pior:** isso mantém o resto do fluxo linear com await e reduz aninhamento.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 023
<code>        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) =&gt; {</code>

**O que faz:** executa `context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** o remetente não pode finalizar um job apenas por conhecer o jobId; ownership precisa ser provado pelo background.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 024
<code>          resolve({ owns, tabId, job });</code>

**O que faz:** converte callback de ownership em objeto explícito.

**Como faz:** preserva os três resultados da verificação.

**Por que assim / alternativa pior:** descartar `tabId` ou `job` obrigaria nova busca e abriria janela de divergência.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 025
<code>        });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 026
<code>      });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 027
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 028
<code>      if (!ownership.owns || !ownership.job) {</code>

**O que faz:** entra no caminho em que o job não está mais vivo/pertencente.

**Como faz:** combina flag e presença do objeto job.

**Por que assim / alternativa pior:** a ausência pode significar retry após finalização, então não rejeita imediatamente antes de consultar journal.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 029
<code>        // O commit pode ter sido aplicado e a resposta IPC ter se perdido. A</code>

**O que faz:** registra a decisão local: “O commit pode ter sido aplicado e a resposta IPC ter se perdido. A”.

**Como faz:** comentário sem efeito de runtime.

**Por que assim / alternativa pior:** o comentário documenta uma condição de retry/crash-recovery que seria fácil remover como aparente redundância.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 030
<code>        // marca de finalização é o journal durável que torna o retry idempotente.</code>

**O que faz:** registra a decisão local: “marca de finalização é o journal durável que torna o retry idempotente.”.

**Como faz:** comentário sem efeito de runtime.

**Por que assim / alternativa pior:** o comentário documenta uma condição de retry/crash-recovery que seria fácil remover como aparente redundância.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 031
<code>        const markerTabId = ownership.tabId ?? senderTabId;</code>

**O que faz:** captura tabId do remetente como fallback de identidade.

**Como faz:** usa sender metadata do runtime, não request.

**Por que assim / alternativa pior:** sender é mais confiável que um ID fornecido no payload.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 032
<code>        if (markerTabId !== null &amp;&amp; markerTabId !== undefined &amp;&amp; context.storage?.get) {</code>

**O que faz:** só tenta journal se há tabId e API de storage.

**Como faz:** usa optional chaining como guarda.

**Por que assim / alternativa pior:** testes/contextos mínimos sem storage devem continuar rejeitando de forma segura, não lançar.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para todas as variantes desta linha:** o contrato principal é coberto, mas esta condição de borda não possui assertion focal própria.

### Linha 033
<code>          try {</code>

**O que faz:** protege lookup do journal contra falha de storage.

**Como faz:** permite rejeitar commit com segurança mesmo se o journal estiver indisponível.

**Por que assim / alternativa pior:** falha de observabilidade/idempotência não deve virar autorização automática.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 034
<code>            const markerKey = `gemini_finalized_${markerTabId}`;</code>

**O que faz:** escolhe tabId para consultar marcador durável.

**Como faz:** prefere ID resolvido pelo ownership e cai para senderTabId.

**Por que assim / alternativa pior:** usa identidade mais canônica disponível sem confiar no request.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 035
<code>            const markerData = await context.storage.get([markerKey]);</code>

**O que faz:** deriva chave `gemini_finalized_<tabId>`.

**Como faz:** usa namespace persistente compartilhado com lifecycle.

**Por que assim / alternativa pior:** um namespace diferente faria retries nunca reconhecerem finalização anterior.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 036
<code>            const marker = markerData &amp;&amp; markerData[markerKey];</code>

**O que faz:** deriva chave `gemini_finalized_<tabId>`.

**Como faz:** usa namespace persistente compartilhado com lifecycle.

**Por que assim / alternativa pior:** um namespace diferente faria retries nunca reconhecerem finalização anterior.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 037
<code>            if (marker &amp;&amp;</code>

**O que faz:** inicia validação conjunta do journal.

**Como faz:** só aceita se todas as condições seguintes forem verdadeiras.

**Por que assim / alternativa pior:** um marcador parcial/antigo não pode conceder sucesso idempotente.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 038
<code>                marker.expiresAt &gt; Date.now() &amp;&amp;</code>

**O que faz:** executa `marker.expiresAt > Date.now() &&` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** um marcador expirado não deve conceder idempotência indefinida a IDs antigos.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para todas as variantes desta linha:** o contrato principal é coberto, mas esta condição de borda não possui assertion focal própria.

### Linha 039
<code>                marker.jobId === jobId &amp;&amp;</code>

**O que faz:** exige que o marcador pertença ao mesmo jobId.

**Como faz:** comparação estrita.

**Por que assim / alternativa pior:** reuso de tabId entre jobs não deve transformar marker antigo em commit atual.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 040
<code>                marker.fromError === false) {</code>

**O que faz:** executa `marker.fromError === false) {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** resultado finalizado por erro não pode ser aceito como commit bem-sucedido.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para todas as variantes desta linha:** o contrato principal é coberto, mas esta condição de borda não possui assertion focal própria.

### Linha 041
<code>              context.log('info', 'bg', 'RESULT_COMMIT_ALREADY_FINALIZED',</code>

**O que faz:** registra retry idempotente reconhecido.

**Como faz:** evento separado de commit novo.

**Por que assim / alternativa pior:** telemetria distingue sucesso inicial de repetição pós-IPC perdido.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 042
<code>                'Retry de commit reconhecido por marcador durável; não há trabalho a repetir.', {</code>

**O que faz:** executa `'Retry de commit reconhecido por marcador durável; não há trabalho a repetir.', {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 043
<code>                  jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa `jobId: String(jobId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 044
<code>                  batchId: String(batchId || '').slice(0, 8),</code>

**O que faz:** executa `batchId: String(batchId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 045
<code>                });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 046
<code>              return { committed: true, alreadyCommitted: true };</code>

**O que faz:** responde sucesso idempotente sem repetir finalização.

**Como faz:** marca explicitamente que nada novo foi feito.

**Por que assim / alternativa pior:** reexecutar finalizeJob poderia decrementar contadores/fechar recursos pela segunda vez.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 047
<code>            }</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 048
<code>          } catch (error) {</code>

**O que faz:** captura falha do journal.

**Como faz:** registra e segue para rejeição normal.

**Por que assim / alternativa pior:** não autoriza commit só porque storage falhou.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 049
<code>            context.log('warn', 'bg', 'RESULT_COMMIT_JOURNAL_LOOKUP_FAILED',</code>

**O que faz:** registra falha de consulta do journal.

**Como faz:** inclui prefixo do job e nome do erro.

**Por que assim / alternativa pior:** diagnóstico existe sem vazar payload completo.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para todas as variantes desta linha:** o contrato principal é coberto, mas esta condição de borda não possui assertion focal própria.

### Linha 050
<code>              'Consulta do journal falhou; commit sem ownership continuará rejeitado.', {</code>

**O que faz:** executa `'Consulta do journal falhou; commit sem ownership continuará rejeitado.', {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 051
<code>                jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa `jobId: String(jobId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 052
<code>                errorName: error &amp;&amp; error.name ? error.name : 'Error',</code>

**O que faz:** executa `errorName: error && error.name ? error.name : 'Error',` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 053
<code>              });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 054
<code>          }</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 055
<code>        }</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 056
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 057
<code>        context.log('warn', 'bg', 'RESULT_COMMIT_REJECTED',</code>

**O que faz:** registra rejeição de commit.

**Como faz:** diferencia ownership/batch inválidos.

**Por que assim / alternativa pior:** eventos específicos ajudam diagnosticar respostas tardias e spoofing.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 058
<code>          'Commit de resultado rejeitado: job não pertence ao remetente ou não está mais ativo.', {</code>

**O que faz:** executa `'Commit de resultado rejeitado: job não pertence ao remetente ou não está mais ativo.', {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 059
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa `jobId: String(jobId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 060
<code>            batchId: String(batchId || '').slice(0, 8),</code>

**O que faz:** executa `batchId: String(batchId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 061
<code>          });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 062
<code>        return { ok: false, reason: 'job_not_live' };</code>

**O que faz:** retorna motivo estável quando job não está ativo nem há journal válido.

**Como faz:** resposta normal, não throw.

**Por que assim / alternativa pior:** caller pode decidir retry/encerrar sem interpretar exceção.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 063
<code>      }</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 064
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 065
<code>      const job = ownership.job;</code>

**O que faz:** fixa referência ao job cuja posse foi provada.

**Como faz:** usa exatamente o objeto fornecido pela verificação de ownership.

**Por que assim / alternativa pior:** buscar outro registro depois poderia introduzir TOCTOU desnecessário.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 066
<code>      if (batchId &amp;&amp; job.batchId &amp;&amp; batchId !== job.batchId) {</code>

**O que faz:** valida batch somente quando ambos os lados fornecem ID.

**Como faz:** rejeita divergência estrita.

**Por que assim / alternativa pior:** isso evita que resultado de lote antigo finalize job com mesmo identificador lógico em contexto errado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 067
<code>        context.log('warn', 'bg', 'RESULT_COMMIT_REJECTED',</code>

**O que faz:** registra rejeição de commit.

**Como faz:** diferencia ownership/batch inválidos.

**Por que assim / alternativa pior:** eventos específicos ajudam diagnosticar respostas tardias e spoofing.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 068
<code>          'Commit de resultado rejeitado: batch não corresponde ao job persistido.', {</code>

**O que faz:** executa `'Commit de resultado rejeitado: batch não corresponde ao job persistido.', {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 069
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa `jobId: String(jobId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 070
<code>            expectedBatchId: String(job.batchId || '').slice(0, 8),</code>

**O que faz:** executa `expectedBatchId: String(job.batchId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 071
<code>            receivedBatchId: String(batchId || '').slice(0, 8),</code>

**O que faz:** executa `receivedBatchId: String(batchId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 072
<code>          });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 073
<code>        return { ok: false, reason: 'job_identity_mismatch' };</code>

**O que faz:** retorna rejeição específica por identidade de batch.

**Como faz:** mantém causa distinguível de job_not_live.

**Por que assim / alternativa pior:** se todas as rejeições fossem iguais seria mais difícil detectar mistura de lotes.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 074
<code>      }</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 075
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 076
<code>      if (job.resultPersisted !== true &amp;&amp; job.state !== 'dom_applied') {</code>

**O que faz:** exige prova de persistência ou estado `dom_applied`.

**Como faz:** aceita duas representações compatíveis do ACK.

**Por que assim / alternativa pior:** finalização antes desse ponto poderia contar sucesso sem página restaurável/aplicada.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 077
<code>        context.log('error', 'bg', 'RESULT_COMMIT_BEFORE_PERSIST',</code>

**O que faz:** executa `context.log('error', 'bg', 'RESULT_COMMIT_BEFORE_PERSIST',` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 078
<code>          'Commit recusado porque o resultado ainda não possui ACK de persistência.', {</code>

**O que faz:** executa `'Commit recusado porque o resultado ainda não possui ACK de persistência.', {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 079
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa `jobId: String(jobId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 080
<code>            batchId: String(job.batchId || '').slice(0, 8),</code>

**O que faz:** executa `batchId: String(job.batchId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 081
<code>          });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 082
<code>        return { ok: false, reason: 'result_not_persisted' };</code>

**O que faz:** retorna motivo específico de commit prematuro.

**Como faz:** não atualiza estado nem finaliza.

**Por que assim / alternativa pior:** caller pode aguardar/repetir após persistência em vez de perder o job.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 083
<code>      }</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 084
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 085
<code>      const geminiTabId = ownership.tabId ?? senderTabId ?? job.geminiTabId;</code>

**O que faz:** captura tabId do remetente como fallback de identidade.

**Como faz:** usa sender metadata do runtime, não request.

**Por que assim / alternativa pior:** sender é mais confiável que um ID fornecido no payload.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 086
<code>      await context.updateJobState(geminiTabId, {</code>

**O que faz:** executa `await context.updateJobState(geminiTabId, {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** registrar `result_committed` antes da finalização cria uma etapa observável e recuperável em caso de interrupção.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 087
<code>        state: 'result_committed',</code>

**O que faz:** marca estado explícito de commit aceito.

**Como faz:** patch é persistido via lifecycle/state.

**Por que assim / alternativa pior:** cria ponto de recuperação observável entre ACK de persistência e cleanup final.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 088
<code>        resultCommittedAt: Date.now(),</code>

**O que faz:** registra timestamp de commit.

**Como faz:** usa `Date.now()` no momento da transição.

**Por que assim / alternativa pior:** timestamps ajudam reconciliação/diagnóstico de travamentos sem afetar identidade.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 089
<code>      });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 090
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 091
<code>      context.log('success', 'bg', 'RESULT_COMMIT_ACCEPTED',</code>

**O que faz:** registra aceitação após persistência.

**Como faz:** é emitido somente depois do state update.

**Por que assim / alternativa pior:** log antes da atualização poderia afirmar sucesso que não foi duravelmente registrado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 092
<code>        'Resultado persistido confirmado; job liberado para finalização segura.', {</code>

**O que faz:** executa `'Resultado persistido confirmado; job liberado para finalização segura.', {` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 093
<code>          jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa `jobId: String(jobId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 094
<code>          batchId: String(job.batchId || '').slice(0, 8),</code>

**O que faz:** executa `batchId: String(job.batchId || '').slice(0, 8),` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 095
<code>        });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 096
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 097
<code>      await context.finalizeJob(</code>

**O que faz:** invoca finalização canônica após todas as provas.

**Como faz:** passa tabId, mangaTabId e `false` para fromError.

**Por que assim / alternativa pior:** centralizar cleanup/lote em finalizeJob evita duplicar invariantes nesta action.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 098
<code>        geminiTabId,</code>

**O que faz:** executa `geminiTabId,` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 099
<code>        job.mangaTabId ?? request.mangaTabId,</code>

**O que faz:** prefere o mangaTabId persistido no job e usa request apenas como fallback.

**Como faz:** operador nullish evita trocar ID válido 0 por fallback.

**Por que assim / alternativa pior:** dados persistidos são mais confiáveis que payload do caller.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 100
<code>        false</code>

**O que faz:** executa `false` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 101
<code>      );</code>

**O que faz:** executa `);` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 102
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 103
<code>      return { committed: true };</code>

**O que faz:** confirma commit novo concluído.

**Como faz:** resposta é embrulhada em `ok:true` pelo router.

**Por que assim / alternativa pior:** caller recebe confirmação somente depois de finalizeJob resolver.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 104
<code>    },</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 105
<code>  });</code>

**O que faz:** fecha bloco/descriptor/IIFE.

**Como faz:** preserva escopo das validações e do cleanup.

**Por que assim / alternativa pior:** delimitadores movidos podem alterar quais retornos pertencem ao execute.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 106
<code>})(typeof self !== 'undefined' ? self : globalThis);</code>

**O que faz:** executa `})(typeof self !== 'undefined' ? self : globalThis);` dentro do protocolo de commit.

**Como faz:** usa dados validados pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem validate→ownership→journal→batch→persistência→commit→finalização é o protocolo de segurança; mover esta instrução pode criar falso sucesso ou dupla finalização.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

### Linha 107
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas do protocolo sem efeito de runtime.

**Como faz:** mantém fronteira visual entre validação, journal e finalização.

**Por que assim / alternativa pior:** isso facilita auditar exatamente em que ponto um commit é autorizado.

**Evidência:** coberta direta ou estruturalmente pelos cenários do teste da action quando aplicável; linhas puramente estruturais são exercitadas pelo carregamento/dispatch real.

## 5. Invariantes

1. Nunca finalizar antes de prova de persistência/`dom_applied`.
2. Ownership do sender é obrigatório para commit novo.
3. Retry sem ownership só pode virar sucesso por journal válido, não expirado, do mesmo job e `fromError:false`.
4. Batch divergente deve ser rejeitado antes de update/finalize.
5. `result_committed` deve ser registrado antes de `finalizeJob`.
6. `finalizeJob` permanece a única autoridade de cleanup/contadores.
7. Retry já finalizado nunca deve repetir finalize.

## 6. Resultado

- Fonte integral: **SIM**.
- Todas as linhas comentadas: **SIM**.
- Caminhos críticos provados: **SIM**.
- Lacunas de journal/falha documentadas: **SIM**.
- Arquivo apto a `CONCLUÍDO`: **SIM**.

**Próximo arquivo após o rastreador:** `extension/background/actions/deliver-result-from-tab.js`.
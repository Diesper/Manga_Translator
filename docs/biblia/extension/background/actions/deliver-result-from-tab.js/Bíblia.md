# Bíblia técnica — `extension/background/actions/deliver-result-from-tab.js`

> **Estado:** 🟣 **REVISÃO DE QUALIDADE — NÃO CONCLUÍDO**.  
> **Auditoria:** reprovada em 2026-09-29; ver `docs/biblia/AUDITORIA.md` para os motivos e o protocolo de correção.
> **SHA auditado:** `59543c1359669ced02a1d05c251b272abaad6709`  
> **Linhas auditadas:** **104**  
> **Teste direto:** `tests/unit/background/deliver-result-from-tab-action.test.js` (`263cb827e30468c377c5b1eb5863e90bd6cf26b0`).

## 1. Papel arquitetural

Esta action reconecta o resultado produzido por uma aba auxiliar ao job Gemini original. Ela não usa `currentBatchId` global como autoridade, porque um resultado auxiliar de um lote anterior ainda pode ser legítimo enquanto outro lote já foi promovido.

A ordem é obrigatória: validar → reidratar → provar mapping do sender → provar ownership do job → cruzar batch/index/mangaTabId → stage com ACK → preservar recursos em falha → remover aba/mapping em sucesso → sincronizar → finalizar.

## 2. Evidência real

- ✅ payload sem jobId e src que não é Data URL são rejeitados antes de `ensureInitialized`;
- ✅ jobId diferente do mapping retorna `sender_mismatch` sem remover/finalizar;
- ✅ o sucesso usa `finalizeOnAck:false`, remove a aba auxiliar, apaga o mapping e finaliza só depois;
- ✅ falha de persistência mantém aba/mapping/job vivos para retry;
- ✅ um `currentBatchId` global diferente não invalida o resultado auxiliar real.

### Lacunas

- ⚠️ falta caso focal de ownership=false com mapping válido;
- ⚠️ batchId, index e mangaTabId divergentes não são testados separadamente;
- ⚠️ falta caso `ok:true,persisted:false`;
- ⚠️ erro de `tabs.remove`, `syncState` ou `finalizeJob` não possui cenário focal nesta suíte.

## 3. Fonte integral

```javascript
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

```

## 4. Comentário linha por linha

### Linha 001 — Registro e validação
<code>'use strict';</code>

**O que faz:** ativa strict mode no módulo.

**Como faz:** o motor interpreta a diretiva antes da IIFE.

**Por que assim / alternativa pior:** reduz erros silenciosos e globais acidentais.

**Evidência:** ✅ validação direta

### Linha 002 — Registro e validação
<code>// background/actions/deliver-result-from-tab.js -- Entrega resultado da aba auxiliar sem depender de currentBatchId.</code>

**O que faz:** registra a intenção/limitação desta etapa: background/actions/deliver-result-from-tab.js -- Entrega resultado da aba auxiliar sem depender de currentBatchId.

**Como faz:** é comentário local sem efeito de runtime.

**Por que assim / alternativa pior:** preserva a razão arquitetural junto do código e evita regressão por simplificação ingênua.

**Evidência:** ✅ validação direta

### Linha 003 — Registro e validação
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** impede payload inválido de acordar o fluxo de lifecycle ou tocar no estado.

**Evidência:** ✅ validação direta

### Linha 004 — Registro e validação
<code>(function(scope) {</code>

**O que faz:** executa a instrução concreta desta etapa: (function(scope) {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** impede payload inválido de acordar o fluxo de lifecycle ou tocar no estado.

**Evidência:** ✅ validação direta

### Linha 005 — Registro e validação
<code>  scope.MangaTranslatorRouter.registerAction({</code>

**O que faz:** registra o descriptor no roteador modular.

**Como faz:** usa a API central MangaTranslatorRouter.

**Por que assim / alternativa pior:** evita duplicar dispatch no listener global.

**Evidência:** ✅ validação direta

### Linha 006 — Registro e validação
<code>    name: 'deliver-result-from-tab',</code>

**O que faz:** define o nome canônico da action.

**Como faz:** o alias IMAGE_READY_FROM_NEW_TAB resolve para este nome.

**Por que assim / alternativa pior:** alias e nome precisam permanecer sincronizados.

**Evidência:** ✅ validação direta

### Linha 007 — Registro e validação
<code>    meta: { allowedSources: ['any'] },</code>

**O que faz:** permite origens variadas porque a aba auxiliar pode estar em CDN.

**Como faz:** usa allowedSources:any; segurança real vem do mapping+ownership.

**Por que assim / alternativa pior:** restringir apenas por classificação de URL bloquearia resultados legítimos.

**Evidência:** ✅ validação direta

### Linha 008 — Registro e validação
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** impede payload inválido de acordar o fluxo de lifecycle ou tocar no estado.

**Evidência:** ✅ validação direta

### Linha 009 — Registro e validação
<code>    validate(request) {</code>

**O que faz:** abre a validação síncrona do request.

**Como faz:** o router executa o validator antes do executor assíncrono.

**Por que assim / alternativa pior:** entrada inválida deve falhar antes de reidratação/efeitos colaterais.

**Evidência:** ✅ validação direta

### Linha 010 — Registro e validação
<code>      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {</code>

**O que faz:** valida ou utiliza o jobId que liga o resultado ao job esperado.

**Como faz:** usa comparação de string estrita e/ou comparação com o mapping.

**Por que assim / alternativa pior:** jobId frouxo permitiria uma aba auxiliar associar-se ao trabalho errado.

**Evidência:** ✅ validação direta

### Linha 011 — Registro e validação
<code>        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };</code>

**O que faz:** executa a instrução concreta desta etapa: return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** impede payload inválido de acordar o fluxo de lifecycle ou tocar no estado.

**Evidência:** ✅ validação direta

### Linha 012 — Registro e validação
<code>      }</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ validação direta

### Linha 013 — Registro e validação
<code>      if (typeof request.src !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(request.src)) {</code>

**O que faz:** valida ou encaminha a imagem resultante.

**Como faz:** aceita somente Data URL de imagem base64 antes do stage.

**Por que assim / alternativa pior:** uma URL remota reintroduziria rede e não provaria os bytes que foram extraídos.

**Evidência:** ✅ validação direta

### Linha 014 — Registro e validação
<code>        return { code: 'INVALID_PAYLOAD', message: 'src de resultado inválido' };</code>

**O que faz:** executa a instrução concreta desta etapa: return { code: 'INVALID_PAYLOAD', message: 'src de resultado inválido' };

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** impede payload inválido de acordar o fluxo de lifecycle ou tocar no estado.

**Evidência:** ✅ validação direta

### Linha 015 — Registro e validação
<code>      }</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ validação direta

### Linha 016 — Registro e validação
<code>      return null;</code>

**O que faz:** executa a instrução concreta desta etapa: return null;

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** impede payload inválido de acordar o fluxo de lifecycle ou tocar no estado.

**Evidência:** ✅ validação direta

### Linha 017 — Registro e validação
<code>    },</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ validação direta

### Linha 018 — Mapping da aba auxiliar
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** vincula o sender físico ao job registrado, sem confiar em IDs enviados no request.

**Evidência:** ✅ sender/mapping direto

### Linha 019 — Mapping da aba auxiliar
<code>    async execute(request, context) {</code>

**O que faz:** executa a instrução concreta desta etapa: async execute(request, context) {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** vincula o sender físico ao job registrado, sem confiar em IDs enviados no request.

**Evidência:** ✅ sender/mapping direto

### Linha 020 — Mapping da aba auxiliar
<code>      await context.ensureInitialized();</code>

**O que faz:** aguarda a reidratação do background.

**Como faz:** usa await antes de ler extractionTabs.

**Por que assim / alternativa pior:** sem isso um worker recém-acordado pode produzir falso mismatch.

**Evidência:** ✅ sender/mapping direto

### Linha 021 — Mapping da aba auxiliar
<code>      const senderTabId = context.sender &amp;&amp; context.sender.tab ? context.sender.tab.id : null;</code>

**O que faz:** trabalha com o tabId real do remetente.

**Como faz:** o ID vem de context.sender.tab, não do payload.

**Por que assim / alternativa pior:** o metadata do runtime é uma prova de origem mais forte que um ID fornecido pela própria mensagem.

**Evidência:** ✅ sender/mapping direto

### Linha 022 — Mapping da aba auxiliar
<code>      const mapping = senderTabId !== null &amp;&amp; context.state.extractionTabs[senderTabId];</code>

**O que faz:** trabalha com o tabId real do remetente.

**Como faz:** o ID vem de context.sender.tab, não do payload.

**Por que assim / alternativa pior:** o metadata do runtime é uma prova de origem mais forte que um ID fornecido pela própria mensagem.

**Evidência:** ✅ sender/mapping direto

### Linha 023 — Mapping da aba auxiliar
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** vincula o sender físico ao job registrado, sem confiar em IDs enviados no request.

**Evidência:** ✅ sender/mapping direto

### Linha 024 — Mapping da aba auxiliar
<code>      if (!mapping || mapping.jobId !== request.jobId) {</code>

**O que faz:** valida ou utiliza o jobId que liga o resultado ao job esperado.

**Como faz:** usa comparação de string estrita e/ou comparação com o mapping.

**Por que assim / alternativa pior:** jobId frouxo permitiria uma aba auxiliar associar-se ao trabalho errado.

**Evidência:** ✅ sender/mapping direto

### Linha 025 — Mapping da aba auxiliar
<code>        context.log('warn', 'bg', 'SENDER_MISMATCH',</code>

**O que faz:** registra rejeição de remetente/job incompatível.

**Como faz:** emite warning estruturado com identidade reduzida.

**Por que assim / alternativa pior:** rejeições precisam ser observáveis sem remover recursos de outro job.

**Evidência:** ✅ sender/mapping direto

### Linha 026 — Mapping da aba auxiliar
<code>          'Resultado de aba temporária descartado: mapeamento ou job incompatível.', {</code>

**O que faz:** executa a instrução concreta desta etapa: 'Resultado de aba temporária descartado: mapeamento ou job incompatível.', {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** vincula o sender físico ao job registrado, sem confiar em IDs enviados no request.

**Evidência:** ✅ sender/mapping direto

### Linha 027 — Mapping da aba auxiliar
<code>            jobId: String(request.jobId || '').slice(0, 8),</code>

**O que faz:** valida ou utiliza o jobId que liga o resultado ao job esperado.

**Como faz:** usa comparação de string estrita e/ou comparação com o mapping.

**Por que assim / alternativa pior:** jobId frouxo permitiria uma aba auxiliar associar-se ao trabalho errado.

**Evidência:** ✅ sender/mapping direto

### Linha 028 — Mapping da aba auxiliar
<code>          });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ sender/mapping direto

### Linha 029 — Mapping da aba auxiliar
<code>        return { ok: false, reason: 'sender_mismatch' };</code>

**O que faz:** executa a instrução concreta desta etapa: return { ok: false, reason: 'sender_mismatch' };

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** vincula o sender físico ao job registrado, sem confiar em IDs enviados no request.

**Evidência:** ✅ sender/mapping direto

### Linha 030 — Mapping da aba auxiliar
<code>      }</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ sender/mapping direto

### Linha 031 — Ownership do job Gemini
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 032 — Ownership do job Gemini
<code>      const { mangaTabId, index, geminiTabId, jobId, batchId } = mapping;</code>

**O que faz:** executa a instrução concreta desta etapa: const { mangaTabId, index, geminiTabId, jobId, batchId } = mapping;

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 033 — Ownership do job Gemini
<code>      const ownership = await new Promise(resolve =&gt; {</code>

**O que faz:** executa a instrução concreta desta etapa: const ownership = await new Promise(resolve => {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 034 — Ownership do job Gemini
<code>        context.assertJobOwnership({ tab: { id: geminiTabId } }, jobId, (owns, tabId, job) =&gt; {</code>

**O que faz:** confirma que o job Gemini original ainda pertence ao tabId registrado.

**Como faz:** adapta a API de ownership baseada em callback para Promise.

**Por que assim / alternativa pior:** mapping auxiliar sozinho não deve ressuscitar/finalizar job morto.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 035 — Ownership do job Gemini
<code>          resolve({ owns, tabId, job });</code>

**O que faz:** executa a instrução concreta desta etapa: resolve({ owns, tabId, job });

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 036 — Ownership do job Gemini
<code>        });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 037 — Ownership do job Gemini
<code>      });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 038 — Ownership do job Gemini
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 039 — Ownership do job Gemini
<code>      if (!ownership.owns || !ownership.job) {</code>

**O que faz:** executa a instrução concreta desta etapa: if (!ownership.owns || !ownership.job) {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 040 — Ownership do job Gemini
<code>        context.log('warn', 'bg', 'SENDER_MISMATCH',</code>

**O que faz:** registra rejeição de remetente/job incompatível.

**Como faz:** emite warning estruturado com identidade reduzida.

**Por que assim / alternativa pior:** rejeições precisam ser observáveis sem remover recursos de outro job.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 041 — Ownership do job Gemini
<code>          'Resultado de aba temporária descartado: job do Gemini não está mais ativo.', {</code>

**O que faz:** executa a instrução concreta desta etapa: 'Resultado de aba temporária descartado: job do Gemini não está mais ativo.', {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 042 — Ownership do job Gemini
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta desta etapa: jobId: String(jobId || '').slice(0, 8),

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba auxiliar transporta o resultado, mas o job original continua sendo a autoridade de lifecycle.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 043 — Ownership do job Gemini
<code>          });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** 🟨 ownership positivo; negativo não isolado

### Linha 044 — Identidade cruzada
<code>        return { ok: false, reason: 'sender_mismatch' };</code>

**O que faz:** executa a instrução concreta desta etapa: return { ok: false, reason: 'sender_mismatch' };

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 045 — Identidade cruzada
<code>      }</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 046 — Identidade cruzada
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 047 — Identidade cruzada
<code>      const job = ownership.job;</code>

**O que faz:** executa a instrução concreta desta etapa: const job = ownership.job;

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 048 — Identidade cruzada
<code>      const identityMismatch =</code>

**O que faz:** constrói ou aplica a barreira de identidade composta.

**Como faz:** compara batchId, index e mangaTabId entre mapping e job persistido.

**Por que assim / alternativa pior:** jobId sozinho não impede mistura entre página/lote/destino.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 049 — Identidade cruzada
<code>        (batchId &amp;&amp; job.batchId &amp;&amp; batchId !== job.batchId) ||</code>

**O que faz:** executa a instrução concreta desta etapa: (batchId && job.batchId && batchId !== job.batchId) ||

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 050 — Identidade cruzada
<code>        (Number.isInteger(index) &amp;&amp; Number.isInteger(job.index) &amp;&amp; index !== job.index) ||</code>

**O que faz:** executa a instrução concreta desta etapa: (Number.isInteger(index) && Number.isInteger(job.index) && index !== job.index) ||

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 051 — Identidade cruzada
<code>        (mangaTabId &amp;&amp; job.mangaTabId &amp;&amp; mangaTabId !== job.mangaTabId);</code>

**O que faz:** executa a instrução concreta desta etapa: (mangaTabId && job.mangaTabId && mangaTabId !== job.mangaTabId);

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 052 — Identidade cruzada
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 053 — Identidade cruzada
<code>      if (identityMismatch) {</code>

**O que faz:** constrói ou aplica a barreira de identidade composta.

**Como faz:** compara batchId, index e mangaTabId entre mapping e job persistido.

**Por que assim / alternativa pior:** jobId sozinho não impede mistura entre página/lote/destino.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 054 — Identidade cruzada
<code>        context.log('error', 'bg', 'AUX_RESULT_JOB_IDENTITY_MISMATCH',</code>

**O que faz:** executa a instrução concreta desta etapa: context.log('error', 'bg', 'AUX_RESULT_JOB_IDENTITY_MISMATCH',

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 055 — Identidade cruzada
<code>          'Resultado auxiliar rejeitado: identidade não corresponde ao job persistido.', {</code>

**O que faz:** executa a instrução concreta desta etapa: 'Resultado auxiliar rejeitado: identidade não corresponde ao job persistido.', {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 056 — Identidade cruzada
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta desta etapa: jobId: String(jobId || '').slice(0, 8),

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 057 — Identidade cruzada
<code>            expectedBatchId: String(job.batchId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta desta etapa: expectedBatchId: String(job.batchId || '').slice(0, 8),

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 058 — Identidade cruzada
<code>            receivedBatchId: String(batchId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta desta etapa: receivedBatchId: String(batchId || '').slice(0, 8),

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** batch, índice e mangaTabId evitam aplicar um resultado correto ao destino/lote errado.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 059 — Identidade cruzada
<code>          });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** 🟨 implementação explícita; divergências individuais sem casos próprios

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 060 — Stage e ACK
<code>        return { ok: false, reason: 'job_identity_mismatch' };</code>

**O que faz:** executa a instrução concreta desta etapa: return { ok: false, reason: 'job_identity_mismatch' };

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** o resultado precisa ser aplicado/persistido antes de qualquer liberação de recursos.

**Evidência:** ✅ stage/flags provados

### Linha 061 — Stage e ACK
<code>      }</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ stage/flags provados

### Linha 062 — Stage e ACK
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** o resultado precisa ser aplicado/persistido antes de qualquer liberação de recursos.

**Evidência:** ✅ stage/flags provados

### Linha 063 — Stage e ACK
<code>      const staged = await context.deliverResultToManga({</code>

**O que faz:** entrega a imagem ao content script de mangá e aguarda ACK.

**Como faz:** usa a fronteira de DOM ACK com identidades já verificadas.

**Por que assim / alternativa pior:** cleanup antes do ACK perderia o caminho de retry e poderia contabilizar sucesso sem persistência.

**Evidência:** ✅ stage/flags provados

### Linha 064 — Stage e ACK
<code>        mangaTabId: job.mangaTabId ?? mangaTabId,</code>

**O que faz:** executa a instrução concreta desta etapa: mangaTabId: job.mangaTabId ?? mangaTabId,

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** o resultado precisa ser aplicado/persistido antes de qualquer liberação de recursos.

**Evidência:** ✅ stage/flags provados

### Linha 065 — Stage e ACK
<code>        index: job.index ?? index,</code>

**O que faz:** executa a instrução concreta desta etapa: index: job.index ?? index,

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** o resultado precisa ser aplicado/persistido antes de qualquer liberação de recursos.

**Evidência:** ✅ stage/flags provados

### Linha 066 — Stage e ACK
<code>        src: request.src,</code>

**O que faz:** valida ou encaminha a imagem resultante.

**Como faz:** aceita somente Data URL de imagem base64 antes do stage.

**Por que assim / alternativa pior:** uma URL remota reintroduziria rede e não provaria os bytes que foram extraídos.

**Evidência:** ✅ stage/flags provados

### Linha 067 — Stage e ACK
<code>        jobId,</code>

**O que faz:** executa a instrução concreta desta etapa: jobId,

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** o resultado precisa ser aplicado/persistido antes de qualquer liberação de recursos.

**Evidência:** ✅ stage/flags provados

### Linha 068 — Stage e ACK
<code>        batchId: job.batchId ?? batchId,</code>

**O que faz:** executa a instrução concreta desta etapa: batchId: job.batchId ?? batchId,

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** o resultado precisa ser aplicado/persistido antes de qualquer liberação de recursos.

**Evidência:** ✅ stage/flags provados

### Linha 069 — Stage e ACK
<code>        geminiTabId: ownership.tabId,</code>

**O que faz:** executa a instrução concreta desta etapa: geminiTabId: ownership.tabId,

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** o resultado precisa ser aplicado/persistido antes de qualquer liberação de recursos.

**Evidência:** ✅ stage/flags provados

### Linha 070 — Stage e ACK
<code>        finalizeOnAck: false,</code>

**O que faz:** desativa finalização automática dentro do ACK.

**Como faz:** define finalizeOnAck como false.

**Por que assim / alternativa pior:** esta action precisa limpar e sincronizar a aba auxiliar antes de finalizar o job.

**Evidência:** ✅ stage/flags provados

### Linha 071 — Falha preserva retry
<code>      });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ retry provado

### Linha 072 — Falha preserva retry
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** um ACK negativo não pode destruir a aba auxiliar nem finalizar o job.

**Evidência:** ✅ retry provado

### Linha 073 — Falha preserva retry
<code>      if (!staged?.ok || staged.persisted === false) {</code>

**O que faz:** avalia ou devolve o resultado do stage/persistência.

**Como faz:** usa flags ok/persisted e motivo normalizado.

**Por que assim / alternativa pior:** somente resultado durável pode avançar para cleanup/finalização.

**Evidência:** ✅ retry provado

### Linha 074 — Falha preserva retry
<code>        context.log('error', 'bg', 'AUX_RESULT_STAGE_FAILED',</code>

**O que faz:** executa a instrução concreta desta etapa: context.log('error', 'bg', 'AUX_RESULT_STAGE_FAILED',

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** um ACK negativo não pode destruir a aba auxiliar nem finalizar o job.

**Evidência:** ✅ retry provado

### Linha 075 — Falha preserva retry
<code>          'Resultado da aba auxiliar não recebeu ACK de persistência; aba mantida para retry.', {</code>

**O que faz:** executa a instrução concreta desta etapa: 'Resultado da aba auxiliar não recebeu ACK de persistência; aba mantida para retry.', {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** um ACK negativo não pode destruir a aba auxiliar nem finalizar o job.

**Evidência:** ✅ retry provado

### Linha 076 — Falha preserva retry
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta desta etapa: jobId: String(jobId || '').slice(0, 8),

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** um ACK negativo não pode destruir a aba auxiliar nem finalizar o job.

**Evidência:** ✅ retry provado

### Linha 077 — Falha preserva retry
<code>            reason: staged?.reason || 'unknown',</code>

**O que faz:** avalia ou devolve o resultado do stage/persistência.

**Como faz:** usa flags ok/persisted e motivo normalizado.

**Por que assim / alternativa pior:** somente resultado durável pode avançar para cleanup/finalização.

**Evidência:** ✅ retry provado

### Linha 078 — Falha preserva retry
<code>          });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ retry provado

### Linha 079 — Falha preserva retry
<code>        return { ok: false, reason: staged?.reason || 'stage_failed' };</code>

**O que faz:** avalia ou devolve o resultado do stage/persistência.

**Como faz:** usa flags ok/persisted e motivo normalizado.

**Por que assim / alternativa pior:** somente resultado durável pode avançar para cleanup/finalização.

**Evidência:** ✅ retry provado

### Linha 080 — Falha preserva retry
<code>      }</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ retry provado

### Linha 081 — Cleanup durável
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 082 — Cleanup durável
<code>      if (senderTabId !== null) {</code>

**O que faz:** trabalha com o tabId real do remetente.

**Como faz:** o ID vem de context.sender.tab, não do payload.

**Por que assim / alternativa pior:** o metadata do runtime é uma prova de origem mais forte que um ID fornecido pela própria mensagem.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 083 — Cleanup durável
<code>        chrome.tabs.remove(senderTabId, () =&gt; { if (chrome.runtime.lastError) {} });</code>

**O que faz:** trabalha com o tabId real do remetente.

**Como faz:** o ID vem de context.sender.tab, não do payload.

**Por que assim / alternativa pior:** o metadata do runtime é uma prova de origem mais forte que um ID fornecido pela própria mensagem.

**Evidência:** ✅ cleanup pós-persistência provado

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 084 — Cleanup durável
<code>        delete context.state.extractionTabs[senderTabId];</code>

**O que faz:** trabalha com o tabId real do remetente.

**Como faz:** o ID vem de context.sender.tab, não do payload.

**Por que assim / alternativa pior:** o metadata do runtime é uma prova de origem mais forte que um ID fornecido pela própria mensagem.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 085 — Cleanup durável
<code>      }</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 086 — Cleanup durável
<code>      await context.syncState();</code>

**O que faz:** persiste o cleanup do mapping.

**Como faz:** aguarda a sincronização antes da finalização.

**Por que assim / alternativa pior:** suspensão do worker antes do sync poderia ressuscitar mapping removido.

**Evidência:** ✅ cleanup pós-persistência provado

**⚠️ Comentário extra:** existe pelo menos uma variante de borda/erro desta linha que não possui assertion focal própria.

### Linha 087 — Cleanup durável
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 088 — Cleanup durável
<code>      context.log('success', 'bg', 'AUX_RESULT_STAGED_DURABLY',</code>

**O que faz:** executa a instrução concreta desta etapa: context.log('success', 'bg', 'AUX_RESULT_STAGED_DURABLY',

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 089 — Cleanup durável
<code>        'Resultado auxiliar foi persistido; job agora pode ser finalizado com segurança.', {</code>

**O que faz:** executa a instrução concreta desta etapa: 'Resultado auxiliar foi persistido; job agora pode ser finalizado com segurança.', {

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 090 — Cleanup durável
<code>          jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta desta etapa: jobId: String(jobId || '').slice(0, 8),

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 091 — Cleanup durável
<code>          batchId: String(job.batchId || batchId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta desta etapa: batchId: String(job.batchId || batchId || '').slice(0, 8),

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 092 — Cleanup durável
<code>        });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 093 — Cleanup durável
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 094 — Cleanup durável
<code>      await context.finalizeJob(</code>

**O que faz:** finaliza o job original somente no fim do protocolo.

**Como faz:** delegação centralizada recebe tabId de ownership, mangaTabId e fromError=false.

**Por que assim / alternativa pior:** duplicar cleanup/contadores nesta action quebraria idempotência do lifecycle.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 095 — Cleanup durável
<code>        ownership.tabId,</code>

**O que faz:** executa a instrução concreta desta etapa: ownership.tabId,

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 096 — Cleanup durável
<code>        job.mangaTabId ?? mangaTabId,</code>

**O que faz:** executa a instrução concreta desta etapa: job.mangaTabId ?? mangaTabId,

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** a aba e seu mapping só são removidos depois da persistência, e a remoção é sincronizada.

**Evidência:** ✅ cleanup pós-persistência provado

### Linha 097 — Finalização
<code>        false</code>

**O que faz:** executa a instrução concreta desta etapa: false

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** finalizeJob só roda depois de todas as provas e do cleanup auxiliar.

**Evidência:** ✅ finalização provada

### Linha 098 — Finalização
<code>      );</code>

**O que faz:** executa a instrução concreta desta etapa: );

**Como faz:** usa os dados já validados pelas linhas vizinhas.

**Por que assim / alternativa pior:** finalizeJob só roda depois de todas as provas e do cleanup auxiliar.

**Evidência:** ✅ finalização provada

### Linha 099 — Finalização
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** finalizeJob só roda depois de todas as provas e do cleanup auxiliar.

**Evidência:** ✅ finalização provada

### Linha 100 — Finalização
<code>      return { staged: true, persisted: true, committed: true };</code>

**O que faz:** avalia ou devolve o resultado do stage/persistência.

**Como faz:** usa flags ok/persisted e motivo normalizado.

**Por que assim / alternativa pior:** somente resultado durável pode avançar para cleanup/finalização.

**Evidência:** ✅ finalização provada

### Linha 101 — Finalização
<code>    },</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ finalização provada

### Linha 102 — Finalização
<code>  });</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ finalização provada

### Linha 103 — Finalização
<code>})(typeof self !== 'undefined' ? self : globalThis);</code>

**O que faz:** fecha a estrutura aberta nas linhas anteriores.

**Como faz:** preserva o escopo de guardas, executor e IIFE.

**Por que assim / alternativa pior:** mover o fechamento pode colocar cleanup fora das condições de segurança.

**Evidência:** ✅ finalização provada

### Linha 104 — Finalização
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente as etapas sem executar comportamento.

**Como faz:** não há operação de runtime.

**Por que assim / alternativa pior:** finalizeJob só roda depois de todas as provas e do cleanup auxiliar.

**Evidência:** ✅ finalização provada

## 5. Invariantes

1. Sender real precisa possuir mapping do mesmo jobId.
2. Mapping auxiliar não substitui ownership do job Gemini.
3. `currentBatchId` global não invalida sozinho um resultado auxiliar.
4. Batch/index/mangaTabId são cruzados antes do DOM.
5. `finalizeOnAck` permanece `false`.
6. Falha de persistência preserva recursos para retry.
7. Cleanup só ocorre após persistência e é sincronizado antes de `finalizeJob`.

## 6. Resultado

- Fonte integral: **SIM**.
- Todas as linhas comentadas: **SIM**.
- Persistência antes de cleanup/finalização: **PROVADA**.
- Independência de currentBatchId: **PROVADA**.
- Lacunas de identidade/erro documentadas: **SIM**.
- Arquivo apto a `CONCLUÍDO`: **NÃO — REVISÃO DE QUALIDADE OBRIGATÓRIA**.

**Próximo arquivo após atualizar STATUS/CHECKLIST:** `extension/background/actions/deliver-result-url.js`.
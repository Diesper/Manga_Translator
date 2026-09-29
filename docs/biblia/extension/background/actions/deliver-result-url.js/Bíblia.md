# Bíblia técnica — `extension/background/actions/deliver-result-url.js`

> **Estado:** CONCLUÍDO nesta Bíblia individual.  
> **SHA auditado:** `91c50efe4764f56aac16aec2c91309e06db7d0ac`  
> **Linhas auditadas:** **94**  
> **Teste direto:** `tests/unit/background/deliver-result-url-action.test.js` (`09a0f891434bccf30dbc6e0d244e8f18a40a17d9`).

## 1. Papel arquitetural

Esta action implementa o fallback em que o resultado final do Gemini existe como URL e precisa ser aberto numa aba auxiliar para extração. Ela **não finaliza o job**: registra a aba auxiliar, muda o job para `awaiting_auxiliary_extraction`, sincroniza o estado e devolve confirmação. A finalização só acontece depois, em `deliver-result-from-tab`, quando a imagem efetivamente extraída recebeu ACK de persistência.

O contrato evita depender de `currentBatchId`. O teste prova que um job real de `batch-old` ainda pode registrar sua extraction tab mesmo quando `state.currentBatchId` já é `batch-new`; a identidade válida vem do ownership e do próprio job persistido.

## 2. Matriz de evidência

| Linhas | Seção | Evidência |
|---:|---|---|
| 1–18 | Registro e validação | ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`. |
| 19–35 | Inicialização e ownership | ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar. |
| 36–51 | Validação cruzada da identidade | ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados. |
| 52–64 | Normalização da URL auxiliar | ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais. |
| 65–80 | Criação e registro da aba auxiliar | ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`. |
| 81–88 | Transição durável do job | ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`. |
| 89–101 | Observabilidade e resposta | ✅ fluxo principal confirma `extractionRegistered:true`; ⚠️ conteúdo exato do log não é assertado. |

## 3. Lacunas de teste explicitamente preservadas

- ⚠️ não há caso focal de `index` divergente com batch correto;
- ⚠️ não há caso focal de `mangaTabId` divergente;
- ⚠️ `blob:` e `data:image/...` são aceitos pelo validator, mas a suíte direta não verifica a criação da aba com esses esquemas;
- ⚠️ o catch de `new URL(url)` não possui cenário focal;
- ⚠️ não há teste de `chrome.tabs.create` retornando valor inválido/erro;
- ⚠️ não há teste de falha de `updateJobState` ou `syncState`;
- ⚠️ `allowedSources:['any']` não é testado como contrato necessário; a autorização efetiva é ownership.

## 4. Fonte integral

```javascript
'use strict';
// background/actions/deliver-result-url.js -- Abre aba temporária preservando a identidade real do job.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'deliver-result-url',
    meta: { allowedSources: ['any'] },

    validate(request) {
      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {
        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };
      }
      if (typeof request.url !== 'string' || request.url.length === 0 ||
          !/^(https?:|blob:|data:image\/)/i.test(request.url)) {
        return { code: 'INVALID_PAYLOAD', message: 'url de resultado inválida' };
      }
      return null;
    },

    async execute(request, context) {
      const { mangaTabId, index, url, jobId, batchId } = request;
      await context.ensureInitialized();

      const ownership = await new Promise(resolve => {
        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) => {
          resolve({ owns, tabId, job });
        });
      });

      if (!ownership.owns || !ownership.job) {
        context.log('warn', 'bg', 'SENDER_MISMATCH',
          'URL de resultado descartada: aba remetente não é dona de um job ativo.', {
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
        context.log('error', 'bg', 'AUX_URL_JOB_IDENTITY_MISMATCH',
          'Fallback por URL rejeitado: identidade não corresponde ao job persistido.', {
            jobId: String(jobId || '').slice(0, 8),
            expectedBatchId: String(job.batchId || '').slice(0, 8),
            receivedBatchId: String(batchId || '').slice(0, 8),
          });
        return { ok: false, reason: 'job_identity_mismatch' };
      }

      let auxiliaryUrl = url;
      try {
        const parsedAuxiliaryUrl = new URL(url);
        if (parsedAuxiliaryUrl.protocol === 'http:' || parsedAuxiliaryUrl.protocol === 'https:') {
          parsedAuxiliaryUrl.hash = 'manga-translator-extraction';
          auxiliaryUrl = parsedAuxiliaryUrl.toString();
        }
      } catch (_error) {
        // A validação anterior já garantiu uma URL aceita. Se URL() não puder
        // normalizá-la (ex.: blob/data), mantenha o valor original.
      }

      const newTab = await new Promise(resolve => {
        chrome.tabs.create({ url: auxiliaryUrl, active: false }, resolve);
      });

      context.state.extractionTabs[newTab.id] = {
        mangaTabId: job.mangaTabId ?? mangaTabId,
        index: job.index ?? index,
        geminiTabId: ownership.tabId,
        jobId,
        batchId: job.batchId ?? batchId,
      };
      await context.updateJobState(ownership.tabId, {
        state: 'awaiting_auxiliary_extraction',
        auxiliaryTabId: newTab.id,
      });
      await context.syncState();

      context.log('info', 'bg', 'AUXILIARY_EXTRACTION_REGISTERED',
        'Aba auxiliar registrada sem finalizar o job Gemini.', {
          jobId: String(jobId || '').slice(0, 8),
          batchId: String(job.batchId || batchId || '').slice(0, 8),
          extractionTabId: newTab.id,
        });

      return { extractionRegistered: true };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

```

## 5. Comentário linha por linha

### Linha 001 — Registro e validação
<code>'use strict';</code>

**O que faz:** ativa strict mode no módulo.

**Como faz:** é a diretiva inicial do script.

**Por que assim / alternativa pior:** reduz globais acidentais e falhas silenciosas num módulo que manipula IDs de aba/job.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 002 — Registro e validação
<code>// background/actions/deliver-result-url.js -- Abre aba temporária preservando a identidade real do job.</code>

**O que faz:** documenta a decisão local: “background/actions/deliver-result-url.js -- Abre aba temporária preservando a identidade real do job.”.

**Como faz:** é comentário junto da implementação afetada.

**Por que assim / alternativa pior:** a raison d'être desta action é preservar identidade real do job sem depender de estado global; remover o contexto facilita regressão.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 003 — Registro e validação
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 004 — Registro e validação
<code>(function(scope) {</code>

**O que faz:** executa a instrução concreta `(function(scope) {` dentro de **Registro e validação**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 005 — Registro e validação
<code>  scope.MangaTranslatorRouter.registerAction({</code>

**O que faz:** registra a action no roteador modular.

**Como faz:** fornece nome, metadata, validator e executor.

**Por que assim / alternativa pior:** centralizar o dispatch mantém compatibilidade com o protocolo legado sem reintroduzir um listener monolítico.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 006 — Registro e validação
<code>    name: 'deliver-result-url',</code>

**O que faz:** define o nome canônico da action.

**Como faz:** `GEMINI_RESULT_URL` é resolvido para esse nome pelo router.

**Por que assim / alternativa pior:** nome e alias divergentes tornariam o fallback por URL inacessível.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 007 — Registro e validação
<code>    meta: { allowedSources: ['any'] },</code>

**O que faz:** permite qualquer classificação de origem do router.

**Como faz:** a autorização real acontece com `assertJobOwnership`.

**Por que assim / alternativa pior:** o fluxo pode ser disparado de contextos que não devem ser bloqueados apenas pela classificação de URL, mas isso exige ownership interno forte.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 008 — Registro e validação
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 009 — Registro e validação
<code>    validate(request) {</code>

**O que faz:** abre validação síncrona do payload.

**Como faz:** o router a executa antes do `execute`.

**Por que assim / alternativa pior:** input inválido deve falhar antes de reidratar estado ou criar abas.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 010 — Registro e validação
<code>      if (typeof request.jobId !== 'string' || request.jobId.trim().length === 0) {</code>

**O que faz:** exige jobId string não vazia.

**Como faz:** combina type-check e trim.

**Por que assim / alternativa pior:** sem identidade lógica não é possível provar ownership nem vincular a extraction tab.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 011 — Registro e validação
<code>        return { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' };</code>

**O que faz:** retorna erro estruturado de validação.

**Como faz:** usa código e mensagem que o router converte em resposta.

**Por que assim / alternativa pior:** evita exceção genérica e garante que nenhum efeito colateral ocorra.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 012 — Registro e validação
<code>      }</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 013 — Registro e validação
<code>      if (typeof request.url !== 'string' || request.url.length === 0 ||</code>

**O que faz:** inicia validação da URL de resultado.

**Como faz:** exige string não vazia.

**Por que assim / alternativa pior:** valores não textuais ou vazios não podem ser passados para `tabs.create`.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 014 — Registro e validação
<code>          !/^(https?:|blob:|data:image\/)/i.test(request.url)) {</code>

**O que faz:** restringe esquemas aceitos a HTTP(S), blob ou data:image.

**Como faz:** usa allowlist por regex ancorada.

**Por que assim / alternativa pior:** allowlist é mais segura que negar apenas `javascript:` e esquecer outros esquemas executáveis/inesperados.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 015 — Registro e validação
<code>        return { code: 'INVALID_PAYLOAD', message: 'url de resultado inválida' };</code>

**O que faz:** retorna erro estruturado de validação.

**Como faz:** usa código e mensagem que o router converte em resposta.

**Por que assim / alternativa pior:** evita exceção genérica e garante que nenhum efeito colateral ocorra.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 016 — Registro e validação
<code>      }</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 017 — Registro e validação
<code>      return null;</code>

**O que faz:** executa a instrução concreta `return null;` dentro de **Registro e validação**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 018 — Registro e validação
<code>    },</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto rejeita jobId ausente e `javascript:` antes de `ensureInitialized`/`tabs.create`.

### Linha 019 — Inicialização e ownership
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 020 — Inicialização e ownership
<code>    async execute(request, context) {</code>

**O que faz:** inicia o protocolo assíncrono do fallback por URL.

**Como faz:** usa awaits para lifecycle, ownership, tab creation, state update e sync.

**Por que assim / alternativa pior:** essas operações precisam de ordem causal explícita.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 021 — Inicialização e ownership
<code>      const { mangaTabId, index, url, jobId, batchId } = request;</code>

**O que faz:** extrai do request os campos relevantes ao fallback.

**Como faz:** usa destructuring local.

**Por que assim / alternativa pior:** deixa claro quais valores do request ainda precisam ser comparados com o job persistido.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 022 — Inicialização e ownership
<code>      await context.ensureInitialized();</code>

**O que faz:** aguarda reidratação/reconciliação do background.

**Como faz:** faz isso antes do ownership/estado.

**Por que assim / alternativa pior:** um Service Worker recém-acordado não deve decidir ownership usando snapshot incompleto.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 023 — Inicialização e ownership
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 024 — Inicialização e ownership
<code>      const ownership = await new Promise(resolve =&gt; {</code>

**O que faz:** adapta a API callback de ownership para Promise.

**Como faz:** resolve `owns`, `tabId` e `job` em um único objeto.

**Por que assim / alternativa pior:** permite manter o fluxo linear com await e evita continuar antes da decisão de ownership.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 025 — Inicialização e ownership
<code>        context.assertJobOwnership(context.sender, jobId, (owns, tabId, job) =&gt; {</code>

**O que faz:** prova que o sender atual é dono de um job ativo com o jobId informado.

**Como faz:** usa metadata real do sender e jobId.

**Por que assim / alternativa pior:** conhecer uma URL de resultado ou jobId não pode ser suficiente para abrir extraction tab.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 026 — Inicialização e ownership
<code>          resolve({ owns, tabId, job });</code>

**O que faz:** executa a instrução concreta `resolve({ owns, tabId, job });` dentro de **Inicialização e ownership**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 027 — Inicialização e ownership
<code>        });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 028 — Inicialização e ownership
<code>      });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 029 — Inicialização e ownership
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 030 — Inicialização e ownership
<code>      if (!ownership.owns || !ownership.job) {</code>

**O que faz:** rejeita quando o sender não possui o job.

**Como faz:** exige flag e registro de job.

**Por que assim / alternativa pior:** evita criar recursos auxiliares órfãos ou associados a claimant incorreto.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 031 — Inicialização e ownership
<code>        context.log('warn', 'bg', 'SENDER_MISMATCH',</code>

**O que faz:** registra tentativa/rejeição por ownership incompatível.

**Como faz:** usa warning estruturado com prefixo do jobId.

**Por que assim / alternativa pior:** telemetria ajuda distinguir resposta tardia, aba manual e spoofing.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 032 — Inicialização e ownership
<code>          'URL de resultado descartada: aba remetente não é dona de um job ativo.', {</code>

**O que faz:** executa a instrução concreta `'URL de resultado descartada: aba remetente não é dona de um job ativo.', {` dentro de **Inicialização e ownership**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 033 — Inicialização e ownership
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta `jobId: String(jobId || '').slice(0, 8),` dentro de **Inicialização e ownership**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 034 — Inicialização e ownership
<code>          });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 035 — Inicialização e ownership
<code>        return { ok: false, reason: 'sender_mismatch' };</code>

**O que faz:** encerra o fluxo antes de `tabs.create`.

**Como faz:** retorna motivo estável.

**Por que assim / alternativa pior:** não criar a aba é tão importante quanto rejeitar o payload: evita recurso órfão.

**Evidência:** ✅ Teste direto rejeita sender sem ownership antes de abrir aba auxiliar.

### Linha 036 — Validação cruzada da identidade
<code>      }</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 037 — Validação cruzada da identidade
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 038 — Validação cruzada da identidade
<code>      const job = ownership.job;</code>

**O que faz:** fixa o job persistido cuja posse foi provada.

**Como faz:** usa este objeto como fonte de verdade para batch/index/mangaTabId.

**Por que assim / alternativa pior:** dados persistidos têm precedência sobre valores repetidos no request.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 039 — Validação cruzada da identidade
<code>      const identityMismatch =</code>

**O que faz:** monta uma barreira composta entre request e job persistido.

**Como faz:** agrega divergências de batch, índice e aba de mangá.

**Por que assim / alternativa pior:** jobId correto sozinho não impede misturar resultado com página/lote/destino diferente.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 040 — Validação cruzada da identidade
<code>        (batchId &amp;&amp; job.batchId &amp;&amp; batchId !== job.batchId) ||</code>

**O que faz:** compara batch IDs quando ambos existem.

**Como faz:** usa comparação estrita.

**Por que assim / alternativa pior:** resultado tardio de lote antigo não pode registrar extraction tab para lote novo.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 041 — Validação cruzada da identidade
<code>        (Number.isInteger(index) &amp;&amp; Number.isInteger(job.index) &amp;&amp; index !== job.index) ||</code>

**O que faz:** compara índices somente quando ambos são inteiros.

**Como faz:** evita coerção/false mismatch em dados legados ausentes.

**Por que assim / alternativa pior:** índice errado vincularia resultado à página errada.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 042 — Validação cruzada da identidade
<code>        (mangaTabId &amp;&amp; job.mangaTabId &amp;&amp; mangaTabId !== job.mangaTabId);</code>

**O que faz:** compara a aba de mangá de destino quando ambos IDs existem.

**Como faz:** usa igualdade estrita.

**Por que assim / alternativa pior:** resultado não deve ser redirecionado para outra aba só porque jobId coincide.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 043 — Validação cruzada da identidade
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 044 — Validação cruzada da identidade
<code>      if (identityMismatch) {</code>

**O que faz:** executa a instrução concreta `if (identityMismatch) {` dentro de **Validação cruzada da identidade**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 045 — Validação cruzada da identidade
<code>        context.log('error', 'bg', 'AUX_URL_JOB_IDENTITY_MISMATCH',</code>

**O que faz:** registra divergência da identidade composta.

**Como faz:** inclui batch esperado/recebido e job reduzido.

**Por que assim / alternativa pior:** separa corrupção/mistura de metadados de simples ausência de ownership.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 046 — Validação cruzada da identidade
<code>          'Fallback por URL rejeitado: identidade não corresponde ao job persistido.', {</code>

**O que faz:** executa a instrução concreta `'Fallback por URL rejeitado: identidade não corresponde ao job persistido.', {` dentro de **Validação cruzada da identidade**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 047 — Validação cruzada da identidade
<code>            jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta `jobId: String(jobId || '').slice(0, 8),` dentro de **Validação cruzada da identidade**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 048 — Validação cruzada da identidade
<code>            expectedBatchId: String(job.batchId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta `expectedBatchId: String(job.batchId || '').slice(0, 8),` dentro de **Validação cruzada da identidade**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 049 — Validação cruzada da identidade
<code>            receivedBatchId: String(batchId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta `receivedBatchId: String(batchId || '').slice(0, 8),` dentro de **Validação cruzada da identidade**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 050 — Validação cruzada da identidade
<code>          });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 051 — Validação cruzada da identidade
<code>        return { ok: false, reason: 'job_identity_mismatch' };</code>

**O que faz:** rejeita antes de abrir a aba auxiliar.

**Como faz:** retorna razão específica.

**Por que assim / alternativa pior:** criar a aba e só validar depois deixaria recurso temporário órfão.

**Evidência:** ✅ batchId forjado é rejeitado; ⚠️ index e mangaTabId divergentes não possuem casos focais separados.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 052 — Normalização da URL auxiliar
<code>      }</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 053 — Normalização da URL auxiliar
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 054 — Normalização da URL auxiliar
<code>      let auxiliaryUrl = url;</code>

**O que faz:** inicializa a URL efetiva com o valor original.

**Como faz:** prepara fallback para esquemas que `URL()` não normalizará no caminho esperado.

**Por que assim / alternativa pior:** preserva blob/data caso a normalização de HTTP(S) não se aplique.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 055 — Normalização da URL auxiliar
<code>      try {</code>

**O que faz:** executa a instrução concreta `try {` dentro de **Normalização da URL auxiliar**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 056 — Normalização da URL auxiliar
<code>        const parsedAuxiliaryUrl = new URL(url);</code>

**O que faz:** tenta normalizar a URL com a API nativa.

**Como faz:** a operação fica dentro de `try`.

**Por que assim / alternativa pior:** para HTTP(S), URL estruturada é mais segura que concatenar `#...` manualmente com fragmentos já existentes.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 057 — Normalização da URL auxiliar
<code>        if (parsedAuxiliaryUrl.protocol === 'http:' || parsedAuxiliaryUrl.protocol === 'https:') {</code>

**O que faz:** restringe a adição do marcador de hash a HTTP(S).

**Como faz:** blob/data permanecem intactos.

**Por que assim / alternativa pior:** alterar blob/data com URL normalizada poderia invalidar o conteúdo ou sua semântica.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 058 — Normalização da URL auxiliar
<code>          parsedAuxiliaryUrl.hash = 'manga-translator-extraction';</code>

**O que faz:** marca a aba auxiliar HTTP(S) com fragmento identificador.

**Como faz:** substitui o hash pela marca estável.

**Por que assim / alternativa pior:** o marcador ajuda o content script/diagnóstico sem alterar a requisição HTTP ao servidor.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 059 — Normalização da URL auxiliar
<code>          auxiliaryUrl = parsedAuxiliaryUrl.toString();</code>

**O que faz:** serializa a URL já normalizada e marcada.

**Como faz:** usa `URL.toString()`.

**Por que assim / alternativa pior:** evita concatenação manual que poderia gerar `#` duplicado ou escapar incorretamente.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 060 — Normalização da URL auxiliar
<code>        }</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 061 — Normalização da URL auxiliar
<code>      } catch (_error) {</code>

**O que faz:** captura falha de normalização da URL.

**Como faz:** mantém o valor original já aprovado pelo validator.

**Por que assim / alternativa pior:** a falha de normalização de um esquema permitido não deve derrubar o fallback inteiro.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 062 — Normalização da URL auxiliar
<code>        // A validação anterior já garantiu uma URL aceita. Se URL() não puder</code>

**O que faz:** documenta a decisão local: “A validação anterior já garantiu uma URL aceita. Se URL() não puder”.

**Como faz:** é comentário junto da implementação afetada.

**Por que assim / alternativa pior:** a raison d'être desta action é preservar identidade real do job sem depender de estado global; remover o contexto facilita regressão.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 063 — Normalização da URL auxiliar
<code>        // normalizá-la (ex.: blob/data), mantenha o valor original.</code>

**O que faz:** documenta a decisão local: “normalizá-la (ex.: blob/data), mantenha o valor original.”.

**Como faz:** é comentário junto da implementação afetada.

**Por que assim / alternativa pior:** a raison d'être desta action é preservar identidade real do job sem depender de estado global; remover o contexto facilita regressão.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 064 — Normalização da URL auxiliar
<code>      }</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ HTTP(S) recebe `#manga-translator-extraction`; ⚠️ blob/data e URL() excepcional não têm testes focais.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 065 — Criação e registro da aba auxiliar
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 066 — Criação e registro da aba auxiliar
<code>      const newTab = await new Promise(resolve =&gt; {</code>

**O que faz:** adapta a API callback de ownership para Promise.

**Como faz:** resolve `owns`, `tabId` e `job` em um único objeto.

**Por que assim / alternativa pior:** permite manter o fluxo linear com await e evita continuar antes da decisão de ownership.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 067 — Criação e registro da aba auxiliar
<code>        chrome.tabs.create({ url: auxiliaryUrl, active: false }, resolve);</code>

**O que faz:** abre uma aba auxiliar em background/inativa.

**Como faz:** usa `active:false` e a URL normalizada.

**Por que assim / alternativa pior:** não roubar foco do usuário é essencial; a aba existe só para extração técnica.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 068 — Criação e registro da aba auxiliar
<code>      });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 069 — Criação e registro da aba auxiliar
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 070 — Criação e registro da aba auxiliar
<code>      context.state.extractionTabs[newTab.id] = {</code>

**O que faz:** registra o mapping da nova aba auxiliar no estado canônico.

**Como faz:** usa `newTab.id` como chave.

**Por que assim / alternativa pior:** o próximo content script precisa provar sua identidade pelo tabId real, não por URL.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 071 — Criação e registro da aba auxiliar
<code>        mangaTabId: job.mangaTabId ?? mangaTabId,</code>

**O que faz:** prefere o destino persistido no job e usa request apenas como fallback.

**Como faz:** operador nullish preserva 0 e dados válidos.

**Por que assim / alternativa pior:** o job autorizado é fonte mais confiável que o request.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 072 — Criação e registro da aba auxiliar
<code>        index: job.index ?? index,</code>

**O que faz:** prefere o índice persistido no job.

**Como faz:** cai para request somente se o job não tiver valor.

**Por que assim / alternativa pior:** impede metadado repetido/stale do request de sobrescrever a identidade real.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 073 — Criação e registro da aba auxiliar
<code>        geminiTabId: ownership.tabId,</code>

**O que faz:** grava o tabId canônico retornado pela verificação de ownership.

**Como faz:** não usa ID livre do request.

**Por que assim / alternativa pior:** replacement/canonicalização podem ter mudado o ID real do job.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 074 — Criação e registro da aba auxiliar
<code>        jobId,</code>

**O que faz:** executa a instrução concreta `jobId,` dentro de **Criação e registro da aba auxiliar**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a aba precisa ser criada e registrada como unidade coerente para o próximo estágio reconhecê-la.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 075 — Criação e registro da aba auxiliar
<code>        batchId: job.batchId ?? batchId,</code>

**O que faz:** prefere batchId persistido e usa request como fallback.

**Como faz:** preserva compatibilidade com registros antigos.

**Por que assim / alternativa pior:** o mapping deve representar a identidade real que `deliver-result-from-tab` validará depois.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 076 — Criação e registro da aba auxiliar
<code>      };</code>

**O que faz:** executa a instrução concreta `};` dentro de **Criação e registro da aba auxiliar**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a aba precisa ser criada e registrada como unidade coerente para o próximo estágio reconhecê-la.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 077 — Criação e registro da aba auxiliar
<code>      await context.updateJobState(ownership.tabId, {</code>

**O que faz:** move o job para estado explícito de espera pela extração auxiliar.

**Como faz:** atualiza o job pelo tabId canônico.

**Por que assim / alternativa pior:** o lifecycle passa a saber que a ausência de resultado direto é esperada, não travamento.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 078 — Criação e registro da aba auxiliar
<code>        state: 'awaiting_auxiliary_extraction',</code>

**O que faz:** marca semanticamente o estágio atual do job.

**Como faz:** estado nomeado é persistível/observável.

**Por que assim / alternativa pior:** deixar o job no estado anterior confundiria watchdog/recovery/diagnóstico.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 079 — Criação e registro da aba auxiliar
<code>        auxiliaryTabId: newTab.id,</code>

**O que faz:** persiste qual aba auxiliar foi criada.

**Como faz:** grava `newTab.id` junto do estado.

**Por que assim / alternativa pior:** recovery/diagnóstico precisam relacionar job e recurso temporário.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 080 — Criação e registro da aba auxiliar
<code>      });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste direto prova `tabs.create`, mapping completo e independência de `currentBatchId`.

### Linha 081 — Transição durável do job
<code>      await context.syncState();</code>

**O que faz:** persiste mapping + transição do job.

**Como faz:** aguarda o sync antes de responder sucesso.

**Por que assim / alternativa pior:** sem sync, suspensão do worker poderia esquecer a extraction tab recém-criada.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

**⚠️ Comentário extra:** o caminho principal é comprovado, porém existe ao menos uma variante de borda/erro desta linha sem assertion focal própria.

### Linha 082 — Transição durável do job
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

### Linha 083 — Transição durável do job
<code>      context.log('info', 'bg', 'AUXILIARY_EXTRACTION_REGISTERED',</code>

**O que faz:** registra sucesso do registro auxiliar sem finalizar o job.

**Como faz:** inclui job/batch reduzidos e extractionTabId.

**Por que assim / alternativa pior:** observabilidade precisa distinguir 'aba criada aguardando extração' de 'job finalizado'.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

### Linha 084 — Transição durável do job
<code>        'Aba auxiliar registrada sem finalizar o job Gemini.', {</code>

**O que faz:** executa a instrução concreta `'Aba auxiliar registrada sem finalizar o job Gemini.', {` dentro de **Transição durável do job**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

### Linha 085 — Transição durável do job
<code>          jobId: String(jobId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta `jobId: String(jobId || '').slice(0, 8),` dentro de **Transição durável do job**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

### Linha 086 — Transição durável do job
<code>          batchId: String(job.batchId || batchId || '').slice(0, 8),</code>

**O que faz:** executa a instrução concreta `batchId: String(job.batchId || batchId || '').slice(0, 8),` dentro de **Transição durável do job**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

### Linha 087 — Transição durável do job
<code>          extractionTabId: newTab.id,</code>

**O que faz:** executa a instrução concreta `extractionTabId: newTab.id,` dentro de **Transição durável do job**.

**Como faz:** usa identidades e valores estabelecidos pelas linhas anteriores.

**Por que assim / alternativa pior:** a ordem desta seção é parte do contrato de segurança e recuperação.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

### Linha 088 — Transição durável do job
<code>        });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ Teste exige `awaiting_auxiliary_extraction`, `auxiliaryTabId` e `syncState`.

### Linha 089 — Observabilidade e resposta
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ fluxo principal confirma `extractionRegistered:true`; ⚠️ conteúdo exato do log não é assertado.

### Linha 090 — Observabilidade e resposta
<code>      return { extractionRegistered: true };</code>

**O que faz:** confirma ao caller que o fallback foi registrado.

**Como faz:** retorna sucesso somente após state update e sync.

**Por que assim / alternativa pior:** o caller pode então parar de tentar o caminho direto sem supor que o job já terminou.

**Evidência:** ✅ fluxo principal confirma `extractionRegistered:true`; ⚠️ conteúdo exato do log não é assertado.

### Linha 091 — Observabilidade e resposta
<code>    },</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ fluxo principal confirma `extractionRegistered:true`; ⚠️ conteúdo exato do log não é assertado.

### Linha 092 — Observabilidade e resposta
<code>  });</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ fluxo principal confirma `extractionRegistered:true`; ⚠️ conteúdo exato do log não é assertado.

### Linha 093 — Observabilidade e resposta
<code>})(typeof self !== 'undefined' ? self : globalThis);</code>

**O que faz:** fecha o escopo sintático correspondente.

**Como faz:** mantém validações/efeitos dentro do descriptor e executor corretos.

**Por que assim / alternativa pior:** deslocar o fechamento poderia executar criação/sync fora das guardas.

**Evidência:** ✅ fluxo principal confirma `extractionRegistered:true`; ⚠️ conteúdo exato do log não é assertado.

### Linha 094 — Observabilidade e resposta
<code>␠ [linha vazia]</code>

**O que faz:** separa visualmente duas etapas do protocolo sem produzir efeito de runtime.

**Como faz:** nenhuma instrução é executada.

**Por que assim / alternativa pior:** a separação torna auditável a sequência ownership → validação → criação → persistência.

**Evidência:** ✅ fluxo principal confirma `extractionRegistered:true`; ⚠️ conteúdo exato do log não é assertado.

## 6. Invariantes

1. Payload inválido deve ser rejeitado antes de `ensureInitialized` e antes de `tabs.create`.
2. Ownership do sender é obrigatório.
3. `currentBatchId` global não é autoridade para invalidar este fallback.
4. Batch/index/mangaTabId devem ser cruzados com o job persistido.
5. HTTP(S) recebe a marca `#manga-translator-extraction`; blob/data permanecem sem manipulação indevida.
6. A aba auxiliar deve ser `active:false`.
7. O mapping deve usar `newTab.id` e identidades preferencialmente vindas do job/ownership.
8. O job deve entrar em `awaiting_auxiliary_extraction` e guardar `auxiliaryTabId`.
9. Estado deve ser sincronizado antes de responder `extractionRegistered:true`.
10. Esta action nunca deve finalizar o job diretamente.

## 7. Resultado

- Fonte integral: **SIM**.
- Todas as linhas comentadas: **SIM**.
- Validação precoce: **PROVADA**.
- Ownership: **PROVADO**.
- Independência de `currentBatchId`: **PROVADA**.
- Registro + state transition + sync: **PROVADOS**.
- Lacunas de URL/erro documentadas: **SIM**.
- Arquivo apto a `CONCLUÍDO`: **SIM**.

**Próximo arquivo somente depois de atualizar STATUS/CHECKLIST:** `extension/background/actions/deliver-result.js`.
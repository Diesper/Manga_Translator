# Bíblia técnica — `extension/background/actions/relay-progress.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `24e377893c7151ea0579964453bfc63ce0ed77f4`  
> **Linhas textuais:** **38**  
> **Posições documentais:** **39** contando newline final

## Papel arquitetural

`relay-progress.js` liga a telemetria de progresso do content script Gemini à aba leitora de mangá e, em paralelo, marca o job persistido da aba remetente como `running`.

O consumidor real é `content_gemini.js::reportProgress()`, que envia `GEMINI_PROGRESS` com `text` e normalmente `mangaTabId`. O `job-runner` chama `reportProgress` em etapas como obter imagem, aguardar interface, anexar, enviar prompt, processar e extrair resultado.

## Escolha do destino

O alvo é `request.mangaTabId || context.state.activeMangaTabId`. Isso cria duas rotas:

- destino explícito, usado pelo fluxo normal do job;
- fallback global `activeMangaTabId`, mantido por compatibilidade/recuperação.

`message-handlers-real.test.js` prova os dois caminhos e verifica que ambos enviam `{action:'PROGRESS', text}`.

## Atualização do job

A mutação de storage não usa `request.geminiTabId`. A chave é derivada de `context.sender.tab.id`: `gemini_job_<senderTabId>`. Quando existe job nessa chave, o arquivo preserva os demais campos e grava `state:'running'` e `updatedAt:Date.now()`.

Isso reduz a autoridade do payload sobre qual job é atualizado, mas não há validação adicional de ownership/jobId nesta action.

## Semântica de resposta e erro

`tabs.sendMessage` é fire-and-forget: `chrome.runtime.lastError` é apenas consumido. Logo `{ok:true}` do router pode ocorrer mesmo que o relay visual para a aba de mangá falhe.

Em contraste, erros/rejeições de `context.storage.get/set` propagam pela Promise e viram erro do router.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `actions-low-risk.test.js` | ✅ PROVADO DIRETAMENTE | Relay real para a aba, resposta assíncrona e transição do job de `opening` para `running`. |
| `routed-actions-legacy.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | GEMINI_PROGRESS passa pelo router real, envia PROGRESS e atualiza o job persistido. |
| `message-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | Destino explícito e fallback por `activeMangaTabId` encaminham progresso. |
| `content_gemini.js` | 🟨 CONSUMIDOR REAL | `reportProgress` cria mensagens GEMINI_PROGRESS e absorve lastError do envio ao background. |
| `job-runner.js` | 🟨 CONSUMIDOR INDIRETO | Emite progresso em várias fases do pipeline usando `job.mangaTabId`. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `request.text` ausente, não-string ou objeto; a action encaminha o valor sem validar.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `mangaTabId = 0`; por ser falsy, cai no fallback.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para ausência simultânea de `request.mangaTabId` e `activeMangaTabId`; nenhum relay ocorre, mas a action ainda pode atualizar storage.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para sender sem tab; nesse caso nenhum job é marcado `running`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para job inexistente na chave do sender; a action retorna sucesso sem mutação.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falha/rejeição de `storage.get` ou `storage.set`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falha de `tabs.sendMessage`; ela é intencionalmente ignorada.
- ⚠️ `allowedSources:['any']` permite qualquer source do router; não existe validator de source/job nesta action.
- ⚠️ `context.state.activeMangaTabId` é acessado diretamente; se `context.state` não existir, haverá exceção.
- ⚠️ O ACK não prova que a UI recebeu o progresso, porque o callback do tab não é aguardado como condição de sucesso.

## Invariantes

1. `request.mangaTabId` explícito tem precedência sobre `activeMangaTabId`.
2. O relay para a UI usa exatamente action `PROGRESS` e o `request.text` recebido.
3. A chave do job é derivada do sender tab, não de um tabId arbitrário do payload.
4. Job existente preserva seus outros campos ao mudar para `running`.
5. `updatedAt` é renovado junto com a transição.
6. Ausência de sender tab não deve impedir o relay de progresso.
7. Falha de `tabs.sendMessage` não bloqueia a atualização do job.
8. A documentação não deve interpretar `ok:true` como confirmação visual na aba de mangá.

## Fonte integral

~~~javascript
'use strict';
// background/actions/relay-progress.js -- Relay de progresso do Gemini para a aba do manga.

(function(scope) {
scope.MangaTranslatorRouter.registerAction({
  name: 'relay-progress',

  meta: {
    // O fallback sem aba remetente permanece por compatibilidade com o fluxo de recuperação.
    allowedSources: ['any'],
  },

  async execute(request, context) {
    const targetTabId = request.mangaTabId || context.state.activeMangaTabId;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, {
        action: 'PROGRESS',
        text: request.text,
      }, () => { if (chrome.runtime.lastError) {} });
    }

    const senderTab = context.sender && context.sender.tab;
    if (senderTab) {
      const jobKey = `gemini_job_${senderTab.id}`;
      const data = await context.storage.get([jobKey]);
      const job = data && data[jobKey];

      if (job) {
        await context.storage.set({
          [jobKey]: { ...job, state: 'running', updatedAt: Date.now() },
        });
      }
    }

    return {};
  },
});
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## Rastreabilidade 39/39

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/relay-progress.js -- Relay de progresso do Gemini para a aba do manga. | Comentário de compatibilidade: background/actions/relay-progress.js -- Relay de progresso do Gemini para a aba do manga.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 | scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |   name: 'relay-progress', | Nome canônico do alias GEMINI_PROGRESS. |
| 007 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 008 | U02 |   meta: { | Parte da expressão da unidade U02: meta: { |
| 009 | U02 |     // O fallback sem aba remetente permanece por compatibilidade com o fluxo de recuperação. | Comentário de compatibilidade: O fallback sem aba remetente permanece por compatibilidade com o fluxo de recuperação.. |
| 010 | U02 |     allowedSources: ['any'], | Permite qualquer source classificada pelo router. |
| 011 | U02 |   }, | Fecha estrutura sintática da unidade U02. |
| 012 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 013 | U03 |   async execute(request, context) { | Abre executor assíncrono porque pode ler/gravar storage. |
| 014 | U03 |     const targetTabId = request.mangaTabId \|\| context.state.activeMangaTabId; | Escolhe request.mangaTabId; se falsy, usa state.activeMangaTabId. |
| 015 | U03 |     if (targetTabId) { | Evita sendMessage quando não há alvo truthy. |
| 016 | U03 |       chrome.tabs.sendMessage(targetTabId, { | Encaminha progresso para a aba alvo. |
| 017 | U03 |         action: 'PROGRESS', | Converte GEMINI_PROGRESS em mensagem interna PROGRESS. |
| 018 | U03 |         text: request.text, | Encaminha text sem validação/normalização. |
| 019 | U03 |       }, () => { if (chrome.runtime.lastError) {} }); | Consome erro assíncrono de sendMessage sem propagá-lo. |
| 020 | U03 |     } | Fecha estrutura sintática da unidade U03. |
| 021 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 022 | U04 |     const senderTab = context.sender && context.sender.tab; | Extrai sender.tab para localizar o job associado à aba remetente. |
| 023 | U04 |     if (senderTab) { | Só toca storage quando há sender tab. |
| 024 | U04 |       const jobKey = `gemini_job_${senderTab.id}`; | Deriva chave gemini_job_<senderTab.id>; payload não escolhe a chave. |
| 025 | U04 |       const data = await context.storage.get([jobKey]); | Lê o registro persistido do job da aba remetente. |
| 026 | U04 |       const job = data && data[jobKey]; | Extrai o job da resposta de storage. |
| 027 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 028 | U04 |       if (job) { | Só persiste running quando o job existe. |
| 029 | U04 |         await context.storage.set({ | Grava snapshot do job com estado running e timestamp novo. |
| 030 | U04 |           [jobKey]: { ...job, state: 'running', updatedAt: Date.now() }, | Atualiza estado operacional do job para running. |
| 031 | U04 |         }); | Fecha estrutura sintática da unidade U04. |
| 032 | U04 |       } | Fecha estrutura sintática da unidade U04. |
| 033 | U04 |     } | Fecha estrutura sintática da unidade U04. |
| 034 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 035 | U05 |     return {}; | Conclui sem campos próprios; o router adiciona ok:true. |
| 036 | U05 |   }, | Fecha estrutura sintática da unidade U05. |
| 037 | U05 | }); | Fecha estrutura sintática da unidade U05. |
| 038 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 039 | U06 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e objetivo do relay.

### U02 — Registro e metadados
Registra GEMINI_PROGRESS como action assíncrona de source ampla.

### U03 — Relay para a aba do mangá
Escolhe alvo e envia a mensagem PROGRESS sem aguardar sucesso real do content script.

### U04 — Atualização do job remetente
Localiza `gemini_job_<senderTabId>` e grava estado `running` com novo timestamp.

### U05 — Retorno e fechamento
Retorna objeto vazio para o router adicionar `ok:true` e fecha a action/IIFE.

### U06 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 38 linhas + newline = 39/39;
- [x] destino explícito e fallback ligados a testes reais;
- [x] mutação de storage ligada à sender real;
- [x] ACK diferenciado de confirmação visual;
- [x] consumers reais verificados;
- [x] lacunas de payload/source/storage/sendMessage explicitadas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `24e377893c7151ea0579964453bfc63ce0ed77f4`.

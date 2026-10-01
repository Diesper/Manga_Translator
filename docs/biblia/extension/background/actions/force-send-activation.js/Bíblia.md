# Bíblia técnica — `extension/background/actions/force-send-activation.js`

> **Estado:** 🟡 CORRIGIDO APÓS REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `cbeea5768301008e363a087a1daf636deabb9076`  
> **Linhas textuais:** **70**  
> **Posições documentais:** **71** contando newline final  
> **Teste direto:** `tests/unit/background/force-send-activation-action.test.js` — `cab687a5e5d5dd849b6986aeeca5ac642e5b5a6a`

## Papel arquitetural

A action implementa um mecanismo de ativação forçada do Gemini. Ela pode focar temporariamente uma janela dedicada minimizada ou ativar uma aba Gemini comum, envia `DO_SEND_NOW` ao content script e tenta devolver o foco ao mangá 250 ms depois.

A busca do corpus atual não identifica um **emissor/caller operacional atual** de `FORCE_SEND_ACTIVATION`. Isso não significa ausência de integração: a action é carregada e roteável no runtime de produção.

### Cadeia de loading/dispatch

- `extension/manifest.json` declara `extension/background.js` como service worker;
- `extension/background.js` carrega `background/actions/force-send-activation.js` via `importScripts` no worker (e por `require` no harness Node), cria o router registrado e encaminha `chrome.runtime.onMessage` por `routeRegisteredAction`;
- `extension/background/router.js` mapeia `FORCE_SEND_ACTIVATION` para o nome canônico `force-send-activation`;
- `tests/unit/background/routed-actions-legacy.test.js` atravessa `background.js` e exige que `routerApi.getAction('force-send-activation')` esteja definido;
- `content_gemini.js` continua implementando o receptor `DO_SEND_NOW`.

Portanto: **loaded/registered/routable em produção = sim**; **caller/emissor operacional atual identificado = não**. A action permanece um caminho legado/reserva até surgir um producer real.

## Contrato síncrono versus efeitos assíncronos

`meta.async:false` faz o router chamar `execute()`, responder `{ok:true}` e fechar o canal imediatamente. Porém `execute()` apenas inicia `chrome.storage.local.get`; foco, mensagem e timers acontecem depois.

Assim, **a resposta positiva não confirma que DO_SEND_NOW foi recebido nem que o submit ocorreu**. Ela confirma somente que não houve exceção síncrona antes do retorno. Os callbacks também consomem `chrome.runtime.lastError` sem propagá-lo.

## Fluxos

### minimized_window

Se o modo efetivo é `minimized_window` e há `windowId`:
1. foca a janela Gemini;
2. envia `DO_SEND_NOW`;
3. o **source** agenda um timer literal de 250 ms; o teste avança o fake clock em 250 ms antes de verificar a restauração;
4. minimiza novamente;
5. procura a aba do mangá e foca sua janela atual.

O teste direto verifica essas chamadas.

### outros modos

Se há `geminiTabId`:
1. ativa a aba Gemini;
2. envia `DO_SEND_NOW`;
3. o **source** agenda um timer literal de 250 ms; o teste avança o fake clock em 250 ms antes de verificar a reativação;
4. reativa `mangaTabId`, quando fornecido.

O segundo teste direto verifica esse caminho.

## Integração com content_gemini

O handler de `DO_SEND_NOW` em `content_gemini.js`:
- responde `alreadyGenerating:true` se já há botão Stop visível;
- tenta clicar no botão Send quando habilitado;
- senão faz nudge no editor e dispara `MANGA_TRANSLATOR_TRIGGER_SEND`.

A resposta desse handler é ignorada por esta action.

## Evidência

| Fonte | Classificação | O que prova |
|---|---|---|
| `force-send-activation-action.test.js` | ✅ PROVADO DIRETAMENTE COM ESCOPO TEMPORAL | Fluxo minimized_window, fluxo por aba, DO_SEND_NOW e estado restaurado **depois de o fake clock avançar 250 ms**; o teste não prova a fronteira exata 249→250 ms. O literal `250` é prova do source. |
| `content_gemini.js` | 🟨 DEPENDÊNCIA REAL | Semântica atual de DO_SEND_NOW; não prova que FORCE_SEND_ACTIVATION seja chamado. |
| `job-runner.js` | 🟨 EVIDÊNCIA ARQUITETURAL | O submit principal atual usa `submitWithConfirmation`; o retry local declara não disparar DO_SEND_NOW. |
| `routed-actions-legacy.test.js` | 🟨 GATE DE CARREGAMENTO | Mantém ações legadas carregáveis; não prova os branches deste arquivo. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para request sem `geminiTabId`, sem `mangaTabId`, ou `minimized_window` sem `windowId`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para storage e request com modos conflitantes, embora o código dê prioridade ao request.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falhas de `storage.local.get`, `windows.update`, `tabs.update`, `tabs.get` ou `tabs.sendMessage`.
- ⚠️ Não há `validate()` para os IDs.
- ⚠️ `allowedSources:['any']` não adiciona restrição de origem nesta action.
- ⚠️ Os timers de 250 ms não são persistentes através de restart/suspensão do service worker.
- ⚠️ A resposta `ok:true` não é ACK do submit.
- ⚠️ Não há caller de produção atual identificado para `FORCE_SEND_ACTIVATION`.

## Invariantes

1. `executionMode` do request prevalece sobre storage; fallback final é `temp_chat`.
2. O fluxo de janela minimizada exige `windowId`.
3. `DO_SEND_NOW` só é enviado após callback da ativação/foco.
4. O source agenda a restauração com literal `250`; o teste confirma que ela já ocorreu após avançar o fake clock em 250 ms, mas não fixa a fronteira temporal exata.
5. Erros assíncronos das APIs Chrome não alteram a resposta já enviada.
6. Esta action não verifica o resultado lógico do submit.
7. A documentação não deve tratar este caminho como usado em produção sem um caller real.

## Fonte integral

~~~javascript
'use strict';
// background/actions/force-send-activation.js -- Ativa o envio imediato no Gemini.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'force-send-activation',

    meta: {
      // Contrato atual mantém a solicitação disponível a qualquer contexto autorizado da extensão.
      allowedSources: ['any'],
      async: false,
    },

    execute(request) {
      const { geminiTabId, mangaTabId, windowId, executionMode } = request;

      chrome.storage.local.get(['geminiExecutionMode'], (storage) => {
        const mode = executionMode || storage.geminiExecutionMode || 'temp_chat';

        if (mode === 'minimized_window' && windowId) {
          chrome.windows.update(windowId, { focused: true }, () => {
            chrome.tabs.sendMessage(
              geminiTabId,
              { action: 'DO_SEND_NOW' },
              () => { if (chrome.runtime.lastError) {} }
            );

            setTimeout(() => {
              chrome.windows.update(
                windowId,
                { state: 'minimized', focused: false },
                () => { if (chrome.runtime.lastError) {} }
              );

              if (mangaTabId) {
                chrome.tabs.get(mangaTabId, (mangaTab) => {
                  if (mangaTab && mangaTab.windowId) {
                    chrome.windows.update(
                      mangaTab.windowId,
                      { focused: true },
                      () => { if (chrome.runtime.lastError) {} }
                    );
                  }
                });
              }
            }, 250);
          });
        } else if (geminiTabId) {
          chrome.tabs.update(geminiTabId, { active: true }, () => {
            chrome.tabs.sendMessage(
              geminiTabId,
              { action: 'DO_SEND_NOW' },
              () => { if (chrome.runtime.lastError) {} }
            );

            setTimeout(() => {
              if (mangaTabId) {
                chrome.tabs.update(
                  mangaTabId,
                  { active: true },
                  () => { if (chrome.runtime.lastError) {} }
                );
              }
            }, 250);
          });
        }
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 71/71

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/force-send-activation.js -- Ativa o envio imediato no Gemini. | Comentário de contrato: background/actions/force-send-activation.js -- Ativa o envio imediato no Gemini.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: `(function(scope) {`. |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |     name: 'force-send-activation', | Nome canônico usado pelo alias FORCE_SEND_ACTIVATION. |
| 007 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 008 | U02 |     meta: { | Parte da expressão da unidade U02: `meta: {`. |
| 009 | U02 |       // Contrato atual mantém a solicitação disponível a qualquer contexto autorizado da extensão. | Comentário de contrato: Contrato atual mantém a solicitação disponível a qualquer contexto autorizado da extensão.. |
| 010 | U02 |       allowedSources: ['any'], | Não restringe a source pelo router. |
| 011 | U02 |       async: false, | O router responde de forma síncrona quando execute retorna. |
| 012 | U02 |     }, | Fecha estrutura sintática da unidade U02. |
| 013 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 014 | U03 |     execute(request) { | Abre o executor; os efeitos reais ocorrem em callbacks de APIs Chrome. |
| 015 | U03 |       const { geminiTabId, mangaTabId, windowId, executionMode } = request; | Extrai IDs e modo diretamente do request; não existe validate local. |
| 016 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 017 | U03 |       chrome.storage.local.get(['geminiExecutionMode'], (storage) => { | Lê o modo persistido de execução. |
| 018 | U03 |         const mode = executionMode \|\| storage.geminiExecutionMode \|\| 'temp_chat'; | Prioridade: request.executionMode, storage, depois temp_chat. |
| 019 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 020 | U04 |         if (mode === 'minimized_window' && windowId) { | Seleciona o fluxo de janela dedicada quando também existe windowId. |
| 021 | U04 |           chrome.windows.update(windowId, { focused: true }, () => { | Foca temporariamente a janela do Gemini. |
| 022 | U04 |             chrome.tabs.sendMessage( | Envia mensagem interna à aba Gemini. |
| 023 | U04 |               geminiTabId, | Parte da expressão da unidade U04: `geminiTabId,`. |
| 024 | U04 |               { action: 'DO_SEND_NOW' }, | Solicita submit imediato ao content_gemini. |
| 025 | U04 |               () => { if (chrome.runtime.lastError) {} } | Consome erro da API sem propagá-lo. |
| 026 | U04 |             ); | Fecha estrutura sintática da unidade U04. |
| 027 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 028 | U04 |             setTimeout(() => { | Agenda restauração de foco após 250 ms. |
| 029 | U04 |               chrome.windows.update( | Parte da expressão da unidade U04: `chrome.windows.update(`. |
| 030 | U04 |                 windowId, | Parte da expressão da unidade U04: `windowId,`. |
| 031 | U04 |                 { state: 'minimized', focused: false }, | Retorna a janela Gemini ao estado minimizado. |
| 032 | U04 |                 () => { if (chrome.runtime.lastError) {} } | Consome erro da API sem propagá-lo. |
| 033 | U04 |               ); | Fecha estrutura sintática da unidade U04. |
| 034 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 035 | U04 |               if (mangaTabId) { | Restaura o foco somente quando há id da aba do mangá. |
| 036 | U04 |                 chrome.tabs.get(mangaTabId, (mangaTab) => { | Obtém a janela atual da aba do mangá. |
| 037 | U04 |                   if (mangaTab && mangaTab.windowId) { | Usa a windowId atual do mangá para devolver foco. |
| 038 | U04 |                     chrome.windows.update( | Parte da expressão da unidade U04: `chrome.windows.update(`. |
| 039 | U04 |                       mangaTab.windowId, | Usa a windowId atual do mangá para devolver foco. |
| 040 | U04 |                       { focused: true }, | Parte da expressão da unidade U04: `{ focused: true },`. |
| 041 | U04 |                       () => { if (chrome.runtime.lastError) {} } | Consome erro da API sem propagá-lo. |
| 042 | U04 |                     ); | Fecha estrutura sintática da unidade U04. |
| 043 | U04 |                   } | Fecha estrutura sintática da unidade U04. |
| 044 | U04 |                 }); | Fecha estrutura sintática da unidade U04. |
| 045 | U04 |               } | Fecha estrutura sintática da unidade U04. |
| 046 | U04 |             }, 250); | Parte da expressão da unidade U04: `}, 250);`. |
| 047 | U04 |           }); | Fecha estrutura sintática da unidade U04. |
| 048 | U05 |         } else if (geminiTabId) { | Fallback para ativação por aba. |
| 049 | U05 |           chrome.tabs.update(geminiTabId, { active: true }, () => { | Ativa a aba Gemini antes de DO_SEND_NOW. |
| 050 | U05 |             chrome.tabs.sendMessage( | Envia mensagem interna à aba Gemini. |
| 051 | U05 |               geminiTabId, | Parte da expressão da unidade U05: `geminiTabId,`. |
| 052 | U05 |               { action: 'DO_SEND_NOW' }, | Solicita submit imediato ao content_gemini. |
| 053 | U05 |               () => { if (chrome.runtime.lastError) {} } | Consome erro da API sem propagá-lo. |
| 054 | U05 |             ); | Fecha estrutura sintática da unidade U05. |
| 055 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 056 | U05 |             setTimeout(() => { | Agenda restauração de foco após 250 ms. |
| 057 | U05 |               if (mangaTabId) { | Restaura o foco somente quando há id da aba do mangá. |
| 058 | U05 |                 chrome.tabs.update( | Reativa a aba alvo no fluxo por abas. |
| 059 | U05 |                   mangaTabId, | Parte da expressão da unidade U05: `mangaTabId,`. |
| 060 | U05 |                   { active: true }, | Marca a aba alvo como ativa. |
| 061 | U05 |                   () => { if (chrome.runtime.lastError) {} } | Consome erro da API sem propagá-lo. |
| 062 | U05 |                 ); | Fecha estrutura sintática da unidade U05. |
| 063 | U05 |               } | Fecha estrutura sintática da unidade U05. |
| 064 | U05 |             }, 250); | Parte da expressão da unidade U05: `}, 250);`. |
| 065 | U05 |           }); | Fecha estrutura sintática da unidade U05. |
| 066 | U05 |         } | Fecha estrutura sintática da unidade U05. |
| 067 | U06 |       }); | Fecha estrutura sintática da unidade U06. |
| 068 | U06 |     }, | Fecha estrutura sintática da unidade U06. |
| 069 | U06 |   }); | Fecha estrutura sintática da unidade U06. |
| 070 | U06 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha a IIFE com self/globalThis. |
| 071 | U07 | ⏎ [newline final] | Newline terminal do blob; posição editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e intenção do arquivo.

### U02 — Registro e contrato síncrono
Registra a action, mantém source ampla e marca `async:false`. A consequência principal é responder antes dos callbacks assíncronos.

### U03 — Seleção do modo
Lê `geminiExecutionMode` e aplica a precedência request → storage → `temp_chat`.

### U04 — Janela minimizada
Foco temporário, DO_SEND_NOW, re-minimização e restauração da janela do mangá.

### U05 — Ativação por aba
Ativa Gemini, envia DO_SEND_NOW e reativa a aba do mangá.

### U06 — Fechamento
Finaliza os callbacks e a IIFE; não existe retorno assíncrono ao router.

### U07 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA e fonte integral conferidos;
- [x] 70 linhas + newline = 71/71;
- [x] os dois branches foram ligados às assertions reais;
- [x] semântica `async:false` confrontada com o router;
- [x] handler DO_SEND_NOW verificado;
- [x] ausência de caller de produção atual registrada;
- [x] lacunas de API/IDs/timers explicitadas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `cbeea5768301008e363a087a1daf636deabb9076`.

> **Correção pós-REAUDIT:** 250 ms é literal diretamente observável no source; a suíte prova restauração até/depois do avanço de 250 ms, não a fronteira temporal exata. A action está carregada e roteável no service worker, embora nenhum producer atual de `FORCE_SEND_ACTIVATION` tenha sido identificado.

# Bíblia técnica — `extension/background/actions/set-debug-mode.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `92e4149b1bba2f8d0a4ce3d6881539565801776d`  
> **Linhas textuais:** **39**  
> **Posições documentais:** **40** contando newline final

## Papel arquitetural

`set-debug-mode.js` é o ponto central para alterar o modo de depuração global. Ele persiste `debugMode` em `chrome.storage.local` por meio de `context.storage` e em seguida faz broadcast `DEBUG_MODE_CHANGED` para todas as abas retornadas por `chrome.tabs.query({})`.

O caller real é o toggle de debug do popup. O consumidor explícito da mensagem de broadcast é `content_manga.js`, que chama `applyDebugDrawer(request.debugOn)`. Outros módulos, como `content_gemini.js`, também leem/observam `debugMode` diretamente no storage, portanto a persistência é a fonte durável e o broadcast é uma atualização imediata de UI.

## Ordem de efeitos

A action primeiro executa `await context.storage.set({debugMode})`. Só depois consulta abas e dispara mensagens. Assim, se a persistência rejeitar, o broadcast não acontece.

Depois do `tabs.query`, o envio para cada aba é fire-and-forget: erros de `tabs.sendMessage` são consumidos por `chrome.runtime.lastError` e não alteram o sucesso global.

## Validação

`debugOn` precisa ser booleano estrito. Strings como `'true'`, números, null e undefined são rejeitados pelo mesmo guard. A suíte direta prova explicitamente a string `'true'`.

## Caller e consumidor

`popup.js` lê o estado inicial de `debugMode`, inverte o toggle e envia `{action:'SET_DEBUG_MODE', debugOn: next}`. O teste de integração do popup prova a emissão da mensagem.

`content_manga.js` reage a `DEBUG_MODE_CHANGED` chamando `applyDebugDrawer`. A action faz broadcast para todas as abas porque não tenta saber quais possuem content script; falhas em abas sem listener são silenciosamente ignoradas.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `actions-low-risk.test.js` | ✅ PROVADO DIRETAMENTE | Persistência `debugMode:true`, broadcast para duas abas, resposta assíncrona e rejeição de `'true'`. |
| `routed-actions-legacy.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | A action passa pelo router real, persiste e avisa múltiplas abas. |
| `handlers-extra-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | Persistência e broadcast para todas as tabs abertas no módulo real. |
| `popup.advanced.ui.test.js` | ✅ PROVA DO CALLER | Clique no toggle envia SET_DEBUG_MODE com `debugOn:true`. |
| `content_manga.js` | 🟨 CONSUMIDOR REAL | DEBUG_MODE_CHANGED atualiza o drawer de debug. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `debugOn:false` percorrendo persistência + broadcast.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `storage.set` rejeitando; nesse caso a action falha antes do broadcast.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `tabs.query` sinalizar `runtime.lastError`, retornar undefined ou lançar.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para uma ou mais abas sem content script; o código ignora o `lastError` de cada envio.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para zero abas.
- ⚠️ `allowedSources:['any']` permite alteração do modo por qualquer source aceita pelo router; não há restrição a popup/options.
- ⚠️ O popup aplica visualmente o novo estado no callback sem verificar `response.ok`; uma falha do background pode deixar UI do popup divergente até a próxima leitura de storage.
- ⚠️ O broadcast não espera ACKs; sucesso da action significa persistência concluída + mensagens disparadas, não que todas as abas aplicaram a mudança.

## Segurança e privacidade

- `debugMode` é configuração global persistida da extensão.
- Ativar debug pode alterar retenção/fechamento de superfícies em outros módulos; portanto não é apenas cosmético.
- A action não transmite conteúdo de páginas, apenas um booleano.
- A source ampla aumenta autoridade de quem pode mudar comportamento global; o contrato atual depende do boundary geral de mensagens da extensão.

## Invariantes

1. `debugOn` deve continuar booleano estrito.
2. Persistência deve ocorrer antes do broadcast.
3. Broadcast deve usar `DEBUG_MODE_CHANGED` com o mesmo valor persistido.
4. Falha em uma aba individual não deve abortar o broadcast às demais.
5. O estado durável em storage é a fonte canônica entre reinicializações do service worker.
6. A action permanece assíncrona enquanto aguarda storage/query.

## Fonte integral

~~~javascript
'use strict';
// background/actions/set-debug-mode.js - Alterna e propaga o modo de depuracao.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'set-debug-mode',

    meta: {
      // Contrato atual mantém a alteração disponível a qualquer contexto da extensão.
      allowedSources: ['any'],
      async: true,
    },

    validate(request) {
      if (typeof request.debugOn !== 'boolean') {
        return {
          code: 'INVALID_PAYLOAD',
          message: 'debugOn deve ser um booleano',
        };
      }
      return null;
    },

    async execute(request, context) {
      await context.storage.set({ debugMode: request.debugOn });

      const tabs = await new Promise(resolve => {
        chrome.tabs.query({}, resolve);
      });
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'DEBUG_MODE_CHANGED', debugOn: request.debugOn },
          () => { if (chrome.runtime.lastError) {} }
        );
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## Rastreabilidade 40/40

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/set-debug-mode.js - Alterna e propaga o modo de depuracao. | Comentário de compatibilidade: background/actions/set-debug-mode.js - Alterna e propaga o modo de depuracao.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |     name: 'set-debug-mode', | Nome canônico do alias SET_DEBUG_MODE. |
| 007 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 008 | U02 |     meta: { | Parte da expressão da unidade U02: meta: { |
| 009 | U02 |       // Contrato atual mantém a alteração disponível a qualquer contexto da extensão. | Comentário de compatibilidade: Contrato atual mantém a alteração disponível a qualquer contexto da extensão.. |
| 010 | U02 |       allowedSources: ['any'], | Não restringe a source no router. |
| 011 | U02 |       async: true, | Declara explicitamente canal assíncrono. |
| 012 | U02 |     }, | Fecha estrutura sintática da unidade U02. |
| 013 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 014 | U03 |     validate(request) { | Abre validator pré-execução. |
| 015 | U03 |       if (typeof request.debugOn !== 'boolean') { | Exige valor booleano estrito. |
| 016 | U03 |         return { | Parte da expressão da unidade U03: return { |
| 017 | U03 |           code: 'INVALID_PAYLOAD', | Classifica tipo inválido como payload inválido. |
| 018 | U03 |           message: 'debugOn deve ser um booleano', | Mensagem estável de erro de validação. |
| 019 | U03 |         }; | Fecha estrutura sintática da unidade U03. |
| 020 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 021 | U03 |       return null; | Indica payload válido. |
| 022 | U03 |     }, | Fecha estrutura sintática da unidade U03. |
| 023 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 024 | U04 |     async execute(request, context) { | Abre executor assíncrono. |
| 025 | U04 |       await context.storage.set({ debugMode: request.debugOn }); | Persiste debugMode antes de tentar broadcast. |
| 026 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 027 | U04 |       const tabs = await new Promise(resolve => { | Converte callback de tabs.query em Promise. |
| 028 | U04 |         chrome.tabs.query({}, resolve); | Obtém todas as abas visíveis à extensão. |
| 029 | U04 |       }); | Fecha estrutura sintática da unidade U04. |
| 030 | U04 |       tabs.forEach((tab) => { | Percorre cada aba retornada. |
| 031 | U04 |         chrome.tabs.sendMessage( | Envia mudança de debug para a aba. |
| 032 | U04 |           tab.id, | Usa o id da aba iterada. |
| 033 | U04 |           { action: 'DEBUG_MODE_CHANGED', debugOn: request.debugOn }, | Nome da mensagem de broadcast para content scripts. |
| 034 | U04 |           () => { if (chrome.runtime.lastError) {} } | Consome erro por aba sem falhar a action. |
| 035 | U04 |         ); | Fecha estrutura sintática da unidade U04. |
| 036 | U04 |       }); | Fecha estrutura sintática da unidade U04. |
| 037 | U04 |     }, | Fecha estrutura sintática da unidade U04. |
| 038 | U05 |   }); | Fecha estrutura sintática da unidade U05. |
| 039 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 040 | U06 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e objetivo de alternar/propagar debug.

### U02 — Registro e metadados
Registra SET_DEBUG_MODE com canal assíncrono e source ampla.

### U03 — Validação booleana
Rejeita qualquer valor que não seja booleano estrito.

### U04 — Persistência e broadcast
Grava storage, lista abas e dispara DEBUG_MODE_CHANGED em cada uma.

### U05 — Fechamento
Fecha executor, action e IIFE.

### U06 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 39 linhas + newline = 40/40;
- [x] persistência, broadcast e validação ligados a assertions reais;
- [x] caller e consumidor real identificados;
- [x] storage durável separado do broadcast fire-and-forget;
- [x] lacunas de false/query/storage/source explicitadas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `92e4149b1bba2f8d0a4ce3d6881539565801776d`.

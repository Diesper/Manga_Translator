# Bíblia técnica — `extension/background/actions/get-tab-id.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `2f3b26304ac12a671927b1abefc2a914d7eaa372`  
> **Linhas textuais:** **17**  
> **Posições documentais:** **18** contando newline final

## Papel arquitetural

A action responde `GET_TAB_ID` usando **o sender fornecido pelo runtime**, não um id enviado no payload. O valor retornado é `sender.tab.id` quando disponível; sem tab válida retorna `null`.

Esse comportamento tem dois usos reais:
- `content_manga.js` obtém o próprio tabId para telemetria de áudio;
- `content_gemini.js` mantém um fallback legado de descoberta do job: quando `CLAIM_GEMINI_JOB` não é suportado, pede `GET_TAB_ID` e consulta `gemini_job_<tabId>`.

## Contrato do router versus contrato integrado

A action declara `async:false`. No router isolado, o retorno `{tabId: 41}` é embrulhado como:

`{ok:true, tabId:41}`

Porém `background.js` mantém `GET_TAB_ID` em `legacyResponseActions` e remove `ok:true` antes de responder ao caller. Por isso os testes integrados observam apenas:

`{tabId: 72}`

Essa remoção de `ok` **não é feita por get-tab-id.js**; é uma camada de compatibilidade do background.

## Segurança e autoridade

A action ignora completamente o request e deriva o id de `context.sender`. Isso evita confiar em um `tabId` arbitrário enviado pelo caller.

Ao mesmo tempo, `allowedSources:['any']` significa que o router não restringe a categoria de origem desta action. Cada caller recebe apenas o id de sua própria sender tab quando existe.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `tests/unit/background/actions-low-risk.test.js` | ✅ PROVADO DIRETAMENTE | A action real retorna o id 41 da aba Gemini e usa canal síncrono. |
| `tests/unit/background/router.test.js` | 🟨 PROVA DO ROUTER | O router síncrono adiciona `ok:true`; o teste usa uma action registrada inline, não este arquivo real. |
| `tests/unit/background/routed-actions-legacy.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | GET_TAB_ID passa pelo roteador e a compatibilidade remove `ok`, retornando apenas `tabId`. |
| `tests/unit/background/message-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | Um sender de manga recebe seu próprio tabId. |
| `content_gemini.js` | 🟨 CONSUMIDOR REAL | Usa GET_TAB_ID apenas no fallback legado após claim não suportado. |
| `content_manga.js` | 🟨 CONSUMIDOR REAL | Usa GET_TAB_ID para atribuir telemetria de áudio à aba leitora. |

## Lacunas

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `context` ausente, `sender` ausente ou sender sem `tab`; o código deve retornar `tabId:null`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para popup/external source chamando esta action, apesar de `allowedSources:['any']`.
- ⚠️ Não existe `validate()`, porque o payload não é utilizado.
- ⚠️ A telemetria `TAB_ID_OBSERVED` é emitida em `background.js`, não nesta action; não deve ser atribuída ao arquivo.
- ⚠️ O fallback legado do Gemini depende de `GET_TAB_ID`, mas o fluxo principal atual prefere `CLAIM_GEMINI_JOB`.

## Invariantes

1. Nunca aceitar tabId vindo do request.
2. Quando sender.tab existe, devolver exatamente `sender.tab.id`.
3. Quando sender/tab não existe, devolver `null`.
4. Não abrir canal assíncrono.
5. Não tocar storage, tabs API ou estado global.
6. A remoção de `ok:true` pertence ao adaptador de compatibilidade em `background.js`.
7. O fluxo moderno de claim não deve ser substituído por GET_TAB_ID sem motivo de compatibilidade.

## Fonte integral

~~~javascript
'use strict';
// background/actions/get-tab-id.js — Retorna a aba do content script Gemini.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'get-tab-id',
    meta: {
      // Contrato atual de compatibilidade: responde para qualquer contexto da extensão.
      allowedSources: ['any'],
      async: false,
    },
    execute(_request, context) {
      const sender = context && context.sender;
      return { tabId: sender && sender.tab ? sender.tab.id : null };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 18/18

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/get-tab-id.js — Retorna a aba do content script Gemini. | Comentário de compatibilidade: background/actions/get-tab-id.js — Retorna a aba do content script Gemini.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: `(function(scope) {`. |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |     name: 'get-tab-id', | Nome canônico usado pelo alias GET_TAB_ID. |
| 007 | U02 |     meta: { | Parte da expressão da unidade U02: `meta: {`. |
| 008 | U02 |       // Contrato atual de compatibilidade: responde para qualquer contexto da extensão. | Comentário de compatibilidade: Contrato atual de compatibilidade: responde para qualquer contexto da extensão.. |
| 009 | U02 |       allowedSources: ['any'], | Permite qualquer source classificada pelo router. |
| 010 | U02 |       async: false, | Define resposta síncrona: o canal não fica aberto. |
| 011 | U02 |     }, | Fecha estrutura sintática da unidade U02. |
| 012 | U03 |     execute(_request, context) { | Executa sem usar payload; a única entrada relevante é context.sender. |
| 013 | U03 |       const sender = context && context.sender; | Extrai defensivamente o sender do context. |
| 014 | U03 |       return { tabId: sender && sender.tab ? sender.tab.id : null }; | Retorna sender.tab.id quando existe; caso contrário retorna null. |
| 015 | U03 |     }, | Fecha estrutura sintática da unidade U03. |
| 016 | U04 |   }); | Fecha estrutura sintática da unidade U04. |
| 017 | U04 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 018 | U05 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Declara strict mode e o objetivo de retornar a aba do content script remetente.

### U02 — Registro e metadados
Registra a action, mantém origem ampla por compatibilidade e informa ao router que a resposta é síncrona.

### U03 — Extração do sender.tab.id
Não usa o payload. Lê somente `context.sender` e devolve o id ou `null`.

### U04 — Fechamento
Fecha executor, action e IIFE.

### U05 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 17 linhas + newline = 18/18 posições;
- [x] action real, router e compatibilidade de background diferenciados;
- [x] dois consumidores reais identificados;
- [x] fallback legado do Gemini separado do claim moderno;
- [x] lacunas de sender ausente/source ampla explicitadas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `2f3b26304ac12a671927b1abefc2a914d7eaa372`.

# Bíblia técnica — `extension/background/actions/request-image-data.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `2491262323966a256d61d741e9c23420acccee2f`  
> **Linhas textuais:** **32**  
> **Posições documentais:** **33** contando newline final  
> **Teste direto:** `tests/unit/background/request-image-data-action.test.js` — `b04cd6cac53339fb479c19b7977acb61339ffdd9`

## Papel arquitetural

Esta action é uma ponte entre o lado Gemini e a aba leitora. Ela recebe `mangaTabId` + `index`, envia `REQUEST_IMAGE_DATA` à aba de mangá e devolve a resposta do content script.

Ela **não extrai imagem**. A extração real está em `content_manga.js`, que tenta canvas/toDataURL e, se isso falhar, usa `FETCH_IMAGE_AS_BASE64` como fallback privilegiado.

## Consumidor upstream

`job-runner.js::requestImageData(job)` envia `REQUEST_IMAGE_DATA` com `job.mangaTabId` e `job.index`. Se não recebe `response.srcData`, tenta novamente até 5 vezes com intervalo de 1 segundo.

Esses retries pertencem ao consumidor; esta action faz apenas uma tentativa de `chrome.tabs.sendMessage` por chamada.

## Destino downstream

`content_manga.js` procura uma imagem cujo `dataset.mangaIndex == request.index`. Se encontra, tenta serializar via canvas preservando JPEG/WebP quando possível. Em erro de canvas/CORS, chama `FETCH_IMAGE_AS_BASE64`. Se não encontra a imagem, responde `{error:'Image not found'}`.

## Compatibilidade de resposta

O `execute()` desta action devolve exatamente a resposta do content script. No router isolado, a camada genérica acrescentaria `ok:true`; no `background.js` integrado, `REQUEST_IMAGE_DATA` está em `legacyResponseActions`, então esse `ok:true` é removido antes de responder ao caller legado.

Isso explica por que testes integrados observam diretamente `{srcData...}`, `{base64...}` ou `{error...}` sem envelope `ok`.

## Erro de transporte

Se `chrome.runtime.lastError` existe no callback de `tabs.sendMessage`, a action resolve `{error:lastError.message}` em vez de rejeitar. O teste direto prova o caso `Could not establish connection.`.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `request-image-data-action.test.js` | ✅ PROVADO DIRETAMENTE | Destino/tab, index, preservação da resposta do content e conversão de `lastError` em `{error}`. |
| `message-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | Relay integrado para aba existente e erro integrado quando tabId não existe. |
| `job-runner.js` | 🟨 CONSUMIDOR REAL | Faz até 5 tentativas e exige `srcData` para sucesso. |
| `content_manga.js` | 🟨 DESTINO REAL | Implementa busca da imagem, canvas e fallback FETCH_IMAGE_AS_BASE64. |
| `background.js` | 🟦 GATE/ADAPTADOR DE COMPATIBILIDADE | Remove `ok:true` das respostas de REQUEST_IMAGE_DATA no contrato legado. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `mangaTabId` ausente, null, string ou valor negativo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `index` ausente, string, negativo ou fora do conjunto de imagens.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para callback responder `undefined` sem `lastError`; a action resolve `undefined`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para content script responder `{error:'Image not found'}` através desta action isolada.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `tabs.sendMessage` lançar sincronicamente antes de registrar callback.
- ⚠️ Não existe `validate()` local.
- ⚠️ `allowedSources:['any']` não restringe quem pode pedir relay; `mangaTabId` e `index` vêm diretamente do payload.
- ⚠️ A action não verifica ownership entre sender Gemini, mangaTabId e job persistido.
- ⚠️ Uma resposta sem `srcData` não é erro de transporte para a action; é o `job-runner` que decide repetir.

## Segurança e privacidade

- A action pode transportar bytes de imagem em Data URL na resposta; isso é conteúdo potencialmente grande e sensível ao contexto da página.
- Não há persistência local nessa action.
- O destino é escolhido pelo `mangaTabId` recebido; não há allowlist/ownership local.
- O fallback privilegiado de CORS ocorre somente no content_manga/background via outra action, não aqui.

## Invariantes

1. O relay deve enviar exatamente `REQUEST_IMAGE_DATA` + `index` ao tab indicado.
2. A resposta do content script deve ser preservada sem transformação, salvo `runtime.lastError`.
3. `runtime.lastError` deve virar `{error: message}`.
4. A action não deve duplicar a lógica de extração de `content_manga.js`.
5. Repetição/retry continua responsabilidade do `job-runner`.
6. Compatibilidade sem `ok:true` no background integrado pertence ao adaptador de `background.js`, não a este arquivo.

## Fonte integral

~~~javascript
'use strict';
// background/actions/request-image-data.js -- Encaminha a requisicao de pagina a aba do manga.

(function(scope) {
  if (!scope.MangaTranslatorRouter ||
      typeof scope.MangaTranslatorRouter.registerAction !== 'function') {
    throw new Error('MangaTranslatorRouter indisponivel para registrar request-image-data');
  }

  scope.MangaTranslatorRouter.registerAction({
    name: 'request-image-data',
    meta: {
      // Contrato atual mantém mensagens aceitas de qualquer contexto da extensão.
      allowedSources: ['any'],
    },
    execute(request) {
      return new Promise(resolve => {
        chrome.tabs.sendMessage(
          request.mangaTabId,
          { action: 'REQUEST_IMAGE_DATA', index: request.index },
          response => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
              return;
            }
            resolve(response);
          }
        );
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 33/33

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/request-image-data.js -- Encaminha a requisicao de pagina a aba do manga. | Comentário de contrato: background/actions/request-image-data.js -- Encaminha a requisicao de pagina a aba do manga.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 |   if (!scope.MangaTranslatorRouter \|\| | Verifica se o router existe. |
| 006 | U02 |       typeof scope.MangaTranslatorRouter.registerAction !== 'function') { | Exige API de registro válida. |
| 007 | U02 |     throw new Error('MangaTranslatorRouter indisponivel para registrar request-image-data'); | Falha cedo quando bootstrap do router está incompleto. |
| 008 | U02 |   } | Fecha estrutura sintática da unidade U02. |
| 009 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 010 | U03 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action. |
| 011 | U03 |     name: 'request-image-data', | Nome canônico do alias REQUEST_IMAGE_DATA. |
| 012 | U03 |     meta: { | Parte da expressão da unidade U03: meta: { |
| 013 | U03 |       // Contrato atual mantém mensagens aceitas de qualquer contexto da extensão. | Comentário de contrato: Contrato atual mantém mensagens aceitas de qualquer contexto da extensão.. |
| 014 | U03 |       allowedSources: ['any'], | Não restringe a source no router. |
| 015 | U03 |     }, | Fecha estrutura sintática da unidade U03. |
| 016 | U04 |     execute(request) { | Abre executor; não usa context. |
| 017 | U04 |       return new Promise(resolve => { | Converte callback de tabs.sendMessage em Promise. |
| 018 | U04 |         chrome.tabs.sendMessage( | Encaminha a solicitação para a aba de mangá indicada pelo payload. |
| 019 | U04 |           request.mangaTabId, | Usa mangaTabId recebido sem validação local. |
| 020 | U04 |           { action: 'REQUEST_IMAGE_DATA', index: request.index }, | Envia a mesma action interna ao content_manga com o índice. |
| 021 | U04 |           response => { | Recebe a resposta do content script. |
| 022 | U04 |             if (chrome.runtime.lastError) { | Detecta falha de transporte Chrome no callback. |
| 023 | U04 |               resolve({ error: chrome.runtime.lastError.message }); | Detecta falha de transporte Chrome no callback. |
| 024 | U04 |               return; | Impede resolver novamente após erro. |
| 025 | U04 |             } | Fecha estrutura sintática da unidade U04. |
| 026 | U04 |             resolve(response); | Preserva exatamente a resposta recebida do content_manga. |
| 027 | U04 |           } | Fecha estrutura sintática da unidade U04. |
| 028 | U04 |         ); | Fecha estrutura sintática da unidade U04. |
| 029 | U04 |       }); | Fecha estrutura sintática da unidade U04. |
| 030 | U05 |     }, | Fecha estrutura sintática da unidade U05. |
| 031 | U05 |   }); | Fecha estrutura sintática da unidade U05. |
| 032 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 033 | U06 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e objetivo de relay da página.

### U02 — Fail-fast do router
Evita registrar a action sem router disponível.

### U03 — Registro e metadados
Registra REQUEST_IMAGE_DATA com source ampla.

### U04 — Relay tabs.sendMessage
Encaminha tab/index, transforma lastError e preserva a resposta.

### U05 — Fechamento
Fecha Promise, executor, action e IIFE.

### U06 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 32 linhas + newline = 33/33;
- [x] happy path e erro de transporte ligados a assertions reais;
- [x] consumidor, destino e adaptador legado diferenciados;
- [x] ausência de validação/ownership explicitada;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `2491262323966a256d61d741e9c23420acccee2f`.

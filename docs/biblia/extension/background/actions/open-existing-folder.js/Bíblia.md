# Bíblia técnica — `extension/background/actions/open-existing-folder.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `59ef82cbf960e360eb404fbd969067f017021607`  
> **Linhas textuais:** **38**  
> **Posições documentais:** **39** contando newline final

## Papel arquitetural

Esta action tenta revelar uma pasta já existente usando o histórico de downloads do Chrome. Ela possui uma cadeia de fallback:

1. tentar `anchorId` persistido;
2. se o anchor não existir, procurar qualquer download cujo `filename` case com `folderPath`;
3. se a busca não encontrar nada, delegar para `handleMarkerAndShow(safeTitle)`, que pode criar um `_anchor.png` temporário.

O consumidor real é o popup ao abrir a pasta de um capítulo que já possui paths salvos.

## Ramo 1 — anchorId

Quando `anchorId` é truthy, a action chama `chrome.downloads.search({id: anchorId})`.

Ela só reutiliza esse id se houver resultado e `results[0].exists` for truthy. Então chama `chrome.downloads.show(anchorId)` e responde sucesso.

Esse ramo é provado pela suíte isolada da action e por teste integrado do background.

## Ramo 2 — busca por folderPath

Se não há anchor válido, a action escapa metacaracteres de regex em `folderPath` e usa `chrome.downloads.search({filenameRegex: escapedPath})`.

A suíte `regex-escape.test.js` prova pontos, parênteses, `+`, `*`, `?` e um path complexo.

### Assimetria importante

Neste ramo, basta `results.length > 0`. O código **não verifica `exists` nem `state === 'complete'`** antes de usar `results[0].id`.

Isso difere do ramo de `anchorId`, que exige `exists:true`. Portanto um primeiro resultado stale/inexistente pode ser escolhido mesmo que outro resultado válido esteja depois na lista.

## Ramo 3 — marker

Quando a busca por path não encontra resultados, a action chama `context.handleMarkerAndShow(safeTitle, resolve)`.

Os testes do helper real provam criação do `_anchor.png`, show, remoção após 4 s e resposta de erro em falha de criação. A suíte isolada desta action também prova que o fallback é realmente invocado quando a busca retorna `[]`.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `open-existing-folder-action.test.js` | ✅ PROVADO DIRETAMENTE | Reuso de anchor existente e fallback para marker; também prova escape de ponto no path. |
| `regex-escape.test.js` | ✅ PROVADO NO BACKGROUND REAL | Escape de metacaracteres e regex utilizável em paths reais. |
| `handlers-extra-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | AnchorId válido abre o item e evita novo download. |
| `message-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | Busca por folderPath encontra item existente e chama show. |
| `marker-anchor-real.test.js` | ✅ PROVADO DIRETAMENTE DO HELPER | Criação, cleanup em 4 s e falha do marcador; complementa, mas não substitui a action. |
| `popup.js` | 🟨 CONSUMIDOR REAL | Constrói folderPath a partir de path salvo e envia SHOW_EXISTING_FOLDER. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `folderPath` ausente/não-string; `.replace()` lançaria.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `safeTitle` ausente no fallback de marker.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `anchorId = 0`; por ser falsy, cai na busca por path.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para anchor search retornar `exists:false` e então encontrar path válido.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para path search retornar primeiro resultado `exists:false`/interrompido.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para múltiplos resultados em que apenas um posterior é válido.
- ⚠️ Erros/`runtime.lastError` de `downloads.search` e `downloads.show` não são propagados.
- ⚠️ `downloads.show` é fire-and-forget; `ok:true` significa solicitação feita, não confirmação do SO.
- ⚠️ Não há `validate()` local para os campos do request.

## Invariantes

1. Anchor válido deve ser tentado antes da busca por path.
2. Anchor só deve ser reutilizado quando `exists:true`.
3. `folderPath` deve ser escapado antes de virar `filenameRegex`.
4. Busca vazia deve delegar para `handleMarkerAndShow`.
5. O marker helper recebe `safeTitle` e o `resolve` da Promise externa.
6. O caller só recebe sucesso após o ramo escolhido chamar `resolve`.
7. A documentação não deve confundir testes do helper com prova do wiring da action.

## Fonte integral

~~~javascript
'use strict';
// background/actions/open-existing-folder.js -- Abre uma pasta existente ou cria seu marcador.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'open-existing-folder',
    meta: { allowedSources: ['any'] },
    execute(request, context) {
      const { folderPath, safeTitle, anchorId } = request;
      return new Promise(resolve => {
        const fallbackSearch = () => {
          const escapedPath = folderPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          chrome.downloads.search({ filenameRegex: escapedPath }, results => {
            if (results?.length > 0) {
              chrome.downloads.show(results[0].id);
              resolve({ ok: true });
            } else {
              context.handleMarkerAndShow(safeTitle, resolve);
            }
          });
        };

        if (anchorId) {
          chrome.downloads.search({ id: anchorId }, results => {
            if (results?.length > 0 && results[0].exists) {
              chrome.downloads.show(anchorId);
              resolve({ ok: true });
            } else {
              fallbackSearch();
            }
          });
        } else {
          fallbackSearch();
        }
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 39/39

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/open-existing-folder.js -- Abre uma pasta existente ou cria seu marcador. | Comentário de intenção: background/actions/open-existing-folder.js -- Abre uma pasta existente ou cria seu marcador.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |     name: 'open-existing-folder', | Nome canônico do alias SHOW_EXISTING_FOLDER. |
| 007 | U02 |     meta: { allowedSources: ['any'] }, | Não restringe a categoria de source. |
| 008 | U02 |     execute(request, context) { | Abre executor assíncrono baseado em callbacks. |
| 009 | U02 |       const { folderPath, safeTitle, anchorId } = request; | Extrai folderPath, safeTitle e anchorId sem validate local. |
| 010 | U03 |       return new Promise(resolve => { | Cria Promise resolvida pelos callbacks de search/show/marker. |
| 011 | U03 |         const fallbackSearch = () => { | Declara busca secundária por caminho quando anchor não serve. |
| 012 | U03 |           const escapedPath = folderPath.replace(/[.*+?^${}()\|[\]\\]/g, '\\$&'); | Escapa metacaracteres regex do folderPath literal. |
| 013 | U03 |           chrome.downloads.search({ filenameRegex: escapedPath }, results => { | Busca downloads cujo filename casa com o caminho escapado. |
| 014 | U03 |             if (results?.length > 0) { | Considera sucesso quando há ao menos um resultado; neste ramo não verifica exists/state. |
| 015 | U03 |               chrome.downloads.show(results[0].id); | Revela o primeiro resultado da busca por caminho. |
| 016 | U03 |               resolve({ ok: true }); | Resolve sucesso logo após solicitar downloads.show. |
| 017 | U03 |             } else { | Parte da expressão da unidade U03: } else { |
| 018 | U03 |               context.handleMarkerAndShow(safeTitle, resolve); | Delega criação/reuso de marcador quando a busca por caminho falha. |
| 019 | U03 |             } | Fecha estrutura sintática da unidade U03. |
| 020 | U03 |           }); | Fecha estrutura sintática da unidade U03. |
| 021 | U03 |         }; | Fecha estrutura sintática da unidade U03. |
| 022 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 023 | U04 |         if (anchorId) { | Prioriza id persistido quando truthy. |
| 024 | U04 |           chrome.downloads.search({ id: anchorId }, results => { | Busca exatamente o registro do anchorId. |
| 025 | U04 |             if (results?.length > 0 && results[0].exists) { | Considera sucesso quando há ao menos um resultado; neste ramo não verifica exists/state. |
| 026 | U04 |               chrome.downloads.show(anchorId); | Revela diretamente o anchor conhecido. |
| 027 | U04 |               resolve({ ok: true }); | Resolve sucesso logo após solicitar downloads.show. |
| 028 | U04 |             } else { | Parte da expressão da unidade U04: } else { |
| 029 | U04 |               fallbackSearch(); | Cai para busca por caminho quando anchor falta/não existe. |
| 030 | U04 |             } | Fecha estrutura sintática da unidade U04. |
| 031 | U04 |           }); | Fecha estrutura sintática da unidade U04. |
| 032 | U04 |         } else { | Parte da expressão da unidade U04: } else { |
| 033 | U04 |           fallbackSearch(); | Cai para busca por caminho quando anchor falta/não existe. |
| 034 | U04 |         } | Fecha estrutura sintática da unidade U04. |
| 035 | U05 |       }); | Fecha estrutura sintática da unidade U05. |
| 036 | U05 |     }, | Fecha estrutura sintática da unidade U05. |
| 037 | U05 |   }); | Fecha estrutura sintática da unidade U05. |
| 038 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 039 | U06 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e intenção de abrir pasta existente ou criar marcador.

### U02 — Registro e entrada
Registra a action, aceita qualquer source e extrai os três campos do request sem validator.

### U03 — Fallback por folderPath
Escapa regex, busca downloads e usa marker quando nenhum resultado aparece.

### U04 — Reuso de anchorId
Tenta o id persistido primeiro e exige `exists:true`.

### U05 — Fechamento
Fecha Promise, executor e IIFE.

### U06 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 38 linhas + newline = 39/39;
- [x] anchor, path search e marker tratados como ramos separados;
- [x] regex real ligada a testes específicos;
- [x] helper marker separado da action;
- [x] assimetria de `exists` documentada;
- [x] gaps de payload/APIs/múltiplos resultados explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `59ef82cbf960e360eb404fbd969067f017021607`.

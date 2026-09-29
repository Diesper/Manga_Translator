# Bíblia técnica — `extension/background/actions/export-all.js`

> **Estado:** ✅ CRIADO, REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `6160a220094dd14b3fef760570dec8ae37a32244`  
> **Linhas textuais:** **40**.  
> **Posições documentais:** **41** incluindo newline final.  
> **Teste direto:** `tests/unit/background/export-all-action.test.js` — `9ab092d95ac1cef8b2111e76a23422f7159a4fcf`.

## 1. Papel arquitetural

Exporta em paralelo todas as páginas materializadas pelo popup e, quando o lote termina, revela o último download que concluiu com sucesso. Falhas individuais são tratadas como terminais para não travar a barreira global.

## 2. Consumidor

`popup.js` carrega os Base64 capítulo a capítulo somente quando o usuário pede exportação, constrói `allDownloads` com filenames sanitizados por título e não envia a mensagem quando a lista está vazia. A action mantém seu próprio guard defensivo para callers alternativos.

## 3. Semântica best-effort

A resposta final é `{ok:true}` mesmo se alguns itens falharem. A action não retorna contagem de falhas. `lastCompletedId` só é atualizado em sucesso, portanto `downloads.show` aponta para o último arquivo que realmente completou, não necessariamente o último da lista.

## 4. Evidência

| Fonte | Classificação | O que prova |
|---|---|---|
| `export-all-action.test.js` | ✅ PROVADO DIRETAMENTE | Guard de lista vazia, prefixo idempotente, dois downloads, espera e show do último concluído. |
| `message-handlers-real.test.js` | ✅ PROVADO DIRETAMENTE EM BACKGROUND COMPLETO | Três downloads reais pelo dispatcher e exatamente um show ao fim. |
| `download-wait.test.js` | ✅ PROVADO DIRETAMENTE DO HELPER | Complete, interrupção, timeout e cleanup de listeners/timer. Não prova como esta action reporta esses erros. |
| `export-guard.test.js` | ⚠️ MIRROR/SIMULAÇÃO COMPLEMENTAR | Reimplementa o handler no próprio teste; cobre `undefined`, mas não executa `export-all.js`. Não conta como prova direta. |

## 5. Lacunas

### allDownloads inválido

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para valor truthy não-array; `.forEach` pode lançar. `undefined` só possui mirror test.

### Item inválido

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `filename` ausente/não-string, URL inválida ou objeto malformado.

### Falha imediata individual

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** da action para `runtime.lastError`/id indefinido e continuidade do restante do lote.

### Interrupção/timeout

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** da action confirmando que erro do helper ainda conta o item e o lote responde ok.

### Todos falham / ordem fora de ordem

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todos falharem (sem show) ou conclusão em ordem diferente da criação.

### `downloads.show`

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para erro/lastError em show; a action não aguarda confirmação.

## 6. Invariantes

1. Lista vazia responde imediatamente sem downloads.
2. Cada item incrementa `completed` exatamente uma vez.
3. Falha individual não pode impedir a barreira de chegar ao total.
4. Filename recebe no máximo um prefixo `MangaTranslator/`.
5. `lastCompletedId` só muda no callback de sucesso.
6. Show só ocorre depois de todos os itens terminarem e se houve sucesso.
7. Resposta final é best-effort e não implica 100% dos arquivos salvos.

## 7. Fonte integral

~~~javascript
'use strict';
// background/actions/export-all.js -- Exporta páginas salvas e abre o último arquivo concluído.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'export-all',
    meta: { allowedSources: ['any'] },
    execute(request, context) {
      const downloads = request.allDownloads || [];
      if (downloads.length === 0) return { ok: true };

      return new Promise(resolve => {
        let lastCompletedId = null;
        let completed = 0;
        const finishOne = () => {
          completed += 1;
          if (completed !== downloads.length) return;
          if (lastCompletedId) chrome.downloads.show(lastCompletedId);
          resolve({ ok: true });
        };

        downloads.forEach(({ url, filename }) => {
          const normalizedFilename = filename.startsWith('MangaTranslator/')
            ? filename
            : `MangaTranslator/${filename}`;
          chrome.downloads.download({ url, filename: normalizedFilename, saveAs: false }, id => {
            if (chrome.runtime.lastError || id === undefined) {
              finishOne();
              return;
            }
            context.waitForDownload(id, doneId => {
              lastCompletedId = doneId;
              finishOne();
            }, finishOne);
          });
        });
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## 8. Rastreabilidade 41/41

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 01 | U01 | 'use strict'; | Ativa strict mode. |
| 02 | U01 | // background/actions/export-all.js -- Exporta páginas salvas e abre o último arquivo concluído. | Comentário de U01: “background/actions/export-all.js -- Exporta páginas salvas e abre o último arquivo concluído.”. |
| 03 | U01 | ␠ [linha vazia] | Separador visual de U01. |
| 04 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`. |
| 05 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action. |
| 06 | U02 |     name: 'export-all', | Define nome canônico de EXPORT_ALL_AND_SHOW. |
| 07 | U02 |     meta: { allowedSources: ['any'] }, | Permite qualquer source classificada pelo router. |
| 08 | U02 |     execute(request, context) { | Abre executor. |
| 09 | U02 |       const downloads = request.allDownloads \|\| []; | Normaliza allDownloads falsy para array vazio. |
| 10 | U02 |       if (downloads.length === 0) return { ok: true }; | Retorna sucesso imediato sem abrir canal de downloads. |
| 11 | U02 | ␠ [linha vazia] | Separador visual de U02. |
| 12 | U03 |       return new Promise(resolve => { | Cria barreira assíncrona para o lote. |
| 13 | U03 |         let lastCompletedId = null; | Guarda o id do download que completou com sucesso mais recentemente. |
| 14 | U03 |         let completed = 0; | Inicializa contador de itens em estado terminal. |
| 15 | U03 |         const finishOne = () => { | Declara a função comum de contabilização. |
| 16 | U03 |           completed += 1; | Conta um item terminado, por sucesso ou falha. |
| 17 | U03 |           if (completed !== downloads.length) return; | Bloqueia finalização até todos os itens chegarem ao callback terminal. |
| 18 | U03 |           if (lastCompletedId) chrome.downloads.show(lastCompletedId); | Mostra o último download bem-sucedido apenas se existe. |
| 19 | U03 |           resolve({ ok: true }); | Conclui o lote com sucesso best-effort. |
| 20 | U03 |         }; | Fecha estrutura de U03. |
| 21 | U03 | ␠ [linha vazia] | Separador visual de U03. |
| 22 | U04 |         downloads.forEach(({ url, filename }) => { | Itera todos os descritores de download. |
| 23 | U04 |           const normalizedFilename = filename.startsWith('MangaTranslator/') | Começa normalização de raiz do filename. |
| 24 | U04 |             ? filename | Preserva filename já prefixado. |
| 25 | U04 |             : `MangaTranslator/${filename}`; | Adiciona raiz canônica a filename relativo. |
| 26 | U04 |           chrome.downloads.download({ url, filename: normalizedFilename, saveAs: false }, id => { | Inicia download silencioso do item. |
| 27 | U04 |             if (chrome.runtime.lastError \|\| id === undefined) { | Trata falha imediata como item terminal sem id válido. |
| 28 | U04 |               finishOne(); | Atualiza a barreira de conclusão para este item. |
| 29 | U04 |               return; | Evita instalar waitForDownload para criação falha. |
| 30 | U04 |             } | Fecha estrutura de U04. |
| 31 | U05 |             context.waitForDownload(id, doneId => { | Espera estado terminal do download iniciado. |
| 32 | U05 |               lastCompletedId = doneId; | Atualiza o id a ser revelado para o último sucesso que completou. |
| 33 | U05 |               finishOne(); | Atualiza a barreira de conclusão para este item. |
| 34 | U05 |             }, finishOne); | Usa `finishOne` como callback de erro/interrupção/timeout. |
| 35 | U05 |           }); | Fecha estrutura de U05. |
| 36 | U05 |         }); | Fecha estrutura de U05. |
| 37 | U06 |       }); | Fecha estrutura de U06. |
| 38 | U06 |     }, | Fecha estrutura de U06. |
| 39 | U06 |   }); | Fecha estrutura de U06. |
| 40 | U06 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 41 | U07 | ⏎ [newline final] | Preserva newline terminal; posição editorial. |

## 9. Análise por unidade

### U01 — 1–3: Cabeçalho

**O que faz:** Ativa strict mode e declara exportação de páginas salvas com abertura do último download concluído.

**Como faz:** Diretiva e comentário antes da IIFE.

**Por que desta forma:** Define semântica best-effort de exportação agregada.

**Alternativa ingênua e risco:** Sem contrato claro, seria fácil confundir último item da lista com último download realmente concluído.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### U02 — 4–11: Registro e guard de lista vazia

**O que faz:** Registra `export-all`, normaliza `request.allDownloads` para array vazio quando falsy e retorna sucesso imediato se não há itens.

**Como faz:** `const downloads = request.allDownloads || []`; guard antes da Promise/forEach.

**Por que desta forma:** Evita canal IPC pendurado quando não existe iteração para acionar o contador final.

**Alternativa ingênua e risco:** Sem guard, `forEach` vazio nunca chamaria `finishOne` e o caller poderia esperar indefinidamente.

**Evidência:** ✅ PROVADO DIRETAMENTE — `export-all-action.test.js` exige zero downloads e resposta ok para `[]`. ⚠️ `undefined` é coberto apenas pelo mirror `export-guard.test.js`, não pela action real.

### U03 — 12–21: Agregador de completude

**O que faz:** Mantém `lastCompletedId` e contador; só resolve quando cada item chegou a um estado terminal do ponto de vista da action.

**Como faz:** `finishOne` incrementa completed, compara com `downloads.length`, mostra o último id bem-sucedido se existir e resolve ok.

**Por que desta forma:** Downloads podem terminar fora de ordem e falhar individualmente; o lote não deve responder antes de todos terem terminado/falhado.

**Alternativa ingênua e risco:** Resolver no primeiro callback perderia downloads ainda em curso; usar o último id criado não representa necessariamente o último concluído.

**Evidência:** ✅ PROVADO DIRETAMENTE — dois downloads completam e `show(12)` ocorre depois; teste integrado com três itens exige três downloads e um show. ⚠️ Ordem de conclusão invertida e cenário todos falham não têm testes focais.

### U04 — 22–30: Normalização e criação de cada download

**O que faz:** Para cada item, preserva filename já prefixado ou adiciona `MangaTranslator/`, inicia download silencioso e conta falha imediata como item terminado.

**Como faz:** `forEach` destructures url/filename; `startsWith` normaliza; `downloads.download` callback verifica lastError/id undefined.

**Por que desta forma:** Uma falha individual não deve travar a exportação inteira; todos os arquivos ficam sob raiz canônica.

**Alternativa ingênua e risco:** Abortar o lote no primeiro erro impede exportar páginas restantes; prefixar sempre duplicaria a raiz.

**Evidência:** ✅ PROVADO DIRETAMENTE para filename relativo e já prefixado. ✅ Background integrado prova três downloads. ⚠️ Falha imediata (`lastError/id undefined`) não tem teste da action.

### U05 — 31–36: Espera de estado terminal

**O que faz:** Para downloads iniciados, espera complete/interrupted/timeout; só complete atualiza `lastCompletedId`, enquanto erro chama apenas `finishOne`.

**Como faz:** Passa callback de sucesso e `finishOne` como onError ao helper.

**Por que desta forma:** Falha individual é best-effort: conta para a barreira de conclusão sem impedir outros arquivos.

**Alternativa ingênua e risco:** Não contar erro manteria `completed < total` para sempre; tratar erro como `lastCompletedId` tentaria mostrar download falho.

**Evidência:** ✅ `download-wait.test.js` prova complete/interrupted/timeout do helper. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** da action para erro/timeout e para a decisão de ainda responder `{ok:true}`.

### U06 — 37–40: Fechamento

**O que faz:** Fecha Promise, executor, registro e IIFE.

**Como faz:** Delimitadores + self/globalThis.

**Por que desta forma:** Padrão de bootstrap do background.

**Alternativa ingênua e risco:** Mudança parcial de módulo quebraria loader.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### U07 — 41–41: Newline final

**O que faz:** Documenta newline terminal.

**Como faz:** Posição editorial.

**Por que desta forma:** Equivalência física.

**Alternativa ingênua e risco:** Falso 100% se omitido.

**Evidência:** 🟦 GATE DOCUMENTAL.

## 10. Auditoria final

- [x] SHA/fonte integral;
- [x] 40 linhas + newline = 41/41;
- [x] mirror separado de prova real;
- [x] best-effort e gaps de erro explicitados;
- [x] nenhum código funcional alterado.

**Veredito documental:** ✅ APROVADO para `6160a220094dd14b3fef760570dec8ae37a32244`.

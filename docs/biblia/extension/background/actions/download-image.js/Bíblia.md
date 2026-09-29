# Bíblia técnica — `extension/background/actions/download-image.js`

> **Estado:** ✅ CRIADO, REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `408102f057ab6a584314e9108b9f4329440204bb`  
> **Tipo:** action assíncrona de download unitário.  
> **Linhas textuais:** **31**.  
> **Posições documentais:** **32** com newline final.  
> **Teste direto principal:** `tests/unit/background/download-image-action.test.js` — `9305ba72e1d62406128ce7a5cd77b945a0b44c83`.

## 1. Papel arquitetural

Esta action materializa uma imagem individual no sistema de downloads do Chrome e devolve o **caminho final real**. `content_manga.js` usa `filePath` e `downloadId` para serializar `<chapterId>_paths`, `mangaTranslatorLastPath` e `<chapterId>_dlId` quando autoDownload está ativo.

## 2. Contrato de filename

Se o caller envia `chapter/page.png`, a action transforma em `MangaTranslator/chapter/page.png`. Se já recebe `MangaTranslator/...`, preserva o valor. O teste integrado do background cobre os dois casos.

Não existe sanitização local de `..`, barras alternativas, caracteres inválidos ou filename ausente; a action pressupõe caller válido/normalização do Chrome.

## 3. Lifecycle do download

Depois de `downloads.download`, a action usa o helper real `waitForDownload`. O helper escuta `downloads.onChanged`, filtra por id, remove listener em complete/interrupted e possui safety timeout de 10 minutos. Em complete, a action faz `downloads.search` para obter o filename final escolhido pelo browser.

## 4. Matriz de evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `download-image-action.test.js` | ✅ PROVADO DIRETAMENTE | Prefixo de filename, argumentos de `downloads.download`, wiring de `waitForDownload`, search e resposta `filePath/downloadId`. |
| `message-handlers-real.test.js` — `1c2815cd1f2fecba58a07c568f24d69af0367af3` | ✅ PROVADO DIRETAMENTE EM BACKGROUND COMPLETO | DOWNLOAD_IMAGE com filename relativo e já prefixado produz paths sob `MangaTranslator/`. |
| `download-wait.test.js` — `1bb13ac03ab0bcaff68921211679355f9971678c` | ✅ PROVADO DIRETAMENTE DO HELPER | Complete, id estranho, cleanup de listener, interrupção, timeout, cancelamento de timer e paralelismo. Não prova a resposta desta action nos ramos de erro. |

## 5. Lacunas e riscos

### Payload sem validator

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** e sem `validate()` para filename ausente/não-string, URL ausente/inválida, path traversal lógico ou filename vazio. `request.filename.startsWith` lança quando filename não é string.

### Falha imediata do download

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `chrome.runtime.lastError` ou id indefinido.

### Interrupção e timeout pela action

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que dispare esta action e confirme a resposta `{error:...}` nos callbacks de erro do helper.

### Search pós-download

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `downloads.search` vazio, `runtime.lastError`, exceção ou callback ausente.

### Exceção assíncrona do helper/API

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** se `waitForDownload` lançar dentro do callback de `downloads.download`; como isso ocorre assíncronamente, a Promise externa não possui catch explícito para transformar a exceção em resposta.

## 6. Análise crítica

1. **O caminho feliz é coberto em dois níveis**: action isolada e background completo.
2. **O helper de espera é bem testado**, mas não se deve promover seus testes a prova da resposta da action nos erros.
3. **A normalização de prefixo é idempotente** para `MangaTranslator/`.
4. **A action confia no caller para URL/filename**, o principal gap de robustez.
5. **O caminho real retornado por search é o dado certo para persistência**, em vez do filename solicitado.

## 7. Invariantes

1. Filename relativo recebe exatamente um prefixo `MangaTranslator/`.
2. Filename já prefixado não recebe prefixo duplicado.
3. `saveAs` permanece false para autoDownload silencioso.
4. Sem downloadId válido, não chamar waitForDownload.
5. Só devolver filePath depois de estado complete e search.
6. downloadId retornado corresponde ao id concluído.
7. Interrupção/timeout devem virar erro e não filePath.
8. O caller não deve persistir path quando `filePath` estiver ausente.

## 8. Fonte integral

~~~javascript
'use strict';
// background/actions/download-image.js -- Baixa uma imagem e devolve seu caminho final.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'download-image',
    meta: { allowedSources: ['any'] },
    execute(request, context) {
      const filename = request.filename.startsWith('MangaTranslator/')
        ? request.filename
        : `MangaTranslator/${request.filename}`;

      return new Promise(resolve => {
        chrome.downloads.download({ url: request.url, filename, saveAs: false }, id => {
          if (chrome.runtime.lastError || id === undefined) {
            resolve({ error: chrome.runtime.lastError?.message || 'Falha no download' });
            return;
          }
          context.waitForDownload(
            id,
            doneId => chrome.downloads.search({ id: doneId }, results => {
              if (results?.[0]) resolve({ filePath: results[0].filename, downloadId: doneId });
              else resolve({ error: 'Arquivo não encontrado' });
            }),
            err => resolve({ error: err.message })
          );
        });
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);

~~~

## 9. Rastreabilidade 32/32

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 01 | U01 | 'use strict'; | Ativa strict mode. |
| 02 | U01 | // background/actions/download-image.js -- Baixa uma imagem e devolve seu caminho final. | Comentário de U01: “background/actions/download-image.js -- Baixa uma imagem e devolve seu caminho final.”. |
| 03 | U01 | ␠ [linha vazia] | Separador visual de U01. |
| 04 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`. |
| 05 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 06 | U02 |     name: 'download-image', | Define o nome canônico do alias DOWNLOAD_IMAGE. |
| 07 | U02 |     meta: { allowedSources: ['any'] }, | Permite qualquer source classificada pelo router. |
| 08 | U02 |     execute(request, context) { | Abre executor assíncrono via Promise. |
| 09 | U02 |       const filename = request.filename.startsWith('MangaTranslator/') | Começa a normalização do caminho relativo solicitado. |
| 10 | U02 |         ? request.filename | Preserva filename já prefixado. |
| 11 | U02 |         : `MangaTranslator/${request.filename}`; | Prefixa filenames relativos com a raiz da extensão. |
| 12 | U02 | ␠ [linha vazia] | Separador visual de U02. |
| 13 | U03 |       return new Promise(resolve => { | Cria a Promise que só resolve em falha imediata ou estado terminal do download. |
| 14 | U03 |         chrome.downloads.download({ url: request.url, filename, saveAs: false }, id => { | Solicita o download usando URL do request, filename normalizado e `saveAs:false`. |
| 15 | U03 |           if (chrome.runtime.lastError \|\| id === undefined) { | Falha fechada quando Chrome não fornece downloadId válido. |
| 16 | U03 |             resolve({ error: chrome.runtime.lastError?.message \|\| 'Falha no download' }); | Transforma falha imediata em resposta de erro consumível pelo caller. |
| 17 | U03 |             return; | Impede registrar waitForDownload após falha de criação. |
| 18 | U03 |           } | Fecha a estrutura sintática de U03. |
| 19 | U03 |           context.waitForDownload( | Instala a espera de estado terminal do download real. |
| 20 | U04 |             id, | Completa a expressão de U04 com `id,`. |
| 21 | U04 |             doneId => chrome.downloads.search({ id: doneId }, results => { | Após complete, consulta metadata do download pelo id concluído. |
| 22 | U04 |               if (results?.[0]) resolve({ filePath: results[0].filename, downloadId: doneId }); | Se há metadata, devolve filename real e downloadId. |
| 23 | U04 |               else resolve({ error: 'Arquivo não encontrado' }); | Transforma falha imediata em resposta de erro consumível pelo caller. |
| 24 | U04 |             }), | Fecha a estrutura sintática de U04. |
| 25 | U04 |             err => resolve({ error: err.message }) | Transforma falha imediata em resposta de erro consumível pelo caller. |
| 26 | U04 |           ); | Fecha a estrutura sintática de U04. |
| 27 | U04 |         }); | Fecha a estrutura sintática de U04. |
| 28 | U04 |       }); | Fecha a estrutura sintática de U04. |
| 29 | U05 |     }, | Fecha a estrutura sintática de U05. |
| 30 | U05 |   }); | Fecha a estrutura sintática de U05. |
| 31 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 32 | U06 | ⏎ [newline final] | Preserva newline terminal; posição editorial. |

## 10. Análise por unidade

### U01 — linhas/posição 1–3: Cabeçalho

**O que faz:** Ativa strict mode e declara que a action baixa uma imagem e devolve o caminho final.

**Como faz:** Diretiva e comentário antes da IIFE.

**Por que desta forma:** O caminho de arquivo retornado é consumido para persistir `_paths` do capítulo.

**Por que uma implementação ingênua seria pior:** Retornar apenas downloadId exigiria nova busca pelo caller e duplicaria lógica.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento real.

### U02 — linhas/posição 4–12: Registro e normalização do filename

**O que faz:** Registra `download-image` e garante o prefixo `MangaTranslator/` quando ele não está presente.

**Como faz:** Usa `request.filename.startsWith` e ternário; filename já prefixado é preservado.

**Por que desta forma:** Mantém todos os downloads da extensão sob uma raiz previsível sem duplicar o prefixo.

**Por que uma implementação ingênua seria pior:** Prefixar sempre produziria `MangaTranslator/MangaTranslator/...`; não prefixar espalharia arquivos no diretório de downloads.

**Evidência:** ✅ PROVADO DIRETAMENTE para filename não prefixado; ✅ `message-handlers-real.test.js` prova também filename já prefixado. ⚠️ Filename ausente/não-string não tem validator nem teste.

### U03 — linhas/posição 13–19: Criação do download e falha imediata

**O que faz:** Inicia o download com `saveAs:false`; se Chrome reporta `lastError` ou id indefinido, retorna erro.

**Como faz:** A callback de `chrome.downloads.download` resolve a Promise externa com `{error:...}` no erro.

**Por que desta forma:** Sem um downloadId válido não é possível esperar conclusão ou buscar o caminho final.

**Por que uma implementação ingênua seria pior:** Passar id indefinido para `waitForDownload` deixaria listener/timer inútil e resposta incorreta.

**Evidência:** ✅ O caminho de sucesso é provado diretamente. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `runtime.lastError` ou id `undefined` nesta action.

### U04 — linhas/posição 20–28: Espera de conclusão, busca do path e erro terminal

**O que faz:** Espera o download terminar; em sucesso busca metadata pelo id e retorna `filePath/downloadId`; em interrupção/timeout retorna `err.message`.

**Como faz:** `context.waitForDownload` recebe callbacks de complete/error; complete chama `downloads.search`; ausência de resultado vira `Arquivo não encontrado`.

**Por que desta forma:** O caller precisa do caminho real escolhido pelo Chrome, não apenas do filename solicitado.

**Por que uma implementação ingênua seria pior:** Persistir o filename solicitado como path absoluto seria incorreto; responder antes do download completar geraria paths inexistentes.

**Evidência:** ✅ PROVADO DIRETAMENTE no caminho completo feliz. ✅ `download-wait.test.js` prova o helper para complete/interrupted/timeout/cleanup. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** da action para interrupção, timeout, search vazio ou erro de search.

### U05 — linhas/posição 29–31: Fechamento

**O que faz:** Fecha Promise, executor, action e IIFE.

**Como faz:** Delimitadores e fallback self/globalThis.

**Por que desta forma:** Mantém padrão de bootstrap clássico do background.

**Por que uma implementação ingênua seria pior:** Alteração parcial para módulos quebraria loaders atuais.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### U06 — linhas/posição 32–32: Newline final

**O que faz:** Documenta o newline terminal.

**Como faz:** Posição editorial após 31 linhas.

**Por que desta forma:** Equivalência física.

**Por que uma implementação ingênua seria pior:** Omitir gera falso 100%.

**Evidência:** 🟦 GATE DOCUMENTAL.

## 11. Auditoria final

- [x] SHA/fonte integral;
- [x] 31 linhas + newline = 32/32;
- [x] consumidor e helper reais verificados;
- [x] happy path separado de error paths sem prova;
- [x] nenhum código funcional alterado.

**Veredito documental:** ✅ APROVADO para `408102f057ab6a584314e9108b9f4329440204bb`.

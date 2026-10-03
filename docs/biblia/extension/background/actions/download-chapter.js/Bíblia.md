# Bíblia técnica — `extension/background/actions/download-chapter.js`

> **Estado:** ✅ CRIADO, REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `8636a03c8a2038ebbb26103db7f63b578699733e`  
> **Tipo:** action assíncrona de download/abertura de pasta.  
> **Linhas textuais:** **34**.  
> **Posições documentais:** **35** incluindo newline final.  
> **Teste direto principal:** `tests/unit/background/download-chapter-action.test.js` — `ff0ecb6249b24b8453bc886df4724be27f492e10`.

## 1. Papel arquitetural

`download-chapter` unifica dois comandos do popup: `DOWNLOAD_CHAPTER_AND_SHOW` e `OPEN_CHAPTER_FOLDER`. Ele tenta reutilizar um download/anchor conhecido quando possível; se não puder, baixa páginas ou cria/abre um marker de pasta.

## 2. Consumidor real

`popup.js` usa `OPEN_CHAPTER_FOLDER` quando possui `anchorId`/estado de download e usa `DOWNLOAD_CHAPTER_AND_SHOW` quando precisa materializar imagens. O popup já sanitiza `safeTitle` e normalmente só chama download quando existem imagens.

## 3. Helpers do background

`downloadImagesAndShow` ordena índices, dispara downloads, espera estados terminais, persiste `<chapId>_paths`, `mangaTranslatorLastPath` e `<chapId>_dlId`, então mostra o último download concluído. A implementação atual retorna uma Promise que resolve, sem rejeição explícita.

`handleMarkerAndShow` procura arquivo existente; se não houver, cria `_anchor.png`, mostra e agenda remoção após 4 s. Seus testes cobrem sucesso, cleanup e falha de criação.

## 4. Matriz de evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `download-chapter-action.test.js` | ✅ PROVADO DIRETAMENTE | Reuso de anchor existente sem redownload e caminho sem anchor que chama `downloadImagesAndShow` com argumentos corretos. |
| `message-handlers-real.test.js` — `1c2815cd1f2fecba58a07c568f24d69af0367af3` | ✅ PROVADO DIRETAMENTE EM BACKGROUND COMPLETO | `OPEN_CHAPTER_FOLDER` com anchorId real chama `downloads.show` e não baixa novamente. |
| `marker-anchor-real.test.js` — `6a6c977a1a2bad89a49813153039e17a93945017` | ✅ PROVADO DIRETAMENTE DO HELPER | `handleMarkerAndShow`: marker path, show, remoção em 4 s e falha de criação. Não dispara esta action. |

## 5. Lacunas e riscos

### Ramo `images:{}` pela action

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que despache `download-chapter` com conjunto vazio e confirme `handleMarkerAndShow`. O helper isolado é bem testado, mas isso não prova a delegação da action.

### AnchorId inexistente

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `downloads.search` retornar vazio ou `exists:false` e então cair em `fallbackDownload`.

### Payload sem validação

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** e sem validator local para `images` ausente/não-objeto, `safeTitle` ausente e `chapId` ausente. `Object.keys(request.images)` lança se `images` não existir.

### Falhas da API downloads

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `downloads.search`/`downloads.show` com `runtime.lastError`, exceção ou callback que não chega. `show` também não é aguardado.

### Rejeição do helper de download

⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para uma implementação de `downloadImagesAndShow` que rejeite. A action encadeia apenas `.then`; nesse cenário a Promise externa não possui caminho explícito de resolução/catch. O helper real atual não rejeita deliberadamente.

## 6. Análise crítica

1. **Reuso de anchor evita IO desnecessário** e é diretamente provado.
2. **A action depende fortemente do contrato dos callers/helpers** porque não possui `validate()`.
3. **O helper de marker é robustamente testado**, mas a ligação `images vazio → helper` ainda não.
4. **A Promise externa é uma camada extra:** funciona com os helpers atuais, mas torna propagação de rejeição menos clara.
5. **`downloads.show` é fire-and-forget**; resposta `{ok:true}` significa que a solicitação foi feita, não que o sistema operacional mostrou a pasta com garantia.

## 7. Invariantes

1. Anchor existente e `exists:true` deve evitar redownload.
2. Sem anchorId, o fluxo deve ir direto ao fallback.
3. Imagens não vazias devem usar `downloadImagesAndShow(images,safeTitle,chapId)`.
4. Imagens vazias devem usar `handleMarkerAndShow(safeTitle,resolve)`.
5. A resposta positiva só deve acontecer após o helper/callback escolhido sinalizar conclusão.
6. OPEN_CHAPTER_FOLDER e DOWNLOAD_CHAPTER_AND_SHOW devem continuar apontando para a mesma action enquanto compartilham semântica.
7. Mudanças no contrato de rejeição de `downloadImagesAndShow` exigem ajustar esta Promise externa.

## 8. Fonte integral

~~~javascript
'use strict';
// background/actions/download-chapter.js -- Baixa um capítulo e abre sua pasta.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'download-chapter',
    meta: { allowedSources: ['any'] },
    execute(request, context) {
      return new Promise(resolve => {
        const fallbackDownload = () => {
          if (Object.keys(request.images).length === 0) {
            context.handleMarkerAndShow(request.safeTitle, resolve);
            return;
          }
          context.downloadImagesAndShow(request.images, request.safeTitle, request.chapId)
            .then(() => resolve({ ok: true }));
        };

        if (request.anchorId) {
          chrome.downloads.search({ id: request.anchorId }, results => {
            if (results?.length > 0 && results[0].exists) {
              chrome.downloads.show(request.anchorId);
              resolve({ ok: true });
            } else {
              fallbackDownload();
            }
          });
        } else {
          fallbackDownload();
        }
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## 9. Rastreabilidade 35/35

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 01 | U01 | 'use strict'; | Ativa strict mode. |
| 02 | U01 | // background/actions/download-chapter.js -- Baixa um capítulo e abre sua pasta. | Comentário de U01: “background/actions/download-chapter.js -- Baixa um capítulo e abre sua pasta.”; registra intenção sem executar. |
| 03 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho). |
| 04 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`. |
| 05 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a definição no router. |
| 06 | U02 |     name: 'download-chapter', | Define o nome canônico usado pelos dois aliases de capítulo. |
| 07 | U02 |     meta: { allowedSources: ['any'] }, | Permite qualquer classe de origem; esta action não possui ownership específico. |
| 08 | U02 |     execute(request, context) { | Abre executor que retorna uma Promise para manter canal assíncrono. |
| 09 | U03 |       return new Promise(resolve => { | Cria a Promise externa resolvida pelos helpers/callbacks de downloads. |
| 10 | U03 |         const fallbackDownload = () => { | Declara a estratégia comum quando anchorId não pode ser reutilizado. |
| 11 | U03 |           if (Object.keys(request.images).length === 0) { | Detecta conjunto vazio de imagens; pressupõe `request.images` objeto. |
| 12 | U03 |             context.handleMarkerAndShow(request.safeTitle, resolve); | Delega abertura/criação de marker e entrega o `resolve` como callback de resposta. |
| 13 | U03 |             return; | Impede cair no ramo de download depois de iniciar marker. |
| 14 | U03 |           } | Fecha a estrutura sintática da unidade U03. |
| 15 | U03 |           context.downloadImagesAndShow(request.images, request.safeTitle, request.chapId) | Delega o download ordenado das páginas e persistência de paths. |
| 16 | U03 |             .then(() => resolve({ ok: true })); | Converte a conclusão do helper em resposta ok; não há catch local para eventual rejeição. |
| 17 | U03 |         }; | Fecha a estrutura sintática da unidade U03. |
| 18 | U03 | ␠ [linha vazia] | Separador visual de U03 (Fallback de download ou marcador). |
| 19 | U04 |         if (request.anchorId) { | Seleciona tentativa de reuso quando caller fornece id de download conhecido. |
| 20 | U04 |           chrome.downloads.search({ id: request.anchorId }, results => { | Consulta o registro de download exatamente pelo anchorId. |
| 21 | U04 |             if (results?.length > 0 && results[0].exists) { | Considera reutilizável apenas o primeiro resultado quando `exists` é true. |
| 22 | U04 |               chrome.downloads.show(request.anchorId); | Solicita ao Chrome revelar o download/pasta correspondente. |
| 23 | U04 |               resolve({ ok: true }); | Conclui a action com sucesso após solicitar show. |
| 24 | U04 |             } else { | Completa a expressão de U04 com `} else {`. |
| 25 | U04 |               fallbackDownload(); | Executa download/marker quando o anchor não existe ou não foi fornecido. |
| 26 | U04 |             } | Fecha a estrutura sintática da unidade U04. |
| 27 | U04 |           }); | Fecha a estrutura sintática da unidade U04. |
| 28 | U04 |         } else { | Completa a expressão de U04 com `} else {`. |
| 29 | U04 |           fallbackDownload(); | Executa download/marker quando o anchor não existe ou não foi fornecido. |
| 30 | U04 |         } | Fecha a estrutura sintática da unidade U04. |
| 31 | U05 |       }); | Fecha a estrutura sintática da unidade U05. |
| 32 | U05 |     }, | Fecha a estrutura sintática da unidade U05. |
| 33 | U05 |   }); | Fecha a estrutura sintática da unidade U05. |
| 34 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE usando self no worker e globalThis no harness. |
| 35 | U06 | ⏎ [newline final] | Preserva o newline terminal; posição editorial sem efeito runtime. |

## 10. Análise por unidade

### U01 — linhas/posição 1–3: Cabeçalho

**O que faz:** Ativa strict mode e declara que a action baixa um capítulo e/ou abre sua pasta.

**Como faz:** Diretiva e comentário antes da IIFE.

**Por que desta forma:** Explicita que duas operações legadas convergem no mesmo handler.

**Por que uma implementação ingênua seria pior:** Sem essa composição, OPEN_CHAPTER_FOLDER e DOWNLOAD_CHAPTER_AND_SHOW duplicariam fallback e marker logic.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento da action real.

### U02 — linhas/posição 4–8: Registro e aliases externos

**O que faz:** Registra `download-chapter` com origem ampla; o router mapeia `DOWNLOAD_CHAPTER_AND_SHOW` e `OPEN_CHAPTER_FOLDER` para esta action.

**Como faz:** A definição não possui validate próprio; usa helpers do context.

**Por que desta forma:** Os dois comandos diferem só pela presença de anchorId/imagens, então podem compartilhar fluxo.

**Por que uma implementação ingênua seria pior:** Duplicar actions aumentaria drift na lógica de pasta/download.

**Evidência:** ✅ PROVADO DIRETAMENTE pelos dois testes da action, um para cada alias funcional; router.js contém os dois aliases. ⚠️ `allowedSources:any` não tem teste focal de necessidade.

### U03 — linhas/posição 9–18: Fallback de download ou marcador

**O que faz:** Define a estratégia usada quando não há anchorId reutilizável: se `images` está vazio, delega para `handleMarkerAndShow`; caso contrário baixa todas e abre a pasta.

**Como faz:** `Object.keys(request.images).length` escolhe o ramo; marker recebe `safeTitle` e o `resolve` externo; download helper recebe images/safeTitle/chapId e resolve ok quando sua Promise termina.

**Por que desta forma:** Sem imagens não há arquivo de página para usar como handle de pasta, então o marker temporário cria um objeto que `downloads.show` consegue revelar.

**Por que uma implementação ingênua seria pior:** Forçar download quando não existem páginas não resolve a pasta; sempre criar marker mesmo com imagens desperdiça IO e deixa artefato temporário.

**Evidência:** ✅ PROVADO DIRETAMENTE para o ramo com imagens. 🟨 O ramo sem imagens é sustentado pelos testes do helper `marker-anchor-real.test.js`, mas ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que dispare esta action com `images:{}` e observe a delegação.

### U04 — linhas/posição 19–30: Reuso de anchorId ou fallback

**O que faz:** Quando `anchorId` existe, procura o download; se ainda existe, abre-o diretamente, caso contrário cai no fallback anterior.

**Como faz:** `chrome.downloads.search({id})` examina o primeiro resultado e `exists`; sucesso chama `downloads.show` e resolve ok.

**Por que desta forma:** Reusar o download conhecido evita redownload e evita marker desnecessário.

**Por que uma implementação ingênua seria pior:** Baixar novamente cada vez que o usuário abre a pasta duplica arquivos/IO; confiar no id sem search pode chamar show em entrada removida.

**Evidência:** ✅ PROVADO DIRETAMENTE — `reusa o marcador...` e o teste integrado `OPEN_CHAPTER_FOLDER reutiliza anchorId existente sem redownload`. ⚠️ Search vazio/`exists:false` com anchorId não tem teste focal desta action.

### U05 — linhas/posição 31–34: Caminho sem anchorId e fechamento

**O que faz:** Sem anchorId, executa diretamente o fallback; depois fecha action/IIFE.

**Como faz:** `else` chama `fallbackDownload()`; IIFE usa self/globalThis.

**Por que desta forma:** DOWNLOAD_CHAPTER_AND_SHOW normalmente não precisa de anchor prévio.

**Por que uma implementação ingênua seria pior:** Exigir anchorId impediria o primeiro download do capítulo.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste `baixa páginas quando o marcador não existe` usa ausência de anchorId e verifica helper/response. 🟨 Fechamento é apenas estrutura.

### U06 — linhas/posição 35–35: Newline final

**O que faz:** Documenta o newline terminal do blob.

**Como faz:** Posição editorial após 34 linhas textuais.

**Por que desta forma:** Mantém equivalência física.

**Por que uma implementação ingênua seria pior:** Ignorar a posição produziria falso 100% documental.

**Evidência:** 🟦 GATE DOCUMENTAL.

## 11. Auditoria final

- [x] SHA/fonte integral;
- [x] 34 linhas + newline = 35/35;
- [x] aliases e consumidor real confirmados;
- [x] action tests separados de helper tests;
- [x] caminhos sem teste mantidos como lacunas;
- [x] nenhum código funcional alterado.

**Veredito documental:** ✅ APROVADO para `8636a03c8a2038ebbb26103db7f63b578699733e`.

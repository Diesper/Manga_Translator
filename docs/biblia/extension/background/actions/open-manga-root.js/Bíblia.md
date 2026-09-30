# Bíblia técnica — `extension/background/actions/open-manga-root.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `71c83df253cdac601a118104fc1d7e467f35bfd6`  
> **Linhas textuais:** **19**  
> **Posições documentais:** **20** contando newline final

## Papel arquitetural

Esta action é um adaptador mínimo para abrir a pasta principal de downloads do MangaTranslator. Ela não implementa a lógica de busca/criação do marcador: apenas chama `context.handleMarkerAndShow(null, resolve)`.

O valor `null` escolhe o comportamento de pasta principal no helper real. Quando não há download existente que possa ser mostrado, o helper cria um marcador temporário dentro de `MangaTranslator/`, mostra o item e depois agenda sua remoção.

## Contrato assíncrono

A action não usa `meta.async:false`. Portanto o router mantém o canal aberto enquanto a Promise aguarda o callback do helper. A resposta do helper é preservada: os testes diretos confirmam tanto sucesso quanto erro.

## Consumidor real

`popup.js` envia `OPEN_MANGA_ROOT` por meio de `openMangaTranslatorRoot()`, ligado ao botão de abrir a pasta principal. O popup exibe toast quando recebe erro.

## Evidência

| Fonte | Classificação | Prova |
|---|---|---|
| `open-manga-root-action.test.js` | ✅ PROVADO DIRETAMENTE | O helper recebe `null`; sucesso e erro são preservados; canal fica assíncrono. |
| `marker-anchor-real.test.js` | ✅ PROVADO DO HELPER | Criação do marcador, exibição, remoção programada e falha de criação. |
| `popup.js` | 🟨 CONSUMIDOR REAL | Dispara `OPEN_MANGA_ROOT` pelo botão da interface. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `context.handleMarkerAndShow` ausente ou não-função.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para helper que nunca chama o callback; a Promise permaneceria pendente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para cada categoria de source individualmente, apesar de `allowedSources:['any']`.
- ⚠️ Não existe `validate()`, porque nenhum campo do request é usado.
- ⚠️ O comportamento de busca, criação, exibição e remoção do marcador pertence ao helper, não a esta action.
- ⚠️ A remoção programada pelo helper depende de timer do service worker e não é persistida através de reinicialização.

## Solicitações ao auditor

### 018-001 — TEST_REQUIRED — OPEN

**Encontrado:** a action depende integralmente de `context.handleMarkerAndShow`, porém a suíte direta só cobre helper funcional retornando sucesso/erro.

**Evidência atual:** `open-manga-root-action.test.js` prova `null` como `safeTitle`, `keepAlive:true` e preservação das respostas do helper.

**Evidência ausente:** helper ausente/não-função, helper que lança e helper que nunca chama o callback.

**Necessário:** adicionar casos focais contra a action real e o router, sem alterar a implementação auditada.

**Risco:** a Promise pode rejeitar via router ou permanecer pendente indefinidamente sem um gate que documente esse comportamento.

**Severidade:** NORMAL.

### 018-002 — RELIABILITY_REVIEW — OPEN

**Encontrado:** o helper real cria marcador temporário e agenda remoção por timer; essa remoção não é persistida através de reinicialização do service worker.

**Arquivo relacionado:** `extension/background.js`.

**Evidência atual:** testes do helper cobrem criação, show e remoção programada no mesmo ciclo de execução.

**Evidência ausente:** reinicialização do worker entre criação do marcador e disparo do timer.

**Necessário:** auditar se marcadores órfãos após restart são aceitáveis; se não forem, definir mecanismo de cleanup/reconciliação e teste de regressão em alteração separada.

**Risco:** arquivos marcadores temporários podem permanecer no diretório de downloads após restart/hibernação do worker.

**Severidade:** LOW.

## Invariantes

1. O request não altera a pasta principal.
2. O helper recebe `null` como safeTitle.
3. O `resolve` da Promise externa é entregue diretamente ao helper.
4. Sucesso e erro do helper atravessam a action.
5. O canal deve permanecer aberto até o callback.
6. A action não deve duplicar a lógica de marker/downloads.

## Fonte integral

~~~javascript
'use strict';
// background/actions/open-manga-root.js -- Abre a pasta raiz de downloads.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'open-manga-root',

    meta: {
      // Contrato atual mantém esta ação disponível a qualquer contexto da extensão.
      allowedSources: ['any'],
    },

    execute(_request, context) {
      return new Promise(resolve => {
        context.handleMarkerAndShow(null, resolve);
      });
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 20/20

| Posição | Fonte | Papel |
|---:|---|---|
| 001 | 'use strict'; | Ativa strict mode. |
| 002 | // background/actions/open-manga-root.js -- Abre a pasta raiz de downloads. | Descreve a função do arquivo. |
| 003 | ␠ [linha vazia] | Separador visual. |
| 004 | (function(scope) { | Abre a IIFE. |
| 005 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 |     name: 'open-manga-root', | Define o nome canônico open-manga-root. |
| 007 | ␠ [linha vazia] | Separador visual. |
| 008 |     meta: { | Abre metadados da action. |
| 009 |       // Contrato atual mantém esta ação disponível a qualquer contexto da extensão. | Explica a compatibilidade ampla da origem. |
| 010 |       allowedSources: ['any'], | Permite qualquer source classificada pelo router. |
| 011 |     }, | Fecha metadados. |
| 012 | ␠ [linha vazia] | Separador visual. |
| 013 |     execute(_request, context) { | Abre execute; o request é ignorado. |
| 014 |       return new Promise(resolve => { | Cria Promise para manter a resposta assíncrona. |
| 015 |         context.handleMarkerAndShow(null, resolve); | Delega ao helper com safeTitle null, selecionando a pasta MangaTranslator. |
| 016 |       }); | Fecha a Promise. |
| 017 |     }, | Fecha execute. |
| 018 |   }); | Fecha o registro. |
| 019 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha a IIFE com self/globalThis. |
| 020 | ⏎ [newline final] | Newline terminal editorial. |

## Auditoria final

- [x] SHA e fonte integral conferidos;
- [x] 19 linhas + newline = 20/20;
- [x] wiring da action ligado a assertions diretas;
- [x] helper e consumidor verificados separadamente;
- [x] lacunas explícitas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `71c83df253cdac601a118104fc1d7e467f35bfd6`.

# Bíblia técnica — `extension/background/actions/start-batch.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `b0ef70bf1c23f97c3fd8c9a1c82483f712b96dc3`  
> **Linhas textuais:** **21**  
> **Posições documentais:** **22** contando newline final

## Papel arquitetural

`start-batch.js` é a fronteira IPC mínima de `START_BATCH`: valida apenas a estrutura básica de `images` e delega o request inteiro + `context.sender` para o orchestrator `startBatch` do background.

A lógica pesada — reidratação, batchId, fila FIFO, idempotência, estado persistido, concorrência e abertura de jobs Gemini — **não vive neste arquivo**. Ela permanece em `background.js::startBatch`.

## Validação local

A action exige:

- `request.images` ser um Array;
- cada elemento ser truthy;
- cada `image.index` ser `Number.isInteger`.

Não exige lista não vazia, index não-negativo, índices únicos, prompt string, batchId string ou mangaTabId válido.

## Autoridade do sender no orchestrator

No `startBatch` real, `mangaTabId` é escolhido como `sender.tab.id` quando existe; só cai para `request.mangaTabId` quando não há sender tab. Isso reduz a confiança no payload para o caller normal de `content_manga.js`.

`createBatchDescriptor` também normaliza as imagens para `{index}` apenas, descartando propriedades extras antes de colocá-las na fila persistida.

## BatchId, FIFO e idempotência

O orchestrator usa `request.batchId || generateId()`. O batchId identifica retries: lote já ativo retorna `alreadyStarted`; lote já pendente retorna `alreadyQueued` mantendo posição; novo lote concorrente entra ao fim de `pendingBatches`.

`plan-missing-handlers-real.test.js` prova B/C/D/E/F em FIFO e retry de batch pendente sem duplicação. `batch-lifecycle-real.test.js` prova início real, persistência e abertura do primeiro job.

## Consumidor real

`content_manga.js` gera `_currentBatchId`, envia `START_BATCH` com `images`, `prompt` e `batchId`, e interpreta respostas de fila (`queued`, `queuePosition`, `alreadyQueued`) e idempotência (`alreadyStarted`). No caller normal não é enviado `mangaTabId`; o background deriva da sender tab.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `batch-actions.test.js` | ✅ PROVADO DIRETAMENTE | A action real delega request + sender e rejeita `index` string. O `startBatch` é mockado nesse teste. |
| `batch-lifecycle-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | START_BATCH cria estado real, persiste job e abre job Gemini respeitando concorrência. |
| `plan-missing-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | FIFO de múltiplos lotes, retry idempotente de lote pendente e retry do lote ativo. |
| `content_manga.js` | 🟨 CONSUMIDOR REAL | Emite START_BATCH e interpreta fila/idempotência. |
| `smoke-06-sm-message-routing.js` | 🟦 GATE DE ROTEAMENTO | START_BATCH não deve ser capturado pelo handler Storage Manager; não prova semântica do batch. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `images` não-array no teste direto; o guard existe, mas a suíte focal testa `index` string.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `images: []`; a lista vazia passa pelo validator.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para index negativo, duplicado ou extremamente grande; todos podem passar se inteiros.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `batchId` não-string truthy. O orchestrator usa operações como `.slice()` em batchId em vários caminhos, então tipo inesperado pode produzir erro runtime.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `prompt` não-string; `createBatchDescriptor` preserva valor truthy sem normalização de tipo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para sender sem tab e `request.mangaTabId` inválido.
- ⚠️ `allowedSources:['any']` deixa a action disponível para qualquer source aceita pelo router.
- ⚠️ A action não chama `ensureInitialized`; a reidratação é responsabilidade do `context.startBatch` real. Um mock/custom context poderia não preservar essa garantia.

## Segurança e consistência

- O sender real é repassado ao orchestrator e normalmente determina a aba de mangá dona do lote.
- O request inteiro também é repassado; campos não validados continuam chegando ao orchestrator.
- O batchId é uma chave de idempotência e fila, portanto aceitar tipo/valor inadequado pode afetar deduplicação.
- O validator impede índices não-inteiros, mas não prova que os índices existem no documento do caller.

## Invariantes

1. `images` precisa continuar sendo Array.
2. Cada item precisa possuir `index` inteiro.
3. A action deve repassar `context.sender` junto com o request.
4. Reidratação/FIFO/idempotência pertencem ao orchestrator real, não devem ser duplicadas na action.
5. O caller normal deve continuar sendo associado à sender tab no startBatch real.
6. Um retry com o mesmo batchId não pode recriar jobs já ativos/pending.

## Fonte integral

~~~javascript
'use strict';
// background/actions/start-batch.js -- Inicia um lote somente após reidratação do worker.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'start-batch',
    meta: { allowedSources: ['any'] },
    validate(request) {
      if (!Array.isArray(request.images)) {
        return { code: 'INVALID_PAYLOAD', message: 'images deve ser uma lista' };
      }
      if (request.images.some(image => !image || !Number.isInteger(image.index))) {
        return { code: 'INVALID_PAYLOAD', message: 'cada imagem precisa de index inteiro' };
      }
      return null;
    },
    async execute(request, context) {
      return context.startBatch(request, context.sender);
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 22/22

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/start-batch.js -- Inicia um lote somente após reidratação do worker. | Comentário de intenção: background/actions/start-batch.js -- Inicia um lote somente após reidratação do worker.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |     name: 'start-batch', | Nome canônico do alias START_BATCH. |
| 007 | U02 |     meta: { allowedSources: ['any'] }, | Não restringe a source no router. |
| 008 | U03 |     validate(request) { | Abre validação síncrona do envelope mínimo. |
| 009 | U03 |       if (!Array.isArray(request.images)) { | Exige que images seja Array; lista vazia passa. |
| 010 | U03 |         return { code: 'INVALID_PAYLOAD', message: 'images deve ser uma lista' }; | Erro estável para images não-array. |
| 011 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 012 | U03 |       if (request.images.some(image => !image \|\| !Number.isInteger(image.index))) { | Percorre imagens e rejeita item falsy ou index não-inteiro. |
| 013 | U03 |         return { code: 'INVALID_PAYLOAD', message: 'cada imagem precisa de index inteiro' }; | Erro estável para item/index inválido. |
| 014 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 015 | U03 |       return null; | Indica payload válido. |
| 016 | U03 |     }, | Fecha estrutura sintática da unidade U03. |
| 017 | U04 |     async execute(request, context) { | Abre executor assíncrono. |
| 018 | U04 |       return context.startBatch(request, context.sender); | Delega request integral e sender real ao orchestrator startBatch. |
| 019 | U04 |     }, | Fecha estrutura sintática da unidade U04. |
| 020 | U05 |   }); | Fecha estrutura sintática da unidade U05. |
| 021 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 022 | U06 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e intenção de iniciar lote após reidratação.

### U02 — Registro e metadados
Registra START_BATCH com source ampla.

### U03 — Validação da lista
Valida Array e `index` inteiro por item.

### U04 — Delegação ao startBatch
Passa request e sender ao orchestrator real.

### U05 — Fechamento
Fecha action/IIFE.

### U06 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 21 linhas + newline = 22/22;
- [x] validação e delegação ligadas ao teste direto;
- [x] orchestrator real e testes integrados diferenciados;
- [x] caller real/FIFO/idempotência documentados;
- [x] gaps de lista vazia/índices/batchId/prompt/source explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `b0ef70bf1c23f97c3fd8c9a1c82483f712b96dc3`.

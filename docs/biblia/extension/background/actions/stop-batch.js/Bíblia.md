# Bíblia técnica — `extension/background/actions/stop-batch.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `e552d0a911092c5cd7e457fbe262d366c413f0c1`  
> **Linhas textuais:** **18**  
> **Posições documentais:** **19** contando newline final

## Papel arquitetural

`stop-batch.js` é a fronteira IPC mínima de `STOP_BATCH`. Ela valida somente o tipo opcional de `batchId` e delega o request completo para `context.stopBatch(request)`.

A limpeza real — lote pendente, lote ativo, jobs, abas Gemini, watchdogs, extraction tabs e promoção FIFO — vive em `background.js::stopBatch`.

## Semântica de batchId opcional

Se `batchId` é `undefined`, o validator aceita. No orchestrator real, `targetBatchId = request.batchId || runtimeState.currentBatchId`; portanto ausência, string vazia ou outro valor falsy fazem a operação mirar o **lote atual global**.

O validator rejeita apenas batchId definido cujo tipo não seja string. Ele não rejeita string vazia, whitespace, tamanho excessivo ou formato desconhecido.

## Autoridade e source

A action não repassa `context.sender` ao orchestrator e usa `allowedSources:['any']`. Logo não existe ownership local baseada em aba remetente. A autorização prática é conhecer/omitir o batchId dentro do boundary geral de mensagens da extensão.

Isso é diferente de START_BATCH, que entrega o sender para o orchestrator e normalmente deriva o mangaTabId da aba remetente.

## Orchestrator real

`background.js::stopBatch` reidrata o worker e então:

- remove um lote pendente específico sem tocar no ativo;
- para o lote ativo e invalida launches em voo;
- remove jobs da fila/índice, abas Gemini, watchdog data e alarms;
- remove extraction tabs do lote;
- limpa estado do lote atual;
- promove o próximo `pendingBatches` em FIFO e reinicia scheduling;
- se o alvo não é o lote atual, recalcula activeJobsCount e continua processamento.

## Consumidor real

`content_manga.js` envia `STOP_BATCH` quando o usuário aperta novamente o botão durante tradução, usando `_currentBatchId` quando disponível. O content script também possui fluxo de parada vindo do popup que encaminha o batch local possuído.

## Evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `batch-actions.test.js` | ✅ PROVADO DIRETAMENTE | A action repassa batchId string ao `stopBatch` mockado e rejeita batchId numérico. |
| `batch-lifecycle-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | STOP_BATCH limpa estado, jobs persistidos, abas e watchdogs no fluxo real. |
| `plan-missing-handlers-real.test.js` | ✅ PROVADO NO BACKGROUND REAL | Cancelar lote pendente remove só aquele item e preserva FIFO; stop do lote ativo preserva isolamento. |
| `content_manga.js` | 🟨 CONSUMIDOR REAL | Botão local envia STOP_BATCH com o batchId conhecido ou undefined. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `batchId` omitido na action focal; o orchestrator usa então `currentBatchId`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `batchId:''`; passa validação e é tratado como omissão por `||`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para batchId contendo apenas espaços; é truthy e mira um id provavelmente inexistente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para strings muito grandes ou formatos inesperados.
- ⚠️ Não há ownership por sender nesta action.
- ⚠️ `allowedSources:['any']` mantém a superfície de cancelamento ampla.
- ⚠️ Um caller que omite batchId pode parar o lote global atual, não necessariamente um lote associado à sua própria aba.
- ⚠️ A action depende integralmente de `context.stopBatch`; dependência ausente/rejeição vira erro do router.

## Invariantes

1. batchId definido e não-string deve falhar antes do orchestrator.
2. batchId ausente continua significando 'lote atual' no orchestrator.
3. A action não deve duplicar a limpeza complexa do background.
4. Cancelamento de lote pendente não deve destruir o lote ativo.
5. Cancelamento do lote ativo deve invalidar launches tardios antes da promoção do próximo.
6. A fila pendente deve preservar FIFO após remoções/promoção.

## Fonte integral

~~~javascript
'use strict';
// background/actions/stop-batch.js -- Cancela somente os recursos do lote solicitado.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'stop-batch',
    meta: { allowedSources: ['any'] },
    validate(request) {
      if (request.batchId !== undefined && typeof request.batchId !== 'string') {
        return { code: 'INVALID_PAYLOAD', message: 'batchId deve ser texto' };
      }
      return null;
    },
    async execute(request, context) {
      return context.stopBatch(request);
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 19/19

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/actions/stop-batch.js -- Cancela somente os recursos do lote solicitado. | Comentário de intenção: background/actions/stop-batch.js -- Cancela somente os recursos do lote solicitado.. |
| 003 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 004 | U02 | (function(scope) { | Parte da expressão da unidade U02: (function(scope) { |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra a action no router. |
| 006 | U02 |     name: 'stop-batch', | Nome canônico do alias STOP_BATCH. |
| 007 | U02 |     meta: { allowedSources: ['any'] }, | Não restringe a source no router. |
| 008 | U03 |     validate(request) { | Abre validação do batchId opcional. |
| 009 | U03 |       if (request.batchId !== undefined && typeof request.batchId !== 'string') { | Permite omissão; quando presente exige string. |
| 010 | U03 |         return { code: 'INVALID_PAYLOAD', message: 'batchId deve ser texto' }; | Erro estável para tipo não-string. |
| 011 | U03 |       } | Fecha estrutura sintática da unidade U03. |
| 012 | U03 |       return null; | Indica payload válido. |
| 013 | U03 |     }, | Fecha estrutura sintática da unidade U03. |
| 014 | U03 |     async execute(request, context) { | Abre executor assíncrono. |
| 015 | U04 |       return context.stopBatch(request); | Delega request integral ao orchestrator sem repassar sender. |
| 016 | U04 |     }, | Fecha estrutura sintática da unidade U04. |
| 017 | U05 |   }); | Fecha estrutura sintática da unidade U05. |
| 018 | U05 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE com self/globalThis. |
| 019 | U06 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho
Strict mode e intenção de cancelar somente o lote solicitado.

### U02 — Registro e metadados
Registra STOP_BATCH com source ampla.

### U03 — Validação opcional de batchId
Permite ausência e restringe somente o tipo quando presente.

### U04 — Delegação ao stopBatch
Entrega o request ao orchestrator sem sender.

### U05 — Fechamento
Fecha action/IIFE.

### U06 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 18 linhas + newline = 19/19;
- [x] validação/delegação ligadas ao teste direto;
- [x] orchestrator e testes integrados diferenciados;
- [x] ausência de sender ownership explicitada;
- [x] semântica de batchId omitido/falsy documentada;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `e552d0a911092c5cd7e457fbe262d366c413f0c1`.

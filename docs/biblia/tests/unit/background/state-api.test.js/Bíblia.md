# Bíblia técnica — tests/unit/background/state-api.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `d9c080339202848719ac448d7684d793684aced2`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest unitária da API real de estado serializado  
> **Linhas textuais:** 110  
> **Posições documentais:** 111, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`state-api.test.js` testa diretamente `extension/background/state.js` via `require(STATE_PATH)` e usa `global.MangaTranslatorState` exportado pelo módulo real.

A suíte cobre quatro contratos:

1. `patch()` + `syncState()` preservam snapshot e espelhos legados;
2. `restoreState()` normaliza estado persistido e mantém API compatível;
3. ausência de `mt_state` não apaga o estado já existente em memória;
4. `pendingBatches` retornado por `get()` é protegido contra mutação externa de itens/imagens.

Não há mirror local da implementação.

## 2. Setup e isolamento

`beforeEach`:
- faz `jest.resetModules()`;
- remove `global.MangaTranslatorState`;
- obtém o storage mock real da infraestrutura de testes;
- limpa o storage;
- carrega `state.js`;
- captura a API publicada.

`afterEach` remove a API global.

O import `fs` é morto neste arquivo.

## 3. Teste 1 — patch + sync

O primeiro caso monta um snapshot com:
- `jobQueue`;
- `isProcessing`;
- `currentBatchId`;
- `extractionTabs`;
- contadores;
- `pendingBatches`;
- `jobIndex`.

Depois chama `state.syncState()` e lê `mt_state` do storage.

Assertions diretas:
- snapshot retornado por `patch()` é igual ao persistido;
- getters/espelhos públicos refletem `currentBatchId`, `extractionTabs`, `jobIndex` e `pendingBatches`.

Isso prova o caminho válido de serialização.

## 4. Teste 2 — restore

O teste grava `mt_state` previamente no storage e chama `restoreState()`.

Ele prova:
- aplicação do estado persistido;
- preservação da fila de jobs;
- ordem de `pendingBatches`;
- getters públicos;
- `state.get()` igual ao snapshot restaurado.

Como `restoreState()` chama `patch(d.mt_state)`, a normalização exercitada é a de `patch()`.

## 5. Teste 3 — storage sem mt_state

Antes do restore, o teste coloca valores em memória com `patch()`.

Quando `chrome.storage.local.get` não retorna `mt_state`:
- `restoreState()` resolve `null`;
- o estado em memória continua intacto.

Isso impede que bootstrap sem snapshot zere arbitrariamente o estado já montado no mesmo lifecycle.

## 6. Teste 4 — isolamento de pendingBatches

O teste injeta um array externo, chama `patch()`, obtém snapshot via `get()` e então:
- muda `images[0].index`;
- adiciona outro batch ao snapshot.

O estado interno permanece inalterado.

Esse comportamento corresponde ao clone executado em `patch()` e `get()` para `pendingBatches`.

## 7. O que a suíte NÃO prova

Apesar do nome amplo “API de estado serializada”, este arquivo não prova toda a API pública de `state.js`.

Não cobre:
- `mutate()`;
- serialização concorrente por `_persistenceChain`;
- recuperação da chain após rejeição de storage;
- `generateId()`;
- helpers de índice;
- `replaceGeminiTabReferences()`;
- `tabExists()`;
- `ensureInitialized()`;
- `reconcileJobs()`;
- setters públicos diretos;
- isolamento profundo de `jobQueue`, `extractionTabs` e `jobIndex`.

## 8. Diferença de isolamento entre estruturas

`pendingBatches` recebe clone dos batches e de cada `image`.

Por contraste, no `get()` atual:
- `jobQueue` usa apenas `.slice()`;
- `extractionTabs` usa apenas spread do objeto externo;
- `jobIndex` usa apenas `.slice()`.

Assim, objetos aninhados dessas estruturas continuam compartilhados por referência.

A suíte #169 prova explicitamente apenas a proteção de `pendingBatches`; não deve ser interpretada como prova de snapshot profundamente imutável para todas as coleções.

## 9. Setters diretos versus patch

A API pública também expõe setters como:
- `state.jobQueue = v`;
- `state.extractionTabs = v`;
- `state.pendingBatches = v`;
- `state.jobIndex = v`.

Esses setters não aplicam necessariamente as mesmas cópias e normalizações de `patch()`.

Exemplo importante: o setter de `pendingBatches` aceita o array diretamente, enquanto `patch({pendingBatches})` clona batches/imagens.

Portanto o contrato de isolamento depende do caminho usado pelo consumidor.

## 10. Evidência automatizada

| Propriedade | Evidência | Classificação |
|---|---|---|
| carrega implementação real de state.js | require do arquivo real | ✅ PROVADO DIRETAMENTE |
| patch + sync persistem snapshot | teste 1 | ✅ PROVADO DIRETAMENTE |
| getters refletem snapshot patchado | teste 1 | ✅ PROVADO DIRETAMENTE |
| restore aplica mt_state | teste 2 | ✅ PROVADO DIRETAMENTE |
| restore sem mt_state retorna null | teste 3 | ✅ PROVADO DIRETAMENTE |
| restore sem mt_state preserva memória | teste 3 | ✅ PROVADO DIRETAMENTE |
| pendingBatches não é mutável via snapshot externo | teste 4 | ✅ PROVADO DIRETAMENTE |
| jobQueue profundamente isolado | não testado; implementação é shallow | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| extractionTabs profundamente isolado | não testado; implementação é shallow | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| jobIndex profundamente isolado | não testado; implementação é shallow | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| setters diretos preservam invariantes de patch | não testado; semântica difere | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mutate serializa transições | não há teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| syncState ordena concorrência e recupera após erro | não há teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 11. Solicitações ao auditor

### 169-001 — IMMUTABILITY_REVIEW — OPEN

**Encontrado:** `get()` protege `pendingBatches` com clone de batches/images, mas `jobQueue`, `extractionTabs` e `jobIndex` só recebem cópia superficial.

**Evidência atual:** o teste prova apenas `pendingBatches`.

**Evidência ausente:** garantia de que mutar um objeto aninhado obtido de `state.get()` não altera estado interno para as demais coleções.

**Ação solicitada:** decidir se snapshots devem ser semanticamente imutáveis. Se sim, aprofundar clone ou congelamento em mudança separada e adicionar testes focais.

**Risco:** consumidor pode alterar estado interno sem `patch/mutate/syncState`.

**Severidade:** HIGH.

### 169-002 — API_CONSISTENCY_REVIEW — OPEN

**Encontrado:** setters públicos diretos não reproduzem as normalizações/clones de `patch()`; particularmente `pendingBatches` recebe referência externa diretamente.

**Evidência atual:** esta suíte usa `patch()`, não setters diretos.

**Evidência ausente:** contrato para setters e equivalência de invariantes.

**Ação solicitada:** auditar consumidores dos setters; decidir se setters devem delegar a `patch()`, aplicar normalização própria ou ser considerados API legada de baixo nível.

**Risco:** mesmo estado lógico pode ter isolamento diferente dependendo do caminho de escrita.

**Severidade:** HIGH.

### 169-003 — TEST_REQUIRED — OPEN

**Encontrado:** `mutate()` e a serialização por `_persistenceChain` não possuem teste focal localizado.

**Evidência atual:** `syncState()` é testado em chamada única.

**Evidência ausente:** duas ou mais mutações concorrentes, ordem de writes e recuperação após uma rejeição de storage.

**Ação solicitada:** adicionar testes concorrentes contra `state.js` real que controlem promises de `storage.set` e provem ordem/continuidade da chain.

**Risco:** regressão de concorrência pode perder transições mesmo com testes sequenciais verdes.

**Severidade:** HIGH.

## 12. Fonte integral auditada

```js
const path = require('path');
const fs = require('fs');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);
const STATE_PATH = path.join(ROOT, 'extension/background/state.js');
const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

describe('background/state.js - API de estado serializada', () => {
    let storage;
    let state;

    beforeEach(async () => {
        jest.resetModules();
        delete global.MangaTranslatorState;
        storage = getStorageMock();
        await storage.clear();
        require(STATE_PATH);
        state = global.MangaTranslatorState;
    });

    afterEach(() => {
        delete global.MangaTranslatorState;
    });

    test('patch e sync preservam o snapshot serializado e os espelhos legados', async () => {
        const snapshot = state.patch({
            jobQueue: [{ mangaTabId: 9, index: 2 }],
            isProcessing: true,
            currentBatchId: 'batch-9',
            extractionTabs: { 44: { mangaTabId: 9, index: 2 } },
            totalJobs: 3,
            completedJobs: 1,
            activeJobsCount: 1,
            pendingBatches: [
                { batchId: 'batch-next', mangaTabId: 10, prompt: 'next', images: [{ index: 0 }] },
            ],
            jobIndex: [{ geminiTabId: 44, jobId: 'job-44' }],
        });

        await state.syncState();
        const stored = await storage.get(['mt_state']);

        expect(snapshot).toEqual(stored.mt_state);
        expect(state.currentBatchId).toBe('batch-9');
        expect(state.extractionTabs[44]).toEqual({ mangaTabId: 9, index: 2 });
        expect(state.jobIndex).toEqual([{ geminiTabId: 44, jobId: 'job-44' }]);
        expect(state.pendingBatches).toEqual([
            { batchId: 'batch-next', mangaTabId: 10, prompt: 'next', images: [{ index: 0 }] },
        ]);
    });

    test('restore normaliza o estado persistido e mantém a API compatível', async () => {
        await storage.set({
            mt_state: {
                jobQueue: [{ mangaTabId: 3, index: 1 }],
                isProcessing: true,
                stopRequested: false,
                activeMangaTabId: 3,
                currentBatchId: 'batch-restored',
                extractionTabs: { 18: { mangaTabId: 3 } },
                totalJobs: 2,
                completedJobs: 1,
                activeJobsCount: 1,
                pendingBatches: [
                    { batchId: 'batch-b', mangaTabId: 4, prompt: 'B', images: [{ index: 0 }] },
                    { batchId: 'batch-c', mangaTabId: 5, prompt: 'C', images: [{ index: 1 }] },
                ],
                jobIndex: [{ geminiTabId: 18, jobId: 'job-18' }],
            },
        });

        const restored = await state.restoreState();

        expect(restored).toEqual(expect.objectContaining({
            currentBatchId: 'batch-restored',
            activeMangaTabId: 3,
            totalJobs: 2,
        }));
        expect(state.jobQueue).toEqual([{ mangaTabId: 3, index: 1 }]);
        expect(state.pendingBatches.map(batch => batch.batchId)).toEqual(['batch-b', 'batch-c']);
        expect(state.get()).toEqual(restored);
    });

    test('restore sem mt_state preserva os espelhos já definidos', async () => {
        state.patch({ currentBatchId: 'batch-em-memoria', activeJobsCount: 1 });

        await expect(state.restoreState()).resolves.toBeNull();
        expect(state.get()).toEqual(expect.objectContaining({
            currentBatchId: 'batch-em-memoria',
            activeJobsCount: 1,
        }));
    });

    test('pendingBatches é clonado no snapshot e não pode ser mutado por referência externa', () => {
        const source = [
            { batchId: 'batch-x', mangaTabId: 7, prompt: 'X', images: [{ index: 1 }] },
        ];
        state.patch({ pendingBatches: source });

        const snapshot = state.get();
        snapshot.pendingBatches[0].images[0].index = 99;
        snapshot.pendingBatches.push({ batchId: 'batch-y', images: [] });

        expect(state.pendingBatches).toEqual([
            { batchId: 'batch-x', mangaTabId: 7, prompt: 'X', images: [{ index: 1 }] },
        ]);
    });

});
```

## 13. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–6 | imports, root e STATE_PATH |
| 7 | import do storage mock |
| 9–20 | describe + beforeEach carregando state.js real |
| 22–24 | afterEach |
| 26–50 | patch/sync + espelhos legados |
| 52–82 | restore de mt_state |
| 84–94 | restore sem mt_state |
| 96–109 | proteção de pendingBatches contra mutação externa |
| 110 | fecha describe |
| posição 111 | newline final |

## 14. Autoauditoria do AGENTE 17

- [x] reserva #169 criada por CREATE ONLY e relida;
- [x] state próprio criado;
- [x] SHA do teste reconfirmado;
- [x] `state.js` real inspecionado;
- [x] fonte integral incorporada;
- [x] 110 linhas + newline = 111 posições;
- [x] evidência direta separada de garantias não testadas;
- [x] diferenças entre `patch/get` e setters diretos registradas;
- [x] três solicitações externas persistíveis identificadas;
- [x] nenhum arquivo fora de Bíblia/state/reserva próprios foi modificado.

**Resultado:** #169 prova corretamente os contratos sequenciais principais de `patch/get/sync/restore` e o clone de `pendingBatches`, mas não prova isolamento profundo global nem a serialização concorrente da API.

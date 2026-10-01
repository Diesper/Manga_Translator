# Bíblia técnica — tests/unit/background/jobs-reconciliation-batch-queue.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 23  
> **SHA auditado:** 032df2351f2a202dff11f227f8c4dc6ac5b80807  
> **Agente:** AGENTE 23  
> **Índice:** 152  
> **Tipo:** teste Jest do reconciler real — isolamento FIFO entre batches  
> **Linhas textuais:** **136**  
> **Posições documentais:** **137** incluindo newline final  
> **PR/branch:** #66 / `docs/project-bible`

## 1. Papel arquitetural

A suíte protege a regra que impede jobs tardios de um batch anterior de ocuparem capacidade quando outro batch já é corrente. Ela importa **`extension/background/jobs-reconciliation.js` real**; apenas Chrome/state/colaboradores são controlados.

RECON-FIFO-01 usa batch B corrente com um job A tardio e um job B vivo. Como `tabExists` retorna true para ambos e os recoveries retornam false, o descarte de A é causalmente atribuído à regra de batch. RECON-FIFO-02 remove o batch corrente e demonstra que uma entrada restaurada não é rotulada foreign apenas por carregar seu próprio batchId.

## 2. Implementação exercitada

`jobs-reconciliation.js` SHA **f0f2370ba6b7523caebf028c9188cebd7189d650** executa: canonicalização → recoveries → filtro foreign → liveness → cleanup → reconstrução do estado.

Foreign exige `currentBatchId` truthy, `entry.batchId` truthy e IDs diferentes. Jobs foreign entram em `foreign` e `dropped`, recebem tentativa de fechamento da tab, depois participam da limpeza de job/watchdog data.

## 3. Harness e dependências

`loadModule` usa `jest.isolateModules`, carrega o módulo real e limpa o global entre casos. A suíte cria seu próprio `global.chrome`, observando `tabs.remove`, `alarms.clear` e `storage.local.remove`.

`syncState` e `processNextJob` são injetados, mas **não usados** porque os dois casos chamam `reconcile()`, não `reconcileAndContinue()`.

`resolveCanonicalTabId`/`migrateTabIdentity` usam defaults identity neste arquivo. Canonicalização real é testada separadamente.

## 4. RECON-FIFO-01

✅ **PROVADO DIRETAMENTE**:

- `alive:1,dropped:1,recovered:0,foreign:1`;
- somente job B fica em `jobIndex`;
- `activeJobsCount` é reconstruído de 2 para 1;
- tab 111 do batch A recebe `tabs.remove`;
- `gemini_job_111` e `wd_data_111` entram na remoção;
- log `JOB_RECONCILE_FOREIGN_BATCH_DROP` contém current batch B.

O alarm watchdog e o log genérico `JOB_RECONCILE_DROP` participam do código executado, mas não têm assertions específicas.

## 5. RECON-FIFO-02

✅ **PROVADO DIRETAMENTE**:

- sem `currentBatchId`, o job restaurado permanece alive;
- `foreign=0` e `dropped=0`;
- contador vira 1;
- a tab não é fechada.

## 6. Evidência externa

`tests/unit/background/tab-identity.test.js` SHA **1f2dd52513037f061613d04453a961fbaeddef84**, caso TAB-12, carrega o reconciler real junto à identidade real e prova migração 100→200 antes da classificação de órfão.

`extension/background/jobs-lifecycle.js` SHA **e4ab9f6c54725a5a8e3f5f3c0e1cbd7a0e1c87e5** cria jobs atuais com `batchId = job.batchId || state.currentBatchId` e adiciona o índice com esse batchId.

A Bíblia existente da implementação foi lida read-only e confirma este arquivo como teste direto principal do isolamento FIFO.

## 7. Wiring

`jest.config.js` SHA **f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc** inclui `tests/unit/background/**/*.test.js` no projeto background. `package.json` SHA **33e0b91d1a6f1790124b700d2ce331f80d2b7095** oferece `test:unit:background` e inclui o projeto em `test:unit/test:ci`.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO. Nenhuma execução nova foi fabricada.

## 8. Matriz de evidência

| Propriedade | Classificação |
|---|---|
| módulo real carregado | ✅ PROVADO DIRETAMENTE |
| job de A vira foreign quando B é corrente | ✅ PROVADO DIRETAMENTE |
| foreign também vira dropped | ✅ PROVADO DIRETAMENTE |
| foreign não ocupa slot | ✅ PROVADO DIRETAMENTE |
| B permanece no índice | ✅ PROVADO DIRETAMENTE |
| fechamento da tab foreign | ✅ PROVADO DIRETAMENTE |
| remoção de gemini_job/wd_data | ✅ PROVADO DIRETAMENTE |
| log foreign | ✅ PROVADO DIRETAMENTE |
| sem current batch não inventa foreign | ✅ PROVADO DIRETAMENTE |
| cleanup do watchdog alarm | 🟨 EXECUTADO INDIRETAMENTE, sem assertion |
| log genérico JOB_RECONCILE_DROP | 🟨 EXECUTADO INDIRETAMENTE |
| recovery true | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| tab órfã | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| reconcileAndContinue | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO localizado |
| índice vazio + contador stale persistido | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| canonicalização real | ✅ PROVADO DIRETAMENTE fora deste arquivo por TAB-12 |

## 9. Casos-limite

Índice vazio/não-array; entrada nula; batchId ausente/falsy; falha em canonicalização/migração; recovery lançando; `tabExists` rejeitando; falha de tabs.remove/storage.remove/alarms.clear; `activeMangaTabId` truthy porém stale; múltiplos foreign; foreign cuja tab já sumiu; recovery anterior à classificação foreign. Nenhum desses é promovido a comportamento provado pelo #152.

## 10. Análise crítica

A causalidade dos dois casos é boa e o módulo é real. O teste cobre precisamente a regressão FIFO, porém é intencionalmente estreito. Cleanup e recovery completos ficam parcialmente ou totalmente fora dele. A maior lacuna funcional observada é o early return com índice vazio, que pode corrigir o contador apenas em memória sem sincronizá-lo.

## 11. Solicitações ao auditor

### 152-001 — TEST_REQUIRED — OPEN

- **Arquivo alvo:** `tests/unit/background/jobs-reconciliation-batch-queue.test.js`
- **Achado:** esta suíte prova apenas o drop de batch estrangeiro com tabs existentes/recoveries false e a ausência de foreign quando `currentBatchId` é nulo.
- **Evidência atual:** módulo real; resumo, índice, contador, fechamento da tab foreign, chaves removidas e log foreign diretamente assertados. Canonicalização real possui prova separada em `tab-identity.test.js`.
- **Evidência ausente:** tab órfã, recoveries true no reconciler isolado, falhas de colaboradores, entrada nula, reconstrução de `activeMangaTabId` e `reconcileAndContinue`.
- **Por que insuficiente:** esses branches governam recovery/cleanup/retomada pós-suspensão e podem regredir sem afetar os dois casos FIFO.
- **Ação solicitada:** adicionar casos focais usando o módulo real para cada branch relevante.
- **Evidência esperada:** recovered remove slot; órfão vira dropped e limpa watchdog/storage; wrapper sincroniza e agenda somente sob suas condições.
- **Regressão possível:** worker reidratado pode manter/descartar jobs ou retomar fila incorretamente.
- **Impacto:** resiliência do Service Worker e contabilidade de concorrência.
- **Severidade:** HIGH.

### 152-002 — FUNCTIONAL_REVIEW — OPEN

- **Arquivo alvo:** `extension/background/jobs-reconciliation.js`
- **Achado:** com `jobIndex` vazio, `reconcile()` zera `activeJobsCount` em memória e retorna `{alive:0,dropped:0}`; `reconcileAndContinue()` só chama `syncState` quando há dropped/alive/recovered.
- **Evidência atual:** leitura direta do SHA `f0f2370ba6b7523caebf028c9188cebd7189d650`; a Bíblia da implementação registra a mesma lacuna.
- **Evidência ausente:** caso `jobIndex=[]` + contador stale que fixe se a correção deve ser persistida no mesmo ciclo.
- **Ação solicitada:** revisar o contrato; se a correção precisa ser durável imediatamente, ajustar em mudança autorizada separada e adicionar teste. Caso exista sincronização posterior garantida, documentar/provar essa garantia.
- **Evidência esperada:** teste determinístico do early return e da decisão de `syncState`.
- **Regressão possível:** memória e storage podem divergir após restart.
- **Impacto:** consistência do estado restaurado.
- **Severidade:** NORMAL.


## 12. Invariantes

1. Batch diferente do corrente deve ser foreign+dropped.
2. Drop foreign não remove job do batch corrente.
3. `activeJobsCount` pós-reconcile é `alive.length`.
4. Sem currentBatchId não há foreign por diferença de batch.
5. Recoveries precedem foreign/liveness.
6. Canonicalização precede recoveries.
7. Cleanup de dropped usa tabId canônico.
8. A suíte #152 não prova `reconcileAndContinue`.
9. Esta Bíblia vale somente para o SHA auditado.

## 13. Fonte integral auditada

~~~javascript
'use strict';

const path = require('path');

const MODULE_PATH = path.resolve(
    __dirname,
    '../../../extension/background/jobs-reconciliation.js'
);

function loadModule() {
    global.self = global;
    delete global.MangaTranslatorJobsReconciliation;
    jest.isolateModules(() => require(MODULE_PATH));
    return global.MangaTranslatorJobsReconciliation;
}

describe('background/jobs-reconciliation.js - isolamento entre lotes FIFO', () => {
    afterEach(() => {
        delete global.MangaTranslatorJobsReconciliation;
        delete global.chrome;
        jest.restoreAllMocks();
    });

    test('RECON-FIFO-01: job tardio de A é removido sem ocupar slot do lote B', async () => {
        const removedKeys = [];
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                remove: jest.fn((_tabId, callback) => callback?.()),
            },
            alarms: {
                clear: jest.fn((_name, callback) => callback?.(true)),
            },
            storage: {
                local: {
                    remove: jest.fn(async keys => {
                        removedKeys.push(...(Array.isArray(keys) ? keys : [keys]));
                    }),
                },
            },
        };

        const state = {
            currentBatchId: 'batch-b',
            activeMangaTabId: 20,
            activeJobsCount: 2,
            jobIndex: [
                {
                    geminiTabId: 111,
                    jobId: 'job-a-late',
                    batchId: 'batch-a',
                    mangaTabId: 10,
                    index: 0,
                },
                {
                    geminiTabId: 222,
                    jobId: 'job-b-live',
                    batchId: 'batch-b',
                    mangaTabId: 20,
                    index: 1,
                },
            ],
        };
        const log = jest.fn();

        const reconciler = loadModule().createReconciler({
            state,
            tabExists: jest.fn(async () => true),
            log,
            syncState: jest.fn().mockResolvedValue(),
            processNextJob: jest.fn(),
            recoverPendingFinalization: jest.fn(async () => false),
            recoverPersistedResult: jest.fn(async () => false),
        });

        await expect(reconciler.reconcile()).resolves.toEqual({
            alive: 1,
            dropped: 1,
            recovered: 0,
            foreign: 1,
        });

        expect(state.jobIndex).toEqual([
            expect.objectContaining({
                geminiTabId: 222,
                batchId: 'batch-b',
            }),
        ]);
        expect(state.activeJobsCount).toBe(1);
        expect(global.chrome.tabs.remove).toHaveBeenCalledWith(111, expect.any(Function));
        expect(removedKeys).toEqual(expect.arrayContaining([
            'gemini_job_111',
            'wd_data_111',
        ]));
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'JOB_RECONCILE_FOREIGN_BATCH_DROP',
            expect.stringContaining('lotes anteriores'),
            expect.objectContaining({ currentBatchId: 'batch-b' })
        );
    });

    test('RECON-FIFO-02: sem lote corrente, reconciliação não inventa foreign batch', async () => {
        global.chrome = {
            runtime: { lastError: null },
            tabs: { remove: jest.fn() },
            alarms: { clear: jest.fn() },
            storage: { local: { remove: jest.fn(async () => {}) } },
        };
        const state = {
            currentBatchId: null,
            activeMangaTabId: null,
            activeJobsCount: 0,
            jobIndex: [
                { geminiTabId: 333, jobId: 'job-restored', batchId: 'batch-restored', mangaTabId: 30 },
            ],
        };

        const reconciler = loadModule().createReconciler({
            state,
            tabExists: jest.fn(async () => true),
            log: jest.fn(),
            syncState: jest.fn().mockResolvedValue(),
            processNextJob: jest.fn(),
            recoverPendingFinalization: jest.fn(async () => false),
            recoverPersistedResult: jest.fn(async () => false),
        });

        const result = await reconciler.reconcile();
        expect(result).toEqual({ alive: 1, dropped: 0, recovered: 0, foreign: 0 });
        expect(state.activeJobsCount).toBe(1);
        expect(state.jobIndex).toHaveLength(1);
        expect(global.chrome.tabs.remove).not.toHaveBeenCalled();
    });
});
~~~

## 14. Análise posicional

### Linha 001

- **Conteúdo:** `'use strict';`
- **Papel:** Ativa strict mode.

### Linha 002

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em bootstrap; sem efeito runtime.

### Linha 003

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa `path` para resolução portável do módulo.

### Linha 004

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em bootstrap; sem efeito runtime.

### Linha 005

- **Conteúdo:** `const MODULE_PATH = path.resolve(`
- **Papel:** Inicia resolução do módulo real.

### Linha 006

- **Conteúdo:** `    __dirname,`
- **Papel:** Compõe bootstrap; conteúdo exato: `__dirname,`.

### Linha 007

- **Conteúdo:** `    '../../../extension/background/jobs-reconciliation.js'`
- **Papel:** Aponta para `extension/background/jobs-reconciliation.js`.

### Linha 008

- **Conteúdo:** `);`
- **Papel:** Compõe bootstrap; conteúdo exato: `);`.

### Linha 009

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em bootstrap; sem efeito runtime.

### Linha 010

- **Conteúdo:** `function loadModule() {`
- **Papel:** Abre o loader do módulo real.

### Linha 011

- **Conteúdo:** `    global.self = global;`
- **Papel:** Expõe `self` no ambiente Node/Jest.

### Linha 012

- **Conteúdo:** `    delete global.MangaTranslatorJobsReconciliation;`
- **Papel:** Remove API global anterior.

### Linha 013

- **Conteúdo:** `    jest.isolateModules(() => require(MODULE_PATH));`
- **Papel:** Carrega o reconciler real com registry isolado.

### Linha 014

- **Conteúdo:** `    return global.MangaTranslatorJobsReconciliation;`
- **Papel:** Retorna a API real.

### Linha 015

- **Conteúdo:** `}`
- **Papel:** Compõe bootstrap; conteúdo exato: `}`.

### Linha 016

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em cleanup; sem efeito runtime.

### Linha 017

- **Conteúdo:** `describe('background/jobs-reconciliation.js - isolamento entre lotes FIFO', () => {`
- **Papel:** Abre a suíte de isolamento FIFO.

### Linha 018

- **Conteúdo:** `    afterEach(() => {`
- **Papel:** Abre cleanup por teste.

### Linha 019

- **Conteúdo:** `        delete global.MangaTranslatorJobsReconciliation;`
- **Papel:** Remove a API global.

### Linha 020

- **Conteúdo:** `        delete global.chrome;`
- **Papel:** Remove o Chrome mock local.

### Linha 021

- **Conteúdo:** `        jest.restoreAllMocks();`
- **Papel:** Restaura mocks Jest.

### Linha 022

- **Conteúdo:** `    });`
- **Papel:** Compõe cleanup; conteúdo exato: `});`.

### Linha 023

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-01; sem efeito runtime.

### Linha 024

- **Conteúdo:** `    test('RECON-FIFO-01: job tardio de A é removido sem ocupar slot do lote B', async () => {`
- **Papel:** Abre RECON-FIFO-01: job tardio de A deve sair quando B é corrente.

### Linha 025

- **Conteúdo:** `        const removedKeys = [];`
- **Papel:** Coleta chaves removidas do storage.

### Linha 026

- **Conteúdo:** `        global.chrome = {`
- **Papel:** Instala Chrome mock explícito.

### Linha 027

- **Conteúdo:** `            runtime: { lastError: null },`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `runtime: { lastError: null },`.

### Linha 028

- **Conteúdo:** `            tabs: {`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `tabs: {`.

### Linha 029

- **Conteúdo:** `                remove: jest.fn((_tabId, callback) => callback?.()),`
- **Papel:** Mocka fechamento de tab.

### Linha 030

- **Conteúdo:** `            },`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `},`.

### Linha 031

- **Conteúdo:** `            alarms: {`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `alarms: {`.

### Linha 032

- **Conteúdo:** `                clear: jest.fn((_name, callback) => callback?.(true)),`
- **Papel:** Mocka limpeza de alarm.

### Linha 033

- **Conteúdo:** `            },`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `},`.

### Linha 034

- **Conteúdo:** `            storage: {`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `storage: {`.

### Linha 035

- **Conteúdo:** `                local: {`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `local: {`.

### Linha 036

- **Conteúdo:** `                    remove: jest.fn(async keys => {`
- **Papel:** Mocka `storage.local.remove`.

### Linha 037

- **Conteúdo:** `                        removedKeys.push(...(Array.isArray(keys) ? keys : [keys]));`
- **Papel:** Registra chaves efetivamente pedidas pelo módulo.

### Linha 038

- **Conteúdo:** `                    }),`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `}),`.

### Linha 039

- **Conteúdo:** `                },`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `},`.

### Linha 040

- **Conteúdo:** `            },`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `},`.

### Linha 041

- **Conteúdo:** `        };`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `};`.

### Linha 042

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-01; sem efeito runtime.

### Linha 043

- **Conteúdo:** `        const state = {`
- **Papel:** Cria estado com dois jobs.

### Linha 044

- **Conteúdo:** `            currentBatchId: 'batch-b',`
- **Papel:** Batch B é corrente.

### Linha 045

- **Conteúdo:** `            activeMangaTabId: 20,`
- **Papel:** Manga tab ativa é 20.

### Linha 046

- **Conteúdo:** `            activeJobsCount: 2,`
- **Papel:** Contador começa em 2.

### Linha 047

- **Conteúdo:** `            jobIndex: [`
- **Papel:** Inicia índice.

### Linha 048

- **Conteúdo:** `                {`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `{`.

### Linha 049

- **Conteúdo:** `                    geminiTabId: 111,`
- **Papel:** Tab do job A tardio.

### Linha 050

- **Conteúdo:** `                    jobId: 'job-a-late',`
- **Papel:** jobId A.

### Linha 051

- **Conteúdo:** `                    batchId: 'batch-a',`
- **Papel:** Batch A diverge do corrente.

### Linha 052

- **Conteúdo:** `                    mangaTabId: 10,`
- **Papel:** Manga tab A.

### Linha 053

- **Conteúdo:** `                    index: 0,`
- **Papel:** Índice A.

### Linha 054

- **Conteúdo:** `                },`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `},`.

### Linha 055

- **Conteúdo:** `                {`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `{`.

### Linha 056

- **Conteúdo:** `                    geminiTabId: 222,`
- **Papel:** Tab do job B.

### Linha 057

- **Conteúdo:** `                    jobId: 'job-b-live',`
- **Papel:** jobId B.

### Linha 058

- **Conteúdo:** `                    batchId: 'batch-b',`
- **Papel:** Batch B coincide com corrente.

### Linha 059

- **Conteúdo:** `                    mangaTabId: 20,`
- **Papel:** Manga tab B.

### Linha 060

- **Conteúdo:** `                    index: 1,`
- **Papel:** Índice B.

### Linha 061

- **Conteúdo:** `                },`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `},`.

### Linha 062

- **Conteúdo:** `            ],`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `],`.

### Linha 063

- **Conteúdo:** `        };`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `};`.

### Linha 064

- **Conteúdo:** `        const log = jest.fn();`
- **Papel:** Spy de log.

### Linha 065

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-01; sem efeito runtime.

### Linha 066

- **Conteúdo:** `        const reconciler = loadModule().createReconciler({`
- **Papel:** Cria reconciler real.

### Linha 067

- **Conteúdo:** `            state,`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `state,`.

### Linha 068

- **Conteúdo:** `            tabExists: jest.fn(async () => true),`
- **Papel:** Declara todas as tabs existentes, isolando o drop pela regra de batch.

### Linha 069

- **Conteúdo:** `            log,`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `log,`.

### Linha 070

- **Conteúdo:** `            syncState: jest.fn().mockResolvedValue(),`
- **Papel:** `syncState` é injetado mas não usado por `reconcile()` direto.

### Linha 071

- **Conteúdo:** `            processNextJob: jest.fn(),`
- **Papel:** `processNextJob` idem.

### Linha 072

- **Conteúdo:** `            recoverPendingFinalization: jest.fn(async () => false),`
- **Papel:** Recovery de finalização desativado.

### Linha 073

- **Conteúdo:** `            recoverPersistedResult: jest.fn(async () => false),`
- **Papel:** Recovery de persistência desativado.

### Linha 074

- **Conteúdo:** `        });`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `});`.

### Linha 075

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-01; sem efeito runtime.

### Linha 076

- **Conteúdo:** `        await expect(reconciler.reconcile()).resolves.toEqual({`
- **Papel:** Executa reconcile real e exige resumo exato.

### Linha 077

- **Conteúdo:** `            alive: 1,`
- **Papel:** Um alive.

### Linha 078

- **Conteúdo:** `            dropped: 1,`
- **Papel:** Um dropped.

### Linha 079

- **Conteúdo:** `            recovered: 0,`
- **Papel:** Zero recovered.

### Linha 080

- **Conteúdo:** `            foreign: 1,`
- **Papel:** Um foreign.

### Linha 081

- **Conteúdo:** `        });`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `});`.

### Linha 082

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-01; sem efeito runtime.

### Linha 083

- **Conteúdo:** `        expect(state.jobIndex).toEqual([`
- **Papel:** Exige índice final.

### Linha 084

- **Conteúdo:** `            expect.objectContaining({`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `expect.objectContaining({`.

### Linha 085

- **Conteúdo:** `                geminiTabId: 222,`
- **Papel:** Só tab B permanece.

### Linha 086

- **Conteúdo:** `                batchId: 'batch-b',`
- **Papel:** Batch B permanece.

### Linha 087

- **Conteúdo:** `            }),`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `}),`.

### Linha 088

- **Conteúdo:** `        ]);`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `]);`.

### Linha 089

- **Conteúdo:** `        expect(state.activeJobsCount).toBe(1);`
- **Papel:** Contador é reconstruído para 1.

### Linha 090

- **Conteúdo:** `        expect(global.chrome.tabs.remove).toHaveBeenCalledWith(111, expect.any(Function));`
- **Papel:** Exige tentativa de fechar tab A.

### Linha 091

- **Conteúdo:** `        expect(removedKeys).toEqual(expect.arrayContaining([`
- **Papel:** Inicia assertion de cleanup.

### Linha 092

- **Conteúdo:** `            'gemini_job_111',`
- **Papel:** Exige remoção de gemini_job_111.

### Linha 093

- **Conteúdo:** `            'wd_data_111',`
- **Papel:** Exige remoção de wd_data_111.

### Linha 094

- **Conteúdo:** `        ]));`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `]));`.

### Linha 095

- **Conteúdo:** `        expect(log).toHaveBeenCalledWith(`
- **Papel:** Inicia assertion do log foreign.

### Linha 096

- **Conteúdo:** `            'warn',`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `'warn',`.

### Linha 097

- **Conteúdo:** `            'bg',`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `'bg',`.

### Linha 098

- **Conteúdo:** `            'JOB_RECONCILE_FOREIGN_BATCH_DROP',`
- **Papel:** Exige código JOB_RECONCILE_FOREIGN_BATCH_DROP.

### Linha 099

- **Conteúdo:** `            expect.stringContaining('lotes anteriores'),`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `expect.stringContaining('lotes anteriores'),`.

### Linha 100

- **Conteúdo:** `            expect.objectContaining({ currentBatchId: 'batch-b' })`
- **Papel:** Exige currentBatchId B nos metadados.

### Linha 101

- **Conteúdo:** `        );`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `);`.

### Linha 102

- **Conteúdo:** `    });`
- **Papel:** Compõe RECON-FIFO-01; conteúdo exato: `});`.

### Linha 103

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-02; sem efeito runtime.

### Linha 104

- **Conteúdo:** `    test('RECON-FIFO-02: sem lote corrente, reconciliação não inventa foreign batch', async () => {`
- **Papel:** Abre RECON-FIFO-02: sem lote corrente não há foreign inventado.

### Linha 105

- **Conteúdo:** `        global.chrome = {`
- **Papel:** Instala Chrome mock mínimo.

### Linha 106

- **Conteúdo:** `            runtime: { lastError: null },`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `runtime: { lastError: null },`.

### Linha 107

- **Conteúdo:** `            tabs: { remove: jest.fn() },`
- **Papel:** Spy de tabs.remove.

### Linha 108

- **Conteúdo:** `            alarms: { clear: jest.fn() },`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `alarms: { clear: jest.fn() },`.

### Linha 109

- **Conteúdo:** `            storage: { local: { remove: jest.fn(async () => {}) } },`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `storage: { local: { remove: jest.fn(async () => {}) } },`.

### Linha 110

- **Conteúdo:** `        };`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `};`.

### Linha 111

- **Conteúdo:** `        const state = {`
- **Papel:** Cria estado restaurado.

### Linha 112

- **Conteúdo:** `            currentBatchId: null,`
- **Papel:** Nenhum batch corrente.

### Linha 113

- **Conteúdo:** `            activeMangaTabId: null,`
- **Papel:** Sem manga tab ativa.

### Linha 114

- **Conteúdo:** `            activeJobsCount: 0,`
- **Papel:** Contador inicial zero.

### Linha 115

- **Conteúdo:** `            jobIndex: [`
- **Papel:** Índice com um job.

### Linha 116

- **Conteúdo:** `                { geminiTabId: 333, jobId: 'job-restored', batchId: 'batch-restored', mangaTabId: 30 },`
- **Papel:** Job possui batch próprio, mas não há batch corrente para comparar.

### Linha 117

- **Conteúdo:** `            ],`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `],`.

### Linha 118

- **Conteúdo:** `        };`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `};`.

### Linha 119

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-02; sem efeito runtime.

### Linha 120

- **Conteúdo:** `        const reconciler = loadModule().createReconciler({`
- **Papel:** Cria reconciler real.

### Linha 121

- **Conteúdo:** `            state,`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `state,`.

### Linha 122

- **Conteúdo:** `            tabExists: jest.fn(async () => true),`
- **Papel:** Tab existe.

### Linha 123

- **Conteúdo:** `            log: jest.fn(),`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `log: jest.fn(),`.

### Linha 124

- **Conteúdo:** `            syncState: jest.fn().mockResolvedValue(),`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `syncState: jest.fn().mockResolvedValue(),`.

### Linha 125

- **Conteúdo:** `            processNextJob: jest.fn(),`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `processNextJob: jest.fn(),`.

### Linha 126

- **Conteúdo:** `            recoverPendingFinalization: jest.fn(async () => false),`
- **Papel:** Recovery de finalização false.

### Linha 127

- **Conteúdo:** `            recoverPersistedResult: jest.fn(async () => false),`
- **Papel:** Recovery persistido false.

### Linha 128

- **Conteúdo:** `        });`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `});`.

### Linha 129

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual em RECON-FIFO-02; sem efeito runtime.

### Linha 130

- **Conteúdo:** `        const result = await reconciler.reconcile();`
- **Papel:** Executa reconcile.

### Linha 131

- **Conteúdo:** `        expect(result).toEqual({ alive: 1, dropped: 0, recovered: 0, foreign: 0 });`
- **Papel:** Exige alive=1 e zero drops/recoveries/foreign.

### Linha 132

- **Conteúdo:** `        expect(state.activeJobsCount).toBe(1);`
- **Papel:** Contador reconstruído para 1.

### Linha 133

- **Conteúdo:** `        expect(state.jobIndex).toHaveLength(1);`
- **Papel:** Índice preservado.

### Linha 134

- **Conteúdo:** `        expect(global.chrome.tabs.remove).not.toHaveBeenCalled();`
- **Papel:** Nenhuma tab fechada.

### Linha 135

- **Conteúdo:** `    });`
- **Papel:** Compõe RECON-FIFO-02; conteúdo exato: `});`.

### Linha 136

- **Conteúdo:** `});`
- **Papel:** Fecha suíte.

### Linha 137

- **Conteúdo:** _linha em branco_
- **Papel:** Documenta newline final.


## 15. Autoauditoria

- SHA reconfirmado: **032df2351f2a202dff11f227f8c4dc6ac5b80807**.
- Reserva reconfirmada: **AGENTE 23**.
- Fonte integral: sim.
- Cobertura: **137/137 posições** (136 linhas + newline).
- Módulo real e lifecycle lidos: sim.
- TAB-12 externo lido: sim.
- Bíblia da implementação: lida em read-only.
- Arquivos externos alterados: nenhum.
- Solicitações OPEN: 152-001, 152-002.
- Globais STATUS/CHECKLIST/AUDITORIA: não modificados.
- **Linhas desta Bíblia:** 979.

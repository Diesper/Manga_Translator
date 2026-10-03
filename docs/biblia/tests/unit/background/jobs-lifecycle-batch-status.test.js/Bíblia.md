# Bíblia técnica — jobs-lifecycle-batch-status.test.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `820f8c87379fe70b236df49d26f78962f5467b83`  
> **Agente responsável pela auditoria:** AGENTE 12  
> **Tipo:** suíte Jest de lifecycle real — contabilização, conclusão idempotente, recovery e FIFO multi-batch  
> **Linhas textuais:** **1082**  
> **Posições documentais:** **1083**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/unit/background/jobs-lifecycle-batch-status.test.js` carrega diretamente `extension/background/jobs-lifecycle.js` e exercita as transições críticas que determinam quando um batch termina, como jobs atrasados são contabilizados, como batches pendentes são promovidos e como o sistema se recupera de um worker reiniciado.

Diferentemente de testes espelho, `loadLifecycle()` executa o módulo de produção real em `jest.isolateModules`. Os colaboradores externos — Chrome APIs, persistência de estado, índice de jobs, watchdog e geração de ids — são mocks/stubs explícitos, enquanto a lógica de lifecycle permanece real.

## 2. Cenários provados

### BATCH-STATUS-01 — lote incompleto

Com `completedJobs=2` e `totalJobs=3`, `processNextJob()` emite `BATCH_COMPLETE` com `hasErrors: true`, registra `BATCH_DONE` em nível warn com os contadores e encerra `isProcessing`.

### BATCH-STATUS-02 — finalize por erro

`finalizeJob(..., fromError=true)` remove o slot ativo sem incrementar `completedJobs`. A suíte prova que erro não é contado como sucesso.

### BATCH-STATUS-03 — lote integral

Com 3/3 concluídos, o batch termina com `hasErrors: false` e log de sucesso.

### BATCH-STATUS-04 — conclusão concorrente idempotente

Três chamadas concorrentes a `processNextJob()`, combinadas com `state.mutate` serializado, produzem exatamente uma mensagem `BATCH_COMPLETE`, um log `BATCH_DONE` e um único `completionClaimedBatchId`.

### Recovery de resultado persistido

Um job restaurado com `state: dom_applied` e `resultPersisted: true` é finalizado sem regeneração: incrementa sucesso, remove índice/storage e registra `JOB_RECONCILE_PERSISTED_RESULT`.

### FIFO A→B→C→D e A→…→G

A suíte prova ordem exata de conclusão e promoção para filas de quatro e sete batches. Também existe stress case com **64 batches**, exigindo igualdade integral da sequência e unicidade dos 64 ids.

### Finalização tardia de batch antigo

`finalizeJob` de A após B já ser atual não altera `completedJobs` nem `activeJobsCount` de B e registra `JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED`.

### Restart com conclusão já claimed

Estado reiniciado com A já concluído e `isProcessing` residual promove B sem repetir `BATCH_COMPLETE` de A.

### Erro tardio ao abrir A

Quando `tabs.create` de A falha depois de B assumir o estado, o slot ativo de B é preservado e o erro antigo é registrado como `JOB_ERROR_FOREIGN_BATCH_IGNORED`, sem notificar erro integrado para A.

### minimized_window

O teste bloqueia `windows.update` e prova que `gemini_job_321` + `jobIndex` já existem em estado `opening` **antes** da confirmação física de minimização. Depois libera a Promise e verifica `windows.get` e o log `GEMINI_WINDOW_STATE`.

## 3. Evidência automatizada

| Contrato | Classificação |
|---|---|
| hasErrors deriva de completed < total | ✅ PROVADO DIRETAMENTE |
| finalizeJob por erro não incrementa sucesso | ✅ PROVADO DIRETAMENTE |
| conclusão integral sinaliza sucesso | ✅ PROVADO DIRETAMENTE |
| claim evita conclusão duplicada sob concorrência | ✅ PROVADO DIRETAMENTE |
| recovery de resultado persistido não regenera | ✅ PROVADO DIRETAMENTE |
| promoção FIFO B/C/D | ✅ PROVADO DIRETAMENTE |
| promoção FIFO até G | ✅ PROVADO DIRETAMENTE |
| fila de 64 não perde/duplica/reordena | ✅ PROVADO DIRETAMENTE |
| job tardio de batch antigo não contamina atual | ✅ PROVADO DIRETAMENTE |
| restart não repete batch já claimed | ✅ PROVADO DIRETAMENTE |
| erro de abertura tardio não decrementa slot do novo batch | ✅ PROVADO DIRETAMENTE |
| staging de minimized_window precede confirmação física | ✅ PROVADO DIRETAMENTE |

## 4. Qualidade e limites

A suíte tem cobertura forte sobre a lógica de produção e inclui races controladas. O principal ponto de manutenção encontrado é nomenclatura duplicada: existem dois testes prefixados `BATCH-STATUS-06` e dois prefixados `BATCH-STATUS-07`, embora cubram casos distintos. Isso não reduz a prova funcional, mas dificulta localizar falhas e rastrear matrizes/requisitos.

Os mocks não validam comportamento real do Chrome/Service Worker; eles validam como o lifecycle reage aos resultados das APIs. Persistência completa é substituída em vários cenários por `syncState: jest.fn().mockResolvedValue()`, então durabilidade do mecanismo de storage pertence a outras suítes.

## 5. Invariantes

1. Um batch só pode reivindicar conclusão uma vez.
2. `hasErrors` deve refletir sucesso concluído versus total esperado.
3. Job finalizado por erro não pode aumentar `completedJobs`.
4. Finalização tardia de batch não atual não pode alterar contadores do batch atual.
5. Promoções de `pendingBatches` devem preservar FIFO sem perda ou duplicação.
6. Recovery de resultado já persistido deve contabilizá-lo sem refazer geração.
7. Estado reiniciado com batch já claimed deve prosseguir ao próximo sem repetir conclusão.
8. Erro assíncrono de batch antigo não pode liberar slot pertencente ao batch novo.
9. Em `minimized_window`, job/index precisam existir antes da espera física de estado da janela.
10. O SHA desta Bíblia só permanece válido enquanto o fonte for `820f8c87379fe70b236df49d26f78962f5467b83`.

## 6. Lacunas e solicitação ao auditor

- **151-001 — TEST_MAINTENANCE — OPEN:** renomear os identificadores humanos duplicados `BATCH-STATUS-06` e `BATCH-STATUS-07` para ids únicos, preservando os cenários e assertions. A duplicidade não é bug funcional, mas reduz rastreabilidade de falhas e de documentação.

## 7. Fonte integral auditada

```javascript
const path = require('path');

const LIFECYCLE_PATH = path.resolve(
    __dirname,
    '../../../extension/background/jobs-lifecycle.js'
);

function loadLifecycle() {
    global.self = global;
    delete global.MangaTranslatorJobsLifecycle;
    jest.isolateModules(() => require(LIFECYCLE_PATH));
    return global.MangaTranslatorJobsLifecycle;
}

describe('background/jobs-lifecycle batch status', () => {
    afterEach(() => {
        delete global.MangaTranslatorJobsLifecycle;
        delete global.chrome;
        jest.restoreAllMocks();
    });

    test('BATCH-STATUS-01: lote incompleto informa hasErrors sem depender de contador paralelo', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
        };

        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 77,
            currentBatchId: 'batch-1',
            completedJobs: 2,
            totalJobs: 3,
            isProcessing: true,
        };
        const log = jest.fn();
        const syncState = jest.fn().mockResolvedValue();

        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState,
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        expect(sendMessage).toHaveBeenCalledWith(
            77,
            expect.objectContaining({
                action: 'BATCH_COMPLETE',
                batchId: 'batch-1',
                hasErrors: true,
            }),
            expect.any(Function)
        );
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'BATCH_DONE',
            expect.stringContaining('falha'),
            expect.objectContaining({ completed: 2, total: 3, hasErrors: true })
        );
        expect(state.isProcessing).toBe(false);
    });

    test('BATCH-STATUS-02: finalizeJob(fromError=true) deixa completedJobs inalterado', async () => {
        const store = {
            gemini_job_321: {
                jobId: 'job-1',
                batchId: 'batch-1',
                mangaTabId: 77,
                geminiTabId: 321,
                executionMode: 'temp_chat',
            },
            debugMode: true,
            geminiExecutionMode: 'temp_chat',
        };

        global.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: jest.fn(async keys => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        for (const key of list) {
                            if (Object.prototype.hasOwnProperty.call(store, key)) {
                                result[key] = store[key];
                            }
                        }
                        return result;
                    }),
                    set: jest.fn(async values => Object.assign(store, values)),
                    remove: jest.fn(async keys => {
                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
                    }),
                },
            },
            alarms: {
                create: jest.fn(),
            },
            tabs: {
                remove: jest.fn(),
                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),
            },
        };

        const entry = {
            geminiTabId: 321,
            jobId: 'job-1',
            batchId: 'batch-1',
        };
        let indexed = true;
        const state = {
            jobQueue: [],
            activeJobsCount: 1,
            completedJobs: 0,
            totalJobs: 1,
            currentBatchId: 'batch-1',
            stopRequested: true,
            isProcessing: true,
        };

        const api = loadLifecycle().createLifecycle({
            state,
            log: jest.fn(),
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(() => { indexed = false; }),
            indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await expect(api.finalizeJob(321, 77, true)).resolves.toBe(true);

        expect(state.completedJobs).toBe(0);
        expect(state.activeJobsCount).toBe(0);
    });

    test('BATCH-STATUS-03: lote integral informa hasErrors=false', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
        };

        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 77,
            currentBatchId: 'batch-ok',
            completedJobs: 3,
            totalJobs: 3,
            isProcessing: true,
        };
        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        expect(sendMessage).toHaveBeenCalledWith(
            77,
            expect.objectContaining({
                action: 'BATCH_COMPLETE',
                batchId: 'batch-ok',
                hasErrors: false,
            }),
            expect.any(Function)
        );
        expect(log).toHaveBeenCalledWith(
            'success',
            'bg',
            'BATCH_DONE',
            expect.stringContaining('sucesso'),
            expect.objectContaining({ completed: 3, total: 3, hasErrors: false })
        );
    });

    test('BATCH-STATUS-04: duas finalizações concorrentes emitem BATCH_COMPLETE/BATCH_DONE uma única vez', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 77,
            currentBatchId: 'batch-race',
            completionClaimedBatchId: null,
            completedJobs: 2,
            totalJobs: 2,
            isProcessing: true,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await Promise.all([
            api.processNextJob(),
            api.processNextJob(),
            api.processNextJob(),
        ]);

        const completionMessages = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE');
        const completionLogs = log.mock.calls
            .filter(([, , action]) => action === 'BATCH_DONE');

        expect(completionMessages).toHaveLength(1);
        expect(completionMessages[0]).toEqual(expect.objectContaining({
            batchId: 'batch-race',
            hasErrors: false,
        }));
        expect(completionLogs).toHaveLength(1);
        expect(state.completionClaimedBatchId).toBe('batch-race');
        expect(state.isProcessing).toBe(false);
    });


    test('BATCH-STATUS-05: recovery de worker finaliza resultado já persistido sem regenerar', async () => {
        const store = {
            gemini_job_777: {
                jobId: 'job-persisted',
                batchId: 'batch-persisted',
                mangaTabId: 77,
                geminiTabId: 777,
                executionMode: 'temp_chat',
                state: 'dom_applied',
                resultPersisted: true,
            },
            debugMode: true,
            geminiExecutionMode: 'temp_chat',
        };

        global.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: jest.fn(async keys => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        for (const key of list) {
                            if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
                        }
                        return result;
                    }),
                    set: jest.fn(async values => Object.assign(store, values)),
                    remove: jest.fn(async keys => {
                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
                    }),
                },
            },
            alarms: { create: jest.fn() },
            tabs: {
                remove: jest.fn(),
                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),
            },
        };

        const entry = {
            geminiTabId: 777,
            jobId: 'job-persisted',
            batchId: 'batch-persisted',
            mangaTabId: 77,
            index: 2,
        };
        let indexed = true;
        const state = {
            jobQueue: [],
            activeJobsCount: 1,
            completedJobs: 0,
            totalJobs: 1,
            currentBatchId: 'batch-persisted',
            stopRequested: false,
            isProcessing: true,
        };
        const log = jest.fn();

        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(() => { indexed = false; }),
            indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await expect(api.recoverPersistedResult(entry)).resolves.toBe(true);

        expect(state.completedJobs).toBe(1);
        expect(state.activeJobsCount).toBe(0);
        expect(store.gemini_job_777).toBeUndefined();
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'JOB_RECONCILE_PERSISTED_RESULT',
            expect.stringContaining('persistido'),
            expect.objectContaining({ jobId: 'job-pers' })
        );
    });


    test('BATCH-STATUS-06: A conclui e B/C/D são promovidos em FIFO sem pular posições', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        const storageGet = jest.fn(async keys => {
            if (keys === 'maxConcurrentJobs') return { maxConcurrentJobs: 1 };
            return {};
        });
        global.chrome = {
            runtime: { lastError: null },
            storage: { local: { get: storageGet } },
            tabs: { sendMessage },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 10,
            currentBatchId: 'batch-a',
            completionClaimedBatchId: null,
            completedJobs: 1,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: [
                { batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [] },
                { batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [] },
                { batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [] },
            ],
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        const completedBatchIds = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);
        expect(completedBatchIds).toEqual(['batch-a', 'batch-b', 'batch-c', 'batch-d']);

        const promotedBatchIds = log.mock.calls
            .filter(([, , action]) => action === 'BATCH_PROMOTED')
            .map(([, , , , extra]) => extra.batchId);
        expect(promotedBatchIds).toEqual(['batch-b', 'batch-c', 'batch-d']);

        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-d');
        expect(state.isProcessing).toBe(false);
        expect(state.completionClaimedBatchId).toBe('batch-d');
    });

    test('BATCH-STATUS-07: finalização tardia de A não altera contadores de B', async () => {
        const store = {
            gemini_job_321: {
                jobId: 'job-a-late',
                batchId: 'batch-a',
                mangaTabId: 10,
                geminiTabId: 321,
                executionMode: 'temp_chat',
            },
            debugMode: true,
            geminiExecutionMode: 'temp_chat',
        };

        global.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: jest.fn(async keys => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        for (const key of list) {
                            if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
                        }
                        return result;
                    }),
                    set: jest.fn(async values => Object.assign(store, values)),
                    remove: jest.fn(async keys => {
                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
                    }),
                },
            },
            alarms: { create: jest.fn() },
            tabs: {
                remove: jest.fn(),
                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),
            },
        };

        let mutationChain = Promise.resolve();
        const state = {
            jobQueue: [{ batchId: 'batch-b', mangaTabId: 20, index: 2, prompt: 'B' }],
            jobIndex: [
                { geminiTabId: 321, jobId: 'job-a-late', batchId: 'batch-a', mangaTabId: 10, index: 1 },
            ],
            pendingBatches: [],
            activeJobsCount: 2,
            completedJobs: 1,
            totalJobs: 4,
            currentBatchId: 'batch-b',
            activeMangaTabId: 20,
            stopRequested: true,
            isProcessing: true,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: [...state.pendingBatches],
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => state.jobIndex),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await expect(api.finalizeJob(321, 10, false)).resolves.toBe(true);

        expect(state.completedJobs).toBe(1);
        expect(state.activeJobsCount).toBe(2);
        expect(state.jobIndex).toEqual([]);
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',
            expect.stringContaining('não alterou os contadores'),
            expect.objectContaining({
                jobBatchId: 'batch-a',
                currentBatchId: 'batch-b',
            })
        );
    });


    test('BATCH-STATUS-06: A→B→C→D→E→F→G é promovido em FIFO e cada lote conclui uma única vez', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
            storage: {
                local: {
                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),
                },
            },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 101,
            currentBatchId: 'batch-a',
            completionClaimedBatchId: null,
            completedJobs: 1,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: ['b', 'c', 'd', 'e', 'f', 'g'].map((letter, index) => ({
                batchId: `batch-${letter}`,
                mangaTabId: 102 + index,
                prompt: letter.toUpperCase(),
                images: [],
            })),
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        const completedBatchIds = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);

        expect(completedBatchIds).toEqual([
            'batch-a',
            'batch-b',
            'batch-c',
            'batch-d',
            'batch-e',
            'batch-f',
            'batch-g',
        ]);

        const doneLogBatchIds = log.mock.calls
            .filter(([, , action]) => action === 'BATCH_DONE')
            .map(([, , , , extra]) => extra.batchId);
        expect(doneLogBatchIds).toEqual([
            'batch-a',
            'batch-b',
            'batch-c',
            'batch-d',
            'batch-e',
            'batch-f',
            'batch-g',
        ]);

        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-g');
        expect(state.completionClaimedBatchId).toBe('batch-g');
        expect(state.activeJobsCount).toBe(0);
        expect(state.isProcessing).toBe(false);
    });

    test('BATCH-STATUS-07: fila longa de 64 lotes não perde, duplica ou reordena batches', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
            storage: {
                local: {
                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),
                },
            },
        };

        const pendingIds = Array.from({ length: 63 }, (_unused, index) =>
            `batch-${String(index + 2).padStart(2, '0')}`
        );
        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: 1,
            currentBatchId: 'batch-01',
            completionClaimedBatchId: null,
            completedJobs: 1,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: pendingIds.map((batchId, index) => ({
                batchId,
                mangaTabId: index + 2,
                prompt: batchId,
                images: [],
            })),
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const api = loadLifecycle().createLifecycle({
            state,
            log: jest.fn(),
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        const completed = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);
        const expected = ['batch-01', ...pendingIds];

        expect(completed).toEqual(expected);
        expect(new Set(completed).size).toBe(64);
        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-64');
        expect(state.isProcessing).toBe(false);
    });


    test('BATCH-STATUS-08: restart com current já concluído e isProcessing stale promove o próximo lote sem repetir A', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
            storage: {
                local: {
                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),
                },
            },
        };

        let mutationChain = Promise.resolve();
        const state = {
            stopRequested: false,
            jobQueue: [],
            activeJobsCount: 0,
            activeMangaTabId: null,
            currentBatchId: 'batch-a',
            completionClaimedBatchId: 'batch-a',
            completedJobs: 1,
            totalJobs: 1,
            // Flag residual típico de um snapshot interrompido no MV3.
            isProcessing: true,
            pendingBatches: [
                {
                    batchId: 'batch-b',
                    mangaTabId: 202,
                    prompt: 'B',
                    images: [],
                },
            ],
            jobIndex: [],
            _cachedMaxCon: 1,
        };
        state.mutate = mutator => {
            mutationChain = mutationChain.then(async () => {
                const snapshot = {
                    ...state,
                    jobQueue: [...state.jobQueue],
                    jobIndex: [...state.jobIndex],
                    pendingBatches: state.pendingBatches.map(batch => ({
                        ...batch,
                        images: [...batch.images],
                    })),
                };
                delete snapshot.mutate;
                const next = await mutator(snapshot);
                Object.assign(state, next);
                return next;
            });
            return mutationChain;
        };

        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'id',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        const completedIds = sendMessage.mock.calls
            .map(([, message]) => message)
            .filter(message => message?.action === 'BATCH_COMPLETE')
            .map(message => message.batchId);

        expect(completedIds).toEqual(['batch-b']);
        expect(log.mock.calls.filter(([, , action]) => action === 'BATCH_DONE'))
            .toHaveLength(1);
        expect(state.pendingBatches).toEqual([]);
        expect(state.currentBatchId).toBe('batch-b');
        expect(state.completionClaimedBatchId).toBe('batch-b');
        expect(state.isProcessing).toBe(false);
    });


    test('BATCH-STATUS-09: erro tardio ao abrir job de A não decrementa slot de B já promovido', async () => {
        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());
        const state = {
            stopRequested: false,
            jobQueue: [
                { mangaTabId: 101, index: 0, prompt: 'A', batchId: 'batch-a' },
            ],
            activeJobsCount: 0,
            activeMangaTabId: 101,
            currentBatchId: 'batch-a',
            completionClaimedBatchId: null,
            completedJobs: 0,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: [],
            jobIndex: [],
            _cachedMaxCon: 1,
        };

        global.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: jest.fn(async () => ({
                        geminiBaseUrl: 'https://gemini.google.com/app',
                        geminiExecutionMode: 'temp_chat',
                    })),
                    set: jest.fn(async () => {}),
                    remove: jest.fn(async () => {}),
                },
            },
            tabs: {
                create: jest.fn(async () => {
                    // Simula STOP/promoção ocorrendo enquanto tabs.create de A
                    // ainda está pendente. B já possui um slot ativo.
                    state.currentBatchId = 'batch-b';
                    state.activeMangaTabId = 202;
                    state.activeJobsCount = 1;
                    state.isProcessing = true;
                    throw new Error('tabs.create falhou tarde para A');
                }),
                sendMessage,
            },
            windows: {},
            alarms: {
                create: jest.fn(),
                clear: jest.fn(),
            },
        };

        const log = jest.fn();
        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState: jest.fn().mockResolvedValue(),
            sendProgress: jest.fn(),
            armWatchdog: jest.fn(),
            clearWatchdog: jest.fn(),
            indexAddJob: jest.fn(),
            indexRemoveJob: jest.fn(),
            indexJobsOfBatch: jest.fn(() => []),
            delay: async () => {},
            generateId: () => 'job-a-opening',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        await api.processNextJob();

        expect(state.currentBatchId).toBe('batch-b');
        expect(state.activeJobsCount).toBe(1);
        expect(sendMessage).not.toHaveBeenCalledWith(
            101,
            expect.objectContaining({ action: 'SHOW_ERROR_INTEGRATED' }),
            expect.any(Function)
        );
        expect(log).toHaveBeenCalledWith(
            'warn',
            'bg',
            'JOB_ERROR_FOREIGN_BATCH_IGNORED',
            expect.stringContaining('lote anterior'),
            expect.objectContaining({
                batchId: 'batch-a',
                currentBatchId: 'batch-b',
            })
        );
    });


    test('BATCH-STATUS-10: minimized_window persiste o job antes de aguardar confirmação física da janela', async () => {
        const store = {
            geminiBaseUrl: 'https://gemini.google.com/app',
            geminiExecutionMode: 'minimized_window',
        };
        let releaseWindowUpdate;
        let updateStarted = false;

        const state = {
            stopRequested: false,
            jobQueue: [
                { mangaTabId: 77, index: 0, prompt: 'Traduzir', batchId: 'batch-min' },
            ],
            activeJobsCount: 0,
            activeMangaTabId: 77,
            currentBatchId: 'batch-min',
            completionClaimedBatchId: null,
            completedJobs: 0,
            totalJobs: 1,
            isProcessing: true,
            pendingBatches: [],
            jobIndex: [],
            _cachedMaxCon: 1,
        };

        global.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: jest.fn(async keys => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        const result = {};
                        for (const key of list) {
                            if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
                        }
                        return result;
                    }),
                    set: jest.fn(async values => Object.assign(store, values)),
                    remove: jest.fn(async keys => {
                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
                    }),
                },
            },
            windows: {
                create: jest.fn(async () => ({
                    id: 55,
                    state: 'minimized',
                    focused: false,
                    tabs: [{ id: 321, windowId: 55 }],
                })),
                update: jest.fn(() => {
                    updateStarted = true;
                    return new Promise(resolve => { releaseWindowUpdate = resolve; });
                }),
                get: jest.fn(async () => ({ id: 55, state: 'minimized', focused: false })),
                remove: jest.fn(async () => {}),
            },
            tabs: {
                query: jest.fn(async () => [{ id: 321, windowId: 55 }]),
                remove: jest.fn((_tabId, callback) => callback?.()),
                sendMessage: jest.fn((_tabId, _message, callback) => callback?.()),
            },
            alarms: {
                create: jest.fn(),
                clear: jest.fn(),
            },
        };

        const log = jest.fn();
        const syncState = jest.fn().mockResolvedValue();
        const indexAddJob = jest.fn(entry => {
            state.jobIndex = state.jobIndex.filter(job => job.geminiTabId !== entry.geminiTabId);
            state.jobIndex.push(entry);
        });
        const indexRemoveJob = jest.fn(tabId => {
            state.jobIndex = state.jobIndex.filter(job => job.geminiTabId !== tabId);
        });
        const indexJobsOfBatch = jest.fn(batchId =>
            state.jobIndex.filter(job => !batchId || job.batchId === batchId)
        );

        const api = loadLifecycle().createLifecycle({
            state,
            log,
            syncState,
            sendProgress: jest.fn(),
            armWatchdog: jest.fn().mockResolvedValue(),
            clearWatchdog: jest.fn(),
            indexAddJob,
            indexRemoveJob,
            indexJobsOfBatch,
            delay: async () => {},
            generateId: () => 'job-minimized-bootstrap',
            markFinalized: jest.fn(),
            isFinalized: jest.fn(() => false),
            finalizedMarkerTtlMinutes: 5,
        });

        const running = api.processNextJob();

        // Aguarda apenas microtasks: windows.update continua bloqueado.
        for (let attempt = 0; attempt < 20 && !updateStarted; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve();
        }

        expect(updateStarted).toBe(true);
        expect(store.gemini_job_321).toEqual(expect.objectContaining({
            jobId: 'job-minimized-bootstrap',
            batchId: 'batch-min',
            mangaTabId: 77,
            index: 0,
            geminiTabId: 321,
            executionMode: 'minimized_window',
            state: 'opening',
        }));
        expect(state.jobIndex).toEqual([
            expect.objectContaining({
                geminiTabId: 321,
                jobId: 'job-minimized-bootstrap',
                batchId: 'batch-min',
            }),
        ]);

        releaseWindowUpdate({ id: 55, state: 'minimized', focused: false });
        await running;

        expect(global.chrome.windows.get).toHaveBeenCalledWith(55);
        expect(log).toHaveBeenCalledWith(
            'info',
            'bg',
            'GEMINI_WINDOW_STATE',
            expect.any(String),
            expect.objectContaining({ state: 'minimized', focused: false })
        );
    });

});
```

## 8. Cobertura linha a linha

### Linha 1

**Fonte:** `const path = require('path');`

**Função:** Importa `path` para resolver o módulo de lifecycle a partir de `__dirname`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 2

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `const path = require('path');` do bloco seguinte `const LIFECYCLE_PATH = path.resolve(`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 3

**Fonte:** `const LIFECYCLE_PATH = path.resolve(`

**Função:** Resolve o caminho absoluto de `extension/background/jobs-lifecycle.js`, a implementação real exercitada.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — fixa explicitamente o módulo de produção exercitado.

### Linha 4

**Fonte:** `    __dirname,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `__dirname,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 5

**Fonte:** `    '../../../extension/background/jobs-lifecycle.js'`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'../../../extension/background/jobs-lifecycle.js'`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 6

**Fonte:** `);`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `function loadLifecycle() {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 7

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `);` do bloco seguinte `function loadLifecycle() {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 8

**Fonte:** `function loadLifecycle() {`

**Função:** Inicia o helper que limpa o global anterior, carrega o módulo real em isolamento Jest e devolve sua API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 9

**Fonte:** `    global.self = global;`

**Função:** Adapta o escopo Node ao IIFE do módulo de background.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 10

**Fonte:** `    delete global.MangaTranslatorJobsLifecycle;`

**Função:** Remove instância global anterior para garantir novo carregamento sem registry residual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 11

**Fonte:** `    jest.isolateModules(() => require(LIFECYCLE_PATH));`

**Função:** Executa o require do lifecycle real em cache isolado do Jest.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — fixa explicitamente o módulo de produção exercitado.

### Linha 12

**Fonte:** `    return global.MangaTranslatorJobsLifecycle;`

**Função:** Devolve a API de produção registrada pelo módulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 13

**Fonte:** `}`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `describe('background/jobs-lifecycle batch status', () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 14

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}` do bloco seguinte `describe('background/jobs-lifecycle batch status', () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 15

**Fonte:** `describe('background/jobs-lifecycle batch status', () => {`

**Função:** Abre a suíte focada no status e contabilização de batches do lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 16

**Fonte:** `    afterEach(() => {`

**Função:** Inicia teardown que remove globals e restaura mocks após cada caso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 17

**Fonte:** `        delete global.MangaTranslatorJobsLifecycle;`

**Função:** Remove instância global anterior para garantir novo carregamento sem registry residual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 18

**Fonte:** `        delete global.chrome;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delete global.chrome;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 19

**Fonte:** `        jest.restoreAllMocks();`

**Função:** Restaura mocks gerenciados pelo Jest ao terminar o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 20

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-01: lote incompleto informa hasErrors sem depender de contador paralelo', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 21

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-01: lote incompleto informa hasErrors sem depender de contador paralelo', async () => `; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 22

**Fonte:** `    test('BATCH-STATUS-01: lote incompleto informa hasErrors sem depender de contador paralelo', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-01: lote incompleto informa hasErrors sem depender de contador paralelo` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 23

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 24

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 25

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 26

**Fonte:** `            tabs: { sendMessage },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: { sendMessage },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 27

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const state = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 28

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const state = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 29

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 30

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 31

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 32

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 33

**Fonte:** `            activeMangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 34

**Fonte:** `            currentBatchId: 'batch-1',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 35

**Fonte:** `            completedJobs: 2,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 2,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 36

**Fonte:** `            totalJobs: 3,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 3,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 37

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 38

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 39

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 40

**Fonte:** `        const syncState = jest.fn().mockResolvedValue();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const syncState = jest.fn().mockResolvedValue();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 41

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `const syncState = jest.fn().mockResolvedValue();` do bloco seguinte `const api = loadLifecycle().createLifecycle({`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 42

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 43

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 44

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 45

**Fonte:** `            syncState,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `syncState,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 46

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 47

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 48

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 49

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 50

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 51

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 52

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 53

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 54

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 55

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 56

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 57

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 58

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 59

**Fonte:** `        await api.processNextJob();`

**Função:** Executa `processNextJob()` real, que pode concluir o batch, promover pendentes ou abrir trabalho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 60

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await api.processNextJob();` do bloco seguinte `expect(sendMessage).toHaveBeenCalledWith(`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 61

**Fonte:** `        expect(sendMessage).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(sendMessage).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 62

**Fonte:** `            77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 63

**Fonte:** `            expect.objectContaining({`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 64

**Fonte:** `                action: 'BATCH_COMPLETE',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `action: 'BATCH_COMPLETE',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 65

**Fonte:** `                batchId: 'batch-1',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 66

**Fonte:** `                hasErrors: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `hasErrors: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 67

**Fonte:** `            }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect.any(Function)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 68

**Fonte:** `            expect.any(Function)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.any(Function)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 69

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 70

**Fonte:** `        expect(log).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 71

**Fonte:** `            'warn',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'warn',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 72

**Fonte:** `            'bg',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'bg',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 73

**Fonte:** `            'BATCH_DONE',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'BATCH_DONE',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 74

**Fonte:** `            expect.stringContaining('falha'),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.stringContaining('falha'),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 75

**Fonte:** `            expect.objectContaining({ completed: 2, total: 3, hasErrors: true })`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({ completed: 2, total: 3, hasErrors: true })`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 76

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect(state.isProcessing).toBe(false);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 77

**Fonte:** `        expect(state.isProcessing).toBe(false);`

**Função:** Assertion direta sobre a implementação real: `expect(state.isProcessing).toBe(false);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 78

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-02: finalizeJob(fromError=true) deixa completedJobs inalterado', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 79

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-02: finalizeJob(fromError=true) deixa completedJobs inalterado', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 80

**Fonte:** `    test('BATCH-STATUS-02: finalizeJob(fromError=true) deixa completedJobs inalterado', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-02: finalizeJob(fromError=true) deixa completedJobs inalterado` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 81

**Fonte:** `        const store = {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const store = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 82

**Fonte:** `            gemini_job_321: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `gemini_job_321: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 83

**Fonte:** `                jobId: 'job-1',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobId: 'job-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 84

**Fonte:** `                batchId: 'batch-1',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 85

**Fonte:** `                mangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 86

**Fonte:** `                geminiTabId: 321,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiTabId: 321,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 87

**Fonte:** `                executionMode: 'temp_chat',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `executionMode: 'temp_chat',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 88

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `debugMode: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 89

**Fonte:** `            debugMode: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `debugMode: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 90

**Fonte:** `            geminiExecutionMode: 'temp_chat',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiExecutionMode: 'temp_chat',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 91

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `global.chrome = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 92

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `global.chrome = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 93

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 94

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 95

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 96

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 97

**Fonte:** `                    get: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 98

**Fonte:** `                        const list = Array.isArray(keys) ? keys : [keys];`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const list = Array.isArray(keys) ? keys : [keys];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 99

**Fonte:** `                        const result = {};`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const result = {};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 100

**Fonte:** `                        for (const key of list) {`

**Função:** Itera por `for (const key of list) {` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 101

**Fonte:** `                            if (Object.prototype.hasOwnProperty.call(store, key)) {`

**Função:** Avalia `if (Object.prototype.hasOwnProperty.call(store, key)) {` dentro do mock ou helper, modelando o branch exigido pelo cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 102

**Fonte:** `                                result[key] = store[key];`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `result[key] = store[key];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 103

**Fonte:** `                            }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 104

**Fonte:** `                        }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return result;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 105

**Fonte:** `                        return result;`

**Função:** Retorna `result` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 106

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 107

**Fonte:** `                    set: jest.fn(async values => Object.assign(store, values)),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 108

**Fonte:** `                    remove: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 109

**Fonte:** `                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];`

**Função:** Itera por `for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 110

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 111

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 112

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `alarms: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 113

**Fonte:** `            alarms: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `alarms: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 114

**Fonte:** `                create: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `create: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 115

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 116

**Fonte:** `            tabs: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 117

**Fonte:** `                remove: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 118

**Fonte:** `                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 119

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 120

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const entry = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 121

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const entry = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 122

**Fonte:** `        const entry = {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const entry = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 123

**Fonte:** `            geminiTabId: 321,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiTabId: 321,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 124

**Fonte:** `            jobId: 'job-1',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobId: 'job-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 125

**Fonte:** `            batchId: 'batch-1',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 126

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let indexed = true;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 127

**Fonte:** `        let indexed = true;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let indexed = true;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 128

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 129

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 130

**Fonte:** `            activeJobsCount: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 131

**Fonte:** `            completedJobs: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 132

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 133

**Fonte:** `            currentBatchId: 'batch-1',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 134

**Fonte:** `            stopRequested: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 135

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 136

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const api = loadLifecycle().createLifecycle({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 137

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const api = loadLifecycle().createLifecycle({`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 138

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 139

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 140

**Fonte:** `            log: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 141

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 142

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 143

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 144

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 145

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 146

**Fonte:** `            indexRemoveJob: jest.fn(() => { indexed = false; }),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(() => { indexed = false; }),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 147

**Fonte:** `            indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 148

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 149

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 150

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 151

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 152

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 153

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await expect(api.finalizeJob(321, 77, true)).resolves.toBe(true);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 154

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await expect(api.finalizeJob(321, 77, true)).resolves.toBe(true);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 155

**Fonte:** `        await expect(api.finalizeJob(321, 77, true)).resolves.toBe(true);`

**Função:** Executa `finalizeJob()` real para validar contabilização e isolamento entre batches.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 156

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await expect(api.finalizeJob(321, 77, true)).resolves.toBe(true);` do bloco seguinte `expect(state.completedJobs).toBe(0);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 157

**Fonte:** `        expect(state.completedJobs).toBe(0);`

**Função:** Assertion direta sobre a implementação real: `expect(state.completedJobs).toBe(0);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 158

**Fonte:** `        expect(state.activeJobsCount).toBe(0);`

**Função:** Assertion direta sobre a implementação real: `expect(state.activeJobsCount).toBe(0);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 159

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-03: lote integral informa hasErrors=false', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 160

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-03: lote integral informa hasErrors=false', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 161

**Fonte:** `    test('BATCH-STATUS-03: lote integral informa hasErrors=false', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-03: lote integral informa hasErrors=false` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 162

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 163

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 164

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 165

**Fonte:** `            tabs: { sendMessage },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: { sendMessage },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 166

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const state = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 167

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const state = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 168

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 169

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 170

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 171

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 172

**Fonte:** `            activeMangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 173

**Fonte:** `            currentBatchId: 'batch-ok',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-ok',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 174

**Fonte:** `            completedJobs: 3,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 3,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 175

**Fonte:** `            totalJobs: 3,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 3,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 176

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 177

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 178

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 179

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 180

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 181

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 182

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 183

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 184

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 185

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 186

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 187

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 188

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 189

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 190

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 191

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 192

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 193

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 194

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 195

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 196

**Fonte:** `        await api.processNextJob();`

**Função:** Executa `processNextJob()` real, que pode concluir o batch, promover pendentes ou abrir trabalho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 197

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await api.processNextJob();` do bloco seguinte `expect(sendMessage).toHaveBeenCalledWith(`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 198

**Fonte:** `        expect(sendMessage).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(sendMessage).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 199

**Fonte:** `            77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 200

**Fonte:** `            expect.objectContaining({`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 201

**Fonte:** `                action: 'BATCH_COMPLETE',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `action: 'BATCH_COMPLETE',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 202

**Fonte:** `                batchId: 'batch-ok',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-ok',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 203

**Fonte:** `                hasErrors: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `hasErrors: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 204

**Fonte:** `            }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect.any(Function)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 205

**Fonte:** `            expect.any(Function)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.any(Function)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 206

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 207

**Fonte:** `        expect(log).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 208

**Fonte:** `            'success',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'success',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 209

**Fonte:** `            'bg',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'bg',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 210

**Fonte:** `            'BATCH_DONE',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'BATCH_DONE',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 211

**Fonte:** `            expect.stringContaining('sucesso'),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.stringContaining('sucesso'),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 212

**Fonte:** `            expect.objectContaining({ completed: 3, total: 3, hasErrors: false })`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({ completed: 3, total: 3, hasErrors: false })`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 213

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 214

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-04: duas finalizações concorrentes emitem BATCH_COMPLETE/BATCH_DONE uma única vez', async (`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 215

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-04: duas finalizações concorrentes emitem BATCH_COMPLETE/BATCH_DONE uma única vez', as`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 216

**Fonte:** `    test('BATCH-STATUS-04: duas finalizações concorrentes emitem BATCH_COMPLETE/BATCH_DONE uma única vez', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-04: duas finalizações concorrentes emitem BATCH_COMPLETE/BATCH_DONE uma única vez` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 217

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 218

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 219

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 220

**Fonte:** `            tabs: { sendMessage },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: { sendMessage },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 221

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 222

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `let mutationChain = Promise.resolve();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 223

**Fonte:** `        let mutationChain = Promise.resolve();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 224

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 225

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 226

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 227

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 228

**Fonte:** `            activeMangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 229

**Fonte:** `            currentBatchId: 'batch-race',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-race',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 230

**Fonte:** `            completionClaimedBatchId: null,`

**Função:** Configura/observa o claim idempotente de conclusão por meio de `completionClaimedBatchId: null,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 231

**Fonte:** `            completedJobs: 2,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 2,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 232

**Fonte:** `            totalJobs: 2,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 2,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 233

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 234

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `state.mutate = mutator => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 235

**Fonte:** `        state.mutate = mutator => {`

**Função:** Instala serializador de mutações para reproduzir a atomicidade esperada em cenários concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 236

**Fonte:** `            mutationChain = mutationChain.then(async () => {`

**Função:** Encadeia mutações de estado em Promise, impedindo que os callbacks de race editem o snapshot simultaneamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 237

**Fonte:** `                const snapshot = {`

**Função:** Cria snapshot independente do estado para a mutação controlada do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 238

**Fonte:** `                    ...state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 239

**Fonte:** `                    jobQueue: [...state.jobQueue],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [...state.jobQueue],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 240

**Fonte:** `                };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `delete snapshot.mutate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 241

**Fonte:** `                delete snapshot.mutate;`

**Função:** Remove o helper de mutação do snapshot antes de entregá-lo ao mutator de produção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 242

**Fonte:** `                const next = await mutator(snapshot);`

**Função:** Executa o mutator do lifecycle sobre o snapshot serializado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 243

**Fonte:** `                Object.assign(state, next);`

**Função:** Aplica atomicamente o resultado da mutação ao estado observável do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 244

**Fonte:** `                return next;`

**Função:** Retorna `next` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 245

**Fonte:** `            });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return mutationChain;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 246

**Fonte:** `            return mutationChain;`

**Função:** Devolve a cadeia para que o lifecycle aguarde a mutação serializada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 247

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 248

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const log = jest.fn();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 249

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 250

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 251

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 252

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 253

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 254

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 255

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 256

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 257

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 258

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 259

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 260

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 261

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 262

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 263

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 264

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 265

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await Promise.all([`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 266

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await Promise.all([`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 267

**Fonte:** `        await Promise.all([`

**Função:** Dispara chamadas concorrentes para testar idempotência do claim de conclusão sob race.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 268

**Fonte:** `            api.processNextJob(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `api.processNextJob(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 269

**Fonte:** `            api.processNextJob(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `api.processNextJob(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 270

**Fonte:** `            api.processNextJob(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `api.processNextJob(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 271

**Fonte:** `        ]);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `]);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 272

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `]);` do bloco seguinte `const completionMessages = sendMessage.mock.calls`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 273

**Fonte:** `        const completionMessages = sendMessage.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 274

**Fonte:** `            .map(([, message]) => message)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(([, message]) => message)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 275

**Fonte:** `            .filter(message => message?.action === 'BATCH_COMPLETE');`

**Função:** Filtra somente notificações de conclusão para verificar cardinalidade e ordem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 276

**Fonte:** `        const completionLogs = log.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 277

**Fonte:** `            .filter(([, , action]) => action === 'BATCH_DONE');`

**Função:** Filtra apenas logs `BATCH_DONE`, permitindo verificar emissão única e ordenada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 278

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `.filter(([, , action]) => action === 'BATCH_DONE');` do bloco seguinte `expect(completionMessages).toHaveLength(1);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 279

**Fonte:** `        expect(completionMessages).toHaveLength(1);`

**Função:** Assertion direta sobre a implementação real: `expect(completionMessages).toHaveLength(1);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 280

**Fonte:** `        expect(completionMessages[0]).toEqual(expect.objectContaining({`

**Função:** Assertion direta sobre a implementação real: `expect(completionMessages[0]).toEqual(expect.objectContaining({`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 281

**Fonte:** `            batchId: 'batch-race',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-race',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 282

**Fonte:** `            hasErrors: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `hasErrors: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 283

**Fonte:** `        }));`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect(completionLogs).toHaveLength(1);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 284

**Fonte:** `        expect(completionLogs).toHaveLength(1);`

**Função:** Assertion direta sobre a implementação real: `expect(completionLogs).toHaveLength(1);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 285

**Fonte:** `        expect(state.completionClaimedBatchId).toBe('batch-race');`

**Função:** Assertion direta sobre a implementação real: `expect(state.completionClaimedBatchId).toBe('batch-race');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 286

**Fonte:** `        expect(state.isProcessing).toBe(false);`

**Função:** Assertion direta sobre a implementação real: `expect(state.isProcessing).toBe(false);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 287

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-05: recovery de worker finaliza resultado já persistido sem regenerar', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 288

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-05: recovery de worker finaliza resultado já persistido sem regenerar', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 289

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-05: recovery de worker finaliza resultado já persistido sem regenerar', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 290

**Fonte:** `    test('BATCH-STATUS-05: recovery de worker finaliza resultado já persistido sem regenerar', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-05: recovery de worker finaliza resultado já persistido sem regenerar` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 291

**Fonte:** `        const store = {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const store = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 292

**Fonte:** `            gemini_job_777: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `gemini_job_777: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 293

**Fonte:** `                jobId: 'job-persisted',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobId: 'job-persisted',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 294

**Fonte:** `                batchId: 'batch-persisted',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-persisted',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 295

**Fonte:** `                mangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 296

**Fonte:** `                geminiTabId: 777,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiTabId: 777,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 297

**Fonte:** `                executionMode: 'temp_chat',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `executionMode: 'temp_chat',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 298

**Fonte:** `                state: 'dom_applied',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state: 'dom_applied',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 299

**Fonte:** `                resultPersisted: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `resultPersisted: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 300

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `debugMode: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 301

**Fonte:** `            debugMode: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `debugMode: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 302

**Fonte:** `            geminiExecutionMode: 'temp_chat',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiExecutionMode: 'temp_chat',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 303

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `global.chrome = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 304

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `global.chrome = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 305

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 306

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 307

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 308

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 309

**Fonte:** `                    get: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 310

**Fonte:** `                        const list = Array.isArray(keys) ? keys : [keys];`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const list = Array.isArray(keys) ? keys : [keys];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 311

**Fonte:** `                        const result = {};`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const result = {};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 312

**Fonte:** `                        for (const key of list) {`

**Função:** Itera por `for (const key of list) {` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 313

**Fonte:** `                            if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];`

**Função:** Avalia `if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];` dentro do mock ou helper, modelando o branch exigido pelo cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 314

**Fonte:** `                        }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return result;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 315

**Fonte:** `                        return result;`

**Função:** Retorna `result` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 316

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 317

**Fonte:** `                    set: jest.fn(async values => Object.assign(store, values)),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 318

**Fonte:** `                    remove: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 319

**Fonte:** `                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];`

**Função:** Itera por `for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 320

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 321

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 322

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `alarms: { create: jest.fn() },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 323

**Fonte:** `            alarms: { create: jest.fn() },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `alarms: { create: jest.fn() },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 324

**Fonte:** `            tabs: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 325

**Fonte:** `                remove: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 326

**Fonte:** `                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 327

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 328

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const entry = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 329

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const entry = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 330

**Fonte:** `        const entry = {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const entry = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 331

**Fonte:** `            geminiTabId: 777,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiTabId: 777,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 332

**Fonte:** `            jobId: 'job-persisted',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobId: 'job-persisted',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 333

**Fonte:** `            batchId: 'batch-persisted',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-persisted',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 334

**Fonte:** `            mangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 335

**Fonte:** `            index: 2,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `index: 2,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 336

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let indexed = true;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 337

**Fonte:** `        let indexed = true;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let indexed = true;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 338

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 339

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 340

**Fonte:** `            activeJobsCount: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 341

**Fonte:** `            completedJobs: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 342

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 343

**Fonte:** `            currentBatchId: 'batch-persisted',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-persisted',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 344

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 345

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 346

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 347

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 348

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `const log = jest.fn();` do bloco seguinte `const api = loadLifecycle().createLifecycle({`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 349

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 350

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 351

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 352

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 353

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 354

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 355

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 356

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 357

**Fonte:** `            indexRemoveJob: jest.fn(() => { indexed = false; }),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(() => { indexed = false; }),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 358

**Fonte:** `            indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => indexed ? [entry] : []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 359

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 360

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 361

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 362

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 363

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 364

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await expect(api.recoverPersistedResult(entry)).resolves.toBe(true);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 365

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await expect(api.recoverPersistedResult(entry)).resolves.toBe(true);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 366

**Fonte:** `        await expect(api.recoverPersistedResult(entry)).resolves.toBe(true);`

**Função:** Executa o recovery real de resultado já persistido após reinício de worker.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 367

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await expect(api.recoverPersistedResult(entry)).resolves.toBe(true);` do bloco seguinte `expect(state.completedJobs).toBe(1);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 368

**Fonte:** `        expect(state.completedJobs).toBe(1);`

**Função:** Assertion direta sobre a implementação real: `expect(state.completedJobs).toBe(1);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 369

**Fonte:** `        expect(state.activeJobsCount).toBe(0);`

**Função:** Assertion direta sobre a implementação real: `expect(state.activeJobsCount).toBe(0);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 370

**Fonte:** `        expect(store.gemini_job_777).toBeUndefined();`

**Função:** Assertion direta sobre a implementação real: `expect(store.gemini_job_777).toBeUndefined();`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 371

**Fonte:** `        expect(log).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 372

**Fonte:** `            'warn',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'warn',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 373

**Fonte:** `            'bg',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'bg',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 374

**Fonte:** `            'JOB_RECONCILE_PERSISTED_RESULT',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'JOB_RECONCILE_PERSISTED_RESULT',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 375

**Fonte:** `            expect.stringContaining('persistido'),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.stringContaining('persistido'),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 376

**Fonte:** `            expect.objectContaining({ jobId: 'job-pers' })`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({ jobId: 'job-pers' })`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 377

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 378

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-06: A conclui e B/C/D são promovidos em FIFO sem pular posições', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 379

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-06: A conclui e B/C/D são promovidos em FIFO sem pular posições', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 380

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-06: A conclui e B/C/D são promovidos em FIFO sem pular posições', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 381

**Fonte:** `    test('BATCH-STATUS-06: A conclui e B/C/D são promovidos em FIFO sem pular posições', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-06: A conclui e B/C/D são promovidos em FIFO sem pular posições` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 382

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 383

**Fonte:** `        const storageGet = jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const storageGet = jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 384

**Fonte:** `            if (keys === 'maxConcurrentJobs') return { maxConcurrentJobs: 1 };`

**Função:** Avalia `if (keys === 'maxConcurrentJobs') return { maxConcurrentJobs: 1 };` dentro do mock ou helper, modelando o branch exigido pelo cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 385

**Fonte:** `            return {};`

**Função:** Retorna `{}` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 386

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `global.chrome = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 387

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 388

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 389

**Fonte:** `            storage: { local: { get: storageGet } },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: { local: { get: storageGet } },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 390

**Fonte:** `            tabs: { sendMessage },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: { sendMessage },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 391

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 392

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `let mutationChain = Promise.resolve();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 393

**Fonte:** `        let mutationChain = Promise.resolve();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 394

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 395

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 396

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 397

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 398

**Fonte:** `            activeMangaTabId: 10,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 10,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 399

**Fonte:** `            currentBatchId: 'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 400

**Fonte:** `            completionClaimedBatchId: null,`

**Função:** Configura/observa o claim idempotente de conclusão por meio de `completionClaimedBatchId: null,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 401

**Fonte:** `            completedJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 402

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 403

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 404

**Fonte:** `            pendingBatches: [`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 405

**Fonte:** `                { batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [] },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `{ batchId: 'batch-b', mangaTabId: 20, prompt: 'B', images: [] },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 406

**Fonte:** `                { batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [] },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `{ batchId: 'batch-c', mangaTabId: 30, prompt: 'C', images: [] },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 407

**Fonte:** `                { batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [] },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `{ batchId: 'batch-d', mangaTabId: 40, prompt: 'D', images: [] },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 408

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 409

**Fonte:** `            jobIndex: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 410

**Fonte:** `            _cachedMaxCon: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `_cachedMaxCon: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 411

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `state.mutate = mutator => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 412

**Fonte:** `        state.mutate = mutator => {`

**Função:** Instala serializador de mutações para reproduzir a atomicidade esperada em cenários concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 413

**Fonte:** `            mutationChain = mutationChain.then(async () => {`

**Função:** Encadeia mutações de estado em Promise, impedindo que os callbacks de race editem o snapshot simultaneamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 414

**Fonte:** `                const snapshot = {`

**Função:** Cria snapshot independente do estado para a mutação controlada do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 415

**Fonte:** `                    ...state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 416

**Fonte:** `                    jobQueue: [...state.jobQueue],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [...state.jobQueue],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 417

**Fonte:** `                    jobIndex: [...state.jobIndex],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [...state.jobIndex],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 418

**Fonte:** `                    pendingBatches: state.pendingBatches.map(batch => ({`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: state.pendingBatches.map(batch => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 419

**Fonte:** `                        ...batch,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...batch,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 420

**Fonte:** `                        images: [...batch.images],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `images: [...batch.images],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 421

**Fonte:** `                    })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 422

**Fonte:** `                };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `delete snapshot.mutate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 423

**Fonte:** `                delete snapshot.mutate;`

**Função:** Remove o helper de mutação do snapshot antes de entregá-lo ao mutator de produção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 424

**Fonte:** `                const next = await mutator(snapshot);`

**Função:** Executa o mutator do lifecycle sobre o snapshot serializado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 425

**Fonte:** `                Object.assign(state, next);`

**Função:** Aplica atomicamente o resultado da mutação ao estado observável do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 426

**Fonte:** `                return next;`

**Função:** Retorna `next` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 427

**Fonte:** `            });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return mutationChain;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 428

**Fonte:** `            return mutationChain;`

**Função:** Devolve a cadeia para que o lifecycle aguarde a mutação serializada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 429

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 430

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const log = jest.fn();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 431

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 432

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 433

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 434

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 435

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 436

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 437

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 438

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 439

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 440

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 441

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 442

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 443

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 444

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 445

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 446

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 447

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 448

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 449

**Fonte:** `        await api.processNextJob();`

**Função:** Executa `processNextJob()` real, que pode concluir o batch, promover pendentes ou abrir trabalho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 450

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await api.processNextJob();` do bloco seguinte `const completedBatchIds = sendMessage.mock.calls`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 451

**Fonte:** `        const completedBatchIds = sendMessage.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 452

**Fonte:** `            .map(([, message]) => message)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(([, message]) => message)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 453

**Fonte:** `            .filter(message => message?.action === 'BATCH_COMPLETE')`

**Função:** Filtra somente notificações de conclusão para verificar cardinalidade e ordem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 454

**Fonte:** `            .map(message => message.batchId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(message => message.batchId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 455

**Fonte:** `        expect(completedBatchIds).toEqual(['batch-a', 'batch-b', 'batch-c', 'batch-d']);`

**Função:** Assertion direta sobre a implementação real: `expect(completedBatchIds).toEqual(['batch-a', 'batch-b', 'batch-c', 'batch-d']);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 456

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `expect(completedBatchIds).toEqual(['batch-a', 'batch-b', 'batch-c', 'batch-d']);` do bloco seguinte `const promotedBatchIds = log.mock.calls`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 457

**Fonte:** `        const promotedBatchIds = log.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 458

**Fonte:** `            .filter(([, , action]) => action === 'BATCH_PROMOTED')`

**Função:** Filtra logs de promoção para comparar a ordem FIFO efetivamente produzida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 459

**Fonte:** `            .map(([, , , , extra]) => extra.batchId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(([, , , , extra]) => extra.batchId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 460

**Fonte:** `        expect(promotedBatchIds).toEqual(['batch-b', 'batch-c', 'batch-d']);`

**Função:** Assertion direta sobre a implementação real: `expect(promotedBatchIds).toEqual(['batch-b', 'batch-c', 'batch-d']);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 461

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `expect(promotedBatchIds).toEqual(['batch-b', 'batch-c', 'batch-d']);` do bloco seguinte `expect(state.pendingBatches).toEqual([]);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 462

**Fonte:** `        expect(state.pendingBatches).toEqual([]);`

**Função:** Assertion direta sobre a implementação real: `expect(state.pendingBatches).toEqual([]);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 463

**Fonte:** `        expect(state.currentBatchId).toBe('batch-d');`

**Função:** Assertion direta sobre a implementação real: `expect(state.currentBatchId).toBe('batch-d');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 464

**Fonte:** `        expect(state.isProcessing).toBe(false);`

**Função:** Assertion direta sobre a implementação real: `expect(state.isProcessing).toBe(false);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 465

**Fonte:** `        expect(state.completionClaimedBatchId).toBe('batch-d');`

**Função:** Assertion direta sobre a implementação real: `expect(state.completionClaimedBatchId).toBe('batch-d');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 466

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-07: finalização tardia de A não altera contadores de B', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 467

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-07: finalização tardia de A não altera contadores de B', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 468

**Fonte:** `    test('BATCH-STATUS-07: finalização tardia de A não altera contadores de B', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-07: finalização tardia de A não altera contadores de B` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 469

**Fonte:** `        const store = {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const store = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 470

**Fonte:** `            gemini_job_321: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `gemini_job_321: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 471

**Fonte:** `                jobId: 'job-a-late',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobId: 'job-a-late',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 472

**Fonte:** `                batchId: 'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 473

**Fonte:** `                mangaTabId: 10,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: 10,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 474

**Fonte:** `                geminiTabId: 321,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiTabId: 321,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 475

**Fonte:** `                executionMode: 'temp_chat',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `executionMode: 'temp_chat',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 476

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `debugMode: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 477

**Fonte:** `            debugMode: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `debugMode: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 478

**Fonte:** `            geminiExecutionMode: 'temp_chat',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiExecutionMode: 'temp_chat',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 479

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `global.chrome = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 480

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `global.chrome = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 481

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 482

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 483

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 484

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 485

**Fonte:** `                    get: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 486

**Fonte:** `                        const list = Array.isArray(keys) ? keys : [keys];`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const list = Array.isArray(keys) ? keys : [keys];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 487

**Fonte:** `                        const result = {};`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const result = {};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 488

**Fonte:** `                        for (const key of list) {`

**Função:** Itera por `for (const key of list) {` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 489

**Fonte:** `                            if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];`

**Função:** Avalia `if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];` dentro do mock ou helper, modelando o branch exigido pelo cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 490

**Fonte:** `                        }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return result;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 491

**Fonte:** `                        return result;`

**Função:** Retorna `result` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 492

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 493

**Fonte:** `                    set: jest.fn(async values => Object.assign(store, values)),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 494

**Fonte:** `                    remove: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 495

**Fonte:** `                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];`

**Função:** Itera por `for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 496

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 497

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 498

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `alarms: { create: jest.fn() },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 499

**Fonte:** `            alarms: { create: jest.fn() },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `alarms: { create: jest.fn() },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 500

**Fonte:** `            tabs: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 501

**Fonte:** `                remove: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 502

**Fonte:** `                sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendMessage: jest.fn((_tab, _msg, callback) => callback?.()),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 503

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 504

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 505

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `let mutationChain = Promise.resolve();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 506

**Fonte:** `        let mutationChain = Promise.resolve();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 507

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 508

**Fonte:** `            jobQueue: [{ batchId: 'batch-b', mangaTabId: 20, index: 2, prompt: 'B' }],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [{ batchId: 'batch-b', mangaTabId: 20, index: 2, prompt: 'B' }],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 509

**Fonte:** `            jobIndex: [`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 510

**Fonte:** `                { geminiTabId: 321, jobId: 'job-a-late', batchId: 'batch-a', mangaTabId: 10, index: 1 },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `{ geminiTabId: 321, jobId: 'job-a-late', batchId: 'batch-a', mangaTabId: 10, index: 1 },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 511

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `pendingBatches: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 512

**Fonte:** `            pendingBatches: [],`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 513

**Fonte:** `            activeJobsCount: 2,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 2,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 514

**Fonte:** `            completedJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 515

**Fonte:** `            totalJobs: 4,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 4,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 516

**Fonte:** `            currentBatchId: 'batch-b',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-b',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 517

**Fonte:** `            activeMangaTabId: 20,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 20,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 518

**Fonte:** `            stopRequested: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 519

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 520

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `state.mutate = mutator => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 521

**Fonte:** `        state.mutate = mutator => {`

**Função:** Instala serializador de mutações para reproduzir a atomicidade esperada em cenários concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 522

**Fonte:** `            mutationChain = mutationChain.then(async () => {`

**Função:** Encadeia mutações de estado em Promise, impedindo que os callbacks de race editem o snapshot simultaneamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 523

**Fonte:** `                const snapshot = {`

**Função:** Cria snapshot independente do estado para a mutação controlada do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 524

**Fonte:** `                    ...state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 525

**Fonte:** `                    jobQueue: [...state.jobQueue],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [...state.jobQueue],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 526

**Fonte:** `                    jobIndex: [...state.jobIndex],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [...state.jobIndex],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 527

**Fonte:** `                    pendingBatches: [...state.pendingBatches],`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: [...state.pendingBatches],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 528

**Fonte:** `                };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `delete snapshot.mutate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 529

**Fonte:** `                delete snapshot.mutate;`

**Função:** Remove o helper de mutação do snapshot antes de entregá-lo ao mutator de produção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 530

**Fonte:** `                const next = await mutator(snapshot);`

**Função:** Executa o mutator do lifecycle sobre o snapshot serializado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 531

**Fonte:** `                Object.assign(state, next);`

**Função:** Aplica atomicamente o resultado da mutação ao estado observável do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 532

**Fonte:** `                return next;`

**Função:** Retorna `next` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 533

**Fonte:** `            });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return mutationChain;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 534

**Fonte:** `            return mutationChain;`

**Função:** Devolve a cadeia para que o lifecycle aguarde a mutação serializada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 535

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 536

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const log = jest.fn();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 537

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 538

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 539

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 540

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 541

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 542

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 543

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 544

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 545

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 546

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 547

**Fonte:** `            indexJobsOfBatch: jest.fn(() => state.jobIndex),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => state.jobIndex),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 548

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 549

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 550

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 551

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 552

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 553

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await expect(api.finalizeJob(321, 10, false)).resolves.toBe(true);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 554

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await expect(api.finalizeJob(321, 10, false)).resolves.toBe(true);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 555

**Fonte:** `        await expect(api.finalizeJob(321, 10, false)).resolves.toBe(true);`

**Função:** Executa `finalizeJob()` real para validar contabilização e isolamento entre batches.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 556

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await expect(api.finalizeJob(321, 10, false)).resolves.toBe(true);` do bloco seguinte `expect(state.completedJobs).toBe(1);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 557

**Fonte:** `        expect(state.completedJobs).toBe(1);`

**Função:** Assertion direta sobre a implementação real: `expect(state.completedJobs).toBe(1);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 558

**Fonte:** `        expect(state.activeJobsCount).toBe(2);`

**Função:** Assertion direta sobre a implementação real: `expect(state.activeJobsCount).toBe(2);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 559

**Fonte:** `        expect(state.jobIndex).toEqual([]);`

**Função:** Assertion direta sobre a implementação real: `expect(state.jobIndex).toEqual([]);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 560

**Fonte:** `        expect(log).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 561

**Fonte:** `            'warn',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'warn',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 562

**Fonte:** `            'bg',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'bg',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 563

**Fonte:** `            'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'JOB_ACCOUNTING_FOREIGN_BATCH_IGNORED',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 564

**Fonte:** `            expect.stringContaining('não alterou os contadores'),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.stringContaining('não alterou os contadores'),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 565

**Fonte:** `            expect.objectContaining({`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 566

**Fonte:** `                jobBatchId: 'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobBatchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 567

**Fonte:** `                currentBatchId: 'batch-b',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-b',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 568

**Fonte:** `            })`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 569

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 570

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-06: A→B→C→D→E→F→G é promovido em FIFO e cada lote conclui uma única vez', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 571

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-06: A→B→C→D→E→F→G é promovido em FIFO e cada lote conclui uma única vez', async () => `; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 572

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-06: A→B→C→D→E→F→G é promovido em FIFO e cada lote conclui uma única vez', async () => `; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 573

**Fonte:** `    test('BATCH-STATUS-06: A→B→C→D→E→F→G é promovido em FIFO e cada lote conclui uma única vez', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-06: A→B→C→D→E→F→G é promovido em FIFO e cada lote conclui uma única vez` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 574

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 575

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 576

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 577

**Fonte:** `            tabs: { sendMessage },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: { sendMessage },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 578

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 579

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 580

**Fonte:** `                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 581

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 582

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 583

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 584

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `let mutationChain = Promise.resolve();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 585

**Fonte:** `        let mutationChain = Promise.resolve();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 586

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 587

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 588

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 589

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 590

**Fonte:** `            activeMangaTabId: 101,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 101,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 591

**Fonte:** `            currentBatchId: 'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 592

**Fonte:** `            completionClaimedBatchId: null,`

**Função:** Configura/observa o claim idempotente de conclusão por meio de `completionClaimedBatchId: null,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 593

**Fonte:** `            completedJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 594

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 595

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 596

**Fonte:** `            pendingBatches: ['b', 'c', 'd', 'e', 'f', 'g'].map((letter, index) => ({`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: ['b', 'c', 'd', 'e', 'f', 'g'].map((letter, index) => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 597

**Fonte:** `                batchId: \`batch-${letter}\`,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: \`batch-${letter}\`,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 598

**Fonte:** `                mangaTabId: 102 + index,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: 102 + index,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 599

**Fonte:** `                prompt: letter.toUpperCase(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `prompt: letter.toUpperCase(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 600

**Fonte:** `                images: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `images: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 601

**Fonte:** `            })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 602

**Fonte:** `            jobIndex: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 603

**Fonte:** `            _cachedMaxCon: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `_cachedMaxCon: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 604

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `state.mutate = mutator => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 605

**Fonte:** `        state.mutate = mutator => {`

**Função:** Instala serializador de mutações para reproduzir a atomicidade esperada em cenários concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 606

**Fonte:** `            mutationChain = mutationChain.then(async () => {`

**Função:** Encadeia mutações de estado em Promise, impedindo que os callbacks de race editem o snapshot simultaneamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 607

**Fonte:** `                const snapshot = {`

**Função:** Cria snapshot independente do estado para a mutação controlada do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 608

**Fonte:** `                    ...state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 609

**Fonte:** `                    jobQueue: [...state.jobQueue],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [...state.jobQueue],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 610

**Fonte:** `                    jobIndex: [...state.jobIndex],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [...state.jobIndex],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 611

**Fonte:** `                    pendingBatches: state.pendingBatches.map(batch => ({`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: state.pendingBatches.map(batch => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 612

**Fonte:** `                        ...batch,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...batch,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 613

**Fonte:** `                        images: [...batch.images],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `images: [...batch.images],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 614

**Fonte:** `                    })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 615

**Fonte:** `                };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `delete snapshot.mutate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 616

**Fonte:** `                delete snapshot.mutate;`

**Função:** Remove o helper de mutação do snapshot antes de entregá-lo ao mutator de produção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 617

**Fonte:** `                const next = await mutator(snapshot);`

**Função:** Executa o mutator do lifecycle sobre o snapshot serializado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 618

**Fonte:** `                Object.assign(state, next);`

**Função:** Aplica atomicamente o resultado da mutação ao estado observável do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 619

**Fonte:** `                return next;`

**Função:** Retorna `next` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 620

**Fonte:** `            });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return mutationChain;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 621

**Fonte:** `            return mutationChain;`

**Função:** Devolve a cadeia para que o lifecycle aguarde a mutação serializada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 622

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 623

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const log = jest.fn();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 624

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 625

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 626

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 627

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 628

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 629

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 630

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 631

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 632

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 633

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 634

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 635

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 636

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 637

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 638

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 639

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 640

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 641

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 642

**Fonte:** `        await api.processNextJob();`

**Função:** Executa `processNextJob()` real, que pode concluir o batch, promover pendentes ou abrir trabalho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 643

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await api.processNextJob();` do bloco seguinte `const completedBatchIds = sendMessage.mock.calls`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 644

**Fonte:** `        const completedBatchIds = sendMessage.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 645

**Fonte:** `            .map(([, message]) => message)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(([, message]) => message)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 646

**Fonte:** `            .filter(message => message?.action === 'BATCH_COMPLETE')`

**Função:** Filtra somente notificações de conclusão para verificar cardinalidade e ordem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 647

**Fonte:** `            .map(message => message.batchId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(message => message.batchId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 648

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `.map(message => message.batchId);` do bloco seguinte `expect(completedBatchIds).toEqual([`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 649

**Fonte:** `        expect(completedBatchIds).toEqual([`

**Função:** Assertion direta sobre a implementação real: `expect(completedBatchIds).toEqual([`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 650

**Fonte:** `            'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 651

**Fonte:** `            'batch-b',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-b',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 652

**Fonte:** `            'batch-c',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-c',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 653

**Fonte:** `            'batch-d',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-d',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 654

**Fonte:** `            'batch-e',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-e',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 655

**Fonte:** `            'batch-f',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-f',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 656

**Fonte:** `            'batch-g',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-g',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 657

**Fonte:** `        ]);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `]);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 658

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `]);` do bloco seguinte `const doneLogBatchIds = log.mock.calls`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 659

**Fonte:** `        const doneLogBatchIds = log.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 660

**Fonte:** `            .filter(([, , action]) => action === 'BATCH_DONE')`

**Função:** Filtra apenas logs `BATCH_DONE`, permitindo verificar emissão única e ordenada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 661

**Fonte:** `            .map(([, , , , extra]) => extra.batchId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(([, , , , extra]) => extra.batchId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 662

**Fonte:** `        expect(doneLogBatchIds).toEqual([`

**Função:** Assertion direta sobre a implementação real: `expect(doneLogBatchIds).toEqual([`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 663

**Fonte:** `            'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 664

**Fonte:** `            'batch-b',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-b',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 665

**Fonte:** `            'batch-c',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-c',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 666

**Fonte:** `            'batch-d',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-d',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 667

**Fonte:** `            'batch-e',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-e',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 668

**Fonte:** `            'batch-f',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-f',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 669

**Fonte:** `            'batch-g',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'batch-g',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 670

**Fonte:** `        ]);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `]);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 671

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `]);` do bloco seguinte `expect(state.pendingBatches).toEqual([]);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 672

**Fonte:** `        expect(state.pendingBatches).toEqual([]);`

**Função:** Assertion direta sobre a implementação real: `expect(state.pendingBatches).toEqual([]);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 673

**Fonte:** `        expect(state.currentBatchId).toBe('batch-g');`

**Função:** Assertion direta sobre a implementação real: `expect(state.currentBatchId).toBe('batch-g');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 674

**Fonte:** `        expect(state.completionClaimedBatchId).toBe('batch-g');`

**Função:** Assertion direta sobre a implementação real: `expect(state.completionClaimedBatchId).toBe('batch-g');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 675

**Fonte:** `        expect(state.activeJobsCount).toBe(0);`

**Função:** Assertion direta sobre a implementação real: `expect(state.activeJobsCount).toBe(0);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 676

**Fonte:** `        expect(state.isProcessing).toBe(false);`

**Função:** Assertion direta sobre a implementação real: `expect(state.isProcessing).toBe(false);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 677

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-07: fila longa de 64 lotes não perde, duplica ou reordena batches', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 678

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-07: fila longa de 64 lotes não perde, duplica ou reordena batches', async () => {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 679

**Fonte:** `    test('BATCH-STATUS-07: fila longa de 64 lotes não perde, duplica ou reordena batches', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-07: fila longa de 64 lotes não perde, duplica ou reordena batches` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 680

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 681

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 682

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 683

**Fonte:** `            tabs: { sendMessage },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: { sendMessage },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 684

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 685

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 686

**Fonte:** `                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 687

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 688

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 689

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const pendingIds = Array.from({ length: 63 }, (_unused, index) =>`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 690

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const pendingIds = Array.from({ length: 63 }, (_unused, index) =>`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 691

**Fonte:** `        const pendingIds = Array.from({ length: 63 }, (_unused, index) =>`

**Função:** Gera 63 ids adicionais para o stress case de 64 batches totais.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 692

**Fonte:** `            \`batch-${String(index + 2).padStart(2, '0')}\``

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `\`batch-${String(index + 2).padStart(2, '0')}\``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 693

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 694

**Fonte:** `        let mutationChain = Promise.resolve();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 695

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 696

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 697

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 698

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 699

**Fonte:** `            activeMangaTabId: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 700

**Fonte:** `            currentBatchId: 'batch-01',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-01',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 701

**Fonte:** `            completionClaimedBatchId: null,`

**Função:** Configura/observa o claim idempotente de conclusão por meio de `completionClaimedBatchId: null,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 702

**Fonte:** `            completedJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 703

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 704

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 705

**Fonte:** `            pendingBatches: pendingIds.map((batchId, index) => ({`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: pendingIds.map((batchId, index) => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 706

**Fonte:** `                batchId,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 707

**Fonte:** `                mangaTabId: index + 2,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: index + 2,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 708

**Fonte:** `                prompt: batchId,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `prompt: batchId,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 709

**Fonte:** `                images: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `images: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 710

**Fonte:** `            })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 711

**Fonte:** `            jobIndex: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 712

**Fonte:** `            _cachedMaxCon: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `_cachedMaxCon: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 713

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `state.mutate = mutator => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 714

**Fonte:** `        state.mutate = mutator => {`

**Função:** Instala serializador de mutações para reproduzir a atomicidade esperada em cenários concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 715

**Fonte:** `            mutationChain = mutationChain.then(async () => {`

**Função:** Encadeia mutações de estado em Promise, impedindo que os callbacks de race editem o snapshot simultaneamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 716

**Fonte:** `                const snapshot = {`

**Função:** Cria snapshot independente do estado para a mutação controlada do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 717

**Fonte:** `                    ...state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 718

**Fonte:** `                    jobQueue: [...state.jobQueue],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [...state.jobQueue],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 719

**Fonte:** `                    jobIndex: [...state.jobIndex],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [...state.jobIndex],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 720

**Fonte:** `                    pendingBatches: state.pendingBatches.map(batch => ({`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: state.pendingBatches.map(batch => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 721

**Fonte:** `                        ...batch,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...batch,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 722

**Fonte:** `                        images: [...batch.images],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `images: [...batch.images],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 723

**Fonte:** `                    })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 724

**Fonte:** `                };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `delete snapshot.mutate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 725

**Fonte:** `                delete snapshot.mutate;`

**Função:** Remove o helper de mutação do snapshot antes de entregá-lo ao mutator de produção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 726

**Fonte:** `                const next = await mutator(snapshot);`

**Função:** Executa o mutator do lifecycle sobre o snapshot serializado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 727

**Fonte:** `                Object.assign(state, next);`

**Função:** Aplica atomicamente o resultado da mutação ao estado observável do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 728

**Fonte:** `                return next;`

**Função:** Retorna `next` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 729

**Fonte:** `            });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return mutationChain;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 730

**Fonte:** `            return mutationChain;`

**Função:** Devolve a cadeia para que o lifecycle aguarde a mutação serializada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 731

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const api = loadLifecycle().createLifecycle({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 732

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const api = loadLifecycle().createLifecycle({`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 733

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 734

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 735

**Fonte:** `            log: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 736

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 737

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 738

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 739

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 740

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 741

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 742

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 743

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 744

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 745

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 746

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 747

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 748

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 749

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 750

**Fonte:** `        await api.processNextJob();`

**Função:** Executa `processNextJob()` real, que pode concluir o batch, promover pendentes ou abrir trabalho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 751

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await api.processNextJob();` do bloco seguinte `const completed = sendMessage.mock.calls`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 752

**Fonte:** `        const completed = sendMessage.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 753

**Fonte:** `            .map(([, message]) => message)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(([, message]) => message)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 754

**Fonte:** `            .filter(message => message?.action === 'BATCH_COMPLETE')`

**Função:** Filtra somente notificações de conclusão para verificar cardinalidade e ordem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 755

**Fonte:** `            .map(message => message.batchId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(message => message.batchId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 756

**Fonte:** `        const expected = ['batch-01', ...pendingIds];`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const expected = ['batch-01', ...pendingIds];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 757

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `const expected = ['batch-01', ...pendingIds];` do bloco seguinte `expect(completed).toEqual(expected);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 758

**Fonte:** `        expect(completed).toEqual(expected);`

**Função:** Assertion direta sobre a implementação real: `expect(completed).toEqual(expected);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 759

**Fonte:** `        expect(new Set(completed).size).toBe(64);`

**Função:** Assertion direta sobre a implementação real: `expect(new Set(completed).size).toBe(64);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 760

**Fonte:** `        expect(state.pendingBatches).toEqual([]);`

**Função:** Assertion direta sobre a implementação real: `expect(state.pendingBatches).toEqual([]);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 761

**Fonte:** `        expect(state.currentBatchId).toBe('batch-64');`

**Função:** Assertion direta sobre a implementação real: `expect(state.currentBatchId).toBe('batch-64');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 762

**Fonte:** `        expect(state.isProcessing).toBe(false);`

**Função:** Assertion direta sobre a implementação real: `expect(state.isProcessing).toBe(false);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 763

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-08: restart com current já concluído e isProcessing stale promove o próximo lote sem repeti`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 764

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-08: restart com current já concluído e isProcessing stale promove o próximo lote sem r`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 765

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-08: restart com current já concluído e isProcessing stale promove o próximo lote sem r`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 766

**Fonte:** `    test('BATCH-STATUS-08: restart com current já concluído e isProcessing stale promove o próximo lote sem repetir A', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-08: restart com current já concluído e isProcessing stale promove o próximo lote sem repetir A` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 767

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 768

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 769

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 770

**Fonte:** `            tabs: { sendMessage },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: { sendMessage },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 771

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 772

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 773

**Fonte:** `                    get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async () => ({ maxConcurrentJobs: 1 })),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 774

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 775

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 776

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 777

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `let mutationChain = Promise.resolve();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 778

**Fonte:** `        let mutationChain = Promise.resolve();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let mutationChain = Promise.resolve();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 779

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 780

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 781

**Fonte:** `            jobQueue: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 782

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 783

**Fonte:** `            activeMangaTabId: null,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: null,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 784

**Fonte:** `            currentBatchId: 'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 785

**Fonte:** `            completionClaimedBatchId: 'batch-a',`

**Função:** Configura/observa o claim idempotente de conclusão por meio de `completionClaimedBatchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 786

**Fonte:** `            completedJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 787

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 788

**Fonte:** `            // Flag residual típico de um snapshot interrompido no MV3.`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `// Flag residual típico de um snapshot interrompido no MV3.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 789

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 790

**Fonte:** `            pendingBatches: [`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 791

**Fonte:** `                {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `{`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 792

**Fonte:** `                    batchId: 'batch-b',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-b',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 793

**Fonte:** `                    mangaTabId: 202,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: 202,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 794

**Fonte:** `                    prompt: 'B',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `prompt: 'B',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 795

**Fonte:** `                    images: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `images: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 796

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 797

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 798

**Fonte:** `            jobIndex: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 799

**Fonte:** `            _cachedMaxCon: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `_cachedMaxCon: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 800

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `state.mutate = mutator => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 801

**Fonte:** `        state.mutate = mutator => {`

**Função:** Instala serializador de mutações para reproduzir a atomicidade esperada em cenários concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 802

**Fonte:** `            mutationChain = mutationChain.then(async () => {`

**Função:** Encadeia mutações de estado em Promise, impedindo que os callbacks de race editem o snapshot simultaneamente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 803

**Fonte:** `                const snapshot = {`

**Função:** Cria snapshot independente do estado para a mutação controlada do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 804

**Fonte:** `                    ...state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 805

**Fonte:** `                    jobQueue: [...state.jobQueue],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [...state.jobQueue],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 806

**Fonte:** `                    jobIndex: [...state.jobIndex],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [...state.jobIndex],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 807

**Fonte:** `                    pendingBatches: state.pendingBatches.map(batch => ({`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: state.pendingBatches.map(batch => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 808

**Fonte:** `                        ...batch,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `...batch,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 809

**Fonte:** `                        images: [...batch.images],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `images: [...batch.images],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 810

**Fonte:** `                    })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 811

**Fonte:** `                };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `delete snapshot.mutate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 812

**Fonte:** `                delete snapshot.mutate;`

**Função:** Remove o helper de mutação do snapshot antes de entregá-lo ao mutator de produção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 813

**Fonte:** `                const next = await mutator(snapshot);`

**Função:** Executa o mutator do lifecycle sobre o snapshot serializado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 814

**Fonte:** `                Object.assign(state, next);`

**Função:** Aplica atomicamente o resultado da mutação ao estado observável do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 815

**Fonte:** `                return next;`

**Função:** Retorna `next` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 816

**Fonte:** `            });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return mutationChain;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 817

**Fonte:** `            return mutationChain;`

**Função:** Devolve a cadeia para que o lifecycle aguarde a mutação serializada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 818

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 819

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const log = jest.fn();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 820

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 821

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 822

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 823

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 824

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 825

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 826

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 827

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 828

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 829

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 830

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 831

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 832

**Fonte:** `            generateId: () => 'id',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 833

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 834

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 835

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 836

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 837

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 838

**Fonte:** `        await api.processNextJob();`

**Função:** Executa `processNextJob()` real, que pode concluir o batch, promover pendentes ou abrir trabalho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 839

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await api.processNextJob();` do bloco seguinte `const completedIds = sendMessage.mock.calls`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 840

**Fonte:** `        const completedIds = sendMessage.mock.calls`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 841

**Fonte:** `            .map(([, message]) => message)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(([, message]) => message)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 842

**Fonte:** `            .filter(message => message?.action === 'BATCH_COMPLETE')`

**Função:** Filtra somente notificações de conclusão para verificar cardinalidade e ordem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 843

**Fonte:** `            .map(message => message.batchId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.map(message => message.batchId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 844

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `.map(message => message.batchId);` do bloco seguinte `expect(completedIds).toEqual(['batch-b']);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 845

**Fonte:** `        expect(completedIds).toEqual(['batch-b']);`

**Função:** Assertion direta sobre a implementação real: `expect(completedIds).toEqual(['batch-b']);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 846

**Fonte:** `        expect(log.mock.calls.filter(([, , action]) => action === 'BATCH_DONE'))`

**Função:** Extrai chamadas capturadas para construir uma sequência comparável de batches/mensagens/logs.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 847

**Fonte:** `            .toHaveLength(1);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `.toHaveLength(1);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 848

**Fonte:** `        expect(state.pendingBatches).toEqual([]);`

**Função:** Assertion direta sobre a implementação real: `expect(state.pendingBatches).toEqual([]);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 849

**Fonte:** `        expect(state.currentBatchId).toBe('batch-b');`

**Função:** Assertion direta sobre a implementação real: `expect(state.currentBatchId).toBe('batch-b');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 850

**Fonte:** `        expect(state.completionClaimedBatchId).toBe('batch-b');`

**Função:** Assertion direta sobre a implementação real: `expect(state.completionClaimedBatchId).toBe('batch-b');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 851

**Fonte:** `        expect(state.isProcessing).toBe(false);`

**Função:** Assertion direta sobre a implementação real: `expect(state.isProcessing).toBe(false);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 852

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-09: erro tardio ao abrir job de A não decrementa slot de B já promovido', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 853

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-09: erro tardio ao abrir job de A não decrementa slot de B já promovido', async () => `; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 854

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-09: erro tardio ao abrir job de A não decrementa slot de B já promovido', async () => `; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 855

**Fonte:** `    test('BATCH-STATUS-09: erro tardio ao abrir job de A não decrementa slot de B já promovido', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-09: erro tardio ao abrir job de A não decrementa slot de B já promovido` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 856

**Fonte:** `        const sendMessage = jest.fn((_tabId, _message, callback) => callback?.());`

**Função:** Cria spy de `chrome.tabs.sendMessage`, permitindo inspecionar `BATCH_COMPLETE`, erros e outros sinais emitidos pelo lifecycle.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 857

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 858

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 859

**Fonte:** `            jobQueue: [`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 860

**Fonte:** `                { mangaTabId: 101, index: 0, prompt: 'A', batchId: 'batch-a' },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `{ mangaTabId: 101, index: 0, prompt: 'A', batchId: 'batch-a' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 861

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 862

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 863

**Fonte:** `            activeMangaTabId: 101,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 101,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 864

**Fonte:** `            currentBatchId: 'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 865

**Fonte:** `            completionClaimedBatchId: null,`

**Função:** Configura/observa o claim idempotente de conclusão por meio de `completionClaimedBatchId: null,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 866

**Fonte:** `            completedJobs: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 867

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 868

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 869

**Fonte:** `            pendingBatches: [],`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 870

**Fonte:** `            jobIndex: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 871

**Fonte:** `            _cachedMaxCon: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `_cachedMaxCon: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 872

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `global.chrome = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 873

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `global.chrome = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 874

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 875

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 876

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 877

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 878

**Fonte:** `                    get: jest.fn(async () => ({`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async () => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 879

**Fonte:** `                        geminiBaseUrl: 'https://gemini.google.com/app',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiBaseUrl: 'https://gemini.google.com/app',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 880

**Fonte:** `                        geminiExecutionMode: 'temp_chat',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiExecutionMode: 'temp_chat',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 881

**Fonte:** `                    })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `set: jest.fn(async () => {}),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 882

**Fonte:** `                    set: jest.fn(async () => {}),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `set: jest.fn(async () => {}),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 883

**Fonte:** `                    remove: jest.fn(async () => {}),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(async () => {}),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 884

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 885

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 886

**Fonte:** `            tabs: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 887

**Fonte:** `                create: jest.fn(async () => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `create: jest.fn(async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 888

**Fonte:** `                    // Simula STOP/promoção ocorrendo enquanto tabs.create de A`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `// Simula STOP/promoção ocorrendo enquanto tabs.create de A`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 889

**Fonte:** `                    // ainda está pendente. B já possui um slot ativo.`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `// ainda está pendente. B já possui um slot ativo.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 890

**Fonte:** `                    state.currentBatchId = 'batch-b';`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.currentBatchId = 'batch-b';`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 891

**Fonte:** `                    state.activeMangaTabId = 202;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.activeMangaTabId = 202;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 892

**Fonte:** `                    state.activeJobsCount = 1;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.activeJobsCount = 1;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 893

**Fonte:** `                    state.isProcessing = true;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.isProcessing = true;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 894

**Fonte:** `                    throw new Error('tabs.create falhou tarde para A');`

**Função:** Simula falha tardia controlada de API para validar que erro de batch antigo não contamina o atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 895

**Fonte:** `                }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `sendMessage,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 896

**Fonte:** `                sendMessage,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendMessage,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 897

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `windows: {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 898

**Fonte:** `            windows: {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `windows: {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 899

**Fonte:** `            alarms: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `alarms: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 900

**Fonte:** `                create: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `create: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 901

**Fonte:** `                clear: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clear: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 902

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 903

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 904

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const log = jest.fn();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 905

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 906

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 907

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 908

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 909

**Fonte:** `            syncState: jest.fn().mockResolvedValue(),`

**Função:** Fornece o stub de persistência `syncState: jest.fn().mockResolvedValue(),`; o foco deste arquivo é contabilização/transição, não storage completo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 910

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 911

**Fonte:** `            armWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 912

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 913

**Fonte:** `            indexAddJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 914

**Fonte:** `            indexRemoveJob: jest.fn(),`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 915

**Fonte:** `            indexJobsOfBatch: jest.fn(() => []),`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch: jest.fn(() => []),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 916

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 917

**Fonte:** `            generateId: () => 'job-a-opening',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 918

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 919

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 920

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 921

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 922

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `await api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 923

**Fonte:** `        await api.processNextJob();`

**Função:** Executa `processNextJob()` real, que pode concluir o batch, promover pendentes ou abrir trabalho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 924

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await api.processNextJob();` do bloco seguinte `expect(state.currentBatchId).toBe('batch-b');`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 925

**Fonte:** `        expect(state.currentBatchId).toBe('batch-b');`

**Função:** Assertion direta sobre a implementação real: `expect(state.currentBatchId).toBe('batch-b');`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 926

**Fonte:** `        expect(state.activeJobsCount).toBe(1);`

**Função:** Assertion direta sobre a implementação real: `expect(state.activeJobsCount).toBe(1);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 927

**Fonte:** `        expect(sendMessage).not.toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(sendMessage).not.toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 928

**Fonte:** `            101,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `101,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 929

**Fonte:** `            expect.objectContaining({ action: 'SHOW_ERROR_INTEGRATED' }),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({ action: 'SHOW_ERROR_INTEGRATED' }),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 930

**Fonte:** `            expect.any(Function)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.any(Function)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 931

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 932

**Fonte:** `        expect(log).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 933

**Fonte:** `            'warn',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'warn',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 934

**Fonte:** `            'bg',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'bg',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 935

**Fonte:** `            'JOB_ERROR_FOREIGN_BATCH_IGNORED',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'JOB_ERROR_FOREIGN_BATCH_IGNORED',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 936

**Fonte:** `            expect.stringContaining('lote anterior'),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.stringContaining('lote anterior'),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 937

**Fonte:** `            expect.objectContaining({`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 938

**Fonte:** `                batchId: 'batch-a',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-a',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 939

**Fonte:** `                currentBatchId: 'batch-b',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-b',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 940

**Fonte:** `            })`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 941

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 942

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('BATCH-STATUS-10: minimized_window persiste o job antes de aguardar confirmação física da janela', async `.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 943

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-10: minimized_window persiste o job antes de aguardar confirmação física da janela', a`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 944

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('BATCH-STATUS-10: minimized_window persiste o job antes de aguardar confirmação física da janela', a`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 945

**Fonte:** `    test('BATCH-STATUS-10: minimized_window persiste o job antes de aguardar confirmação física da janela', async () => {`

**Função:** Registra o cenário `BATCH-STATUS-10: minimized_window persiste o job antes de aguardar confirmação física da janela` contra `jobs-lifecycle.js` real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 946

**Fonte:** `        const store = {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const store = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 947

**Fonte:** `            geminiBaseUrl: 'https://gemini.google.com/app',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiBaseUrl: 'https://gemini.google.com/app',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 948

**Fonte:** `            geminiExecutionMode: 'minimized_window',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiExecutionMode: 'minimized_window',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 949

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `let releaseWindowUpdate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 950

**Fonte:** `        let releaseWindowUpdate;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let releaseWindowUpdate;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 951

**Fonte:** `        let updateStarted = false;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `let updateStarted = false;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 952

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `let updateStarted = false;` do bloco seguinte `const state = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 953

**Fonte:** `        const state = {`

**Função:** Inicia o estado mutável fornecido a `createLifecycle`; seus contadores/batch ids modelam o ponto exato do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 954

**Fonte:** `            stopRequested: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `stopRequested: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 955

**Fonte:** `            jobQueue: [`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobQueue: [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 956

**Fonte:** `                { mangaTabId: 77, index: 0, prompt: 'Traduzir', batchId: 'batch-min' },`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `{ mangaTabId: 77, index: 0, prompt: 'Traduzir', batchId: 'batch-min' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 957

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 958

**Fonte:** `            activeJobsCount: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeJobsCount: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 959

**Fonte:** `            activeMangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `activeMangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 960

**Fonte:** `            currentBatchId: 'batch-min',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `currentBatchId: 'batch-min',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 961

**Fonte:** `            completionClaimedBatchId: null,`

**Função:** Configura/observa o claim idempotente de conclusão por meio de `completionClaimedBatchId: null,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 962

**Fonte:** `            completedJobs: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `completedJobs: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 963

**Fonte:** `            totalJobs: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `totalJobs: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 964

**Fonte:** `            isProcessing: true,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `isProcessing: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 965

**Fonte:** `            pendingBatches: [],`

**Função:** Configura/observa a fila persistente de batches pendentes: `pendingBatches: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 966

**Fonte:** `            jobIndex: [],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobIndex: [],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 967

**Fonte:** `            _cachedMaxCon: 1,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `_cachedMaxCon: 1,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 968

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `global.chrome = {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 969

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `global.chrome = {`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 970

**Fonte:** `        global.chrome = {`

**Função:** Inicia o mock Chrome mínimo requerido por este cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 971

**Fonte:** `            runtime: { lastError: null },`

**Função:** Inicializa `chrome.runtime.lastError` limpo para não simular falha de API.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 972

**Fonte:** `            storage: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `storage: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 973

**Fonte:** `                local: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `local: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 974

**Fonte:** `                    get: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 975

**Fonte:** `                        const list = Array.isArray(keys) ? keys : [keys];`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const list = Array.isArray(keys) ? keys : [keys];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 976

**Fonte:** `                        const result = {};`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const result = {};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 977

**Fonte:** `                        for (const key of list) {`

**Função:** Itera por `for (const key of list) {` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 978

**Fonte:** `                            if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];`

**Função:** Avalia `if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];` dentro do mock ou helper, modelando o branch exigido pelo cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 979

**Fonte:** `                        }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `return result;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 980

**Fonte:** `                        return result;`

**Função:** Retorna `result` do callback/helper do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 981

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 982

**Fonte:** `                    set: jest.fn(async values => Object.assign(store, values)),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `set: jest.fn(async values => Object.assign(store, values)),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 983

**Fonte:** `                    remove: jest.fn(async keys => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(async keys => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 984

**Fonte:** `                        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];`

**Função:** Itera por `for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];` para montar/limpar dados do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 985

**Fonte:** `                    }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 986

**Fonte:** `                },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 987

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `windows: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 988

**Fonte:** `            windows: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `windows: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 989

**Fonte:** `                create: jest.fn(async () => ({`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `create: jest.fn(async () => ({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 990

**Fonte:** `                    id: 55,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `id: 55,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 991

**Fonte:** `                    state: 'minimized',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state: 'minimized',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 992

**Fonte:** `                    focused: false,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `focused: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 993

**Fonte:** `                    tabs: [{ id: 321, windowId: 55 }],`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: [{ id: 321, windowId: 55 }],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 994

**Fonte:** `                })),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `update: jest.fn(() => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 995

**Fonte:** `                update: jest.fn(() => {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `update: jest.fn(() => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 996

**Fonte:** `                    updateStarted = true;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `updateStarted = true;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 997

**Fonte:** `                    return new Promise(resolve => { releaseWindowUpdate = resolve; });`

**Função:** Captura o resolver da atualização da janela para liberar o fluxo somente após as assertions de staging.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 998

**Fonte:** `                }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `get: jest.fn(async () => ({ id: 55, state: 'minimized', focused: false })),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 999

**Fonte:** `                get: jest.fn(async () => ({ id: 55, state: 'minimized', focused: false })),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `get: jest.fn(async () => ({ id: 55, state: 'minimized', focused: false })),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1000

**Fonte:** `                remove: jest.fn(async () => {}),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn(async () => {}),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1001

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1002

**Fonte:** `            tabs: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `tabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1003

**Fonte:** `                query: jest.fn(async () => [{ id: 321, windowId: 55 }]),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `query: jest.fn(async () => [{ id: 321, windowId: 55 }]),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1004

**Fonte:** `                remove: jest.fn((_tabId, callback) => callback?.()),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `remove: jest.fn((_tabId, callback) => callback?.()),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1005

**Fonte:** `                sendMessage: jest.fn((_tabId, _message, callback) => callback?.()),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendMessage: jest.fn((_tabId, _message, callback) => callback?.()),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1006

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `alarms: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1007

**Fonte:** `            alarms: {`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `alarms: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1008

**Fonte:** `                create: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `create: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1009

**Fonte:** `                clear: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clear: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1010

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1011

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1012

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `const log = jest.fn();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1013

**Fonte:** `        const log = jest.fn();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const log = jest.fn();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1014

**Fonte:** `        const syncState = jest.fn().mockResolvedValue();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const syncState = jest.fn().mockResolvedValue();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1015

**Fonte:** `        const indexAddJob = jest.fn(entry => {`

**Função:** Fornece/observa o colaborador de índice de jobs: `const indexAddJob = jest.fn(entry => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1016

**Fonte:** `            state.jobIndex = state.jobIndex.filter(job => job.geminiTabId !== entry.geminiTabId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.jobIndex = state.jobIndex.filter(job => job.geminiTabId !== entry.geminiTabId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1017

**Fonte:** `            state.jobIndex.push(entry);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.jobIndex.push(entry);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1018

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const indexRemoveJob = jest.fn(tabId => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1019

**Fonte:** `        const indexRemoveJob = jest.fn(tabId => {`

**Função:** Fornece/observa o colaborador de índice de jobs: `const indexRemoveJob = jest.fn(tabId => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1020

**Fonte:** `            state.jobIndex = state.jobIndex.filter(job => job.geminiTabId !== tabId);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.jobIndex = state.jobIndex.filter(job => job.geminiTabId !== tabId);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1021

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const indexJobsOfBatch = jest.fn(batchId =>`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1022

**Fonte:** `        const indexJobsOfBatch = jest.fn(batchId =>`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `const indexJobsOfBatch = jest.fn(batchId =>`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1023

**Fonte:** `            state.jobIndex.filter(job => !batchId || job.batchId === batchId)`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state.jobIndex.filter(job => !batchId || job.batchId === batchId)`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1024

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const api = loadLifecycle().createLifecycle({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1025

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `);` do bloco seguinte `const api = loadLifecycle().createLifecycle({`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1026

**Fonte:** `        const api = loadLifecycle().createLifecycle({`

**Função:** Cria a API real do lifecycle com estado e colaboradores controlados pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1027

**Fonte:** `            state,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1028

**Fonte:** `            log,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `log,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1029

**Fonte:** `            syncState,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `syncState,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1030

**Fonte:** `            sendProgress: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `sendProgress: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1031

**Fonte:** `            armWatchdog: jest.fn().mockResolvedValue(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `armWatchdog: jest.fn().mockResolvedValue(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1032

**Fonte:** `            clearWatchdog: jest.fn(),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `clearWatchdog: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1033

**Fonte:** `            indexAddJob,`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexAddJob,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1034

**Fonte:** `            indexRemoveJob,`

**Função:** Fornece/observa o colaborador de índice de jobs: `indexRemoveJob,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1035

**Fonte:** `            indexJobsOfBatch,`

**Função:** Define como a implementação real consulta jobs do batch no cenário: `indexJobsOfBatch,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1036

**Fonte:** `            delay: async () => {},`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `delay: async () => {},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1037

**Fonte:** `            generateId: () => 'job-minimized-bootstrap',`

**Função:** Fornece geração determinística de id para tornar a expectativa estável.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1038

**Fonte:** `            markFinalized: jest.fn(),`

**Função:** Injeta controle de marcador de finalização: `markFinalized: jest.fn(),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1039

**Fonte:** `            isFinalized: jest.fn(() => false),`

**Função:** Injeta controle de marcador de finalização: `isFinalized: jest.fn(() => false),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1040

**Fonte:** `            finalizedMarkerTtlMinutes: 5,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `finalizedMarkerTtlMinutes: 5,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1041

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `const running = api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1042

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `const running = api.processNextJob();`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1043

**Fonte:** `        const running = api.processNextJob();`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `const running = api.processNextJob();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1044

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `const running = api.processNextJob();` do bloco seguinte `// Aguarda apenas microtasks: windows.update continua bloqueado.`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1045

**Fonte:** `        // Aguarda apenas microtasks: windows.update continua bloqueado.`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `// Aguarda apenas microtasks: windows.update continua bloqueado.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1046

**Fonte:** `        for (let attempt = 0; attempt < 20 && !updateStarted; attempt += 1) {`

**Função:** Executa polling limitado a microtasks até a atualização de janela iniciar, sem avançar para a confirmação ainda bloqueada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1047

**Fonte:** `            // eslint-disable-next-line no-await-in-loop`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `// eslint-disable-next-line no-await-in-loop`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1048

**Fonte:** `            await Promise.resolve();`

**Função:** Cede uma microtask para permitir avanço assíncrono do lifecycle durante o teste de staging.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1049

**Fonte:** `        }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect(updateStarted).toBe(true);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1050

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}` do bloco seguinte `expect(updateStarted).toBe(true);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1051

**Fonte:** `        expect(updateStarted).toBe(true);`

**Função:** Assertion direta sobre a implementação real: `expect(updateStarted).toBe(true);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 1052

**Fonte:** `        expect(store.gemini_job_321).toEqual(expect.objectContaining({`

**Função:** Assertion direta sobre a implementação real: `expect(store.gemini_job_321).toEqual(expect.objectContaining({`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 1053

**Fonte:** `            jobId: 'job-minimized-bootstrap',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobId: 'job-minimized-bootstrap',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1054

**Fonte:** `            batchId: 'batch-min',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-min',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1055

**Fonte:** `            mangaTabId: 77,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `mangaTabId: 77,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1056

**Fonte:** `            index: 0,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `index: 0,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1057

**Fonte:** `            geminiTabId: 321,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiTabId: 321,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1058

**Fonte:** `            executionMode: 'minimized_window',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `executionMode: 'minimized_window',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1059

**Fonte:** `            state: 'opening',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `state: 'opening',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1060

**Fonte:** `        }));`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `expect(state.jobIndex).toEqual([`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1061

**Fonte:** `        expect(state.jobIndex).toEqual([`

**Função:** Assertion direta sobre a implementação real: `expect(state.jobIndex).toEqual([`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 1062

**Fonte:** `            expect.objectContaining({`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1063

**Fonte:** `                geminiTabId: 321,`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `geminiTabId: 321,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1064

**Fonte:** `                jobId: 'job-minimized-bootstrap',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `jobId: 'job-minimized-bootstrap',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1065

**Fonte:** `                batchId: 'batch-min',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `batchId: 'batch-min',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1066

**Fonte:** `            }),`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `]);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1067

**Fonte:** `        ]);`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `]);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1068

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `]);` do bloco seguinte `releaseWindowUpdate({ id: 55, state: 'minimized', focused: false });`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1069

**Fonte:** `        releaseWindowUpdate({ id: 55, state: 'minimized', focused: false });`

**Função:** Libera manualmente a Promise de `windows.update` após confirmar que o job já foi materializado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1070

**Fonte:** `        await running;`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `await running;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1071

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `await running;` do bloco seguinte `expect(global.chrome.windows.get).toHaveBeenCalledWith(55);`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1072

**Fonte:** `        expect(global.chrome.windows.get).toHaveBeenCalledWith(55);`

**Função:** Assertion direta sobre a implementação real: `expect(global.chrome.windows.get).toHaveBeenCalledWith(55);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 1073

**Fonte:** `        expect(log).toHaveBeenCalledWith(`

**Função:** Assertion direta sobre a implementação real: `expect(log).toHaveBeenCalledWith(`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion sobre `jobs-lifecycle.js` real carregado por `loadLifecycle`.

### Linha 1074

**Fonte:** `            'info',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'info',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1075

**Fonte:** `            'bg',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'bg',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1076

**Fonte:** `            'GEMINI_WINDOW_STATE',`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `'GEMINI_WINDOW_STATE',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1077

**Fonte:** `            expect.any(String),`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.any(String),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1078

**Fonte:** `            expect.objectContaining({ state: 'minimized', focused: false })`

**Função:** Compõe o estado, mock ou expectativa do cenário por meio de `expect.objectContaining({ state: 'minimized', focused: false })`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1079

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1080

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1081

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `});`; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1082

**Fonte:** `});`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

### Linha 1083

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte ``; não muda o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/ação do cenário real; a propriedade resultante é verificada nas assertions próximas.

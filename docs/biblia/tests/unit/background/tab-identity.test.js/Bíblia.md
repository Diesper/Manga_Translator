# Bíblia técnica — tests/unit/background/tab-identity.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 1f2dd52513037f061613d04453a961fbaeddef84  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest da identidade canônica de tabs Gemini e integração com state/reconciler/lifecycle  
> **Linhas textuais:** 334  
> **Posições documentais:** 335, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

tab-identity.test.js valida o subsistema que transforma tabId físico do Chromium em identidade canônica recuperável. A substituição de tabs pode ocorrer antes, durante ou depois da persistência do job; por isso o módulo mantém aliases duráveis, journals de rekey e migra job/watchdog/delete-recovery/finalization marker, referências em state e alarms.

A suíte usa state.js, tab-identity.js, jobs-reconciliation.js e jobs-lifecycle.js reais. Assim, os cenários TAB-12 e TAB-02 lifecycle provam integração, não apenas helpers isolados.

## 2. TAB-01 — migração completa após persistência

O cenário cria job 100, watchdog, delete recovery, finalization marker, jobIndex/extractionTabs e alarms. recordReplacement(200,100) deve mover os registros, apagar chaves antigas, criar alias 100→200, atualizar state, preservar completedJobs e migrar watchdog_100/finalization_marker_100 para 200.

Também exige canonicalTabId=200, replacementCount=1 e createdAt preservado. É a prova mais abrangente do caminho nominal.

## 3. TAB-02/TAB-03/TAB-04 — alias antes de persistência, cadeia e ciclo

TAB-02 mostra que replacement sem job ainda cria alias durável e não inventa registros gemini_job. TAB-03 encadeia 100→200→300 e exige resolução de 100 e 200 para 300. TAB-04 injeta ciclo 100↔200 e exige retorno ao original mais log TAB_ALIAS_CYCLE.

## 4. TAB-05 — recovery de journal

Um journal em records_copied é indexado como pendente. recoverPendingMigrations retorna 1 na primeira execução e 0 na segunda, move o job, marca phase=completed, limpa o índice pendente e atualiza jobIndex. Isso prova idempotência do replay.

## 5. TAB-07/TAB-08 e TAB-09

A migração de extractionTabs e gemini_finalized_* preserva completedJobs=7 e accountingApplied=true. Em separado, alias expirado deixa de autorizar takeover, resolve para 100, é removido por cleanupExpiredAliases e sai do storage.

## 6. TAB-12 — reconciler canonical-aware

O jobIndex aponta para 100, mas somente tab 200 existe e há alias 100→200. O reconciler real recebe resolveCanonicalTabId/migrateTabIdentity reais e deve classificar o job como alive=1/dropped=0, migrando state/storage para 200 antes de decidir órfão.

## 7. TAB-02 lifecycle — alias preexistente antes da persistência

A próxima tab física nasce como 100, porém alias 100→200 já existe. jobs-lifecycle real processa a fila e deve persistir somente gemini_job_200, com canonicalTabId=200 e jobIndex canônico. Isso fecha a janela de corrida em que onReplaced ocorre antes do write inicial do job.

## 8. Branches sem prova focal

A implementação também possui salvaguardas não exercitadas aqui: TAB_REKEY_CONFLICT quando destino pertence a job diferente; TAB_ALIAS_MAX_HOPS ao exceder oito aliases; e limpeza de entradas de migration index cujo journal já está completed ou possui tabIds inválidos. Não foi localizada outra suíte focal para esses branches.

## 9. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob 1f2dd52513037f061613d04453a961fbaeddef84. Os nove casos deste arquivo aparecem individualmente com ✓ em Node 20.x (job 109255348388) e Node 22.x (109255348406). Ambos fecham 109/109 suítes e 851/851 testes; CI Gate 109256050280: sucesso.

## 10. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| job/watchdog/recovery/finalized/state/alarms migram 100→200 | TAB-01 | ✅ PROVADO DIRETAMENTE |
| alias antes do job não inventa registro | TAB-02 | ✅ PROVADO DIRETAMENTE |
| cadeia 100→200→300 resolve para 300 | TAB-03 | ✅ PROVADO DIRETAMENTE |
| ciclo retorna original e loga TAB_ALIAS_CYCLE | TAB-04 | ✅ PROVADO DIRETAMENTE |
| journal intermediário é recuperado idempotentemente | TAB-05 | ✅ PROVADO DIRETAMENTE |
| extraction/finalized migram sem mudar contabilidade | TAB-07/TAB-08 | ✅ PROVADO DIRETAMENTE |
| alias expirado não autoriza takeover e é limpo | TAB-09 | ✅ PROVADO DIRETAMENTE |
| reconciler canonicaliza antes de classificar órfão | TAB-12 | ✅ PROVADO DIRETAMENTE |
| lifecycle persiste direto na chave canônica após alias prévio | TAB-02 lifecycle | ✅ PROVADO DIRETAMENTE |
| destino com jobId diferente aborta rekey | branch TAB_REKEY_CONFLICT | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| cadeia maior que MAX_ALIAS_HOPS retorna original/loga | branch TAB_ALIAS_MAX_HOPS | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| migration index limpa journal completed/malformado | branches de recoverPendingMigrations | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 11. Solicitações ao auditor

### 170-001 — TEST_REQUIRED — OPEN — HIGH

Encontrado: performMigration detecta quando oldJob e newJob existem com jobId diferentes, loga TAB_REKEY_CONFLICT e lança erro. Nenhum caso focal foi localizado.

Evidência ausente: preparar gemini_job_100=job-A e gemini_job_200=job-B, iniciar migração e exigir rejeição TAB_REKEY_CONFLICT, log correto e preservação dos dois registros/estado sem apagar o job antigo.

Risco: colisão de identidade pode sobrescrever job alheio ou apagar ownership durante onReplaced.

### 170-002 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: resolveCanonicalTabId limita aliases a MAX_ALIAS_HOPS=8 e, se excedido, loga TAB_ALIAS_MAX_HOPS e retorna a identidade original. TAB-03 cobre apenas dois hops.

Evidência ausente: cadeia válida com mais de oito aliases, todos não expirados, exigindo retorno ao original e log com lastTabId.

Risco: regressões em proteção contra chain patológica podem causar resolução parcial/arbitrária.

### 170-003 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: recoverPendingMigrations remove do migration index entradas sem journal, já completed ou com old/new tabId inválido. TAB-05 cobre apenas journal intermediário válido.

Evidência ausente: índice contendo chave ausente, journal completed e journal inválido; exigir remoção do índice sem chamar migração destrutiva e recovered=0.

Risco: lixo persistente pode provocar retries infinitos ou recovery inválido após restart.

## 12. Fonte integral auditada

```javascript
'use strict';

const path = require('path');
const {
  getStorageMock,
  getTabsMock,
  getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');

const STATE_PATH = path.resolve(__dirname, '../../../extension/background/state.js');
const TAB_IDENTITY_PATH = path.resolve(__dirname, '../../../extension/background/tab-identity.js');
const RECONCILIATION_PATH = path.resolve(__dirname, '../../../extension/background/jobs-reconciliation.js');
const LIFECYCLE_PATH = path.resolve(__dirname, '../../../extension/background/jobs-lifecycle.js');

function loadState() {
  delete global.MangaTranslatorState;
  jest.isolateModules(() => require(STATE_PATH));
  return global.MangaTranslatorState;
}

function loadIdentityFactory() {
  let api;
  jest.isolateModules(() => {
    api = require(TAB_IDENTITY_PATH);
  });
  return api.createTabIdentity;
}

function loadReconcilerFactory() {
  delete global.MangaTranslatorJobsReconciliation;
  jest.isolateModules(() => require(RECONCILIATION_PATH));
  return global.MangaTranslatorJobsReconciliation.createReconciler;
}

describe('background/tab-identity.js', () => {
  let storage;
  let tabs;
  let alarms;
  let state;
  let log;
  let createTabIdentity;

  beforeEach(async () => {
    storage = getStorageMock();
    tabs = getTabsMock();
    alarms = getAlarmsMock();
    await storage.clear();
    tabs._tabs.clear();
    await alarms.clearAll();

    state = loadState();
    state.patch({
      jobQueue: [],
      jobIndex: [],
      extractionTabs: {},
      activeJobsCount: 0,
      completedJobs: 0,
    });
    log = jest.fn();
    createTabIdentity = loadIdentityFactory();
  });

  test('TAB-01: replacement após persistência migra job, watchdog, índice e referências', async () => {
    state.patch({
      jobIndex: [{ geminiTabId: 100, jobId: 'job-1', batchId: 'batch-1', mangaTabId: 77, index: 5 }],
      extractionTabs: {
        901: { geminiTabId: 100, jobId: 'job-1', batchId: 'batch-1' },
      },
      activeJobsCount: 1,
      completedJobs: 2,
    });
    await storage.set({
      gemini_job_100: {
        geminiTabId: 100,
        jobId: 'job-1',
        batchId: 'batch-1',
        mangaTabId: 77,
        index: 5,
        prompt: 'sensitive prompt',
        createdAt: 1234,
      },
      wd_data_100: { geminiTabId: 100, jobId: 'job-1', mangaTabId: 77, index: 5 },
      gemini_delete_recovery_100: { geminiTabId: 100, jobId: 'job-1' },
      gemini_finalized_100: { jobId: 'job-1', accountingApplied: true, expiresAt: Date.now() + 60_000 },
    });
    chrome.alarms.create('watchdog_100', { delayInMinutes: 4 });
    chrome.alarms.create('finalization_marker_100', { delayInMinutes: 10 });

    const identity = createTabIdentity({ state, log });
    await identity.recordReplacement(200, 100);

    const data = await storage.get([
      'gemini_job_100', 'gemini_job_200',
      'wd_data_100', 'wd_data_200',
      'gemini_delete_recovery_100', 'gemini_delete_recovery_200',
      'gemini_finalized_100', 'gemini_finalized_200',
      'gemini_tab_alias_100',
    ]);

    expect(data.gemini_job_100).toBeUndefined();
    expect(data.gemini_job_200).toEqual(expect.objectContaining({
      geminiTabId: 200,
      canonicalTabId: 200,
      jobId: 'job-1',
      createdAt: 1234,
      replacementCount: 1,
    }));
    expect(data.wd_data_100).toBeUndefined();
    expect(data.wd_data_200).toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-1' }));
    expect(data.gemini_delete_recovery_100).toBeUndefined();
    expect(data.gemini_delete_recovery_200).toEqual(expect.objectContaining({ geminiTabId: 200 }));
    expect(data.gemini_finalized_100).toBeUndefined();
    expect(data.gemini_finalized_200).toEqual(expect.objectContaining({ jobId: 'job-1' }));
    expect(data.gemini_tab_alias_100).toEqual(expect.objectContaining({ oldTabId: 100, newTabId: 200 }));

    expect(state.jobIndex).toEqual([
      expect.objectContaining({ geminiTabId: 200, jobId: 'job-1' }),
    ]);
    expect(state.extractionTabs[901]).toEqual(expect.objectContaining({ geminiTabId: 200 }));
    expect(state.completedJobs).toBe(2);

    expect(await alarms.get('watchdog_100')).toBeNull();
    expect(await alarms.get('watchdog_200')).toEqual(expect.objectContaining({ name: 'watchdog_200' }));
    expect(await alarms.get('finalization_marker_100')).toBeNull();
    expect(await alarms.get('finalization_marker_200')).toEqual(expect.objectContaining({ name: 'finalization_marker_200' }));
  });

  test('TAB-02: replacement antes do job persistido deixa alias durável para o lifecycle', async () => {
    const identity = createTabIdentity({ state, log });

    await identity.recordReplacement(200, 100);

    expect(await identity.resolveCanonicalTabId(100)).toBe(200);
    const data = await storage.get(['gemini_tab_alias_100', 'gemini_job_100', 'gemini_job_200']);
    expect(data.gemini_tab_alias_100).toEqual(expect.objectContaining({ newTabId: 200 }));
    expect(data.gemini_job_100).toBeUndefined();
    expect(data.gemini_job_200).toBeUndefined();
  });

  test('TAB-03: duas substituições formam cadeia e resolvem para a aba mais nova', async () => {
    const identity = createTabIdentity({ state, log });

    await identity.recordReplacement(200, 100);
    await identity.recordReplacement(300, 200);

    expect(await identity.resolveCanonicalTabId(100)).toBe(300);
    expect(await identity.resolveCanonicalTabId(200)).toBe(300);
  });

  test('TAB-04: ciclo inválido é detectado sem escolher uma identidade arbitrária', async () => {
    const future = Date.now() + 60_000;
    await storage.set({
      gemini_tab_alias_100: { oldTabId: 100, newTabId: 200, createdAt: Date.now(), expiresAt: future },
      gemini_tab_alias_200: { oldTabId: 200, newTabId: 100, createdAt: Date.now(), expiresAt: future },
    });
    const identity = createTabIdentity({ state, log });

    expect(await identity.resolveCanonicalTabId(100)).toBe(100);
    expect(log).toHaveBeenCalledWith(
      'error', 'bg', 'TAB_ALIAS_CYCLE', expect.any(String),
      expect.objectContaining({ oldTabId: 100 })
    );
  });

  test('TAB-05: recovery retoma journal intermediário de forma idempotente', async () => {
    state.patch({
      jobIndex: [{ geminiTabId: 100, jobId: 'job-restart', batchId: 'b', mangaTabId: 9, index: 1 }],
      activeJobsCount: 1,
    });
    await storage.set({
      gemini_job_100: { geminiTabId: 100, jobId: 'job-restart', batchId: 'b', mangaTabId: 9, index: 1 },
      gemini_tab_alias_100: {
        oldTabId: 100,
        newTabId: 200,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
      gemini_tab_migration_job_restart: {
        oldTabId: 100,
        newTabId: 200,
        jobId: 'job-restart',
        phase: 'records_copied',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      gemini_tab_migration_index: ['gemini_tab_migration_job_restart'],
    });

    const identity = createTabIdentity({ state, log });
    expect(await identity.recoverPendingMigrations()).toBe(1);
    expect(await identity.recoverPendingMigrations()).toBe(0);

    const data = await storage.get([
      'gemini_job_100',
      'gemini_job_200',
      'gemini_tab_migration_job_restart',
      'gemini_tab_migration_index',
    ]);
    expect(data.gemini_job_100).toBeUndefined();
    expect(data.gemini_job_200).toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-restart' }));
    expect(data.gemini_tab_migration_job_restart.phase).toBe('completed');
    expect(data.gemini_tab_migration_index).toEqual([]);
    expect(state.jobIndex).toEqual([expect.objectContaining({ geminiTabId: 200 })]);
  });

  test('TAB-07/TAB-08: extraction e marcador finalizado migram sem alterar contabilidade', async () => {
    state.patch({
      jobIndex: [{ geminiTabId: 100, jobId: 'job-f', batchId: 'b', mangaTabId: 9, index: 1 }],
      extractionTabs: { 500: { geminiTabId: 100, jobId: 'job-f' } },
      completedJobs: 7,
      activeJobsCount: 1,
    });
    await storage.set({
      gemini_job_100: { geminiTabId: 100, jobId: 'job-f' },
      gemini_finalized_100: { jobId: 'job-f', accountingApplied: true, expiresAt: Date.now() + 60_000 },
    });

    const identity = createTabIdentity({ state, log });
    await identity.recordReplacement(200, 100);

    expect(state.extractionTabs[500].geminiTabId).toBe(200);
    expect(state.completedJobs).toBe(7);
    expect((await storage.get('gemini_finalized_200')).gemini_finalized_200)
      .toEqual(expect.objectContaining({ accountingApplied: true }));
  });

  test('TAB-09: alias expirado não autoriza takeover da aba antiga', async () => {
    await storage.set({
      gemini_tab_alias_100: {
        oldTabId: 100,
        newTabId: 200,
        createdAt: Date.now() - 120_000,
        expiresAt: Date.now() - 1,
      },
      gemini_tab_alias_index: [100],
    });
    const identity = createTabIdentity({ state, log });

    expect(await identity.resolveCanonicalTabId(100)).toBe(100);
    expect(await identity.cleanupExpiredAliases()).toEqual({ kept: 0, removed: 1 });
    expect((await storage.get('gemini_tab_alias_100')).gemini_tab_alias_100).toBeUndefined();
  });

  test('TAB-12: reconciler canonicaliza antes de classificar o job como órfão', async () => {
    state.patch({
      jobIndex: [{ geminiTabId: 100, jobId: 'job-r', batchId: 'b', mangaTabId: 9, index: 4 }],
      activeJobsCount: 1,
    });
    await storage.set({
      gemini_job_100: { geminiTabId: 100, jobId: 'job-r', batchId: 'b', mangaTabId: 9, index: 4 },
      gemini_tab_alias_100: {
        oldTabId: 100,
        newTabId: 200,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    });
    tabs._tabs.set(200, { id: 200, url: 'https://gemini.google.com/app', active: false, status: 'complete' });

    const identity = createTabIdentity({ state, log });
    const createReconciler = loadReconcilerFactory();
    const reconciler = createReconciler({
      state,
      tabExists: async tabId => tabs._tabs.has(tabId),
      log,
      syncState: () => state.syncState(),
      processNextJob: jest.fn(),
      recoverPendingFinalization: async () => false,
      resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId),
      migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options),
    });

    await expect(reconciler.reconcile()).resolves.toEqual({
      alive: 1,
      dropped: 0,
      recovered: 0,
      foreign: 0,
    });
    expect(state.jobIndex).toEqual([expect.objectContaining({ geminiTabId: 200, jobId: 'job-r' })]);
    expect((await storage.get('gemini_job_200')).gemini_job_200)
      .toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-r' }));
  });
  test('TAB-02 lifecycle: alias existente antes da persistência grava somente na chave canônica', async () => {
    tabs._nextTabId = 100;
    const identity = createTabIdentity({ state, log });
    await identity.recordReplacement(200, 100);

    state.patch({
      jobQueue: [{ mangaTabId: 9, index: 2, prompt: 'translate', batchId: 'batch-x' }],
      jobIndex: [],
      stopRequested: false,
      activeJobsCount: 0,
      totalJobs: 1,
      completedJobs: 0,
    });
    state._cachedMaxCon = 1;

    delete global.MangaTranslatorJobsLifecycle;
    jest.isolateModules(() => require(LIFECYCLE_PATH));
    const lifecycle = global.MangaTranslatorJobsLifecycle.createLifecycle({
      state,
      log,
      syncState: () => state.syncState(),
      sendProgress: jest.fn(),
      armWatchdog: jest.fn(async (_mangaTabId, _index, geminiTabId) => geminiTabId),
      clearWatchdog: jest.fn(),
      indexAddJob: entry => state.indexAddJob(entry),
      indexRemoveJob: tabId => state.indexRemoveJob(tabId),
      indexJobsOfBatch: batchId => state.indexJobsOfBatch(batchId),
      delay: async () => {},
      generateId: () => 'job-before-persist',
      markFinalized: jest.fn(),
      isFinalized: () => false,
      finalizedMarkerTtlMinutes: 10,
      resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId),
      migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options),
    });

    await lifecycle.processNextJob();

    const data = await storage.get(['gemini_job_100', 'gemini_job_200']);
    expect(data.gemini_job_100).toBeUndefined();
    expect(data.gemini_job_200).toEqual(expect.objectContaining({
      geminiTabId: 200,
      canonicalTabId: 200,
      jobId: 'job-before-persist',
      index: 2,
    }));
    expect(state.jobIndex).toEqual([
      expect.objectContaining({ geminiTabId: 200, jobId: 'job-before-persist' }),
    ]);
  });

});
```

## 13. Auditoria linha a linha

### Linha 001

- **Código:** `'use strict';`
- **Função:** Ativa strict mode para a suíte.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver os módulos reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** `const {`
- **Função:** Importa mocks compartilhados de storage, tabs e alarms usados pelos cenários.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `  getStorageMock,`
- **Função:** Importa mocks compartilhados de storage, tabs e alarms usados pelos cenários.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `  getTabsMock,`
- **Função:** Importa mocks compartilhados de storage, tabs e alarms usados pelos cenários.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 007

- **Código:** `  getAlarmsMock,`
- **Função:** Importa mocks compartilhados de storage, tabs e alarms usados pelos cenários.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** `} = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa mocks compartilhados de storage, tabs e alarms usados pelos cenários.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `const STATE_PATH = path.resolve(__dirname, '../../../extension/background/state.js');`
- **Função:** Resolve caminho absoluto de state.js, tab-identity.js, jobs-reconciliation.js ou jobs-lifecycle.js reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 011

- **Código:** `const TAB_IDENTITY_PATH = path.resolve(__dirname, '../../../extension/background/tab-identity.js');`
- **Função:** Resolve caminho absoluto de state.js, tab-identity.js, jobs-reconciliation.js ou jobs-lifecycle.js reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 012

- **Código:** `const RECONCILIATION_PATH = path.resolve(__dirname, '../../../extension/background/jobs-reconciliation.js');`
- **Função:** Resolve caminho absoluto de state.js, tab-identity.js, jobs-reconciliation.js ou jobs-lifecycle.js reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 013

- **Código:** `const LIFECYCLE_PATH = path.resolve(__dirname, '../../../extension/background/jobs-lifecycle.js');`
- **Função:** Resolve caminho absoluto de state.js, tab-identity.js, jobs-reconciliation.js ou jobs-lifecycle.js reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 014

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `function loadState() {`
- **Função:** Define loader isolado da implementação real de state.js.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `  delete global.MangaTranslatorState;`
- **Função:** Remove instância global anterior de state para evitar vazamento entre casos.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `  jest.isolateModules(() => require(STATE_PATH));`
- **Função:** Carrega state.js real.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 018

- **Código:** `  return global.MangaTranslatorState;`
- **Função:** Entrega a API real de state ao cenário.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `function loadIdentityFactory() {`
- **Função:** Define loader isolado da factory real createTabIdentity.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `  let api;`
- **Função:** Declara referência de mock/API reconstruída em cada beforeEach.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Compõe o cenário loaders isolados de state/tab-identity/reconciler, preparando, executando ou verificando migração canônica real.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `    api = require(TAB_IDENTITY_PATH);`
- **Função:** Carrega tab-identity.js real.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 025

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `  return api.createTabIdentity;`
- **Função:** Entrega a factory real de identidade.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `function loadReconcilerFactory() {`
- **Função:** Define loader isolado do reconciler real.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `  delete global.MangaTranslatorJobsReconciliation;`
- **Função:** Remove/obtém a API global do reconciler real.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `  jest.isolateModules(() => require(RECONCILIATION_PATH));`
- **Função:** Carrega jobs-reconciliation.js real.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 032

- **Código:** `  return global.MangaTranslatorJobsReconciliation.createReconciler;`
- **Função:** Remove/obtém a API global do reconciler real.
- **Contexto:** loaders isolados de state/tab-identity/reconciler.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `describe('background/tab-identity.js', () => {`
- **Função:** Abre a suíte focal da identidade canônica de abas.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `  let storage;`
- **Função:** Declara referência de mock/API reconstruída em cada beforeEach.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `  let tabs;`
- **Função:** Declara referência de mock/API reconstruída em cada beforeEach.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `  let alarms;`
- **Função:** Declara referência de mock/API reconstruída em cada beforeEach.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `  let state;`
- **Função:** Declara referência de mock/API reconstruída em cada beforeEach.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `  let log;`
- **Função:** Declara referência de mock/API reconstruída em cada beforeEach.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `  let createTabIdentity;`
- **Função:** Declara referência de mock/API reconstruída em cada beforeEach.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `  beforeEach(async () => {`
- **Função:** Inicia setup limpo de storage, tabs, alarms, state e logger.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `    storage = getStorageMock();`
- **Função:** Obtém storage mock persistente usado por alias/journals/jobs.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `    tabs = getTabsMock();`
- **Função:** Obtém mock de tabs usado pelo reconciler e lifecycle.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `    alarms = getAlarmsMock();`
- **Função:** Obtém mock de alarms usado para provar migração de watchdog/finalization marker.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `    await storage.clear();`
- **Função:** Limpa storage persistido simulado.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `    tabs._tabs.clear();`
- **Função:** Remove tabs simuladas residuais.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `    await alarms.clearAll();`
- **Função:** Remove alarms residuais.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `    state = loadState();`
- **Função:** Carrega state.js real limpo.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `    state.patch({`
- **Função:** Configura snapshot controlado por meio da API real de state.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `      jobQueue: [],`
- **Função:** Inicializa fila vazia por padrão para evitar trabalho residual.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `      jobIndex: [],`
- **Função:** Inicializa índice de jobs vazio por padrão.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `      extractionTabs: {},`
- **Função:** Inicializa mapa de extraction tabs vazio.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `      activeJobsCount: 0,`
- **Função:** Inicializa contador de jobs ativos em zero no snapshot base.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `      completedJobs: 0,`
- **Função:** Inicializa contador de concluídos em zero no snapshot base.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `    log = jest.fn();`
- **Função:** Cria logger observável para ciclos/conflitos e eventos de rekey.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `    createTabIdentity = loadIdentityFactory();`
- **Função:** Carrega factory real de identidade usada por todos os cenários.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `  test('TAB-01: replacement após persistência migra job, watchdog, índice e referências', async () => {`
- **Função:** Declara cenário: TAB-01 — migração completa após persistência.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `    state.patch({`
- **Função:** Configura snapshot controlado por meio da API real de state.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `      jobIndex: [{ geminiTabId: 100, jobId: 'job-1', batchId: 'batch-1', mangaTabId: 77, index: 5 }],`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `      extractionTabs: {`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `        901: { geminiTabId: 100, jobId: 'job-1', batchId: 'batch-1' },`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `      activeJobsCount: 1,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `      completedJobs: 2,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `    await storage.set({`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `      gemini_job_100: {`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `        geminiTabId: 100,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `        jobId: 'job-1',`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `        batchId: 'batch-1',`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `        mangaTabId: 77,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `        index: 5,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `        prompt: 'sensitive prompt',`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `        createdAt: 1234,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** `      wd_data_100: { geminiTabId: 100, jobId: 'job-1', mangaTabId: 77, index: 5 },`
- **Função:** Prepara ou verifica watchdog persistido associado à tab antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `      gemini_delete_recovery_100: { geminiTabId: 100, jobId: 'job-1' },`
- **Função:** Prepara/verifica journal de delete recovery na identidade antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `      gemini_finalized_100: { jobId: 'job-1', accountingApplied: true, expiresAt: Date.now() + 60_000 },`
- **Função:** Prepara/verifica marcador de finalização na tab antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `    chrome.alarms.create('watchdog_100', { delayInMinutes: 4 });`
- **Função:** Cria/verifica alarm do watchdog legado por tabId.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `    chrome.alarms.create('finalization_marker_100', { delayInMinutes: 10 });`
- **Função:** Cria/verifica alarm do marcador final legado.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    await identity.recordReplacement(200, 100);`
- **Função:** Simula onReplaced com tab nova 200 substituindo a antiga 100.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 091

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `    const data = await storage.get([`
- **Função:** Relê registros persistidos para verificar migração/cleanup.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** `      'gemini_job_100', 'gemini_job_200',`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `      'wd_data_100', 'wd_data_200',`
- **Função:** Prepara ou verifica watchdog persistido associado à tab antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `      'gemini_delete_recovery_100', 'gemini_delete_recovery_200',`
- **Função:** Prepara/verifica journal de delete recovery na identidade antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `      'gemini_finalized_100', 'gemini_finalized_200',`
- **Função:** Prepara/verifica marcador de finalização na tab antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `      'gemini_tab_alias_100',`
- **Função:** Observa alias durável old→new usado em resolução futura.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `    ]);`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `    expect(data.gemini_job_100).toBeUndefined();`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 101

- **Código:** `    expect(data.gemini_job_200).toEqual(expect.objectContaining({`
- **Função:** Observa o job migrado para a chave canônica 200.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 102

- **Código:** `      geminiTabId: 200,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `      canonicalTabId: 200,`
- **Função:** Exige que o job persistido registre explicitamente sua identidade canônica.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `      jobId: 'job-1',`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `      createdAt: 1234,`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `      replacementCount: 1,`
- **Função:** Exige incremento de replacementCount durante a primeira migração.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `    expect(data.wd_data_100).toBeUndefined();`
- **Função:** Prepara ou verifica watchdog persistido associado à tab antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 109

- **Código:** `    expect(data.wd_data_200).toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-1' }));`
- **Função:** Observa watchdog persistido migrado para a tab nova.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 110

- **Código:** `    expect(data.gemini_delete_recovery_100).toBeUndefined();`
- **Função:** Prepara/verifica journal de delete recovery na identidade antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 111

- **Código:** `    expect(data.gemini_delete_recovery_200).toEqual(expect.objectContaining({ geminiTabId: 200 }));`
- **Função:** Observa journal de recovery migrado.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 112

- **Código:** `    expect(data.gemini_finalized_100).toBeUndefined();`
- **Função:** Prepara/verifica marcador de finalização na tab antiga.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 113

- **Código:** `    expect(data.gemini_finalized_200).toEqual(expect.objectContaining({ jobId: 'job-1' }));`
- **Função:** Observa marcador durável de finalização migrado.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 114

- **Código:** `    expect(data.gemini_tab_alias_100).toEqual(expect.objectContaining({ oldTabId: 100, newTabId: 200 }));`
- **Função:** Observa alias durável old→new usado em resolução futura.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 115

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `    expect(state.jobIndex).toEqual([`
- **Função:** Verifica atualização das referências em state.jobIndex.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 117

- **Código:** `      expect.objectContaining({ geminiTabId: 200, jobId: 'job-1' }),`
- **Função:** Compõe o cenário TAB-01 — migração completa após persistência, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `    ]);`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `    expect(state.extractionTabs[901]).toEqual(expect.objectContaining({ geminiTabId: 200 }));`
- **Função:** Verifica atualização de referências em extractionTabs.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 120

- **Código:** `    expect(state.completedJobs).toBe(2);`
- **Função:** Congela a garantia de que rekey não altera contabilidade de concluídos.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 121

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `    expect(await alarms.get('watchdog_100')).toBeNull();`
- **Função:** Cria/verifica alarm do watchdog legado por tabId.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 123

- **Código:** `    expect(await alarms.get('watchdog_200')).toEqual(expect.objectContaining({ name: 'watchdog_200' }));`
- **Função:** Verifica presença/ausência dos alarms antes/depois da migração.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 124

- **Código:** `    expect(await alarms.get('finalization_marker_100')).toBeNull();`
- **Função:** Cria/verifica alarm do marcador final legado.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 125

- **Código:** `    expect(await alarms.get('finalization_marker_200')).toEqual(expect.objectContaining({ name: 'finalization_marker_200' }));`
- **Função:** Verifica presença/ausência dos alarms antes/depois da migração.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 126

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-01 — migração completa após persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `  test('TAB-02: replacement antes do job persistido deixa alias durável para o lifecycle', async () => {`
- **Função:** Declara cenário: TAB-02 — replacement antes da persistência.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** `    await identity.recordReplacement(200, 100);`
- **Função:** Simula onReplaced com tab nova 200 substituindo a antiga 100.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 132

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `    expect(await identity.resolveCanonicalTabId(100)).toBe(200);`
- **Função:** Resolve a identidade canônica seguindo aliases duráveis.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 134

- **Código:** `    const data = await storage.get(['gemini_tab_alias_100', 'gemini_job_100', 'gemini_job_200']);`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `    expect(data.gemini_tab_alias_100).toEqual(expect.objectContaining({ newTabId: 200 }));`
- **Função:** Observa alias durável old→new usado em resolução futura.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 136

- **Código:** `    expect(data.gemini_job_100).toBeUndefined();`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 137

- **Código:** `    expect(data.gemini_job_200).toBeUndefined();`
- **Função:** Prova remoção da chave antiga.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 138

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-02 — replacement antes da persistência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `  test('TAB-03: duas substituições formam cadeia e resolvem para a aba mais nova', async () => {`
- **Função:** Declara cenário: TAB-03 — cadeia de aliases.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `    await identity.recordReplacement(200, 100);`
- **Função:** Simula onReplaced com tab nova 200 substituindo a antiga 100.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 144

- **Código:** `    await identity.recordReplacement(300, 200);`
- **Função:** Adiciona segunda substituição para formar cadeia 100→200→300.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 145

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `    expect(await identity.resolveCanonicalTabId(100)).toBe(300);`
- **Função:** Resolve a identidade canônica seguindo aliases duráveis.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 147

- **Código:** `    expect(await identity.resolveCanonicalTabId(200)).toBe(300);`
- **Função:** Resolve a identidade canônica seguindo aliases duráveis.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 148

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-03 — cadeia de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** `  test('TAB-04: ciclo inválido é detectado sem escolher uma identidade arbitrária', async () => {`
- **Função:** Declara cenário: TAB-04 — ciclo de aliases.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `    const future = Date.now() + 60_000;`
- **Função:** Define validade futura para aliases artificiais do cenário de ciclo.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `    await storage.set({`
- **Função:** Compõe o cenário TAB-04 — ciclo de aliases, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `      gemini_tab_alias_100: { oldTabId: 100, newTabId: 200, createdAt: Date.now(), expiresAt: future },`
- **Função:** Observa alias durável old→new usado em resolução futura.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `      gemini_tab_alias_200: { oldTabId: 200, newTabId: 100, createdAt: Date.now(), expiresAt: future },`
- **Função:** Compõe o cenário TAB-04 — ciclo de aliases, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `    expect(await identity.resolveCanonicalTabId(100)).toBe(100);`
- **Função:** Resolve a identidade canônica seguindo aliases duráveis.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 159

- **Código:** `    expect(log).toHaveBeenCalledWith(`
- **Função:** Assertion focal do comportamento auditado.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 160

- **Código:** `      'error', 'bg', 'TAB_ALIAS_CYCLE', expect.any(String),`
- **Função:** Exige log explícito de ciclo de aliases em vez de escolher identidade arbitrária.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `      expect.objectContaining({ oldTabId: 100 })`
- **Função:** Compõe o cenário TAB-04 — ciclo de aliases, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-04 — ciclo de aliases.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `  test('TAB-05: recovery retoma journal intermediário de forma idempotente', async () => {`
- **Função:** Declara cenário: TAB-05 — recovery idempotente de journal.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `    state.patch({`
- **Função:** Configura snapshot controlado por meio da API real de state.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `      jobIndex: [{ geminiTabId: 100, jobId: 'job-restart', batchId: 'b', mangaTabId: 9, index: 1 }],`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `      activeJobsCount: 1,`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `    await storage.set({`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `      gemini_job_100: { geminiTabId: 100, jobId: 'job-restart', batchId: 'b', mangaTabId: 9, index: 1 },`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `      gemini_tab_alias_100: {`
- **Função:** Observa alias durável old→new usado em resolução futura.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `        oldTabId: 100,`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** `        newTabId: 200,`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 175

- **Código:** `        createdAt: Date.now(),`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** `        expiresAt: Date.now() + 60_000,`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 177

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** `      gemini_tab_migration_job_restart: {`
- **Função:** Prepara/observa journal de migração interrompida de job-restart.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** `        oldTabId: 100,`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `        newTabId: 200,`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** `        jobId: 'job-restart',`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `        phase: 'records_copied',`
- **Função:** Posiciona journal em fase intermediária recuperável.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `        createdAt: Date.now(),`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `        updatedAt: Date.now(),`
- **Função:** Compõe o cenário TAB-05 — recovery idempotente de journal, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `      gemini_tab_migration_index: ['gemini_tab_migration_job_restart'],`
- **Função:** Prepara/observa journal de migração interrompida de job-restart.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `    expect(await identity.recoverPendingMigrations()).toBe(1);`
- **Função:** Executa recovery real dos journals e mede idempotência.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 191

- **Código:** `    expect(await identity.recoverPendingMigrations()).toBe(0);`
- **Função:** Executa recovery real dos journals e mede idempotência.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 192

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `    const data = await storage.get([`
- **Função:** Relê registros persistidos para verificar migração/cleanup.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `      'gemini_job_100',`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `      'gemini_job_200',`
- **Função:** Observa o job migrado para a chave canônica 200.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** `      'gemini_tab_migration_job_restart',`
- **Função:** Prepara/observa journal de migração interrompida de job-restart.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `      'gemini_tab_migration_index',`
- **Função:** Prepara/observa índice de journals pendentes.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** `    ]);`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** `    expect(data.gemini_job_100).toBeUndefined();`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 200

- **Código:** `    expect(data.gemini_job_200).toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-restart' }));`
- **Função:** Observa o job migrado para a chave canônica 200.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 201

- **Código:** `    expect(data.gemini_tab_migration_job_restart.phase).toBe('completed');`
- **Função:** Prepara/observa journal de migração interrompida de job-restart.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 202

- **Código:** `    expect(data.gemini_tab_migration_index).toEqual([]);`
- **Função:** Prepara/observa índice de journals pendentes.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 203

- **Código:** `    expect(state.jobIndex).toEqual([expect.objectContaining({ geminiTabId: 200 })]);`
- **Função:** Verifica atualização das referências em state.jobIndex.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 204

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-05 — recovery idempotente de journal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `  test('TAB-07/TAB-08: extraction e marcador finalizado migram sem alterar contabilidade', async () => {`
- **Função:** Declara cenário: TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** `    state.patch({`
- **Função:** Configura snapshot controlado por meio da API real de state.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `      jobIndex: [{ geminiTabId: 100, jobId: 'job-f', batchId: 'b', mangaTabId: 9, index: 1 }],`
- **Função:** Compõe o cenário TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 209

- **Código:** `      extractionTabs: { 500: { geminiTabId: 100, jobId: 'job-f' } },`
- **Função:** Compõe o cenário TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** `      completedJobs: 7,`
- **Função:** Compõe o cenário TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `      activeJobsCount: 1,`
- **Função:** Compõe o cenário TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 212

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** `    await storage.set({`
- **Função:** Compõe o cenário TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** `      gemini_job_100: { geminiTabId: 100, jobId: 'job-f' },`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `      gemini_finalized_100: { jobId: 'job-f', accountingApplied: true, expiresAt: Date.now() + 60_000 },`
- **Função:** Prepara/verifica marcador de finalização na tab antiga.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 218

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** `    await identity.recordReplacement(200, 100);`
- **Função:** Simula onReplaced com tab nova 200 substituindo a antiga 100.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 220

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** `    expect(state.extractionTabs[500].geminiTabId).toBe(200);`
- **Função:** Verifica atualização de referências em extractionTabs.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 222

- **Código:** `    expect(state.completedJobs).toBe(7);`
- **Função:** Congela a garantia de que rekey não altera contabilidade de concluídos.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 223

- **Código:** `    expect((await storage.get('gemini_finalized_200')).gemini_finalized_200)`
- **Função:** Relê registros persistidos para verificar migração/cleanup.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 224

- **Código:** `      .toEqual(expect.objectContaining({ accountingApplied: true }));`
- **Função:** Preserva marcador que informa contabilidade já aplicada.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 225

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-07/TAB-08 — extraction/finalized sem alterar contabilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `  test('TAB-09: alias expirado não autoriza takeover da aba antiga', async () => {`
- **Função:** Declara cenário: TAB-09 — expiração e cleanup de alias.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** `    await storage.set({`
- **Função:** Compõe o cenário TAB-09 — expiração e cleanup de alias, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 229

- **Código:** `      gemini_tab_alias_100: {`
- **Função:** Observa alias durável old→new usado em resolução futura.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** `        oldTabId: 100,`
- **Função:** Compõe o cenário TAB-09 — expiração e cleanup de alias, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 231

- **Código:** `        newTabId: 200,`
- **Função:** Compõe o cenário TAB-09 — expiração e cleanup de alias, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `        createdAt: Date.now() - 120_000,`
- **Função:** Compõe o cenário TAB-09 — expiração e cleanup de alias, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 233

- **Código:** `        expiresAt: Date.now() - 1,`
- **Função:** Compõe o cenário TAB-09 — expiração e cleanup de alias, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 235

- **Código:** `      gemini_tab_alias_index: [100],`
- **Função:** Compõe o cenário TAB-09 — expiração e cleanup de alias, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 237

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `    expect(await identity.resolveCanonicalTabId(100)).toBe(100);`
- **Função:** Resolve a identidade canônica seguindo aliases duráveis.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 240

- **Código:** `    expect(await identity.cleanupExpiredAliases()).toEqual({ kept: 0, removed: 1 });`
- **Função:** Executa cleanup real de aliases vencidos.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 241

- **Código:** `    expect((await storage.get('gemini_tab_alias_100')).gemini_tab_alias_100).toBeUndefined();`
- **Função:** Relê registros persistidos para verificar migração/cleanup.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 242

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-09 — expiração e cleanup de alias.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `  test('TAB-12: reconciler canonicaliza antes de classificar o job como órfão', async () => {`
- **Função:** Declara cenário: TAB-12 — reconciler canonical-aware.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `    state.patch({`
- **Função:** Configura snapshot controlado por meio da API real de state.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** `      jobIndex: [{ geminiTabId: 100, jobId: 'job-r', batchId: 'b', mangaTabId: 9, index: 4 }],`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `      activeJobsCount: 1,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `    await storage.set({`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `      gemini_job_100: { geminiTabId: 100, jobId: 'job-r', batchId: 'b', mangaTabId: 9, index: 4 },`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** `      gemini_tab_alias_100: {`
- **Função:** Observa alias durável old→new usado em resolução futura.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `        oldTabId: 100,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** `        newTabId: 200,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `        createdAt: Date.now(),`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 255

- **Código:** `        expiresAt: Date.now() + 60_000,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 258

- **Código:** `    tabs._tabs.set(200, { id: 200, url: 'https://gemini.google.com/app', active: false, status: 'complete' });`
- **Função:** Materializa somente a tab canônica 200 para o reconciler.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 259

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 260

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 261

- **Código:** `    const createReconciler = loadReconcilerFactory();`
- **Função:** Carrega reconciler real para provar integração canonical-aware.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 262

- **Código:** `    const reconciler = createReconciler({`
- **Função:** Instancia reconciler real com resolução/migração fornecida pela identidade.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 263

- **Código:** `      state,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 264

- **Código:** `      tabExists: async tabId => tabs._tabs.has(tabId),`
- **Função:** Liga a existência de tabs ao mock real do cenário.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 265

- **Código:** `      log,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 266

- **Código:** `      syncState: () => state.syncState(),`
- **Função:** Liga persistência do state real ao reconciler/lifecycle.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 267

- **Código:** `      processNextJob: jest.fn(),`
- **Função:** Fornece boundary de scheduler; este cenário focaliza classificação/migração.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 268

- **Código:** `      recoverPendingFinalization: async () => false,`
- **Função:** Declara que não há finalização pendente nesse cenário.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 269

- **Código:** `      resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId),`
- **Função:** Resolve a identidade canônica seguindo aliases duráveis.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 270

- **Código:** `      migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options),`
- **Função:** Liga o reconciler/lifecycle à migração real da identidade.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 271

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 272

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 273

- **Código:** `    await expect(reconciler.reconcile()).resolves.toEqual({`
- **Função:** Executa reconciliação real sobre job antigo cujo alias aponta para tab viva.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 274

- **Código:** `      alive: 1,`
- **Função:** Exige que o job seja preservado como vivo após canonicalização.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `      dropped: 0,`
- **Função:** Exige que o job antigo não seja descartado como órfão.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 276

- **Código:** `      recovered: 0,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 277

- **Código:** `      foreign: 0,`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 278

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** `    expect(state.jobIndex).toEqual([expect.objectContaining({ geminiTabId: 200, jobId: 'job-r' })]);`
- **Função:** Verifica atualização das referências em state.jobIndex.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 280

- **Código:** `    expect((await storage.get('gemini_job_200')).gemini_job_200)`
- **Função:** Relê registros persistidos para verificar migração/cleanup.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 281

- **Código:** `      .toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-r' }));`
- **Função:** Compõe o cenário TAB-12 — reconciler canonical-aware, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-12 — reconciler canonical-aware.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 282

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 283

- **Código:** `  test('TAB-02 lifecycle: alias existente antes da persistência grava somente na chave canônica', async () => {`
- **Função:** Declara cenário: TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 284

- **Código:** `    tabs._nextTabId = 100;`
- **Função:** Faz a próxima tab física criada pelo lifecycle nascer como id antigo 100.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 285

- **Código:** `    const identity = createTabIdentity({ state, log });`
- **Função:** Instancia a implementação real de identidade sobre state/log controlados.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** `    await identity.recordReplacement(200, 100);`
- **Função:** Simula onReplaced com tab nova 200 substituindo a antiga 100.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 287

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `    state.patch({`
- **Função:** Configura snapshot controlado por meio da API real de state.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 289

- **Código:** `      jobQueue: [{ mangaTabId: 9, index: 2, prompt: 'translate', batchId: 'batch-x' }],`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** `      jobIndex: [],`
- **Função:** Inicializa índice de jobs vazio por padrão.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** `      stopRequested: false,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 292

- **Código:** `      activeJobsCount: 0,`
- **Função:** Inicializa contador de jobs ativos em zero no snapshot base.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 293

- **Código:** `      totalJobs: 1,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 294

- **Código:** `      completedJobs: 0,`
- **Função:** Inicializa contador de concluídos em zero no snapshot base.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 295

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 296

- **Código:** `    state._cachedMaxCon = 1;`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 297

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 298

- **Código:** `    delete global.MangaTranslatorJobsLifecycle;`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 299

- **Código:** `    jest.isolateModules(() => require(LIFECYCLE_PATH));`
- **Função:** Carrega jobs-lifecycle.js real para integração com alias pré-existente.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 300

- **Código:** `    const lifecycle = global.MangaTranslatorJobsLifecycle.createLifecycle({`
- **Função:** Instancia lifecycle real com state e identidade reais.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 301

- **Código:** `      state,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 302

- **Código:** `      log,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 303

- **Código:** `      syncState: () => state.syncState(),`
- **Função:** Liga persistência do state real ao reconciler/lifecycle.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 304

- **Código:** `      sendProgress: jest.fn(),`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `      armWatchdog: jest.fn(async (_mangaTabId, _index, geminiTabId) => geminiTabId),`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `      clearWatchdog: jest.fn(),`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 307

- **Código:** `      indexAddJob: entry => state.indexAddJob(entry),`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** `      indexRemoveJob: tabId => state.indexRemoveJob(tabId),`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 309

- **Código:** `      indexJobsOfBatch: batchId => state.indexJobsOfBatch(batchId),`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 310

- **Código:** `      delay: async () => {},`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 311

- **Código:** `      generateId: () => 'job-before-persist',`
- **Função:** Fixa jobId determinístico para assertions persistidas.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 312

- **Código:** `      markFinalized: jest.fn(),`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 313

- **Código:** `      isFinalized: () => false,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 314

- **Código:** `      finalizedMarkerTtlMinutes: 10,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** `      resolveCanonicalTabId: tabId => identity.resolveCanonicalTabId(tabId),`
- **Função:** Resolve a identidade canônica seguindo aliases duráveis.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 316

- **Código:** `      migrateTabIdentity: (oldTabId, newTabId, options) => identity.migrateTabIdentity(oldTabId, newTabId, options),`
- **Função:** Liga o reconciler/lifecycle à migração real da identidade.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 317

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 319

- **Código:** `    await lifecycle.processNextJob();`
- **Função:** Executa lançamento real do job pelo lifecycle.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa implementação real e assertions subsequentes verificam efeitos.

### Linha 320

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 321

- **Código:** `    const data = await storage.get(['gemini_job_100', 'gemini_job_200']);`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 322

- **Código:** `    expect(data.gemini_job_100).toBeUndefined();`
- **Função:** Prepara ou verifica registro persistido do job na tab antiga 100.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 323

- **Código:** `    expect(data.gemini_job_200).toEqual(expect.objectContaining({`
- **Função:** Observa o job migrado para a chave canônica 200.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 324

- **Código:** `      geminiTabId: 200,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `      canonicalTabId: 200,`
- **Função:** Exige que o job persistido registre explicitamente sua identidade canônica.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 326

- **Código:** `      jobId: 'job-before-persist',`
- **Função:** Fixa/verifica identidade do job criado após alias pré-existente.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 327

- **Código:** `      index: 2,`
- **Função:** Compõe o cenário TAB-02 lifecycle — persistência diretamente na chave canônica, preparando, executando ou verificando migração canônica real.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 328

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 329

- **Código:** `    expect(state.jobIndex).toEqual([`
- **Função:** Verifica atualização das referências em state.jobIndex.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 330

- **Código:** `      expect.objectContaining({ geminiTabId: 200, jobId: 'job-before-persist' }),`
- **Função:** Fixa/verifica identidade do job criado após alias pré-existente.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 331

- **Código:** `    ]);`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** TAB-02 lifecycle — persistência diretamente na chave canônica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 333

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 335 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 14. Conclusão documental

Foram documentadas 334 linhas textuais e a posição 335 do newline final. A suíte oferece prova direta ampla de rekey, aliases, recovery e integração com reconciler/lifecycle no mesmo blob executado em Node 20/22; as três solicitações OPEN delimitam safeguards excepcionais ainda sem caso focal.

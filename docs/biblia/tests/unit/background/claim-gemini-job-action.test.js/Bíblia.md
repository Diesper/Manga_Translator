# Bíblia técnica — tests/unit/background/claim-gemini-job-action.test.js

> **Estado documental:** reparo corretivo local concluído; decisão distribuída final pendente  
> **SHA auditado:** `eb90e19aabe77ff8f24355ac56033ab6f3933607`  
> **Tipo:** suíte Jest do router/action reais de claim de job Gemini  
> **Linhas textuais:** **251**  
> **Posições documentais:** **252**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte carrega os módulos reais `router.js`, `state.js`, `claim-gemini-job.js` e `tab-identity.js`, registra a action real e despacha `CLAIM_GEMINI_JOB` pela interface de listener usada pelo background.

Ela protege autorização de origem, binding job↔tab, sanitização de payload e migração de ownership após replacement de tab.

## 2. Harness

`loadModules()` limpa globals, usa `jest.isolateModules()` e devolve router/state/createTabIdentity reais. `dispatch()` apenas adapta callback + `keepAlive` para Promise; não reimplementa regras de claim.

Cada teste limpa storage, recria módulos/state e instancia `tabIdentity` real com logger spy.

## 3. Claim direto

O caso direto prepara `jobIndex` e `gemini_job_200`, despacha `job-ok` pela tab 200 e exige:

- `keepAlive === true`;
- payload sanitizado contendo apenas campos permitidos;
- ausência de `signedUrl` e `internalOnly`.

## 4. Guardas existentes

- TAB-10: jobId divergente na tab correta → `{ok:true,job:null}`.
- TAB-11: tab Gemini manual sem job → claim nulo.
- origem não-Gemini → router nega com `SOURCE_DENIED` e canal síncrono.

## 5. Ownership canônico divergente — 135-001

O novo caso prepara **o mesmo `jobId` válido** sob `jobIndex/gemini_job_100`, mas o sender Gemini legítimo é a tab 200 e não existe alias 100→200.

A prova exige simultaneamente:

- resposta `{ok:true,job:null}`;
- log exato `TAB_CLAIM_REJECTED` / `Claim rejeitado por ownership de aba` com `{tabId:200,indexedTabId:100}`;
- `migrateTabIdentity` **não chamado**;
- `state.jobIndex` ainda aponta para tab 100;
- `gemini_job_100` preservado;
- `gemini_job_200` ausente.

Essas assertions tornam causal o branch `canonicalIndexedTabId !== canonicalSenderTabId`; o teste não pode passar apenas por jobId divergente ou job inexistente.

## 6. Alias válido

TAB-06 cobre o lado oposto: alias 100→200 converge as identidades canônicas, permite migração real, atualiza `state.jobIndex`, remove `gemini_job_100` e cria `gemini_job_200` com ownership novo.

## 7. Request 135-002

Permanece **SUPERSEDED por 005-002**. O guard de sender sem `tab.id` inteiro é responsabilidade canônica da action de produção; o self-test `claim-gemini-job-selftest.js` já exercita senders inválidos e confirma retorno nulo antes de tocar storage. Esta unidade não cria fila duplicada.

## 8. Evidência executável

- `Claim Gemini Job Selftest` run `36947199617`, job `110651904268`: self-test focal **success**.
- No mesmo checkout, projeto Jest `background` executado com `--runInBand --detectOpenHandles`: **45/45 suites, 228/228 testes**.
- Workflow focal atual inclui `tests/unit/background/claim-gemini-job-action.test.js` nos paths de disparo.
- A action de produção permaneceu inalterada; o reparo fortalece a prova do contrato existente.

## 9. Limites honestos

- Storage/runtime são mocks stateful; não há browser real.
- TAB-06 prova uma migração válida específica, não todos os sub-branches de `tab-identity.js`.
- A evidência de CI aqui é a run focal citada; não é alegação de que toda a CI/E2E do PR foi executada por esta unidade.

## 10. Fonte integral exata

```js
'use strict';

const path = require('path');
const { getStorageMock } = require('../../mocks/chrome-api.mock.js');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const CLAIM_PATH = path.resolve(__dirname, '../../../extension/background/actions/claim-gemini-job.js');
const STATE_PATH = path.resolve(__dirname, '../../../extension/background/state.js');
const TAB_IDENTITY_PATH = path.resolve(__dirname, '../../../extension/background/tab-identity.js');

function loadModules() {
  delete global.MangaTranslatorRouter;
  delete global.MangaTranslatorState;
  jest.isolateModules(() => {
    require(ROUTER_PATH);
    require(STATE_PATH);
    require(CLAIM_PATH);
  });
  let tabIdentityApi;
  jest.isolateModules(() => {
    tabIdentityApi = require(TAB_IDENTITY_PATH);
  });
  return {
    router: global.MangaTranslatorRouter,
    state: global.MangaTranslatorState,
    createTabIdentity: tabIdentityApi.createTabIdentity,
  };
}

function dispatch(listener, request, sender) {
  return new Promise(resolve => {
    let keepAlive;
    let delivered = false;
    let deliveredResponse;

    const sendResponse = response => {
      delivered = true;
      deliveredResponse = response;
      if (keepAlive !== undefined) resolve({ keepAlive, response });
    };

    keepAlive = listener(request, sender, sendResponse);
    if (delivered || keepAlive === false) {
      resolve({ keepAlive, response: delivered ? deliveredResponse : undefined });
    }
  });
}

describe('CLAIM_GEMINI_JOB', () => {
  let storage;
  let router;
  let state;
  let identity;
  let log;

  beforeEach(async () => {
    storage = getStorageMock();
    await storage.clear();
    ({ router, state, createTabIdentity: identity } = loadModules());
    state.patch({ jobIndex: [], extractionTabs: {}, activeJobsCount: 0 });
    log = jest.fn();
    identity = identity({ state, log });
  });

  function listener() {
    return router.createMessageRouter({
      contextFactory: () => ({
        state,
        log,
        tabIdentity: identity,
      }),
    });
  }

  test('claim direto retorna somente o contrato necessário', async () => {
    state.patch({
      jobIndex: [{ geminiTabId: 200, jobId: 'job-ok', batchId: 'b', mangaTabId: 7, index: 3 }],
    });
    await storage.set({
      gemini_job_200: {
        geminiTabId: 200,
        jobId: 'job-ok',
        batchId: 'b',
        mangaTabId: 7,
        index: 3,
        prompt: 'translate',
        executionMode: 'temp_chat',
        windowId: 8,
        signedUrl: 'https://secret.invalid/token',
        internalOnly: 'must-not-leak',
      },
    });

    const result = await dispatch(
      listener(),
      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-ok' },
      { tab: { id: 200, url: 'https://gemini.google.com/app?jobId=job-ok' } }
    );

    expect(result.keepAlive).toBe(true);
    expect(result.response).toEqual({
      ok: true,
      job: {
        jobId: 'job-ok',
        batchId: 'b',
        mangaTabId: 7,
        index: 3,
        prompt: 'translate',
        executionMode: 'temp_chat',
        geminiTabId: 200,
        windowId: 8,
      },
    });
    expect(result.response.job).not.toHaveProperty('signedUrl');
    expect(result.response.job).not.toHaveProperty('internalOnly');
  });

  test('TAB-10: jobId divergente rejeita claim mesmo na aba correta', async () => {
    await storage.set({
      gemini_job_200: { geminiTabId: 200, jobId: 'job-real', mangaTabId: 7, index: 1 },
    });

    const result = await dispatch(
      listener(),
      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-wrong' },
      { tab: { id: 200, url: 'https://gemini.google.com/app' } }
    );

    expect(result.response).toEqual({ ok: true, job: null });
  });

  test('TAB-11: aba Gemini manual sem job recebe claim nulo', async () => {
    const result = await dispatch(
      listener(),
      { action: 'CLAIM_GEMINI_JOB' },
      { tab: { id: 777, url: 'https://gemini.google.com/app' } }
    );

    expect(result.response).toEqual({ ok: true, job: null });
  });

  test('origem não-Gemini não pode executar o claim', async () => {
    await storage.set({
      gemini_job_200: { geminiTabId: 200, jobId: 'job-ok', mangaTabId: 7, index: 1 },
    });

    const result = await dispatch(
      listener(),
      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-ok' },
      { tab: { id: 200, url: 'https://reader.example/chapter' } }
    );

    expect(result.keepAlive).toBe(false);
    expect(result.response).toEqual({
      ok: false,
      error: { code: 'SOURCE_DENIED' },
    });
  });

  test('ownership canônico divergente rejeita claim e preserva job da outra tab', async () => {
    state.patch({
      jobIndex: [{ geminiTabId: 100, jobId: 'job-owned', batchId: 'b', mangaTabId: 7, index: 2 }],
    });
    await storage.set({
      gemini_job_100: {
        geminiTabId: 100,
        jobId: 'job-owned',
        batchId: 'b',
        mangaTabId: 7,
        index: 2,
        prompt: 'translate',
        executionMode: 'temp_chat',
      },
    });

    const migrateSpy = jest.spyOn(identity, 'migrateTabIdentity');

    const result = await dispatch(
      listener(),
      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-owned' },
      { tab: { id: 200, url: 'https://gemini.google.com/app?jobId=job-owned' } }
    );

    expect(result.keepAlive).toBe(true);
    expect(result.response).toEqual({ ok: true, job: null });
    expect(log).toHaveBeenCalledWith(
      'warn',
      'bg',
      'TAB_CLAIM_REJECTED',
      'Claim rejeitado por ownership de aba',
      { tabId: 200, indexedTabId: 100 }
    );
    expect(migrateSpy).not.toHaveBeenCalled();
    expect(state.jobIndex).toEqual([
      expect.objectContaining({
        geminiTabId: 100,
        jobId: 'job-owned',
        index: 2,
      }),
    ]);
    expect((await storage.get('gemini_job_100')).gemini_job_100)
      .toEqual(expect.objectContaining({
        geminiTabId: 100,
        jobId: 'job-owned',
        index: 2,
      }));
    expect((await storage.get('gemini_job_200')).gemini_job_200).toBeUndefined();
  });

  test('TAB-06: sender na aba substituta recupera job antigo pelo alias e migra ownership', async () => {
    state.patch({
      jobIndex: [{ geminiTabId: 100, jobId: 'job-alias', batchId: 'b', mangaTabId: 7, index: 4 }],
    });
    await storage.set({
      gemini_job_100: {
        geminiTabId: 100,
        jobId: 'job-alias',
        batchId: 'b',
        mangaTabId: 7,
        index: 4,
        prompt: 'translate',
        executionMode: 'temp_chat',
      },
      gemini_tab_alias_100: {
        oldTabId: 100,
        newTabId: 200,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    });

    const result = await dispatch(
      listener(),
      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-alias' },
      { tab: { id: 200, url: 'https://gemini.google.com/app?jobId=job-alias' } }
    );

    expect(result.response).toEqual({
      ok: true,
      job: expect.objectContaining({
        jobId: 'job-alias',
        geminiTabId: 200,
        index: 4,
      }),
    });
    expect(state.jobIndex).toEqual([expect.objectContaining({ geminiTabId: 200 })]);
    expect((await storage.get('gemini_job_100')).gemini_job_100).toBeUndefined();
    expect((await storage.get('gemini_job_200')).gemini_job_200)
      .toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-alias' }));
  });
});
```

## 11. Cobertura integral por posições

- **1–9:** imports e paths dos módulos reais.
- **10–28:** `loadModules()` e construção das APIs reais.
- **29–47:** helper `dispatch` callback/keepAlive.
- **48–74:** suíte, setup e factory do listener/router real.
- **75–117:** claim direto e sanitização de payload.
- **118–131:** TAB-10 jobId divergente.
- **132–141:** TAB-11 sem job.
- **142–159:** source guard não-Gemini.
- **160–209:** ownership canônico divergente, rejeição causal e preservação de state/storage.
- **210–250:** alias 100→200 e migração válida.
- **251:** fechamento da suíte.
- **252:** posição vazia correspondente ao LF final.

**Cobertura:** 252/252 posições, contíguas, sem gap ou overlap.

## 12. Autoauditoria

- Source SHA reconfirmado: `eb90e19aabe77ff8f24355ac56033ab6f3933607`.
- Fonte integral inserida diretamente do blob atual.
- Nenhum `.skip`, `.only`, `xit`, `xdescribe`, TODO ou FIXME usado para esconder pendência.
- 135-001 possui regressão focal causal na suíte real.
- Background relacionada ficou totalmente verde com detecção de handles.
- Unidade deve retornar a `READY_FOR_AUDIT`; aprovação distribuída final permanece independente.

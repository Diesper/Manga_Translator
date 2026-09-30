# Bíblia técnica — tests/unit/background/refresh-job-watchdog-action.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** d2acd697b78872400a16bfdac3a4866446d2239f  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest isolada do router + action real de renovação do watchdog  
> **Linhas textuais:** 122  
> **Posições documentais:** 123, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte valida a action real `refresh-job-watchdog`, registrada por `extension/background/actions/refresh-job-watchdog.js` no router central. O evento nasce no content script Gemini quando a geração efetivamente começa e solicita um novo prazo do watchdog global.

O teste não carrega `background.js` inteiro. Ele carrega **router real + action real** e injeta manualmente o contexto. Isso é adequado para provar validação de ownership e os argumentos enviados à dependência `armWatchdog`, mas delimita o que não pode ser reivindicado: a criação física do alarme e a persistência de `wd_data_*` são efeitos do módulo `jobs-watchdog.js`, não desta suíte isolada.

## 2. Contrato real da action

A action se registra como `refresh-job-watchdog`, com `allowedSources:['gemini']`. Seu validator rejeita payload sem `jobId`. Na execução, ela:

1. aguarda `ensureInitialized()`, quando disponível;
2. exige `armWatchdog`;
3. obtém o tabId do sender;
4. procura o `jobId` no `state.jobIndex`;
5. canonicaliza tanto sender quanto `indexed.geminiTabId`;
6. rejeita se as identidades canônicas diferirem;
7. chama `armWatchdog(indexed.mangaTabId, indexed.index, canonicalIndexed, indexed.jobId)`;
8. registra `JOB_WATCHDOG_REFRESH`;
9. responde `{refreshed:true, geminiTabId: refreshedTabId}`.

Essa ordem é importante porque evita confiar em `mangaTabId`, `index` ou `geminiTabId` enviados pelo content script: no sucesso, os valores usados vêm do índice durável.

## 3. Roteamento e origem

`router.js` mapeia `REFRESH_JOB_WATCHDOG` para `refresh-job-watchdog`. O router identifica como origem Gemini URLs de `gemini.google.com` ou `127.0.0.1`, valida `allowedSources` antes do payload e converte exceções assíncronas em `{ok:false,error:{code:'INTERNAL_ERROR',...}}`.

O gate genérico de origem não é reprovado aqui, mas existe prova direta em `tests/unit/background/router.test.js` para `SOURCE_DENIED`. Por isso esta Bíblia não abre uma solicitação duplicada apenas porque os dois cenários locais usam senders Gemini.

## 4. Cenário WATCHDOG-REFRESH-01

O cenário de sucesso mantém `jobIndex` com `job-1`, aba Gemini 321, manga 77 e índice 4. O payload enviado também contém esses campos, porém a assertion material é sobre a chamada `armWatchdog(77,4,321,'job-1')`, derivada do estado injetado.

Também é provado que `ensureInitialized` é chamado exatamente uma vez e que a resposta contém `ok:true`, `refreshed:true` e `geminiTabId:321`.

Classificação: ✅ **PROVADO DIRETAMENTE** para lookup do job, ownership quando IDs já são canônicos, ordem de inicialização suficiente para o caso e propagação dos argumentos ao boundary `armWatchdog`.

## 5. Cenário WATCHDOG-REFRESH-02

O segundo caso usa sender tab 999, ainda com URL Gemini válida, enquanto o job pertence à tab 321. Assim ele isola ownership de origem: o router permite a origem, mas a action rejeita o remetente por não possuir o job.

As assertions exigem que `armWatchdog` não seja chamado e que a resposta seja `ok:false` com `INTERNAL_ERROR`.

Classificação: ✅ **PROVADO DIRETAMENTE** para bloqueio de aba Gemini não proprietária.

## 6. Boundary com jobs-watchdog.js

A implementação real `jobs-watchdog.arm` limpa o alarme anterior `watchdog_<jobId>`, persiste `wd_data_<canonicalTabId>`, cria novo alarme com o timeout configurado e re-resolve canonicalização após o write para fechar corrida com `tabs.onReplaced`.

Este arquivo substitui essa função por `jest.fn`; portanto o que ele prova é o **contrato de chamada da action**, não os side effects internos de `jobs-watchdog.arm`. Outros testes do projeto exercitam watchdog/finalização, porém não foi localizada prova focal que envie `REFRESH_JOB_WATCHDOG` pelo `background.js` real e então verifique o alarme/storage renovados.

## 7. Evidência CI exata

O run **36521561968**, commit `e720890cf34dc9437ee91f3b8172953497d69870`, contém exatamente o blob auditado **d2acd697b78872400a16bfdac3a4866446d2239f**.

- Node 20.x — job **109255348388**: `PASS background tests/unit/background/refresh-job-watchdog-action.test.js`; os dois casos WATCHDOG-REFRESH-01/02 aparecem com ✓; global **109/109 suítes**, **851/851 testes**.
- Node 22.x — job **109255348406**: os mesmos dois casos aparecem com ✓; global **109/109 suítes**, **851/851 testes**.
- CI Gate: job **109256050280**, sucesso.

## 8. Matriz de força da evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| mapping legado → action registrada | router + action reais carregados | 🟦 GATE ESTÁTICO ESPECÍFICO + execução |
| `ensureInitialized` no sucesso | assertion de 1 chamada | ✅ PROVADO DIRETAMENTE |
| dados de `jobIndex` enviados a `armWatchdog` | chamada 77,4,321,job-1 | ✅ PROVADO DIRETAMENTE |
| resposta `refreshed:true` | assertion de payload | ✅ PROVADO DIRETAMENTE |
| aba Gemini não proprietária não rearma | `not.toHaveBeenCalled` | ✅ PROVADO DIRETAMENTE |
| payload sem `jobId` → INVALID_PAYLOAD | branch real existe; sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| sender e indexed tab diferentes mas canonicalizam para o mesmo tab | serviço é identidade trivial nos dois casos | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| dispatch pelo `background.js` real renova alarme/storage | `armWatchdog` é mockado neste arquivo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| log `JOB_WATCHDOG_REFRESH` | logger existe mas não é assertado | 🟨 EXECUTADO INDIRETAMENTE no sucesso |

## 9. Solicitações ao auditor

### 161-001 — TEST_REQUIRED — OPEN — NORMAL

**Encontrado:** o validator real retorna `INVALID_PAYLOAD` quando `request.jobId` está ausente.

**Evidência atual:** os dois casos sempre enviam `jobId:'job-1'`.

**Evidência ausente:** dispatch com sender Gemini válido e payload `REFRESH_JOB_WATCHDOG` sem `jobId`, exigindo `ok:false`, código `INVALID_PAYLOAD`, ausência de `ensureInitialized`/`armWatchdog`.

**Risco:** regressão no validator ou na ordem do router pode permitir execução sem identidade de job.

### 161-002 — TEST_REQUIRED — OPEN — HIGH

**Encontrado:** a action canonicaliza sender e tab indexada antes de comparar ownership, justamente para sobreviver a substituição/rekey de aba.

**Evidência atual:** `resolveCanonicalTabId` é identidade trivial; sender 321 e indexed 321 já coincidem.

**Evidência ausente:** sender antigo/novo e indexed ID distintos que resolvem para a mesma identidade canônica, exigindo aceitação e `armWatchdog` com o tabId canônico; e, idealmente, par que continue distinto após canonicalização e seja rejeitado.

**Risco:** após `tabs.onReplaced`, um job legítimo pode perder a renovação do watchdog ou uma aba errada pode ser aceita.

### 161-003 — INTEGRATION_TEST_REQUIRED — OPEN — HIGH

**Encontrado:** esta suíte injeta `armWatchdog` manualmente; não prova o wiring de `background.js` (`routeRegisteredAction → context.armWatchdog → jobsWatchdog.arm`) nem o side effect de renovar `watchdog_<jobId>` e `wd_data_<tabId>`.

**Evidência atual:** há prova isolada da action e provas separadas do lifecycle/watchdog, mas não um caso focal de refresh atravessando o background real.

**Evidência ausente:** carregar `background.js` real, sem substituir `armWatchdog`, enviar `REFRESH_JOB_WATCHDOG` de sender Gemini proprietário e verificar cleanup/criação do alarme, conteúdo de `wd_data_*` e resposta final.

**Risco:** uma quebra no contextFactory ou na fachada `armWatchdog` pode passar nesta suíte mesmo que a renovação real não ocorra.

## 10. Fonte integral auditada

```javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(
  __dirname,
  '../../../extension/background/actions/refresh-job-watchdog.js'
);

function loadRouter() {
  global.self = global;
  global.chrome = {
    runtime: {
      id: 'test-extension-id',
      lastError: null,
    },
  };

  delete global.MangaTranslatorRouter;
  jest.isolateModules(() => {
    require(ROUTER_PATH);
    require(ACTION_PATH);
  });
  return global.MangaTranslatorRouter;
}

function dispatch(listener, request, sender = {
  tab: { id: 321, url: 'https://gemini.google.com/app/test' },
}) {
  return new Promise(resolve => {
    const keepAlive = listener(request, sender, response => {
      resolve({ keepAlive, response });
    });
  });
}

describe('background refresh-job-watchdog action', () => {
  afterEach(() => {
    delete global.MangaTranslatorRouter;
    delete global.chrome;
    delete global.self;
    jest.restoreAllMocks();
  });

  test('WATCHDOG-REFRESH-01: job dono rearma watchdog usando dados canônicos', async () => {
    const router = loadRouter();
    const armWatchdog = jest.fn(async (_mangaTabId, _index, geminiTabId) => geminiTabId);
    const ensureInitialized = jest.fn().mockResolvedValue();
    const log = jest.fn();
    const state = {
      jobIndex: [{
        jobId: 'job-1',
        geminiTabId: 321,
        mangaTabId: 77,
        index: 4,
      }],
    };
    const tabIdentity = {
      resolveCanonicalTabId: jest.fn(async tabId => tabId),
    };

    const listener = router.createMessageRouter({
      contextFactory: () => ({
        state,
        armWatchdog,
        ensureInitialized,
        tabIdentity,
        log,
      }),
    });

    const result = await dispatch(listener, {
      action: 'REFRESH_JOB_WATCHDOG',
      jobId: 'job-1',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 4,
    });

    expect(ensureInitialized).toHaveBeenCalledTimes(1);
    expect(armWatchdog).toHaveBeenCalledWith(77, 4, 321, 'job-1');
    expect(result.response).toEqual(expect.objectContaining({
      ok: true,
      refreshed: true,
      geminiTabId: 321,
    }));
  });

  test('WATCHDOG-REFRESH-02: aba que não possui o job é rejeitada', async () => {
    const router = loadRouter();
    const armWatchdog = jest.fn();
    const listener = router.createMessageRouter({
      contextFactory: () => ({
        state: {
          jobIndex: [{
            jobId: 'job-1',
            geminiTabId: 321,
            mangaTabId: 77,
            index: 4,
          }],
        },
        armWatchdog,
        ensureInitialized: jest.fn().mockResolvedValue(),
        tabIdentity: {
          resolveCanonicalTabId: jest.fn(async tabId => tabId),
        },
        log: jest.fn(),
      }),
    });

    const result = await dispatch(
      listener,
      { action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-1' },
      { tab: { id: 999, url: 'https://gemini.google.com/app/other' } }
    );

    expect(armWatchdog).not.toHaveBeenCalled();
    expect(result.response).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    }));
  });
});
```

## 11. Auditoria linha a linha

### Linha 001

- **Código:** `const path = require('path');`
- **Função:** Importa `path` para construir caminhos absolutos dos módulos reais usados pela suíte.
- **Contexto:** import de path.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`
- **Função:** Constrói caminho absoluto até `extension/background/router.js` ou `refresh-job-watchdog.js`, impedindo que o teste use uma cópia local.
- **Contexto:** resolução dos caminhos reais do router/action.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra explicitamente o teste aos módulos reais.

### Linha 004

- **Código:** `const ACTION_PATH = path.resolve(`
- **Função:** Constrói caminho absoluto até `extension/background/router.js` ou `refresh-job-watchdog.js`, impedindo que o teste use uma cópia local.
- **Contexto:** resolução dos caminhos reais do router/action.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra explicitamente o teste aos módulos reais.

### Linha 005

- **Código:** `  __dirname,`
- **Função:** Constrói caminho absoluto até `extension/background/router.js` ou `refresh-job-watchdog.js`, impedindo que o teste use uma cópia local.
- **Contexto:** resolução dos caminhos reais do router/action.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra explicitamente o teste aos módulos reais.

### Linha 006

- **Código:** `  '../../../extension/background/actions/refresh-job-watchdog.js'`
- **Função:** Constrói caminho absoluto até `extension/background/router.js` ou `refresh-job-watchdog.js`, impedindo que o teste use uma cópia local.
- **Contexto:** resolução dos caminhos reais do router/action.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra explicitamente o teste aos módulos reais.

### Linha 007

- **Código:** `);`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** `function loadRouter() {`
- **Função:** Define o loader que cria o ambiente global mínimo e carrega router + action reais em isolamento Jest.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `  global.self = global;`
- **Função:** Emula o escopo global esperado pelas IIFEs da extensão sob Node/Jest.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `  global.chrome = {`
- **Função:** Monta a porção mínima de `chrome.runtime` necessária ao router para identificar a extensão e erros.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `    runtime: {`
- **Função:** Compõe o bloco **loader isolado do router + action**, preparando, executando ou observando o contrato da action real.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `      id: 'test-extension-id',`
- **Função:** Compõe o bloco **loader isolado do router + action**, preparando, executando ou observando o contrato da action real.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `      lastError: null,`
- **Função:** Compõe o bloco **loader isolado do router + action**, preparando, executando ou observando o contrato da action real.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `  delete global.MangaTranslatorRouter;`
- **Função:** Remove registro global prévio para evitar reutilização de registry entre casos.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Carrega módulos em registry isolado para que `registerAction` execute novamente por teste.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `    require(ROUTER_PATH);`
- **Função:** Carrega o router real, criando `MangaTranslatorRouter` e o registry de actions.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra explicitamente o teste aos módulos reais.

### Linha 021

- **Código:** `    require(ACTION_PATH);`
- **Função:** Carrega a action real, que se registra como `refresh-job-watchdog` no router.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra explicitamente o teste aos módulos reais.

### Linha 022

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `  return global.MangaTranslatorRouter;`
- **Função:** Entrega o router real carregado ao cenário para criar listener de mensagens.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** loader isolado do router + action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `function dispatch(listener, request, sender = {`
- **Função:** Define helper que invoca o listener como `chrome.runtime.onMessage`, preservando sender e callback de resposta.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `  tab: { id: 321, url: 'https://gemini.google.com/app/test' },`
- **Função:** Compõe o bloco **helper de dispatch assíncrono**, preparando, executando ou observando o contrato da action real.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `}) {`
- **Função:** Compõe o bloco **helper de dispatch assíncrono**, preparando, executando ou observando o contrato da action real.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `  return new Promise(resolve => {`
- **Função:** Converte a resposta por callback do router em Promise para assertions sequenciais.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `    const keepAlive = listener(request, sender, response => {`
- **Função:** Executa o listener real e captura o booleano de keep-alive junto da resposta.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; assertions subsequentes verificam o resultado.

### Linha 031

- **Código:** `      resolve({ keepAlive, response });`
- **Função:** Materializa para o teste tanto a política de keep-alive quanto o payload respondido.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** helper de dispatch assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `describe('background refresh-job-watchdog action', () => {`
- **Função:** Abre a suíte dedicada à action de renovação do watchdog.
- **Contexto:** suite/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `  afterEach(() => {`
- **Função:** Inicia teardown que apaga globais e restaura spies após cada cenário.
- **Contexto:** suite/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `    delete global.MangaTranslatorRouter;`
- **Função:** Remove registro global prévio para evitar reutilização de registry entre casos.
- **Contexto:** suite/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `    delete global.chrome;`
- **Função:** Compõe o bloco **suite/teardown**, preparando, executando ou observando o contrato da action real.
- **Contexto:** suite/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `    delete global.self;`
- **Função:** Compõe o bloco **suite/teardown**, preparando, executando ou observando o contrato da action real.
- **Contexto:** suite/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Restaura mocks/spies Jest para isolamento entre os dois cenários.
- **Contexto:** suite/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** suite/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `  test('WATCHDOG-REFRESH-01: job dono rearma watchdog usando dados canônicos', async () => {`
- **Função:** Declara cenário **WATCHDOG-REFRESH-01 — dono válido rearma watchdog**.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `    const router = loadRouter();`
- **Função:** Carrega router e action reais para o cenário atual.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `    const armWatchdog = jest.fn(async (_mangaTabId, _index, geminiTabId) => geminiTabId);`
- **Função:** Cria double observável da dependência `armWatchdog`; a suíte prova os argumentos passados pela action, não a implementação interna do watchdog.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `    const ensureInitialized = jest.fn().mockResolvedValue();`
- **Função:** Cria/fornece a dependência que a action deve aguardar antes de consultar estado durável.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `    const log = jest.fn();`
- **Função:** Cria logger observável; neste arquivo o log de sucesso não recebe assertion focal.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `    const state = {`
- **Função:** Monta o estado durável visível à action, especialmente `jobIndex` com ownership e metadados canônicos.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `      jobIndex: [{`
- **Função:** Define o índice durável pesquisado pela action por `jobId` antes de renovar o watchdog.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `        jobId: 'job-1',`
- **Função:** Usa identidade estável do job para validar ownership e propagação ao watchdog.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `        geminiTabId: 321,`
- **Função:** Fixa a aba Gemini proprietária/canônica usada no cenário de sucesso.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `        mangaTabId: 77,`
- **Função:** Fixa a aba de origem do mangá que deve ser repassada ao watchdog.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `        index: 4,`
- **Função:** Fixa o índice da imagem/job que deve ser repassado ao watchdog e ao log.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `      }],`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `    };`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `    const tabIdentity = {`
- **Função:** Fornece serviço de identidade de aba; neste caso é identidade trivial, sem substituição/rekey.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `      resolveCanonicalTabId: jest.fn(async tabId => tabId),`
- **Função:** Resolve sender e aba indexada para IDs canônicos antes da comparação de ownership.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `    };`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `    const listener = router.createMessageRouter({`
- **Função:** Cria listener real do router com contexto controlado para a action registrada.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `      contextFactory: () => ({`
- **Função:** Injeta estado/dependências do cenário no contexto criado pelo router.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `        state,`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-01 — dono válido rearma watchdog**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `        armWatchdog,`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-01 — dono válido rearma watchdog**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `        ensureInitialized,`
- **Função:** Cria/fornece a dependência que a action deve aguardar antes de consultar estado durável.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `        tabIdentity,`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-01 — dono válido rearma watchdog**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `        log,`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-01 — dono válido rearma watchdog**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `      }),`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `    const result = await dispatch(listener, {`
- **Função:** Dispara `REFRESH_JOB_WATCHDOG` pelo listener real e aguarda resposta assíncrona.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; assertions subsequentes verificam o resultado.

### Linha 072

- **Código:** `      action: 'REFRESH_JOB_WATCHDOG',`
- **Função:** Usa o nome legado mapeado pelo router para `refresh-job-watchdog`.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `      jobId: 'job-1',`
- **Função:** Usa identidade estável do job para validar ownership e propagação ao watchdog.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `      geminiTabId: 321,`
- **Função:** Fixa a aba Gemini proprietária/canônica usada no cenário de sucesso.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `      mangaTabId: 77,`
- **Função:** Fixa a aba de origem do mangá que deve ser repassada ao watchdog.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `      index: 4,`
- **Função:** Fixa o índice da imagem/job que deve ser repassado ao watchdog e ao log.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `    expect(ensureInitialized).toHaveBeenCalledTimes(1);`
- **Função:** Cria/fornece a dependência que a action deve aguardar antes de consultar estado durável.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do cenário.

### Linha 080

- **Código:** `    expect(armWatchdog).toHaveBeenCalledWith(77, 4, 321, 'job-1');`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do cenário.

### Linha 081

- **Código:** `    expect(result.response).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do cenário.

### Linha 082

- **Código:** `      ok: true,`
- **Função:** Exige resposta de sucesso produzida pelo router após a action concluir.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `      refreshed: true,`
- **Função:** Exige flag específica que confirma renovação aceita.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `      geminiTabId: 321,`
- **Função:** Fixa a aba Gemini proprietária/canônica usada no cenário de sucesso.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-01 — dono válido rearma watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `  test('WATCHDOG-REFRESH-02: aba que não possui o job é rejeitada', async () => {`
- **Função:** Declara cenário **WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado**.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `    const router = loadRouter();`
- **Função:** Carrega router e action reais para o cenário atual.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    const armWatchdog = jest.fn();`
- **Função:** Cria double observável da dependência `armWatchdog`; a suíte prova os argumentos passados pela action, não a implementação interna do watchdog.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `    const listener = router.createMessageRouter({`
- **Função:** Cria listener real do router com contexto controlado para a action registrada.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `      contextFactory: () => ({`
- **Função:** Injeta estado/dependências do cenário no contexto criado pelo router.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** `        state: {`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `          jobIndex: [{`
- **Função:** Define o índice durável pesquisado pela action por `jobId` antes de renovar o watchdog.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `            jobId: 'job-1',`
- **Função:** Usa identidade estável do job para validar ownership e propagação ao watchdog.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `            geminiTabId: 321,`
- **Função:** Fixa a aba Gemini proprietária/canônica usada no cenário de sucesso.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `            mangaTabId: 77,`
- **Função:** Fixa a aba de origem do mangá que deve ser repassada ao watchdog.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `            index: 4,`
- **Função:** Fixa o índice da imagem/job que deve ser repassado ao watchdog e ao log.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `          }],`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `        armWatchdog,`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `        ensureInitialized: jest.fn().mockResolvedValue(),`
- **Função:** Cria/fornece a dependência que a action deve aguardar antes de consultar estado durável.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `        tabIdentity: {`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `          resolveCanonicalTabId: jest.fn(async tabId => tabId),`
- **Função:** Resolve sender e aba indexada para IDs canônicos antes da comparação de ownership.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `        log: jest.fn(),`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `      }),`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `    const result = await dispatch(`
- **Função:** Dispara `REFRESH_JOB_WATCHDOG` pelo listener real e aguarda resposta assíncrona.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; assertions subsequentes verificam o resultado.

### Linha 111

- **Código:** `      listener,`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `      { action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-1' },`
- **Função:** Usa identidade estável do job para validar ownership e propagação ao watchdog.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `      { tab: { id: 999, url: 'https://gemini.google.com/app/other' } }`
- **Função:** Usa uma aba Gemini diferente da proprietária para exercitar rejeição de ownership mantendo a origem ainda autorizada como Gemini.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem adicionar comportamento.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `    expect(armWatchdog).not.toHaveBeenCalled();`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do cenário.

### Linha 117

- **Código:** `    expect(result.response).toEqual(expect.objectContaining({`
- **Função:** Assertion focal que transforma o efeito observado em prova automatizada.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do cenário.

### Linha 118

- **Código:** `      ok: false,`
- **Função:** Compõe o bloco **WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado**, preparando, executando ou observando o contrato da action real.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `      error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),`
- **Função:** Prova que a exceção de ownership da action é normalizada pelo router para erro interno assíncrono.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** WATCHDOG-REFRESH-02 — remetente que não possui o job é rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático iniciado anteriormente.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde, sem assertion exclusiva nesta linha.

### Posição 123 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo de forma POSIX e integra o blob textual auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — o conteúdo lido termina em `\n`.

## 12. Conclusão documental

Foram documentadas as **122 linhas textuais** e a posição **123** do newline final. A fonte integral embutida corresponde ao SHA auditado e a força das provas foi separada entre assertions locais, gates estruturais e branches ainda sem teste focal.

A suíte é forte para ownership e contrato de chamada da action, mas não deve ser interpretada como prova integrada do rearmamento físico do watchdog; essa diferença está registrada nas solicitações OPEN acima.

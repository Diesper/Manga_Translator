# Bíblia técnica — tests/unit/content-gemini/deletion.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** c570bbdc340761412746a1347f297c352e2ff1a4  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de exclusão segura/recovery da conversa Gemini  
> **Linhas textuais:** 349  
> **Posições documentais:** 350, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

deletion.test.js valida o controller que exclui a conversa Gemini de forma observável, idempotente e recuperável. O fluxo encontra a conversa atual na sidebar, abre menu, escolhe Excluir, confirma e só declara sucesso quando tanto URL quanto entrada da sidebar deixam de identificar o chat.

A mesma API persiste gemini_delete_recovery_<tabId> para sobreviver a reload e depois reentrega o payload pendente.

## 2. DEL-01/DEL-02 — utilitários defensivos

DEL-01 prova o fallback manual de escape para aspas/backslash quando CSS.escape não é usado. DEL-02 prova que waitForElementToSettle retorna false se o alvo desconecta durante a janela de estabilidade.

## 3. DEL-03/DEL-04 — debug, caminho nominal e idempotência

Em debugMode=true, deleteCurrentConversation retorna true, loga DEBUG_MODE_SKIP e sempre libera deletionInProgress. DEL-04 monta sidebar/menu/dialog reais no JSDOM, simula remoção da row + mudança de pathname e exige todos os cliques, DELETE_OK e lock limpo. Uma segunda chamada não reabre o menu e loga DELETE_ALREADY_CONFIRMED.

## 4. DEL-05/DEL-06 — prova de confirmação e mutex

DEL-05 clica em confirmar mas mantém URL e row; o controller deve terminar false e logar DELETE_ERROR contendo 'não confirmada'. DEL-06 segura a primeira exclusão em um sleep e prova que a segunda chamada retorna false enquanto deletionInProgress permanece true, liberando o lock no finally.

## 5. DEL-07 — persistência do recovery

saveRecovery preserva chatId, delivery e createdAt; readRecovery devolve o mesmo objeto; clearRecovery remove o marker.

## 6. DEL-08 — limite da evidência

O título diz que recovery 'executa exclusão', porém o fixture grava debugMode:true. Assim recoverPending chama deleteCurrentConversation({lockScroll:true}), mas a função retorna imediatamente por DEBUG_MODE_SKIP antes de localizar sidebar, criar scroll lock ou clicar em qualquer elemento. O caso prova marker reconhecido, clearRecovery e sendDelivery uma vez; **não prova exclusão real durante recovery**.

## 7. DEL-09/DEL-10 — fallback de reload e no-op

Com DOM vazio, deleteOrScheduleRecovery falha em excluir, persiste o recovery antes do reload e retorna deleted:false/recoverySaved:true/reloadScheduled:true. Sem marker, recoverPending retorna handled:false/deleted:false/recovery:null e não entrega nada.

## 8. Risco de durabilidade no replay

Na implementação atual recoverPending executa deleteCurrentConversation, depois clearRecovery(tabId) e somente então await sendDelivery(recovery.delivery). Se sendDelivery lançar/rejeitar, o marker já foi removido. No wiring do job-runner, sendDelivery chama runtime.sendMessage(delivery) sem ACK. A suíte não cobre falha/ausência de entrega nesse intervalo.

## 9. Storage errors

storageSet/storageRemove convertem chrome.runtime.lastError, Promise rejection e throw em rejeição. Os casos atuais usam storage saudável; não provam que deleteOrScheduleRecovery evita reload quando saveRecovery falha nem o comportamento de recoverPending se clearRecovery falha.

## 10. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob c570bbdc340761412746a1347f297c352e2ff1a4. Os 10 casos DEL-01..DEL-10 aparecem com ✓ em Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 11. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| escape manual de seletor | DEL-01 | ✅ PROVADO DIRETAMENTE |
| alvo desconectado não estabiliza | DEL-02 | ✅ PROVADO DIRETAMENTE |
| debug preserva conversa e libera lock | DEL-03 | ✅ PROVADO DIRETAMENTE |
| exclusão nominal exige sidebar/menu/dialog/URL+row | DEL-04 | ✅ PROVADO DIRETAMENTE |
| clique sem remoção real não é sucesso | DEL-05 | ✅ PROVADO DIRETAMENTE |
| exclusões concorrentes são serializadas | DEL-06 | ✅ PROVADO DIRETAMENTE |
| save/read/clear recovery | DEL-07 | ✅ PROVADO DIRETAMENTE |
| recovery limpa marker e entrega uma vez em debug | DEL-08 | ✅ PROVADO DIRETAMENTE |
| recovery executa exclusão DOM real com lockScroll | DEL-08 usa DEBUG_MODE_SKIP | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falha salva marker antes do reload | DEL-09 | ✅ PROVADO DIRETAMENTE |
| marker ausente é no-op | DEL-10 | ✅ PROVADO DIRETAMENTE |
| sendDelivery falha após clearRecovery | sem caso focal; ordem atual remove marker antes | ⚠️ RISCO DE DURABILIDADE |
| storage.set/remove falham | branches reais, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 12. Solicitações ao auditor

### 176-001 — TEST_REQUIRED — OPEN — HIGH

Encontrado: DEL-08 chama recoverPending com debugMode:true, então deleteCurrentConversation sai por DEBUG_MODE_SKIP. O caso não prova exclusão real nem lockScroll apesar do título.

Evidência ausente: recovery com debugMode=false + DOM nominal, lockScroll:true, confirmação real, marker removido e sendDelivery exatamente uma vez; idealmente verificar listeners de wheel/touchmove/scroll removidos no finally.

Risco: o caminho de recovery pós-reload pode quebrar no DOM/scroll lock sem afetar DEL-08.

### 176-002 — DURABILITY_REVIEW — OPEN — HIGH

Encontrado: recoverPending remove o marker com clearRecovery antes de await sendDelivery. Se sendDelivery falhar/rejeitar, o replay desaparece; no job-runner a entrega é runtime.sendMessage sem ACK explícito.

Evidência ausente: sendDelivery rejeitando/lançando e definição do contrato desejado (manter marker até entrega confirmada, mover clear para depois, ou aceitar at-most-once deliberadamente).

Risco: resultado/erro recuperado pode ser perdido definitivamente após reload.

### 176-003 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: storageSet/storageRemove possuem tratamento de chrome.runtime.lastError, Promise rejection e throw, mas nenhuma fixture força falha de persistência/remoção.

Evidência ausente: saveRecovery falhando deve impedir reload; clearRecovery falhando em recoverPending deve ter comportamento explícito e não mascarar erro. Cobrir callback lastError e Promise rejection.

Risco: reload pode ocorrer sem marker durável ou recovery pode ficar em estado parcialmente limpo.

## 13. Fonte integral auditada

```javascript
'use strict';

const path = require('path');
const { getStorageMock } = require('../../mocks/chrome-api.mock.js');

const DELETION_PATH = path.resolve(
  __dirname,
  '../../../extension/content/gemini/deletion.js'
);

function loadModule() {
  let api;
  jest.isolateModules(() => {
    api = require(DELETION_PATH);
  });
  return api;
}

function visibleRect(element, width = 180, height = 36) {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() { return this; },
  });
  return element;
}

function createPageWindow(pathname = '/app/chat-1') {
  return {
    location: {
      pathname,
      reload: jest.fn(),
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
}

function mountSuccessfulDeletionDom() {
  const sidebar = document.createElement('div');
  const row = document.createElement('div');

  const link = visibleRect(document.createElement('a'));
  link.href = '/app/chat-1';
  link.scrollIntoView = jest.fn();

  const options = document.createElement('button');
  options.setAttribute('aria-haspopup', 'menu');

  const confirm = visibleRect(document.createElement('button'));
  confirm.textContent = 'Excluir';
  confirm.click = jest.fn();

  const deleteItem = visibleRect(document.createElement('div'));
  deleteItem.setAttribute('role', 'menuitem');
  deleteItem.textContent = 'Excluir';
  deleteItem.click = jest.fn(() => {
    if (document.querySelector('[role="dialog"]')) return;
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.appendChild(confirm);
    document.body.appendChild(dialog);
  });

  options.click = jest.fn(() => {
    if (document.querySelector('[role="menu"]')) return;
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);
  });

  row.append(link, options);
  sidebar.appendChild(row);
  document.body.appendChild(sidebar);

  return { link, options, deleteItem, confirm, row };
}

describe('gemini/deletion.js', () => {
  let storage;

  beforeEach(async () => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    storage = getStorageMock();
    await storage.clear();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await storage.clear();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('DEL-01: escape mantém seletor seguro sem CSS.escape', () => {
    const { createDeletionController } = loadModule();
    const controller = createDeletionController({
      root: document,
      pageWindow: createPageWindow(),
      storage,
      sleep: async () => {},
    });

    expect(controller.escapeCssAttributeValue('chat-1')).toBe('chat-1');
    expect(controller.escapeCssAttributeValue('chat"1\\x')).toBe('chat\\"1\\\\x');
  });

  test('DEL-02: waitForElementToSettle falha se o alvo desconecta', async () => {
    const { createDeletionController } = loadModule();
    const element = visibleRect(document.createElement('div'));
    document.body.appendChild(element);

    let calls = 0;
    const controller = createDeletionController({
      root: document,
      pageWindow: createPageWindow(),
      storage,
      sleep: async () => {
        calls += 1;
        if (calls === 1) element.remove();
      },
    });

    await expect(
      controller.waitForElementToSettle(element, 3, 1)
    ).resolves.toBe(false);
  });

  test('DEL-03: modo debug preserva a conversa e limpa o lock idempotente', async () => {
    const { createDeletionController } = loadModule();
    await storage.set({ debugMode: true });
    const logs = [];

    const controller = createDeletionController({
      root: document,
      pageWindow: createPageWindow(),
      storage,
      sleep: async () => {},
      sendLog: (...args) => logs.push(args),
    });

    await expect(controller.deleteCurrentConversation()).resolves.toBe(true);
    expect(controller.isDeletionInProgress()).toBe(false);
    expect(logs.some(([, action]) => action === 'DEBUG_MODE_SKIP')).toBe(true);
  });

  test('DEL-04: exclusão completa usa a linha do chat atual, menu e confirmação', async () => {
    const { createDeletionController } = loadModule();
    const dom = mountSuccessfulDeletionDom();
    const pageWindow = createPageWindow('/app/chat-1');
    dom.confirm.click = jest.fn(() => {
      dom.row.remove();
      pageWindow.location.pathname = '/app';
    });
    const logs = [];

    const controller = createDeletionController({
      root: document,
      pageWindow,
      storage,
      sleep: async () => {},
      sendLog: (...args) => logs.push(args),
    });

    await expect(controller.deleteCurrentConversation()).resolves.toBe(true);

    expect(dom.link.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(dom.options.click).toHaveBeenCalledTimes(1);
    expect(dom.deleteItem.click).toHaveBeenCalledTimes(1);
    expect(dom.confirm.click).toHaveBeenCalledTimes(1);
    expect(controller.isDeletionInProgress()).toBe(false);
    expect(logs.some(([, action]) => action === 'DELETE_OK')).toBe(true);

    await expect(controller.deleteCurrentConversation()).resolves.toBe(true);
    expect(dom.options.click).toHaveBeenCalledTimes(1);
    expect(logs.some(([, action]) => action === 'DELETE_ALREADY_CONFIRMED')).toBe(true);
  });

  test('DEL-05: clique sem mudança de URL e sidebar não declara exclusão', async () => {
    const { createDeletionController } = loadModule();
    const dom = mountSuccessfulDeletionDom();
    const logs = [];
    let clock = 0;
    const controller = createDeletionController({
      root: document,
      pageWindow: createPageWindow('/app/chat-1'),
      storage,
      now: () => clock,
      sleep: async ms => { clock += Number(ms) || 0; },
      sendLog: (...args) => logs.push(args),
    });

    await expect(controller.deleteCurrentConversation()).resolves.toBe(false);

    expect(dom.confirm.click).toHaveBeenCalledTimes(1);
    expect(dom.row.isConnected).toBe(true);
    expect(logs.some(([, action, detail]) =>
      action === 'DELETE_ERROR' && detail.includes('não confirmada')
    )).toBe(true);
  });

  test('DEL-06: segunda exclusão concorrente é recusada enquanto a primeira está ativa', async () => {
    const { createDeletionController } = loadModule();

    let releaseFirstSleep;
    let firstSleep = true;
    const blockingSleep = () => {
      if (!firstSleep) return Promise.resolve();
      firstSleep = false;
      return new Promise(resolve => { releaseFirstSleep = resolve; });
    };

    const immediateStorage = {
      get(_keys, callback) { callback({ debugMode: false }); },
      set(_items, callback) { callback?.(); },
      remove(_keys, callback) { callback?.(); },
    };

    const controller = createDeletionController({
      root: document,
      pageWindow: createPageWindow('/app/chat-1'),
      storage: immediateStorage,
      sleep: blockingSleep,
    });

    const first = controller.deleteCurrentConversation();
    await Promise.resolve();

    await expect(controller.deleteCurrentConversation()).resolves.toBe(false);
    expect(controller.isDeletionInProgress()).toBe(true);

    releaseFirstSleep();
    await expect(first).resolves.toBe(false);
    expect(controller.isDeletionInProgress()).toBe(false);
  });

  test('DEL-07: save/read/clear recovery preserva entrega e chatId', async () => {
    const { createDeletionController } = loadModule();
    const pageWindow = createPageWindow('/app/chat-abc');
    const controller = createDeletionController({
      root: document,
      pageWindow,
      storage,
      sleep: async () => {},
      now: () => 123456,
    });

    const delivery = { action: 'GEMINI_IMAGE_EXTRACTED', jobId: 'job-1' };
    const saved = await controller.saveRecovery(77, delivery);

    expect(saved).toEqual({
      chatId: 'chat-abc',
      delivery,
      createdAt: 123456,
    });
    await expect(controller.readRecovery(77)).resolves.toEqual(saved);

    await controller.clearRecovery(77);
    await expect(controller.readRecovery(77)).resolves.toBeNull();
  });

  test('DEL-08: recovery executa exclusão, limpa marker e entrega uma única vez', async () => {
    const { createDeletionController } = loadModule();
    const pageWindow = createPageWindow('/app/chat-1');
    await storage.set({
      debugMode: true,
      gemini_delete_recovery_88: {
        chatId: 'chat-1',
        delivery: { action: 'GEMINI_ERROR', jobId: 'job-r' },
        createdAt: 1,
      },
    });

    const sendDelivery = jest.fn(async () => {});
    const controller = createDeletionController({
      root: document,
      pageWindow,
      storage,
      sleep: async () => {},
    });

    const result = await controller.recoverPending({
      tabId: 88,
      sendDelivery,
    });

    expect(result.handled).toBe(true);
    expect(result.deleted).toBe(true);
    expect(sendDelivery).toHaveBeenCalledTimes(1);
    await expect(controller.readRecovery(88)).resolves.toBeNull();
  });

  test('DEL-09: falha de exclusão persiste recovery antes de recarregar', async () => {
    const { createDeletionController } = loadModule();
    const pageWindow = createPageWindow('/app/chat-1');
    const controller = createDeletionController({
      root: document,
      pageWindow,
      storage,
      sleep: async () => {},
      now: () => 42,
    });

    const delivery = { action: 'GEMINI_RESULT_URL', jobId: 'job-fallback' };
    const result = await controller.deleteOrScheduleRecovery({
      tabId: 99,
      delivery,
    });

    expect(result).toEqual({
      deleted: false,
      recoverySaved: true,
      reloadScheduled: true,
    });
    await expect(controller.readRecovery(99)).resolves.toEqual({
      chatId: 'chat-1',
      delivery,
      createdAt: 42,
    });
    expect(pageWindow.location.reload).toHaveBeenCalledTimes(1);
  });

  test('DEL-10: recovery inexistente não apaga nem entrega nada', async () => {
    const { createDeletionController } = loadModule();
    const sendDelivery = jest.fn();
    const controller = createDeletionController({
      root: document,
      pageWindow: createPageWindow(),
      storage,
      sleep: async () => {},
    });

    await expect(controller.recoverPending({
      tabId: 100,
      sendDelivery,
    })).resolves.toEqual({
      handled: false,
      deleted: false,
      recovery: null,
    });
    expect(sendDelivery).not.toHaveBeenCalled();
  });
});
```

## 14. Auditoria linha a linha

### Linha 001

- **Código:** `'use strict';`
- **Função:** Ativa strict mode.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver deletion.js real.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** `const { getStorageMock } = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa ChromeStorageMock compartilhado.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `const DELETION_PATH = path.resolve(`
- **Função:** Resolve caminho absoluto de extension/content/gemini/deletion.js.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte a deletion.js real.

### Linha 007

- **Código:** `  __dirname,`
- **Função:** Resolve caminho absoluto de extension/content/gemini/deletion.js.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte a deletion.js real.

### Linha 008

- **Código:** `  '../../../extension/content/gemini/deletion.js'`
- **Função:** Resolve caminho absoluto de extension/content/gemini/deletion.js.
- **Contexto:** imports e path do módulo real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte a deletion.js real.

### Linha 009

- **Código:** `);`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loader deletion.js.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `function loadModule() {`
- **Função:** Carrega deletion.js real em isolamento Jest e devolve sua API.
- **Contexto:** loader deletion.js.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `  let api;`
- **Função:** Compõe o cenário loader deletion.js, preparando ou verificando deletion.js real.
- **Contexto:** loader deletion.js.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Compõe o cenário loader deletion.js, preparando ou verificando deletion.js real.
- **Contexto:** loader deletion.js.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `    api = require(DELETION_PATH);`
- **Função:** Executa a implementação real de deletion.js.
- **Contexto:** loader deletion.js.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte a deletion.js real.

### Linha 015

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader deletion.js.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `  return api;`
- **Função:** Compõe o cenário loader deletion.js, preparando ou verificando deletion.js real.
- **Contexto:** loader deletion.js.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `function visibleRect(element, width = 180, height = 36) {`
- **Função:** Torna elemento geometricamente visível/estável para os seletores e waitForElementToSettle.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `  element.getBoundingClientRect = () => ({`
- **Função:** Fornece retângulo determinístico ao algoritmo de estabilização.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `    x: 0,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `    y: 0,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `    top: 0,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `    left: 0,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `    right: width,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `    bottom: height,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `    width,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `    height,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    toJSON() { return this; },`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `  return element;`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando deletion.js real.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `function createPageWindow(pathname = '/app/chat-1') {`
- **Função:** Cria window mínimo com pathname/reload/listeners observáveis.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `  return {`
- **Função:** Compõe o cenário mock pageWindow, preparando ou verificando deletion.js real.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `    location: {`
- **Função:** Compõe o cenário mock pageWindow, preparando ou verificando deletion.js real.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `      pathname,`
- **Função:** Fixa pathname usado para extrair chatId e verificar exclusão.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `      reload: jest.fn(),`
- **Função:** Permite provar reload após salvar recovery.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `    addEventListener: jest.fn(),`
- **Função:** Compõe o cenário mock pageWindow, preparando ou verificando deletion.js real.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `    removeEventListener: jest.fn(),`
- **Função:** Compõe o cenário mock pageWindow, preparando ou verificando deletion.js real.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `function mountSuccessfulDeletionDom() {`
- **Função:** Monta sidebar/row/link/menu/delete/confirm usados pelo caminho nominal.
- **Contexto:** mock pageWindow.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `  const sidebar = document.createElement('div');`
- **Função:** Cria container da barra lateral.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `  const row = document.createElement('div');`
- **Função:** Cria linha correspondente à conversa atual.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `  const link = visibleRect(document.createElement('a'));`
- **Função:** Cria link da conversa /app/chat-1 e o torna visível.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `  link.href = '/app/chat-1';`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `  link.scrollIntoView = jest.fn();`
- **Função:** Espiona scroll até a conversa alvo.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `  const options = document.createElement('button');`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `  options.setAttribute('aria-haspopup', 'menu');`
- **Função:** Marca botão de opções como menu trigger reconhecível.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `  const confirm = visibleRect(document.createElement('button'));`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `  confirm.textContent = 'Excluir';`
- **Função:** Define rótulo Excluir no botão de confirmação.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `  confirm.click = jest.fn();`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `  const deleteItem = visibleRect(document.createElement('div'));`
- **Função:** Cria item Excluir dentro do menu.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `  deleteItem.setAttribute('role', 'menuitem');`
- **Função:** Cria item Excluir dentro do menu.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `  deleteItem.textContent = 'Excluir';`
- **Função:** Cria item Excluir dentro do menu.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `  deleteItem.click = jest.fn(() => {`
- **Função:** Cria item Excluir dentro do menu.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `    if (document.querySelector('[role="dialog"]')) return;`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `    const dialog = document.createElement('div');`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `    dialog.setAttribute('role', 'dialog');`
- **Função:** Cria diálogo reconhecido por findConfirmButtonCandidate.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `    dialog.appendChild(confirm);`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `    document.body.appendChild(dialog);`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `  options.click = jest.fn(() => {`
- **Função:** Ao clicar no botão, monta menu com item Excluir.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `    if (document.querySelector('[role="menu"]')) return;`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `    const menu = document.createElement('div');`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `    menu.setAttribute('role', 'menu');`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `    menu.appendChild(deleteItem);`
- **Função:** Cria item Excluir dentro do menu.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `    document.body.appendChild(menu);`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `  row.append(link, options);`
- **Função:** Agrupa link e botão de opções na linha.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `  sidebar.appendChild(row);`
- **Função:** Compõe o cenário fixture DOM de exclusão bem-sucedida, preparando ou verificando deletion.js real.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `  document.body.appendChild(sidebar);`
- **Função:** Conecta a fixture ao documento.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `  return { link, options, deleteItem, confirm, row };`
- **Função:** Cria item Excluir dentro do menu.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture DOM de exclusão bem-sucedida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `describe('gemini/deletion.js', () => {`
- **Função:** Abre suíte focal de deletion.js.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `  let storage;`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando deletion.js real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `  beforeEach(async () => {`
- **Função:** Limpa DOM/storage antes do cenário.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando deletion.js real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `    storage = getStorageMock();`
- **Função:** Obtém storage mock usado pelos recovery markers e debugMode.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `    await storage.clear();`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando deletion.js real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `  afterEach(async () => {`
- **Função:** Restaura mocks, storage e DOM após cada caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Restaura spies Jest.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `    await storage.clear();`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando deletion.js real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando deletion.js real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `  test('DEL-01: escape mantém seletor seguro sem CSS.escape', () => {`
- **Função:** Declara cenário: DEL-01 — escape CSS fallback.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-01 — escape CSS fallback, preparando ou verificando deletion.js real.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `      pageWindow: createPageWindow(),`
- **Função:** Compõe o cenário DEL-01 — escape CSS fallback, preparando ou verificando deletion.js real.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-01 — escape CSS fallback, preparando ou verificando deletion.js real.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário DEL-01 — escape CSS fallback, preparando ou verificando deletion.js real.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `    expect(controller.escapeCssAttributeValue('chat-1')).toBe('chat-1');`
- **Função:** Exercita escape de chatId para seletor CSS.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 111

- **Código:** `    expect(controller.escapeCssAttributeValue('chat"1\\x')).toBe('chat\\"1\\\\x');`
- **Função:** Exercita escape de chatId para seletor CSS.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 112

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-01 — escape CSS fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `  test('DEL-02: waitForElementToSettle falha se o alvo desconecta', async () => {`
- **Função:** Declara cenário: DEL-02 — elemento desconectado não estabiliza.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 115

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `    const element = visibleRect(document.createElement('div'));`
- **Função:** Cria alvo inicialmente conectado/estável.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `    document.body.appendChild(element);`
- **Função:** Compõe o cenário DEL-02 — elemento desconectado não estabiliza, preparando ou verificando deletion.js real.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `    let calls = 0;`
- **Função:** Conta sleeps para remover o alvo após a primeira amostra.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-02 — elemento desconectado não estabiliza, preparando ou verificando deletion.js real.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `      pageWindow: createPageWindow(),`
- **Função:** Compõe o cenário DEL-02 — elemento desconectado não estabiliza, preparando ou verificando deletion.js real.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-02 — elemento desconectado não estabiliza, preparando ou verificando deletion.js real.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `      sleep: async () => {`
- **Função:** Compõe o cenário DEL-02 — elemento desconectado não estabiliza, preparando ou verificando deletion.js real.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** `        calls += 1;`
- **Função:** Compõe o cenário DEL-02 — elemento desconectado não estabiliza, preparando ou verificando deletion.js real.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `        if (calls === 1) element.remove();`
- **Função:** Desconecta o alvo durante estabilização.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 131

- **Código:** `      controller.waitForElementToSettle(element, 3, 1)`
- **Função:** Executa algoritmo real de estabilidade.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 132

- **Código:** `    ).resolves.toBe(false);`
- **Função:** Compõe o cenário DEL-02 — elemento desconectado não estabiliza, preparando ou verificando deletion.js real.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 133

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-02 — elemento desconectado não estabiliza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `  test('DEL-03: modo debug preserva a conversa e limpa o lock idempotente', async () => {`
- **Função:** Declara cenário: DEL-03 — debug mode.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `    await storage.set({ debugMode: true });`
- **Função:** Ativa caminho de preservação da conversa sem exclusão.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `    const logs = [];`
- **Função:** Coleta eventos de log do controller.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-03 — debug mode, preparando ou verificando deletion.js real.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `      pageWindow: createPageWindow(),`
- **Função:** Compõe o cenário DEL-03 — debug mode, preparando ou verificando deletion.js real.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-03 — debug mode, preparando ou verificando deletion.js real.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário DEL-03 — debug mode, preparando ou verificando deletion.js real.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `      sendLog: (...args) => logs.push(args),`
- **Função:** Injeta coletor de observabilidade.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `    await expect(controller.deleteCurrentConversation()).resolves.toBe(true);`
- **Função:** Executa fluxo real de exclusão/mutex/debug/idempotência.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 149

- **Código:** `    expect(controller.isDeletionInProgress()).toBe(false);`
- **Função:** Observa lock interno de exclusão.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 150

- **Código:** `    expect(logs.some(([, action]) => action === 'DEBUG_MODE_SKIP')).toBe(true);`
- **Função:** Exige log específico do early-return de debug.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 151

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-03 — debug mode.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `  test('DEL-04: exclusão completa usa a linha do chat atual, menu e confirmação', async () => {`
- **Função:** Declara cenário: DEL-04 — exclusão completa e idempotência.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `    const dom = mountSuccessfulDeletionDom();`
- **Função:** Monta DOM que permite seguir menu/confirm nominal.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `    const pageWindow = createPageWindow('/app/chat-1');`
- **Função:** Compõe o cenário DEL-04 — exclusão completa e idempotência, preparando ou verificando deletion.js real.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `    dom.confirm.click = jest.fn(() => {`
- **Função:** Sobrescreve confirmação para remover row e mudar URL, simulando exclusão comprovada.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `      dom.row.remove();`
- **Função:** Compõe o cenário DEL-04 — exclusão completa e idempotência, preparando ou verificando deletion.js real.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `      pageWindow.location.pathname = '/app';`
- **Função:** Simula navegação para fora do chat após confirmação.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `    const logs = [];`
- **Função:** Coleta eventos de log do controller.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-04 — exclusão completa e idempotência, preparando ou verificando deletion.js real.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `      pageWindow,`
- **Função:** Compõe o cenário DEL-04 — exclusão completa e idempotência, preparando ou verificando deletion.js real.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-04 — exclusão completa e idempotência, preparando ou verificando deletion.js real.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário DEL-04 — exclusão completa e idempotência, preparando ou verificando deletion.js real.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `      sendLog: (...args) => logs.push(args),`
- **Função:** Injeta coletor de observabilidade.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `    await expect(controller.deleteCurrentConversation()).resolves.toBe(true);`
- **Função:** Executa fluxo real de exclusão/mutex/debug/idempotência.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 172

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `    expect(dom.link.scrollIntoView).toHaveBeenCalledTimes(1);`
- **Função:** Espiona scroll até a conversa alvo.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 174

- **Código:** `    expect(dom.options.click).toHaveBeenCalledTimes(1);`
- **Função:** Ao clicar no botão, monta menu com item Excluir.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 175

- **Código:** `    expect(dom.deleteItem.click).toHaveBeenCalledTimes(1);`
- **Função:** Cria item Excluir dentro do menu.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 176

- **Código:** `    expect(dom.confirm.click).toHaveBeenCalledTimes(1);`
- **Função:** Exige cardinalidade exata do clique/entrega indicado.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 177

- **Código:** `    expect(controller.isDeletionInProgress()).toBe(false);`
- **Função:** Observa lock interno de exclusão.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 178

- **Código:** `    expect(logs.some(([, action]) => action === 'DELETE_OK')).toBe(true);`
- **Função:** Exige observabilidade de exclusão confirmada.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 179

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `    await expect(controller.deleteCurrentConversation()).resolves.toBe(true);`
- **Função:** Executa fluxo real de exclusão/mutex/debug/idempotência.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 181

- **Código:** `    expect(dom.options.click).toHaveBeenCalledTimes(1);`
- **Função:** Ao clicar no botão, monta menu com item Excluir.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 182

- **Código:** `    expect(logs.some(([, action]) => action === 'DELETE_ALREADY_CONFIRMED')).toBe(true);`
- **Função:** Prova idempotência por lastDeletedChatId em segunda chamada.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 183

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-04 — exclusão completa e idempotência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `  test('DEL-05: clique sem mudança de URL e sidebar não declara exclusão', async () => {`
- **Função:** Declara cenário: DEL-05 — confirmação real exigida.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `    const dom = mountSuccessfulDeletionDom();`
- **Função:** Monta DOM que permite seguir menu/confirm nominal.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** `    const logs = [];`
- **Função:** Coleta eventos de log do controller.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `    let clock = 0;`
- **Função:** Cria relógio determinístico para timeout de verificação.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-05 — confirmação real exigida, preparando ou verificando deletion.js real.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `      pageWindow: createPageWindow('/app/chat-1'),`
- **Função:** Compõe o cenário DEL-05 — confirmação real exigida, preparando ou verificando deletion.js real.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-05 — confirmação real exigida, preparando ou verificando deletion.js real.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `      now: () => clock,`
- **Função:** Injeta relógio controlado no controller.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `      sleep: async ms => { clock += Number(ms) || 0; },`
- **Função:** Avança relógio sem esperar tempo real.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** `      sendLog: (...args) => logs.push(args),`
- **Função:** Injeta coletor de observabilidade.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** `    await expect(controller.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:** Executa fluxo real de exclusão/mutex/debug/idempotência.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 200

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 201

- **Código:** `    expect(dom.confirm.click).toHaveBeenCalledTimes(1);`
- **Função:** Exige cardinalidade exata do clique/entrega indicado.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 202

- **Código:** `    expect(dom.row.isConnected).toBe(true);`
- **Função:** Assertion focal do contrato.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 203

- **Código:** `    expect(logs.some(([, action, detail]) =>`
- **Função:** Assertion focal do contrato.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 204

- **Código:** `      action === 'DELETE_ERROR' && detail.includes('não confirmada')`
- **Função:** Exige log de falha quando URL/sidebar continuam presentes.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** `    )).toBe(true);`
- **Função:** Compõe o cenário DEL-05 — confirmação real exigida, preparando ou verificando deletion.js real.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 206

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-05 — confirmação real exigida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `  test('DEL-06: segunda exclusão concorrente é recusada enquanto a primeira está ativa', async () => {`
- **Função:** Declara cenário: DEL-06 — mutex de exclusão.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 209

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `    let releaseFirstSleep;`
- **Função:** Cria barreira que mantém primeira exclusão em andamento.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 212

- **Código:** `    let firstSleep = true;`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** `    const blockingSleep = () => {`
- **Função:** Bloqueia apenas o primeiro sleep para testar mutex concorrente.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** `      if (!firstSleep) return Promise.resolve();`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `      firstSleep = false;`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** `      return new Promise(resolve => { releaseFirstSleep = resolve; });`
- **Função:** Cria barreira que mantém primeira exclusão em andamento.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** `    };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 218

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** `    const immediateStorage = {`
- **Função:** Fornece storage callback imediato para isolar concorrência.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `      get(_keys, callback) { callback({ debugMode: false }); },`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** `      set(_items, callback) { callback?.(); },`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** `      remove(_keys, callback) { callback?.(); },`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 223

- **Código:** `    };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 224

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 225

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `      pageWindow: createPageWindow('/app/chat-1'),`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** `      storage: immediateStorage,`
- **Função:** Fornece storage callback imediato para isolar concorrência.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 229

- **Código:** `      sleep: blockingSleep,`
- **Função:** Bloqueia apenas o primeiro sleep para testar mutex concorrente.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 231

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `    const first = controller.deleteCurrentConversation();`
- **Função:** Executa fluxo real de exclusão/mutex/debug/idempotência.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 233

- **Código:** `    await Promise.resolve();`
- **Função:** Compõe o cenário DEL-06 — mutex de exclusão, preparando ou verificando deletion.js real.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 235

- **Código:** `    await expect(controller.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:** Executa fluxo real de exclusão/mutex/debug/idempotência.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 236

- **Código:** `    expect(controller.isDeletionInProgress()).toBe(true);`
- **Função:** Observa lock interno de exclusão.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 237

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** `    releaseFirstSleep();`
- **Função:** Cria barreira que mantém primeira exclusão em andamento.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `    await expect(first).resolves.toBe(false);`
- **Função:** Assertion focal do contrato.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 240

- **Código:** `    expect(controller.isDeletionInProgress()).toBe(false);`
- **Função:** Observa lock interno de exclusão.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 241

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-06 — mutex de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 242

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** `  test('DEL-07: save/read/clear recovery preserva entrega e chatId', async () => {`
- **Função:** Declara cenário: DEL-07 — save/read/clear recovery.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `    const pageWindow = createPageWindow('/app/chat-abc');`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** `      pageWindow,`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** `      now: () => 123456,`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `    const delivery = { action: 'GEMINI_IMAGE_EXTRACTED', jobId: 'job-1' };`
- **Função:** Define payload que deve sobreviver ao recovery.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 255

- **Código:** `    const saved = await controller.saveRecovery(77, delivery);`
- **Função:** Persiste marker de recovery real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 256

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** `    expect(saved).toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 258

- **Código:** `      chatId: 'chat-abc',`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 259

- **Código:** `      delivery,`
- **Função:** Compõe o cenário DEL-07 — save/read/clear recovery, preparando ou verificando deletion.js real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 260

- **Código:** `      createdAt: 123456,`
- **Função:** Fixa timestamp determinístico do recovery.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 261

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 262

- **Código:** `    await expect(controller.readRecovery(77)).resolves.toEqual(saved);`
- **Função:** Relê marker persistido pelo controller real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 263

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 264

- **Código:** `    await controller.clearRecovery(77);`
- **Função:** Remove marker persistido.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 265

- **Código:** `    await expect(controller.readRecovery(77)).resolves.toBeNull();`
- **Função:** Relê marker persistido pelo controller real.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 266

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-07 — save/read/clear recovery.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 267

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 268

- **Código:** `  test('DEL-08: recovery executa exclusão, limpa marker e entrega uma única vez', async () => {`
- **Função:** Declara cenário: DEL-08 — recoverPending com debug skip.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 269

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 270

- **Código:** `    const pageWindow = createPageWindow('/app/chat-1');`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 271

- **Código:** `    await storage.set({`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 272

- **Código:** `      debugMode: true,`
- **Função:** Ativa caminho de preservação da conversa sem exclusão.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 273

- **Código:** `      gemini_delete_recovery_88: {`
- **Função:** Prepara recovery pendente para tab 88.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 274

- **Código:** `        chatId: 'chat-1',`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `        delivery: { action: 'GEMINI_ERROR', jobId: 'job-r' },`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 276

- **Código:** `        createdAt: 1,`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 277

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 278

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 280

- **Código:** `    const sendDelivery = jest.fn(async () => {});`
- **Função:** Injeta função observável que entrega payload recuperado.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 281

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 282

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 283

- **Código:** `      pageWindow,`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 284

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 285

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 287

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `    const result = await controller.recoverPending({`
- **Função:** Executa replay real do recovery.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 289

- **Código:** `      tabId: 88,`
- **Função:** Compõe o cenário DEL-08 — recoverPending com debug skip, preparando ou verificando deletion.js real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** `      sendDelivery,`
- **Função:** Injeta função observável que entrega payload recuperado.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 292

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 293

- **Código:** `    expect(result.handled).toBe(true);`
- **Função:** Exige que marker existente seja reconhecido.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 294

- **Código:** `    expect(result.deleted).toBe(true);`
- **Função:** Observa resultado de deleteCurrentConversation dentro do recovery.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 295

- **Código:** `    expect(sendDelivery).toHaveBeenCalledTimes(1);`
- **Função:** Exige cardinalidade exata do clique/entrega indicado.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 296

- **Código:** `    await expect(controller.readRecovery(88)).resolves.toBeNull();`
- **Função:** Relê marker persistido pelo controller real.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 297

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-08 — recoverPending com debug skip.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 298

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 299

- **Código:** `  test('DEL-09: falha de exclusão persiste recovery antes de recarregar', async () => {`
- **Função:** Declara cenário: DEL-09 — falha salva recovery e recarrega.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 300

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 301

- **Código:** `    const pageWindow = createPageWindow('/app/chat-1');`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 302

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 303

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 304

- **Código:** `      pageWindow,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 307

- **Código:** `      now: () => 42,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 309

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 310

- **Código:** `    const delivery = { action: 'GEMINI_RESULT_URL', jobId: 'job-fallback' };`
- **Função:** Define payload que deve sobreviver ao recovery.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 311

- **Código:** `    const result = await controller.deleteOrScheduleRecovery({`
- **Função:** Executa estratégia real delete→saveRecovery→reload quando delete falha.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 312

- **Código:** `      tabId: 99,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 313

- **Código:** `      delivery,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 314

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 316

- **Código:** `    expect(result).toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 317

- **Código:** `      deleted: false,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** `      recoverySaved: true,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 319

- **Código:** `      reloadScheduled: true,`
- **Função:** Observa se reload foi agendado/executado.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 320

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 321

- **Código:** `    await expect(controller.readRecovery(99)).resolves.toEqual({`
- **Função:** Relê marker persistido pelo controller real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 322

- **Código:** `      chatId: 'chat-1',`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 323

- **Código:** `      delivery,`
- **Função:** Compõe o cenário DEL-09 — falha salva recovery e recarrega, preparando ou verificando deletion.js real.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 324

- **Código:** `      createdAt: 42,`
- **Função:** Fixa timestamp determinístico do recovery.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 326

- **Código:** `    expect(pageWindow.location.reload).toHaveBeenCalledTimes(1);`
- **Função:** Exige cardinalidade exata do clique/entrega indicado.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 327

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-09 — falha salva recovery e recarrega.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 328

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 329

- **Código:** `  test('DEL-10: recovery inexistente não apaga nem entrega nada', async () => {`
- **Função:** Declara cenário: DEL-10 — recovery inexistente.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 330

- **Código:** `    const { createDeletionController } = loadModule();`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 331

- **Código:** `    const sendDelivery = jest.fn();`
- **Função:** Injeta função observável que entrega payload recuperado.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `    const controller = createDeletionController({`
- **Função:** Instancia controller real com dependências controladas.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 333

- **Código:** `      root: document,`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** `      pageWindow: createPageWindow(),`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 335

- **Código:** `      storage,`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 336

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 337

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 338

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 339

- **Código:** `    await expect(controller.recoverPending({`
- **Função:** Executa replay real do recovery.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 340

- **Código:** `      tabId: 100,`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 341

- **Código:** `      sendDelivery,`
- **Função:** Injeta função observável que entrega payload recuperado.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 342

- **Código:** `    })).resolves.toEqual({`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 343

- **Código:** `      handled: false,`
- **Função:** Exige no-op quando não existe recovery válido.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 344

- **Código:** `      deleted: false,`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 345

- **Código:** `      recovery: null,`
- **Função:** Compõe o cenário DEL-10 — recovery inexistente, preparando ou verificando deletion.js real.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 346

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 347

- **Código:** `    expect(sendDelivery).not.toHaveBeenCalled();`
- **Função:** Injeta função observável que entrega payload recuperado.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 348

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** DEL-10 — recovery inexistente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 349

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 350 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 15. Conclusão documental

Foram documentadas 349 linhas textuais e a posição 350 do newline final. A suíte prova fortemente exclusão nominal, mutex e persistência de recovery no mesmo blob verde em Node 20/22; as três solicitações OPEN delimitam o recovery real (não debug), a ordem clear→delivery e falhas de storage.

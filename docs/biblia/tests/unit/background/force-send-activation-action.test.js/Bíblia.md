# Bíblia técnica — tests/unit/background/force-send-activation-action.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** cab687a5e5d5dd849b6986aeeca5ac642e5b5a6a  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest unitária/integrada ao router para action real de background  
> **Linhas textuais:** 118  
> **Posições documentais:** 119, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo valida a implementação real de extension/background/actions/force-send-activation.js através do extension/background/router.js real. Ele carrega router e action reais, cria o message router real, envia FORCE_SEND_ACTIVATION e observa as chamadas Chrome produzidas pela implementação.

As APIs chrome.storage, chrome.tabs e chrome.windows são mocks focais. Assim, a prova é sobre a lógica da action/router e seus comandos outbound, não sobre o comportamento físico do Chromium.

A action força o envio imediato no Gemini. Em minimized_window, foca a janela Gemini, envia DO_SEND_NOW, espera 250 ms, minimiza novamente e restaura o foco à janela do mangá. Nos demais modos, ativa a aba Gemini, envia DO_SEND_NOW, espera 250 ms e reativa a aba do mangá.

## 2. Implementação real relacionada

O arquivo de produção registra a action canônica force-send-activation com allowedSources any e async false. O modo efetivo é calculado pela precedência: executionMode do request, depois storage.geminiExecutionMode, e por fim o default temp_chat.

No caminho minimized_window com windowId: foca a janela; envia DO_SEND_NOW ao geminiTabId; após 250 ms minimiza/desfoca; se mangaTabId existir, consulta a aba e foca sua windowId.

No caminho alternativo, se geminiTabId existir: ativa a aba Gemini; envia DO_SEND_NOW; após 250 ms, se mangaTabId existir, reativa a aba de mangá.

Os callbacks consultam chrome.runtime.lastError, mas não propagam erro.

## 3. Router real e semântica de resposta

router.js mapeia FORCE_SEND_ACTIVATION para force-send-activation. Como a action declara meta.async false, o router chama execute, envia imediatamente {ok:true} e retorna false. Essa resposta não espera os callbacks Chrome nem o timer de 250 ms; os efeitos são verificados separadamente.

## 4. Harness e isolamento

dispatch imita um listener de runtime, captura sendResponse e devolve também o boolean keepAlive. loadAction prepara self/global, logger mock, remove router residual e usa jest.isolateModules para carregar router e action reais na ordem correta.

O beforeEach reseta módulos, ativa fake timers e instala mocks focais. O afterEach restaura timers, APIs Chrome e globais. O projeto Jest background usa Node e carrega tests/mocks/chrome-api.mock.js como setup compartilhado.

## 5. Cenário 1 — minimized_window

O request não inclui executionMode; o storage responde minimized_window. Isso prova a origem do modo via storage. Antes do timer, o teste prova resposta síncrona, foco da janela 61 e DO_SEND_NOW para tab 17. Após 250 ms, prova minimização/desfoco da janela 61, tabs.get(29) e foco da janela mangá 73.

Classificação: ✅ PROVADO DIRETAMENTE para o happy path completo de janela minimizada.

## 6. Cenário 2 — temp_chat por aba

O request informa executionMode temp_chat e o storage default é vazio. O teste prova resposta síncrona, ativação da aba Gemini 18, DO_SEND_NOW e, após 250 ms, reativação da aba mangá 30.

Classificação: ✅ PROVADO DIRETAMENTE para o happy path por aba.

## 7. Evidência CI do mesmo blob

Run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870. Nesse commit, este arquivo possui exatamente o SHA cab687a5e5d5dd849b6986aeeca5ac642e5b5a6a.

Node 20.x, job 109255348388: PASS para esta suíte; os dois testes aparecem com ✓; 109/109 suítes e 851/851 testes passaram.

Node 22.x, job 109255348406: mesmo resultado; os dois testes aparecem com ✓; 109/109 suítes e 851/851 testes passaram.

O CI Gate do mesmo run, job 109256050280, concluiu com sucesso.

## 8. Matriz de evidência e solicitações

| Comportamento | Evidência | Classificação |
|---|---|---|
| router resolve FORCE_SEND_ACTIVATION para a action real | ACTION_MAP + execução | 🟦 GATE ESTÁTICO ESPECÍFICO + execução real |
| resposta síncrona ok e canal fechado | assertions 77 e 106 | ✅ PROVADO DIRETAMENTE |
| storage minimized_window seleciona caminho de janela | cenário 1 | ✅ PROVADO DIRETAMENTE |
| foco, DO_SEND_NOW, minimização e restauração de janela | assertions 78–93 | ✅ PROVADO DIRETAMENTE |
| request temp_chat seleciona caminho por aba | cenário 2 | ✅ PROVADO DIRETAMENTE |
| ativação Gemini, DO_SEND_NOW e restauração manga tab | assertions 107–116 | ✅ PROVADO DIRETAMENTE |
| request executionMode vence storage conflitante | não há cenário conflitante | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ausência de request+storage usa default temp_chat | cenário 2 passa temp_chat explicitamente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| minimized_window sem windowId cai no caminho por aba | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ausência de geminiTabId produz no-op sem chamadas | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mangaTabId ausente impede restauração | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| tabs.get sem windowId não tenta focar janela | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

### 146-001 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: a seleção de modo tem precedência request -> storage -> default, mas os testes cobrem request com storage vazio e storage com request ausente; não cobrem conflito nem default.

Evidência ausente: request temp_chat com storage minimized_window deve permanecer temp_chat; request e storage ausentes devem seguir o default temp_chat.

Ação esperada: adicionar casos focais usando action/router reais. Risco: alteração de precedência/default pode passar despercebida.

### 146-002 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: fallbacks defensivos não possuem prova focal: minimized_window sem windowId, ausência de geminiTabId, ausência de mangaTabId e tabs.get sem windowId.

Evidência ausente: assertions negativas de chamadas indevidas e prova do fallback para ativação por aba quando minimized_window não traz windowId.

Ação esperada: adicionar casos de borda usando a implementação real. Risco: requests incompletos podem provocar foco/envio incorretos sem falha dos happy paths.


## 9. Auditoria linha a linha

### Linha 001

- **Código:** `const path = require('path');`
- **Função:** Importa o módulo Node path, usado para resolver os caminhos absolutos do router e da action reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 002

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 003

- **Código:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`
- **Função:** Resolve o caminho absoluto de extension/background/router.js.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 004

- **Código:** `const ACTION_PATH = path.resolve(`
- **Função:** Inicia a resolução multilinha do caminho da action real force-send-activation.js.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 005

- **Código:** `    __dirname,`
- **Função:** Usa __dirname como base estável, independente do cwd.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 006

- **Código:** `    '../../../extension/background/actions/force-send-activation.js'`
- **Função:** Aponta para extension/background/actions/force-send-activation.js.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 007

- **Código:** `);`
- **Função:** Fecha a resolução de ACTION_PATH.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 008

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 009

- **Código:** `function dispatch(listener, request, sender) {`
- **Função:** Declara dispatch, helper que invoca o listener real e captura retorno/resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 010

- **Código:** `    let keepAlive;`
- **Função:** Reserva keepAlive para o boolean retornado pelo router.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 011

- **Código:** `    let response;`
- **Função:** Reserva response para o objeto enviado via sendResponse.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 012

- **Código:** `    const sendResponse = result => { response = result; };`
- **Função:** Define sendResponse como capturador síncrono da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 013

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 014

- **Código:** `    keepAlive = listener(request, sender, sendResponse);`
- **Função:** Invoca o listener real com request, sender e sendResponse.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 015

- **Código:** `    return { keepAlive, response };`
- **Função:** Retorna keepAlive e response para assertions.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 016

- **Código:** `}`
- **Função:** Fecha dispatch.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 017

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 018

- **Código:** `function loadAction() {`
- **Função:** Declara loadAction, que carrega router e action reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 019

- **Código:** `    global.self = global;`
- **Função:** Faz self apontar para global para compatibilizar as IIFEs de produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 020

- **Código:** `    global.MangaTranslatorLog = { log: jest.fn() };`
- **Função:** Instala MangaTranslatorLog.log como mock para a dependência do router.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 021

- **Código:** `    delete global.MangaTranslatorRouter;`
- **Função:** Remove MangaTranslatorRouter residual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 022

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 023

- **Código:** `    jest.isolateModules(() => {`
- **Função:** Abre jest.isolateModules.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 024

- **Código:** `        require(ROUTER_PATH);`
- **Função:** Carrega router.js real e cria o registry.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 025

- **Código:** `        require(ACTION_PATH);`
- **Função:** Carrega a action real, que se registra no router.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 026

- **Código:** `    });`
- **Função:** Fecha o isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 027

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 028

- **Código:** `    return global.MangaTranslatorRouter;`
- **Função:** Retorna MangaTranslatorRouter real com a action registrada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 029

- **Código:** `}`
- **Função:** Fecha loadAction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 030

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 031

- **Código:** `describe('background/actions/force-send-activation.js', () => {`
- **Função:** Abre o describe da action force-send-activation real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 032

- **Código:** `    let originalGet;`
- **Função:** Guarda storage.local.get original.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 033

- **Código:** `    let originalTabs;`
- **Função:** Guarda chrome.tabs original.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 034

- **Código:** `    let originalWindows;`
- **Função:** Guarda chrome.windows original.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 035

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 036

- **Código:** `    beforeEach(() => {`
- **Função:** Abre beforeEach.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 037

- **Código:** `        jest.resetModules();`
- **Função:** Reseta módulos Jest.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 038

- **Código:** `        jest.useFakeTimers();`
- **Função:** Ativa fake timers para controlar os timeouts de 250 ms.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 039

- **Código:** `        originalGet = chrome.storage.local.get;`
- **Função:** Salva storage.get original.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 040

- **Código:** `        originalTabs = chrome.tabs;`
- **Função:** Salva tabs original.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 041

- **Código:** `        originalWindows = chrome.windows;`
- **Função:** Salva windows original.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 042

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 043

- **Código:** `        chrome.storage.local.get = jest.fn((_keys, callback) => callback({}));`
- **Função:** Instala storage.get default que responde objeto vazio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 044

- **Código:** `        chrome.tabs = {`
- **Função:** Inicia mock focal de chrome.tabs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 045

- **Código:** `            get: jest.fn(),`
- **Função:** Cria mock de tabs.get.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 046

- **Código:** `            sendMessage: jest.fn((_tabId, _message, callback) => callback()),`
- **Função:** Cria mock de tabs.sendMessage que executa callback imediatamente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 047

- **Código:** `            update: jest.fn((_tabId, _options, callback) => callback()),`
- **Função:** Cria mock de tabs.update que executa callback imediatamente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 048

- **Código:** `        };`
- **Função:** Fecha mock de tabs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 049

- **Código:** `        chrome.windows = {`
- **Função:** Inicia mock focal de chrome.windows.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 050

- **Código:** `            update: jest.fn((_windowId, _options, callback) => callback()),`
- **Função:** Cria mock de windows.update que executa callback imediatamente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 051

- **Código:** `        };`
- **Função:** Fecha mock de windows.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 052

- **Código:** `    });`
- **Função:** Fecha beforeEach.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 053

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 054

- **Código:** `    afterEach(() => {`
- **Função:** Abre afterEach.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 055

- **Código:** `        jest.useRealTimers();`
- **Função:** Restaura timers reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 056

- **Código:** `        chrome.storage.local.get = originalGet;`
- **Função:** Restaura storage.get.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 057

- **Código:** `        chrome.tabs = originalTabs;`
- **Função:** Restaura chrome.tabs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 058

- **Código:** `        chrome.windows = originalWindows;`
- **Função:** Restaura chrome.windows.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 059

- **Código:** `        delete global.MangaTranslatorLog;`
- **Função:** Remove MangaTranslatorLog global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 060

- **Código:** `        delete global.MangaTranslatorRouter;`
- **Função:** Remove MangaTranslatorRouter global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 061

- **Código:** `    });`
- **Função:** Fecha afterEach.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 062

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 063

- **Código:** `    test('foca a janela minimizada, envia ao Gemini e restaura o foco do mangá', () => {`
- **Função:** Declara o cenário minimized_window completo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 064

- **Código:** `        chrome.storage.local.get.mockImplementation((_keys, callback) => {`
- **Função:** Sobrescreve storage.get para o cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 065

- **Código:** `            callback({ geminiExecutionMode: 'minimized_window' });`
- **Função:** Retorna geminiExecutionMode minimized_window pelo storage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 066

- **Código:** `        });`
- **Função:** Fecha o mock específico de storage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 067

- **Código:** `        chrome.tabs.get.mockImplementation((_tabId, callback) => callback({ windowId: 73 }));`
- **Função:** Faz tabs.get da aba mangá retornar windowId 73.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 068

- **Código:** `        const router = loadAction();`
- **Função:** Carrega router e action reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 069

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 070

- **Código:** `        const result = dispatch(router.createMessageRouter({}), {`
- **Função:** Despacha FORCE_SEND_ACTIVATION pelo router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 071

- **Código:** `            action: 'FORCE_SEND_ACTIVATION',`
- **Função:** Define a action legada FORCE_SEND_ACTIVATION.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 072

- **Código:** `            geminiTabId: 17,`
- **Função:** Define geminiTabId 17.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 073

- **Código:** `            mangaTabId: 29,`
- **Função:** Define mangaTabId 29.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 074

- **Código:** `            windowId: 61,`
- **Função:** Define windowId 61 da janela Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 075

- **Código:** `        }, { tab: { id: 29, url: 'https://reader.example/chapter' } });`
- **Função:** Fornece sender de content tab; a action aceita origem any.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 076

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 077

- **Código:** `        expect(result).toEqual({ keepAlive: false, response: { ok: true } });`
- **Função:** Assertion direta de keepAlive false e resposta ok true.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 078

- **Código:** `        expect(chrome.windows.update).toHaveBeenCalledWith(61, { focused: true }, expect.any(Function));`
- **Função:** Assertion direta de foco inicial da janela 61.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 079

- **Código:** `        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(`
- **Função:** Inicia assertion de tabs.sendMessage.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 080

- **Código:** `            17,`
- **Função:** Exige tab Gemini 17.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 081

- **Código:** `            { action: 'DO_SEND_NOW' },`
- **Função:** Exige payload DO_SEND_NOW.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 082

- **Código:** `            expect.any(Function)`
- **Função:** Exige callback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 083

- **Código:** `        );`
- **Função:** Fecha assertion de sendMessage.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 084

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 085

- **Código:** `        jest.advanceTimersByTime(250);`
- **Função:** Avança fake timers em 250 ms.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 086

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 087

- **Código:** `        expect(chrome.windows.update).toHaveBeenCalledWith(`
- **Função:** Inicia assertion da atualização após timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 088

- **Código:** `            61,`
- **Função:** Exige janela 61.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 089

- **Código:** `            { state: 'minimized', focused: false },`
- **Função:** Exige estado minimized e focused false.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 090

- **Código:** `            expect.any(Function)`
- **Função:** Exige callback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 091

- **Código:** `        );`
- **Função:** Fecha assertion de minimização.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 092

- **Código:** `        expect(chrome.tabs.get).toHaveBeenCalledWith(29, expect.any(Function));`
- **Função:** Prova tabs.get da aba mangá 29.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 093

- **Código:** `        expect(chrome.windows.update).toHaveBeenCalledWith(73, { focused: true }, expect.any(Function));`
- **Função:** Prova foco da janela mangá 73.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 094

- **Código:** `    });`
- **Função:** Fecha primeiro teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 095

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 096

- **Código:** `    test('usa a ativação por aba quando a janela minimizada não é aplicável', () => {`
- **Função:** Declara o cenário alternativo por ativação de aba.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 097

- **Código:** `        const router = loadAction();`
- **Função:** Carrega router/action com storage default vazio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 098

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 099

- **Código:** `        const result = dispatch(router.createMessageRouter({}), {`
- **Função:** Despacha FORCE_SEND_ACTIVATION.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 100

- **Código:** `            action: 'FORCE_SEND_ACTIVATION',`
- **Função:** Define a action legada.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — estrutura/caminho está explícito e foi carregado pela suíte verde.

### Linha 101

- **Código:** `            geminiTabId: 18,`
- **Função:** Define geminiTabId 18.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 102

- **Código:** `            mangaTabId: 30,`
- **Função:** Define mangaTabId 30.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 103

- **Código:** `            executionMode: 'temp_chat',`
- **Função:** Passa executionMode temp_chat explicitamente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 104

- **Código:** `        }, { tab: { id: 30, url: 'https://reader.example/chapter' } });`
- **Função:** Fornece sender da aba de mangá.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 105

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 106

- **Código:** `        expect(result).toEqual({ keepAlive: false, response: { ok: true } });`
- **Função:** Assertion direta de keepAlive false e resposta ok true.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 107

- **Código:** `        expect(chrome.tabs.update).toHaveBeenCalledWith(18, { active: true }, expect.any(Function));`
- **Função:** Prova ativação da aba Gemini 18.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 108

- **Código:** `        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(`
- **Função:** Inicia assertion de sendMessage.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 109

- **Código:** `            18,`
- **Função:** Exige tab 18.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 110

- **Código:** `            { action: 'DO_SEND_NOW' },`
- **Função:** Exige DO_SEND_NOW.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 111

- **Código:** `            expect.any(Function)`
- **Função:** Exige callback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 112

- **Código:** `        );`
- **Função:** Fecha assertion de sendMessage.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 113

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 114

- **Código:** `        jest.advanceTimersByTime(250);`
- **Função:** Avança 250 ms.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 115

- **Código:** linha vazia
- **Função:** Linha em branco; separa blocos sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 116

- **Código:** `        expect(chrome.tabs.update).toHaveBeenCalledWith(30, { active: true }, expect.any(Function));`
- **Função:** Prova reativação da aba mangá 30.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica passou no mesmo blob em Node 20.x e 22.x.

### Linha 117

- **Código:** `    });`
- **Função:** Fecha segundo teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Linha 118

- **Código:** `});`
- **Função:** Fecha describe.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos fluxos verdes, sem assertion isolada nesta linha.

### Posição 119 — newline final

- **Código:** newline terminal após a linha textual 118.
- **Função:** encerra o arquivo textual no blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — confirmado pela leitura exata do SHA reservado.

## 10. Fonte integral auditada

```js
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(
    __dirname,
    '../../../extension/background/actions/force-send-activation.js'
);

function dispatch(listener, request, sender) {
    let keepAlive;
    let response;
    const sendResponse = result => { response = result; };

    keepAlive = listener(request, sender, sendResponse);
    return { keepAlive, response };
}

function loadAction() {
    global.self = global;
    global.MangaTranslatorLog = { log: jest.fn() };
    delete global.MangaTranslatorRouter;

    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });

    return global.MangaTranslatorRouter;
}

describe('background/actions/force-send-activation.js', () => {
    let originalGet;
    let originalTabs;
    let originalWindows;

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        originalGet = chrome.storage.local.get;
        originalTabs = chrome.tabs;
        originalWindows = chrome.windows;

        chrome.storage.local.get = jest.fn((_keys, callback) => callback({}));
        chrome.tabs = {
            get: jest.fn(),
            sendMessage: jest.fn((_tabId, _message, callback) => callback()),
            update: jest.fn((_tabId, _options, callback) => callback()),
        };
        chrome.windows = {
            update: jest.fn((_windowId, _options, callback) => callback()),
        };
    });

    afterEach(() => {
        jest.useRealTimers();
        chrome.storage.local.get = originalGet;
        chrome.tabs = originalTabs;
        chrome.windows = originalWindows;
        delete global.MangaTranslatorLog;
        delete global.MangaTranslatorRouter;
    });

    test('foca a janela minimizada, envia ao Gemini e restaura o foco do mangá', () => {
        chrome.storage.local.get.mockImplementation((_keys, callback) => {
            callback({ geminiExecutionMode: 'minimized_window' });
        });
        chrome.tabs.get.mockImplementation((_tabId, callback) => callback({ windowId: 73 }));
        const router = loadAction();

        const result = dispatch(router.createMessageRouter({}), {
            action: 'FORCE_SEND_ACTIVATION',
            geminiTabId: 17,
            mangaTabId: 29,
            windowId: 61,
        }, { tab: { id: 29, url: 'https://reader.example/chapter' } });

        expect(result).toEqual({ keepAlive: false, response: { ok: true } });
        expect(chrome.windows.update).toHaveBeenCalledWith(61, { focused: true }, expect.any(Function));
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
            17,
            { action: 'DO_SEND_NOW' },
            expect.any(Function)
        );

        jest.advanceTimersByTime(250);

        expect(chrome.windows.update).toHaveBeenCalledWith(
            61,
            { state: 'minimized', focused: false },
            expect.any(Function)
        );
        expect(chrome.tabs.get).toHaveBeenCalledWith(29, expect.any(Function));
        expect(chrome.windows.update).toHaveBeenCalledWith(73, { focused: true }, expect.any(Function));
    });

    test('usa a ativação por aba quando a janela minimizada não é aplicável', () => {
        const router = loadAction();

        const result = dispatch(router.createMessageRouter({}), {
            action: 'FORCE_SEND_ACTIVATION',
            geminiTabId: 18,
            mangaTabId: 30,
            executionMode: 'temp_chat',
        }, { tab: { id: 30, url: 'https://reader.example/chapter' } });

        expect(result).toEqual({ keepAlive: false, response: { ok: true } });
        expect(chrome.tabs.update).toHaveBeenCalledWith(18, { active: true }, expect.any(Function));
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
            18,
            { action: 'DO_SEND_NOW' },
            expect.any(Function)
        );

        jest.advanceTimersByTime(250);

        expect(chrome.tabs.update).toHaveBeenCalledWith(30, { active: true }, expect.any(Function));
    });
});
```

## 11. Conclusão documental

O blob cab687a5e5d5dd849b6986aeeca5ac642e5b5a6a foi coberto integralmente: 118 linhas textuais e a posição 119 do newline final. Os dois caminhos principais usam router/action reais e têm execução CI do mesmo blob em Node 20 e 22. As lacunas de precedência/default e fallbacks defensivos foram registradas sem alterar teste ou produção.

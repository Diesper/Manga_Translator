# Bíblia técnica — tests/unit/background/request-image-data-action.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** b04cd6cac53339fb479c19b7977acb61339ffdd9  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest da action real request-image-data  
> **Linhas textuais:** 64  
> **Posições documentais:** 65, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte valida a action que faz a ponte entre o job Gemini e a aba leitora: recebe mangaTabId/index, envia REQUEST_IMAGE_DATA ao content script do mangá e devolve exatamente a resposta recebida ou a mensagem de chrome.runtime.lastError.

Ela carrega router.js e request-image-data.js reais, mas executa diretamente action.execute. O boundary chrome.tabs.sendMessage é mockado para controlar os dois resultados fundamentais.

## 2. Implementação real

A action registrada chama chrome.tabs.sendMessage(request.mangaTabId, {action:'REQUEST_IMAGE_DATA', index:request.index}, callback). Dentro do callback, lastError produz {error: lastError.message}; sem lastError, a resposta é devolvida sem transformação.

O metadata permite allowedSources:any e não existe função validate própria. Portanto mangaTabId/index são encaminhados conforme recebidos; isso é registrado como ponto de contrato a revisar, não como comportamento provado seguro.

## 3. Cenário de sucesso

O primeiro caso usa mangaTabId 71 e index 5. O content mock responde com um objeto srcData. A suíte exige a chamada exata à aba 71, mensagem REQUEST_IMAGE_DATA/index 5 e callback; depois usa toBe, não apenas toEqual, para provar que o mesmo objeto é preservado.

Classificação: ✅ PROVADO DIRETAMENTE.

## 4. Cenário chrome.runtime.lastError

O segundo caso reproduz a semântica do Chrome: lastError existe durante o callback, response é undefined e o erro é limpo logo depois. A action deve resolver com {error:'Could not establish connection.'}.

Classificação: ✅ PROVADO DIRETAMENTE.

## 5. Prova integrada complementar

message-handlers-real.test.js, cenário BG-47/BG-48/BG-49/BG-50, carrega background.js real. Ele envia REQUEST_IMAGE_DATA para uma manga tab viva e exige a resposta base64; depois usa mangaTabId 99999 e exige error contendo 'Could not establish connection'. Também exige que a mensagem encaminhada tenha action REQUEST_IMAGE_DATA e index 3.

Logo, o wiring router/background + legacy response compatibility já possui prova direta externa para sucesso e falha de conexão. Não é aberta pendência duplicada de integração.

## 6. Evidência CI exata

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 contém exatamente o blob b04cd6cac53339fb479c19b7977acb61339ffdd9.

- Node 20.x — job 109255348388: PASS; os dois casos aparecem com ✓; global 109/109 suítes e 851/851 testes.
- Node 22.x — job 109255348406: PASS; os dois casos aparecem com ✓; global 109/109 suítes e 851/851 testes.
- CI Gate 109256050280: sucesso.

## 7. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| tabId e index são encaminhados corretamente | caso 1 | ✅ PROVADO DIRETAMENTE |
| resposta do content é preservada | toBe(contentResponse) | ✅ PROVADO DIRETAMENTE |
| lastError vira objeto error | caso 2 | ✅ PROVADO DIRETAMENTE |
| wiring pelo background real | BG-47/BG-48/BG-49/BG-50 | ✅ PROVADO DIRETAMENTE — externo |
| request sem mangaTabId/index válido | action não possui validate | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO / contrato não definido |
| callback undefined sem lastError | ramo resolve(undefined), sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Solicitações ao auditor

### 164-001 — CONTRACT_REVIEW — SUPERSEDED → 022-001 — NORMAL

Encontrado: request-image-data não possui validate e repassa request.mangaTabId/request.index diretamente para chrome.tabs.sendMessage.

Evidência atual: somente requests válidos e falha de conexão para tabId inexistente são testados.

Evidência/decisão ausente: definir se mangaTabId deve ser inteiro positivo e index inteiro não negativo; se sim, adicionar validate + testes antes de efeitos. Se o contrato permissivo for intencional, documentá-lo explicitamente.

Risco: payload estruturalmente inválido pode chegar à API Chrome ou consultar índice incorreto sem erro de contrato consistente.

### 164-002 — TEST_REQUIRED — ACCEPTED — LOW

Encontrado: quando o callback chama response=undefined e chrome.runtime.lastError não está definido, a action resolve undefined.

Evidência atual: sucesso usa objeto e erro usa undefined + lastError.

Evidência ausente: callback undefined sem lastError, incluindo o comportamento esperado quando atravessa o router/compatibilidade legacy.

Risco: consumidor pode receber shape ambíguo ({}, undefined ou outro envelope) se o content script não responder payload.

## 9. Fonte integral auditada

```javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(
    __dirname,
    '../../../extension/background/actions/request-image-data.js'
);

function loadAction() {
    global.self = global;
    delete global.MangaTranslatorRouter;

    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });

    return global.MangaTranslatorRouter.getAction('request-image-data');
}

describe('background/actions/request-image-data.js', () => {
    let originalSendMessage;
    let originalSelf;

    beforeEach(() => {
        jest.resetModules();
        originalSelf = global.self;
        originalSendMessage = chrome.tabs.sendMessage;
    });

    afterEach(() => {
        chrome.tabs.sendMessage = originalSendMessage;
        global.self = originalSelf;
        delete global.MangaTranslatorRouter;
    });

    test('encaminha a pagina para a aba do manga e preserva sua resposta', async () => {
        const contentResponse = { srcData: 'data:image/png;base64,QUJDRA==' };
        chrome.tabs.sendMessage = jest.fn((_tabId, _message, callback) => callback(contentResponse));
        const action = loadAction();

        const result = await action.execute({ mangaTabId: 71, index: 5 });

        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
            71,
            { action: 'REQUEST_IMAGE_DATA', index: 5 },
            expect.any(Function)
        );
        expect(result).toBe(contentResponse);
    });

    test('devolve a mensagem de chrome.runtime.lastError', async () => {
        chrome.tabs.sendMessage = jest.fn((_tabId, _message, callback) => {
            chrome.runtime.lastError = { message: 'Could not establish connection.' };
            callback(undefined);
            chrome.runtime.lastError = null;
        });
        const action = loadAction();

        await expect(action.execute({ mangaTabId: 404, index: 8 })).resolves.toEqual({
            error: 'Could not establish connection.',
        });
    });
});
```

## 10. Auditoria linha a linha

### Linha 001

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver router/action reais.
- **Contexto:** import path.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`
- **Função:** Compõe caminho absoluto para o router central ou para request-image-data.js.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 004

- **Código:** `const ACTION_PATH = path.resolve(`
- **Função:** Compõe caminho absoluto para o router central ou para request-image-data.js.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 005

- **Código:** `    __dirname,`
- **Função:** Compõe caminho absoluto para o router central ou para request-image-data.js.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 006

- **Código:** `    '../../../extension/background/actions/request-image-data.js'`
- **Função:** Compõe caminho absoluto para o router central ou para request-image-data.js.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 007

- **Código:** `);`
- **Função:** Compõe caminho absoluto para o router central ou para request-image-data.js.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 008

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** `function loadAction() {`
- **Função:** Define loader que cria escopo global e carrega router + action em módulo isolado.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `    global.self = global;`
- **Função:** Emula o escopo self esperado pela IIFE da extensão.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `    delete global.MangaTranslatorRouter;`
- **Função:** Remove registry anterior para impedir reutilização entre testes.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `    jest.isolateModules(() => {`
- **Função:** Reexecuta o registro da action em isolamento Jest.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `        require(ROUTER_PATH);`
- **Função:** Carrega o router real antes da action.
- **Contexto:** loader da action real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 015

- **Código:** `        require(ACTION_PATH);`
- **Função:** Carrega a implementação real de request-image-data.
- **Contexto:** loader da action real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 016

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `    return global.MangaTranslatorRouter.getAction('request-image-data');`
- **Função:** Obtém do registry exatamente a definição registrada pela action real.
- **Contexto:** loader da action real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga o teste ao módulo real.

### Linha 019

- **Código:** `}`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** loader da action real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `describe('background/actions/request-image-data.js', () => {`
- **Função:** Abre a suíte focal da action request-image-data.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `    let originalSendMessage;`
- **Função:** Reserva referência original para restaurar globals/mocks após cada caso.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `    let originalSelf;`
- **Função:** Reserva referência original para restaurar globals/mocks após cada caso.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `    beforeEach(() => {`
- **Função:** Inicia setup por cenário.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `        jest.resetModules();`
- **Função:** Limpa cache Jest antes do próximo carregamento.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `        originalSelf = global.self;`
- **Função:** Salva/restaura self global para isolamento.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `        originalSendMessage = chrome.tabs.sendMessage;`
- **Função:** Salva/restaura chrome.tabs.sendMessage original.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `    afterEach(() => {`
- **Função:** Inicia teardown do ambiente mutado pelo caso.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `        chrome.tabs.sendMessage = originalSendMessage;`
- **Função:** Salva/restaura chrome.tabs.sendMessage original.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `        global.self = originalSelf;`
- **Função:** Salva/restaura self global para isolamento.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `        delete global.MangaTranslatorRouter;`
- **Função:** Remove registry anterior para impedir reutilização entre testes.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `    test('encaminha a pagina para a aba do manga e preserva sua resposta', async () => {`
- **Função:** Declara cenário: sucesso: relay e preservação da resposta.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `        const contentResponse = { srcData: 'data:image/png;base64,QUJDRA==' };`
- **Função:** Cria objeto de resposta do content script para provar preservação por identidade de objeto.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `        chrome.tabs.sendMessage = jest.fn((_tabId, _message, callback) => callback(contentResponse));`
- **Função:** Instala o mock de `chrome.tabs.sendMessage` e entrega ao callback o `contentResponse` já criado na linha 38.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — prepara o boundary mockado usado pela action; a identidade do retorno é provada na linha 49.

### Linha 040

- **Código:** `        const action = loadAction();`
- **Função:** Carrega e recupera a action real registrada.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `        const result = await action.execute({ mangaTabId: 71, index: 5 });`
- **Função:** Executa diretamente a implementação real da action com o request controlado.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real e é seguido por assertions.

### Linha 043

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(`
- **Função:** Prova os argumentos exatos enviados à aba do mangá.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 045

- **Código:** `            71,`
- **Função:** Compõe o bloco sucesso: relay e preservação da resposta, preparando, executando ou verificando a action real.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `            { action: 'REQUEST_IMAGE_DATA', index: 5 },`
- **Função:** Fixa a ação encaminhada ao content script do mangá.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `            expect.any(Function)`
- **Função:** Exige callback para transportar resposta/lastError ao Promise da action.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `        );`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `        expect(result).toBe(contentResponse);`
- **Função:** Afirma por identidade (`toBe`) que a action devolve exatamente o mesmo objeto `contentResponse` entregue pelo callback, sem transformação.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 050

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** sucesso: relay e preservação da resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `    test('devolve a mensagem de chrome.runtime.lastError', async () => {`
- **Função:** Declara cenário: erro: chrome.runtime.lastError.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `        chrome.tabs.sendMessage = jest.fn((_tabId, _message, callback) => {`
- **Função:** Substitui apenas o boundary Chrome para observar tabId, mensagem e callback usados pela action real.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `            chrome.runtime.lastError = { message: 'Could not establish connection.' };`
- **Função:** Simula erro Chrome disponível somente durante o callback.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `            callback(undefined);`
- **Função:** Dispara callback sem response enquanto lastError está presente.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `            chrome.runtime.lastError = null;`
- **Função:** Simula erro Chrome disponível somente durante o callback.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `        });`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `        const action = loadAction();`
- **Função:** Carrega e recupera a action real registrada.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `        await expect(action.execute({ mangaTabId: 404, index: 8 })).resolves.toEqual({`
- **Função:** Executa diretamente a implementação real da action com o request controlado.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 061

- **Código:** `            error: 'Could not establish connection.',`
- **Função:** Fixa a mensagem realista devolvida quando a aba alvo não possui receptor.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `        });`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** erro: chrome.runtime.lastError.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `});`
- **Função:** Fecha ou organiza o bloco sintático anterior.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Posição 065 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob textual auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte recuperada termina em `\n`.

## 11. Conclusão documental

Foram documentadas 64 linhas textuais e a posição 65 do newline final. A fonte integral embutida corresponde ao SHA auditado; sucesso e lastError têm prova local e também prova integrada no background real.

> **Lifecycle pós-adversarial:** 164-001 está SUPERSEDED por `022-001`; 164-002 está ACCEPTED. Esses statuses refletem `.state/164.json` e não reabrem requests já triadas.

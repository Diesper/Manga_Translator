# Bíblia técnica — tests/unit/background/router.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** d7c33bc525e1683acabff44389c5d51471cc7037  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest da infraestrutura central de roteamento  
> **Linhas textuais:** 161  
> **Posições documentais:** 162, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

router.test.js é a suíte de contrato do núcleo MangaTranslatorRouter. Diferentemente das suítes de actions específicas, ela registra actions mínimas controladas para provar ordem de gates, classificação de origem, validação, keep-alive e composição de contexto.

O arquivo não testa background.js nem a camada sendResponseCompat; ele testa diretamente extension/background/router.js.

## 2. Mapping e origem

O primeiro caso prova GET_TAB_ID → get-tab-id e UNKNOWN → null. Também fixa quatro classes de sender: URL Gemini → gemini; URL de leitor → content; id igual a chrome.runtime.id → popup; outro id sem tab → external.

O branch identifySource(!sender) → unknown e a exceção 127.0.0.1 → gemini não têm assertions nesta suíte, mas são ramificações simples do mesmo helper; não foram elevadas a pendência separada por baixo risco.

## 3. Action síncrona autorizada

Uma action content/async:false com validator válido devolve tabId do sender. O router responde keepAlive:false e envelope {ok:true,tabId:42}. Isso prova execução síncrona e preservação do resultado.

## 4. Gate de origem

Quando a mesma action aceita somente content e o sender é popup, execute permanece sem chamada e a resposta é SOURCE_DENIED com keepAlive:false. A ordem origem → validate/execute é portanto diretamente provada para este cenário.

## 5. Gate de validação

O caso INVALID_PAYLOAD prova a resposta estruturada e canal síncrono fechado. Porém o execute criado como jest.fn não recebe assertion not.toHaveBeenCalled; logo a ausência de efeito após falha de validação é inferida da implementação, não congelada pelo teste. Isso gera 166-001.

## 6. Action assíncrona

Sem meta.async=false, o router executa IIFE async, retorna true imediatamente e responde depois da Promise da action. O caso exige keepAlive:true e {ok:true,tabId:73}.

## 7. Contexto e contextFactory

createContext(sender) fornece sender/state/log/storage; em seguida o resultado de contextFactory é espalhado por cima. O cenário injeta apenas state.activeMangaTabId=91 e exige que sender.tab.id continue 44. Isso prova composição normal de dependências, não impede uma factory interna de fornecer explicitamente uma chave sender e sobrescrevê-la.

## 8. Branches de erro não exercitados

router.js possui dois catches distintos: action síncrona que lança e action assíncrona que rejeita/lança. Ambos logam ACTION_ERROR e devolvem INTERNAL_ERROR. Não foi localizada outra suíte focal que prove esses catches. Também existe ACTION_NOT_FOUND quando um nome legado mapeia, mas a definição ainda não está registrada.

## 9. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob d7c33bc525e1683acabff44389c5d51471cc7037. Os seis casos aparecem com ✓ em Node 20.x (job 109255348388) e Node 22.x (109255348406); ambos encerram em 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 10. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| mapping conhecido/desconhecido | caso 1 | ✅ PROVADO DIRETAMENTE |
| gemini/content/popup/external | caso 1 | ✅ PROVADO DIRETAMENTE |
| sync success + keepAlive false | caso 2 | ✅ PROVADO DIRETAMENTE |
| SOURCE_DENIED bloqueia execute | caso 3 | ✅ PROVADO DIRETAMENTE |
| INVALID_PAYLOAD produz erro | caso 4 | ✅ PROVADO DIRETAMENTE |
| INVALID_PAYLOAD não executa action | execute é jest.fn mas não assertado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| async success + keepAlive true | caso 5 | ✅ PROVADO DIRETAMENTE |
| contextFactory adiciona state sem remover sender por omissão | caso 6 | ✅ PROVADO DIRETAMENTE |
| throw síncrono → INTERNAL_ERROR | catch real sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| reject assíncrono → INTERNAL_ERROR | catch real sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mapping existente sem action registrada → ACTION_NOT_FOUND | branch real sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 11. Solicitações ao auditor

### 166-001 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: o caso de INVALID_PAYLOAD registra execute: jest.fn(), mas não exige execute.not.toHaveBeenCalled().

Evidência ausente: assertion explícita de que validator inválido encerra o fluxo antes de execute e, idealmente, antes de contextFactory se esse for o contrato desejado.

Risco: uma regressão poderia executar efeitos após responder erro de validação e a resposta testada ainda parecer correta.

### 166-002 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: os catches ACTION_ERROR para execute síncrono que lança e execute assíncrono que rejeita não possuem prova focal localizada.

Evidência ausente: um caso async:false lançando Error e outro async rejeitando; ambos devem responder INTERNAL_ERROR, com keepAlive false/true respectivamente e mensagem normalizada.

Risco: exceções podem escapar do listener, perder resposta ou alterar keepAlive sem serem detectadas.

### 166-003 — TEST_REQUIRED — OPEN — LOW

Encontrado: quando resolveActionName encontra mapping, mas actionRegistry não contém definição, o router loga ACTION_NOT_FOUND e retorna false sem responder. Esse ramo não é exercitado.

Evidência ausente: router recém-carregado sem registrar get-tab-id, dispatch GET_TAB_ID, exigir keepAlive:false/sem response e log ACTION_NOT_FOUND quando logger estiver configurado.

Risco: baixo; o bootstrap normal registra as actions, mas o branch é salvaguarda para carregamento parcial.

## 12. Fonte integral auditada

```javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');

function loadRouter() {
    delete global.MangaTranslatorRouter;
    jest.isolateModules(() => {
        require(ROUTER_PATH);
    });
    return global.MangaTranslatorRouter;
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

describe('background/router.js', () => {
    beforeEach(() => {
        jest.resetModules();
        delete global.MangaTranslatorLog;
        delete global.MangaTranslatorState;
    });

    afterEach(() => {
        delete global.MangaTranslatorRouter;
    });

    test('resolve nomes legados e identifica a origem de cada contexto', () => {
        const router = loadRouter();

        expect(router.resolveActionName('GET_TAB_ID')).toBe('get-tab-id');
        expect(router.resolveActionName('UNKNOWN')).toBeNull();
        expect(router.identifySource({ tab: { url: 'https://gemini.google.com/app' } })).toBe('gemini');
        expect(router.identifySource({ tab: { url: 'https://reader.example/chapter' } })).toBe('content');
        expect(router.identifySource({ id: chrome.runtime.id })).toBe('popup');
        expect(router.identifySource({ id: 'outside-extension' })).toBe('external');
    });

    test('despacha uma ação síncrona autorizada e preserva sua resposta', async () => {
        const router = loadRouter();
        router.registerAction({
            name: 'get-tab-id',
            meta: { allowedSources: ['content'], async: false },
            validate: request => request.action === 'GET_TAB_ID' ? null : { code: 'INVALID_ACTION' },
            execute: (_request, context) => ({ tabId: context.sender.tab.id }),
        });

        const response = await dispatch(
            router.createMessageRouter({}),
            { action: 'GET_TAB_ID' },
            { tab: { id: 42, url: 'https://reader.example/chapter' } }
        );

        expect(response).toEqual({ keepAlive: false, response: { ok: true, tabId: 42 } });
    });

    test('bloqueia origem não permitida antes de executar a ação', async () => {
        const router = loadRouter();
        const execute = jest.fn();
        router.registerAction({
            name: 'get-tab-id',
            meta: { allowedSources: ['content'], async: false },
            execute,
        });

        const response = await dispatch(
            router.createMessageRouter({}),
            { action: 'GET_TAB_ID' },
            { id: chrome.runtime.id, tab: null }
        );

        expect(execute).not.toHaveBeenCalled();
        expect(response).toEqual({
            keepAlive: false,
            response: { ok: false, error: { code: 'SOURCE_DENIED' } },
        });
    });

    test('retorna falha de validação sem abrir canal assíncrono', async () => {
        const router = loadRouter();
        router.registerAction({
            name: 'get-tab-id',
            meta: { allowedSources: ['content'], async: false },
            validate: () => ({ code: 'INVALID_PAYLOAD', message: 'Payload inválido' }),
            execute: jest.fn(),
        });

        const response = await dispatch(
            router.createMessageRouter({}),
            { action: 'GET_TAB_ID' },
            { tab: { id: 42, url: 'https://reader.example/chapter' } }
        );

        expect(response).toEqual({
            keepAlive: false,
            response: { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Payload inválido' } },
        });
    });

    test('mantém aberto o canal de uma ação assíncrona até a resposta', async () => {
        const router = loadRouter();
        router.registerAction({
            name: 'get-tab-id',
            meta: { allowedSources: ['content'] },
            async execute(_request, context) {
                await Promise.resolve();
                return { tabId: context.sender.tab.id };
            },
        });

        const response = await dispatch(
            router.createMessageRouter({}),
            { action: 'GET_TAB_ID' },
            { tab: { id: 73, url: 'https://reader.example/chapter' } }
        );

        expect(response).toEqual({ keepAlive: true, response: { ok: true, tabId: 73 } });
    });

    test('aceita dependências explícitas sem substituir o sender do contexto', async () => {
        const router = loadRouter();
        router.registerAction({
            name: 'get-tab-id',
            meta: { allowedSources: ['content'], async: false },
            execute(_request, context) {
                return {
                    tabId: context.sender.tab.id,
                    activeMangaTabId: context.state.activeMangaTabId,
                };
            },
        });

        const response = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({ state: { activeMangaTabId: 91 } }),
            }),
            { action: 'GET_TAB_ID' },
            { tab: { id: 44, url: 'https://reader.example/chapter' } }
        );

        expect(response).toEqual({
            keepAlive: false,
            response: { ok: true, tabId: 44, activeMangaTabId: 91 },
        });
    });
});
```

## 13. Auditoria linha a linha

### Linha 001

- **Código:** `const path = require('path');`
- **Função:** Importa path para localizar router.js real.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`
- **Função:** Resolve caminho absoluto da implementação real do router.
- **Contexto:** loader do router real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte a router.js real.

### Linha 004

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `function loadRouter() {`
- **Função:** Define loader isolado que reexecuta router.js e devolve MangaTranslatorRouter.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `    delete global.MangaTranslatorRouter;`
- **Função:** Remove instância anterior para impedir registry compartilhado entre cenários.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 007

- **Código:** `    jest.isolateModules(() => {`
- **Função:** Executa require em registry Jest isolado.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** `        require(ROUTER_PATH);`
- **Função:** Carrega a implementação real auditada.
- **Contexto:** loader do router real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte a router.js real.

### Linha 009

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `    return global.MangaTranslatorRouter;`
- **Função:** Entrega a API real do router ao cenário.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `}`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** loader do router real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `function dispatch(listener, request, sender) {`
- **Função:** Helper que normaliza listeners síncronos e assíncronos em Promise observável.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `    return new Promise(resolve => {`
- **Função:** Compõe o cenário helper dispatch sync/async, preparando ou observando a política do router.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `        let keepAlive;`
- **Função:** Reserva o booleano retornado pelo listener.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `        let delivered = false;`
- **Função:** Registra se sendResponse foi chamado antes/depois do retorno do listener.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `        let deliveredResponse;`
- **Função:** Registra se sendResponse foi chamado antes/depois do retorno do listener.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `        const sendResponse = response => {`
- **Função:** Implementa callback de resposta e resolve a Promise assim que keepAlive estiver conhecido.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `            delivered = true;`
- **Função:** Compõe o cenário helper dispatch sync/async, preparando ou observando a política do router.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `            deliveredResponse = response;`
- **Função:** Armazena payload entregue para compor o resultado do helper.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `            if (keepAlive !== undefined) resolve({ keepAlive, response });`
- **Função:** Compõe o cenário helper dispatch sync/async, preparando ou observando a política do router.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `        };`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `        keepAlive = listener(request, sender, sendResponse);`
- **Função:** Executa listener real e captura false/true de keep-alive.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa listener real; assertions subsequentes fixam o contrato.

### Linha 026

- **Código:** `        if (delivered || keepAlive === false) {`
- **Função:** Fecha imediatamente o helper quando resposta já chegou ou o canal não ficará aberto.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `            resolve({ keepAlive, response: delivered ? deliveredResponse : undefined });`
- **Função:** Armazena payload entregue para compor o resultado do helper.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `        }`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** helper dispatch sync/async.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `}`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `describe('background/router.js', () => {`
- **Função:** Abre a suíte focal do router central.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `    beforeEach(() => {`
- **Função:** Reseta módulos e remove log/state globais para contexto controlado.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `        jest.resetModules();`
- **Função:** Evita reutilização do registry/action map entre casos.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `        delete global.MangaTranslatorLog;`
- **Função:** Remove dependências globais opcionais para testar defaults do createContext.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `        delete global.MangaTranslatorState;`
- **Função:** Remove dependências globais opcionais para testar defaults do createContext.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `    afterEach(() => {`
- **Função:** Remove router global após cada caso.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `        delete global.MangaTranslatorRouter;`
- **Função:** Remove instância anterior para impedir registry compartilhado entre cenários.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** suite e isolamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `    test('resolve nomes legados e identifica a origem de cada contexto', () => {`
- **Função:** Declara cenário: mapping legado + identifySource.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `        const router = loadRouter();`
- **Função:** Compõe o cenário mapping legado + identifySource, preparando ou observando a política do router.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `        expect(router.resolveActionName('GET_TAB_ID')).toBe('get-tab-id');`
- **Função:** Exercita mapping SCREAMING_CASE → nome canônico ou null para desconhecido.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 047

- **Código:** `        expect(router.resolveActionName('UNKNOWN')).toBeNull();`
- **Função:** Exercita mapping SCREAMING_CASE → nome canônico ou null para desconhecido.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 048

- **Código:** `        expect(router.identifySource({ tab: { url: 'https://gemini.google.com/app' } })).toBe('gemini');`
- **Função:** Exercita classificação da origem a partir de sender/tab URL/id da extensão.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 049

- **Código:** `        expect(router.identifySource({ tab: { url: 'https://reader.example/chapter' } })).toBe('content');`
- **Função:** Exercita classificação da origem a partir de sender/tab URL/id da extensão.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 050

- **Código:** `        expect(router.identifySource({ id: chrome.runtime.id })).toBe('popup');`
- **Função:** Exercita classificação da origem a partir de sender/tab URL/id da extensão.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 051

- **Código:** `        expect(router.identifySource({ id: 'outside-extension' })).toBe('external');`
- **Função:** Exercita classificação da origem a partir de sender/tab URL/id da extensão.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 052

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** mapping legado + identifySource.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `    test('despacha uma ação síncrona autorizada e preserva sua resposta', async () => {`
- **Função:** Declara cenário: ação síncrona autorizada.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `        const router = loadRouter();`
- **Função:** Compõe o cenário ação síncrona autorizada, preparando ou observando a política do router.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `        router.registerAction({`
- **Função:** Registra definição controlada no registry real para isolar a política do router.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `            name: 'get-tab-id',`
- **Função:** Compõe o cenário ação síncrona autorizada, preparando ou observando a política do router.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `            meta: { allowedSources: ['content'], async: false },`
- **Função:** Define origens aceitas e, quando async:false, semântica síncrona do caso.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `            validate: request => request.action === 'GET_TAB_ID' ? null : { code: 'INVALID_ACTION' },`
- **Função:** Fornece validator usado antes de execute.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `            execute: (_request, context) => ({ tabId: context.sender.tab.id }),`
- **Função:** Define implementação observável que o router deve executar apenas após gates de origem/validação.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `        const response = await dispatch(`
- **Função:** Despacha request pelo listener real e aguarda resultado.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa listener real; assertions subsequentes fixam o contrato.

### Linha 064

- **Código:** `            router.createMessageRouter({}),`
- **Função:** Cria listener do router real para o contexto do caso.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `            { action: 'GET_TAB_ID' },`
- **Função:** Usa nome legado conhecido pelo ACTION_MAP.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `            { tab: { id: 42, url: 'https://reader.example/chapter' } }`
- **Função:** Sender de content script, classificado como content.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `        expect(response).toEqual({ keepAlive: false, response: { ok: true, tabId: 42 } });`
- **Função:** Assertion focal sobre mapping, origem, execução, keepAlive ou resposta.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 070

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** ação síncrona autorizada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `    test('bloqueia origem não permitida antes de executar a ação', async () => {`
- **Função:** Declara cenário: SOURCE_DENIED antes de execute.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `        const router = loadRouter();`
- **Função:** Compõe o cenário SOURCE_DENIED antes de execute, preparando ou observando a política do router.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `        const execute = jest.fn();`
- **Função:** Compõe o cenário SOURCE_DENIED antes de execute, preparando ou observando a política do router.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `        router.registerAction({`
- **Função:** Registra definição controlada no registry real para isolar a política do router.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `            name: 'get-tab-id',`
- **Função:** Compõe o cenário SOURCE_DENIED antes de execute, preparando ou observando a política do router.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `            meta: { allowedSources: ['content'], async: false },`
- **Função:** Define origens aceitas e, quando async:false, semântica síncrona do caso.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `            execute,`
- **Função:** Compõe o cenário SOURCE_DENIED antes de execute, preparando ou observando a política do router.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `        const response = await dispatch(`
- **Função:** Despacha request pelo listener real e aguarda resultado.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa listener real; assertions subsequentes fixam o contrato.

### Linha 082

- **Código:** `            router.createMessageRouter({}),`
- **Função:** Cria listener do router real para o contexto do caso.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `            { action: 'GET_TAB_ID' },`
- **Função:** Usa nome legado conhecido pelo ACTION_MAP.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `            { id: chrome.runtime.id, tab: null }`
- **Função:** Sender com id da extensão, classificado como popup quando não há tab URL.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `        expect(execute).not.toHaveBeenCalled();`
- **Função:** Prova ausência de execute quando o gate de origem nega a requisição.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 088

- **Código:** `        expect(response).toEqual({`
- **Função:** Assertion focal sobre mapping, origem, execução, keepAlive ou resposta.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 089

- **Código:** `            keepAlive: false,`
- **Função:** Compõe o cenário SOURCE_DENIED antes de execute, preparando ou observando a política do router.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `            response: { ok: false, error: { code: 'SOURCE_DENIED' } },`
- **Função:** Exige erro estruturado de origem não permitida.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** SOURCE_DENIED antes de execute.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `    test('retorna falha de validação sem abrir canal assíncrono', async () => {`
- **Função:** Declara cenário: INVALID_PAYLOAD síncrono.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `        const router = loadRouter();`
- **Função:** Compõe o cenário INVALID_PAYLOAD síncrono, preparando ou observando a política do router.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `        router.registerAction({`
- **Função:** Registra definição controlada no registry real para isolar a política do router.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `            name: 'get-tab-id',`
- **Função:** Compõe o cenário INVALID_PAYLOAD síncrono, preparando ou observando a política do router.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `            meta: { allowedSources: ['content'], async: false },`
- **Função:** Define origens aceitas e, quando async:false, semântica síncrona do caso.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `            validate: () => ({ code: 'INVALID_PAYLOAD', message: 'Payload inválido' }),`
- **Função:** Fornece validator usado antes de execute.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `            execute: jest.fn(),`
- **Função:** Define implementação observável que o router deve executar apenas após gates de origem/validação.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `        const response = await dispatch(`
- **Função:** Despacha request pelo listener real e aguarda resultado.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa listener real; assertions subsequentes fixam o contrato.

### Linha 104

- **Código:** `            router.createMessageRouter({}),`
- **Função:** Cria listener do router real para o contexto do caso.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `            { action: 'GET_TAB_ID' },`
- **Função:** Usa nome legado conhecido pelo ACTION_MAP.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `            { tab: { id: 42, url: 'https://reader.example/chapter' } }`
- **Função:** Sender de content script, classificado como content.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `        expect(response).toEqual({`
- **Função:** Assertion focal sobre mapping, origem, execução, keepAlive ou resposta.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 110

- **Código:** `            keepAlive: false,`
- **Função:** Compõe o cenário INVALID_PAYLOAD síncrono, preparando ou observando a política do router.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `            response: { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Payload inválido' } },`
- **Função:** Exige erro estruturado devolvido diretamente pelo validator.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** INVALID_PAYLOAD síncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `    test('mantém aberto o canal de uma ação assíncrona até a resposta', async () => {`
- **Função:** Declara cenário: ação assíncrona e keepAlive.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `        const router = loadRouter();`
- **Função:** Compõe o cenário ação assíncrona e keepAlive, preparando ou observando a política do router.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `        router.registerAction({`
- **Função:** Registra definição controlada no registry real para isolar a política do router.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `            name: 'get-tab-id',`
- **Função:** Compõe o cenário ação assíncrona e keepAlive, preparando ou observando a política do router.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `            meta: { allowedSources: ['content'] },`
- **Função:** Define origens aceitas e, quando async:false, semântica síncrona do caso.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `            async execute(_request, context) {`
- **Função:** Define implementação observável que o router deve executar apenas após gates de origem/validação.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `                await Promise.resolve();`
- **Função:** Força pelo menos uma microtask antes de retornar resultado da action assíncrona.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `                return { tabId: context.sender.tab.id };`
- **Função:** Compõe o cenário ação assíncrona e keepAlive, preparando ou observando a política do router.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `            },`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `        const response = await dispatch(`
- **Função:** Despacha request pelo listener real e aguarda resultado.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa listener real; assertions subsequentes fixam o contrato.

### Linha 127

- **Código:** `            router.createMessageRouter({}),`
- **Função:** Cria listener do router real para o contexto do caso.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `            { action: 'GET_TAB_ID' },`
- **Função:** Usa nome legado conhecido pelo ACTION_MAP.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `            { tab: { id: 73, url: 'https://reader.example/chapter' } }`
- **Função:** Sender de content script, classificado como content.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `        expect(response).toEqual({ keepAlive: true, response: { ok: true, tabId: 73 } });`
- **Função:** Assertion focal sobre mapping, origem, execução, keepAlive ou resposta.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 133

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** ação assíncrona e keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `    test('aceita dependências explícitas sem substituir o sender do contexto', async () => {`
- **Função:** Declara cenário: contextFactory e preservação do sender.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** `        const router = loadRouter();`
- **Função:** Compõe o cenário contextFactory e preservação do sender, preparando ou observando a política do router.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `        router.registerAction({`
- **Função:** Registra definição controlada no registry real para isolar a política do router.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `            name: 'get-tab-id',`
- **Função:** Compõe o cenário contextFactory e preservação do sender, preparando ou observando a política do router.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `            meta: { allowedSources: ['content'], async: false },`
- **Função:** Define origens aceitas e, quando async:false, semântica síncrona do caso.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `            execute(_request, context) {`
- **Função:** Compõe o cenário contextFactory e preservação do sender, preparando ou observando a política do router.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `                return {`
- **Função:** Compõe o cenário contextFactory e preservação do sender, preparando ou observando a política do router.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `                    tabId: context.sender.tab.id,`
- **Função:** Compõe o cenário contextFactory e preservação do sender, preparando ou observando a política do router.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `                    activeMangaTabId: context.state.activeMangaTabId,`
- **Função:** Dependência injetada pelo contextFactory para provar composição de contexto.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `                };`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `            },`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `        const response = await dispatch(`
- **Função:** Despacha request pelo listener real e aguarda resultado.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa listener real; assertions subsequentes fixam o contrato.

### Linha 149

- **Código:** `            router.createMessageRouter({`
- **Função:** Cria listener do router real para o contexto do caso.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** `                contextFactory: () => ({ state: { activeMangaTabId: 91 } }),`
- **Função:** Dependência injetada pelo contextFactory para provar composição de contexto.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `            }),`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `            { action: 'GET_TAB_ID' },`
- **Função:** Usa nome legado conhecido pelo ACTION_MAP.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `            { tab: { id: 44, url: 'https://reader.example/chapter' } }`
- **Função:** Sender de content script, classificado como content.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `        expect(response).toEqual({`
- **Função:** Assertion focal sobre mapping, origem, execução, keepAlive ou resposta.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 157

- **Código:** `            keepAlive: false,`
- **Função:** Compõe o cenário contextFactory e preservação do sender, preparando ou observando a política do router.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `            response: { ok: true, tabId: 44, activeMangaTabId: 91 },`
- **Função:** Dependência injetada pelo contextFactory para provar composição de contexto.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** contextFactory e preservação do sender.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `});`
- **Função:** Fecha/organiza o bloco sintático anterior.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Posição 162 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 14. Conclusão documental

Foram documentadas 161 linhas textuais e a posição 162 do newline final. O mesmo blob está verde em Node 20/22; as três lacunas abertas são branches de proteção do router, não contradições dos seis contratos diretamente provados.

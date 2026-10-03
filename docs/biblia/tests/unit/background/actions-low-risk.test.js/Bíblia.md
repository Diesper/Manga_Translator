# Bíblia técnica — actions-low-risk.test.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `e5d4d54674b5a4a3b00dc15112afb40c874d81c3`  
> **Agente responsável pela auditoria:** AGENTE 12  
> **Tipo:** suíte Jest unitária/integrada do roteador e actions reais de background  
> **Linhas textuais:** **180**  
> **Posições documentais:** **181**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/unit/background/actions-low-risk.test.js` carrega o **roteador real** do background e cinco módulos reais de ação: `check-extraction-tab`, `get-tab-id`, `log-entry`, `relay-progress` e `set-debug-mode`. O teste não duplica a lógica dessas actions; apenas adapta o contrato callback/keepAlive do listener e fornece Chrome mocks/estado controlado.

A suíte pertence ao projeto Jest `background`, em ambiente Node com `tests/mocks/chrome-api.mock.js` carregado por `setupFilesAfterEnv`.

## 2. Infraestrutura de teste

### `dispatch`

Converte o listener callback-based em Promise e preserva duas dimensões do contrato: o booleano `keepAlive` e o payload entregue a `sendResponse`. Isso permite distinguir actions síncronas (`keepAlive: false`) das assíncronas (`true`).

### `loadActions`

Configura `self`, `MangaTranslatorState` e logger; remove registry anterior; em `jest.isolateModules` carrega primeiro `router.js` e depois os cinco actions. O resultado é a API real do router, não uma reconstrução local das actions.

## 3. Comportamentos diretamente provados

### GET_TAB_ID

Com sender Gemini de tab 41, a resposta completa é `{ keepAlive: false, response: { ok: true, tabId: 41 } }`. Isso prova action síncrona, mapeamento legado do router e extração do tab id.

### LOG_ENTRY

A mensagem com level/source/action_name/detail/extra retorna `ok: true` sem payload adicional e chama `MangaTranslatorLog.log` com os cinco valores, preservando o contrato legado.

### CHECK_IF_EXTRACTION_TAB

Com `extractionTabs[61]` previamente injetado, o handler aguarda `ensureInitialized`, identifica a aba remetente e retorna o mapping persistido inteiro, incluindo `mangaTabId`, `index`, `geminiTabId` e `jobId`. O `keepAlive: true` prova o caminho assíncrono.

### GEMINI_PROGRESS / relay-progress

O cenário cria uma aba mangá real no mock, instala receptor, semeia `gemini_job_32` e envia progresso a partir da aba Gemini 32. As assertions provam simultaneamente:
- resposta assíncrona `ok: true`;
- mensagem `{ action: 'PROGRESS', text: ... }` para a aba mangá;
- transição persistida do job para `state: 'running'` preservando `jobId`.

### SET_DEBUG_MODE

O cenário válido prova persistência de `debugMode: true` e broadcast `DEBUG_MODE_CHANGED` para duas abas. O cenário inválido prova rejeição síncrona de `debugOn: 'true'` com `INVALID_PAYLOAD` e mensagem exata.

## 4. Cruzamento com os handlers reais

- `get-tab-id.js` declara `async: false` e retorna sender tab ou null.
- `log-entry.js` possui validação de strings opcionais e exige `extra` objeto quando informado; a suíte atual prova apenas o payload válido.
- `check-extraction-tab.js` chama `context.ensureInitialized()` e busca `context.state.extractionTabs[tabId]`.
- `relay-progress.js` escolhe `request.mangaTabId || activeMangaTabId`, envia PROGRESS e atualiza job do sender para running.
- `set-debug-mode.js` valida booleano, persiste a opção, consulta todas as abas e faz broadcast.

## 5. Evidência automatizada examinada

| Propriedade | Prova | Classificação |
|---|---|---|
| GET_TAB_ID retorna tab remetente e é síncrono | equality da resposta completa | ✅ PROVADO DIRETAMENTE |
| LOG_ENTRY encaminha cinco argumentos e retorna ok | equality + `toHaveBeenCalledWith` | ✅ PROVADO DIRETAMENTE |
| mapping positivo de extraction tab | equality detalhada da resposta | ✅ PROVADO DIRETAMENTE |
| relay envia PROGRESS | `toContainEqual` no receptor da aba | ✅ PROVADO DIRETAMENTE |
| relay marca job como running | leitura real do storage mock + `objectContaining` | ✅ PROVADO DIRETAMENTE |
| debug mode persiste | leitura do storage | ✅ PROVADO DIRETAMENTE |
| debug mode faz broadcast em duas abas | duas collections com `toContainEqual` | ✅ PROVADO DIRETAMENTE |
| debugOn string é rejeitado | equality de INVALID_PAYLOAD | ✅ PROVADO DIRETAMENTE |
| GET_TAB_ID sem aba | outra suíte `gtc-runtime-bridge.test.js` contém assertion de `tabId: null` | ✅ PROVADO DIRETAMENTE FORA DESTE ARQUIVO |
| extraction tab ausente | `plan-missing-handlers-real.test.js` prova `isExtractionTab: false` | ✅ PROVADO DIRETAMENTE FORA DESTE ARQUIVO |
| validação negativa de LOG_ENTRY | busca encontrou apenas implementação, não assertion específica | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Limitações e riscos

1. A suíte não carrega `background.js` inteiro; prova o router e actions reais diretamente.
2. `contextFactory` de extraction injeta `ensureInitialized`; portanto, bootstrap/reidratação completa pertence a suites de lifecycle.
3. O relay usa `activeMangaTabId`; o branch de `request.mangaTabId` explícito é coberto por outras suites roteadas, não por este caso.
4. O `LOG_ENTRY` válido está bem provado, mas os caminhos de validação de tipos em `log-entry.js` não têm assertion específica localizada.
5. Erros de `chrome.tabs.sendMessage` são deliberadamente ignorados pelos handlers de relay/debug e não são observados nesta suíte.
6. O helper `dispatch` depende de actions assíncronas eventualmente chamarem `sendResponse`; uma action que nunca responde faria o teste aguardar até o timeout global do Jest.

## 7. Invariantes

1. O router precisa ser carregado antes das actions que chamam `registerAction`.
2. Cada teste deve iniciar com módulos/storage limpos.
3. Actions síncronas devem retornar `keepAlive: false`; as assíncronas exercitadas devem manter o canal com `true`.
4. `LOG_ENTRY` não deve modificar os cinco valores antes de encaminhá-los ao logger.
5. `CHECK_IF_EXTRACTION_TAB` deve devolver mapping associado ao id da aba remetente.
6. `GEMINI_PROGRESS` deve preservar os demais campos do job ao mudar `state` para running.
7. `SET_DEBUG_MODE` só aceita boolean e deve persistir antes do broadcast.
8. As assertions só representam implementação real enquanto `ACTION_PATHS` continuar apontando aos módulos de produção.
9. O SHA desta Bíblia só permanece válido enquanto o fonte for `e5d4d54674b5a4a3b00dc15112afb40c874d81c3`.

## 8. Lacunas e solicitação ao auditor

- **129-001 — TEST_REQUIRED — OPEN:** adicionar assertions diretas para a função `validate` real de `log-entry.js`: ao menos um campo textual com tipo não-string e `extra` nulo/array devem retornar `INVALID_PAYLOAD`, sem chamar o logger.

## 9. Fonte integral auditada

```javascript
const path = require('path');

const { getStorageMock, getTabsMock } = require('../../mocks/chrome-api.mock.js');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATHS = [
    'check-extraction-tab.js',
    'get-tab-id.js',
    'log-entry.js',
    'relay-progress.js',
    'set-debug-mode.js',
].map(file => path.resolve(__dirname, '../../../extension/background/actions', file));

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

function loadActions(state = {}) {
    global.self = global;
    global.MangaTranslatorState = state;
    global.MangaTranslatorLog = { log: jest.fn() };
    delete global.MangaTranslatorRouter;

    jest.isolateModules(() => {
        require(ROUTER_PATH);
        ACTION_PATHS.forEach(require);
    });

    return global.MangaTranslatorRouter;
}

describe('ações de baixo risco do background', () => {
    let storageMock;
    let tabsMock;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
    });

    afterEach(() => {
        delete global.MangaTranslatorLog;
        delete global.MangaTranslatorRouter;
        delete global.MangaTranslatorState;
    });

    test('get-tab-id retorna a aba Gemini remetente', async () => {
        const router = loadActions();
        const response = await dispatch(router.createMessageRouter({}), { action: 'GET_TAB_ID' }, {
            tab: { id: 41, url: 'https://gemini.google.com/app' },
        });

        expect(response).toEqual({ keepAlive: false, response: { ok: true, tabId: 41 } });
    });

    test('log-entry encaminha a entrada sem alterar a resposta legada', async () => {
        const router = loadActions();
        const response = await dispatch(router.createMessageRouter({}), {
            action: 'LOG_ENTRY',
            level: 'info',
            source: 'manga',
            action_name: 'CACHE_HIT',
            detail: 'Imagem atendida pelo cache',
            extra: { index: 3 },
        }, { tab: { id: 22, url: 'https://reader.example/chapter' } });

        expect(response).toEqual({ keepAlive: false, response: { ok: true } });
        expect(global.MangaTranslatorLog.log).toHaveBeenCalledWith(
            'info', 'manga', 'CACHE_HIT', 'Imagem atendida pelo cache', { index: 3 }
        );
    });

    test('check-extraction-tab devolve o mapeamento persistido da aba remetente', async () => {
        const router = loadActions({
            extractionTabs: {
                61: { mangaTabId: 7, index: 4, geminiTabId: 32, jobId: 'job-1' },
            },
        });
        const response = await dispatch(router.createMessageRouter({
            contextFactory: () => ({ ensureInitialized: jest.fn().mockResolvedValue() }),
        }), {
            action: 'CHECK_IF_EXTRACTION_TAB',
        }, { tab: { id: 61, url: 'https://cdn.example/result.png' } });

        expect(response).toEqual({
            keepAlive: true,
            response: {
                ok: true,
                isExtractionTab: true,
                mangaTabId: 7,
                index: 4,
                geminiTabId: 32,
                jobId: 'job-1',
            },
        });
    });

    test('relay-progress encaminha progresso e marca o job Gemini como running', async () => {
        const mangaTab = await tabsMock.create({ url: 'https://reader.example/chapter' });
        const messages = [];
        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            messages.push(message);
            sendResponse({ ok: true });
        });
        await storageMock.set({
            gemini_job_32: { jobId: 'job-1', state: 'opening' },
        });

        const router = loadActions({ activeMangaTabId: mangaTab.id });
        const response = await dispatch(router.createMessageRouter({}), {
            action: 'GEMINI_PROGRESS',
            text: 'Gerando tradução...',
        }, { tab: { id: 32, url: 'https://gemini.google.com/app' } });

        expect(response).toEqual({ keepAlive: true, response: { ok: true } });
        expect(messages).toContainEqual({ action: 'PROGRESS', text: 'Gerando tradução...' });
        expect(await storageMock.get(['gemini_job_32'])).toEqual({
            gemini_job_32: expect.objectContaining({ jobId: 'job-1', state: 'running' }),
        });
    });

    test('set-debug-mode persiste a opção e avisa todas as abas', async () => {
        const firstTab = await tabsMock.create({ url: 'https://reader.example/one' });
        const secondTab = await tabsMock.create({ url: 'https://reader.example/two' });
        const firstMessages = [];
        const secondMessages = [];
        tabsMock._registerMessageHandler(firstTab.id, (message, _sender, sendResponse) => {
            firstMessages.push(message);
            sendResponse({ ok: true });
        });
        tabsMock._registerMessageHandler(secondTab.id, (message, _sender, sendResponse) => {
            secondMessages.push(message);
            sendResponse({ ok: true });
        });

        const router = loadActions();
        const response = await dispatch(router.createMessageRouter({}), {
            action: 'SET_DEBUG_MODE',
            debugOn: true,
        }, { id: chrome.runtime.id, tab: null });

        expect(response).toEqual({ keepAlive: true, response: { ok: true } });
        expect(await storageMock.get(['debugMode'])).toEqual({ debugMode: true });
        expect(firstMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
        expect(secondMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
    });

    test('set-debug-mode rejeita payload inválido', async () => {
        const router = loadActions();
        const response = await dispatch(router.createMessageRouter({}), {
            action: 'SET_DEBUG_MODE',
            debugOn: 'true',
        }, { id: chrome.runtime.id, tab: null });

        expect(response).toEqual({
            keepAlive: false,
            response: {
                ok: false,
                error: { code: 'INVALID_PAYLOAD', message: 'debugOn deve ser um booleano' },
            },
        });
    });
});
```

## 10. Cobertura linha a linha

### Linha 1

**Fonte:** `const path = require('path');`

**Função:** Carrega `path` para resolver, a partir de `__dirname`, o roteador e os cinco módulos de ação reais.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 2

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `const path = require('path');` do bloco seguinte `const { getStorageMock, getTabsMock } = require('../../mocks/chrome-api.mock.js');`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 3

**Fonte:** `const { getStorageMock, getTabsMock } = require('../../mocks/chrome-api.mock.js');`

**Função:** Importa os mocks compartilhados de storage e abas usados para observar persistência e mensagens reais dos handlers.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 4

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `const { getStorageMock, getTabsMock } = require('../../mocks/chrome-api.mock.js');` do bloco seguinte `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 5

**Fonte:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`

**Função:** Resolve o caminho absoluto do `extension/background/router.js` real que registrará e despachará as ações.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 6

**Fonte:** `const ACTION_PATHS = [`

**Função:** Inicia a lista dos cinco módulos reais de ação carregados pela suíte.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — a própria suíte fixa explicitamente quais módulos reais serão carregados.

### Linha 7

**Fonte:** `    'check-extraction-tab.js',`

**Função:** Inclui o módulo `check-extraction-tab.js` na lista de ações reais carregadas pela suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 8

**Fonte:** `    'get-tab-id.js',`

**Função:** Inclui o módulo `get-tab-id.js` na lista de ações reais carregadas pela suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 9

**Fonte:** `    'log-entry.js',`

**Função:** Inclui o módulo `log-entry.js` na lista de ações reais carregadas pela suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 10

**Fonte:** `    'relay-progress.js',`

**Função:** Inclui o módulo `relay-progress.js` na lista de ações reais carregadas pela suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 11

**Fonte:** `    'set-debug-mode.js',`

**Função:** Inclui o módulo `set-debug-mode.js` na lista de ações reais carregadas pela suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 12

**Fonte:** `].map(file => path.resolve(__dirname, '../../../extension/background/actions', file));`

**Função:** Converte cada nome da lista em caminho absoluto dentro de `extension/background/actions`, evitando dependência do cwd.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 13

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `].map(file => path.resolve(__dirname, '../../../extension/background/actions', file));` do bloco seguinte `function dispatch(listener, request, sender) {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 14

**Fonte:** `function dispatch(listener, request, sender) {`

**Função:** Inicia o helper `dispatch` com `listener, request, sender`; este helper participa da montagem ou despacho real da suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 15

**Fonte:** `    return new Promise(resolve => {`

**Função:** Cria uma Promise para adaptar o contrato callback/keepAlive do listener Chrome a uma resposta aguardável pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 16

**Fonte:** `        let keepAlive;`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `let keepAlive;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 17

**Fonte:** `        let delivered = false;`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `let delivered = false;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 18

**Fonte:** `        let deliveredResponse;`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `let deliveredResponse;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 19

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `let deliveredResponse;` do bloco seguinte `const sendResponse = response => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 20

**Fonte:** `        const sendResponse = response => {`

**Função:** Define o callback de resposta do runtime simulado e registra tanto a entrega quanto o payload recebido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 21

**Fonte:** `            delivered = true;`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `delivered = true;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 22

**Fonte:** `            deliveredResponse = response;`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `deliveredResponse = response;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 23

**Fonte:** `            if (keepAlive !== undefined) resolve({ keepAlive, response });`

**Função:** Avalia `if (keepAlive !== undefined) resolve({ keepAlive, response });`, controlando quando o helper encerra ou entrega a resposta.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 24

**Fonte:** `        };`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `keepAlive = listener(request, sender, sendResponse);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 25

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `};` do bloco seguinte `keepAlive = listener(request, sender, sendResponse);`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 26

**Fonte:** `        keepAlive = listener(request, sender, sendResponse);`

**Função:** Invoca o roteador real com request/sender/sendResponse e captura o booleano de keep-alive retornado pelo listener.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 27

**Fonte:** `        if (delivered || keepAlive === false) {`

**Função:** Resolve imediatamente quando já houve resposta síncrona ou quando o listener declara que não manterá o canal aberto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 28

**Fonte:** `            resolve({ keepAlive, response: delivered ? deliveredResponse : undefined });`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `resolve({ keepAlive, response: delivered ? deliveredResponse : undefined });`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 29

**Fonte:** `        }`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 30

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 31

**Fonte:** `}`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `function loadActions(state = {}) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 32

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}` do bloco seguinte `function loadActions(state = {}) {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 33

**Fonte:** `function loadActions(state = {}) {`

**Função:** Inicia o helper `loadActions` com `state = {}`; este helper participa da montagem ou despacho real da suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 34

**Fonte:** `    global.self = global;`

**Função:** Faz o ambiente Node representar `self`, permitindo que os IIFEs dos módulos de background registrem APIs no escopo global.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 35

**Fonte:** `    global.MangaTranslatorState = state;`

**Função:** Injeta o estado específico do cenário para que handlers reais leiam `context.state` através do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 36

**Fonte:** `    global.MangaTranslatorLog = { log: jest.fn() };`

**Função:** Instala logger Jest observável para provar o encaminhamento de `LOG_ENTRY`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 37

**Fonte:** `    delete global.MangaTranslatorRouter;`

**Função:** Remove registro anterior do roteador antes de recarregar módulos isoladamente, evitando registry contaminado entre testes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 38

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `delete global.MangaTranslatorRouter;` do bloco seguinte `jest.isolateModules(() => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 39

**Fonte:** `    jest.isolateModules(() => {`

**Função:** Abre um registry de módulos isolado para executar novamente os side effects de registro das ações.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 40

**Fonte:** `        require(ROUTER_PATH);`

**Função:** Carrega o roteador real antes das ações, criando `MangaTranslatorRouter.registerAction` no escopo.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — a própria suíte fixa explicitamente quais módulos reais serão carregados.

### Linha 41

**Fonte:** `        ACTION_PATHS.forEach(require);`

**Função:** Carrega cada um dos cinco handlers reais; cada módulo registra sua action definition no roteador.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — a própria suíte fixa explicitamente quais módulos reais serão carregados.

### Linha 42

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `return global.MangaTranslatorRouter;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 43

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `return global.MangaTranslatorRouter;`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 44

**Fonte:** `    return global.MangaTranslatorRouter;`

**Função:** Devolve a API real do roteador já populada com as ações da suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 45

**Fonte:** `}`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `describe('ações de baixo risco do background', () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 46

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}` do bloco seguinte `describe('ações de baixo risco do background', () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 47

**Fonte:** `describe('ações de baixo risco do background', () => {`

**Função:** Abre a suíte Jest das ações de background consideradas de baixo risco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 48

**Fonte:** `    let storageMock;`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `let storageMock;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 49

**Fonte:** `    let tabsMock;`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `let tabsMock;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 50

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `let tabsMock;` do bloco seguinte `beforeEach(async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 51

**Fonte:** `    beforeEach(async () => {`

**Função:** Inicia setup por cenário para resetar módulos e obter mocks limpos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 52

**Fonte:** `        jest.resetModules();`

**Função:** Limpa cache global de módulos do Jest antes de nova montagem do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 53

**Fonte:** `        storageMock = getStorageMock();`

**Função:** Obtém o storage mock compartilhado usado pelas actions via `chrome.storage.local`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 54

**Fonte:** `        tabsMock = getTabsMock();`

**Função:** Obtém o tabs mock compartilhado usado para criar abas e capturar `sendMessage`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 55

**Fonte:** `        await storageMock.clear();`

**Função:** Zera storage antes do cenário, garantindo que persistência observada foi criada pelo próprio teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 56

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `afterEach(() => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 57

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `afterEach(() => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 58

**Fonte:** `    afterEach(() => {`

**Função:** Inicia teardown que remove globals instalados por `loadActions`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 59

**Fonte:** `        delete global.MangaTranslatorLog;`

**Função:** Remove `global.MangaTranslatorLog` para impedir vazamento de estado para o próximo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 60

**Fonte:** `        delete global.MangaTranslatorRouter;`

**Função:** Remove registro anterior do roteador antes de recarregar módulos isoladamente, evitando registry contaminado entre testes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 61

**Fonte:** `        delete global.MangaTranslatorState;`

**Função:** Remove `global.MangaTranslatorState` para impedir vazamento de estado para o próximo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 62

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('get-tab-id retorna a aba Gemini remetente', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 63

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('get-tab-id retorna a aba Gemini remetente', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 64

**Fonte:** `    test('get-tab-id retorna a aba Gemini remetente', async () => {`

**Função:** Registra o caso Jest `get-tab-id retorna a aba Gemini remetente`; as assertions seguintes definem a prova direta do comportamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 65

**Fonte:** `        const router = loadActions();`

**Função:** Monta o roteador com as implementações reais e, quando fornecido, estado/contextFactory controlado pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 66

**Fonte:** `        const response = await dispatch(router.createMessageRouter({}), { action: 'GET_TAB_ID' }, {`

**Função:** Despacha uma mensagem através do listener real e aguarda o par `{ keepAlive, response }` produzido pelo contrato do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 67

**Fonte:** `            tab: { id: 41, url: 'https://gemini.google.com/app' },`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `tab: { id: 41, url: 'https://gemini.google.com/app' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 68

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `expect(response).toEqual({ keepAlive: false, response: { ok: true, tabId: 41 } });`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 69

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `expect(response).toEqual({ keepAlive: false, response: { ok: true, tabId: 41 } });`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 70

**Fonte:** `        expect(response).toEqual({ keepAlive: false, response: { ok: true, tabId: 41 } });`

**Função:** Assertion Jest direta `expect(response).toEqual({ keepAlive: false, response: { ok: true, tabId: 41 } });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 71

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('log-entry encaminha a entrada sem alterar a resposta legada', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 72

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('log-entry encaminha a entrada sem alterar a resposta legada', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 73

**Fonte:** `    test('log-entry encaminha a entrada sem alterar a resposta legada', async () => {`

**Função:** Registra o caso Jest `log-entry encaminha a entrada sem alterar a resposta legada`; as assertions seguintes definem a prova direta do comportamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 74

**Fonte:** `        const router = loadActions();`

**Função:** Monta o roteador com as implementações reais e, quando fornecido, estado/contextFactory controlado pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 75

**Fonte:** `        const response = await dispatch(router.createMessageRouter({}), {`

**Função:** Despacha uma mensagem através do listener real e aguarda o par `{ keepAlive, response }` produzido pelo contrato do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 76

**Fonte:** `            action: 'LOG_ENTRY',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `action: 'LOG_ENTRY',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 77

**Fonte:** `            level: 'info',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `level: 'info',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 78

**Fonte:** `            source: 'manga',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `source: 'manga',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 79

**Fonte:** `            action_name: 'CACHE_HIT',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `action_name: 'CACHE_HIT',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 80

**Fonte:** `            detail: 'Imagem atendida pelo cache',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `detail: 'Imagem atendida pelo cache',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 81

**Fonte:** `            extra: { index: 3 },`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `extra: { index: 3 },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 82

**Fonte:** `        }, { tab: { id: 22, url: 'https://reader.example/chapter' } });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `expect(response).toEqual({ keepAlive: false, response: { ok: true } });`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 83

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}, { tab: { id: 22, url: 'https://reader.example/chapter' } });` do bloco seguinte `expect(response).toEqual({ keepAlive: false, response: { ok: true } });`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 84

**Fonte:** `        expect(response).toEqual({ keepAlive: false, response: { ok: true } });`

**Função:** Assertion Jest direta `expect(response).toEqual({ keepAlive: false, response: { ok: true } });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 85

**Fonte:** `        expect(global.MangaTranslatorLog.log).toHaveBeenCalledWith(`

**Função:** Assertion Jest direta `expect(global.MangaTranslatorLog.log).toHaveBeenCalledWith(`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 86

**Fonte:** `            'info', 'manga', 'CACHE_HIT', 'Imagem atendida pelo cache', { index: 3 }`

**Função:** Inclui o módulo `info manga CACHE_HIT Imagem atendida pelo cache { index: 3 }` na lista de ações reais carregadas pela suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 87

**Fonte:** `        );`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 88

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('check-extraction-tab devolve o mapeamento persistido da aba remetente', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 89

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('check-extraction-tab devolve o mapeamento persistido da aba remetente', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 90

**Fonte:** `    test('check-extraction-tab devolve o mapeamento persistido da aba remetente', async () => {`

**Função:** Registra o caso Jest `check-extraction-tab devolve o mapeamento persistido da aba remetente`; as assertions seguintes definem a prova direta do comportamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 91

**Fonte:** `        const router = loadActions({`

**Função:** Monta o roteador com as implementações reais e, quando fornecido, estado/contextFactory controlado pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 92

**Fonte:** `            extractionTabs: {`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `extractionTabs: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 93

**Fonte:** `                61: { mangaTabId: 7, index: 4, geminiTabId: 32, jobId: 'job-1' },`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `61: { mangaTabId: 7, index: 4, geminiTabId: 32, jobId: 'job-1' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 94

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 95

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `const response = await dispatch(router.createMessageRouter({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 96

**Fonte:** `        const response = await dispatch(router.createMessageRouter({`

**Função:** Despacha uma mensagem através do listener real e aguarda o par `{ keepAlive, response }` produzido pelo contrato do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 97

**Fonte:** `            contextFactory: () => ({ ensureInitialized: jest.fn().mockResolvedValue() }),`

**Função:** Injeta apenas `ensureInitialized` no contexto desse cenário, permitindo que `check-extraction-tab` execute seu await sem carregar o bootstrap inteiro do background.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 98

**Fonte:** `        }), {`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `action: 'CHECK_IF_EXTRACTION_TAB',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 99

**Fonte:** `            action: 'CHECK_IF_EXTRACTION_TAB',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `action: 'CHECK_IF_EXTRACTION_TAB',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 100

**Fonte:** `        }, { tab: { id: 61, url: 'https://cdn.example/result.png' } });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `expect(response).toEqual({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 101

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}, { tab: { id: 61, url: 'https://cdn.example/result.png' } });` do bloco seguinte `expect(response).toEqual({`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 102

**Fonte:** `        expect(response).toEqual({`

**Função:** Assertion Jest direta `expect(response).toEqual({`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 103

**Fonte:** `            keepAlive: true,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `keepAlive: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 104

**Fonte:** `            response: {`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `response: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 105

**Fonte:** `                ok: true,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `ok: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 106

**Fonte:** `                isExtractionTab: true,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `isExtractionTab: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 107

**Fonte:** `                mangaTabId: 7,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `mangaTabId: 7,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 108

**Fonte:** `                index: 4,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `index: 4,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 109

**Fonte:** `                geminiTabId: 32,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `geminiTabId: 32,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 110

**Fonte:** `                jobId: 'job-1',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `jobId: 'job-1',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 111

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 112

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 113

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('relay-progress encaminha progresso e marca o job Gemini como running', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 114

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('relay-progress encaminha progresso e marca o job Gemini como running', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 115

**Fonte:** `    test('relay-progress encaminha progresso e marca o job Gemini como running', async () => {`

**Função:** Registra o caso Jest `relay-progress encaminha progresso e marca o job Gemini como running`; as assertions seguintes definem a prova direta do comportamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 116

**Fonte:** `        const mangaTab = await tabsMock.create({ url: 'https://reader.example/chapter' });`

**Função:** Cria uma aba no mock Chrome; seu id real do mock é usado como alvo da action, sem hardcode do identificador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 117

**Fonte:** `        const messages = [];`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `const messages = [];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 118

**Fonte:** `        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {`

**Função:** Registra receptor na aba simulada para capturar mensagens enviadas por `chrome.tabs.sendMessage`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 119

**Fonte:** `            messages.push(message);`

**Função:** Registra a mensagem entregue à aba simulada para comparação posterior com o payload esperado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 120

**Fonte:** `            sendResponse({ ok: true });`

**Função:** Simula confirmação da aba destinatária para que a action complete o relay de mensagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 121

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `await storageMock.set({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 122

**Fonte:** `        await storageMock.set({`

**Função:** Pré-carrega o estado persistente requerido pelo cenário antes de executar o handler real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 123

**Fonte:** `            gemini_job_32: { jobId: 'job-1', state: 'opening' },`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `gemini_job_32: { jobId: 'job-1', state: 'opening' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 124

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `const router = loadActions({ activeMangaTabId: mangaTab.id });`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 125

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `const router = loadActions({ activeMangaTabId: mangaTab.id });`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 126

**Fonte:** `        const router = loadActions({ activeMangaTabId: mangaTab.id });`

**Função:** Monta o roteador com as implementações reais e, quando fornecido, estado/contextFactory controlado pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 127

**Fonte:** `        const response = await dispatch(router.createMessageRouter({}), {`

**Função:** Despacha uma mensagem através do listener real e aguarda o par `{ keepAlive, response }` produzido pelo contrato do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 128

**Fonte:** `            action: 'GEMINI_PROGRESS',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `action: 'GEMINI_PROGRESS',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 129

**Fonte:** `            text: 'Gerando tradução...',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `text: 'Gerando tradução...',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 130

**Fonte:** `        }, { tab: { id: 32, url: 'https://gemini.google.com/app' } });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `expect(response).toEqual({ keepAlive: true, response: { ok: true } });`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 131

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}, { tab: { id: 32, url: 'https://gemini.google.com/app' } });` do bloco seguinte `expect(response).toEqual({ keepAlive: true, response: { ok: true } });`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 132

**Fonte:** `        expect(response).toEqual({ keepAlive: true, response: { ok: true } });`

**Função:** Assertion Jest direta `expect(response).toEqual({ keepAlive: true, response: { ok: true } });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 133

**Fonte:** `        expect(messages).toContainEqual({ action: 'PROGRESS', text: 'Gerando tradução...' });`

**Função:** Assertion Jest direta `expect(messages).toContainEqual({ action: 'PROGRESS', text: 'Gerando tradução...' });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 134

**Fonte:** `        expect(await storageMock.get(['gemini_job_32'])).toEqual({`

**Função:** Assertion Jest direta `expect(await storageMock.get(['gemini_job_32'])).toEqual({`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 135

**Fonte:** `            gemini_job_32: expect.objectContaining({ jobId: 'job-1', state: 'running' }),`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `gemini_job_32: expect.objectContaining({ jobId: 'job-1', state: 'running' }),`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 136

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 137

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('set-debug-mode persiste a opção e avisa todas as abas', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 138

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('set-debug-mode persiste a opção e avisa todas as abas', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 139

**Fonte:** `    test('set-debug-mode persiste a opção e avisa todas as abas', async () => {`

**Função:** Registra o caso Jest `set-debug-mode persiste a opção e avisa todas as abas`; as assertions seguintes definem a prova direta do comportamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 140

**Fonte:** `        const firstTab = await tabsMock.create({ url: 'https://reader.example/one' });`

**Função:** Cria uma aba no mock Chrome; seu id real do mock é usado como alvo da action, sem hardcode do identificador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 141

**Fonte:** `        const secondTab = await tabsMock.create({ url: 'https://reader.example/two' });`

**Função:** Cria uma aba no mock Chrome; seu id real do mock é usado como alvo da action, sem hardcode do identificador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 142

**Fonte:** `        const firstMessages = [];`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `const firstMessages = [];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 143

**Fonte:** `        const secondMessages = [];`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `const secondMessages = [];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 144

**Fonte:** `        tabsMock._registerMessageHandler(firstTab.id, (message, _sender, sendResponse) => {`

**Função:** Registra receptor na aba simulada para capturar mensagens enviadas por `chrome.tabs.sendMessage`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 145

**Fonte:** `            firstMessages.push(message);`

**Função:** Registra a mensagem entregue à aba simulada para comparação posterior com o payload esperado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 146

**Fonte:** `            sendResponse({ ok: true });`

**Função:** Simula confirmação da aba destinatária para que a action complete o relay de mensagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 147

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `tabsMock._registerMessageHandler(secondTab.id, (message, _sender, sendResponse) => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 148

**Fonte:** `        tabsMock._registerMessageHandler(secondTab.id, (message, _sender, sendResponse) => {`

**Função:** Registra receptor na aba simulada para capturar mensagens enviadas por `chrome.tabs.sendMessage`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 149

**Fonte:** `            secondMessages.push(message);`

**Função:** Registra a mensagem entregue à aba simulada para comparação posterior com o payload esperado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 150

**Fonte:** `            sendResponse({ ok: true });`

**Função:** Simula confirmação da aba destinatária para que a action complete o relay de mensagem.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 151

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `const router = loadActions();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 152

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `const router = loadActions();`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 153

**Fonte:** `        const router = loadActions();`

**Função:** Monta o roteador com as implementações reais e, quando fornecido, estado/contextFactory controlado pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 154

**Fonte:** `        const response = await dispatch(router.createMessageRouter({}), {`

**Função:** Despacha uma mensagem através do listener real e aguarda o par `{ keepAlive, response }` produzido pelo contrato do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 155

**Fonte:** `            action: 'SET_DEBUG_MODE',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `action: 'SET_DEBUG_MODE',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 156

**Fonte:** `            debugOn: true,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `debugOn: true,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 157

**Fonte:** `        }, { id: chrome.runtime.id, tab: null });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `expect(response).toEqual({ keepAlive: true, response: { ok: true } });`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 158

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}, { id: chrome.runtime.id, tab: null });` do bloco seguinte `expect(response).toEqual({ keepAlive: true, response: { ok: true } });`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 159

**Fonte:** `        expect(response).toEqual({ keepAlive: true, response: { ok: true } });`

**Função:** Assertion Jest direta `expect(response).toEqual({ keepAlive: true, response: { ok: true } });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 160

**Fonte:** `        expect(await storageMock.get(['debugMode'])).toEqual({ debugMode: true });`

**Função:** Assertion Jest direta `expect(await storageMock.get(['debugMode'])).toEqual({ debugMode: true });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 161

**Fonte:** `        expect(firstMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });`

**Função:** Assertion Jest direta `expect(firstMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 162

**Fonte:** `        expect(secondMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });`

**Função:** Assertion Jest direta `expect(secondMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 163

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('set-debug-mode rejeita payload inválido', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 164

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte `test('set-debug-mode rejeita payload inválido', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 165

**Fonte:** `    test('set-debug-mode rejeita payload inválido', async () => {`

**Função:** Registra o caso Jest `set-debug-mode rejeita payload inválido`; as assertions seguintes definem a prova direta do comportamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 166

**Fonte:** `        const router = loadActions();`

**Função:** Monta o roteador com as implementações reais e, quando fornecido, estado/contextFactory controlado pelo teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 167

**Fonte:** `        const response = await dispatch(router.createMessageRouter({}), {`

**Função:** Despacha uma mensagem através do listener real e aguarda o par `{ keepAlive, response }` produzido pelo contrato do roteador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 168

**Fonte:** `            action: 'SET_DEBUG_MODE',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `action: 'SET_DEBUG_MODE',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 169

**Fonte:** `            debugOn: 'true',`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `debugOn: 'true',`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 170

**Fonte:** `        }, { id: chrome.runtime.id, tab: null });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `expect(response).toEqual({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 171

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `}, { id: chrome.runtime.id, tab: null });` do bloco seguinte `expect(response).toEqual({`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 172

**Fonte:** `        expect(response).toEqual({`

**Função:** Assertion Jest direta `expect(response).toEqual({`; ela falha se a propriedade observada da implementação real divergir.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion específica sobre resposta, persistência, log ou mensagem produzida pelos módulos reais carregados pela suíte.

### Linha 173

**Fonte:** `            keepAlive: false,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `keepAlive: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 174

**Fonte:** `            response: {`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `response: {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 175

**Fonte:** `                ok: false,`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `ok: false,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 176

**Fonte:** `                error: { code: 'INVALID_PAYLOAD', message: 'debugOn deve ser um booleano' },`

**Função:** Compõe o setup, request, sender ou expectativa do cenário por meio de `error: { code: 'INVALID_PAYLOAD', message: 'debugOn deve ser um booleano' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 177

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 178

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 179

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 180

**Fonte:** `});`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

### Linha 181

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o trecho `});` do bloco seguinte ``; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de montagem/ação que participa do caso real; a propriedade resultante é aferida nas assertions do mesmo bloco.

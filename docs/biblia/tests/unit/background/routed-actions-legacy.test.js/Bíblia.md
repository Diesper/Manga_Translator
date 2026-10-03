# Bíblia técnica — tests/unit/background/routed-actions-legacy.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 62d534355ac80b9b1f4e23dac3ce0ec1515ae4c5  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de compatibilidade legacy → router no background real  
> **Linhas textuais:** 187  
> **Posições documentais:** 188, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte congela a migração do antigo chrome.runtime.onMessage monolítico para MangaTranslatorRouter sem quebrar consumidores legados. Ela carrega background.js real, observa createMessageRouter e os execute das actions registradas, e compara respostas/efeitos esperados pelos chamadores antigos.

O foco não é revalidar toda a lógica de cada action; é provar que o worker registra actions importantes, resolve nomes SCREAMING_CASE para kebab-case e aplica compatibilidade de resposta quando necessário.

## 2. Bootstrap e registry

O primeiro caso exige presença no registry de fetch-image-base64, calculate-visual-fingerprint, force-send-activation, request-image-data, open-manga-root, download-image, open-existing-folder e download-chapter. Essa é prova direta de que esses módulos foram carregados no worker instrumentado.

Outras actions possuem suítes próprias e não são inferidas a partir desta lista.

## 3. routeRegisteredAction e compatibilidade

background.js resolve o nome legado pelo router e cria registeredActionRouter somente quando a primeira action roteada chega. O sendResponseCompat remove o campo ok de algumas respostas antigas — GET_TAB_ID, CHECK_IF_EXTRACTION_TAB, REQUEST_IMAGE_DATA, FETCH_IMAGE_AS_BASE64 e DOWNLOAD_IMAGE — para não quebrar callers anteriores à extração do router.

LOG_ENTRY, GEMINI_PROGRESS e SET_DEBUG_MODE mantêm confirmação ok:true. A suíte prova diretamente GET_TAB_ID e CHECK_IF_EXTRACTION_TAB sem ok, além das confirmações ok:true dos outros três casos.

## 4. LOG_ENTRY

LOG_ENTRY é enviado por uma manga tab realista e o spy confirma uma passagem por createMessageRouter/action execute. A resposta permanece {ok:true}.

## 5. GET_TAB_ID

O sender Gemini tem id 72. O retorno exato é {tabId:72}, sem ok, provando a adaptação legacy no background — diferença importante em relação ao router bruto, que normalmente adiciona ok:true.

## 6. GEMINI_PROGRESS

O cenário cria manga tab, registra receptor e persiste gemini_job_73 em opening. Após GEMINI_PROGRESS, prova: roteamento uma vez, resposta ok:true, mensagem PROGRESS à manga tab e estado persistido running.

O fallback de mangaTabId ausente para activeMangaTabId é coberto por message-handlers-real e não é duplicado como lacuna aqui.

## 7. CHECK_IF_EXTRACTION_TAB

Com extractionTabs[74] injetado, a resposta exata inclui isExtractionTab:true e os quatro metadados do mapeamento, novamente sem ok. O caminho false e a reidratação após worker novo são cobertos por plan-missing-handlers-real/batch-lifecycle-real.

## 8. SET_DEBUG_MODE

Duas tabs são criadas. SET_DEBUG_MODE/debugOn:true deve persistir debugMode:true e enviar DEBUG_MODE_CHANGED para ambas, além de responder ok:true.

## 9. Cobertura complementar do legado

REQUEST_IMAGE_DATA tem resposta exata sem ok provada em message-handlers-real. FETCH_IMAGE_AS_BASE64 tem sucesso {dataUrl:...} e falha {error:'HTTP 404'} exatos em plan-missing-handlers-real. DOWNLOAD_IMAGE é exercitado no background real, mas a assertion usa objectContaining e não prova a ausência do campo ok; por isso há uma solicitação focal abaixo.

## 10. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob 62d534355ac80b9b1f4e23dac3ce0ec1515ae4c5. Os seis casos aparecem individualmente com ✓ tanto no job Node 20.x 109255348388 quanto no Node 22.x 109255348406. Ambos encerram com 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 11. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| actions de mídia/pastas registradas no worker | primeiro caso | ✅ PROVADO DIRETAMENTE |
| LOG_ENTRY roteado e ok:true | caso 2 | ✅ PROVADO DIRETAMENTE |
| GET_TAB_ID sem ok | igualdade exata | ✅ PROVADO DIRETAMENTE |
| GEMINI_PROGRESS roteado + PROGRESS + state running | caso 4 | ✅ PROVADO DIRETAMENTE |
| CHECK_IF_EXTRACTION_TAB positivo sem ok | igualdade exata | ✅ PROVADO DIRETAMENTE |
| SET_DEBUG_MODE persiste e faz broadcast | caso 6 | ✅ PROVADO DIRETAMENTE |
| REQUEST_IMAGE_DATA sem ok | message-handlers-real externo | ✅ PROVADO DIRETAMENTE |
| FETCH_IMAGE_AS_BASE64 sem ok em sucesso/erro | plan-missing-handlers-real externo | ✅ PROVADO DIRETAMENTE |
| DOWNLOAD_IMAGE sem ok após sendResponseCompat | integração usa objectContaining | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| registeredActionRouter é reutilizado entre múltiplas mensagens no mesmo worker | cada teste despacha uma única action | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 12. Solicitações ao auditor

### 165-001 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: DOWNLOAD_IMAGE pertence a legacyResponseActions e background.js deve remover ok:true antes de responder. O teste direto da action/router bruto prova response {ok:true,filePath,downloadId}; message-handlers-real usa objectContaining no background real e não exclui a presença de ok.

Evidência ausente: dispatch de DOWNLOAD_IMAGE pelo background real com igualdade exata ou assertion de ausência de propriedade ok, preservando filePath/downloadId.

Risco: uma regressão em sendResponseCompat pode alterar silenciosamente o shape consumido pelo legado enquanto todas as assertions atuais continuam verdes.

### 165-002 — TEST_REQUIRED — OPEN — LOW

Encontrado: routeRegisteredAction mantém registeredActionRouter em cache e só chama createMessageRouter quando ele é null. Os seis casos reinicializam módulos e cada um envia apenas uma action roteada, então exigem uma criação, mas não provam reutilização.

Evidência ausente: duas ou mais actions roteadas sequenciais no mesmo background carregado, com createMessageRouter chamado uma vez e ambas as actions executadas corretamente.

Risco: perda acidental do cache pode reconstruir router/contexto por mensagem e escapar desta suíte; impacto primário é eficiência/consistência do worker.

## 13. Fonte integral auditada

```javascript
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getDownloadsMock,
    getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const {
    BACKGROUND_PATH,
    flush,
    dispatchToBackground,
} = require('../../helpers/background-test-utils.js');

describe('background.js - acoes legadas encaminhadas pelo roteador', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let downloadsMock;
    let alarmsMock;
    let backgroundModule;
    let routerApi;
    let createMessageRouterSpy;

    beforeEach(async () => {
        jest.resetModules();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        downloadsMock = getDownloadsMock();
        alarmsMock = getAlarmsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock._installedListeners = [];
        runtimeMock._startupListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();

        global.chrome = {
            storage: { local: storageMock },
            tabs: tabsMock,
            alarms: alarmsMock,
            runtime: runtimeMock,
            downloads: downloadsMock,
            scripting: global.chrome?.scripting,
        };

        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);

        routerApi = global.MangaTranslatorRouter;
        createMessageRouterSpy = jest.spyOn(routerApi, 'createMessageRouter');
    });

    afterEach(async () => {
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        await storageMock.clear();
        jest.restoreAllMocks();
    });

    function spyOnRoutedAction(name) {
        const action = routerApi.getAction(name);
        expect(action).toBeDefined();
        return jest.spyOn(action, 'execute');
    }

    function expectRouted(actionSpy) {
        expect(createMessageRouterSpy).toHaveBeenCalledTimes(1);
        expect(actionSpy).toHaveBeenCalledTimes(1);
    }

    test('carrega as ações de mídia, resultado e ativação no worker', () => {
        expect(routerApi.getAction('fetch-image-base64')).toBeDefined();
        expect(routerApi.getAction('calculate-visual-fingerprint')).toBeDefined();
        expect(routerApi.getAction('force-send-activation')).toBeDefined();
        expect(routerApi.getAction('request-image-data')).toBeDefined();
        expect(routerApi.getAction('open-manga-root')).toBeDefined();
        expect(routerApi.getAction('download-image')).toBeDefined();
        expect(routerApi.getAction('open-existing-folder')).toBeDefined();
        expect(routerApi.getAction('download-chapter')).toBeDefined();
    });

    test('LOG_ENTRY passa pelo roteador e mantém a confirmação legada', async () => {
        const actionSpy = spyOnRoutedAction('log-entry');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'LOG_ENTRY',
            level: 'info',
            source: 'manga',
            action_name: 'CACHE_HIT',
            detail: 'Imagem recuperada do cache',
            extra: { index: 2 },
        }, { tab: { id: 71, url: 'https://reader.test/chapter' } });

        expectRouted(actionSpy);
        expect(result.response).toEqual({ ok: true });
    });

    test('GET_TAB_ID passa pelo roteador e mantém a resposta sem ok', async () => {
        const actionSpy = spyOnRoutedAction('get-tab-id');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'GET_TAB_ID',
        }, { tab: { id: 72, url: 'https://gemini.google.com/app' } });

        expectRouted(actionSpy);
        expect(result.response).toEqual({ tabId: 72 });
    });

    test('GEMINI_PROGRESS passa pelo roteador e mantém a confirmação legada', async () => {
        const actionSpy = spyOnRoutedAction('relay-progress');
        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter' });
        const messages = [];
        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {
            messages.push(message);
            sendResponse({ ok: true });
        });
        await storageMock.set({
            gemini_job_73: { jobId: 'job-73', state: 'opening' },
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'GEMINI_PROGRESS',
            mangaTabId: mangaTab.id,
            text: 'Gerando traducao...',
        }, { tab: { id: 73, url: 'https://gemini.google.com/app' } });

        expectRouted(actionSpy);
        expect(result.response).toEqual({ ok: true });
        expect(messages).toContainEqual({ action: 'PROGRESS', text: 'Gerando traducao...' });
        expect(await storageMock.get(['gemini_job_73'])).toEqual({
            gemini_job_73: expect.objectContaining({ jobId: 'job-73', state: 'running' }),
        });
    });

    test('CHECK_IF_EXTRACTION_TAB passa pelo roteador e mantém a resposta sem ok', async () => {
        const actionSpy = spyOnRoutedAction('check-extraction-tab');
        backgroundModule.__setState({
            extractionTabs: {
                74: { mangaTabId: 11, index: 5, geminiTabId: 73, jobId: 'job-73' },
            },
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'CHECK_IF_EXTRACTION_TAB',
        }, { tab: { id: 74, url: 'https://cdn.reader.test/result.png' } });

        expectRouted(actionSpy);
        expect(result.response).toEqual({
            isExtractionTab: true,
            mangaTabId: 11,
            index: 5,
            geminiTabId: 73,
            jobId: 'job-73',
        });
    });

    test('SET_DEBUG_MODE passa pelo roteador e mantém a confirmação legada', async () => {
        const actionSpy = spyOnRoutedAction('set-debug-mode');
        const firstTab = await tabsMock.create({ url: 'https://reader.test/one' });
        const secondTab = await tabsMock.create({ url: 'https://reader.test/two' });
        const messages = [];
        [firstTab, secondTab].forEach(tab => {
            tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {
                messages.push({ tabId: tab.id, message });
                sendResponse({ ok: true });
            });
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'SET_DEBUG_MODE',
            debugOn: true,
        }, { id: chrome.runtime.id, tab: null });

        expectRouted(actionSpy);
        expect(result.response).toEqual({ ok: true });
        expect(await storageMock.get(['debugMode'])).toEqual({ debugMode: true });
        expect(messages).toEqual(expect.arrayContaining([
            { tabId: firstTab.id, message: { action: 'DEBUG_MODE_CHANGED', debugOn: true } },
            { tabId: secondTab.id, message: { action: 'DEBUG_MODE_CHANGED', debugOn: true } },
        ]));
    });
});
```

## 14. Auditoria linha a linha

### Linha 001

- **Código:** `const {`
- **Função:** Importa mocks Chrome compartilhados usados pelo background real.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** `    getRuntimeMock,`
- **Função:** Importa mocks Chrome compartilhados usados pelo background real.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `    getStorageMock,`
- **Função:** Importa mocks Chrome compartilhados usados pelo background real.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** `    getTabsMock,`
- **Função:** Importa mocks Chrome compartilhados usados pelo background real.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `    getDownloadsMock,`
- **Função:** Importa mocks Chrome compartilhados usados pelo background real.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `    getAlarmsMock,`
- **Função:** Importa mocks Chrome compartilhados usados pelo background real.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 007

- **Código:** `} = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa mocks Chrome compartilhados usados pelo background real.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** `const { loadBackgroundModule } = require('../../helpers/load-background-module.js');`
- **Função:** Importa loadBackgroundModule para executar extension/background.js real de forma instrumentada.
- **Contexto:** imports e harness.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra a suíte a background.js real.

### Linha 009

- **Código:** `const {`
- **Função:** Importa BACKGROUND_PATH, flush e dispatchToBackground do harness de background.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `    BACKGROUND_PATH,`
- **Função:** Importa BACKGROUND_PATH, flush e dispatchToBackground do harness de background.
- **Contexto:** imports e harness.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra a suíte a background.js real.

### Linha 011

- **Código:** `    flush,`
- **Função:** Importa BACKGROUND_PATH, flush e dispatchToBackground do harness de background.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `    dispatchToBackground,`
- **Função:** Importa BACKGROUND_PATH, flush e dispatchToBackground do harness de background.
- **Contexto:** imports e harness.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa o listener do background real; assertions subsequentes verificam o efeito.

### Linha 013

- **Código:** `} = require('../../helpers/background-test-utils.js');`
- **Função:** Importa BACKGROUND_PATH, flush e dispatchToBackground do harness de background.
- **Contexto:** imports e harness.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `describe('background.js - acoes legadas encaminhadas pelo roteador', () => {`
- **Função:** Abre a suíte de compatibilidade entre mensagens legadas e o router extraído.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `    let runtimeMock;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `    let storageMock;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `    let tabsMock;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `    let downloadsMock;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `    let alarmsMock;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `    let backgroundModule;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `    let routerApi;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `    let createMessageRouterSpy;`
- **Função:** Declara referência reconstruída por caso para mocks, módulo real ou spy de roteamento.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `    beforeEach(async () => {`
- **Função:** Inicia setup limpo: módulos, mocks, listeners, storage e global.chrome.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `        jest.resetModules();`
- **Função:** Evita reutilização do worker/module registry entre casos.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Obtém instância limpa do mock Chrome correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Obtém instância limpa do mock Chrome correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `        tabsMock = getTabsMock();`
- **Função:** Obtém instância limpa do mock Chrome correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `        downloadsMock = getDownloadsMock();`
- **Função:** Obtém instância limpa do mock Chrome correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `        alarmsMock = getAlarmsMock();`
- **Função:** Obtém instância limpa do mock Chrome correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `        runtimeMock._installedListeners = [];`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `        runtimeMock._startupListeners = [];`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `        runtimeMock.lastError = null;`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa storage persistente simulado entre casos.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `        global.chrome = {`
- **Função:** Monta a API Chrome que o background real observará.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `            storage: { local: storageMock },`
- **Função:** Compõe o cenário setup/teardown do background real, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `            tabs: tabsMock,`
- **Função:** Compõe o cenário setup/teardown do background real, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `            alarms: alarmsMock,`
- **Função:** Compõe o cenário setup/teardown do background real, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `            runtime: runtimeMock,`
- **Função:** Compõe o cenário setup/teardown do background real, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `            downloads: downloadsMock,`
- **Função:** Compõe o cenário setup/teardown do background real, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `            scripting: global.chrome?.scripting,`
- **Função:** Compõe o cenário setup/teardown do background real, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `        };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);`
- **Função:** Carrega e executa background.js real com os módulos de actions/router.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — amarra a suíte a background.js real.

### Linha 051

- **Código:** `        await flush(8);`
- **Função:** Drena inicialização assíncrona do worker antes de instalar spies/assertions.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `        routerApi = global.MangaTranslatorRouter;`
- **Função:** Captura a API real MangaTranslatorRouter exposta durante o carregamento do background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `        createMessageRouterSpy = jest.spyOn(routerApi, 'createMessageRouter');`
- **Função:** Espiona a criação do listener interno usado por routeRegisteredAction.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `    afterEach(async () => {`
- **Função:** Inicia teardown de alarmes, tabs, downloads, storage e spies.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `        alarmsMock.clearAll();`
- **Função:** Remove alarmes simulados residuais.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `        tabsMock._tabs.clear();`
- **Função:** Remove tabs simuladas residuais.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `        downloadsMock._downloads.clear();`
- **Função:** Remove downloads simulados residuais.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa storage persistente simulado entre casos.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Restaura spies/mocks Jest ao final do cenário.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `    function spyOnRoutedAction(name) {`
- **Função:** Helper que localiza a action registrada e cria spy no método execute.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `        const action = routerApi.getAction(name);`
- **Função:** Consulta registry canônico pelo nome kebab-case.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `        expect(action).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 068

- **Código:** `        return jest.spyOn(action, 'execute');`
- **Função:** Observa a execução real da action sem substituir sua implementação.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `    function expectRouted(actionSpy) {`
- **Função:** Helper que prova passagem pelo router criado e pela action registrada exatamente uma vez no caso.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `        expect(createMessageRouterSpy).toHaveBeenCalledTimes(1);`
- **Função:** Espiona a criação do listener interno usado por routeRegisteredAction.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 073

- **Código:** `        expect(actionSpy).toHaveBeenCalledTimes(1);`
- **Função:** Assertion de uma única criação/execução dentro do cenário isolado.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 074

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de observação do roteamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `    test('carrega as ações de mídia, resultado e ativação no worker', () => {`
- **Função:** Declara cenário: registro das actions no worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `        expect(routerApi.getAction('fetch-image-base64')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 078

- **Código:** `        expect(routerApi.getAction('calculate-visual-fingerprint')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 079

- **Código:** `        expect(routerApi.getAction('force-send-activation')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 080

- **Código:** `        expect(routerApi.getAction('request-image-data')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 081

- **Código:** `        expect(routerApi.getAction('open-manga-root')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 082

- **Código:** `        expect(routerApi.getAction('download-image')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 083

- **Código:** `        expect(routerApi.getAction('open-existing-folder')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 084

- **Código:** `        expect(routerApi.getAction('download-chapter')).toBeDefined();`
- **Função:** Prova presença da action esperada no registry do worker.
- **Contexto:** registro das actions no worker.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 085

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** registro das actions no worker.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `    test('LOG_ENTRY passa pelo roteador e mantém a confirmação legada', async () => {`
- **Função:** Declara cenário: LOG_ENTRY legado.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `        const actionSpy = spyOnRoutedAction('log-entry');`
- **Função:** Instala spy no execute da action específica antes do dispatch.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `        const result = await dispatchToBackground(runtimeMock, {`
- **Função:** Envia mensagem pelo listener runtime do background real, atravessando routeRegisteredAction.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa o listener do background real; assertions subsequentes verificam o efeito.

### Linha 091

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Usa nome legado LOG_ENTRY, que o router mapeia para log-entry.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `            level: 'info',`
- **Função:** Compõe o cenário LOG_ENTRY legado, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** `            source: 'manga',`
- **Função:** Compõe o cenário LOG_ENTRY legado, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `            action_name: 'CACHE_HIT',`
- **Função:** Compõe o cenário LOG_ENTRY legado, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `            detail: 'Imagem recuperada do cache',`
- **Função:** Compõe o cenário LOG_ENTRY legado, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `            extra: { index: 2 },`
- **Função:** Compõe o cenário LOG_ENTRY legado, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `        }, { tab: { id: 71, url: 'https://reader.test/chapter' } });`
- **Função:** Compõe o cenário LOG_ENTRY legado, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `        expectRouted(actionSpy);`
- **Função:** Exige que a mensagem tenha passado pelo router e pelo execute da action observada.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `        expect(result.response).toEqual({ ok: true });`
- **Função:** Verifica a forma de resposta preservada pela camada de compatibilidade.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 101

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** LOG_ENTRY legado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `    test('GET_TAB_ID passa pelo roteador e mantém a resposta sem ok', async () => {`
- **Função:** Declara cenário: GET_TAB_ID legado sem ok.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `        const actionSpy = spyOnRoutedAction('get-tab-id');`
- **Função:** Instala spy no execute da action específica antes do dispatch.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `        const result = await dispatchToBackground(runtimeMock, {`
- **Função:** Envia mensagem pelo listener runtime do background real, atravessando routeRegisteredAction.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa o listener do background real; assertions subsequentes verificam o efeito.

### Linha 107

- **Código:** `            action: 'GET_TAB_ID',`
- **Função:** Usa nome legado GET_TAB_ID, sujeito à remoção compatível do campo ok.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `        }, { tab: { id: 72, url: 'https://gemini.google.com/app' } });`
- **Função:** Compõe o cenário GET_TAB_ID legado sem ok, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `        expectRouted(actionSpy);`
- **Função:** Exige que a mensagem tenha passado pelo router e pelo execute da action observada.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `        expect(result.response).toEqual({ tabId: 72 });`
- **Função:** Verifica a forma de resposta preservada pela camada de compatibilidade.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 112

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** GET_TAB_ID legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `    test('GEMINI_PROGRESS passa pelo roteador e mantém a confirmação legada', async () => {`
- **Função:** Declara cenário: GEMINI_PROGRESS e transição running.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `        const actionSpy = spyOnRoutedAction('relay-progress');`
- **Função:** Instala spy no execute da action específica antes do dispatch.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `        const mangaTab = await tabsMock.create({ url: 'https://reader.test/chapter' });`
- **Função:** Cria aba leitora simulada para observar relay/broadcast.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `        const messages = [];`
- **Função:** Compõe o cenário GEMINI_PROGRESS e transição running, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `        tabsMock._registerMessageHandler(mangaTab.id, (message, _sender, sendResponse) => {`
- **Função:** Registra receptor da tab simulada e coleta mensagens encaminhadas.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `            messages.push(message);`
- **Função:** Armazena mensagem recebida para assertions posteriores.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `            sendResponse({ ok: true });`
- **Função:** Confirma entrega ao background pelo callback do tab mock.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `        await storageMock.set({`
- **Função:** Compõe o cenário GEMINI_PROGRESS e transição running, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `            gemini_job_73: { jobId: 'job-73', state: 'opening' },`
- **Função:** Prepara/observa estado persistido do job cujo progresso deve mudar de opening para running.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `        const result = await dispatchToBackground(runtimeMock, {`
- **Função:** Envia mensagem pelo listener runtime do background real, atravessando routeRegisteredAction.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa o listener do background real; assertions subsequentes verificam o efeito.

### Linha 127

- **Código:** `            action: 'GEMINI_PROGRESS',`
- **Função:** Usa nome legado GEMINI_PROGRESS, mapeado para relay-progress.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `            mangaTabId: mangaTab.id,`
- **Função:** Compõe o cenário GEMINI_PROGRESS e transição running, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `            text: 'Gerando traducao...',`
- **Função:** Compõe o cenário GEMINI_PROGRESS e transição running, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `        }, { tab: { id: 73, url: 'https://gemini.google.com/app' } });`
- **Função:** Compõe o cenário GEMINI_PROGRESS e transição running, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `        expectRouted(actionSpy);`
- **Função:** Exige que a mensagem tenha passado pelo router e pelo execute da action observada.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `        expect(result.response).toEqual({ ok: true });`
- **Função:** Verifica a forma de resposta preservada pela camada de compatibilidade.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 134

- **Código:** `        expect(messages).toContainEqual({ action: 'PROGRESS', text: 'Gerando traducao...' });`
- **Função:** Prova relay exato da mensagem de progresso à aba do mangá.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 135

- **Código:** `        expect(await storageMock.get(['gemini_job_73'])).toEqual({`
- **Função:** Prepara/observa estado persistido do job cujo progresso deve mudar de opening para running.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 136

- **Código:** `            gemini_job_73: expect.objectContaining({ jobId: 'job-73', state: 'running' }),`
- **Função:** Prepara/observa estado persistido do job cujo progresso deve mudar de opening para running.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** GEMINI_PROGRESS e transição running.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `    test('CHECK_IF_EXTRACTION_TAB passa pelo roteador e mantém a resposta sem ok', async () => {`
- **Função:** Declara cenário: CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `        const actionSpy = spyOnRoutedAction('check-extraction-tab');`
- **Função:** Instala spy no execute da action específica antes do dispatch.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `        backgroundModule.__setState({`
- **Função:** Injeta mapeamento real de extractionTabs para o cenário de lookup.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `            extractionTabs: {`
- **Função:** Representa mapeamento durável/em memória entre aba auxiliar e job/mangá.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `                74: { mangaTabId: 11, index: 5, geminiTabId: 73, jobId: 'job-73' },`
- **Função:** Compõe o cenário CHECK_IF_EXTRACTION_TAB legado sem ok, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `        const result = await dispatchToBackground(runtimeMock, {`
- **Função:** Envia mensagem pelo listener runtime do background real, atravessando routeRegisteredAction.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa o listener do background real; assertions subsequentes verificam o efeito.

### Linha 149

- **Código:** `            action: 'CHECK_IF_EXTRACTION_TAB',`
- **Função:** Usa nome legado CHECK_IF_EXTRACTION_TAB, sujeito à resposta sem ok.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** `        }, { tab: { id: 74, url: 'https://cdn.reader.test/result.png' } });`
- **Função:** Compõe o cenário CHECK_IF_EXTRACTION_TAB legado sem ok, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `        expectRouted(actionSpy);`
- **Função:** Exige que a mensagem tenha passado pelo router e pelo execute da action observada.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `        expect(result.response).toEqual({`
- **Função:** Verifica a forma de resposta preservada pela camada de compatibilidade.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 154

- **Código:** `            isExtractionTab: true,`
- **Função:** Prova resposta positiva de extraction tab.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `            mangaTabId: 11,`
- **Função:** Compõe o cenário CHECK_IF_EXTRACTION_TAB legado sem ok, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `            index: 5,`
- **Função:** Compõe o cenário CHECK_IF_EXTRACTION_TAB legado sem ok, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `            geminiTabId: 73,`
- **Função:** Compõe o cenário CHECK_IF_EXTRACTION_TAB legado sem ok, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `            jobId: 'job-73',`
- **Função:** Compõe o cenário CHECK_IF_EXTRACTION_TAB legado sem ok, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CHECK_IF_EXTRACTION_TAB legado sem ok.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `    test('SET_DEBUG_MODE passa pelo roteador e mantém a confirmação legada', async () => {`
- **Função:** Declara cenário: SET_DEBUG_MODE, storage e broadcast.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `        const actionSpy = spyOnRoutedAction('set-debug-mode');`
- **Função:** Instala spy no execute da action específica antes do dispatch.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `        const firstTab = await tabsMock.create({ url: 'https://reader.test/one' });`
- **Função:** Compõe o cenário SET_DEBUG_MODE, storage e broadcast, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `        const secondTab = await tabsMock.create({ url: 'https://reader.test/two' });`
- **Função:** Compõe o cenário SET_DEBUG_MODE, storage e broadcast, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `        const messages = [];`
- **Função:** Compõe o cenário SET_DEBUG_MODE, storage e broadcast, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `        [firstTab, secondTab].forEach(tab => {`
- **Função:** Compõe o cenário SET_DEBUG_MODE, storage e broadcast, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `            tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {`
- **Função:** Registra receptor da tab simulada e coleta mensagens encaminhadas.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `                messages.push({ tabId: tab.id, message });`
- **Função:** Armazena mensagem recebida para assertions posteriores.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `                sendResponse({ ok: true });`
- **Função:** Confirma entrega ao background pelo callback do tab mock.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `            });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** `        const result = await dispatchToBackground(runtimeMock, {`
- **Função:** Envia mensagem pelo listener runtime do background real, atravessando routeRegisteredAction.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa o listener do background real; assertions subsequentes verificam o efeito.

### Linha 175

- **Código:** `            action: 'SET_DEBUG_MODE',`
- **Função:** Usa nome legado SET_DEBUG_MODE, mapeado para set-debug-mode.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** `            debugOn: true,`
- **Função:** Ativa modo debug pelo contrato legado.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 177

- **Código:** `        }, { id: chrome.runtime.id, tab: null });`
- **Função:** Compõe o cenário SET_DEBUG_MODE, storage e broadcast, preparando, executando ou verificando o fluxo roteado real.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** `        expectRouted(actionSpy);`
- **Função:** Exige que a mensagem tenha passado pelo router e pelo execute da action observada.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `        expect(result.response).toEqual({ ok: true });`
- **Função:** Verifica a forma de resposta preservada pela camada de compatibilidade.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 181

- **Código:** `        expect(await storageMock.get(['debugMode'])).toEqual({ debugMode: true });`
- **Função:** Verifica persistência do modo debug no storage.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 182

- **Código:** `        expect(messages).toEqual(expect.arrayContaining([`
- **Função:** Assertion focal do comportamento ou forma de resposta.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 183

- **Código:** `            { tabId: firstTab.id, message: { action: 'DEBUG_MODE_CHANGED', debugOn: true } },`
- **Função:** Ativa modo debug pelo contrato legado.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `            { tabId: secondTab.id, message: { action: 'DEBUG_MODE_CHANGED', debugOn: true } },`
- **Função:** Ativa modo debug pelo contrato legado.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `        ]));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SET_DEBUG_MODE, storage e broadcast.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 188 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 15. Conclusão documental

Foram documentadas 187 linhas textuais e a posição 188 do newline final. A suíte possui prova CI exata em Node 20/22 e foi cruzada com as suítes que cobrem respostas legadas adicionais para não duplicar pendências.

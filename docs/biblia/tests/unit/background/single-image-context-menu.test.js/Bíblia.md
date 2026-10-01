# Bíblia técnica — tests/unit/background/single-image-context-menu.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** c4e122e3fd2a5298b255e647dbc804c903ed17f5  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest do menu de contexto nativo no background real  
> **Linhas textuais:** 172  
> **Posições documentais:** 173, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte valida a feature de clique direito para traduzir uma única imagem. O background real cria um item de context menu condicionado por clickToTranslateEnabled + enabledDomains e, no clique, revalida preferência/domínio antes de enviar TRANSLATE_CONTEXT_IMAGE ao content script da aba leitora.

A suíte usa um mock stateful de chrome.contextMenus para observar tanto o item criado quanto o listener onClicked real.

## 2. Criação do menu

Com feature ligada e dois domínios habilitados, o item manga-translator-translate-single-image deve existir com título 'Traduzir esta imagem', contexts:['image'] e documentUrlPatterns exatamente correspondentes aos dois hosts. Isso prova que o item não é um menu genérico de página.

A implementação normaliza trim/lowercase, rejeita hosts fora de [a-z0-9.-] e remove duplicatas por Set; essas transformações não são focalmente exercitadas pelo caso atual.

## 3. Clique e encaminhamento

O segundo caso registra uma manga tab reader.test e dispara o listener onClicked com pageUrl e srcUrl. A mensagem entregue deve ser exatamente {action:'TRANSLATE_CONTEXT_IMAGE',srcUrl:'https://reader.test/page-4.png'}.

Antes de enviar, a implementação relê storage e valida novamente o host da página. Isso evita que um item antigo continue ativo após mudança de preferência.

## 4. Desativação e listener antigo

O terceiro caso cria o menu ligado, depois grava clickToTranslateEnabled:false. Após flush, o item desaparece. O teste ainda chama diretamente o listener antigo que permanece no mock e exige zero mensagens encaminhadas, provando defesa em profundidade: remoção visual e revalidação no clique.

## 5. Proteção contra corridas de rebuild

rebuildSingleImageContextMenu incrementa singleImageContextMenuSyncVersion antes de chamar contextMenus.remove. O callback de remove só recria o item quando sua versão ainda é a mais recente. O mock atual executa o callback de remove sincronicamente, portanto não cria a janela necessária para provar que callback antigo não ressuscita configuração obsoleta.

## 6. Erros de API e rejeição do content script

A implementação registra SINGLE_IMAGE_CONTEXT_MENU_CREATE_FAILED quando create falha, SINGLE_IMAGE_CONTEXT_MENU_DELIVERY_FAILED quando tabs.sendMessage produz lastError e SINGLE_IMAGE_CONTEXT_MENU_REJECTED quando o content script responde sem ok:true. Nenhum desses branches recebe assertion focal nesta suíte.

## 7. Evidência CI exata

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 contém exatamente o blob c4e122e3fd2a5298b255e647dbc804c903ed17f5. Os três casos aparecem individualmente com ✓ em Node 20.x (109255348388) e Node 22.x (109255348406), com 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 8. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| item só em contexto image | contexts:['image'] | ✅ PROVADO DIRETAMENTE |
| patterns para domínios habilitados | igualdade exata | ✅ PROVADO DIRETAMENTE |
| clique encaminha srcUrl exato | caso 2 | ✅ PROVADO DIRETAMENTE |
| desligar remove item | caso 3 | ✅ PROVADO DIRETAMENTE |
| listener antigo não age após desligar | forwarded length 0 | ✅ PROVADO DIRETAMENTE |
| callback antigo de remove não recria menu obsoleto | syncVersion real, mock callback síncrono | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| lowercase/trim/dedup/domínios inválidos | implementação real, sem matriz focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| delivery lastError / resposta rejeitada | branches de log reais | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Solicitações ao auditor

### 167-001 — TEST_REQUIRED — ACCEPTED — HIGH

Encontrado: singleImageContextMenuSyncVersion existe para impedir que callback tardio de contextMenus.remove recrie configuração obsoleta, mas o mock chama remove callback imediatamente.

Evidência ausente: controlar dois rebuilds concorrentes com callbacks de remove retidos; resolver primeiro o callback antigo depois da configuração nova e exigir que somente a versão mais recente possa criar o item.

Risco: mudanças rápidas em enabledDomains/enable podem ressuscitar menu com allowlist antiga.

### 167-002 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: enabledDomainToMatchPattern normaliza lowercase/trim, filtra formato e rebuild deduplica patterns; o caso atual usa apenas dois hosts já válidos e distintos.

Evidência ausente: mistura com espaços/maiúsculas, duplicatas e entradas inválidas, exigindo patterns normalizados únicos e nenhuma criação se todos forem inválidos. Também convém clicar em página fora da allowlist e exigir zero encaminhamento.

Risco: menu pode aparecer em domínio indevido ou falhar ao criar por pattern inválido.

### 167-003 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: branches de observabilidade SINGLE_IMAGE_CONTEXT_MENU_CREATE_FAILED, DELIVERY_FAILED e REJECTED não são exercitados.

Evidência ausente: create com lastError/throw, tabs.sendMessage com lastError e resposta {ok:false,reason} ou ausência de resposta; exigir logs corretos sem exceção não tratada.

Risco: falhas de API/content podem ficar silenciosas ou quebrar o listener.

## 10. Fonte integral auditada

```javascript
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getAlarmsMock,
    getDownloadsMock,
} = require('../../mocks/chrome-api.mock.js');
const { BACKGROUND_PATH, flush, waitFor } = require('../../helpers/background-test-utils.js');

function createContextMenusMock() {
    const items = new Map();
    const clickListeners = [];
    return {
        items,
        clickListeners,
        create: jest.fn((props, callback) => {
            items.set(props.id, { ...props });
            if (callback) callback();
            return props.id;
        }),
        remove: jest.fn((id, callback) => {
            items.delete(id);
            if (callback) callback();
            return Promise.resolve();
        }),
        onClicked: {
            addListener: jest.fn(fn => clickListeners.push(fn)),
            removeListener: jest.fn(fn => {
                const index = clickListeners.indexOf(fn);
                if (index >= 0) clickListeners.splice(index, 1);
            }),
        },
    };
}

describe('background.js - menu nativo para tradução de uma imagem', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let alarmsMock;
    let downloadsMock;
    let contextMenus;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        alarmsMock = getAlarmsMock();
        downloadsMock = getDownloadsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock._installedListeners = [];
        runtimeMock._startupListeners = [];
        runtimeMock.lastError = null;
        tabsMock._tabs.clear();
        storageMock._listeners = [];
        await storageMock.clear();

        contextMenus = createContextMenusMock();
        global.chrome = {
            storage: {
                local: storageMock,
                onChanged: storageMock.onChanged,
            },
            tabs: tabsMock,
            alarms: alarmsMock,
            runtime: runtimeMock,
            downloads: downloadsMock,
            scripting: global.chrome?.scripting,
            contextMenus,
        };
    });

    afterEach(async () => {
        tabsMock._tabs.clear();
        alarmsMock.clearAll();
        await storageMock.clear();
        jest.restoreAllMocks();
    });

    test('cria somente para imagens e somente nos domínios habilitados quando a opção está ligada', async () => {
        await storageMock.set({
            clickToTranslateEnabled: true,
            enabledDomains: ['reader.test', 'second-reader.test'],
        });

        jest.isolateModules(() => {
            require(BACKGROUND_PATH);
        });
        await flush(8);

        const item = contextMenus.items.get('manga-translator-translate-single-image');
        expect(item).toEqual(expect.objectContaining({
            id: 'manga-translator-translate-single-image',
            title: 'Traduzir esta imagem',
            contexts: ['image'],
        }));
        expect(item.documentUrlPatterns).toEqual([
            '*://reader.test/*',
            '*://second-reader.test/*',
        ]);
    });

    test('clique no item encaminha a imagem exata para o content script', async () => {
        await storageMock.set({
            clickToTranslateEnabled: true,
            enabledDomains: ['reader.test'],
        });

        jest.isolateModules(() => {
            require(BACKGROUND_PATH);
        });
        await flush(8);

        const tab = await tabsMock.create({ url: 'https://reader.test/chapter-1', active: true });
        const forwarded = [];
        tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {
            forwarded.push(message);
            sendResponse({ ok: true, index: 4 });
        });

        expect(contextMenus.clickListeners).toHaveLength(1);
        contextMenus.clickListeners[0]({
            menuItemId: 'manga-translator-translate-single-image',
            pageUrl: tab.url,
            srcUrl: 'https://reader.test/page-4.png',
            mediaType: 'image',
        }, tab);

        await waitFor(() => forwarded.length === 1);
        expect(forwarded[0]).toEqual({
            action: 'TRANSLATE_CONTEXT_IMAGE',
            srcUrl: 'https://reader.test/page-4.png',
        });
    });

    test('desligar a opção remove o item e não encaminha ações antigas', async () => {
        await storageMock.set({
            clickToTranslateEnabled: true,
            enabledDomains: ['reader.test'],
        });

        jest.isolateModules(() => {
            require(BACKGROUND_PATH);
        });
        await flush(8);
        expect(contextMenus.items.has('manga-translator-translate-single-image')).toBe(true);

        await storageMock.set({ clickToTranslateEnabled: false });
        await flush(8);
        expect(contextMenus.items.has('manga-translator-translate-single-image')).toBe(false);

        const tab = await tabsMock.create({ url: 'https://reader.test/chapter-2', active: true });
        const forwarded = [];
        tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {
            forwarded.push(message);
            sendResponse({ ok: true });
        });

        contextMenus.clickListeners[0]({
            menuItemId: 'manga-translator-translate-single-image',
            pageUrl: tab.url,
            srcUrl: 'https://reader.test/page-2.png',
            mediaType: 'image',
        }, tab);

        await flush(4);
        expect(forwarded).toHaveLength(0);
    });
});
```

## 11. Auditoria linha a linha

### Linha 001

- **Código:** `const {`
- **Função:** Importa mocks Chrome compartilhados necessários ao background real.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** `    getRuntimeMock,`
- **Função:** Importa mocks Chrome compartilhados necessários ao background real.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `    getStorageMock,`
- **Função:** Importa mocks Chrome compartilhados necessários ao background real.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** `    getTabsMock,`
- **Função:** Importa mocks Chrome compartilhados necessários ao background real.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `    getAlarmsMock,`
- **Função:** Importa mocks Chrome compartilhados necessários ao background real.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `    getDownloadsMock,`
- **Função:** Importa mocks Chrome compartilhados necessários ao background real.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 007

- **Código:** `} = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa mocks Chrome compartilhados necessários ao background real.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** `const { BACKGROUND_PATH, flush, waitFor } = require('../../helpers/background-test-utils.js');`
- **Função:** Importa BACKGROUND_PATH, flush e waitFor do harness.
- **Contexto:** imports e utilitários.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — referencia explicitamente BACKGROUND_PATH e helpers reais.

### Linha 009

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `function createContextMenusMock() {`
- **Função:** Define mock stateful de contextMenus, incluindo registry de items e listeners de clique.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `    const items = new Map();`
- **Função:** Mantém visão materializada dos itens de menu atualmente criados.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `    const clickListeners = [];`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `    return {`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `        items,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `        clickListeners,`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `        create: jest.fn((props, callback) => {`
- **Função:** Simula criação do item e grava props pelo id.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `            items.set(props.id, { ...props });`
- **Função:** Persiste snapshot das propriedades para assertions.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `            if (callback) callback();`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `            return props.id;`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `        }),`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `        remove: jest.fn((id, callback) => {`
- **Função:** Simula remoção do item e callback da API.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `            items.delete(id);`
- **Função:** Remove o item do Map como faria a API.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `            if (callback) callback();`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `            return Promise.resolve();`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `        }),`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `        onClicked: {`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `            addListener: jest.fn(fn => clickListeners.push(fn)),`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `            removeListener: jest.fn(fn => {`
- **Função:** Permite remover listener do array simulado.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `                const index = clickListeners.indexOf(fn);`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `                if (index >= 0) clickListeners.splice(index, 1);`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `            }),`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `        },`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `    };`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `}`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** mock de contextMenus.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `describe('background.js - menu nativo para tradução de uma imagem', () => {`
- **Função:** Abre suíte do menu nativo de tradução individual.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `    let runtimeMock;`
- **Função:** Declara mock reconstruído por teste.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `    let storageMock;`
- **Função:** Declara mock reconstruído por teste.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `    let tabsMock;`
- **Função:** Declara mock reconstruído por teste.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `    let alarmsMock;`
- **Função:** Declara mock reconstruído por teste.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `    let downloadsMock;`
- **Função:** Declara mock reconstruído por teste.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `    let contextMenus;`
- **Função:** Declara mock reconstruído por teste.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `    beforeEach(async () => {`
- **Função:** Inicia setup: módulos, mocks, listeners, storage e global.chrome limpos.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `        jest.resetModules();`
- **Função:** Força novo carregamento do background por cenário.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Obtém mock Chrome limpo correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Obtém mock Chrome limpo correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `        tabsMock = getTabsMock();`
- **Função:** Obtém mock Chrome limpo correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `        alarmsMock = getAlarmsMock();`
- **Função:** Obtém mock Chrome limpo correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `        downloadsMock = getDownloadsMock();`
- **Função:** Obtém mock Chrome limpo correspondente.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:** Zera listeners/erro residual antes de carregar background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:** Zera listeners/erro residual antes de carregar background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `        runtimeMock._installedListeners = [];`
- **Função:** Zera listeners/erro residual antes de carregar background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `        runtimeMock._startupListeners = [];`
- **Função:** Zera listeners/erro residual antes de carregar background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `        runtimeMock.lastError = null;`
- **Função:** Zera listeners/erro residual antes de carregar background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `        tabsMock._tabs.clear();`
- **Função:** Limpa tabs simuladas.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `        storageMock._listeners = [];`
- **Função:** Limpa observers do storage para impedir callbacks de caso anterior.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa preferências persistidas simuladas.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `        contextMenus = createContextMenusMock();`
- **Função:** Instancia mock de contextMenus para observar item/listener.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `        global.chrome = {`
- **Função:** Monta API Chrome completa usada pelo background real.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `            storage: {`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `                local: storageMock,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `                onChanged: storageMock.onChanged,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `            },`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `            tabs: tabsMock,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `            alarms: alarmsMock,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `            runtime: runtimeMock,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `            downloads: downloadsMock,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `            scripting: global.chrome?.scripting,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `            contextMenus,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `        };`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `    });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `    afterEach(async () => {`
- **Função:** Inicia teardown de tabs, alarmes, storage e spies.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `        tabsMock._tabs.clear();`
- **Função:** Limpa tabs simuladas.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `        alarmsMock.clearAll();`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa preferências persistidas simuladas.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Restaura spies/mocks ao final do caso.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `    });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** setup/teardown do background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `    test('cria somente para imagens e somente nos domínios habilitados quando a opção está ligada', async () => {`
- **Função:** Declara cenário: criação do item por domínio.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `        await storageMock.set({`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `            clickToTranslateEnabled: true,`
- **Função:** Configura ou altera a preferência que habilita o item de menu.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `            enabledDomains: ['reader.test', 'second-reader.test'],`
- **Função:** Configura allowlist de hosts onde o item pode existir/agir.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `        jest.isolateModules(() => {`
- **Função:** Carrega background.js real sob configuração atual.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `            require(BACKGROUND_PATH);`
- **Função:** Executa implementação real do background.
- **Contexto:** criação do item por domínio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa background/listener real; assertions subsequentes verificam efeitos.

### Linha 091

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `        await flush(8);`
- **Função:** Drena callbacks de storage/context menu antes das assertions.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `        const item = contextMenus.items.get('manga-translator-translate-single-image');`
- **Função:** Recupera item materializado pelo id canônico.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `        expect(item).toEqual(expect.objectContaining({`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 096

- **Código:** `            id: 'manga-translator-translate-single-image',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `            title: 'Traduzir esta imagem',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `            contexts: ['image'],`
- **Função:** Prova restrição do menu ao contexto de imagem.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `        }));`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `        expect(item.documentUrlPatterns).toEqual([`
- **Função:** Observa padrões derivados da allowlist de domínios.
- **Contexto:** criação do item por domínio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 101

- **Código:** `            '*://reader.test/*',`
- **Função:** Fixa pattern esperado para host habilitado.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `            '*://second-reader.test/*',`
- **Função:** Fixa pattern esperado para host habilitado.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `        ]);`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `    });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** criação do item por domínio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `    test('clique no item encaminha a imagem exata para o content script', async () => {`
- **Função:** Declara cenário: clique encaminha imagem exata.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `        await storageMock.set({`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `            clickToTranslateEnabled: true,`
- **Função:** Configura ou altera a preferência que habilita o item de menu.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `            enabledDomains: ['reader.test'],`
- **Função:** Configura allowlist de hosts onde o item pode existir/agir.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `        jest.isolateModules(() => {`
- **Função:** Carrega background.js real sob configuração atual.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `            require(BACKGROUND_PATH);`
- **Função:** Executa implementação real do background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa background/listener real; assertions subsequentes verificam efeitos.

### Linha 114

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `        await flush(8);`
- **Função:** Drena callbacks de storage/context menu antes das assertions.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `        const tab = await tabsMock.create({ url: 'https://reader.test/chapter-1', active: true });`
- **Função:** Cria aba leitora válida para o clique.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `        const forwarded = [];`
- **Função:** Coleta mensagens enviadas pelo background ao content script.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `        tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {`
- **Função:** Registra receptor da aba leitora e confirma callback.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `            forwarded.push(message);`
- **Função:** Armazena mensagem recebida para assertion exata.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `            sendResponse({ ok: true, index: 4 });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `        expect(contextMenus.clickListeners).toHaveLength(1);`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 125

- **Código:** `        contextMenus.clickListeners[0]({`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa background/listener real; assertions subsequentes verificam efeitos.

### Linha 126

- **Código:** `            menuItemId: 'manga-translator-translate-single-image',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `            pageUrl: tab.url,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `            srcUrl: 'https://reader.test/page-4.png',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `            mediaType: 'image',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `        }, tab);`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `        await waitFor(() => forwarded.length === 1);`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `        expect(forwarded[0]).toEqual({`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 134

- **Código:** `            action: 'TRANSLATE_CONTEXT_IMAGE',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `            srcUrl: 'https://reader.test/page-4.png',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `    });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** clique encaminha imagem exata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `    test('desligar a opção remove o item e não encaminha ações antigas', async () => {`
- **Função:** Declara cenário: desativação remove item e bloqueia listener antigo.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `        await storageMock.set({`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `            clickToTranslateEnabled: true,`
- **Função:** Configura ou altera a preferência que habilita o item de menu.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `            enabledDomains: ['reader.test'],`
- **Função:** Configura allowlist de hosts onde o item pode existir/agir.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `        jest.isolateModules(() => {`
- **Função:** Carrega background.js real sob configuração atual.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `            require(BACKGROUND_PATH);`
- **Função:** Executa implementação real do background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa background/listener real; assertions subsequentes verificam efeitos.

### Linha 147

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `        await flush(8);`
- **Função:** Drena callbacks de storage/context menu antes das assertions.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** `        expect(contextMenus.items.has('manga-translator-translate-single-image')).toBe(true);`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 150

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `        await storageMock.set({ clickToTranslateEnabled: false });`
- **Função:** Configura ou altera a preferência que habilita o item de menu.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `        await flush(8);`
- **Função:** Drena callbacks de storage/context menu antes das assertions.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `        expect(contextMenus.items.has('manga-translator-translate-single-image')).toBe(false);`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 154

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `        const tab = await tabsMock.create({ url: 'https://reader.test/chapter-2', active: true });`
- **Função:** Cria aba leitora válida para o clique.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `        const forwarded = [];`
- **Função:** Coleta mensagens enviadas pelo background ao content script.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `        tabsMock._registerMessageHandler(tab.id, (message, _sender, sendResponse) => {`
- **Função:** Registra receptor da aba leitora e confirma callback.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `            forwarded.push(message);`
- **Função:** Armazena mensagem recebida para assertion exata.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `            sendResponse({ ok: true });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `        });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `        contextMenus.clickListeners[0]({`
- **Função:** Mantém listeners onClicked registrados pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa background/listener real; assertions subsequentes verificam efeitos.

### Linha 163

- **Código:** `            menuItemId: 'manga-translator-translate-single-image',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `            pageUrl: tab.url,`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `            srcUrl: 'https://reader.test/page-2.png',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `            mediaType: 'image',`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `        }, tab);`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `        await flush(4);`
- **Função:** Drena callbacks de storage/context menu antes das assertions.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `        expect(forwarded).toHaveLength(0);`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 171

- **Código:** `    });`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** desativação remove item e bloqueia listener antigo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `});`
- **Função:** Interage com listener onClicked registrado pelo background.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Posição 173 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 12. Conclusão documental

Foram documentadas 172 linhas textuais e a posição 173 do newline final. Os três contratos principais estão provados no background real e no mesmo blob executado em Node 20/22; as solicitações abertas concentram-se em corrida de rebuild, saneamento de domínios e observabilidade de falhas.

> **Lifecycle pós-adversarial:** 167-001, 167-002 e 167-003 estão ACCEPTED em `.state/167.json`; permanecem riscos/lacunas documentadas, não requests OPEN.

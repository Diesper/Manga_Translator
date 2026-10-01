# Bíblia técnica — tests/integration/popup.ui.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `57158c9b6e6f88955bf82a292e75624dc2ad8d0c`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest de integração JSDOM do popup  
> **Linhas textuais:** 631  
> **Posições documentais:** 632, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/integration/popup.ui.test.js` exerce a interface real do popup da extensão usando o HTML e o JavaScript reais, dentro do projeto Jest `integration` com ambiente `jsdom`.

A suíte não reimplementa o popup. Cada cenário chama `loadExtensionPage` com:

- `extension/popup/popup.html`;
- `extension/popup/popup.js`;
- `fireDOMContentLoaded: true`.

O helper `tests/helpers/load-extension-page.js` lê o HTML, descobre scripts anteriores ao alvo e os carrega antes de `popup.js`. Como `popup.html` contém `../shared/shared-ui.js` antes de `popup.js`, esta suíte integra efetivamente:

```text
popup.html
  -> shared-ui.js
  -> popup.js
  -> chrome-api.mock.js / dom-environment.js
```

Isso importa especialmente no cenário “Refazer”, pois parte do comportamento de remoção/cache está em `shared-ui.js`.

A suíte cobre inicialização, seleção/tradução, cancelamento do lote da aba, painel de configurações, sites habilitados, auto-substituição, refazer imagem, habilitação de domínio, fallback quando não há imagens, filtros de tamanho, layout e preferências de interação.

## 2. Inclusão no runner e ambiente

### 2.1 Jest

`jest.config.js:73-80` define o projeto:

- `displayName: 'integration'`;
- `testEnvironment: 'jsdom'`;
- `testMatch: ['<rootDir>/tests/integration/**/*.test.js']`;
- setup com `tests/mocks/chrome-api.mock.js` e `tests/mocks/dom-environment.js`.

Logo este arquivo é descoberto diretamente pelo projeto `integration`.

`package.json:16` define:

```text
test:integration = jest --config jest.config.js --selectProjects integration
```

`scripts/validation/verify-test-policy.js` possui gates para `.skip` e `.only`; neste arquivo auditado não há nenhum `test.skip`, `describe.skip`, `test.only` ou `describe.only`.

### 2.2 Dependências diretas

Helpers:
- `loadExtensionPage`;
- `flushAsyncTasks`.

Mocks:
- `getStorageMock`;
- `getTabsMock`;
- `getRuntimeMock`.

Implementação real:
- `extension/popup/popup.html`;
- `extension/shared/shared-ui.js`;
- `extension/popup/popup.js`.

APIs simuladas:
- storage local;
- tabs;
- runtime messaging;
- `window.confirm`;
- `window.close`;
- DOM/JSDOM.

## 3. Harness local do arquivo

### 3.1 `createActiveTab`

Cria uma aba pelo mock real de tabs, marca-a ativa e injeta título diretamente na estrutura interna `tabsMock._tabs`.

Esse helper permite controlar host, URL e título da aba que o popup verá como contexto ativo.

### 3.2 `registerPopupTabHandler`

Registra um handler por tab ID e responde às mensagens usadas pelo popup:

| Action | Resposta/efeito |
|---|---|
| `GET_PAGE_IMAGES` | retorna `images` |
| `SET_SELECTED_IMAGES` | `{success:true}` |
| `ENABLE_PAGE` | callback opcional + sucesso |
| `HIGHLIGHT_IMAGE` | sucesso |
| `START_TRANSLATION_FROM_POPUP` | callback opcional + `{ok:true}` |
| `STOP_TRANSLATION_FROM_POPUP` | callback opcional + batch id controlado |

Qualquer action não listada não recebe response neste handler. A intenção é fornecer apenas a superfície necessária aos fluxos sob teste.

### 3.3 Setup e cleanup

Antes de cada teste:

1. `jest.resetModules()`;
2. recupera mocks singleton;
3. limpa listeners/runtime error;
4. limpa storage;
5. reseta o documento HTML.

Depois de cada teste:
- `jest.restoreAllMocks()`;
- restaura `global.confirm` para `window.confirm`.

Esse isolamento reduz vazamento entre cenários, mas a suíte ainda depende do contrato interno dos mocks, inclusive campos com prefixo `_`.

## 4. Cenários e assertions

### T01 — linhas 64–91 — carregamento e indicador de processamento

Prepara duas imagens válidas, domínio habilitado e `mt_state.activeJobsCount=2`.

Assertions diretas:
- 2 cards no grid;
- contador “2 imagens selecionadas”;
- CTA “Traduzir 2 Páginas”;
- dot e label de tradução com classe `visible`.

**Prova:** o popup real inicializa a grade e reflete estado de processamento armazenado.

### T02 — linhas 93–136 — Parar é local à aba, não global

Inicia uma tradução pelo botão principal e depois clica `btn-progress-stop`.

Assertions:
- uma mensagem de start;
- exatamente `STOP_TRANSLATION_FROM_POPUP` enviado para a aba;
- nenhuma chamada runtime `STOP_BATCH`;
- `window.close` chamado.

**Prova:** o stop do popup pertence ao lote da aba ativa e não dispara cancelamento global legado.

### T03 — linhas 138–210 — painel de configurações e sites habilitados

Semeia:
- dois domínios;
- prompt customizado;
- auto-restore global desligado;
- um site explicitamente desabilitado;
- capítulo/restauração da imagem de `reader.test`;
- metadados dos sites.

Assertions cobrem:
- abertura da settings page;
- prompt;
- checkbox global;
- dois sites;
- toggle por site;
- scroll;
- expansão do site;
- `aria-expanded`;
- lista de imagens;
- capítulo correto;
- site sem histórico sem item de imagem.

**Prova:** renderização hierárquica e estado de auto-substituição por site.

### T04 — linhas 212–254 — remover site habilitado

Semeia domínio, capítulo, restore map/meta e site metadata. Clica o botão de remoção.

Assertions atuais:
- `enabledDomains=[]`;
- `siteMeta_reader.test` removido;
- zero itens na UI;
- mensagem “Nenhum site habilitado”.

**Limite importante:** embora o nome do teste diga “mesmo quando existem imagens salvas no histórico”, não existe assertion pós-ação confirmando que `chapterList`, `chap_popup_remove_restoreMap` e `chap_popup_remove_restoreMeta` permaneceram intactos. Essa lacuna está registrada em 117-002.

### T05 — linhas 256–322 — auto-substituição global/site/imagem

Semeia capítulo/restauração e auto-restore global ativo. Depois:
- desliga toggle global;
- desliga toggle do site;
- bloqueia a imagem específica.

Assertions:
- `autoRestoreEnabled=false`;
- host dentro de `autoRestoreDisabledSites`;
- objeto da URL em `autoRestoreBlockedImages` com `cleanUrl`, `host` e título do capítulo.

**Prova:** persistência nos três níveis do contrato.

### T06 — linhas 324–410 — Refazer imagem específica

Semeia duas traduções, dois paths, dois restore entries e um bloqueio da imagem errada. Mocka:
- runtime `GTC_DELETE_BY_CLEAN_URL`;
- confirmação positiva.

Depois clica o botão Refazer da imagem.

Assertions:
- restoreMap da URL errada removido;
- restoreMap da URL correta preservado;
- restoreMeta da URL errada removido;
- imagem 0 removida;
- imagem 1 preservada;
- path 0 removido;
- bloqueio da URL removido;
- mensagem GTC com `cleanUrl`;
- UI fica com uma imagem.

**Prova:** remoção focal + invalidação GTC, sem apagar a segunda imagem.

**Limite:** não há assertion específica para preservação de `restoreMeta[keepUrl]` nem `paths[1]`; parte da não-regressão da entrada “keep” é comprovada, mas não todas as estruturas paralelas.

### T07 — linhas 412–445 — habilitar novo domínio

Começa com `enabledDomains=[]`, ativa site via botão e retorna uma imagem pelo tab handler.

Assertions:
- tela `enable-page` inicialmente ativa;
- storage recebe `newsite.test`;
- site metadata mantém título da aba;
- `ENABLE_PAGE` chamado uma vez;
- grade passa a ter uma imagem.

### T08 — linhas 447–474 — site ativado sem imagens

O handler retorna lista vazia após habilitação.

Assertions:
- domínio ainda fica habilitado;
- `ENABLE_PAGE` ocorre uma vez;
- tela de enable/reload permanece ativa;
- texto instrui `Ctrl+F5`;
- botão force reload existe;
- não mostra “Nenhuma imagem detectada” no grid.

**Prova:** fallback UX específico em vez de grade vazia enganosa.

### T09 — linhas 476–534 — filtros de tamanho

Semeia 180×120 e verifica:
- inputs numéricos;
- ranges;
- shape preview.

Modifica range/input e prova persistência 220×160. Depois usa reset e prova 300×400 em UI + storage.

### T10 — linhas 536–558 — organização visual das settings

Assertions estruturais:
- lista de sites pertence à mesma section de auto-restore;
- seção “paralelo” precede filtro;
- filtro precede debug.

Usa `Node.DOCUMENT_POSITION_FOLLOWING`, portanto prova ordem real no DOM, não apenas texto.

### T11 — linhas 560–629 — preferências de interação

Semeia:
- botão flutuante desativado;
- clique individual ativado;
- confirmação de refazer desativada.

Assertions de conteúdo/estrutura:
- texto “Clique direito...”;
- label “Traduzir esta imagem”;
- único `settings-redo-confirm-enabled`;
- grupo e título “Sites habilitados”;
- `aria-labelledby`;
- redo dentro do grupo correto;
- label de confirmação;
- redo está na seção de “Substituição automática” e não na de “Interação na página”.

Assertions de valores:
- estados iniciais dos três toggles;
- após change, storage persiste `true/false/true`.

## 5. O que é implementação real versus mock

### Real nesta suíte

- parsing e markup de `popup.html`;
- dependência `shared-ui.js`;
- lógica `popup.js`;
- listeners DOM;
- renderização de cards/settings;
- leitura/escrita que passa pelos wrappers reais da implementação;
- decisões sobre actions enviadas;
- conteúdo textual;
- ordem e agrupamento do DOM.

### Simulado

- Chrome tabs;
- chrome.storage;
- chrome.runtime;
- responses do content script;
- comportamento do background;
- confirmação do usuário;
- fechamento real da janela do browser;
- layout/rendering engine completo de Chromium.

Portanto “integração real” significa integração real entre HTML/JS da extensão e a camada de mocks, não E2E de navegador real.

## 6. Evidência automatizada por comportamento

| Propriedade | Assertion | Classificação |
|---|---|---|
| arquivo pertence ao projeto Jest integration | `jest.config.js:74-80` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| script npm seleciona integration | `package.json:16` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| HTML real + dependências + popup real são carregados | `loadExtensionPage` + linhas 78-82 etc. | ✅ PROVADO DIRETAMENTE |
| 2 imagens + labels + indicador ativo | linhas 86-90 | ✅ PROVADO DIRETAMENTE |
| stop local e ausência de STOP_BATCH global | linhas 124-135 | ✅ PROVADO DIRETAMENTE |
| settings abre e lista dois sites | linhas 178-209 | ✅ PROVADO DIRETAMENTE |
| remoção tira host/siteMeta/UI | linhas 246-253 | ✅ PROVADO DIRETAMENTE |
| remoção preserva histórico salvo | nenhuma assertion sobre chapter/restore após remoção | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| toggles global/site/imagem persistem | linhas 296-321 | ✅ PROVADO DIRETAMENTE |
| Refazer remove a entrada alvo | linhas 388-409 | ✅ PROVADO DIRETAMENTE |
| Refazer preserva restoreMap + imagem da entrada keep | linhas 399 e 402 | ✅ PROVADO DIRETAMENTE |
| Refazer preserva restoreMeta/path da entrada keep | sem assertion correspondente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| habilitar domínio persiste + inicializa grade | linhas 433-444 | ✅ PROVADO DIRETAMENTE |
| site sem imagens mostra recarga | linhas 467-473 | ✅ PROVADO DIRETAMENTE |
| filtro sincroniza input/range/storage | linhas 502-520 | ✅ PROVADO DIRETAMENTE |
| reset restaura 300×400 | linhas 522-533 | ✅ PROVADO DIRETAMENTE |
| ordem das sections | linhas 550-557 | ✅ PROVADO DIRETAMENTE |
| labels/grupo de interação e refazer | linhas 586-603 | ✅ PROVADO DIRETAMENTE |
| toggles de interação persistem | linhas 604-625 | ✅ PROVADO DIRETAMENTE |
| todos os IDs REG/PU enumerados no `describe` possuem mapeamento individual | não há tabela/mapeamento; existem 11 `test()` | ⚠️ SEM TESTE/RASTREABILIDADE ESPECÍFICA |
| sem `.skip/.only` no arquivo | inspeção + gate de política | 🟦 GATE ESTÁTICO ESPECÍFICO |

## 7. Solicitações ao auditor

### 117-001 — TRACEABILITY_REVIEW — ACCEPTED

**Encontrado:** o `describe` da linha 11 enumera `REG-06/REG-07` e `PU-01` até `PU-81` (incluindo variantes), enquanto o arquivo contém 11 blocos `test()` e não possui mapeamento entre IDs e assertions.

**Arquivo auditado:** `tests/integration/popup.ui.test.js`.

**Evidência atual:** 11 casos concretos com assertions fortes, mas um cabeçalho de rastreabilidade muito mais amplo que a quantidade de cenários observáveis no arquivo.

**Evidência ausente:** matriz que diga qual ID é provado por qual caso/assertion ou indicação de que os IDs são um rótulo agregado compartilhado com outras suítes.

**Por que é necessária:** um leitor pode interpretar o nome do `describe` como prova individual de todos os IDs listados.

**Ação solicitada:** auditar a origem desses identificadores e, em mudança documental/de teste separada, mapear IDs para casos/assertions ou reduzir o rótulo ao escopo realmente provado.

**Evidência esperada:** tabela/mapeamento verificável ou nomenclatura alinhada aos 11 cenários.

**Possível regressão:** requisito marcado implicitamente como coberto pode perder sua assertion sem detecção de rastreabilidade.

**Impacto:** qualidade e auditabilidade da suíte.

**Severidade:** NORMAL.

### 117-002 — TEST_REQUIRED — ACCEPTED

**Encontrado:** o teste “remover site habilitado tira o dominio da lista mesmo quando existem imagens salvas no historico” cria `chapterList`, `chap_popup_remove_restoreMap` e `chap_popup_remove_restoreMeta`, porém após a remoção verifica somente `enabledDomains`, `siteMeta_<host>` e UI.

**Comportamento afetado:** preservação do histórico/traduções quando um site é removido da lista de habilitados.

**Evidência atual:** a presença de histórico é apenas precondição; não existe assertion pós-ação de que ele continua existindo.

**Evidência ausente:** leitura pós-remoção e comparação do capítulo, restoreMap e restoreMeta.

**Por que a evidência atual é insuficiente:** a implementação poderia apagar silenciosamente o histórico e o teste continuaria verde, contrariando a interpretação natural do título.

**Ação solicitada:** confirmar se preservação do histórico é contrato intencional. Se for, adicionar assertions diretas em alteração de teste separada; se não for, corrigir a descrição do cenário.

**Evidência esperada:** assertions específicas de preservação ou contrato textual explícito de deleção.

**Possível regressão:** remoção de domínio pode destruir traduções persistidas sem falha da suíte.

**Impacto:** dados locais de capítulos/traduções salvas.

**Severidade:** NORMAL.

### 117-003 — TEST_STRENGTH_REVIEW — ACCEPTED

**Encontrado:** o teste de Refazer prova preservação de `restoreMap[keepUrl]` e `images[1]`, mas não verifica `restoreMeta[keepUrl]` nem `paths[1]` após remover a imagem alvo.

**Arquivo auditado:** `tests/integration/popup.ui.test.js`.

**Evidência atual:** boa cobertura de deleção focal, GTC e parte do isolamento entre entradas.

**Evidência ausente:** assertions sobre estruturas paralelas “keep” já semeadas nas linhas 351-372.

**Por que importa:** uma regressão que remova metadata/path da imagem não-alvo poderia passar mantendo apenas restoreMap e image blob.

**Ação solicitada:** confirmar se preservação integral da entrada não-alvo faz parte do contrato de Refazer; se sim, adicionar assertions específicas em mudança separada.

**Evidência esperada:** `restoreMeta[keepUrl]` e `paths[1]` preservados após a ação.

**Possível regressão:** dano parcial em metadados de outra imagem do mesmo capítulo.

**Impacto:** consistência de histórico local.

**Severidade:** NORMAL.

## 8. Fonte integral auditada

```js
const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const {
    getStorageMock,
    getTabsMock,
    getRuntimeMock,
} = require('../mocks/chrome-api.mock.js');

describe('REG-06/REG-07/PU-01/PU-02/PU-03/PU-04/PU-05/PU-06/PU-07/PU-08/PU-09/PU-10/PU-11/PU-12/PU-13/PU-14/PU-15/PU-16/PU-17/PU-18/PU-19/PU-20/PU-21/PU-22/PU-23/PU-23b/PU-24/PU-25/PU-26/PU-27/PU-28/PU-29/PU-30/PU-31/PU-32/PU-33/PU-34/PU-35/PU-36/PU-37/PU-38/PU-39/PU-40/PU-41/PU-42/PU-43/PU-44/PU-45/PU-46/PU-47/PU-48/PU-49/PU-49b/PU-50/PU-51/PU-52/PU-53/PU-54/PU-55/PU-56/PU-57/PU-58/PU-59/PU-60/PU-61/PU-62/PU-63/PU-64/PU-65/PU-66/PU-67/PU-68/PU-69/PU-70/PU-71/PU-72/PU-73/PU-74/PU-75/PU-76/PU-77/PU-78/PU-79/PU-80/PU-81: popup.js + popup.html - integracao real', () => {
    let storageMock;
    let tabsMock;
    let runtimeMock;

    async function createActiveTab(url, title = 'Manga Page') {
        const tab = await tabsMock.create({ url, active: true });
        tabsMock._tabs.get(tab.id).title = title;
        return tab;
    }

    function registerPopupTabHandler(tabId, {
        images = [],
        onEnablePage = null,
        onStartTranslation = null,
        onStopTranslation = null,
    } = {}) {
        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({ images });
            } else if (message.action === 'SET_SELECTED_IMAGES') {
                sendResponse({ success: true });
            } else if (message.action === 'ENABLE_PAGE') {
                if (onEnablePage) onEnablePage(message);
                sendResponse({ success: true });
            } else if (message.action === 'HIGHLIGHT_IMAGE') {
                sendResponse({ success: true });
            } else if (message.action === 'START_TRANSLATION_FROM_POPUP') {
                if (onStartTranslation) onStartTranslation(message);
                sendResponse({ ok: true });
            } else if (message.action === 'STOP_TRANSLATION_FROM_POPUP') {
                if (onStopTranslation) onStopTranslation(message);
                sendResponse({ ok: true, batchId: 'batch-owned-by-active-tab' });
            }
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        runtimeMock = getRuntimeMock();
        runtimeMock._messageListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(() => {
        jest.restoreAllMocks();
        global.confirm = window.confirm;
    });

    test('carrega imagens da aba ativa e mostra indicador de traducao em andamento', async () => {
        const tab = await createActiveTab('https://reader.test/chapter-1', 'Reader Test');
        registerPopupTabHandler(tab.id, {
            images: [
                { index: 0, src: 'https://reader.test/p1.png', width: 800, height: 1200 },
                { index: 1, src: 'https://reader.test/p2.png', width: 820, height: 1180 },
            ],
        });

        await storageMock.set({
            enabledDomains: ['reader.test'],
            mt_state: { activeJobsCount: 2, completedJobs: 0, jobQueue: [] },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(8);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(2);
        expect(document.getElementById('selection-count').textContent).toBe('2 imagens selecionadas');
        expect(document.getElementById('btn-translate').textContent).toBe('Traduzir 2 Páginas');
        expect(document.getElementById('translating-dot').classList.contains('visible')).toBe(true);
        expect(document.getElementById('translating-label').classList.contains('visible')).toBe(true);
    });

    test('botão Parar cancela o lote da aba atual e nunca envia STOP_BATCH global', async () => {
        const tab = await createActiveTab('https://reader.test/chapter-owned-stop', 'Reader Test');
        const startMessages = [];
        const stopMessages = [];
        registerPopupTabHandler(tab.id, {
            images: [{ index: 0, src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
            onStartTranslation: message => startMessages.push(message),
            onStopTranslation: message => stopMessages.push(message),
        });

        await storageMock.set({
            enabledDomains: ['reader.test'],
            mt_state: {
                activeJobsCount: 1,
                completedJobs: 0,
                totalJobs: 1,
                isProcessing: true,
                jobQueue: [],
            },
        });

        const runtimeSpy = jest.spyOn(runtimeMock, 'sendMessage');
        const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        document.getElementById('btn-translate').click();
        await flushAsyncTasks(8);
        expect(startMessages).toHaveLength(1);

        document.getElementById('btn-progress-stop').click();
        await flushAsyncTasks(8);

        expect(stopMessages).toEqual([{ action: 'STOP_TRANSLATION_FROM_POPUP' }]);
        expect(runtimeSpy.mock.calls.some(([message]) =>
            message && message.action === 'STOP_BATCH'
        )).toBe(false);
        expect(closeSpy).toHaveBeenCalled();
    });

    test('abre o painel de configuracoes e renderiza os sites habilitados sem crash', async () => {
        const tab = await createActiveTab('https://reader.test/chapter-2', 'Reader Test');
        registerPopupTabHandler(tab.id, {
            images: [{ index: 0, src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        await storageMock.set({
            enabledDomains: ['reader.test', 'mirror.test'],
            customPrompt: 'Prompt popup real',
            autoRestoreEnabled: false,
            autoRestoreDisabledSites: ['mirror.test'],
            chapterList: [{
                id: 'chap_popup_auto',
                title: 'Capítulo Popup',
                url: 'https://reader.test/chapter-2',
                timestamp: 1710000000000,
            }],
            chap_popup_auto_restoreMap: {
                'https://reader.test/p1.png': 'data:image/png;base64,UE9QVVBO',
            },
            chap_popup_auto_restoreMeta: {
                'https://reader.test/p1.png': {
                    host: 'reader.test',
                    sourceUrl: 'https://reader.test/p1.png',
                    index: 0,
                    updatedAt: 1710000001000,
                },
            },
            'siteMeta_reader.test': { title: 'Reader Oficial' },
            'siteMeta_mirror.test': { title: 'Mirror Hub' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(8);

        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        expect(document.getElementById('settings-page').classList.contains('active')).toBe(true);
        expect(document.getElementById('settings-prompt').value).toBe('Prompt popup real');
        expect(document.getElementById('settings-auto-restore-enabled').checked).toBe(false);
        expect(document.querySelectorAll('#settings-sites-list .settings-site-item')).toHaveLength(2);
        expect(document.getElementById('settings-sites-list').textContent).toContain('reader.test');
        expect(document.getElementById('settings-sites-list').textContent).toContain('mirror.test');
        expect(document.querySelectorAll('#settings-sites-list .settings-site-auto input')).toHaveLength(2);
        expect(Array.from(document.querySelectorAll('#settings-sites-list .settings-site-item'))
            .find(item => item.textContent.includes('reader.test'))
            .querySelector('.settings-site-auto input').checked).toBe(true);
        expect(Array.from(document.querySelectorAll('#settings-sites-list .settings-site-item'))
            .find(item => item.textContent.includes('mirror.test'))
            .querySelector('.settings-site-auto input').checked).toBe(false);
        const readerSite = Array.from(document.querySelectorAll('#settings-sites-list .settings-site-item'))
            .find(item => item.textContent.includes('reader.test'));
        const mirrorSite = Array.from(document.querySelectorAll('#settings-sites-list .settings-site-item'))
            .find(item => item.textContent.includes('mirror.test'));
        expect(window.getComputedStyle(document.getElementById('settings-sites-list')).overflowY).toBe('auto');
        expect(readerSite.classList.contains('open')).toBe(false);
        readerSite.querySelector('.settings-site-main').click();
        await flushAsyncTasks(8);
        const openedReaderSite = Array.from(document.querySelectorAll('#settings-sites-list .settings-site-item'))
            .find(item => item.textContent.includes('reader.test'));
        expect(openedReaderSite.classList.contains('open')).toBe(true);
        expect(openedReaderSite.querySelector('.settings-site-main').getAttribute('aria-expanded')).toBe('true');
        expect(window.getComputedStyle(openedReaderSite.querySelector('.settings-site-images')).overflowY).toBe('auto');
        expect(openedReaderSite.querySelectorAll('.settings-auto-image-item')).toHaveLength(1);
        expect(openedReaderSite.textContent).toContain('Capítulo Popup');
        expect(mirrorSite.querySelectorAll('.settings-auto-image-item')).toHaveLength(0);
    });

    test('remover site habilitado tira o dominio da lista mesmo quando existem imagens salvas no historico', async () => {
        const host = 'reader.test';
        const cleanUrl = `https://${host}/p1.png`;
        const tab = await createActiveTab(`https://${host}/chapter-remove`, 'Reader Test');
        registerPopupTabHandler(tab.id, {
            images: [{ index: 0, src: cleanUrl, width: 800, height: 1200 }],
        });

        await storageMock.set({
            enabledDomains: [host],
            chapterList: [{
                id: 'chap_popup_remove',
                title: 'Capítulo Remove',
                url: `https://${host}/chapter-remove`,
                timestamp: 1710000000000,
            }],
            chap_popup_remove_restoreMap: {
                [cleanUrl]: 'data:image/png;base64,UE9Q',
            },
            chap_popup_remove_restoreMeta: {
                [cleanUrl]: { host, sourceUrl: cleanUrl, index: 0, updatedAt: 1710000000000 },
            },
            [`siteMeta_${host}`]: { title: 'Reader Test' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        document.querySelector('#settings-sites-list .settings-site-remove').click();
        await flushAsyncTasks(10);

        const data = await storageMock.get(['enabledDomains', `siteMeta_${host}`]);
        expect(data.enabledDomains).toEqual([]);
        expect(data[`siteMeta_${host}`]).toBeUndefined();
        expect(document.querySelectorAll('#settings-sites-list .settings-site-item')).toHaveLength(0);
        expect(document.getElementById('settings-sites-list').textContent).toContain('Nenhum site habilitado');
    });

    test('configuracoes de auto-substituicao no popup salvam global, site e imagem especifica', async () => {
        const host = 'reader.test';
        const cleanUrl = `https://${host}/p1.png`;
        const tab = await createActiveTab(`https://${host}/chapter-auto`, 'Reader Test');
        registerPopupTabHandler(tab.id, {
            images: [{ index: 0, src: cleanUrl, width: 800, height: 1200 }],
        });

        await storageMock.set({
            enabledDomains: [host],
            autoRestoreEnabled: true,
            chapterList: [{
                id: 'chap_popup_controls',
                title: 'Capítulo Controles',
                url: `https://${host}/chapter-auto`,
                timestamp: 1710000000000,
            }],
            chap_popup_controls_restoreMap: {
                [cleanUrl]: 'data:image/png;base64,QVVUTw==',
            },
            chap_popup_controls_restoreMeta: {
                [cleanUrl]: {
                    host,
                    sourceUrl: cleanUrl,
                    index: 0,
                    updatedAt: 1710000002000,
                },
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(8);
        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        const globalToggle = document.getElementById('settings-auto-restore-enabled');
        globalToggle.checked = false;
        globalToggle.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);

        const siteAuto = document.querySelector('#settings-sites-list .settings-site-auto input');
        siteAuto.checked = false;
        siteAuto.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(6);

        document.querySelector('#settings-sites-list .settings-auto-image-block-btn').click();
        await flushAsyncTasks(6);

        const data = await storageMock.get([
            'autoRestoreEnabled',
            'autoRestoreDisabledSites',
            'autoRestoreBlockedImages',
        ]);

        expect(data.autoRestoreEnabled).toBe(false);
        expect(data.autoRestoreDisabledSites).toContain(host);
        expect(data.autoRestoreBlockedImages[cleanUrl]).toEqual(expect.objectContaining({
            cleanUrl,
            host,
            chapterTitle: 'Capítulo Controles',
        }));
    });

    test('botao Refazer apaga a traducao salva da imagem especifica e limpa o cache GTC por URL', async () => {
        const host = 'reader.test';
        const cleanUrl = `https://${host}/wrong.png`;
        const keepUrl = `https://${host}/keep.png`;
        const tab = await createActiveTab(`https://${host}/chapter-redo`, 'Reader Test');
        registerPopupTabHandler(tab.id, {
            images: [{ index: 0, src: cleanUrl, width: 800, height: 1200 }],
        });
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {
            if (callback) setTimeout(() => callback({ ok: true, deleted: 1 }), 0);
        });
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        global.confirm = window.confirm;

        await storageMock.set({
            enabledDomains: [host],
            redoConfirmEnabled: false,
            chapterList: [{
                id: 'chap_popup_redo',
                title: 'Capítulo Refazer',
                url: `https://${host}/chapter-redo`,
                timestamp: 1710000000000,
            }],
            chap_popup_redo_images: {
                0: 'data:image/png;base64,ERRADA',
                1: 'data:image/png;base64,CERTA',
            },
            chap_popup_redo_paths: {
                0: 'C:\\Downloads\\errada.png',
                1: 'C:\\Downloads\\certa.png',
            },
            chap_popup_redo_restoreMap: {
                [cleanUrl]: 'data:image/png;base64,ERRADA',
                [keepUrl]: 'data:image/png;base64,CERTA',
            },
            chap_popup_redo_restoreMeta: {
                [cleanUrl]: {
                    host,
                    sourceUrl: cleanUrl,
                    index: 0,
                    updatedAt: 1710000003000,
                },
                [keepUrl]: {
                    host,
                    sourceUrl: keepUrl,
                    index: 1,
                    updatedAt: 1710000001000,
                },
            },
            autoRestoreBlockedImages: {
                [cleanUrl]: { cleanUrl, host },
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(8);
        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        document.querySelector('#settings-sites-list .settings-auto-image-redo-btn').click();
        await flushAsyncTasks(10);

        const data = await storageMock.get([
            'chap_popup_redo_images',
            'chap_popup_redo_paths',
            'chap_popup_redo_restoreMap',
            'chap_popup_redo_restoreMeta',
            'autoRestoreBlockedImages',
        ]);
        expect(data.chap_popup_redo_restoreMap[cleanUrl]).toBeUndefined();
        expect(data.chap_popup_redo_restoreMap[keepUrl]).toBe('data:image/png;base64,CERTA');
        expect(data.chap_popup_redo_restoreMeta[cleanUrl]).toBeUndefined();
        expect(data.chap_popup_redo_images[0]).toBeUndefined();
        expect(data.chap_popup_redo_images[1]).toBe('data:image/png;base64,CERTA');
        expect(data.chap_popup_redo_paths[0]).toBeUndefined();
        expect(data.autoRestoreBlockedImages[cleanUrl]).toBeUndefined();
        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'GTC_DELETE_BY_CLEAN_URL', cleanUrl }),
            expect.any(Function)
        );
        expect(document.querySelectorAll('#settings-sites-list .settings-auto-image-item')).toHaveLength(1);
    });

    test('habilita um novo dominio via botao do popup e inicializa a grade', async () => {
        const tab = await createActiveTab('https://newsite.test/chapter-3', 'New Site Title');
        const onEnablePage = jest.fn();

        registerPopupTabHandler(tab.id, {
            images: [{ index: 0, src: 'https://newsite.test/p1.png', width: 900, height: 1400 }],
            onEnablePage,
        });

        await storageMock.set({
            enabledDomains: [],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(8);

        expect(document.getElementById('enable-page').classList.contains('active')).toBe(true);

        document.getElementById('btn-enable').click();
        await flushAsyncTasks(10);

        const data = await storageMock.get(['enabledDomains', 'siteMeta_newsite.test']);
        expect(data.enabledDomains).toEqual(['newsite.test']);
        expect(data['siteMeta_newsite.test']).toEqual(expect.objectContaining({
            title: 'New Site Title',
        }));
        expect(onEnablePage).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(1);
    });

    test('ao ativar site sem imagens detectadas mostra tela de recarregar em vez de grade vazia', async () => {
        const tab = await createActiveTab('https://empty-after-enable.test/chapter-1', 'Empty Enable');
        const onEnablePage = jest.fn();
        registerPopupTabHandler(tab.id, {
            images: [],
            onEnablePage,
        });

        await storageMock.set({ enabledDomains: [] });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        document.getElementById('btn-enable').click();
        await flushAsyncTasks(12);

        const data = await storageMock.get(['enabledDomains']);
        expect(data.enabledDomains).toEqual(['empty-after-enable.test']);
        expect(onEnablePage).toHaveBeenCalledTimes(1);
        expect(document.getElementById('enable-page').classList.contains('active')).toBe(true);
        expect(document.getElementById('enable-section').textContent).toContain('Ctrl+F5');
        expect(document.getElementById('btn-force-reload')).toBeTruthy();
        expect(document.getElementById('image-grid').textContent).not.toContain('Nenhuma imagem detectada');
    });

    test('sincroniza campos, controles deslizantes, prévia e reset do filtro de tamanho', async () => {
        const tab = await createActiveTab('https://reader.test/chapter-filter', 'Reader Test');
        registerPopupTabHandler(tab.id, {
            images: [{ index: 0, src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });
        await storageMock.set({
            enabledDomains: ['reader.test'],
            imageMinWidth: 180,
            imageMinHeight: 120,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        const widthInput = document.getElementById('settings-image-min-width');
        const heightInput = document.getElementById('settings-image-min-height');
        const widthRange = document.getElementById('settings-image-min-width-range');
        const heightRange = document.getElementById('settings-image-min-height-range');
        const shape = document.getElementById('image-filter-shape');

        expect(widthInput.value).toBe('180');
        expect(heightInput.value).toBe('120');
        expect(widthRange.value).toBe('180');
        expect(heightRange.value).toBe('120');
        expect(shape.textContent).toBe('180 × 120');

        widthRange.value = '220';
        widthRange.dispatchEvent(new Event('input', { bubbles: true }));
        heightInput.value = '160';
        heightInput.dispatchEvent(new Event('input', { bubbles: true }));
        await flushAsyncTasks(4);

        expect(widthInput.value).toBe('220');
        expect(heightRange.value).toBe('160');
        expect(shape.textContent).toBe('220 × 160');
        expect(await storageMock.get(['imageMinWidth', 'imageMinHeight'])).toEqual({
            imageMinWidth: 220,
            imageMinHeight: 160,
        });

        document.getElementById('settings-image-min-reset').click();
        await flushAsyncTasks(4);

        expect(widthInput.value).toBe('300');
        expect(heightInput.value).toBe('400');
        expect(widthRange.value).toBe('300');
        expect(heightRange.value).toBe('400');
        expect(shape.textContent).toBe('300 × 400');
        expect(await storageMock.get(['imageMinWidth', 'imageMinHeight'])).toEqual({
            imageMinWidth: 300,
            imageMinHeight: 400,
        });
    });

    test('mantém sites habilitados agrupados com a substituição automática e o filtro entre paralelo e debug', async () => {
        const tab = await createActiveTab('https://reader.test/chapter-layout', 'Reader Test');
        registerPopupTabHandler(tab.id);
        await storageMock.set({ enabledDomains: ['reader.test'] });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        const autoRestoreSection = document.getElementById('settings-auto-restore-row').closest('.settings-section');
        expect(document.getElementById('settings-sites-list').closest('.settings-section')).toBe(autoRestoreSection);

        const parallel = document.getElementById('settings-parallel').closest('.settings-section');
        const filter = document.getElementById('image-filter-control').closest('.settings-section');
        const debug = document.getElementById('debug-toggle-label').closest('.settings-section');
        expect(parallel.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(filter.compareDocumentPosition(debug) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('configurações do popup restauram e persistem controles de interação', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-interaction-settings`, 'Reader Test');
        registerPopupTabHandler(tab.id, { images: [] });

        await storageMock.set({
            enabledDomains: [host],
            floatingButtonEnabled: false,
            clickToTranslateEnabled: true,
            redoConfirmEnabled: false,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        const floating = document.getElementById('settings-floating-button-enabled');
        const single = document.getElementById('settings-click-to-translate-enabled');
        const redo = document.getElementById('settings-redo-confirm-enabled');

        expect(single.closest('label').textContent).toContain('Clique direito para traduzir uma única imagem');
        expect(single.closest('label').textContent).toContain('Traduzir esta imagem');

        const enabledSitesGroup = document.getElementById('settings-enabled-sites-group');
        const enabledSitesTitle = document.getElementById('settings-enabled-sites-title');
        const sitesList = document.getElementById('settings-sites-list');
        expect(document.querySelectorAll('#settings-redo-confirm-enabled')).toHaveLength(1);
        expect(enabledSitesGroup).not.toBeNull();
        expect(enabledSitesTitle).not.toBeNull();
        expect(enabledSitesTitle.textContent.trim()).toBe('Sites habilitados');
        expect(enabledSitesGroup.getAttribute('aria-labelledby')).toBe('settings-enabled-sites-title');
        expect(enabledSitesGroup.contains(redo)).toBe(true);
        expect(enabledSitesGroup.contains(sitesList)).toBe(true);
        expect(redo.closest('#settings-enabled-sites-group')).toBe(enabledSitesGroup);
        expect(redo.closest('label').textContent).toContain('Confirmar ao apertar o botão de refazer a imagem');

        const redoSection = redo.closest('.settings-section');
        expect(redoSection.querySelector('.settings-section-title').textContent).toContain('Substituição automática');
        expect(floating.checked).toBe(false);
        expect(single.checked).toBe(true);
        expect(redo.checked).toBe(false);

        floating.checked = true;
        floating.dispatchEvent(new Event('change', { bubbles: true }));
        single.checked = false;
        single.dispatchEvent(new Event('change', { bubbles: true }));
        redo.checked = true;
        redo.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(5);

        const data = await storageMock.get([
            'floatingButtonEnabled',
            'clickToTranslateEnabled',
            'redoConfirmEnabled',
        ]);
        expect(data).toEqual(expect.objectContaining({
            floatingButtonEnabled: true,
            clickToTranslateEnabled: false,
            redoConfirmEnabled: true,
        }));
        const interactionSection = Array.from(document.querySelectorAll('.settings-section'))
            .find(section => section.querySelector('.settings-section-title')?.textContent.includes('Interação na página'));
        expect(interactionSection?.contains(redo)).toBe(false);
    });

});
```

## 9. Mapa integral de linhas/posições

| Linhas | Função | Cobertura documental |
|---:|---|---|
| 1–9 | imports de helper e mocks | dependências reais da suíte |
| 10 | separador | estrutural |
| 11 | `describe` + rótulos REG/PU | escopo nominal; rastreabilidade em 117-001 |
| 12–14 | refs para mocks | estado local da suíte |
| 15 | separador | estrutural |
| 16–20 | `createActiveTab` | helper de contexto ativo |
| 21 | separador | estrutural |
| 22–46 | `registerPopupTabHandler` | protocolo simulado tab↔popup |
| 47 | separador | estrutural |
| 48–57 | `beforeEach` | reset de módulos, mocks, storage e DOM |
| 58 | separador | estrutural |
| 59–62 | `afterEach` | restore de spies/confirm |
| 63 | separador | estrutural |
| 64–91 | T01 grade + indicador | ✅ assertions diretas |
| 92 | separador | estrutural |
| 93–136 | T02 stop local vs global | ✅ assertions diretas |
| 137 | separador | estrutural |
| 138–210 | T03 settings/sites | ✅ assertions diretas |
| 211 | separador | estrutural |
| 212–254 | T04 remoção de site | ✅ remoção; ⚠️ histórico não verificado |
| 255 | separador | estrutural |
| 256–322 | T05 auto-substituição em 3 níveis | ✅ assertions diretas |
| 323 | separador | estrutural |
| 324–410 | T06 Refazer | ✅ alvo/parte do keep; ⚠️ keep meta/path |
| 411 | separador | estrutural |
| 412–445 | T07 habilitar domínio | ✅ assertions diretas |
| 446 | separador | estrutural |
| 447–474 | T08 fallback recarga | ✅ assertions diretas |
| 475 | separador | estrutural |
| 476–534 | T09 filtros + reset | ✅ assertions diretas |
| 535 | separador | estrutural |
| 536–558 | T10 agrupamento/ordem | ✅ assertions DOM |
| 559 | separador | estrutural |
| 560–629 | T11 interação + persistência | ✅ assertions diretas |
| 630 | separador | estrutural |
| 631 | fechamento `describe` | estrutural |
| posição 632 | newline final | 🟦 leitura integral do blob |

## 10. Invariantes da suíte

1. cada teste começa com módulos e storage limpos;
2. o HTML carregado é o arquivo real do popup;
3. scripts anteriores ao popup no HTML também são carregados;
4. `DOMContentLoaded` é disparado de forma controlada;
5. ações do popup contra a aba ativa usam handler por tab ID;
6. qualquer prova de persistência deve vir de leitura do storage após a ação;
7. ausência de chamada global `STOP_BATCH` é explicitamente assertada;
8. testes de UI dependem de IDs/classes reais do HTML;
9. waits usam `flushAsyncTasks`, não um navegador real;
10. mocks da Chrome API não equivalem à implementação Chrome.

## 11. Casos-limite e fronteiras de prova

- `flushAsyncTasks(n)` só drena rodadas de timers zero; não prova comportamento com timers longos;
- JSDOM não reproduz layout/painting de Chromium;
- `window.close` é spy, não fechamento de popup real;
- handlers de tabs cobrem somente actions explicitamente implementadas no helper;
- a suíte não injeta `runtime.lastError` nos cenários auditados;
- não há falha de storage/tabs/runtime simulada nestes 11 casos;
- o comportamento “Refazer” atravessa `shared-ui.js`, então atribuí-lo exclusivamente a `popup.js` seria impreciso;
- os testes provam estado e estrutura específicos, não acessibilidade completa do popup;
- texto/DOM exato pode detectar regressões de UX, mas também cria acoplamento intencional à estrutura atual.

## 12. Autoauditoria do AGENTE 17

- [x] reserva #117 criada com semântica CREATE ONLY;
- [x] reserva relida e ownership confirmado como `AGENTE 17`;
- [x] SHA do source reconfirmado antes da escrita;
- [x] fonte integral incorporada sem alterar teste, popup, mocks ou helpers;
- [x] 631 linhas textuais + newline = 632 posições documentadas;
- [x] todos os 11 `test()` foram identificados;
- [x] ausência de `.skip/.only` foi verificada;
- [x] harness `loadExtensionPage` foi lido para confirmar uso da implementação real;
- [x] `popup.html` foi lido para confirmar que `shared-ui.js` precede `popup.js`;
- [x] assertions foram distinguidas de precondições;
- [x] lacunas foram registradas como `audit_requests`, sem corrigi-las;
- [x] nenhum arquivo externo foi modificado.

**Resultado:** documentação concluída para o blob `57158c9b6e6f88955bf82a292e75624dc2ad8d0c`; 117-001 a 117-003 permanecem ACCEPTED como dívida externa e não são apresentadas como prova já implementada.

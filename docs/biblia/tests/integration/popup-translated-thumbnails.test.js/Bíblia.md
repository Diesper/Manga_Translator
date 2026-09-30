# Bíblia técnica — tests/integration/popup-translated-thumbnails.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `7e4fea854647fe1d21b8066219f9eae8cfd20d1e`  
> **Agente responsável:** AGENTE 11  
> **Tipo:** suíte Jest/jsdom de integração do popup — miniaturas traduzidas, lazy loading, migração e fallback legado  
> **Linhas textuais:** **338**  
> **Posições documentais:** **339**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte valida a aba **Traduzidas** do popup usando `extension/popup/popup.html` e `extension/popup/popup.js` reais. O navegador, tabs, storage e o bridge `chrome.runtime.sendMessage` são controlados por mocks, mas a lógica de agrupamento/renderização/lazy loading do popup não é reimplementada no teste.

Os cinco casos cobrem:

1. agrupamento por site e capítulo, preservando hierarquia e número de miniaturas;
2. lazy loading: nenhum `SM_GET_ASSET` antes da interseção e uma leitura após o primeiro trigger;
3. estado visual de falha quando asset/página não podem ser obtidos;
4. tentativa de `SM_MIGRATE_CHAPTER` seguida por nova consulta de índice;
5. fallback para `chap_<id>_images` quando a migração não materializa índice novo.

A implementação real localizada em `popup.js` usa `SM_PAGE_INDEX`, tenta `SM_MIGRATE_CHAPTER` quando o índice está vazio, solicita `SM_GET_ASSET` para assets e usa `IntersectionObserver` para adiar a leitura até a miniatura entrar na área visível.

## 2. Dependências e fronteiras

### Implementação real sob teste

- `extension/popup/popup.html`;
- `extension/popup/popup.js`;
- `extension/shared/shared-ui.js`, carregado antes de `popup.js` pelo harness conforme a ordem do HTML.

### Harness e mocks

- `tests/helpers/load-extension-page.js`;
- `tests/mocks/chrome-api.mock.js`;
- `chrome.runtime.sendMessage` é espionado/substituído;
- Storage e Tabs são mocks;
- `IntersectionObserver` é removido ou substituído por fake determinístico em cenários específicos.

### O que a suíte não prova

Ela **não prova o background/IndexedDB real** para `SM_CHAPTERS_STATS`, `SM_PAGE_INDEX`, `SM_GET_ASSET`, `SM_GET_PAGE` ou `SM_MIGRATE_CHAPTER`, pois essas respostas são simuladas. O que ela prova diretamente é a reação do **popup real** aos contratos de resposta fornecidos.

## 3. Fixtures e isolamento

- `jest.resetModules()` evita cache de módulos entre casos.
- Storage é limpo em todo `beforeEach`.
- DOM é resetado antes/depois.
- `IntersectionObserver` original é preservado e restaurado.
- `jest.restoreAllMocks()` fecha spies.
- Respostas do runtime usam `setTimeout(..., 0)`, mantendo assíncronia de callback.
- A fixture de dois sites usa timestamps 200/100 e metadados de site distintos.
- A aba real do popup é aberta no jsdom e o botão `translated-tab` é clicado explicitamente.

## 4. Evidência por comportamento

| Comportamento | Assertion / cenário | Classificação |
|---|---|---|
| duas pastas de site são renderizadas | linha 139 | ✅ PROVADO DIRETAMENTE |
| Reader A e Reader B aparecem nas pastas corretas | linhas 141–144 | ✅ PROVADO DIRETAMENTE |
| capítulo A recebe 2 miniaturas e B recebe 1 | linhas 149–150 | ✅ PROVADO DIRETAMENTE |
| hierarquia mantém um bloco de botões por capítulo | linhas 151–152 | ✅ PROVADO DIRETAMENTE |
| miniaturas resolvem assets A0/A1/B0 corretos | linhas 156–158 | ✅ PROVADO DIRETAMENTE |
| com observer, nenhum asset é buscado antes de interseção | linhas 180–181 | ✅ PROVADO DIRETAMENTE |
| há três observers para três miniaturas | linha 182 | ✅ PROVADO DIRETAMENTE |
| após primeiro trigger ocorre uma única leitura de asset | linhas 184–188 | ✅ PROVADO DIRETAMENTE |
| falha de asset mantém card e marca `failed` / “Falha” | linhas 231–235 | ✅ PROVADO DIRETAMENTE |
| índice vazio provoca migração do capítulo | linha 285 | ✅ PROVADO DIRETAMENTE |
| índice é consultado novamente após migração | linha 286 | ✅ PROVADO DIRETAMENTE |
| asset migrado aparece na miniatura | linhas 287–288 | ✅ PROVADO DIRETAMENTE |
| fallback legado usa página 4 persistida | linhas 320–336 | ✅ PROVADO DIRETAMENTE |

## 5. Invariantes documentadas

1. miniaturas permanecem dentro do capítulo e site correspondentes;
2. ausência de `IntersectionObserver` ativa carregamento imediato/fallback;
3. presença de `IntersectionObserver` posterga `SM_GET_ASSET`;
4. falha de leitura não remove o capítulo/card;
5. índice vazio leva à tentativa de migração antes do legado;
6. migração bem-sucedida é seguida por nova consulta de índice;
7. se o novo índice continuar indisponível, dados legados ainda podem renderizar miniaturas;
8. a suíte deve restaurar mocks/observer/DOM entre cenários.

## 6. Análise crítica da força dos testes

### 6.1 “somente a miniatura afetada” não é realmente provado

O terceiro teste tem o título **“marca somente a miniatura afetada”**, mas sua fixture cria **apenas uma miniatura**. As assertions provam que o card único continua existindo e fica `failed`; não existe uma miniatura irmã saudável para provar isolamento do erro.

Portanto essa parte do título deve ser tratada como intenção, não como propriedade já provada.

### 6.2 Lazy loading prova o gate de requisição, mas não toda a conclusão visual

O segundo teste prova zero chamadas antes da interseção e uma chamada depois. Ele não verifica:
- qual `assetId` foi pedido após o trigger;
- se o `img.src` daquele card foi atualizado;
- se o observer foi desconectado;
- se um segundo trigger não gera download duplicado.

O primeiro teste prova mapeamento de assets no caminho **sem** `IntersectionObserver`, não no caminho lazy.

### 6.3 Fronteira de armazenamento é mockada

A suíte é forte para a lógica de UI do popup, mas não deve ser usada como prova direta da implementação do background/storage-manager. O roteamento real desses comandos possui testes próprios em outras suítes.

### 6.4 FakeIntersectionObserver é propositalmente mínimo

`disconnect()` é no-op e o fake guarda um único target por instância. Isso é suficiente para o contrato aqui observado, mas não prova cleanup, unobserve, múltiplos targets ou comportamento real do browser.

## 7. Solicitações ao auditor

### 115-001 — ASSERTION_GAP — OPEN

**Encontrado:** o teste “falha ao buscar asset mantém a caixa e marca somente a miniatura afetada” usa apenas um card.

**Evidência existente:** o card único permanece no DOM, recebe classe `failed` e contém “Falha”.

**Evidência ausente:** um segundo card saudável que permaneça carregado/não-`failed` enquanto o primeiro falha.

**Necessário:** ampliar o teste em alteração separada com ao menos duas miniaturas e falha seletiva por asset, mantendo uma irmã saudável.

**Risco:** regressão que marque o capítulo inteiro ou cards irmãos como falhos ainda poderia satisfazer o teste atual.

### 115-002 — TEST_STRENGTH — OPEN

**Encontrado:** o caso de `IntersectionObserver` verifica somente contagem de `SM_GET_ASSET`.

**Evidência existente:** zero chamadas antes do trigger, três observers criados e uma chamada após o primeiro trigger.

**Evidência ausente:** `assetId` correto, atualização do `img.src`, disconnect e idempotência diante de trigger repetido.

**Necessário:** adicionar assertions focais no cenário lazy, usando o popup real e o fake observer existente ou equivalente.

**Risco:** regressões de associação card→asset, atualização visual ou duplicação de downloads podem passar sem falhar o teste atual.

## 8. Fonte integral exata

```js
const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const {
    getStorageMock,
    getTabsMock,
} = require('../mocks/chrome-api.mock.js');

function dataUrl(label) {
    return 'data:image/png;base64,' + Buffer.from(label).toString('base64');
}

describe('popup Traduzidas — miniaturas por capítulo/site com lazy loading', () => {
    let storageMock;
    let tabsMock;
    let sendSpy;
    let pageIndexCalls;
    let originalIntersectionObserver;

    async function createActiveTab(url, title = 'Manga Page') {
        const tab = await tabsMock.create({ url, active: true });
        tabsMock._tabs.get(tab.id).title = title;
        return tab;
    }

    function registerPopupTabHandler(tabId) {
        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') sendResponse({ images: [] });
            else if (message.action === 'SET_SELECTED_IMAGES') sendResponse({ success: true });
            else sendResponse({ success: true });
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
        pageIndexCalls = new Map();
        originalIntersectionObserver = global.IntersectionObserver;

        sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                const stats = {};
                (message.chapterIds || []).forEach(id => {
                    stats[id] = {
                        pageCount: id === 'chap_a' ? 2 : id === 'chap_b' ? 1 : 0,
                        indices: id === 'chap_a' ? [0, 1] : id === 'chap_b' ? [0] : [],
                    };
                });
                if (callback) setTimeout(() => callback({ ok: true, stats }), 0);
                return;
            }

            if (message.action === 'SM_PAGE_INDEX') {
                const count = (pageIndexCalls.get(message.chapterId) || 0) + 1;
                pageIndexCalls.set(message.chapterId, count);
                const pages = message.chapterId === 'chap_a'
                    ? [
                        { pageIndex: 0, assetId: 'asset-a0', width: 800, height: 1200 },
                        { pageIndex: 1, assetId: 'asset-a1', width: 820, height: 1180 },
                    ]
                    : message.chapterId === 'chap_b'
                        ? [{ pageIndex: 0, assetId: 'asset-b0', width: 900, height: 1300 }]
                        : [];
                if (callback) setTimeout(() => callback({ ok: true, pages }), 0);
                return;
            }

            if (message.action === 'SM_GET_ASSET') {
                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl(message.assetId) }), 0);
                return;
            }

            if (message.action === 'SM_MIGRATE_CHAPTER') {
                if (callback) setTimeout(() => callback({ ok: true }), 0);
                return;
            }

            if (message.action === 'SM_GET_PAGE') {
                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl(`page-${message.pageIndex}`) }), 0);
                return;
            }

            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        global.IntersectionObserver = originalIntersectionObserver;
        window.IntersectionObserver = originalIntersectionObserver;
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    async function loadPopupWithTwoSites() {
        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test', 'reader-b.test'],
            chapterList: [
                {
                    id: 'chap_a',
                    title: 'Capítulo A',
                    url: 'https://reader-a.test/chapter-a',
                    timestamp: 200,
                },
                {
                    id: 'chap_b',
                    title: 'Capítulo B',
                    url: 'https://reader-b.test/chapter-b',
                    timestamp: 100,
                },
            ],
            'siteMeta_reader-a.test': { title: 'Reader A' },
            'siteMeta_reader-b.test': { title: 'Reader B' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(16);
    }

    test('renderiza miniaturas dentro do capítulo e site corretos sem alterar a hierarquia atual', async () => {
        // Este caso valida o fallback sem IntersectionObserver; o teste seguinte
        // cobre explicitamente o caminho lazy real.
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        await loadPopupWithTwoSites();

        const folders = [...document.querySelectorAll('#chapter-list .site-folder')];
        expect(folders).toHaveLength(2);

        const folderA = folders.find(folder => folder.textContent.includes('Reader A'));
        const folderB = folders.find(folder => folder.textContent.includes('Reader B'));
        expect(folderA).toBeTruthy();
        expect(folderB).toBeTruthy();

        const chapterA = folderA.querySelector('.chapter-item');
        const chapterB = folderB.querySelector('.chapter-item');

        expect(chapterA.querySelectorAll('.chapter-thumb-card')).toHaveLength(2);
        expect(chapterB.querySelectorAll('.chapter-thumb-card')).toHaveLength(1);
        expect(chapterA.querySelectorAll('.chapter-item-btns')).toHaveLength(1);
        expect(chapterB.querySelectorAll('.chapter-item-btns')).toHaveLength(1);

        await flushAsyncTasks(12);

        expect(chapterA.querySelector('.chapter-thumb-card[data-page-index="0"] img').src).toContain(Buffer.from('asset-a0').toString('base64'));
        expect(chapterA.querySelector('.chapter-thumb-card[data-page-index="1"] img').src).toContain(Buffer.from('asset-a1').toString('base64'));
        expect(chapterB.querySelector('.chapter-thumb-card[data-page-index="0"] img').src).toContain(Buffer.from('asset-b0').toString('base64'));
    });

    test('com IntersectionObserver o blob só é solicitado quando a miniatura entra na área visível', async () => {
        class FakeIntersectionObserver {
            static instances = [];
            constructor(callback) {
                this.callback = callback;
                this.target = null;
                FakeIntersectionObserver.instances.push(this);
            }
            observe(target) { this.target = target; }
            disconnect() {}
            trigger() {
                this.callback([{ target: this.target, isIntersecting: true }], this);
            }
        }
        global.IntersectionObserver = FakeIntersectionObserver;
        window.IntersectionObserver = FakeIntersectionObserver;

        await loadPopupWithTwoSites();

        const assetCallsBefore = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');
        expect(assetCallsBefore).toHaveLength(0);
        expect(FakeIntersectionObserver.instances.length).toBe(3);

        FakeIntersectionObserver.instances[0].trigger();
        await flushAsyncTasks(8);

        const assetCallsAfter = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');
        expect(assetCallsAfter).toHaveLength(1);
    });

    test('falha ao buscar asset mantém a caixa e marca somente a miniatura afetada', async () => {
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        sendSpy.mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                if (callback) setTimeout(() => callback({ ok: true, stats: { chap_a: { pageCount: 1, indices: [0] } } }), 0);
                return;
            }
            if (message.action === 'SM_PAGE_INDEX') {
                if (callback) setTimeout(() => callback({ ok: true, pages: [{ pageIndex: 0, assetId: 'broken' }] }), 0);
                return;
            }
            if (message.action === 'SM_GET_ASSET' || message.action === 'SM_GET_PAGE') {
                if (callback) setTimeout(() => callback({ ok: false }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test'],
            chapterList: [{
                id: 'chap_a',
                title: 'Capítulo A',
                url: 'https://reader-a.test/a',
                timestamp: 1,
            }],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(18);

        const card = document.querySelector('.chapter-thumb-card');
        expect(card).not.toBeNull();
        expect(card.classList.contains('failed')).toBe(true);
        expect(card.textContent).toContain('Falha');
        expect(document.querySelector('.chapter-item')).not.toBeNull();
    });

    test('capítulo sem índice tenta migração antes do fallback legado', async () => {
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        let indexAttempt = 0;
        sendSpy.mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                if (callback) setTimeout(() => callback({ ok: true, stats: { chap_a: { pageCount: 1, indices: [0] } } }), 0);
                return;
            }
            if (message.action === 'SM_PAGE_INDEX') {
                indexAttempt++;
                const pages = indexAttempt === 1 ? [] : [{ pageIndex: 0, assetId: 'migrated-asset' }];
                if (callback) setTimeout(() => callback({ ok: true, pages }), 0);
                return;
            }
            if (message.action === 'SM_MIGRATE_CHAPTER') {
                if (callback) setTimeout(() => callback({ ok: true }), 0);
                return;
            }
            if (message.action === 'SM_GET_ASSET') {
                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl('migrated') }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test'],
            chapterList: [{
                id: 'chap_a',
                title: 'Capítulo A',
                url: 'https://reader-a.test/a',
                timestamp: 1,
            }],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(18);

        expect(sendSpy.mock.calls.some(([message]) => message.action === 'SM_MIGRATE_CHAPTER' && message.chapterId === 'chap_a')).toBe(true);
        expect(indexAttempt).toBeGreaterThanOrEqual(2);
        expect(document.querySelectorAll('.chapter-thumb-card')).toHaveLength(1);
        expect(document.querySelector('.chapter-thumb-card img').src).toContain(Buffer.from('migrated').toString('base64'));
    });

    test('fallback legado preserva miniatura quando a migração não produz índice novo', async () => {
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        sendSpy.mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                if (callback) setTimeout(() => callback({ ok: true, stats: {} }), 0);
                return;
            }
            if (message.action === 'SM_PAGE_INDEX') {
                if (callback) setTimeout(() => callback({ ok: true, pages: [] }), 0);
                return;
            }
            if (message.action === 'SM_MIGRATE_CHAPTER') {
                if (callback) setTimeout(() => callback({ ok: false }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');
        registerPopupTabHandler(tab.id);
        await storageMock.set({
            enabledDomains: ['reader-a.test'],
            chapterList: [{
                id: 'chap_a',
                title: 'Capítulo A',
                url: 'https://reader-a.test/a',
                timestamp: 1,
            }],
            chap_a_images: {
                4: dataUrl('legacy-four'),
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(18);

        const card = document.querySelector('.chapter-thumb-card[data-page-index="4"]');
        expect(card).not.toBeNull();
        expect(card.querySelector('img').src).toContain(Buffer.from('legacy-four').toString('base64'));
    });
});
```

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** `const {`

**Contexto:** imports do harness e mocks.

**Função:** Participa do imports do harness e mocks, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 2

**Fonte:** `    loadExtensionPage,`

**Contexto:** imports do harness e mocks.

**Função:** Carrega o HTML e `popup.js` reais no jsdom por meio do harness compartilhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 3

**Fonte:** `    flushAsyncTasks,`

**Contexto:** imports do harness e mocks.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 4

**Fonte:** `} = require('../helpers/load-extension-page.js');`

**Contexto:** imports do harness e mocks.

**Função:** Importa dependência usada pelo imports do harness e mocks.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 5

**Fonte:** `const {`

**Contexto:** imports do harness e mocks.

**Função:** Participa do imports do harness e mocks, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 6

**Fonte:** `    getStorageMock,`

**Contexto:** imports do harness e mocks.

**Função:** Participa do imports do harness e mocks, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 7

**Fonte:** `    getTabsMock,`

**Contexto:** imports do harness e mocks.

**Função:** Participa do imports do harness e mocks, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 8

**Fonte:** `} = require('../mocks/chrome-api.mock.js');`

**Contexto:** imports do harness e mocks.

**Função:** Importa dependência usada pelo imports do harness e mocks.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 9

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** helper `dataUrl`.

**Função:** Separa blocos do helper `dataUrl` sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 10

**Fonte:** `function dataUrl(label) {`

**Contexto:** helper `dataUrl`.

**Função:** Produz ou usa um Data URL determinístico para permitir comparação de miniaturas sem arquivo binário externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 11

**Fonte:** `    return 'data:image/png;base64,' + Buffer.from(label).toString('base64');`

**Contexto:** helper `dataUrl`.

**Função:** Retorna/encerra o ramo corrente do helper `dataUrl` com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 12

**Fonte:** `}`

**Contexto:** helper `dataUrl`.

**Função:** Fecha uma estrutura sintática do helper `dataUrl`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 13

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Separa blocos do escopo da suíte e estado compartilhado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 14

**Fonte:** `describe('popup Traduzidas — miniaturas por capítulo/site com lazy loading', () => {`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Agrupa os cinco cenários de miniaturas traduzidas do popup em uma suíte de integração.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 15

**Fonte:** `    let storageMock;`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Participa do escopo da suíte e estado compartilhado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 16

**Fonte:** `    let tabsMock;`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Opera a aba simulada usada pelo escopo da suíte e estado compartilhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 17

**Fonte:** `    let sendSpy;`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Participa do escopo da suíte e estado compartilhado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 18

**Fonte:** `    let pageIndexCalls;`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Define ou acompanha o índice lógico de página usado para ordenar/identificar miniaturas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 19

**Fonte:** `    let originalIntersectionObserver;`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o escopo da suíte e estado compartilhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 20

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** escopo da suíte e estado compartilhado.

**Função:** Separa blocos do escopo da suíte e estado compartilhado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 21

**Fonte:** `    async function createActiveTab(url, title = 'Manga Page') {`

**Contexto:** helper `createActiveTab`.

**Função:** Participa do helper `createActiveTab`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 22

**Fonte:** `        const tab = await tabsMock.create({ url, active: true });`

**Contexto:** helper `createActiveTab`.

**Função:** Opera a aba simulada usada pelo helper `createActiveTab`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 23

**Fonte:** `        tabsMock._tabs.get(tab.id).title = title;`

**Contexto:** helper `createActiveTab`.

**Função:** Opera a aba simulada usada pelo helper `createActiveTab`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 24

**Fonte:** `        return tab;`

**Contexto:** helper `createActiveTab`.

**Função:** Retorna/encerra o ramo corrente do helper `createActiveTab` com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 25

**Fonte:** `    }`

**Contexto:** helper `createActiveTab`.

**Função:** Fecha uma estrutura sintática do helper `createActiveTab`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 26

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Separa blocos do handler de mensagens da aba do popup sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 27

**Fonte:** `    function registerPopupTabHandler(tabId) {`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Participa do handler de mensagens da aba do popup, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 28

**Fonte:** `        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Opera a aba simulada usada pelo handler de mensagens da aba do popup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 29

**Fonte:** `            if (message.action === 'GET_PAGE_IMAGES') sendResponse({ images: [] });`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Participa do handler de mensagens da aba do popup, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 30

**Fonte:** `            else if (message.action === 'SET_SELECTED_IMAGES') sendResponse({ success: true });`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Participa do handler de mensagens da aba do popup, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 31

**Fonte:** `            else sendResponse({ success: true });`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Participa do handler de mensagens da aba do popup, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 32

**Fonte:** `        });`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Fecha uma estrutura sintática do handler de mensagens da aba do popup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 33

**Fonte:** `    }`

**Contexto:** handler de mensagens da aba do popup.

**Função:** Fecha uma estrutura sintática do handler de mensagens da aba do popup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 34

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Separa blocos do setup `beforeEach` e mock do bridge Storage Manager sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 35

**Fonte:** `    beforeEach(async () => {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 36

**Fonte:** `        jest.resetModules();`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Limpa cache de módulos para evitar estado JavaScript compartilhado entre casos.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 37

**Fonte:** `        storageMock = getStorageMock();`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 38

**Fonte:** `        tabsMock = getTabsMock();`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Opera a aba simulada usada pelo setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 39

**Fonte:** `        await storageMock.clear();`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 40

**Fonte:** `        document.documentElement.innerHTML = '<html><head></head><body></body></html>';`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Normaliza o DOM entre casos para impedir contaminação cruzada.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 41

**Fonte:** `        pageIndexCalls = new Map();`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define ou acompanha o índice lógico de página usado para ordenar/identificar miniaturas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 42

**Fonte:** `        originalIntersectionObserver = global.IntersectionObserver;`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 43

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Separa blocos do setup `beforeEach` e mock do bridge Storage Manager sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 44

**Fonte:** `        sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Substitui uma fronteira externa pelo mock controlado necessário ao setup `beforeEach` e mock do bridge Storage Manager, preservando o `popup.js` real como objeto sob teste.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 45

**Fonte:** `            if (message.action === 'SM_CHAPTERS_STATS') {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Modela/observa o contrato `SM_CHAPTERS_STATS`, usado pelo popup para obter contagens e índices por capítulo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 46

**Fonte:** `                const stats = {};`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 47

**Fonte:** `                (message.chapterIds || []).forEach(id => {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 48

**Fonte:** `                    stats[id] = {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 49

**Fonte:** `                        pageCount: id === 'chap_a' ? 2 : id === 'chap_b' ? 1 : 0,`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define metadados de páginas retornados ao popup para o cenário.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 50

**Fonte:** `                        indices: id === 'chap_a' ? [0, 1] : id === 'chap_b' ? [0] : [],`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define metadados de páginas retornados ao popup para o cenário.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 51

**Fonte:** `                    };`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 52

**Fonte:** `                });`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 53

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, stats }), 0);`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 54

**Fonte:** `                return;`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Retorna/encerra o ramo corrente do setup `beforeEach` e mock do bridge Storage Manager com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 55

**Fonte:** `            }`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 56

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Separa blocos do setup `beforeEach` e mock do bridge Storage Manager sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 57

**Fonte:** `            if (message.action === 'SM_PAGE_INDEX') {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Modela/observa `SM_PAGE_INDEX`, fonte de metadados de páginas sem carregar blobs.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 58

**Fonte:** `                const count = (pageIndexCalls.get(message.chapterId) || 0) + 1;`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define ou acompanha o índice lógico de página usado para ordenar/identificar miniaturas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 59

**Fonte:** `                pageIndexCalls.set(message.chapterId, count);`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define ou acompanha o índice lógico de página usado para ordenar/identificar miniaturas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 60

**Fonte:** `                const pages = message.chapterId === 'chap_a'`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 61

**Fonte:** `                    ? [`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 62

**Fonte:** `                        { pageIndex: 0, assetId: 'asset-a0', width: 800, height: 1200 },`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define o identificador do asset que será resolvido sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 63

**Fonte:** `                        { pageIndex: 1, assetId: 'asset-a1', width: 820, height: 1180 },`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define o identificador do asset que será resolvido sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 64

**Fonte:** `                    ]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 65

**Fonte:** `                    : message.chapterId === 'chap_b'`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 66

**Fonte:** `                        ? [{ pageIndex: 0, assetId: 'asset-b0', width: 900, height: 1300 }]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Define o identificador do asset que será resolvido sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 67

**Fonte:** `                        : [];`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Participa do setup `beforeEach` e mock do bridge Storage Manager, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 68

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, pages }), 0);`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 69

**Fonte:** `                return;`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Retorna/encerra o ramo corrente do setup `beforeEach` e mock do bridge Storage Manager com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 70

**Fonte:** `            }`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 71

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Separa blocos do setup `beforeEach` e mock do bridge Storage Manager sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 72

**Fonte:** `            if (message.action === 'SM_GET_ASSET') {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Modela/observa `SM_GET_ASSET`, que carrega o Data URL do asset sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 73

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl(message.assetId) }), 0);`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 74

**Fonte:** `                return;`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Retorna/encerra o ramo corrente do setup `beforeEach` e mock do bridge Storage Manager com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 75

**Fonte:** `            }`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 76

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Separa blocos do setup `beforeEach` e mock do bridge Storage Manager sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 77

**Fonte:** `            if (message.action === 'SM_MIGRATE_CHAPTER') {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Modela/observa `SM_MIGRATE_CHAPTER`, tentativa idempotente de migrar capítulo legado antes do fallback.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 78

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 79

**Fonte:** `                return;`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Retorna/encerra o ramo corrente do setup `beforeEach` e mock do bridge Storage Manager com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 80

**Fonte:** `            }`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 81

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Separa blocos do setup `beforeEach` e mock do bridge Storage Manager sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 82

**Fonte:** `            if (message.action === 'SM_GET_PAGE') {`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Modela o fallback `SM_GET_PAGE` quando o asset não é obtido diretamente.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 83

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl(\`page-${message.pageIndex}\`) }), 0);`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 84

**Fonte:** `                return;`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Retorna/encerra o ramo corrente do setup `beforeEach` e mock do bridge Storage Manager com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 85

**Fonte:** `            }`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 86

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Separa blocos do setup `beforeEach` e mock do bridge Storage Manager sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 87

**Fonte:** `            if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 88

**Fonte:** `        });`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 89

**Fonte:** `    });`

**Contexto:** setup `beforeEach` e mock do bridge Storage Manager.

**Função:** Fecha uma estrutura sintática do setup `beforeEach` e mock do bridge Storage Manager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 90

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** cleanup `afterEach`.

**Função:** Separa blocos do cleanup `afterEach` sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 91

**Fonte:** `    afterEach(() => {`

**Contexto:** cleanup `afterEach`.

**Função:** Participa do cleanup `afterEach`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 92

**Fonte:** `        jest.restoreAllMocks();`

**Contexto:** cleanup `afterEach`.

**Função:** Restaura spies/mocks Jest após cada caso.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 93

**Fonte:** `        global.IntersectionObserver = originalIntersectionObserver;`

**Contexto:** cleanup `afterEach`.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o cleanup `afterEach`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 94

**Fonte:** `        window.IntersectionObserver = originalIntersectionObserver;`

**Contexto:** cleanup `afterEach`.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o cleanup `afterEach`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 95

**Fonte:** `        document.documentElement.innerHTML = '<html><head></head><body></body></html>';`

**Contexto:** cleanup `afterEach`.

**Função:** Normaliza o DOM entre casos para impedir contaminação cruzada.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 96

**Fonte:** `    });`

**Contexto:** cleanup `afterEach`.

**Função:** Fecha uma estrutura sintática do cleanup `afterEach`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 97

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Separa blocos do fixture `loadPopupWithTwoSites` sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 98

**Fonte:** `    async function loadPopupWithTwoSites() {`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 99

**Fonte:** `        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 100

**Fonte:** `        registerPopupTabHandler(tab.id);`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 101

**Fonte:** `        await storageMock.set({`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Semeia storage mock com estado necessário ao cenário sem modificar persistência real.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 102

**Fonte:** `            enabledDomains: ['reader-a.test', 'reader-b.test'],`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Configura domínios habilitados que estruturam as pastas de site do popup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 103

**Fonte:** `            chapterList: [`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Configura capítulos persistidos que o popup deve agrupar/renderizar.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 104

**Fonte:** `                {`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 105

**Fonte:** `                    id: 'chap_a',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 106

**Fonte:** `                    title: 'Capítulo A',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 107

**Fonte:** `                    url: 'https://reader-a.test/chapter-a',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 108

**Fonte:** `                    timestamp: 200,`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 109

**Fonte:** `                },`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Fecha uma estrutura sintática do fixture `loadPopupWithTwoSites`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 110

**Fonte:** `                {`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 111

**Fonte:** `                    id: 'chap_b',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 112

**Fonte:** `                    title: 'Capítulo B',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 113

**Fonte:** `                    url: 'https://reader-b.test/chapter-b',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 114

**Fonte:** `                    timestamp: 100,`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 115

**Fonte:** `                },`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Fecha uma estrutura sintática do fixture `loadPopupWithTwoSites`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 116

**Fonte:** `            ],`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Fecha uma estrutura sintática do fixture `loadPopupWithTwoSites`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 117

**Fonte:** `            'siteMeta_reader-a.test': { title: 'Reader A' },`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Configura metadados de apresentação do site usados nos títulos das pastas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 118

**Fonte:** `            'siteMeta_reader-b.test': { title: 'Reader B' },`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Configura metadados de apresentação do site usados nos títulos das pastas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 119

**Fonte:** `        });`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Fecha uma estrutura sintática do fixture `loadPopupWithTwoSites`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 120

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Separa blocos do fixture `loadPopupWithTwoSites` sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 121

**Fonte:** `        await loadExtensionPage({`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Carrega o HTML e `popup.js` reais no jsdom por meio do harness compartilhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 122

**Fonte:** `            htmlPath: 'extension/popup/popup.html',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 123

**Fonte:** `            scriptPath: 'extension/popup/popup.js',`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 124

**Fonte:** `            fireDOMContentLoaded: true,`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Participa do fixture `loadPopupWithTwoSites`, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 125

**Fonte:** `        });`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Fecha uma estrutura sintática do fixture `loadPopupWithTwoSites`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 126

**Fonte:** `        await flushAsyncTasks(8);`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 127

**Fonte:** `        document.querySelector('.tab-btn[data-target="translated-tab"]').click();`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Consulta o DOM renderizado pelo popup real no fixture `loadPopupWithTwoSites`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 128

**Fonte:** `        await flushAsyncTasks(16);`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 129

**Fonte:** `    }`

**Contexto:** fixture `loadPopupWithTwoSites`.

**Função:** Fecha uma estrutura sintática do fixture `loadPopupWithTwoSites`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 130

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Separa blocos do teste de hierarquia e carregamento sem IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 131

**Fonte:** `    test('renderiza miniaturas dentro do capítulo e site corretos sem alterar a hierarquia atual', async () => {`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Declara um caso Jest do teste de hierarquia e carregamento sem IntersectionObserver; o corpo executa o popup real com fronteiras de navegador/storage controladas.

**Evidência:** ✅ PROVADO DIRETAMENTE — o caso contém assertions específicas e executa a implementação real do popup com mocks apenas nas fronteiras externas.

### Linha/posição 132

**Fonte:** `        // Este caso valida o fallback sem IntersectionObserver; o teste seguinte`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Comentário que explicita a intenção do teste de hierarquia e carregamento sem IntersectionObserver e delimita o cenário validado.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 133

**Fonte:** `        // cobre explicitamente o caminho lazy real.`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Comentário que explicita a intenção do teste de hierarquia e carregamento sem IntersectionObserver e delimita o cenário validado.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 134

**Fonte:** `        global.IntersectionObserver = undefined;`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 135

**Fonte:** `        window.IntersectionObserver = undefined;`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 136

**Fonte:** `        await loadPopupWithTwoSites();`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Participa do teste de hierarquia e carregamento sem IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 137

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Separa blocos do teste de hierarquia e carregamento sem IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 138

**Fonte:** `        const folders = [...document.querySelectorAll('#chapter-list .site-folder')];`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Consulta o DOM renderizado pelo popup real no teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 139

**Fonte:** `        expect(folders).toHaveLength(2);`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de cardinalidade no teste de hierarquia e carregamento sem IntersectionObserver; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 140

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Separa blocos do teste de hierarquia e carregamento sem IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 141

**Fonte:** `        const folderA = folders.find(folder => folder.textContent.includes('Reader A'));`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Participa do teste de hierarquia e carregamento sem IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 142

**Fonte:** `        const folderB = folders.find(folder => folder.textContent.includes('Reader B'));`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Participa do teste de hierarquia e carregamento sem IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 143

**Fonte:** `        expect(folderA).toBeTruthy();`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de existência lógica no teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 144

**Fonte:** `        expect(folderB).toBeTruthy();`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de existência lógica no teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 145

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Separa blocos do teste de hierarquia e carregamento sem IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 146

**Fonte:** `        const chapterA = folderA.querySelector('.chapter-item');`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Consulta o DOM renderizado pelo popup real no teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 147

**Fonte:** `        const chapterB = folderB.querySelector('.chapter-item');`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Consulta o DOM renderizado pelo popup real no teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 148

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Separa blocos do teste de hierarquia e carregamento sem IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 149

**Fonte:** `        expect(chapterA.querySelectorAll('.chapter-thumb-card')).toHaveLength(2);`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de cardinalidade no teste de hierarquia e carregamento sem IntersectionObserver; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 150

**Fonte:** `        expect(chapterB.querySelectorAll('.chapter-thumb-card')).toHaveLength(1);`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de cardinalidade no teste de hierarquia e carregamento sem IntersectionObserver; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 151

**Fonte:** `        expect(chapterA.querySelectorAll('.chapter-item-btns')).toHaveLength(1);`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de cardinalidade no teste de hierarquia e carregamento sem IntersectionObserver; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 152

**Fonte:** `        expect(chapterB.querySelectorAll('.chapter-item-btns')).toHaveLength(1);`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de cardinalidade no teste de hierarquia e carregamento sem IntersectionObserver; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 153

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Separa blocos do teste de hierarquia e carregamento sem IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 154

**Fonte:** `        await flushAsyncTasks(12);`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 155

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Separa blocos do teste de hierarquia e carregamento sem IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 156

**Fonte:** `        expect(chapterA.querySelector('.chapter-thumb-card[data-page-index="0"] img').src).toContain(Buffer.from('asset-a0').toString('base64'));`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de conteúdo/valor no teste de hierarquia e carregamento sem IntersectionObserver; vincula o resultado observado ao dado esperado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 157

**Fonte:** `        expect(chapterA.querySelector('.chapter-thumb-card[data-page-index="1"] img').src).toContain(Buffer.from('asset-a1').toString('base64'));`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de conteúdo/valor no teste de hierarquia e carregamento sem IntersectionObserver; vincula o resultado observado ao dado esperado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 158

**Fonte:** `        expect(chapterB.querySelector('.chapter-thumb-card[data-page-index="0"] img').src).toContain(Buffer.from('asset-b0').toString('base64'));`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Assertion direta de conteúdo/valor no teste de hierarquia e carregamento sem IntersectionObserver; vincula o resultado observado ao dado esperado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 159

**Fonte:** `    });`

**Contexto:** teste de hierarquia e carregamento sem IntersectionObserver.

**Função:** Fecha uma estrutura sintática do teste de hierarquia e carregamento sem IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 160

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Separa blocos do teste de lazy loading com IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 161

**Fonte:** `    test('com IntersectionObserver o blob só é solicitado quando a miniatura entra na área visível', async () => {`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Declara um caso Jest do teste de lazy loading com IntersectionObserver; o corpo executa o popup real com fronteiras de navegador/storage controladas.

**Evidência:** ✅ PROVADO DIRETAMENTE — o caso contém assertions específicas e executa a implementação real do popup com mocks apenas nas fronteiras externas.

### Linha/posição 162

**Fonte:** `        class FakeIntersectionObserver {`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 163

**Fonte:** `            static instances = [];`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 164

**Fonte:** `            constructor(callback) {`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 165

**Fonte:** `                this.callback = callback;`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 166

**Fonte:** `                this.target = null;`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 167

**Fonte:** `                FakeIntersectionObserver.instances.push(this);`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 168

**Fonte:** `            }`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Fecha uma estrutura sintática do teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 169

**Fonte:** `            observe(target) { this.target = target; }`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 170

**Fonte:** `            disconnect() {}`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 171

**Fonte:** `            trigger() {`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 172

**Fonte:** `                this.callback([{ target: this.target, isIntersecting: true }], this);`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 173

**Fonte:** `            }`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Fecha uma estrutura sintática do teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 174

**Fonte:** `        }`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Fecha uma estrutura sintática do teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 175

**Fonte:** `        global.IntersectionObserver = FakeIntersectionObserver;`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 176

**Fonte:** `        window.IntersectionObserver = FakeIntersectionObserver;`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 177

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Separa blocos do teste de lazy loading com IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 178

**Fonte:** `        await loadPopupWithTwoSites();`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Participa do teste de lazy loading com IntersectionObserver, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 179

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Separa blocos do teste de lazy loading com IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 180

**Fonte:** `        const assetCallsBefore = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Modela/observa `SM_GET_ASSET`, que carrega o Data URL do asset sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 181

**Fonte:** `        expect(assetCallsBefore).toHaveLength(0);`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Assertion direta de cardinalidade no teste de lazy loading com IntersectionObserver; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 182

**Fonte:** `        expect(FakeIntersectionObserver.instances.length).toBe(3);`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Assertion Jest que prova diretamente uma propriedade observada no teste de lazy loading com IntersectionObserver.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 183

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Separa blocos do teste de lazy loading com IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 184

**Fonte:** `        FakeIntersectionObserver.instances[0].trigger();`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 185

**Fonte:** `        await flushAsyncTasks(8);`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 186

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Separa blocos do teste de lazy loading com IntersectionObserver sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 187

**Fonte:** `        const assetCallsAfter = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Modela/observa `SM_GET_ASSET`, que carrega o Data URL do asset sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 188

**Fonte:** `        expect(assetCallsAfter).toHaveLength(1);`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Assertion direta de cardinalidade no teste de lazy loading com IntersectionObserver; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 189

**Fonte:** `    });`

**Contexto:** teste de lazy loading com IntersectionObserver.

**Função:** Fecha uma estrutura sintática do teste de lazy loading com IntersectionObserver.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 190

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Separa blocos do teste de falha no carregamento de asset sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 191

**Fonte:** `    test('falha ao buscar asset mantém a caixa e marca somente a miniatura afetada', async () => {`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Declara um caso Jest do teste de falha no carregamento de asset; o corpo executa o popup real com fronteiras de navegador/storage controladas.

**Evidência:** ✅ PROVADO DIRETAMENTE — o caso contém assertions específicas e executa a implementação real do popup com mocks apenas nas fronteiras externas.

### Linha/posição 192

**Fonte:** `        global.IntersectionObserver = undefined;`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 193

**Fonte:** `        window.IntersectionObserver = undefined;`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 194

**Fonte:** `        sendSpy.mockImplementation((message, callback) => {`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Substitui uma fronteira externa pelo mock controlado necessário ao teste de falha no carregamento de asset, preservando o `popup.js` real como objeto sob teste.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 195

**Fonte:** `            if (message.action === 'SM_CHAPTERS_STATS') {`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Modela/observa o contrato `SM_CHAPTERS_STATS`, usado pelo popup para obter contagens e índices por capítulo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 196

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, stats: { chap_a: { pageCount: 1, indices: [0] } } }), 0);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 197

**Fonte:** `                return;`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Retorna/encerra o ramo corrente do teste de falha no carregamento de asset com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 198

**Fonte:** `            }`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Fecha uma estrutura sintática do teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 199

**Fonte:** `            if (message.action === 'SM_PAGE_INDEX') {`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Modela/observa `SM_PAGE_INDEX`, fonte de metadados de páginas sem carregar blobs.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 200

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, pages: [{ pageIndex: 0, assetId: 'broken' }] }), 0);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 201

**Fonte:** `                return;`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Retorna/encerra o ramo corrente do teste de falha no carregamento de asset com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 202

**Fonte:** `            }`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Fecha uma estrutura sintática do teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 203

**Fonte:** `            if (message.action === 'SM_GET_ASSET' || message.action === 'SM_GET_PAGE') {`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Modela/observa `SM_GET_ASSET`, que carrega o Data URL do asset sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 204

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: false }), 0);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 205

**Fonte:** `                return;`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Retorna/encerra o ramo corrente do teste de falha no carregamento de asset com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 206

**Fonte:** `            }`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Fecha uma estrutura sintática do teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 207

**Fonte:** `            if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 208

**Fonte:** `        });`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Fecha uma estrutura sintática do teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 209

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Separa blocos do teste de falha no carregamento de asset sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 210

**Fonte:** `        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 211

**Fonte:** `        registerPopupTabHandler(tab.id);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 212

**Fonte:** `        await storageMock.set({`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Semeia storage mock com estado necessário ao cenário sem modificar persistência real.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 213

**Fonte:** `            enabledDomains: ['reader-a.test'],`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Configura domínios habilitados que estruturam as pastas de site do popup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 214

**Fonte:** `            chapterList: [{`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Configura capítulos persistidos que o popup deve agrupar/renderizar.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 215

**Fonte:** `                id: 'chap_a',`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 216

**Fonte:** `                title: 'Capítulo A',`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 217

**Fonte:** `                url: 'https://reader-a.test/a',`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 218

**Fonte:** `                timestamp: 1,`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 219

**Fonte:** `            }],`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 220

**Fonte:** `        });`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Fecha uma estrutura sintática do teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 221

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Separa blocos do teste de falha no carregamento de asset sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 222

**Fonte:** `        await loadExtensionPage({`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Carrega o HTML e `popup.js` reais no jsdom por meio do harness compartilhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 223

**Fonte:** `            htmlPath: 'extension/popup/popup.html',`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 224

**Fonte:** `            scriptPath: 'extension/popup/popup.js',`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 225

**Fonte:** `            fireDOMContentLoaded: true,`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Participa do teste de falha no carregamento de asset, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 226

**Fonte:** `        });`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Fecha uma estrutura sintática do teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 227

**Fonte:** `        await flushAsyncTasks(8);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 228

**Fonte:** `        document.querySelector('.tab-btn[data-target="translated-tab"]').click();`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Consulta o DOM renderizado pelo popup real no teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 229

**Fonte:** `        await flushAsyncTasks(18);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 230

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Separa blocos do teste de falha no carregamento de asset sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 231

**Fonte:** `        const card = document.querySelector('.chapter-thumb-card');`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Consulta o DOM renderizado pelo popup real no teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 232

**Fonte:** `        expect(card).not.toBeNull();`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Assertion direta de existência no DOM no teste de falha no carregamento de asset.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 233

**Fonte:** `        expect(card.classList.contains('failed')).toBe(true);`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Assertion direta de condição booleana no teste de falha no carregamento de asset.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 234

**Fonte:** `        expect(card.textContent).toContain('Falha');`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Assertion direta de conteúdo/valor no teste de falha no carregamento de asset; vincula o resultado observado ao dado esperado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 235

**Fonte:** `        expect(document.querySelector('.chapter-item')).not.toBeNull();`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Assertion direta de existência no DOM no teste de falha no carregamento de asset.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 236

**Fonte:** `    });`

**Contexto:** teste de falha no carregamento de asset.

**Função:** Fecha uma estrutura sintática do teste de falha no carregamento de asset.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 237

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Separa blocos do teste de migração antes do fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 238

**Fonte:** `    test('capítulo sem índice tenta migração antes do fallback legado', async () => {`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Declara um caso Jest do teste de migração antes do fallback legado; o corpo executa o popup real com fronteiras de navegador/storage controladas.

**Evidência:** ✅ PROVADO DIRETAMENTE — o caso contém assertions específicas e executa a implementação real do popup com mocks apenas nas fronteiras externas.

### Linha/posição 239

**Fonte:** `        global.IntersectionObserver = undefined;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 240

**Fonte:** `        window.IntersectionObserver = undefined;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 241

**Fonte:** `        let indexAttempt = 0;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 242

**Fonte:** `        sendSpy.mockImplementation((message, callback) => {`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Substitui uma fronteira externa pelo mock controlado necessário ao teste de migração antes do fallback legado, preservando o `popup.js` real como objeto sob teste.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 243

**Fonte:** `            if (message.action === 'SM_CHAPTERS_STATS') {`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Modela/observa o contrato `SM_CHAPTERS_STATS`, usado pelo popup para obter contagens e índices por capítulo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 244

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, stats: { chap_a: { pageCount: 1, indices: [0] } } }), 0);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 245

**Fonte:** `                return;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Retorna/encerra o ramo corrente do teste de migração antes do fallback legado com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 246

**Fonte:** `            }`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 247

**Fonte:** `            if (message.action === 'SM_PAGE_INDEX') {`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Modela/observa `SM_PAGE_INDEX`, fonte de metadados de páginas sem carregar blobs.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 248

**Fonte:** `                indexAttempt++;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 249

**Fonte:** `                const pages = indexAttempt === 1 ? [] : [{ pageIndex: 0, assetId: 'migrated-asset' }];`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Define o identificador do asset que será resolvido sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 250

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, pages }), 0);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 251

**Fonte:** `                return;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Retorna/encerra o ramo corrente do teste de migração antes do fallback legado com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 252

**Fonte:** `            }`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 253

**Fonte:** `            if (message.action === 'SM_MIGRATE_CHAPTER') {`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Modela/observa `SM_MIGRATE_CHAPTER`, tentativa idempotente de migrar capítulo legado antes do fallback.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 254

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 255

**Fonte:** `                return;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Retorna/encerra o ramo corrente do teste de migração antes do fallback legado com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 256

**Fonte:** `            }`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 257

**Fonte:** `            if (message.action === 'SM_GET_ASSET') {`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Modela/observa `SM_GET_ASSET`, que carrega o Data URL do asset sob demanda.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 258

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, dataUrl: dataUrl('migrated') }), 0);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 259

**Fonte:** `                return;`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Retorna/encerra o ramo corrente do teste de migração antes do fallback legado com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 260

**Fonte:** `            }`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 261

**Fonte:** `            if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 262

**Fonte:** `        });`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 263

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Separa blocos do teste de migração antes do fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 264

**Fonte:** `        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 265

**Fonte:** `        registerPopupTabHandler(tab.id);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 266

**Fonte:** `        await storageMock.set({`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Semeia storage mock com estado necessário ao cenário sem modificar persistência real.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 267

**Fonte:** `            enabledDomains: ['reader-a.test'],`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Configura domínios habilitados que estruturam as pastas de site do popup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 268

**Fonte:** `            chapterList: [{`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Configura capítulos persistidos que o popup deve agrupar/renderizar.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 269

**Fonte:** `                id: 'chap_a',`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 270

**Fonte:** `                title: 'Capítulo A',`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 271

**Fonte:** `                url: 'https://reader-a.test/a',`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 272

**Fonte:** `                timestamp: 1,`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 273

**Fonte:** `            }],`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 274

**Fonte:** `        });`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 275

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Separa blocos do teste de migração antes do fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 276

**Fonte:** `        await loadExtensionPage({`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Carrega o HTML e `popup.js` reais no jsdom por meio do harness compartilhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 277

**Fonte:** `            htmlPath: 'extension/popup/popup.html',`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 278

**Fonte:** `            scriptPath: 'extension/popup/popup.js',`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 279

**Fonte:** `            fireDOMContentLoaded: true,`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Participa do teste de migração antes do fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 280

**Fonte:** `        });`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 281

**Fonte:** `        await flushAsyncTasks(8);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 282

**Fonte:** `        document.querySelector('.tab-btn[data-target="translated-tab"]').click();`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Consulta o DOM renderizado pelo popup real no teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 283

**Fonte:** `        await flushAsyncTasks(18);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 284

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Separa blocos do teste de migração antes do fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 285

**Fonte:** `        expect(sendSpy.mock.calls.some(([message]) => message.action === 'SM_MIGRATE_CHAPTER' && message.chapterId === 'chap_a')).toBe(true);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Assertion direta de condição booleana no teste de migração antes do fallback legado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 286

**Fonte:** `        expect(indexAttempt).toBeGreaterThanOrEqual(2);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Assertion direta sobre número mínimo de tentativas no teste de migração antes do fallback legado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 287

**Fonte:** `        expect(document.querySelectorAll('.chapter-thumb-card')).toHaveLength(1);`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Assertion direta de cardinalidade no teste de migração antes do fallback legado; falha a suíte se a quantidade observada divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 288

**Fonte:** `        expect(document.querySelector('.chapter-thumb-card img').src).toContain(Buffer.from('migrated').toString('base64'));`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Assertion direta de conteúdo/valor no teste de migração antes do fallback legado; vincula o resultado observado ao dado esperado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 289

**Fonte:** `    });`

**Contexto:** teste de migração antes do fallback legado.

**Função:** Fecha uma estrutura sintática do teste de migração antes do fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 290

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de fallback legado.

**Função:** Separa blocos do teste de fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 291

**Fonte:** `    test('fallback legado preserva miniatura quando a migração não produz índice novo', async () => {`

**Contexto:** teste de fallback legado.

**Função:** Declara um caso Jest do teste de fallback legado; o corpo executa o popup real com fronteiras de navegador/storage controladas.

**Evidência:** ✅ PROVADO DIRETAMENTE — o caso contém assertions específicas e executa a implementação real do popup com mocks apenas nas fronteiras externas.

### Linha/posição 292

**Fonte:** `        global.IntersectionObserver = undefined;`

**Contexto:** teste de fallback legado.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 293

**Fonte:** `        window.IntersectionObserver = undefined;`

**Contexto:** teste de fallback legado.

**Função:** Configura ou restaura a fronteira de IntersectionObserver para o teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 294

**Fonte:** `        sendSpy.mockImplementation((message, callback) => {`

**Contexto:** teste de fallback legado.

**Função:** Substitui uma fronteira externa pelo mock controlado necessário ao teste de fallback legado, preservando o `popup.js` real como objeto sob teste.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 295

**Fonte:** `            if (message.action === 'SM_CHAPTERS_STATS') {`

**Contexto:** teste de fallback legado.

**Função:** Modela/observa o contrato `SM_CHAPTERS_STATS`, usado pelo popup para obter contagens e índices por capítulo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 296

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, stats: {} }), 0);`

**Contexto:** teste de fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 297

**Fonte:** `                return;`

**Contexto:** teste de fallback legado.

**Função:** Retorna/encerra o ramo corrente do teste de fallback legado com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 298

**Fonte:** `            }`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 299

**Fonte:** `            if (message.action === 'SM_PAGE_INDEX') {`

**Contexto:** teste de fallback legado.

**Função:** Modela/observa `SM_PAGE_INDEX`, fonte de metadados de páginas sem carregar blobs.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 300

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true, pages: [] }), 0);`

**Contexto:** teste de fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 301

**Fonte:** `                return;`

**Contexto:** teste de fallback legado.

**Função:** Retorna/encerra o ramo corrente do teste de fallback legado com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 302

**Fonte:** `            }`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 303

**Fonte:** `            if (message.action === 'SM_MIGRATE_CHAPTER') {`

**Contexto:** teste de fallback legado.

**Função:** Modela/observa `SM_MIGRATE_CHAPTER`, tentativa idempotente de migrar capítulo legado antes do fallback.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 304

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: false }), 0);`

**Contexto:** teste de fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 305

**Fonte:** `                return;`

**Contexto:** teste de fallback legado.

**Função:** Retorna/encerra o ramo corrente do teste de fallback legado com o valor preparado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 306

**Fonte:** `            }`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 307

**Fonte:** `            if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Contexto:** teste de fallback legado.

**Função:** Entrega a resposta mockada de forma assíncrona em macrotask zero, aproximando o callback assíncrono da API Chrome.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 308

**Fonte:** `        });`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 309

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de fallback legado.

**Função:** Separa blocos do teste de fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 310

**Fonte:** `        const tab = await createActiveTab('https://reader-a.test/current', 'Reader A');`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 311

**Fonte:** `        registerPopupTabHandler(tab.id);`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 312

**Fonte:** `        await storageMock.set({`

**Contexto:** teste de fallback legado.

**Função:** Semeia storage mock com estado necessário ao cenário sem modificar persistência real.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 313

**Fonte:** `            enabledDomains: ['reader-a.test'],`

**Contexto:** teste de fallback legado.

**Função:** Configura domínios habilitados que estruturam as pastas de site do popup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 314

**Fonte:** `            chapterList: [{`

**Contexto:** teste de fallback legado.

**Função:** Configura capítulos persistidos que o popup deve agrupar/renderizar.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 315

**Fonte:** `                id: 'chap_a',`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 316

**Fonte:** `                title: 'Capítulo A',`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 317

**Fonte:** `                url: 'https://reader-a.test/a',`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 318

**Fonte:** `                timestamp: 1,`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 319

**Fonte:** `            }],`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 320

**Fonte:** `            chap_a_images: {`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 321

**Fonte:** `                4: dataUrl('legacy-four'),`

**Contexto:** teste de fallback legado.

**Função:** Produz ou usa um Data URL determinístico para permitir comparação de miniaturas sem arquivo binário externo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 322

**Fonte:** `            },`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 323

**Fonte:** `        });`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 324

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de fallback legado.

**Função:** Separa blocos do teste de fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 325

**Fonte:** `        await loadExtensionPage({`

**Contexto:** teste de fallback legado.

**Função:** Carrega o HTML e `popup.js` reais no jsdom por meio do harness compartilhado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 326

**Fonte:** `            htmlPath: 'extension/popup/popup.html',`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 327

**Fonte:** `            scriptPath: 'extension/popup/popup.js',`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 328

**Fonte:** `            fireDOMContentLoaded: true,`

**Contexto:** teste de fallback legado.

**Função:** Participa do teste de fallback legado, preparando dados, fluxo ou estado observado pela suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 329

**Fonte:** `        });`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 330

**Fonte:** `        await flushAsyncTasks(8);`

**Contexto:** teste de fallback legado.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 331

**Fonte:** `        document.querySelector('.tab-btn[data-target="translated-tab"]').click();`

**Contexto:** teste de fallback legado.

**Função:** Consulta o DOM renderizado pelo popup real no teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 332

**Fonte:** `        await flushAsyncTasks(18);`

**Contexto:** teste de fallback legado.

**Função:** Aguarda rodadas assíncronas do harness para permitir callbacks/timers do popup progredirem.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 333

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** teste de fallback legado.

**Função:** Separa blocos do teste de fallback legado sem alterar a execução.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

### Linha/posição 334

**Fonte:** `        const card = document.querySelector('.chapter-thumb-card[data-page-index="4"]');`

**Contexto:** teste de fallback legado.

**Função:** Consulta o DOM renderizado pelo popup real no teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 335

**Fonte:** `        expect(card).not.toBeNull();`

**Contexto:** teste de fallback legado.

**Função:** Assertion direta de existência no DOM no teste de fallback legado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 336

**Fonte:** `        expect(card.querySelector('img').src).toContain(Buffer.from('legacy-four').toString('base64'));`

**Contexto:** teste de fallback legado.

**Função:** Assertion direta de conteúdo/valor no teste de fallback legado; vincula o resultado observado ao dado esperado.

**Evidência:** ✅ PROVADO DIRETAMENTE — assertion Jest executada contra o resultado do `popup.js` real dentro do harness.

### Linha/posição 337

**Fonte:** `    });`

**Contexto:** teste de fallback legado.

**Função:** Fecha uma estrutura sintática do teste de fallback legado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 338

**Fonte:** `});`

**Contexto:** fechamento da suíte.

**Função:** Fecha uma estrutura sintática do fechamento da suíte.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/fixture exercitada pelo caso de integração; a propriedade específica não possui assertion isolada nesta linha.

### Linha/posição 339

**Fonte:** `␤ [linha vazia / newline final]`

**Contexto:** newline final.

**Função:** Preserva o newline final POSIX do arquivo auditado.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/comentário; não é uma propriedade independente.

## 10. Autoauditoria documental

- SHA reconfirmado antes da escrita: `7e4fea854647fe1d21b8066219f9eae8cfd20d1e`.
- Fonte integral embutida a partir desse SHA.
- Cobertura posicional: **339/339**, incluindo newline final.
- Implementação real do popup cruzada por `SM_PAGE_INDEX`, `SM_MIGRATE_CHAPTER`, `SM_GET_ASSET`, `chapter-thumb-card` e `IntersectionObserver`.
- Assertions do próprio teste foram classificadas como prova direta da **lógica do popup sob fronteiras mockadas**, não do background/IndexedDB real.
- Lacunas de força de teste foram registradas como solicitações ao auditor; nenhum arquivo externo foi alterado.

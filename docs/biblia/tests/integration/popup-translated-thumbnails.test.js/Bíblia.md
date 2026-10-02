# Bíblia técnica — tests/integration/popup-translated-thumbnails.test.js

> **Estado documental:** correção materializada; nova auditoria independente ainda necessária  
> **SHA auditado:** `677347d968d2916dbcba2d7a8ae67ad37f802a74`  
> **Índice do corpus:** 115  
> **Tipo:** integração Jest da aba Traduzidas do popup real  
> **Linhas textuais:** **383**  
> **Posições documentais:** **384**, incluindo o LF terminal como posição editorial  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte carrega `extension/popup/popup.html` + `extension/popup/popup.js` reais por `loadExtensionPage()`, usa os mocks Chrome compartilhados e valida a montagem/lazy-loading das miniaturas traduzidas por site/capítulo.

O background/IndexedDB não é executado diretamente: `chrome.runtime.sendMessage` é interceptado para fornecer respostas determinísticas às ações `SM_*`. Portanto, a prova pertence à lógica real do popup ao consumir esses contratos.

## 2. Cadeia de descoberta, ambiente e gate

A reauditoria anterior apontou que esta cadeia estava omitida. Na revisão atual ela é explícita:

- `jest.config.js` (`f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`) inclui `tests/integration/**/*.test.js` no projeto **integration**, com ambiente JSDOM;
- `tests/mocks/chrome-api.mock.js` (`c1d9a056b7777183bfd3f540c49811335f410425`) e `tests/mocks/dom-environment.js` (`9c3bc91608aa52a2d8324fc645c75fac5e4f7452`) fornecem APIs Chrome/DOM;
- `scripts/ci/run-jest-ci.js` (`6d2e36a647aadeadb2b875c1b3f92df24cd2f494`) inclui o projeto integration, lista os testes e trata ausência/falha no relatório como gate;
- `package.json` (`5b5c328f6139eeff920dc65a78014a6c5b6db3a6`) expõe `test:ci` e `test:integration`;
- `.github/workflows/ci.yml` (`9ce62e2b116e2204d1689edf9d302e6ee0cf8c3a`) executa o gate Unit + Integration em Node 20.x e 22.x;
- o consumidor real sob teste é `extension/popup/popup.js` (`300cfe9a9c81814443c9d52a17915d851408748b`);
- o harness é `tests/helpers/load-extension-page.js` (`c2325598f10b3ef9dd656a4e87db8569748e66b0`).

O run histórico `36577447500` provou a revisão antiga `7e4fea...`; ele é somente evidência histórica e **não** valida o novo source `677347d968d2916dbcba2d7a8ae67ad37f802a74`.

## 3. Fixtures e contratos

### Linhas 1–13 — imports e helper de data URL

Importa o harness real da extensão e os mocks de storage/tabs. `dataUrl(label)` produz payloads determinísticos para provar qual asset/card foi resolvido.

### Linhas 14–34 — suíte e neutralização das mensagens do content script

Mantém mocks/spy compartilhados. `registerPopupTabHandler()` responde `GET_PAGE_IMAGES` com lista vazia e confirma `SET_SELECTED_IMAGES`; esses contratos são neutralizados para permitir que o popup inicialize sem transformar a suíte em teste do content script.

### Linhas 35–90 — setup e responder SM_*

Reinicia módulos/storage/DOM e captura `IntersectionObserver`. O responder constrói:

- `SM_CHAPTERS_STATS`: `chap_a` possui 2 páginas, `chap_b` possui 1;
- `SM_PAGE_INDEX`: `chap_a` mapeia para `asset-a0/asset-a1`, `chap_b` para `asset-b0`;
- `SM_GET_ASSET`: devolve data URL derivada do `assetId`;
- `SM_MIGRATE_CHAPTER` e `SM_GET_PAGE`: respostas controladas para os caminhos de migração/fallback.

Esses valores são a fixture que sustenta as assertions de agrupamento e de associação card→asset.

### Linhas 91–130 — cleanup e fixture de dois sites

Restaura mocks/observer/DOM. `loadPopupWithTwoSites()` cria aba ativa de Reader A, habilita Reader A/B, grava dois capítulos com timestamps distintos, carrega popup real e abre a aba Traduzidas.

## 4. Cenários e provas

### Linhas 131–160 — hierarquia site/capítulo sem IntersectionObserver

Desabilita lazy loading e prova:

- duas pastas de site;
- capítulos nos respectivos sites;
- 2 cards em `chap_a` e 1 em `chap_b`;
- botões de capítulo preservados;
- cada card recebe o asset correto pelo `src`.

### Linhas 161–208 — lazy loading seletivo e idempotente

A revisão anterior só contava chamadas. Agora o fake observer registra alvo e `disconnect()`. O teste prova:

- zero `SM_GET_ASSET` antes da interseção;
- três observers para três cards;
- primeiro observer aponta para `data-page-index="0"`;
- primeiro trigger envia exatamente `SM_GET_ASSET { assetId: 'asset-a0' }`;
- observer desconecta;
- o card observado recebe a imagem de `asset-a0`;
- retrigger não produz segunda leitura do asset;
- o contador de `disconnect()` confirma que o callback voltou a ser invocado, enquanto `requested` impediu duplicação de I/O.

Isso resolve 115-002 em implementação.

### Linhas 209–282 — falha seletiva por card

A fixture usa dois cards no mesmo capítulo: `broken` e `healthy`. O responder falha apenas para `broken` e devolve data URL válida para `healthy`. O teste exige:

- os dois cards existem;
- somente o card 0 recebe classe `failed` e texto `Falha`;
- o card quebrado não contém `img`;
- o card 1 não recebe `failed`, não contém texto de falha e possui imagem `healthy`;
- o item de capítulo permanece montado.

Isso resolve 115-001 em implementação e prova de fato a palavra “somente”.

### Linhas 283–335 — migração antes do fallback

Na primeira `SM_PAGE_INDEX` retorna vazio; após `SM_MIGRATE_CHAPTER`, a segunda consulta retorna `migrated-asset`. A suíte prova migração acionada, segunda tentativa de índice e miniatura carregada pelo asset migrado.

### Linhas 336–383 — fallback legado

Quando stats/índice/migração não produzem armazenamento novo, `chap_a_images[4]` é preservado como miniatura legada e renderizado no card de índice 4.

### Posição 384 — newline terminal

A posição 384 é apenas o LF final após a linha textual 383. É editorial, não executável e não separa um bloco seguinte.

## 5. Audit requests

### 115-001 — ASSERTION_GAP — IMPLEMENTED_AWAITING_EXECUTABLE_VALIDATION

A fixture agora contém card quebrado + card irmão saudável no mesmo capítulo e valida isolamento completo do estado de falha.

### 115-002 — TEST_STRENGTH — IMPLEMENTED_AWAITING_EXECUTABLE_VALIDATION

O cenário lazy agora valida payload/assetId, card observado, `img.src`, `disconnect()` e idempotência após retrigger.

Nenhuma request é marcada RESOLVED apenas por inspeção estática; falta execução da revisão `677347d968d2916dbcba2d7a8ae67ad37f802a74`.

## 6. Findings da REAUDIT

### 115-REAUDIT-001 — CONSUMER_AND_GATE_OMISSION — CORRIGIDO

A seção 2 documenta agora descoberta Jest, ambiente JSDOM/mocks, runner `run-jest-ci`, scripts npm e execução CI Node 20/22. Evidência histórica e evidência da revisão atual são explicitamente separadas.

### 115-REAUDIT-002 — SEMANTIC_LINE_MAPPING — CORRIGIDO

A revisão antiga continha dezenas de descrições genéricas para linhas substantivas. Esta Bíblia usa mapa V2 por faixas semânticas reconhecido pelo validador e descreve operações/fixtures/branches específicos, inclusive os contratos das antigas linhas 29–30, 46–50 e 60–67.

## 7. Evidência atual

- parse JavaScript estático: **PASS**;
- source/Bíblia: **sincronizados para o SHA acima**;
- fonte integral: **embutida abaixo**;
- execução Jest da revisão atual: **PENDENTE**.

## 8. Limites honestos

- A suíte prova `popup.js` real sob runtime/storage simulados, não o background/IndexedDB real.
- `img.onload`/decodificação de imagem não são usados como prova; a associação é verificada por `src` e estados de card.
- O fake `IntersectionObserver` prova contrato do callback/cleanup/deduplicação, não comportamento físico de viewport do Chromium.
- A execução histórica da revisão anterior não substitui o gate do novo SHA.

## 9. Fonte integral exata

```javascript
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

    test('com IntersectionObserver carrega o card correto uma única vez e desconecta o observer', async () => {
        class FakeIntersectionObserver {
            static instances = [];
            constructor(callback) {
                this.callback = callback;
                this.target = null;
                this.disconnectCalls = 0;
                FakeIntersectionObserver.instances.push(this);
            }
            observe(target) { this.target = target; }
            disconnect() { this.disconnectCalls += 1; }
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

        const firstObserver = FakeIntersectionObserver.instances[0];
        expect(firstObserver.target.dataset.pageIndex).toBe('0');

        firstObserver.trigger();
        await flushAsyncTasks(8);

        const assetCallsAfter = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');
        expect(assetCallsAfter).toHaveLength(1);
        expect(assetCallsAfter[0][0]).toEqual(expect.objectContaining({
            action: 'SM_GET_ASSET',
            assetId: 'asset-a0',
        }));
        expect(firstObserver.disconnectCalls).toBe(1);
        expect(firstObserver.target.querySelector('img').src)
            .toContain(Buffer.from('asset-a0').toString('base64'));

        firstObserver.trigger();
        await flushAsyncTasks(8);

        const assetCallsAfterRetrigger = sendSpy.mock.calls.filter(([message]) => message.action === 'SM_GET_ASSET');
        expect(assetCallsAfterRetrigger).toHaveLength(1);
        expect(firstObserver.disconnectCalls).toBe(2);
    });

    test('falha seletiva marca só a miniatura quebrada e preserva a irmã saudável', async () => {
        global.IntersectionObserver = undefined;
        window.IntersectionObserver = undefined;
        sendSpy.mockImplementation((message, callback) => {
            if (message.action === 'SM_CHAPTERS_STATS') {
                if (callback) setTimeout(() => callback({
                    ok: true,
                    stats: { chap_a: { pageCount: 2, indices: [0, 1] } },
                }), 0);
                return;
            }
            if (message.action === 'SM_PAGE_INDEX') {
                if (callback) setTimeout(() => callback({
                    ok: true,
                    pages: [
                        { pageIndex: 0, assetId: 'broken' },
                        { pageIndex: 1, assetId: 'healthy' },
                    ],
                }), 0);
                return;
            }
            if (message.action === 'SM_GET_ASSET') {
                const response = message.assetId === 'broken'
                    ? { ok: false }
                    : { ok: true, dataUrl: dataUrl('healthy') };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }
            if (message.action === 'SM_GET_PAGE') {
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
        await flushAsyncTasks(24);

        const brokenCard = document.querySelector('.chapter-thumb-card[data-page-index="0"]');
        const healthyCard = document.querySelector('.chapter-thumb-card[data-page-index="1"]');

        expect(brokenCard).not.toBeNull();
        expect(healthyCard).not.toBeNull();
        expect(brokenCard.classList.contains('failed')).toBe(true);
        expect(brokenCard.textContent).toContain('Falha');
        expect(brokenCard.querySelector('img')).toBeNull();

        expect(healthyCard.classList.contains('failed')).toBe(false);
        expect(healthyCard.textContent).not.toContain('Falha');
        expect(healthyCard.querySelector('img')).not.toBeNull();
        expect(healthyCard.querySelector('img').src)
            .toContain(Buffer.from('healthy').toString('base64'));

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

## 10. Cobertura documental V2 por faixas

### Linhas 1–13 — imports e helper dataUrl
Imports do harness/mocks e helper determinístico de payload Base64.

### Linhas 14–34 — estado da suíte e contratos de tabs
Declara estado compartilhado, cria aba ativa e neutraliza mensagens do content script necessárias ao bootstrap do popup.

### Linhas 35–90 — setup e fixtures SM_*
Monta mocks/DOM e define stats, índices, assets, migração e fallback usados pela lógica real do popup.

### Linhas 91–130 — cleanup e loadPopupWithTwoSites
Restaura ambiente e constrói Reader A/B com dois capítulos, carregando o popup real e abrindo Traduzidas.

### Linhas 131–160 — renderização hierárquica eager
Prova agrupamento site/capítulo, contagem de cards e associação correta dos três assets.

### Linhas 161–208 — IntersectionObserver e leitura idempotente
Prova lazy real: payload correto, alvo correto, imagem correta, disconnect e ausência de leitura duplicada.

### Linhas 209–282 — isolamento de falha entre cards irmãos
Falha seletiva do asset `broken` e preservação integral do card `healthy`.

### Linhas 283–335 — migração de capítulo
Prova tentativa de migração e nova consulta de índice antes de obter o asset migrado.

### Linhas 336–383 — fallback legado
Prova preservação da miniatura em `chap_a_images` quando storage novo não fornece índice.

### Posição 384 — newline final
LF terminal editorial; não executável.

## 11. Reauditoria pós-correção

- consumer/gate chain omitida: corrigida;
- descrições genéricas de operações substantivas: removidas em favor de faixas semânticas específicas;
- 115-001: implementada com dois cards e falha seletiva;
- 115-002: implementada com payload/card/src/disconnect/idempotência;
- cobertura: 384/384 posições;
- fonte integral: exata;
- CI/Jest da revisão atual: ainda necessário antes de fechar as requests.

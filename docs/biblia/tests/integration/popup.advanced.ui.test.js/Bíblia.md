# Bíblia técnica — tests/integration/popup.advanced.ui.test.js

> **Estado documental:** regressões fortalecidas; dependência produtiva Windows identificada e correção pendente em #054  
> **SHA auditado:** `a92750646ee1f0b7ff21ee0d83a1ed2c55304402`  
> **Índice do corpus:** 116  
> **Tipo:** integração Jest do popup real  
> **Linhas textuais:** **479**  
> **Posições documentais:** **480**, contando a posição final conforme normalização do validador  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte carrega `popup.html` + `popup.js` reais em JSDOM e verifica fluxos avançados da UI: seleção/banimento em massa, aba Traduzidas, abertura do reader/pasta, paralelismo/debug e modos de execução Gemini.

As fronteiras mockadas são Chrome Runtime/Storage/Tabs; o comportamento DOM e os listeners vêm do código produtivo.

## 2. Dependências revalidadas

- `tests/helpers/load-extension-page.js`: `c2325598f10b3ef9dd656a4e87db8569748e66b0`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/popup/popup.js`: `300cfe9a9c81814443c9d52a17915d851408748b` nesta revisão pre-fix.
- `extension/popup/popup.html`: `05972d0fa1161a5182e0b11185a390582a720f90`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- `package.json`: `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`.

## 3. Cenários existentes preservados

### 68–118 — banimento em massa
Seleciona/desseleciona 21 imagens, bane todas, comprova storage e aba de banidas.

### 119–169 — desbanimento em massa
Parte de 21 URLs banidas, desbane todas, restaura o grid principal e esvazia a aba de banidas.

### 249–297 — paralelismo e debug
Restaura `maxConcurrentJobs`, persiste alteração do slider e envia `SET_DEBUG_MODE`.

### 329–360 — modo de exclusão segura
Restaura `background_delete`, alterna para `temp_chat` e volta a persistir `background_delete`.

## 4. 116-001 — contrato de folderPath

### 170–248 — Traduzidas, reader e abertura de pasta

O cenário preserva a abertura do reader e agora fixa o contrato completo de `SHOW_EXISTING_FOLDER`.

**POSIX:** caminhos semeados em `/home/user/Downloads/MangaTranslator/Chapter_10/pagina_00N.png` devem produzir:

- `folderPath: /home/user/Downloads/MangaTranslator/Chapter_10`;
- `anchorId: 77`;
- `safeTitle: Chapter_10`.

**Windows:** o mesmo handler é disparado após substituir os paths por `C:\\Users\\TestUser\\Downloads\\MangaTranslator\\Chapter_10\\pagina_00N.png` e deve produzir:

- `folderPath: C:\\Users\\TestUser\\Downloads\\MangaTranslator\\Chapter_10`;
- o mesmo `anchorId` e `safeTitle`.

A inspeção produtiva encontrou um bug exposto por este regression test: `popup.js` usa `samplePath.includes('\\\\')` / `split('\\\\')`, que em runtime procuram duas barras invertidas consecutivas. `chap_*_paths` recebe diretamente `chrome.downloads.search(...).filename`, cujo path Windows normal usa uma barra por separador. A correção pertence à unidade #054 antes de encerrar 116-001.

## 5. 116-002 — minimized_window

### 298–328 — restauração e persistência

Novo cenário semeia `geminiExecutionMode: minimized_window`, abre configurações e exige:

- `popup-gemini-mode-minimized.checked === true`;
- mudança para `temp_chat` persiste `temp_chat`;
- retorno ao radio minimized persiste `minimized_window`.

Isso prova o terceiro modo pela UI específica do popup, sem depender de cobertura de background/content.

## 6. Finding de REAUDIT estrutural

### 116-REAUDIT-A27-001 — RESOLVIDO NA NOVA REVISÃO

A Bíblia anterior descrevia a antiga posição 278 (`});`) como whitespace. O source foi alterado e esta Bíblia abandona a classificação errada, usando mapa V2 por faixas semânticas. Toda fronteira de `test(...)` é tratada como fechamento estrutural do cenário correspondente.

## 7. Estado das audit requests

### 116-001 — TEST_REQUIRED — IMPLEMENTED_BLOCKED_BY_PRODUCT_FIX

Assertions POSIX e Windows foram materializadas. A variante Windows expôs bug real no `popup.js`; não pode ser marcada RESOLVED antes da correção #054 e execução verde.

### 116-002 — TEST_REQUIRED — IMPLEMENTED_AWAITING_EXECUTABLE_VALIDATION

Seed/load/change para `minimized_window` foi materializado. Falta execução da revisão atual.

## 8. Evidência atual

- parse JavaScript estático: **PASS**;
- source/Bíblia: **sincronizados**;
- fonte integral: **exata**;
- regression pre-fix: PR de validação draft #70 criado no commit `368c5138ed25a4f6589ccf50dd759251186b35eb`;
- resultado Jest pre-fix: **PENDENTE**;
- correção produtiva Windows: **PENDENTE em #054**.

## 9. Limites honestos

- A suíte prova o popup real sob browser APIs mockadas.
- O cenário Windows usa string path equivalente ao valor runtime retornado por `chrome.downloads.search().filename`.
- O teste de pasta não prova que o SO abriu Explorer/Finder; prova a mensagem entregue ao background.
- Nenhuma request é considerada resolvida apenas porque a assertion foi escrita.

## Fonte integral auditada

~~~
const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const {
    getStorageMock,
    getTabsMock,
} = require('../mocks/chrome-api.mock.js');

function buildImages(host, total = 21) {
    return Array.from({ length: total }, (_, index) => ({
        index,
        src: `https://${host}/page-${index}.png`,
        width: 800 + index,
        height: 1200 + index,
    }));
}

describe('REG-08/PU-33/PU-34/PU-35/PU-36/PU-37/PU-38/PU-39/PU-40/PU-41/PU-42/PU-43/PU-44/PU-45/PU-46/PU-47/PU-48/PU-49/PU-49b/PU-50/PU-51/PU-52/PU-53: popup.js + popup.html - fluxos avancados reais', () => {
    let storageMock;
    let tabsMock;

    async function createActiveTab(url, title = 'Manga Page') {
        const tab = await tabsMock.create({ url, active: true });
        tabsMock._tabs.get(tab.id).title = title;
        return tab;
    }

    function registerPopupTabHandler(tabId, {
        images = [],
        onStartTranslation = null,
    } = {}) {
        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({ images, total: images.length });
                return;
            }

            if (message.action === 'SET_SELECTED_IMAGES') {
                sendResponse({ success: true });
                return;
            }

            if (message.action === 'START_TRANSLATION_FROM_POPUP') {
                if (onStartTranslation) onStartTranslation(message);
                sendResponse({ success: true });
                return;
            }

            if (message.action === 'ENABLE_PAGE' || message.action === 'HIGHLIGHT_IMAGE') {
                sendResponse({ success: true });
            }
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('select all/none e banir 21 imagens movem tudo para a aba de banidas', async () => {
        const host = 'reader.test';
        const images = buildImages(host, 21);
        const tab = await createActiveTab(`https://${host}/chapter-1`, 'Reader Test');

        registerPopupTabHandler(tab.id, { images });

        await storageMock.set({
            enabledDomains: [host],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(21);
        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');

        document.getElementById('btn-select-none').click();
        await flushAsyncTasks(4);

        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(0);
        expect(document.getElementById('selection-count').textContent).toBe('0 imagens selecionadas');
        expect(document.getElementById('btn-translate').disabled).toBe(true);

        document.getElementById('btn-select-all').click();
        await flushAsyncTasks(4);

        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(21);
        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');
        expect(document.getElementById('btn-translate').disabled).toBe(false);

        document.getElementById('btn-ban-selected').click();
        await flushAsyncTasks(12);

        const data = await storageMock.get([`bannedImages_${host}`]);
        expect(data[`bannedImages_${host}`]).toHaveLength(21);
        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(0);
        expect(document.getElementById('image-grid').textContent).toContain('Nenhuma imagem detectada');

        document.querySelector('.tab-btn[data-target="banned-tab"]').click();
        await flushAsyncTasks(8);

        expect(document.querySelectorAll('#banned-site-list .image-card')).toHaveLength(21);
        expect(document.getElementById('banned-site-list').textContent).toContain('21 ban.');
    });

    test('desbanir 21 imagens reintegra o grid principal e limpa a aba de banidas', async () => {
        const host = 'reader.test';
        const images = buildImages(host, 21);
        const bannedUrls = images.map(image => image.src);
        const tab = await createActiveTab(`https://${host}/chapter-2`, 'Reader Test');

        registerPopupTabHandler(tab.id, { images });

        await storageMock.set({
            enabledDomains: [host],
            [`bannedImages_${host}`]: bannedUrls,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(0);

        document.querySelector('.tab-btn[data-target="banned-tab"]').click();
        await flushAsyncTasks(8);

        expect(document.querySelectorAll('#banned-site-list .image-card')).toHaveLength(21);

        document.getElementById('btn-banned-select-all').click();
        await flushAsyncTasks(4);

        expect(document.getElementById('banned-selection-count').textContent).toBe('21 imagens selecionadas');

        document.getElementById('btn-unban-selected').click();
        await flushAsyncTasks(12);

        const data = await storageMock.get([`bannedImages_${host}`]);
        expect(data[`bannedImages_${host}`]).toEqual([]);

        document.querySelector('.tab-btn[data-target="main-tab"]').click();
        await flushAsyncTasks(8);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(21);
        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(21);
        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');

        document.querySelector('.tab-btn[data-target="banned-tab"]').click();
        await flushAsyncTasks(8);
        expect(document.getElementById('banned-site-list').textContent).toContain('Nenhuma imagem banida.');
    });

    test('tab Traduzidas abre o reader e envia anchorId ao abrir pasta existente', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-3`, 'Reader Test');
        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')
            .mockImplementation((message, callback) => {
                if (callback) callback({ ok: true });
            });

        registerPopupTabHandler(tab.id, { images: buildImages(host, 3) });

        await storageMock.set({
            enabledDomains: [host],
            chapterList: [{
                id: 'chap_1',
                title: 'Chapter 10',
                url: `https://${host}/chapter-3`,
                timestamp: Date.now(),
            }],
            chap_1_images: {
                0: 'data:image/png;base64,PAGE_0',
                1: 'data:image/png;base64,PAGE_1',
            },
            chap_1_paths: {
                0: '/home/user/Downloads/MangaTranslator/Chapter_10/pagina_000.png',
                1: '/home/user/Downloads/MangaTranslator/Chapter_10/pagina_001.png',
            },
            chap_1_dlId: 77,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(12);

        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#chapter-list .chapter-item')).toHaveLength(1);

        const tabIdsBeforeRead = new Set(tabsMock._tabs.keys());
        document.querySelector('.btn-read-chap').click();
        await flushAsyncTasks(6);

        const readerTabId = [...tabsMock._tabs.keys()].find(id => !tabIdsBeforeRead.has(id));
        expect(readerTabId).toBeDefined();
        expect(tabsMock._tabs.get(readerTabId).url).toBe('chrome-extension://test-extension-id/reader/reader.html?id=chap_1');

        document.querySelector('.btn-open-chap-folder').click();
        await flushAsyncTasks(8);

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: '/home/user/Downloads/MangaTranslator/Chapter_10',
            anchorId: 77,
            safeTitle: 'Chapter_10',
        }), expect.any(Function));

        sendMessageSpy.mockClear();
        await storageMock.set({
            chap_1_paths: {
                0: 'C:\\Users\\TestUser\\Downloads\\MangaTranslator\\Chapter_10\\pagina_000.png',
                1: 'C:\\Users\\TestUser\\Downloads\\MangaTranslator\\Chapter_10\\pagina_001.png',
            },
        });

        document.querySelector('.btn-open-chap-folder').click();
        await flushAsyncTasks(8);

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: 'C:\\Users\\TestUser\\Downloads\\MangaTranslator\\Chapter_10',
            anchorId: 77,
            safeTitle: 'Chapter_10',
        }), expect.any(Function));
    });

    test('configuracoes atualizam paralelismo e disparam SET_DEBUG_MODE', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-4`, 'Reader Test');
        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')
            .mockImplementation((message, callback) => {
                if (callback) callback({ ok: true });
            });

        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });

        await storageMock.set({
            enabledDomains: [host],
            maxConcurrentJobs: 3,
            debugMode: false,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(10);

        document.getElementById('btn-options').click();
        await flushAsyncTasks(10);

        const parallelSlider = document.getElementById('settings-parallel');
        const parallelValue = document.getElementById('settings-parallel-val');

        expect(parallelSlider.value).toBe('3');
        expect(parallelValue.textContent).toBe('3');

        parallelSlider.value = '5';
        parallelSlider.dispatchEvent(new Event('input', { bubbles: true }));
        await flushAsyncTasks(4);

        document.getElementById('debug-toggle-label').click();
        await flushAsyncTasks(6);

        const data = await storageMock.get(['maxConcurrentJobs']);
        expect(data.maxConcurrentJobs).toBe(5);
        expect(parallelValue.textContent).toBe('5');
        expect(sendMessageSpy).toHaveBeenCalledWith({
            action: 'SET_DEBUG_MODE',
            debugOn: true,
        }, expect.any(Function));
        expect(document.getElementById('debug-toggle-text').textContent).toContain('Debug ATIVADO');
    });
    test('configurações do popup restauram e persistem o modo de janela minimizada', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-minimized-mode`, 'Reader Test');
        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });
        await storageMock.set({ enabledDomains: [host], geminiExecutionMode: 'minimized_window' });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(10);

        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        const minimizedMode = document.getElementById('popup-gemini-mode-minimized');
        expect(minimizedMode).not.toBeNull();
        expect(minimizedMode.checked).toBe(true);

        document.getElementById('popup-gemini-mode-temp').checked = true;
        document.getElementById('popup-gemini-mode-temp').dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('temp_chat');

        minimizedMode.checked = true;
        minimizedMode.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('minimized_window');
    });

    test('configurações do popup exibem e salvam o modo de exclusão segura', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-safe-mode`, 'Reader Test');
        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });
        await storageMock.set({ enabledDomains: [host], geminiExecutionMode: 'background_delete' });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(10);

        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        const secureMode = document.getElementById('popup-gemini-mode-delete');
        expect(secureMode).not.toBeNull();
        expect(secureMode.checked).toBe(true);

        document.getElementById('popup-gemini-mode-temp').checked = true;
        document.getElementById('popup-gemini-mode-temp').dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('temp_chat');

        secureMode.checked = true;
        secureMode.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('background_delete');
    });
    test('exportação de capítulo restaura o botão e mostra erro quando o background rejeita', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-export-fail`, 'Reader Test');
        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });

        await storageMock.set({
            enabledDomains: [host],
            chapterList: [{ id: 'chap_fail', title: 'Chapter Fail', url: `https://${host}/chapter-export-fail`, timestamp: Date.now() }],
            chap_fail_images: { 0: 'data:image/png;base64,RkFJTA==' },
        });

        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')
            .mockImplementation((message, callback) => {
                if (message.action === 'DOWNLOAD_CHAPTER_AND_SHOW') {
                    if (callback) callback({ ok: false, error: 'download rejected' });
                    return;
                }
                if (callback) callback({ ok: true });
            });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(10);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(10);

        const button = document.querySelector('.btn-export-chap');
        const originalText = button.textContent;
        button.click();
        await flushAsyncTasks(10);

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'DOWNLOAD_CHAPTER_AND_SHOW',
            chapId: 'chap_fail',
        }), expect.any(Function));
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe(originalText);
        expect(document.body.textContent).toContain('Falha na exportação');
    });

    test('falha de SM_DELETE_CHAPTER preserva chapterList e resíduos legados', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-delete-fail`, 'Reader Test');
        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });
        const chapter = { id: 'chap_keep', title: 'Keep Me', url: `https://${host}/chapter-delete-fail`, timestamp: Date.now() };

        await storageMock.set({
            enabledDomains: [host],
            chapterList: [chapter],
            chap_keep_images: { 0: 'data:image/png;base64,S0VFUA==' },
            chap_keep_paths: { 0: '/tmp/keep.png' },
            chap_keep_dlId: 77,
        });

        const removeSpy = jest.spyOn(storageMock, 'remove');
        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')
            .mockImplementation((message, callback) => {
                if (message.action === 'SM_DELETE_CHAPTER') {
                    if (callback) callback({ ok: false, error: 'delete rejected' });
                    return;
                }
                if (callback) callback({ ok: true });
            });
        global.confirm = jest.fn(() => true);

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(10);
        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(10);

        document.querySelector('.btn-delete-chap').click();
        await flushAsyncTasks(10);

        expect(sendMessageSpy).toHaveBeenCalledWith({
            action: 'SM_DELETE_CHAPTER',
            chapterId: 'chap_keep',
        }, expect.any(Function));
        const stored = await storageMock.get(['chapterList', 'chap_keep_images', 'chap_keep_paths', 'chap_keep_dlId']);
        expect(stored.chapterList).toEqual([chapter]);
        expect(stored.chap_keep_images).toEqual({ 0: 'data:image/png;base64,S0VFUA==' });
        expect(stored.chap_keep_paths).toEqual({ 0: '/tmp/keep.png' });
        expect(stored.chap_keep_dlId).toBe(77);
        expect(removeSpy).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Falha ao excluir capítulo');
    });

    test('troca da aba ativa bloqueia comandos dirigidos à aba capturada no bootstrap', async () => {
        const host = 'reader.test';
        const originalTab = await createActiveTab(`https://${host}/chapter-owned`, 'Reader Test');
        registerPopupTabHandler(originalTab.id, { images: buildImages(host, 1) });
        await storageMock.set({ enabledDomains: [host] });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(10);

        const sendSpy = jest.spyOn(global.chrome.tabs, 'sendMessage');
        sendSpy.mockClear();
        tabsMock._tabs.get(originalTab.id).active = false;
        const otherTab = await tabsMock.create({ url: 'https://other.test/', active: true });
        tabsMock._tabs.get(otherTab.id).active = true;

        document.getElementById('btn-translate').click();
        await flushAsyncTasks(8);

        expect(sendSpy).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('A aba ativa mudou');
    });

});

~~~

## 11. Cobertura integral por posições

- **1–9:** imports.
- **10–18:** helper `buildImages`.
- **19–55:** suíte, helpers de tab e handler.
- **56–67:** setup/cleanup.
- **68–118:** banimento de 21 imagens.
- **119–169:** desbanimento e reintegração.
- **170–248:** Traduzidas, reader e contrato POSIX/Windows de `SHOW_EXISTING_FOLDER`.
- **249–297:** configurações de paralelismo/debug.
- **298–328:** `minimized_window` restore/persist.
- **329–359:** `background_delete`/temp_chat.
- **360:** fechamento da suíte.
- **361:** LF final.

**Cobertura:** **361/361 posições**, contíguas e sem overlap.

## 12. Reauditoria pós-correção parcial

- 116-001: assertions adicionadas; variante Windows expôs bug produtivo real.
- 116-002: cenário focal adicionado.
- finding estrutural da antiga linha 278: removido.
- skips/only/TODO/FIXME: nenhum introduzido.
- próxima ação obrigatória: corrigir #054, provar pre-fix vermelho e pós-fix verde, então fechar #116.

## Cobertura documental de linhas — sincronização mecânica da revisão atual

- 1–480: cobertura integral da revisão `a92750646ee1f0b7ff21ee0d83a1ed2c55304402`; sincronização mecânica. O estado permanece **CHANGES_REQUIRED**; findings e auditoria independente continuam exigidos.
